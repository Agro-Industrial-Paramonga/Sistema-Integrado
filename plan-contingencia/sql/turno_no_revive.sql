--  ============================================================
--  EL TURNO LIBERADO NO REVIVE
--  ------------------------------------------------------------
--  Un turno lo abre solo el conductor desde la pagina de ingreso.
--  El celular puede, como mucho, anotarse como equipo de un turno
--  que YA existe y que quedo sin equipo (turnos abiertos con la
--  version anterior, como RTE-628). Nunca crea ni recupera un turno
--  desde la memoria del telefono: si Seguridad Industrial lo libera,
--  al volver a abrir la app se pide el DNI otra vez.
--
--  Reemplaza el uso de abrir_turno en la adopcion de mapa.js.
--  Aplicado en el proyecto bfhfnldqwsrcpsdqpyat el 2026-10-29.
--  ============================================================

create or replace function adoptar_turno(
    p_unidad text,
    p_user_id text,
    p_dispositivo text
)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $fn$
declare
    v_unidad text := upper(btrim(coalesce(p_unidad, '')));
    v_user   text := upper(btrim(coalesce(p_user_id, '')));
    v_disp   text := nullif(btrim(coalesce(p_dispositivo, '')), '');
    n int := 0;
begin
    if v_unidad = '' or v_user = '' or v_disp is null then
        return jsonb_build_object('ok', false, 'motivo', 'datos');
    end if;

    -- Ata el equipo a un turno abierto que quedo sin equipo.
    -- No inserta: si el turno no existe, no hay nada que adoptar.
    update sesiones_unidad
       set dispositivo = v_disp
     where upper(btrim(unidad)) = v_unidad
       and upper(btrim(user_id)) = v_user
       and dispositivo is null;

    get diagnostics n = row_count;
    return jsonb_build_object('ok', n > 0, 'motivo', case when n > 0 then null else 'sin_turno' end);
end
$fn$;

grant execute on function adoptar_turno(text, text, text) to anon, authenticated;
