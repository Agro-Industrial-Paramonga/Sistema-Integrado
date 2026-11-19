-- ============================================================
-- Compuertas: plan («en rojo se abre / se cierra») y check del jefe
-- Proyecto bfhfnldqwsrcpsdqpyat
--
-- Regla del gerente:
--   · El que solo tiene compuertas ve una hoja: qué se abre y qué
--     se cierra. Nada de estado actual, ni contactos, ni fotos.
--   · El plan es independiente del estado: plan_rojo = abrir|cerrar,
--     y no cambia con el semáforo.
--   · El check lo pone SOLO quien edita compuertas (los jefes), y se
--     ve encima de la compuerta en el mapa.
--   · Un check vale para la declaración de semáforo en curso: al
--     declararse un nivel nuevo, los checks viejos dejan de contar
--     (por eso se guarda check_evento).
--
-- Idempotente.
-- ============================================================

-- 1. El plan de la compuerta ----------------------------------
alter table public.compuertas add column if not exists plan_rojo text;

update public.compuertas set plan_rojo = 'cerrar' where plan_rojo is null;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'compuertas_plan_rojo_check') then
        alter table public.compuertas
            add constraint compuertas_plan_rojo_check check (plan_rojo in ('abrir', 'cerrar'));
    end if;
end $$;

alter table public.compuertas alter column plan_rojo set default 'cerrar';
alter table public.compuertas alter column plan_rojo set not null;

-- 2. El check (uno por compuerta y por declaración) ------------
alter table public.compuertas add column if not exists check_evento bigint;
alter table public.compuertas add column if not exists check_por    text;
alter table public.compuertas add column if not exists check_en     timestamptz;

-- 3. Permiso por persona: editar compuertas y poner el check ---
do $$
begin
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public'
                      and table_name = 'usuarios'
                      and column_name = 'puede_editar_compuertas') then

        alter table public.usuarios
            add column puede_editar_compuertas boolean not null default false;

        -- Primera carga: jefes, supervisores y Seguridad Industrial entran
        -- con el check marcado; área (regadores) entra sin marcar.
        -- De ahí en adelante manda el panel «Personas», no el rol.
        update public.usuarios u
           set puede_editar_compuertas = (
                   upper(coalesce(u.seccion, '') || ' ' || coalesce(u.area, '')) like '%SEGURIDAD INDUSTRIAL%'
                   or upper(coalesce(u.area, '')) like '%CHUNGA%'
                   or upper(coalesce(u.area, '')) like '%MELGAR BELMONT%'
                   or lower(btrim(coalesce(u.rol, ''))) in
                      ('gerente_general', 'gerente_campo', 'gerente_fabrica',
                       'gerencial_legal', 'gdo', 'jefe_area', 'sup_area')
               );
    end if;
end $$;

-- 4. El perfil que recibe el navegador -------------------------
create or replace function public.mi_perfil(p_area text)
returns jsonb
language sql stable security definer set search_path = public as $$
    select jsonb_build_object(
               'rol', u.rol,
               'gerencia_key', u.gerencia_key,
               'seccion', u.seccion,
               'puede_medidas', u.puede_medidas,
               'puede_mapa', u.puede_mapa,
               'puede_compuertas', u.puede_compuertas,
               'puede_editar_compuertas', u.puede_editar_compuertas
           )
      from public.usuarios u
     where upper(btrim(u.area)) = upper(btrim(p_area))
     limit 1;
$$;

-- 5. Quién puede editar compuertas ----------------------------
create or replace function public.es_editor_compuertas(p_clave text)
returns boolean
language sql stable security definer set search_path = public as $$
    select coalesce((
        select u.puede_editar_compuertas
          from public.sesiones_panel s
          join public.usuarios u on public.norm_persona(u.area) = public.norm_persona(s.user_id)
         where s.clave = btrim(coalesce(p_clave, ''))
         limit 1
    ), false);
$$;

-- El panel «Personas» guarda este permiso aparte de los otros tres.
create or replace function public.marcar_editor_compuertas(p_clave_quien text,
                                                          p_user_id     text,
                                                          p_valor       boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_quien text;
begin
    if not public.es_seguridad_industrial(p_clave_quien) then
        return jsonb_build_object('ok', false, 'motivo', 'sin_permiso');
    end if;

    select s.user_id into v_quien
      from public.sesiones_panel s
     where s.clave = btrim(coalesce(p_clave_quien, ''))
     limit 1;

    update public.usuarios u
       set puede_editar_compuertas = coalesce(p_valor, false)
     where public.norm_persona(u.area) = public.norm_persona(p_user_id);

    if not found then
        return jsonb_build_object('ok', false, 'motivo', 'no_existe');
    end if;

    insert into public.app_log (origen, detalle)
    values ('usuario_edita',
            coalesce(v_quien, '?') || ' | ' || p_user_id
            || ' | edita compuertas: ' || case when coalesce(p_valor, false) then 'si' else 'no' end);

    return jsonb_build_object('ok', true, 'puede_editar_compuertas', coalesce(p_valor, false));
end $$;

-- 6. Poner / quitar el check ----------------------------------
create or replace function public.marcar_compuerta_check(p_clave     text,
                                                         p_compuerta bigint,
                                                         p_valor     boolean default true)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_quien  text;
    v_evento bigint;
    v_plan   text;
    v_estado text;
begin
    select s.user_id into v_quien
      from public.sesiones_panel s
     where s.clave = btrim(coalesce(p_clave, ''))
     limit 1;

    if v_quien is null then
        return jsonb_build_object('ok', false, 'motivo', 'sin_sesion');
    end if;

    if not exists (select 1 from public.usuarios u
                    where public.norm_persona(u.area) = public.norm_persona(v_quien)
                      and u.puede_editar_compuertas) then
        return jsonb_build_object('ok', false, 'motivo', 'sin_permiso');
    end if;

    select plan_rojo into v_plan from public.compuertas where id = p_compuerta;
    if v_plan is null then
        return jsonb_build_object('ok', false, 'motivo', 'no_existe');
    end if;

    select coalesce(max(id), 0) into v_evento from public.semaforo_eventos;

    v_estado := case v_plan when 'abrir' then 'abierta' else 'cerrada' end;

    if coalesce(p_valor, true) then
        update public.compuertas
           set check_evento     = v_evento,
               check_por        = v_quien,
               check_en         = now(),
               estado           = v_estado,
               actualizado_por  = v_quien,
               actualizado_en   = now()
         where id = p_compuerta;
    else
        update public.compuertas
           set check_evento = null,
               check_por    = null,
               check_en     = null
         where id = p_compuerta;
    end if;

    insert into public.app_log (origen, detalle)
    values ('compuerta_check',
            v_quien || ' | ' || p_compuerta || ' | '
            || case when coalesce(p_valor, true) then 'cumplido' else 'sin_check' end);

    return jsonb_build_object('ok', true, 'evento', v_evento, 'estado', v_estado);
end $$;

-- 7. Lista del panel «Personas» con el permiso nuevo ----------
drop function if exists public.alarmas_personas_lista(text);

create or replace function public.alarmas_personas_lista(p_clave_quien text)
returns table(
    nombre           text,
    seccion          text,
    rol              text,
    gerencia_key     text,
    activo           boolean,
    semaforo         boolean,
    compuertas       boolean,
    medida           boolean,
    alarma_off       boolean,
    puede_medidas    boolean,
    puede_mapa       boolean,
    puede_compuertas boolean,
    puede_editar_compuertas boolean
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
               coalesce(sa3.activo, false),
               public.esta_silenciado(u.area),
               u.puede_medidas,
               u.puede_mapa,
               u.puede_compuertas,
               u.puede_editar_compuertas
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

-- 8. Arreglo de datos viejos ----------------------------------
-- La compuerta 30 quedó con el nombre de la administración mal
-- codificado («IngenierÃ­a AgrÃ­cola»), así que no salía en ninguna
-- pestaña del panel.
update public.compuertas
   set administracion = 'Ingenieria Agricola'
 where administracion like 'Ingenier%Agr%cola'
   and administracion <> 'Ingenieria Agricola';

-- 9. Permisos de ejecución ------------------------------------
grant execute on function public.mi_perfil(text) to anon, authenticated;
grant execute on function public.es_editor_compuertas(text) to anon, authenticated;
grant execute on function public.marcar_editor_compuertas(text, text, boolean) to anon, authenticated;
grant execute on function public.marcar_compuerta_check(text, bigint, boolean) to anon, authenticated;
grant execute on function public.alarmas_personas_lista(text) to anon, authenticated;
