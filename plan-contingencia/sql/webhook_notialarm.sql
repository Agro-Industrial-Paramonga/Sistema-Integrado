/* ============================================================
   WEBHOOK DE NOTIALARM (iPhone) POR PERSONA
   ------------------------------------------------------------
   Un jefe o gerente con iPhone no tiene token FCM, así que hasta
   ahora no había fila en push_subscriptions donde colgar su alarma.
   Aquí se le da una fila con token propio ('ios-<hash de la persona>')
   y la URL privada de su NotiAlarm.

   Reglas:
   - Solo Seguridad Industrial (sección exacta) carga o cambia URLs.
   - El webhook va pegado a la PERSONA, no a la sesión: sobrevive al
     cierre de sesión y se vuelve a enganchar solo al entrar.
   - El interruptor verde/rojo sigue mandando: en rojo no suena,
     aunque la URL esté cargada.
   - Si el equipo está apagado (sin sesión viva), no suena.

   Idempotente: se puede volver a ejecutar sin miedo.
   ============================================================ */

-- Estado de la última prueba (para avisar de una URL muerta)
alter table push_subscriptions add column if not exists webhook_estado text;
alter table push_subscriptions add column if not exists webhook_probado_en timestamptz;

/* ------------------------------------------------------------
   1. ¿Quien pregunta pertenece a Seguridad Industrial?
   Sección EXACTA. No entra Gerencia General, ni Seguridad
   Patrimonial, ni jefes de área.
   ------------------------------------------------------------ */
create or replace function public.es_seguridad_industrial(p_clave text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
    select coalesce((
        select upper(btrim(coalesce(u.seccion, ''))) = 'SEGURIDAD INDUSTRIAL'
          from sesiones_panel s
          join usuarios u on upper(btrim(u.area)) = upper(btrim(s.user_id))
         where s.clave = btrim(coalesce(p_clave, ''))
         limit 1
    ), false);
$function$;

/* ------------------------------------------------------------
   2. Token estable por persona para su iPhone
   ------------------------------------------------------------ */
create or replace function public.token_ios(p_user_id text)
returns text
language sql
immutable
as $function$
    select 'ios-' || md5(norm_persona(p_user_id));
$function$;

/* ------------------------------------------------------------
   3. Cargar / cambiar la URL de una persona
   p_clave   = sesión de quien carga (solo para el permiso)
   p_user_id = la persona a la que se le carga (la fila del panel)
   ------------------------------------------------------------ */
drop function if exists public.registrar_webhook_notialarm(text, text);

create or replace function public.registrar_webhook_notialarm(p_clave text, p_user_id text, p_webhook text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_url   text := btrim(coalesce(p_webhook, ''));
    v_clave text := btrim(coalesce(p_clave, ''));
    v_user  text := btrim(coalesce(p_user_id, ''));
    v_rol   text;
    v_tok   text;
begin
    if not es_seguridad_industrial(v_clave) then
        return jsonb_build_object('ok', false, 'motivo', 'sin_permiso');
    end if;

    if v_user = '' then
        return jsonb_build_object('ok', false, 'motivo', 'sin_usuario');
    end if;

    -- El rol se toma del equipo de esa persona si lo tiene abierto;
    -- si no, de su ficha, para seguir la misma regla que el Android.
    select s.rol into v_rol
      from sesiones_panel s
     where upper(btrim(s.user_id)) = upper(btrim(v_user))
     order by s.inicio desc limit 1;

    if v_rol is null then
        select u.rol into v_rol from usuarios u
         where upper(btrim(u.area)) = upper(btrim(v_user)) limit 1;
    end if;

    if v_rol is null then
        return jsonb_build_object('ok', false, 'motivo', 'sin_usuario');
    end if;

    if v_url = '' then
        return jsonb_build_object('ok', false, 'motivo', 'sin_url');
    end if;

    if v_url !~* '^https://' or length(v_url) > 500 then
        return jsonb_build_object('ok', false, 'motivo', 'url_invalida');
    end if;

    v_tok := token_ios(v_user);

    -- Una persona, un iPhone: si cambió de teléfono se reemplaza la URL.
    delete from push_subscriptions
     where token like 'ios-%'
       and token <> v_tok
       and upper(btrim(user_id)) = upper(btrim(v_user));

    update push_subscriptions
       set user_id            = v_user,
           tipo               = 'jefe',
           rol                = v_rol,
           notialarm_webhook  = v_url,
           webhook_estado     = null,
           webhook_probado_en = null,
           created_at         = now()
     where token = v_tok;

    if not found then
        insert into push_subscriptions (user_id, token, tipo, rol, notialarm_webhook)
        values (v_user, v_tok, 'jefe', v_rol, v_url);
    end if;

    -- Se engancha a los equipos DE ESA PERSONA, no al de quien carga.
    -- Si ese equipo ya estaba enganchado a un celular Android, no se le quita:
    -- el webhook suena igual por venir pegado a la persona.
    delete from sesiones_panel
     where token_push = v_tok
       and upper(btrim(user_id)) <> upper(btrim(v_user));

    update sesiones_panel set token_push = v_tok
     where upper(btrim(user_id)) = upper(btrim(v_user))
       and (token_push is null or token_push like 'ios-%');

    insert into app_log (origen, detalle)
    values ('webhook_notialarm', 'URL cargada para ' || v_user || ' por ' || v_clave);

    return jsonb_build_object('ok', true, 'user_id', v_user, 'token', v_tok, 'webhook', v_url);
end
$function$;

/* ------------------------------------------------------------
   4. Quitar la URL de una persona
   ------------------------------------------------------------ */
create or replace function public.quitar_webhook_notialarm(p_clave text, p_user_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_user text := btrim(coalesce(p_user_id, ''));
    v_tok  text;
    v_clave text := btrim(coalesce(p_clave, ''));
begin
    if not es_seguridad_industrial(v_clave) then
        return jsonb_build_object('ok', false, 'motivo', 'sin_permiso');
    end if;

    if v_user = '' then
        return jsonb_build_object('ok', false, 'motivo', 'sin_usuario');
    end if;

    v_tok := token_ios(v_user);

    update sesiones_panel set token_push = null where token_push = v_tok;

    delete from push_subscriptions
     where token like 'ios-%'
       and upper(btrim(user_id)) = upper(btrim(v_user));

    insert into app_log (origen, detalle)
    values ('webhook_notialarm', 'URL quitada a ' || v_user || ' por ' || v_clave);

    return jsonb_build_object('ok', true, 'user_id', v_user);
end
$function$;

/* ------------------------------------------------------------
   5. Dejar constancia de la prueba (sonó / no sonó)
   ------------------------------------------------------------ */
create or replace function public.marcar_webhook_probado(p_token text, p_ok boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare n int;
begin
    update push_subscriptions
       set webhook_estado     = case when p_ok then 'ok' else 'error' end,
           webhook_probado_en = now()
     where token = btrim(coalesce(p_token, ''));
    get diagnostics n = row_count;

    return jsonb_build_object('ok', n > 0);
end
$function$;

/* ------------------------------------------------------------
   6. Destinatarios: el iPhone suena mientras la PERSONA tenga
   sesión abierta, aunque su sesión esté enganchada al Android.
   El resto del comportamiento queda igual.
   ------------------------------------------------------------ */
create or replace function public.destinatarios_push(p_tipo text default null::text)
returns table(user_id text, token text, notialarm_webhook text, tipo text, rol text)
language sql
stable
security definer
set search_path to 'public'
as $function$
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
     order by ps.token;
$function$;

/* ------------------------------------------------------------
   7. La lista del panel devuelve el webhook de cada sesión
   (y si quien mira puede cargarlo)
   ------------------------------------------------------------ */
drop function if exists public.sesiones_panel_lista(text);

create or replace function public.sesiones_panel_lista(p_clave_quien text)
returns table(user_id text, rol text, dispositivo text, inicio timestamp with time zone,
              con_token boolean, seccion text, alarma_off boolean,
              webhook text, webhook_estado text, webhook_probado_en timestamp with time zone,
              webhook_token text, puede_webhook boolean)
language sql
stable
security definer
set search_path to 'public'
as $function$
    select s.user_id, s.rol, s.dispositivo, s.inicio,
           s.token_push is not null,
           (select u.seccion from usuarios u
             where upper(btrim(u.area)) = upper(btrim(s.user_id)) limit 1),
           esta_silenciado(s.user_id),
           w.notialarm_webhook,
           w.webhook_estado,
           w.webhook_probado_en,
           w.token,
           es_seguridad_industrial(p_clave_quien)
      from sesiones_panel s
      left join lateral (
           select ps.notialarm_webhook, ps.webhook_estado, ps.webhook_probado_en, ps.token
             from push_subscriptions ps
            where ps.token like 'ios-%'
              and upper(btrim(ps.user_id)) = upper(btrim(s.user_id))
            order by ps.created_at desc
            limit 1
      ) w on true
     where puede_liberar(p_clave_quien)
     order by s.inicio;
$function$;

/* ------------------------------------------------------------
   8. Al entrar de nuevo, el iPhone se reengancha solo.
   Además, el barrido de suscripciones ya no borra las que
   tienen webhook: si no, se perdería la URL al cerrar sesión.
   ------------------------------------------------------------ */
create or replace function public.abrir_sesion_panel(p_area text, p_password text, p_dispositivo text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    u record;
    v_clave text;
    v_disp text := nullif(btrim(coalesce(p_dispositivo, '')), '');
    v_tok text;
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
    -- Se conservan las que tienen webhook: son de la persona, no del equipo,
    -- y tienen que seguir ahi para cuando vuelva a entrar.
    delete from push_subscriptions ps
     where ps.tipo = 'jefe'
       and ps.token is not null
       and ps.notialarm_webhook is null
       and not exists (select 1 from sesiones_panel s where s.token_push = ps.token);

    -- Si esa persona ya tenia su URL de NotiAlarm, se engancha sola
    v_tok := token_ios(u.area);
    if exists (select 1 from push_subscriptions ps
                where ps.token = v_tok and ps.notialarm_webhook is not null) then
        update sesiones_panel set token_push = v_tok where clave = v_clave;
    end if;

    return jsonb_build_object('ok', true, 'rol', u.rol, 'clave', v_clave,
                              'gerencia_key', u.gerencia_key, 'seccion', u.seccion);
end
$function$;
