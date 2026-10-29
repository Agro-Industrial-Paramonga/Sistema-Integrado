-- ============================================================
-- Sesiones del portal: identidad por equipo, cierre por boton
-- Proyecto bfhfnldqwsrcpsdqpyat (Plan de contingencia)
--
-- Reglas acordadas:
--   1. La sesion NO se cierra sola: ni por tiempo ni por inactividad.
--      Solo deja de existir cuando el usuario pulsa Cerrar sesion o
--      cuando Seguridad Industrial la libera a la fuerza.
--   2. Un jefe puede tener varios equipos a la vez: cada equipo tiene
--      su propia fila, identificada por `dispositivo`.
--   3. El equipo se identifica por `dispositivo` (id nativo del APK),
--      no por localStorage. Asi, con la cache limpia, el portal
--      recupera su sesion y puede cerrarla igual.
--   4. Cada cierre deja UNA fila en sesiones_historial. La tabla
--      operativa queda sin basura.
-- ============================================================

-- 1. Historial (misma tabla para jefes y conductores) ------------
create table if not exists sesiones_historial (
    id          bigserial primary key,
    tipo        text not null default 'jefe',
    user_id     text not null,
    unidad      text,
    rol         text,
    dispositivo text,
    inicio      timestamptz,
    cerrada_en  timestamptz not null default now(),
    motivo      text not null default 'cerrada',
    liberada_por text
);

alter table sesiones_historial drop constraint if exists sesiones_historial_tipo_check;
alter table sesiones_historial add constraint sesiones_historial_tipo_check
    check (tipo in ('jefe', 'conductor'));

alter table sesiones_historial drop constraint if exists sesiones_historial_motivo_check;
alter table sesiones_historial add constraint sesiones_historial_motivo_check
    check (motivo in ('cerrada', 'forzada', 'reemplazada'));

create index if not exists sesiones_historial_fecha_idx
    on sesiones_historial (cerrada_en desc);

-- Sin politicas: se escribe solo desde las funciones de abajo.
alter table sesiones_historial enable row level security;

-- 2. El equipo pasa a ser parte de la sesion ---------------------
alter table sesiones_panel add column if not exists dispositivo text;

-- Firma vieja: la reemplaza la de tres argumentos (los dos primeros iguales).
drop function if exists abrir_sesion_panel(text, text);

-- Un equipo no puede tener dos sesiones abiertas a la vez.
drop index if exists sesiones_panel_dispositivo_uq;
create unique index sesiones_panel_dispositivo_uq
    on sesiones_panel (dispositivo) where dispositivo is not null;

create index if not exists sesiones_panel_token_idx
    on sesiones_panel (token_push);

-- 3. Abrir sesion: valida clave y reemplaza solo la de ese equipo
create or replace function abrir_sesion_panel(
    p_area text,
    p_password text,
    p_dispositivo text default null
)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $fn$
declare
    u record;
    v_clave text;
    v_disp text := nullif(btrim(coalesce(p_dispositivo, '')), '');
begin
    select area, rol, activo, gerencia_key, seccion into u
      from usuarios
     where upper(btrim(area)) = upper(btrim(p_area))
       and password = p_password
     limit 1;

    if u.area is null or u.activo is not true then
        return jsonb_build_object('ok', false, 'motivo', 'credenciales');
    end if;

    -- Este equipo deja su sesion anterior en el historial. Las sesiones
    -- de otros equipos del mismo jefe NO se tocan.
    if v_disp is not null then
        insert into sesiones_historial (tipo, user_id, unidad, rol, dispositivo, inicio, motivo)
        select 'jefe', user_id, null, rol, dispositivo, inicio, 'reemplazada'
          from sesiones_panel
         where dispositivo = v_disp;

        delete from sesiones_panel where dispositivo = v_disp;
    end if;

    -- Restos del flujo anterior: filas de este usuario sin token y sin equipo.
    delete from sesiones_panel
     where upper(btrim(user_id)) = upper(btrim(u.area))
       and token_push is null
       and dispositivo is null;

    v_clave := replace(gen_random_uuid()::text, '-', '')
            || replace(gen_random_uuid()::text, '-', '');

    insert into sesiones_panel (user_id, rol, clave, dispositivo)
    values (u.area, u.rol, v_clave, v_disp);

    -- Barrido: una suscripcion de jefe sin sesion viva no le sirve a nadie.
    -- (La de este equipo se vuelve a crear al registrar el token.)
    delete from push_subscriptions ps
     where ps.tipo = 'jefe'
       and ps.token is not null
       and not exists (select 1 from sesiones_panel s where s.token_push = ps.token);

    return jsonb_build_object('ok', true, 'rol', u.rol, 'clave', v_clave,
                              'gerencia_key', u.gerencia_key, 'seccion', u.seccion);
end
$fn$;

-- 4. Recuperar la sesion de este equipo (sin localStorage) --------
create or replace function sesion_panel_por_dispositivo(p_dispositivo text)
returns jsonb
language sql stable security definer set search_path to 'public'
as $fn$
    select jsonb_build_object(
              'ok', true,
              'user_id', s.user_id,
              'rol', s.rol,
              'clave', s.clave,
              'inicio', s.inicio,
              'con_token', s.token_push is not null,
              'gerencia_key', (select u.gerencia_key from usuarios u
                                where upper(btrim(u.area)) = upper(btrim(s.user_id))
                                limit 1),
              'seccion', (select u.seccion from usuarios u
                           where upper(btrim(u.area)) = upper(btrim(s.user_id))
                           limit 1)
           )
      from sesiones_panel s
     where s.dispositivo = nullif(btrim(coalesce(p_dispositivo, '')), '')
     limit 1;
$fn$;

-- 5. Atar el token de notificaciones a la sesion de este equipo ---
create or replace function adjuntar_token_dispositivo(p_dispositivo text, p_token text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $fn$
declare
    v_disp text := nullif(btrim(coalesce(p_dispositivo, '')), '');
    v_token text := nullif(btrim(coalesce(p_token, '')), '');
    n int;
begin
    if v_disp is null or v_token is null then
        return jsonb_build_object('ok', false, 'motivo', 'faltan_datos');
    end if;

    -- El mismo token no puede quedar atado a dos sesiones.
    delete from sesiones_panel
     where token_push = v_token
       and dispositivo is distinct from v_disp;

    update sesiones_panel
       set token_push = v_token
     where dispositivo = v_disp;

    get diagnostics n = row_count;
    return jsonb_build_object('ok', n > 0);
end
$fn$;

-- 6. Cerrar sesion: solo por decision del usuario -----------------
-- Acepta el equipo (recomendado) o la clave (compatibilidad).
create or replace function cerrar_sesion_panel(
    p_clave text default null,
    p_dispositivo text default null
)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $fn$
declare
    v_clave text := nullif(btrim(coalesce(p_clave, '')), '');
    v_disp  text := nullif(btrim(coalesce(p_dispositivo, '')), '');
    n int;
begin
    if v_clave is null and v_disp is null then
        return jsonb_build_object('ok', false, 'motivo', 'sin_identificador');
    end if;

    insert into sesiones_historial (tipo, user_id, unidad, rol, dispositivo, inicio, motivo)
    select 'jefe', user_id, null, rol, dispositivo, inicio, 'cerrada'
      from sesiones_panel
     where (v_clave is not null and clave = v_clave)
        or (v_disp is not null and dispositivo = v_disp);

    delete from sesiones_panel
     where (v_clave is not null and clave = v_clave)
        or (v_disp is not null and dispositivo = v_disp);

    get diagnostics n = row_count;
    return jsonb_build_object('ok', true, 'cerradas', n);
end
$fn$;

-- 7. Quien puede liberar sesiones ajenas --------------------------
create or replace function puede_liberar(p_clave text)
returns boolean
language sql stable security definer set search_path to 'public'
as $fn$
    select coalesce((
        select u.rol = 'gerente_general'
            or upper(btrim(coalesce(u.seccion, ''))) = 'SEGURIDAD INDUSTRIAL'
            or upper(btrim(coalesce(u.area, ''))) = 'SST'
          from sesiones_panel s
          join usuarios u on upper(btrim(u.area)) = upper(btrim(s.user_id))
         where s.clave = btrim(coalesce(p_clave, ''))
         limit 1
    ), false);
$fn$;

-- 8. Liberacion forzada (equipo roto, jefe que no cierra) ---------
create or replace function liberar_sesion_panel(
    p_clave_quien text,
    p_user_id text,
    p_dispositivo text default null
)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $fn$
declare
    v_disp text := nullif(btrim(coalesce(p_dispositivo, '')), '');
    v_quien text;
    n int;
begin
    if not puede_liberar(p_clave_quien) then
        return jsonb_build_object('ok', false, 'motivo', 'sin_permiso');
    end if;

    select user_id into v_quien from sesiones_panel
     where clave = btrim(coalesce(p_clave_quien, '')) limit 1;

    insert into sesiones_historial (tipo, user_id, unidad, rol, dispositivo, inicio, motivo, liberada_por)
    select 'jefe', user_id, null, rol, dispositivo, inicio, 'forzada', v_quien
      from sesiones_panel
     where upper(btrim(user_id)) = upper(btrim(p_user_id))
       and (v_disp is null or dispositivo = v_disp);

    delete from sesiones_panel
     where upper(btrim(user_id)) = upper(btrim(p_user_id))
       and (v_disp is null or dispositivo = v_disp);

    get diagnostics n = row_count;
    return jsonb_build_object('ok', true, 'liberadas', n);
end
$fn$;

-- 9. Lista de sesiones abiertas para el panel --------------------
create or replace function sesiones_panel_lista(p_clave_quien text)
returns table (user_id text, rol text, dispositivo text, inicio timestamptz,
               con_token boolean, seccion text)
language sql stable security definer set search_path to 'public'
as $fn$
    select s.user_id, s.rol, s.dispositivo, s.inicio,
           s.token_push is not null,
           (select u.seccion from usuarios u
             where upper(btrim(u.area)) = upper(btrim(s.user_id)) limit 1)
      from sesiones_panel s
     where puede_liberar(p_clave_quien)
     order by s.inicio;
$fn$;

-- 10. Permisos ---------------------------------------------------
grant execute on function abrir_sesion_panel(text, text, text) to anon, authenticated;
grant execute on function sesion_panel_por_dispositivo(text) to anon, authenticated;
grant execute on function adjuntar_token_dispositivo(text, text) to anon, authenticated;
grant execute on function cerrar_sesion_panel(text, text) to anon, authenticated;
grant execute on function liberar_sesion_panel(text, text, text) to anon, authenticated;
grant execute on function sesiones_panel_lista(text) to anon, authenticated;
grant execute on function puede_liberar(text) to anon, authenticated;

-- La firma vieja de cerrar (un solo argumento) queda reemplazada por la nueva.
drop function if exists cerrar_sesion_panel(text);

-- 11. Limpieza de basura acumulada -------------------------------
-- Suscripciones de jefe sin sesion viva: no reciben nada y nunca se borraban.
delete from push_subscriptions ps
 where ps.tipo = 'jefe'
   and ps.token is not null
   and not exists (select 1 from sesiones_panel s where s.token_push = ps.token);

-- Suscripciones de conductor sin unidad: restos de pruebas y del flujo viejo.
delete from push_subscriptions
 where tipo = 'conductor'
   and unidad is null;

-- Diagnostico viejo.
delete from app_log where creado_en < now() - interval '7 days';
