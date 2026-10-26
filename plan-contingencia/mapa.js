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
   ------------------------------------------------------------ */
function sesionConductor() {
    try { return JSON.parse(localStorage.getItem('conductor') || 'null'); } catch (e) { return null; }
}

function usuarioPlan() {
    try { return JSON.parse(localStorage.getItem('pc_user') || 'null'); } catch (e) { return null; }
}

function normalizar(v) {
    return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function accesoPermitido() {
    if (sesionConductor()) return true;
    const u = usuarioPlan();
    if (!u) return false;
    if (u.rol === 'gerente_general' || u.rol === 'gerencial_legal') return true;
    const texto = normalizar((u.seccion || '') + ' ' + (u.area || ''));
    return texto.includes('operaciones agricolas') || texto.includes('seguridad industrial');
}

function esMovil() {
    return window.innerWidth < 900 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/* ------------------------------------------------------------
   Inicio
   ------------------------------------------------------------ */
function aplicarModoPantallaConductor() {
    const pantalla = document.getElementById('pantalla-conductor');
    if (pantalla) pantalla.style.display = 'flex';
    const barra = document.querySelector('.barra');
    if (barra) barra.style.display = 'none';
    const zonaMapa = document.getElementById('mapa');
    if (zonaMapa) zonaMapa.style.display = 'none';

    const c = sesionConductor();
    if (c) {
        const u = document.getElementById('pc-unidad');
        const n = document.getElementById('pc-nombre');
        const i = document.getElementById('pc-inicio');
        if (u) u.textContent = c.unidad || '—';
        if (n) n.textContent = c.nombre || '—';
        if (i) {
            const inicio = c.inicio ? new Date(c.inicio) : new Date();
            i.textContent = inicio.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) + ' · ' +
                inicio.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
        }
    }
}

function iniciarMapa() {
    // Conductor: pantalla de turno, sin mapa
    if (sesionConductor()) {
        aplicarSesionConductor();
        aplicarModoPantallaConductor();
        return;
    }

    if (!accesoPermitido()) {
        const m = document.getElementById('sin-acceso');
        if (m) m.style.display = 'flex';
        const barra = document.querySelector('.barra');
        if (barra) barra.style.display = 'none';
        return;
    }

    mapa = L.map('mapa', { zoomControl: true }).setView([-10.7100, -77.7900], 13);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, attribution: 'Imágenes © Esri, Maxar' }).addTo(mapa);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, opacity: 0.85 }).addTo(mapa);

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
        const puede = !esMovil() && !sesionConductor() && accesoPermitido();
        botonEd.style.display = puede ? 'inline-flex' : 'none';
    }

    const botonAjustar = document.getElementById('btn-ajustar');
    if (botonAjustar) botonAjustar.style.display = esMovil() ? 'none' : 'inline-flex';
}

/* ------------------------------------------------------------
   Ajuste de la capa activa
   ------------------------------------------------------------ */
function alternarAjuste() {
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
        if (est) est.textContent = (data || []).length + ' unidad(es) en el mapa';
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

    if (!token) token = await buscarToken(usuario);

    if (!token && usuario) {
        const { data } = await db.from('ubicaciones').select('token').eq('user_id', usuario).maybeSingle();
        if (data && data.token) token = data.token;
    }

    if (!token) {
        alert('La unidad ' + (unidad || usuario) + ' no tiene celular registrado para alarmas.\n\nEl conductor debe cerrar turno y volver a iniciarlo aceptando las notificaciones.');
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
                userId: usuario || null, token: token || null,
                excluir: (localStorage.getItem('pushToken') || null)
            })
        });
        const datos = await resp.json().catch(() => ({}));
        const est = document.getElementById('estado');
        if (est) est.textContent = 'Alerta enviada a ' + quien + ' · equipos: ' + (datos.fcm_enviados ?? 0);
    } catch (e) {
        const est = document.getElementById('estado');
        if (est) est.textContent = 'No se pudo enviar: ' + e.message;
    }
}

/* ------------------------------------------------------------
   Sesion de conductor
   ------------------------------------------------------------ */
function aplicarSesionConductor() {
    const c = sesionConductor();

    if (!c) return;

    // El conductor NO ve el mapa: solo su pantalla de turno
    const pantalla = document.getElementById('pantalla-conductor');
    if (pantalla) pantalla.style.display = 'flex';

    const barra = document.querySelector('.barra');
    if (barra) barra.style.display = 'none';

    const zonaMapa = document.getElementById('mapa');
    if (zonaMapa) zonaMapa.style.display = 'none';

    document.getElementById('pc-unidad').textContent = c.unidad || '—';
    document.getElementById('pc-nombre').textContent = c.nombre || '—';

    let inicio = c.inicio ? new Date(c.inicio) : new Date();
    document.getElementById('pc-inicio').textContent =
        inicio.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) + ' · ' +
        inicio.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

    // El envio de ubicacion y las alarmas siguen igual
    iniciarRastreoSilencioso(c);
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

    if (window.AndroidUbicacion && window.AndroidUbicacion.detenerServicio) {
        window.AndroidUbicacion.detenerServicio();
    }

    if (c && c.nombre) await db.from('ubicaciones').delete().eq('user_id', c.nombre);

    localStorage.removeItem('conductor');
    localStorage.removeItem('pushToken');
    window.location.href = 'conductor.html';
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
let capaUnidades = null;
let capaMaquinas = null;
let maquinasCache = [];
let capaPuntos = null;
let capaLineas = null;
let verticesLinea = [];
let lineaTemporal = null;
let marcadoresVertices = [];

function initCapasVectoriales() {
    capaUnidades = L.layerGroup().addTo(mapa);
    capaMaquinas = L.layerGroup();
    capaPuntos = L.layerGroup();
    capaLineas = L.layerGroup();
    cargarVectores();
    cargarMaquinas();
    cargarListaMaquinas();
    aplicarVisibilidadCapas();
}

/* ================= MAQUINAS DE PUNTOS CRITICOS ================= */
const RADIO_PUNTO_M = 150;

function distanciaMetros(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const f1 = lat1 * Math.PI / 180, f2 = lat2 * Math.PI / 180;
    const df = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(df/2)**2 + Math.cos(f1)*Math.cos(f2)*Math.sin(dl/2)**2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function puntoMasCercano(lat, lon) {
    const { data } = await db.from('mapa_puntos').select('orden, nombre, lat, lon');
    let mejor = null;
    (data || []).forEach(p => {
        const dist = distanciaMetros(lat, lon, p.lat, p.lon);
        if (dist <= RADIO_PUNTO_M && (!mejor || dist < mejor.dist)) mejor = { ...p, dist };
    });
    return mejor;
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
        const tipo = m.unidad.includes('EXCAVADORA DE ARRASTRE') ? 'excavadora'
            : m.unidad.includes('EXCAVADORA') ? 'excavadora' : 'retro';
        const tam = m.tamano || 40;

        const marca = L.marker([m.lat, m.lon], {
            draggable: editorActivo,
            icon: L.divIcon({
                className: '',
                html: `<div class="icono-maquina" style="width:${tam}px;height:${Math.round(tam*0.76)}px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))">${iconoMaquinaria(tipo)}</div>`,
                iconSize: [tam, Math.round(tam*0.76)],
                iconAnchor: [Math.round(tam/2), Math.round(tam*0.68)]
            })
        }).addTo(capaMaquinas);

        marca.bindTooltip(m.unidad + (m.punto_orden ? ' · punto ' + m.punto_orden : ''),
            { permanent: false, direction: 'top' });

        marca.on('contextmenu', async (ev) => {
            L.DomEvent.stopPropagation(ev);
            if (!editorActivo) return;
            if (!confirm('¿Quitar ' + m.unidad + ' del mapa?')) return;
            await db.from('mapa_maquinas').delete().eq('id', m.id);
            cargarMaquinas();
        });

        marca.on('dragend', async (ev) => {
            const pos = ev.target.getLatLng();
            const punto = await puntoMasCercano(pos.lat, pos.lng);
            const nuevoOrden = punto ? punto.orden : null;

            await db.from('mapa_maquinas').update({
                lat: pos.lat, lon: pos.lng,
                punto_orden: nuevoOrden,
                actualizado_en: new Date().toISOString()
            }).eq('id', m.id);

            const est = document.getElementById('estado');

            if (nuevoOrden && nuevoOrden !== m.punto_orden) {
                await alertarMaquina(m.unidad, punto);
                if (est) est.textContent = '✓ ' + m.unidad + ' asignada al punto ' + nuevoOrden + ' – ' + (punto.nombre || '');
            } else if (nuevoOrden) {
                if (est) est.textContent = '✓ ' + m.unidad + ' sigue en el punto ' + nuevoOrden;
            } else {
                if (est) est.textContent = '✓ ' + m.unidad + ' movida (sin punto cercano)';
            }

            cargarMaquinas();
        });
    });
}

/* Avisa al conductor logueado en esa maquina */
async function alertarMaquina(unidad, punto) {
    try {
        const { data } = await db.from('ubicaciones').select('user_id, token, unidad');
        const fila = (data || []).find(u => normalizar(u.unidad) === normalizar(unidad));
        if (!fila) return;

        await fetch(FUNC_PUSH, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: 'Dirígete al punto ' + punto.orden + ' – ' + (punto.nombre || ''),
                body: 'Se te asignó este punto crítico. Dirígete de inmediato.',
                userId: fila.user_id,
                token: fila.token || null
            })
        });
    } catch (e) { console.warn('alerta maquina', e); }
}

async function colocarMaquina(latlng) {
    const sel = document.getElementById('sel-maquina');
    const unidad = sel && sel.value ? sel.value : null;
    if (!unidad) { alert('No hay máquinas de puntos críticos registradas.'); return; }

    const punto = await puntoMasCercano(latlng.lat, latlng.lng);

    await db.from('mapa_maquinas').upsert({
        unidad,
        lat: latlng.lat,
        lon: latlng.lng,
        punto_orden: punto ? punto.orden : null,
        tamano: 40,
        actualizado_en: new Date().toISOString()
    }, { onConflict: 'unidad' });

    cargarMaquinas();
}

async function cambiarTamanoMaquinas(valor) {
    const tam = Number(valor);
    for (const m of maquinasCache) {
        await db.from('mapa_maquinas').update({ tamano: tam }).eq('id', m.id);
    }
    cargarMaquinas();
}

/* Muestra solo lo que corresponde a la pestaña activa */
function aplicarVisibilidadCapas() {
    if (!mapa || !capaUnidades) return;

    const esSeguimiento = (capaActiva === 'canales');

    if (esSeguimiento) {
        if (!mapa.hasLayer(capaUnidades)) mapa.addLayer(capaUnidades);
        if (mapa.hasLayer(capaPuntos)) mapa.removeLayer(capaPuntos);
        if (mapa.hasLayer(capaLineas)) mapa.removeLayer(capaLineas);
        if (mapa.hasLayer(capaMaquinas)) mapa.removeLayer(capaMaquinas);
    } else {
        if (mapa.hasLayer(capaUnidades)) mapa.removeLayer(capaUnidades);
        if (!mapa.hasLayer(capaPuntos)) mapa.addLayer(capaPuntos);
        if (!mapa.hasLayer(capaLineas)) mapa.addLayer(capaLineas);
        if (!mapa.hasLayer(capaMaquinas)) mapa.addLayer(capaMaquinas);
    }
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

    const { data: puntos } = await db.from('mapa_puntos').select('*').order('orden');
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

        marcador.on('dragend', async (ev) => {
            const pos = ev.target.getLatLng();
            const { error } = await db.from('mapa_puntos')
                .update({ lat: pos.lat, lon: pos.lng })
                .eq('id', p.id);

            const est = document.getElementById('estado');
            if (error) {
                if (est) est.textContent = '❌ No se guardó el punto ' + p.orden + ': ' + error.message;
                return;
            }
            p.lat = pos.lat; p.lon = pos.lng;
            if (est) est.textContent = '✓ Punto ' + p.orden + ' guardado en su nueva posición';
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
        const estilo = estiloLinea(l.color || '#dc2626');
        const grosor = l.grosor || estilo.weight;

        if (estilo.borde > 0) {
            L.polyline(l.coords, { color: 'rgba(0,0,0,.45)', weight: grosor + 4, opacity: 1,
                lineCap: 'round', lineJoin: 'round' }).addTo(capaLineas);
        }

        let linea;
        if (l.tipo === 'poligono') {
            linea = L.polygon(l.coords, {
                color: estilo.color, weight: grosor, opacity: 1,
                fillColor: estilo.color, fillOpacity: 0.30
            }).addTo(capaLineas);
        } else {
            linea = L.polyline(l.coords, {
                color: estilo.color, weight: grosor, opacity: 1,
                lineCap: 'round', lineJoin: 'round'
            }).addTo(capaLineas);
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

function alternarEditor() {
    editorActivo = !editorActivo;
    document.getElementById('editor-controles').style.display = editorActivo ? 'inline-flex' : 'none';
    const cm = document.getElementById('ctrl-maquina');
    if (cm) cm.style.display = editorActivo ? 'inline-flex' : 'none';
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

function setModoEditor(modo) {
    modoEditor = modo;

    document.querySelectorAll('.btn-modo-ed').forEach(b => {
        b.classList.toggle('activo', b.dataset.modo === modo);
    });

    const esLinea = (modo === 'roja' || modo === 'amarilla' || modo === 'turquesa');
    document.getElementById('btn-terminar-linea').style.display = esLinea ? 'inline-flex' : 'none';
    document.getElementById('btn-cerrar-zona').style.display = esLinea ? 'inline-flex' : 'none';

    // El mapa SIEMPRE se puede arrastrar; el clic (sin mover) marca el vertice
    mapa.dragging.enable();
    mapa.getContainer().style.cursor =
        (modo === 'punto' || modo === 'retro' || modo === 'excavadora'
         || modo === 'roja' || modo === 'amarilla' || modo === 'turquesa')
            ? 'crosshair' : '';

    if (modo !== 'roja' && modo !== 'amarilla') terminarLinea(true);
}

async function clickEditor(latlng) {
    if (!editorActivo || !modoEditor) return;

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

    if (modoEditor === 'roja' || modoEditor === 'amarilla' || modoEditor === 'turquesa') {
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

    const cTmp = modoEditor === 'roja' ? '#dc2626' : (modoEditor === 'turquesa' ? '#06b6d4' : '#eab308');
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


async function cerrarZona() {
    if (verticesLinea.length < 3) {
        alert('Marca al menos 3 vértices para cerrar una zona.');
        return;
    }

    const colorFinal = modoEditor === 'roja' ? '#dc2626'
        : (modoEditor === 'turquesa' ? '#06b6d4' : '#eab308');
    const eFinal = estiloLinea(colorFinal);

    await db.from('mapa_lineas').insert({
        nombre: 'Zona ' + (modoEditor === 'roja' ? 'roja' : (modoEditor === 'turquesa' ? 'turquesa' : 'amarilla')),
        color: colorFinal,
        grosor: eFinal.weight,
        tipo: 'poligono',
        coords: verticesLinea
    });

    limpiarVertices();
    verticesLinea = [];
    cargarVectores();
}

async function terminarLinea(cancelar) {
    limpiarVertices();

    if (!cancelar && verticesLinea.length >= 2 && (modoEditor === 'roja' || modoEditor === 'amarilla' || modoEditor === 'turquesa')) {
        const colorFinal = modoEditor === 'roja' ? '#dc2626'
            : (modoEditor === 'turquesa' ? '#06b6d4' : '#eab308');
        const eFinal = estiloLinea(colorFinal);

        await db.from('mapa_lineas').insert({
            nombre: modoEditor === 'roja' ? 'Línea roja'
                : (modoEditor === 'turquesa' ? 'Línea turquesa' : 'Línea amarilla'),
            color: colorFinal,
            grosor: eFinal.weight,
            tipo: 'linea',
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

async function borrarTodo() {
    if (!confirm('¿Borrar TODOS los puntos y líneas?')) return;
    await db.from('mapa_puntos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await db.from('mapa_lineas').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    cargarVectores();
}


iniciarMapa();
