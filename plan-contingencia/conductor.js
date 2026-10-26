/* ============================================================
   INGRESO DE CONDUCTORES
   Seleccion en dos pasos: serie -> unidad -> nombre
   ============================================================ */

const SUPABASE_URL = 'https://bfhfnldqwsrcpsdqpyat.supabase.co';
const SUPABASE_KEY = 'sb_publishable_z-jW4WrGLq7wEhCI_CW3Ig_vQZwtOMh';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let unidades = [];

async function cargar() {
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
        prefijos.map(p => `<option value="${p}">${p}</option>`).join('');

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
            lista.map(u => `<option value="${u.nombre}">${u.nombre}</option>`).join('');
        selU.disabled = false;
        validar();
    });

    document.getElementById('sel-unidad').addEventListener('change', validar);
    document.getElementById('inp-nombre').addEventListener('input', validar);
}

function validar() {
    const unidad = document.getElementById('sel-unidad').value;
    const nombre = document.getElementById('inp-nombre').value.trim();
    document.getElementById('btn-entrar').disabled = !(unidad && nombre.length >= 5);
}

function mostrarAviso(texto) {
    const a = document.getElementById('aviso');
    a.textContent = texto;
    a.style.display = texto ? 'block' : 'none';
}

/* ------------------------------------------------------------
   Permiso de ubicacion
   ------------------------------------------------------------ */
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

function registrarPush(nombre) {
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
                    await db.from('push_subscriptions').insert({ user_id: nombre, token: token.value });
                    await db.from('ubicaciones').update({ token: token.value }).eq('user_id', nombre);
                    try { localStorage.setItem('pushToken', token.value); } catch (e) {}
                    mostrarAviso('Celular registrado para alarmas ✓');
                    fin(true);
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
    const nombre = document.getElementById('inp-nombre').value.trim().toUpperCase();

    if (!unidad || !nombre) return;

    const sesion = { unidad, nombre, inicio: new Date().toISOString() };
    localStorage.setItem('conductor', JSON.stringify(sesion));

    pedirPermisoUbicacion();


    const boton = document.getElementById('btn-entrar');
    boton.disabled = true;
    boton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando…';
    mostrarAviso('Registrando el celular para alarmas…');

    const listo = await registrarPush(nombre);

    // Servicio nativo: sigue enviando con la app cerrada
    if (window.AndroidUbicacion && window.AndroidUbicacion.iniciarServicio) {
        window.AndroidUbicacion.iniciarServicio(nombre, unidad);
    }

    // Permiso de pantalla completa para que la alarma aparezca sola
    if (window.AndroidUbicacion && window.AndroidUbicacion.pedirPantallaCompleta) {
        try { window.AndroidUbicacion.pedirPantallaCompleta(); } catch (e) {}
    }

    mostrarAviso(listo
        ? 'Turno iniciado y celular registrado. Abriendo el mapa…'
        : 'Turno iniciado, pero el celular no se registró para alarmas.');

    setTimeout(() => { window.location.href = 'mapa.html'; }, listo ? 700 : 1800);
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
        setTimeout(() => { window.location.href = 'mapa.html'; }, 900);
        return true;
    }
    return false;
}

cargar();
continuarTurno();
