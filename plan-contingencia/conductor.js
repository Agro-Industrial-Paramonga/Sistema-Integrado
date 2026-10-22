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
        .select('nombre, prefijo')
        .eq('activo', true)
        .order('nombre');

    if (error) {
        mostrarAviso('No se pudo cargar la lista de unidades: ' + error.message);
        return;
    }

    unidades = data || [];

    const prefijos = [...new Set(unidades.map(u => u.prefijo).filter(Boolean))].sort();
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



/* Registra el celular para recibir alarmas (FCM) a nombre del conductor */
async function registrarPush(nombre) {
    try {
        const cap = window.Capacitor;
        const PN = cap && cap.Plugins && cap.Plugins.PushNotifications;
        if (!PN) return;                      // fuera del APK: no aplica

        let permiso = await PN.checkPermissions();
        if (permiso.receive !== 'granted') permiso = await PN.requestPermissions();
        if (permiso.receive !== 'granted') { mostrarAviso('Sin permiso de notificaciones: no recibirás alarmas.'); return; }

        PN.addListener('registration', async (token) => {
            await db.from('push_subscriptions').delete().eq('user_id', nombre);
            await db.from('push_subscriptions').insert({ user_id: nombre, token: token.value });
        });

        PN.addListener('registrationError', (e) => console.warn('Push error', e));

        await PN.register();
    } catch (e) {
        console.warn('Push no disponible:', e);
    }
}

function pedirPermisoUbicacion() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
        () => {},
        (err) => { mostrarAviso('Activa el permiso de ubicación: ' + err.message); },
        { enableHighAccuracy: true, timeout: 20000 }
    );
}

function iniciarTurno() {
    const unidad = document.getElementById('sel-unidad').value;
    const nombre = document.getElementById('inp-nombre').value.trim().toUpperCase();

    if (!unidad || !nombre) return;

    const sesion = {
        unidad,
        nombre,
        inicio: new Date().toISOString()
    };

    localStorage.setItem('conductor', JSON.stringify(sesion));

    // Pedir el permiso de ubicacion en este momento
    pedirPermisoUbicacion();

    // Registrar el celular para recibir alarmas de evacuacion
    registrarPush(nombre);

    // Activar el servicio nativo (sigue enviando con la app cerrada)
    if (window.AndroidUbicacion && window.AndroidUbicacion.iniciarServicio) {
        window.AndroidUbicacion.iniciarServicio(nombre, unidad);
    }

    mostrarAviso('Turno iniciado. Abriendo el mapa…');
    window.location.href = 'mapa.html';
}

cargar();
