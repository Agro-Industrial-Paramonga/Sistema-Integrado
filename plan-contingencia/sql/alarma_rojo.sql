/* ============================================================
   ALARMA ROJA — evacuación a todas las unidades + compuertas
   ------------------------------------------------------------
   Se dispara cuando el semáforo queda en ROJO (venga de verde
   o de amarillo). Hace dos cosas, cada una marcada aparte para
   no repetirse dentro de la misma declaración roja:

     1) EVACUACIÓN a todas las unidades en turno (sesiones_unidad).
        Ya no se mira si están dentro de un campo ni a 300 m.
        Pasa por destinatarios_push, así que respeta el switch
        verde/rojo de "Unidades en turno" (sirve para pruebas).

     2) COMPUERTAS: un solo aviso a quien tenga la casilla
        'compuertas' encendida (administradores de campo).

   Se llama desde declarar_semaforo() y además la re-ejecuta el
   cron cada minuto (evacuar_rojo), como red de seguridad.
   Idempotente por declaration: si ya se envió, no repite.
   ============================================================ */

create table if not exists public.alarmas_estado (
    clave text primary key,
    marca timestamptz
);

insert into public.alarmas_estado (clave) values ('evac_auto'), ('compuertas')
on conflict (clave) do nothing;

-- 1. Función que dispara lo que solo existe en rojo ----------
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
    v_evac  int := 0;
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

    -- 1) Evacuación: una llamada por unidad, con su nombre en el título
    select marca into v_marca from public.alarmas_estado where clave = 'evac_auto';

    if v_marca is distinct from v_vig then
        for u in select unidad, user_id from public.sesiones_unidad
                  where coalesce(btrim(unidad), '') <> ''
        loop
            perform net.http_post(
                url := v_url,
                headers := v_head,
                body := jsonb_build_object(
                    'title',  'EVACUACIÓN · ' || u.unidad,
                    'body',   'Evacue de inmediato y diríjase a un lugar seguro.',
                    'tipo',   'conductor',
                    'alarma', 'evac_auto'
                ),
                timeout_milliseconds := 8000
            );

            insert into public.alertas_log (unidad, user_id, resultado, detalle)
            values (u.unidad, u.user_id, 'enviada', 'evacuacion automatica · rojo');

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

    return jsonb_build_object('ok', true, 'unidades', v_evac, 'compuertas', v_comp);
end $$;

-- Nadie la llama desde el navegador: solo declarar_semaforo y el cron.
revoke all on function public.alarmar_rojo() from public;
revoke all on function public.alarmar_rojo() from anon;
revoke all on function public.alarmar_rojo() from authenticated;

-- 2. El cron actual sigue llamando a evacuar_rojo() -------------
--    (misma firma, ahora sin geometría: todas las unidades)
create or replace function public.evacuar_rojo()
returns jsonb
language sql security definer set search_path = public as $$
    select public.alarmar_rojo();
$$;

-- 3. declarar_semaforo: dispara lo rojo al declarar ------------
create or replace function public.declarar_semaforo(p_clave text,
                                                    p_nivel text,
                                                    p_verificado boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    s record;
    v_anterior text;
    v_ahora timestamptz := now();
    c_nombre constant text := 'MELGAR BELMONT JOSE MARIANO';
    c_rol    constant text := 'gerente_general';
begin
    if p_nivel not in ('verde', 'amarillo', 'rojo') then
        return jsonb_build_object('ok', false, 'motivo', 'nivel_invalido');
    end if;

    select sp.user_id, sp.rol, u.seccion into s
      from public.sesiones_panel sp
      left join public.usuarios u on upper(btrim(u.area)) = upper(btrim(sp.user_id))
     where sp.clave = btrim(coalesce(p_clave, ''))
     limit 1;

    if s.user_id is null then
        return jsonb_build_object('ok', false, 'motivo', 'sin_sesion');
    end if;

    if not (coalesce(s.rol, '') in ('gerente_general', 'gerencial_legal')
            or lower(coalesce(s.seccion, '')) like '%seguridad industrial%') then
        return jsonb_build_object('ok', false, 'motivo', 'sin_permiso');
    end if;

    select nivel into v_anterior from public.semaforo_estado where id = 1;

    insert into public.semaforo_estado (id, nivel, motivo, declarado_por, declarado_por_rol,
                                 es_guardia, vigente_desde, actualizado_en, declarado_por_real)
    values (1, p_nivel, null, c_nombre, c_rol, false, v_ahora, v_ahora, s.user_id)
    on conflict (id) do update set
        nivel             = excluded.nivel,
        motivo            = null,
        declarado_por     = excluded.declarado_por,
        declarado_por_rol = excluded.declarado_por_rol,
        es_guardia        = false,
        vigente_desde     = excluded.vigente_desde,
        actualizado_en    = excluded.actualizado_en,
        declarado_por_real = excluded.declarado_por_real;

    insert into public.semaforo_eventos (nivel, nivel_anterior, declarado_por, declarado_por_rol,
                                  es_guardia, verificado, declarado_por_real)
    values (p_nivel, v_anterior, c_nombre, c_rol, false, coalesce(p_verificado, false), s.user_id);

    /* Alarmas que solo existen en rojo. Van en su propio bloque: si el
       envío falla, la declaración del semáforo NO se cae; el cron de cada
       minuto lo vuelve a intentar. */
    begin
        if p_nivel = 'rojo' then
            perform public.alarmar_rojo();
        end if;
    exception when others then
        insert into public.app_log (origen, detalle)
        values ('alarma_rojo_error', left(coalesce(SQLERRM, '?'), 300));
    end;

    return jsonb_build_object('ok', true, 'nivel', p_nivel, 'anterior', v_anterior, 'por', s.user_id);
end $$;
