-- ============================================================
--  Alarma de medidas: solo jefes y supervisores del area
--  El rol 'area' recibe UNICAMENTE el cambio de semaforo.
--
--  Problema que resuelve: la alarma de una medida se dirige por
--  AREA (userId), y push_subscriptions guarda la seccion, asi que
--  le llegaba a cualquiera con esa seccion, sin mirar el rol.
--  Con la columna `rol`, la funcion edge puede descartar a los
--  de rol 'area' cuando el envio apunta a un area concreta.
--
--  Idempotente: se puede correr varias veces.
--  Proyecto: bfhfnldqwsrcpsdqpyat
-- ============================================================

-- 1) Columna con el rol del dueno del celular
alter table public.push_subscriptions
    add column if not exists rol text;

comment on column public.push_subscriptions.rol is
    'rol del usuario al registrar el token (area, sup_area, jefe_area, gerente_*). '
    'La alarma de medidas no se envia a rol = area.';

-- 2) destinatarios_push ahora devuelve tambien el rol.
--    Cambia la firma de salida, asi que hay que recrearla.
drop function if exists public.destinatarios_push(text);

create function public.destinatarios_push(p_tipo text default null)
returns table(user_id text, token text, notialarm_webhook text, tipo text, rol text)
language sql
stable
security definer
set search_path to 'public'
as $fn$
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
                        where s.token_push is not null
                          and s.token_push = ps.token
                          -- jefe silenciado: la sesion existe, pero no recibe
                          and not esta_silenciado(s.user_id))
       )
     order by ps.token;
$fn$;

grant execute on function public.destinatarios_push(text) to anon, authenticated;

-- 3) Los tokens que ya existen se quedan con rol null:
--    la funcion edge los trata como "no es area", o sea siguen
--    recibiendo igual que antes. Al volver a iniciar sesion en
--    cada celular se completa el rol.
