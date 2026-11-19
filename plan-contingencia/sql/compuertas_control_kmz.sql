/* ============================================================
   COMPUERTAS DEL MAPA = LAS DEL KMZ "Control Compuertas"
   ------------------------------------------------------------
   Reemplaza las compuertas que se veian en el mapa por las 13
   del KMZ entregado (carpetas "Compuertas Pativilca" y "Fortaleza").

   Reglas acordadas:
   - Solo se tocan las compuertas del MAPA. Las 21 restantes del
     panel se quedan como estan, con sus responsables.
   - Tres de las cuatro que habia en el mapa son las mismas del
     KMZ (Molle, Chilcal, Colorada): se reaprovechan sus filas para
     NO perder sus 5 fotos; solo se les corrige nombre y coordenadas.
   - "Compuerta Toma 3 Compuertas" no aparece en el KMZ: se borra
     (con su foto; las FK de fotos y contactos son ON DELETE CASCADE).
   - Las 10 nuevas entran con administracion = 'Administracion 1'
     PROVISIONAL: se cambia desde el mapa (Editar) o desde el panel.
   - Estado inicial 'cerrada', como cualquier compuerta nueva.

   Idempotente: se puede volver a ejecutar sin duplicar nada.
   ============================================================ */

begin;

/* --- 1. Las tres que ya existian y son las mismas del KMZ ----- */
update public.compuertas
   set nombre = 'Molle',
       lat = -10.67346344728205,
       lon = -77.78315887506986,
       actualizado_en = now()
 where id = 26;

update public.compuertas
   set nombre = 'Chilcal',
       lat = -10.67807732722889,
       lon = -77.79154928139565,
       actualizado_en = now()
 where id = 27;

update public.compuertas
   set nombre = 'Colorada',
       lat = -10.67272114656668,
       lon = -77.79951061521884,
       actualizado_en = now()
 where id = 28;

/* --- 2. La que no esta en el KMZ ------------------------------ */
delete from public.compuertas
 where id = 29
   and nombre = 'Compuerta Toma 3 Compuertas';

/* --- 3. Las diez nuevas -------------------------------------- */
insert into public.compuertas (administracion, nombre, estado, lat, lon)
select v.administracion, v.nombre, 'cerrada', v.lat, v.lon
  from (values
        ('Administracion 1', 'Ava Santa María',  -10.64052323848827, -77.65096563408626),
        ('Administracion 1', 'L1 Julquillas',    -10.62247059608649, -77.67657430553773),
        ('Administracion 1', 'L1 Caraqueño',     -10.62279435147353, -77.67675065380361),
        ('Administracion 1', 'San Bernardo',     -10.65807091428522, -77.76666093525255),
        ('Administracion 1', 'Buitron',          -10.67759449811209, -77.78592753004334),
        ('Administracion 1', 'Cruce Huaraz',     -10.66100542027856, -77.80841795405287),
        ('Administracion 1', 'Zanjon',           -10.65680412739513, -77.72466244211863),
        ('Administracion 1', 'Julquillas',       -10.57059138375338, -77.76150936316392),
        ('Administracion 1', 'Caballete',        -10.57669320234127, -77.76727998795468),
        ('Administracion 1', 'Balcon de Judas',  -10.55270187797382, -77.76166908027821)
       ) as v(administracion, nombre, lat, lon)
 where not exists (
        select 1 from public.compuertas c where c.nombre = v.nombre
 );

commit;
