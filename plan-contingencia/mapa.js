/* ============================================================
   MAPA DE CANALES Y UNIDADES EN VIVO
   ============================================================ */

const SUPABASE_URL = 'https://bfhfnldqwsrcpsdqpyat.supabase.co';
const SUPABASE_KEY = 'sb_publishable_z-jW4WrGLq7wEhCI_CW3Ig_vQZwtOMh';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* Esquinas por defecto (Paramonga) hasta que se ajuste la capa */
let capa = {
    norte: -10.6400,
    sur: -10.7800,
    oeste: -77.9000,
    este: -77.6800,
    opacidad: 0.55
};

let mapa;
let imagen = null;
let modoAjuste = false;
let marcNO = null;
let marcSE = null;
let marcadoresUnidades = [];

/* ------------------------------------------------------------
   Inicio
   ------------------------------------------------------------ */
function iniciarMapa() {
    mapa = L.map('mapa', { zoomControl: true }).setView([-10.7100, -77.7900], 13);

    L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
            maxZoom: 19,
            attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics'
        }
    ).addTo(mapa);

    L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, opacity: 0.85 }
    ).addTo(mapa);

    mapa.on('click', async (e) => {
        if (!simulando) return;
        await moverSimulacion(e.latlng.lat, e.latlng.lng);
    });

    dibujarCapa();
    cargarCapaGuardada();
    if (window.AndroidUbicacion && window.AndroidUbicacion.abrirAjustes) {
        const b = document.getElementById('btn-ajustes-ubicacion');
        if (b) b.style.display = 'inline-flex';
    }

    cargarUnidades();
    cargarUnidadesLista();
    setInterval(cargarUnidades, 30000);
}

function limitesActuales() {
    return [[capa.sur, capa.oeste], [capa.norte, capa.este]];
}

function dibujarCapa() {
    if (imagen) { mapa.removeLayer(imagen); }
    imagen = L.imageOverlay('assets/mapa-canales.png', limitesActuales(), {
        opacity: capa.opacidad,
        interactive: false
    }).addTo(mapa);
}

/* ------------------------------------------------------------
   Cargar / guardar la posicion de la capa
   ------------------------------------------------------------ */
async function cargarCapaGuardada() {
    try {
        const { data, error } = await db.from('mapa_capa').select('*').eq('id', 1).maybeSingle();
        if (error) throw error;

        if (data) {
            capa = {
                norte: data.norte,
                sur: data.sur,
                oeste: data.oeste,
                este: data.este,
                opacidad: data.opacidad ?? 0.55
            };
            document.getElementById('opacidad').value = Math.round(capa.opacidad * 100);
            dibujarCapa();
            mapa.fitBounds(limitesActuales(), { padding: [30, 30] });
            document.getElementById('estado').textContent = 'Capa guardada cargada';
        } else {
            mapa.fitBounds(limitesActuales(), { padding: [30, 30] });
            document.getElementById('estado').textContent = 'Sin ajustar — usa "Ajustar capa"';
        }
    } catch (e) {
        console.error(e);
        document.getElementById('estado').textContent = 'No se pudo leer la capa: ' + e.message;
    }
}

async function guardarCapa() {
    const boton = document.getElementById('btn-guardar');
    boton.disabled = true;
    boton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando';

    const fila = {
        id: 1,
        norte: capa.norte,
        sur: capa.sur,
        este: capa.este,
        oeste: capa.oeste,
        opacidad: capa.opacidad,
        actualizado_en: new Date().toISOString()
    };

    const { error } = await db.from('mapa_capa').upsert(fila, { onConflict: 'id' });

    boton.disabled = false;
    boton.innerHTML = '<i class="fas fa-floppy-disk"></i> Guardar';

    if (error) {
        document.getElementById('estado').textContent = 'Error al guardar: ' + error.message;
        return;
    }

    document.getElementById('estado').textContent = 'Capa guardada ✓';
    alternarAjuste();
}

/* ------------------------------------------------------------
   Modo ajuste: dos esquinas arrastrables
   ------------------------------------------------------------ */
function alternarAjuste() {
    modoAjuste = !modoAjuste;

    document.getElementById('btn-ajustar').classList.toggle('activo', modoAjuste);
    document.getElementById('btn-guardar').style.display = modoAjuste ? 'inline-flex' : 'none';
    document.getElementById('leyenda').style.display = modoAjuste ? 'block' : 'none';

    if (modoAjuste) {
        if (imagen) imagen.setOpacity(Math.min(capa.opacidad, 0.75));
        crearMarcasEsquinas();
        document.getElementById('estado').textContent = 'Ajustando la capa…';
    } else {
        if (marcNO) { mapa.removeLayer(marcNO); marcNO = null; }
        if (marcSE) { mapa.removeLayer(marcSE); marcSE = null; }
        if (imagen) imagen.setOpacity(capa.opacidad);
    }
}

function pinEsquina(lat, lon, texto) {
    return L.marker([lat, lon], {
        draggable: true,
        icon: L.divIcon({
            className: '',
            html: `<div style="background:#10b981;color:#fff;padding:4px 8px;border-radius:8px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.35)">${texto}</div>`,
            iconAnchor: [20, 10]
        })
    }).addTo(mapa);
}

function crearMarcasEsquinas() {
    if (marcNO) { mapa.removeLayer(marcNO); marcNO = null; }
    if (marcSE) { mapa.removeLayer(marcSE); marcSE = null; }

    marcNO = pinEsquina(capa.norte, capa.oeste, 'NO');
    marcSE = pinEsquina(capa.sur, capa.este, 'SE');

    marcNO.on('drag', (e) => {
        const p = e.target.getLatLng();
        capa.norte = p.lat;
        capa.oeste = p.lng;
        imagen.setBounds(limitesActuales());
    });

    marcSE.on('drag', (e) => {
        const p = e.target.getLatLng();
        capa.sur = p.lat;
        capa.este = p.lng;
        imagen.setBounds(limitesActuales());
    });
}

/* ------------------------------------------------------------
   Opacidad
   ------------------------------------------------------------ */
function cambiarOpacidad(valor) {
    capa.opacidad = Number(valor) / 100;
    if (imagen) imagen.setOpacity(capa.opacidad);
}

/* ------------------------------------------------------------
   Unidades en vivo
   ------------------------------------------------------------ */
async function cargarUnidades() {
    try {
        const { data, error } = await db
            .from('ubicaciones')
            .select('*')
            .order('actualizado_en', { ascending: false });

        if (error) throw error;

        marcadoresUnidades.forEach(m => mapa.removeLayer(m));
        marcadoresUnidades = [];

        (data || []).forEach(u => {
            const minutos = (Date.now() - new Date(u.actualizado_en).getTime()) / 60000;
            const color = minutos < 30 ? '#16a34a' : minutos < 120 ? '#f59e0b' : '#dc2626';
            const hora = new Date(u.actualizado_en).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

            const marcador = L.marker([u.lat, u.lon], {
                icon: L.divIcon({
                    className: '',
                    html: `<div style="font-size:20px;color:${color};text-shadow:0 0 5px #fff"><i class="fas fa-truck-pickup"></i></div>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                })
            }).addTo(mapa);

            const titulo = u.unidad || u.user_id;
            marcador.bindPopup(`<strong>${titulo}</strong><br>${u.user_id && u.user_id !== titulo ? u.user_id + '<br>' : ''}Actualizado: ${hora}<br>Precisión: ${Math.round(u.precision_m || 0)} m`);
            marcadoresUnidades.push(marcador);
        });

        if (!modoAjuste) {
            document.getElementById('estado').textContent = (data || []).length + ' unidad(es) en el mapa';
        }
    } catch (e) {
        console.warn('Unidades:', e);
    }
}

function centrarEnDatos() {
    if (marcadoresUnidades.length > 0) {
        const grupo = L.featureGroup(marcadoresUnidades);
        mapa.fitBounds(grupo.getBounds(), { padding: [50, 50] });
    } else {
        mapa.fitBounds(limitesActuales(), { padding: [30, 30] });
    }
}



/* ------------------------------------------------------------
   Lista de unidades + asignacion de unidad en la simulacion
   ------------------------------------------------------------ */
async function cargarUnidadesLista() {
    const sel = document.getElementById('sel-unidad');
    const { data } = await db.from('unidades').select('nombre').eq('activo', true).order('nombre');
    sel.innerHTML = '<option value="">— sin unidad —</option>' +
        (data || []).map(u => `<option value="${u.nombre}">${u.nombre}</option>`).join('');
}

document.addEventListener('change', (ev) => {
    if (ev.target && ev.target.id === 'sel-unidad' && window.AndroidUbicacion && window.AndroidUbicacion.cambiarUnidad) {
        window.AndroidUbicacion.cambiarUnidad(ev.target.value || '');
    }
});

function unidadSeleccionada() {
    const sel = document.getElementById('sel-unidad');
    return sel && sel.value ? sel.value : null;
}

/* ------------------------------------------------------------
   Simulacion de unidad (para pruebas)
   ------------------------------------------------------------ */
let simulando = false;

function alternarSimulacion() {
    simulando = !simulando;
    document.getElementById('btn-simular').classList.toggle('activo', simulando);
    document.getElementById('leyenda-sim').style.display = simulando ? 'block' : 'none';
    document.getElementById('mapa').style.cursor = simulando ? 'crosshair' : '';
}

async function moverSimulacion(lat, lon) {
    const unidad = unidadSeleccionada() || 'SIMULACION';
    const fila = {
        user_id: 'SIMULACION',
        unidad: unidad,
        lat,
        lon,
        precision_m: 8,
        bateria: 90,
        actualizado_en: new Date().toISOString()
    };
    const { error } = await db.from('ubicaciones').upsert(fila, { onConflict: 'user_id' });
    if (error) { document.getElementById('estado').textContent = 'Error: ' + error.message; return; }
    document.getElementById('estado').textContent = (unidad === 'SIMULACION' ? 'Unidad simulada' : unidad) + ' en ' + lat.toFixed(5) + ', ' + lon.toFixed(5);
    cargarUnidades();
}

async function borrarSimulacion() {
    await db.from('ubicaciones').delete().eq('user_id', 'SIMULACION');
    document.getElementById('estado').textContent = 'Simulación borrada';
    cargarUnidades();
}



/* ------------------------------------------------------------
   Ubicacion REAL del celular
   ------------------------------------------------------------ */
let rastreando = false;
let watchId = null;
let ultimoEnvio = 0;

function usuarioActual() {
    try {
        const u = JSON.parse(localStorage.getItem('pc_user') || 'null');
        return u && u.area ? u.area : 'UNIDAD MOVIL';
    } catch (e) { return 'UNIDAD MOVIL'; }
}

function alternarRastreo() {
    if (rastreando) { detenerRastreo(); return; }
    if (!navigator.geolocation) {
        document.getElementById('estado').textContent = 'Este dispositivo no permite geolocalización';
        return;
    }
    rastreando = true;
    document.getElementById('btn-rastreo').classList.add('activo');
    document.getElementById('btn-rastreo').innerHTML = '<i class="fas fa-stop"></i> Detener ubicación';

    // Servicio nativo: sigue enviando aunque se cierre la app
    if (window.AndroidUbicacion && window.AndroidUbicacion.iniciarServicio) {
        window.AndroidUbicacion.iniciarServicio(usuarioActual(), unidadSeleccionada() || '');
    }

    watchId = navigator.geolocation.watchPosition(
        (pos) => enviarUbicacion(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
        (err) => {
            document.getElementById('estado').textContent = 'Permiso de ubicación: ' + err.message;
        },
        { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 }
    );
}

function detenerRastreo() {
    rastreando = false;
    if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    document.getElementById('btn-rastreo').classList.remove('activo');
    if (window.AndroidUbicacion && window.AndroidUbicacion.detenerServicio) {
        window.AndroidUbicacion.detenerServicio();
    }
    document.getElementById('btn-rastreo').innerHTML = '<i class="fas fa-satellite-dish"></i> Compartir mi ubicación';
    document.getElementById('estado').textContent = 'Ubicación detenida';
}

async function enviarUbicacion(lat, lon, precision) {
    const ahora = Date.now();
    if (ahora - ultimoEnvio < 60000) return;   // maximo un envio por minuto
    ultimoEnvio = ahora;

    const unidad = unidadSeleccionada();
    const fila = {
        user_id: usuarioActual(),
        unidad: unidad,
        lat,
        lon,
        precision_m: precision || null,
        actualizado_en: new Date().toISOString()
    };

    const { error } = await db.from('ubicaciones').upsert(fila, { onConflict: 'user_id' });
    if (error) {
        document.getElementById('estado').textContent = 'No se pudo enviar: ' + error.message;
        return;
    }
    document.getElementById('estado').textContent =
        'Enviando ' + (unidad || 'sin unidad') + ' · ' + lat.toFixed(5) + ', ' + lon.toFixed(5);
    cargarUnidades();
}



/* Abre los ajustes de la app para elegir "Permitir todo el tiempo" */
function abrirAjustesUbicacion() {
    if (window.AndroidUbicacion && window.AndroidUbicacion.abrirAjustes) {
        window.AndroidUbicacion.abrirAjustes();
    } else {
        alert('Esta opción solo está disponible dentro de la app instalada.');
    }
}


iniciarMapa();
