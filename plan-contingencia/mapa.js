/* ============================================================
   MAPA: seguimiento de maquinarias + puntos críticos
   ============================================================ */

const SUPABASE_URL = 'https://bfhfnldqwsrcpsdqpyat.supabase.co';
const SUPABASE_KEY = 'sb_publishable_z-jW4WrGLq7wEhCI_CW3Ig_vQZwtOMh';
const FUNC_PUSH = 'https://bfhfnldqwsrcpsdqpyat.supabase.co/functions/v1/send-push-notification';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ------------------------------------------------------------
   Capas superpuestas ajustables
   ------------------------------------------------------------ */
const CAPAS = {
    canales: {
        id: 1,
        nombre: 'Seguimiento de maquinarias',
        archivo: 'assets/mapa-canales.png',
        norte: -10.6248, sur: -10.7800, este: -77.6800, oeste: -77.8859,
        opacidad: 0.55,
        overlay: null
    },
    puntos: {
        id: 2,
        nombre: 'Puntos críticos',
        archivo: 'assets/mapa-puntos-criticos.png',
        norte: -10.6400, sur: -10.7800, este: -77.6800, oeste: -77.9000,
        opacidad: 0.85,
        overlay: null
    }
};

let capaActiva = 'canales';
let mapa;
let modoAjuste = false;
let marcNO = null;
let marcSE = null;
let marcadoresUnidades = [];
let simulando = false;
let ultimoEnvio = 0;

/* ------------------------------------------------------------
   Sesion y permisos
   La sesion del conductor se lee de la base al arrancar (por el id del
   equipo). localStorage ya no decide si hay turno.
   ------------------------------------------------------------ */
let SESION_CONDUCTOR = null;

function sesionConductor() {
    return SESION_CONDUCTOR;
}

const CLAVE_DISPOSITIVO = 'pc_dispositivo';

function dispositivoEquipo() {
    try {
        if (window.AndroidUbicacion && window.AndroidUbicacion.obtenerDispositivo) {
            const nativo = String(window.AndroidUbicacion.obtenerDispositivo() || '').trim();
            if (nativo) return nativo;
        }
    } catch (e) {}
    try {
        let id = localStorage.getItem(CLAVE_DISPOSITIVO);
        if (!id) {
            id = 'web-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
            localStorage.setItem(CLAVE_DISPOSITIVO, id);
        }
        return id;
    } catch (e) {
        return '';
    }
}

async function cargarSesionConductor() {
    const disp = dispositivoEquipo();
    if (!disp) return null;

    const buscar = async () => {
        try {
            const { data, error } = await db.rpc('sesion_unidad_por_dispositivo', { p_dispositivo: disp });
            if (error || !data || !data.ok) return null;
            return {
                unidad: data.unidad,
                nombre: data.user_id,
                dni: data.dni,
                inicio: data.inicio,
                dispositivo: disp
            };
        } catch (e) {
            return null;
        }
    };

    const directa = await buscar();
    if (directa) { SESION_CONDUCTOR = directa; return directa; }

    // Turno abierto por una version anterior (sin id de equipo): el celular
    // guarda usuario y unidad en sus preferencias nativas. La base confirma
    // que ese turno sigue abierto y a nombre de esa persona; si es asi se
    // adopta, sin crear ni duplicar nada.
    let nativa = '';
    try {
        if (window.AndroidUbicacion && window.AndroidUbicacion.obtenerSesionGuardada) {
            nativa = String(window.AndroidUbicacion.obtenerSesionGuardada() || '');
        }
    } catch (e) { nativa = ''; }

    if (nativa && nativa.indexOf('|') > 0) {
        const partes = nativa.split('|');
        const usuario = partes[0].trim();
        const unidad = partes[1].trim();
        if (usuario && unidad) {
            try {
                const { data } = await db.rpc('abrir_turno', {
                    p_unidad: unidad,
                    p_user_id: usuario,
                    p_dni: null,
                    p_dispositivo: disp,
                    p_token: null
                });
                if (data && data.ok) {
                    const adoptada = await buscar();
                    if (adoptada) { SESION_CONDUCTOR = adoptada; return adoptada; }
                }
            } catch (e) {}
        }
    }

    return null;
}

function usuarioPlan() {
    try { return JSON.parse(localStorage.getItem('pc_user') || 'null'); } catch (e) { return null; }
}

function normalizar(v) {
    return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

/* Quién ve el mapa: toda la Gerencia de Campo, el gerente directo de cada
   gerencia y César Chunga (el único que lo edita). Nadie más. */

function accesoPermitido() {
    if (sesionConductor()) return true;
    const u = usuarioPlan();
    if (!u) return false;
    if (['gerente_general', 'gerencial_legal', 'gdo', 'gerente_campo'].indexOf(u.rol) !== -1) return true;
    if (normalizar(u.gerencia_key || '').indexOf('gerencia de campo') === 0) return true;
    return puedeEditarMapa();
}

/* Editar el mapa (puntos, líneas, máquinas, georreferencia) es solo de
   Seguridad Industrial —César Chunga—. El resto entra y ve todo lo que él publica. */
function puedeEditarMapa() {
    if (sesionConductor()) return false;
    const u = usuarioPlan();
    if (!u) return false;
    const texto = normalizar((u.seccion || '') + ' ' + (u.area || ''));
    return texto.includes('chunga');
}

function esMovil() {
    return window.innerWidth < 900 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/* ------------------------------------------------------------
   Fondo del mapa
   Sentinel-2 cloudless (EOX, CC BY 4.0) es el fondo normal: libre, 10 m por
   píxel y sin cuota. Esri «World Imagery» (© Esri, Maxar) tiene más detalle,
   pero se cobra por tile arriba de 2 millones al mes, así que queda como capa
   opcional para pocos roles.

   Para habilitarla: generar una API key en ArcGIS Location Platform restringida
   al dominio de la app y pegarla acá abajo. Sin clave, el botón no aparece.
   ------------------------------------------------------------ */
const CLAVE_ESRI = 'AAPTaBLvV4_KJp6HMTz__7qr5AQ..5mvKfo9oiozrkyq8yTLYC4BRDRQwh2LS3geDcBClh2bA3pyrGQwAIZJlxPAiJW0xG1M88c8iROHKbK1pVHjCjRS20XQ0Trr4kgBl67D0Fiz6u8dxskhlRCfDV3TOgHEGa420MhggKv6H783cEqYfSFNsXMcgXGWwcwH9BJ4xTzae8zyTvU8O70J8WeNlK_raGYDzEx0hZ2niOQf_WEZj8MoX9fOl8DNPy652QDI74Lz8pGdQnwtw2ug.AT1_eewcXHnE';
const FONDO_SENTINEL = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg';
const FONDO_ESRI = 'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=' + CLAVE_ESRI;
const ATRIB_SENTINEL = 'Sentinel-2 cloudless — <a href="https://s2maps.eu" target="_blank" rel="noopener">s2maps.eu</a> · EOX IT Services GmbH · CC BY 4.0 · datos Copernicus modificados';
const ATRIB_ESRI = 'Imágenes © Esri, Maxar';
const CLAVE_FONDO = 'pc_fondo_mapa';

let capaFondo = null;
let nombreFondo = 'sentinel';

function puedeAltaResolucion() {
    if (!CLAVE_ESRI) return false;
    if (sesionConductor()) return false;
    const u = usuarioPlan();
    if (!u) return false;
    if (['gerente_general', 'gerencial_legal', 'gdo', 'gerente_campo'].indexOf(u.rol) !== -1) return true;
    return puedeEditarMapa();
}

function crearCapaFondo(nombre) {
    const esEsri = nombre === 'esri';
    const capa = L.tileLayer(esEsri ? FONDO_ESRI : FONDO_SENTINEL, {
        maxZoom: 18,
        /* Esri tiene detalle hasta z17 en Paramonga; Sentinel-2 llega a z14
           por sus 10 m por píxel. Arriba de eso Leaflet amplía. */
        maxNativeZoom: esEsri ? 17 : 14,
        attribution: esEsri ? ATRIB_ESRI : ATRIB_SENTINEL
    });
    if (esEsri) {
        capa.on('tileerror', () => {
            if (nombreFondo !== 'esri') return;
            avisoFondo('No se pudo cargar la imagen de alta resolución. Vuelvo al fondo libre.');
            aplicarFondo('sentinel');
        });
    }
    return capa;
}

function aplicarFondo(nombre) {
    if (!mapa) return;
    if (nombre === 'esri' && !puedeAltaResolucion()) nombre = 'sentinel';
    if (capaFondo) mapa.removeLayer(capaFondo);
    capaFondo = crearCapaFondo(nombre);
    capaFondo.addTo(mapa);
    if (capaFondo.bringToBack) capaFondo.bringToBack();
    nombreFondo = nombre;
    try { localStorage.setItem(CLAVE_FONDO, nombre); } catch (e) {}
    actualizarBotonFondo();
}

function actualizarBotonFondo() {
    const b = document.getElementById('btn-fondo');
    if (!b) return;
    const esEsri = nombreFondo === 'esri';
    b.innerHTML = '<i class="fas fa-layer-group"></i> ' + (esEsri ? 'Alta resolución ON' : 'Alta resolución');
    b.style.background = esEsri ? '#1d4ed8' : '#0f172a';
}

function avisoFondo(texto) {
    let caja = document.getElementById('aviso-fondo');
    if (!caja) {
        caja = document.createElement('div');
        caja.id = 'aviso-fondo';
        caja.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:26px;z-index:4000;' +
            'background:rgba(15,23,42,.94);color:#fff;padding:10px 14px;border-radius:10px;' +
            'font-size:.76rem;font-weight:600;max-width:88vw;text-align:center;box-shadow:0 6px 20px rgba(0,0,0,.3);';
        document.body.appendChild(caja);
    }
    caja.textContent = texto;
    clearTimeout(avisoFondo._t);
    avisoFondo._t = setTimeout(() => { if (caja.parentNode) caja.parentNode.removeChild(caja); }, 3200);
}

/* La barra blanca va por encima del mapa, así que los controles de Leaflet
   (zoom y botón de alta resolución) quedaban escondidos debajo. Se empuja el
   contenedor de controles lo que mide la barra y se recalcula al cambiar el
   tamaño de la ventana, porque en el celular la barra ocupa más alto. */
function ajustarControlesAlMapa() {
    const barra = document.querySelector('.barra');
    const alto = barra ? Math.ceil(barra.getBoundingClientRect().height) : 0;
    document.querySelectorAll('.leaflet-top').forEach((el) => { el.style.top = (alto + 6) + 'px'; });
}

function crearBotonFondo() {
    if (!puedeAltaResolucion() || document.getElementById('btn-fondo')) return;
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.id = 'btn-fondo';
    boton.title = 'Cambiar entre imagen satelital libre y de alta resolución';
    boton.style.cssText = 'display:flex;align-items:center;gap:6px;background:#0f172a;color:#fff;' +
        'border:none;border-radius:8px;padding:8px 10px;font-size:.72rem;font-weight:700;' +
        'box-shadow:0 2px 8px rgba(15,23,42,.3);cursor:pointer;';
    boton.addEventListener('click', () => {
        if (nombreFondo !== 'esri') {
            aplicarFondo('esri');
            avisoFondo('Imagen de alta resolución (Esri). Consume la cuota mensual de la cuenta.');
        } else {
            aplicarFondo('sentinel');
            avisoFondo('Fondo satelital libre (Sentinel-2).');
        }
    });

    const control = L.control({ position: 'topright' });
    control.onAdd = function () {
        const caja = L.DomUtil.create('div');
        caja.appendChild(boton);
        L.DomEvent.disableClickPropagation(caja);
        return caja;
    };
    control.addTo(mapa);
    actualizarBotonFondo();
}

/* ------------------------------------------------------------
   Inicio
   ------------------------------------------------------------ */
function iniciarMapa() {
    if (!accesoPermitido()) {
        const m = document.getElementById('sin-acceso');
        if (m) m.style.display = 'flex';
        const barra = document.querySelector('.barra');
        if (barra) barra.style.display = 'none';
        return;
    }

    mapa = L.map('mapa', { zoomControl: true, maxZoom: 18 }).setView([-10.7100, -77.7900], 13);

    /* Se respeta el fondo elegido la última vez; si era Esri y ya no hay clave
       o el rol no alcanza, aplicarFondo lo devuelve a Sentinel solo. */
    let fondoGuardado = null;
    try { fondoGuardado = localStorage.getItem(CLAVE_FONDO); } catch (e) {}
    aplicarFondo(fondoGuardado === 'esri' ? 'esri' : 'sentinel');
    crearBotonFondo();

    /* Los controles del mapa no deben quedar debajo de la barra blanca. En el
       celular la barra cambia de alto cuando se acomodan sus filas, así que se
       observa su tamaño en vez de calcularlo una sola vez. */
    ajustarControlesAlMapa();
    setTimeout(ajustarControlesAlMapa, 400);
    window.addEventListener('resize', ajustarControlesAlMapa);
    if (window.ResizeObserver) {
        const barra = document.querySelector('.barra');
        if (barra) new ResizeObserver(ajustarControlesAlMapa).observe(barra);
    }

    mapa.on('click', async (e) => {
        if (editorActivo) { await clickEditor(e.latlng); return; }
        if (!simulando) return;
        await moverSimulacion(e.latlng.lat, e.latlng.lng);
    });

    cargarCapas();
    initCapasVectoriales();
    cargarUnidades();
    aplicarSesionConductor();
    setInterval(cargarUnidades, 30000);

    // Aviso de version nueva al entrar al mapa (APK)
    try {
        if (window.AndroidUbicacion && window.AndroidUbicacion.revisarActualizacion) {
            window.AndroidUbicacion.revisarActualizacion();
        }
    } catch (e) {}
}

/* ------------------------------------------------------------
   Capas
   ------------------------------------------------------------ */
function limites(capa) {
    return [[capa.sur, capa.oeste], [capa.norte, capa.este]];
}

function dibujarTodasLasCapas() {
    Object.keys(CAPAS).forEach(k => {
        const c = CAPAS[k];
        if (c.overlay) { mapa.removeLayer(c.overlay); c.overlay = null; }
        if (k !== capaActiva) return;

        c.overlay = L.imageOverlay(c.archivo, limites(c), {
            opacity: c.opacidad,
            interactive: false
        }).addTo(mapa);
    });
}

async function cargarCapas() {
    try {
        const { data } = await db.from('mapa_capa').select('*');
        (data || []).forEach(fila => {
            const clave = Object.keys(CAPAS).find(k => CAPAS[k].id === fila.id);
            if (!clave) return;
            const c = CAPAS[clave];
            c.norte = fila.norte; c.sur = fila.sur; c.este = fila.este; c.oeste = fila.oeste;
            if (fila.opacidad != null) c.opacidad = fila.opacidad;
        });
        dibujarTodasLasCapas();
        mapa.fitBounds(limites(CAPAS[capaActiva]), { padding: [30, 30] });
        actualizarControles();
    } catch (e) {
        console.error(e);
        const est = document.getElementById('estado');
        if (est) est.textContent = 'No se pudo leer la capa: ' + e.message;
    }
}

function mostrarCapa(clave) {
    /* No dejar una línea a medio dibujar: se guardaría en la pestaña equivocada */
    if (editorActivo && clave !== capaActiva) {
        terminarLinea(true);
        verticesLinea = [];
    }
    capaActiva = clave;

    document.querySelectorAll('.tab-capa').forEach(b => {
        b.classList.toggle('activo', b.dataset.capa === clave);
    });

    dibujarTodasLasCapas();
    aplicarVisibilidadCapas();

    const barra = document.getElementById('opacidad');
    if (barra) barra.value = Math.round(CAPAS[clave].opacidad * 100);

    const titulo = document.getElementById('leyenda-titulo');
    if (titulo) titulo.textContent = 'Ajustando: ' + CAPAS[clave].nombre;

    if (modoAjuste) crearMarcasEsquinas();
    actualizarControles();
}

function actualizarControles() {
    const botonEd = document.getElementById('btn-editar-puntos');
    if (botonEd) {
        const puede = !esMovil() && puedeEditarMapa();
        botonEd.style.display = puede ? 'inline-flex' : 'none';
    }

    /* «Ajustar capa» solo se muestra dentro del editor */
    const botonAjustar = document.getElementById('btn-ajustar');
    if (botonAjustar) botonAjustar.style.display = 'none';
}

/* ------------------------------------------------------------
   Ajuste de la capa activa
   ------------------------------------------------------------ */
function alternarAjuste() {
    if (!puedeEditarMapa()) return;
    modoAjuste = !modoAjuste;

    document.getElementById('btn-ajustar').classList.toggle('activo', modoAjuste);
    document.getElementById('btn-guardar').style.display = modoAjuste ? 'inline-flex' : 'none';
    document.getElementById('leyenda').style.display = modoAjuste ? 'block' : 'none';

    const titulo = document.getElementById('leyenda-titulo');
    if (titulo) titulo.textContent = 'Ajustando: ' + CAPAS[capaActiva].nombre;

    if (modoAjuste) {
        crearMarcasEsquinas();
    } else {
        if (marcNO) { mapa.removeLayer(marcNO); marcNO = null; }
        if (marcSE) { mapa.removeLayer(marcSE); marcSE = null; }
    }
}

function pinEsquina(lat, lon, texto) {
    return L.marker([lat, lon], {
        draggable: true,
        icon: L.divIcon({
            className: '',
            html: `<div style="background:#10b981;color:#fff;padding:4px 8px;border-radius:8px;font-size:11px;font-weight:700;white-space:nowrap;">${texto}</div>`,
            iconAnchor: [18, 10]
        })
    }).addTo(mapa);
}

function crearMarcasEsquinas() {
    if (marcNO) { mapa.removeLayer(marcNO); marcNO = null; }
    if (marcSE) { mapa.removeLayer(marcSE); marcSE = null; }

    const c = CAPAS[capaActiva];
    marcNO = pinEsquina(c.norte, c.oeste, 'NO');
    marcSE = pinEsquina(c.sur, c.este, 'SE');

    marcNO.on('drag', (e) => {
        const p = e.target.getLatLng();
        c.norte = p.lat; c.oeste = p.lng;
        actualizarOverlayActivo();
    });

    marcSE.on('drag', (e) => {
        const p = e.target.getLatLng();
        c.sur = p.lat; c.este = p.lng;
        actualizarOverlayActivo();
    });
}

function actualizarOverlayActivo() {
    const c = CAPAS[capaActiva];
    if (c.overlay) c.overlay.setBounds(limites(c));
}

async function guardarCapa() {
    if (!puedeEditarMapa()) return;
    const c = CAPAS[capaActiva];
    const boton = document.getElementById('btn-guardar');
    boton.disabled = true;
    boton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando';

    const { error } = await db.from('mapa_capa').upsert({
        id: c.id, norte: c.norte, sur: c.sur, este: c.este, oeste: c.oeste,
        opacidad: c.opacidad, actualizado_en: new Date().toISOString()
    }, { onConflict: 'id' });

    boton.disabled = false;
    boton.innerHTML = '<i class="fas fa-floppy-disk"></i> Guardar';

    const est = document.getElementById('estado');
    if (est) est.textContent = error ? 'Error al guardar: ' + error.message : 'Capa guardada ✓';

    if (!error) alternarAjuste();
}

function cambiarOpacidad(valor) {
    const c = CAPAS[capaActiva];
    c.opacidad = Number(valor) / 100;
    if (c.overlay) c.overlay.setOpacity(c.opacidad);
}

/* ------------------------------------------------------------
   Unidades en vivo
   ------------------------------------------------------------ */
async function cargarUnidades() {
    try {
        const { data, error } = await db.from('ubicaciones').select('*')
            .order('actualizado_en', { ascending: false });
        if (error) throw error;

        marcadoresUnidades.forEach(m => capaUnidades.removeLayer(m));
        marcadoresUnidades = [];

        (data || []).forEach(u => {
            const minutos = (Date.now() - new Date(u.actualizado_en).getTime()) / 60000;
            const color = minutos < 30 ? '#16a34a' : minutos < 120 ? '#f59e0b' : '#dc2626';
            const hora = new Date(u.actualizado_en).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

            const marcador = L.marker([u.lat, u.lon], {
                icon: L.divIcon({
                    className: '',
                    html: `<div style="font-size:20px;color:${color};text-shadow:0 0 5px #fff"><i class="fas fa-truck-pickup"></i></div>`,
                    iconSize: [24, 24], iconAnchor: [12, 12]
                })
            }).addTo(capaUnidades);

            const uSeguro = String(u.user_id || '').replace(/'/g, '');
            const unSeguro = String(u.unidad || '').replace(/'/g, '');
            const tokSeguro = String(u.token || '').replace(/'/g, '');

            marcador.bindPopup(
                `<strong>${u.user_id || 'Sin nombre'}</strong><br>` +
                `<span style="color:#16a34a;font-weight:700">🚚 ${u.unidad || 'sin unidad'}</span><br>` +
                `Actualizado: ${hora}<br>Precisión: ${Math.round(u.precision_m || 0)} m<br><br>` +
                `<button onclick="alertarUnidad('${uSeguro}','${unSeguro}','${tokSeguro}')" style="background:#dc2626;color:#fff;border:none;border-radius:8px;padding:8px 12px;font-size:.78rem;font-weight:700;cursor:pointer;">🚨 Alertar evacuación</button>`
            );

            if (u.unidad) {
                marcador.bindTooltip(u.unidad, {
                    permanent: true, direction: 'bottom', className: 'etiqueta-unidad', offset: [0, 8]
                });
            }

            marcadoresUnidades.push(marcador);
        });

        const est = document.getElementById('estado');
        if (est && Date.now() > estadoBloqueadoHasta) {
            est.textContent = (data || []).length + ' unidad(es) en el mapa';
        }
    } catch (e) {
        console.warn('Unidades:', e);
    }
}

function centrarEnDatos() {
    if (marcadoresUnidades.length > 0) {
        mapa.fitBounds(L.featureGroup(marcadoresUnidades).getBounds(), { padding: [50, 50] });
    } else {
        mapa.fitBounds(limites(CAPAS[capaActiva]), { padding: [30, 30] });
    }
}

/* ------------------------------------------------------------
   Alertas
   ------------------------------------------------------------ */
async function buscarToken(usuario) {
    if (!usuario) return null;
    const { data } = await db.from('push_subscriptions').select('token, user_id');
    const buscado = normalizar(usuario);
    const fila = (data || []).find(r => normalizar(r.user_id) === buscado && r.token && r.token.length > 30);
    return fila ? fila.token : null;
}

async function alertarUnidad(usuario, unidad, token) {
    const quien = unidad || usuario;
    if (!quien) { alert('La unidad no tiene identificación.'); return; }

    let tokenFinal = token || null;

    // Primero: el celular del titular de esa unidad
    if (!tokenFinal) {
        const debidos = await tokensDeUnidad(unidad || '');
        if (debidos.tokens.length) tokenFinal = debidos.tokens[0];
    }
    if (!tokenFinal) tokenFinal = await buscarToken(usuario);

    if (!tokenFinal && usuario) {
        const { data } = await db.from('ubicaciones').select('token').eq('user_id', usuario).maybeSingle();
        if (data && data.token) tokenFinal = data.token;
    }

    if (!tokenFinal) {
        alert('La unidad ' + (unidad || usuario) + ' no tiene celular registrado para alarmas.\n\nEl conductor debe cerrar turno y volver a iniciarlo aceptando las notificaciones.');
        await registrarAlerta(unidad, usuario, null, 'sin_token', 'sin celular registrado');
        return;
    }

    if (!confirm('¿Alertar a ' + quien + ' para que evacue a un lugar seguro?')) return;

    const cuerpo = 'Evacue de inmediato y diríjase a un lugar seguro.';
    const titulo = 'EVACUACIÓN · ' + quien;

    try {
        const resp = await fetch(FUNC_PUSH, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: titulo, body: cuerpo,
                userId: usuario || null, token: tokenFinal
            })
        });
        const datos = await resp.json().catch(() => ({}));
        const enviados = datos.fcm_enviados ?? 0;
        const est = document.getElementById('estado');
        if (est) est.textContent = 'Alerta enviada a ' + quien + ' · equipos: ' + enviados;
        await registrarAlerta(unidad, usuario, tokenFinal, enviados > 0 ? 'enviada' : 'sin_entrega', 'evacuacion manual');
    } catch (e) {
        const est = document.getElementById('estado');
        if (est) est.textContent = 'No se pudo enviar: ' + e.message;
        await registrarAlerta(unidad, usuario, tokenFinal, 'error', e.message);
    }
}

/* ------------------------------------------------------------
   Sesion de la unidad: dueño unico y token vigente
   ------------------------------------------------------------ */
async function sincronizarSuscripcion(c) {
    if (!c || !c.nombre || !c.unidad) return;
    let token = null;
    try { token = localStorage.getItem('pushToken'); } catch (e) {}
    if (!token || String(token).length < 30) return;

    // Solo se mantiene el token al dia: el turno ya existe en la base
    try {
        await db.from('sesiones_unidad')
            .update({ token: token })
            .eq('unidad', c.unidad);

        const { data } = await db.from('push_subscriptions')
            .select('id')
            .eq('token', token)
            .limit(1);

        if (!data || !data.length) {
            await db.from('push_subscriptions').insert({
                user_id: c.nombre,
                token: token,
                unidad: c.unidad
            });
        }
    } catch (e) {
        console.warn('sincronizar sesion', e);
    }
}

/* ------------------------------------------------------------
   Sesion de conductor
   ------------------------------------------------------------ */
function aplicarSesionConductor() {
    const c = sesionConductor();
    if (!c) return;

    // 1) Primero el envio de ubicacion: nunca debe depender de la interfaz
    try { iniciarRastreoSilencioso(c); } catch (e) { console.warn('rastreo', e); }

    // 2) Refrescar que esta unidad corresponde a este celular (para las alertas)
    try { sincronizarSuscripcion(c); } catch (e) { console.warn('suscripcion', e); }

    // 2) Luego la pantalla de turno (si algo falla, el mapa sigue visible)
    try { mostrarPantallaTurno(c); } catch (e) { console.warn('pantalla turno', e); }
}

/* Overlay creado por JS: no depende del HTML y no oculta el mapa */
function mostrarPantallaTurno(c) {
    if (document.getElementById('pantalla-turno')) return;

    const capa = document.createElement('div');
    capa.id = 'pantalla-turno';
    capa.style.cssText = 'position:fixed;inset:0;z-index:5000;background:linear-gradient(160deg,#ecfdf5 0%,#f8fafc 55%,#eef2ff 100%);display:flex;align-items:center;justify-content:center;padding:22px;';

    let inicio = new Date();
    try { if (c.inicio) inicio = new Date(c.inicio); } catch (e) {}
    const fecha = inicio.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
    const hora = inicio.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

    capa.innerHTML = `
        <div style="width:100%;max-width:400px;background:#fff;border-radius:22px;padding:26px 22px;box-shadow:0 18px 50px rgba(15,23,42,.16);text-align:center;font-family:inherit;">
            <div style="width:62px;height:62px;border-radius:50%;background:#dcfce7;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;">
                <i class="fas fa-satellite-dish" style="font-size:25px;color:#16a34a"></i>
            </div>
            <h1 style="margin:0 0 6px;font-size:1.25rem;color:#0f172a">Turno activo</h1>
            <p style="margin:0 0 18px;font-size:.84rem;color:#64748b">Tu ubicación se está compartiendo con el centro de operaciones.</p>

            <div style="text-align:left;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;margin-bottom:16px;">
                <div style="font-size:.62rem;letter-spacing:.09em;color:#94a3b8;font-weight:700">UNIDAD</div>
                <div style="font-size:1.02rem;font-weight:700;color:#166534;margin-bottom:10px">${(c.unidad || '—')}</div>
                <div style="font-size:.62rem;letter-spacing:.09em;color:#94a3b8;font-weight:700">CONDUCTOR</div>
                <div style="font-size:.9rem;font-weight:600;color:#0f172a;margin-bottom:10px">${(c.nombre || '—')}</div>
                ${c.dni ? `<div style="font-size:.62rem;letter-spacing:.09em;color:#94a3b8;font-weight:700">DNI</div>
                <div style="font-size:.84rem;color:#334155;margin-bottom:10px">${c.dni}</div>` : ''}
                <div style="font-size:.62rem;letter-spacing:.09em;color:#94a3b8;font-weight:700">INICIO DEL TURNO</div>
                <div style="font-size:.84rem;color:#334155">${fecha} · ${hora}</div>
            </div>

            <div style="font-size:.72rem;color:#b45309;background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;padding:9px 11px;margin-bottom:16px;text-align:left;">
                Mantén la ubicación activada. Si la desactivas, la app se bloqueará hasta permitirla otra vez.
            </div>

            <button id="btn-turno-cerrar" style="width:100%;padding:12px;border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;border-radius:12px;font-size:.88rem;font-weight:700;cursor:pointer;">
                <i class="fas fa-right-from-bracket"></i> Cerrar turno
            </button>
        </div>`;

    document.body.appendChild(capa);

    const boton = document.getElementById('btn-turno-cerrar');
    if (boton) boton.addEventListener('click', cerrarTurno);
}

function iniciarRastreoSilencioso(c) {
    if (!navigator.geolocation) return;

    if (window.AndroidUbicacion && window.AndroidUbicacion.iniciarServicio) {
        window.AndroidUbicacion.iniciarServicio(c.nombre, c.unidad);
    }

    if (!window.__vigilando) {
        window.__vigilando = true;
        navigator.geolocation.watchPosition(
            (pos) => enviarUbicacion(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
            (err) => {
                const est = document.getElementById('estado');
                if (est) est.textContent = 'GPS: ' + (err.message || 'sin permiso de ubicación');
            },
            { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 }
        );
    }
}

async function enviarUbicacion(lat, lon, precision) {
    const ahora = Date.now();
    if (ahora - ultimoEnvio < 60000) return;
    ultimoEnvio = ahora;

    const c = sesionConductor();
    let token = null;
    try { token = localStorage.getItem('pushToken'); } catch (e) {}

    const fila = {
        user_id: c ? c.nombre : 'UNIDAD MOVIL',
        unidad: c ? c.unidad : null,
        lat, lon,
        precision_m: precision || null,
        actualizado_en: new Date().toISOString()
    };
    if (token) fila.token = token;   // solo se escribe si existe

    const { error } = await db.from('ubicaciones').upsert(fila, { onConflict: 'user_id' });
    if (error) {
        const est = document.getElementById('estado');
        if (est) est.textContent = 'No se pudo enviar: ' + error.message;
    }
}

async function cerrarTurno() {
    if (!confirm('¿Finalizar el turno? Se dejará de compartir la ubicación.')) return;
    const c = sesionConductor();

    // 1) Cerrar el turno en la base: borra la fila, limpia posicion y
    //    suscripcion, y deja el registro en el historial
    try {
        await db.rpc('cerrar_turno', {
            p_unidad: c ? c.unidad : null,
            p_dispositivo: dispositivoEquipo()
        });
    } catch (e) {
        console.warn('cerrar turno', e);
    }

    // 2) Detener el servicio nativo
    try {
        if (window.AndroidUbicacion && window.AndroidUbicacion.detenerServicio) {
            window.AndroidUbicacion.detenerServicio();
        }
    } catch (e) {
        console.warn('detener servicio', e);
    }

    // 3) Olvidar restos en este celular
    SESION_CONDUCTOR = null;
    try {
        localStorage.removeItem('conductor');
        localStorage.removeItem('pushToken');
    } catch (e) {}

    window.location.href = 'conductor.html?v=21';
}

/* ------------------------------------------------------------
   Simulacion (solo para pruebas)
   ------------------------------------------------------------ */
function alternarSimulacion() {
    simulando = !simulando;
    const bs = document.getElementById('btn-simular');
    if (bs) bs.classList.toggle('activo', simulando);
}

async function moverSimulacion(lat, lon) {
    const sel = document.getElementById('sel-unidad');
    const unidad = (sel && sel.value) ? sel.value : 'SIMULACION';

    await db.from('ubicaciones').upsert({
        user_id: 'SIMULACION', unidad, lat, lon, precision_m: 8,
        actualizado_en: new Date().toISOString()
    }, { onConflict: 'user_id' });

    cargarUnidades();
}


/* ============================================================
   EDITOR DE PUNTOS CRITICOS (vectores)
   ============================================================ */
let editorActivo = false;
let modoEditor = null;
/* Color con el que se dibujan las líneas y zonas nuevas */
let colorLinea = '#06b6d4';
let capaUnidades = null;
let capaMaquinas = null;
let capaCampos = null;
let maquinasCache = [];
let capaPuntos = null;
let capaLineas = null;      /* líneas de la pestaña Puntos críticos */
let capaLineasSeg = null;   /* líneas de la pestaña Seguimiento de maquinarias */
let verticesLinea = [];
let lineaTemporal = null;
let marcadoresVertices = [];

function initCapasVectoriales() {
    capaUnidades = L.layerGroup().addTo(mapa);
    capaMaquinas = L.layerGroup();
    capaPuntos = L.layerGroup();
    capaLineas = L.layerGroup();
    capaLineasSeg = L.layerGroup();
    capaCampos = L.layerGroup().addTo(mapa);
    cargarVectores();
    cargarMaquinas();
    cargarListaMaquinas();
    cargarCampos();
    aplicarVisibilidadCapas();
}

/* ================= CAMPOS DE LA EMPRESA (KMZ) ================= */
async function cargarCampos() {
    if (!capaCampos) return;
    try {
        const resp = await fetch('assets/campos.geojson?v=1');
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const datos = await resp.json();

        capaCampos.clearLayers();

        L.geoJSON(datos, {
            /* El editor necesita atravesar los campos con la línea: el polígono
               deja de capturar el clic mientras se edita (ver CSS .mapa-editando) */
            className: 'campo-poligono',
            style: () => ({
                color: '#06b6d4',
                weight: 1.5,
                opacity: 0.95,
                fillColor: '#22d3ee',
                fillOpacity: 0.10
            }),
            onEachFeature: (feat, capa) => {
                capa.options.className = 'campo-poligono';
                const p = feat.properties || {};
                const nombre = p.campo || 'Campo';
                const admin = p.admin || 'Sin administración';
                const est = p.estacion ? ('<br>Estación: ' + p.estacion) : '';
                capa.bindPopup(
                    '<strong>' + nombre + '</strong><br>' +
                    'Administración: ' + admin + est
                );
                capa.bindTooltip(nombre, { permanent: false, direction: 'center', className: 'etiqueta-unidad' });
            }
        }).addTo(capaCampos);

        /* Si el semáforo ya estaba en rojo, pintar los campos y evacuar */
        try { revisarEvacuacion(); } catch (e) {}
    } catch (e) {
        console.warn('campos', e);
    }
}

/* ============================================================
   ROJO = EVACUACIÓN: campos en rojo y aviso a las unidades
   dentro o cerca de ellos. Un aviso por unidad y una sola vez
   por cada declaración de rojo.
   ============================================================ */
const RADIO_EVAC_M = 300;             // "cerca" del campo
const COLOR_CAMPO = '#06b6d4';        // turquesa normal
const COLOR_CAMPO_ROJO = '#dc2626';
const LS_EVAC = 'evac_rojo_ts_v3';

let semaforoActual = { nivel: 'verde', vigente_desde: null };

/* Capas (polígonos) de los campos tal como están dibujadas */
function capasDeCampos() {
    const salida = [];
    if (!capaCampos) return salida;
    capaCampos.eachLayer(function (capa) {
        if (typeof capa.setStyle === 'function' && typeof capa.getLatLngs === 'function') salida.push(capa);
    });
    return salida;
}

/* Los 33 campos vienen como MultiPolygon: getLatLngs devuelve varios niveles.
   Se recorre hasta juntar anillos de vértices reales. */
function anillosDesdeNiveles(niveles, salida) {
    if (!Array.isArray(niveles) || !niveles.length) return salida;
    const primero = niveles[0];
    if (primero && typeof primero.lat === 'number') {
        const anillo = niveles
            .filter(function (p) { return p && typeof p.lat === 'number'; })
            .map(function (p) { return [p.lat, p.lng]; });
        if (anillo.length >= 3) salida.push(anillo);
        return salida;
    }
    niveles.forEach(function (hijo) { anillosDesdeNiveles(hijo, salida); });
    return salida;
}

/* Anillos de todos los campos, en orden [lat, lng] */
function anillosDeCampos() {
    const salida = [];
    capasDeCampos().forEach(function (capa) {
        const anillos = anillosDesdeNiveles(capa.getLatLngs(), []);
        if (!anillos.length) return;
        salida.push({ anillo: anillos[0], anillos: anillos, capa: capa });
    });
    return salida;
}

/* Ray casting: ¿el punto está dentro del anillo? */
function puntoEnAnillo(lat, lon, anillo) {
    let dentro = false;
    for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
        const yi = anillo[i][0], xi = anillo[i][1];
        const yj = anillo[j][0], xj = anillo[j][1];
        const cruza = ((yi > lat) !== (yj > lat)) &&
            (lon < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi);
        if (cruza) dentro = !dentro;
    }
    return dentro;
}

/* Distancia mínima del punto al borde del anillo (metros) */
function distanciaAAnillo(lat, lon, anillo) {
    let menor = Infinity;
    for (let i = 0; i < anillo.length; i++) {
        const a = anillo[i], b = anillo[(i + 1) % anillo.length];
        const dy = (b[0] - a[0]) * 111320;
        const dx = (b[1] - a[1]) * 111320 * Math.cos(lat * Math.PI / 180);
        const py = (lat - a[0]) * 111320;
        const px = (lon - a[1]) * 111320 * Math.cos(lat * Math.PI / 180);
        const len2 = dx * dx + dy * dy;
        let t = len2 ? (px * dx + py * dy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const ddx = px - dx * t, ddy = py - dy * t;
        menor = Math.min(menor, Math.sqrt(ddx * ddx + ddy * ddy));
    }
    return menor;
}

/* Pinta los campos de rojo (evacuación) o los devuelve a su color normal */
function aplicarSemaforoEnCampos() {
    const rojo = semaforoActual.nivel === 'rojo';
    try { document.body.classList.toggle('mapa-evac', rojo); } catch (e) {}
    capasDeCampos().forEach(function (capa) {
        capa.setStyle(rojo
            ? { color: COLOR_CAMPO_ROJO, weight: 2.5, opacity: 1, fillColor: COLOR_CAMPO_ROJO, fillOpacity: 0.45 }
            : { color: COLOR_CAMPO, weight: 1.5, opacity: 0.95, fillColor: '#22d3ee', fillOpacity: 0.10 });
    });
}

/* Aviso de evacuación con el mismo texto que ya usa el sistema */
async function evacuarUnidad(fila) {
    /* La alerta de evacuación la dispara el propio celular del conductor
       (evac_auto.js) para que salga a pantalla completa. El mapa sólo registra
       que la unidad estaba en zona roja. */
    const unidad = fila.unidad || fila.user_id || '';
    await registrarAlerta(unidad, fila.user_id, null, 'zona_roja', 'unidad dentro o cerca del campo');
    return false;
}

/* Revisa el semáforo: pinta campos y, si es rojo, avisa una sola vez */
async function revisarEvacuacion() {
    /* Si el semáforo todavía no emitió su nivel, se usa la copia del equipo */
    if (!semaforoActual.vigente_desde) {
        try {
            const local = JSON.parse(localStorage.getItem('sem_estado') || 'null');
            if (local && local.nivel) {
                semaforoActual = { nivel: local.nivel, vigente_desde: local.vigente_desde || null };
            }
        } catch (e) {}
    }

    aplicarSemaforoEnCampos();
    if (semaforoActual.nivel !== 'rojo') return;

    const marca = String(semaforoActual.vigente_desde || 'sin-fecha');
    let yaHecho = null;
    try { yaHecho = localStorage.getItem(LS_EVAC); } catch (e) {}
    if (yaHecho === marca) return;

    const anillos = anillosDeCampos();
    if (!anillos.length) return;   // todavía no cargaron los campos: se reintenta

    const { data } = await db.from('ubicaciones').select('user_id, unidad, lat, lon, token');
    let avisadas = 0;
    for (const fila of (data || [])) {
        const lat = Number(fila.lat), lon = Number(fila.lon);
        if (!isFinite(lat) || !isFinite(lon)) continue;
        const afectada = anillos.some(function (c) {
            return (c.anillos || [c.anillo]).some(function (a) {
                return puntoEnAnillo(lat, lon, a) || distanciaAAnillo(lat, lon, a) <= RADIO_EVAC_M;
            });
        });
        if (!afectada) continue;
        await evacuarUnidad(fila);
        avisadas++;
    }

    /* Se marca la declaración como procesada para no repetir el registro
       cada minuto; la alarma la dispara el celular del conductor. */
    if (avisadas > 0) {
        try { localStorage.setItem(LS_EVAC, marca); } catch (e) {}
    }

    const est = document.getElementById('estado');
    if (est && avisadas) est.textContent = 'Rojo: evacuación avisada a ' + avisadas + ' unidad(es)';
}

/* El semáforo avisa cada vez que se pinta */
window.addEventListener('sem:nivel', function (ev) {
    const d = (ev && ev.detail) || {};
    semaforoActual = { nivel: d.nivel || 'verde', vigente_desde: d.vigente_desde || null };
    try { revisarEvacuacion(); } catch (e) {}
});

/* ================= MAQUINAS DE PUNTOS CRITICOS ================= */
const RADIO_PUNTO_M = 150;      // distancia para asignar la maquina al punto
const RADIO_AYUDA_M = 600;      // dentro de este radio se muestra la ayuda visual

function distanciaMetros(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const f1 = lat1 * Math.PI / 180, f2 = lat2 * Math.PI / 180;
    const df = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(df/2)**2 + Math.cos(f1)*Math.cos(f2)*Math.sin(dl/2)**2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/* Coordenadas de los puntos en memoria: el arrastre NO consulta la nube */
let puntosCache = [];
let marcadoresPuntos = {};
let guiaPunto = null;
let estadoBloqueadoHasta = 0;

function fijarEstado(ms) {
    estadoBloqueadoHasta = Date.now() + (ms || 20000);
}

function esPuntoNumerado(p) {
    return p && p.tipo !== 'retro' && p.tipo !== 'excavadora';
}

/* Punto numerado mas cercano, calculado en el celular (sin red) */
function puntoMasCercanoLocal(lat, lon) {
    let mejor = null;
    for (const p of puntosCache) {
        if (!esPuntoNumerado(p)) continue;
        const d = distanciaMetros(lat, lon, Number(p.lat), Number(p.lon));
        if (!isFinite(d)) continue;
        if (!mejor || d < mejor.dist) mejor = Object.assign({}, p, { dist: d });
    }
    return mejor;
}

/* Compatibilidad: solo consulta la nube si la cache esta vacia */
async function puntoMasCercano(lat, lon) {
    await asegurarPuntos();
    const mejor = puntoMasCercanoLocal(lat, lon);
    return (mejor && mejor.dist <= RADIO_PUNTO_M) ? mejor : null;
}

/* Si la cache quedo vacia (red lenta al abrir), se carga al empezar a arrastrar */
async function asegurarPuntos() {
    if (puntosCache.length) return true;
    try {
        const { data } = await db.from('mapa_puntos').select('*').order('orden');
        if (data && data.length) { puntosCache = data; return true; }
    } catch (e) { console.warn('puntos', e); }
    return false;
}

function iconoMaquinaDe(marca) {
    try {
        const el = marca.getElement();
        return el ? el.querySelector('.icono-maquina') : null;
    } catch (e) { return null; }
}

/* Resalta el punto objetivo mientras se arrastra la maquina */
function resaltarPuntoCercano(orden) {
    Object.keys(marcadoresPuntos).forEach(k => {
        const marca = marcadoresPuntos[k];
        const div = marca && marca.getElement ? marca.getElement().querySelector('.punto-critico') : null;
        if (div) div.classList.toggle('cerca', Number(k) === Number(orden));
    });
}

/* Linea punteada entre la maquina y el punto mas cercano */
function actualizarGuia(marca, cerca, dentro) {
    retirarGuia();
    if (!cerca || cerca.dist > RADIO_AYUDA_M) return;
    const pos = marca.getLatLng();
    guiaPunto = L.polyline([[pos.lat, pos.lng], [Number(cerca.lat), Number(cerca.lon)]], {
        color: dentro ? '#dc2626' : '#f59e0b',
        weight: dentro ? 3 : 2,
        opacity: .9,
        dashArray: '7 7',
        className: 'linea-guia',
        interactive: false
    }).addTo(mapa);
}

function retirarGuia() {
    if (guiaPunto) { try { mapa.removeLayer(guiaPunto); } catch (e) {} guiaPunto = null; }
}

/* Aviso flotante: confirma en pantalla que paso con la alerta */
let temporizadorAviso = null;
function avisar(texto, tipo) {
    let caja = document.getElementById('toast-mapa');
    if (!caja) {
        caja = document.createElement('div');
        caja.id = 'toast-mapa';
        document.body.appendChild(caja);
    }
    caja.textContent = texto;
    caja.className = 'visible ' + (tipo || 'info');
    const est = document.getElementById('estado');
    if (est) est.textContent = texto;
    fijarEstado();
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => { caja.className = ''; }, 6000);
}

async function cargarListaMaquinas() {
    const sel = document.getElementById('sel-maquina');
    if (!sel) return;
    const { data } = await db.from('unidades').select('nombre')
        .eq('prefijo', 'PUNTOS CRITICOS').eq('activo', true).order('nombre');
    sel.innerHTML = (data || []).map(u => `<option value="${u.nombre}">${u.nombre}</option>`).join('');
}

async function cargarMaquinas() {
    if (!capaMaquinas) return;
    capaMaquinas.clearLayers();

    const { data } = await db.from('mapa_maquinas').select('*');
    maquinasCache = data || [];

    maquinasCache.forEach(m => {
        const tipo = m.unidad.includes('RETRO') ? 'retro'
            : (m.unidad.includes('ARRASTRE') || m.unidad.includes('EXCAVADORA')) ? 'excavadora' : 'retro';
        const tam = m.tamano || 40;

        const marca = L.marker([m.lat, m.lon], {
            draggable: editorActivo,
            bubblingMouseEvents: false,
            icon: L.divIcon({
                className: '',
                html: `<div class="icono-maquina" style="width:${tam}px;height:${Math.round(tam*0.76)}px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))">${iconoMaquinaria(tipo)}</div>`,
                iconSize: [tam, Math.round(tam*0.76)],
                iconAnchor: [Math.round(tam/2), Math.round(tam*0.68)]
            })
        }).addTo(capaMaquinas);

        marca.bindTooltip(m.unidad + (m.punto_orden ? ' · punto ' + m.punto_orden : ''),
            { permanent: false, direction: 'top' });

        marca.on('click', () => {
            if (!editorActivo) return;
            marca.bindPopup(
                '<strong>' + m.unidad + '</strong><br>Punto: ' + (m.punto_orden || 'sin asignar') +
                '<br><br><button onclick="eliminarMaquina(\'' + m.id + '\',\'' + m.unidad.replace(/'/g, '') + '\')" ' +
                'style="background:#dc2626;color:#fff;border:none;border-radius:8px;padding:7px 11px;font-size:.76rem;font-weight:700;cursor:pointer;">Eliminar maquinaria</button>'
            ).openPopup();
        });

        marca.on('contextmenu', async (ev) => {
            L.DomEvent.stopPropagation(ev);
            if (!editorActivo) return;
            if (!confirm('¿Quitar ' + m.unidad + ' del mapa?')) return;
            await db.from('mapa_maquinas').delete().eq('id', m.id);
            cargarMaquinas();
        });

        marca.on('dragstart', async () => {
            const div = iconoMaquinaDe(marca);
            if (div) div.classList.add('arrastrando');
            if (!puntosCache.length) await asegurarPuntos();
            avisar('Arrastra hasta el punto crítico. La animación avisa cuando ya está dentro del radio.', 'info');
        });

        // Arrastre: todo se calcula en el celular, sin consultar la nube
        marca.on('drag', (ev) => {
            const pos = ev.target.getLatLng();
            const cerca = puntoMasCercanoLocal(pos.lat, pos.lng);
            const dentro = !!(cerca && cerca.dist <= RADIO_PUNTO_M);

            const div = iconoMaquinaDe(marca);
            if (div) div.classList.toggle('choque', dentro);

            resaltarPuntoCercano(dentro && cerca ? cerca.orden : null);
            actualizarGuia(marca, cerca, dentro);

            const est = document.getElementById('estado');
            if (!est || !cerca || cerca.dist > RADIO_AYUDA_M) return;
            est.textContent = dentro
                ? '🎯 ' + m.unidad + ' dentro del punto ' + cerca.orden + ' – ' + (cerca.nombre || '') +
                  ' (' + Math.round(cerca.dist) + ' m) · suelta para asignar y alertar'
                : 'A ' + Math.round(cerca.dist) + ' m del punto ' + cerca.orden + ' – ' + (cerca.nombre || '') +
                  ' (faltan ' + Math.max(0, Math.round(cerca.dist - RADIO_PUNTO_M)) + ' m)';
            fijarEstado();
        });

        marca.on('dragend', async (ev) => {
            if (!puedeEditarMapa()) return;
            const pos = ev.target.getLatLng();
            const cerca = puntoMasCercanoLocal(pos.lat, pos.lng);
            const dentro = !!(cerca && cerca.dist <= RADIO_PUNTO_M);
            const punto = dentro ? cerca : null;

            const div = iconoMaquinaDe(marca);
            if (div) {
                div.classList.remove('arrastrando');
                div.classList.remove('choque');
            }
            resaltarPuntoCercano(null);
            retirarGuia();

            m.lat = pos.lat; m.lon = pos.lng;
            m.punto_orden = punto ? punto.orden : null;
            m.__dirty = false;

            // Se guarda al instante: no hace falta pulsar Guardar
            const { error } = await db.from('mapa_maquinas').update({
                lat: m.lat, lon: m.lon, punto_orden: m.punto_orden,
                actualizado_en: new Date().toISOString()
            }).eq('id', m.id);

            if (error) {
                avisar('No se pudo guardar la posición de ' + m.unidad + ': ' + error.message, 'warn');
                return;
            }

            if (!punto) {
                avisar('ℹ️ ' + m.unidad + ' movida · sin punto a menos de ' + RADIO_PUNTO_M + ' m', 'info');
                return;
            }

            // Animacion de choque + alerta a la unidad
            if (div) {
                div.classList.add('choque');
                const quitar = () => { try { div.classList.remove('choque'); } catch (e) {} };
                setTimeout(quitar, 2500);
            }

            const envio = await alertarMaquina(m.unidad, punto);
            avisar(
                '🚨 ' + m.unidad + ' asignada al punto ' + punto.orden + ' – ' + (punto.nombre || '') +
                ' (' + Math.round(punto.dist) + ' m) · ' +
                (envio.enviados > 0
                    ? 'alerta enviada a ' + envio.enviados + ' de ' + envio.total + ' celular(es)'
                    : (envio.total > 0
                        ? 'no se pudo entregar a ningún celular (' + envio.total + ' registrados)'
                        : 'SIN celular conectado: la alerta no se envió')),
                envio.enviados > 0 ? 'ok' : 'warn'
            );
        });
    });
}

/* Celular del titular de la unidad (sesion unica) */
async function tokensDeUnidad(unidad) {
    const buscado = normalizar(unidad);
    try {
        const { data } = await db.from('sesiones_unidad')
            .select('unidad, user_id, token, inicio');

        const sesion = (data || []).find(s => normalizar(s.unidad) === buscado);
        if (!sesion) return { tokens: [], conductores: [] };

        let token = sesion.token ? String(sesion.token) : '';
        if (token.length < 30) token = await buscarToken(sesion.user_id);

        return {
            tokens: token ? [token] : [],
            conductores: sesion.user_id ? [sesion.user_id] : []
        };
    } catch (e) {
        console.warn('tokensDeUnidad', e);
        return { tokens: [], conductores: [] };
    }
}

/* Registro de cada alerta enviada (para saber si llego o no) */
async function registrarAlerta(unidad, user_id, token, resultado, detalle) {
    try {
        await db.from('alertas_log').insert({
            unidad: unidad || null,
            user_id: user_id || null,
            token: token ? String(token).slice(0, 40) : null,
            resultado: resultado,
            detalle: detalle || null
        });
    } catch (e) { console.warn('alertas_log', e); }
}

/* Avisa a TODOS los conductores de esa maquina. Devuelve cuantos celulares recibieron */
async function alertarMaquina(unidad, punto) {
    try {
        const { tokens, conductores } = await tokensDeUnidad(unidad);
        if (!tokens.length) return { enviados: 0, total: 0, conductores };

        let enviados = 0;
        for (const token of tokens) {
            const resp = await fetch(FUNC_PUSH, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'Dirígete al punto ' + punto.orden + ' – ' + (punto.nombre || ''),
                    body: 'Se te asignó este punto crítico. Dirígete de inmediato.',
                    userId: null,
                    token: token
                })
            });
            const datos = await resp.json().catch(() => ({}));
            if ((datos.fcm_enviados ?? 0) > 0) enviados++;
        }

        await registrarAlerta(unidad, conductores[0], tokens[0],
            enviados > 0 ? 'enviada' : 'sin_entrega',
            'punto ' + (punto.orden || '') + ' · ' + tokens.length + ' celular(es)');

        return { enviados, total: tokens.length, conductores };
    } catch (e) {
        console.warn('alerta maquina', e);
        return { enviados: 0, total: 0, conductores: [] };
    }
}

async function eliminarMaquina(id, unidad) {
    if (!confirm('¿Eliminar ' + unidad + ' del mapa?')) return;
    await db.from('mapa_maquinas').delete().eq('id', id);
    const est = document.getElementById('estado');
    if (est) est.textContent = '✓ ' + unidad + ' eliminada';
    cargarMaquinas();
}

async function colocarMaquina(latlng) {
    const sel = document.getElementById('sel-maquina');
    const unidad = sel && sel.value ? sel.value : null;
    if (!unidad) { alert('No hay máquinas de puntos críticos registradas.'); return; }

    const cerca = puntoMasCercanoLocal(latlng.lat, latlng.lng);
    const punto = (cerca && cerca.dist <= RADIO_PUNTO_M) ? cerca : null;

    await db.from('mapa_maquinas').upsert({
        unidad,
        lat: latlng.lat,
        lon: latlng.lng,
        punto_orden: punto ? punto.orden : null,
        tamano: 40,
        actualizado_en: new Date().toISOString()
    }, { onConflict: 'unidad' });

    cargarMaquinas();

    if (!punto) {
        avisar('ℹ️ ' + unidad + ' colocada sin punto a menos de ' + RADIO_PUNTO_M + ' m', 'info');
        return;
    }

    const envio = await alertarMaquina(unidad, punto);
    avisar('🚨 ' + unidad + ' asignada al punto ' + punto.orden + ' – ' + (punto.nombre || '') +
        ' · ' + (envio.enviados > 0
            ? 'alerta enviada a ' + envio.enviados + ' de ' + envio.total + ' celular(es)'
            : (envio.total > 0 ? 'no se pudo entregar a ningún celular' : 'SIN celular conectado: alerta no enviada')),
        envio.enviados > 0 ? 'ok' : 'warn');
}

async function cambiarTamanoMaquinas(valor) {
    const tam = Number(valor);
    for (const m of maquinasCache) {
        await db.from('mapa_maquinas').update({ tamano: tam }).eq('id', m.id);
    }
    cargarMaquinas();
}

/* Muestra solo lo que corresponde a la pestaña activa */
function mostrarGrupo(grupo, visible) {
    if (!grupo) return;
    if (visible) {
        if (!mapa.hasLayer(grupo)) mapa.addLayer(grupo);
    } else if (mapa.hasLayer(grupo)) {
        mapa.removeLayer(grupo);
    }
}

function aplicarVisibilidadCapas() {
    if (!mapa || !capaUnidades) return;

    const esSeguimiento = (capaActiva === 'canales');

    /* Seguimiento: unidades y campos. Nada de puntos críticos. */
    /* Puntos críticos: puntos, maquinarias y sus líneas. Nada de campos. */
    mostrarGrupo(capaUnidades, esSeguimiento);
    /* En rojo los campos se ven en las dos pestañas: es la zona de evacuación */
    mostrarGrupo(capaCampos, esSeguimiento || semaforoActual.nivel === 'rojo');
    mostrarGrupo(capaLineasSeg, esSeguimiento);

    mostrarGrupo(capaPuntos, !esSeguimiento);
    /* Las máquinas de Puntos Críticos se ven sólo con sesión iniciada */
    mostrarGrupo(capaMaquinas, !esSeguimiento && !!usuarioPlan());
    mostrarGrupo(capaLineas, !esSeguimiento);

    /* Reaplicar el color de evacuación cada vez que cambia la pestaña */
    aplicarSemaforoEnCampos();
}


/* Color y grosor segun el tipo de linea */
function estiloLinea(color) {
    if (color === '#06b6d4') return { color: '#06b6d4', weight: 4, borde: 0 };
    if (color === '#eab308') return { color: '#eab308', weight: 8, borde: 12 };
    return { color: '#dc2626', weight: 8, borde: 12 };
}


/* Iconos vectoriales de maquinaria (sin archivos externos) */
function iconoMaquinaria(tipo) {
    if (tipo === 'retro') {
        return `<svg viewBox="0 0 64 48" width="46" height="35" xmlns="http://www.w3.org/2000/svg">
            <rect x="6" y="26" width="30" height="12" rx="3" fill="#facc15" stroke="#a16207" stroke-width="2"/>
            <rect x="16" y="14" width="16" height="14" rx="3" fill="#facc15" stroke="#a16207" stroke-width="2"/>
            <rect x="19" y="17" width="10" height="7" rx="2" fill="#7dd3fc" stroke="#0369a1" stroke-width="1"/>
            <circle cx="13" cy="40" r="6" fill="#334155" stroke="#0f172a" stroke-width="2"/>
            <circle cx="31" cy="40" r="6" fill="#334155" stroke="#0f172a" stroke-width="2"/>
            <path d="M38 30 L48 20 L54 24 L44 34 Z" fill="#facc15" stroke="#a16207" stroke-width="2"/>
            <path d="M6 30 L-2 34 L4 38 L10 34 Z" fill="#facc15" stroke="#a16207" stroke-width="2"/>
        </svg>`;
    }
    return `<svg viewBox="0 0 64 48" width="46" height="35" xmlns="http://www.w3.org/2000/svg">
        <rect x="8" y="28" width="28" height="10" rx="3" fill="#facc15" stroke="#a16207" stroke-width="2"/>
        <rect x="14" y="18" width="14" height="11" rx="3" fill="#facc15" stroke="#a16207" stroke-width="2"/>
        <rect x="17" y="21" width="8" height="6" rx="1" fill="#7dd3fc" stroke="#0369a1" stroke-width="1"/>
        <path d="M36 30 L48 12 L54 16 L44 34 Z" fill="#facc15" stroke="#a16207" stroke-width="2"/>
        <path d="M46 12 L56 6 L60 12 L52 16 Z" fill="#a16207" stroke="#854d0e" stroke-width="1"/>
        <rect x="6" y="38" width="32" height="6" rx="3" fill="#334155" stroke="#0f172a" stroke-width="2"/>
        <circle cx="12" cy="41" r="2.5" fill="#94a3b8"/>
        <circle cx="22" cy="41" r="2.5" fill="#94a3b8"/>
        <circle cx="32" cy="41" r="2.5" fill="#94a3b8"/>
    </svg>`;
}

async function cargarVectores() {
    capaPuntos.clearLayers();
    capaLineas.clearLayers();
    if (capaLineasSeg) capaLineasSeg.clearLayers();
    marcadoresPuntos = {};

    const { data: puntos } = await db.from('mapa_puntos').select('*').order('orden');
    if (puntos) puntosCache = puntos;
    (puntos || []).forEach(p => {
        const esMaquina = (p.tipo === 'retro' || p.tipo === 'excavadora');

        const icono = esMaquina
            ? L.divIcon({
                className: '',
                html: '<div class="icono-maquina">' + iconoMaquinaria(p.tipo) + '</div>',
                iconSize: [46, 35],
                iconAnchor: [23, 30]
            })
            : L.divIcon({
                className: '',
                html: '<div class="punto-critico"><span>' + p.orden + '</span></div>',
                iconSize: [30, 44],
                iconAnchor: [15, 40]
            });

        const marcador = L.marker([p.lat, p.lon], {
            draggable: editorActivo,
            icon: icono
        }).addTo(capaPuntos);

        marcadoresPuntos[p.orden] = marcador;

        marcador.on('dragend', (ev) => {
            const pos = ev.target.getLatLng();
            p.lat = pos.lat; p.lon = pos.lng;
            p.__dirty = true;
            const est = document.getElementById('estado');
            if (est) est.textContent = 'Punto ' + p.orden + ' movido · pulsa Guardar para confirmar';
        });

        marcador.on('contextmenu', async (ev) => {
            L.DomEvent.stopPropagation(ev);
            if (!editorActivo) return;
            const nombreTxt = esMaquina ? 'esta maquinaria' : ('el punto ' + p.orden);
            if (!confirm('¿Borrar ' + nombreTxt + '?')) return;
            await db.from('mapa_puntos').delete().eq('id', p.id);
            cargarVectores();
        });

        marcador.on('click', async () => {
            if (editorActivo && modoEditor === 'borrar') {
                if (!confirm('¿Borrar el punto ' + p.orden + '?')) return;
                await db.from('mapa_puntos').delete().eq('id', p.id);
                cargarVectores();
            }
        });
    });

    const { data: lineas } = await db.from('mapa_lineas').select('*');
    (lineas || []).forEach(l => {
        if (!Array.isArray(l.coords) || l.coords.length < 2) return;
        /* Cada línea vive en la pestaña donde se dibujó */
        const destino = (l.ambito === 'seguimiento' && capaLineasSeg) ? capaLineasSeg : capaLineas;
        const estilo = estiloLinea(l.color || '#dc2626');
        const grosor = l.grosor || estilo.weight;

        if (estilo.borde > 0) {
            L.polyline(l.coords, { color: 'rgba(0,0,0,.45)', weight: grosor + 4, opacity: 1,
                lineCap: 'round', lineJoin: 'round' }).addTo(destino);
        }

        let linea;
        if (l.tipo === 'poligono') {
            linea = L.polygon(l.coords, {
                color: estilo.color, weight: grosor, opacity: 1,
                fillColor: estilo.color, fillOpacity: 0.30
            }).addTo(destino);
        } else {
            linea = L.polyline(l.coords, {
                color: estilo.color, weight: grosor, opacity: 1,
                lineCap: 'round', lineJoin: 'round'
            }).addTo(destino);
        }
        linea.on('click', async () => {
            if (editorActivo && modoEditor === 'borrar') {
                if (!confirm('¿Borrar esta línea (' + (l.nombre || '') + ')?')) return;
                await db.from('mapa_lineas').delete().eq('id', l.id);
                cargarVectores();
            }
        });
    });
}

async function guardarEdicion() {
    if (!puedeEditarMapa()) return;
    if (!confirm('¿Seguro que querés guardar los cambios del mapa?')) return;
    const est = document.getElementById('estado');
    let cambios = 0;

    for (const p of puntosCache) {
        if (!p.__dirty) continue;
        await db.from('mapa_puntos').update({ lat: p.lat, lon: p.lon }).eq('id', p.id);
        p.__dirty = false;
        cambios++;
    }

    for (const m of maquinasCache) {
        if (!m.__dirty) continue;
        const antes = m.punto_orden;
        await db.from('mapa_maquinas').update({
            lat: m.lat, lon: m.lon, punto_orden: m.punto_orden,
            actualizado_en: new Date().toISOString()
        }).eq('id', m.id);
        if (m.punto_orden && m.punto_orden !== antes) {
            const punto = { orden: m.punto_orden, nombre: '' };
            await alertarMaquina(m.unidad, punto);
        }
        m.__dirty = false;
        cambios++;
    }

    if (est) est.textContent = cambios > 0 ? ('✓ ' + cambios + ' cambio(s) guardado(s)') : 'Sin cambios pendientes';

    /* Al guardar se cierra el editor */
    if (editorActivo) alternarEditor();
}

function alternarEditor() {
    if (!puedeEditarMapa()) return;
    editorActivo = !editorActivo;
    document.body.classList.toggle('mapa-editando', editorActivo);
    document.querySelector('.barra')?.classList.toggle('editando', editorActivo);
    if (editorActivo && mapa) { try { mapa.closePopup(); } catch (e) {} }
    document.getElementById('editor-controles').style.display = editorActivo ? 'inline-flex' : 'none';
    const bg = document.getElementById('btn-guardar-editor');
    if (bg) bg.style.display = editorActivo ? 'inline-flex' : 'none';
    const ba = document.getElementById('btn-ajustar');
    if (ba) ba.style.display = editorActivo ? 'inline-flex' : 'none';
    const pal = document.getElementById('paleta-linea');
    if (pal) pal.style.display = 'none';

    // recrear maquinas y puntos para que el arrastre quede habilitado/deshabilitado
    try { cargarMaquinas(); cargarVectores(); } catch (e) {}
    const cm = document.getElementById('ctrl-maquina');
    if (cm) cm.style.display = 'none';
    document.getElementById('btn-unidad')?.classList.remove('activo');
    document.getElementById('leyenda-editor').style.display = editorActivo ? 'block' : 'none';
    document.getElementById('btn-editar-puntos').classList.toggle('activo', editorActivo);

    if (typeof cargarVectores === 'function') cargarVectores();

    if (!editorActivo) {
        setModoEditor(null);
        terminarLinea(true);
        mapa.dragging.enable();
        mapa.getContainer().style.cursor = '';
    }
}

/* Cambia el color de la línea en curso y lo deja elegido para la próxima */
function setColorLinea(color) {
    colorLinea = color;
    document.querySelectorAll('.pc-color').forEach(b => {
        b.classList.toggle('activo', b.dataset.color === color);
    });
    if (lineaTemporal) {
        const e = estiloLinea(colorLinea);
        lineaTemporal.setStyle({ color: e.color, weight: e.weight });
    }
}

function setModoEditor(modo) {
    /* Los nombres viejos de línea siguen entrando por compatibilidad */
    if (modo === 'roja' || modo === 'amarilla' || modo === 'turquesa') {
        if (modo === 'roja') colorLinea = '#dc2626';
        if (modo === 'amarilla') colorLinea = '#eab308';
        if (modo === 'turquesa') colorLinea = '#06b6d4';
        modo = 'linea';
    }
    modoEditor = modo;

    document.querySelectorAll('.btn-modo-ed').forEach(b => {
        b.classList.toggle('activo', b.dataset.modo === modo);
    });

    const esLinea = (modo === 'linea');
    const pal = document.getElementById('paleta-linea');
    if (pal) pal.style.display = esLinea ? 'inline-flex' : 'none';
    document.getElementById('btn-terminar-linea').style.display = esLinea ? 'inline-flex' : 'none';
    document.getElementById('btn-cerrar-zona').style.display = esLinea ? 'inline-flex' : 'none';
    if (esLinea) setColorLinea(colorLinea);

    // El mapa SIEMPRE se puede arrastrar; el clic (sin mover) marca el vertice
    mapa.dragging.enable();
    mapa.getContainer().style.cursor =
        (modo === 'punto' || modo === 'retro' || modo === 'excavadora' || modo === 'linea')
            ? 'crosshair' : '';

    if (modo !== 'maquina') {
        const cm = document.getElementById('ctrl-maquina');
        if (cm) cm.style.display = 'none';
        document.getElementById('btn-unidad')?.classList.remove('activo');
    }
    if (modo !== 'linea') terminarLinea(true);
}

/* Muestra u oculta el selector de unidad, para no cargar la barra */
function alternarUnidad() {
    if (!editorActivo) return;
    const cm = document.getElementById('ctrl-maquina');
    if (!cm) return;
    const abrir = cm.style.display === 'none' || !cm.style.display;
    if (abrir) {
        setModoEditor('maquina');
        cm.style.display = 'inline-flex';
        document.getElementById('btn-unidad')?.classList.add('activo');
    } else {
        setModoEditor(null);
        cm.style.display = 'none';
        document.getElementById('btn-unidad')?.classList.remove('activo');
    }
}

async function clickEditor(latlng) {
    if (!editorActivo || !modoEditor || !puedeEditarMapa()) return;

    if (modoEditor === 'punto' || modoEditor === 'retro' || modoEditor === 'excavadora') {
        const { data } = await db.from('mapa_puntos').select('orden').order('orden', { ascending: false }).limit(1);
        const orden = (data && data[0] ? data[0].orden : 0) + 1;
        await db.from('mapa_puntos').insert({
            lat: latlng.lat, lon: latlng.lng, orden,
            tipo: modoEditor === 'punto' ? 'punto' : modoEditor
        });
        cargarVectores();
        return;
    }

    if (modoEditor === 'maquina') {
        await colocarMaquina(latlng);
        return;
    }

    if (modoEditor === 'linea') {
        agregarVertice(latlng.lat, latlng.lng);
    }
}


/* Vertices de la linea en construccion (estilo Google Earth) */
function agregarVertice(lat, lon) {
    verticesLinea.push([lat, lon]);

    const marca = L.marker([lat, lon], {
        draggable: true,
        icon: L.divIcon({
            className: '', html: '<div class="vertice-editor"></div>',
            iconSize: [16, 16], iconAnchor: [8, 8]
        })
    }).addTo(mapa);

    // click derecho: eliminar vertice
    marca.on('contextmenu', (ev) => {
        L.DomEvent.stopPropagation(ev);
        const idx = marcadoresVertices.findIndex(m => m.marca === marca);
        if (idx === -1) return;
        mapa.removeLayer(marca);
        marcadoresVertices.splice(idx, 1);
        verticesLinea.splice(idx, 1);
        redibujarTemporal();
    });

    // arrastrar el vertice: moverlo
    marca.on('drag', (ev) => {
        const idx = marcadoresVertices.findIndex(m => m.marca === marca);
        if (idx === -1) return;
        const pos = ev.target.getLatLng();
        verticesLinea[idx] = [pos.lat, pos.lng];
        redibujarTemporal();
    });

    marcadoresVertices.push({ marca, lat, lon });
    redibujarTemporal();
}

function redibujarTemporal() {
    if (lineaTemporal) { mapa.removeLayer(lineaTemporal); lineaTemporal = null; }
    if (verticesLinea.length < 2) return;

    const cTmp = colorLinea;
    const eTmp = estiloLinea(cTmp);

    lineaTemporal = L.polyline(verticesLinea, {
        color: eTmp.color, weight: eTmp.weight, opacity: 1,
        lineCap: 'round', lineJoin: 'round'
    }).addTo(mapa);
}

function limpiarVertices() {
    marcadoresVertices.forEach(m => mapa.removeLayer(m.marca));
    marcadoresVertices = [];
    if (lineaTemporal) { mapa.removeLayer(lineaTemporal); lineaTemporal = null; }
}


/* Pestaña en la que se está dibujando: define dónde se guarda y dónde se ve */
function ambitoActual() {
    return capaActiva === 'canales' ? 'seguimiento' : 'criticos';
}

async function cerrarZona() {
    if (verticesLinea.length < 3) {
        alert('Marca al menos 3 vértices para cerrar una zona.');
        return;
    }

    const colorFinal = colorLinea;
    const eFinal = estiloLinea(colorFinal);

    await db.from('mapa_lineas').insert({
        nombre: 'Zona',
        color: colorFinal,
        grosor: eFinal.weight,
        tipo: 'poligono',
        ambito: ambitoActual(),
        coords: verticesLinea
    });

    limpiarVertices();
    verticesLinea = [];
    cargarVectores();
}

async function terminarLinea(cancelar) {
    limpiarVertices();

    if (!cancelar && verticesLinea.length >= 2 && modoEditor === 'linea') {
        const colorFinal = colorLinea;
        const eFinal = estiloLinea(colorFinal);

        await db.from('mapa_lineas').insert({
            nombre: 'Línea',
            color: colorFinal,
            grosor: eFinal.weight,
            tipo: 'linea',
            ambito: ambitoActual(),
            coords: verticesLinea
        });
        cargarVectores();
    }
    verticesLinea = [];
}

async function borrarPunto(id) {
    if (!confirm('¿Borrar este punto?')) return;
    await db.from('mapa_puntos').delete().eq('id', id);
    cargarVectores();
}

/* La sesion del conductor se resuelve en la base antes de arrancar */
(async () => {
    await cargarSesionConductor();
    iniciarMapa();
})();
