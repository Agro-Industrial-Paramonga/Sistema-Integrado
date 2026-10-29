/* ------------------------------------------------------------
   Turnos y sesiones abiertas — desde el portal, no desde el mapa.

   Muestra dos listas y permite liberar:
   - Unidades en turno  (RPC unidades_en_turno)
   - Sesiones abiertas  (RPC sesiones_panel_lista)

   Solo lo ve Seguridad Industrial. Reusa la `db` global de script.js.
   ------------------------------------------------------------ */
(function () {
    var ID_CAJA = 'turnos-caja';

    function esc(t) {
        return String(t == null ? '' : t)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function normalizar(v) {
        return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    }

    function clavePortal() {
        try { return localStorage.getItem('pc_sesion_clave') || ''; } catch (e) { return ''; }
    }

    function puedeVer() {
        try {
            var u = JSON.parse(localStorage.getItem('pc_user') || 'null');
            if (!u) return false;
            var texto = normalizar(String(u.seccion || '') + ' ' + String(u.area || '') + ' ' + String(u.nombre || ''));
            return texto.indexOf('seguridad industrial') !== -1 || texto.indexOf('chunga') !== -1;
        } catch (e) { return false; }
    }

    function fechaHora(iso) {
        if (!iso) return '—';
        var d = new Date(iso);
        if (isNaN(d)) return '—';
        return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) + ' · ' +
               d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    }

    function css() {
        if (document.getElementById('turnos-css')) return;
        var s = document.createElement('style');
        s.id = 'turnos-css';
        s.textContent = [
            '#turnos-panel{position:fixed;inset:0;z-index:4200;display:none;align-items:center;justify-content:center;',
            'padding:16px;background:rgba(15,23,42,.86)}',
            '#turnos-panel.abierto{display:flex}',
            '.turnos-caja{background:#fff;border-radius:16px;width:100%;max-width:520px;max-height:88vh;overflow:auto;',
            'padding:18px;font-family:inherit}',
            '.turnos-cab{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}',
            '.turnos-cab h2{margin:0;font-size:1.02rem;color:#0f172a}',
            '.turnos-cerrar{border:none;background:#f1f5f9;color:#475569;width:30px;height:30px;border-radius:8px;',
            'cursor:pointer;font-size:.9rem}',
            '.turnos-tit{margin:18px 0 4px;font-size:.88rem;color:#0f172a;display:flex;align-items:center;gap:7px}',
            '.turnos-sub{margin:0 0 8px;font-size:.72rem;color:#64748b;line-height:1.35}',
            '.turnos-fila{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;',
            'border-bottom:1px solid #f1f5f9}',
            '.turnos-nombre{font-size:.82rem;font-weight:700;color:#0f172a}',
            '.turnos-meta{font-size:.7rem;color:#64748b;margin-top:2px}',
            '.turnos-lib{border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;border-radius:9px;padding:7px 11px;',
            'font-size:.74rem;font-weight:700;cursor:pointer;white-space:nowrap}',
            '.turnos-aviso{margin-top:10px;font-size:.74rem;color:#b91c1c}'
        ].join('');
        document.head.appendChild(s);
    }

    function caja() {
        var p = document.getElementById('turnos-panel');
        if (p) return p;
        css();
        p = document.createElement('div');
        p.id = 'turnos-panel';
        p.innerHTML = '<div class="turnos-caja">' +
            '<div class="turnos-cab"><h2><i class="fas fa-users"></i> Turnos y sesiones</h2>' +
            '<button type="button" class="turnos-cerrar" aria-label="Cerrar"><i class="fas fa-xmark"></i></button></div>' +
            '<div id="turnos-unidades"></div><div id="turnos-sesiones"></div>' +
            '<div id="turnos-aviso" class="turnos-aviso"></div></div>';
        document.body.appendChild(p);
        p.querySelector('.turnos-cerrar').addEventListener('click', cerrar);
        p.addEventListener('click', function (ev) { if (ev.target === p) cerrar(); });
        return p;
    }

    function aviso(texto) {
        var c = document.getElementById('turnos-aviso');
        if (c) c.textContent = texto || '';
    }

    async function pintar() {
        var unidades = document.getElementById('turnos-unidades');
        var sesiones = document.getElementById('turnos-sesiones');
        if (!unidades || !sesiones) return;

        var clave = clavePortal();
        if (!clave) {
            unidades.innerHTML = '<p class="turnos-sub">No hay sesión activa en este equipo.</p>';
            sesiones.innerHTML = '';
            return;
        }

        unidades.innerHTML = '<p class="turnos-sub">Cargando…</p>';
        sesiones.innerHTML = '';

        try {
            var r = await db.rpc('unidades_en_turno', { p_clave_quien: clave });
            var filas = (!r.error && r.data) ? r.data : [];
            unidades.innerHTML = '<h3 class="turnos-tit"><i class="fas fa-truck-moving"></i> Unidades en turno</h3>' +
                '<p class="turnos-sub">Cada turno lo cierra su conductor. Si el celular se perdió o no cierra, ' +
                'libéralo acá: deja de enviar ubicación y el cierre queda en el historial.</p>' +
                (filas.length ? filas.map(function (u) {
                    var equipo = u.dispositivo ? 'equipo ' + esc(String(u.dispositivo).slice(0, 8)) : 'sin equipo registrado';
                    return '<div class="turnos-fila"><div><div class="turnos-nombre">' + esc(u.unidad) + ' · ' + esc(u.user_id) + '</div>' +
                        '<div class="turnos-meta">' + (u.dni ? 'DNI ' + esc(u.dni) + ' · ' : '') +
                        'desde ' + esc(fechaHora(u.inicio)) + ' · ' + equipo + '</div></div>' +
                        '<button type="button" class="turnos-lib" data-unidad="' + esc(u.unidad) + '">' +
                        '<i class="fas fa-unlink"></i> Liberar</button></div>';
                }).join('') : '<p class="turnos-sub">Ninguna unidad tiene turno abierto ahora mismo.</p>');
            unidades.querySelectorAll('.turnos-lib').forEach(function (b) {
                b.addEventListener('click', function () { liberarUnidad(b.dataset.unidad); });
            });
        } catch (e) {
            unidades.innerHTML = '<h3 class="turnos-tit"><i class="fas fa-truck-moving"></i> Unidades en turno</h3>' +
                '<p class="turnos-sub">No se pudo consultar.</p>';
        }

        try {
            var s2 = await db.rpc('sesiones_panel_lista', { p_clave_quien: clave });
            var lista = (!s2.error && s2.data) ? s2.data : [];
            sesiones.innerHTML = '<h3 class="turnos-tit"><i class="fas fa-user-clock"></i> Sesiones abiertas</h3>' +
                '<p class="turnos-sub">Mientras la sesión exista, ese equipo recibe las alarmas. Al liberarla deja de ' +
                'recibirlas en el acto y el cierre queda en el historial.</p>' +
                (lista.length ? lista.map(function (s) {
                    var equipo = s.dispositivo ? 'equipo ' + esc(String(s.dispositivo).slice(0, 8)) : 'sin equipo registrado';
                    return '<div class="turnos-fila"><div><div class="turnos-nombre">' + esc(s.user_id) + '</div>' +
                        '<div class="turnos-meta">' + esc(s.seccion || 'sin sección') + ' · desde ' + esc(fechaHora(s.inicio)) +
                        ' · ' + equipo + '</div></div>' +
                        '<button type="button" class="turnos-lib" data-user="' + esc(s.user_id) +
                        '" data-disp="' + esc(s.dispositivo || '') + '"><i class="fas fa-unlink"></i> Liberar</button></div>';
                }).join('') : '<p class="turnos-sub">Ningún equipo tiene sesión abierta ahora mismo.</p>');
            sesiones.querySelectorAll('.turnos-lib').forEach(function (b) {
                b.addEventListener('click', function () { liberarSesion(b.dataset.user, b.dataset.disp || null); });
            });
        } catch (e) {
            sesiones.innerHTML = '<h3 class="turnos-tit"><i class="fas fa-user-clock"></i> Sesiones abiertas</h3>' +
                '<p class="turnos-sub">No se pudo consultar.</p>';
        }
        aviso('');
    }

    async function liberarUnidad(unidad) {
        if (!confirm('¿Cerrar el turno de la unidad ' + unidad + '? Dejará de enviar ubicación y el cierre queda en el historial.')) return;
        try {
            var r = await db.rpc('liberar_unidad', { p_clave_quien: clavePortal(), p_unidad: unidad });
            if (r.error || !r.data || !r.data.ok) { aviso('No se pudo liberar: ' + ((r.error && r.error.message) || 'sin permiso')); return; }
            await pintar();
        } catch (e) { aviso('No se pudo liberar: ' + e.message); }
    }

    async function liberarSesion(userId, dispositivo) {
        if (!confirm('¿Cerrar la sesión de ' + userId + '? Ese equipo dejará de recibir alarmas y el cierre queda en el historial.')) return;
        try {
            var r = await db.rpc('liberar_sesion_panel', {
                p_clave_quien: clavePortal(),
                p_user_id: userId,
                p_dispositivo: dispositivo || null
            });
            if (r.error || !r.data || !r.data.ok) { aviso('No se pudo liberar: ' + ((r.error && r.error.message) || 'sin permiso')); return; }
            await pintar();
        } catch (e) { aviso('No se pudo liberar: ' + e.message); }
    }

    function abrir() {
        if (!puedeVer()) return;
        caja().classList.add('abierto');
        pintar();
    }

    function cerrar() {
        var p = document.getElementById('turnos-panel');
        if (p) p.classList.remove('abierto');
    }

    function crearBoton() {
        if (!puedeVer()) return;
        if (document.getElementById('btn-turnos')) return;
        var ancla = document.getElementById('btn-mapa-plan');
        if (!ancla || !ancla.parentNode) return;

        var b = document.createElement('button');
        b.type = 'button';
        b.id = 'btn-turnos';
        b.title = 'Turnos y sesiones abiertas';
        b.style.cssText = 'border:1px solid #e2e8f0;background:#fff;border-radius:10px;width:38px;height:38px;' +
            'display:inline-flex;align-items:center;justify-content:center;color:#475569;cursor:pointer;margin-right:8px;';
        b.innerHTML = '<i class="fas fa-users"></i>';
        b.addEventListener('click', abrir);
        ancla.parentNode.insertBefore(b, ancla);
    }

    document.addEventListener('DOMContentLoaded', function () {
        /* El encabezado aparece recién cuando termina de validar la sesión, así
           que se reintenta un rato en vez de asumir que ya está. */
        var intentos = 0;
        crearBoton();
        var t = setInterval(function () {
            intentos++;
            crearBoton();
            if (document.getElementById('btn-turnos') || intentos > 60) clearInterval(t);
        }, 700);
    });
})();
