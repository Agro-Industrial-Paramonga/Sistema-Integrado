/* ============================================================
   destinatarios_push(): devolver la excepcion del iPhone
   ------------------------------------------------------------
   QUE SE ROMPIO
   El 6-nov (webhook_notialarm.sql) la regla era: la fila 'ios-%'
   entra por PERSONA con sesion abierta, no por token_push. Asi el
   iPhone suena aunque esa persona tenga ademas un Android o el
   navegador enganchado a la sesion.

   Al reescribir esta funcion el 12-nov (permisos_usuario.sql) esa
   excepcion se perdio y quedo una sola regla: "un jefe solo recibe
   si alguna sesion viva tiene token_push = su token".

   Como sesiones_panel.token_push es UNA sola columna, la persona
   que abre el portal (y registra su token FCM) pisa el 'ios-...':
   - registrar_token_persona() hace update ... set token_push = <fcm>
     sobre la sesion de ese equipo (permisos_usuario.sql, seccion 9).
   - registrar_webhook_notialarm() solo engancha el 'ios-...' si la
     sesion esta vacia o ya es 'ios-%' (webhook_notialarm.sql, 3).
   Resultado: la fila del iPhone queda sin ninguna sesion que la
   apunte y esta funcion la descarta. Llega el FCM (notificacion del
   navegador) y NO se llama al webhook de NotiAlarm. El boton Probar
   si suena porque manda el POST directo, sin consultar esta lista.

   POR QUE EDSINSON SI FUNCIONABA
   No por diseno: le quedo una sesion vieja de navegador
   (web-mwck7153-x349ezby, 11-nov) que todavia tiene token_push =
   'ios-7e9fee...'. Mientras esa fila exista, la regla vieja se
   cumple por accidente. Se limpia esa sesion y cae en el mismo fallo.

   LA CORRECCION
   Se agrega, sin quitar nada, la rama del iPhone: si el token es
   'ios-%', vale que la PERSONA duena de la fila tenga una sesion
   viva, aunque esa sesion tenga otro token_push.

   No cambia:
   - el switch maestro (esta_silenciado) sigue mandando en rojo;
   - la casilla de la alarma (suscripciones_alarma) sigue filtrando;
   - Android, navegador y conductor siguen igual (por token_push).

   OJO: quien tenga las dos cosas (webhook + token FCM) recibira las
   dos avisos: la notificacion del navegador y la pantalla completa.
   Idempotente: se puede volver a ejecutar sin miedo.
   ============================================================ */

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
                   -- Android: la persona de la sesion viva mas reciente con ese token
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
           -- un jefe recibe si su equipo tiene sesion viva
           and (c.tipo <> 'jefe'
                -- Android / navegador: el token esta enganchado a una sesion
                or exists (select 1 from sesiones_panel s
                            where s.token_push = c.token)
                -- iPhone (NotiAlarm): la fila es de la PERSONA, no del
                -- equipo. Suena si esa persona tiene sesion viva, aunque
                -- su sesion este enganchada al Android o al navegador
                -- (token_push es una sola columna y no puede ser a la vez
                --  'ios-...' y el token FCM).
                or (c.token like 'ios-%'
                    and exists (select 1 from sesiones_panel s
                                 where norm_persona(s.user_id) = norm_persona(c.dueno))))
           -- casilla de esa alarma, mirada en el dueno de la fila
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
