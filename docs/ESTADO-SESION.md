# Estado del trabajo — Plan de Contingencia (para chat nuevo)

> Documento de traspaso. Lo último está en `main` (`ee19d88`), publicado en GitHub Pages.
> Leer esto antes de tocar código. No hace falta releer todo el proyecto.

---

## 1. Dónde está todo

| Qué | Dónde |
|---|---|
| Repo local | `C:\Users\edins\Documents\GitHub\Sistema-Integrado` |
| Remoto | `git@github.com:Agro-Industrial-Paramonga/Sistema-Integrado.git` (SSH, llave ya autorizada) |
| Rama | `main` |
| App publicada | https://agro-industrial-paramonga.github.io/Sistema-Integrado/ |
| Mapa | https://agro-industrial-paramonga.github.io/Sistema-Integrado/plan-contingencia/mapa.html |
| Ingreso conductores | https://agro-industrial-paramonga.github.io/Sistema-Integrado/plan-contingencia/conductor.html |
| Releases APK | https://github.com/Agro-Industrial-Paramonga/Sistema-Integrado/releases |

**Publicar** = `git add` + `commit` + `git push origin main`. GitHub Pages reconstruye solo en ~1 minuto.
El APK **no** se recompila: el workflow `publicar-apk.yml` solo se dispara con cambios en `app/android/**`.

---

## 2. Supabase

| Dato | Valor |
|---|---|
| Proyecto | `bfhfnldqwsrcpsdqpyat` |
| URL | `https://bfhfnldqwsrcpsdqpyat.supabase.co` |
| Clave pública | `sb_publishable_z-jW4WrGLq7wEhCI_CW3Ig_vQZwtOMh` |
| Dashboard | https://supabase.com/dashboard/project/bfhfnldqwsrcpsdqpyat |

**Importante:** solo hay clave pública (está en el código, es pública por diseño). **No hay `service_role` ni token personal guardados**, así que desde el chat **no se puede crear ni alterar esquema**. Cualquier DDL se ejecuta a mano en *SQL Editor* del dashboard. Si algún día hace falta, el usuario puede generar un PAT en https://supabase.com/dashboard/account/tokens (y revocarlo al terminar).

Tablas que usa el trabajo nuevo:

| Tabla | Uso |
|---|---|
| `compuertas` | id, administracion, nombre, estado (`abierta`/`cerrada`), actualizado_por, actualizado_en |
| `compuertas_contactos` | responsables por compuerta (FK con `on delete cascade`) |
| `semaforo_estado` | fila única `id = 1` con el nivel vigente |
| `semaforo_eventos` | historial de cambios del semáforo |

Los SQL quedaron archivados y **ya ejecutados**: `plan-contingencia/sql/compuertas_responsables.sql` y `plan-contingencia/sql/semaforo.sql`.

**Seguridad pendiente:** todas las políticas RLS son abiertas (`using (true)` para `anon`). Cualquiera con la clave pública puede escribir en compuertas y en el semáforo. El control por rol es solo de pantalla.

---

## 3. Qué se construyó

### a) Panel de compuertas — `compuertas.js`
- Solo visible para **Seguridad Industrial** (`pcPuedeVer()` busca "seguridad industrial" o "chunga" en `pc_user`).
- Pestañas Administración 1 / 2 / 3, alta y baja de compuertas, responsables con `tel:`.
- Datos: 18 compuertas, 116 responsables.

### b) Campos del KMZ — `mapa.js` (`cargarCampos`)
33 polígonos de `assets/campos.geojson`, visibles solo en la pestaña "Seguimiento de maquinarias".

### c) Semáforo de contingencia — `semaforo.js`
Cuatro niveles. **Verde es el estado base y no se declara**; se declara amarillo, naranja o rojo, y *Cerrar alerta* reinicia a verde.

| Nivel | Lo declara |
|---|---|
| 🟢 Verde | nadie (estado normal) |
| 🟡 Amarillo | Seguridad Industrial o gerencia |
| 🟠 Naranja | Seguridad Industrial o gerencia |
| 🔴 Rojo | Seguridad Industrial o gerencia — y **del rojo solo se sale cerrando la alerta** |

No hay campo de motivo: solo nombre, rol y hora (más una casilla de verificación al cerrar).

**Dónde se ve:**

| Página | Cómo |
|---|---|
| `mapa.html` | Sin banda. La barra blanca queda con borde del color del nivel y un semáforo horizontal de 4 luces en el espacio libre |
| `index.html` (portal) | Encabezado con borde y tinte del color + semáforo al lado del logo |
| `conductor.html` | Banda fija arriba |

Tocar el semáforo abre el panel: estado, quién, cuándo, qué hacer en ese nivel, historial y los botones según el rol. Se sincroniza cada 60 s con Supabase y guarda copia en el celular (si no hay tabla o red, queda en modo local y lo avisa).

---

## 4. Detalles que importan al editar

- Los scripts van con `?v=` (`mapa.js?v=34`, `compuertas.js?v=4`, `semaforo.js?v=1`). **Si tocás un archivo, subí ese número** o el celular sigue con la versión vieja.
- `compuertas.js` y `semaforo.js` reusan la `db` global de `mapa.js`. En `index.html` la `db` viene de `script.js`. No crear un cliente nuevo sin necesidad.
- `semaforo.js` inyecta su propio CSS y su DOM: las páginas solo agregan una línea `<script>`.
- El semáforo en el mapa se detecta por la existencia de `.barra`; en el portal por `.top-bar`; sin ninguna de las dos (conductor) va la banda.

---

## 5. Previsualizar en local

```powershell
C:\Users\edins\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe -m http.server 8099 --bind 0.0.0.0 --directory "C:\Users\edins\Documents\GitHub\Sistema-Integrado"
```

- PC: http://127.0.0.1:8099/plan-contingencia/index.html
- Celular, misma red: http://192.168.1.5:8099/plan-contingencia/index.html (verificar IP)

Alternativa con recarga automática: `previsualizar.bat` (puerto 5501).

---

## 6. Cómo trabajar (acuerdo con el usuario)

- **No sacar capturas de pantalla.** Verificar con `node --check`, `grep` y volcados de DOM solo si hace falta.
- Editar **bloques chicos**, no reescribir archivos completos ni releerlos después.
- Respuestas cortas, sin resúmenes de cierre salvo que se pidan.
- No publicar sin que lo pidan: commit y push solo cuando lo indiquen.

---

## 7. Pendientes / temas abiertos

1. Probar el semáforo en celular real (declarar y cerrar).
2. RLS abierto: si molesta, cerrar escritura y pasar por RPC con validación de rol.
3. Datos de Administración 1: solo hay responsables de zona, faltan supervisores y caporales.
4. Campos del KMZ: 6 sin administración (Santa Rosa M2/M3/M4, Don Walter M1/M2/M3) y nombres con zona/estación en el campo `admin`.
5. Limpieza manual de `ubicaciones` antiguas.
6. APK: el próximo build copia `plan-contingencia` dentro de `app/www` (+~0.9 MB por los GIF).
7. Automatización física de compuertas: piloto con actuador multi-vuelta + encoder + finales de carrera + gateway 4G. Falta medir carrera, torque y disponibilidad eléctrica.

---

## 8. Historial reciente

```
ee19d88 Semaforo sin motivo, cualquier nivel para Seguridad Industrial y del rojo se vuelve a verde
4f031bb Semaforo con luces horizontales y borde en la barra del mapa
e7691de Compuertas con responsables y semaforo de contingencia
f91cd56 Sesion unica por unidad en base con cerrojo de ubicaciones y alertas al titular
```

Mensaje sugerido para el chat nuevo:

> Lee `docs/ESTADO-SESION.md` del repo Sistema-Integrado y continúa desde ahí.
