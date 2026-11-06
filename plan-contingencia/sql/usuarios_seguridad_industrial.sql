/* ============================================================
   PERSONAL DE SEGURIDAD INDUSTRIAL (6-nov)
   ------------------------------------------------------------
   Cuatro jefes de área más en la sección Seguridad Industrial.
   Con esa sección quedan habilitados para ver Turnos y sesiones,
   liberar unidades/sesiones, apagar alarmas y cargar los webhooks
   de NotiAlarm (es_seguridad_industrial()).

   La clave sigue el patrón del resto: primer apellido + año.
   Se guarda en texto plano, igual que las demás (pendiente de
   pasar a hash en toda la tabla).

   Idempotente: si la persona ya existe, no la duplica.
   ============================================================ */

insert into usuarios (area, password, rol, activo, gerencia_key, seccion)
select v.area, v.password, 'jefe_area', true,
       'GERENCIA LEGAL Y RELACIONES LABORALES', 'Seguridad Industrial'
  from (values
        ('OCHOA BACILIO BETZI JAZMIN',                 'ochoa2026'),
        ('VERGARA BARTOLO TANIA GERALDINE',            'vergara2026'),
        ('VILLAFRANCA ROMERO EDINSON ALEXANDER',       'villafranca2026'),
        ('CAMONES AYALA ANJHELY NAOMI',                'camones2026')
       ) as v(area, password)
 where not exists (
        select 1 from usuarios u
         where upper(btrim(u.area)) = upper(btrim(v.area))
       );
