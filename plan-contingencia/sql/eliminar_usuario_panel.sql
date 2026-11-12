/* ------------------------------------------------------------
   ELIMINAR USUARIO DESDE EL PANEL DE PERSONAS
   ------------------------------------------------------------
   Corrige la verificación de permisos: la clave que manda el
   navegador es el hash de `sesiones_panel.clave`, no el id ni el
   `area` de la persona. Se reutiliza `es_seguridad_industrial`,
   igual que `editar_usuario_panel`.

   Además:
     · busca a la persona con `norm_persona` (sin mayúsculas,
       tildes ni espacios de más);
     · impide que alguien se borre a sí mismo;
     · borra la sesión abierta en `sesiones_panel`;
     · deja registro en `app_log`.
   ------------------------------------------------------------ */

create or replace function public.eliminar_usuario_panel(p_clave_quien text,
                                                          p_user_id text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_quien text;
    v_fila  public.usuarios%rowtype;
begin
    -- 1. ¿Quien ejecuta es de Seguridad Industrial?
    if not public.es_seguridad_industrial(p_clave_quien) then
        return json_build_object('ok', false,
            'motivo', 'Tu usuario no tiene la sección de Seguridad Industrial.');
    end if;

    select s.user_id into v_quien
      from public.sesiones_panel s
     where s.clave = btrim(coalesce(p_clave_quien, ''))
     limit 1;

    -- 2. ¿Existe la persona? (comparación tolerante)
    select * into v_fila
      from public.usuarios u
     where public.norm_persona(u.area) = public.norm_persona(p_user_id)
     limit 1;

    if v_fila.area is null then
        return json_build_object('ok', false,
            'motivo', 'El usuario no fue encontrado en la base de datos.');
    end if;

    -- 3. No se puede borrar a sí mismo
    if v_quien is not null
       and public.norm_persona(v_fila.area) = public.norm_persona(v_quien) then
        return json_build_object('ok', false,
            'motivo', 'No puedes eliminar tu propio usuario.');
    end if;

    -- 4. Borrar persona y su sesión abierta
    delete from public.usuarios where area = v_fila.area;

    delete from public.sesiones_panel
     where upper(btrim(user_id)) = upper(btrim(v_fila.area));

    insert into public.app_log (origen, detalle)
    values ('usuario_elimina',
            coalesce(v_quien, '?') || ' | ' || v_fila.area
            || ' | ' || coalesce(v_fila.seccion, '') || ' · ' || coalesce(v_fila.rol, ''));

    return json_build_object('ok', true, 'user_id', v_fila.area);
exception when others then
    return json_build_object('ok', false, 'motivo', SQLERRM);
end $function$;
