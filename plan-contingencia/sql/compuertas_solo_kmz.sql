/* ============================================================
   COMPUERTAS: solo las del KMZ "Control Compuertas"
   ------------------------------------------------------------
   Borra las compuertas que se habian agregado y que no estan en
   el KMZ (nombre con prefijo "Compuerta ..."). Quedan las 13 del
   KMZ, que son las unicas que se ven en el mapa.

   Las compuertas antiguas del panel (Huayto, Upaca, Canaval, etc.)
   NO tienen coordenadas y no se tocan: no estan en el mapa.

   Idempotente.
   ============================================================ */

begin;

delete from public.compuertas
 where nombre in (
        'Compuerta Chilcal',
        'Compuerta huarangal',
        'Compuerta pozo lisa 1',
        'Compuerta Tabla Larga',
        'Compuerta Tres compuerta',
        'Compuerta Yeguas - Dren Totoral'
 );

commit;
