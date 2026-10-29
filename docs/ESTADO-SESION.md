# Estado del trabajo — para chat nuevo

> Traspaso al 29 de octubre de 2026. Leer esto antes de tocar código.
> Hay cambios **sin commitear** (ver §5). La base de datos ya está actualizada.

---

## 1. Dónde está todo

| Qué | Dónde |
|---|---|
| Repo local | `C:\Users\edins\Documents\GitHub\Sistema-Integrado` |
| Remoto | `git@github.com:Agro-Industrial-Paramonga/Sistema-Integrado.git` (SSH, ya autorizada) |
| Rama | `main` · último commit publicado: `a65a851` |
| App publicada | https://agro-industrial-paramonga.github.io/Sistema-Integrado/ |
| Portal | `/plan-contingencia/index.html` |
| Mapa | `/plan-contingencia/mapa.html` |
| Ingreso conductores | `/plan-contingencia/conductor.html` |
| Licencias (nuevo) | `/plan-contingencia/licencias.html` |
| Releases APK | https://github.com/Agro-Industrial-Paramonga/Sistema-Integrado/releases |

**Publicar** = `git add` + `commit` + `push origin main`. GitHub Pages reconstruye en ~1 min.
**Ojo:** el push que toque `app/android/**` dispara `publicar-apk.yml`, que compila y publica un APK nuevo solo.

---

## 2. Supabase

| Dato | Valor |
|---|---|
| Proyecto | `bfhfnldqwsrcpsdqpyat` (Plan de contingencia) |
| URL | `https://bfhfnldqwsrcpsdqpyat.supabase.co` |
| Clave pública | `sb_publishable_z-jW4WrGLq7wEhCI_CW3Ig_vQZwtOMh` |
| PAT con acceso total | en `C:\Users\edins\.dsh\secrets\supabase-pat.txt` (Management API + SQL como `postgres`) |

El PAT permite DDL y consultas por `POST /v1/projects/<ref>/database/query`.
También ve el proyecto **Hallazgos** (`bfwyedbiguytlrooiglj`), no usado en esta tanda.

**SQL aplicado hoy** (archivado en el repo, ya ejecutado):

- `plan-contingencia/sql/sesiones_panel_por_equipo.sql`
- `plan-contingencia/sql/sesiones_unidad_por_equipo.sql`

### Estado actual de la base (verificado)

| Dato | Valor |
|---|---|
| `sesiones_panel` (jefes) | **0** |
| `sesiones_unidad` (turnos) | **1**: `RTE-628` · ABRIGO LEON CARLOS HAROLD · sin `dispositivo` (turno abierto por la versión anterior; se adopta solo al abrir la web nueva) |
| `sesiones_historial` | 0 (limpio tras las pruebas) |
| `push_subscriptions` | 1 (la del turno vivo) |
| `ubicaciones` | 1 |
| `app_log` | 912 filas, todas dentro de los 7 días de retención |

Limpieza hecha: 15 suscripciones de jefe inertes, 14 de conductor sin unidad y las de prueba. No quedó basura.

---

## 3. Qué se construyó en esta sesión

### a) Ingreso de maquinarias por DNI (publicado)
Capa previa: `PASO 1` solo DNI (teclado numérico, sin sugerencias ni autocompletado, 8 dígitos), luego DNI y nombre fijos y el conductor solo elige serie y unidad. Enlace *No soy yo* para celular compartido. Las versiones del APK se enteran del cambio sin recompilar: es web.

### b) Sesiones de jefes y supervisores atadas al equipo
- La sesión es una fila en `sesiones_panel` con `dispositivo` (id del celular).
- Al abrir el portal se recupera **de la base** por ese id: con la cache limpia entra solo y puede cerrar sesión.
- Varios equipos por jefe permitidos; cada uno con su sesión.
- **No se cierra por tiempo ni por inactividad**: solo con *Cerrar sesión* o con liberación forzada.
- Al cerrar se borra la fila y queda una línea en `sesiones_historial` (`cerrada`).
- Cada login barre suscripciones de jefe que ya no tienen sesión.

### c) Turnos de conductores atados al equipo
- `abrir_turno` garantiza dueño único por unidad y uno por equipo. Devuelve `ocupada` (con el nombre de quien la tiene) o `ya_tiene_turno` (con la unidad que ya conduce).
- El turno se recupera de la base por `dispositivo`; `mapa.js` ya no lee `localStorage`.
- **Adopción**: si el equipo no tiene turno registrado por id, pero las preferencias nativas guardan usuario y unidad, la base confirma que ese turno sigue abierto y a nombre de esa persona, y se adopta. Así el turno `RTE-628` no se pierde.
- Al cerrar, la función borra turno, ubicación y suscripción en una transacción y deja el historial.

### d) Liberación forzada (panel de compuertas)
Nuevas secciones en el panel de Seguridad Industrial: **Unidades en turno** y **Sesiones abiertas**, con botón *Liberar* y confirmación. Autorizado solo a `gerente_general` o Seguridad Industrial; queda registrado quién liberó.

### e) Licencias y avisos
- `LICENSE` propietario en la raíz.
- `THIRD-PARTY-NOTICES.md` con todo el inventario y los textos MIT y BSD.
- `plan-contingencia/licencias.html`: página sin dependencias externas (sirve offline y viaja dentro del APK), con créditos de Font Awesome (CC BY 4.0), Leaflet, Esri/Maxar y las tipografías.
- `app/package.json`: `"license": "ISC"` → `"UNLICENSED"`, `private: true`.
- Enlaces a esa página desde el menú del portal, el pie de la pantalla de inicio del APK y el ingreso de conductores.

---

## 4. Decisiones tomadas (no volver a preguntarlas)

1. **Nada se cierra por inactividad.** La sesión vive hasta que el usuario pulsa cerrar o Seguridad Industrial libera.
2. **Varios equipos por jefe**, cada uno con su sesión.
3. **Historial de cada cierre** (`cerrada`, `forzada`, `reemplazada`), sin basura en las tablas operativas.
4. **El DNI identifica, no autentica.** Quien sepa un DNI de la lista puede usarlo. Una barrera real exigiría PIN.
5. **La identidad del equipo vive en preferencias nativas** (`SharedPreferences("identidad")`), nunca en `localStorage`.

---

## 5. Cambios sin commitear

```
 M app/android/app/src/main/java/com/aipsa/sistema/MainActivity.java   (obtenerDispositivo)
 M app/package.json                                                   (UNLICENSED, private)
 M index.html                                                         (enlace a licencias)
 M plan-contingencia/compuertas.js                                    (unidades y sesiones + liberar)
 M plan-contingencia/conductor.html                                   (v=21, enlace licencias)
 M plan-contingencia/conductor.js                                     (turno por RPC, sin localStorage)
 M plan-contingencia/index.html                                       (menú licencias)
 M plan-contingencia/mapa.html                                        (v=48 y 6, secciones nuevas)
 M plan-contingencia/mapa.js                                          (sesión desde la base + adopción)
 M plan-contingencia/script.js                                        (v=59, sesión por equipo)
?? LICENSE
?? THIRD-PARTY-NOTICES.md
?? plan-contingencia/licencias.html
?? plan-contingencia/sql/sesiones_panel_por_equipo.sql
?? plan-contingencia/sql/sesiones_unidad_por_equipo.sql
```

---

## 6. Pendientes, en orden sugerido

1. **Commit + push** de todo. El push toca `app/android/**`, así que **compila y publica el APK**.
2. **Probar en un celular real**: DNI → turno → recargar → cerrar; y el login de jefe con la cache limpia. En el navegador headless la comprobación de ubicación al iniciar turno falló aunque el GPS simulado respondía; se probó con esa comprobación forzada, así que conviene confirmarla en el teléfono.
3. **Cerrar las RLS** de `sesiones_unidad`, `push_subscriptions` y `ubicaciones` cuando el APK nuevo esté instalado (hoy siguen abiertas porque el APK viejo escribe directo).
4. **Tailwind Play CDN** en `hallazgos/index.html`: la propia Tailwind dice que es para prototipos. Reemplazar por CSS compilado (necesita paso de build en el workflow).
5. **Esri**: el fondo satelital no es libre; licencia o cambiar de fuente.
6. **Procedencia** de `assets/compuertas/gate-green.gif`, `gate-red.gif` y `assets/campos.geojson`.
7. **`docs/ESTADO-PROYECTO.md`** sigue describiendo el flujo con `localStorage`; hay que actualizarlo o fusionarlo con este documento.
8. **Tema de datos (legal)**: la lista de 95 conductores con DNI es legible con la clave pública. Conviene validar el DNI por RPC y no exponer la lista. Las contraseñas de `usuarios` siguen en texto plano; pasarlas a hash.

---

## 7. Cómo probar en local

```powershell
C:\Users\edins\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe -m http.server 8099 --bind 127.0.0.1 --directory "C:\Users\edins\Documents\GitHub\Sistema-Integrado"
```

- Portal: http://127.0.0.1:8099/plan-contingencia/index.html
- Conductor: http://127.0.0.1:8099/plan-contingencia/conductor.html
- Mapa: http://127.0.0.1:8099/plan-contingencia/mapa.html
- Licencias: http://127.0.0.1:8099/plan-contingencia/licencias.html

Los scripts de prueba con CDP quedaron en `C:\Users\edins\Documents\deepseek-harness\default-workspace\` (`cdp-turno.js`, `cdp-liberar.js`, `cdp-portal-sesion.js`, `cdp-adopcion.js`).

---

## 8. Cómo trabajar (acuerdo con el usuario)

- **No sacar capturas de pantalla.** Verificar con `node --check`, consultas y volcados de DOM.
- Editar **bloques chicos**; no reescribir archivos completos.
- Respuestas cortas; sin resúmenes de cierre salvo que se pidan.
- **No publicar sin que lo pidan**: commit y push solo cuando lo indiquen.
- Al tocar un `.js`, **subir el `?v=`** en el HTML correspondiente.
- **Cuidado con PowerShell**: `Get-Content | Set-Content` rompió la codificación de dos HTML (acentos y BOM). Usar edición puntual, no reescrituras masivas.
- La base se consulta con el PAT de §2; para SQL, `POST /v1/projects/<ref>/database/query` con `{"query":"..."}`.

---

## 9. Accesos entregados por el usuario

| # | Acceso | Credencial | Dónde está guardada | Estado |
|---|---|---|---|---|
| 1 | Supabase — cuenta completa (proyecto `bfhfnldqwsrcpsdqpyat`) | PAT con acceso total (**valor no escrito en el repo**) | `C:\Users\edins\.dsh\secrets\supabase-pat.txt` (fuera del repo) | VERIFICADO — Management API + SQL como `postgres` |
| 2 | GitHub — repo `Agro-Industrial-Paramonga/Sistema-Integrado` | llave SSH (previa) + PAT pendiente | llave SSH en `~/.ssh`; PAT en `github-pat.txt` (aún no existe) | SSH: push OK. PAT: NO entregado |

SHA256 informado por el usuario para el PAT de Supabase: `uoBJNUHaXUyTA7Jr+EgBXNXrbFXJIYm4CrmlHNO0tdg`
(no coincide con el hash del token; el real es `WDCZkIHItMxMvlaxr/uh/tRwnMOn5C38Er3vEpigbKE=`)

---

## 10. Mensaje sugerido para el chat nuevo

> Lee `docs/ESTADO-SESION.md` del repo Sistema-Integrado y continúa desde ahí. Hay cambios sin commitear y la base ya está actualizada.
