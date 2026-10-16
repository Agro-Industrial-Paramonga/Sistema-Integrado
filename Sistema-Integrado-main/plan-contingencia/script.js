/* ============================================================
   CONFIGURACIÓN SUPABASE
   ============================================================ */
const SUPABASE_URL  = 'https://bfhfnldqwsrcpsdqpyat.supabase.co';
const SUPABASE_KEY  = 'sb_publishable_z-jW4WrGLq7wEhCI_CW3Ig_vQZwtOMh';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
/* ============================================================
   FIREBASE CLOUD MESSAGING (FCM)
   ============================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyA7Qetf1kwg2orGCbEwsRqeh0a11gtcs4U",
  authDomain: "cotingencia-1eead.firebaseapp.com",
  projectId: "cotingencia-1eead",
  storageBucket: "cotingencia-1eead.firebasestorage.app",
  messagingSenderId: "557548438329",
  appId: "1:557548438329:web:6745fb497c2cc89117dee8"
};

const VAPID_PUBLIC_KEY = "BCan4P2QR0bSBc4DKW7lfPpLQtgWRFdAW-4_-sEaLaZcj7yCe8hfuewWizSvrjtjpwpS6QZMvU0_xpoo-19puls";
const SUPABASE_URL_FUNCTIONS = "https://bfhfnldqwsrcpsdqpyat.supabase.co/functions/v1";

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();
/* ============================================================
   LOGIN Y SESIÓN
   ============================================================ */
const SESSION_KEY = 'pc_user';

function obtenerSesion() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); }
    catch { return null; }
}
function guardarSesion(u) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(u));
}
function limpiarSesion() {
    localStorage.removeItem(SESSION_KEY);
}

/* ============================================================
   FORMATEO DE COSTOS
   ============================================================ */
function parsearCosto(valor) {
    if (valor === null || valor === undefined || valor === '') return 0;
    let s = String(valor).replace(/[^\d.,]/g, '');
    if (!s) return 0;

    if (s.includes(',')) {
        s = s.replace(/,/g, '');
        const num = parseFloat(s);
        return isNaN(num) ? 0 : num;
    }

    const partes = s.split('.');
    if (partes.length > 2) {
        return parseInt(partes.join(''), 10) || 0;
    }
    if (partes.length === 2) {
        if (partes[1].length === 3 && partes[0].length <= 3) {
            return parseInt(partes.join(''), 10) || 0;
        }
        const num = parseFloat(s);
        return isNaN(num) ? 0 : num;
    }

    return parseInt(s, 10) || 0;
}

function formatearCosto(valor) {
    if (valor === null || valor === undefined || valor === '') return '';
    const num = parsearCosto(valor);
    if (isNaN(num) || num === 0 && String(valor).replace(/\D/g, '') === '') return '';
    return 'S/ ' + num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function actualizarTotalAntes(medidas) {
    const el = document.getElementById('total-antes');
    if (!el) return;
    const total = medidas.reduce((acc, m) => acc + parsearCosto(m.costo), 0);
    el.textContent = 'S/ ' + total.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

/* ============================================================
   MODAL DE ALERTAS / CONFIRMACIONES
   ============================================================ */
const appModal        = document.getElementById('app-modal');
const appModalIcon    = document.getElementById('app-modal-icon');
const appModalTitle   = document.getElementById('app-modal-title');
const appModalMessage = document.getElementById('app-modal-message');
const appModalCancel  = document.getElementById('app-modal-cancel');
const appModalOk      = document.getElementById('app-modal-ok');

function mostrarAlerta(mensaje, titulo = 'Aviso', tipo = 'info') {
    return new Promise((resolve) => {
        appModalTitle.textContent = titulo;
        appModalMessage.textContent = mensaje;
        appModalCancel.style.display = 'none';

        appModalIcon.className = 'app-modal-icon';
        appModalOk.className = 'app-modal-btn app-modal-btn-ok';

        if (tipo === 'warn')  appModalIcon.classList.add('warn');
        if (tipo === 'error') appModalIcon.classList.add('error');

        appModal.classList.add('active');

        const cerrar = () => {
            appModal.classList.remove('active');
            appModalOk.removeEventListener('click', cerrar);
            resolve(true);
        };
        appModalOk.addEventListener('click', cerrar);
    });
}

function mostrarConfirm(mensaje, titulo = 'Confirmar', tipo = 'info') {
    return new Promise((resolve) => {
        appModalTitle.textContent = titulo;
        appModalMessage.textContent = mensaje;
        appModalCancel.style.display = 'inline-block';

        appModalIcon.className = 'app-modal-icon';
        appModalOk.className = 'app-modal-btn app-modal-btn-ok';
        if (tipo === 'warn')  appModalIcon.classList.add('warn');
        if (tipo === 'error') {
            appModalIcon.classList.add('error');
            appModalOk.classList.add('danger');
        }

        appModal.classList.add('active');

        const cerrar = (resultado) => {
            appModal.classList.remove('active');
            appModalOk.removeEventListener('click', onOk);
            appModalCancel.removeEventListener('click', onCancel);
            resolve(resultado);
        };
        const onOk     = () => cerrar(true);
        const onCancel = () => cerrar(false);

        appModalOk.addEventListener('click', onOk);
        appModalCancel.addEventListener('click', onCancel);
    });
}

/* ============================================================
   HISTORIAL
   ============================================================ */
async function registrarHistorial(accion, tabla, medidaId, detalle) {
    const user = obtenerSesion();
    if (!user) return;
    try {
        await db.from('historial').insert({
            area: user.area,
            accion,
            tabla,
            medida_id: medidaId || null,
            detalle: detalle || null
        });
    } catch (e) {
        console.error('Error al registrar historial:', e);
    }
}

async function abrirModalHistorial() {
    const user = obtenerSesion();
    if (!user) return;
    const cont = document.getElementById('lista-historial');
    cont.innerHTML = '<p class="modal-help">Cargando…</p>';
    document.getElementById('modal-historial').classList.add('active');

    let query = db.from('historial')
        .select('*')
        .eq('accion', 'crear')
        .order('created_at', { ascending: false })
        .limit(200);

    if (!esVistaCompleta()) {
        query = query.eq('area', user.area);
    }

    const { data, error } = await query;
    if (error) {
        console.error(error);
        cont.innerHTML = '<p class="modal-help">Error al cargar historial.</p>';
        return;
    }
    if (!data || data.length === 0) {
        cont.innerHTML = '<p class="modal-help">Aún no has agregado nuevas actividades.</p>';
        return;
    }

    cont.innerHTML = '';
    data.forEach(h => {
        const item = document.createElement('div');
        item.className = 'historial-item';
        const fecha = new Date(h.created_at);
        const fechaStr = fecha.toLocaleString('es-PE', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
        const areaExtra = esVistaCompleta() ? ` · <em>${h.area}</em>` : '';
        item.innerHTML = `
            <div class="historial-head">
                <strong>Nueva actividad</strong>
                <span class="historial-fecha">${fechaStr}</span>
            </div>
            <div class="historial-body">
                ${h.detalle || ''}${areaExtra}
            </div>
        `;
        cont.appendChild(item);
    });
}

function cerrarModalHistorial() {
    document.getElementById('modal-historial').classList.remove('active');
}

/* ============================================================
   FOTOS DE MEDIDAS
   ============================================================ */
let imagenesCache = [];
let fotosContexto = { tabla: null, medidaId: null };

async function cargarImagenes() {
    const { data, error } = await db
        .from('imagenes_medidas')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) {
        console.error('Error al cargar imágenes:', error);
        return;
    }
    imagenesCache = data || [];
}

function contarFotos(tabla, medidaId) {
    return imagenesCache.filter(i => i.tabla === tabla && i.medida_id === medidaId).length;
}

function urlPublicaFoto(path) {
    const { data } = db.storage.from('medidas-fotos').getPublicUrl(path);
    return data.publicUrl;
}

function botonFotosHTML(tabla, medidaId) {
    const total = contarFotos(tabla, medidaId);
    return `
        <button class="btn-fotos ${total > 0 ? 'tiene-fotos' : ''}" onclick="abrirModalFotos('${tabla}', '${medidaId}')" title="Fotos">
            <i class="fas fa-camera"></i>
            <span>${total}</span>
        </button>
    `;
}

function abrirModalFotos(tabla, medidaId) {
    fotosContexto = { tabla, medidaId };
    document.getElementById('foto-input').value = '';

    const tituloMap = { antes: 'Antes', durante: 'Durante', despues: 'Después' };
    document.getElementById('modal-fotos-title').textContent =
        `Fotos · Medidas ${tituloMap[tabla] || tabla}`;

    renderFotosModal();
    document.getElementById('modal-fotos').classList.add('active');
}

function cerrarModalFotos() {
    document.getElementById('modal-fotos').classList.remove('active');
    fotosContexto = { tabla: null, medidaId: null };
}

function renderFotosModal() {
    const { tabla, medidaId } = fotosContexto;
    if (!tabla || !medidaId) return;

    const fotos = imagenesCache.filter(i => i.tabla === tabla && i.medida_id === medidaId);
    const grid  = document.getElementById('fotos-grid');
    const info  = document.getElementById('fotos-info');

    const btnSubir = document.querySelector('#fotos-toolbar .btn-subir-foto');
    if (btnSubir) {
        btnSubir.style.display = esVistaCompleta() ? 'none' : 'inline-flex';
    }

    info.textContent = fotos.length === 0
        ? 'Sin fotos'
        : `${fotos.length} foto${fotos.length > 1 ? 's' : ''}`;

    if (fotos.length === 0) {
        grid.innerHTML = `
            <div class="fotos-empty">
                <i class="fas fa-image"></i>
                <p>No hay fotos cargadas</p>
            </div>
        `;
        return;
    }

      const soloLectura = esVistaCompleta();
    grid.innerHTML = '';
    fotos.forEach(f => {
        const url = urlPublicaFoto(f.storage_path);
        const item = document.createElement('div');
        item.className = 'foto-item';
        item.innerHTML = `
            <img src="${url}" alt="${f.nombre}" loading="lazy" onclick="abrirLightbox('${url}')">
            ${!soloLectura ? `
                <button class="foto-delete" onclick="eliminarFoto('${f.id}', '${f.storage_path}')" title="Eliminar">
                    <i class="fas fa-times"></i>
                </button>
            ` : ''}
        `;
        grid.appendChild(item);
    });
}

function abrirLightbox(url) {
    document.getElementById('lightbox-img').src = url;
    document.getElementById('lightbox').classList.add('active');
}
function cerrarLightbox() {
    document.getElementById('lightbox').classList.remove('active');
    document.getElementById('lightbox-img').src = '';
}
/* ============================================================
   COMPRIMIR IMAGEN ANTES DE SUBIR
   ============================================================ */
async function comprimirImagen(file, maxWidth = 1600, calidad = 0.8) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const escala = Math.min(1, maxWidth / img.width);
                canvas.width = img.width * escala;
                canvas.height = img.height * escala;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(
                    (blob) => resolve(blob),
                    'image/jpeg',
                    calidad
                );
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}
async function subirFotoSeleccionada(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        await mostrarAlerta('Solo se permiten imágenes.', 'Tipo inválido', 'warn');
        event.target.value = '';
        return;
    }

    if (esVistaCompleta()) {
        event.target.value = '';
        return;
    }

    const { tabla, medidaId } = fotosContexto;
    if (!tabla || !medidaId) {
        event.target.value = '';
        return;
    }

    const user = obtenerSesion();

        // Comprimir la imagen antes de subir
    const archivoComprimido = await comprimirImagen(file);

    const path = `${tabla}/${medidaId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

    const { error: errSubida } = await db.storage
        .from('medidas-fotos')
        .upload(path, archivoComprimido, { cacheControl: '31536000', upsert: false });

    if (errSubida) {
        console.error(errSubida);
        await mostrarAlerta('No se pudo subir la foto. Revisa la consola.', 'Error', 'error');
        event.target.value = '';
        return;
    }

    const { error: errInsert } = await db.from('imagenes_medidas').insert({
        medida_id: medidaId,
        tabla,
        nombre: file.name,
        storage_path: path,
        area: user.area
    });

    if (errInsert) {
        console.error(errInsert);
        await db.storage.from('medidas-fotos').remove([path]);
        await mostrarAlerta('No se pudo guardar la referencia de la foto.', 'Error', 'error');
        event.target.value = '';
        return;
    }

    event.target.value = '';
    await cargarImagenes();
    renderFotosModal();

    if (tabla === 'antes')   renderTablaAntes();
    if (tabla === 'durante') renderTablaDurante();
    if (tabla === 'despues') renderTablaDespues();
}

async function eliminarFoto(fotoId, storagePath) {
    if (esVistaCompleta()) return;

    const ok = await mostrarConfirm('¿Eliminar esta foto?', 'Eliminar foto', 'warn');
    if (!ok) return;

    const { error: errDelete } = await db.storage
        .from('medidas-fotos')
        .remove([storagePath]);

    if (errDelete) {
        console.error(errDelete);
        await mostrarAlerta('No se pudo eliminar el archivo.', 'Error', 'error');
        return;
    }

    await db.from('imagenes_medidas').delete().eq('id', fotoId);

    await cargarImagenes();
    renderFotosModal();

    const { tabla } = fotosContexto;
    if (tabla === 'antes')   renderTablaAntes();
    if (tabla === 'durante') renderTablaDurante();
    if (tabla === 'despues') renderTablaDespues();
}

function suscribirRealtimeImagenes() {
    db.channel('imagenes_cambios')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'imagenes_medidas' },
            async () => {
                await cargarImagenes();
                renderTablaAntes();
                renderTablaDurante();
                renderTablaDespues();
                if (document.getElementById('modal-fotos').classList.contains('active')) {
                    renderFotosModal();
                }
            })
        .subscribe();
}

/* ============================================================
   CUSTOM SELECT DE ÁREAS (LOGIN)
   ============================================================ */
const customSelect        = document.getElementById('custom-area-select');
const customSelectTrigger = document.getElementById('custom-select-trigger');
const customSelectValue   = document.getElementById('custom-select-value');
const customSelectMenu    = document.getElementById('custom-select-menu');
const loginAreaHidden     = document.getElementById('login-area');

let areasCargadas = [];

async function cargarAreasEnLogin() {
    const { data, error } = await db
        .from('usuarios')
        .select('area')
        .eq('activo', true)
        .order('area', { ascending: true });

    if (error) {
        console.error('Error al cargar áreas:', error);
        customSelectMenu.innerHTML = '<div class="custom-select-option">Error al cargar áreas</div>';
        return;
    }

    areasCargadas = (data || []).map(u => u.area);

    customSelectMenu.innerHTML = '';
    areasCargadas.forEach(area => {
        const opt = document.createElement('div');
        opt.className = 'custom-select-option';
        opt.dataset.value = area;
        opt.textContent = area;
        customSelectMenu.appendChild(opt);
    });
}

customSelectMenu.addEventListener('click', (e) => {
    const opt = e.target.closest('.custom-select-option');
    if (!opt || !opt.dataset.value) return;

    loginAreaHidden.value = opt.dataset.value;
    customSelectValue.textContent = opt.dataset.value;
    customSelect.classList.add('has-value');
    customSelect.classList.remove('open');

    customSelectMenu.querySelectorAll('.custom-select-option')
        .forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
});

customSelectTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    customSelect.classList.toggle('open');
});

document.addEventListener('click', (e) => {
    if (!customSelect.contains(e.target)) {
        customSelect.classList.remove('open');
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') customSelect.classList.remove('open');
});

function resetCustomSelect() {
    loginAreaHidden.value = '';
    customSelectValue.textContent = 'Selecciona tu área…';
    customSelect.classList.remove('has-value', 'open');
    customSelectMenu.querySelectorAll('.custom-select-option')
        .forEach(o => o.classList.remove('selected'));
}

/* ============================================================
   INICIAR / CERRAR SESIÓN
   ============================================================ */
async function iniciarSesion() {
    const area = loginAreaHidden.value;
    const pass = document.getElementById('login-password').value;
    const err  = document.getElementById('login-error');
    err.textContent = '';

    if (!area || !pass) {
        err.textContent = 'Selecciona tu área e ingresa la contraseña.';
        return;
    }

    const { data, error } = await db
        .from('usuarios')
        .select('area, rol')
        .eq('area', area)
        .eq('password', pass)
        .eq('activo', true)
        .maybeSingle();

    if (error || !data) {
        err.textContent = 'Credenciales incorrectas. Verifica e inténtalo de nuevo.';
        return;
    }

    guardarSesion({ area: data.area, rol: data.rol });
    entrarApp();
}

async function cerrarSesion() {
    const ok = await mostrarConfirm('¿Cerrar sesión?', 'Cerrar sesión', 'warn');
    if (!ok) return;

    limpiarSesion();
    document.getElementById('login-password').value = '';
    document.getElementById('login-error').textContent = '';
    resetCustomSelect();
    mostrarPantalla('screen-login');
    document.getElementById('main-header').style.display = 'none';

    await cargarAreasEnLogin();
    resetCustomSelect();
}

function mostrarPantalla(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    window.scrollTo(0, 0);
}

function aplicarVisibilidadGerente() {
    const vistaCompleta = esVistaCompleta();
    const gerenteReal   = esGerente();

    // Filtro de área, historial → los 3 roles con vista completa
    document.querySelectorAll('.btn-solo-gerente').forEach(el => {
        if (el.tagName === 'SELECT') {
            el.style.display = vistaCompleta ? 'inline-block' : 'none';
        } else {
            el.style.display = vistaCompleta ? 'inline-flex' : 'none';
        }
    });

    // Iniciar planes de acción → solo gerente general
    document.querySelectorAll('.btn-solo-gerente-real').forEach(el => {
        el.style.display = gerenteReal ? 'inline-flex' : 'none';
    });

    // Agregar medida → solo área
    document.querySelectorAll('.btn-solo-area').forEach(el => {
        el.style.display = vistaCompleta ? 'none' : 'inline-flex';
    });
}

async function entrarApp() {
    const u = obtenerSesion();
    if (!u) return;

    document.getElementById('main-header').style.display = 'flex';
    document.getElementById('user-name').textContent = u.area;

    aplicarVisibilidadGerente();

    mostrarPantalla('screen-home');

    if (areasCargadas.length === 0) {
        await cargarAreasEnLogin();
    }

    if (imagenesCache.length === 0) {
        await cargarImagenes();
    }

    if (!window.__realtimeActivo) {
        suscribirRealtime();
        suscribirRealtimeDurante();
        suscribirRealtimeDespues();
        suscribirRealtimeImagenes();
        window.__realtimeActivo = true;
    }

    cargarMedidasAntes();
    cargarMedidasDurante();
    cargarMedidasDespues();
     activarNotificacionesPush();
}

function verificarSesion() {
    const u = obtenerSesion();
    if (u) {
        entrarApp();
    } else {
        document.getElementById('main-header').style.display = 'none';
        mostrarPantalla('screen-login');
        cargarAreasEnLogin();
    }
}

/* ============================================================
   FASE 2 — PERMISOS POR ÁREA
   ============================================================ */
const ALIASES = {
    "Op. Agrícolas": "Operaciones Agrícolas",
    "Obras": "Infraestructura",
    "API": "APT",
    "Administradores de campo": "Administración 3",
    "Energía y Control": "Taller eléctrico",
    "SST": "Seguridad industrial"
};

function normalizarArea(area) {
    const limpia = (area || '').trim();
    return ALIASES[limpia] || limpia;
}

function esGerente() {
    const u = obtenerSesion();
    return !!(u && u.rol === 'gerente_general');
}
function esVistaCompleta() {
    const u = obtenerSesion();
    if (!u) return false;
    return u.rol === 'gerente_general' || u.rol === 'gdo' || u.rol === 'gerencial_legal';
}

function esSoloLectura() {
    const u = obtenerSesion();
    if (!u) return false;
    return u.rol === 'gdo' || u.rol === 'gerencial_legal';
}

function puedeEditar(medida) {
    const user = obtenerSesion();
    if (!user) return false;
    if (esSoloLectura()) return false;
    if (user.rol === 'gerente_general') return false;
    if (!medida || !medida.area) return false;
    const areas = medida.area.split('/').map(normalizarArea);
    const userArea = normalizarArea(user.area);
    return areas.includes(userArea);
}

function avisoNoEditable() {
    mostrarAlerta(
        'Solo el área responsable puede modificar esta medida.',
        'Acción no permitida',
        'warn'
    );
}

function filtrarVisibles(medidas, filtroArea) {
    const user = obtenerSesion();
    if (!user) return [];
    let result = medidas;
    if (!esVistaCompleta()) {
        result = result.filter(m => {
            if (!m.area) return false;
            const areas = m.area.split('/').map(normalizarArea);
            return areas.includes(normalizarArea(user.area));
        });
    }
    if (filtroArea && filtroArea !== 'all') {
        const filtroNorm = normalizarArea(filtroArea);
        result = result.filter(m => {
            if (!m.area) return false;
            return m.area.split('/').map(normalizarArea).includes(filtroNorm);
        });
    }
    return result;
}
/* ============================================================
   NAVEGACIÓN
   ============================================================ */
function abrirPlan() {
    document.getElementById('screen-home').classList.remove('active');
    document.getElementById('screen-plan').classList.add('active');
    document.querySelectorAll('.section-view').forEach(v => v.classList.remove('active'));
    document.getElementById('section-menu').classList.add('active');
    const bc = document.getElementById('breadcrumb-menu');
    if (bc) bc.style.display = 'block';
    window.scrollTo(0, 0);
}

function volverInicio() {
    document.getElementById('screen-plan').classList.remove('active');
    document.getElementById('screen-home').classList.add('active');
    window.scrollTo(0, 0);
}

function irASeccion(nombre) {
    document.querySelectorAll('.section-view').forEach(v => v.classList.remove('active'));
    document.getElementById('section-' + nombre).classList.add('active');
    const bc = document.getElementById('breadcrumb-menu');
    if (bc) bc.style.display = 'none';
    window.scrollTo(0, 0);
}

function volverAlMenuPlan() {
    document.querySelectorAll('.section-view').forEach(v => v.classList.remove('active'));
    document.getElementById('section-menu').classList.add('active');
    const bc = document.getElementById('breadcrumb-menu');
    if (bc) bc.style.display = 'block';
    window.scrollTo(0, 0);
}

/* ============================================================
   ESTADOS
   ============================================================ */
const ESTADOS = ['no-iniciado', 'en-ejecucion', 'finalizado'];
const ETIQUETAS = {
    'no-iniciado': 'No iniciado',
    'en-ejecucion': 'En ejecución',
    'finalizado': 'Finalizado'
};
function siguienteEstado(actual) {
    const idx = ESTADOS.indexOf(actual);
    return ESTADOS[(idx + 1) % ESTADOS.length];
}

const ESTADOS_DURANTE = ['bloqueado', 'iniciado', 'en-ejecucion', 'finalizado'];
const ETIQUETAS_DURANTE = {
    'bloqueado': 'Bloqueado',
    'iniciado': 'Autorizado',
    'en-ejecucion': 'En ejecución',
    'finalizado': 'Finalizado'
};
function siguienteEstadoDurante(actual) {
    const idx = ESTADOS_DURANTE.indexOf(actual);
    if (idx < 0 || idx >= ESTADOS_DURANTE.length - 1) return actual;
    return ESTADOS_DURANTE[idx + 1];
}
function badgeDuranteHTML(act) {
    if (act.estado === 'bloqueado') {
        return `<span class="badge-estado badge-bloqueado" data-id="${act.id}">🔒 Bloqueado</span>`;
    }
    return `<span class="badge-estado badge-${act.estado}" data-id="${act.id}">${ETIQUETAS_DURANTE[act.estado]}</span>`;
}

/* ============================================================
   CACHE Y FILTROS
   ============================================================ */
let medidasAntesCache = [];
let medidasDuranteCache = [];
let medidasDespuesCache = [];

let filtroEstadoAntes = 'all';
let filtroEstadoDurante = 'all';
let filtroEstadoDespues = 'all';

let filtroAreaAntes = 'all';
let filtroAreaDurante = 'all';
let filtroAreaDespues = 'all';

/* ============================================================
   POBLAR FILTRO DE ÁREA (solo gerente)
   ============================================================ */
function poblarFiltroArea(selectId, medidas) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const areas = new Set();
    medidas.forEach(m => {
        if (!m.area) return;
        m.area.split('/').forEach(a => {
            const limpia = a.trim();
            if (limpia) areas.add(limpia);
        });
    });
    const ordenadas = Array.from(areas).sort();
    const valorActual = select.value;
    select.innerHTML = '<option value="all">Todas las áreas</option>';
    ordenadas.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a;
        opt.textContent = a;
        select.appendChild(opt);
    });
    if (Array.from(select.options).some(o => o.value === valorActual)) {
        select.value = valorActual;
    } else {
        select.value = 'all';
    }
}

/* ============================================================
   MEDIDAS ANTES
   ============================================================ */
async function cargarMedidasAntes() {
    const tbody = document.getElementById('tabla-antes-body');
    const { data, error } = await db
        .from('medidas_antes')
        .select('*')
        .order('id', { ascending: true });

    if (error) {
        console.error('Error al cargar antes:', error);
        tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">Error al cargar datos</td></tr>';
        return;
    }
    medidasAntesCache = data || [];
    poblarFiltroArea('filtro-area-antes', medidasAntesCache);
    renderTablaAntes();
}

function renderTablaAntes() {
    const tbody = document.getElementById('tabla-antes-body');
    const visibles = filtrarVisibles(medidasAntesCache, filtroAreaAntes);
    const filtradas = filtroEstadoAntes === 'all'
        ? visibles
        : visibles.filter(m => m.estado === filtroEstadoAntes);

    actualizarTotalAntes(filtradas);

    if (filtradas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">No hay actividades para mostrar.</td></tr>';
        actualizarProgresoAntes();
        return;
    }

    tbody.innerHTML = '';
    filtradas.forEach(act => {
        const editable = puedeEditar(act) && !esVistaCompleta();
        const tr = document.createElement('tr');
                tr.innerHTML = `
            <td data-label="Actividad">${act.actividad}</td>
            <td data-label="Período">${act.periodo || ''}</td>
            <td data-label="Área">${act.area || ''}</td>
            <td data-label="Costo">
                <input type="text" class="input-costo"
                       data-id="${act.id}"
                       placeholder="S/ 0.00"
                       value="${formatearCosto(act.costo)}"
                       ${editable ? '' : 'readonly'}>
            </td>
            <td data-label="Estado">
                <span class="badge-estado badge-${act.estado}" data-id="${act.id}">
                    ${ETIQUETAS[act.estado]}
                </span>
            </td>
            <td class="fotos-cell" data-label="Fotos">
                ${botonFotosHTML('antes', act.id)}
            </td>
            <td class="acciones-cell" data-label="Acciones">
                ${editable ? `
                    <button class="btn-editar-fila" title="Editar medida" onclick="abrirModalEditar('antes', '${act.id}')">
                        <i class="fas fa-pen"></i>
                    </button>
                ` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.badge-estado').forEach(badge => {
        badge.addEventListener('click', async () => {
             if (esVistaCompleta()) return;

            const id = badge.dataset.id;
            const item = medidasAntesCache.find(m => m.id === id);
            if (!puedeEditar(item)) { avisoNoEditable(); return; }

            const nuevo = siguienteEstado(item.estado);
            item.estado = nuevo;
            badge.classList.remove('badge-no-iniciado','badge-en-ejecucion','badge-finalizado');
            badge.classList.add('badge-' + nuevo);
            badge.textContent = ETIQUETAS[nuevo];
            actualizarProgresoAntes();

            const { error } = await db
                .from('medidas_antes')
                .update({ estado: nuevo, updated_at: new Date().toISOString() })
                .eq('id', id);
            if (error) { console.error(error); cargarMedidasAntes(); }
        });
    });

    tbody.querySelectorAll('.input-costo').forEach(input => {
        input.addEventListener('click', (e) => {
            if (esVistaCompleta()) return;
            const item = medidasAntesCache.find(m => m.id === e.target.dataset.id);
            if (!puedeEditar(item)) avisoNoEditable();
        });
        input.addEventListener('change', async (e) => {
            if (esVistaCompleta()) return;
            const id = e.target.dataset.id;
            const item = medidasAntesCache.find(m => m.id === id);
            if (!puedeEditar(item)) return;

            const valorFormateado = formatearCosto(e.target.value);
            e.target.value = valorFormateado;
            if (item) item.costo = valorFormateado;

            const { error } = await db
                .from('medidas_antes')
                .update({ costo: valorFormateado, updated_at: new Date().toISOString() })
                .eq('id', id);
            if (error) console.error('Error al guardar costo:', error);
        });
    });

    actualizarProgresoAntes();
}

function actualizarProgresoAntes() {
    const visibles = filtrarVisibles(medidasAntesCache, filtroAreaAntes);
    const total = visibles.length;
    const fin = visibles.filter(m => m.estado === 'finalizado').length;
    const pct = total === 0 ? 0 : Math.round((fin / total) * 100);
    const count = document.getElementById('antes-progress-count');
    const fill  = document.getElementById('antes-progress-fill');
    if (count) count.textContent = `${fin} de ${total} finalizadas`;
    if (fill)  fill.style.width = pct + '%';
}

/* ============================================================
   MEDIDAS DURANTE
   ============================================================ */
async function cargarMedidasDurante() {
    const tbody = document.getElementById('tabla-durante-body');
    const { data, error } = await db
        .from('medidas_durante')
        .select('*')
        .order('id', { ascending: true });

    if (error) {
        console.error('Error al cargar durante:', error);
        tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">Error al cargar datos</td></tr>';
        return;
    }
    medidasDuranteCache = data || [];
    poblarFiltroArea('filtro-area-durante', medidasDuranteCache);
    renderTablaDurante();
    actualizarBotonPlanesAccion();
}

function renderTablaDurante() {
    const tbody = document.getElementById('tabla-durante-body');
    const visibles = filtrarVisibles(medidasDuranteCache, filtroAreaDurante);
    const filtradas = filtroEstadoDurante === 'all'
        ? visibles
        : visibles.filter(m => m.estado === filtroEstadoDurante);

    if (filtradas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">No hay actividades para mostrar.</td></tr>';
        actualizarProgresoDurante();
        return;
    }

    tbody.innerHTML = '';
    filtradas.forEach(act => {
        const editable = puedeEditar(act) && !esVistaCompleta();
        const tr = document.createElement('tr');
                tr.innerHTML = `
            <td data-label="Actividad">${act.actividad}</td>
            <td data-label="Período">${act.periodo || ''}</td>
            <td data-label="Área">${act.area || ''}</td>
            <td data-label="Estado">${badgeDuranteHTML(act)}</td>
            <td class="fotos-cell" data-label="Fotos">
                ${botonFotosHTML('durante', act.id)}
            </td>
            <td class="acciones-cell" data-label="Acciones">
                ${editable ? `
                    <button class="btn-editar-fila" title="Editar medida" onclick="abrirModalEditar('durante', '${act.id}')">
                        <i class="fas fa-pen"></i>
                    </button>
                ` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.badge-estado').forEach(badge => {
        badge.addEventListener('click', () => manejarClickDurante(badge));
    });

    actualizarProgresoDurante();
}

async function manejarClickDurante(badge) {
    if (esSoloLectura()) return;

    const id = badge.dataset.id;
    const item = medidasDuranteCache.find(m => m.id === id);
    if (!item) return;
    const gerente = esGerente();

    if (gerente) {
        if (item.estado === 'bloqueado') return;

        const ok = await mostrarConfirm(
            `¿Volver a bloquear esta medida? Pasará a estado "Bloqueado".`,
            'Bloquear medida',
            'warn'
        );
        if (!ok) return;

        item.estado = 'bloqueado';
        badge.classList.remove('badge-iniciado','badge-en-ejecucion','badge-finalizado');
        badge.classList.add('badge-bloqueado');
        badge.textContent = '🔒 Bloqueado';
        actualizarProgresoDurante();

        const { error } = await db
            .from('medidas_durante')
            .update({ estado: 'bloqueado', updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) { console.error(error); cargarMedidasDurante(); return; }
        actualizarBotonPlanesAccion();
        return;
    }

    if (item.estado === 'bloqueado') {
        await mostrarAlerta(
            'Esta medida aún no ha sido activada por Gerencia General.',
            'Medida bloqueada',
            'warn'
        );
        return;
    }

    if (!puedeEditar(item)) { avisoNoEditable(); return; }
    if (item.estado === 'finalizado') return;

    let msg = '', titulo = '';
    if (item.estado === 'iniciado') {
        msg = '¿Confirmas pasar a En ejecución?';
        titulo = 'Cambiar estado';
    } else if (item.estado === 'en-ejecucion') {
        msg = '¿Confirmas marcar como Finalizado?';
        titulo = 'Finalizar medida';
    }
    if (msg) {
        const ok = await mostrarConfirm(msg, titulo, 'info');
        if (!ok) return;
    }

    const nuevo = siguienteEstadoDurante(item.estado);

    item.estado = nuevo;
    badge.classList.remove('badge-bloqueado','badge-iniciado','badge-en-ejecucion','badge-finalizado');
    badge.classList.add('badge-' + nuevo);
    badge.textContent = ETIQUETAS_DURANTE[nuevo];
    actualizarProgresoDurante();

    const { error } = await db
        .from('medidas_durante')
        .update({ estado: nuevo, updated_at: new Date().toISOString() })
        .eq('id', id);
    if (error) { console.error(error); cargarMedidasDurante(); }
}

function actualizarProgresoDurante() {
    const visibles = filtrarVisibles(medidasDuranteCache, filtroAreaDurante);
    const total = visibles.length;
    const fin = visibles.filter(m => m.estado === 'finalizado').length;
    const pct = total === 0 ? 0 : Math.round((fin / total) * 100);
    const count = document.getElementById('durante-progress-count');
    const fill  = document.getElementById('durante-progress-fill');
    if (count) count.textContent = `${fin} de ${total} finalizadas`;
    if (fill)  fill.style.width = pct + '%';
}

function actualizarBotonPlanesAccion() {
    const btn = document.getElementById('btn-planes-accion');
    if (!btn) return;
    const hayBloqueados = medidasDuranteCache.some(m => m.estado === 'bloqueado');
    if (hayBloqueados) {
        btn.innerHTML = '<i class="fas fa-play"></i> Iniciar planes de acción';
        btn.classList.remove('btn-planes-bloquear');
    } else {
        btn.innerHTML = '<i class="fas fa-lock"></i> Bloquear planes de acción';
        btn.classList.add('btn-planes-bloquear');
    }
}

async function togglePlanesAccion() {
    if (!esGerente()) return;
    const todos = medidasDuranteCache;
    if (todos.length === 0) {
        await mostrarAlerta('No hay medidas durante cargadas.', 'Sin medidas', 'warn');
        return;
    }

    const hayBloqueados = todos.some(m => m.estado === 'bloqueado');

    if (hayBloqueados) {
        const bloqueados = todos.filter(m => m.estado === 'bloqueado');
        const ok = await mostrarConfirm(
            `Las ${bloqueados.length} medidas bloqueadas pasarán a estado "Autorizado". ¿Confirmas?`,
            'Iniciar planes de acción',
            'info'
        );
        if (!ok) return;

        for (const m of bloqueados) {
            await db.from('medidas_durante')
                .update({ estado: 'iniciado', updated_at: new Date().toISOString() })
                .eq('id', m.id);
        }

        // ⬇️ NUEVO: enviar notificación push a todos los encargados
        try {
            const resp = await fetch(`${SUPABASE_URL_FUNCTIONS}/send-push-notification`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: '🚨 ALERTA DE HUAYCO',
                    body: 'Gerencia General ha autorizado el inicio de los planes de acción.'
                })
            });
            if (resp.ok) {
                console.log('[FCM] Alertas push enviadas.');
            } else {
                console.error('[FCM] Error al enviar alertas:', await resp.text());
            }
        } catch (err) {
            console.error('[FCM] Error de conexión:', err);
        }
        // ⬆️ FIN NUEVO

    } else {
        const ok = await mostrarConfirm(
            `Las ${todos.length} medidas volverán a estado "Bloqueado". ¿Confirmas?`,
            'Bloquear planes de acción',
            'warn'
        );
        if (!ok) return;

        for (const m of todos) {
            await db.from('medidas_durante')
                .update({ estado: 'bloqueado', updated_at: new Date().toISOString() })
                .eq('id', m.id);
        }
    }

    cargarMedidasDurante();
}

/* ============================================================
   MEDIDAS DESPUÉS
   ============================================================ */
async function cargarMedidasDespues() {
    const tbody = document.getElementById('tabla-despues-body');
    const { data, error } = await db
        .from('medidas_despues')
        .select('*')
        .order('id', { ascending: true });

    if (error) {
        console.error('Error al cargar después:', error);
        tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">Error al cargar datos</td></tr>';
        return;
    }
    medidasDespuesCache = data || [];
    poblarFiltroArea('filtro-area-despues', medidasDespuesCache);
    renderTablaDespues();
}

function renderTablaDespues() {
    const tbody = document.getElementById('tabla-despues-body');
    const visibles = filtrarVisibles(medidasDespuesCache, filtroAreaDespues);
    const filtradas = filtroEstadoDespues === 'all'
        ? visibles
        : visibles.filter(m => m.estado === filtroEstadoDespues);

    if (filtradas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">No hay actividades para mostrar.</td></tr>';
        actualizarProgresoDespues();
        return;
    }

    tbody.innerHTML = '';
    filtradas.forEach(act => {
        const editable = puedeEditar(act) && !esVistaCompleta();
        const tr = document.createElement('tr');
                        tr.innerHTML = `
            <td data-label="Actividad">${act.actividad}</td>
            <td data-label="Período">${act.periodo || ''}</td>
            <td data-label="Área">${act.area || ''}</td>
            <td data-label="Estado">
                <span class="badge-estado badge-${act.estado}" data-id="${act.id}">
                    ${ETIQUETAS[act.estado]}
                </span>
            </td>
            <td class="fotos-cell" data-label="Fotos">
                ${botonFotosHTML('despues', act.id)}
            </td>
            <td class="acciones-cell" data-label="Acciones">
                ${editable ? `
                    <button class="btn-editar-fila" title="Editar medida" onclick="abrirModalEditar('despues', '${act.id}')">
                        <i class="fas fa-pen"></i>
                    </button>
                ` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.badge-estado').forEach(badge => {
        badge.addEventListener('click', async () => {
            if (esVistaCompleta()) return;

            const id = badge.dataset.id;
            const item = medidasDespuesCache.find(m => m.id === id);
            if (!puedeEditar(item)) { avisoNoEditable(); return; }

            const nuevo = siguienteEstado(item.estado);
            item.estado = nuevo;
            badge.classList.remove('badge-no-iniciado','badge-en-ejecucion','badge-finalizado');
            badge.classList.add('badge-' + nuevo);
            badge.textContent = ETIQUETAS[nuevo];
            actualizarProgresoDespues();

            const { error } = await db
                .from('medidas_despues')
                .update({ estado: nuevo, updated_at: new Date().toISOString() })
                .eq('id', id);
            if (error) { console.error(error); cargarMedidasDespues(); }
        });
    });

    actualizarProgresoDespues();
}

function actualizarProgresoDespues() {
    const visibles = filtrarVisibles(medidasDespuesCache, filtroAreaDespues);
    const total = visibles.length;
    const fin = visibles.filter(m => m.estado === 'finalizado').length;
    const pct = total === 0 ? 0 : Math.round((fin / total) * 100);
    const count = document.getElementById('despues-progress-count');
    const fill  = document.getElementById('despues-progress-fill');
    if (count) count.textContent = `${fin} de ${total} finalizadas`;
    if (fill)  fill.style.width = pct + '%';
}

/* ============================================================
   FILTROS
   ============================================================ */
function inicializarFiltros() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        if (btn.dataset.tabla) return;
        btn.addEventListener('click', () => {
            btn.closest('.filters-left').querySelectorAll('.filter-btn')
                .forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filtroEstadoAntes = btn.dataset.filter;
            renderTablaAntes();
        });
    });
}
function inicializarFiltrosDurante() {
    document.querySelectorAll('.filter-btn[data-tabla="durante"]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn[data-tabla="durante"]')
                .forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filtroEstadoDurante = btn.dataset.filter;
            renderTablaDurante();
        });
    });
}
function inicializarFiltrosDespues() {
    document.querySelectorAll('.filter-btn[data-tabla="despues"]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn[data-tabla="despues"]')
                .forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filtroEstadoDespues = btn.dataset.filter;
            renderTablaDespues();
        });
    });
}

function inicializarFiltrosArea() {
    const fa = document.getElementById('filtro-area-antes');
    if (fa) fa.addEventListener('change', () => { filtroAreaAntes = fa.value; renderTablaAntes(); });

    const fd = document.getElementById('filtro-area-durante');
    if (fd) fd.addEventListener('change', () => { filtroAreaDurante = fd.value; renderTablaDurante(); });

    const fp = document.getElementById('filtro-area-despues');
    if (fp) fp.addEventListener('change', () => { filtroAreaDespues = fp.value; renderTablaDespues(); });
}

/* ============================================================
   REALTIME
   ============================================================ */
function suscribirRealtime() {
    db.channel('medidas_antes_cambios')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'medidas_antes' },
            (payload) => {
                const nuevo = payload.new;
                if (!nuevo || !nuevo.id) return;
                const idx = medidasAntesCache.findIndex(m => m.id === nuevo.id);
                if (idx >= 0) medidasAntesCache[idx] = nuevo;
                else medidasAntesCache.push(nuevo);
                poblarFiltroArea('filtro-area-antes', medidasAntesCache);
                renderTablaAntes();
            })
        .subscribe();
}
function suscribirRealtimeDurante() {
    db.channel('medidas_durante_cambios')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'medidas_durante' },
            (payload) => {
                const nuevo = payload.new;
                if (!nuevo || !nuevo.id) return;
                const idx = medidasDuranteCache.findIndex(m => m.id === nuevo.id);
                if (idx >= 0) medidasDuranteCache[idx] = nuevo;
                else medidasDuranteCache.push(nuevo);
                poblarFiltroArea('filtro-area-durante', medidasDuranteCache);
                renderTablaDurante();
                actualizarBotonPlanesAccion();
            })
        .subscribe();
}
function suscribirRealtimeDespues() {
    db.channel('medidas_despues_cambios')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'medidas_despues' },
            (payload) => {
                const nuevo = payload.new;
                if (!nuevo || !nuevo.id) return;
                const idx = medidasDespuesCache.findIndex(m => m.id === nuevo.id);
                if (idx >= 0) medidasDespuesCache[idx] = nuevo;
                else medidasDespuesCache.push(nuevo);
                poblarFiltroArea('filtro-area-despues', medidasDespuesCache);
                renderTablaDespues();
            })
        .subscribe();
}

/* ============================================================
   FASE 3 — AGREGAR / EDITAR MEDIDA
   ============================================================ */
let tablaModalActual = null;
let modoModal = 'crear';
let medidaEditando = null;

function actualizarBotonAgregarArea() {
    const btn = document.getElementById('btn-add-area');
    if (!btn) return;
    const filas = document.querySelectorAll('#areas-lista .area-extra-row').length;
    btn.style.display = filas >= 2 ? 'none' : 'inline-flex';
}

function abrirModalAgregar(tabla) {
    if (esSoloLectura()) return;
    tablaModalActual = tabla;
    modoModal = 'crear';
    medidaEditando = null;

    document.getElementById('agregar-actividad').value = '';
    document.getElementById('agregar-periodo').value = '';
    document.getElementById('agregar-costo').value = '';
    document.getElementById('areas-lista').innerHTML = '';

    const user = obtenerSesion();
    agregarAreaFila(user.area, true, true);

    document.querySelectorAll('#modal-agregar .solo-antes').forEach(w => {
        if (w.querySelector('#agregar-periodo')) w.style.display = 'block';
        if (w.querySelector('#agregar-costo')) {
            w.style.display = (tabla === 'antes') ? 'block' : 'none';
        }
    });

    document.getElementById('modal-agregar-title').textContent = `Agregar medida (${tabla})`;
    actualizarBotonAgregarArea();
    document.getElementById('modal-agregar').classList.add('active');
}

function abrirModalEditar(tabla, id) {
    if (esSoloLectura()) return;
    const cache = tabla === 'antes' ? medidasAntesCache
                : tabla === 'durante' ? medidasDuranteCache
                : medidasDespuesCache;
    const item = cache.find(m => m.id === id);
    if (!item) return;

    tablaModalActual = tabla;
    modoModal = 'editar';
    medidaEditando = item;

    document.getElementById('agregar-actividad').value = item.actividad || '';
    document.getElementById('agregar-periodo').value = item.periodo || '';
    document.getElementById('agregar-costo').value = formatearCosto(item.costo);
    document.getElementById('areas-lista').innerHTML = '';

    const areas = (item.area || '').split('/').map(a => a.trim()).filter(Boolean);
    areas.slice(0, 2).forEach((a, i) => agregarAreaFila(a, false, i === 0));

    document.querySelectorAll('#modal-agregar .solo-antes').forEach(w => {
        if (w.querySelector('#agregar-periodo')) w.style.display = 'block';
        if (w.querySelector('#agregar-costo')) {
            w.style.display = (tabla === 'antes') ? 'block' : 'none';
        }
    });

    document.getElementById('modal-agregar-title').textContent = `Editar medida (${tabla})`;
    actualizarBotonAgregarArea();
    document.getElementById('modal-agregar').classList.add('active');
}

function cerrarModalAgregar() {
    document.getElementById('modal-agregar').classList.remove('active');
    modoModal = 'crear';
    medidaEditando = null;
}

function agregarAreaFila(areaSeleccionada, esFija, sinBotonEliminar) {
    const cont = document.getElementById('areas-lista');
    const opciones = areasCargadas.map(a => {
        const sel = (a === areaSeleccionada) ? 'selected' : '';
        return `<option value="${a}" ${sel}>${a}</option>`;
    }).join('');

    const row = document.createElement('div');
    row.className = 'area-extra-row';

    const bloqueado = esFija ? 'disabled' : '';
    const botonEliminar = sinBotonEliminar ? '' : `
        <button type="button" class="btn-remove-area" onclick="this.parentElement.remove(); actualizarBotonAgregarArea();">
            <i class="fas fa-times"></i>
        </button>
    `;

    row.innerHTML = `
        <select class="area-extra-select" ${bloqueado}>${opciones}</select>
        ${botonEliminar}
    `;
    cont.appendChild(row);
    actualizarBotonAgregarArea();
}

function agregarAreaExtra() {
    const filas = document.querySelectorAll('#areas-lista .area-extra-row').length;
    if (filas >= 2) return;
    agregarAreaFila('', false, false);
}

function recopilarAreas() {
    const areas = [];
    document.querySelectorAll('#areas-lista .area-extra-select').forEach(sel => {
        if (sel.value && sel.value.trim()) areas.push(normalizarArea(sel.value.trim()));
    });
    return areas.join(' / ');
}

function generarId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'm-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
}

async function guardarNuevaMedida() {
    const actividad = document.getElementById('agregar-actividad').value.trim();
    const area      = recopilarAreas();

    if (!actividad) {
        await mostrarAlerta('La actividad es obligatoria.', 'Campos incompletos', 'warn');
        return;
    }
    if (!area) {
        await mostrarAlerta('Debe haber al menos un área responsable.', 'Campos incompletos', 'warn');
        return;
    }

    let periodo = document.getElementById('agregar-periodo').value.trim() || null;
    let costo = null;
    if (tablaModalActual === 'antes') {
        costo = formatearCosto(document.getElementById('agregar-costo').value) || null;
    } else if (!periodo) {
        periodo = (tablaModalActual === 'durante') ? 'Durante la alerta' : 'Pos emergencia';
    }

    const nombreTabla = 'medidas_' + tablaModalActual;

    if (modoModal === 'crear') {
        const id = generarId();
        const estadoDefault = (tablaModalActual === 'durante') ? 'bloqueado' : 'no-iniciado';
        const payload = {
            id, actividad, periodo, area, costo,
            estado: estadoDefault,
            updated_at: new Date().toISOString()
        };
        const { error } = await db.from(nombreTabla).insert(payload);
        if (error) {
            console.error('Error al insertar:', error);
            await mostrarAlerta('No se pudo guardar la medida. Revisa la consola.', 'Error', 'error');
            return;
        }
        registrarHistorial('crear', nombreTabla, id, actividad);
    } else {
        const payload = {
            actividad, periodo, area, costo,
            updated_at: new Date().toISOString()
        };
        const { error } = await db.from(nombreTabla)
            .update(payload)
            .eq('id', medidaEditando.id);
        if (error) {
            console.error('Error al actualizar:', error);
            await mostrarAlerta('No se pudo actualizar la medida. Revisa la consola.', 'Error', 'error');
            return;
        }
    }

    cerrarModalAgregar();
    if (tablaModalActual === 'antes')   cargarMedidasAntes();
    if (tablaModalActual === 'durante') cargarMedidasDurante();
    if (tablaModalActual === 'despues') cargarMedidasDespues();
}
/* ============================================================
   NOTIFICACIONES PUSH (FCM)
   ============================================================ */
async function activarNotificacionesPush() {
    const user = obtenerSesion();
    if (!user) return;

    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        console.log('Este navegador no soporta notificaciones push.');
        return;
    }

    try {
        // 1. Registrar el Service Worker
        const registration = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
        console.log('[FCM] Service Worker registrado:', registration.scope);
        await navigator.serviceWorker.ready;

        // 2. Pedir permiso
        let permiso = Notification.permission;
        if (permiso === 'default') {
            permiso = await Notification.requestPermission();
        }
        if (permiso !== 'granted') {
            console.log('[FCM] Permiso de notificaciones denegado.');
            return;
        }

        // 3. Obtener token FCM
        const token = await messaging.getToken({
            vapidKey: VAPID_PUBLIC_KEY,
            serviceWorkerRegistration: registration
        });

        if (!token) {
            console.log('[FCM] No se pudo obtener el token.');
            return;
        }

        console.log('[FCM] Token obtenido:', token.slice(0, 20) + '...');

        // 4. Verificar si ya está guardado
        const { data: existente } = await db
            .from('push_subscriptions')
            .select('id')
            .eq('user_id', user.area)
            .eq('token', token)
            .maybeSingle();

        if (existente) {
            console.log('[FCM] Token ya registrado para este usuario.');
            return;
        }

        // 5. Guardar token en Supabase
        const { error } = await db.from('push_subscriptions').insert({
            user_id: user.area,
            token: token
        });

        if (error) {
            console.error('[FCM] Error al guardar token:', error);
        } else {
            console.log('[FCM] Token guardado en Supabase.');
        }
    } catch (err) {
        console.error('[FCM] Error al activar notificaciones:', err);
    }
}

// Notificaciones en primer plano (cuando la app está abierta)
if (typeof messaging !== 'undefined') {
    messaging.onMessage((payload) => {
        console.log('[FCM] Notificación en primer plano:', payload);
        const title = payload.notification?.title || 'Aviso';
        const body = payload.notification?.body || '';
        if (typeof mostrarAlerta === 'function') {
            mostrarAlerta(body, title, 'info');
        }
    });
}
/* ============================================================
   INICIO
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    inicializarFiltros();
    inicializarFiltrosDurante();
    inicializarFiltrosDespues();
    inicializarFiltrosArea();
    verificarSesion();
});
