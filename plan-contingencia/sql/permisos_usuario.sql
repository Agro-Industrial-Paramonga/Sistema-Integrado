/* ============================================================
   PERMISOS POR PERSONA — visibilidad de módulos
   ------------------------------------------------------------
   Hasta ahora "qué ve" cada usuario se calculaba en el navegador
   con el rol y la sección (esSoloCompuertas, puedeVerMapa...).
   Eso impedía crear personas sin tocar el rol.

   Desde aquí la visibilidad es un dato de la persona:

     puede_medidas   -> plan: antes / durante / después + flujo
     puede_mapa      -> mapa completo (incluye compuertas)
     puede_compuertas-> compuertas (sola, sin mapa)

   Reglas:
     * mapa implica compuertas
     * compuertas sola es válida
     * medidas es independiente
     * semáforo: lo ven quienes tengan medidas o mapa (no el de
       solo compuertas). Se calcula en el front.

   El rol NO da ni quita visibilidad: solo sigue mandando dentro
   del plan (qué medidas edita cada quien, quién declara semáforo).

   Idempotente.
   ============================================================ */

-- 1. Columnas ---------------------------------------------------
alter table public.usuarios add column if not exists puede_medidas    boolean;
alter table public.usuarios add column if not exists puede_mapa       boolean;
alter table public.usuarios add column if not exists puede_compuertas boolean;

-- 2. Migración: nadie pierde lo que ya veía --------------------
--    Se copia el criterio que hoy usa el navegador:
--      esSoloCompuertas  = gerencia "GERENCIA DE CAMPO" + rol area
--      puedeVerMapa      = gerentes, Gerencia de Campo, Seguridad
--                          Industrial y Chunga
update public.usuarios u
   set puede_mapa = (
           u.rol in ('gerente_general', 'gerencial_legal', 'gdo', 'gerente_campo')
           or upper(btrim(coalesce(u.gerencia_key, ''))) like 'GERENCIA DE CAMPO%'
           or upper(coalesce(u.seccion, '') || ' ' || coalesce(u.area, '')) like '%SEGURIDAD INDUSTRIAL%'
           or upper(coalesce(u.area, '')) like '%CHUNGA%'
       ),
       puede_compuertas = (
           u.rol in ('gerente_general', 'gerencial_legal', 'gdo', 'gerente_campo')
           or upper(btrim(coalesce(u.gerencia_key, ''))) like 'GERENCIA DE CAMPO%'
           or upper(coalesce(u.seccion, '') || ' ' || coalesce(u.area, '')) like '%SEGURIDAD INDUSTRIAL%'
           or upper(coalesce(u.area, '')) like '%CHUNGA%'
           or (
               upper(btrim(coalesce(u.gerencia_key, ''))) = 'GERENCIA DE CAMPO'
               and lower(btrim(coalesce(u.rol, ''))) = 'area'
           )
       ),
       puede_medidas = not (
           upper(btrim(coalesce(u.gerencia_key, ''))) = 'GERENCIA DE CAMPO'
           and lower(btrim(coalesce(u.rol, ''))) = 'area'
       )
 where u.puede_mapa is null
    or u.puede_compuertas is null
    or u.puede_medidas is null;

alter table public.usuarios alter column puede_medidas    set default true;
alter table public.usuarios alter column puede_mapa       set default false;
alter table public.usuarios alter column puede_compuertas set default false;

alter table public.usuarios alter column puede_medidas    set not null;
alter table public.usuarios alter column puede_mapa       set not null;
alter table public.usuarios alter column puede_compuertas set not null;

-- 3. El perfil que recibe el navegador al iniciar sesión ------
create or replace function public.mi_perfil(p_area text)
returns jsonb
language sql stable security definer set search_path = public as $$
    select jsonb_build_object(
               'rol', u.rol,
               'gerencia_key', u.gerencia_key,
               'seccion', u.seccion,
               'puede_medidas', u.puede_medidas,
               'puede_mapa', u.puede_mapa,
               'puede_compuertas', u.puede_compuertas
           )
      from public.usuarios u
     where upper(btrim(u.area)) = upper(btrim(p_area))
     limit 1;
$$;

-- 4. Permisos por defecto según rol / sección -----------------
create or replace function public.permisos_por_defecto(p_rol text, p_seccion text, p_gerencia text default null)
returns text[]
language plpgsql immutable as $$
declare
    v_rol  text := lower(btrim(coalesce(p_rol, '')));
    v_sec  text := upper(btrim(coalesce(p_seccion, '')));
    v_ger  text := upper(btrim(coalesce(p_gerencia, '')));
    v_comp boolean;
begin
    v_comp := v_rol in ('gerente_general', 'gerencial_legal', 'gdo', 'gerente_campo')
              or v_ger like 'GERENCIA DE CAMPO%'
              or v_sec like '%SEGURIDAD INDUSTRIAL%'
              or (v_ger = 'GERENCIA DE CAMPO' and v_rol = 'area');

    if v_rol in ('gerente_general', 'gerencial_legal', 'gdo', 'gerente_campo')
       or v_ger like 'GERENCIA DE CAMPO%'
       or v_sec like '%SEGURIDAD INDUSTRIAL%' then
        return array['medidas', 'mapa', 'compuertas']::text[];
    end if;

    if v_ger = 'GERENCIA DE CAMPO' and v_rol = 'area' then
        return array['compuertas']::text[];
    end if;

    return array['medidas']::text[];
end $$;

-- 5. Alta de persona con permisos ------------------------------
drop function if exists public.crear_usuario_panel(text, text, text, text, text, text, text[]);

create or replace function public.crear_usuario_panel(p_clave_quien text,
                                                       p_nombre      text,
                                                       p_seccion     text,
                                                       p_rol         text,
                                                       p_gerencia    text,
                                                       p_password    text default null,
                                                       p_alarmas     text[] default null,
                                                       p_permisos    text[] default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_nombre  text := upper(btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g')));
    v_seccion text := btrim(coalesce(p_seccion, ''));
    v_rol     text := lower(btrim(coalesce(p_rol, '')));
    v_ger     text := btrim(coalesce(p_gerencia, ''));
    v_pass    text := btrim(coalesce(p_password, ''));
    v_alarma  text;
    v_perm    text[];
    v_med     boolean;
    v_map     boolean;
    v_comp    boolean;
    v_quien   text;
begin
    if not public.es_seguridad_industrial(p_clave_quien) then
        return jsonb_build_object('ok', false, 'motivo', 'sin_permiso');
    end if;

    if v_nombre = '' then
        return jsonb_build_object('ok', false, 'motivo', 'sin_nombre');
    end if;

    if exists (select 1 from public.usuarios u
                where public.norm_persona(u.area) = public.norm_persona(v_nombre)) then
        return jsonb_build_object('ok', false, 'motivo', 'ya_existe');
    end if;

    if v_rol not in ('gerente_general', 'gerente_campo', 'gerente_fabrica',
                     'gerencial_legal', 'gdo', 'jefe_area', 'sup_area', 'area') then
        return jsonb_build_object('ok', false, 'motivo', 'rol_invalido');
    end if;

    if v_seccion = '' then
        return jsonb_build_object('ok', false, 'motivo', 'sin_seccion');
    end if;

    if v_ger <> '' and not exists (select 1 from public.usuarios u
                                    where upper(btrim(coalesce(u.gerencia_key, ''))) = upper(v_ger)) then
        return jsonb_build_object('ok', false, 'motivo', 'gerencia_invalida');
    end if;

    if v_pass = '' then
        v_pass := public.apellido_password(v_nombre);
    end if;

    -- Permisos: los del formulario o los del rol/sección
    v_perm := coalesce(p_permisos, public.permisos_por_defecto(v_rol, v_seccion, v_ger));
    v_med  := 'medidas'    = any (v_perm);
    v_map  := 'mapa'       = any (v_perm);
    v_comp := 'compuertas' = any (v_perm) or v_map;   -- mapa implica compuertas

    insert into public.usuarios (area, password, rol, activo, gerencia_key, seccion,
                                 puede_medidas, puede_mapa, puede_compuertas)
    values (v_nombre, v_pass, v_rol, true, nullif(v_ger, ''), v_seccion,
            v_med, v_map, v_comp);

    select s.user_id into v_quien
      from public.sesiones_panel s
     where s.clave = btrim(coalesce(p_clave_quien, ''))
     limit 1;

    -- Casillas de alarma: arrancan APAGADAS salvo que el formulario diga otra cosa.
    foreach v_alarma in array array['semaforo', 'compuertas', 'medida'] loop
        insert into public.suscripciones_alarma (user_id, alarma, activo, actualizado_en, actualizado_por)
        values (v_nombre,
                v_alarma,
                coalesce(v_alarma = any (p_alarmas), false),
                now(),
                coalesce(v_quien, 'panel'))
        on conflict (user_id, alarma) do nothing;
    end loop;

    insert into public.app_log (origen, detalle)
    values ('usuario_alta',
            coalesce(v_quien, '?') || ' | ' || v_nombre || ' | ' || v_rol || ' | ' || v_seccion
            || ' | permisos: ' || array_to_string(v_perm, ','));

    return jsonb_build_object('ok', true, 'user_id', v_nombre, 'password', v_pass,
                              'permisos', to_jsonb(v_perm));
end $$;

-- 6. Edición de persona con permisos ---------------------------
drop function if exists public.editar_usuario_panel(text, text, text, text, text, text, boolean);

create or replace function public.editar_usuario_panel(p_clave_quien text,
                                                       p_user_id     text,
                                                       p_seccion     text default null,
                                                       p_rol         text default null,
                                                       p_gerencia    text default null,
                                                       p_password    text default null,
                                                       p_activo      boolean default null,
                                                       p_permisos    text[] default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_rol   text := lower(btrim(coalesce(p_rol, '')));
    v_pass  text := btrim(coalesce(p_password, ''));
    v_ger   text := btrim(coalesce(p_gerencia, ''));
    v_quien text;
    v_fila  public.usuarios%rowtype;
    v_med   boolean;
    v_map   boolean;
    v_comp  boolean;
begin
    if not public.es_seguridad_industrial(p_clave_quien) then
        return jsonb_build_object('ok', false, 'motivo', 'sin_permiso');
    end if;

    select * into v_fila
      from public.usuarios u
     where public.norm_persona(u.area) = public.norm_persona(p_user_id)
     limit 1;

    if v_fila.area is null then
        return jsonb_build_object('ok', false, 'motivo', 'no_existe');
    end if;

    if v_rol <> '' and v_rol not in ('gerente_general', 'gerente_campo', 'gerente_fabrica',
                                     'gerencial_legal', 'gdo', 'jefe_area', 'sup_area', 'area') then
        return jsonb_build_object('ok', false, 'motivo', 'rol_invalido');
    end if;

    if v_ger <> '' and not exists (select 1 from public.usuarios u
                                    where upper(btrim(coalesce(u.gerencia_key, ''))) = upper(v_ger)) then
        return jsonb_build_object('ok', false, 'motivo', 'gerencia_invalida');
    end if;

    select s.user_id into v_quien
      from public.sesiones_panel s
     where s.clave = btrim(coalesce(p_clave_quien, ''))
     limit 1;

    -- Si no se mandan permisos, se conservan los actuales.
    v_med  := coalesce('medidas'    = any (p_permisos), v_fila.puede_medidas);
    v_map  := coalesce('mapa'       = any (p_permisos), v_fila.puede_mapa);
    v_comp := coalesce('compuertas' = any (p_permisos), v_fila.puede_compuertas) or v_map;

    update public.usuarios set
        seccion          = coalesce(nullif(btrim(coalesce(p_seccion, '')), ''), seccion),
        rol              = coalesce(nullif(v_rol, ''), rol),
        gerencia_key     = coalesce(nullif(v_ger, ''), gerencia_key),
        password         = coalesce(nullif(v_pass, ''), password),
        activo           = coalesce(p_activo, activo),
        puede_medidas    = v_med,
        puede_mapa       = v_map,
        puede_compuertas = v_comp
    where area = v_fila.area;

    insert into public.app_log (origen, detalle)
    values ('usuario_edita', coalesce(v_quien, '?') || ' | ' || v_fila.area
            || ' | permisos: ' || concat_ws(',',
                 case when v_med  then 'medidas'    end,
                 case when v_map  then 'mapa'       end,
                 case when v_comp then 'compuertas' end));

    return jsonb_build_object('ok', true, 'user_id', v_fila.area,
                              'puede_medidas', v_med, 'puede_mapa', v_map,
                              'puede_compuertas', v_comp);
end $$;

-- 7. Lista del panel: casillas + maestro + permisos ------------
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
    puede_compuertas boolean
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
               u.puede_compuertas
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

grant execute on function public.alarmas_personas_lista(text) to anon, authenticated;
grant execute on function public.crear_usuario_panel(text, text, text, text, text, text, text[], text[]) to anon, authenticated;
grant execute on function public.editar_usuario_panel(text, text, text, text, text, text, boolean, text[]) to anon, authenticated;

-- 8. Reparto: el dueño del celular manda ----------------------
-- Antes se decidía por la FILA de push_subscriptions: si el
-- mismo celular estaba a nombre de tres personas, bastaba que
-- una tuviera la casilla encendida.
-- Ahora primero se resuelve DE QUIÉN ES EL CELULAR (persona de
-- la sesión viva más reciente con ese token) y después se miran
-- su switch maestro y su casilla.
drop function if exists public.destinatarios_push(text, text);

create or replace function public.destinatarios_push(p_tipo text default null,
                                                     p_alarma text default null)
returns table(user_id text, token text, notialarm_webhook text, tipo text, rol text)
language sql stable security definer set search_path = public as $$
    with base as (
        select ps.id, ps.token, ps.tipo, ps.rol, ps.notialarm_webhook,
               ps.user_id as user_fila
          from push_subscriptions ps
         where (p_tipo is null or ps.tipo = p_tipo)
           and ps.token is not null
    ),
    con_dueno as (
        select b.*,
               coalesce(
                   -- Android: la persona de la sesión viva más reciente con ese token
                   (select s.user_id
                      from sesiones_panel s
                     where s.token_push = b.token
                     order by s.inicio desc
                     limit 1),
                   -- iPhone: la fila es de la persona (token 'ios-...')
                   case when b.token like 'ios-%' then b.user_fila end,
                   -- Conductor: la fila es del conductor
                   case when b.tipo = 'conductor' then b.user_fila end,
                   -- Respaldo: fila a nombre de una persona que existe
                   case when exists (select 1 from usuarios u
                                      where norm_persona(u.area) = norm_persona(b.user_fila))
                        then b.user_fila end
               ) as dueno
          from base b
    ),
    validos as (
        select c.*
          from con_dueno c
         where c.dueno is not null
           -- switch maestro: en rojo no llega nada
           and not esta_silenciado(c.dueno)
           -- un jefe solo recibe si tiene sesión viva con ese equipo
           and (c.tipo <> 'jefe'
                or exists (select 1 from sesiones_panel s
                            where s.token_push = c.token))
           -- casilla de esa alarma, mirada en el DUEÑO
           and (
                p_alarma is null
                or not exists (select 1 from alarmas_catalogo ca
                                where ca.clave = p_alarma and ca.en_panel)
                or exists (select 1 from suscripciones_alarma sa
                            where sa.alarma = p_alarma
                              and sa.activo is true
                              and norm_persona(sa.user_id) = norm_persona(c.dueno))
           )
    )
    select distinct on (v.token)
           v.dueno, v.token, v.notialarm_webhook, v.tipo, v.rol
      from validos v
     order by v.token, v.id;
$$;

revoke all on function public.destinatarios_push(text, text) from public;
revoke all on function public.destinatarios_push(text, text) from anon;
revoke all on function public.destinatarios_push(text, text) from authenticated;
grant execute on function public.destinatarios_push(text, text) to service_role;

-- 9. Registro del celular A NOMBRE DE LA PERSONA ---------------
-- Reemplaza el insert directo del navegador (que guardaba la
-- SECCIÓN y dejaba el mismo token a nombre de varias personas).
create or replace function public.registrar_token_persona(p_dispositivo text,
                                                          p_token       text,
                                                          p_rol         text default null,
                                                          p_clave       text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_disp  text := nullif(btrim(coalesce(p_dispositivo, '')), '');
    v_token text := nullif(btrim(coalesce(p_token, '')), '');
    v_clave text := nullif(btrim(coalesce(p_clave, '')), '');
    v_user  text;
begin
    if v_token is null then
        return jsonb_build_object('ok', false, 'motivo', 'sin_token');
    end if;

    -- La sesión de este equipo manda; si no, la clave del portal.
    select s.user_id into v_user
      from sesiones_panel s
     where (v_disp is not null and s.dispositivo = v_disp)
        or (v_clave is not null and s.clave = v_clave)
     order by s.inicio desc
     limit 1;

    if v_user is null then
        return jsonb_build_object('ok', false, 'motivo', 'sin_sesion');
    end if;

    -- El celular queda a nombre de UNA persona: se borran las filas
    -- del mismo token que estén a nombre de otra.
    delete from push_subscriptions ps
     where ps.token = v_token
       and norm_persona(ps.user_id) <> norm_persona(v_user);

    -- Y no se duplica la fila de esta persona.
    if exists (select 1 from push_subscriptions ps
                where ps.token = v_token
                  and norm_persona(ps.user_id) = norm_persona(v_user)) then
        update push_subscriptions ps
           set tipo = 'jefe',
               rol  = coalesce(p_rol, ps.rol)
         where ps.token = v_token
           and norm_persona(ps.user_id) = norm_persona(v_user);
    else
        insert into push_subscriptions (user_id, token, tipo, rol)
        values (v_user, v_token, 'jefe', p_rol);
    end if;

    -- Enganchar el token a la sesión de este equipo
    if v_disp is not null then
        delete from sesiones_panel
         where token_push = v_token
           and dispositivo is distinct from v_disp;

        update sesiones_panel
           set token_push = v_token
         where dispositivo = v_disp;
    end if;

    return jsonb_build_object('ok', true, 'user_id', v_user, 'token', v_token);
end $$;

grant execute on function public.registrar_token_persona(text, text, text, text) to anon, authenticated;

-- 10. Cerrar sesión: se lleva su celular, sin dejar rastro ------
create or replace function public.cerrar_sesion_panel(p_clave text default null,
                                                      p_dispositivo text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_clave text := nullif(btrim(coalesce(p_clave, '')), '');
    v_disp  text := nullif(btrim(coalesce(p_dispositivo, '')), '');
    v_token text;
    n int;
begin
    if v_clave is null and v_disp is null then
        return jsonb_build_object('ok', false, 'motivo', 'sin_identificador');
    end if;

    -- Token de este equipo, para borrar su suscripción al salir
    select s.token_push into v_token
      from sesiones_panel s
     where (v_clave is not null and s.clave = v_clave)
        or (v_disp  is not null and s.dispositivo = v_disp)
     limit 1;

    insert into sesiones_historial (tipo, user_id, unidad, rol, dispositivo, inicio, motivo)
    select 'jefe', user_id, null, rol, dispositivo, inicio, 'cerrada'
      from sesiones_panel
     where (v_clave is not null and clave = v_clave)
        or (v_disp  is not null and dispositivo = v_disp);

    delete from sesiones_panel
     where (v_clave is not null and clave = v_clave)
        or (v_disp  is not null and dispositivo = v_disp);

    get diagnostics n = row_count;

    -- Sin rastro: el celular deja de estar suscrito hasta que alguien
    -- vuelva a iniciar sesión en él.
    if v_token is not null and v_token not like 'ios-%' then
        delete from push_subscriptions ps
         where ps.token = v_token
           and ps.notialarm_webhook is null;
    end if;

    return jsonb_build_object('ok', true, 'cerradas', n);
end $$;

grant execute on function public.cerrar_sesion_panel(text, text) to anon, authenticated;

-- 11. adjuntar_token_dispositivo: misma transferencia ----------
create or replace function public.adjuntar_token_dispositivo(p_dispositivo text, p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_disp  text := nullif(btrim(coalesce(p_dispositivo, '')), '');
    v_token text := nullif(btrim(coalesce(p_token, '')), '');
    v_user  text;
    n int;
begin
    if v_disp is null or v_token is null then
        return jsonb_build_object('ok', false, 'motivo', 'faltan_datos');
    end if;

    select s.user_id into v_user
      from sesiones_panel s
     where s.dispositivo = v_disp
     limit 1;

    -- El mismo token no puede quedar atado a dos sesiones.
    delete from sesiones_panel
     where token_push = v_token
       and dispositivo is distinct from v_disp;

    update sesiones_panel
       set token_push = v_token
     where dispositivo = v_disp;

    get diagnostics n = row_count;

    -- Y tampoco a dos personas.
    if v_user is not null then
        delete from push_subscriptions ps
         where ps.token = v_token
           and norm_persona(ps.user_id) <> norm_persona(v_user);
    end if;

    return jsonb_build_object('ok', n > 0);
end $$;

-- 12. Limpieza de duplicados actuales -------------------------
-- Cada token queda con UNA fila: la de la persona de su sesión viva
-- más reciente. Las filas de sección ("Seguridad Industrial") se
-- reasignan si tienen una persona detrás.
update public.push_subscriptions ps
   set user_id = s.user_id
  from public.sesiones_panel s
 where s.token_push = ps.token
   and public.norm_persona(ps.user_id) <> public.norm_persona(s.user_id)
   and not exists (select 1 from public.usuarios u
                    where public.norm_persona(u.area) = public.norm_persona(ps.user_id));

delete from public.push_subscriptions ps
 where ps.notialarm_webhook is null
   and ps.token not like 'ios-%'
   and exists (
        select 1 from public.push_subscriptions p2
         where p2.token = ps.token
           and p2.id <> ps.id
           and (
                p2.created_at > ps.created_at
                or (p2.created_at = ps.created_at and p2.id > ps.id)
           )
   );
