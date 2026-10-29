/* ============================================================
   COMPUERTAS: panel de administraciones, estados y responsables
   Solo visible para Seguridad Industrial.
   Todo sale de la base: compuertas y compuertas_contactos.
   ============================================================ */

const PC_ADMINISTRACIONES = [
    { id: 'Administracion 1', titulo: 'Administración 1', subtitulo: 'Huayto · Upacá' },
    { id: 'Administracion 2', titulo: 'Administración 2', subtitulo: 'Lateral Molle y ramales' },
    { id: 'Administracion 3', titulo: 'Administración 3', subtitulo: 'Cerro Blanco · Lampay · Paramonga' }
];

const PC_MENSAJE_TABLA = 'Falta la tabla de responsables en la base. Ejecuta el SQL (sql/compuertas_responsables.sql) y vuelve a intentar.';

let pcAdminActual = 'Administracion 3';
let pcCompuertas = [];
let pcContactos = {};        /* id de compuerta -> lista de responsables */
let pcTablaContactos = true; /* false si aún no existe compuertas_contactos */
let pcCargando = false;

/* ------------------------------------------------------------
   Utilidades
   ------------------------------------------------------------ */
function pcEscape(t) {
    return String(t == null ? '' : t)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function pcNormalizar(v) {
    return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

/* Deja el celular en 9 dígitos (acepta +51, espacios y guiones) */
function pcTelefono(valor) {
    let d = String(valor || '').replace(/\D/g, '');
    if (d.length === 11 && d.indexOf('51') === 0) d = d.slice(2);
    if (d.length === 12 && d.indexOf('051') === 0) d = d.slice(3);
    return d;
}

function pcFecha(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/* ------------------------------------------------------------
   Permisos: solo Seguridad Industrial
   ------------------------------------------------------------ */
function pcPuedeVer() {
    try {
        const u = JSON.parse(localStorage.getItem('pc_user') || 'null');
        if (!u) return false;
        const texto = pcNormalizar(String(u.seccion || '') + ' ' + String(u.area || '') + ' ' + String(u.nombre || ''));
        return texto.includes('seguridad industrial') || texto.includes('chunga');
    } catch (e) { return false; }
}

function pcUsuario() {
    try {
        const u = JSON.parse(localStorage.getItem('pc_user') || 'null');
        return u ? (u.nombre || u.area || 'Seguridad Industrial') : 'Seguridad Industrial';
    } catch (e) { return 'Seguridad Industrial'; }
}

/* ------------------------------------------------------------
   Datos
   ------------------------------------------------------------ */
async function pcCargar() {
    const [resGates, resCont] = await Promise.all([
        db.from('compuertas')
            .select('id, administracion, nombre, estado, actualizado_por, actualizado_en')
            .order('nombre'),
        db.from('compuertas_contactos')
            .select('id, compuerta_id, nombre, cargo, telefono')
            .order('id')
    ]);

    if (resGates.error) {
        console.warn('compuertas', resGates.error);
        return 'No se pudieron leer las compuertas: ' + resGates.error.message;
    }

    pcCompuertas = resGates.data || [];

    if (resCont.error) {
        /* La tabla aún no existe: se avisa en el detalle */
        pcTablaContactos = false;
        pcContactos = {};
    } else {
        pcTablaContactos = true;
        const mapa = {};
        (resCont.data || []).forEach(fila => {
            const k = fila.compuerta_id;
            if (!mapa[k]) mapa[k] = [];
            mapa[k].push(fila);
        });
        pcContactos = mapa;
    }
    return null;
}

/* Responsables de una compuerta: siempre los que están en la base */
function pcContactosDe(c) {
    return (pcContactos[c.id] || []).map(p => ({
        id: p.id, nombre: p.nombre, cargo: p.cargo, telefono: p.telefono
    }));
}

/* ------------------------------------------------------------
   Panel principal
   ------------------------------------------------------------ */
function pcAbrir() {
    const panel = document.getElementById('pc-panel');
    if (!panel) return;
    panel.style.display = 'flex';
    pcBloquearFondo(true);
    pcPintar();
    pcPintarUnidades();
    pcPintarSesiones();
}

function pcCerrar() {
    const panel = document.getElementById('pc-panel');
    if (panel) panel.style.display = 'none';
    pcCerrarDetalle();
    pcBloquearFondo(false);
}

/* Evita que la pagina se arrastre de lado mientras el panel esta abierto */
function pcBloquearFondo(bloquear) {
    const html = document.documentElement;
    if (bloquear) {
        if (html.dataset.pcOverflow === undefined) html.dataset.pcOverflow = html.style.overflow || '';
        html.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
    } else {
        html.style.overflow = html.dataset.pcOverflow || '';
        delete html.dataset.pcOverflow;
        document.body.style.overflow = '';
    }
}

async function pcPintar() {
    const grid = document.getElementById('pc-grid');
    if (!grid) return;
    if (pcCargando) return;
    pcCargando = true;

    const admin = PC_ADMINISTRACIONES.find(a => a.id === pcAdminActual) || PC_ADMINISTRACIONES[0];
    const titulo = document.getElementById('pc-admin');
    const sub = document.getElementById('pc-sub');
    if (titulo) titulo.textContent = admin.titulo;
    if (sub) sub.textContent = admin.subtitulo;

    document.querySelectorAll('.pc-tab').forEach(b => {
        b.classList.toggle('activo', b.dataset.admin === pcAdminActual);
    });

    grid.innerHTML = '<div class="pc-vacio">Cargando compuertas…</div>';
    const error = await pcCargar();
    pcCargando = false;

    if (error) {
        grid.innerHTML = '<div class="pc-aviso error">' + pcEscape(error) + '</div>';
        return;
    }

    const lista = pcCompuertas.filter(c => c.administracion === pcAdminActual);
    grid.innerHTML = '';

    if (!lista.length) {
        grid.innerHTML = '<div class="pc-vacio">Sin compuertas registradas para esta administración.<br>Añade una con el botón de arriba.</div>';
        return;
    }

    lista.forEach(c => {
        const abierta = (c.estado || 'cerrada') === 'abierta';
        const cuantos = pcContactosDe(c).length;

        const card = document.createElement('div');
        card.className = 'pc-card ' + (abierta ? 'abierta' : 'cerrada');
        card.setAttribute('role', 'button');
        card.tabIndex = 0;
        card.innerHTML =
            '<button type="button" class="pc-chip ' + (abierta ? 'abierta' : 'cerrada') + '" ' +
            'title="Cambiar estado">' + (abierta ? 'Abierto' : 'Cerrado') + '</button>' +
            (pcPuedeVer() ? '<button type="button" class="pc-borrar" title="Eliminar compuerta" ' +
                'aria-label="Eliminar compuerta"><i class="fas fa-xmark"></i></button>' : '') +
            '<div class="pc-gate">' +
            '<img src="assets/compuertas/gate-' + (abierta ? 'green' : 'red') + '.gif" alt="" loading="lazy">' +
            '</div>' +
            '<div class="pc-nombre">' + pcEscape(c.nombre) + '</div>' +
            '<div class="pc-hint">' + cuantos + ' responsable' + (cuantos === 1 ? '' : 's') + '</div>';

        /* Arriba a la izquierda: estado. Un toque lo cambia (con aviso previo) */
        const chip = card.querySelector('.pc-chip');
        chip.addEventListener('click', (ev) => {
            ev.stopPropagation();
            pcPedirCambioEstado(c);
        });

        /* Arriba a la derecha: eliminar la compuerta (con aviso previo) */
        const borrar = card.querySelector('.pc-borrar');
        if (borrar) {
            borrar.addEventListener('click', (ev) => {
                ev.stopPropagation();
                pcPedirEliminarCompuerta(c, cuantos);
            });
        }

        /* El resto de la tarjeta abre los responsables */
        card.addEventListener('click', () => pcDetalle(c));
        card.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pcDetalle(c); }
        });

        grid.appendChild(card);
    });
}

/* ------------------------------------------------------------
   Detalle de una compuerta
   ------------------------------------------------------------ */
function pcAviso(caja, texto, esError) {
    const aviso = caja.querySelector('#pc-aviso');
    if (!aviso) return;
    aviso.textContent = texto || '';
    aviso.className = 'pc-aviso' + (esError ? ' error' : '');
    aviso.style.display = texto ? 'block' : 'none';
}

function pcDetalle(c) {
    const caja = document.getElementById('pc-detalle');
    if (!caja) return;

    const abierta = (c.estado || 'cerrada') === 'abierta';
    const contactos = pcContactosDe(c);

    let html = '<div class="pc-detalle-caja">';

    html += '<div class="pc-detalle-head">' +
        '<img src="assets/compuertas/gate-' + (abierta ? 'green' : 'red') + '.gif" alt="">' +
        '<div><h3>' + pcEscape(c.nombre) + '</h3>' +
        '<span class="pc-estado ' + (abierta ? 'ok' : 'no') + '">' + (abierta ? 'ABIERTA' : 'CERRADA') + '</span></div>' +
        '</div>';

    if (c.actualizado_por) {
        html += '<p class="pc-nota">Último cambio: ' + pcEscape(c.actualizado_por) +
            (c.actualizado_en ? ' · ' + pcEscape(pcFecha(c.actualizado_en)) : '') + '</p>';
    }

    html += '<div id="pc-aviso" class="pc-aviso" style="display:none"></div>';

    if (pcPuedeVer() && !pcTablaContactos) {
        html += '<div class="pc-banner">' + pcEscape(PC_MENSAJE_TABLA) + '</div>';
    }

    html += '<div class="pc-lista" id="pc-lista">';
    if (!contactos.length) {
        html += '<p class="pc-vacio">Sin responsables registrados.</p>';
    }
    contactos.forEach(p => {
        html += '<div class="pc-persona">';
        html += '<a class="pc-p-link" href="tel:+51' + pcEscape(p.telefono) + '">' +
            '<span class="pc-p-nombre">' + pcEscape(p.nombre) + '</span>' +
            '<span class="pc-p-cargo">' + pcEscape(p.cargo || '') + '</span>' +
            '<span class="pc-p-tel"><i class="fas fa-phone"></i> ' + pcEscape(p.telefono) + '</span>' +
            '</a>';
        html += '<button type="button" class="pc-p-del" data-quitar="' + p.id + '" aria-label="Quitar responsable">' +
            '<i class="fas fa-trash"></i></button>';
        html += '</div>';
    });
    html += '</div>';

    html += '<div class="pc-pie" id="pc-pie"></div>';
    html += '</div>';

    caja.innerHTML = html;
    caja.style.display = 'flex';

    /* Quitar responsables */
    caja.querySelectorAll('[data-quitar]').forEach(b => {
        b.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            pcQuitarResponsable(c, Number(b.dataset.quitar), caja);
        });
    });

    pcPintarPie(c, caja);
}

/* Pie fijo del detalle: los botones quedan siempre a la vista */
function pcPintarPie(c, caja) {
    const pie = caja.querySelector('#pc-pie');
    if (!pie) return;

    const abierta = (c.estado || 'cerrada') === 'abierta';
    let h = '';

    if (pcPuedeVer()) {
        if (pcTablaContactos) {
            h += '<button type="button" class="pc-btn-add" id="pc-add-persona">' +
                '<i class="fas fa-user-plus"></i> Añadir responsable</button>';
        }

        h += '<button type="button" class="pc-volver" id="pc-volver">Volver</button>';
    } else {
        h += '<button type="button" class="pc-volver" id="pc-volver">Volver</button>';
    }

    pie.innerHTML = h;

    const volver = pie.querySelector('#pc-volver');
    if (volver) volver.addEventListener('click', pcCerrarDetalle);

    const add = pie.querySelector('#pc-add-persona');
    if (add) add.addEventListener('click', () => pcFormularioResponsable(c, caja));
}

/* El formulario de alta ocupa el pie mientras se escribe */
function pcFormularioResponsable(c, caja) {
    const pie = caja.querySelector('#pc-pie');
    if (!pie) return;

    pie.innerHTML = '<form class="pc-form" id="pc-form-contacto">' +
        '<input name="nombre" type="text" placeholder="Nombre y apellidos" autocomplete="off" required>' +
        '<input name="cargo" type="text" placeholder="Cargo (supervisor, caporal, …)" autocomplete="off">' +
        '<input name="telefono" type="tel" inputmode="tel" placeholder="Celular (9 dígitos)" autocomplete="off" required>' +
        '<div class="pc-form-acciones">' +
        '<button type="submit" class="pc-btn ok">Guardar</button>' +
        '<button type="button" class="pc-btn" id="pc-cancelar-contacto">Cancelar</button>' +
        '</div></form>';

    const form = pie.querySelector('#pc-form-contacto');
    form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        pcGuardarResponsable(c, form, caja);
    });

    pie.querySelector('#pc-cancelar-contacto').addEventListener('click', () => pcPintarPie(c, caja));

    const primero = form.querySelector('input[name="nombre"]');
    if (primero) primero.focus();
}

function pcCerrarDetalle() {
    const caja = document.getElementById('pc-detalle');
    if (caja) { caja.style.display = 'none'; caja.innerHTML = ''; }
}

/* ------------------------------------------------------------
   Aviso previo y cambio de estado desde la etiqueta de la tarjeta
   ------------------------------------------------------------ */
function pcConfirmar(titulo, texto, etiqueta, claseBoton, accion) {
    const caja = document.getElementById('pc-confirmar');
    if (!caja) return;

    caja.querySelector('#pc-conf-titulo').textContent = titulo;
    caja.querySelector('#pc-conf-texto').textContent = texto;

    const aceptar = caja.querySelector('#pc-conf-aceptar');
    const cancelar = caja.querySelector('#pc-conf-cancelar');
    aceptar.textContent = etiqueta;
    aceptar.className = 'pc-btn ' + claseBoton;

    const cerrar = () => {
        caja.style.display = 'none';
        aceptar.onclick = null;
        cancelar.onclick = null;
    };

    cancelar.onclick = cerrar;
    aceptar.onclick = async () => {
        cerrar();
        await accion();
    };
    caja.onclick = (ev) => { if (ev.target === caja) cerrar(); };

    caja.style.display = 'flex';
}

function pcPedirCambioEstado(c) {
    const abierta = (c.estado || 'cerrada') === 'abierta';
    const nuevo = abierta ? 'cerrada' : 'abierta';

    pcConfirmar(
        abierta ? 'Cerrar compuerta' : 'Abrir compuerta',
        '¿Confirmas ' + (abierta ? 'cerrar' : 'abrir') + ' la compuerta "' + c.nombre + '"? ' +
        'El cambio queda registrado con tu usuario. Asegúrate de que no haya personal ni agua en riesgo.',
        abierta ? 'Cerrar' : 'Abrir',
        abierta ? 'rojo' : 'verde',
        () => pcCambiarEstado(c, nuevo)
    );
}

/* ------------------------------------------------------------
   Cambiar estado
   ------------------------------------------------------------ */
async function pcCambiarEstado(c, nuevo) {
    if (pcCargando) return;
    pcCargando = true;

    const { error } = await db.from('compuertas')
        .update({
            estado: nuevo,
            actualizado_por: pcUsuario(),
            actualizado_en: new Date().toISOString()
        })
        .eq('id', c.id);

    pcCargando = false;

    if (error) {
        console.warn('cambiar estado', error);
        alert('No se pudo cambiar el estado: ' + error.message);
        return;
    }

    await pcPintar();
}

/* ------------------------------------------------------------
   Responsables
   ------------------------------------------------------------ */
async function pcGuardarResponsable(c, form, caja) {
    const datos = new FormData(form);
    const nombre = String(datos.get('nombre') || '').trim();
    const cargo = String(datos.get('cargo') || '').trim();
    const telefono = pcTelefono(datos.get('telefono'));

    if (!nombre) { pcAviso(caja, 'Escribe el nombre del responsable.', true); return; }
    if (telefono.length !== 9) { pcAviso(caja, 'El celular debe tener 9 dígitos (ejemplo 987654321).', true); return; }

    pcCargando = true;
    const { error } = await db.from('compuertas_contactos').insert({
        compuerta_id: c.id,
        nombre: nombre,
        cargo: cargo || null,
        telefono: telefono
    });
    pcCargando = false;

    if (error) {
        console.warn('alta responsable', error);
        pcAviso(caja, error.code === '42501' ? PC_MENSAJE_TABLA : 'No se pudo guardar: ' + error.message, true);
        return;
    }

    await pcRefrescarDetalle(c.id);
}

async function pcQuitarResponsable(c, id, caja) {
    pcCargando = true;
    const { error } = await db.from('compuertas_contactos').delete().eq('id', id);
    pcCargando = false;

    if (error) {
        pcAviso(caja, 'No se pudo quitar: ' + error.message, true);
        return;
    }
    await pcRefrescarDetalle(c.id);
}

/* ------------------------------------------------------------
   Compuertas: alta y baja
   ------------------------------------------------------------ */
function pcFormCompuerta() {
    const caja = document.getElementById('pc-detalle');
    if (!caja) return;
    const admin = PC_ADMINISTRACIONES.find(a => a.id === pcAdminActual) || PC_ADMINISTRACIONES[0];

    caja.innerHTML =
        '<div class="pc-detalle-caja">' +
        '<h3 class="pc-form-titulo">Nueva compuerta · ' + pcEscape(admin.titulo) + '</h3>' +
        '<p class="pc-nota">' + pcEscape(admin.subtitulo) + '</p>' +
        '<div id="pc-aviso" class="pc-aviso" style="display:none"></div>' +
        '<form class="pc-form" id="pc-form-compuerta" style="display:flex">' +
        '<input name="nombre" type="text" placeholder="Nombre de la compuerta" autocomplete="off" required>' +
        '<div class="pc-form-acciones">' +
        '<button type="submit" class="pc-btn ok">Crear</button>' +
        '<button type="button" class="pc-btn" id="pc-cancelar-compuerta">Cancelar</button>' +
        '</div>' +
        '</form>' +
        '</div>';

    caja.style.display = 'flex';

    const form = caja.querySelector('#pc-form-compuerta');
    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        await pcGuardarCompuerta(String(new FormData(form).get('nombre') || ''), caja);
    });

    const cancelar = caja.querySelector('#pc-cancelar-compuerta');
    cancelar.addEventListener('click', pcCerrarDetalle);

    const primero = form.querySelector('input[name="nombre"]');
    if (primero) primero.focus();
}

async function pcGuardarCompuerta(nombre, caja) {
    const limpio = nombre.trim();
    if (!limpio) { pcAviso(caja, 'Escribe el nombre de la compuerta.', true); return; }

    const repetida = pcCompuertas.some(c =>
        c.administracion === pcAdminActual && pcNormalizar(c.nombre) === pcNormalizar(limpio));
    if (repetida) { pcAviso(caja, 'Ya existe una compuerta con ese nombre en esta administración.', true); return; }

    pcCargando = true;
    const { error } = await db.from('compuertas').insert({
        administracion: pcAdminActual,
        nombre: limpio,
        estado: 'cerrada'
    });
    pcCargando = false;

    if (error) {
        console.warn('alta compuerta', error);
        pcAviso(caja, error.code === '42501' ? PC_MENSAJE_TABLA : 'No se pudo crear: ' + error.message, true);
        return;
    }

    pcCerrarDetalle();
    await pcPintar();
}

function pcPedirEliminarCompuerta(c, cuantos) {
    const detalle = cuantos
        ? ' También se borrarán sus ' + cuantos + ' responsable' + (cuantos === 1 ? '' : 's') + '.'
        : '';
    pcConfirmar(
        'Eliminar compuerta',
        '¿Eliminar la compuerta "' + c.nombre + '"?' + detalle + ' Esta acción no se puede deshacer.',
        'Eliminar',
        'rojo',
        () => pcQuitarCompuerta(c)
    );
}

async function pcQuitarCompuerta(c) {
    pcCargando = true;
    const { error } = await db.from('compuertas').delete().eq('id', c.id);
    pcCargando = false;

    if (error) {
        console.warn('baja compuerta', error);
        alert('No se pudo eliminar: ' + error.message);
        return;
    }

    pcCerrarDetalle();
    await pcPintar();
}

/* Vuelve a pintar el panel y reabre el detalle de la misma compuerta */
async function pcRefrescarDetalle(id) {
    await pcPintar();
    const c = pcCompuertas.find(x => x.id === id);
    if (c) pcDetalle(c); else pcCerrarDetalle();
}

/* ------------------------------------------------------------
   Sesiones abiertas de jefes y gerencias (tabla sesiones_panel).
   Cerrar sesión en el portal borra su fila. Si un equipo quedó con la
   sesión abierta, desde aquí se libera y el cierre va al historial.
   ------------------------------------------------------------ */
function pcClavePortal() {
    try { return localStorage.getItem('pc_sesion_clave') || ''; } catch (e) { return ''; }
}

function pcFechaHora(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) + ' · ' +
           d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

async function pcPintarSesiones() {
    const caja = document.getElementById('pc-sesiones');
    if (!caja) return;
    caja.innerHTML = '';

    if (!pcPuedeVer()) return;
    const clave = pcClavePortal();
    if (!clave) return;

    let filas = [];
    try {
        const { data, error } = await db.rpc('sesiones_panel_lista', { p_clave_quien: clave });
        if (error || !data) return;
        filas = data;
    } catch (e) { return; }

    if (!filas.length) {
        caja.innerHTML = '<h2 class="pc-ses-titulo"><i class="fas fa-user-clock"></i> Sesiones abiertas</h2>' +
            '<p class="pc-ses-sub">Ningún equipo tiene sesión abierta ahora mismo.</p>';
        return;
    }

    caja.innerHTML =
        '<h2 class="pc-ses-titulo"><i class="fas fa-user-clock"></i> Sesiones abiertas</h2>' +
        '<p class="pc-ses-sub">Mientras la sesión exista, ese equipo recibe las alarmas. Al liberarla deja de ' +
        'recibirlas en el acto y el cierre queda en el historial.</p>' +
        filas.map(s => {
            const equipo = s.dispositivo
                ? 'equipo ' + pcEscape(String(s.dispositivo).slice(0, 8))
                : 'sin equipo registrado';
            return '<div class="pc-ses-fila">' +
                    '<div class="pc-ses-datos">' +
                        '<div class="pc-ses-nombre">' + pcEscape(s.user_id) + '</div>' +
                        '<div class="pc-ses-meta">' + pcEscape(s.seccion || 'sin sección') +
                            ' · desde ' + pcEscape(pcFechaHora(s.inicio)) +
                            ' · ' + equipo + (s.con_token ? '' : ' · sin token de alarmas') + '</div>' +
                    '</div>' +
                    '<button type="button" class="pc-ses-liberar" data-user="' + pcEscape(s.user_id) +
                        '" data-disp="' + pcEscape(s.dispositivo || '') + '">' +
                        '<i class="fas fa-unlink"></i> Liberar</button>' +
                '</div>';
        }).join('');

    caja.querySelectorAll('.pc-ses-liberar').forEach(b => {
        b.addEventListener('click', () => pcPedirLiberar(b.dataset.user, b.dataset.disp || null));
    });
}

function pcPedirLiberar(userId, dispositivo) {
    pcConfirmar(
        'Liberar sesión',
        '¿Cerrar la sesión de ' + userId + '? Ese equipo dejará de recibir alarmas y el cierre queda en el historial.',
        'Liberar',
        'rojo',
        () => pcLiberarSesion(userId, dispositivo)
    );
}

async function pcLiberarSesion(userId, dispositivo) {
    const clave = pcClavePortal();
    const caja = document.getElementById('pc-sesiones');
    if (!clave || !caja) return;

    try {
        const { data, error } = await db.rpc('liberar_sesion_panel', {
            p_clave_quien: clave,
            p_user_id: userId,
            p_dispositivo: dispositivo || null
        });

        if (error || !data || !data.ok) {
            caja.insertAdjacentHTML('afterbegin', '<div class="pc-aviso error">No se pudo liberar: ' +
                pcEscape(error ? error.message : 'sin permiso') + '</div>');
            return;
        }

        await pcPintarSesiones();
    } catch (e) {
        caja.insertAdjacentHTML('afterbegin', '<div class="pc-aviso error">No se pudo liberar: ' +
            pcEscape(e.message) + '</div>');
    }
}

/* ------------------------------------------------------------
   Unidades en turno (tabla sesiones_unidad).
   El turno se cierra desde el celular del conductor. Si el equipo se
   perdio o no cierra, desde aqui se libera y queda en el historial.
   ------------------------------------------------------------ */
async function pcPintarUnidades() {
    const caja = document.getElementById('pc-unidades');
    if (!caja) return;
    caja.innerHTML = '';

    if (!pcPuedeVer()) return;
    const clave = pcClavePortal();
    if (!clave) return;

    let filas = [];
    try {
        const { data, error } = await db.rpc('unidades_en_turno', { p_clave_quien: clave });
        if (error || !data) return;
        filas = data;
    } catch (e) { return; }

    if (!filas.length) {
        caja.innerHTML = '<h2 class="pc-ses-titulo"><i class="fas fa-truck-moving"></i> Unidades en turno</h2>' +
            '<p class="pc-ses-sub">Ninguna unidad tiene turno abierto ahora mismo.</p>';
        return;
    }

    caja.innerHTML =
        '<h2 class="pc-ses-titulo"><i class="fas fa-truck-moving"></i> Unidades en turno</h2>' +
        '<p class="pc-ses-sub">Cada turno lo cierra su conductor. Si el celular se perdió o no cierra, ' +
        'libéralo aquí: deja de enviar ubicación y el cierre queda en el historial.</p>' +
        filas.map(u => {
            const equipo = u.dispositivo
                ? 'equipo ' + pcEscape(String(u.dispositivo).slice(0, 8))
                : 'sin equipo registrado';
            return '<div class="pc-ses-fila">' +
                    '<div class="pc-ses-datos">' +
                        '<div class="pc-ses-nombre">' + pcEscape(u.unidad) + ' · ' + pcEscape(u.user_id) + '</div>' +
                        '<div class="pc-ses-meta">' +
                            (u.dni ? 'DNI ' + pcEscape(u.dni) + ' · ' : '') +
                            'desde ' + pcEscape(pcFechaHora(u.inicio)) +
                            ' · ' + equipo + (u.con_token ? '' : ' · sin token de alarmas') + '</div>' +
                    '</div>' +
                    '<button type="button" class="pc-ses-liberar" data-unidad="' + pcEscape(u.unidad) + '">' +
                        '<i class="fas fa-unlink"></i> Liberar</button>' +
                '</div>';
        }).join('');

    caja.querySelectorAll('.pc-ses-liberar').forEach(b => {
        b.addEventListener('click', () => pcPedirLiberarUnidad(b.dataset.unidad));
    });
}

function pcPedirLiberarUnidad(unidad) {
    pcConfirmar(
        'Liberar unidad',
        '¿Cerrar el turno de la unidad ' + unidad + '? Dejará de enviar ubicación y el cierre queda en el historial con tu usuario.',
        'Liberar',
        'rojo',
        () => pcLiberarUnidad(unidad)
    );
}

async function pcLiberarUnidad(unidad) {
    const clave = pcClavePortal();
    const caja = document.getElementById('pc-unidades');
    if (!clave || !caja) return;

    try {
        const { data, error } = await db.rpc('liberar_unidad', {
            p_clave_quien: clave,
            p_unidad: unidad
        });

        if (error || !data || !data.ok) {
            caja.insertAdjacentHTML('afterbegin', '<div class="pc-aviso error">No se pudo liberar: ' +
                pcEscape(error ? error.message : 'sin permiso') + '</div>');
            return;
        }

        await pcPintarUnidades();
    } catch (e) {
        caja.insertAdjacentHTML('afterbegin', '<div class="pc-aviso error">No se pudo liberar: ' +
            pcEscape(e.message) + '</div>');
    }
}

/* ------------------------------------------------------------
   Inicio: boton visible solo para Seguridad Industrial
   ------------------------------------------------------------ */
function pcIniciar() {
    const boton = document.getElementById('btn-compuertas');
    if (!boton) return;

    if (!pcPuedeVer()) { boton.style.display = 'none'; return; }
    boton.style.display = 'inline-flex';

    if (boton.dataset.listo === '1') return;
    boton.dataset.listo = '1';

    boton.addEventListener('click', pcAbrir);

    document.querySelectorAll('.pc-tab').forEach(b => {
        b.addEventListener('click', () => {
            pcAdminActual = b.dataset.admin;
            pcCerrarDetalle();
            pcPintar();
        });
    });

    const cerrar = document.getElementById('pc-cerrar');
    if (cerrar) cerrar.addEventListener('click', pcCerrar);

    const refrescar = document.getElementById('pc-refrescar');
    if (refrescar) refrescar.addEventListener('click', () => { pcPintar(); pcPintarUnidades(); pcPintarSesiones(); });

    const nueva = document.getElementById('pc-add-compuerta');
    if (nueva) nueva.addEventListener('click', pcFormCompuerta);
}

document.addEventListener('DOMContentLoaded', () => {
    /* El mapa se arma por JS; espera a que exista la barra */
    setTimeout(pcIniciar, 800);
});
