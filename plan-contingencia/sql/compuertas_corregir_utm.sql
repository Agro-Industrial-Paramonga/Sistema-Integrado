/* ============================================================
   CORRECCION DE COORDENADAS: UTM 18S -> grados decimales
   ------------------------------------------------------------
   Sintoma: en el mapa desaparecieron compuertas. No se borraron:
   sus campos lat/lon quedaron con coordenadas UTM en metros,
   escritas al reves (lat = Este, lon = Norte). Leaflet trabaja en
   grados y con lat = 197745 no dibuja nada, porque esta fuera de
   rango (-90..90). El filtro del mapa solo miraba "lat is not
   null", asi que las filas pasaban pero no se pintaban.

   Que hace:
   1. Las 5 compuertas del KMZ que se sobreescribieron vuelven a su
      coordenada exacta del KMZ (campo Point del doc.kml).
   2. Las 6 compuertas nuevas se convierten de UTM 18S a grados.
      La conversion se valido antes: al pasar a UTM en grados las 5
      del KMZ se reproduce lo que estaba guardado (diferencias de
      0.4 a 4 m; son puntos movidos a mano, no error de formula).

   Idempotente: solo toca filas que sigan fuera de rango.
   ============================================================ */

begin;

/* --- 1. Las 5 del KMZ: coordenada original -------------------- */
update public.compuertas set lat = -10.55270187797382, lon = -77.76166908027821,
       actualizado_por = 'Correccion UTM a grados', actualizado_en = now()
 where id = 44;

update public.compuertas set lat = -10.57669320234127, lon = -77.76727998795468,
       actualizado_por = 'Correccion UTM a grados', actualizado_en = now()
 where id = 42;

update public.compuertas set lat = -10.57059138375338, lon = -77.76150936316392,
       actualizado_por = 'Correccion UTM a grados', actualizado_en = now()
 where id = 46;

update public.compuertas set lat = -10.66100542027856, lon = -77.80841795405287,
       actualizado_por = 'Correccion UTM a grados', actualizado_en = now()
 where id = 41;

update public.compuertas set lat = -10.67272114656668, lon = -77.79951061521884,
       actualizado_por = 'Correccion UTM a grados', actualizado_en = now()
 where id = 28;

/* --- 2. Las 6 nuevas: UTM 18S convertido a grados ------------ */
update public.compuertas set lat = -10.66957074, lon = -77.80221782,
       actualizado_por = 'Correccion UTM a grados', actualizado_en = now()
 where id = 51 and abs(lat) > 90;

update public.compuertas set lat = -10.65452958, lon = -77.81510494,
       actualizado_por = 'Correccion UTM a grados', actualizado_en = now()
 where id = 52 and abs(lat) > 90;

update public.compuertas set lat = -10.67780292, lon = -77.78583599,
       actualizado_por = 'Correccion UTM a grados', actualizado_en = now()
 where id = 54 and abs(lat) > 90;

update public.compuertas set lat = -10.67372364, lon = -77.79269782,
       actualizado_por = 'Correccion UTM a grados', actualizado_en = now()
 where id = 55 and abs(lat) > 90;

update public.compuertas set lat = -10.64576120, lon = -77.79836597,
       actualizado_por = 'Correccion UTM a grados', actualizado_en = now()
 where id = 56 and abs(lat) > 90;

update public.compuertas set lat = -10.67812889, lon = -77.79147147,
       actualizado_por = 'Correccion UTM a grados', actualizado_en = now()
 where id = 57 and abs(lat) > 90;

commit;
