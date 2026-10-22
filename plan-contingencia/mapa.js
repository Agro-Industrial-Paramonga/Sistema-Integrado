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

    dibujarCapa();
    cargarCapaGuardada();
    cargarUnidades();
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

            marcador.bindPopup(`<strong>${u.user_id}</strong><br>Actualizado: ${hora}<br>Precisión: ${Math.round(u.precision_m || 0)} m`);
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
   Simulacion de unidad (para pruebas)
   ------------------------------------------------------------ */
let simulando = false;

function alternarSimulacion() {
    simulando = !simulando;
    document.getElementById('btn-simular').classList.toggle('activo', simulando);
    document.getElementById('leyenda-sim').style.display = simulando ? 'block' : 'none';
    document.getElementById('mapa').style.cursor = simulando ? 'crosshair' : '';
}

mapa.on('click', async (e) => {
    if (!simulando) return;
    await moverSimulacion(e.latlng.lat, e.latlng.lng);
});

async function moverSimulacion(lat, lon) {
    const fila = {
        user_id: 'SIMULACION',
        lat,
        lon,
        precision_m: 8,
        bateria: 90,
        actualizado_en: new Date().toISOString()
    };
    const { error } = await db.from('ubicaciones').upsert(fila, { onConflict: 'user_id' });
    if (error) { document.getElementById('estado').textContent = 'Error: ' + error.message; return; }
    document.getElementById('estado').textContent = 'Ubicación simulada en ' + lat.toFixed(5) + ', ' + lon.toFixed(5);
    cargarUnidades();
}

async function borrarSimulacion() {
    await db.from('ubicaciones').delete().eq('user_id', 'SIMULACION');
    document.getElementById('estado').textContent = 'Simulación borrada';
    cargarUnidades();
}


iniciarMapa();
