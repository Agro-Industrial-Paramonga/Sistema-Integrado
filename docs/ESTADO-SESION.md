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

---

## 11. Switch de alarmas por persona (2-nov)

En **Turnos y sesiones** (portal, `turnos.js`) cada fila de *Unidades en turno* y de
*Sesiones abiertas* tiene un interruptor: **verde** recibe alarmas, **rojo** no le
llega ninguna. El silencio es **permanente** hasta que se vuelva a poner en verde;
no se borra al cerrar sesión, al liberar ni al reiniciar el celular. Vale para
jefes y conductores. La sesión no se toca: la persona sigue en el portal.

Dónde se corta (dos puertas, no hace falta nada en el celular):

| Puerta | Qué cubre |
|---|---|
| `destinatarios_push()` | alarmas generales (medidas, semáforo) y evacuación a conductores |
| `token_silenciado()` | envíos directos a un celular (alerta a unidad, punto crítico), que la función edge manda con `token:` |

- Tabla `alarmas_silenciadas` (`clave` normalizada, `user_id`, `apagada_en`, `apagada_por`).
- `alternar_alarma(p_clave_quien, p_user_id, p_apagar, p_tipo)` — misma guarda que
  liberar (`puede_liberar`); deja rastro en `app_log` con origen `alarma_mute`.
- `sesiones_panel_lista()` y `unidades_en_turno()` ahora devuelven `alarma_off`.
- `norm_persona()` aplana tildes no, pero sí saltos de línea y espacio duro:
  ojo que `HIDALGO JAMANCA EVA` está guardada con `" \n"` al final.

**Función edge:** quedó reescrita **sin imports** (`fetch` a PostgREST y FCM).
Motivo: la Management API (`PATCH /v1/projects/{ref}/functions/{slug}` con `body`)
no resuelve imports remotos y la función se cae con `BOOT_ERROR`; con imports solo
se puede desplegar por multipart/eszip. Versión desplegada: **19**. El archivo del
repo es el mismo que está publicado; si se sube desde la CLI, la versión sube igual.

**SQL aplicado:** `plan-contingencia/sql/alarmas_silenciadas.sql` (idempotente).
Para dejar a todos recibiendo: `delete from alarmas_silenciadas;`.

---

## 12. Fotos y ficha de puntos para Gerencia de Campo (3-nov)

- `puedeEditarPunto()` (mapa.js): Gerencia de Campo (`gerencia_key` que empieza
  con "GERENCIA DE CAMPO", rol `gerente_campo` o sección/área con ese texto) y
  Seguridad Industrial. La ficha del punto abre **ya editable**, sin encender el
  modo edición del mapa: mover puntos, dibujar y las máquinas siguen siendo solo
  de Seguridad Industrial (`puedeEditarMapa()`).
- La galería acepta un cuarto argumento `puedeSubir`; **subir** foto depende del
  contexto y **borrar** (la ×) sigue siendo solo de Seguridad Industrial.
- Las compuertas no cambian: su ficha sigue pidiendo *Editar*.
- RLS: `mapa_puntos` y `mapa_fotos` tienen política `using(true)`, así que el
  permiso es de interfaz, no de base.

---

## 13. Quién recibe cada alarma (push) — 6-nov

| Alarma | Destinatarios |
|---|---|
| Cambio de semáforo (verde/amarillo/rojo) | **todos** los que tengan sesión de portal abierta y token, incluido rol `area` |
| Alarma de una medida (botón y cron de 8:00) | **solo `jefe_area` / `sup_area` / gerentes del área** destinataria; **nunca** rol `area` |

Antes no se podía distinguir: la alarma de medidas se dirige por **área** (`userId`),
y `push_subscriptions.user_id` guarda la **sección**, así que le llegaba a cualquiera
con esa sección. Se agregó la columna `rol`:

- **SQL aplicado:** `plan-contingencia/sql/push_rol_area.sql` (idempotente).
  Agrega `push_subscriptions.rol` y recrea `destinatarios_push()` para devolverlo.
- `script.js` (`guardarTokenPush`) guarda el rol del que registra el celular.
- Edge `send-push-notification` **v20**: si el envío lleva `userId` (medida), descarta
  las suscripciones con `rol = 'area'`; sin `userId` (semáforo) manda a todos.
- Tokens viejos con `rol` nulo siguen recibiendo como antes hasta que la persona
  vuelva a iniciar sesión (ahí se completa el rol).

**Rol `area` de Gerencia de Campo**: entra directo a `mapa.html` (solo compuertas).
Por eso `entrarApp()` ahora llama a `activarNotificacionesPush()` **antes** de
redirigir, con una espera corta hasta que el token queda guardado; sin eso no
recibían ni el aviso de semáforo.

---

## 14. Volumen de la alarma: que suene aunque esté en silencio — 6-nov

`AlarmaActivity.java` (APK):

- La sirena y el TTS usan `USAGE_ALARM`; el canal de alarma no lo apaga el modo
  silencio/vibrar de Android.
- Al abrir la alarma se **guarda el volumen**, se pone `STREAM_ALARM` al máximo y un
  vigilante lo vuelve a subir cada segundo. Al pulsar DETENER se restaura el anterior.
- Las teclas de volumen/mute se consumen mientras la pantalla de alarma está al frente.
- **No molestar**: si el filtro bloquea las alarmas, con `ACCESS_NOTIFICATION_POLICY`
  se abre el filtro mientras dura la alarma y se restaura después; si el permiso no
  está concedido, se muestra el botón *PERMITIR SONIDO DE ALARMA*, que abre directo
  `Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS`.
- La voz (TTS) también va por el canal de alarma, así no la silencia el volumen de
  multimedia.

Límite conocido: no se puede vencer un apagado, modo avión, ni el "silencio total"
de un fabricante que ignore el permiso.

---

## 15. Permisos obligatorios, de a uno — 9-nov

`MainActivity.java` (APK). Antes los permisos se pedían de golpe al abrir (notificaciones
como diálogo del sistema + "Permitir actualizaciones") y todos se podían saltar con
*Ahora no*.

**Cola única del portal** (`exigirPermisosPortal()`), en este orden:

| # | Paso | Botón | Qué abre |
|---|---|---|---|
| 1 | Notificaciones (13+) | Permitir | diálogo del sistema |
| 2 | Pantalla completa (14+) | Abrir ajustes | pantalla completa |
| 3 | No molestar | Abrir ajustes | acceso a No molestar |
| 4 | Instalar apps (8+) | Abrir ajustes | orígenes desconocidos |

- Se piden **uno por vez**, con el título `Permiso N de M` y el texto "Es obligatorio
  para usar la app". No hay botón negativo: se revalida cada segundo y al volver a la
  app; si niega, vuelve el mismo paso.
- Se activa al entrar a **`plan-contingencia/**`** (no en la portada, ni en Hallazgos,
  ni en `licencias.html`), o sea también para el conductor.
- **Atrás** no hace nada mientras haya pasos pendientes.
- Pantalla completa: **una vez concedida no se vuelve a pedir**. Se eliminaron
  `avisarPantallaCompleta()`, `avisarNotificacionesApagadas()`,
  `pedirPantallaCompletaAlIniciar()` (código muerto) y
  `Actualizador.pedirPermisoInstalacion()`.
- El aviso de "canal de alarma silenciado" sigue suelto, pero ya no se encima a la cola.

**Portón de unidades** (`exigirUbicacionObligatoria()`): sin cambios. Ubicación precisa,
interruptor, "todo el tiempo", notificaciones, pantalla completa y batería; con su botón
*Cerrar app*, dentro de "iniciar turno".

**Cámara y fotos**: no bloquean. `tomarFoto()` pide el permiso en cada toque y, si
Android ya no muestra el diálogo, abre Ajustes (`pedirPermisoCamara()`). Galería y
archivos llaman a `pedirPermisoFotos()` al tocar la opción; si falta, avisa y pide de
nuevo en el siguiente toque.

Versiones: `script.js?v=69`, `mapa.js?v=65`.

---

## 16. Webhook de NotiAlarm para los iPhone (jefes y gerencias) — 6-nov

Hasta aquí la alarma del iPhone era código muerto: `notialarm_webhook` existía en la
tabla, pero **ninguna fila lo tenía** y no había forma de cargarlo desde la aplicación.
Un jefe con iPhone no se identificaba en ningún lado, porque la sesión se engancha por
`token_push` y un iPhone no tiene token FCM.

**Cómo queda.** En *Turnos y sesiones* → *Sesiones abiertas*, cada fila gana un botón
**Webhook** (solo lo ve Seguridad Industrial). Ahí se pega la URL privada de NotiAlarm
de esa persona; al guardar, ese iPhone recibe las mismas alarmas que un Android:
pantalla completa, sonando hasta que se detiene, con el teléfono en silencio.

| Regla | Cómo queda |
|---|---|
| Quién lo carga | Solo sección **Seguridad Industrial** exacta (`es_seguridad_industrial()`). Ni Gerencia General, ni Seguridad Patrimonial, ni los propios jefes |
| Identidad | La URL va pegada a la **persona**, no a la sesión: se guarda con `token = 'ios-' || md5(norm_persona(user_id))` |
| Al cerrar sesión | Deja de sonar (no hay sesión viva). La URL **no** se borra |
| Al volver a entrar | Se reengancha sola en `abrir_sesion_panel()` |
| Interruptor verde/rojo | Manda igual que para Android: en rojo `destinatarios_push()` no devuelve la fila, aunque la URL esté cargada. El silencio sobrevive al cierre de sesión y al reinicio |
| Cambio de teléfono | Al guardar una URL nueva se borra la fila `ios-` anterior de esa persona |
| URL muerta | Botón *Probar* (pasa por la función edge, que sí puede hacer el POST) y se guarda el resultado en `webhook_estado` / `webhook_probado_en`; la fila se pinta en rojo |

**Cambios de base** (`plan-contingencia/sql/webhook_notialarm.sql`, ya aplicado):
`es_seguridad_industrial()`, `token_ios()`, `registrar_webhook_notialarm()`,
`quitar_webhook_notialarm()`, `marcar_webhook_probado()`, y se recrean
`destinatarios_push()`, `sesiones_panel_lista()` y `abrir_sesion_panel()`.

- `destinatarios_push()`: la fila `ios-%` entra por **persona con sesión abierta**, no por
  `token_push`. Así el iPhone suena aunque esa persona tenga además un Android enganchado.
- `abrir_sesion_panel()`: el barrido ya **no** borra las suscripciones con webhook
  (`and ps.notialarm_webhook is null`); si no, la URL se perdía en el siguiente login.
- `sesiones_panel_lista()` devuelve `webhook`, `webhook_estado`, `webhook_probado_en`,
  `webhook_token` y `puede_webhook`.

**Función edge `send-push-notification` v21:** el POST a NotiAlarm manda
`message: "<título> — <cuerpo>"` (NotiAlarm solo lee `alert_tag`, `tag`, `message` o
`title`, así que antes se perdía el cuerpo) y acepta `{ probar, webhook }` para el botón
*Probar*, sin tocar la base ni FCM.

**Cuenta borrada:** `SST` (rol `area`, sección Seguridad Industrial, inactiva) ya no
existe; solo quedaba esa fila, sin registros colgando.

Versiones: `turnos.js?v=4`.

**Pendiente de probar en un iPhone real**: cargar una URL de verdad, *Probar* y disparar
una alarma de semáforo. En el navegador headless se verificó el panel completo con datos
simulados (botón, modal, guardar, quitar, URL inválida y el aviso de interruptor en rojo).

### Texto igual al del Android (6-nov, más tarde)

El iPhone pedía una sola línea y estaba recibiendo `Semáforo: VERDE - Antes AMARILLO…`,
mientras la pantalla del APK dice otra cosa. Ahora `semaforo.js` manda la frase exacta de
`AlarmaActivity.java` y la función la entrega tal cual (`soloCuerpo: true`), sin título
delante:

- VERDE: «José Mariano Melgar Belmont ha declarado el estado de emergencia en nivel VERDE.»
- AMARILLO: «…nivel AMARILLO. Se solicita ejecutar inmediatamente las actividades que
  comprenden el plan de contingencia.»
- ROJO: «…Estado de Emergencia en Nivel ROJO. Se solicita ejecutar…»

El texto está duplicado a propósito (APK en Java, web en JS). Si cambia el nombre del
declarador o la redacción, hay que tocar los dos lados y recompilar el APK.

**Se perdió** el «Antes X · Declaró X» que llevaba el aviso: el texto del APK no lo tiene.

La función va por la **v24**. Dos fallos de despliegue corregidos: el guion largo se
guardaba mal (PowerShell leía el archivo como cp1252 y llegaba `â€”` al iPhone) y por lo
mismo el 🚨 y los acentos de los textos por defecto estaban corruptos en las v21–v22.
Al desplegar hay que leer el archivo con `[IO.File]::ReadAllText($ruta, UTF8)`.

**Fallo corregido (6-nov, noche)**: `registrar_webhook_notialarm()` tomaba la persona de
la **sesión de quien cargaba**, no de la fila abierta. Si Seguridad Industrial cargaba el
webhook de otra persona, la URL se guardaba a su propio nombre —y como la URL es la del
teléfono, sonaba igual, lo que disimulaba el error—. Ahora la función recibe `p_user_id` y
`p_clave` solo acredita el permiso. La ventana del panel guarda además la fila entera
(`WH_FILA`) en vez del índice de la lista. Versión de `turnos.js`: **v=5**.

Antes de este arreglo quedó una fila `ios-` a nombre de VILLAFRANCA ROMERO EDINSON
ALEXANDER con una URL que no es suya: hay que quitarla con el botón *Quitar* de su fila y
volver a cargar la URL en la persona correcta.

---

## 17. Alarmas por persona, alarma de compuertas y evacuación única (12-nov)

Cambio de modelo: **lo que suena en el celular ya no lo decide el rol, lo decide una casilla
por persona**. El rol sigue mandando en los permisos del portal y en los valores iniciales.

### Catálogo y casillas

| Clave | Alarma | Quién la recibe (punto de partida) | En el panel |
|---|---|---|---|
| `semaforo` | Cambio de semáforo | Todos menos rol `area` (45) | sí |
| `compuertas` | Rojo → abrir/cerrar compuertas | 16: rol `area` + `sup_area` de *Administradores de campo* | sí |
| `medida` | Alarma de una medida | Todos menos rol `area` (45) | sí |
| `evac_auto` | Evacuación en rojo, a todas las unidades | Conductores (lo gobierna el switch verde/rojo) | no |
| `evac_manual` | Evacuación puntual desde el mapa | El conductor de esa unidad | no |
| `actos` | Actos inseguros (Hallazgos) | Jefe de sección | no |

- Tablas nuevas: `alarmas_catalogo` y `suscripciones_alarma` (RLS sin políticas: solo entra
  el service_role y las funciones `security definer`).
- `alarmas_por_defecto(rol, seccion)` devuelve las casillas iniciales.
- **La casilla manda sobre el rol**: si a un jefe se le marca `compuertas`, le llega.
- El switch verde/rojo (`alarmas_silenciadas`) sigue siendo el maestro: en rojo no llega
  nada, aunque la casilla esté marcada.
- SQL: `plan-contingencia/sql/alarmas_por_persona.sql` (idempotente, ya aplicado).

### Reparto (`destinatarios_push`)

Nuevo parámetro `p_alarma`. Filtra por la casilla **solo para alarmas del panel**
(`en_panel = true`); las de conductor siguen gobernadas por el switch. Se quitó la exclusión
fija de rol `area` que estaba en la función edge. La función se revocó para `anon` y
`authenticated`: solo la llama la edge con service_role.

Migración incluida: las suscripciones que estaban a nombre de una **sección**
(`Seguridad Industrial`, `Ingeniería Agrícola`, etc.) se reasignaron a la persona de su
sesión abierta. Sin eso, 7 celulares habrían dejado de recibir todo.

### Alarma nueva de compuertas y evacuación única

`alarmar_rojo()` (`sql/alarma_rojo.sql`), llamada desde `declarar_semaforo` y por el cron de
cada minuto (`evacuar_rojo`, que ahora es un envoltorio). Estado por declaración en
`alarmas_estado` (marcas `evac_auto` y `compuertas`) — no repite dentro del mismo rojo.

- **Evacuación**: a **todas** las unidades en `sesiones_unidad`, sin mirar campos ni 300 m.
  Texto igual al de antes. `evac_auto.js` **se eliminó** (el script del celular nunca
  funcionó desde el 29-oct: leía `localStorage['conductor']`, que ya nadie escribe, y solo
  se cargaba en `conductor.html`).
- **Compuertas**: un aviso, título `ALERTA ROJA · COMPUERTAS`, texto
  «José Mariano Melgar Belmont declaró el estado de alerta rojo. Proceder a abrir las
  compuertas y cerrar compuertas de acuerdo al plan de emergencia.»

### Se retiró

- Alerta al asignar una máquina a un punto crítico (`alertarMaquina`), y el cálculo de
  polígonos de evacuación en `mapa.js` (los campos se siguen pintando de rojo).
- Alarma diaria de medidas vencidas: `scripts/alarma-medidas-antes.mjs` y su workflow.

### Panel «Usuarios y alarmas»

`plan-contingencia/alarmas_panel.js` + `sql/usuarios_panel.sql`. Solo Seguridad Industrial
(`puedeVer()` + validación de servidor en cada RPC).

- Lista las 53 personas con tres casillas; buscador por nombre (sin tildes/mayúsculas),
  filtro por sección y «solo activos».
- **+ Agregar persona**: nombre, sección, rol, gerencia y contraseña. Si se deja vacía, la
  calcula `apellido_password()` = primer apellido + 2026 (`DE LA CRUZ` → `delacruz2026`,
  `MUÑOZ` → `munoz2026`). La persona aparece sola en el buscador del login.
- ✎ permite cambiar sección, rol, gerencia, contraseña y dar de alta/baja.
- La contraseña recién creada se muestra una sola vez en el panel.

### Versiones

`script.js?v=71`, `semaforo.js?v=13` (index) / `?v=11` (mapa), `mapa.js?v=67`,
`alarmas_panel.js?v=1`. Edge `send-push-notification` **v26** (acepta `alarma`; mientras un
equipo tenga abierta la versión vieja del portal, sin `alarma`, mantiene la regla antigua de
no mandar la medida a los de rol `area`).

### Pendiente de probar en un celular real

Declarar rojo y confirmar que: (a) las unidades en turno suenan, (b) los administradores de
campo reciben solo compuertas, (c) los jefes reciben solo el semáforo, (d) con el switch en
rojo no llega nada. En el navegador headless se verificó el panel (53 filas, buscador,
casilla que persiste, formulario) y las RPC; el envío real no se disparó para no alarmar.

**Ojo operativo:** al 12-nov hay **24 de 27 sesiones de portal con las alarmas en rojo** y
las 6 unidades en turno silenciadas (quedaron así de las pruebas del mediodía). Con eso, la
alarma de semáforo no llega a nadie hasta que se vuelvan a poner en verde.

---

## 18. Permisos por persona y arreglo del reparto de alarmas (12-nov, tarde)

### El fallo que se reportó

«Apago el semáforo a una persona y le sigue llegando». La casilla se guardaba bien
(`app_log` lo prueba): el problema era **a quién se le atribuía el celular**.

`push_subscriptions` tenía **80 filas** y el mismo token a nombre de 2 o 3 personas
(`cbOoDZc…` estaba en AGUILA CHINCHAY, ASENCIOS SANCHEZ y VILLAFRANCA). La función
`destinatarios_push` emparejaba la suscripción con la sesión **solo por token**
(`s.token_push = ps.token`), así que la fila de cualquiera de esos tres pasaba el filtro.
Después se aplicaba la casilla **de esa fila**, y `distinct on (token)` devolvía una al azar.
Bastaba que uno de los tres tuviera el semáforo prendido para que el teléfono sonara.

El cliente además registraba el celular **por sección** (`guardarTokenPush` usaba
`user.seccion`), no por persona, y `cerrar_sesion_panel` no borraba la suscripción.

### Cómo queda

| Regla | Detalle |
|---|---|
| Un equipo, un dueño | `registrar_token_persona()` guarda el token a nombre de la persona de la sesión. Si el token ya estaba a nombre de otro, **borra esas filas** |
| El dueño manda | `destinatarios_push` resuelve primero **de quién es el celular** (persona de la sesión viva más reciente con ese token) y después aplica maestro y casilla |
| Sin rastro al salir | `cerrar_sesion_panel` borra la suscripción de ese token (las `ios-` con webhook no se tocan) |
| Orden de filtros | switch maestro (`alarmas_silenciadas`) → casilla (`suscripciones_alarma`) → enviar. Sin reglas por rol |
| Limpieza | cada token quedó con **una** fila: de 80 a 31 |

### Permisos de visibilidad (nuevos)

Columnas en `usuarios`: `puede_medidas`, `puede_mapa`, `puede_compuertas`.

- `mapa` implica `compuertas`; `compuertas` sola es válida; `medidas` es independiente.
- **Semáforo**: lo ven quienes tengan `medidas` o `mapa`. El de solo compuertas no.
- `rol` y `gerencia_key` quedan como dato de registro: **no dan visibilidad ni alarmas**.
- Migración: a los 53 usuarios se les puso lo que ya veían (8 quedaron solo compuertas).

### Paneles

| Panel | Qué hace |
|---|---|
| **Usuarios y alarmas** (`alarmas_panel.js?v=2`) | Las 53 personas, estén o no logueadas. Interruptor **Todas** + casillas semáforo / compuertas / medida. Ya **no** da de alta |
| **＋ Personas** (`personas_panel.js?v=1`) | Alta y edición: nombre, sección, contraseña, rol y gerencia (solo registro) y los tres permisos. Las casillas de alarma del usuario nuevo **arrancan apagadas** |

Los dos son solo de Seguridad Industrial y comparten `alarmas_personas_lista()`.

### SQL aplicado

`plan-contingencia/sql/permisos_usuario.sql` (idempotente). Recrea `mi_perfil`,
`crear_usuario_panel`, `editar_usuario_panel`, `alarmas_personas_lista`,
`destinatarios_push`, `cerrar_sesion_panel`, `adjuntar_token_dispositivo` y agrega
`registrar_token_persona` y `permisos_por_defecto`.

Es compatible con el cliente anterior: la app publicada sigue registrando por sección y
`destinatarios_push` igual resuelve el dueño por la sesión.

### Verificado en local (sin disparar alarmas)

- Panel de alarmas: 53 filas, 5 columnas, 53 maestros, 159 casillas, sin botón de alta.
- Panel de personas: 53 filas; al marcar **Mapa** se marca y bloquea **Compuertas**.
- Reparto: casilla encendida → entra; apagada → no entra; maestro en rojo → no entra.
- Regresión del bug: con el mismo token a nombre de dos personas, decide la casilla del
  **dueño de la sesión**, no la del otro.
- Solo compuertas: `mapa.html` abre el panel, sin mapa y sin semáforo.

### Versiones

`script.js?v=72`, `semaforo.js?v=14` (index) / `?v=12` (mapa), `mapa.js?v=68`,
`compuertas.js?v=11`, `alarmas_panel.js?v=2`, `personas_panel.js?v=1`.

El APK carga la web publicada (`capacitor.config.json` → `server.url`), así que toma estos
cambios al publicar; no hace falta recompilar.






