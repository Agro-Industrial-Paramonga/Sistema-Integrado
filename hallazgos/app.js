// ==========================================
// VARIABLES GLOBALES
// ==========================================
let miGrafico = null;
let modoActualGrafico = 'por-anio';
let paginaActual = 1;
const registrosPorPagina = 20;
let totalRegistros = 0;
let totalPaginas = 1;
let searchTerm = '';

let usuarioActual = null;
let eventoSeleccionado = '';
let estadoSeleccionado = '';
let mesSeleccionado = '';

let vistaActual = 'hallazgos';
let subVistaActos = 'indicadores';
let mesActosSeleccionado = new Date().getMonth() + 1;
let anioActosSeleccionado = 2026;

// ============ RRLL ============
let usuarioRRLL = null;
let rrllPaginaActual = 1;
let rrllTotalPaginas = 1;
const rrllRegistrosPorPagina = 15;
let rrllSearchTerm = '';
let rrllHallazgoActual = null;
let rrllCasoActual = null;
let rrllCatalogoFaltas = [];
let rrllFaltasHallazgo = [];
let rrllFeriados = [];
let rrllBloqueActual = 1; // NUEVO: bloque activo del slider

const RRLL_FECHA_INICIO = '2026-09-01';
const RRLL_DESC_EVENTO  = 'Acto Subestandar';
const RRLL_DESC_EMPRESA = 'AGRO INDUSTRIAL PARAMONGA SA';
const RRLL_DIAS_DESCARGO = 3;

const EVENTOS_DISPONIBLES = [
    { valor: 'Acto Subestandar',      etiqueta: 'Acto Subestándar'      },
    { valor: 'Condicion Subestandar', etiqueta: 'Condición Subestándar' }
];

const ESTADOS_DISPONIBLES = ['Abierto', 'Cerrado'];
const NOMBRE_ADMIN = 'Seguridad Industrial';
const NOMBRE_RRLL  = 'Relaciones Laborales';

const GERENCIAS_ACCESO_TOTAL = [
    'GERENCIA GENERAL',
    'GERENCIA LEGAL Y RELAC LABORAL'
];
const GERENCIAS_EXCLUIDAS = [
    'Relaciones Laborales',
    'GERENCIA LEGAL Y RELAC LABORAL'
];
const ANIOS_EXCLUIDOS = ['2023'];

const CORRECCIONES_ORTOGRAFICAS = {
    'FABRICA':                        'FÁBRICA',
    'ELABORACION':                    'ELABORACIÓN',
    'ADMINISTRACION':                 'ADMINISTRACIÓN',
    'PRODUCCION':                     'PRODUCCIÓN',
    'LOGISTICA':                      'LOGÍSTICA',
    'ALMACEN':                        'ALMACÉN',
    'DESTILERIA':                     'DESTILERÍA',
    'AGRICOLA':                       'AGRÍCOLA',
    'ELECTRICO':                      'ELÉCTRICO',
    'MECANICO':                       'MECÁNICO',
    'QUIMICO':                        'QUÍMICO',
    'INSTRUMENTACION':                'INSTRUMENTACIÓN',
    'AUTOMATIZACION':                 'AUTOMATIZACIÓN',
    'CERTIFICACION':                  'CERTIFICACIÓN',
    'CAPACITACION':                   'CAPACITACIÓN',
    'EVALUACION':                     'EVALUACIÓN',
    'INSPECCION':                     'INSPECCIÓN',
    'PREVENCION':                     'PREVENCIÓN',
    'CORRECCION':                     'CORRECCIÓN',
    'OPERACION':                      'OPERACIÓN',
    'MANTENIMIENTO MECANICO':         'MANTENIMIENTO MECÁNICO',
    'GERENCIA LEGAL Y RELAC LABORAL': 'GERENCIA LEGAL Y RELACIONES LABORALES',
};

Chart.register(ChartDataLabels);

// ==========================================
// 1. CONFIGURACIÓN
// ==========================================
const SUPABASE_URL = 'https://bfwyedbiguytlrooiglj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmd3llZGJpZ3V5dGxyb29pZ2xqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2Nzc5MzAsImV4cCI6MjEwNTI1MzkzMH0.5m5ZzlZ88FONEp1NDwhLXts3YToEk1AIA-AaCW-R6RQ';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MESES_NOMBRES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function nombreMes(n) { return MESES_NOMBRES[n] || ''; }

// ==========================================
// 1b. HELPERS
// ==========================================
function normalizarTexto(s) {
    return (s || '').toString().trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function esAdminReal() {
    return usuarioActual && usuarioActual.esAdmin === true;
}

function usuarioVeTodo() {
    if (!usuarioActual) return false;
    if (usuarioActual.esAdmin) return true;
    const nombreNorm = normalizarTexto(usuarioActual.nombre);
    return GERENCIAS_ACCESO_TOTAL.some(g => normalizarTexto(g) === nombreNorm);
}

function puedeSubirExcel() {
    return esAdminReal();
}

function excluirAnios(q) {
    ANIOS_EXCLUIDOS.forEach(a => {
        q = q.not('"FECHA_ACONTECIMIENTO"', 'like', `%/${a}%`);
    });
    return q;
}

function embellecer(texto) {
    if (!texto) return texto;
    const key = texto.toString().trim().toUpperCase();
    return CORRECCIONES_ORTOGRAFICAS[key] || texto;
}

function escaparAttr(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
}

function escaparHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
}

function parsearFechaHallazgo(fecha) {
    const partes = (fecha || '').split('/');
    if (partes.length !== 3) return { anio: null, mes: null };
    return {
        anio: partes[2] ? partes[2].substring(0, 4) : null,
        mes: parseInt(partes[1]) || null
    };
}

// ==========================================
// 2. FONDO ANIMADO
// ==========================================
function generarCanaveral() {
    const cont = document.getElementById('canas');
    if (!cont) return;
    cont.innerHTML = '';
    const esMovil = window.innerWidth < 768;
    const totalBack = esMovil ? 15 : 25;
    const totalFront = esMovil ? 30 : 55;
    for (let i = 0; i < totalBack; i++) cont.appendChild(crearCana(i, totalBack, true));
    for (let i = 0; i < totalFront; i++) cont.appendChild(crearCana(i, totalFront, false));
}

function crearCana(index, total, esBack) {
    const cana = document.createElement('div');
    cana.className = 'cana' + (esBack ? ' cana-back' : '');
    const posBase = index / total;
    const leftPct = posBase * 108 - 4 + (Math.random() * 3 - 1.5);
    cana.style.left = leftPct + '%';
    const profundidad = esBack ? Math.random() * 0.35 : 0.35 + Math.random() * 0.65;
    const altura = esBack ? 40 + profundidad * 25 : 55 + profundidad * 45;
    cana.style.height = altura + '%';
    const dur = esBack ? 4.5 + Math.random() * 2 : 3 + Math.random() * 2;
    cana.style.setProperty('--dur', dur.toFixed(2) + 's');
    cana.style.setProperty('--delay', (-Math.random() * 4).toFixed(2) + 's');
    cana.style.zIndex = esBack
        ? String(Math.round(profundidad * 50))
        : String(100 + Math.round(profundidad * 100));
    cana.innerHTML = generarSVGCana(index, esBack);
    return cana;
}

function generarSVGCana(index, esBack) {
    const paleta = [
        { stalk: '#7A8838', leafA: '#8B9A45', leafB: '#4A5A20' },
        { stalk: '#6B7833', leafA: '#7A8838', leafB: '#3D4A18' },
        { stalk: '#889B48', leafA: '#A0B058', leafB: '#5E6F2A' },
        { stalk: '#5E6B28', leafA: '#7A8838', leafB: '#2F3A17' },
        { stalk: '#98A855', leafA: '#B0BE68', leafB: '#6B7D35' }
    ];
    const col = paleta[Math.floor(Math.random() * paleta.length)];
    const idStalk = `stalk_${index}_${esBack ? 'b' : 'f'}`;
    const idLeaf = `leaf_${index}_${esBack ? 'b' : 'f'}`;
    const topStalk = 60 + Math.random() * 80;
    const numHojas = 5 + Math.floor(Math.random() * 4);
    let hojas = '';
    for (let h = 0; h < numHojas; h++) {
        const frac = h / (numHojas - 1);
        const y = topStalk + 20 + Math.pow(frac, 0.75) * (480 - topStalk - 20);
        const dir = h % 2 === 0 ? 1 : -1;
        const L = 22 + Math.random() * 22;
        const durHoja = (2 + Math.random() * 2).toFixed(2);
        const delayHoja = (-Math.random() * 3).toFixed(2);
        const x0 = 50;
        const d = `
            M ${x0},${y}
            Q ${x0 + dir * L * 0.5},${y - L * 0.75} ${x0 + dir * L * 0.85},${y - L * 0.8}
            Q ${x0 + dir * L * 1.05},${y - L * 0.6} ${x0 + dir * L * 0.95},${y - L * 0.35}
            Q ${x0 + dir * L * 0.45},${y - L * 0.15} ${x0},${y}
            Z
        `;
        hojas += `
            <path class="hoja" d="${d}" fill="url(#${idLeaf})"
                  stroke="${col.leafB}" stroke-width="0.4" stroke-opacity="0.7"
                  style="transform-origin: ${x0}px ${y}px;
                         --durHoja: ${durHoja}s;
                         --delayHoja: ${delayHoja}s;" />
        `;
    }
    return `
        <svg viewBox="0 0 100 500" preserveAspectRatio="xMidYMax meet">
            <defs>
                <linearGradient id="${idStalk}" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${col.leafA}"/>
                    <stop offset="100%" stop-color="${col.stalk}"/>
                </linearGradient>
                <linearGradient id="${idLeaf}" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="${col.leafB}"/>
                    <stop offset="55%" stop-color="${col.leafA}"/>
                    <stop offset="100%" stop-color="${col.stalk}"/>
                </linearGradient>
            </defs>
            <path d="M 48.5,500 Q 49,300 49.5,${topStalk} L 50.5,${topStalk} Q 51,300 51.5,500 Z"
                  fill="url(#${idStalk})"/>
            ${hojas}
        </svg>
    `;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', generarCanaveral);
} else {
    generarCanaveral();
}

let timeoutResize;
window.addEventListener('resize', () => {
    clearTimeout(timeoutResize);
    timeoutResize = setTimeout(generarCanaveral, 300);
});

// ==========================================
// 3. LOGIN
// ==========================================
async function cargarOpcionesLogin() {
    const { data, error } = await supabaseClient
        .from('gerencias_acceso')
        .select('nombre')
        .eq('es_admin', false)
        .neq('nombre', NOMBRE_RRLL)
        .order('nombre');
    if (error) { console.error(error); return; }

    const sel = document.getElementById('login-gerencia');
    sel.innerHTML = '<option value="">Selecciona tu gerencia...</option>';
    data.forEach(g => {
        sel.innerHTML += `<option value="${g.nombre}">${embellecer(g.nombre)}</option>`;
    });
}

async function intentarLogin() {
    const nombre = document.getElementById('login-gerencia').value;
    const password = document.getElementById('login-password').value;
    const errorBox = document.getElementById('login-error');
    errorBox.classList.add('hidden');

    if (!nombre || !password) {
        errorBox.textContent = 'Por favor, selecciona una gerencia e ingresa la contraseña.';
        errorBox.classList.remove('hidden');
        return;
    }

    const { data, error } = await supabaseClient.rpc('validar_acceso', {
        p_nombre: nombre, p_password: password
    });

    if (error || !data || data.length === 0) {
        errorBox.textContent = 'Credenciales incorrectas. Verifica tu gerencia y contraseña.';
        errorBox.classList.remove('hidden');
        return;
    }

    if (data[0].es_admin) {
        errorBox.textContent = 'Esta cuenta es de administrador. Usa el menú superior.';
        errorBox.classList.remove('hidden');
        return;
    }

    usuarioActual = { nombre: data[0].nombre, esAdmin: false };
    sessionStorage.setItem('usuario', JSON.stringify(usuarioActual));
    await iniciarDashboard();
}

async function intentarLoginAdmin() {
    const password = document.getElementById('admin-password').value;
    const errorBox = document.getElementById('admin-error');
    errorBox.classList.add('hidden');

    if (!password) {
        errorBox.textContent = 'Ingresa la contraseña de administrador.';
        errorBox.classList.remove('hidden');
        return;
    }

    const { data, error } = await supabaseClient.rpc('validar_acceso', {
        p_nombre: NOMBRE_ADMIN, p_password: password
    });

    if (error || !data || data.length === 0) {
        errorBox.textContent = 'Contraseña incorrecta.';
        errorBox.classList.remove('hidden');
        return;
    }

    usuarioActual = { nombre: data[0].nombre, esAdmin: true };
    sessionStorage.setItem('usuario', JSON.stringify(usuarioActual));
    await iniciarDashboard();
}

async function intentarLoginRRLL() {
    const password = document.getElementById('relaciones-password').value;
    const errorBox = document.getElementById('relaciones-error');
    errorBox.classList.add('hidden');

    if (!password) {
        errorBox.textContent = 'Ingresa la contraseña.';
        errorBox.classList.remove('hidden');
        return;
    }

    const { data, error } = await supabaseClient.rpc('validar_acceso', {
        p_nombre: NOMBRE_RRLL, p_password: password
    });

    if (error || !data || data.length === 0) {
        errorBox.textContent = 'Contraseña incorrecta.';
        errorBox.classList.remove('hidden');
        return;
    }

    usuarioRRLL = { nombre: NOMBRE_RRLL };
    sessionStorage.setItem('usuarioRRLL', JSON.stringify(usuarioRRLL));
    await iniciarPanelRRLL();
}

function cerrarSesion() {
    sessionStorage.removeItem('usuario');
    sessionStorage.removeItem('usuarioRRLL');
    location.reload();
}

// ==========================================
// 4. INICIAR DASHBOARD
// ==========================================
async function iniciarDashboard() {
    document.getElementById('pantalla-login').classList.add('hidden');
    document.getElementById('panel-relaciones').classList.add('hidden');
    document.getElementById('app-principal').classList.remove('hidden');
    document.getElementById('usuario-actual').textContent = embellecer(usuarioActual.nombre);

    const fondo = document.querySelector('.fondo-animado');
    if (fondo) fondo.style.display = 'none';

    if (puedeSubirExcel()) {
        const panelExcel = document.getElementById('admin-excel-panel');
        if (panelExcel) panelExcel.classList.remove('hidden');
    }

    if (usuarioVeTodo()) {
        const tabsNav = document.getElementById('tabs-nav');
        if (tabsNav) tabsNav.classList.remove('hidden');
    }

    renderizarBotonesEvento();
    renderizarBotonesEstado();
    renderizarBotonesAnioActos();
    renderizarBotonesMesActos();

    await cargarFiltros();
    await aplicarRestriccionesUsuario();
    await cargarDashboard();
    await cargarTabla();
    await dibujarGrafico();
    await cargarCatalogoFaltas();

    suscribirRealtimeFotosHallazgos();
    suscribirRealtimeMedidaFotos();
}

async function aplicarRestriccionesUsuario() {
    const selGerencia = document.getElementById('filtro-gerencia');
    if (usuarioVeTodo()) {
        selGerencia.disabled = false;
        selGerencia.classList.remove('bg-slate-100', 'cursor-not-allowed', 'text-slate-500');
        return;
    }
    selGerencia.value = usuarioActual.nombre;
    selGerencia.disabled = true;
    selGerencia.classList.add('bg-slate-100', 'cursor-not-allowed', 'text-slate-500');
    await actualizarFiltroAreas();
}

// ==========================================
// 5. TABS
// ==========================================
function cambiarVista(vista) {
    if (vista === vistaActual) return;
    vistaActual = vista;

    if (vista === 'actos' && !usuarioVeTodo()) {
        vistaActual = 'hallazgos';
        return;
    }

    const vHallazgos = document.getElementById('vista-hallazgos');
    const vActos = document.getElementById('vista-actos');
    const tabH = document.getElementById('tab-hallazgos');
    const tabA = document.getElementById('tab-actos');

    if (vista === 'hallazgos') {
        vHallazgos.classList.remove('hidden');
        vActos.classList.add('hidden');
        tabH.classList.add('tab-btn-active');
        tabA.classList.remove('tab-btn-active');
    } else {
        vHallazgos.classList.add('hidden');
        vActos.classList.remove('hidden');
        tabH.classList.remove('tab-btn-active');
        tabA.classList.add('tab-btn-active');

        if (subVistaActos === 'faltas') cargarRankingFaltas();
        else cargarActosInseguros();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cambiarSubVistaActos(sub) {
    if (sub === subVistaActos) return;
    subVistaActos = sub;

    const btnInd = document.getElementById('subt-tab-indicadores');
    const btnFal = document.getElementById('subt-tab-faltas');
    const viewInd = document.getElementById('subt-vista-indicadores');
    const viewFal = document.getElementById('subt-vista-faltas');

    if (sub === 'indicadores') {
        btnInd.classList.add('tab-btn-active');
        btnFal.classList.remove('tab-btn-active');
        viewInd.classList.remove('hidden');
        viewFal.classList.add('hidden');
        cargarActosInseguros();
    } else {
        btnInd.classList.remove('tab-btn-active');
        btnFal.classList.add('tab-btn-active');
        viewInd.classList.add('hidden');
        viewFal.classList.remove('hidden');
        cargarRankingFaltas();
    }
}

// ==========================================
// 6. BOTONES EVENTO / ESTADO
// ==========================================
function renderizarBotonesEvento() {
    const generarBotones = (esGrafico) => EVENTOS_DISPONIBLES.map(e => {
        const activo = eventoSeleccionado === e.valor;
        const etiqueta = esGrafico
            ? (e.valor === 'Acto Subestandar' ? 'Actos' : 'Condiciones')
            : e.etiqueta;
        return `<button data-valor="${e.valor}"
             class="btn-evento filter-chip w-full min-h-[2.5rem] h-auto px-2 sm:px-3 py-2 text-[10px] sm:text-xs font-semibold rounded-lg border transition flex items-center justify-center leading-tight text-center
            ${activo
                ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm shadow-emerald-700/20'
                : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50'}">
            ${etiqueta}
        </button>`;
    }).join('');

    const contTop = document.getElementById('filtro-evento-botones');
    if (contTop) contTop.innerHTML = generarBotones(false);
    const contChart = document.getElementById('filtro-evento-grafico');
    if (contChart) contChart.innerHTML = generarBotones(true);

    document.querySelectorAll('.btn-evento').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = btn.dataset.valor;
            eventoSeleccionado = (eventoSeleccionado === val) ? '' : val;
            renderizarBotonesEvento();
            refrescarTodo();
        });
    });
}

function renderizarBotonesEstado() {
    const cont = document.getElementById('filtro-estado-botones');
    cont.innerHTML = ESTADOS_DISPONIBLES.map(e => {
        const activo = estadoSeleccionado === e;
        return `<button data-valor="${e}"
            class="btn-estado filter-chip w-full min-h-[2.5rem] h-auto px-2 sm:px-3 py-2 text-[10px] sm:text-xs font-semibold rounded-lg border transition flex items-center justify-center leading-tight text-center
            ${activo
                ? 'bg-slate-900 text-white border-slate-900 shadow-sm shadow-slate-900/20'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:bg-slate-50'}">
            ${e}
        </button>`;
    }).join('');

    cont.querySelectorAll('.btn-estado').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = btn.dataset.valor;
            estadoSeleccionado = (estadoSeleccionado === val) ? '' : val;
            renderizarBotonesEstado();
            refrescarTodo();
        });
    });
}

function renderizarBotonesAnioActos() {
    const cont = document.getElementById('anios-actos');
    if (!cont) return;

    const anios = [2025, 2026];
    cont.innerHTML = '';

    anios.forEach(anio => {
        const activo = anioActosSeleccionado === anio;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tab-btn ' + (activo ? 'tab-btn-active' : '');
        btn.dataset.anio = anio;
        btn.textContent = anio;
        btn.addEventListener('click', () => {
            if (anioActosSeleccionado === anio) return;
            anioActosSeleccionado = anio;
            const hoy = new Date();
            const anioHoy = hoy.getFullYear();
            const mesHoy  = hoy.getMonth() + 1;
            const mesMax = anioActosSeleccionado === anioHoy ? mesHoy : 12;
            if (mesActosSeleccionado > mesMax) mesActosSeleccionado = mesMax;
            renderizarBotonesAnioActos();
            renderizarBotonesMesActos();
            cargarActosInseguros();
        });
        cont.appendChild(btn);
    });
}

function renderizarBotonesMesActos() {
    const cont = document.getElementById('meses-actos');
    if (!cont) return;

    const hoy = new Date();
    const anioHoy = hoy.getFullYear();
    const mesHoy  = hoy.getMonth() + 1;

    let mesLimite = 12;
    if (anioActosSeleccionado === anioHoy) mesLimite = mesHoy;
    else if (anioActosSeleccionado > anioHoy) mesLimite = 0;

    if (mesActosSeleccionado > mesLimite) mesActosSeleccionado = mesLimite || mesHoy;

    cont.innerHTML = '';
    for (let i = 1; i <= mesLimite; i++) {
        const activo = mesActosSeleccionado === i;
        const btn = document.createElement('button');
        btn.className = 'mes-btn ' + (activo ? 'mes-btn-active' : '');
        btn.dataset.mes = i;
        btn.textContent = MESES_CORTOS[i - 1];
        btn.addEventListener('click', () => {
            mesActosSeleccionado = i;
            renderizarBotonesMesActos();
            cargarActosInseguros();
        });
        cont.appendChild(btn);
    }
}

// ==========================================
// 7. FILTROS
// ==========================================
async function cargarFiltros() {
    let qFechas = supabaseClient.from('hallazgos').select('"FECHA_ACONTECIMIENTO"').neq('"ESTADO"', 'Anulado');
    qFechas = excluirAnios(qFechas);
    const { data: fechas } = await qFechas;

    const anios = [...new Set(fechas.map(f => {
        const partes = (f.FECHA_ACONTECIMIENTO || '').split('/');
        return partes[2] ? partes[2].substring(0, 4) : null;
    }).filter(Boolean))]
      .filter(a => !ANIOS_EXCLUIDOS.includes(a))
      .sort();

    const selAnio = document.getElementById('filtro-anio');
    selAnio.innerHTML = '<option value="">Todos</option>';
    anios.forEach(a => selAnio.innerHTML += `<option value="${a}">${a}</option>`);

    let qGer = supabaseClient.from('hallazgos').select('"DESC_AREA"').not('"DESC_AREA"', 'is', null).neq('"ESTADO"', 'Anulado');
    qGer = excluirAnios(qGer);
    const { data: gerencias } = await qGer;

    const gerenciasUnicas = [...new Set(gerencias.map(g => g.DESC_AREA))]
        .filter(g => !GERENCIAS_EXCLUIDAS.includes(g))
        .sort();
    const selGerencia = document.getElementById('filtro-gerencia');
    selGerencia.innerHTML = '<option value="">Todas</option>';
    gerenciasUnicas.forEach(g => selGerencia.innerHTML += `<option value="${g}">${embellecer(g)}</option>`);

    await actualizarFiltroAreas();
}

async function actualizarFiltroAreas() {
    const gerencia = document.getElementById('filtro-gerencia').value;
    const selArea = document.getElementById('filtro-area');
    const valorPrevio = selArea.value;
    selArea.innerHTML = '<option value="">Todas</option>';

    let query = supabaseClient.from('hallazgos').select('"DESC_SECCION"').not('"DESC_SECCION"', 'is', null).neq('"ESTADO"', 'Anulado');
    query = excluirAnios(query);
    if (gerencia) query = query.eq('"DESC_AREA"', gerencia);

    const { data } = await query;
    const areasUnicas = [...new Set(data.map(a => a.DESC_SECCION))].sort();
    areasUnicas.forEach(a => selArea.innerHTML += `<option value="${a}">${embellecer(a)}</option>`);

    if (areasUnicas.includes(valorPrevio)) selArea.value = valorPrevio;
}

function obtenerFiltros() {
    return {
        anio: document.getElementById('filtro-anio').value,
        evento: eventoSeleccionado,
        estado: estadoSeleccionado,
        gerencia: document.getElementById('filtro-gerencia').value,
        area: document.getElementById('filtro-area').value,
    };
}

// ==========================================
// 8. KPIs
// ==========================================
async function cargarDashboard() {
    try {
        const { anio, evento, estado, gerencia, area } = obtenerFiltros();

        let queryTotal = supabaseClient.from('hallazgos').select('*', { count: 'exact', head: true }).neq('"ESTADO"', 'Anulado');
        let queryCerrados = supabaseClient.from('hallazgos').select('*', { count: 'exact', head: true }).eq('"ESTADO"', 'Cerrado');
        let queryPendientes = supabaseClient.from('hallazgos').select('*', { count: 'exact', head: true }).eq('"ESTADO"', 'Abierto');

        queryTotal = excluirAnios(queryTotal);
        queryCerrados = excluirAnios(queryCerrados);
        queryPendientes = excluirAnios(queryPendientes);

        const aplicarFiltros = (q) => {
            if (anio) q = q.like('"FECHA_ACONTECIMIENTO"', `%/${anio}%`);
            if (evento) q = q.eq('"DESC_EVENTO"', evento);
            if (estado) q = q.eq('"ESTADO"', estado);
            if (gerencia) q = q.eq('"DESC_AREA"', gerencia);
            if (area) q = q.eq('"DESC_SECCION"', area);
            return q;
        };

        const [resTotal, resCerrados, resPendientes] = await Promise.all([
            aplicarFiltros(queryTotal), aplicarFiltros(queryCerrados), aplicarFiltros(queryPendientes)
        ]);

        if (resTotal.error) throw resTotal.error;

        const total = resTotal.count || 0;
        const cerrados = resCerrados.count || 0;
        const pendientes = resPendientes.count || 0;
        const porcentaje = total > 0 ? ((cerrados / total) * 100).toFixed(2) : 0;

        document.getElementById('stat-total').textContent = total.toLocaleString();
        document.getElementById('stat-cerrados').textContent = cerrados.toLocaleString();
        document.getElementById('stat-pendientes').textContent = pendientes.toLocaleString();

        const elPorcentaje = document.getElementById('stat-porcentaje');
        elPorcentaje.textContent = `${porcentaje}%`;
        const numPct = parseFloat(porcentaje);
        if (numPct < 75) {
            elPorcentaje.className = 'text-2xl sm:text-4xl md:text-5xl font-bold text-red-600 tracking-tight leading-none';
        } else if (numPct < 90) {
            elPorcentaje.className = 'text-2xl sm:text-4xl md:text-5xl font-bold text-amber-500 tracking-tight leading-none';
        } else {
            elPorcentaje.className = 'text-2xl sm:text-4xl md:text-5xl font-bold text-emerald-600 tracking-tight leading-none';
        }

    } catch (error) {
        console.error('❌ Error dashboard:', error.message);
    }
}

// ==========================================
// 9. GRÁFICO
// ==========================================
async function dibujarGrafico() {
    const { anio, evento, estado, gerencia, area } = obtenerFiltros();
    const titulo = document.getElementById('titulo-grafico');
    const subtitulo = document.getElementById('subtitulo-grafico');
    const btnVolver = document.getElementById('btn-volver-grafico');

    if (miGrafico) { miGrafico.destroy(); miGrafico = null; }

    const anioActual = new Date().getFullYear();
    const mesActual = new Date().getMonth() + 1;

    if (!anio) {
        modoActualGrafico = 'por-anio';
        btnVolver.classList.add('hidden');
        titulo.textContent = 'Hallazgos por Año';
        subtitulo.textContent = gerencia || area
            ? `Total por año · ${embellecer(gerencia || area)}`
            : 'Haz clic en un año para explorar las gerencias';

        let q = supabaseClient.from('hallazgos').select('"FECHA_ACONTECIMIENTO","ESTADO"').neq('"ESTADO"', 'Anulado').range(0, 9999);
        q = excluirAnios(q);
        if (evento) q = q.eq('"DESC_EVENTO"', evento);
        if (estado) q = q.eq('"ESTADO"', estado);
        if (gerencia) q = q.eq('"DESC_AREA"', gerencia);
        if (area) q = q.eq('"DESC_SECCION"', area);

        const { data, error } = await q;
        if (error) { console.error(error); return; }

        const porAnio = {};
        data.forEach(h => {
            const partes = (h.FECHA_ACONTECIMIENTO || '').split('/');
            const a = partes[2] ? partes[2].substring(0, 4) : null;
            const m = parseInt(partes[1]);
            if (!a || !m) return;
            if (ANIOS_EXCLUIDOS.includes(a)) return;
            if (parseInt(a) === anioActual && m > mesActual) return;
            if (!porAnio[a]) porAnio[a] = { c: 0, p: 0 };
            if (h.ESTADO === 'Cerrado') porAnio[a].c++;
            if (h.ESTADO === 'Abierto') porAnio[a].p++;
        });

        const anios = Object.keys(porAnio).sort();
        pintarGrafico(anios, anios.map(a => porAnio[a].c), anios.map(a => porAnio[a].p), false, 'por-anio');
        return;
    }

    const esAnioActual = parseInt(anio) === anioActual;
    const mesLimite = esAnioActual ? mesActual : 12;
    const sufijoAcum = esAnioActual ? ` (Ene–${nombreMes(mesLimite)})` : '';

    if (!gerencia && !area) {
        modoActualGrafico = 'por-gerencia';
        btnVolver.classList.remove('hidden');
        titulo.textContent = `Hallazgos por Gerencia · ${anio}`;
        subtitulo.textContent = `Acumulado${sufijoAcum} · Haz clic en una gerencia para ver sus áreas`;

        let q = supabaseClient.from('hallazgos')
            .select('"FECHA_ACONTECIMIENTO","ESTADO","DESC_AREA"')
            .like('"FECHA_ACONTECIMIENTO"', `%/${anio}%`)
            .not('"DESC_AREA"', 'is', null)
            .neq('"ESTADO"', 'Anulado').range(0, 9999);
        q = excluirAnios(q);
        if (evento) q = q.eq('"DESC_EVENTO"', evento);
        if (estado) q = q.eq('"ESTADO"', estado);

        const { data, error } = await q;
        if (error) { console.error(error); return; }

        const porG = {};
        data.forEach(h => {
            const m = parseInt((h.FECHA_ACONTECIMIENTO || '').split('/')[1]);
            if (!m || m > mesLimite) return;
            if (!porG[h.DESC_AREA]) porG[h.DESC_AREA] = { c: 0, p: 0 };
            if (h.ESTADO === 'Cerrado') porG[h.DESC_AREA].c++;
            if (h.ESTADO === 'Abierto') porG[h.DESC_AREA].p++;
        });

        const gerencias = Object.keys(porG).sort();
        pintarGrafico(gerencias, gerencias.map(g => porG[g].c), gerencias.map(g => porG[g].p), false, 'por-gerencia');
        return;
    }

    if (gerencia && !area) {
        modoActualGrafico = 'por-area';
        btnVolver.classList.remove('hidden');
        titulo.textContent = `Hallazgos por Área · ${embellecer(gerencia)}`;
        subtitulo.textContent = `Acumulado${sufijoAcum} · Haz clic en un área para ver su tendencia mensual`;

        let q = supabaseClient.from('hallazgos')
            .select('"FECHA_ACONTECIMIENTO","ESTADO","DESC_SECCION"')
            .like('"FECHA_ACONTECIMIENTO"', `%/${anio}%`)
            .eq('"DESC_AREA"', gerencia)
            .not('"DESC_SECCION"', 'is', null)
            .neq('"ESTADO"', 'Anulado').range(0, 9999);
        q = excluirAnios(q);
        if (evento) q = q.eq('"DESC_EVENTO"', evento);
        if (estado) q = q.eq('"ESTADO"', estado);

        const { data, error } = await q;
        if (error) { console.error(error); return; }

        const porA = {};
        data.forEach(h => {
            const m = parseInt((h.FECHA_ACONTECIMIENTO || '').split('/')[1]);
            if (!m || m > mesLimite) return;
            if (!porA[h.DESC_SECCION]) porA[h.DESC_SECCION] = { c: 0, p: 0 };
            if (h.ESTADO === 'Cerrado') porA[h.DESC_SECCION].c++;
            if (h.ESTADO === 'Abierto') porA[h.DESC_SECCION].p++;
        });

        const areas = Object.keys(porA).sort();
        pintarGrafico(areas, areas.map(a => porA[a].c), areas.map(a => porA[a].p), false, 'por-area');
        return;
    }

    if (area) {
        modoActualGrafico = 'mensual';
        btnVolver.classList.remove('hidden');
        titulo.textContent = `Evolución Mensual · ${embellecer(area)}`;
        if (mesSeleccionado !== '') {
            subtitulo.innerHTML = `Acumulado${sufijoAcum} · <span class="text-emerald-700 font-semibold">Filtrado por: ${nombreMes(mesSeleccionado)}</span> · Clic de nuevo para quitar`;
        } else {
            subtitulo.textContent = `Acumulado${sufijoAcum} · Haz clic en un mes para filtrar la tabla`;
        }

        let q = supabaseClient.from('hallazgos')
            .select('"FECHA_ACONTECIMIENTO","ESTADO"')
            .like('"FECHA_ACONTECIMIENTO"', `%/${anio}%`)
            .eq('"DESC_SECCION"', area)
            .neq('"ESTADO"', 'Anulado').range(0, 9999);
        q = excluirAnios(q);
        if (evento) q = q.eq('"DESC_EVENTO"', evento);
        if (estado) q = q.eq('"ESTADO"', estado);

        const { data, error } = await q;
        if (error) { console.error(error); return; }

        const porMes = {};
        for (let i = 1; i <= 12; i++) porMes[i] = { c: 0, p: 0 };
        data.forEach(h => {
            const m = parseInt((h.FECHA_ACONTECIMIENTO || '').split('/')[1]);
            if (!m || m > mesLimite) return;
            if (h.ESTADO === 'Cerrado') porMes[m].c++;
            if (h.ESTADO === 'Abierto') porMes[m].p++;
        });

        const labels = [], dataC = [], dataP = [];
        let sumC = 0, sumP = 0;
        for (let i = 1; i <= mesLimite; i++) {
            sumC += porMes[i].c;
            sumP += porMes[i].p;
            labels.push(MESES_CORTOS[i-1]);
            dataC.push(sumC);
            dataP.push(sumP);
        }
        pintarGrafico(labels, dataC, dataP, true, 'mensual');
        return;
    }
}

function partirTexto(str, maxChars) {
    if (!str) return '';
    const palabras = str.split(' ');
    const lineas = [];
    let lineaActual = '';
    palabras.forEach(p => {
        if ((lineaActual + ' ' + p).trim().length > maxChars && lineaActual !== '') {
            lineas.push(lineaActual.trim());
            lineaActual = p;
        } else {
            lineaActual += ' ' + p;
        }
    });
    if (lineaActual) lineas.push(lineaActual.trim());
    return lineas;
}

function pintarGrafico(labels, dataC, dataP, esAcumulado, modo) {
    const ctx = document.getElementById('grafico-area').getContext('2d');

    const verdeNormal = '#10b981';
    const verdeOscuro = '#047857';
    const rojoNormal = '#ef4444';
    const rojoOscuro = '#b91c1c';

    let bgCArray = Array(labels.length).fill(verdeNormal);
    let bgPArray = Array(labels.length).fill(rojoNormal);

    if (modo === 'mensual' && mesSeleccionado !== '') {
        const idx = mesSeleccionado - 1;
        if (idx >= 0 && idx < labels.length) {
            bgCArray[idx] = verdeOscuro;
            bgPArray[idx] = rojoOscuro;
        }
    }

    miGrafico = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: esAcumulado ? 'Cerrados (Acum.)' : 'Cerrados',
                    data: dataC,
                    backgroundColor: bgCArray,
                    borderRadius: 6,
                    borderSkipped: false,
                    barPercentage: 0.7,
                    categoryPercentage: 0.8
                },
                {
                    label: esAcumulado ? 'Pendientes (Acum.)' : 'Pendientes',
                    data: dataP,
                    backgroundColor: bgPArray,
                    borderRadius: 6,
                    borderSkipped: false,
                    barPercentage: 0.7,
                    categoryPercentage: 0.8
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onClick: (event, elements) => {
                if (elements.length === 0) return;
                manejarClickBarra(modo, labels[elements[0].index]);
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 20,
                        font: { size: 11, weight: '600', family: 'Inter' },
                        color: '#64748b'
                    }
                },
                datalabels: {
                    anchor: 'end',
                    align: 'top',
                    offset: 4,
                    formatter: (v) => v > 0 ? v : '',
                    font: { size: 10, weight: '700', family: 'Inter' },
                    color: '#475569'
                },
                tooltip: {
                    backgroundColor: '#0f172a',
                    padding: 12,
                    titleFont: { size: 12, weight: '600', family: 'Inter' },
                    bodyFont: { size: 12, family: 'Inter' },
                    cornerRadius: 8,
                    displayColors: true,
                    callbacks: {
                        title: (items) => embellecer(labels[items[0].dataIndex])
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { precision: 0, color: '#94a3b8', font: { size: 10, family: 'Inter' } },
                    grid: { color: '#f1f5f9', drawBorder: false },
                    grace: '15%'
                },
                x: {
                    ticks: {
                        autoSkip: false,
                        maxRotation: window.innerWidth < 640 ? 90 : 0,
                        minRotation: window.innerWidth < 640 ? 45 : 0,
                        color: '#64748b',
                        font: { size: window.innerWidth < 640 ? 9 : 10, weight: '500', family: 'Inter' },
                        callback: function(value) {
                            const label = this.getLabelForValue(value);
                            const bonito = embellecer(label);
                            if (window.innerWidth < 640) {
                                if (bonito.length <= 12) return bonito;
                                return partirTexto(bonito, 14);
                            }
                            if (bonito.length <= 15) return bonito;
                            return partirTexto(bonito, 18);
                        }
                    },
                    grid: { display: false }
                }
            }
        }
    });
}

// ==========================================
// 10. CLIC EN BARRAS
// ==========================================
async function manejarClickBarra(modo, label) {
    if (modo === 'por-anio') {
        document.getElementById('filtro-anio').value = label;
        mesSeleccionado = '';
    } else if (modo === 'por-gerencia') {
        if (!usuarioVeTodo()) return;
        document.getElementById('filtro-gerencia').value = label;
        await actualizarFiltroAreas();
        document.getElementById('filtro-area').value = '';
        mesSeleccionado = '';
    } else if (modo === 'por-area') {
        document.getElementById('filtro-area').value = label;
        mesSeleccionado = '';
    } else if (modo === 'mensual') {
        const mesNum = MESES_CORTOS.indexOf(label) + 1;
        mesSeleccionado = (mesSeleccionado === mesNum) ? '' : mesNum;
        await dibujarGrafico();
        await cargarTabla();
        return;
    }
    await refrescarTodo();
}

document.getElementById('btn-volver-grafico').addEventListener('click', async () => {
    mesSeleccionado = '';
    if (modoActualGrafico === 'mensual') {
        document.getElementById('filtro-area').value = '';
    } else if (modoActualGrafico === 'por-area') {
        if (usuarioVeTodo()) document.getElementById('filtro-gerencia').value = '';
        document.getElementById('filtro-area').value = '';
        await actualizarFiltroAreas();
        if (!usuarioVeTodo()) document.getElementById('filtro-gerencia').value = usuarioActual.nombre;
    } else if (modoActualGrafico === 'por-gerencia') {
        document.getElementById('filtro-anio').value = '';
        if (usuarioVeTodo()) document.getElementById('filtro-gerencia').value = '';
        document.getElementById('filtro-area').value = '';
        if (!usuarioVeTodo()) document.getElementById('filtro-gerencia').value = usuarioActual.nombre;
    }
    await refrescarTodo();
});

// ==========================================
// 11. TABLA PRINCIPAL
// ==========================================
async function cargarTabla() {
    try {
        const { anio, evento, estado, gerencia, area } = obtenerFiltros();
        const offset = (paginaActual - 1) * registrosPorPagina;

        let q = supabaseClient
            .from('hallazgos')
            .select('"COD_HALLAZGO","FECHA_ACONTECIMIENTO","DESC_SECCION","ESTADO","ACONTECIMIENTO","USR_RESPONSABLE","USR_REASIGNADO"', { count: 'exact' })
            .neq('"ESTADO"', 'Anulado');

        q = excluirAnios(q);

        if (anio) q = q.like('"FECHA_ACONTECIMIENTO"', `%/${anio}%`);
        if (mesSeleccionado !== '') {
            const mesStr = String(mesSeleccionado).padStart(2, '0');
            q = q.like('"FECHA_ACONTECIMIENTO"', `%/${mesStr}/%`);
        }
        if (evento) q = q.eq('"DESC_EVENTO"', evento);
        if (estado) q = q.eq('"ESTADO"', estado);
        if (gerencia) q = q.eq('"DESC_AREA"', gerencia);
        if (area) q = q.eq('"DESC_SECCION"', area);
        if (searchTerm) q = q.ilike('"ACONTECIMIENTO"', `%${searchTerm}%`);

        const { data, count, error } = await q
            .order('"FECHA_ACONTECIMIENTO"', { ascending: false })
            .range(offset, offset + registrosPorPagina - 1);

        if (error) throw error;

        const idsVisibles = (data || []).map(h => h.COD_HALLAZGO).filter(Boolean);
        if (idsVisibles.length > 0) await cargarImagenesHallazgos(idsVisibles);

        totalRegistros = count || 0;
        totalPaginas = Math.ceil(totalRegistros / registrosPorPagina) || 1;

        document.getElementById('contador-tabla').textContent = totalRegistros.toLocaleString();
        document.getElementById('pagina-actual').textContent = paginaActual;
        document.getElementById('total-paginas').textContent = totalPaginas;
        document.getElementById('btn-prev').disabled = paginaActual <= 1;
        document.getElementById('btn-next').disabled = paginaActual >= totalPaginas;

        const tbody = document.getElementById('tabla-body');
        const cardsContainer = document.getElementById('tabla-cards');

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-12 text-slate-400 text-sm">No se encontraron hallazgos</td></tr>`;
            cardsContainer.innerHTML = `<div class="text-center py-12 text-slate-400 text-sm">No se encontraron hallazgos</div>`;
            return;
        }

        const generarBadge = (estado) => {
            if (estado === 'Cerrado') {
                return '<span class="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap"><span class="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>Cerrado</span>';
            } else if (estado === 'Abierto') {
                return '<span class="inline-flex items-center gap-1.5 bg-red-50 text-red-700 px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap"><span class="w-1.5 h-1.5 bg-red-500 rounded-full"></span>Abierto</span>';
            }
            return `<span class="inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap">${estado || '-'}</span>`;
        };

        tbody.innerHTML = data.map(h => {
            const { anio: anioStr, mes } = parsearFechaHallazgo(h.FECHA_ACONTECIMIENTO);
            const mesStr = mes ? nombreMes(mes) : '';
            return `
                <tr class="row-hover transition">
                    <td class="px-6 py-4 font-semibold text-slate-800 text-xs whitespace-nowrap">${h.COD_HALLAZGO || '-'}</td>
                    <td class="px-6 py-4 text-slate-600 text-xs whitespace-nowrap">${anioStr}</td>
                    <td class="px-6 py-4 text-slate-600 text-xs whitespace-nowrap">${mesStr}</td>
                    <td class="px-6 py-4 whitespace-nowrap">
                    <p class="text-slate-700 text-xs font-medium leading-tight">${escaparHTML(embellecer(h.DESC_SECCION)) || '-'}</p>
                    <p class="text-slate-500 text-[11px] leading-tight mt-0.5">${escaparHTML(h.USR_REASIGNADO || h.USR_RESPONSABLE || '') || ''}</p>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">${generarBadge(h.ESTADO)}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-center">${botonFotosHallazgoHTML(h.COD_HALLAZGO)}</td>
                    <td class="px-6 py-4 text-slate-600 text-xs">${h.ACONTECIMIENTO || '-'}</td>
                </tr>
            `;
        }).join('');

        cardsContainer.innerHTML = data.map(h => {
            const { anio: anioStr, mes } = parsearFechaHallazgo(h.FECHA_ACONTECIMIENTO);
            const mesStr = mes ? nombreMes(mes) : '';
            return `
                <div class="p-4 space-y-2 hover:bg-slate-50 transition">
                    <div class="flex justify-between items-start gap-3">
                        <span class="font-bold text-slate-800 text-sm">${h.COD_HALLAZGO || '-'}</span>
                        ${generarBadge(h.ESTADO)}
                    </div>
                    <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span><strong class="text-slate-700 font-semibold">Año:</strong> ${anioStr || '-'}</span>
                        <span><strong class="text-slate-700 font-semibold">Mes:</strong> ${mesStr || '-'}</span>
                    </div>
                    <div class="text-xs leading-tight">
    <p class="text-slate-700">
        <strong class="text-slate-700 font-semibold">Área:</strong> ${escaparHTML(embellecer(h.DESC_SECCION)) || '-'}
    </p>
    <p class="text-slate-500 text-[11px] mt-0.5 pl-0.5">${escaparHTML(h.USR_REASIGNADO || h.USR_RESPONSABLE || '') || ''}</p>
</div>
                    <p class="text-xs text-slate-600 leading-relaxed pt-2 border-t border-slate-100 mt-2">
                        ${h.ACONTECIMIENTO || '-'}
                    </p>
                    <div class="flex items-center justify-between pt-2 border-t border-slate-100 mt-2">
                        <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Fotos</span>
                        ${botonFotosHallazgoHTML(h.COD_HALLAZGO)}
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('❌ Error tabla:', error.message);
    }
}

// ==========================================
// 12. EVENTOS
// ==========================================
document.getElementById('btn-prev').addEventListener('click', () => {
    if (paginaActual > 1) { paginaActual--; cargarTabla(); }
});
document.getElementById('btn-next').addEventListener('click', () => {
    if (paginaActual < totalPaginas) { paginaActual++; cargarTabla(); }
});

let timeoutBuscador;
document.getElementById('buscador').addEventListener('input', (e) => {
    clearTimeout(timeoutBuscador);
    timeoutBuscador = setTimeout(() => {
        searchTerm = e.target.value;
        paginaActual = 1;
        cargarTabla();
    }, 500);
});

async function refrescarTodo() {
    paginaActual = 1;
    await cargarDashboard();
    await cargarTabla();
    await dibujarGrafico();
}

document.getElementById('filtro-anio').addEventListener('change', () => { mesSeleccionado = ''; refrescarTodo(); });
document.getElementById('filtro-gerencia').addEventListener('change', async () => { mesSeleccionado = ''; await actualizarFiltroAreas(); refrescarTodo(); });
document.getElementById('filtro-area').addEventListener('change', () => { mesSeleccionado = ''; refrescarTodo(); });

document.getElementById('btn-login').addEventListener('click', intentarLogin);
document.getElementById('login-password').addEventListener('keypress', (e) => { if (e.key === 'Enter') intentarLogin(); });

const btnHamb = document.getElementById('btn-hamburguesa-login');
const menuAdmin = document.getElementById('menu-admin');
const formNormal = document.getElementById('form-login-normal');
const formAdmin = document.getElementById('form-login-admin');
const formRRLL = document.getElementById('form-login-relaciones');

btnHamb.addEventListener('click', (e) => {
    e.stopPropagation();
    menuAdmin.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
    if (!menuAdmin.contains(e.target) && e.target !== btnHamb && !btnHamb.contains(e.target)) {
        menuAdmin.classList.add('hidden');
    }
});

document.getElementById('btn-modo-admin').addEventListener('click', () => {
    menuAdmin.classList.add('hidden');
    formNormal.classList.add('hidden');
    formRRLL.classList.add('hidden');
    formAdmin.classList.remove('hidden');
    document.getElementById('admin-password').focus();
});

document.getElementById('btn-modo-relaciones').addEventListener('click', () => {
    menuAdmin.classList.add('hidden');
    formNormal.classList.add('hidden');
    formAdmin.classList.add('hidden');
    formRRLL.classList.remove('hidden');
    document.getElementById('relaciones-password').focus();
});

document.getElementById('btn-volver-normal').addEventListener('click', () => {
    formAdmin.classList.add('hidden');
    formRRLL.classList.add('hidden');
    formNormal.classList.remove('hidden');
    document.getElementById('admin-password').value = '';
    document.getElementById('admin-error').classList.add('hidden');
});

document.getElementById('btn-volver-relaciones').addEventListener('click', () => {
    formAdmin.classList.add('hidden');
    formRRLL.classList.add('hidden');
    formNormal.classList.remove('hidden');
    document.getElementById('relaciones-password').value = '';
    document.getElementById('relaciones-error').classList.add('hidden');
});

document.getElementById('btn-login-admin').addEventListener('click', intentarLoginAdmin);
document.getElementById('admin-password').addEventListener('keypress', (e) => { if (e.key === 'Enter') intentarLoginAdmin(); });

document.getElementById('btn-login-relaciones').addEventListener('click', intentarLoginRRLL);
document.getElementById('relaciones-password').addEventListener('keypress', (e) => { if (e.key === 'Enter') intentarLoginRRLL(); });

document.getElementById('btn-logout').addEventListener('click', cerrarSesion);
document.getElementById('btn-logout-relaciones').addEventListener('click', cerrarSesion);

document.getElementById('tab-hallazgos').addEventListener('click', () => cambiarVista('hallazgos'));
document.getElementById('tab-actos').addEventListener('click', () => cambiarVista('actos'));

document.getElementById('subt-tab-indicadores').addEventListener('click', () => cambiarSubVistaActos('indicadores'));
document.getElementById('subt-tab-faltas').addEventListener('click', () => cambiarSubVistaActos('faltas'));

// ==========================================
// 13. INIT
// ==========================================
async function init() {
    await cargarOpcionesLogin();
    const guardado = sessionStorage.getItem('usuario');
    const guardadoRRLL = sessionStorage.getItem('usuarioRRLL');
    if (guardado) {
        usuarioActual = JSON.parse(guardado);
        await iniciarDashboard();
    } else if (guardadoRRLL) {
        usuarioRRLL = JSON.parse(guardadoRRLL);
        await iniciarPanelRRLL();
    }
}

// ==========================================
// 14. EXCEL (ADMIN)
// ==========================================
const btnToggleExcel = document.getElementById('btn-toggle-excel');
const excelPanelContent = document.getElementById('excel-panel-content');
const btnCerrarExcel = document.getElementById('btn-cerrar-excel');

if (btnToggleExcel) {
    btnToggleExcel.addEventListener('click', (e) => {
        e.stopPropagation();
        excelPanelContent.classList.toggle('hidden');
    });

    btnCerrarExcel.addEventListener('click', () => {
        excelPanelContent.classList.add('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!excelPanelContent.contains(e.target) && !btnToggleExcel.contains(e.target)) {
            excelPanelContent.classList.add('hidden');
        }
    });
}

document.getElementById('btnSubirExcel').addEventListener('click', async () => {
    if (!puedeSubirExcel()) {
        alert("⛔ No tienes permisos para subir el Excel. Solo Seguridad Industrial puede hacerlo.");
        return;
    }

    const fileInput = document.getElementById('inputExcel');
    const file = fileInput.files[0];

    if (!file) {
        alert("⚠️ Por favor selecciona un archivo Excel primero.");
        return;
    }

    const btn = document.getElementById('btnSubirExcel');
    const textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Procesando...';
    btn.classList.add('opacity-70', 'cursor-not-allowed');

    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            let jsonData = XLSX.utils.sheet_to_json(worksheet);

            if (jsonData.length === 0) {
                alert("⚠️ El archivo Excel está vacío o no tiene el formato correcto.");
                return;
            }

            jsonData = jsonData.map(row => {
                const filaLimpia = {};
                Object.keys(row).forEach(key => {
                    const nombreColumna = key.trim();
                    if (nombreColumna !== '' && nombreColumna.toLowerCase() !== 'id') {
                        filaLimpia[nombreColumna] = row[key];
                    }
                });
                return filaLimpia;
            });

            const { error } = await supabaseClient
                .from('hallazgos')
                .upsert(jsonData, {
                    onConflict: 'COD_HALLAZGO',
                    ignoreDuplicates: false
                });

            if (error) {
                console.error("Error detallado de Supabase:", error);
                alert(`❌ Error al actualizar: ${error.message}\n\nVerifica que los nombres de las columnas del Excel coincidan exactamente con los de la base de datos y que 'COD_HALLAZGO' sea UNIQUE.`);
            } else {
                alert(`✅ ¡Base de datos actualizada correctamente!\n\nSe procesaron ${jsonData.length} registros.`);
                actosTodosCache = null;
                await refrescarTodo();
                if (vistaActual === 'actos') {
                    if (subVistaActos === 'faltas') cargarRankingFaltas();
                    else cargarActosInseguros();
                }
                fileInput.value = '';
                excelPanelContent.classList.add('hidden');
            }
        } catch (err) {
            console.error("Error al procesar el archivo:", err);
            alert("❌ Hubo un error al leer el archivo Excel.");
        } finally {
            btn.disabled = false;
            btn.textContent = textoOriginal;
            btn.classList.remove('opacity-70', 'cursor-not-allowed');
        }
    };

    reader.readAsArrayBuffer(file);
});

// ==========================================
// 15. FOTOS DE HALLAZGOS
// ==========================================
let imagenesHallazgosCache = [];
const hallazgosConFotosConsultados = new Set();
let fotosHallazgoCtx = { hallazgoId: null };
let realtimeFotosActivo = false;

function contarFotosHallazgo(id) {
    return imagenesHallazgosCache.filter(i => i.hallazgo_id === id).length;
}

function urlFotoHallazgo(path) {
    const { data } = supabaseClient.storage.from('hallazgos-fotos').getPublicUrl(path);
    return data.publicUrl;
}

function botonFotosHallazgoHTML(hallazgoId) {
    const total = contarFotosHallazgo(hallazgoId);
    return `
        <button type="button"
                class="btn-fotos-hallazgo ${total > 0 ? 'tiene-fotos' : ''}"
                data-hallazgo-id="${escaparAttr(hallazgoId)}"
                title="Ver fotos">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
            </svg>
            <span>${total}</span>
        </button>
    `;
}

async function cargarImagenesHallazgos(idsHallazgos) {
    const idsNuevos = (idsHallazgos || []).filter(id => id && !hallazgosConFotosConsultados.has(id));
    if (idsNuevos.length === 0) return;

    const { data, error } = await supabaseClient
        .from('imagenes_hallazgos')
        .select('id, hallazgo_id, storage_path, nombre, subido_por, created_at, destacada')
        .in('hallazgo_id', idsNuevos);

    if (error) { console.error('Error cargando fotos:', error); return; }

    idsNuevos.forEach(id => hallazgosConFotosConsultados.add(id));
    (data || []).forEach(img => {
        if (!imagenesHallazgosCache.some(i => i.id === img.id)) {
            imagenesHallazgosCache.push(img);
        }
    });
}

function actualizarContadoresFotosEnTabla() {
    document.querySelectorAll('.btn-fotos-hallazgo').forEach(btn => {
        const id = btn.dataset.hallazgoId;
        if (!id) return;
        const total = contarFotosHallazgo(id);
        btn.classList.toggle('tiene-fotos', total > 0);
        const span = btn.querySelector('span');
        if (span) span.textContent = total;
    });
}

async function comprimirImagenHallazgo(file, maxWidth = 1400, calidad = 0.78) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onerror = () => resolve(file);
        reader.onload = (e) => {
            const img = new Image();
            img.onerror = () => resolve(file);
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    const escala = Math.min(1, maxWidth / img.width);
                    canvas.width  = Math.round(img.width  * escala);
                    canvas.height = Math.round(img.height * escala);
                    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                    canvas.toBlob(b => resolve(b || file), 'image/jpeg', calidad);
                } catch { resolve(file); }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function abrirModalFotosHallazgo(hallazgoId) {
    fotosHallazgoCtx.hallazgoId = hallazgoId;
    document.getElementById('foto-hallazgo-input').value = '';
    renderFotosHallazgoModal();
    const m = document.getElementById('modal-fotos-hallazgo');
    m.classList.remove('hidden');
    m.classList.add('flex');
    setTimeout(() => m.focus(), 50);
}

function cerrarModalFotosHallazgo() {
    const m = document.getElementById('modal-fotos-hallazgo');
    m.classList.add('hidden');
    m.classList.remove('flex');
    fotosHallazgoCtx.hallazgoId = null;
}

function renderFotosHallazgoModal() {
    const hallazgoId = fotosHallazgoCtx.hallazgoId;
    if (!hallazgoId) return;

    const fotos = imagenesHallazgosCache.filter(i => i.hallazgo_id === hallazgoId);
    const grid = document.getElementById('fotos-hallazgo-grid');
    const info = document.getElementById('modal-fotos-info');
    const toolbar = document.getElementById('fotos-hallazgo-toolbar');

    toolbar.classList.toggle('hidden', !esAdminReal());

    info.textContent = fotos.length === 0
        ? 'Sin fotos'
        : `${fotos.length} foto${fotos.length > 1 ? 's' : ''}`;

    if (fotos.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-12 text-slate-400">
                <svg class="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                </svg>
                <p class="text-sm">No hay fotos cargadas</p>
            </div>`;
        return;
    }

    const puedeBorrar = esAdminReal();
    grid.innerHTML = '';
    fotos.forEach((f, idx) => {
        const url = urlFotoHallazgo(f.storage_path);
        const item = document.createElement('div');
        item.className = 'relative aspect-square rounded-xl overflow-hidden bg-slate-100 group';
        const esDestacada = f.destacada === true;
        item.innerHTML = `
            <img src="${url}"
                 alt="${escaparAttr(f.nombre)}"
                 loading="${idx === 0 ? 'eager' : 'lazy'}"
                 decoding="async"
                 fetchpriority="${idx === 0 ? 'high' : 'low'}"
                 class="w-full h-full object-cover cursor-zoom-in transition group-hover:scale-105"
                 data-lightbox-url="${escaparAttr(url)}">
            ${puedeBorrar ? `
                <button type="button"
                        class="foto-destacada-star ${esDestacada ? 'activa' : ''}"
                        data-star-id="${escaparAttr(f.id)}"
                        data-star-hallazgo="${escaparAttr(hallazgoId)}"
                        title="${esDestacada ? 'Foto destacada' : 'Marcar como destacada'}">★</button>
                <button type="button"
                        class="absolute top-2 right-2 w-7 h-7 rounded-full bg-slate-900/70 hover:bg-red-600 text-white flex items-center justify-center text-xs backdrop-blur-sm transition"
                        data-delete-id="${escaparAttr(f.id)}"
                        data-delete-path="${escaparAttr(f.storage_path)}"
                        title="Eliminar">✕</button>
            ` : ''}
            ${esDestacada && !puedeBorrar ? `
                <span class="absolute top-2 left-2 w-7 h-7 rounded-full bg-amber-400 text-white flex items-center justify-center text-sm shadow-lg">★</span>
            ` : ''}
        `;
        grid.appendChild(item);
    });
}

document.getElementById('fotos-hallazgo-grid').addEventListener('click', (e) => {
    const star = e.target.closest('button[data-star-id]');
    if (star) return marcarDestacada(star.dataset.starHallazgo, star.dataset.starId);
    const img = e.target.closest('img[data-lightbox-url]');
    if (img) return abrirLightboxHallazgo(img.dataset.lightboxUrl);
    const btn = e.target.closest('button[data-delete-id]');
    if (btn) return eliminarFotoHallazgo(btn.dataset.deleteId, btn.dataset.deletePath);
});

document.getElementById('tabla-body').addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-fotos-hallazgo');
    if (btn) abrirModalFotosHallazgo(btn.dataset.hallazgoId);
});
document.getElementById('tabla-cards').addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-fotos-hallazgo');
    if (btn) abrirModalFotosHallazgo(btn.dataset.hallazgoId);
});

function abrirLightboxHallazgo(url) {
    document.getElementById('lightbox-hallazgo-img').src = url;
    const lb = document.getElementById('lightbox-hallazgo');
    lb.classList.remove('hidden');
    lb.classList.add('flex');
}
function cerrarLightboxHallazgo() {
    const lb = document.getElementById('lightbox-hallazgo');
    lb.classList.add('hidden');
    lb.classList.remove('flex');
    document.getElementById('lightbox-hallazgo-img').src = '';
}
document.getElementById('lightbox-hallazgo').addEventListener('click', cerrarLightboxHallazgo);

document.getElementById('btn-subir-foto-hallazgo').addEventListener('click', () => {
    if (!esAdminReal()) return;
    document.getElementById('foto-hallazgo-input').click();
});

async function subirArchivoFoto(file) {
    if (!esAdminReal()) return;
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Solo se permiten imágenes.'); return; }

    const hallazgoId = fotosHallazgoCtx.hallazgoId;
    if (!hallazgoId) return;

    const btn = document.getElementById('btn-subir-foto-hallazgo');
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Subiendo…';

    try {
        const blob = await comprimirImagenHallazgo(file);
        const path = `${hallazgoId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.jpg`;

        const { error: errUp } = await supabaseClient.storage
            .from('hallazgos-fotos')
            .upload(path, blob, { cacheControl: '31536000', upsert: false, contentType: 'image/jpeg' });
        if (errUp) throw errUp;

        const esLaPrimera = contarFotosHallazgo(hallazgoId) === 0;

        const { error: errIns } = await supabaseClient
            .from('imagenes_hallazgos')
            .insert({
                hallazgo_id: hallazgoId,
                nombre: file.name || `pegada-${Date.now()}.jpg`,
                storage_path: path,
                subido_por: usuarioActual?.nombre || null,
                destacada: esLaPrimera
            });

        if (errIns) {
            await supabaseClient.storage.from('hallazgos-fotos').remove([path]);
            throw errIns;
        }

        hallazgosConFotosConsultados.delete(hallazgoId);
        await cargarImagenesHallazgos([hallazgoId]);
        renderFotosHallazgoModal();
        actualizarContadoresFotosEnTabla();
        if (vistaActual === 'actos' && subVistaActos === 'indicadores') renderGridActos();

    } catch (err) {
        console.error(err);
        alert('No se pudo subir la foto.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = original;
    }
}

document.getElementById('foto-hallazgo-input').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const f of files) await subirArchivoFoto(f);
});

document.addEventListener('paste', async (e) => {
    const modal = document.getElementById('modal-fotos-hallazgo');
    if (!modal || modal.classList.contains('hidden')) return;
    if (!esAdminReal()) return;
    if (!fotosHallazgoCtx.hallazgoId) return;

    const items = (e.clipboardData && e.clipboardData.items) || [];
    const files = [];
    for (const it of items) {
        if (it.kind === 'file' && it.type.startsWith('image/')) {
            const f = it.getAsFile();
            if (f) files.push(f);
        }
    }
    if (files.length === 0) return;
    e.preventDefault();
    for (const f of files) await subirArchivoFoto(f);
});

async function eliminarFotoHallazgo(fotoId, storagePath) {
    if (!esAdminReal()) return;
    if (!confirm('¿Eliminar esta foto?')) return;

    const { error: errDel } = await supabaseClient.storage
        .from('hallazgos-fotos').remove([storagePath]);
    if (errDel) { console.error(errDel); alert('No se pudo eliminar el archivo.'); return; }

    await supabaseClient.from('imagenes_hallazgos').delete().eq('id', fotoId);

    imagenesHallazgosCache = imagenesHallazgosCache.filter(i => i.id !== fotoId);
    renderFotosHallazgoModal();
    actualizarContadoresFotosEnTabla();
    if (vistaActual === 'actos' && subVistaActos === 'indicadores') renderGridActos();
}

async function marcarDestacada(hallazgoId, fotoId) {
    if (!esAdminReal()) return;

    await supabaseClient
        .from('imagenes_hallazgos')
        .update({ destacada: false })
        .eq('hallazgo_id', hallazgoId);

    await supabaseClient
        .from('imagenes_hallazgos')
        .update({ destacada: true })
        .eq('id', fotoId);

    imagenesHallazgosCache.forEach(i => {
        if (i.hallazgo_id === hallazgoId) i.destacada = (i.id === fotoId);
    });

    renderFotosHallazgoModal();
    if (vistaActual === 'actos' && subVistaActos === 'indicadores') renderGridActos();
}

function suscribirRealtimeFotosHallazgos() {
    if (realtimeFotosActivo) return;
    realtimeFotosActivo = true;

    supabaseClient
        .channel('imagenes_hallazgos_rt')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'imagenes_hallazgos' },
            (payload) => {
                if (payload.eventType === 'INSERT' && payload.new) {
                    if (!imagenesHallazgosCache.some(i => i.id === payload.new.id)) {
                        imagenesHallazgosCache.push(payload.new);
                    }
                    hallazgosConFotosConsultados.add(payload.new.hallazgo_id);
                } else if (payload.eventType === 'UPDATE' && payload.new) {
                    const idx = imagenesHallazgosCache.findIndex(i => i.id === payload.new.id);
                    if (idx >= 0) imagenesHallazgosCache[idx] = payload.new;
                    else imagenesHallazgosCache.push(payload.new);
                } else if (payload.eventType === 'DELETE' && payload.old) {
                    imagenesHallazgosCache = imagenesHallazgosCache.filter(i => i.id !== payload.old.id);
                }
                actualizarContadoresFotosEnTabla();
                if (!document.getElementById('modal-fotos-hallazgo').classList.contains('hidden')) {
                    renderFotosHallazgoModal();
                }
                if (vistaActual === 'actos' && subVistaActos === 'indicadores') renderGridActos();
            })
        .subscribe();
}

// ==========================================
// 16. ACTOS INSEGUROS
// ==========================================
let actosTodosCache = null;
let actosDelMesCache = [];
let editarActoCtx = { hallazgoId: null };

const ANIO_ACTOS = 2026;
const ANIO_ACTOS_ANTERIOR = 2025;

async function cargarActosInseguros() {
    await cargarKPIActos();
    await cargarActosDelMes(mesActosSeleccionado);
}

function aplicarVisibilidadMesesKPI() {
    const hoy = new Date();
    const anioHoy = hoy.getFullYear();
    const mesHoy  = hoy.getMonth() + 1;

    let mesLimite = 12;
    if (anioHoy === ANIO_ACTOS) mesLimite = mesHoy;
    else if (anioHoy > ANIO_ACTOS) mesLimite = 12;

    for (let i = 1; i <= 12; i++) {
        const mostrar = i <= mesLimite;
        const th = document.querySelector(`[data-kpi-mes="${i}"]`);
        if (th) th.style.display = mostrar ? '' : 'none';
        document.querySelectorAll(`[data-kpi$="-${i}"]`).forEach(td => {
            td.style.display = mostrar ? '' : 'none';
        });
    }
}

async function cargarKPIActos() {
    const { data, error } = await supabaseClient
        .from('hallazgos')
        .select('"FECHA_ACONTECIMIENTO","ESTADO"')
        .eq('"DESC_EVENTO"', 'Acto Subestandar')
        .neq('"ESTADO"', 'Anulado')
        .range(0, 9999);

    if (error) { console.error('Error KPI actos:', error); return; }

    aplicarVisibilidadMesesKPI();

    const result = {
        2025:       Array(12).fill(0),
        iden2026:   Array(12).fill(0),
        cerr2026:   Array(12).fill(0),
        pct:        Array(12).fill(0)
    };

    (data || []).forEach(h => {
        const { anio, mes } = parsearFechaHallazgo(h.FECHA_ACONTECIMIENTO);
        if (!anio || !mes) return;
        const idx = mes - 1;
        if (anio === String(ANIO_ACTOS_ANTERIOR)) {
            result[2025][idx]++;
        } else if (anio === String(ANIO_ACTOS)) {
            result.iden2026[idx]++;
            if (h.ESTADO === 'Cerrado') result.cerr2026[idx]++;
        }
    });

    for (let i = 0; i < 12; i++) {
        result.pct[i] = result.iden2026[i] > 0
            ? (result.cerr2026[i] / result.iden2026[i]) * 100
            : 0;
    }

    for (let i = 1; i <= 12; i++) {
        setKpiText(`2025-${i}`, result[2025][i-1]);
        setKpiText(`iden-${i}`, result.iden2026[i-1]);
        setKpiText(`cerr-${i}`, result.cerr2026[i-1]);
        setKpiText(`pct-${i}`, result.pct[i-1].toFixed(1) + '%');
    }

    const total2025 = result[2025].reduce((a,b) => a+b, 0);
    const totalIden = result.iden2026.reduce((a,b) => a+b, 0);
    const totalCerr = result.cerr2026.reduce((a,b) => a+b, 0);
    const totalPct = totalIden > 0 ? (totalCerr / totalIden) * 100 : 0;

    setKpiText('2025-total', total2025);
    setKpiText('iden-total', totalIden);
    setKpiText('cerr-total', totalCerr);
    setKpiText('pct-total', totalPct.toFixed(1) + '%');
}

function setKpiText(key, valor) {
    const el = document.querySelector(`[data-kpi="${key}"]`);
    if (el) el.textContent = valor;
}

async function cargarActosDelMes(mes) {
    if (!actosTodosCache) {
        const { data, error } = await supabaseClient
            .from('hallazgos')
            .select('"COD_HALLAZGO","FECHA_ACONTECIMIENTO","DESC_SECCION","ACONTECIMIENTO","descripcion_acto"')
            .eq('"DESC_EVENTO"', 'Acto Subestandar')
            .neq('"ESTADO"', 'Anulado')
            .order('"FECHA_ACONTECIMIENTO"', { ascending: true });

        if (error) {
            console.error('Error cargando actos:', error);
            document.getElementById('grid-actos').innerHTML =
                `<div class="col-span-full text-center py-12 text-red-500 text-sm">Error: ${error.message}</div>`;
            return;
        }
        actosTodosCache = data || [];
    }

    actosDelMesCache = actosTodosCache.filter(a => {
        const { anio, mes: m } = parsearFechaHallazgo(a.FECHA_ACONTECIMIENTO);
        return anio === String(anioActosSeleccionado) && m === mes;
    });

    const ids = actosDelMesCache.map(a => a.COD_HALLAZGO).filter(Boolean);
    if (ids.length > 0) await cargarImagenesHallazgos(ids);

    renderGridActos();
}

function renderGridActos() {
    const cont = document.getElementById('grid-actos');
    if (!cont) return;

    if (actosDelMesCache.length === 0) {
        cont.innerHTML = `<div class="col-span-full text-center py-12 text-slate-400 text-sm">No hay actos inseguros registrados en ${nombreMes(mesActosSeleccionado)} ${anioActosSeleccionado}.</div>`;
        return;
    }

    const admin = esAdminReal();
    cont.innerHTML = '';

    actosDelMesCache.forEach(acto => {
        const codigo = acto.COD_HALLAZGO;
        const foto = obtenerFotoDestacada(codigo);
        const url = foto ? urlFotoHallazgo(foto.storage_path) : null;
        const texto = acto.descripcion_acto || acto.ACONTECIMIENTO || '(Sin descripción)';

        const card = document.createElement('div');
        card.className = 'acto-card';
        card.dataset.hallazgoId = codigo;

        card.innerHTML = `
            <div class="acto-card-foto" data-foto-url="${url ? escaparAttr(url) : ''}">
                ${url
                    ? `<img src="${escaparAttr(url)}" alt="${escaparAttr(codigo)}" loading="lazy" decoding="async">`
                    : `<div class="w-full h-full flex items-center justify-center text-slate-300">
                          <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                          </svg>
                       </div>`
                }
                ${admin ? `
                    <button type="button" class="acto-card-btn-edit" data-action="fotos" title="Gestionar fotos">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                        </svg>
                    </button>
                ` : ''}
            </div>
            <div class="p-3 sm:p-4">
                <p class="text-[10px] font-bold text-emerald-700 tracking-wider uppercase mb-1">${escaparHTML(codigo)}</p>
                <p class="acto-card-hint-editable text-xs text-slate-700 leading-relaxed"
                   data-action="${admin ? 'editar' : 'nada'}"
                   data-hallazgo-id="${escaparAttr(codigo)}">${escaparHTML(texto)}</p>
            </div>
        `;

        card.querySelector('.acto-card-foto').addEventListener('click', (e) => {
            if (e.target.closest('[data-action="fotos"]')) return;
            if (url) abrirLightboxHallazgo(url);
        });

        const btnFotos = card.querySelector('[data-action="fotos"]');
        if (btnFotos) {
            btnFotos.addEventListener('click', (e) => {
                e.stopPropagation();
                abrirModalFotosHallazgo(codigo);
            });
        }

        const pTexto = card.querySelector('[data-action="editar"]');
        if (pTexto) {
            pTexto.addEventListener('click', () => abrirModalEditarActo(codigo, texto));
        }

        cont.appendChild(card);
    });
}

function obtenerFotoDestacada(hallazgoId) {
    const fotos = imagenesHallazgosCache.filter(i => i.hallazgo_id === hallazgoId);
    if (fotos.length === 0) return null;
    const destacada = fotos.find(f => f.destacada === true);
    return destacada || fotos[0];
}

// ==========================================
// 17. MODAL EDITAR TEXTO + FALTAS
// ==========================================
let catalogoFaltasCache = [];
let faltasDelActoActual = [];

async function abrirModalEditarActo(hallazgoId, textoActual) {
    if (!esAdminReal()) return;
    editarActoCtx.hallazgoId = hallazgoId;
    document.getElementById('editar-acto-texto').value = textoActual || '';

    if (catalogoFaltasCache.length === 0) await cargarCatalogoFaltas();

    faltasDelActoActual = await cargarFaltasDelActo(hallazgoId);
    renderChipsFaltas();

    const inp = document.getElementById('falta-buscar');
    inp.value = '';
    document.getElementById('falta-sugerencias').classList.add('hidden');

    const m = document.getElementById('modal-editar-acto');
    m.classList.remove('hidden');
    m.classList.add('flex');
    setTimeout(() => document.getElementById('editar-acto-texto').focus(), 50);
}

function cerrarModalEditarActo() {
    const m = document.getElementById('modal-editar-acto');
    m.classList.add('hidden');
    m.classList.remove('flex');
    editarActoCtx.hallazgoId = null;
    faltasDelActoActual = [];
}

document.getElementById('btn-guardar-acto').addEventListener('click', async () => {
    if (!esAdminReal()) return;
    const hallazgoId = editarActoCtx.hallazgoId;
    if (!hallazgoId) return;

    const nuevoTexto = document.getElementById('editar-acto-texto').value.trim();

    const { error } = await supabaseClient
        .from('hallazgos')
        .update({ descripcion_acto: nuevoTexto || null })
        .eq('COD_HALLAZGO', hallazgoId);

    if (error) {
        console.error(error);
        alert('No se pudo guardar el texto.');
        return;
    }

    const acto = actosDelMesCache.find(a => a.COD_HALLAZGO === hallazgoId);
    if (acto) acto.descripcion_acto = nuevoTexto || null;
    if (actosTodosCache) {
        const a2 = actosTodosCache.find(a => a.COD_HALLAZGO === hallazgoId);
        if (a2) a2.descripcion_acto = nuevoTexto || null;
    }

    cerrarModalEditarActo();
    renderGridActos();
});

async function cargarCatalogoFaltas() {
    const { data, error } = await supabaseClient
        .from('catalogo_faltas')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
    if (error) { console.error(error); return; }
    catalogoFaltasCache = data || [];
}

function buscarFaltas(query) {
    const q = normalizarTexto(query || '');
    const base = q
        ? catalogoFaltasCache.filter(f => normalizarTexto(f.nombre).includes(q))
        : catalogoFaltasCache;
    return base.slice(0, 30);
}

async function cargarFaltasDelActo(hallazgoId) {
    const { data, error } = await supabaseClient
        .from('hallazgo_faltas')
        .select('falta_id, catalogo_faltas(id, nombre)')
        .eq('hallazgo_id', hallazgoId);
    if (error) { console.error(error); return []; }
    return (data || []).map(d => ({
        falta_id: d.falta_id,
        nombre: d.catalogo_faltas?.nombre || `Falta #${d.falta_id}`
    }));
}

async function agregarFaltaAlActo(hallazgoId, faltaId) {
    const { error } = await supabaseClient
        .from('hallazgo_faltas')
        .insert({ hallazgo_id: hallazgoId, falta_id: faltaId });
    if (error && !String(error.message || '').includes('duplicate')) {
        console.error(error); return false;
    }
    return true;
}

async function quitarFaltaDelActo(hallazgoId, faltaId) {
    const { error } = await supabaseClient
        .from('hallazgo_faltas')
        .delete()
        .eq('hallazgo_id', hallazgoId)
        .eq('falta_id', faltaId);
    if (error) { console.error(error); return false; }
    return true;
}

async function crearFaltaNueva(nombre) {
    const limpio = nombre.trim();
    if (!limpio) return null;
    const { data, error } = await supabaseClient
        .from('catalogo_faltas')
        .insert({ nombre: limpio, activo: true })
        .select()
        .single();
    if (error) { console.error(error); return null; }
    catalogoFaltasCache.push(data);
    catalogoFaltasCache.sort((a, b) => a.nombre.localeCompare(b.nombre));
    return data;
}

function renderChipsFaltas() {
    const cont = document.getElementById('faltas-chips');
    if (!cont) return;
    if (faltasDelActoActual.length === 0) {
        cont.innerHTML = '<p class="text-xs text-slate-400 italic">Sin faltas asignadas</p>';
        return;
    }
    cont.innerHTML = faltasDelActoActual.map(f => `
        <span class="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold px-2.5 py-1 rounded-full">
            ${escaparHTML(f.nombre)}
            <button type="button" data-quitar-falta="${f.falta_id}" class="text-emerald-600 hover:text-red-600 leading-none text-sm" title="Quitar">×</button>
        </span>
    `).join('');
    cont.querySelectorAll('[data-quitar-falta]').forEach(btn => {
        btn.addEventListener('click', () => quitarFaltaUI(parseInt(btn.dataset.quitarFalta)));
    });
}

async function quitarFaltaUI(faltaId) {
    const hallazgoId = editarActoCtx.hallazgoId;
    if (!hallazgoId) return;
    if (!confirm('¿Quitar esta falta del acto?')) return;
    const ok = await quitarFaltaDelActo(hallazgoId, faltaId);
    if (ok) {
        faltasDelActoActual = faltasDelActoActual.filter(f => f.falta_id !== faltaId);
        renderChipsFaltas();
    }
}

function renderSugerenciasFaltas(query) {
    const box = document.getElementById('falta-sugerencias');
    const yaAsignadas = new Set(faltasDelActoActual.map(f => f.falta_id));
    const coincidencias = buscarFaltas(query).filter(f => !yaAsignadas.has(f.id));

    let html = '';
    coincidencias.forEach(f => {
        html += `<button type="button" data-add-falta="${f.id}"
            class="w-full text-left px-4 py-2.5 hover:bg-emerald-50 text-sm border-b border-slate-100 last:border-0 transition">
            ${escaparHTML(f.nombre)}
        </button>`;
    });

    const q = (query || '').trim();
    const existeExacta = q && catalogoFaltasCache.some(f => normalizarTexto(f.nombre) === normalizarTexto(q));
    if (q && !existeExacta) {
        html += `<button type="button" data-crear-falta="1"
            class="w-full text-left px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-sm border-t-2 border-emerald-200 text-emerald-800 font-semibold flex items-center gap-2 transition">
            <span class="text-base leading-none">＋</span> Crear nueva: "${escaparHTML(q)}"
        </button>`;
    }

    if (!html) {
        box.classList.add('hidden');
        return;
    }
    box.innerHTML = html;
    box.classList.remove('hidden');

    box.querySelectorAll('[data-add-falta]').forEach(btn => {
        btn.addEventListener('click', () => asignarFaltaUI(parseInt(btn.dataset.addFalta)));
    });
    const btnCrear = box.querySelector('[data-crear-falta]');
    if (btnCrear) btnCrear.addEventListener('click', () => crearFaltaUI(query));
}

async function asignarFaltaUI(faltaId) {
    const hallazgoId = editarActoCtx.hallazgoId;
    if (!hallazgoId) return;
    const ok = await agregarFaltaAlActo(hallazgoId, faltaId);
    if (!ok) { alert('No se pudo asignar la falta.'); return; }
    const falta = catalogoFaltasCache.find(f => f.id === faltaId);
    if (falta && !faltasDelActoActual.some(f => f.falta_id === faltaId)) {
        faltasDelActoActual.push({ falta_id: faltaId, nombre: falta.nombre });
    }
    renderChipsFaltas();
    document.getElementById('falta-buscar').value = '';
    document.getElementById('falta-sugerencias').classList.add('hidden');
}

async function crearFaltaUI(query) {
    const nombre = (query || '').trim();
    if (!nombre) return;
    const nueva = await crearFaltaNueva(nombre);
    if (!nueva) { alert('No se pudo crear la falta.'); return; }
    await asignarFaltaUI(nueva.id);
}

(function initAutocompleteFaltas() {
    const inp = document.getElementById('falta-buscar');
    const box = document.getElementById('falta-sugerencias');
    if (!inp) return;

    inp.addEventListener('input', () => renderSugerenciasFaltas(inp.value));
    inp.addEventListener('focus', () => renderSugerenciasFaltas(inp.value));

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#falta-buscar') && !e.target.closest('#falta-sugerencias')) {
            box.classList.add('hidden');
        }
    });
})();

// ==========================================
// 18. RANKING DE FALTAS
// ==========================================
async function cargarRankingFaltas() {
    const tbody = document.getElementById('ranking-faltas-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="text-center py-12 text-slate-400 text-sm">Cargando…</td></tr>';

    const { data: actos, error: errA } = await supabaseClient
        .from('hallazgos')
        .select('"COD_HALLAZGO"')
        .eq('"DESC_EVENTO"', 'Acto Subestandar')
        .neq('"ESTADO"', 'Anulado')
        .like('"FECHA_ACONTECIMIENTO"', '%/2026%');

    if (errA) { console.error(errA); renderRankingFaltas([]); return; }

    const ids = (actos || []).map(a => a.COD_HALLAZGO).filter(Boolean);
    if (ids.length === 0) { renderRankingFaltas([]); return; }

    const { data, error } = await supabaseClient
        .from('hallazgo_faltas')
        .select('falta_id, catalogo_faltas(nombre)')
        .in('hallazgo_id', ids);

    if (error) { console.error(error); renderRankingFaltas([]); return; }

    const conteo = {};
    (data || []).forEach(r => {
        const id = r.falta_id;
        const nombre = r.catalogo_faltas?.nombre || `Falta #${id}`;
        if (!conteo[id]) conteo[id] = { falta_id: id, nombre, cantidad: 0 };
        conteo[id].cantidad++;
    });

    const ranking = Object.values(conteo).sort((a, b) => b.cantidad - a.cantidad);
    renderRankingFaltas(ranking);
}

function renderRankingFaltas(ranking) {
    const tbody = document.getElementById('ranking-faltas-body');
    const sub = document.getElementById('ranking-subtitulo');
    if (!tbody) return;

    if (ranking.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-12 text-slate-400 text-sm">Aún no hay faltas etiquetadas en actos de 2026.</td></tr>`;
        if (sub) sub.textContent = 'Sin datos';
        return;
    }

    const total = ranking.reduce((acc, r) => acc + r.cantidad, 0);
    if (sub) sub.textContent = `${total} etiqueta${total !== 1 ? 's' : ''} en ${ranking.length} falta${ranking.length !== 1 ? 's' : ''} distinta${ranking.length !== 1 ? 's' : ''} · Clic en una falta para ver/editar su medida de acción`;

    tbody.innerHTML = ranking.map((r, i) => {
        const pct = total > 0 ? (r.cantidad / total) * 100 : 0;
        return `
            <tr class="hover:bg-emerald-50/40 cursor-pointer transition"
                data-falta-id="${r.falta_id}"
                data-falta-nombre="${escaparAttr(r.nombre)}"
                data-falta-cant="${r.cantidad}">
                <td class="px-4 py-3 text-slate-500 font-semibold">${i + 1}</td>
                <td class="px-4 py-3 text-slate-800 font-medium">${escaparHTML(r.nombre)}</td>
                <td class="px-4 py-3 text-center font-bold text-slate-900">${r.cantidad}</td>
                <td class="px-4 py-3 text-center text-slate-600 text-xs">${pct.toFixed(1)}%</td>
                <td class="px-4 py-3">
                    <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div class="h-full bg-emerald-500 rounded-full" style="width:${pct}%"></div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('tr[data-falta-id]').forEach(tr => {
        tr.addEventListener('click', () => {
            abrirModalMedidaAccion(
                parseInt(tr.dataset.faltaId),
                tr.dataset.faltaNombre,
                parseInt(tr.dataset.faltaCant)
            );
        });
    });
}

// ==========================================
// 19. MEDIDA DE ACCIÓN POR FALTA
// ==========================================
let medidaAccionCtx = { faltaId: null, faltaNombre: '', cantidad: 0 };
let medidaFotosCache = [];
let realtimeMedidaFotosActivo = false;

function urlFotoMedida(path) {
    const { data } = supabaseClient.storage.from('medidas-accion').getPublicUrl(path);
    return data.publicUrl;
}

async function abrirModalMedidaAccion(faltaId, faltaNombre, cantidad) {
    medidaAccionCtx = { faltaId, faltaNombre, cantidad };

    document.getElementById('modal-medida-titulo').textContent = faltaNombre;
    document.getElementById('modal-medida-sub').textContent =
        cantidad === 1 ? '1 incidencia en 2026' : `${cantidad} incidencias en 2026`;

    const m = document.getElementById('modal-medida-accion');
    m.classList.remove('hidden');
    m.classList.add('flex');

    const admin = esAdminReal();
    const ta = document.getElementById('medida-accion-texto');
    const btnGuardar = document.getElementById('btn-guardar-medida');
    const btnSubir = document.getElementById('btn-subir-medida-foto');

    ta.readOnly = !admin;
    ta.classList.toggle('bg-slate-100', !admin);
    ta.classList.toggle('cursor-not-allowed', !admin);
    btnGuardar.classList.toggle('hidden', !admin);
    btnSubir.classList.toggle('hidden', !admin);

    await cargarMedidaAccion(faltaId);
}

function cerrarModalMedidaAccion() {
    const m = document.getElementById('modal-medida-accion');
    m.classList.add('hidden');
    m.classList.remove('flex');
    medidaAccionCtx = { faltaId: null, faltaNombre: '', cantidad: 0 };
    medidaFotosCache = [];
}

async function cargarMedidaAccion(faltaId) {
    const { data: catalogo, error: errCat } = await supabaseClient
        .from('catalogo_faltas')
        .select('medida_accion')
        .eq('id', faltaId)
        .maybeSingle();

    if (errCat) console.error(errCat);
    const texto = catalogo?.medida_accion || '';
    document.getElementById('medida-accion-texto').value = texto;
    document.getElementById('medida-accion-vacio').classList.toggle('hidden', !!texto);

    await cargarFotosMedida(faltaId);
    renderMedidaFotos();
}

async function cargarFotosMedida(faltaId) {
    const { data, error } = await supabaseClient
        .from('medida_accion_fotos')
        .select('id, falta_id, nombre, storage_path, subido_por, created_at')
        .eq('falta_id', faltaId)
        .order('created_at', { ascending: false });

    if (error) { console.error(error); medidaFotosCache = []; return; }
    medidaFotosCache = data || [];
}

function renderMedidaFotos() {
    const cont = document.getElementById('medida-fotos-grid');
    if (!cont) return;

    if (medidaFotosCache.length === 0) {
        cont.innerHTML = `<p class="col-span-full text-xs text-slate-400 italic">Sin evidencia fotográfica.</p>`;
        return;
    }

    const admin = esAdminReal();
    cont.innerHTML = '';
    medidaFotosCache.forEach((f, idx) => {
        const url = urlFotoMedida(f.storage_path);
        const item = document.createElement('div');
        item.className = 'relative aspect-square rounded-xl overflow-hidden bg-slate-100 group';
        item.innerHTML = `
            <img src="${url}"
                 alt="${escaparAttr(f.nombre)}"
                 loading="${idx === 0 ? 'eager' : 'lazy'}"
                 decoding="async"
                 class="w-full h-full object-cover cursor-zoom-in transition group-hover:scale-105"
                 data-medida-lightbox-url="${escaparAttr(url)}">
            ${admin ? `
                <button type="button"
                        class="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-slate-900/70 hover:bg-red-600 text-white flex items-center justify-center text-[10px] backdrop-blur-sm transition"
                        data-medida-delete-id="${escaparAttr(f.id)}"
                        data-medida-delete-path="${escaparAttr(f.storage_path)}"
                        title="Eliminar">✕</button>
            ` : ''}
        `;
        cont.appendChild(item);
    });
}

document.getElementById('medida-fotos-grid')?.addEventListener('click', (e) => {
    const img = e.target.closest('img[data-medida-lightbox-url]');
    if (img) return abrirLightboxHallazgo(img.dataset.medidaLightboxUrl);
    const btn = e.target.closest('button[data-medida-delete-id]');
    if (btn) return eliminarFotoMedida(btn.dataset.medidaDeleteId, btn.dataset.medidaDeletePath);
});

document.getElementById('btn-guardar-medida')?.addEventListener('click', async () => {
    if (!esAdminReal()) return;
    const faltaId = medidaAccionCtx.faltaId;
    if (!faltaId) return;

    const texto = document.getElementById('medida-accion-texto').value.trim();

    const { error } = await supabaseClient
        .from('catalogo_faltas')
        .update({ medida_accion: texto || null })
        .eq('id', faltaId);

    if (error) { console.error(error); alert('No se pudo guardar la medida.'); return; }

    document.getElementById('medida-accion-vacio').classList.toggle('hidden', !!texto);
    cerrarModalMedidaAccion();
});

document.getElementById('btn-subir-medida-foto')?.addEventListener('click', () => {
    if (!esAdminReal()) return;
    document.getElementById('medida-foto-input').click();
});

document.getElementById('medida-foto-input')?.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const f of files) await subirArchivoMedidaFoto(f);
});

async function subirArchivoMedidaFoto(file) {
    if (!esAdminReal()) return;
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Solo se permiten imágenes.'); return; }

    const faltaId = medidaAccionCtx.faltaId;
    if (!faltaId) return;

    const btn = document.getElementById('btn-subir-medida-foto');
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Subiendo…';

    try {
        const blob = await comprimirImagenHallazgo(file);
        const path = `falta-${faltaId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.jpg`;

        const { error: errUp } = await supabaseClient.storage
            .from('medidas-accion')
            .upload(path, blob, { cacheControl: '31536000', upsert: false, contentType: 'image/jpeg' });
        if (errUp) throw errUp;

        const { error: errIns } = await supabaseClient
            .from('medida_accion_fotos')
            .insert({
                falta_id: faltaId,
                nombre: file.name || `pegada-${Date.now()}.jpg`,
                storage_path: path,
                subido_por: usuarioActual?.nombre || null
            });

        if (errIns) {
            await supabaseClient.storage.from('medidas-accion').remove([path]);
            throw errIns;
        }

        await cargarFotosMedida(faltaId);
        renderMedidaFotos();

    } catch (err) {
        console.error(err);
        alert('No se pudo subir la foto.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = original;
    }
}

document.addEventListener('paste', async (e) => {
    const modal = document.getElementById('modal-medida-accion');
    if (!modal || modal.classList.contains('hidden')) return;
    if (!esAdminReal()) return;
    if (!medidaAccionCtx.faltaId) return;

    const items = (e.clipboardData && e.clipboardData.items) || [];
    const files = [];
    for (const it of items) {
        if (it.kind === 'file' && it.type.startsWith('image/')) {
            const f = it.getAsFile();
            if (f) files.push(f);
        }
    }
    if (files.length === 0) return;
    e.preventDefault();
    for (const f of files) await subirArchivoMedidaFoto(f);
});

async function eliminarFotoMedida(fotoId, storagePath) {
    if (!esAdminReal()) return;
    if (!confirm('¿Eliminar esta foto?')) return;

    const { error: errDel } = await supabaseClient.storage
        .from('medidas-accion').remove([storagePath]);
    if (errDel) { console.error(errDel); alert('No se pudo eliminar el archivo.'); return; }

    await supabaseClient.from('medida_accion_fotos').delete().eq('id', fotoId);
    await cargarFotosMedida(medidaAccionCtx.faltaId);
    renderMedidaFotos();
}

function suscribirRealtimeMedidaFotos() {
    if (realtimeMedidaFotosActivo) return;
    realtimeMedidaFotosActivo = true;

    supabaseClient
        .channel('medida_accion_fotos_rt')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'medida_accion_fotos' },
            async (payload) => {
                const faltaAfectada = payload.new?.falta_id || payload.old?.falta_id;
                if (!faltaAfectada) return;
                if (faltaAfectada === medidaAccionCtx.faltaId) {
                    await cargarFotosMedida(faltaAfectada);
                    renderMedidaFotos();
                }
            })
        .subscribe();
}
// ==========================================
// 20. MÓDULO RRLL (Relaciones Laborales)
// ==========================================
async function iniciarPanelRRLL() {
    document.getElementById('pantalla-login').classList.add('hidden');
    document.getElementById('app-principal').classList.add('hidden');
    document.getElementById('panel-relaciones').classList.remove('hidden');
    document.getElementById('relaciones-usuario-actual').textContent = NOMBRE_RRLL;

    const fondo = document.querySelector('.fondo-animado');
    if (fondo) fondo.style.display = 'none';

    await cargarCatalogoFaltasRRLL();
    await cargarFeriados();
    await autoAvanzarCasosVencidos();
    await cargarTablaRRLL();
    await cargarPanelAvisos();
}

async function cargarCatalogoFaltasRRLL() {
    const { data, error } = await supabaseClient
        .from('catalogo_faltas')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
    if (error) { console.error(error); return; }
    rrllCatalogoFaltas = data || [];
}

async function cargarFeriados() {
    const { data, error } = await supabaseClient.from('feriados').select('fecha');
    if (error) { console.error(error); return; }
    rrllFeriados = (data || []).map(f => f.fecha);
}

async function autoAvanzarCasosVencidos() {
    try {
        const { data, error } = await supabaseClient
            .from('relaciones_casos')
            .select('*')
            .eq('paso_actual', 3)
            .is('descargo', null);
        if (error || !data) return;
        const hoy = new Date();
        for (const caso of data) {
            if (!caso.fecha_emision_1) continue;
            const emision = new Date(caso.fecha_emision_1);
            const dias = contarDiasHabilesDesde(emision, hoy);
            if (dias >= RRLL_DIAS_DESCARGO) {
                await supabaseClient.from('relaciones_casos').update({
                    descargo: 'sin', paso_actual: 4, updated_at: new Date().toISOString()
                }).eq('id', caso.id);
            }
        }
    } catch (err) { console.error('Error auto-avance:', err); }
}

function contarDiasHabilesDesde(inicio, fin) {
    let contador = 0;
    const cursor = new Date(inicio);
    cursor.setHours(0,0,0,0);
    const finCopia = new Date(fin);
    finCopia.setHours(0,0,0,0);
    while (cursor < finCopia) {
        cursor.setDate(cursor.getDate() + 1);
        if (esDiaHabil(cursor)) contador++;
        if (contador > 60) break;
    }
    return contador;
}

async function cargarTablaRRLL() {
    try {
        const offset = (rrllPaginaActual - 1) * rrllRegistrosPorPagina;
        const [anioIni, mesIni] = RRLL_FECHA_INICIO.split('-');
        const sufijoFecha = `/${mesIni}/${anioIni}`;

        let q = supabaseClient.from('hallazgos')
            .select('"COD_HALLAZGO","FECHA_ACONTECIMIENTO","DESC_AREA","DESC_SECCION","ACONTECIMIENTO","TRABAJADOR","NRO_DOC"', { count: 'exact' })
            .neq('"ESTADO"', 'Anulado')
            .eq('"DESC_EVENTO"', RRLL_DESC_EVENTO)
            .eq('"DESC_EMPRESA"', RRLL_DESC_EMPRESA)
            .like('"FECHA_ACONTECIMIENTO"', `%${sufijoFecha}%`);

        if (rrllSearchTerm) {
            q = q.or(`"TRABAJADOR".ilike.%${rrllSearchTerm}%,"NRO_DOC".ilike.%${rrllSearchTerm}%,"ACONTECIMIENTO".ilike.%${rrllSearchTerm}%`);
        }

        const { data, count, error } = await q
            .order('"FECHA_ACONTECIMIENTO"', { ascending: false })
            .range(offset, offset + rrllRegistrosPorPagina - 1);

        if (error) throw error;

        const total = count || 0;
        rrllTotalPaginas = Math.ceil(total / rrllRegistrosPorPagina) || 1;

        const elContador = document.getElementById('relaciones-contador');
        if (elContador) elContador.textContent = total.toLocaleString();

        const tbody = document.getElementById('relaciones-tabla-body');

        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center py-12 text-slate-400 text-sm">No se encontraron actos desde Septiembre 2026</td></tr>`;
            return;
        }
        const hallazgoIds = data.map(h => h.COD_HALLAZGO);
        const { data: casos } = await supabaseClient
            .from('relaciones_casos')
            .select('*')
            .in('hallazgo_id', hallazgoIds);

        const casosMap = {};
        (casos || []).forEach(c => { casosMap[c.hallazgo_id] = c; });
        const { data: faltasData } = await supabaseClient
            .from('hallazgo_faltas')
            .select('hallazgo_id, catalogo_faltas(nombre)')
            .in('hallazgo_id', hallazgoIds);

        const faltasMap = {};
        (faltasData || []).forEach(r => {
            if (!faltasMap[r.hallazgo_id]) faltasMap[r.hallazgo_id] = [];
            const nombre = r.catalogo_faltas?.nombre || '';
            if (nombre) faltasMap[r.hallazgo_id].push(nombre);
        });
        tbody.innerHTML = data.map(h => {
            const caso = casosMap[h.COD_HALLAZGO] || null;
            const faltasArr = faltasMap[h.COD_HALLAZGO] || [];
            const faltaHtml = faltasArr.length > 0
                ? faltasArr.map(f => `<div>${escaparHTML(f)}</div>`).join('')
                : '<span class="text-slate-300 text-xs">—</span>';
            const estado = caso ? obtenerNombrePaso(caso) : 'Sin iniciar';
            const dias = calcularDiasHabilesRestantes(caso);

            let diasHtml;
            if (!dias || dias.cerrado || dias.restantes === 0) diasHtml = '<span class="text-slate-300 text-xs">—</span>';
            else if (dias.vence) diasHtml = '<span class="inline-flex items-center gap-1 bg-red-50 text-red-700 px-2 py-1 rounded-md text-[11px] font-bold">⚠️ Vencido</span>';
            else if (dias.restantes <= 5) diasHtml = `<span class="inline-flex items-center gap-1 bg-red-50 text-red-700 px-2 py-1 rounded-md text-[11px] font-bold">${dias.restantes} días</span>`;
            else if (dias.restantes <= 10) diasHtml = `<span class="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-1 rounded-md text-[11px] font-semibold">${dias.restantes} días</span>`;
            else diasHtml = `<span class="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-1 rounded-md text-[11px] font-semibold">${dias.restantes} días</span>`;

            return `<tr class="row-hover transition cursor-pointer" data-hallazgo-id="${escaparAttr(h.COD_HALLAZGO)}">
    <td class="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">${escaparHTML(h.FECHA_ACONTECIMIENTO) || '-'}</td>
    <td class="px-4 py-3 text-slate-700 text-xs whitespace-nowrap">
        ${h.TRABAJADOR
            ? `<button type="button"
                       class="btn-historial-trabajador text-left font-semibold text-slate-800 hover:text-blue-700 hover:underline transition"
                       data-worker-name="${escaparAttr(h.TRABAJADOR)}"
                       data-worker-dni="${escaparAttr(h.NRO_DOC || '')}"
                       title="Ver historial de faltas">${escaparHTML(h.TRABAJADOR)}</button>`
            : '-'}
    </td>
    <td class="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">${escaparHTML(h.NRO_DOC) || '-'}</td>
    <td class="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">${escaparHTML(embellecer(h.DESC_AREA)) || '-'}</td>
    <td class="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">${escaparHTML(embellecer(h.DESC_SECCION)) || '-'}</td>
    <td class="px-4 py-3 text-slate-600 text-xs" style="max-width:300px;">${escaparHTML((h.ACONTECIMIENTO || '-').substring(0, 80))}${(h.ACONTECIMIENTO || '').length > 80 ? '...' : ''}</td>
    <td class="px-4 py-3 text-slate-700 text-xs" style="max-width:280px;">${faltaHtml}</td>
    <td class="px-4 py-3 text-xs whitespace-nowrap">${escaparHTML(estado)}</td>
    <td class="px-4 py-3 whitespace-nowrap">${diasHtml}</td>
</tr>`;
        }).join('');
        requestAnimationFrame(sincronizarScrollHorizontalRRLL);
    } catch (error) { console.error('❌ Error tabla RRLL:', error.message); }
}

function sincronizarScrollHorizontalRRLL() {
    const wrapper = document.getElementById('rrll-table-wrapper');
    const track   = document.getElementById('rrll-hscroll');
    const thumb   = document.getElementById('rrll-hscroll-thumb');
    if (!wrapper || !track || !thumb) return;

    const updateThumb = () => {
        const trackWidth   = track.clientWidth;
        const contentWidth = wrapper.scrollWidth;
        const visibleWidth = wrapper.clientWidth;

        if (contentWidth <= visibleWidth) {
            track.style.display = 'none';
            return;
        }
        track.style.display = '';

        const thumbWidth   = Math.max(30, (visibleWidth / contentWidth) * trackWidth);
        const maxScroll    = contentWidth - visibleWidth;
        const maxThumbLeft = trackWidth - thumbWidth;
        const ratio        = maxScroll > 0 ? wrapper.scrollLeft / maxScroll : 0;

        thumb.style.width = thumbWidth + 'px';
        thumb.style.left  = (ratio * maxThumbLeft) + 'px';
    };

    updateThumb();

    if (!track.dataset.sincronizado) {
        wrapper.addEventListener('scroll', updateThumb, { passive: true });
        window.addEventListener('resize', updateThumb);

        let dragging = false, startX = 0, startScrollLeft = 0;
        thumb.addEventListener('mousedown', (e) => {
            dragging = true;
            thumb.classList.add('dragging');
            startX = e.clientX;
            startScrollLeft = wrapper.scrollLeft;
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const dx           = e.clientX - startX;
            const trackWidth   = track.clientWidth;
            const thumbWidth   = thumb.offsetWidth;
            const maxThumbLeft = trackWidth - thumbWidth;
            const maxScroll    = wrapper.scrollWidth - wrapper.clientWidth;
            const ratio        = maxThumbLeft > 0 ? (dx / maxThumbLeft) : 0;
            wrapper.scrollLeft = startScrollLeft + (ratio * maxScroll);
        });
        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            thumb.classList.remove('dragging');
        });

        track.addEventListener('click', (e) => {
            if (e.target === thumb) return;
            const rect         = track.getBoundingClientRect();
            const clickX       = e.clientX - rect.left;
            const thumbWidth   = thumb.offsetWidth;
            const trackWidth   = track.clientWidth;
            const maxScroll    = wrapper.scrollWidth - wrapper.clientWidth;
            const maxThumbLeft = trackWidth - thumbWidth;
            const targetLeft   = Math.max(0, Math.min(maxThumbLeft, clickX - thumbWidth / 2));
            const ratio        = maxThumbLeft > 0 ? (targetLeft / maxThumbLeft) : 0;
            wrapper.scrollLeft = ratio * maxScroll;
        });

        track.dataset.sincronizado = '1';
    }
}

async function cargarPanelAvisos() {
    try {
        const { data, error } = await supabaseClient
            .from('relaciones_casos')
            .select('*')
            .eq('paso_actual', 4)
            .eq('descargo', 'sin')
            .is('fecha_emision_2', null);
        if (error || !data) return;

        const panel = document.getElementById('relaciones-avisos');
        const lista = document.getElementById('relaciones-avisos-lista');
        const contador = document.getElementById('relaciones-avisos-contador');

        if (data.length === 0) { panel.classList.add('hidden'); return; }

        const ids = data.map(v => v.hallazgo_id);
        const { data: hallazgos } = await supabaseClient
            .from('hallazgos')
            .select('"COD_HALLAZGO","TRABAJADOR","NRO_DOC","DESC_AREA"')
            .in('"COD_HALLAZGO"', ids);

        const hallazgosMap = {};
        (hallazgos || []).forEach(h => { hallazgosMap[h.COD_HALLAZGO] = h; });

        contador.textContent = data.length;
        lista.innerHTML = data.map(c => {
            const h = hallazgosMap[c.hallazgo_id] || {};
            return `<div class="bg-white border border-amber-200 rounded-lg p-3 flex justify-between items-center gap-3 cursor-pointer hover:bg-amber-50 transition" onclick="abrirDrawerRRLL('${escaparAttr(c.hallazgo_id)}')">
                <div class="flex-1 min-w-0">
                    <p class="text-xs font-bold text-slate-800 truncate">${escaparHTML(h.TRABAJADOR) || 'Trabajador'}</p>
                    <p class="text-[11px] text-slate-500 truncate">DNI: ${escaparHTML(h.NRO_DOC) || '-'} · ${escaparHTML(embellecer(h.DESC_AREA)) || '-'}</p>
                </div>
                <div class="text-right shrink-0">
                    <p class="text-[10px] text-amber-700 font-semibold">SIN DESCARGO</p>
                    <p class="text-[10px] text-slate-500">${formatearFecha(c.fecha_emision_1)}</p>
                </div>
            </div>`;
        }).join('');
        panel.classList.remove('hidden');
    } catch (err) { console.error('Error panel avisos:', err); }
}

// ==========================================
// HELPERS DE CARTAS RRLL
// ==========================================
function obtenerInfoCartas(caso) {
    const extras = Array.isArray(caso.cartas_adicionales) ? caso.cartas_adicionales : [];
    const cartas = [];
    if (caso.fecha_emision_2) {
        cartas.push({
            numero: 2,
            emision: caso.fecha_emision_2,
            recepcion: caso.fecha_recepcion_2,
            destinatario: caso.cargo_2_destinatario,
            url: caso.cargo_2_url,
            tipo: 'segunda'
        });
    }
    extras.forEach((e, idx) => {
        cartas.push({
            numero: e.numero,
            emision: e.fecha_emision,
            recepcion: e.fecha_recepcion || null,
            destinatario: e.destinatario,
            url: e.url,
            tipo: 'adicional',
            idx
        });
    });
    const ultima = cartas[cartas.length - 1] || null;
    const pendienteRecepcion = ultima && !ultima.recepcion;
    return { cartas, ultima, pendienteRecepcion };
}

function obtenerNombrePaso(caso) {
    if (!caso) return 'Sin iniciar';
    const paso = caso.paso_actual;
    if (paso >= 8) return 'Cerrado';
    if (paso === 1) return 'Emisión 1.ª carta';
    if (paso === 2) return 'Confirmar recepción 1.ª carta';
    if (paso === 3) {
        const dias = calcularDiasDescargoRestantes(caso);
        return dias > 0 ? `Descargo del colaborador (${dias} día${dias !== 1 ? 's' : ''})` : 'Descargo del colaborador';
    }
    if (paso === 4 || paso === 5) {
        const info = obtenerInfoCartas(caso);
        if (!caso.fecha_emision_2) return 'Emisión 2.ª carta';
        if (info.ultima && !info.ultima.recepcion) {
            return `Confirmar recepción ${info.ultima.numero}.ª carta`;
        }
        return 'Envío de nueva carta o medida disciplinaria';
    }
    if (paso === 6) return 'Medida disciplinaria';
    if (paso === 7) return 'Cierre de caso';
    return 'Sin iniciar';
}

function calcularDiasHabilesRestantes(caso) {
    if (!caso) return null;
    if (!caso.fecha_emision_1) return null;
    if (caso.fecha_cierre) return { vence: false, restantes: 0, cerrado: true };
    const inicio = new Date(caso.fecha_emision_1);
    const hoy = new Date();
    const transcurridos = contarDiasHabilesDesde(inicio, hoy);
    const restantes = Math.max(0, 30 - transcurridos);
    return { vence: restantes === 0, restantes, cerrado: false };
}

function calcularDiasDescargoRestantes(caso) {
    if (!caso || !caso.fecha_emision_1) return 0;
    const transcurridos = contarDiasHabilesDesde(new Date(caso.fecha_emision_1), new Date());
    return Math.max(0, RRLL_DIAS_DESCARGO - transcurridos);
}

function esDiaHabil(fecha) {
    const dia = fecha.getDay();
    if (dia === 0 || dia === 6) return false;
    const yyyy = fecha.getFullYear();
    const mm = String(fecha.getMonth() + 1).padStart(2, '0');
    const dd = String(fecha.getDate()).padStart(2, '0');
    return !rrllFeriados.includes(`${yyyy}-${mm}-${dd}`);
}

function opcionesDestinatario(nombreTrabajador, valorActual) {
    const valorColab = nombreTrabajador || 'El propio colaborador';
    const opciones = [
        { value: valorColab, label: `El propio colaborador (${nombreTrabajador || 'sin nombre'})` },
        { value: '__otro__', label: 'Otro (jefe / supervisor / encargado)' }
    ];
    const esOtro = valorActual && valorActual !== valorColab && valorActual !== nombreTrabajador;
    return opciones.map(o => `<option value="${escaparAttr(o.value)}" ${(esOtro ? o.value === '__otro__' : o.value === valorActual) ? 'selected' : ''}>${escaparHTML(o.label)}</option>`).join('');
}

function formatearFecha(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const anio = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${dia}/${mes}/${anio} ${hh}:${mm}`;
}

// ==========================================
// DRAWER RRLL - SLIDER DE BLOQUES (NUEVO)
// ==========================================
async function abrirDrawerRRLL(codHallazgo) {
    rrllBloqueActual = 1;
    window._rrllBloqueInicializado = false;
    try {
        const { data: hallazgo, error: errH } = await supabaseClient.from('hallazgos')
            .select('"COD_HALLAZGO","FECHA_ACONTECIMIENTO","DESC_AREA","DESC_SECCION","ACONTECIMIENTO","TRABAJADOR","NRO_DOC"')
            .eq('"COD_HALLAZGO"', codHallazgo).single();
        if (errH) throw errH;

        const { data: casoData } = await supabaseClient
            .from('relaciones_casos')
            .select('*')
            .eq('hallazgo_id', codHallazgo)
            .maybeSingle();

        rrllHallazgoActual = hallazgo;
        const { data: faltas } = await supabaseClient
            .from('hallazgo_faltas')
            .select('falta_id, catalogo_faltas(nombre)')
            .eq('hallazgo_id', codHallazgo);

        rrllFaltasHallazgo = (faltas || []).map(f => ({
            id: f.falta_id,
            nombre: f.catalogo_faltas?.nombre || `Falta #${f.falta_id}`
        }));
        rrllCasoActual = casoData || {
            hallazgo_id: codHallazgo, paso_actual: 1,
            cargo_1_url: null, cargo_1_destinatario: null, cargo_1_firmado_url: null,
            fecha_emision_1: null, fecha_recepcion_1: null, fecha_limite_descargo: null,
            descargo: null, descargo_url: null,
            cargo_2_url: null, cargo_2_destinatario: null, fecha_emision_2: null,
            fecha_recepcion_2: null,
            cartas_adicionales: [], medida_disciplinaria: null,
            dias_suspension: null, afecta_incentivos: null, fecha_cierre: null
        };

        document.getElementById('relaciones-drawer-titulo').textContent = hallazgo.TRABAJADOR || hallazgo.COD_HALLAZGO;
        renderizarDrawerRRLL();
        document.getElementById('relaciones-drawer').classList.add('active');
        document.getElementById('relaciones-drawer-overlay').classList.add('active');
    } catch (err) {
        console.error('Error al abrir drawer:', err);
        alert('Error al cargar el caso. Verifica la consola.');
    }
}

function cerrarDrawerRRLL() {
    document.getElementById('relaciones-drawer').classList.remove('active');
    document.getElementById('relaciones-drawer-overlay').classList.remove('active');
    rrllHallazgoActual = null;
    rrllCasoActual = null;
}

function calcularBloquesRRLL(caso) {
    const bloques = [];

    bloques.push({
        numero: 1,
        titulo: 'Primera carta',
        emision: caso.fecha_emision_1 || null,
        recepcion: caso.fecha_recepcion_1 || null,
        descargo: caso.descargo || null,
        descargo_url: caso.descargo_url || null,
        carta_url: caso.cargo_1_url || null,
        carta_firmada_url: caso.cargo_1_firmado_url || null,
        destinatario: caso.cargo_1_destinatario || null,
        tipo: 'primera'
    });

    if (caso.fecha_emision_2) {
        bloques.push({
            numero: 2,
            titulo: 'Segunda carta',
            emision: caso.fecha_emision_2,
            recepcion: caso.fecha_recepcion_2 || null,
            descargo: null,
            descargo_url: null,
            carta_url: caso.cargo_2_url || null,
            destinatario: caso.cargo_2_destinatario || null,
            tipo: 'segunda'
        });
    }

    const extras = Array.isArray(caso.cartas_adicionales) ? caso.cartas_adicionales : [];
    extras.forEach((e, idx) => {
        bloques.push({
            numero: 3 + idx,
            titulo: `Carta ${3 + idx}`,
            emision: e.fecha_emision,
            recepcion: e.fecha_recepcion || null,
            descargo: null,
            descargo_url: null,
            carta_url: e.url || null,
            destinatario: e.destinatario || null,
            tipo: 'adicional',
            idx
        });
    });

    return bloques;
}

function bloqueActivoRRLL(bloques, caso) {
    const paso = caso.paso_actual;
    if (paso >= 8 || caso.medida_disciplinaria) return bloques.length;
    const ultimo = bloques[bloques.length - 1];
    if (!ultimo.recepcion) return ultimo.numero;
    return Math.min(bloques.length, Math.max(1, bloques.length));
}

function renderizarDrawerRRLL() {
    const caso = rrllCasoActual;
    const h = rrllHallazgoActual;

    const bloques = calcularBloquesRRLL(caso);
    const activoAuto = bloqueActivoRRLL(bloques, caso);
    if (rrllBloqueActual < 1) rrllBloqueActual = 1;
    if (rrllBloqueActual > bloques.length) rrllBloqueActual = bloques.length;
    if (!window._rrllBloqueInicializado) {
        rrllBloqueActual = activoAuto;
        window._rrllBloqueInicializado = true;
    }

    const dias = calcularDiasHabilesRestantes(caso);
    const diasHtml = (dias && !dias.cerrado && dias.restantes > 0)
        ? `<div class="mt-3 flex items-center gap-2 text-xs">
            <span class="text-slate-500">Días hábiles restantes (30):</span>
            <span class="font-bold ${dias.vence ? 'text-red-600' : dias.restantes <= 5 ? 'text-red-600' : dias.restantes <= 10 ? 'text-amber-600' : 'text-emerald-600'}">
                ${dias.vence ? '⚠️ VENCIDO' : dias.restantes + ' días'}
            </span>
        </div>` : '';

    const infoBox = `
        <div class="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div class="grid grid-cols-2 gap-3 text-xs">
                <div><p class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Trabajador</p><p class="font-semibold text-slate-800 mt-0.5">${escaparHTML(h.TRABAJADOR) || '—'}</p></div>
                <div><p class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">DNI</p><p class="font-semibold text-slate-800 mt-0.5">${escaparHTML(h.NRO_DOC) || '—'}</p></div>
                <div><p class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Gerencia</p><p class="font-semibold text-slate-800 mt-0.5">${escaparHTML(embellecer(h.DESC_AREA)) || '—'}</p></div>
                <div><p class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Área</p><p class="font-semibold text-slate-800 mt-0.5">${escaparHTML(embellecer(h.DESC_SECCION)) || '—'}</p></div>
            </div>
            <div class="mt-3 pt-3 border-t border-slate-200">
                <p class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Acontecimiento</p>
                <p class="text-xs text-slate-700 mt-1 leading-relaxed">${escaparHTML(h.ACONTECIMIENTO) || '—'}</p>
            </div>
            ${diasHtml}
        </div>
    `;

    const bloque = bloques[rrllBloqueActual - 1];
    const contenidoBloque = renderBloqueRRLL(bloque, caso, h, bloques);

    const puedeAtras = rrllBloqueActual > 1;
    const puedeAdelante = rrllBloqueActual < bloques.length;

    const flechaAtras = `
        <button id="rrll-nav-prev" ${!puedeAtras ? 'disabled' : ''}
            class="flex-shrink-0 w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-20 disabled:cursor-not-allowed transition shadow-sm">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        </button>`;

    const flechaAdelante = `
        <button id="rrll-nav-next" ${!puedeAdelante ? 'disabled' : ''}
            class="flex-shrink-0 w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-20 disabled:cursor-not-allowed transition shadow-sm">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
        </button>`;

    const dots = bloques.map((b, i) => {
        const n = i + 1;
        const activo = n === rrllBloqueActual;
        const completado = !!b.recepcion && (n < bloques.length || caso.medida_disciplinaria || caso.fecha_cierre);
        const clase = activo
            ? 'bg-blue-600 w-6'
            : completado
                ? 'bg-emerald-500 w-2'
                : 'bg-slate-300 w-2';
        return `<button data-bloque="${n}" class="rrll-dot h-2 ${clase} rounded-full transition-all"></button>`;
    }).join('');

    document.getElementById('relaciones-drawer-content').innerHTML = `
        ${infoBox}

        <div class="mt-5">
            <div class="flex items-center gap-3">
                ${flechaAtras}
                <div class="flex-1 min-w-0">
                    <p class="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Bloque ${rrllBloqueActual} de ${bloques.length}</p>
                    <p class="text-sm font-bold text-slate-800 mt-0.5">${escaparHTML(bloque.titulo)}</p>
                </div>
                ${flechaAdelante}
            </div>

            <div class="flex items-center justify-center gap-2 mt-3">
                ${dots}
            </div>
        </div>

        <div class="mt-5">
            ${contenidoBloque}
        </div>
    `;

    bindEventosPasos();
}

function renderBloqueRRLL(bloque, caso, h, bloques) {
    const numero = bloque.numero;
    const casoCerrado = !!caso.fecha_cierre || caso.paso_actual >= 8;

    let htmlEmision = '';
    if (!bloque.emision) {
        if (numero === 1) {
            htmlEmision = `
                <div class="step-item active border-2 rounded-xl p-4">
                    <p class="text-sm font-bold text-slate-800 mb-1">Emisión 1.ª carta</p>
                    <p class="text-xs text-slate-500 mb-3">Dirigida al colaborador: <span class="font-semibold text-slate-700">${escaparHTML(h.TRABAJADOR) || '—'}</span></p>
                    <label class="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">Subir PDF</label>
                    <input type="file" id="rrll-file-1" accept="application/pdf" class="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer border border-slate-200 rounded-lg p-1 mb-3">
                    <button id="rrll-btn-guardar-1" class="w-full bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold py-2 rounded-lg transition">Guardar y emitir</button>
                </div>
            `;
        } else {
            htmlEmision = `
                <div class="step-item active border-2 rounded-xl p-4">
                    <p class="text-sm font-bold text-slate-800 mb-1">Emisión ${bloque.titulo.toLowerCase()}</p>
                    <p class="text-xs text-slate-500 mb-3">Nueva carta disciplinaria</p>
                    <label class="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">Destinatario</label>
                    <select id="rrll-dest-${numero}" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500">${opcionesDestinatario(h.TRABAJADOR, '')}</select>
                    <input type="text" id="rrll-dest-${numero}-otro" placeholder="Nombre del destinatario" class="hidden w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <label class="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">Subir PDF</label>
                    <input type="file" id="rrll-file-${numero}" accept="application/pdf" class="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer border border-slate-200 rounded-lg p-1 mb-3">
                    <button id="rrll-btn-guardar-${numero}" class="w-full bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold py-2 rounded-lg transition">Guardar y emitir</button>
                </div>
            `;
        }
    } else {
        htmlEmision = `
            <div class="step-item completed border-2 rounded-xl p-4">
                <div class="flex items-center gap-2 mb-2">
                    <svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                    <p class="text-sm font-bold text-slate-800">${escaparHTML(bloque.titulo)} emitida</p>
                </div>
                <p class="text-xs text-slate-500 mb-1">📅 ${formatearFecha(bloque.emision)}</p>
                ${bloque.destinatario ? `<p class="text-xs text-slate-700"><span class="font-semibold">Destinatario:</span> ${escaparHTML(bloque.destinatario)}</p>` : ''}
                ${bloque.carta_url ? `<a href="${escaparAttr(bloque.carta_url)}" target="_blank" class="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold mt-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>Ver PDF</a>` : ''}
            </div>
        `;
    }

    let htmlRecepcion = '';
    if (bloque.emision && !bloque.recepcion) {
        htmlRecepcion = `
            <div class="step-item active border-2 rounded-xl p-4 mt-3">
                <p class="text-sm font-bold text-slate-800 mb-3">Confirmación de recepción</p>
                <label class="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">Subir cargo FIRMADO (PDF)</label>
                <input type="file" id="rrll-file-${numero}-firmado" accept="application/pdf" class="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer border border-slate-200 rounded-lg p-1 mb-3">
                <button id="rrll-btn-recepcion-${numero}" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 rounded-lg transition">✅ Confirmar recepción</button>
            </div>
        `;
    } else if (bloque.recepcion) {
        htmlRecepcion = `
            <div class="step-item completed border-2 rounded-xl p-4 mt-3">
                <div class="flex items-center gap-2 mb-1">
                    <svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                    <p class="text-sm font-bold text-slate-800">Recepción confirmada</p>
                </div>
                <p class="text-xs text-slate-500">📅 ${formatearFecha(bloque.recepcion)}</p>
                ${bloque.carta_firmada_url ? `<a href="${escaparAttr(bloque.carta_firmada_url)}" target="_blank" class="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 font-semibold mt-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>Ver PDF firmado</a>` : ''}
            </div>
        `;
    }

    let htmlDescargo = '';

    if (numero === 1) {
        if (bloque.recepcion && !bloque.descargo && !casoCerrado) {
            htmlDescargo = `
                <div class="step-item active border-2 rounded-xl p-4 mt-3">
                    <p class="text-sm font-bold text-slate-800 mb-1">Descargo del colaborador</p>
                    <p class="text-[10px] text-slate-500 mb-3">Plazo: 3 días hábiles desde la emisión de la 1.ª carta. Si no sube nada, avanza solo a la siguiente carta.</p>
                    <label class="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block mb-1">Subir descargo (PDF) — opcional</label>
                    <input type="file" id="rrll-file-descargo" accept="application/pdf" class="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer border border-slate-200 rounded-lg p-1 mb-3">
                    <button id="rrll-btn-descargo-subir" class="w-full bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold py-2 rounded-lg transition">Subir descargo y continuar</button>
                </div>
            `;
        } else if (bloque.descargo) {
            htmlDescargo = `
                <div class="step-item completed border-2 rounded-xl p-4 mt-3">
                    <p class="text-sm font-bold text-slate-800 mb-1">Descargo</p>
                    <p class="text-xs ${bloque.descargo === 'con' ? 'text-blue-700' : 'text-slate-600'} font-semibold">
                        ${bloque.descargo === 'con' ? '✍️ El colaborador presentó descargo' : '⭕ El colaborador NO presentó descargo'}
                    </p>
                    ${bloque.descargo_url ? `<a href="${escaparAttr(bloque.descargo_url)}" target="_blank" class="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold mt-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>Ver descargo</a>` : ''}
                </div>
            `;
        }
    } else {
        if (bloque.recepcion && !casoCerrado) {
            htmlDescargo = `
                <div class="step-item active border-2 rounded-xl p-4 mt-3">
                    <p class="text-sm font-bold text-slate-800 mb-3">Siguiente acción</p>
                    <p class="text-xs text-slate-500 mb-3">¿El colaborador presentó descargo o pasamos a medida disciplinaria?</p>

                    <div class="grid grid-cols-2 gap-2 mb-3">
                        <button id="rrll-btn-elegir-descargo-${numero}" class="rrll-btn-elegir bg-blue-50 hover:bg-blue-100 border-2 border-blue-200 hover:border-blue-400 text-blue-800 text-xs font-bold py-3 rounded-xl transition flex flex-col items-center gap-1">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                            Subió descargo
                        </button>
                        <button id="rrll-btn-elegir-medida-${numero}" class="rrll-btn-elegir bg-amber-50 hover:bg-amber-100 border-2 border-amber-200 hover:border-amber-400 text-amber-800 text-xs font-bold py-3 rounded-xl transition flex flex-col items-center gap-1">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"/></svg>
                            Pasar a medida
                        </button>
                    </div>

                    <div id="rrll-panel-descargo-${numero}" class="hidden bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <label class="text-[10px] text-slate-600 uppercase tracking-wider font-semibold block mb-1">Subir descargo (PDF)</label>
                        <input type="file" id="rrll-file-descargo-${numero}" accept="application/pdf" class="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-white file:text-blue-700 hover:file:bg-blue-50 cursor-pointer border border-blue-200 rounded-lg p-1 bg-white mb-2">
                        <button id="rrll-btn-descargo-${numero}" class="w-full bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold py-2 rounded-lg transition">Guardar descargo y continuar</button>
                    </div>

                    <div id="rrll-panel-medida-${numero}" class="hidden bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <label class="text-[10px] text-slate-600 uppercase tracking-wider font-semibold block mb-1">Tipo de medida</label>
                        <select id="rrll-select-medida-${numero}" class="w-full bg-white border border-amber-200 rounded-lg px-3 py-2 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-amber-500">
                            <option value="">Selecciona la medida...</option>
                            <option value="Suspensión">Suspensión</option>
                            <option value="Amonestación">Amonestación</option>
                        </select>
                        <div id="rrll-medida-extra-${numero}" class="hidden"></div>
                        <button id="rrll-btn-guardar-medida-${numero}" class="w-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold py-2 rounded-lg transition mt-2">Aplicar medida y cerrar caso</button>
                    </div>
                </div>
            `;
        } else if (casoCerrado) {
            htmlDescargo = `
                <div class="step-item completed border-2 rounded-xl p-4 mt-3">
                    <div class="flex items-center gap-2 mb-1">
                        <svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                        <p class="text-sm font-bold text-slate-800">Caso cerrado</p>
                    </div>
                    ${caso.medida_disciplinaria ? `<p class="text-xs text-slate-700 mt-1"><span class="font-semibold">${caso.medida_disciplinaria}:</span> ${caso.medida_disciplinaria === 'Suspensión' ? (caso.dias_suspension || 0) + ' días' : (caso.afecta_incentivos ? 'Sí afecta incentivos' : 'No afecta incentivos')}</p>` : ''}
                    ${caso.fecha_cierre ? `<p class="text-xs text-slate-500 mt-1">📅 ${formatearFecha(caso.fecha_cierre)}</p>` : ''}
                </div>
            `;
        }
    }

    return htmlEmision + htmlRecepcion + htmlDescargo;
}

function bindEventosPasos() {
    const caso = rrllCasoActual;
    const h = rrllHallazgoActual;
    const bloques = calcularBloquesRRLL(caso);

    document.getElementById('rrll-nav-prev')?.addEventListener('click', () => {
        if (rrllBloqueActual > 1) {
            rrllBloqueActual--;
            renderizarDrawerRRLL();
        }
    });
    document.getElementById('rrll-nav-next')?.addEventListener('click', () => {
        if (rrllBloqueActual < bloques.length) {
            rrllBloqueActual++;
            renderizarDrawerRRLL();
        }
    });
    document.querySelectorAll('.rrll-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            const n = parseInt(dot.dataset.bloque);
            if (n >= 1 && n <= bloques.length) {
                rrllBloqueActual = n;
                renderizarDrawerRRLL();
            }
        });
    });

    const numBloqueActual = bloques[rrllBloqueActual - 1]?.numero || 1;

    // EMISIÓN bloque 1
    document.getElementById('rrll-btn-guardar-1')?.addEventListener('click', async () => {
        const file = document.getElementById('rrll-file-1')?.files[0];
        const destinatario = h.TRABAJADOR || '';
        if (!destinatario) { alert('⚠️ El hallazgo no tiene trabajador asignado.'); return; }
        if (!file) { alert('⚠️ Selecciona el PDF de la 1.ª carta.'); return; }
        if (file.type !== 'application/pdf') { alert('⚠️ El archivo debe ser PDF.'); return; }
        try {
            const path = `${h.COD_HALLAZGO}/1era_carta_${Date.now()}.pdf`;
            const { error: upErr } = await supabaseClient.storage.from('relaciones-cargos').upload(path, file, { contentType: 'application/pdf', upsert: true });
            if (upErr) throw upErr;
            const { data: urlData } = supabaseClient.storage.from('relaciones-cargos').getPublicUrl(path);
            const url = urlData.publicUrl;
            const fechaEmision = new Date();
            const fechaLimite = new Date(fechaEmision);
            let contados = 0;
            while (contados < RRLL_DIAS_DESCARGO) {
                fechaLimite.setDate(fechaLimite.getDate() + 1);
                if (esDiaHabil(fechaLimite)) contados++;
            }
            await guardarPaso(caso.id, {
                cargo_1_url: url, cargo_1_destinatario: destinatario,
                fecha_emision_1: fechaEmision.toISOString(),
                fecha_limite_descargo: fechaLimite.toISOString(),
                paso_actual: 2
            });
            await abrirDrawerRRLL(h.COD_HALLAZGO);
            await cargarTablaRRLL();
            await cargarPanelAvisos();
        } catch (err) { console.error(err); alert('❌ Error al subir la 1.ª carta: ' + err.message); }
    });

    // EMISIÓN bloques 2+
    if (numBloqueActual >= 2) {
        document.getElementById(`rrll-btn-guardar-${numBloqueActual}`)?.addEventListener('click', async () => {
            const file = document.getElementById(`rrll-file-${numBloqueActual}`)?.files[0];
            const destSelect = document.getElementById(`rrll-dest-${numBloqueActual}`)?.value;
            const destOtro = document.getElementById(`rrll-dest-${numBloqueActual}-otro`)?.value?.trim() || '';
            const destinatario = destSelect === '__otro__' ? destOtro : destSelect;
            if (!destinatario) { alert('⚠️ Ingresa el destinatario.'); return; }
            if (!file) { alert('⚠️ Selecciona el PDF.'); return; }
            if (file.type !== 'application/pdf') { alert('⚠️ El archivo debe ser PDF.'); return; }
            try {
                const num = numBloqueActual;
                const path = `${h.COD_HALLAZGO}/carta_${num}_${Date.now()}.pdf`;
                const { error: upErr } = await supabaseClient.storage.from('relaciones-cargos').upload(path, file, { contentType: 'application/pdf', upsert: true });
                if (upErr) throw upErr;
                const { data: urlData } = supabaseClient.storage.from('relaciones-cargos').getPublicUrl(path);
                const url = urlData.publicUrl;

                if (num === 2) {
                    await guardarPaso(caso.id, {
                        cargo_2_url: url,
                        cargo_2_destinatario: destinatario,
                        fecha_emision_2: new Date().toISOString(),
                        paso_actual: 5
                    });
                } else {
                    const { data: casoFresh } = await supabaseClient.from('relaciones_casos').select('cartas_adicionales').eq('id', caso.id).single();
                    const cartas = Array.isArray(casoFresh?.cartas_adicionales) ? [...casoFresh.cartas_adicionales] : [];
                    cartas.push({
                        numero: num,
                        destinatario,
                        url,
                        fecha_emision: new Date().toISOString(),
                        fecha_recepcion: null
                    });
                    await guardarPaso(caso.id, { cartas_adicionales: cartas });
                }
                await abrirDrawerRRLL(h.COD_HALLAZGO);
                await cargarTablaRRLL();
                await cargarPanelAvisos();
            } catch (err) { alert('Error: ' + err.message); }
        });

        document.getElementById(`rrll-dest-${numBloqueActual}`)?.addEventListener('change', (e) => {
            const otroInput = document.getElementById(`rrll-dest-${numBloqueActual}-otro`);
            if (e.target.value === '__otro__') otroInput.classList.remove('hidden');
            else otroInput.classList.add('hidden');
        });
    }

    // RECEPCIÓN
    document.getElementById(`rrll-btn-recepcion-${numBloqueActual}`)?.addEventListener('click', async () => {
        const file = document.getElementById(`rrll-file-${numBloqueActual}-firmado`)?.files[0];
        if (!file) { alert('⚠️ Sube el PDF del cargo firmado.'); return; }
        if (file.type !== 'application/pdf') { alert('⚠️ El archivo debe ser PDF.'); return; }
        try {
            const num = numBloqueActual;
            const path = `${h.COD_HALLAZGO}/carta_${num}_FIRMADA_${Date.now()}.pdf`;
            const { error: upErr } = await supabaseClient.storage.from('relaciones-cargos').upload(path, file, { contentType: 'application/pdf', upsert: true });
            if (upErr) throw upErr;
            const { data: urlData } = supabaseClient.storage.from('relaciones-cargos').getPublicUrl(path);
            const url = urlData.publicUrl;

            if (num === 1) {
                await guardarPaso(caso.id, {
                    cargo_1_firmado_url: url,
                    fecha_recepcion_1: new Date().toISOString(),
                    paso_actual: 3
                });
            } else if (num === 2) {
                await guardarPaso(caso.id, {
                    fecha_recepcion_2: new Date().toISOString()
                });
            } else {
                const { data: casoFresh } = await supabaseClient.from('relaciones_casos').select('cartas_adicionales').eq('id', caso.id).single();
                const cartas = Array.isArray(casoFresh?.cartas_adicionales) ? [...casoFresh.cartas_adicionales] : [];
                if (cartas[num - 3]) {
                    cartas[num - 3] = { ...cartas[num - 3], fecha_recepcion: new Date().toISOString() };
                    await guardarPaso(caso.id, { cartas_adicionales: cartas });
                }
            }
            await abrirDrawerRRLL(h.COD_HALLAZGO);
            await cargarTablaRRLL();
            await cargarPanelAvisos();
        } catch (err) { alert('Error: ' + err.message); }
    });

    // DESCARGO bloque 1
    document.getElementById('rrll-btn-descargo-subir')?.addEventListener('click', async () => {
        const file = document.getElementById('rrll-file-descargo')?.files[0];
        if (!file) { alert('⚠️ Sube el PDF del descargo.'); return; }
        if (file.type !== 'application/pdf') { alert('⚠️ El archivo debe ser PDF.'); return; }
        try {
            const path = `${h.COD_HALLAZGO}/descargo_${Date.now()}.pdf`;
            const { error: upErr } = await supabaseClient.storage.from('relaciones-cargos').upload(path, file, { contentType: 'application/pdf', upsert: true });
            if (upErr) throw upErr;
            const { data: urlData } = supabaseClient.storage.from('relaciones-cargos').getPublicUrl(path);
            const url = urlData.publicUrl;
            await guardarPaso(caso.id, { descargo: 'con', descargo_url: url, paso_actual: 4 });
            await abrirDrawerRRLL(h.COD_HALLAZGO);
            await cargarTablaRRLL();
            await cargarPanelAvisos();
        } catch (err) { alert('Error: ' + err.message); }
    });

    // DECISIÓN bloques 2+
    document.getElementById(`rrll-btn-elegir-descargo-${numBloqueActual}`)?.addEventListener('click', () => {
        document.getElementById(`rrll-panel-medida-${numBloqueActual}`)?.classList.add('hidden');
        document.getElementById(`rrll-panel-descargo-${numBloqueActual}`)?.classList.remove('hidden');
    });

    document.getElementById(`rrll-btn-elegir-medida-${numBloqueActual}`)?.addEventListener('click', () => {
        document.getElementById(`rrll-panel-descargo-${numBloqueActual}`)?.classList.add('hidden');
        document.getElementById(`rrll-panel-medida-${numBloqueActual}`)?.classList.remove('hidden');
    });

    document.getElementById(`rrll-btn-descargo-${numBloqueActual}`)?.addEventListener('click', async () => {
        const num = numBloqueActual;
        const file = document.getElementById(`rrll-file-descargo-${num}`)?.files[0];
        if (!file) { alert('⚠️ Sube el PDF del descargo.'); return; }
        if (file.type !== 'application/pdf') { alert('⚠️ El archivo debe ser PDF.'); return; }
        try {
            const path = `${h.COD_HALLAZGO}/descargo_carta_${num}_${Date.now()}.pdf`;
            const { error: upErr } = await supabaseClient.storage.from('relaciones-cargos').upload(path, file, { contentType: 'application/pdf', upsert: true });
            if (upErr) throw upErr;
            const { data: urlData } = supabaseClient.storage.from('relaciones-cargos').getPublicUrl(path);
            const url = urlData.publicUrl;

            if (num === 2) {
                await guardarPaso(caso.id, {
                    descargo: 'con',
                    descargo_url: url,
                    paso_actual: 4
                });
            } else {
                const { data: casoFresh } = await supabaseClient.from('relaciones_casos').select('cartas_adicionales').eq('id', caso.id).single();
                const cartas = Array.isArray(casoFresh?.cartas_adicionales) ? [...casoFresh.cartas_adicionales] : [];
                if (cartas[num - 3]) {
                    cartas[num - 3] = { ...cartas[num - 3], descargo: 'con', descargo_url: url };
                    await guardarPaso(caso.id, { cartas_adicionales: cartas });
                }
            }
            await abrirDrawerRRLL(h.COD_HALLAZGO);
            await cargarTablaRRLL();
        } catch (err) { alert('Error: ' + err.message); }
    });

    document.getElementById(`rrll-select-medida-${numBloqueActual}`)?.addEventListener('change', (e) => {
        const val = e.target.value;
        const extra = document.getElementById(`rrll-medida-extra-${numBloqueActual}`);
        if (!extra) return;
        if (val === 'Suspensión') {
            extra.classList.remove('hidden');
            extra.innerHTML = `<label class="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block mt-2">Días de suspensión</label>
                <input type="number" id="rrll-dias-susp-${numBloqueActual}" min="1" value="1" class="w-full bg-white border border-amber-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500">`;
        } else if (val === 'Amonestación') {
            extra.classList.remove('hidden');
            extra.innerHTML = `<label class="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block mt-2">¿Afecta incentivos?</label>
                <select id="rrll-afecta-${numBloqueActual}" class="w-full bg-white border border-amber-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500">
                    <option value="true">Sí, afecta incentivos</option>
                    <option value="false">No afecta incentivos</option>
                </select>`;
        } else { extra.classList.add('hidden'); extra.innerHTML = ''; }
    });

    document.getElementById(`rrll-btn-guardar-medida-${numBloqueActual}`)?.addEventListener('click', async () => {
        const num = numBloqueActual;
        const medida = document.getElementById(`rrll-select-medida-${num}`)?.value;
        if (!medida) { alert('⚠️ Selecciona la medida.'); return; }
        const payload = { medida_disciplinaria: medida, paso_actual: 8, fecha_cierre: new Date().toISOString() };
        if (medida === 'Suspensión') {
            const dias = parseInt(document.getElementById(`rrll-dias-susp-${num}`)?.value);
            if (!dias || dias < 1) { alert('⚠️ Ingresa días válidos.'); return; }
            payload.dias_suspension = dias;
        } else if (medida === 'Amonestación') {
            payload.afecta_incentivos = document.getElementById(`rrll-afecta-${num}`)?.value === 'true';
        }
        try {
            await guardarPaso(caso.id, payload);
            await abrirDrawerRRLL(h.COD_HALLAZGO);
            await cargarTablaRRLL();
        } catch (err) { alert('Error: ' + err.message); }
    });
}

async function guardarPaso(casoId, payload) {
    if (casoId) {
        const { error } = await supabaseClient
            .from('relaciones_casos')
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq('id', casoId);
        if (error) throw error;
    } else {
        const { error } = await supabaseClient
            .from('relaciones_casos')
            .insert([{ hallazgo_id: rrllHallazgoActual.COD_HALLAZGO, ...payload }]);
        if (error) throw error;
    }
}

// ==========================================
// EVENTOS RRLL GLOBALES
// ==========================================
document.getElementById('modal-historial-lista')?.addEventListener('click', (e) => {
    const img = e.target.closest('img[data-historial-lightbox-url]');
    if (img) abrirLightboxHallazgo(img.dataset.historialLightboxUrl);
});
document.getElementById('relaciones-btn-prev')?.addEventListener('click', () => {
    if (rrllPaginaActual > 1) { rrllPaginaActual--; cargarTablaRRLL(); }
});
document.getElementById('relaciones-btn-next')?.addEventListener('click', () => {
    if (rrllPaginaActual < rrllTotalPaginas) { rrllPaginaActual++; cargarTablaRRLL(); }
});
let timeoutBuscadorRRLL;
document.getElementById('relaciones-buscador')?.addEventListener('input', (e) => {
    clearTimeout(timeoutBuscadorRRLL);
    timeoutBuscadorRRLL = setTimeout(() => {
        rrllSearchTerm = e.target.value;
        rrllPaginaActual = 1;
        cargarTablaRRLL();
    }, 500);
});
document.getElementById('btn-cerrar-drawer')?.addEventListener('click', cerrarDrawerRRLL);
document.getElementById('relaciones-drawer-overlay')?.addEventListener('click', cerrarDrawerRRLL);
document.getElementById('relaciones-tabla-body')?.addEventListener('click', (e) => {
    const btnHist = e.target.closest('.btn-historial-trabajador');
    if (btnHist) {
        e.stopPropagation();
        abrirModalHistorialTrabajador(btnHist.dataset.workerName, btnHist.dataset.workerDni);
        return;
    }
    const tr = e.target.closest('tr[data-hallazgo-id]');
    if (tr) abrirDrawerRRLL(tr.dataset.hallazgoId);
});

// ==========================================
// 21. HISTORIAL DE FALTAS POR TRABAJADOR
// ==========================================
async function abrirModalHistorialTrabajador(nombre, dni) {
    const titulo = document.getElementById('modal-historial-titulo');
    const sub = document.getElementById('modal-historial-sub');
    const resumen = document.getElementById('modal-historial-resumen');
    const lista = document.getElementById('modal-historial-lista');

    titulo.textContent = nombre || 'Trabajador';
    sub.textContent = dni ? `DNI ${dni}` : '';
    resumen.innerHTML = '<p class="text-sm text-slate-400 italic">Cargando…</p>';
    lista.innerHTML = '';

    const modal = document.getElementById('modal-historial-trabajador');
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    try {
        let q = supabaseClient.from('hallazgos')
            .select('"COD_HALLAZGO","FECHA_ACONTECIMIENTO","DESC_AREA","DESC_SECCION","ACONTECIMIENTO","ESTADO"')
            .eq('"DESC_EVENTO"', 'Acto Subestandar')
            .neq('"ESTADO"', 'Anulado');

        if (dni) q = q.eq('"NRO_DOC"', dni);
        else if (nombre) q = q.eq('"TRABAJADOR"', nombre);

        const { data: hallazgos, error: errH } = await q;
        if (errH) throw errH;

        if (!hallazgos || hallazgos.length === 0) {
            resumen.innerHTML = '<p class="text-sm text-slate-400 italic">Sin hallazgos registrados.</p>';
            return;
        }

        const ids = hallazgos.map(h => h.COD_HALLAZGO);
        const { data: faltasData, error: errF } = await supabaseClient
            .from('hallazgo_faltas')
            .select('hallazgo_id, falta_id, catalogo_faltas(nombre)')
            .in('hallazgo_id', ids);
        if (errF) throw errF;
        const { data: fotosData } = await supabaseClient
            .from('imagenes_hallazgos')
            .select('hallazgo_id, storage_path, destacada, created_at')
            .in('hallazgo_id', ids)
            .order('destacada', { ascending: false })
            .order('created_at', { ascending: true });

        const fotoPorHallazgo = {};
        (fotosData || []).forEach(f => {
            if (!fotoPorHallazgo[f.hallazgo_id]) {
                fotoPorHallazgo[f.hallazgo_id] = f.storage_path;
            }
        });

        const faltasPorHallazgo = {};
        (faltasData || []).forEach(r => {
            if (!faltasPorHallazgo[r.hallazgo_id]) faltasPorHallazgo[r.hallazgo_id] = [];
            faltasPorHallazgo[r.hallazgo_id].push(r.catalogo_faltas?.nombre || `Falta #${r.falta_id}`);
        });

        const totalFaltas = (faltasData || []).length;

        resumen.innerHTML = `
            <div class="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <p class="text-[10px] uppercase font-bold text-emerald-700 tracking-wider">Faltas</p>
                <p class="text-2xl font-bold text-emerald-800 leading-tight">${totalFaltas}</p>
            </div>
        `;

        lista.innerHTML = hallazgos.map(h => {
            const faltas = faltasPorHallazgo[h.COD_HALLAZGO] || [];
            const faltasHtml = faltas.length > 0
                ? faltas.map(f => `<span class="inline-block bg-emerald-100 text-emerald-800 text-[11px] font-semibold px-2 py-0.5 rounded-full mr-1 mb-1">${escaparHTML(f)}</span>`).join('')
                : '<span class="text-xs text-slate-400 italic">Sin faltas etiquetadas</span>';

            const badge = h.ESTADO === 'Cerrado'
                ? '<span class="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-semibold">Cerrado</span>'
                : '<span class="bg-red-50 text-red-700 px-2 py-0.5 rounded text-[10px] font-semibold">Abierto</span>';

            const fotoPath = fotoPorHallazgo[h.COD_HALLAZGO];
            const fotoUrl = fotoPath ? urlFotoHallazgo(fotoPath) : null;

            return `
                <div class="border border-slate-200 rounded-lg p-3 bg-white flex gap-3">
                    ${fotoUrl
                        ? `<img src="${escaparAttr(fotoUrl)}"
                                alt="${escaparAttr(h.COD_HALLAZGO)}"
                                class="w-24 h-24 object-cover rounded-lg cursor-zoom-in border border-slate-200 flex-shrink-0"
                                loading="lazy"
                                data-historial-lightbox-url="${escaparAttr(fotoUrl)}">`
                        : `<div class="w-24 h-24 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-300 flex-shrink-0">
                              <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                              </svg>
                           </div>`}
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-start gap-2 mb-2">
                            <div class="min-w-0">
                                <p class="text-xs font-bold text-slate-800">${escaparHTML(h.COD_HALLAZGO)}</p>
                                <p class="text-[11px] text-slate-500">${escaparHTML(h.FECHA_ACONTECIMIENTO) || '-'}</p>
                            </div>
                            ${badge}
                        </div>
                        <div class="mb-2">${faltasHtml}</div>
                        <p class="text-[11px] text-slate-600 leading-relaxed">${escaparHTML((h.ACONTECIMIENTO || '').substring(0, 140))}${(h.ACONTECIMIENTO || '').length > 140 ? '...' : ''}</p>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error('Error historial:', err);
        resumen.innerHTML = `<p class="text-sm text-red-500">Error: ${escaparHTML(err.message)}</p>`;
    }
}

function cerrarModalHistorialTrabajador() {
    const modal = document.getElementById('modal-historial-trabajador');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// ==========================================
// INICIO
// ==========================================
init();
