# Inventario de la base actual — Sistema Integrado SST

- **Proyecto:** Sistema Integrado (Plan de Contingencia + Hallazgos) — Agro Industrial Paramonga
- **Documento:** paso 2 del Manual 2, *"Cómo migrar el Sistema Integrado a nuestro estándar"*
- **Fecha:** 2026-11-09
- **Estado:** inventario de lo que existe hoy. Solo lectura: no se modificó nada en la base ni en el repositorio.

## 0. De dónde sale este inventario

**Fuentes (solo estas):**

1. Los CSV de `migracion/supabase/`, 8 por proyecto: `columns`, `constraints`, `indexes`, `functions`, `triggers`, `policies`, `buckets`, `rowcount`.
2. Los 13 `.sql` de `plan-contingencia/sql/`.
3. El código JavaScript de `plan-contingencia/`, `hallazgos/`, `scripts/` y `supabase/functions/`, solo para saber qué pantalla usa cada tabla y cada función.

**Cómo se obtuvieron los CSV:** se ejecutaron las 8 consultas del paso 1 del manual, en modo lectura, contra los dos proyectos de Supabase:

| Proyecto | Ref del proyecto | Tablas |
|---|---|---|
| Contingencia | `bfhfnldqwsrcpsdqpyat` | 29 |
| Hallazgos | `bfwyedbiguytlrooiglj` | 9 |

El primer export manual de Contingencia venía cortado en 100 filas (le faltaban las columnas de 13 tablas); se rehizo completo. Los números de este documento salen de ese export completo.

**Reglas que se respetaron:** no se inventó ninguna columna, tabla ni regla — lo que no se pudo saber está en la sección 8. No se copiaron contraseñas, llaves ni datos personales: donde el código tiene una credencial dice `AQUI HAY UNA CREDENCIAL`.

## 1. Resumen

| | Contingencia | Hallazgos | Total |
|---|---|---|---|
| Tablas | 29 | 9 | **38** |
| Columnas | 207 | 83 | **290** |
| Funciones RPC | 32 | 5 | **37** |
| Triggers | 2 (3 eventos) | 0 | **2** |
| Políticas RLS | 47 | 27 | **74** |
| Buckets de archivos | 1 | 3 | **4** |
| Filas aproximadas | ~4 249 | ~3 767 | **~8 016** |

El volumen es pequeño y la carga de datos no va a ser el problema: el 39 % de las filas de Contingencia están en `app_log` (3 150), un registro técnico, y el 66 % de Hallazgos está en `hallazgos` (2 491). El trabajo está en la forma, no en el tamaño.

**Son dos aplicaciones distintas**, cada una con su login y sus tablas, en un mismo repositorio:

- **Plan de Contingencia** — web de escritorio + APK para conductores. Login propio contra `usuarios` (área + contraseña); sesiones en `sesiones_panel` y `sesiones_unidad`.
- **Hallazgos** — web de escritorio. Login propio contra `gerencias_acceso` (nombre + contraseña) vía `validar_acceso`; además usa Supabase Auth en `is_admin()`.

No comparten **ninguna** tabla.

---

## 2. Las tablas, una por una

Convenciones:

- 🟦 Contingencia · 🟧 Hallazgos
- *Archivos*: se nombran solo las rutas fuente. `app/www/...` es la copia empaquetada para el APK (Capacitor) y `app/android/.../assets/...` es el build; ambos son copias de `plan-contingencia/` y `hallazgos/` y no se listan.
- *Filas*: `n_live_tup`, aproximado.

---

### 2.1 Contingencia (29 tablas)

#### 🟦 `alarmas_silenciadas` · 36 filas

**Para qué sirve:** guarda a qué personas se les silenció la alarma push. Una fila = una persona con la alarma apagada.
**PK:** `clave` text — sin default: es el código de negocio.
**FK:** ninguna.
**Llave natural:** `clave` = `norm_persona(user_id)`, o sea el nombre normalizado en mayúsculas. Es la llave de negocio real.
**Borrado:** físico (`delete` dentro de `alternar_alarma`).
**Realtime:** no.
**Archivos:** no se consulta desde el JS; solo a través de `alternar_alarma`, `esta_silenciado`, `token_silenciado`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `clave` | text | NO | — |
| 2 | `user_id` | text | NO | — |
| 3 | `tipo` | text | sí | — |
| 4 | `apagada_en` | timestamptz | NO | `now()` |
| 5 | `apagada_por` | text | sí | — |

#### 🟦 `alertas_log` · 80 filas

**Para qué sirve:** bitácora de las notificaciones push de evacuación enviadas.
**PK:** `id` bigint — secuencia (`nextval`).
**FK:** ninguna.
**Llave natural:** ninguna → **SIN LLAVE NATURAL**.
**Borrado:** nadie borra (solo inserta `evacuar_rojo` y `mapa.js`).
**Realtime:** no.
**Archivos:** escribe `mapa.js`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | bigint | NO | `nextval('alertas_log_id_seq'::regclass)` |
| 2 | `unidad` | text | sí | — |
| 3 | `user_id` | text | sí | — |
| 4 | `token` | text | sí | — |
| 5 | `resultado` | text | sí | — |
| 6 | `detalle` | text | sí | — |
| 7 | `creado_en` | timestamptz | NO | `now()` |

#### 🟦 `app_log` · 3177 filas

**Para qué sirve:** registro técnico de la app (acciones de alarma, webhook, conductor). Es la tabla más grande del sistema y **no es dato de negocio**.
**PK:** `id` bigint — secuencia (`nextval`).
**FK:** ninguna.
**Llave natural:** **SIN LLAVE NATURAL**.
**Borrado:** nadie borra.
**Realtime:** no.
**Archivos:** escribe `conductor.js`; también escriben `alternar_alarma`, `registrar_webhook_notialarm`, `quitar_webhook_notialarm`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | bigint | NO | `nextval('app_log_id_seq'::regclass)` |
| 2 | `origen` | text | sí | — |
| 3 | `detalle` | text | sí | — |
| 4 | `creado_en` | timestamptz | NO | `now()` |

> **Ojo:** El manual pide preguntar a TI si se conserva. **PREGUNTA 13.**

#### 🟦 `campos_anillos` · 46 filas

**Para qué sirve:** polígonos (anillos) que delimitan las áreas de la planta, usados para decidir si una unidad está dentro del área a evacuar.
**PK:** `id` integer — secuencia (`nextval`).
**FK:** ninguna.
**Llave natural:** `campo` (nombre del campo). **No está declarado único** en la base.
**Borrado:** nadie borra desde el código.
**Realtime:** no.
**Archivos:** lo lee `evacuar_rojo` (RPC). No hay consulta directa desde el JS.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | integer | NO | `nextval('campos_anillos_id_seq'::regclass)` |
| 2 | `campo` | text | sí | — |
| 3 | `anillo` | jsonb | NO | — |

> **Ojo:** `anillo` es un arreglo de pares `[lat, lon]`. En Oracle no puede quedar como `jsonb`. **PREGUNTA 6.**

#### 🟦 `compuertas` · 24 filas

**Para qué sirve:** catálogo de compuertas de la planta, con su estado (cerrada/abierta) y ubicación.
**PK:** `id` bigint — secuencia (`nextval`).
**FK:** ninguna.
**Único:** (administracion, nombre).
**Llave natural:** `administracion` + `nombre`.
**Borrado:** **físico** (`compuertas.js` hace `delete`).
**Realtime:** no.
**Archivos:** leen `compuertas.js`, `mapa.js`, `semaforo.js`; escribe `compuertas.js`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | bigint | NO | `nextval('compuertas_id_seq'::regclass)` |
| 2 | `administracion` | text | NO | — |
| 3 | `nombre` | text | NO | — |
| 4 | `estado` | text | NO | `'cerrada'::text` |
| 5 | `actualizado_por` | text | sí | — |
| 6 | `actualizado_en` | timestamptz | NO | `now()` |
| 7 | `lat` | double precision | sí | — |
| 8 | `lon` | double precision | sí | — |

> **Ojo:** `estado` es texto sin check (**PREGUNTA 5**). Se borra físicamente desde el código.

#### 🟦 `compuertas_contactos` · 120 filas

**Para qué sirve:** personas de contacto por compuerta (a quién llamar).
**PK:** `id` bigint — **IDENTITY**.
**FK:** `compuerta_id` → `compuertas(id)` ON DELETE CASCADE.
**Llave natural:** `compuerta_id` + `nombre`.
**Borrado:** **físico**.
**Realtime:** no.
**Archivos:** leen `compuertas.js`, `semaforo.js`; escribe `compuertas.js`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | bigint | NO | IDENTITY (by default) |
| 2 | `compuerta_id` | bigint | NO | — |
| 3 | `nombre` | text | NO | — |
| 4 | `cargo` | text | sí | — |
| 5 | `telefono` | text | NO | — |
| 6 | `creado_en` | timestamptz | NO | `now()` |

> **Ojo:** `telefono` es dato personal. **PREGUNTA 20.**

#### 🟦 `conductores` · 96 filas

**Para qué sirve:** catálogo de conductores que pueden abrir turno desde la APK.
**PK:** `id` uuid — uuid aleatorio (`gen_random_uuid()`).
**FK:** ninguna.
**Único:** (nombre).
**Llave natural:** `nombre`. (`dni` sería mejor llave, pero tiene nulos y no es único en la base.)
**Borrado:** nadie borra desde el código.
**Realtime:** no.
**Archivos:** lee `conductor.js`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `nombre` | text | NO | — |
| 3 | `dni` | text | sí | — |
| 4 | `activo` | boolean | NO | `true` |
| 5 | `creado_en` | timestamptz | NO | `now()` |

> **Ojo:** `dni` es dato personal sensible. **PREGUNTA 20.**

#### 🟦 `evac_estado` · 1 filas

**Para qué sirve:** marca de la última evacuación enviada, para no repetirla en el mismo evento de semáforo rojo.
**PK:** `id` integer — sin default: es el código de negocio.
**FK:** ninguna.
**Llave natural:** **SIN LLAVE NATURAL** (es una fila de estado).
**Borrado:** nadie borra.
**Realtime:** no.
**Archivos:** —.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | integer | NO | `1` |
| 2 | `vigente_desde` | timestamptz | sí | — |

#### 🟦 `historial` · 76 filas

**Para qué sirve:** bitácora de cambios de las medidas (quién cambió qué y en qué tabla).
**PK:** `id` uuid — uuid aleatorio (`gen_random_uuid()`).
**FK:** ninguna.
**Llave natural:** **SIN LLAVE NATURAL**.
**Borrado:** nadie borra.
**Realtime:** no.
**Archivos:** lee y escribe `script.js`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `area` | text | NO | — |
| 3 | `accion` | text | NO | — |
| 4 | `tabla` | text | NO | — |
| 5 | `medida_id` | text | sí | — |
| 6 | `detalle` | text | sí | — |
| 7 | `created_at` | timestamptz | sí | `now()` |

> **Ojo:** `tabla` + `medida_id` son una referencia **polimórfica** en texto: apuntan a `medidas_antes`, `medidas_durante` o `medidas_despues`. No hay FK posible. **PREGUNTA 18.**

#### 🟦 `imagenes_medidas` · 0 filas

**Para qué sirve:** fotos asociadas a una medida (antes/durante/después).
**PK:** `id` uuid — uuid aleatorio (`gen_random_uuid()`).
**FK:** ninguna.
**Llave natural:** `storage_path` (la ruta del archivo es única de hecho, pero no está declarada).
**Borrado:** **físico** (`script.js` borra).
**Realtime:** **sí** — `script.js` escucha cambios en esta tabla y recarga la galería.
**Archivos:** lee y escribe `script.js`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `medida_id` | text | NO | — |
| 3 | `tabla` | text | NO | — |
| 4 | `nombre` | text | NO | — |
| 5 | `storage_path` | text | NO | — |
| 6 | `area` | text | NO | — |
| 7 | `created_at` | timestamptz | sí | `now()` |

#### 🟦 `mapa_capa` · 2 filas

**Para qué sirve:** encuadre y opacidad de la capa (imagen/plano) del mapa.
**PK:** `id` integer — sin default: es el código de negocio.
**FK:** ninguna.
**Llave natural:** **SIN LLAVE NATURAL**.
**Borrado:** nadie borra.
**Realtime:** no.
**Archivos:** lee y escribe `mapa.js`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | integer | NO | `1` |
| 2 | `norte` | double precision | NO | — |
| 3 | `sur` | double precision | NO | — |
| 4 | `este` | double precision | NO | — |
| 5 | `oeste` | double precision | NO | — |
| 6 | `opacidad` | real | NO | `0.55` |
| 7 | `actualizado_en` | timestamptz | NO | `now()` |
| 8 | `nombre` | text | sí | — |

#### 🟦 `mapa_fotos` · 25 filas

**Para qué sirve:** fotos pegadas a un punto del mapa o a una compuerta.
**PK:** `id` uuid — uuid aleatorio (`gen_random_uuid()`).
**FK:** `compuerta_id` → `compuertas(id)` ON DELETE CASCADE; `punto_id` → `mapa_puntos(id)` ON DELETE CASCADE.
**Check:** CHECK (((punto_id IS NOT NULL) OR (compuerta_id IS NOT NULL))).
**Llave natural:** `storage_path`.
**Borrado:** **físico**.
**Realtime:** no.
**Archivos:** lee y escribe `mapa.js`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `punto_id` | uuid | sí | — |
| 3 | `compuerta_id` | bigint | sí | — |
| 4 | `nombre` | text | sí | — |
| 5 | `storage_path` | text | NO | — |
| 6 | `subido_por` | text | sí | — |
| 7 | `creado_en` | timestamptz | NO | `now()` |

#### 🟦 `mapa_lineas` · 16 filas

**Para qué sirve:** líneas y rutas dibujadas sobre el mapa (rutas de evacuación, límites).
**PK:** `id` uuid — uuid aleatorio (`gen_random_uuid()`).
**FK:** ninguna.
**Llave natural:** `nombre` (no declarado único).
**Borrado:** **físico**.
**Realtime:** no.
**Archivos:** lee y escribe `mapa.js`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `nombre` | text | sí | — |
| 3 | `color` | text | sí | `'#dc2626'::text` |
| 4 | `coords` | jsonb | NO | — |
| 5 | `creado_en` | timestamptz | NO | `now()` |
| 6 | `grosor` | integer | NO | `8` |
| 7 | `tipo` | text | NO | `'linea'::text` |
| 8 | `ambito` | text | NO | `'criticos'::text` |

#### 🟦 `mapa_maquinas` · 0 filas

**Para qué sirve:** posición de maquinaria/unidades sobre el mapa.
**PK:** `id` uuid — uuid aleatorio (`gen_random_uuid()`).
**FK:** ninguna.
**Único:** (unidad).
**Llave natural:** `unidad`.
**Borrado:** **físico**.
**Realtime:** no.
**Archivos:** lee y escribe `mapa.js`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `unidad` | text | NO | — |
| 3 | `lat` | double precision | NO | — |
| 4 | `lon` | double precision | NO | — |
| 5 | `punto_orden` | integer | sí | — |
| 6 | `tamano` | integer | NO | `40` |
| 7 | `actualizado_en` | timestamptz | NO | `now()` |

#### 🟦 `mapa_puntos` · 8 filas

**Para qué sirve:** puntos de interés del mapa (puntos de reunión, zonas).
**PK:** `id` uuid — uuid aleatorio (`gen_random_uuid()`).
**FK:** ninguna.
**Llave natural:** `nombre` (no declarado único).
**Borrado:** **físico**.
**Realtime:** no.
**Archivos:** lee y escribe `mapa.js`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `nombre` | text | sí | — |
| 3 | `lat` | double precision | NO | — |
| 4 | `lon` | double precision | NO | — |
| 5 | `orden` | integer | NO | `1` |
| 6 | `color` | text | sí | `'#facc15'::text` |
| 7 | `creado_en` | timestamptz | NO | `now()` |
| 8 | `tipo` | text | NO | `'punto'::text` |
| 9 | `responsable` | text | sí | — |
| 10 | `equipos` | text | sí | — |

#### 🟦 `medidas_antes` · 87 filas

**Para qué sirve:** medidas de contingencia de la etapa "antes" (actividad, periodo, área, costo, estado).
**PK:** `id` text — sin default: es el código de negocio.
**FK:** `segmento_id` → `segmentos(id)` ON DELETE SET NULL.
**Check:** CHECK ((estado = ANY (ARRAY['no-iniciado'::text, 'en-ejecucion'::text, 'finalizado'::text]))).
**Llave natural:** `id` (código de negocio).
**Borrado:** nadie borra desde el código.
**Realtime:** **sí** — `script.js` escucha esta tabla.
**Archivos:** lee y escribe `script.js`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | text | NO | — |
| 2 | `actividad` | text | NO | — |
| 3 | `periodo` | text | sí | — |
| 4 | `area` | text | sí | — |
| 5 | `costo` | text | sí | `''::text` |
| 6 | `estado` | text | NO | `'no-iniciado'::text` |
| 7 | `updated_at` | timestamptz | sí | `now()` |
| 8 | `segmento_id` | uuid | sí | — |
| 9 | `orden` | integer | sí | — |

#### 🟦 `medidas_avances` · 20 filas

**Para qué sirve:** avances registrados sobre una medida (porcentaje, comentario, fecha).
**PK:** `id` uuid — uuid aleatorio (`gen_random_uuid()`).
**FK:** ninguna.
**Llave natural:** **SIN LLAVE NATURAL** declarada. El avance se identifica por (`tabla`, `medida_id`) + fecha.
**Borrado:** **físico** (`script.js` borra).
**Realtime:** no.
**Archivos:** lee y escribe `script.js`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `tabla` | text | NO | — |
| 3 | `medida_id` | text | NO | — |
| 4 | `texto` | text | NO | — |
| 5 | `autor` | text | sí | — |
| 6 | `created_at` | timestamptz | NO | `now()` |
| 7 | `updated_at` | timestamptz | sí | — |

> **Ojo:** `tabla` + `medida_id` repiten el patrón polimórfico. **PREGUNTA 18.**

#### 🟦 `medidas_despues` · 0 filas

**Para qué sirve:** medidas de la etapa "después".
**PK:** `id` text — sin default: es el código de negocio.
**FK:** `segmento_id` → `segmentos(id)` ON DELETE SET NULL.
**Check:** CHECK ((estado = ANY (ARRAY['no-iniciado'::text, 'en-ejecucion'::text, 'finalizado'::text]))).
**Llave natural:** `id` (código de negocio).
**Borrado:** —.
**Realtime:** **sí**.
**Archivos:** lee y escribe `script.js`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | text | NO | — |
| 2 | `actividad` | text | NO | — |
| 3 | `periodo` | text | sí | — |
| 4 | `area` | text | sí | — |
| 5 | `costo` | text | sí | `''::text` |
| 6 | `estado` | text | NO | `'no-iniciado'::text` |
| 7 | `updated_at` | timestamptz | sí | `now()` |
| 8 | `segmento_id` | uuid | sí | — |

#### 🟦 `medidas_durante` · 8 filas

**Para qué sirve:** medidas de la etapa "durante".
**PK:** `id` text — sin default: es el código de negocio.
**FK:** `segmento_id` → `segmentos(id)` ON DELETE SET NULL.
**Check:** CHECK ((estado = ANY (ARRAY['bloqueado'::text, 'iniciado'::text, 'en-ejecucion'::text, 'finalizado'::text]))).
**Llave natural:** `id` (código de negocio).
**Borrado:** —.
**Realtime:** **sí**.
**Archivos:** lee y escribe `script.js`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | text | NO | — |
| 2 | `actividad` | text | NO | — |
| 3 | `periodo` | text | sí | — |
| 4 | `area` | text | sí | — |
| 5 | `costo` | text | sí | `''::text` |
| 6 | `estado` | text | NO | `'bloqueado'::text` |
| 7 | `updated_at` | timestamptz | sí | `now()` |
| 8 | `activo` | boolean | sí | `false` |
| 9 | `segmento_id` | uuid | sí | — |

> **Ojo:** Tiene **dos** formas de decir lo mismo: `estado` (default `'bloqueado'`) y `activo` (default `false`). Hay que decidir cuál manda.

#### 🟦 `push_subscriptions` · 51 filas

**Para qué sirve:** tokens push (Android) y URLs de webhook (NotiAlarm, iPhone) por persona.
**PK:** `id` uuid — uuid aleatorio (`gen_random_uuid()`).
**FK:** ninguna.
**Check:** CHECK ((tipo = ANY (ARRAY['jefe'::text, 'conductor'::text]))).
**Llave natural:** `token`.
**Borrado:** **físico** (`script.js`, `mapa.js`, `conductor.js`, y `cerrar_turno` / `liberar_unidad` / `abrir_sesion_panel`).
**Realtime:** no.
**Archivos:** leen `mapa.js`, `script.js`; escriben `conductor.js`, `mapa.js`, `script.js`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `user_id` | text | NO | — |
| 3 | `token` | text | NO | — |
| 4 | `created_at` | timestamptz | sí | `now()` |
| 5 | `notialarm_webhook` | text | sí | — |
| 6 | `unidad` | text | sí | — |
| 7 | `tipo` | text | NO | `'conductor'::text` |
| 8 | `rol` | text | sí | — |
| 9 | `webhook_estado` | text | sí | — |
| 10 | `webhook_probado_en` | timestamptz | sí | — |

> **Ojo:** `token` y `notialarm_webhook` son **credenciales**: no se copian, se regeneran en el dispositivo. **PREGUNTA 16.**

#### 🟦 `segmentos` · 9 filas

**Para qué sirve:** agrupación de medidas en segmentos (probablemente por área/proceso).
**PK:** `id` uuid — uuid aleatorio (`gen_random_uuid()`).
**FK:** ninguna.
**Llave natural:** (`tabla`, `nombre`) — un segmento pertenece a una tabla de medidas. **No está declarado único.**.
**Borrado:** **físico** (`script.js` borra).
**Realtime:** no.
**Archivos:** lee y escribe `script.js`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `tabla` | text | NO | — |
| 3 | `nombre` | text | NO | — |
| 4 | `orden` | integer | NO | `0` |
| 5 | `created_at` | timestamptz | NO | `now()` |

> **Ojo:** `tabla` dice a qué tabla de medidas pertenece el segmento (polimórfico). **PREGUNTA 18.**

#### 🟦 `semaforo_estado` · 1 filas

**Para qué sirve:** el semáforo vigente de la planta (verde/amarillo/naranja/rojo). Una sola fila.
**PK:** `id` smallint — sin default: es el código de negocio.
**FK:** ninguna.
**Check:** CHECK ((id = 1)); CHECK ((nivel = ANY (ARRAY['verde'::text, 'amarillo'::text, 'naranja'::text, 'rojo'::text]))).
**Llave natural:** **SIN LLAVE NATURAL** (fila única, `id = 1`).
**Borrado:** nadie borra.
**Realtime:** no.
**Archivos:** lee `semaforo.js`; escribe solo la RPC `declarar_semaforo`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | smallint | NO | `1` |
| 2 | `nivel` | text | NO | `'verde'::text` |
| 3 | `motivo` | text | sí | — |
| 4 | `declarado_por` | text | sí | — |
| 5 | `declarado_por_rol` | text | sí | — |
| 6 | `es_guardia` | boolean | NO | `false` |
| 7 | `vigente_desde` | timestamptz | NO | `now()` |
| 8 | `actualizado_en` | timestamptz | NO | `now()` |
| 9 | `declarado_por_real` | text | sí | — |

> **Ojo:** `declarar_semaforo` escribe siempre `'MELGAR BELMONT JOSE MARIANO'` y rol `gerente_general`, fijos en el código (**PREGUNTA 9**). El check acepta `'naranja'` pero la función no lo permite (**PREGUNTA 8**).

#### 🟦 `semaforo_eventos` · 23 filas

**Para qué sirve:** historial de cambios de nivel del semáforo.
**PK:** `id` bigint — **IDENTITY**.
**FK:** ninguna.
**Llave natural:** **SIN LLAVE NATURAL** (es un log).
**Borrado:** nadie borra.
**Realtime:** no.
**Archivos:** lee `semaforo.js`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | bigint | NO | IDENTITY (by default) |
| 2 | `nivel` | text | NO | — |
| 3 | `nivel_anterior` | text | sí | — |
| 4 | `motivo` | text | sí | — |
| 5 | `declarado_por` | text | sí | — |
| 6 | `declarado_por_rol` | text | sí | — |
| 7 | `es_guardia` | boolean | NO | `false` |
| 8 | `verificado` | boolean | NO | `false` |
| 9 | `creado_en` | timestamptz | NO | `now()` |
| 10 | `declarado_por_real` | text | sí | — |

#### 🟦 `sesiones_historial` · 203 filas

**Para qué sirve:** histórico de sesiones cerradas/reemplazadas/forzadas. Es el registro de auditoría de accesos.
**PK:** `id` bigint — secuencia (`nextval`).
**FK:** ninguna.
**Check:** CHECK ((motivo = ANY (ARRAY['cerrada'::text, 'forzada'::text, 'reemplazada'::text]))); CHECK ((tipo = ANY (ARRAY['jefe'::text, 'conductor'::text]))).
**Llave natural:** **SIN LLAVE NATURAL**.
**Borrado:** nadie borra (solo inserta).
**Realtime:** no.
**Archivos:** —.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | bigint | NO | `nextval('sesiones_historial_id_seq'::regclass)` |
| 2 | `tipo` | text | NO | `'jefe'::text` |
| 3 | `user_id` | text | NO | — |
| 4 | `unidad` | text | sí | — |
| 5 | `rol` | text | sí | — |
| 6 | `dispositivo` | text | sí | — |
| 7 | `inicio` | timestamptz | sí | — |
| 8 | `cerrada_en` | timestamptz | NO | `now()` |
| 9 | `motivo` | text | NO | `'cerrada'::text` |
| 10 | `liberada_por` | text | sí | — |

> **Ojo:** Revisar con TI: es el registro de auditoría de accesos. **PREGUNTA 12.**

#### 🟦 `sesiones_panel` · 21 filas

**Para qué sirve:** sesión abierta de cada equipo de jefatura (una fila por equipo).
**PK:** `id` uuid — uuid aleatorio (`gen_random_uuid()`).
**FK:** ninguna.
**Único:** (clave).
**Llave natural:** `clave` (token de sesión) y `dispositivo`.
**Borrado:** **físico**, mucho: `abrir_sesion_panel`, `cerrar_sesion_panel`, `liberar_sesion_panel`, `adjuntar_token_*`, `registrar_webhook_notialarm`.
**Realtime:** no.
**Archivos:** solo vía RPC.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `user_id` | text | NO | — |
| 3 | `rol` | text | sí | — |
| 4 | `clave` | text | NO | — |
| 5 | `token_push` | text | sí | — |
| 6 | `inicio` | timestamptz | NO | `now()` |
| 7 | `dispositivo` | text | sí | — |

> **Ojo:** Revisar con TI antes de migrar: la empresa ya tiene una regla de cuenta atada a teléfono. **PREGUNTA 12.**

#### 🟦 `sesiones_unidad` · 7 filas

**Para qué sirve:** turno abierto por unidad y por equipo (quién conduce qué unidad ahora).
**PK:** `unidad` text — sin default: es el código de negocio.
**FK:** ninguna.
**Llave natural:** `unidad`.
**Borrado:** **físico** (`abrir_turno` con upsert, `cerrar_turno`, `liberar_unidad`).
**Realtime:** no.
**Archivos:** leen `mapa.js`, `conductor.js`; escriben vía RPC.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `unidad` | text | NO | — |
| 2 | `user_id` | text | NO | — |
| 3 | `token` | text | sí | — |
| 4 | `inicio` | timestamptz | NO | `now()` |
| 5 | `dispositivo` | text | sí | — |
| 6 | `dni` | text | sí | — |

> **Ojo:** Revisar con TI. **PREGUNTA 12.**

#### 🟦 `ubicaciones` · 7 filas

**Para qué sirve:** última posición GPS conocida de cada unidad en turno.
**PK:** `user_id` text — sin default: es el código de negocio.
**FK:** ninguna.
**Llave natural:** `user_id`.
**Borrado:** **físico** (`cerrar_turno`, `liberar_unidad`).
**Realtime:** no.
**Archivos:** leen `mapa.js`, `conductor.js`; escriben `mapa.js`, `conductor.js`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `user_id` | text | NO | — |
| 2 | `lat` | double precision | NO | — |
| 3 | `lon` | double precision | NO | — |
| 4 | `precision_m` | real | sí | — |
| 5 | `bateria` | integer | sí | — |
| 6 | `actualizado_en` | timestamptz | NO | `now()` |
| 7 | `unidad` | text | sí | — |
| 8 | `token` | text | sí | — |

> **Ojo:** El trigger `tr_exigir_sesion` descarta cualquier ubicación sin turno abierto que la respalde.

#### 🟦 `unidades` · 79 filas

**Para qué sirve:** catálogo de unidades (vehículos y equipos) que se pueden poner en turno desde la APK y que aparecen en el mapa.
**PK:** `id` uuid — uuid aleatorio (`gen_random_uuid()`).
**FK:** ninguna.
**Único:** (nombre).
**Llave natural:** `nombre` (**único** en la base).
**Borrado:** nadie borra desde el código.
**Realtime:** no.
**Archivos:** leen `conductor.js`, `mapa.js`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `nombre` | text | NO | — |
| 3 | `tipo` | text | sí | — |
| 4 | `activo` | boolean | NO | `true` |
| 5 | `creado_en` | timestamptz | NO | `now()` |
| 6 | `prefijo` | text | sí | — |
| 7 | `orden` | integer | NO | `100` |

#### 🟦 `usuarios` · 53 filas

**Para qué sirve:** cuentas de acceso de los jefes de área. Es el **login propio** de Contingencia.
**PK:** `id` uuid — uuid aleatorio (`gen_random_uuid()`).
**FK:** ninguna.
**Único:** (area).
**Check:** CHECK ((rol = ANY (ARRAY['area'::text, 'gdo'::text, 'gerencial_legal'::text, 'gerente_general'::text, 'gerente_campo'::text, 'gerente_fabrica'::text, 'jefe_area'::text, 'sup_area'::text, 'supervisor'::text]))).
**Llave natural:** `area`.
**Borrado:** nadie borra (se marca `activo = false`).
**Realtime:** no.
**Archivos:** solo vía RPC (`login_areas`, `abrir_sesion_panel`, `mi_perfil`, `cambiar_password`).

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `area` | text | NO | — |
| 3 | `password` | text | NO | — |
| 4 | `rol` | text | NO | `'area'::text` |
| 5 | `activo` | boolean | sí | `true` |
| 6 | `created_at` | timestamptz | sí | `now()` |
| 7 | `gerencia_key` | text | sí | — |
| 8 | `seccion` | text | sí | — |

> **Ojo:** **LO REEMPLAZA EL IdP.** `password` está en texto plano y `abrir_sesion_panel` la compara literalmente. Las 53 cuentas sirven solo como lista de quién necesita qué rol.

---

### 2.2 Hallazgos (9 tablas)

#### 🟧 `catalogo_faltas` · 62 filas

**Para qué sirve:** catálogo de faltas/condiciones con la medida disciplinaria sugerida.
**PK:** `id` integer — secuencia (`nextval`).
**FK:** ninguna.
**Único:** (nombre).
**Llave natural:** `nombre`.
**Borrado:** nadie borra desde el JS.
**Realtime:** no.
**Archivos:** lee y escribe `app.js`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | integer | NO | `nextval('catalogo_faltas_id_seq'::regclass)` |
| 2 | `nombre` | text | NO | — |
| 3 | `activo` | boolean | sí | `true` |
| 4 | `created_at` | timestamptz | sí | `now()` |
| 5 | `medida_accion` | text | sí | — |

#### 🟧 `condiciones_inseguras_seleccionadas` · 3 filas

**Para qué sirve:** marca qué hallazgos de tipo "Condición Subestándar" fueron seleccionados para el reporte.
**PK:** `codigo_hallazgo` text — sin default: es el código de negocio.
**FK:** ninguna.
**Único:** (codigo_hallazgo).
**Llave natural:** `codigo_hallazgo` = `hallazgos.COD_HALLAZGO`.
**Borrado:** **físico** (`seleccionar_condicion_insegura` hace `delete`).
**Realtime:** no.
**Archivos:** no se consulta directo; solo vía RPC.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `codigo_hallazgo` | text | NO | — |
| 2 | `created_at` | timestamptz | NO | `now()` |

#### 🟧 `feriados` · 31 filas

**Para qué sirve:** días no laborables, para calcular plazos de descargo.
**PK:** `id` integer — secuencia (`nextval`).
**FK:** ninguna.
**Único:** (fecha).
**Llave natural:** `fecha`.
**Borrado:** nadie borra.
**Realtime:** no.
**Archivos:** lee `app.js`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | integer | NO | `nextval('feriados_id_seq'::regclass)` |
| 2 | `fecha` | date | NO | — |
| 3 | `descripcion` | text | sí | — |
| 4 | `created_at` | timestamptz | sí | `now()` |

> **Ojo:** Es el único `date` puro del sistema; en Oracle va `timestamp with time zone`. **PREGUNTA 7.**

#### 🟧 `gerencias_acceso` · 38 filas

**Para qué sirve:** cuentas de acceso del módulo de Hallazgos. Es el **login propio** de esa app.
**PK:** `id` uuid — uuid aleatorio (`gen_random_uuid()`).
**FK:** ninguna.
**Único:** (nombre).
**Llave natural:** `nombre`.
**Borrado:** nadie borra.
**Realtime:** no.
**Archivos:** lee `app.js`; también la usan `validar_acceso`, `is_admin`, `cambiar_password_acceso`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `nombre` | text | NO | — |
| 3 | `password` | text | NO | — |
| 4 | `es_admin` | boolean | sí | `false` |
| 5 | `created_at` | timestamptz | NO | `timezone('utc'::text, now())` |
| 6 | `gerencia_key` | text | sí | — |
| 7 | `es_gerente` | boolean | sí | `false` |
| 8 | `desc_seccion` | text | sí | — |

> **Ojo:** **LO REEMPLAZA EL IdP.** `password` en texto plano. Además la tabla es de **lectura pública** con RLS abierto: las 38 cuentas son legibles con la clave publicable (**PREGUNTA 22**).

#### 🟧 `hallazgo_faltas` · 351 filas

**Para qué sirve:** tabla puente entre un hallazgo y las faltas que se le imputan.
**PK:** `id` uuid — uuid aleatorio (`gen_random_uuid()`).
**FK:** `falta_id` → `catalogo_faltas(id)` ON DELETE CASCADE.
**Único:** (hallazgo_id, falta_id).
**Llave natural:** (`hallazgo_id`, `falta_id`) — donde `hallazgo_id` es **texto**, no uuid.
**Borrado:** **físico** (`app.js` borra).
**Realtime:** no.
**Archivos:** lee y escribe `app.js`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `hallazgo_id` | text | NO | — |
| 3 | `falta_id` | integer | NO | — |
| 4 | `created_at` | timestamptz | NO | `now()` |

> **Ojo:** `hallazgo_id` es `text` y **no tiene FK** a `hallazgos.id` (uuid): la relación real va por `COD_HALLAZGO`. **PREGUNTA 10.**

#### 🟧 `hallazgos` · 2491 filas

**Para qué sirve:** el registro central de hallazgos (actos y condiciones inseguras). La tabla más importante de esta app.
**PK:** `id` uuid — uuid aleatorio (`gen_random_uuid()`).
**FK:** ninguna.
**Único:** ("cod_hallazgo").
**Llave natural:** `COD_HALLAZGO` (código de negocio, texto).
**Borrado:** nadie borra desde el JS (se anula por `ESTADO = 'Anulado'`).
**Realtime:** no.
**Archivos:** lee y escribe `app.js`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `COD_HALLAZGO` | text | sí | — |
| 3 | `FECHA_REGISTRO` | text | sí | — |
| 4 | `FECHA_ACONTECIMIENTO` | text | sí | — |
| 5 | `USR_REGISTRA` | text | sí | — |
| 6 | `USR_AUTORIZADO` | text | sí | — |
| 7 | `PRIORIDAD` | text | sí | — |
| 8 | `DESC_EVENTO` | text | sí | — |
| 9 | `DESC_EMPRESA` | text | sí | — |
| 10 | `DESC_AREA` | text | sí | — |
| 11 | `DESC_SECCION` | text | sí | — |
| 12 | `USR_RESPONSABLE` | text | sí | — |
| 13 | `USR_REASIGNADO` | text | sí | — |
| 14 | `ACONTECIMIENTO` | text | sí | — |
| 15 | `MEDIDA` | text | sí | — |
| 16 | `NRO_DOC` | text | sí | — |
| 17 | `TRABAJADOR` | text | sí | — |
| 18 | `FECHA_CIERRE` | text | sí | — |
| 19 | `USR_CIERRE` | text | sí | — |
| 20 | `ESTADO` | text | sí | — |
| 21 | `DESC_PELIGRO` | text | sí | — |
| 22 | `DESC_RIESGOS` | text | sí | — |
| 23 | `created_at` | timestamptz | NO | `timezone('utc'::text, now())` |
| 24 | `descripcion_acto` | text | sí | — |

> **Ojo:** Tres cosas van a doler: (1) los nombres están en **mayúsculas** y no son `snake_case`; (2) las tres fechas son **texto**, no fechas — hay que averiguar el formato real (**PREGUNTA 3**); (3) `ESTADO` es texto libre sin check, y el valor `'Anulado'` está escrito dentro de `seleccionar_condicion_insegura` (**PREGUNTA 4**).

#### 🟧 `imagenes_hallazgos` · 791 filas

**Para qué sirve:** fotos de un hallazgo.
**PK:** `id` uuid — uuid aleatorio (`gen_random_uuid()`).
**FK:** ninguna.
**Llave natural:** `storage_path`.
**Borrado:** **físico** (`app.js` borra).
**Realtime:** **sí** — `app.js` escucha INSERT en esta tabla.
**Archivos:** lee y escribe `app.js`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `hallazgo_id` | text | NO | — |
| 3 | `nombre` | text | NO | — |
| 4 | `storage_path` | text | NO | — |
| 5 | `subido_por` | text | sí | — |
| 6 | `created_at` | timestamptz | NO | `now()` |
| 7 | `destacada` | boolean | sí | `false` |

> **Ojo:** `hallazgo_id` es `text` sin FK, igual que en `hallazgo_faltas`. **PREGUNTA 10.**

#### 🟧 `medida_accion_fotos` · 0 filas

**Para qué sirve:** fotos de la medida de acción de una falta.
**PK:** `id` uuid — uuid aleatorio (`gen_random_uuid()`).
**FK:** `falta_id` → `catalogo_faltas(id)` ON DELETE CASCADE.
**Llave natural:** `storage_path`.
**Borrado:** **físico**.
**Realtime:** **sí** — `app.js` escucha esta tabla.
**Archivos:** lee y escribe `app.js`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `falta_id` | integer | NO | — |
| 3 | `nombre` | text | NO | — |
| 4 | `storage_path` | text | NO | — |
| 5 | `subido_por` | text | sí | — |
| 6 | `created_at` | timestamptz | NO | `now()` |

> **Ojo:** `storage_path` apunta al bucket `medidas-accion`.

#### 🟧 `relaciones_casos` · 0 filas

**Para qué sirve:** el expediente del caso disciplinario de un hallazgo (cartas de cargo, descargos, medidas, cierre). Es la tabla con más lógica de negocio del sistema.
**PK:** `id` uuid — uuid aleatorio (`gen_random_uuid()`).
**FK:** ninguna.
**Llave natural:** `hallazgo_id` (debería ser único; **no está declarado**).
**Borrado:** nadie borra.
**Realtime:** no.
**Archivos:** leen `app.js`, `carta-rrll.js`; escribe `app.js`.

| # | columna | tipo | nulo | default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `hallazgo_id` | text | NO | — |
| 3 | `paso_actual` | integer | sí | `1` |
| 4 | `cargo_1_url` | text | sí | — |
| 5 | `fecha_emision_1` | timestamptz | sí | — |
| 6 | `fecha_recepcion_1` | timestamptz | sí | — |
| 7 | `descargo` | text | sí | — |
| 8 | `cargo_2_url` | text | sí | — |
| 9 | `fecha_emision_2` | timestamptz | sí | — |
| 11 | `fecha_recepcion_2` | timestamptz | sí | — |
| 12 | `medida_disciplinaria` | text | sí | — |
| 13 | `dias_suspension` | integer | sí | — |
| 14 | `afecta_incentivos` | boolean | sí | — |
| 15 | `fecha_cierre` | timestamptz | sí | — |
| 16 | `created_at` | timestamptz | sí | `now()` |
| 17 | `updated_at` | timestamptz | sí | `now()` |
| 18 | `cargo_1_destinatario` | text | sí | — |
| 19 | `cargo_1_firmado_url` | text | sí | — |
| 20 | `fecha_limite_descargo` | timestamptz | sí | — |
| 21 | `descargo_url` | text | sí | — |
| 22 | `cargo_2_destinatario` | text | sí | — |
| 23 | `cartas_adicionales` | jsonb | sí | `'[]'::jsonb` |
| 24 | `meta` | jsonb | sí | `'{}'::jsonb` |

> **Ojo:** La `ordinal_position` 10 **falta**: hubo una columna eliminada (**PREGUNTA 2**). `cartas_adicionales` y `meta` son `jsonb` con estructuras anidadas (**PREGUNTA 6**). `hallazgo_id` debería ser único y no lo es (**PREGUNTA 11**).

---

## 3. Las funciones RPC

**32 en Contingencia, 5 en Hallazgos.** Ninguna pasa a Oracle como función: cada una se convierte en un **caso de uso del backend Spring** (manual 2, sección 5.3). Se listan aquí porque son el mapa de la lógica de negocio que hoy vive dentro de la base.

Leyenda: **Lee / Escribe** = tablas que toca. **Llama** = archivo del repositorio que la invoca.

### 3.1 Contingencia

| # | Función | Qué hace, en simple | Lee | Escribe | Llama |
|---|---|---|---|---|---|
| 1 | `abrir_sesion_panel` | Login de jefatura: valida área+contraseña, cierra la sesión anterior de ese equipo, abre una nueva y la engancha al token de notificación. | `usuarios`, `sesiones_panel`, `sesiones_historial`, `push_subscriptions` | `sesiones_panel`, `sesiones_historial`, `push_subscriptions` | `script.js` |
| 2 | `abrir_turno` | Un conductor abre turno en una unidad: rechaza si el equipo ya conduce otra unidad o si la unidad la tiene otro. | `sesiones_unidad` | `sesiones_unidad` | `conductor.js` |
| 3 | `adjuntar_token_dispositivo` | Ata el token push del celular a la sesión de ese equipo. | `sesiones_panel` | `sesiones_panel` | `script.js` |
| 4 | `adjuntar_token_panel` | Igual que la anterior, pero por `clave` de sesión. | `sesiones_panel` | `sesiones_panel` | — |
| 5 | `adoptar_turno` | Ata un equipo a un turno que quedó abierto sin equipo. No inserta. | `sesiones_unidad` | `sesiones_unidad` | `mapa.js` |
| 6 | `alternar_alarma` | Apaga o enciende la alarma de una persona (la silencia o la reactiva) y lo registra. | `sesiones_panel` | `alarmas_silenciadas`, `app_log` | `turnos.js` |
| 7 | `bloquear_ubicacion` | **Trigger:** descarta una ubicación si está en la lista de bloqueos. | `bloqueos_ubicacion` (no existe; PREGUNTA 1) | — | — |
| 8 | `cambiar_password` | Cambia la contraseña de un área. | `usuarios` | `usuarios` | `script.js` |
| 9 | `cerrar_sesion_panel` | Cierra la sesión de un equipo y la archiva. | `sesiones_panel` | `sesiones_panel`, `sesiones_historial` | `script.js`, `compuertas.js` |
| 10 | `cerrar_turno` | Cierra el turno de una unidad: archiva, borra ubicación, borra suscripciones push y la sesión. | `sesiones_unidad` | `sesiones_historial`, `ubicaciones`, `push_subscriptions`, `sesiones_unidad` | `mapa.js` |
| 11 | `declarar_semaforo` | Cambia el nivel del semáforo. Exige rol gerente general/gerencial legal o sección Seguridad Industrial. | `sesiones_panel`, `usuarios`, `semaforo_estado` | `semaforo_estado`, `semaforo_eventos` | `semaforo.js` |
| 12 | `destinatarios_push` | Lista a quién hay que notificar, excluyendo a los silenciados. | `push_subscriptions`, `sesiones_panel`, `alarmas_silenciadas` | — | — |
| 13 | `es_seguridad_industrial` | ¿La sesión es de Seguridad Industrial? | `sesiones_panel`, `usuarios` | — | — |
| 14 | `esta_silenciado` | ¿Esta persona tiene la alarma apagada? | `alarmas_silenciadas` | — | — |
| 15 | `evacuar_rojo` | **El corazón de la evacuación:** si el semáforo está en rojo, calcula qué unidades están dentro de los anillos o a menos de 300 m, les manda push y lo registra. | `semaforo_estado`, `evac_estado`, `ubicaciones`, `campos_anillos` | `alertas_log`, `evac_estado` | — (sin llamador en el repo) |
| 16 | `exigir_sesion_ubicacion` | **Trigger:** solo acepta una ubicación si hay un turno abierto con esa unidad y ese usuario. | `sesiones_unidad` | — | — |
| 17 | `liberar_sesion_panel` | Un supervisor libera (expulsa) la sesión de un equipo. | `sesiones_panel` | `sesiones_panel`, `sesiones_historial` | `turnos.js` |
| 18 | `liberar_unidad` | Un supervisor libera una unidad ocupada y archiva el turno como "forzada". | `sesiones_panel`, `sesiones_unidad` | `sesiones_historial`, `ubicaciones`, `push_subscriptions`, `sesiones_unidad` | `turnos.js` |
| 19 | `login_areas` | Devuelve las áreas activas para el selector de login. | `usuarios` | — | `script.js` |
| 20 | `marcar_webhook_probado` | Guarda si la URL de NotiAlarm respondió bien en la prueba. | `push_subscriptions` | `push_subscriptions` | `turnos.js` |
| 21 | `medidas_antes_orden_por_defecto` | **Trigger:** asigna el siguiente `orden` dentro del segmento. | `medidas_antes` | — | — |
| 22 | `mi_perfil` | Devuelve rol, gerencia y sección de un área. | `usuarios` | — | `script.js` |
| 23 | `norm_persona` | Normaliza un nombre (mayúsculas, espacios) para usarlo como clave. | — | — | (interna) |
| 24 | `puede_liberar` | ¿Esta sesión puede liberar unidades? Gerente general, Seguridad Industrial o SST. | `sesiones_panel`, `usuarios` | — | (interna) |
| 25 | `quitar_webhook_notialarm` | Quita la URL de NotiAlarm de una persona. | `push_subscriptions`, `sesiones_panel` | `push_subscriptions`, `sesiones_panel`, `app_log` | `turnos.js` |
| 26 | `registrar_webhook_notialarm` | Carga y valida la URL de NotiAlarm de una persona y la engancha a sus equipos. | `usuarios`, `sesiones_panel` | `push_subscriptions`, `sesiones_panel`, `app_log` | `turnos.js` |
| 27 | `sesion_panel_por_dispositivo` | Recupera la sesión de un equipo al reabrir la app. | `sesiones_panel`, `usuarios` | — | `script.js` |
| 28 | `sesion_unidad_por_dispositivo` | Recupera el turno de un equipo al reabrir la APK. | `sesiones_unidad` | — | `conductor.js`, `mapa.js` |
| 29 | `sesiones_panel_lista` | Lista de equipos conectados, con su estado de alarma y webhook (panel de supervisión). | `sesiones_panel`, `usuarios`, `push_subscriptions`, `alarmas_silenciadas` | — | `turnos.js` |
| 30 | `token_ios` | Genera el token estable de un iPhone a partir del nombre. | — | — | (interna) |
| 31 | `token_silenciado` | ¿Este token push pertenece a alguien silenciado? | `sesiones_panel`, `sesiones_unidad`, `push_subscriptions` | — | (interna) |
| 32 | `unidades_en_turno` | Lista las unidades con turno abierto (panel de supervisión). | `sesiones_unidad`, `alarmas_silenciadas` | — | `turnos.js` |

### 3.2 Hallazgos

| # | Función | Qué hace, en simple | Lee | Escribe | Llama |
|---|---|---|---|---|---|
| 1 | `validar_acceso` | Login: busca nombre+contraseña y devuelve el perfil. | `gerencias_acceso` | — | `app.js` |
| 2 | `cambiar_password_acceso` | Cambia la contraseña de una cuenta. | `gerencias_acceso` | `gerencias_acceso` | `app.js` |
| 3 | `is_admin` | ¿Es administrador? Lo saca del **usuario de Supabase Auth** (`auth.users`) cruzado con `gerencias_acceso`. | `gerencias_acceso`, `auth.users` | — | (política RLS) |
| 4 | `seleccionar_condicion_insegura` | Marca o desmarca un hallazgo como "condición insegura seleccionada". Exige cuenta admin vía `validar_acceso`. | `hallazgos`, `condiciones_inseguras_seleccionadas`, `gerencias_acceso` | `condiciones_inseguras_seleccionadas` | — (sin llamador en el repo) |
| 5 | `rls_auto_enable` | **Trigger de evento:** activa RLS automáticamente en cada tabla nueva de `public`. | catálogo del sistema | — | (evento DDL) |

### 3.3 Lo que estas funciones revelan (y que TI debe saber)

1. **La lógica de negocio vive en la base.** `evacuar_rojo` calcula geometría (punto en polígono y distancia en metros) dentro de Postgres, y `abrir_turno` resuelve la exclusividad de turnos con reglas de texto. Todo eso pasa a Java, y es la parte más cara de la migración.
2. **`evacuar_rojo` llama por HTTP a una Edge Function** (`send-push-notification`) con una **clave de Supabase escrita en el cuerpo de la función**. En el estándar eso es del backend, con la clave en variable de entorno. **AQUÍ HAY UNA CREDENCIAL** (ver PREGUNTA 15).
3. **El rol se deduce del texto libre.** `declarar_semaforo` y `puede_liberar` comparan `seccion = 'SEGURIDAD INDUSTRIAL'` y `rol = 'gerente_general'` con `upper/btrim`. Eso es exactamente lo que en el estándar se resuelve con **scopes**, y hay que mapearlo rol por rol con el negocio.
4. **`is_admin` depende de Supabase Auth** (`auth.users`, `raw_user_meta_data`). Hallazgos tiene, entonces, dos mecanismos de identidad a la vez: su propio login y el usuario de Supabase. Al pasar al IdP desaparecen los dos.
5. **Dos funciones no tienen llamador en el repositorio**: `evacuar_rojo` y `seleccionar_condicion_insegura`. Se ejecutan a mano desde el editor SQL o desde algo externo. Ver PREGUNTA 14.

---

## 4. Triggers y políticas

### 4.1 Triggers

| Proyecto | Tabla | Trigger | Momento | Qué hace |
|---|---|---|---|---|
| Contingencia | `medidas_antes` | `trg_medidas_antes_orden` | BEFORE INSERT | Asigna `orden` = máximo del segmento + 1 si viene nulo. |
| Contingencia | `ubicaciones` | `tr_exigir_sesion` | BEFORE INSERT y BEFORE UPDATE | Descarta la fila (`return null`) si `unidad` no vacía y no hay turno abierto con esa unidad y ese usuario. |
| Hallazgos | — | — | — | **No hay triggers.** (`No hay triggers.txt` en el export.) |

Los dos triggers de Contingencia son lógica de negocio, no sellos técnicos: en el estándar **no van a Oracle**, van al backend. Oracle solo lleva triggers que asignan PK y sellan fechas de auditoría.

### 4.2 Políticas RLS

**74 políticas en total (47 + 27) y, en la práctica, la base está abierta.** El patrón dominante es `rol = public` o `anon` con `qual = true` y `with_check = true`, o sea: cualquiera con la clave publicable lee y escribe todo.

Resumen por tabla (C = SELECT, I = INSERT, U = UPDATE, D = DELETE, A = ALL):

| Proyecto | Tablas con política abierta total (A) | Tablas con C/I/U/D sueltos | Tablas sin políticas |
|---|---|---|---|
| Contingencia | `app_log`, `conductores`, `mapa_capa`, `mapa_fotos`, `mapa_lineas`, `mapa_maquinas`, `mapa_puntos`, `medidas_avances`, `segmentos`, `ubicaciones`, `unidades` | `alertas_log`, `compuertas`, `compuertas_contactos`, `historial`, `imagenes_medidas`, `medidas_antes`, `medidas_despues`, `medidas_durante`, `push_subscriptions`, `sesiones_unidad` | `alarmas_silenciadas`, `campos_anillos`, `evac_estado`, `sesiones_historial`, `sesiones_panel`, `usuarios` |
| Hallazgos | `relaciones_casos` | `catalogo_faltas`, `condiciones_inseguras_seleccionadas`, `feriados`, `hallazgo_faltas`, `hallazgos`, `imagenes_hallazgos`, `medida_accion_fotos` | `gerencias_acceso` (solo lectura pública) |

Detalle que importa para los scopes:

- **`hallazgos` tiene política para `anon` con `with_check = true`** (`Permitir insertar hallazgos a anon`, `Permitir actualizar hallazgos a anon`). Es decir, el control de "solo admin escribe" existe en dos políticas con `is_admin()` para `authenticated`, pero **queda anulado** por las políticas de `anon`. Y la app dice llamar con `anon`.
- **`gerencias_acceso` es de lectura pública** (`lectura_publica_gerencias`, rol `public`, `qual = true`): las 38 cuentas con su contraseña en texto plano son legibles con la clave publicable. **Es un hallazgo de seguridad, no solo de migración.**
- **Las 6 tablas de sesión y usuarios no tienen RLS**: `alarmas_silenciadas`, `campos_anillos`, `evac_estado`, `sesiones_historial`, `sesiones_panel`, `usuarios`. Se acceden solo por RPC `SECURITY DEFINER`, que es la única razón por la que no están expuestas directamente.
- `is_admin()` es `SECURITY DEFINER` y consulta `auth.users`, así que **cualquiera con la clave publicable puede invocarla** para saber si el usuario autenticado es admin.

Ninguna de estas 74 políticas tiene equivalente en Oracle: su lógica se convierte en **scopes + validación del token en el backend** (manual 2, sección 5.2). La conversión no es mecánica: hay que decidir, tabla por tabla, qué scope protege qué operación.

---

## 5. Buckets de archivos

| Proyecto | Bucket | Público | Límite | MIME permitidos | Tabla que guarda la referencia |
|---|---|---|---|---|---|
| Contingencia | `medidas-fotos` | **sí** | sin límite | sin restricción | `imagenes_medidas.storage_path` |
| Hallazgos | `hallazgos-fotos` | **sí** | sin límite | sin restricción | `imagenes_hallazgos.storage_path` |
| Hallazgos | `medidas-accion` | **sí** | sin límite | sin restricción | `medida_accion_fotos.storage_path` |
| Hallazgos | `relaciones-cargos` | **sí** | sin límite | sin restricción | `relaciones_casos.cargo_1_url`, `cargo_2_url`, `cargo_1_firmado_url`, `descargo_url` |

Los cuatro son **públicos y sin restricción de tamaño ni de tipo**. En el estándar, los archivos se van al servicio de archivos de la empresa y la tabla guarda solo la ruta (`varchar2`). El bucket `relaciones-cargos` no guarda rutas: guarda **URLs completas** dentro de la tabla `relaciones_casos`, que es otro patrón que hay que normalizar.

Volumen de archivos a re-subir: `imagenes_hallazgos` tiene 791 filas (la mayoría con foto), `mapa_fotos` 25 e `imagenes_medidas` 0.

---

## 6. Lo que es IDENTIDAD o ACCESO (no se migra igual)

| Proyecto | Objeto | Qué es | Qué lo reemplaza |
|---|---|---|---|
| Contingencia | `usuarios` | 53 cuentas con `password` en texto plano | **El IdP** |
| Contingencia | `usuarios.password` | contraseña en claro | **El IdP** |
| Contingencia | `abrir_sesion_panel`, `cambiar_password`, `login_areas`, `mi_perfil` | login y perfil propios | **El IdP** (roles y perfil) |
| Contingencia | `sesiones_panel` | sesión por equipo, con `clave` como token | Revisar con TI (regla de cuenta atada a teléfono) |
| Contingencia | `sesiones_unidad` | turno atado a dispositivo | Revisar con TI |
| Contingencia | `sesiones_historial` | auditoría de accesos | Revisar con TI (puede quedar como auditoría del backend) |
| Contingencia | `push_subscriptions` | tokens push y webhooks | Se regeneran (los tokens no se copian) |
| Hallazgos | `gerencias_acceso` | 38 cuentas con `password` en texto plano | **El IdP** |
| Hallazgos | `gerencias_acceso.password` | contraseña en claro | **El IdP** |
| Hallazgos | `validar_acceso`, `cambiar_password_acceso`, `is_admin` | login y perfil propios | **El IdP** |
| Ambos | `auth.users` de Supabase (usada por `is_admin`) | usuarios de Supabase Auth | **El IdP** |

**Las 91 cuentas (53 + 38) no se copian.** Esas dos tablas sirven solo como **lista de quién necesita qué rol**, que es el insumo para dar de alta a las personas en el IdP.

---

## 7. DDL actual reconstruido (PostgreSQL)

Reconstruido **tal como está hoy**, sin mejorarlo: tipos de Postgres, nombres del sistema actual (incluidas las mayúsculas de `hallazgos`) y defaults de la base. **No es el DDL de Oracle**: es la foto de partida del paso 3.

Cobertura: **290 columnas** en **38 tablas**, sin huecos.

```sql
-- ============================================================
-- CONTINGENCIA
-- ============================================================

-- alarmas_silenciadas  (5 columnas)
create table alarmas_silenciadas (
  clave                  text not null,
  user_id                text not null,
  tipo                   text,
  apagada_en             timestamptz default now() not null,
  apagada_por            text,
  constraint alarmas_silenciadas_pkey PRIMARY KEY (clave)
);

-- alertas_log  (7 columnas)
create table alertas_log (
  id                     bigint default nextval('alertas_log_id_seq'::regclass) not null,
  unidad                 text,
  user_id                text,
  token                  text,
  resultado              text,
  detalle                text,
  creado_en              timestamptz default now() not null,
  constraint alertas_log_pkey PRIMARY KEY (id)
);

-- app_log  (4 columnas)
create table app_log (
  id                     bigint default nextval('app_log_id_seq'::regclass) not null,
  origen                 text,
  detalle                text,
  creado_en              timestamptz default now() not null,
  constraint app_log_pkey PRIMARY KEY (id)
);

-- campos_anillos  (3 columnas)
create table campos_anillos (
  id                     integer default nextval('campos_anillos_id_seq'::regclass) not null,
  campo                  text,
  anillo                 jsonb not null,
  constraint campos_anillos_pkey PRIMARY KEY (id)
);

-- compuertas  (8 columnas)
create table compuertas (
  id                     bigint default nextval('compuertas_id_seq'::regclass) not null,
  administracion         text not null,
  nombre                 text not null,
  estado                 text default 'cerrada'::text not null,
  actualizado_por        text,
  actualizado_en         timestamptz default now() not null,
  lat                    double precision,
  lon                    double precision,
  constraint compuertas_administracion_nombre_key UNIQUE (administracion, nombre),
  constraint compuertas_pkey PRIMARY KEY (id)
);

-- compuertas_contactos  (6 columnas)
create table compuertas_contactos (
  id                     bigint generated by default as identity not null,
  compuerta_id           bigint not null,
  nombre                 text not null,
  cargo                  text,
  telefono               text not null,
  creado_en              timestamptz default now() not null,
  constraint compuertas_contactos_pkey PRIMARY KEY (id)
);
create index compuertas_contactos_compuerta_idx on public.compuertas_contactos using btree (compuerta_id);

-- conductores  (5 columnas)
create table conductores (
  id                     uuid default gen_random_uuid() not null,
  nombre                 text not null,
  dni                    text,
  activo                 boolean default true not null,
  creado_en              timestamptz default now() not null,
  constraint conductores_nombre_key UNIQUE (nombre),
  constraint conductores_pkey PRIMARY KEY (id)
);

-- evac_estado  (2 columnas)
create table evac_estado (
  id                     integer default 1 not null,
  vigente_desde          timestamptz,
  constraint evac_estado_pkey PRIMARY KEY (id)
);

-- historial  (7 columnas)
create table historial (
  id                     uuid default gen_random_uuid() not null,
  area                   text not null,
  accion                 text not null,
  tabla                  text not null,
  medida_id              text,
  detalle                text,
  created_at             timestamptz default now(),
  constraint historial_pkey PRIMARY KEY (id)
);
create index idx_historial_area on public.historial using btree (area);
create index idx_historial_created on public.historial using btree (created_at desc);

-- imagenes_medidas  (7 columnas)
create table imagenes_medidas (
  id                     uuid default gen_random_uuid() not null,
  medida_id              text not null,
  tabla                  text not null,
  nombre                 text not null,
  storage_path           text not null,
  area                   text not null,
  created_at             timestamptz default now(),
  constraint imagenes_medidas_pkey PRIMARY KEY (id)
);
create index idx_imagenes_medida on public.imagenes_medidas using btree (medida_id);

-- mapa_capa  (8 columnas)
create table mapa_capa (
  id                     integer default 1 not null,
  norte                  double precision not null,
  sur                    double precision not null,
  este                   double precision not null,
  oeste                  double precision not null,
  opacidad               real default 0.55 not null,
  actualizado_en         timestamptz default now() not null,
  nombre                 text,
  constraint mapa_capa_pkey PRIMARY KEY (id)
);

-- mapa_fotos  (7 columnas)
create table mapa_fotos (
  id                     uuid default gen_random_uuid() not null,
  punto_id               uuid,
  compuerta_id           bigint,
  nombre                 text,
  storage_path           text not null,
  subido_por             text,
  creado_en              timestamptz default now() not null,
  constraint mapa_fotos_check CHECK (((punto_id IS NOT NULL) OR (compuerta_id IS NOT NULL))),
  constraint mapa_fotos_pkey PRIMARY KEY (id)
);
create index mapa_fotos_compuerta_idx on public.mapa_fotos using btree (compuerta_id);
create index mapa_fotos_punto_idx on public.mapa_fotos using btree (punto_id);

-- mapa_lineas  (8 columnas)
create table mapa_lineas (
  id                     uuid default gen_random_uuid() not null,
  nombre                 text,
  color                  text default '#dc2626'::text,
  coords                 jsonb not null,
  creado_en              timestamptz default now() not null,
  grosor                 integer default 8 not null,
  tipo                   text default 'linea'::text not null,
  ambito                 text default 'criticos'::text not null,
  constraint mapa_lineas_pkey PRIMARY KEY (id)
);

-- mapa_maquinas  (7 columnas)
create table mapa_maquinas (
  id                     uuid default gen_random_uuid() not null,
  unidad                 text not null,
  lat                    double precision not null,
  lon                    double precision not null,
  punto_orden            integer,
  tamano                 integer default 40 not null,
  actualizado_en         timestamptz default now() not null,
  constraint mapa_maquinas_pkey PRIMARY KEY (id),
  constraint mapa_maquinas_unidad_key UNIQUE (unidad)
);

-- mapa_puntos  (10 columnas)
create table mapa_puntos (
  id                     uuid default gen_random_uuid() not null,
  nombre                 text,
  lat                    double precision not null,
  lon                    double precision not null,
  orden                  integer default 1 not null,
  color                  text default '#facc15'::text,
  creado_en              timestamptz default now() not null,
  tipo                   text default 'punto'::text not null,
  responsable            text,
  equipos                text,
  constraint mapa_puntos_pkey PRIMARY KEY (id)
);

-- medidas_antes  (9 columnas)
create table medidas_antes (
  id                     text not null,
  actividad              text not null,
  periodo                text,
  area                   text,
  costo                  text default ''::text,
  estado                 text default 'no-iniciado'::text not null,
  updated_at             timestamptz default now(),
  segmento_id            uuid,
  orden                  integer,
  constraint medidas_antes_estado_check CHECK ((estado = ANY (ARRAY['no-iniciado'::text, 'en-ejecucion'::text, 'finalizado'::text]))),
  constraint medidas_antes_pkey PRIMARY KEY (id)
);
create index medidas_antes_segmento_orden_idx on public.medidas_antes using btree (segmento_id, orden);

-- medidas_avances  (7 columnas)
create table medidas_avances (
  id                     uuid default gen_random_uuid() not null,
  tabla                  text not null,
  medida_id              text not null,
  texto                  text not null,
  autor                  text,
  created_at             timestamptz default now() not null,
  updated_at             timestamptz,
  constraint medidas_avances_pkey PRIMARY KEY (id)
);

-- medidas_despues  (8 columnas)
create table medidas_despues (
  id                     text not null,
  actividad              text not null,
  periodo                text,
  area                   text,
  costo                  text default ''::text,
  estado                 text default 'no-iniciado'::text not null,
  updated_at             timestamptz default now(),
  segmento_id            uuid,
  constraint medidas_despues_estado_check CHECK ((estado = ANY (ARRAY['no-iniciado'::text, 'en-ejecucion'::text, 'finalizado'::text]))),
  constraint medidas_despues_pkey PRIMARY KEY (id)
);

-- medidas_durante  (9 columnas)
create table medidas_durante (
  id                     text not null,
  actividad              text not null,
  periodo                text,
  area                   text,
  costo                  text default ''::text,
  estado                 text default 'bloqueado'::text not null,
  updated_at             timestamptz default now(),
  activo                 boolean default false,
  segmento_id            uuid,
  constraint medidas_durante_estado_check CHECK ((estado = ANY (ARRAY['bloqueado'::text, 'iniciado'::text, 'en-ejecucion'::text, 'finalizado'::text]))),
  constraint medidas_durante_pkey PRIMARY KEY (id)
);

-- push_subscriptions  (10 columnas)
create table push_subscriptions (
  id                     uuid default gen_random_uuid() not null,
  user_id                text not null,
  token                  text not null,
  created_at             timestamptz default now(),
  notialarm_webhook      text,
  unidad                 text,
  tipo                   text default 'conductor'::text not null,
  rol                    text,
  webhook_estado         text,
  webhook_probado_en     timestamptz,
  constraint push_subscriptions_pkey PRIMARY KEY (id),
  constraint push_subscriptions_tipo_check CHECK ((tipo = ANY (ARRAY['jefe'::text, 'conductor'::text])))
);
create index idx_push_subscriptions_user on public.push_subscriptions using btree (user_id);

-- segmentos  (5 columnas)
create table segmentos (
  id                     uuid default gen_random_uuid() not null,
  tabla                  text not null,
  nombre                 text not null,
  orden                  integer default 0 not null,
  created_at             timestamptz default now() not null,
  constraint segmentos_pkey PRIMARY KEY (id)
);

-- semaforo_estado  (9 columnas)
create table semaforo_estado (
  id                     smallint default 1 not null,
  nivel                  text default 'verde'::text not null,
  motivo                 text,
  declarado_por          text,
  declarado_por_rol      text,
  es_guardia             boolean default false not null,
  vigente_desde          timestamptz default now() not null,
  actualizado_en         timestamptz default now() not null,
  declarado_por_real     text,
  constraint semaforo_estado_fila_unica CHECK ((id = 1)),
  constraint semaforo_estado_nivel_valido CHECK ((nivel = ANY (ARRAY['verde'::text, 'amarillo'::text, 'naranja'::text, 'rojo'::text]))),
  constraint semaforo_estado_pkey PRIMARY KEY (id)
);

-- semaforo_eventos  (10 columnas)
create table semaforo_eventos (
  id                     bigint generated by default as identity not null,
  nivel                  text not null,
  nivel_anterior         text,
  motivo                 text,
  declarado_por          text,
  declarado_por_rol      text,
  es_guardia             boolean default false not null,
  verificado             boolean default false not null,
  creado_en              timestamptz default now() not null,
  declarado_por_real     text,
  constraint semaforo_eventos_pkey PRIMARY KEY (id)
);
create index semaforo_eventos_creado_idx on public.semaforo_eventos using btree (creado_en desc);

-- sesiones_historial  (10 columnas)
create table sesiones_historial (
  id                     bigint default nextval('sesiones_historial_id_seq'::regclass) not null,
  tipo                   text default 'jefe'::text not null,
  user_id                text not null,
  unidad                 text,
  rol                    text,
  dispositivo            text,
  inicio                 timestamptz,
  cerrada_en             timestamptz default now() not null,
  motivo                 text default 'cerrada'::text not null,
  liberada_por           text,
  constraint sesiones_historial_motivo_check CHECK ((motivo = ANY (ARRAY['cerrada'::text, 'forzada'::text, 'reemplazada'::text]))),
  constraint sesiones_historial_pkey PRIMARY KEY (id),
  constraint sesiones_historial_tipo_check CHECK ((tipo = ANY (ARRAY['jefe'::text, 'conductor'::text])))
);
create index sesiones_historial_fecha_idx on public.sesiones_historial using btree (cerrada_en desc);

-- sesiones_panel  (7 columnas)
create table sesiones_panel (
  id                     uuid default gen_random_uuid() not null,
  user_id                text not null,
  rol                    text,
  clave                  text not null,
  token_push             text,
  inicio                 timestamptz default now() not null,
  dispositivo            text,
  constraint sesiones_panel_clave_key UNIQUE (clave),
  constraint sesiones_panel_pkey PRIMARY KEY (id)
);
create unique index sesiones_panel_dispositivo_uq on public.sesiones_panel using btree (dispositivo) where (dispositivo is not null);
create index sesiones_panel_token_idx on public.sesiones_panel using btree (token_push);

-- sesiones_unidad  (6 columnas)
create table sesiones_unidad (
  unidad                 text not null,
  user_id                text not null,
  token                  text,
  inicio                 timestamptz default now() not null,
  dispositivo            text,
  dni                    text,
  constraint sesiones_unidad_pkey PRIMARY KEY (unidad)
);
create unique index sesiones_unidad_dispositivo_uq on public.sesiones_unidad using btree (dispositivo) where (dispositivo is not null);

-- ubicaciones  (8 columnas)
create table ubicaciones (
  user_id                text not null,
  lat                    double precision not null,
  lon                    double precision not null,
  precision_m            real,
  bateria                integer,
  actualizado_en         timestamptz default now() not null,
  unidad                 text,
  token                  text,
  constraint ubicaciones_pkey PRIMARY KEY (user_id)
);

-- unidades  (7 columnas)
create table unidades (
  id                     uuid default gen_random_uuid() not null,
  nombre                 text not null,
  tipo                   text,
  activo                 boolean default true not null,
  creado_en              timestamptz default now() not null,
  prefijo                text,
  orden                  integer default 100 not null,
  constraint unidades_nombre_key UNIQUE (nombre),
  constraint unidades_pkey PRIMARY KEY (id)
);

-- usuarios  (8 columnas)
create table usuarios (
  id                     uuid default gen_random_uuid() not null,
  area                   text not null,
  password               text not null,
  rol                    text default 'area'::text not null,
  activo                 boolean default true,
  created_at             timestamptz default now(),
  gerencia_key           text,
  seccion                text,
  constraint usuarios_area_key UNIQUE (area),
  constraint usuarios_pkey PRIMARY KEY (id),
  constraint usuarios_rol_check CHECK ((rol = ANY (ARRAY['area'::text, 'gdo'::text, 'gerencial_legal'::text, 'gerente_general'::text, 'gerente_campo'::text, 'gerente_fabrica'::text, 'jefe_area'::text, 'sup_area'::text, 'supervisor'::text])))
);

-- llaves foraneas (al final, para no depender del orden)
alter table compuertas_contactos add constraint compuertas_contactos_compuerta_id_fkey FOREIGN KEY (compuerta_id) REFERENCES compuertas(id) ON DELETE CASCADE;
alter table mapa_fotos add constraint mapa_fotos_compuerta_id_fkey FOREIGN KEY (compuerta_id) REFERENCES compuertas(id) ON DELETE CASCADE;
alter table mapa_fotos add constraint mapa_fotos_punto_id_fkey FOREIGN KEY (punto_id) REFERENCES mapa_puntos(id) ON DELETE CASCADE;
alter table medidas_antes add constraint medidas_antes_segmento_id_fkey FOREIGN KEY (segmento_id) REFERENCES segmentos(id) ON DELETE SET NULL;
alter table medidas_despues add constraint medidas_despues_segmento_id_fkey FOREIGN KEY (segmento_id) REFERENCES segmentos(id) ON DELETE SET NULL;
alter table medidas_durante add constraint medidas_durante_segmento_id_fkey FOREIGN KEY (segmento_id) REFERENCES segmentos(id) ON DELETE SET NULL;
-- ============================================================
-- HALLAZGOS
-- ============================================================

-- catalogo_faltas  (5 columnas)
create table catalogo_faltas (
  id                     integer default nextval('catalogo_faltas_id_seq'::regclass) not null,
  nombre                 text not null,
  activo                 boolean default true,
  created_at             timestamptz default now(),
  medida_accion          text,
  constraint catalogo_faltas_nombre_key UNIQUE (nombre),
  constraint catalogo_faltas_pkey PRIMARY KEY (id)
);

-- condiciones_inseguras_seleccionadas  (2 columnas)
create table condiciones_inseguras_seleccionadas (
  codigo_hallazgo        text not null,
  created_at             timestamptz default now() not null,
  constraint condiciones_inseguras_codigo_unique UNIQUE (codigo_hallazgo),
  constraint condiciones_inseguras_seleccionadas_pkey PRIMARY KEY (codigo_hallazgo)
);

-- feriados  (4 columnas)
create table feriados (
  id                     integer default nextval('feriados_id_seq'::regclass) not null,
  fecha                  date not null,
  descripcion            text,
  created_at             timestamptz default now(),
  constraint feriados_fecha_key UNIQUE (fecha),
  constraint feriados_pkey PRIMARY KEY (id)
);

-- gerencias_acceso  (8 columnas)
create table gerencias_acceso (
  id                     uuid default gen_random_uuid() not null,
  nombre                 text not null,
  password               text not null,
  es_admin               boolean default false,
  created_at             timestamptz default timezone('utc'::text, now()) not null,
  gerencia_key           text,
  es_gerente             boolean default false,
  desc_seccion           text,
  constraint gerencias_acceso_nombre_key UNIQUE (nombre),
  constraint gerencias_acceso_pkey PRIMARY KEY (id)
);

-- hallazgo_faltas  (4 columnas)
create table hallazgo_faltas (
  id                     uuid default gen_random_uuid() not null,
  hallazgo_id            text not null,
  falta_id               integer not null,
  created_at             timestamptz default now() not null,
  constraint hallazgo_faltas_hallazgo_id_falta_id_key UNIQUE (hallazgo_id, falta_id),
  constraint hallazgo_faltas_pkey PRIMARY KEY (id)
);
create index idx_hf_falta on public.hallazgo_faltas using btree (falta_id);
create index idx_hf_hallazgo on public.hallazgo_faltas using btree (hallazgo_id);

-- hallazgos  (24 columnas)
create table hallazgos (
  id                     uuid default gen_random_uuid() not null,
  COD_HALLAZGO           text,
  FECHA_REGISTRO         text,
  FECHA_ACONTECIMIENTO   text,
  USR_REGISTRA           text,
  USR_AUTORIZADO         text,
  PRIORIDAD              text,
  DESC_EVENTO            text,
  DESC_EMPRESA           text,
  DESC_AREA              text,
  DESC_SECCION           text,
  USR_RESPONSABLE        text,
  USR_REASIGNADO         text,
  ACONTECIMIENTO         text,
  MEDIDA                 text,
  NRO_DOC                text,
  TRABAJADOR             text,
  FECHA_CIERRE           text,
  USR_CIERRE             text,
  ESTADO                 text,
  DESC_PELIGRO           text,
  DESC_RIESGOS           text,
  created_at             timestamptz default timezone('utc'::text, now()) not null,
  descripcion_acto       text,
  constraint hallazgos_codigo_unique UNIQUE ("COD_HALLAZGO"),
  constraint hallazgos_pkey PRIMARY KEY (id)
);

-- imagenes_hallazgos  (7 columnas)
create table imagenes_hallazgos (
  id                     uuid default gen_random_uuid() not null,
  hallazgo_id            text not null,
  nombre                 text not null,
  storage_path           text not null,
  subido_por             text,
  created_at             timestamptz default now() not null,
  destacada              boolean default false,
  constraint imagenes_hallazgos_pkey PRIMARY KEY (id)
);
create index idx_img_hallazgo_destacada on public.imagenes_hallazgos using btree (hallazgo_id) where (destacada = true);
create index idx_img_hallazgos_hallazgo on public.imagenes_hallazgos using btree (hallazgo_id);

-- medida_accion_fotos  (6 columnas)
create table medida_accion_fotos (
  id                     uuid default gen_random_uuid() not null,
  falta_id               integer not null,
  nombre                 text not null,
  storage_path           text not null,
  subido_por             text,
  created_at             timestamptz default now() not null,
  constraint medida_accion_fotos_pkey PRIMARY KEY (id)
);
create index idx_maf_falta on public.medida_accion_fotos using btree (falta_id);

-- relaciones_casos  (23 columnas)
create table relaciones_casos (
  id                     uuid default gen_random_uuid() not null,
  hallazgo_id            text not null,
  paso_actual            integer default 1,
  cargo_1_url            text,
  fecha_emision_1        timestamptz,
  fecha_recepcion_1      timestamptz,
  descargo               text,
  cargo_2_url            text,
  fecha_emision_2        timestamptz,
  fecha_recepcion_2      timestamptz,
  medida_disciplinaria   text,
  dias_suspension        integer,
  afecta_incentivos      boolean,
  fecha_cierre           timestamptz,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now(),
  cargo_1_destinatario   text,
  cargo_1_firmado_url    text,
  fecha_limite_descargo  timestamptz,
  descargo_url           text,
  cargo_2_destinatario   text,
  cartas_adicionales     jsonb default '[]'::jsonb,
  meta                   jsonb default '{}'::jsonb,
  constraint relaciones_casos_pkey PRIMARY KEY (id)
);
create index idx_relaciones_casos_hallazgo on public.relaciones_casos using btree (hallazgo_id);

-- llaves foraneas (al final, para no depender del orden)
alter table hallazgo_faltas add constraint hallazgo_faltas_falta_id_fkey FOREIGN KEY (falta_id) REFERENCES catalogo_faltas(id) ON DELETE CASCADE;
alter table medida_accion_fotos add constraint medida_accion_fotos_falta_id_fkey FOREIGN KEY (falta_id) REFERENCES catalogo_faltas(id) ON DELETE CASCADE;
```

## 8. PREGUNTAS

Todo lo que no se puede saber con certeza desde las fuentes. Formato: `PREGUNTA: <tabla o función> - <qué no se sabe>`.

### 8.1 Para verificar en la base (no lo decide nadie, se comprueba)

- **PREGUNTA 1:** `bloqueos_ubicacion` - la función `bloquear_ubicacion` la consulta (`select 1 from bloqueos_ubicacion b where ...`), pero la tabla no aparece en el export de columnas, ni en el de filas, ni en el de índices, ni en el de constraints. ¿Existió y se eliminó dejando el trigger huérfano, o vive en otro esquema?

- **PREGUNTA 2:** `relaciones_casos` - la posición ordinal 10 no existe (salta de 9 a 11): hubo una columna que se eliminó. ¿Qué columna era y qué pasó con sus datos? Importa porque `carta-rrll.js` genera documentos con esos datos.

### 8.2 De negocio y de TI (no se pueden deducir del código)

- **PREGUNTA 3:** `hallazgos` - `FECHA_REGISTRO`, `FECHA_ACONTECIMIENTO` y `FECHA_CIERRE` son `text`, no fechas. ¿Qué formato tienen realmente (`dd/mm/aaaa`, `aaaa-mm-dd`, con hora)? Sin eso no se pueden convertir a `timestamp with time zone` sin corromper datos.

- **PREGUNTA 4:** `hallazgos` - `ESTADO` es texto libre sin check. ¿Cuáles son todos los valores posibles? Solo se conoce `'Anulado'`, escrito dentro de `seleccionar_condicion_insegura`.

- **PREGUNTA 5:** `compuertas` - `estado` es texto con default `'cerrada'` y sin check. ¿Cuáles son los valores válidos?

- **PREGUNTA 6:** `campos_anillos.anillo`, `mapa_lineas.coords`, `relaciones_casos.cartas_adicionales`, `relaciones_casos.meta` - son `jsonb`. La regla 9 del prompt de DDL dice pasarlos a `clob` y marcarlos: ¿se guardan como `clob` tal cual, o se normalizan a tablas hijas? `anillo` y `coords` son arreglos de coordenadas; `cartas_adicionales` es un arreglo de objetos.

- **PREGUNTA 7:** `feriados.fecha` - es el único `date` del sistema. ¿Necesita hora o solo día?

- **PREGUNTA 8:** `semaforo_estado` - el check acepta `'naranja'`, pero `declarar_semaforo` solo acepta `'verde'`, `'amarillo'` y `'rojo'`. ¿El naranja está en desuso o hay otra vía para declararlo?

- **PREGUNTA 9:** `semaforo_estado` / `semaforo_eventos` - `declarar_semaforo` escribe siempre `declarado_por = 'MELGAR BELMONT JOSE MARIANO'` y rol `gerente_general`, fijos en el código, y guarda a la persona real en `declarado_por_real`. ¿Se mantiene esa regla o el semáforo lo declara quien realmente lo declara?

- **PREGUNTA 10:** `hallazgo_faltas`, `imagenes_hallazgos`, `medida_accion_fotos`, `relaciones_casos` - `hallazgo_id` es `text` y no tiene FK a `hallazgos.id` (uuid). La relación real es por `COD_HALLAZGO`. ¿Se formaliza la relación en Oracle con una FK al `hallazgo_id` numérico, o el vínculo sigue siendo el código de negocio?

- **PREGUNTA 11:** `relaciones_casos` - `hallazgo_id` debería ser único (un expediente por hallazgo) pero no está declarado. ¿Puede haber más de un caso por hallazgo?

- **PREGUNTA 12:** `sesiones_panel`, `sesiones_unidad`, `sesiones_historial`, `push_subscriptions` - el manual pide revisarlas con TI antes de migrarlas, porque la empresa ya tiene una regla para atar una cuenta a un teléfono. ¿Esa regla reemplaza la lógica de `dispositivo` / `clave` / `token_push`, o hay que conservar algo?

- **PREGUNTA 13:** `app_log` y `alertas_log` - el manual pide preguntar si se conservan. `app_log` tiene 3 150 filas (el 39 % de Contingencia) y es registro técnico; `alertas_log` tiene 80 y registra evacuaciones reales. ¿Cuál de las dos se conserva?

- **PREGUNTA 14:** `evacuar_rojo` y `seleccionar_condicion_insegura` - no tienen llamador en el repositorio. ¿Se ejecutan a mano desde el editor SQL, desde un cron externo, o están en desuso?

- **PREGUNTA 15:** `evacuar_rojo` / `send-push-notification` - la función arma la petición HTTP con una clave de Supabase escrita en el cuerpo. **AQUÍ HAY UNA CREDENCIAL** (`contingencia_functions.csv`, función `evacuar_rojo`). ¿Se rota esa clave al pasar al backend?

- **PREGUNTA 16:** `push_subscriptions` - `token` (token push del celular) y `notialarm_webhook` (URL privada de NotiAlarm) son credenciales. No se copian al DDL nuevo: se regeneran en el dispositivo. ¿Confirma TI que la carga no los incluye?

- **PREGUNTA 17:** `mapa_lineas.coords` y `campos_anillos.anillo` - los mapas y capas (`.geojson`, `.kmz`) siguen como archivos de la web salvo que TI diga lo contrario. ¿Las coordenadas guardadas en la base también siguen en la base, o pasan a archivo?

- **PREGUNTA 18:** `historial`, `segmentos`, `imagenes_medidas` y `medidas_avances` - todas tienen una columna `tabla` de texto que dice a qué tabla pertenece la fila (`medidas_antes`, `medidas_durante`, `medidas_despues`). Es una referencia polimórfica: en Oracle no puede haber FK. ¿Se deja como referencia lógica validada por el backend, o se normaliza en tres tablas hijas?

- **PREGUNTA 19:** El manual dice "un proyecto = un app_code". Son dos aplicaciones distintas, sin una sola tabla en común. ¿TI confirma **dos `app_code`** (`CONTINGENCY` y `FINDINGS`, o los que asigne), **dos prefijos** de tabla y **dos bloques** del modelo (`contingency` y `findings`)?

- **PREGUNTA 20:** `conductores.dni`, `compuertas_contactos.telefono`, `hallazgos.TRABAJADOR`, `hallazgos.NRO_DOC` y los `DESC_*` de personas son datos personales. ¿Se migran completos o hay que anonimizar algo? (Afecta la carga, no el DDL.)

- **PREGUNTA 21:** Hay 6 tablas con realtime (`medidas_antes`, `medidas_durante`, `medidas_despues`, `imagenes_medidas`, `imagenes_hallazgos`, `medida_accion_fotos`). En el estándar eso es el WebSocket del backend, que exige token de aplicación. ¿Qué eventos necesitan aviso en vivo y cuáles pueden ser una recarga normal?

- **PREGUNTA 22:** `gerencias_acceso` tiene política de lectura pública (`public`, `qual = true`) y guarda 38 contraseñas en texto plano: cualquiera con la clave publicable las lee. Es independiente de la migración, pero se encontró en este inventario. ¿Se avisa a TI/Seguridad?

### 8.3 Deudas del sistema actual que conviene no arrastrar

| Qué | Dónde | Por qué |
|---|---|---|
| Llaves primarias mezcladas | `uuid` (20 tablas), `bigint`/`integer` con secuencia (9), `text` (6), `smallint` fija (1) | El estándar exige PK numérica por secuencia en todas |
| **IDENTITY** | `compuertas_contactos.id`, `semaforo_eventos.id` | La regla 3 lo prohíbe: hay que reemplazarlo por secuencia + trigger |
| Nombres en mayúsculas | `hallazgos` (24 columnas) | Oracle los guardaría en mayúsculas; se renombran todos |
| Contraseñas en texto plano | `usuarios`, `gerencias_acceso` | Lo reemplaza el IdP: hay que dar de alta 91 cuentas |
| Referencias polimórficas | `historial.tabla`, `segmentos.tabla`, `imagenes_medidas.tabla`, `medidas_avances.tabla` | Sin FK posible (PREGUNTA 18) |
| Estado duplicado | `medidas_durante.estado` (`'bloqueado'` por defecto) + `medidas_durante.activo` | Dos formas de decir lo mismo en la misma tabla |
| Sin llave natural declarada | `alertas_log`, `app_log`, `evac_estado`, `historial`, `mapa_capa`, `semaforo_estado`, `semaforo_eventos`, `sesiones_historial` | La carga necesita `source_id` (regla 4 del DDL) |
| Borrado físico | 13 tablas (ver sección 2) | El estándar es borrado lógico con `is_active` |
| Sin auditoría | todas | Ninguna guarda quién creó/modificó; el estándar lo exige en todas |
| Índices de FK incompletos | `medidas_*.segmento_id`, `sesiones_panel.dispositivo` | Regla 10: toda FK lleva su índice |

---

## 9. Qué falta

Del lado de la base, **nada**: el export está completo (38 tablas, 290 columnas).

Falta solo lo que tiene que responder TI para el paso 3:

1. **`app_code`** (uno o dos, ver PREGUNTA 19).
2. **Prefijo** de tablas y **esquema** destino en Oracle.
3. **Estilo de columnas**: `nuevo` (`_id`, `_at`, `is_active`) o `existente` (`cod_`, `_date`, `flag_state`).
4. **Bloques** del modelo (`contingency`, `findings`).

Y las respuestas a las preguntas de la sección 8.2, que son las que definen el modelo (sobre todo las 3, 6, 10 y 18).

---

## 10. Siguiente paso

1. Enviar a TI: este inventario + el mensaje con los cuatro datos del paso 3.
2. Con los cuatro datos, generar `migracion/oracle/` (m01 a m07) + `mapeo.md` + `preguntas.md`.
3. Entregar el paquete del paso 4 y esperar la revisión.

Nada de esto se ejecuta contra la base ni escribe código de aplicación: el paso 4 sigue siendo la compuerta.
