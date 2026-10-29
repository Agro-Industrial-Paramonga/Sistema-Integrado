-- ============================================================
-- Turnos de conductores: identidad por equipo y cierre por boton
-- Proyecto bfhfnldqwsrcpsdqpyat (Plan de contingencia)
--
-- Reglas:
--   1. Un turno existe mientras el conductor no pulse Cerrar turno.
--      No se cierra por tiempo ni por inactividad.
--   2. El equipo se identifica por `dispositivo`: asi el turno se
--      recupera de la base aunque se borre la cache del WebView.
--   3. Un equipo no puede tener dos unidades a la vez (indice unico).
--   4. Cada cierre queda en sesiones_historial. La tabla de turnos
--      queda limpia: un turno cerrado no deja fila.
-- ============================================================

-- 1. El equipo y el DNI pasan a formar parte del turno ----------
alter table sesiones_unidad add column if not exists dispositivo text;
alter table sesiones_unidad add column if not exists dni text;

drop index if exists sesiones_unidad_dispositivo_uq;
create unique index sesiones_unidad_dispositivo_uq
    on sesiones_unidad (dispositivo) where dispositivo is not null;

-- 2. Abrir turno -----------------------------------------------
create or replace function abrir_turno(
    p_unidad text,
    p_user_id text,
    p_dni text,
    p_dispositivo text,
    p_token text default null
)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $fn$
declare
    v_unidad text := btrim(coalesce(p_unidad, ''));
    v_user   text := btrim(coalesce(p_user_id, ''));
    v_disp   text := nullif(btrim(coalesce(p_dispositivo, '')), '');
    v_token  text := nullif(btrim(coalesce(p_token, '')), '');
    r record;
begin
    if v_unidad = '' or v_user = '' or v_disp is null then
        return jsonb_build_object('ok', false, 'motivo', 'datos');
    end if;

    -- Este equipo ya esta conduciendo otra unidad
    select unidad, user_id into r
      from sesiones_unidad
     where dispositivo = v_disp
     limit 1;

    if r.unidad is not null and upper(btrim(r.unidad)) <> upper(v_unidad) then
        return jsonb_build_object('ok', false, 'motivo', 'ya_tiene_turno', 'unidad', r.unidad);
    end if;

    -- La unidad esta tomada por otra persona
    select unidad, user_id into r
      from sesiones_unidad
     where upper(btrim(unidad)) = upper(v_unidad)
     limit 1;

    if r.unidad is not null and upper(btrim(r.user_id)) <> upper(v_user) then
        return jsonb_build_object('ok', false, 'motivo', 'ocupada', 'user_id', r.user_id);
    end if;

    insert into sesiones_unidad (unidad, user_id, token, inicio, dni, dispositivo)
    values (v_unidad, v_user, v_token, now(),
            nullif(btrim(coalesce(p_dni, '')), ''), v_disp)
    on conflict (unidad) do update
        set user_id = excluded.user_id,
            token   = coalesce(excluded.token, sesiones_unidad.token),
            dni     = coalesce(excluded.dni, sesiones_unidad.dni),
            dispositivo = excluded.dispositivo;

    return jsonb_build_object('ok', true, 'unidad', v_unidad);
end
$fn$;

-- 3. Recuperar el turno de este equipo -------------------------
create or replace function sesion_unidad_por_dispositivo(p_dispositivo text)
returns jsonb
language sql stable security definer set search_path to 'public'
as $fn$
    select jsonb_build_object(
              'ok', true,
              'unidad', unidad,
              'user_id', user_id,
              'dni', dni,
              'inicio', inicio,
              'con_token', token is not null
           )
      from sesiones_unidad
     where dispositivo = nullif(btrim(coalesce(p_dispositivo, '')), '')
     limit 1;
$fn$;

-- 4. Cerrar turno: solo lo decide el conductor -----------------
create or replace function cerrar_turno(
    p_unidad text,
    p_dispositivo text default null
)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $fn$
declare
    v_unidad text := nullif(btrim(coalesce(p_unidad, '')), '');
    v_disp   text := nullif(btrim(coalesce(p_dispositivo, '')), '');
    r record;
    n int := 0;
begin
    for r in
        select * from sesiones_unidad
         where (v_disp is not null and dispositivo = v_disp)
            or (v_unidad is not null and upper(btrim(unidad)) = upper(v_unidad))
         order by inicio
    loop
        insert into sesiones_historial (tipo, user_id, unidad, dispositivo, inicio, motivo)
        values ('conductor', r.user_id, r.unidad, r.dispositivo, r.inicio, 'cerrada');

        delete from ubicaciones
         where upper(btrim(user_id)) = upper(btrim(r.user_id))
            or upper(btrim(coalesce(unidad, ''))) = upper(btrim(r.unidad));

        delete from push_subscriptions
         where upper(btrim(user_id)) = upper(btrim(r.user_id))
            or upper(btrim(coalesce(unidad, ''))) = upper(btrim(r.unidad));

        delete from sesiones_unidad where unidad = r.unidad;
        n := n + 1;
    end loop;

    return jsonb_build_object('ok', true, 'cerradas', n);
end
$fn$;

-- 5. Liberacion forzada desde el panel -------------------------
create or replace function liberar_unidad(p_clave_quien text, p_unidad text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $fn$
declare
    v_unidad text := nullif(btrim(coalesce(p_unidad, '')), '');
    v_quien  text;
    r record;
    n int := 0;
begin
    if not puede_liberar(p_clave_quien) then
        return jsonb_build_object('ok', false, 'motivo', 'sin_permiso');
    end if;

    select user_id into v_quien from sesiones_panel
     where clave = btrim(coalesce(p_clave_quien, '')) limit 1;

    if v_unidad is null then
        return jsonb_build_object('ok', false, 'motivo', 'sin_unidad');
    end if;

    for r in select * from sesiones_unidad
              where upper(btrim(unidad)) = upper(v_unidad)
    loop
        insert into sesiones_historial (tipo, user_id, unidad, dispositivo, inicio, motivo, liberada_por)
        values ('conductor', r.user_id, r.unidad, r.dispositivo, r.inicio, 'forzada', v_quien);

        delete from ubicaciones
         where upper(btrim(user_id)) = upper(btrim(r.user_id))
            or upper(btrim(coalesce(unidad, ''))) = upper(btrim(r.unidad));

        delete from push_subscriptions
         where upper(btrim(user_id)) = upper(btrim(r.user_id))
            or upper(btrim(coalesce(unidad, ''))) = upper(btrim(r.unidad));

        delete from sesiones_unidad where unidad = r.unidad;
        n := n + 1;
    end loop;

    return jsonb_build_object('ok', true, 'liberadas', n);
end
$fn$;

-- 6. Unidades en turno para el panel ---------------------------
create or replace function unidades_en_turno(p_clave_quien text)
returns table (unidad text, user_id text, dni text, inicio timestamptz,
               dispositivo text, con_token boolean)
language sql stable security definer set search_path to 'public'
as $fn$
    select s.unidad, s.user_id, s.dni, s.inicio, s.dispositivo,
           s.token is not null
      from sesiones_unidad s
     where puede_liberar(p_clave_quien)
     order by s.inicio;
$fn$;

-- 7. Permisos ---------------------------------------------------
grant execute on function abrir_turno(text, text, text, text, text) to anon, authenticated;
grant execute on function sesion_unidad_por_dispositivo(text) to anon, authenticated;
grant execute on function cerrar_turno(text, text) to anon, authenticated;
grant execute on function liberar_unidad(text, text) to anon, authenticated;
grant execute on function unidades_en_turno(text) to anon, authenticated;

-- 8. Turnos viejos sin equipo: no se pueden recuperar -----------
-- Se dejan como estan: el conductor los cerrara desde su celular y ese
-- cierre ya entra al historial. No se borran turnos activos.
