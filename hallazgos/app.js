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

// 🆕 Cada evento tiene:
//    valor    → EXACTO como está en Supabase (sin tildes). NO TOCAR sin verificar BD.
//    etiqueta → texto visible del botón (aquí sí van tildes)
const EVENTOS_DISPONIBLES = [
    { valor: 'Acto Subestandar',      etiqueta: 'Acto Subestándar'      },
    { valor: 'Condicion Subestandar', etiqueta: 'Condición Subestándar' }
];

const ESTADOS_DISPONIBLES = ['Abierto', 'Cerrado'];
const NOMBRE_ADMIN = 'Seguridad Industrial';

// 🆕 Gerencias que ven TODOS los datos (pero NO pueden subir Excel)
const GERENCIAS_ACCESO_TOTAL = [
    'GERENCIA GENERAL',
    'GERENCIA LEGAL Y RELAC LABORAL'
];
// 🆕 Gerencias que NO deben mostrarse en los filtros ni en el login
const GERENCIAS_EXCLUIDAS = [
    'Relaciones Laborales',
    'GERENCIA LEGAL Y RELAC LABORAL' // Opcional, por si en hallazgos está con este nombre exacto
];
// 🆕 Años que NO deben mostrarse
const ANIOS_EXCLUIDOS = ['2023'];

// 🆕 Diccionario de correcciones ortográficas (solo visual)
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
// 1b. HELPERS DE PERMISOS, ORTOGRAFÍA Y EXCLUSIÓN
// ==========================================
function normalizarTexto(s) {
    return (s || '')
        .toString()
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

// ¿Es admin real? (solo Seguridad Industrial puede subir Excel)
function esAdminReal() {
    return usuarioActual && usuarioActual.esAdmin === true;
}

// ¿Ve todos los datos? (admin real + GERENCIA GENERAL + GERENCIA LEGAL)
function usuarioVeTodo() {
    if (!usuarioActual) return false;
    if (usuarioActual.esAdmin) return true;
    const nombreNorm = normalizarTexto(usuarioActual.nombre);
    return GERENCIAS_ACCESO_TOTAL.some(g => normalizarTexto(g) === nombreNorm);
}

// ¿Puede subir Excel? (SOLO el admin real: Seguridad Industrial)
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

// ==========================================
// 2. FONDO ANIMADO: CAÑAVERAL REALISTA
// ==========================================
function generarCanaveral() {
    const cont = document.getElementById('canas');
    if (!cont) return;
    cont.innerHTML = '';

    const esMovil = window.innerWidth < 768;
    const totalBack = esMovil ? 15 : 25;
    const totalFront = esMovil ? 30 : 55;

    for (let i = 0; i < totalBack; i++) {
        cont.appendChild(crearCana(i, totalBack, true));
    }
    for (let i = 0; i < totalFront; i++) {
        cont.appendChild(crearCana(i, totalFront, false));
    }
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
            <path class="hoja"
                  d="${d}"
                  fill="url(#${idLeaf})"
                  stroke="${col.leafB}"
                  stroke-width="0.4"
                  stroke-opacity="0.7"
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
// 🆕 Gerencias que NO quieres que aparezcan en el login
// (se compara normalizado: sin tildes, sin mayúsculas, sin espacios extra)
const GERENCIAS_EXCLUIDAS_LOGIN = [
    'Relaciones Laborales'
];

async function cargarOpcionesLogin() {
    const { data, error } = await supabaseClient
        .from('gerencias_acceso')
        .select('nombre')
        .eq('es_admin', false)
        .order('nombre');
    if (error) { console.error(error); return; }

    const sel = document.getElementById('login-gerencia');
    sel.innerHTML = '<option value="">Selecciona tu gerencia...</option>';

    // ✅ Normalizar las excluidas para comparar de forma segura
    const excluidasNorm = GERENCIAS_EXCLUIDAS_LOGIN.map(normalizarTexto);

    // ✅ Filtrar comparando normalizado
    const dataFiltrada = data.filter(g => {
        const nombreNorm = normalizarTexto(g.nombre);
        const excluida = excluidasNorm.includes(nombreNorm);
        if (excluida) console.log('🚫 Excluida del login:', JSON.stringify(g.nombre));
        return !excluida;
    });

    dataFiltrada.forEach(g => {
        sel.innerHTML += `<option value="${g.nombre}">${embellecer(g.nombre)}</option>`;
    });

    console.log('✅ Gerencias cargadas en login:', dataFiltrada.map(g => g.nombre));
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

    // ⚠️ IMPORTANTE: Aquí asignamos esAdmin: false SIEMPRE.
    // Aunque sea GERENCIA GENERAL o LEGAL, NO son admins reales.
    // Solo verán todos los datos (usuarioVeTodo), pero NO podrán subir Excel.
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

function cerrarSesion() {
    sessionStorage.removeItem('usuario');
    location.reload();
}

// ==========================================
// 4. INICIAR DASHBOARD
// ==========================================
async function iniciarDashboard() {
    document.getElementById('pantalla-login').classList.add('hidden');
    document.getElementById('app-principal').classList.remove('hidden');
    document.getElementById('usuario-actual').textContent = embellecer(usuarioActual.nombre);

    const fondo = document.querySelector('.fondo-animado');
    if (fondo) fondo.style.display = 'none';

    // ✅ SOLO el admin real (Seguridad Industrial) ve el panel de subir Excel
    if (puedeSubirExcel()) {
        const panelExcel = document.getElementById('admin-excel-panel');
        if (panelExcel) panelExcel.classList.remove('hidden');
    }

    renderizarBotonesEvento();
    renderizarBotonesEstado();

    await cargarFiltros();
    await aplicarRestriccionesUsuario();
    await cargarDashboard();
    await cargarTabla();
    await dibujarGrafico();
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
// 5. BOTONES EVENTO / ESTADO
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

// ==========================================
// 6. FILTROS
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
    .filter(g => !GERENCIAS_EXCLUIDAS.includes(g)) // <--- Filtro para excluir
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
// 7. TARJETAS
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
// 8. GRÁFICO
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
// 9. CLIC EN BARRAS
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
// 10. TABLA
// ==========================================
async function cargarTabla() {
    try {
        const { anio, evento, estado, gerencia, area } = obtenerFiltros();
        const offset = (paginaActual - 1) * registrosPorPagina;

        let q = supabaseClient
            .from('hallazgos')
            .select('"COD_HALLAZGO","FECHA_ACONTECIMIENTO","DESC_SECCION","ESTADO","ACONTECIMIENTO"', { count: 'exact' })
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
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-12 text-slate-400 text-sm">No se encontraron hallazgos</td></tr>`;
            cardsContainer.innerHTML = `<div class="text-center py-12 text-slate-400 text-sm">No se encontraron hallazgos</div>`;
            return;
        }

        // ✅ Función auxiliar para generar el badge de estado
        const generarBadge = (estado) => {
            if (estado === 'Cerrado') {
                return '<span class="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap"><span class="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>Cerrado</span>';
            } else if (estado === 'Abierto') {
                return '<span class="inline-flex items-center gap-1.5 bg-red-50 text-red-700 px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap"><span class="w-1.5 h-1.5 bg-red-500 rounded-full"></span>Abierto</span>';
            }
            return `<span class="inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap">${estado || '-'}</span>`;
        };

        // ============================================
        // ✅ VISTA ESCRITORIO: tabla normal
        // ============================================
        tbody.innerHTML = data.map(h => {
            const partes = (h.FECHA_ACONTECIMIENTO || '').split('/');
            const anioStr = partes[2] ? partes[2].substring(0, 4) : '';
            const mesStr = partes[1] ? nombreMes(parseInt(partes[1])) : '';

            return `
                <tr class="row-hover transition">
                    <td class="px-6 py-4 font-semibold text-slate-800 text-xs whitespace-nowrap">${h.COD_HALLAZGO || '-'}</td>
                    <td class="px-6 py-4 text-slate-600 text-xs whitespace-nowrap">${anioStr}</td>
                    <td class="px-6 py-4 text-slate-600 text-xs whitespace-nowrap">${mesStr}</td>
                    <td class="px-6 py-4 text-slate-700 text-xs font-medium whitespace-nowrap">${embellecer(h.DESC_SECCION) || '-'}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${generarBadge(h.ESTADO)}</td>
                    <td class="px-6 py-4 text-slate-600 text-xs">${h.ACONTECIMIENTO || '-'}</td>
                </tr>
            `;
        }).join('');

        // ============================================
        // ✅ VISTA MÓVIL: tarjetas
        // ============================================
        cardsContainer.innerHTML = data.map(h => {
            const partes = (h.FECHA_ACONTECIMIENTO || '').split('/');
            const anioStr = partes[2] ? partes[2].substring(0, 4) : '';
            const mesStr = partes[1] ? nombreMes(parseInt(partes[1])) : '';

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
                    <p class="text-xs text-slate-700">
                        <strong class="text-slate-700 font-semibold">Área:</strong> ${embellecer(h.DESC_SECCION) || '-'}
                    </p>
                    <p class="text-xs text-slate-600 leading-relaxed pt-2 border-t border-slate-100 mt-2">
                        ${h.ACONTECIMIENTO || '-'}
                    </p>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('❌ Error tabla:', error.message);
    }
}

// ==========================================
// 11. EVENTOS
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
    formAdmin.classList.remove('hidden');
    document.getElementById('admin-password').focus();
});

document.getElementById('btn-volver-normal').addEventListener('click', () => {
    formAdmin.classList.add('hidden');
    formNormal.classList.remove('hidden');
    document.getElementById('admin-password').value = '';
    document.getElementById('admin-error').classList.add('hidden');
});

document.getElementById('btn-login-admin').addEventListener('click', intentarLoginAdmin);
document.getElementById('admin-password').addEventListener('keypress', (e) => { if (e.key === 'Enter') intentarLoginAdmin(); });

document.getElementById('btn-logout').addEventListener('click', cerrarSesion);

// ==========================================
// 12. INIT
// ==========================================
async function init() {
    await cargarOpcionesLogin();
    const guardado = sessionStorage.getItem('usuario');
    if (guardado) {
        usuarioActual = JSON.parse(guardado);
        await iniciarDashboard();
    }
}

// ==========================================
// 13. LÓGICA DE SUBIDA DE EXCEL (ADMIN)
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
    // ✅ Doble verificación: solo el admin real puede subir
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
            
            // ✅ Forzar a leer la PRIMERA hoja del Excel
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            let jsonData = XLSX.utils.sheet_to_json(worksheet);

            if (jsonData.length === 0) {
                alert("⚠️ El archivo Excel está vacío o no tiene el formato correcto.");
                return;
            }

            // ✅ LIMPIEZA: Eliminar la columna 'id' y columnas vacías
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

            console.log("Datos limpios listos para subir:", jsonData);

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
                await refrescarTodo();
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

// Iniciar la aplicación
init();
