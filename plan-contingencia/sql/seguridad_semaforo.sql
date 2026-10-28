-- ============================================================
-- Semáforo: solo lo cambia quien tiene sesión y rol
-- Ejecutado en el proyecto bfhfnldqwsrcpsdqpyat
--
-- Antes: cualquiera con la clave pública podía escribir en semaforo_estado
-- y declarar ROJO, lo que dispara la evacuación automática a los
-- conductores. Ese era el sabotaje posible.
--
-- Ahora: la escritura directa está cerrada (solo queda lectura pública) y
-- el cambio pasa por declarar_semaforo(), que valida la clave de sesión
-- abierta por el portal y el rol de la persona.
-- ============================================================

alter table semaforo_estado  add column if not exists declarado_por_real text;
alter table semaforo_eventos add column if not exists declarado_por_real text;

create or replace function declarar_semaforo(p_clave text, p_nivel text, p_verificado boolean default false)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $fn$
declare
    s record;
    v_anterior text;
    v_ahora timestamptz := now();
    -- El rótulo que se muestra sigue siendo Gerencia General (pedido del área);
    -- el nombre real de quien declaró queda guardado en declarado_por_real.
    c_nombre constant text := 'MELGAR BELMONT JOSE MARIANO';
    c_rol    constant text := 'gerente_general';
begin
    if p_nivel not in ('verde', 'amarillo', 'rojo') then
        return jsonb_build_object('ok', false, 'motivo', 'nivel_invalido');
    end if;

    select sp.user_id, sp.rol, u.seccion into s
      from sesiones_panel sp
      left join usuarios u on upper(btrim(u.area)) = upper(btrim(sp.user_id))
     where sp.clave = btrim(coalesce(p_clave, ''))
     limit 1;

    if s.user_id is null then
        return jsonb_build_object('ok', false, 'motivo', 'sin_sesion');
    end if;

    if not (coalesce(s.rol, '') in ('gerente_general', 'gerencial_legal')
            or lower(coalesce(s.seccion, '')) like '%seguridad industrial%') then
        return jsonb_build_object('ok', false, 'motivo', 'sin_permiso');
    end if;

    select nivel into v_anterior from semaforo_estado where id = 1;

    insert into semaforo_estado (id, nivel, motivo, declarado_por, declarado_por_rol,
                                 es_guardia, vigente_desde, actualizado_en, declarado_por_real)
    values (1, p_nivel, null, c_nombre, c_rol, false, v_ahora, v_ahora, s.user_id)
    on conflict (id) do update set
        nivel              = excluded.nivel,
        motivo             = null,
        declarado_por      = excluded.declarado_por,
        declarado_por_rol  = excluded.declarado_por_rol,
        es_guardia         = false,
        vigente_desde      = excluded.vigente_desde,
        actualizado_en     = excluded.actualizado_en,
        declarado_por_real = excluded.declarado_por_real;

    insert into semaforo_eventos (nivel, nivel_anterior, declarado_por, declarado_por_rol,
                                  es_guardia, verificado, declarado_por_real)
    values (p_nivel, v_anterior, c_nombre, c_rol, false, coalesce(p_verificado, false), s.user_id);

    return jsonb_build_object('ok', true, 'nivel', p_nivel, 'anterior', v_anterior, 'por', s.user_id);
end
$fn$;

revoke all on function declarar_semaforo(text, text, boolean) from public;
grant execute on function declarar_semaforo(text, text, boolean) to anon, authenticated;

-- Escritura directa cerrada: queda solo la lectura pública
do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies
            where schemaname = 'public'
              and tablename in ('semaforo_estado', 'semaforo_eventos')
              and cmd in ('INSERT', 'UPDATE', 'DELETE')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;
