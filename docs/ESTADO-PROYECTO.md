# Estado del proyecto — Sistema Integrado (Agro Industrial Paramonga)

> Documento de contexto para retomar el trabajo en un chat nuevo.
> Última actualización: 26/10/2026

---

## 1. Qué es

Plataforma interna de **Seguridad y Salud en el Trabajo** con:

- **Portal** con dos aplicaciones: *Plan de Contingencia* y *Hallazgos AIP*
- **APK Android** (Capacitor) con alarma a pantalla completa, GPS en segundo plano y actualizador propio
- **Base de datos** en Supabase

Uso real: ~70 conductores de campo + ~40 jefes y gerencias.

---

## 2. Enlaces

| Recurso | URL |
|---|---|
| Repositorio | https://github.com/Agro-Industrial-Paramonga/Sistema-Integrado |
| App publicada (web) | https://agro-industrial-paramonga.github.io/Sistema-Integrado/ |
| Plan de Contingencia | https://agro-industrial-paramonga.github.io/Sistema-Integrado/plan-contingencia/index.html |
| Ingreso de conductores | https://agro-industrial-paramonga.github.io/Sistema-Integrado/plan-contingencia/conductor.html |
| Mapa | https://agro-industrial-paramonga.github.io/Sistema-Integrado/plan-contingencia/mapa.html |
| Releases (APK) | https://github.com/Agro-Industrial-Paramonga/Sistema-Integrado/releases |
| Actions (compilaciones) | https://github.com/Agro-Industrial-Paramonga/Sistema-Integrado/actions |
| Configuración Actions | https://github.com/Agro-Industrial-Paramonga/Sistema-Integrado/settings/actions |
| version.json (aviso de actualización) | https://agro-industrial-paramonga.github.io/Sistema-Integrado/app/version.json |

### Supabase

| Proyecto | Ref | Panel |
|---|---|---|
| Plan de Contingencia (principal) | `bfhfnldqwsrcpsdqpyat` | https://supabase.com/dashboard/project/bfhfnldqwsrcpsdqpyat |
| Hallazgos | `bfwyedbiguytlrooiglj` | https://supabase.com/dashboard/project/bfwyedbiguytlrooiglj |

- Edge Function: `https://bfhfnldqwsrcpsdqpyat.supabase.co/functions/v1/send-push-notification`
- Ambos proyectos usan **la misma tabla** `push_subscriptions` del proyecto Plan.
- Clave pública (anon): `sb_publishable_z-jW4WrGLq7wEhCI_CW3Ig_vQZwtOMh` (está en el código, es pública)

### NotiAlarm (iPhone)

Webhooks guardados en `push_subscriptions.notialarm_webhook`. Cada dispositivo tiene su propia URL `https://fugmrmfyvzfwectbnawe.supabase.co/functions/v1/wh/ing_...`

---

## 3. Repositorio local

```
C:\Users\edins\Documents\GitHub\Sistema-Integrado
```

- Rama: `main`
- Remoto: `git@github.com:Agro-Industrial-Paramonga/Sistema-Integrado.git` (SSH con llave local, ya autorizada)
- Usuario git: Edinson Villafranca

### Carpetas

| Ruta | Contenido |
|---|---|
| `index.html` | Portal con las dos aplicaciones |
| `plan-contingencia/` | App del plan (medidas, mapa, conductores) |
| `hallazgos/` | App de hallazgos AIP |
| `app/` | Proyecto Capacitor (fuentes del APK) |
| `app/android/` | Proyecto Android nativo |
| `app/version.json` | Versión publicada (para el aviso de actualización) |
| `app/android/keystore/debug.keystore` | Clave de firma fija del APK |
| `.github/workflows/publicar-apk.yml` | Compila y publica el APK automáticamente |
| `.github/workflows/alarma-medidas-antes.yml` | Alarma diaria 8:00 (medidas vencidas) |
| `.github/workflows/alarma-actos-inseguros.yml` | Alarma de actos inseguros |
| `scripts/` | Scripts Node de las alarmas |

---

## 4. Cómo funciona la actualización del APK (automático)

1. Se hace `push` a `main` con cambios en `app/android/**`
2. GitHub Actions compila el APK, lo firma con `debug.keystore` y crea un release `vXXX`
3. El workflow actualiza `app/version.json` con el nuevo `versionCode`
4. En cada celular, al abrir la app, se compara la versión instalada con `version.json`
5. Si hay nueva: diálogo **"Nueva versión disponible"** → descarga e instala (un toque)

**Cambios web (HTML/JS) NO necesitan APK**: se actualizan al cerrar y abrir la app.

### Comandos útiles

```powershell
# compilar local
cd app\android
.\gradlew.bat :app:assembleDebug

# publicar manualmente (o dejar que el push lo haga)
# el APK queda en: app\android\app\build\outputs\apk\debug\app-debug.apk
```

---

## 5. Modelo de datos (proyecto Plan)

| Tabla | Contenido |
|---|---|
| `usuarios` | Jefes y gerencias: `area` (nombre persona), `password`, `rol`, `gerencia_key`, `seccion` |
| `medidas_antes` / `medidas_durante` / `medidas_despues` | Actividades del plan, con `estado`, `costo`, `segmento_id` |
| `segmentos` | Agrupadores de medidas (por tabla) |
| `medidas_avances` | Bitácora de avances/compromisos por medida |
| `unidades` | Maquinaria: `nombre` (ej. TRR-263), `prefijo`, `orden`, `activo` |
| `conductores` | 95 conductores con DNI: es la identificación del ingreso (capa previa por DNI) |
| `ubicaciones` | Última posición por conductor: `user_id`, `unidad`, `lat`, `lon`, `token` |
| `push_subscriptions` | Tokens FCM y webhooks NotiAlarm por usuario/unidad |
| `mapa_capa` | Posición de las imágenes superpuestas (id 1 = canales, id 2 = puntos críticos) |
| `mapa_puntos` | Puntos críticos numerados: `orden`, `nombre`, `lat`, `lon`, `tipo` |
| `mapa_lineas` | Líneas y zonas: `color`, `grosor`, `tipo` (linea/poligono), `coords` |
| `mapa_maquinas` | Maquinaria colocada: `unidad`, `lat`, `lon`, `punto_orden`, `tamano` |
| `app_log` | Diagnóstico remoto (se escribe desde la app) |

### Roles

| Rol | Permisos |
|---|---|
| `gerente_general` | Ve todo, no edita |
| `gerencial_legal` | Ve todo, no edita |
| `area` | Edita solo las medidas de su `seccion` |

**Excepción**: usuarios con sección *Seguridad Industrial* (César Chunga) editan **todas** las áreas.

---

## 6. App Android (APK)

Paquete: `com.aipsa.sistema` · Nombre: "Seguridad y salud en el trabajo"

### Funciones nativas clave

| Archivo | Función |
|---|---|
| `MainActivity.java` | WebView, permisos, puente JS, caché por versión, reanudar servicio |
| `UbicacionService.java` | Servicio en primer plano: envía ubicación cada **5 minutos** |
| `UbicacionWorker.java` | Respaldo horario (WorkManager) |
| `UbicacionScheduler.java` | Arranca/detiene el servicio y guarda usuario+unidad |
| `AlarmaActivity.java` | Pantalla completa, sirena generada, voz TTS |
| `AlarmaFcmService.java` | Recibe FCM y dispara la alarma |
| `AlarmaNotificacion.java` | Canal `alarma_v2` (silencioso, la sirena la pone la app) |
| `Actualizador.java` | Revisa `version.json`, descarga e instala el APK |
| `ArranqueReceiver.java` | Reactiva el servicio al reiniciar el teléfono |

### Permisos exigidos (bloqueantes)

Con un turno activo, la app **bloquea** hasta que el usuario conceda:

1. Ubicación precisa
2. Ubicación **"todo el tiempo"**
3. **Exención del ahorro de batería**

Se revisa cada 4 segundos. Sin esto, el envío en segundo plano muere.

### Puente JS ↔ nativo (`window.AndroidUbicacion`)

| Método | Uso |
|---|---|
| `iniciarServicio(usuario, unidad)` | Arranca el envío y pide exención de batería |
| `detenerServicio()` | Detiene el envío |
| `obtenerSesionGuardada()` | Devuelve `usuario|unidad` guardado en el teléfono |
| `tienePermisoUbicacionNativo()` | Estado real de los permisos |
| `pedirNotificaciones()` / `pedirPantallaCompleta()` | Permisos adicionales |

---

## 7. Flujo del conductor

1. Login del plan → menú ☰ → **Ingreso de Maquinarias**
2. **DNI** (capa previa: teclado numérico, sin sugerencias ni autocompletado) → la pantalla fija DNI y nombre del conductor
3. Serie → Unidad → **Iniciar turno**
4. Acepta permisos (ubicación, notificaciones, batería)
5. Se registra el token y arranca el servicio de 5 minutos
6. En el mapa, el jefe ve la unidad y puede **alertar evacuación**

El DNI identifica, no autentica: quien conozca un DNI de la lista puede usarlo. Una barrera real exigiría PIN o código por unidad.
Si el DNI no está en `conductores` la pantalla avisa y no deja seguir; el enlace *No soy yo* reinicia la identificación (celular compartido).

Series disponibles: `PUNTOS CRITICOS`, `ESCOCIA`, `TRR`, `TRO`, `RTE`, `EXC`, `CF`, `CF_R`, `MIC`, `VOL`, `CMB`, `CMG`, `CMC`

### Máquinas de puntos críticos (serie PUNTOS CRITICOS)

```
G01 EXCAVADORA DE RUEDAS        → puntos 1 a 4
G02 RETROEXCAVADORA             → puntos 5 a 9
G02 EXCAVADORA DE ARRASTRE      → puntos 5 a 9
G03 RETROEXCAVADORA             → puntos 10 a 11
```

---

## 8. Mapa (pestañas)

**Pestaña 1 — Seguimiento de maquinarias**: satélite, capa de canales, unidades en vivo, alerta de evacuación por unidad.

**Pestaña 2 — Puntos críticos**: puntos numerados, líneas (roja/amarilla/turquesa), zonas rellenas, maquinaria colocada y asignada a puntos.

- Radio de asignación maquinaria→punto: **150 m**
- Al mover una máquina a otro punto y **Guardar**, se envía alerta al conductor de esa unidad
- El editor solo aparece en computadora y a usuarios autorizados

### Puntos críticos (numerados)

```
1 Zanjón            7 Toma Chilcal
2 Paradero Cañada   8 Toma Colorada
3 Ingreso Cañada    9 Toma 3 Compuertas
4 Toma Menacho     10 Alcantarilla Panamericana
5 Toma Molle       11 Cruce Huaraz
6 Toma Buitrón
```

---

## 9. Alarmas

| Alarma | Cómo funciona |
|---|---|
| Evacuación por unidad | Botón en el popup del mapa → push a ese token |
| Medidas vencidas | GitHub Action diaria 8:00 (Perú) |
| Actos inseguros | GitHub Action diaria |
| No llega al emisor | La función excluye el token del que envía |

Cadencia de actos inseguros: el día del reporte y el primer día de plazo no alarman; desde el día 2 acumulado, 1 alerta por día, máximo 5.

---

## 10. Problemas conocidos / pendientes

| Tema | Estado |
|---|---|
| Ingreso por DNI (capa previa, teclado numérico, sin autocompletado) | Implementado y verificado en navegador; falta probar en celular real |
| Envío cada 5 min depende de la exención de batería | Implementado, falta validar en campo |
| Fabricantes (Xiaomi, Huawei, Samsung) pueden matar el servicio | Requiere configuración adicional del teléfono |
| Caché del WebView | Se limpia automáticamente al cambiar de versión |
| Token de Supabase (PAT) | Se usó para crear tablas; **debe revocarse** al terminar |
| Limpieza de `ubicaciones` antiguas | Manual; se puede automatizar |

---

## 11. Accesos y secretos

- **GitHub**: se usa la llave SSH del equipo (`~/.ssh/id_ed25519`), ya autorizada en la cuenta. No requiere token.
- **Supabase**: las tareas de base se hicieron con un *Personal Access Token* (`sbp_...`) que **debe revocarse** en Account Settings → Access Tokens cuando ya no se necesite.
- **Firebase/FCM**: las credenciales (service account) están en los *secrets* de la Edge Function en Supabase.

---

## 12. Cómo retomar en un chat nuevo

Mensaje sugerido:

> Lee `docs/ESTADO-PROYECTO.md` del repositorio Sistema-Integrado y continúa desde ahí. Te doy acceso a Supabase si hace falta.

Con eso el asistente recupera el contexto sin releer todo el código.
