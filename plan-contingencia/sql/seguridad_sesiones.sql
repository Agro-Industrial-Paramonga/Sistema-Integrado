-- ============================================================
-- Sesiones del portal y alarmas por canal
-- Ejecutado en el proyecto bfhfnldqwsrcpsdqpyat (Plan de contingencia)
--
-- Qué resuelve:
--   1. La alarma "general" (planes de acción, medidas) solo llega a
--      jefes y gerentes con la sesión abierta en ese equipo.
--   2. La evacuación sigue llegando solo a los conductores.
--   3. La tabla usuarios deja de ser legible desde el navegador
--      (ahí estaban las contraseñas en texto plano).
--
-- Regla: cerrar sesión en el portal baja la sesión de la base, así el
-- token del celular quede guardado igual no recibe más alarmas de jefe.
-- ============================================================

-- 1. Canal de cada suscripción ---------------------------------
alter table push_subscriptions add column if not exists tipo text not null default 'conductor';
alter table push_subscriptions drop constraint if exists push_subscriptions_tipo_check;
alter table push_subscriptions add constraint push_subscriptions_tipo_check
    check (tipo in ('jefe', 'conductor'));

-- Quien está con una unidad es conductor; jefes y áreas son 'jefe'.
update push_subscriptions ps
   set tipo = 'jefe'
 where exists (select 1 from usuarios u
                where upper(btrim(u.area)) = upper(btrim(ps.user_id)))
    or upper(btrim(ps.user_id)) in (
        'SEGURIDAD INDUSTRIAL', 'GERENCIA DE CAMPO', 'GERENCIA GENERAL', 'BIENESTAR SOCIAL',
        'GERENCIA LEGAL Y RELACIONES LABORALES', 'GERENCIA DE FABRICA',
        'GERENCIA DSRR ORGANIZ Y SOSTEN', 'GERENCIA DE ADM Y FINANZAS');

-- 2. Sesiones del portal ----------------------------------------
-- Una fila por equipo con sesión abierta. Sin políticas: la tabla no
-- se lee ni se escribe desde afuera, solo a través de las funciones.
create table if not exists sesiones_panel (
    id         uuid primary key default gen_random_uuid(),
    user_id    text not null,
    rol        text,
    clave      text not null unique,
    token_push text,
    inicio     timestamptz not null default now()
);

alter table sesiones_panel enable row level security;

-- 3. Abrir sesión (valida la contraseña en la base) --------------
create or replace function abrir_sesion_panel(p_area text, p_password text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $fn$
declare u record; v_clave text;
begin
    select area, rol, activo, gerencia_key, seccion into u
      from usuarios
     where upper(btrim(area)) = upper(btrim(p_area))
       and password = p_password
     limit 1;

    if u.area is null or u.activo is not true then
        return jsonb_build_object('ok', false, 'motivo', 'credenciales');
    end if;

    delete from sesiones_panel
     where upper(btrim(user_id)) = upper(btrim(u.area))
       and token_push is null;

    v_clave := replace(gen_random_uuid()::text, '-', '')
            || replace(gen_random_uuid()::text, '-', '');
    insert into sesiones_panel (user_id, rol, clave) values (u.area, u.rol, v_clave);

    return jsonb_build_object('ok', true, 'rol', u.rol, 'clave', v_clave,
                              'gerencia_key', u.gerencia_key, 'seccion', u.seccion);
end
$fn$;

-- 4. Atar el token de notificaciones a la sesión -----------------
create or replace function adjuntar_token_panel(p_clave text, p_token text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $fn$
declare n int;
begin
    if coalesce(btrim(p_token), '') = '' then
        return jsonb_build_object('ok', false, 'motivo', 'sin_token');
    end if;

    delete from sesiones_panel
     where token_push = btrim(p_token)
       and clave <> btrim(p_clave);

    update sesiones_panel
       set token_push = btrim(p_token)
     where clave = btrim(p_clave);
    get diagnostics n = row_count;

    return jsonb_build_object('ok', n > 0);
end
$fn$;

-- 5. Cerrar sesión ----------------------------------------------
create or replace function cerrar_sesion_panel(p_clave text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $fn$
declare n int;
begin
    delete from sesiones_panel where clave = btrim(p_clave);
    get diagnostics n = row_count;
    return jsonb_build_object('ok', true, 'cerradas', n);
end
$fn$;

-- 6. Destinatarios: la base decide, no la función edge -----------
-- Solo la usa el service_role (la función edge). Los jefes necesitan
-- sesión viva con ese mismo token.
create or replace function destinatarios_push(p_tipo text default null)
returns table (user_id text, token text, notialarm_webhook text, tipo text)
language sql stable security definer set search_path to 'public'
as $fn$
    select distinct on (ps.token) ps.user_id, ps.token, ps.notialarm_webhook, ps.tipo
      from push_subscriptions ps
     where (p_tipo is null or ps.tipo = p_tipo)
       and ps.token is not null
       and (
            ps.tipo <> 'jefe'
            or exists (select 1 from sesiones_panel s
                        where s.token_push is not null
                          and s.token_push = ps.token)
       )
     order by ps.token;
$fn$;

-- 7. Login sin leer la tabla usuarios ----------------------------
create or replace function login_areas()
returns table (area text, gerencia_key text, seccion text)
language sql stable security definer set search_path to 'public'
as $fn$
    select u.area, u.gerencia_key, u.seccion
      from usuarios u
     where u.activo is true
     order by u.area;
$fn$;

create or replace function mi_perfil(p_area text)
returns jsonb
language sql stable security definer set search_path to 'public'
as $fn$
    select jsonb_build_object('rol', u.rol, 'gerencia_key', u.gerencia_key, 'seccion', u.seccion)
      from usuarios u
     where upper(btrim(u.area)) = upper(btrim(p_area))
     limit 1;
$fn$;

grant execute on function abrir_sesion_panel(text, text) to anon, authenticated;
grant execute on function adjuntar_token_panel(text, text) to anon, authenticated;
grant execute on function cerrar_sesion_panel(text) to anon, authenticated;
grant execute on function login_areas() to anon, authenticated;
grant execute on function mi_perfil(text) to anon, authenticated;

-- Solo la función edge (service_role) puede listar destinatarios
revoke execute on function destinatarios_push(text) from anon, authenticated, public;

-- 8. Cerrar la tabla usuarios -----------------------------------
-- Se borran todas sus políticas: queda accesible solo por las funciones
-- de arriba y por cambiar_password(). El login ya no la consulta.
do $$
declare r record;
begin
  for r in select policyname from pg_policies
            where schemaname = 'public' and tablename = 'usuarios' loop
    execute format('drop policy %I on public.usuarios', r.policyname);
  end loop;
end $$;
