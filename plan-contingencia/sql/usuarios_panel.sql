/* ============================================================
   PANEL "USUARIOS Y ALARMAS" — alta y edición de personas
   ------------------------------------------------------------
   Solo Seguridad Industrial (es_seguridad_industrial).
   - crear_usuario_panel  : agrega la persona y sus casillas
   - editar_usuario_panel : cambia sección, rol, gerencia,
                            contraseña o lo da de baja/alta
   La contraseña por defecto es el primer apellido + 2026,
   sin tildes y en minúsculas (DE LA CRUZ -> delacruz2026).
   Idempotente: se puede volver a ejecutar.
   ============================================================ */

create or replace function public.apellido_password(p_nombre text)
returns text
language plpgsql immutable as $$
declare
    t    text[] := string_to_array(upper(btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'))), ' ');
    n    int := coalesce(array_length(t, 1), 0);
    i    int := 1;
    base text := '';
begin
    while i <= n loop
        base := base || t[i];
        -- partículas del apellido: DE LA CRUZ -> delacruz
        if t[i] in ('DE', 'DEL', 'LA', 'LAS', 'LOS', 'LO', 'Y') and i < n then
            i := i + 1;
            continue;
        end if;
        exit;
    end loop;

    base := lower(translate(base, 'ÁÉÍÓÚÜÑ', 'AEIOUUN'));
    return base || '2026';
end $$;

-- Alta desde el panel ----------------------------------------
create or replace function public.crear_usuario_panel(p_clave_quien text,
                                                       p_nombre      text,
                                                       p_seccion     text,
                                                       p_rol         text,
                                                       p_gerencia    text,
                                                       p_password    text default null,
                                                       p_alarmas     text[] default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_nombre  text := upper(btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g')));
    v_seccion text := btrim(coalesce(p_seccion, ''));
    v_rol     text := lower(btrim(coalesce(p_rol, '')));
    v_ger     text := btrim(coalesce(p_gerencia, ''));
    v_pass    text := btrim(coalesce(p_password, ''));
    v_alarma  text;
    v_defecto text[];
    v_quien   text;
begin
    if not public.es_seguridad_industrial(p_clave_quien) then
        return jsonb_build_object('ok', false, 'motivo', 'sin_permiso');
    end if;

    if v_nombre = '' then
        return jsonb_build_object('ok', false, 'motivo', 'sin_nombre');
    end if;

    if exists (select 1 from public.usuarios u
                where public.norm_persona(u.area) = public.norm_persona(v_nombre)) then
        return jsonb_build_object('ok', false, 'motivo', 'ya_existe');
    end if;

    if v_rol not in ('gerente_general', 'gerente_campo', 'gerente_fabrica',
                     'gerencial_legal', 'gdo', 'jefe_area', 'sup_area', 'area') then
        return jsonb_build_object('ok', false, 'motivo', 'rol_invalido');
    end if;

    if v_seccion = '' then
        return jsonb_build_object('ok', false, 'motivo', 'sin_seccion');
    end if;

    if v_ger <> '' and not exists (select 1 from public.usuarios u
                                    where upper(btrim(coalesce(u.gerencia_key, ''))) = upper(v_ger)) then
        return jsonb_build_object('ok', false, 'motivo', 'gerencia_invalida');
    end if;

    if v_pass = '' then
        v_pass := public.apellido_password(v_nombre);
    end if;

    insert into public.usuarios (area, password, rol, activo, gerencia_key, seccion)
    values (v_nombre, v_pass, v_rol, true, nullif(v_ger, ''), v_seccion);

    select s.user_id into v_quien
      from public.sesiones_panel s
     where s.clave = btrim(coalesce(p_clave_quien, ''))
     limit 1;

    -- Casillas: las que vengan del formulario; si no, las del rol
    v_defecto := public.alarmas_por_defecto(v_rol, v_seccion);

    foreach v_alarma in array array['semaforo', 'compuertas', 'medida'] loop
        insert into public.suscripciones_alarma (user_id, alarma, activo, actualizado_en, actualizado_por)
        values (v_nombre,
                v_alarma,
                case when p_alarmas is null
                     then v_alarma = any (v_defecto)
                     else v_alarma = any (p_alarmas)
                end,
                now(),
                coalesce(v_quien, 'panel'))
        on conflict (user_id, alarma) do nothing;
    end loop;

    insert into public.app_log (origen, detalle)
    values ('usuario_alta',
            coalesce(v_quien, '?') || ' | ' || v_nombre || ' | ' || v_rol || ' | ' || v_seccion);

    return jsonb_build_object('ok', true, 'user_id', v_nombre, 'password', v_pass,
                              'alarmas', to_jsonb(case when p_alarmas is null then v_defecto else p_alarmas end));
end $$;

-- Edición desde el panel -------------------------------------
create or replace function public.editar_usuario_panel(p_clave_quien text,
                                                       p_user_id     text,
                                                       p_seccion     text default null,
                                                       p_rol         text default null,
                                                       p_gerencia    text default null,
                                                       p_password    text default null,
                                                       p_activo      boolean default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_rol   text := lower(btrim(coalesce(p_rol, '')));
    v_pass  text := btrim(coalesce(p_password, ''));
    v_ger   text := btrim(coalesce(p_gerencia, ''));
    v_quien text;
    v_fila  public.usuarios%rowtype;
begin
    if not public.es_seguridad_industrial(p_clave_quien) then
        return jsonb_build_object('ok', false, 'motivo', 'sin_permiso');
    end if;

    select * into v_fila
      from public.usuarios u
     where public.norm_persona(u.area) = public.norm_persona(p_user_id)
     limit 1;

    if v_fila.area is null then
        return jsonb_build_object('ok', false, 'motivo', 'no_existe');
    end if;

    if v_rol <> '' and v_rol not in ('gerente_general', 'gerente_campo', 'gerente_fabrica',
                                     'gerencial_legal', 'gdo', 'jefe_area', 'sup_area', 'area') then
        return jsonb_build_object('ok', false, 'motivo', 'rol_invalido');
    end if;

    if v_ger <> '' and not exists (select 1 from public.usuarios u
                                    where upper(btrim(coalesce(u.gerencia_key, ''))) = upper(v_ger)) then
        return jsonb_build_object('ok', false, 'motivo', 'gerencia_invalida');
    end if;

    select s.user_id into v_quien
      from public.sesiones_panel s
     where s.clave = btrim(coalesce(p_clave_quien, ''))
     limit 1;

    update public.usuarios set
        seccion      = coalesce(nullif(btrim(coalesce(p_seccion, '')), ''), seccion),
        rol          = coalesce(nullif(v_rol, ''), rol),
        gerencia_key = coalesce(nullif(v_ger, ''), gerencia_key),
        password     = coalesce(nullif(v_pass, ''), password),
        activo       = coalesce(p_activo, activo)
    where area = v_fila.area;

    insert into public.app_log (origen, detalle)
    values ('usuario_edita', coalesce(v_quien, '?') || ' | ' || v_fila.area);

    return jsonb_build_object('ok', true, 'user_id', v_fila.area);
end $$;
