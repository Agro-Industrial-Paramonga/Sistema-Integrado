-- ============================================================
--  Orden manual de las medidas "antes"
--  Permite subir/bajar una medida dentro de su segmento.
--  Idempotente: se puede volver a ejecutar sin efectos dobles.
-- ============================================================

alter table public.medidas_antes
    add column if not exists orden integer;

-- Relleno: respeta lo que se veía hasta ahora (id ascendente dentro del segmento).
with ranked as (
    select id,
           row_number() over (partition by segmento_id order by id) - 1 as rn
      from public.medidas_antes
     where orden is null
)
update public.medidas_antes m
   set orden = r.rn
  from ranked r
 where m.id = r.id;

-- Las medidas nuevas entran al final de su segmento, sin tocar el cliente.
create or replace function public.medidas_antes_orden_por_defecto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.orden is null then
        select coalesce(max(orden) + 1, 0)
          into new.orden
          from public.medidas_antes
         where segmento_id is not distinct from new.segmento_id;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_medidas_antes_orden on public.medidas_antes;
create trigger trg_medidas_antes_orden
    before insert on public.medidas_antes
    for each row execute function public.medidas_antes_orden_por_defecto();

create index if not exists medidas_antes_segmento_orden_idx
    on public.medidas_antes (segmento_id, orden);
