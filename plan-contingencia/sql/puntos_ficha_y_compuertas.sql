--  ============================================================
--  FICHAS DE PUNTOS, FOTOS Y COMPUERTAS EN EL MAPA
--  ------------------------------------------------------------
--  1. mapa_puntos gana responsable y equipos (los edita solo Cesar).
--  2. compuertas gana lat/lon para dibujarse en el mapa. El estado
--     (abierta/cerrada) sigue saliendo de la misma tabla, asi el
--     color del icono cambia cuando se declara desde el panel.
--  3. mapa_fotos: fotos de un punto o de una compuerta. El archivo
--     vive en el bucket publico medidas-fotos, bajo mapa/...
--  4. Cuatro compuertas nuevas en las coordenadas indicadas.
--
--  Aplicado en el proyecto bfhfnldqwsrcpsdqpyat el 2026-10-29.
--  ============================================================

alter table mapa_puntos add column if not exists responsable text;
alter table mapa_puntos add column if not exists equipos text;

alter table compuertas add column if not exists lat double precision;
alter table compuertas add column if not exists lon double precision;

create table if not exists mapa_fotos (
    id            uuid primary key default gen_random_uuid(),
    punto_id      uuid references mapa_puntos(id) on delete cascade,
    compuerta_id  bigint references compuertas(id) on delete cascade,
    nombre        text,
    storage_path  text not null,
    subido_por    text,
    creado_en     timestamptz not null default now(),
    check (punto_id is not null or compuerta_id is not null)
);

create index if not exists mapa_fotos_punto_idx on mapa_fotos (punto_id);
create index if not exists mapa_fotos_compuerta_idx on mapa_fotos (compuerta_id);

alter table mapa_fotos enable row level security;

drop policy if exists mapa_fotos_todos on mapa_fotos;
create policy mapa_fotos_todos on mapa_fotos
    for all to public using (true) with check (true);

-- 4. Compuertas nuevas en el mapa --------------------------------
insert into compuertas (administracion, nombre, estado, lat, lon)
values
    ('Administracion 2', 'Compuerta Molle',            'cerrada', -10.674665, -77.782382),
    ('Administracion 2', 'Compuerta Chilcal',          'cerrada', -10.678030, -77.791013),
    ('Administracion 3', 'Compuerta Colorada',         'cerrada', -10.670823, -77.800513),
    ('Administracion 3', 'Compuerta Toma 3 Compuertas','cerrada', -10.669372, -77.802240)
on conflict (administracion, nombre) do nothing;
