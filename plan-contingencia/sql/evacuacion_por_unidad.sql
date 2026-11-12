/* ============================================================
   EVACUACIÓN DIRIGIDA A CADA UNIDAD  +  UNIDAD ANTERIOR SE LIBERA
   ------------------------------------------------------------
   Proyecto bfhfnldqwsrcpsdqpyat. Idempotente.

   1) alarmar_rojo(): la evacuación deja de ser una difusión.
      Antes: un envío por unidad, todos al mismo canal de conductores,
      así que el nombre del título no tenía relación con quien lo
      recibía (al conductor de TCV-14 le llegaba "EVACUACIÓN · CF-625").
      Ahora: un solo envío por unidad, dirigido al token de ESA unidad.
      Si la unidad no tiene celular, no se avisa a nadie por ella.

   2) abrir_turno(): el ingreso nuevo manda. Si ese equipo —o esa
      persona— tenía otra unidad abierta, se libera primero (historial
      'reemplazada'), con su ubicación y su suscripción. Se mantiene el
      bloqueo cuando la unidad la tiene OTRA persona ('ocupada').

   3) cerrar_turno() y liberar_unidad(): al cerrar un turno se borra
      solo la suscripción de conductor, no las de portal (jefe). Antes
      se borraban por persona y un conductor que también es jefe se
      quedaba sin alarmas del portal.
   ============================================================ */

-- 1. Evacuación dirigida ---------------------------------------
create or replace function public.alarmar_rojo()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_nivel text;
    v_vig   timestamptz;
    v_marca timestamptz;
    v_url   text := 'https://bfhfnldqwsrcpsdqpyat.supabase.co/functions/v1/send-push-notification';
    v_key   text := 'sb_publishable_z-jW4WrGLq7wEhCI_CW3Ig_vQZwtOMh';
    v_head  jsonb;
    u       record;
    v_token text;
    v_usados text[] := '{}';
    v_evac  int := 0;
    v_sin   int := 0;
    v_comp  int := 0;
    /* Ojo: si cambia el declarador, este texto y el de semaforo.js
       tienen que cambiar juntos. */
    c_texto_compuertas constant text :=
        'José Mariano Melgar Belmont declaró el estado de alerta rojo. '
        'Proceder a abrir las compuertas y cerrar compuertas de acuerdo al plan de emergencia.';
begin
    select nivel, vigente_desde into v_nivel, v_vig
      from public.semaforo_estado where id = 1;

    if v_nivel is distinct from 'rojo' then
        return jsonb_build_object('ok', true, 'motivo', 'no_rojo', 'nivel', v_nivel);
    end if;

    v_head := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', v_key,
        'Authorization', 'Bearer ' || v_key
    );

    /* 1) Evacuación: un envío por unidad, SOLO al celular de esa unidad.
          El token se busca en la suscripción de conductor de esa unidad;
          si no está, en la del conductor de esa persona; y de última en
          el token que quedó guardado al abrir el turno. */
    select marca into v_marca from public.alarmas_estado where clave = 'evac_auto';

    if v_marca is distinct from v_vig then
        for u in
            select s.unidad,
                   s.user_id,
                   coalesce(
                       (select p.token from public.push_subscriptions p
                         where p.tipo = 'conductor'
                           and upper(btrim(coalesce(p.unidad, ''))) = upper(btrim(s.unidad))
                         order by p.created_at desc nulls last
                         limit 1),
                       (select p.token from public.push_subscriptions p
                         where p.tipo = 'conductor'
                           and public.norm_persona(p.user_id) = public.norm_persona(s.user_id)
                         order by p.created_at desc nulls last
                         limit 1),
                       nullif(btrim(coalesce(s.token, '')), '')
                   ) as token
              from public.sesiones_unidad s
             where coalesce(btrim(s.unidad), '') <> ''
             order by s.inicio
        loop
            v_token := nullif(btrim(coalesce(u.token, '')), '');

            if v_token is null then
                insert into public.alertas_log (unidad, user_id, resultado, detalle)
                values (u.unidad, u.user_id, 'sin_token',
                        'evacuacion por unidad: la unidad no tiene celular registrado');
                v_sin := v_sin + 1;
                continue;
            end if;

            -- Un celular no recibe dos veces la misma evacuación
            if v_token = any(v_usados) then
                insert into public.alertas_log (unidad, user_id, token, resultado, detalle)
                values (u.unidad, u.user_id, left(v_token, 20), 'omitida',
                        'evacuacion por unidad: ese celular ya fue avisado');
                continue;
            end if;

            v_usados := v_usados || v_token;

            perform net.http_post(
                url := v_url,
                headers := v_head,
                body := jsonb_build_object(
                    'title',  'EVACUACIÓN · ' || u.unidad,
                    'body',   'Evacue de inmediato y diríjase a un lugar seguro.',
                    'token',  v_token,
                    'tipo',   'conductor',
                    'alarma', 'evac_auto'
                ),
                timeout_milliseconds := 8000
            );

            insert into public.alertas_log (unidad, user_id, token, resultado, detalle)
            values (u.unidad, u.user_id, left(v_token, 20), 'enviada',
                    'evacuacion automatica · rojo · solo esa unidad');

            v_evac := v_evac + 1;
        end loop;

        update public.alarmas_estado set marca = v_vig where clave = 'evac_auto';
    end if;

    -- 2) Compuertas: un solo aviso, la base decide quién lo recibe
    select marca into v_marca from public.alarmas_estado where clave = 'compuertas';

    if v_marca is distinct from v_vig then
        perform net.http_post(
            url := v_url,
            headers := v_head,
            body := jsonb_build_object(
                'title',       'ALERTA ROJA · COMPUERTAS',
                'body',        c_texto_compuertas,
                'tipo',        'jefe',
                'alarma',      'compuertas',
                'soloCuerpo',  true
            ),
            timeout_milliseconds := 8000
        );

        update public.alarmas_estado set marca = v_vig where clave = 'compuertas';
        v_comp := 1;
    end if;

    return jsonb_build_object('ok', true, 'unidades', v_evac,
                              'sin_token', v_sin, 'compuertas', v_comp);
end $$;

-- Nadie la llama desde el navegador: solo declarar_semaforo y el cron.
revoke all on function public.alarmar_rojo() from public;
revoke all on function public.alarmar_rojo() from anon;
revoke all on function public.alarmar_rojo() from authenticated;

create or replace function public.evacuar_rojo()
returns jsonb
language sql security definer set search_path = public as $$
    select public.alarmar_rojo();
$$;

-- 2. Abrir turno: la unidad nueva reemplaza a la anterior ------
create or replace function public.abrir_turno(
    p_unidad text,
    p_user_id text,
    p_dni text,
    p_dispositivo text,
    p_token text default null
)
returns jsonb
language plpgsql security definer set search_path = 'public'
as $fn$
declare
    v_unidad text := btrim(coalesce(p_unidad, ''));
    v_user   text := btrim(coalesce(p_user_id, ''));
    v_disp   text := nullif(btrim(coalesce(p_dispositivo, '')), '');
    v_token  text := nullif(btrim(coalesce(p_token, '')), '');
    r        record;
    v_lib    int := 0;
begin
    if v_unidad = '' or v_user = '' or v_disp is null then
        return jsonb_build_object('ok', false, 'motivo', 'datos');
    end if;

    -- La unidad esta tomada por OTRA persona: no se toca.
    select unidad, user_id into r
      from public.sesiones_unidad
     where upper(btrim(unidad)) = upper(v_unidad)
     limit 1;

    if r.unidad is not null
       and public.norm_persona(r.user_id) <> public.norm_persona(v_user) then
        return jsonb_build_object('ok', false, 'motivo', 'ocupada', 'user_id', r.user_id);
    end if;

    /* El ingreso nuevo manda: cualquier unidad anterior de este equipo o
       de esta persona se libera antes de abrir la nueva. Asi no queda una
       unidad vieja registrada cuando se vuelve a entrar con otra. */
    for r in
        select * from public.sesiones_unidad s
         where upper(btrim(s.unidad)) <> upper(v_unidad)
           and ( s.dispositivo = v_disp
                 or public.norm_persona(s.user_id) = public.norm_persona(v_user) )
         order by s.inicio
    loop
        insert into public.sesiones_historial (tipo, user_id, unidad, dispositivo, inicio, motivo, liberada_por)
        values ('conductor', r.user_id, r.unidad, r.dispositivo, r.inicio, 'reemplazada', v_user);

        delete from public.ubicaciones
         where upper(btrim(coalesce(unidad, ''))) = upper(btrim(r.unidad));

        -- Solo la suscripcion de conductor de esa unidad: la de portal sigue viva
        delete from public.push_subscriptions
         where tipo = 'conductor'
           and upper(btrim(coalesce(unidad, ''))) = upper(btrim(r.unidad));

        delete from public.sesiones_unidad where unidad = r.unidad;
        v_lib := v_lib + 1;
    end loop;

    insert into public.sesiones_unidad (unidad, user_id, token, inicio, dni, dispositivo)
    values (v_unidad, v_user, v_token, now(),
            nullif(btrim(coalesce(p_dni, '')), ''), v_disp)
    on conflict (unidad) do update
        set user_id = excluded.user_id,
            token   = coalesce(excluded.token, public.sesiones_unidad.token),
            dni     = coalesce(excluded.dni, public.sesiones_unidad.dni),
            dispositivo = excluded.dispositivo;

    return jsonb_build_object('ok', true, 'unidad', v_unidad, 'liberadas', v_lib);
end
$fn$;

-- 3. Cerrar turno: no se lleva por delante las alarmas del portal --
create or replace function public.cerrar_turno(
    p_unidad text,
    p_dispositivo text default null
)
returns jsonb
language plpgsql security definer set search_path = 'public'
as $fn$
declare
    v_unidad text := nullif(btrim(coalesce(p_unidad, '')), '');
    v_disp   text := nullif(btrim(coalesce(p_dispositivo, '')), '');
    r record;
    n int := 0;
begin
    for r in
        select * from public.sesiones_unidad
         where (v_disp is not null and dispositivo = v_disp)
            or (v_unidad is not null and upper(btrim(unidad)) = upper(v_unidad))
         order by inicio
    loop
        insert into public.sesiones_historial (tipo, user_id, unidad, dispositivo, inicio, motivo)
        values ('conductor', r.user_id, r.unidad, r.dispositivo, r.inicio, 'cerrada');

        delete from public.ubicaciones
         where upper(btrim(user_id)) = upper(btrim(r.user_id))
            or upper(btrim(coalesce(unidad, ''))) = upper(btrim(r.unidad));

        delete from public.push_subscriptions
         where tipo = 'conductor'
           and ( upper(btrim(user_id)) = upper(btrim(r.user_id))
                 or upper(btrim(coalesce(unidad, ''))) = upper(btrim(r.unidad)) );

        delete from public.sesiones_unidad where unidad = r.unidad;
        n := n + 1;
    end loop;

    return jsonb_build_object('ok', true, 'cerradas', n);
end
$fn$;

-- 4. Liberación forzada: misma limpieza -------------------------
create or replace function public.liberar_unidad(p_clave_quien text, p_unidad text)
returns jsonb
language plpgsql security definer set search_path = 'public'
as $fn$
declare
    v_unidad text := nullif(btrim(coalesce(p_unidad, '')), '');
    v_quien  text;
    r record;
    n int := 0;
begin
    if not public.puede_liberar(p_clave_quien) then
        return jsonb_build_object('ok', false, 'motivo', 'sin_permiso');
    end if;

    select user_id into v_quien from public.sesiones_panel
     where clave = btrim(coalesce(p_clave_quien, '')) limit 1;

    if v_unidad is null then
        return jsonb_build_object('ok', false, 'motivo', 'sin_unidad');
    end if;

    for r in select * from public.sesiones_unidad
              where upper(btrim(unidad)) = upper(v_unidad)
    loop
        insert into public.sesiones_historial (tipo, user_id, unidad, dispositivo, inicio, motivo, liberada_por)
        values ('conductor', r.user_id, r.unidad, r.dispositivo, r.inicio, 'forzada', v_quien);

        delete from public.ubicaciones
         where upper(btrim(user_id)) = upper(btrim(r.user_id))
            or upper(btrim(coalesce(unidad, ''))) = upper(btrim(r.unidad));

        delete from public.push_subscriptions
         where tipo = 'conductor'
           and ( upper(btrim(user_id)) = upper(btrim(r.user_id))
                 or upper(btrim(coalesce(unidad, ''))) = upper(btrim(r.unidad)) );

        delete from public.sesiones_unidad where unidad = r.unidad;
        n := n + 1;
    end loop;

    return jsonb_build_object('ok', true, 'liberadas', n);
end
$fn$;

-- 5. Permisos ---------------------------------------------------
grant execute on function public.abrir_turno(text, text, text, text, text) to anon, authenticated;
grant execute on function public.cerrar_turno(text, text) to anon, authenticated;
grant execute on function public.liberar_unidad(text, text) to anon, authenticated;

-- evacuar_rojo lo llama solo el cron (postgres); no se expone al navegador.
revoke all on function public.evacuar_rojo() from public;
revoke all on function public.evacuar_rojo() from anon;
revoke all on function public.evacuar_rojo() from authenticated;

/* Deja constancia de lo aplicado. */
insert into public.app_log (origen, detalle)
values ('sql', 'evacuacion_por_unidad aplicado: evacuacion dirigida por token, abrir_turno libera la unidad anterior');
