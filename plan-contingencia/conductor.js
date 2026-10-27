/* ============================================================
   INGRESO DE CONDUCTORES
   Serie -> Unidad -> Conductor (buscador por nombre o DNI)
   ============================================================ */

const SUPABASE_URL = 'https://bfhfnldqwsrcpsdqpyat.supabase.co';
const SUPABASE_KEY = 'sb_publishable_z-jW4WrGLq7wEhCI_CW3Ig_vQZwtOMh';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let unidades = [];
let conductores = [];
let conductorSel = null;
let listaFiltrada = [];
let modoLibre = false;   // si la tabla conductores no se puede leer

function norm(v) {
    return String(v || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ').trim().toLowerCase();
}

function escapar(v) {
    return String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function cargar() {
    await cargarUnidades();
    await cargarConductores();
    conectarEventos();
    revisarUbicacion();
    vigilarUbicacion();
}

/* ------------------------------------------------------------
   Unidades (serie -> unidad)
   ------------------------------------------------------------ */
async function cargarUnidades() {
    const { data, error } = await db.from('unidades')
        .select('nombre, prefijo, orden')
        .eq('activo', true)
        .order('orden', { ascending: true })
        .order('nombre', { ascending: true });

    if (error) {
        mostrarAviso('No se pudo cargar la lista de unidades: ' + error.message);
        return;
    }

    unidades = data || [];

    const prefijos = [...new Set(unidades.map(u => u.prefijo).filter(Boolean))];
    const sel = document.getElementById('sel-prefijo');
    sel.innerHTML = '<option value="">Selecciona la serie</option>' +
        prefijos.map(p => `<option value="${escapar(p)}">${escapar(p)}</option>`).join('');
}

/* ------------------------------------------------------------
   Conductores (89 registros con DNI)
   ------------------------------------------------------------ */
async function cargarConductores() {
    const { data, error } = await db.from('conductores')
        .select('nombre, dni, activo')
        .eq('activo', true)
        .order('nombre', { ascending: true })
        .limit(1000);

    if (error || !(data || []).length) {
        modoLibre = true;
        const inp = document.getElementById('inp-buscar');
        if (inp) inp.placeholder = 'Nombres y apellidos';
        mostrarAviso('No se pudo cargar la lista de conductores' +
            (error ? ': ' + error.message : '') + '. Escribe tu nombre completo.');
        return;
    }

    conductores = data;
}

function filtrarConductores() {
    const inp = document.getElementById('inp-buscar');
    const texto = norm(inp.value);
    const digitos = String(inp.value || '').replace(/\D/g, '');

    if (!texto && !digitos) return conductores.slice(0, 8);

    return conductores.filter(c => {
        const nombre = norm(c.nombre);
        if (texto && nombre.includes(texto)) return true;
        if (digitos && String(c.dni || '').includes(digitos)) return true;
        return false;
    }).slice(0, 8);
}

function renderLista() {
    const caja = document.getElementById('lista-conductores');
    if (!caja) return;

    if (modoLibre) {
        caja.classList.remove('visible');
        caja.innerHTML = '';
        return;
    }

    listaFiltrada = filtrarConductores();

    if (!listaFiltrada.length) {
        caja.innerHTML = '<div class="item-conductor sin">Sin coincidencias. Revisa tu nombre o DNI.</div>';
        caja.classList.add('visible');
        return;
    }

    caja.innerHTML = listaFiltrada.map((c, i) =>
        `<div class="item-conductor" data-i="${i}">
            <span>${escapar(c.nombre)}</span>
            <span class="dni">DNI ${escapar(c.dni || '—')}</span>
        </div>`).join('');
    caja.classList.add('visible');
}

function ocultarLista() {
    const caja = document.getElementById('lista-conductores');
    if (caja) caja.classList.remove('visible');
}

function elegirConductor(c) {
    conductorSel = c;

    const inp = document.getElementById('inp-buscar');
    inp.value = c.nombre;

    ocultarLista();

    const chip = document.getElementById('chip-conductor');
    if (chip) {
        chip.style.display = 'inline-flex';
        chip.innerHTML = '<i class="fas fa-circle-check"></i> ' + escapar(c.nombre) +
            ' · DNI ' + escapar(c.dni || '—');
    }

    validar();
}

/* ------------------------------------------------------------
   Eventos de la pantalla
   ------------------------------------------------------------ */
function conectarEventos() {
    const sel = document.getElementById('sel-prefijo');
    sel.addEventListener('change', () => {
        const prefijo = sel.value;
        const selU = document.getElementById('sel-unidad');

        if (!prefijo) {
            selU.innerHTML = '<option value="">Primero elige la serie</option>';
            selU.disabled = true;
            validar();
            return;
        }

        const lista = unidades.filter(u => u.prefijo === prefijo);
        selU.innerHTML = '<option value="">Selecciona la unidad</option>' +
            lista.map(u => `<option value="${escapar(u.nombre)}">${escapar(u.nombre)}</option>`).join('');
        selU.disabled = false;
        validar();
    });

    document.getElementById('sel-unidad').addEventListener('change', validar);

    const inp = document.getElementById('inp-buscar');
    const caja = document.getElementById('lista-conductores');

    inp.addEventListener('input', () => {
        if (conductorSel && norm(inp.value) !== norm(conductorSel.nombre)) {
            conductorSel = null;
            const chip = document.getElementById('chip-conductor');
            if (chip) chip.style.display = 'none';
        }
        renderLista();
        validar();
    });

    inp.addEventListener('focus', () => { if (!conductorSel) renderLista(); });

    inp.addEventListener('blur', () => { setTimeout(ocultarLista, 180); });

    inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (listaFiltrada.length && !conductorSel) elegirConductor(listaFiltrada[0]);
        }
        if (e.key === 'Escape') ocultarLista();
    });

    // pointerdown en vez de click: elige antes de que el input pierda el foco
    caja.addEventListener('pointerdown', (e) => {
        const item = e.target.closest('.item-conductor');
        if (!item || item.classList.contains('sin')) return;
        e.preventDefault();
        const i = Number(item.dataset.i);
        if (listaFiltrada[i]) elegirConductor(listaFiltrada[i]);
    });

    validar();
}

/* Devuelve la sesion abierta de esa unidad, o null si esta libre */
async function turnoActivoDeUnidad(unidad) {
    if (!unidad) return null;
    try {
        const { data } = await db.from('sesiones_unidad')
            .select('unidad, user_id, token, inicio');
        return (data || []).find(s => norm(s.unidad) === norm(unidad)) || null;
    } catch (e) {
        return null;
    }
}

/* Toma la unidad para este conductor y verifica que quedo registrada */
async function reclamarUnidad(unidad, nombre, token) {
    try {
        const ocupada = await turnoActivoDeUnidad(unidad);
        if (ocupada && norm(ocupada.user_id) !== norm(nombre)) {
            return { ok: false, mensaje: 'La unidad ' + unidad + ' esta en turno con ' + ocupada.user_id + '.' };
        }

        const { error } = await db.from('sesiones_unidad').upsert({
            unidad: unidad,
            user_id: nombre,
            token: token || null,
            inicio: new Date().toISOString()
        }, { onConflict: 'unidad' });

        if (error) return { ok: false, mensaje: 'No se pudo registrar la sesion: ' + error.message };

        // Verificacion real del token
        const { data } = await db.from('sesiones_unidad').select('token').eq('unidad', unidad).maybeSingle();
        const guardado = (data && data.token) ? String(data.token) : '';

        if (token && guardado !== token) {
            await db.from('sesiones_unidad').update({ token: token }).eq('unidad', unidad);
            const { data: d2 } = await db.from('sesiones_unidad').select('token').eq('unidad', unidad).maybeSingle();
            if (!d2 || String(d2.token) !== String(token)) {
                return { ok: false, mensaje: 'El celular no quedo registrado para alarmas. Revisa las notificaciones e intenta otra vez.' };
            }
        }

        return { ok: true };
    } catch (e) {
        return { ok: false, mensaje: 'Error al registrar la sesion: ' + e.message };
    }
}

function validar() {
    const unidad = document.getElementById('sel-unidad').value;
    const boton = document.getElementById('btn-entrar');
    if (!boton) return;

    if (!ubicacionOk && !etiquetaBloqueada) {
        etiquetaBloqueada = true;
        boton.innerHTML = '<i class="fas fa-location-crosshairs"></i> Activa la ubicación';
    } else if (ubicacionOk && etiquetaBloqueada) {
        etiquetaBloqueada = false;
        boton.innerHTML = '<i class="fas fa-play"></i> Iniciar turno';
    }

    if (modoLibre) {
        const nombre = document.getElementById('inp-buscar').value.trim();
        boton.disabled = !(unidad && nombre.length >= 5 && ubicacionOk);
        return;
    }

    boton.disabled = !(unidad && conductorSel && ubicacionOk);
}

function mostrarAviso(texto) {
    const a = document.getElementById('aviso');
    if (!a) return;
    a.textContent = texto;
    a.style.display = texto ? 'block' : 'none';
}

/* ------------------------------------------------------------
   Ubicacion obligatoria: sin GPS encendido no se puede iniciar turno
   ------------------------------------------------------------ */
let ubicacionOk = false;
let etiquetaBloqueada = false;
let vigilanteUbicacion = null;

const TEXTOS_UBICACION = {
    apagada: 'La ubicación del celular está desactivada. Actívala para poder iniciar turno.',
    sin_permiso: 'La app no tiene permiso de ubicación. Concédelo para poder iniciar turno.',
    sin_permiso_fondo: 'En los permisos de ubicación elige "Permitir todo el tiempo".',
    sin_soporte: 'Este dispositivo no tiene servicio de ubicación disponible.',
    error: 'No se pudo leer la ubicación. Actívala y vuelve a intentarlo.'
};

function hayNativo() {
    return !!(window.AndroidUbicacion && window.AndroidUbicacion.estadoUbicacion);
}

async function consultarEstadoUbicacion() {
    if (hayNativo()) {
        try { return String(window.AndroidUbicacion.estadoUbicacion()); } catch (e) {}
    }
    if (!navigator.geolocation) return 'sin_soporte';

    if (navigator.permissions && navigator.permissions.query) {
        try {
            const p = await navigator.permissions.query({ name: 'geolocation' });
            if (p.state === 'denied') return 'sin_permiso';
        } catch (e) {}
    }

    return await new Promise((resolver) => {
        navigator.geolocation.getCurrentPosition(
            () => resolver('ok'),
            (err) => {
                if (err && err.code === 1) return resolver('sin_permiso');
                if (err && err.code === 2) return resolver('apagada');
                resolver('error');
            },
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
        );
    });
}

function mostrarBloqueoUbicacion(estado) {
    const caja = document.getElementById('bloqueo-ubicacion');
    if (!caja) return;
    const texto = document.getElementById('bloqueo-texto');
    if (texto) texto.textContent = TEXTOS_UBICACION[estado] || TEXTOS_UBICACION.error;
    caja.style.display = 'block';
    const boton = document.getElementById('btn-activar-ubicacion');
    if (boton) boton.style.display = (estado === 'sin_soporte') ? 'none' : 'inline-flex';
}

function ocultarBloqueoUbicacion() {
    const caja = document.getElementById('bloqueo-ubicacion');
    if (caja) caja.style.display = 'none';
}

function abrirAjustesUbicacion() {
    // Via correcta: el nativo decide entre dialogo de permiso o Ajustes
    if (window.AndroidUbicacion && window.AndroidUbicacion.pedirPermisoUbicacion) {
        try {
            window.AndroidUbicacion.pedirPermisoUbicacion();
            setTimeout(revisarUbicacion, 1200);
            return;
        } catch (e) {}
    }
    if (window.AndroidUbicacion && window.AndroidUbicacion.abrirAjustesUbicacion) {
        try { window.AndroidUbicacion.abrirAjustesUbicacion(); return; } catch (e) {}
    }
    if (window.AndroidUbicacion && window.AndroidUbicacion.abrirAjustes) {
        try { window.AndroidUbicacion.abrirAjustes(); return; } catch (e) {}
    }
    mostrarAviso('Abre Ajustes → Ubicación, actívala y vuelve a esta pantalla.');
}

async function revisarUbicacion() {
    const estado = await consultarEstadoUbicacion();
    ubicacionOk = (estado === 'ok');
    if (ubicacionOk) ocultarBloqueoUbicacion();
    else mostrarBloqueoUbicacion(estado);
    validar();
    return ubicacionOk;
}

/* Mientras este bloqueado, revisa cada 4 s: al volver de Ajustes se libera solo */
function vigilarUbicacion() {
    if (vigilanteUbicacion) clearInterval(vigilanteUbicacion);
    vigilanteUbicacion = setInterval(() => { if (!ubicacionOk) revisarUbicacion(); }, 4000);
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) revisarUbicacion(); });
window.addEventListener('focus', () => revisarUbicacion());

/* ------------------------------------------------------------
   Permiso de ubicacion
   ------------------------------------------------------------ */
function ubicacionLista() {
    return new Promise((resolver) => {
        if (!navigator.geolocation) { resolver(false); return; }
        navigator.geolocation.getCurrentPosition(
            () => resolver(true),
            () => resolver(false),
            { enableHighAccuracy: true, timeout: 12000 }
        );
    });
}

function pedirPermisoUbicacion() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
        () => {},
        (err) => { mostrarAviso('Activa el permiso de ubicación: ' + err.message); },
        { enableHighAccuracy: true, timeout: 20000 }
    );
}

/* ------------------------------------------------------------
   Registro del celular para alarmas (FCM)
   Devuelve true si logro guardar el token
   ------------------------------------------------------------ */
async function registrarLog(paso, detalle) {
    try { await db.from('app_log').insert({ origen: 'conductor.push', detalle: paso + ' :: ' + (detalle || '') }); } catch (e) {}
}

function registrarPush(nombre, unidad) {
    return new Promise(async (resolver) => {
        let terminado = false;
        const fin = (ok) => { if (!terminado) { terminado = true; resolver(ok); } };

        setTimeout(() => fin(false), 8000);   // no bloquear mas de 8 s

        try {
            const cap = window.Capacitor;
            const PN = (window.capacitorPushNotifications && window.capacitorPushNotifications.PushNotifications)
                || (cap && cap.Plugins && cap.Plugins.PushNotifications);

            await registrarLog('PN disponible', cap && cap.Plugins ? Object.keys(cap.Plugins).join(',') : 'sin capacitor');

            if (!PN) { await registrarLog('SIN PLUGIN', 'PushNotifications no disponible'); fin(false); return; }

            await registrarLog('consultando permiso', '');
            let permiso = await PN.checkPermissions();
            await registrarLog('permiso', JSON.stringify(permiso));

            if (permiso.receive !== 'granted') {
                permiso = await PN.requestPermissions();
                // si quedo en "prompt", dar tiempo al dialogo del sistema
                for (let i = 0; i < 6 && permiso.receive === 'prompt'; i++) {
                    await new Promise(r => setTimeout(r, 1200));
                    permiso = await PN.checkPermissions();
                }
                await registrarLog('permiso tras pedir', JSON.stringify(permiso));
            }
            if (permiso.receive !== 'granted') {
                await registrarLog('PERMISO DENEGADO', JSON.stringify(permiso));
                mostrarAviso('Sin permiso de notificaciones: no recibirás alarmas.');
                fin(false);
                return;
            }

            await registrarLog('registrando...', '');
            PN.addListener('registration', async (token) => {
                await registrarLog('TOKEN RECIBIDO', String(token.value).slice(0, 25));
                try {
                    await db.from('push_subscriptions').delete().eq('user_id', nombre);
                    // Este celular deja de estar asociado a cualquier unidad anterior
                    await db.from('push_subscriptions').delete().eq('token', token.value);
                    await db.from('push_subscriptions').insert({
                        user_id: nombre,
                        token: token.value,
                        unidad: unidad || null
                    });
                    await db.from('ubicaciones').update({ token: token.value }).eq('user_id', nombre);
                    try { localStorage.setItem('pushToken', token.value); } catch (e) {}
                    mostrarAviso('Celular registrado para alarmas ✓');
                    fin(token.value);   // devuelve el token
                } catch (e) {
                    mostrarAviso('No se pudo guardar el token: ' + e.message);
                    fin(false);
                }
            });

            PN.addListener('registrationError', async (e) => {
                await registrarLog('ERROR REGISTRO', JSON.stringify(e));
                console.warn('Push error', e);
                fin(false);
            });

            await PN.register();
        } catch (e) {
            await registrarLog('EXCEPCION', String(e && e.message ? e.message : e));
            console.warn('Push no disponible:', e);
            fin(false);
        }
    });
}

/* ------------------------------------------------------------
   Iniciar turno
   ------------------------------------------------------------ */
async function iniciarTurno() {
    const unidad = document.getElementById('sel-unidad').value;

    const puedeUbicar = await revisarUbicacion();
    if (!puedeUbicar) {
        const caja = document.getElementById('bloqueo-ubicacion');
        if (caja) {
            caja.style.display = 'block';
            caja.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
    }

    let nombre = '';
    let dni = null;

    if (conductorSel) {
        nombre = conductorSel.nombre;
        dni = conductorSel.dni || null;
    } else if (modoLibre) {
        nombre = document.getElementById('inp-buscar').value.trim().toUpperCase();
    }

    if (!unidad || !nombre) {
        mostrarAviso('Elige tu unidad y selecciona tu nombre de la lista.');
        return;
    }

    // La unidad no puede tener dos sesiones a la vez
    const ocupada = await turnoActivoDeUnidad(unidad);
    if (ocupada) {
        mostrarAviso('⛔ La unidad ' + unidad + ' está en turno con ' +
            (ocupada.user_id || 'otro conductor') +
            '. Debe cerrar sesión para liberarla.');
        return;
    }

    pedirPermisoUbicacion();

    const boton = document.getElementById('btn-entrar');
    boton.disabled = true;
    boton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando…';
    mostrarAviso('Registrando el celular para alarmas…');

    let hayUbicacion = true;

    // Primero preguntar al celular si el permiso esta concedido
    if (window.AndroidUbicacion && window.AndroidUbicacion.tienePermisoUbicacionNativo) {
        try { hayUbicacion = window.AndroidUbicacion.tienePermisoUbicacionNativo(); } catch (e) { hayUbicacion = true; }
    } else {
        hayUbicacion = await ubicacionLista();
    }
    if (!hayUbicacion) {
        mostrarAviso('⛔ Debes permitir la ubicación para iniciar turno. Si no aparece el aviso, actívala en Ajustes → Aplicaciones → Permisos → Ubicación → Permitir todo el tiempo.');
        const b = document.getElementById('btn-entrar');
        b.disabled = false;
        b.innerHTML = 'Iniciar turno';
        return;   // no deja continuar sin ubicacion
    }

    const listo = await registrarPush(nombre, unidad);
    const token = listo ? String(listo) : null;

    // Reclamo de la unidad en la base: dueño unico y token verificado
    const reclamo = await reclamarUnidad(unidad, nombre, token);
    if (!reclamo.ok) {
        mostrarAviso('⛔ ' + reclamo.mensaje);
        const b = document.getElementById('btn-entrar');
        b.disabled = false;
        b.innerHTML = 'Iniciar turno';
        return;
    }

    const sesion = { unidad, nombre, dni, inicio: new Date().toISOString() };
    localStorage.setItem('conductor', JSON.stringify(sesion));

    // Servicio nativo: sigue enviando con la app cerrada
    if (window.AndroidUbicacion && window.AndroidUbicacion.iniciarServicio) {
        window.AndroidUbicacion.iniciarServicio(nombre, unidad);
    }

    // Permiso de pantalla completa para que la alarma aparezca sola
    if (window.AndroidUbicacion && window.AndroidUbicacion.pedirPantallaCompleta) {
        try { window.AndroidUbicacion.pedirPantallaCompleta(); } catch (e) {}
    }

    mostrarAviso(
        (token ? 'Turno iniciado y celular registrado para alarmas.' : 'Turno iniciado. El celular no quedó registrado para alarmas.')
    );

    setTimeout(() => { window.location.href = 'mapa.html?v=20'; }, token ? 700 : 1800);
}

async function continuarTurno() {
    let sesion = null;
    try { sesion = JSON.parse(localStorage.getItem('conductor') || 'null'); } catch (e) {}

    // Si el navegador perdio la sesion, preguntar al celular
    if (!sesion && window.AndroidUbicacion && window.AndroidUbicacion.obtenerSesionGuardada) {
        try {
            const guardada = window.AndroidUbicacion.obtenerSesionGuardada();
            if (guardada && guardada.indexOf('|') > 0) {
                const partes = guardada.split('|');
                sesion = { nombre: partes[0], unidad: partes[1], inicio: new Date().toISOString() };
                localStorage.setItem('conductor', JSON.stringify(sesion));
            }
        } catch (e) {}
    }

    if (sesion && sesion.unidad && sesion.nombre) {
        // Turno vigente: reactivar el envio y seguir en el mapa
        if (window.AndroidUbicacion && window.AndroidUbicacion.iniciarServicio) {
            window.AndroidUbicacion.iniciarServicio(sesion.nombre, sesion.unidad);
        }
        mostrarAviso('Turno activo: ' + sesion.nombre + ' · ' + sesion.unidad + '. Abriendo el mapa…');
        setTimeout(() => { window.location.href = 'mapa.html?v=20'; }, 900);
        return true;
    }
    return false;
}

cargar();
continuarTurno().then((activo) => {
    if (activo) return;
    // Sin turno: si el servicio nativo quedo vivo, se detiene aqui.
    try {
        if (window.AndroidUbicacion && window.AndroidUbicacion.detenerServicio) {
            window.AndroidUbicacion.detenerServicio();
        }
    } catch (e) { console.warn('detener servicio huerfano', e); }
});
