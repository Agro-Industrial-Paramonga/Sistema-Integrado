/* ============================================================
   COMPUERTAS: panel de administraciones, estados y responsables
   Solo visible para Seguridad Industrial.
   Todo sale de la base: compuertas y compuertas_contactos.
   ============================================================ */

const PC_ADMINISTRACIONES = [
    { id: 'Administracion 1', titulo: 'Administración 1', subtitulo: 'Huayto · Upacá' },
    { id: 'Administracion 2', titulo: 'Administración 2', subtitulo: 'Lateral Molle y ramales' },
    { id: 'Administracion 3', titulo: 'Administración 3', subtitulo: 'Cerro Blanco · Lampay · Paramonga' },
    // AGREGA ESTA LÍNEA:
    { id: 'Ingenieria Agricola', titulo: 'Ingeniería Agrícola', subtitulo: 'Sectores y canales de ingeniería' } 
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

        // Permiso por persona (panel «Personas»); el rol ya no decide.
        if (u.puede_compuertas === true || u.puede_mapa === true) return true;

        // Damos acceso total al Gerente General y a Melgar Belmont
        if (u.rol === 'gerente_general' || String(u.nombre || '').toLowerCase().includes('melgar')) return true;

        const texto = pcNormalizar(String(u.seccion || '') + ' ' + String(u.area || '') + ' ' + String(u.nombre || ''));
        const esSeguridad = texto.includes('seguridad industrial') || texto.includes('chunga');
        
        // Permitir a cualquiera de Gerencia de Campo
        const esCampo = String(u.gerencia_key || '').trim().toUpperCase() === 'GERENCIA DE CAMPO';
        
        return esSeguridad || esCampo;
    } catch (e) { return false; }
}

/* Ver el panel no es lo mismo que administrarlo. Gerencia de Campo consulta
   estados y responsables; crear, borrar compuertas y editar responsables
   sigue siendo solo de Seguridad Industrial. */
function pcPuedeAdministrar() {
    try {
        const u = JSON.parse(localStorage.getItem('pc_user') || 'null');
        if (!u) return false;
        // Damos permiso de administración al Gerente General y a Melgar Belmont
        if (u.rol === 'gerente_general' || String(u.nombre || '').toLowerCase().includes('melgar')) return true;

        const texto = pcNormalizar(String(u.seccion || '') + ' ' + String(u.area || '') + ' ' + String(u.nombre || ''));
        if (texto.includes('seguridad industrial') || texto.includes('chunga')) return true;
        
        /* Gerencia de Campo administra completa */
        return String(u.gerencia_key || '').trim().toUpperCase() === 'GERENCIA DE CAMPO';
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
            // CORRECCIÓN AQUÍ: Agregamos lat, lon al select
            .select('id, administracion, nombre, estado, actualizado_por, actualizado_en, lat, lon')
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
}

async function pcCerrar() {
    const panel = document.getElementById('pc-panel');
    if (panel) panel.style.display = 'none';
    pcCerrarDetalle();
    pcBloquearFondo(false);

    // Quien solo tiene compuertas sale al login al cerrar: su única pantalla
    // son las compuertas. Jefes y supervisores cierran el panel y siguen en el
    // mapa, con su sesión intacta.
    // Hay que cerrar también la sesión en la base: si solo borramos la copia
    // local, index.html la recupera por equipo y devuelve al panel (rebote).
    const u = JSON.parse(localStorage.getItem('pc_user') || 'null');
    const soloCompuertas = !!u && (
        typeof u.puede_mapa === 'boolean'
            ? (u.puede_compuertas === true && u.puede_mapa !== true && u.puede_medidas !== true)
            : (String(u.gerencia_key || '').trim().toUpperCase() === 'GERENCIA DE CAMPO'
               && String(u.rol || '').trim().toLowerCase() === 'area')
    );
    if (soloCompuertas) {
        try {
            const clave = localStorage.getItem('pc_sesion_clave') || null;
            const disp = localStorage.getItem('pc_dispositivo') || null;
            await db.rpc('cerrar_sesion_panel', { p_clave: clave, p_dispositivo: disp });
        } catch (e) { console.warn('cerrar sesion panel', e); }
        localStorage.removeItem('pc_user');
        try { localStorage.removeItem('pc_sesion_clave'); } catch (e) {}
        window.location.href = 'index.html';
    }
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
            (pcPuedeAdministrar() ? '<button type="button" class="pc-borrar" title="Eliminar compuerta" ' +
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

    // NUEVO: Aviso de si está en el mapa o no
    if (c.lat && c.lon) {
        html += '<p class="pc-nota" style="color:#0ea5e9;font-weight:700;"><i class="fas fa-map-marker-alt"></i> Ubicada en el mapa</p>';
    } else {
        html += '<p class="pc-nota" style="color:#b45309;font-weight:700;"><i class="fas fa-eye-slash"></i> Solo visualización (sin coordenadas)</p>';
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
        if (pcPuedeAdministrar()) {
            html += '<button type="button" class="pc-p-del" data-quitar="' + p.id + '" aria-label="Quitar responsable">' +
                '<i class="fas fa-trash"></i></button>';
        }
        html += '</div>';
    });
    html += '</div>';

    html += '<div class="pc-pie" id="pc-pie"></div>';
    html += '</div>';

    caja.innerHTML = html;
    caja.style.display = 'flex';

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

    let h = '';
    const tieneUbicacion = c.lat && c.lon;

    if (pcPuedeAdministrar()) {
        if (tieneUbicacion) {
            // Si ya está en el mapa, mostramos Editar y Quitar
            h += '<div style="display:flex; gap:8px; margin-bottom:8px;">' +
                 '<button type="button" class="pc-btn-add" id="pc-ubicar-mapa" style="flex:1; border-color:#bae6fd;background:#f0f9ff;color:#0284c7;margin:0;">' +
                 '<i class="fas fa-map-marker-alt"></i> Editar ubicación</button>' +
                 '<button type="button" class="pc-btn-add" id="pc-eliminar-mapa" style="flex:1; border-color:#fecaca;background:#fef2f2;color:#b91c1c;margin:0;">' +
                 '<i class="fas fa-trash"></i> Quitar del mapa</button>' +
                 '</div>';
        } else {
            // Si no está en el mapa, solo mostramos Ubicar
            h += '<button type="button" class="pc-btn-add" id="pc-ubicar-mapa" style="border-color:#bae6fd;background:#f0f9ff;color:#0284c7;margin-bottom:8px;">' +
                 '<i class="fas fa-map-marker-alt"></i> Ubicar en el mapa</button>';
        }
    }

    if (pcPuedeAdministrar() && pcTablaContactos) {
        h += '<button type="button" class="pc-btn-add" id="pc-add-persona">' +
            '<i class="fas fa-user-plus"></i> Añadir responsable</button>';
    }

    h += '<button type="button" class="pc-volver" id="pc-volver">Volver</button>';

    pie.innerHTML = h;

    const volver = pie.querySelector('#pc-volver');
    if (volver) volver.addEventListener('click', pcCerrarDetalle);

    // Evento para editar o poner coordenadas
    const ubicar = pie.querySelector('#pc-ubicar-mapa');
    if (ubicar) ubicar.addEventListener('click', () => pcFormUbicacion(c, caja));

    // Evento para quitar del mapa directamente
    const eliminar = pie.querySelector('#pc-eliminar-mapa');
    if (eliminar) {
        eliminar.addEventListener('click', async () => {
            if (!confirm('¿Quitar la compuerta "' + c.nombre + '" del mapa? Las coordenadas se borrarán y solo quedará en el panel.')) return;
            
            pcCargando = true;
            const { error } = await db.from('compuertas').update({ lat: null, lon: null }).eq('id', c.id);
            pcCargando = false;
            
            if (error) {
                pcAviso(caja, 'No se pudo quitar del mapa: ' + error.message, true);
                return;
            }

            await pcRefrescarDetalle(c.id);
            if (typeof cargarCompuertasMapa === 'function') cargarCompuertasMapa();
        });
    }

    const add = pie.querySelector('#pc-add-persona');
    if (add) add.addEventListener('click', () => pcFormularioResponsable(c, caja));
}
function pcFormUbicacion(c, caja) {
    const pie = caja.querySelector('#pc-pie');
    if (!pie) return;

    // Tomamos los valores actuales para que no salga vacío
    const valLat = c.lat ? c.lat : '';
    const valLon = c.lon ? c.lon : '';

    pie.innerHTML = '<form class="pc-form" id="pc-form-ubicacion">' +
        '<p class="pc-form-titulo" style="font-size:.9rem;margin-bottom:8px;">Ubicación Geográfica</p>' +
        '<input name="lat" type="number" step="any" placeholder="Latitud (ej. -10.67140)" value="' + valLat + '" required>' +
        '<input name="lon" type="number" step="any" placeholder="Longitud (ej. -77.75900)" value="' + valLon + '" required>' +
        '<div class="pc-form-acciones" style="margin-top:10px;">' +
        '<button type="submit" class="pc-btn ok">Guardar</button>' +
        '<button type="button" class="pc-btn" id="pc-cancelar-ubicacion">Cancelar</button>' +
        '</div></form>';

    const form = pie.querySelector('#pc-form-ubicacion');
    
    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const datos = new FormData(form);
        const lat = parseFloat(datos.get('lat'));
        const lon = parseFloat(datos.get('lon'));
        
        if (isNaN(lat) || isNaN(lon)) { pcAviso(caja, 'Coordenadas no válidas', true); return; }

        pcCargando = true;
        const { error } = await db.from('compuertas').update({ lat: lat, lon: lon }).eq('id', c.id);
        pcCargando = false;

        if (error) {
            pcAviso(caja, 'No se pudo guardar: ' + error.message, true);
            return;
        }

        await pcRefrescarDetalle(c.id);
        if (typeof cargarCompuertasMapa === 'function') cargarCompuertasMapa();
    });

    pie.querySelector('#pc-cancelar-ubicacion').addEventListener('click', () => pcPintarPie(c, caja));
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
        
        // NUEVOS CAMPOS OPCIONALES
        '<div style="display:flex;gap:8px;margin-top:8px;">' +
            '<input name="lat" type="number" step="any" placeholder="Latitud (opcional)" style="flex:1;font-size:.8rem;padding:8px;">' +
            '<input name="lon" type="number" step="any" placeholder="Longitud (opcional)" style="flex:1;font-size:.8rem;padding:8px;">' +
        '</div>' +

        '<div class="pc-form-acciones" style="margin-top:12px;">' +
        '<button type="submit" class="pc-btn ok">Crear</button>' +
        '<button type="button" class="pc-btn" id="pc-cancelar-compuerta">Cancelar</button>' +
        '</div>' +
        '</form>' +
        '</div>';

    caja.style.display = 'flex';

    const form = caja.querySelector('#pc-form-compuerta');
    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const datos = new FormData(form);
        await pcGuardarCompuerta(
            String(datos.get('nombre') || ''), 
            caja,
            String(datos.get('lat') || '').trim(),
            String(datos.get('lon') || '').trim()
        );
    });

    const cancelar = caja.querySelector('#pc-cancelar-compuerta');
    cancelar.addEventListener('click', pcCerrarDetalle);

    const primero = form.querySelector('input[name="nombre"]');
    if (primero) primero.focus();
}

async function pcGuardarCompuerta(nombre, caja, latStr, lonStr) {
    const limpio = nombre.trim();
    if (!limpio) { pcAviso(caja, 'Escribe el nombre de la compuerta.', true); return; }

    const repetida = pcCompuertas.some(c =>
        c.administracion === pcAdminActual && pcNormalizar(c.nombre) === pcNormalizar(limpio));
    if (repetida) { pcAviso(caja, 'Ya existe una compuerta con ese nombre en esta administración.', true); return; }

    // Validar coordenadas
    let lat = null;
    let lon = null;
    if (latStr && lonStr) {
        lat = parseFloat(latStr);
        lon = parseFloat(lonStr);
        if (isNaN(lat) || isNaN(lon)) {
            pcAviso(caja, 'Las coordenadas no son válidas. Deja ambos campos vacíos o ingresa números correctos.', true);
            return;
        }
    }

    pcCargando = true;
    const { error } = await db.from('compuertas').insert({
        administracion: pcAdminActual,
        nombre: limpio,
        estado: 'cerrada',
        lat: lat,
        lon: lon
    });
    pcCargando = false;

    if (error) {
        console.warn('alta compuerta', error);
        pcAviso(caja, error.code === '42501' ? PC_MENSAJE_TABLA : 'No se pudo crear: ' + error.message, true);
        return;
    }

    pcCerrarDetalle();
    await pcPintar();
    
    // Refrescar mapa si la función está disponible en la página
    if (typeof cargarCompuertasMapa === 'function') cargarCompuertasMapa();
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
    if (refrescar) refrescar.addEventListener('click', () => { pcPintar(); });

    const nueva = document.getElementById('pc-add-compuerta');
    if (nueva) {
        if (pcPuedeAdministrar()) nueva.addEventListener('click', pcFormCompuerta);
        else nueva.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    /* El mapa se arma por JS; espera a que exista la barra */
    setTimeout(pcIniciar, 800);
});
