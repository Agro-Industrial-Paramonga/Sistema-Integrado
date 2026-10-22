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

    // Activar el servicio nativo (sigue enviando con la app cerrada)
    if (window.AndroidUbicacion && window.AndroidUbicacion.iniciarServicio) {
        window.AndroidUbicacion.iniciarServicio(nombre, unidad);
    }

    mostrarAviso('Turno iniciado. Abriendo el mapa…');
    window.location.href = 'mapa.html';
}

cargar();
