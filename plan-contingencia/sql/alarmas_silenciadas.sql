-- ============================================================
-- Silencio de alarmas por persona (switch rojo/verde del panel)
-- Proyecto bfhfnldqwsrcpsdqpyat (Plan de contingencia)
--
-- Regla acordada:
--   El silencio DURA hasta que Seguridad Industrial lo vuelva a
--   activar. No se borra al cerrar sesion, ni al liberar, ni al
--   reiniciar el celular. Aplica a jefes y a conductores.
--
-- Donde se corta:
--   1. destinatarios_push()  -> alarmas generales (medidas, semaforo)
--      y evacuacion a conductores.
--   2. token_silenciado()    -> envios directos a un celular, que
--      la funcion edge manda sin consultar la lista anterior.
--   No se toca la sesion: la persona sigue dentro del portal, solo
--   deja de recibir alarmas.
-- ============================================================

-- 0. Normalizacion de nombres, igual que en el resto de funciones --
-- Ojo: algunos user_id guardados traen salto de linea o espacio duro al
-- final ("HIDALGO JAMANCA EVA \n"), asi que se aplana todo antes de comparar.
create or replace function norm_persona(p text)
returns text
language sql immutable
as $fn$
    select btrim(regexp_replace(
               upper(translate(coalesce(p, ''), E'\t\n\r' || chr(160), '    ')),
               '\s+', ' ', 'g'));
$fn$;

-- 1. Quien esta silenciado -----------------------------------------
create table if not exists alarmas_silenciadas (
    clave       text primary key,
    user_id     text not null,
    tipo        text,
    apagada_en  timestamptz not null default now(),
    apagada_por text
);

-- Sin politicas: solo se escribe por las funciones de abajo.
alter table alarmas_silenciadas enable row level security;

-- 2. Consulta interna: ¿esta persona no recibe alarmas? ------------
create or replace function esta_silenciado(p_user_id text)
returns boolean
language sql stable security definer set search_path to 'public'
as $fn$
    select exists (
        select 1 from alarmas_silenciadas a
         where a.clave = norm_persona(p_user_id)
    );
$fn$;

-- 3. ¿Este celular pertenece a alguien silenciado? -----------------
-- Cubre la sesion de jefe, el turno de conductor y la suscripcion
-- suelta, para que un envio directo por token tambien se corte.
create or replace function token_silenciado(p_token text)
returns boolean
language sql stable security definer set search_path to 'public'
as $fn$
    select exists (
        select 1 from sesiones_panel s
         where s.token_push = btrim(coalesce(p_token, ''))
           and esta_silenciado(s.user_id)
    ) or exists (
        select 1 from sesiones_unidad u
         where u.token = btrim(coalesce(p_token, ''))
           and esta_silenciado(u.user_id)
    ) or exists (
        select 1 from push_subscriptions ps
         where ps.token = btrim(coalesce(p_token, ''))
           and esta_silenciado(ps.user_id)
    );
$fn$;

-- 4. Destinatarios: la lista deja fuera a los silenciados ----------
-- Mismo contrato que antes (la funcion edge no se entera).
create or replace function destinatarios_push(p_tipo text default null)
returns table (user_id text, token text, notialarm_webhook text, tipo text)
language sql stable security definer set search_path to 'public'
as $fn$
    select distinct on (ps.token) ps.user_id, ps.token, ps.notialarm_webhook, ps.tipo
      from push_subscriptions ps
     where (p_tipo is null or ps.tipo = p_tipo)
       and ps.token is not null
       -- conductor silenciado: su celular no entra a ninguna lista
       and not (ps.tipo = 'conductor' and esta_silenciado(ps.user_id))
       and (
            ps.tipo <> 'jefe'
            or exists (select 1 from sesiones_panel s
                        where s.token_push is not null
                          and s.token_push = ps.token
                          -- jefe silenciado: la sesion existe, pero no recibe
                          and not esta_silenciado(s.user_id))
       )
     order by ps.token;
$fn$;

-- 5. Lista de sesiones abiertas: agrega el estado del switch -------
drop function if exists sesiones_panel_lista(text);
create or replace function sesiones_panel_lista(p_clave_quien text)
returns table (user_id text, rol text, dispositivo text, inicio timestamptz,
               con_token boolean, seccion text, alarma_off boolean)
language sql stable security definer set search_path to 'public'
as $fn$
    select s.user_id, s.rol, s.dispositivo, s.inicio,
           s.token_push is not null,
           (select u.seccion from usuarios u
             where upper(btrim(u.area)) = upper(btrim(s.user_id)) limit 1),
           esta_silenciado(s.user_id)
      from sesiones_panel s
     where puede_liberar(p_clave_quien)
     order by s.inicio;
$fn$;

-- 6. Unidades en turno: idem ---------------------------------------
drop function if exists unidades_en_turno(text);
create or replace function unidades_en_turno(p_clave_quien text)
returns table (unidad text, user_id text, dni text, inicio timestamptz,
               dispositivo text, con_token boolean, alarma_off boolean)
language sql stable security definer set search_path to 'public'
as $fn$
    select s.unidad, s.user_id, s.dni, s.inicio, s.dispositivo,
           s.token is not null,
           esta_silenciado(s.user_id)
      from sesiones_unidad s
     where puede_liberar(p_clave_quien)
     order by s.inicio;
$fn$;

-- 7. Prender / apagar las alarmas de una persona -------------------
create or replace function alternar_alarma(
    p_clave_quien text,
    p_user_id text,
    p_apagar boolean,
    p_tipo text default null
)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $fn$
declare
    v_user text := btrim(coalesce(p_user_id, ''));
    v_quien text;
    v_tipo text := nullif(btrim(coalesce(p_tipo, '')), '');
begin
    if not puede_liberar(p_clave_quien) then
        return jsonb_build_object('ok', false, 'motivo', 'sin_permiso');
    end if;

    if v_user = '' then
        return jsonb_build_object('ok', false, 'motivo', 'sin_usuario');
    end if;

    select user_id into v_quien from sesiones_panel
     where clave = btrim(coalesce(p_clave_quien, '')) limit 1;

    if p_apagar then
        insert into alarmas_silenciadas (clave, user_id, tipo, apagada_en, apagada_por)
        values (norm_persona(v_user), v_user, v_tipo, now(), v_quien)
        on conflict (clave) do update
            set user_id     = excluded.user_id,
                tipo        = coalesce(excluded.tipo, alarmas_silenciadas.tipo),
                apagada_en  = now(),
                apagada_por = excluded.apagada_por;
    else
        delete from alarmas_silenciadas where clave = norm_persona(v_user);
    end if;

    insert into app_log (origen, detalle)
    values ('alarma_mute',
            (case when p_apagar then 'ALARMAS APAGADAS' else 'ALARMAS ACTIVADAS' end)
            || ' - ' || v_user || ' - por ' || coalesce(v_quien, 'desconocido'));

    return jsonb_build_object('ok', true, 'user_id', v_user, 'apagada', p_apagar);
end
$fn$;

-- 8. Permisos ------------------------------------------------------
grant execute on function alternar_alarma(text, text, boolean, text) to anon, authenticated;
grant execute on function sesiones_panel_lista(text) to anon, authenticated;
grant execute on function unidades_en_turno(text) to anon, authenticated;

-- Solo la funcion edge (service_role) consulta estas dos.
revoke execute on function esta_silenciado(text) from public, anon, authenticated;
revoke execute on function token_silenciado(text) from public, anon, authenticated;
revoke execute on function destinatarios_push(text) from anon, authenticated, public;
