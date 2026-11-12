/* ============================================================
   ALARMAS POR PERSONA — catálogo, suscripciones y reparto
   ------------------------------------------------------------
   Objetivo: que lo que suena en el celular de cada persona lo
   decidan unas casillas (semáforo / compuertas / medida), y no
   el rol. El rol sigue mandando en los permisos del portal.

   Reglas (12-nov-2026):
     - semáforo   : apagado para rol 'area' (administradores de campo)
     - compuertas : encendido solo para rol 'area' y 'sup_area' de
                    la sección "Administradores de campo" (16 personas)
     - medida     : encendido para todo el que no sea rol 'area'

   Los valores de arriba son SOLO el punto de partida: el panel
   los cambia y la casilla manda sobre el rol.

   El switch verde/rojo del panel (alarmas_silenciadas) sigue
   siendo el maestro: en rojo no le llega nada, aunque la casilla
   esté marcada.

   Idempotente. Se puede volver a ejecutar sin duplicar nada.
   ============================================================ */

-- 1. Catálogo de alarmas -------------------------------------
create table if not exists public.alarmas_catalogo (
    clave      text primary key,
    nombre     text not null,
    detalle    text,
    orden      int  not null default 0,
    en_panel   boolean not null default true,   -- se puede marcar por persona
    solo_rojo  boolean not null default false   -- solo se dispara en rojo
);

insert into public.alarmas_catalogo (clave, nombre, detalle, orden, en_panel, solo_rojo) values
    ('semaforo',    'Cambio de semáforo',            'Aviso cuando el semáforo pasa a verde, amarillo o rojo', 1, true,  false),
    ('compuertas',  'Apertura y cierre de compuertas','Solo en rojo: proceder a abrir y cerrar compuertas según el plan', 2, true, true),
    ('medida',      'Alarma de una medida',          'Solicitud de atención sobre una medida del plan de contingencia', 3, true, false),
    ('evac_auto',   'Evacuación automática',         'En rojo, a todas las unidades en turno', 4, false, true),
    ('evac_manual', 'Evacuación manual',             'Aviso puntual a una unidad desde el mapa', 5, false, false),
    ('actos',       'Actos inseguros abiertos',      'Recordatorio diario desde Hallazgos', 6, false, false)
on conflict (clave) do update set
    nombre   = excluded.nombre,
    detalle  = excluded.detalle,
    orden    = excluded.orden,
    en_panel = excluded.en_panel,
    solo_rojo= excluded.solo_rojo;

alter table public.alarmas_catalogo enable row level security;

drop policy if exists alarmas_catalogo_lectura on public.alarmas_catalogo;
create policy alarmas_catalogo_lectura on public.alarmas_catalogo
    for select using (true);

-- 2. Suscripción por persona y alarma ------------------------
create table if not exists public.suscripciones_alarma (
    user_id         text not null,                       -- usuarios.area (nombre de la persona)
    alarma          text not null references public.alarmas_catalogo(clave) on delete cascade,
    activo          boolean not null default true,
    actualizado_en  timestamptz not null default now(),
    actualizado_por text,
    primary key (user_id, alarma)
);

-- Sin políticas: solo entra el service_role y las funciones
-- security definer. El navegador nunca lee esta tabla directo.
alter table public.suscripciones_alarma enable row level security;

create index if not exists suscripciones_alarma_alarma_idx
    on public.suscripciones_alarma (alarma) where activo;

-- 3. Valores por defecto según rol y sección -----------------
create or replace function public.alarmas_por_defecto(p_rol text, p_seccion text)
returns text[]
language plpgsql immutable as $$
declare
    v_rol text := lower(btrim(coalesce(p_rol, '')));
    v_sec text := lower(btrim(coalesce(p_seccion, '')));
    v_out text[] := '{}';
begin
    if v_rol <> 'area' then
        v_out := v_out || array['semaforo', 'medida']::text[];
    end if;

    if v_rol in ('area', 'sup_area') and v_sec = 'administradores de campo' then
        v_out := v_out || array['compuertas']::text[];
    end if;

    return v_out;
end $$;

-- 4. Punto de partida para las personas que ya existen -------
-- "on conflict do nothing": si se vuelve a correr, no pisa lo
-- que ya se haya cambiado desde el panel.
insert into public.suscripciones_alarma (user_id, alarma, activo, actualizado_por)
select u.area,
       c.clave,
       (c.clave = any (public.alarmas_por_defecto(u.rol, u.seccion))),
       'migracion'
  from public.usuarios u
 cross join public.alarmas_catalogo c
 where u.activo is true
   and c.en_panel is true
on conflict (user_id, alarma) do nothing;

-- 4.b Suscripciones viejas a nombre de la SECCIÓN, no de la persona.
-- Ejemplos reales: 'Seguridad Industrial', 'Ingeniería Agrícola'.
-- Si no se arreglan, esas personas dejarían de recibir cualquier
-- alarma en cuanto el reparto pase a ser por persona. Se reasignan
-- a la persona de su sesión abierta (mismo token). Idempotente.
update public.push_subscriptions ps
   set user_id = s.user_id
  from public.sesiones_panel s
 where s.token_push = ps.token
   and ps.tipo = 'jefe'
   and not exists (select 1 from public.usuarios u
                    where public.norm_persona(u.area) = public.norm_persona(ps.user_id));

-- 5. Reparto: quién recibe cada alarma -----------------------
-- Cambios frente a la versión anterior:
--   * nuevo parámetro p_alarma: filtra por la casilla de la persona
--   * se quitó la exclusión fija de rol 'area' (ahora lo decide la casilla)
--   * el switch verde/rojo (esta_silenciado) sigue mandando
drop function if exists public.destinatarios_push(text);

create or replace function public.destinatarios_push(p_tipo text default null,
                                                     p_alarma text default null)
returns table(user_id text, token text, notialarm_webhook text, tipo text, rol text)
language sql stable security definer set search_path = public as $$
    select distinct on (ps.token)
           ps.user_id, ps.token, ps.notialarm_webhook, ps.tipo, ps.rol
      from push_subscriptions ps
     where (p_tipo is null or ps.tipo = p_tipo)
       and ps.token is not null
       -- conductor silenciado: su celular no entra a ninguna lista
       and not (ps.tipo = 'conductor' and esta_silenciado(ps.user_id))
       and (
            ps.tipo <> 'jefe'
            or exists (select 1 from sesiones_panel s
                        where not esta_silenciado(s.user_id)
                          and (
                               -- celular Android: el token de la sesión
                               (s.token_push is not null and s.token_push = ps.token)
                               -- iPhone: la fila es de la persona, no del equipo
                            or (ps.token like 'ios-%'
                                and upper(btrim(s.user_id)) = upper(btrim(ps.user_id)))
                          ))
       )
       -- la casilla de esa persona para esa alarma.
       -- Solo aplica a las alarmas del panel (en_panel = true): las de
       -- conductor (evacuación) las gobierna el switch verde/rojo, no una casilla.
       and (
            p_alarma is null
            or not exists (select 1 from alarmas_catalogo c
                            where c.clave = p_alarma and c.en_panel)
            or exists (select 1 from suscripciones_alarma sa
                        where sa.alarma = p_alarma
                          and sa.activo is true
                          and norm_persona(sa.user_id) = norm_persona(ps.user_id))
       )
     order by ps.token;
$$;

-- Solo la función edge (service_role) la consulta desde afuera.
revoke all on function public.destinatarios_push(text, text) from public;
revoke all on function public.destinatarios_push(text, text) from anon;
revoke all on function public.destinatarios_push(text, text) from authenticated;
grant execute on function public.destinatarios_push(text, text) to service_role;

-- 6. Lectura y edición para el panel -------------------------
create or replace function public.alarmas_personas_lista(p_clave_quien text)
returns table(
    nombre       text,
    seccion      text,
    rol          text,
    gerencia_key text,
    activo       boolean,
    semaforo     boolean,
    compuertas   boolean,
    medida       boolean
)
language plpgsql security definer set search_path = public as $$
begin
    if not public.es_seguridad_industrial(p_clave_quien) then
        raise exception 'sin_permiso';
    end if;

    return query
        select u.area,
               u.seccion,
               u.rol,
               u.gerencia_key,
               coalesce(u.activo, false),
               coalesce(sa1.activo, false),
               coalesce(sa2.activo, false),
               coalesce(sa3.activo, false)
          from public.usuarios u
          left join public.suscripciones_alarma sa1
                 on sa1.alarma = 'semaforo'
                and public.norm_persona(sa1.user_id) = public.norm_persona(u.area)
          left join public.suscripciones_alarma sa2
                 on sa2.alarma = 'compuertas'
                and public.norm_persona(sa2.user_id) = public.norm_persona(u.area)
          left join public.suscripciones_alarma sa3
                 on sa3.alarma = 'medida'
                and public.norm_persona(sa3.user_id) = public.norm_persona(u.area)
         order by coalesce(u.activo, false) desc, public.norm_persona(u.area);
end $$;

create or replace function public.alternar_alarma_persona(p_clave_quien text,
                                                          p_user_id text,
                                                          p_alarma text,
                                                          p_activo boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_quien text;
begin
    if not public.es_seguridad_industrial(p_clave_quien) then
        return jsonb_build_object('ok', false, 'motivo', 'sin_permiso');
    end if;

    if not exists (select 1 from public.alarmas_catalogo c
                    where c.clave = p_alarma and c.en_panel) then
        return jsonb_build_object('ok', false, 'motivo', 'alarma_invalida');
    end if;

    select s.user_id into v_quien
      from public.sesiones_panel s
     where s.clave = btrim(coalesce(p_clave_quien, ''))
     limit 1;

    insert into public.suscripciones_alarma (user_id, alarma, activo, actualizado_en, actualizado_por)
    values (p_user_id, p_alarma, coalesce(p_activo, true), now(), coalesce(v_quien, 'panel'))
    on conflict (user_id, alarma) do update set
        activo          = excluded.activo,
        actualizado_en  = now(),
        actualizado_por = excluded.actualizado_por;

    insert into public.app_log (origen, detalle)
    values ('alarma_persona',
            coalesce(v_quien, '?') || ' | ' || p_user_id || ' | ' || p_alarma || ' -> ' ||
            case when coalesce(p_activo, true) then 'on' else 'off' end);

    return jsonb_build_object('ok', true, 'user_id', p_user_id, 'alarma', p_alarma,
                              'activo', coalesce(p_activo, true));
end $$;
