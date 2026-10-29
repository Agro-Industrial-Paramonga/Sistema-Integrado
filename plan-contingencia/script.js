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
   EQUIPO: id estable del celular.
   El APK lo guarda en sus preferencias nativas (no se borra con la
   cache del WebView); en navegador se usa uno local como respaldo.
   La sesion vive en la base y se busca por este id.
   ============================================================ */
const CLAVE_DISPOSITIVO = 'pc_dispositivo';

function dispositivoActual() {
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

/* Pide confirmacion antes de cambiar el estado de una actividad. */
async function confirmarCambioEstado(actual, nuevo) {
    const mapa = ETIQUETAS || {};
    const desde = mapa[actual] || actual || '-';
    const hasta = mapa[nuevo] || nuevo || '-';
    return await mostrarConfirm(
        '¿Confirmas el cambio de estado de esta actividad? Pasará de "' + desde + '" a "' + hasta + '".',
        'Cambiar estado',
        'info'
    );
}

/* ============================================================
   HISTORIAL
   ============================================================ */async function registrarHistorial(accion, tabla, medidaId, detalle) {
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

    /* Historial completo: todas las áreas ven quién agregó qué. */

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
        const areaExtra = h.area ? ` · <em>${h.area}</em>` : '';
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

function puedeEnviarAlarma() {
    return esGerente() || esSeguridadIndustrial();
}


function quienEnvia() {
    if (esGerente()) return 'Gerencia General';
    const u = obtenerSesion();
    return u ? (u.area || 'Seguridad Industrial') : 'Seguridad Industrial';
}

function botonAlarmaMedidaHTML(tabla, medidaId) {
    // El boton de alarma se muestra en modo visualizacion
    if (!modoLectura) return '';
    if (!puedeEnviarAlarma()) return '';
    return `
        <button class="btn-alarma-fila" title="Enviar alarma manual" aria-label="Enviar alarma manual"
                onclick="enviarAlarmaMedidaManual('${tabla}', '${medidaId}', this)">
            <i class="fas fa-bell"></i>
        </button>
    `;
}

async function enviarAlarmaMedidaManual(tabla, medidaId, boton) {
    if (!puedeEnviarAlarma()) return;

    const medidas = tabla === 'antes' ? medidasAntesCache
        : tabla === 'despues' ? medidasDespuesCache
        : null;
    const medida = medidas?.find(item => String(item.id) === String(medidaId));
    if (!medida) {
        await mostrarAlerta('No se encontró la medida seleccionada.', 'No se pudo enviar', 'error');
        return;
    }

    const areas = [...new Set(String(medida.area || '').split('/').map(area => area.trim()).filter(Boolean))];
    if (areas.length === 0) {
        await mostrarAlerta('La medida no tiene un área responsable asignada.', 'Sin destinatario', 'warn');
        return;
    }

    const fase = tabla === 'antes' ? 'ANTES' : 'DESPUÉS';
    const confirmar = await mostrarConfirm(
        `Se enviará una alarma a ${areas.join(', ')} por la medida: ${medida.actividad}. ¿Continuar?`,
        'Enviar alarma manual',
        'warn'
    );
    if (!confirmar) return;

    const htmlOriginal = boton.innerHTML;
    boton.disabled = true;
    boton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    const enviados = [];
    const sinDispositivo = [];
    const errores = [];
    for (const area of areas) {
        try {
            const response = await fetch(`${SUPABASE_URL_FUNCTIONS}/send-push-notification`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                                        title: `⚠️ ${medida.actividad} · ${area}`.slice(0, 95),
                    body: `${quienEnvia()} solicita atención para esta medida:\n${medida.actividad}\nÁrea: ${area}\nPeríodo: ${medida.periodo || 'Sin período'}\nEstado: ${ETIQUETAS[medida.estado] || medida.estado || 'Sin estado'}`,
                    userId: area,
                    tipo: 'jefe'
                })
            });
            const resultado = await response.json().catch(() => ({}));
            if (!response.ok || !resultado.ok) {
                errores.push(area);
            } else if (!resultado.total_subs) {
                sinDispositivo.push(area);
            } else {
                enviados.push(area);
            }
        } catch (error) {
            console.error(`[ALARMA] Error enviando a ${area}:`, error);
            errores.push(area);
        }
    }

    boton.disabled = false;
    boton.innerHTML = htmlOriginal;

    const detalle = [
        enviados.length ? `Alarma enviada a: ${enviados.join(', ')}.` : '',
        sinDispositivo.length ? `Sin dispositivos registrados: ${sinDispositivo.join(', ')}.` : '',
        errores.length ? `No se pudo enviar a: ${errores.join(', ')}.` : ''
    ].filter(Boolean).join('\n');
    await mostrarAlerta(
        detalle || 'No se pudo enviar la alarma.',
        enviados.length ? 'Alarma procesada' : 'Error al enviar alarma',
        enviados.length ? 'info' : errores.length ? 'error' : 'warn'
    );
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

let usuariosLogin = [];
let areasResponsables = [];   // areas/secciones a cargo de los jefes

async function cargarAreasEnLogin() {
    // La tabla usuarios ya no se puede leer desde el navegador: la lista
    // de áreas la entrega la función login_areas() (sin contraseñas).
    const { data, error } = await db.rpc('login_areas');

    const selGerencia = document.getElementById('login-gerencia');

    if (error) {
        console.error('Error al cargar usuarios:', error);
        customSelectMenu.innerHTML = '<div class="custom-select-option">Error al cargar usuarios</div>';
        return;
    }

    usuariosLogin = (data || []).filter(u => u.area);

    // Areas responsables = secciones a cargo (no los nombres de las personas)
    const setAreas = new Set();
    usuariosLogin.forEach(u => {
        const sec = (u.seccion || '').trim();
        if (sec) setAreas.add(sec);
    });
    areasResponsables = [...setAreas].sort((a, b) => a.localeCompare(b, 'es'));

    const gerencias = [...new Set(usuariosLogin.map(u => u.gerencia_key).filter(Boolean))].sort();

    if (selGerencia) {
        selGerencia.innerHTML = '<option value="">Selecciona tu gerencia</option>' +
            gerencias.map(g => `<option value="${g}">${g}</option>`).join('');

        selGerencia.addEventListener('change', () => pintarUsuariosDeGerencia(selGerencia.value));
    }

    pintarUsuariosDeGerencia('');
}

function pintarUsuariosDeGerencia(gerencia) {
    const lista = gerencia
        ? usuariosLogin.filter(u => u.gerencia_key === gerencia)
        : usuariosLogin;

    areasCargadas = lista.map(u => u.area);

    customSelectMenu.innerHTML = '';
    if (lista.length === 0) {
        customSelectMenu.innerHTML = '<div class="custom-select-option">Sin usuarios en esta gerencia</div>';
    }
    areasCargadas.forEach(area => {
        const opt = document.createElement('div');
        opt.className = 'custom-select-option';
        opt.dataset.value = area;
        opt.textContent = area;
        customSelectMenu.appendChild(opt);
    });

    loginAreaHidden.value = '';
    if (customSelectValue) customSelectValue.textContent = 'Selecciona tu usuario';
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

    // Login contra la base: la función valida la contraseña, abre la sesión
    // del equipo y devuelve rol/sección. La tabla usuarios ya no se lee.
    const ses = await abrirSesionPanel(area, pass);

    if (!ses || !ses.ok) {
        err.textContent = 'Credenciales incorrectas. Verifica e inténtalo de nuevo.';
        return;
    }

    guardarSesion({
            area: area,
            rol: ses.rol,
            gerencia_key: ses.gerencia_key || null,
            seccion: ses.seccion || null
        });
    entrarApp();
}

async function cerrarSesion() {
    const ok = await mostrarConfirm('¿Cerrar sesión?', 'Cerrar sesión', 'warn');
    if (!ok) return;

    /* La cierra el propio usuario: la vigilancia no debe saltar */
    sesionPanelAnulada = true;
    if (temporizadorPanel) { clearInterval(temporizadorPanel); temporizadorPanel = null; }

    // Cierra la sesión en la base: deja de recibir alarmas aunque el token siga en el celular
    await cerrarSesionPanel();

    limpiarSesion();
    document.getElementById('login-password').value = '';
    document.getElementById('login-error').textContent = '';
    resetCustomSelect();
    mostrarPantalla('screen-login');
    document.getElementById('main-header').style.display = 'none';
    mostrarModoBotones(false);
    mostrarMenuLogin(true);

    await cargarAreasEnLogin();
    resetCustomSelect();
}

function mostrarPantalla(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    window.scrollTo(0, 0);
}


/* Quién ve el mapa: toda la Gerencia de Campo, el gerente directo de cada
   gerencia y César Chunga (el único que lo edita). Nadie más. */
const ROLES_JEFE_MAPA = ['gerente_general', 'gerencial_legal', 'gdo', 'gerente_campo'];

function puedeVerMapa(u) {
    if (!u) return false;
    if (ROLES_JEFE_MAPA.indexOf(u.rol) !== -1) return true;
    if (claveArea(u.gerencia_key || '').indexOf('gerencia de campo') === 0) return true;
    return claveArea((u.seccion || '') + ' ' + (u.area || '')).indexOf('chunga') !== -1;
}

function mostrarBotonMapa() {
    const b = document.getElementById('btn-mapa-plan');
    if (!b) return;
    const u = obtenerSesion();
    if (!u) { b.style.display = 'none'; return; }

    b.style.display = puedeVerMapa(u) ? 'flex' : 'none';
}

function aplicarVisibilidadGerente() {
    const vistaCompleta = esVistaCompleta();
    const gerenteReal   = esGerente();

    // Filtros de área: visibles para TODOS (todos ven el plan completo).
    // Historial y demás botones de gerente: solo roles con vista completa.
    document.querySelectorAll('.btn-solo-gerente').forEach(el => {
        if (el.tagName === 'SELECT') {
            el.style.display = 'inline-block';
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

    // Refrescar seccion/rol/gerencia desde la base (por si cambiaron)
    try {
        const { data } = await db.rpc('mi_perfil', { p_area: u.area });

        if (data) {
            const actualizada = {
                ...u,
                rol: data.rol || u.rol,
                gerencia_key: data.gerencia_key || u.gerencia_key,
                seccion: data.seccion || u.seccion
            };
            guardarSesion(actualizada);
        }
    } catch (e) {
        console.warn('No se pudo refrescar la sesión:', e);
    }

    document.getElementById('main-header').style.display = 'flex';
    mostrarMenuLogin(false);
    document.getElementById('user-name').textContent = u.area;

    /* La sesión vive en la base: se vigila que siga abierta */
    sesionPanelAnulada = false;
    try { vigilarSesionPanel(); } catch (e) { console.warn('vigilancia sesion', e); }

    aplicarVisibilidadGerente();
    mostrarBotonMapa();

    mostrarPantalla('screen-home');
    mostrarModoBotones(false);
    aplicarModoGuardado();

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




/* Mascara dd/mm/aaaa para el campo de periodo */
function mascaraFecha(ev) {
    const campo = ev.target;
    let v = campo.value.replace(/[^0-9]/g, '').slice(0, 8);
    if (v.length >= 5) v = v.slice(0, 2) + '/' + v.slice(2, 4) + '/' + v.slice(4);
    else if (v.length >= 3) v = v.slice(0, 2) + '/' + v.slice(2);
    campo.value = v;
}

function mostrarModoBotones(visible) {
    const m = document.getElementById('modo-toggle');
    if (m) m.style.display = visible ? 'flex' : 'none';
}

function mostrarMenuLogin(visible) {
    const m = document.getElementById('menu-hamburguesa');
    if (m) m.style.display = visible ? 'block' : 'none';
}

async function verificarSesion() {
    // La sesión se busca en la base con el id del equipo: si existe, se
    // recupera aunque se haya limpiado la cache del navegador.
    const u = await sesionDesdeBase();
    if (u) {
        entrarApp();
    } else {
        limpiarSesion();
        document.getElementById('main-header').style.display = 'none';
        mostrarPantalla('screen-login');
        mostrarMenuLogin(true);
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

/* Clave de comparacion: sin mayusculas, sin tildes, sin espacios de mas */
function claveArea(area) {
    return String(normalizarArea(area) || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function esGerente() {
    const u = obtenerSesion();
    return !!(u && u.rol === 'gerente_general');
}
/* Secciones con permiso para ver TODO el plan (aunque editen solo lo suyo) */
const SECCIONES_VISTA_TOTAL = ['COMUNICACIONES E IMAGEN CORPORATIVA'];

function esVistaCompleta() {
    const u = obtenerSesion();
    if (!u) return false;
    if (u.rol === 'gerente_general' || u.rol === 'gdo' || u.rol === 'gerencial_legal' || u.rol === 'gerente_campo') return true;

    const seccion = String(u.seccion || '').trim().toUpperCase();
    return SECCIONES_VISTA_TOTAL.includes(seccion);
}

function esSoloLectura() {
    const u = obtenerSesion();
    if (!u) return false;
    return u.rol === 'gdo' || u.rol === 'gerencial_legal';
}

/* Gerente de Campo: ve el plan completo y edita las medidas de las áreas de campo.
   No declara semáforo ni inicia planes de acción (eso es del Gerente General). */
const AREAS_GERENTE_CAMPO = ['ingenieria agricola', 'operaciones agricolas', 'administracion 3'];

function esGerenteCampo() {
    const u = obtenerSesion();
    return !!(u && u.rol === 'gerente_campo');
}

function medidaEsDeCampo(medida) {
    if (!medida || !medida.area) return false;
    return String(medida.area)
        .split('/')
        .map(claveArea)
        .filter(Boolean)
        .some(a => AREAS_GERENTE_CAMPO.indexOf(a) !== -1);
}


/* Seguridad Industrial puede asignar la medida a cualquier área. */
function esSeguridadIndustrial() {
    const u = obtenerSesion();
    if (!u || !u.area) return false;
    const texto = claveArea((String(u.seccion || '') + ' ' + String(u.area || '')));
    return texto.indexOf('seguridad industrial') !== -1;
}

/* Personas con edición total en Medidas antes / durante / después, igual que
   Seguridad Industrial, aunque su sección sea otra. Se comparan por nombre. */
const EDITAN_TODO = ['HIDALGO JAMANCA EVA'];

function esEditorTotal() {
    if (esSeguridadIndustrial()) return true;
    const u = obtenerSesion();
    if (!u) return false;
    const nombre = claveArea(u.area || '');
    if (!nombre) return false;
    return EDITAN_TODO.some(n => nombre.indexOf(claveArea(n)) === 0);
}

function puedeEditar(medida) {
    const user = obtenerSesion();
    if (!user) return false;
    if (esSoloLectura()) return false;
    if (modoLectura) return false;

    // Seguridad Industrial y los editores totales pueden editar cualquier area
    if (esEditorTotal()) return true;

    // Gerente de Campo edita solo las áreas de campo
    if (esGerenteCampo()) return medidaEsDeCampo(medida);

    if (user.rol === 'gerente_general') return false;
    if (!medida || !medida.area) return false;

    const areas = String(medida.area || '').split('/').map(claveArea).filter(Boolean);
    const misAreas = String(user.seccion || '').split('/').map(claveArea).filter(Boolean);

    return misAreas.some(a => areas.includes(a));
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

    /* Todas las áreas ven el plan completo.
       La edición sigue restringida por puedeEditar() a la propia área. */
    let result = medidas;

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

/* ===== NAVEGACION CON HISTORIAL (atras por pestaña) ===== */
function _verPlan() {
    mostrarModoBotones(false);
    document.querySelectorAll('.screen').forEach(sc => sc.classList.remove('active'));
    document.getElementById('screen-plan').classList.add('active');
    document.querySelectorAll('.section-view').forEach(v => v.classList.remove('active'));
    document.getElementById('section-menu').classList.add('active');
    const bc = document.getElementById('breadcrumb-menu');
    if (bc) bc.style.display = 'block';
    window.scrollTo(0, 0);
}

function _verSeccion(nombre) {
    _verPlan();
    mostrarModoBotones(true);
    document.querySelectorAll('.section-view').forEach(v => v.classList.remove('active'));
    document.getElementById('section-' + nombre).classList.add('active');
    const bc = document.getElementById('breadcrumb-menu');
    if (bc) bc.style.display = 'none';
    window.scrollTo(0, 0);
}

function _verInicio() {
    mostrarModoBotones(false);
    document.querySelectorAll('.screen').forEach(sc => sc.classList.remove('active'));
    document.getElementById('screen-home').classList.add('active');
    window.scrollTo(0, 0);
}

window.addEventListener('popstate', (e) => {
    const st = e.state || { v: 'home' };
    if (st.v === 'seccion') _verSeccion(st.s);
    else if (st.v === 'plan') _verPlan();
    else _verInicio();
});

function abrirPlan() {
    _verPlan();
    try { history.pushState({ v: 'plan' }, ''); } catch (e) {}
}

function volverInicio() {
    const st = history.state || {};
    if (st.v === 'plan' || st.v === 'seccion') { history.back(); return; }
    _verInicio();
}

function irASeccion(nombre) {
    if (nombre === 'menu') { abrirPlan(); return; }
    _verSeccion(nombre);
    try { history.pushState({ v: 'seccion', s: nombre }, ''); } catch (e) {}
}

function volverAlMenuPlan() {
    const st = history.state || {};
    if (st.v === 'seccion') { history.back(); return; }
    _verPlan();
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
    await cargarSegmentos();
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
    let _segAnt = '__x__';
    ordenarPorSegmento(filtradas, 'antes').forEach(act => {
        const _seg = act.segmento_id || null;
        if (_seg !== _segAnt) { _segAnt = _seg; tbody.insertAdjacentHTML('beforeend', filaSegmentoHTML(_seg, 'antes')); }
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
                ${botonAlarmaMedidaHTML('antes', act.id)}
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
            const confirmado = await confirmarCambioEstado(item.estado, nuevo);
            if (!confirmado) return;

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
    await cargarSegmentos();
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
    let _segAnt = '__x__';
    ordenarPorSegmento(filtradas, 'durante').forEach(act => {
        const _seg = act.segmento_id || null;
        if (_seg !== _segAnt) { _segAnt = _seg; tbody.insertAdjacentHTML('beforeend', filaSegmentoHTML(_seg, 'durante')); }
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
                    body: 'Gerencia General ha autorizado el inicio de los planes de acción.',
                    tipo: 'jefe'
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
    await cargarSegmentos();
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
    let _segAnt = '__x__';
    ordenarPorSegmento(filtradas, 'despues').forEach(act => {
        const _seg = act.segmento_id || null;
        if (_seg !== _segAnt) { _segAnt = _seg; tbody.insertAdjacentHTML('beforeend', filaSegmentoHTML(_seg, 'despues')); }
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
                ${botonAlarmaMedidaHTML('despues', act.id)}
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
            const confirmado = await confirmarCambioEstado(item.estado, nuevo);
            if (!confirmado) return;

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
    pintarSelectSegmento(tabla, null);

    const user = obtenerSesion();
    const seccionUsuario = (user.seccion || '').trim();
    if (esEditorTotal()) {
        agregarAreaFila(seccionUsuario, false, false);
    } else {
        agregarAreaFila(seccionUsuario, true, true);
    }

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
    pintarSelectSegmento(tabla, item.segmento_id || null);

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
    const fuente = (areasResponsables && areasResponsables.length) ? areasResponsables : areasCargadas;
    const vacia = areaSeleccionada ? '' : '<option value="" selected>Selecciona el área</option>';
    const opciones = vacia + fuente.map(a => {
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
    if (periodo && /^\d{4}-\d{2}-\d{2}$/.test(periodo)) {
        const [a, m, d] = periodo.split('-');
        periodo = d + '/' + m + '/' + a;   // se guarda como DD/MM/AAAA
    }
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
            segmento_id: document.getElementById('agregar-segmento')?.value || null,
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
            segmento_id: document.getElementById('agregar-segmento')?.value || null,
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

    // ── Si estamos DENTRO DE LA APP (Capacitor), usar el camino nativo ──
    // El WebView de Android no tiene el sistema de notificaciones web,
    // por eso dentro de la APK hay que usar el plugin nativo.
    if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) {
        return activarNotificacionesPushNativo(user);
    }

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

        // 4-5. Guardar token en Supabase
        // Siempre registrar por SECCION (nunca por el nombre de la persona)
        let clave = (user.seccion || '').trim();

        if (!clave) {
            const { data } = await db.rpc('mi_perfil', { p_area: user.area });
            clave = (data && data.seccion ? data.seccion : '').trim();
            if (clave) {
                guardarSesion({ ...user, seccion: clave });
                user.seccion = clave;
            }
        }

        if (!clave) {
            console.warn('[FCM] El usuario no tiene seccion asignada; no se registra el celular.');
            return;
        }

        await guardarTokenPush(clave, token);
    } catch (err) {
        console.error('[FCM] Error al activar notificaciones:', err);
    }
}

/* ------------------------------------------------------------
   Guarda el token FCM en Supabase.
   Lo usan tanto la web como la app nativa (es la misma tabla).
   ------------------------------------------------------------ */
async function guardarTokenPush(userId, token) {
    try {
        try { localStorage.setItem('pc_push_token', token); } catch (e) {}

        const { data: existente } = await db
            .from('push_subscriptions')
            .select('id, tipo')
            .eq('user_id', userId)
            .eq('token', token)
            .maybeSingle();

        if (existente) {
            console.log('[FCM] Token ya registrado para este usuario.');
            if (existente.tipo !== 'jefe') {
                await db.from('push_subscriptions')
                    .update({ tipo: 'jefe' })
                    .eq('id', existente.id);
            }
            await adjuntarTokenSesion(token);
            return;
        }

        const { error } = await db.from('push_subscriptions').insert({
            user_id: userId,
            token: token,
            tipo: 'jefe'
        });

        if (error) {
            console.error('[FCM] Error al guardar token:', error);
        } else {
            console.log('[FCM] Token guardado en Supabase.');
        }

        await adjuntarTokenSesion(token);
    } catch (err) {
        console.error('[FCM] Error al guardar token:', err);
    }
}

/* ------------------------------------------------------------
   Sesión del portal en la base (sesiones_panel).
   La sesión es una fila en la base, identificada por el equipo.
   Mientras exista, este equipo recibe las alarmas de jefe/gerencia.
   Al cerrar sesión se borra esa fila y deja de recibirlas, aunque el
   celular conserve su token de notificaciones.
   ------------------------------------------------------------ */

function tokenPushGuardado() {
    try { return localStorage.getItem('pc_push_token') || localStorage.getItem('pushToken') || ''; }
    catch (e) { return ''; }
}

/* ¿Este equipo tiene sesión abierta? La base manda. */
async function sesionDesdeBase() {
    const disp = dispositivoActual();
    if (!disp) return null;
    try {
        const { data, error } = await db.rpc('sesion_panel_por_dispositivo', { p_dispositivo: disp });
        if (error || !data || !data.ok) return null;
        const u = {
            area: data.user_id,
            rol: data.rol,
            gerencia_key: data.gerencia_key || null,
            seccion: data.seccion || null
        };
        guardarSesion(u);   // copia para la interfaz, no es la fuente de verdad
        // Copia de la clave para el semáforo; si se pierde, se vuelve a pedir aquí.
        try { localStorage.setItem('pc_sesion_clave', data.clave || ''); } catch (e) {}
        return u;
    } catch (e) {
        console.warn('[SESION] no se pudo consultar:', e);
        return null;
    }
}

/* ------------------------------------------------------------
   Vigilancia de la sesion del portal
   Cada medio minuto la base confirma si este equipo sigue con
   sesion abierta. Si la liberaron desde el panel, se vuelve al
   login y se avisa. Un fallo de red NO cierra la sesion.
   ------------------------------------------------------------ */
const MS_VIGILANCIA_PANEL = 30000;
let temporizadorPanel = null;
let sesionPanelAnulada = false;

async function panelSigueAbierto() {
    const disp = dispositivoActual();
    if (!disp) return 'error';
    try {
        const { data, error } = await db.rpc('sesion_panel_por_dispositivo', { p_dispositivo: disp });
        if (error) return 'error';
        if (!data || data.ok === false) return 'no';
        return 'si';
    } catch (e) {
        return 'error';
    }
}

function vigilarSesionPanel() {
    if (temporizadorPanel || sesionPanelAnulada) return;
    const revisar = async () => {
        if (sesionPanelAnulada) return;
        if (await panelSigueAbierto() === 'no') salirPorLiberacion();
    };
    temporizadorPanel = setInterval(revisar, MS_VIGILANCIA_PANEL);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) revisar(); });
}

/* Seguridad Industrial libero este equipo desde el panel */
function salirPorLiberacion() {
    if (sesionPanelAnulada) return;
    sesionPanelAnulada = true;
    if (temporizadorPanel) { clearInterval(temporizadorPanel); temporizadorPanel = null; }

    limpiarSesion();
    try { localStorage.removeItem('pc_sesion_clave'); } catch (e) {}

    document.getElementById('main-header').style.display = 'none';
    mostrarPantalla('screen-login');
    mostrarMenuLogin(true);
    mostrarModoBotones(false);
    cargarAreasEnLogin();
    mostrarAlerta(
        'Seguridad Industrial cerró tu sesión desde el panel. Vuelve a iniciar sesión con tu clave.',
        'Sesión cerrada',
        'warn'
    );
}

async function abrirSesionPanel(area, password) {
    try {
        const { data, error } = await db.rpc('abrir_sesion_panel', {
            p_area: area,
            p_password: password,
            p_dispositivo: dispositivoActual()
        });
        if (error || !data || !data.ok) {
            console.warn('[SESION] no se pudo abrir:', error ? error.message : data);
            return null;
        }
        try { localStorage.setItem('pc_sesion_clave', data.clave || ''); } catch (e) {}
        const t = tokenPushGuardado();
        if (t) await adjuntarTokenSesion(t);
        return data;
    } catch (e) {
        console.warn('[SESION] no se pudo abrir:', e);
        return null;
    }
}

async function adjuntarTokenSesion(token) {
    const disp = dispositivoActual();
    if (!disp || !token) return;
    try {
        const { error } = await db.rpc('adjuntar_token_dispositivo', { p_dispositivo: disp, p_token: token });
        if (error) console.warn('[SESION] no se pudo asociar el token:', error.message);
    } catch (e) {
        console.warn('[SESION] no se pudo asociar el token:', e);
    }
}

async function cerrarSesionPanel() {
    const disp = dispositivoActual();
    if (!disp) return;
    try { localStorage.removeItem('pc_sesion_clave'); } catch (e) {}
    try {
        const { error } = await db.rpc('cerrar_sesion_panel', { p_dispositivo: disp });
        if (error) console.warn('[SESION] no se pudo cerrar:', error.message);
    } catch (e) {
        console.warn('[SESION] no se pudo cerrar:', e);
    }
}

/* ============================================================
   NOTIFICACIONES PUSH NATIVAS (dentro de la APP Android)
   Usa el plugin de Capacitor porque el WebView no tiene
   el sistema de notificaciones web del navegador.
   ============================================================ */
async function activarNotificacionesPushNativo(user) {
    const esNativo = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
    console.log('[PUSH] Entorno nativo:', esNativo);

    // El plugin puede llegar por dos vias segun como se cargue; aceptamos ambas
    const PN = (window.capacitorPushNotifications && window.capacitorPushNotifications.PushNotifications)
        || (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications)
        || null;

    if (!PN) {
        console.log('[PUSH] Plugin nativo de notificaciones no disponible. capacitorExports:', typeof window.capacitorExports);
        return;
    }
    console.log('[PUSH] Plugin nativo encontrado OK');

    try {
        // 1. Pedir permiso (Android 13+ muestra el dialogo en pantalla)
        let perm = await PN.checkPermissions();
        if (perm.receive !== 'granted') {
            perm = await PN.requestPermissions();
        }
        if (perm.receive !== 'granted') {
            console.log('[PUSH] Permiso de notificaciones denegado.');
            return;
        }

        // Preparar el sistema de ALARMA nativa (pantalla completa + sonido)
        inicializarAlarmaNativa();

        // 2. Token nativo -> guardarlo en Supabase
        PN.addListener('registration', async (token) => {
            console.log('[PUSH] Token nativo obtenido:', String(token.value).slice(0, 20) + '...');
            await guardarTokenPush(user.area, token.value);
        });

        PN.addListener('registrationError', (err) => {
            console.error('[PUSH] Error al registrar el dispositivo:', err);
        });

        // 3. Notificacion recibida con la app abierta
        PN.addListener('pushNotificationReceived', (n) => {
            console.log('[PUSH] Recibida en primer plano:', n);
            if (typeof mostrarAlerta === 'function') {
                mostrarAlerta(n.body || '', n.title || 'Aviso', 'info');
            }
        });

        // 4. Notificacion tocada por el usuario
        PN.addListener('pushNotificationActionPerformed', (a) => {
            console.log('[PUSH] Notificacion abierta:', a);
        });

        await PN.register();
    } catch (err) {
        console.error('[PUSH] Error al activar notificaciones nativas:', err);
    }
}

/* ============================================================
   ALARMA NATIVA (pantalla completa + sonido en bucle + vibracion)
   ============================================================ */
function obtenerPluginAlarma() {
    return (window.alarmaExports && window.alarmaExports.Alarma)
        || (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Alarma)
        || null;
}

async function inicializarAlarmaNativa() {
    const Alarma = obtenerPluginAlarma();
    if (!Alarma) {
        console.log('[ALARMA] Plugin nativo no disponible.');
        return;
    }
    console.log('[ALARMA] Plugin nativo encontrado OK');

    try {
        const estado = await Alarma.puedePantallaCompleta();
        console.log('[ALARMA] Puede pantalla completa:', estado.puede, '| Android API:', estado.android);
        if (!estado.puede) {
            mostrarAvisoPermisoAlarma(Alarma);
        }
    } catch (e) {
        console.error('[ALARMA] Error consultando el permiso:', e);
    }
}

function mostrarAvisoPermisoAlarma(Alarma) {
    if (document.getElementById('aviso-permiso-alarma')) return;
    const d = document.createElement('div');
    d.id = 'aviso-permiso-alarma';
    d.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99998;background:#B45309;color:#fff;padding:12px 16px;font-size:13px;font-family:inherit;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;box-shadow:0 4px 14px rgba(0,0,0,.25);';
    const txt = document.createElement('span');
    txt.innerHTML = '\u26A0\uFE0F Falta activar <b>\u201CPantalla completa\u201D</b> para que la alarma se abra sola.';
    const btn = document.createElement('button');
    btn.textContent = 'Activar ahora';
    btn.style.cssText = 'background:#fff;color:#B45309;border:none;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer;font-family:inherit;';
    btn.addEventListener('click', async () => {
        try {
            await Alarma.abrirAjustesPantallaCompleta();
        } catch (e) {
            console.error('[ALARMA] No se pudieron abrir los ajustes:', e);
        }
    });
    d.appendChild(txt);
    d.appendChild(btn);
    document.body.appendChild(d);
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
   NUMEROS LLAMABLES
   Convierte los celulares del diagrama en enlaces tel:
   para que al tocarlos se abra el marcador con el numero puesto.
   ============================================================ */
function activarNumerosLlamables(raiz) {
    const cont = raiz || document.getElementById('section-flujo');
    if (!cont) return;

    const patron = /(^|\D)(9\d{8})(?!\d)/g;
    const walker = document.createTreeWalker(cont, NodeFilter.SHOW_TEXT, null);
    const nodos = [];
    while (walker.nextNode()) nodos.push(walker.currentNode);

    nodos.forEach((nodo) => {
        const texto = nodo.nodeValue || '';
        if (!texto.match(/9\d{8}/)) return;
        if (nodo.parentElement && nodo.parentElement.classList.contains('tel-link')) return;

        const frag = document.createDocumentFragment();
        let ultimo = 0;
        let m;
        patron.lastIndex = 0;

        while ((m = patron.exec(texto)) !== null) {
            const numero = m[2];
            frag.appendChild(document.createTextNode(texto.slice(ultimo, m.index) + m[1]));

            const a = document.createElement('a');
            a.href = 'tel:+51' + numero;
            a.className = 'tel-link';
            a.textContent = numero;
            a.title = 'Llamar al ' + numero;
            frag.appendChild(a);

            ultimo = m.index + m[0].length;
        }

        if (ultimo === 0) return;
        frag.appendChild(document.createTextNode(texto.slice(ultimo)));
        nodo.parentNode.replaceChild(frag, nodo);
    });
}


/* ============================================================
   CAMBIAR CONTRASEÑA (cada usuario la suya)
   ============================================================ */
function abrirModalPassword() {
    const user = obtenerSesion();
    if (!user) return;
    document.getElementById('pass-actual').value = '';
    document.getElementById('pass-nueva').value = '';
    document.getElementById('pass-repetir').value = '';
    document.getElementById('pass-error').style.display = 'none';
    document.getElementById('modal-password').style.display = 'flex';
}

function cerrarModalPassword() {
    document.getElementById('modal-password').style.display = 'none';
}

async function guardarPassword() {
    const user = obtenerSesion();
    if (!user) return;

    const actual = document.getElementById('pass-actual').value;
    const nueva = document.getElementById('pass-nueva').value;
    const repetir = document.getElementById('pass-repetir').value;
    const error = document.getElementById('pass-error');
    const btn = document.getElementById('btn-guardar-pass');

    const fallar = (msg) => { error.textContent = msg; error.style.display = 'block'; };

    error.style.display = 'none';
    if (!actual || !nueva || !repetir) return fallar('Completa los tres campos.');
    if (nueva.length < 6) return fallar('La nueva contraseña debe tener al menos 6 caracteres.');
    if (nueva !== repetir) return fallar('Las contraseñas nuevas no coinciden.');

    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
        const { data, error: err } = await db.rpc('cambiar_password', {
            p_area: user.area,
            p_actual: actual,
            p_nueva: nueva
        });

        if (err) throw err;
        if (!data) return fallar('La contraseña actual no es correcta.');

        cerrarModalPassword();
        await mostrarAlerta('Tu contraseña se actualizó correctamente.', 'Listo', 'info');
    } catch (e) {
        console.error(e);
        fallar('No se pudo cambiar la contraseña.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Guardar';
    }
}


/* ===== SEGMENTOS ===== */
let segmentosCache = [];
let modoLectura = false;

async function cargarSegmentos() {
    try {
        const { data } = await db.from('segmentos').select('*').order('orden', { ascending: true });
        segmentosCache = data || [];
    } catch (e) { segmentosCache = []; }
    return segmentosCache;
}

function segmentosDe(tabla) {
    return segmentosCache.filter(s => s.tabla === tabla).sort((a, b) => (a.orden - b.orden));
}

function nombreSegmento(id) {
    const s = segmentosCache.find(x => x.id === id);
    return s ? s.nombre : 'Sin segmento';
}

function ordenarPorSegmento(lista, tabla) {
    const orden = new Map();
    segmentosDe(tabla).forEach((s, i) => orden.set(s.id, i));
    return lista.slice().sort((a, b) => {
        const oa = a.segmento_id && orden.has(a.segmento_id) ? orden.get(a.segmento_id) : 999;
        const ob = b.segmento_id && orden.has(b.segmento_id) ? orden.get(b.segmento_id) : 999;
        return oa - ob;
    });
}

function filaSegmentoHTML(segId, tabla) {
    const lista = segmentosDe(tabla);
    const idx = lista.findIndex(s => s.id === segId);
    const nombre = segId ? nombreSegmento(segId) : 'Sin segmento';
    const acc = segId ? `<span class="seg-acciones">
        <button type="button" class="seg-flecha" onclick="moverSegmento('${segId}',-1)" ${idx <= 0 ? 'disabled' : ''}>&#8593;</button>
        <button type="button" class="seg-flecha" onclick="moverSegmento('${segId}',1)" ${idx >= lista.length - 1 ? 'disabled' : ''}>&#8595;</button>
        <button type="button" class="seg-flecha" onclick="renombrarSegmento('${segId}')">&#9998;</button>
        <button type="button" class="seg-flecha" onclick="eliminarSegmento('${segId}')">&#10005;</button>
    </span>` : '';
    return `<tr class="fila-segmento"><td colspan="7"><div class="seg-cabecera"><span class="seg-nombre">${nombre}</span>${acc}</div></td></tr>`;
}

let pedirTextoResolver = null;
function pedirTexto(titulo, valor, sub) {
    return new Promise((resolve) => {
        pedirTextoResolver = resolve;
        document.getElementById('texto-titulo').textContent = titulo || '';
        document.getElementById('texto-sub').textContent = sub || '';
        const campo = document.getElementById('texto-input');
        campo.value = valor || '';
        document.getElementById('modal-texto').style.display = 'flex';
        setTimeout(() => { campo.focus(); campo.select(); }, 60);
    });
}
function cerrarPedirTexto(valor) {
    document.getElementById('modal-texto').style.display = 'none';
    const r = pedirTextoResolver;
    pedirTextoResolver = null;
    if (r) r(valor);
}

async function nuevoSegmento(tabla) {
    const nombre = await pedirTexto('Nuevo segmento', '', 'Nombre del segmento');
    if (nombre === null || !nombre.trim()) return;
    await db.from('segmentos').insert({ tabla, nombre: nombre.trim(), orden: segmentosDe(tabla).length });
    await cargarSegmentos();
    recargarTabla(tabla);
}

async function moverSegmento(id, delta) {
    const seg = segmentosCache.find(s => s.id === id);
    if (!seg) return;
    const lista = segmentosDe(seg.tabla);
    const i = lista.findIndex(s => s.id === id);
    const j = i + delta;
    if (j < 0 || j >= lista.length) return;
    await db.from('segmentos').update({ orden: lista[j].orden }).eq('id', lista[i].id);
    await db.from('segmentos').update({ orden: lista[i].orden }).eq('id', lista[j].id);
    await cargarSegmentos();
    recargarTabla(seg.tabla);
}

async function renombrarSegmento(id) {
    const seg = segmentosCache.find(s => s.id === id);
    if (!seg) return;
    const nuevo = await pedirTexto('Renombrar segmento', seg.nombre, 'Nuevo nombre');
    if (nuevo === null || !nuevo.trim()) return;
    await db.from('segmentos').update({ nombre: nuevo.trim() }).eq('id', id);
    await cargarSegmentos();
    recargarTabla(seg.tabla);
}

async function eliminarSegmento(id) {
    const seg = segmentosCache.find(s => s.id === id);
    if (!seg) return;
    const ok = await mostrarConfirm('Las actividades quedaran en "Sin segmento". Continuar?', 'Eliminar segmento', 'warn');
    if (!ok) return;
    await db.from('segmentos').delete().eq('id', id);
    await cargarSegmentos();
    recargarTabla(seg.tabla);
}

function recargarTabla(tabla) {
    if (tabla === 'antes') cargarMedidasAntes();
    else if (tabla === 'durante') cargarMedidasDurante();
    else cargarMedidasDespues();
}

function pintarSelectSegmento(tabla, seleccionado) {
    const sel = document.getElementById('agregar-segmento');
    if (!sel) return;
    sel.innerHTML = '<option value="">Sin segmento</option>' + segmentosDe(tabla)
        .map(s => `<option value="${s.id}" ${s.id === seleccionado ? 'selected' : ''}>${s.nombre}</option>`).join('');
    sel.value = seleccionado || '';
}


/* ===== AVANCES DE EJECUCION ===== */
let avanceCtx = { tabla: null, medidaId: null, medida: null };

function medidaDeCache(tabla, id) {
    const cache = tabla === 'antes' ? medidasAntesCache
        : tabla === 'durante' ? medidasDuranteCache : medidasDespuesCache;
    return (cache || []).find(m => String(m.id) === String(id)) || null;
}

async function abrirModalAvance(tabla, medidaId) {
    const medida = medidaDeCache(tabla, medidaId);
    avanceCtx = { tabla, medidaId, medida };
    document.getElementById('avance-actividad').textContent = medida ? medida.actividad : '';
    document.getElementById('avance-texto').value = '';
    const puede = puedeEditar(medida);
    const estado = medida ? medida.estado : 'no-iniciado';
    const finalizado = estado === 'finalizado';

    document.getElementById('avance-form').style.display = (puede && !finalizado) ? 'block' : 'none';
    const reinicio = document.getElementById('avance-reiniciar');
    if (reinicio) reinicio.style.display = (puede && finalizado) ? 'block' : 'none';

    const btnIniciar = document.getElementById('btn-avance-iniciar');
    const btnFinalizar = document.getElementById('btn-avance-finalizar');
    if (btnIniciar) btnIniciar.style.display = (puede && !finalizado && estado !== 'en-ejecucion') ? 'inline-block' : 'none';
    if (btnFinalizar) btnFinalizar.style.display = (puede && estado === 'en-ejecucion') ? 'inline-block' : 'none';

    const titulo = document.getElementById('avance-titulo');
    const etiqueta = document.getElementById('avance-etiqueta');
    if (titulo) titulo.textContent = (estado === 'no-iniciado') ? 'Compromisos de la actividad' : 'Avance de ejecución';
    if (etiqueta) etiqueta.textContent = (estado === 'no-iniciado') ? 'NUEVO COMPROMISO' : 'NUEVO AVANCE';
    document.getElementById('modal-avance').style.display = 'flex';
    await cargarAvances();
}

function cerrarModalAvance() {
    document.getElementById('modal-avance').style.display = 'none';
}

function escaparTexto(t) {
    const d = document.createElement('div');
    d.textContent = t || '';
    return d.innerHTML;
}

async function cargarAvances() {
    const cont = document.getElementById('avance-lista');
    cont.innerHTML = '<p style="color:#94a3b8;font-size:.85rem;">Cargando...</p>';
    const { data } = await db.from('medidas_avances').select('*')
        .eq('tabla', avanceCtx.tabla).eq('medida_id', String(avanceCtx.medidaId))
        .order('created_at', { ascending: true });
    if (!data || data.length === 0) {
        cont.innerHTML = '<p style="color:#94a3b8;font-size:.85rem;">Aún no hay avances registrados.</p>';
        return;
    }
    const puede = puedeEditar(avanceCtx.medida);
    const verMeta = esEditorTotal();   // Seguridad Industrial y editores totales ven fecha y autor
    cont.innerHTML = data.map(a => {
        const f = new Date(a.created_at);
        const fecha = f.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) +
                      ' · ' + f.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
        return `<div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;">
            <div style="display:flex;justify-content:space-between;gap:8px;">
                <span style="font-size:.72rem;color:#94a3b8;">${verMeta ? fecha + ' · ' + (a.autor || 'Sin autor') : ''}</span>
                ${puede ? `<span style="display:flex;gap:6px;">
                    <button type="button" onclick="editarAvance('${a.id}')" style="border:none;background:#f1f5f9;border-radius:8px;padding:4px 8px;font-size:.72rem;cursor:pointer;">Editar</button>
                    <button type="button" onclick="eliminarAvance('${a.id}')" style="border:none;background:#fef2f2;border-radius:8px;padding:4px 8px;font-size:.72rem;color:#b91c1c;cursor:pointer;">Eliminar</button>
                </span>` : ''}
            </div>
            <p style="margin:8px 0 0;font-size:.87rem;white-space:pre-wrap;">${escaparTexto(a.texto)}</p>
        </div>`;
    }).join('');
}

async function guardarAvance() {
    const area = document.getElementById('avance-texto');
    const texto = area.value.trim();
    if (!texto) { await mostrarAlerta('Escribe el avance antes de guardar.', 'Falta el texto', 'warn'); return; }
    const user = obtenerSesion();
    const { error } = await db.from('medidas_avances').insert({
        tabla: avanceCtx.tabla, medida_id: String(avanceCtx.medidaId), texto, autor: user ? user.area : null
    });
    if (error) { await mostrarAlerta('No se pudo guardar el avance.', 'Error', 'error'); return; }
    area.value = '';
    await cargarAvances();
}

async function editarAvance(id) {
    const { data } = await db.from('medidas_avances').select('texto').eq('id', id).maybeSingle();
    const nuevo = await pedirTexto('Editar avance', data ? data.texto : '', 'Modifica el texto');
    if (nuevo === null || !nuevo.trim()) return;
    await db.from('medidas_avances').update({ texto: nuevo.trim(), updated_at: new Date().toISOString() }).eq('id', id);
    await cargarAvances();
}

async function eliminarAvance(id) {
    const ok = await mostrarConfirm('¿Eliminar este avance?', 'Eliminar avance', 'warn');
    if (!ok) return;
    await db.from('medidas_avances').delete().eq('id', id);
    await cargarAvances();
}



async function iniciarDesdeAvance() {
    const ok = await mostrarConfirm('¿Iniciar la ejecución de esta actividad?', 'Iniciar ejecución', 'info');
    if (!ok) return;
    const tabla = avanceCtx.tabla === 'antes' ? 'medidas_antes'
        : avanceCtx.tabla === 'durante' ? 'medidas_durante' : 'medidas_despues';
    await db.from(tabla).update({ estado: 'en-ejecucion', updated_at: new Date().toISOString() }).eq('id', avanceCtx.medidaId);
    cerrarModalAvance();
    recargarTabla(avanceCtx.tabla);
}

async function reiniciarDesdeAvance() {
    const ok = await mostrarConfirm('¿Volver esta actividad a "No iniciado"?', 'Reiniciar ejecución', 'warn');
    if (!ok) return;
    const tabla = avanceCtx.tabla === 'antes' ? 'medidas_antes'
        : avanceCtx.tabla === 'durante' ? 'medidas_durante' : 'medidas_despues';
    await db.from(tabla).update({ estado: 'no-iniciado', updated_at: new Date().toISOString() }).eq('id', avanceCtx.medidaId);
    cerrarModalAvance();
    recargarTabla(avanceCtx.tabla);
}

async function finalizarDesdeAvance() {
    const ok = await mostrarConfirm('¿Marcar esta actividad como Finalizada?', 'Finalizar ejecución', 'info');
    if (!ok) return;
    const tabla = avanceCtx.tabla === 'antes' ? 'medidas_antes'
        : avanceCtx.tabla === 'durante' ? 'medidas_durante' : 'medidas_despues';
    await db.from(tabla).update({ estado: 'finalizado', updated_at: new Date().toISOString() }).eq('id', avanceCtx.medidaId);
    cerrarModalAvance();
    recargarTabla(avanceCtx.tabla);
}

document.addEventListener('click', (e) => {
    const badge = e.target.closest('.badge-estado');
    if (!badge) return;
    const id = badge.dataset.id;
    const tabla = medidasAntesCache.some(m => String(m.id) === String(id)) ? 'antes'
        : medidasDuranteCache.some(m => String(m.id) === String(id)) ? 'durante'
        : medidasDespuesCache.some(m => String(m.id) === String(id)) ? 'despues' : null;
    if (!tabla) return;
    const medida = medidaDeCache(tabla, id);
    if (medida && (medida.estado === 'en-ejecucion' || medida.estado === 'finalizado' || medida.estado === 'no-iniciado')) {
        e.stopPropagation();
        e.preventDefault();
        abrirModalAvance(tabla, id);
    }
}, true);


/* ===== MODO VISUALIZACION / EDICION ===== */
function cambiarModo(modo) {
    modoLectura = (modo === 'lectura');
    document.body.classList.toggle('modo-lectura', modoLectura);
    localStorage.setItem('modoPlan', modo);

    const v = document.getElementById('btn-modo-ver');
    const e = document.getElementById('btn-modo-editar');
    if (v) { v.style.background = modoLectura ? '#dcfce7' : '#fff'; v.style.borderColor = modoLectura ? '#86efac' : '#e2e8f0'; }
    if (e) { e.style.background = modoLectura ? '#fff' : '#dcfce7'; e.style.borderColor = modoLectura ? '#e2e8f0' : '#86efac'; }

    cargarMedidasAntes();
    cargarMedidasDurante();
    cargarMedidasDespues();
}

function aplicarModoGuardado() {
    cambiarModo(localStorage.getItem('modoPlan') || 'edicion');
}

/* ============================================================
   INICIO
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    inicializarFiltros();
    inicializarFiltrosDurante();
    inicializarFiltrosDespues();
    inicializarFiltrosArea();
    mostrarModoBotones(false);
    const campoPeriodo = document.getElementById('agregar-periodo');
    if (campoPeriodo) campoPeriodo.addEventListener('input', mascaraFecha);

    verificarSesion();
    activarNumerosLlamables();

    if (!history.state) { try { history.replaceState({ v: 'home' }, ''); } catch (e) {} }
});
