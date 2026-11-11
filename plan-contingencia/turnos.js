/* ------------------------------------------------------------
   Turnos y sesiones abiertas — desde el portal, no desde el mapa.

   Muestra dos listas y permite liberar:
   - Unidades en turno  (RPC unidades_en_turno)
   - Sesiones abiertas  (RPC sesiones_panel_lista)

   Solo lo ve Seguridad Industrial. Reusa la `db` global de script.js.
   ------------------------------------------------------------ */
(function () {
    var ID_CAJA = 'turnos-caja';
    var URL_FN = 'https://bfhfnldqwsrcpsdqpyat.supabase.co/functions/v1/send-push-notification';
    var CLAVE_PUBLICA = 'sb_publishable_z-jW4WrGLq7wEhCI_CW3Ig_vQZwtOMh';
    var MAPA_SESIONES = {};
    var WH_FILA = null;

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

    function switchAlarma(userId, tipo, apagada) {
        return '<button type="button" class="turnos-switch' + (apagada ? ' apagada' : '') + '"' +
            ' role="switch" aria-checked="' + (apagada ? 'false' : 'true') + '"' +
            ' data-user="' + esc(userId) + '" data-tipo="' + esc(tipo) + '"' +
            ' title="' + (apagada ? 'Alarmas apagadas · pulsa para activarlas'
                                 : 'Alarmas activas · pulsa para apagarlas') + '"></button>';
    }

    function enlazarSwitches(contenedor) {
        contenedor.querySelectorAll('.turnos-switch').forEach(function (b) {
            b.addEventListener('click', function () {
                alternarAlarma(b.dataset.user, b.dataset.tipo, !b.classList.contains('apagada'), b);
            });
        });
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
            '.turnos-acciones{display:flex;align-items:center;gap:8px;flex:0 0 auto}',
            '.turnos-switch{position:relative;flex:0 0 auto;width:38px;height:21px;border-radius:999px;border:none;',
            'padding:0;cursor:pointer;background:#16a34a;transition:background .15s;vertical-align:middle}',
            '.turnos-switch::after{content:"";position:absolute;top:3px;left:20px;width:15px;height:15px;border-radius:50%;',
            'background:#fff;box-shadow:0 1px 2px rgba(15,23,42,.35);transition:left .15s}',
            '.turnos-switch.apagada{background:#dc2626}',
            '.turnos-switch.apagada::after{left:3px}',
            '.turnos-aviso{margin-top:10px;font-size:.74rem;color:#b91c1c}',

            /* --- Webhook de NotiAlarm (iPhone) --- */
            '.turnos-wh{display:inline-flex;align-items:center;gap:5px;border:1px dashed #cbd5e1;background:#fff;',
            'color:#64748b;border-radius:9px;padding:6px 9px;font-size:.7rem;font-weight:700;cursor:pointer;white-space:nowrap}',
            '.turnos-wh.puesto{border-style:solid;border-color:#a7f3d0;background:#f0fdf4;color:#047857}',
            '.turnos-wh.malo{border-style:solid;border-color:#fecaca;background:#fef2f2;color:#b91c1c}',
            '.wh-fondo{position:fixed;inset:0;z-index:4600;display:none;align-items:center;justify-content:center;padding:16px;',
            'background:rgba(15,23,42,.9)}',
            '.wh-fondo.abierto{display:flex}',
            '.wh-caja{background:#fff;border-radius:16px;width:100%;max-width:440px;padding:18px;font-family:inherit}',
            '.wh-cab{display:flex;align-items:center;justify-content:space-between;margin-bottom:2px}',
            '.wh-cab h3{margin:0;font-size:.98rem;color:#0f172a}',
            '.wh-x{border:none;background:#f1f5f9;color:#475569;width:30px;height:30px;border-radius:8px;cursor:pointer}',
            '.wh-quien{margin:0 0 12px;font-size:.78rem;color:#475569;font-weight:700}',
            '.wh-caja input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #cbd5e1;border-radius:10px;',
            'font-size:.8rem;font-family:inherit}',
            '.wh-nota{margin:8px 0 0;font-size:.7rem;color:#64748b;line-height:1.4}',
            '.wh-estado{margin-top:10px;font-size:.72rem;font-weight:700;min-height:16px}',
            '.wh-estado.ok{color:#047857}',
            '.wh-estado.malo{color:#b91c1c}',
            '.wh-botones{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}',
            '.wh-botones button{flex:1 1 auto;border-radius:10px;padding:11px 12px;font-size:.78rem;font-weight:800;',
            'cursor:pointer;border:1px solid transparent}',
            '.wh-guardar{background:#10a35e;color:#fff}',
            '.wh-probar{background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe}',
            '.wh-quitar{background:#fef2f2;color:#b91c1c;border-color:#fecaca}'
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

        // --- 1. GUARDAR POSICIÓN DEL SCROLL ---
        var caja = document.querySelector('.turnos-caja');
        var scrollPos = caja ? caja.scrollTop : 0;

        var clave = clavePortal();
        if (!clave) {
            unidades.innerHTML = '<p class="turnos-sub">No hay sesión activa en este equipo.</p>';
            sesiones.innerHTML = '';
            return;
        }

        MAPA_SESIONES = {};

        unidades.innerHTML = '<p class="turnos-sub">Cargando…</p>';
        sesiones.innerHTML = '';

        try {
            var r = await db.rpc('unidades_en_turno', { p_clave_quien: clave });
            var filas = (!r.error && r.data) ? r.data : [];
            unidades.innerHTML = '<h3 class="turnos-tit"><i class="fas fa-truck-moving"></i> Unidades en turno</h3>' +
                '<p class="turnos-sub">Cada turno lo cierra su conductor. Si el celular se perdió o no cierra, ' +
                'libéralo acá: deja de enviar ubicación y el cierre queda en el historial. ' +
                'El interruptor verde recibe alarmas; en rojo, ese celular no recibe ninguna.</p>' +
                (filas.length ? filas.map(function (u) {
                    var equipo = u.dispositivo ? 'equipo ' + esc(String(u.dispositivo).slice(0, 8)) : 'sin equipo registrado';
                    return '<div class="turnos-fila"><div><div class="turnos-nombre">' + esc(u.unidad) + ' · ' + esc(u.user_id) + '</div>' +
                        '<div class="turnos-meta">' + (u.dni ? 'DNI ' + esc(u.dni) + ' · ' : '') +
                        'desde ' + esc(fechaHora(u.inicio)) + ' · ' + equipo + '</div></div>' +
                        '<div class="turnos-acciones">' + switchAlarma(u.user_id, 'conductor', u.alarma_off) +
                        '<button type="button" class="turnos-lib" data-unidad="' + esc(u.unidad) + '">' +
                        '<i class="fas fa-unlink"></i> Liberar</button></div></div>';
                }).join('') : '<p class="turnos-sub">Ninguna unidad tiene turno abierto ahora mismo.</p>');
            enlazarSwitches(unidades);
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
            var puedeWebhook = !!(lista.length && lista[0].puede_webhook);
            sesiones.innerHTML = '<h3 class="turnos-tit"><i class="fas fa-user-clock"></i> Sesiones abiertas</h3>' +
                '<p class="turnos-sub">Mientras la sesión exista, ese equipo recibe las alarmas. Al liberarla deja de ' +
                'recibirlas en el acto y el cierre queda en el historial. ' +
                'El interruptor verde recibe alarmas; en rojo, ese equipo no recibe ninguna.' +
                (puedeWebhook ? ' El botón <b>Webhook</b> carga la alarma del iPhone de esa persona.' : '') + '</p>' +
                (lista.length ? lista.map(function (s, i) {
                    MAPA_SESIONES[i] = s;
                    var equipo = s.dispositivo ? 'equipo ' + esc(String(s.dispositivo).slice(0, 8)) : 'sin equipo registrado';
                    return '<div class="turnos-fila"><div><div class="turnos-nombre">' + esc(s.user_id) + '</div>' +
                        '<div class="turnos-meta">' + esc(s.seccion || 'sin sección') + ' · desde ' + esc(fechaHora(s.inicio)) +
                        ' · ' + equipo + '</div></div>' +
                        '<div class="turnos-acciones">' +
                        (puedeWebhook ? botonWebhook(s, i) : '') +
                        switchAlarma(s.user_id, 'jefe', s.alarma_off) +
                        '<button type="button" class="turnos-lib" data-user="' + esc(s.user_id) +
                        '" data-disp="' + esc(s.dispositivo || '') + '"><i class="fas fa-unlink"></i> Liberar</button></div></div>';
                }).join('') : '<p class="turnos-sub">Ningún equipo tiene sesión abierta ahora mismo.</p>');
            enlazarSwitches(sesiones);
            sesiones.querySelectorAll('.turnos-wh').forEach(function (b) {
                b.addEventListener('click', function () { abrirWebhook(Number(b.dataset.idx)); });
            });
            sesiones.querySelectorAll('.turnos-lib').forEach(function (b) {
                b.addEventListener('click', function () { liberarSesion(b.dataset.user, b.dataset.disp || null); });
            });
        } catch (e) {
            sesiones.innerHTML = '<h3 class="turnos-tit"><i class="fas fa-user-clock"></i> Sesiones abiertas</h3>' +
                '<p class="turnos-sub">No se pudo consultar.</p>';
        }
        aviso('');

        // --- 2. RESTAURAR POSICIÓN DEL SCROLL ---
        if (caja) caja.scrollTop = scrollPos;
    }

    /* El switch es la unica senal: verde recibe alarmas, rojo no le llega nada.
       El estado queda guardado en la base hasta que se vuelva a poner verde. */
        async function alternarAlarma(userId, tipo, apagar, boton) {
        if (boton) boton.disabled = true;
        try {
            // La consulta a la base de datos se mantiene EXACTAMENTE IGUAL
            var r = await db.rpc('alternar_alarma', {
                p_clave_quien: clavePortal(),
                p_user_id: userId,
                p_apagar: apagar,
                p_tipo: tipo || null
            });
            
            var ok = !r.error && r.data && r.data.ok;

            if (ok) {
                // SI LA BASE DE DATOS DICE "OK", cambiamos solo el botón
                if (boton) {
                    if (apagar) {
                        boton.classList.add('apagada');
                        boton.setAttribute('aria-checked', 'false');
                        boton.title = 'Alarmas apagadas · pulsa para activarlas';
                    } else {
                        boton.classList.remove('apagada');
                        boton.setAttribute('aria-checked', 'true');
                        boton.title = 'Alarmas activas · pulsa para apagarlas';
                    }
                    boton.disabled = false; // Volvemos a habilitar el botón
                }
                aviso(String(userId).trim() + (apagar
                    ? ': alarmas apagadas, no le llega nada'
                    : ': alarmas activas'));
            } else {
                // SI FALLÓ, el botón nunca cambió visualmente, solo lo reactivamos
                if (boton) boton.disabled = false;
                aviso('No se pudo ' + (apagar ? 'silenciar' : 'activar') + ': ' +
                    ((r.error && r.error.message) || (r.data && r.data.motivo) || 'sin permiso'));
            }
        } catch (e) {
            // SI HAY UN ERROR DE RED, reactivamos el botón sin recargar la lista
            if (boton) boton.disabled = false;
            aviso('No se pudo cambiar: ' + e.message);
        }
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

    /* ============================================================
       WEBHOOK DE NOTIALARM (iPhone)
       La URL privada del NotiAlarm de una persona. Solo la carga
       Seguridad Industrial. Suena mientras la sesión exista y el
       interruptor esté en verde, igual que el celular Android.
       ============================================================ */

    function botonWebhook(s, i) {
        var clase = 'turnos-wh' + (s.webhook ? (s.webhook_estado === 'error' ? ' malo' : ' puesto') : '');
        var titulo = s.webhook
            ? 'iPhone enganchado · pulsa para cambiar la dirección'
            : 'Cargar el webhook de NotiAlarm de esta persona';
        return '<button type="button" class="' + clase + '" data-idx="' + i + '" title="' + esc(titulo) + '">' +
            '<i class="fas fa-mobile-screen-button"></i> Webhook</button>';
    }

    function estadoWebhookTexto(s) {
        if (!s.webhook) return 'Esta persona todavía no tiene webhook cargado.';
        if (!s.webhook_estado) return 'Dirección guardada. Todavía no se ha probado.';
        if (s.webhook_estado === 'error') return 'La última prueba falló (' + fechaHora(s.webhook_probado_en) + ').';
        return 'Última prueba correcta: ' + fechaHora(s.webhook_probado_en) + '.';
    }

    function cajaWebhook() {
        var p = document.getElementById('wh-panel');
        if (p) return p;
        p = document.createElement('div');
        p.id = 'wh-panel';
        p.className = 'wh-fondo';
        p.innerHTML =
            '<div class="wh-caja">' +
            '<div class="wh-cab"><h3><i class="fas fa-mobile-screen-button"></i> Webhook de NotiAlarm</h3>' +
            '<button type="button" class="wh-x" aria-label="Cerrar"><i class="fas fa-xmark"></i></button></div>' +
            '<p class="wh-quien" id="wh-quien"></p>' +
            '<input id="wh-url" type="url" inputmode="url" autocomplete="off" spellcheck="false" ' +
            'placeholder="https://hook.notialarm.com/..." />' +
            '<p class="wh-nota">Pega la dirección privada que muestra NotiAlarm en el iPhone de esta persona. ' +
            'Es personal: quien la tenga puede hacer sonar ese teléfono. Si la persona cambia de equipo, ' +
            'se reemplaza por la nueva.</p>' +
            '<div class="wh-estado" id="wh-estado"></div>' +
            '<div class="wh-botones">' +
            '<button type="button" class="wh-probar" id="wh-probar"><i class="fas fa-bell"></i> Probar</button>' +
            '<button type="button" class="wh-guardar" id="wh-guardar"><i class="fas fa-floppy-disk"></i> Guardar</button>' +
            '<button type="button" class="wh-quitar" id="wh-quitar"><i class="fas fa-trash"></i> Quitar</button>' +
            '</div></div>';
        document.body.appendChild(p);
        p.querySelector('.wh-x').addEventListener('click', cerrarWebhook);
        p.addEventListener('click', function (ev) { if (ev.target === p) cerrarWebhook(); });
        document.getElementById('wh-guardar').addEventListener('click', guardarWebhook);
        document.getElementById('wh-probar').addEventListener('click', probarWebhook);
        document.getElementById('wh-quitar').addEventListener('click', quitarWebhook);
        return p;
    }

    function estadoWebhook(texto, tipo) {
        var c = document.getElementById('wh-estado');
        if (!c) return;
        c.textContent = texto || '';
        c.className = 'wh-estado' + (tipo ? ' ' + tipo : '');
    }

    function abrirWebhook(i) {
        var s = MAPA_SESIONES[i];
        if (!s) return;
        cajaWebhook();
        // Se guarda la fila entera, no el número: si la lista se repinta
        // mientras la ventana está abierta, el número apuntaría a otra persona.
        WH_FILA = s;
        document.getElementById('wh-quien').textContent = s.user_id;
        document.getElementById('wh-url').value = s.webhook || '';
        document.getElementById('wh-quitar').style.display = s.webhook ? '' : 'none';
        estadoWebhook(estadoWebhookTexto(s), s.webhook_estado === 'error' ? 'malo' : (s.webhook ? 'ok' : ''));
        document.getElementById('wh-panel').classList.add('abierto');
    }

    function cerrarWebhook() {
        var p = document.getElementById('wh-panel');
        if (p) p.classList.remove('abierto');
        WH_FILA = null;
    }

    function sesionWebhook() {
        return WH_FILA;
    }

    function motivoTexto(m) {
        return ({
            sin_permiso: 'Solo Seguridad Industrial puede cargar webhooks.',
            sin_sesion: 'Esa persona ya no tiene sesión abierta.',
            sin_usuario: 'No se identificó a la persona.',
            sin_url: 'Escribe la dirección.',
            url_invalida: 'La dirección debe empezar con https://'
        })[m] || ('No se pudo guardar: ' + (m || 'error'));
    }

    async function guardarWebhook() {
        var s = sesionWebhook();
        if (!s) return;
        var url = document.getElementById('wh-url').value.trim();
        if (!url) { estadoWebhook('Escribe la dirección.', 'malo'); return; }
        if (!/^https:\/\//i.test(url)) { estadoWebhook('La dirección debe empezar con https://', 'malo'); return; }
        var b = document.getElementById('wh-guardar');
        b.disabled = true;
        estadoWebhook('Guardando…', '');
        try {
            // p_user_id es la persona de la fila; p_clave solo acredita el permiso.
            var r = await db.rpc('registrar_webhook_notialarm', {
                p_clave: clavePortal(),
                p_user_id: s.user_id,
                p_webhook: url
            });
            if (r.error || !r.data || !r.data.ok) {
                estadoWebhook(motivoTexto((r.data && r.data.motivo) || (r.error && r.error.message)), 'malo');
                b.disabled = false;
                return;
            }
            await pintar();
            cerrarWebhook();
        } catch (e) {
            estadoWebhook('No se pudo guardar: ' + e.message, 'malo');
        }
        b.disabled = false;
    }

    async function probarWebhook() {
        var s = sesionWebhook();
        if (!s) return;
        var url = document.getElementById('wh-url').value.trim();
        if (!/^https:\/\//i.test(url)) {
            estadoWebhook('La dirección debe empezar con https://', 'malo');
            return;
        }
        if (s.alarma_off && !confirm(s.user_id + ' tiene las alarmas en rojo: no le sonará ninguna alarma real. ' +
            '¿Hacer sonar el teléfono de todos modos para comprobar la dirección?')) return;

        var b = document.getElementById('wh-probar');
        b.disabled = true;
        estadoWebhook('Probando…', '');
        try {
            var r = await fetch(URL_FN, {
                method: 'POST',
                headers: {
                    apikey: CLAVE_PUBLICA,
                    Authorization: 'Bearer ' + CLAVE_PUBLICA,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ probar: true, webhook: url, title: s.user_id })
            });
            var d = await r.json();
            if (d.ok) {
                estadoWebhook('El teléfono contestó: la dirección sirve.', 'ok');
            } else {
                estadoWebhook(d.motivo === 'sin_conexion'
                    ? 'No hubo respuesta del teléfono. Revisa la dirección.'
                    : 'El teléfono rechazó la dirección (código ' + d.estado + ').',
                    'malo');
            }
            // Deja constancia si la URL probada es la que está guardada
            if (s.webhook_token && s.webhook && s.webhook === url) {
                await db.rpc('marcar_webhook_probado', { p_token: s.webhook_token, p_ok: !!d.ok });
                s.webhook_estado = d.ok ? 'ok' : 'error';
                s.webhook_probado_en = new Date().toISOString();
            }
        } catch (e) {
            estadoWebhook('No se pudo probar: ' + e.message, 'malo');
        }
        b.disabled = false;
    }

    async function quitarWebhook() {
        var s = sesionWebhook();
        if (!s) return;
        if (!confirm('¿Quitar el webhook de ' + s.user_id + '? Ese iPhone dejará de sonar.')) return;
        var b = document.getElementById('wh-quitar');
        b.disabled = true;
        try {
            var r = await db.rpc('quitar_webhook_notialarm', { p_clave: clavePortal(), p_user_id: s.user_id });
            if (r.error || !r.data || !r.data.ok) {
                estadoWebhook(motivoTexto((r.data && r.data.motivo) || (r.error && r.error.message)), 'malo');
                b.disabled = false;
                return;
            }
            await pintar();
            cerrarWebhook();
            aviso(s.user_id + ': webhook quitado');
        } catch (e) {
            estadoWebhook('No se pudo quitar: ' + e.message, 'malo');
        }
        b.disabled = false;
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

        /* Va en el hueco que está a la derecha del semáforo, junto al
           logo. Si esa caja no existiera, se usa el botón del mapa como
           ancla para no dejar la función sin botón. */
        var caja = document.getElementById('acciones-cabecera');
        var ancla = caja || document.getElementById('btn-mapa-plan');
        if (!ancla || !ancla.parentNode) return;

        var b = document.getElementById('btn-turnos');
        if (!b) {
            b = document.createElement('button');
            b.type = 'button';
            b.id = 'btn-turnos';
            b.className = 'btn-cabecera-accion';
            b.title = 'Turnos y alarmas por persona';
            b.setAttribute('aria-label', 'Turnos y alarmas por persona');
            b.innerHTML = '<i class="fas fa-users"></i>';
            b.addEventListener('click', abrir);
        }

        if (b.parentNode !== ancla) {
            if (caja) caja.appendChild(b);
            else ancla.parentNode.insertBefore(b, ancla);
        }
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
