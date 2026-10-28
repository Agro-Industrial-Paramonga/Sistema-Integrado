/* ============================================================
   EVACUACIÓN AUTOMÁTICA EN EL CELULAR DEL CONDUCTOR
   Si hay turno iniciado y la unidad está dentro o cerca de un
   campo que quedó en zona de evacuación (semáforo rojo), se
   dispara sola la misma alarma que se manda a mano.

   Archivo aparte: no toca conductor.js, ni el mapa, ni las
   alertas existentes. Sólo lee estado y posición.
   ============================================================ */
(function () {
    'use strict';

    const SEM_URL = 'https://bfhfnldqwsrcpsdqpyat.supabase.co';
    const SEM_KEY = 'sb_publishable_z-jW4WrGLq7wEhCI_CW3Ig_vQZwtOMh';
    const RADIO_M = 300;          // "cerca" del campo
    const LS_MARCA = 'evac_auto_ts';
    const MS_REVISION = 45000;    // cada cuánto se revisa

    let anillos = null;

    function norm(v) {
        return String(v || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toLowerCase();
    }

    function sesion() {
        try {
            return JSON.parse(localStorage.getItem('conductor') || 'null');
        } catch (e) {
            return null;
        }
    }

    async function api(ruta) {
        const resp = await fetch(SEM_URL + '/rest/v1/' + ruta, {
            headers: { apikey: SEM_KEY, Authorization: 'Bearer ' + SEM_KEY },
            cache: 'no-store',
        });
        if (!resp.ok) return null;
        try {
            return await resp.json();
        } catch (e) {
            return null;
        }
    }

    /* Deja rastro en app_log para poder revisar desde fuera qué ve el celular */
    async function log(detalle) {
        try {
            await fetch(SEM_URL + '/rest/v1/app_log', {
                method: 'POST',
                headers: {
                    apikey: SEM_KEY,
                    Authorization: 'Bearer ' + SEM_KEY,
                    'Content-Type': 'application/json',
                    Prefer: 'return=minimal',
                },
                body: JSON.stringify({ origen: 'evac_auto', detalle: String(detalle).slice(0, 400) }),
            });
        } catch (e) {}
    }

    async function cargarCampos() {
        const salida = [];
        try {
            const resp = await fetch('assets/campos.geojson?v=1', { cache: 'force-cache' });
            const datos = await resp.json();
            (datos.features || []).forEach(function (f) {
                const g = f.geometry || {};
                const polis = g.type === 'MultiPolygon' ? g.coordinates : (g.type === 'Polygon' ? [g.coordinates] : []);
                polis.forEach(function (poli) {
                    const anillo = (poli[0] || []).map(function (c) { return [c[1], c[0]]; });
                    if (anillo.length >= 3) salida.push(anillo);
                });
            });
        } catch (e) {
            /* sin campos no se puede evaluar: se reintenta en la próxima vuelta */
        }
        anillos = salida;
        return salida;
    }

    function dentro(lat, lon, anillo) {
        let d = false;
        for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
            const yi = anillo[i][0], xi = anillo[i][1];
            const yj = anillo[j][0], xj = anillo[j][1];
            const cruza = ((yi > lat) !== (yj > lat)) &&
                (lon < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi);
            if (cruza) d = !d;
        }
        return d;
    }

    function distancia(lat, lon, anillo) {
        const cos = Math.cos(lat * Math.PI / 180);
        let menor = Infinity;
        for (let i = 0; i < anillo.length; i++) {
            const a = anillo[i], b = anillo[(i + 1) % anillo.length];
            const dy = (b[0] - a[0]) * 111320;
            const dx = (b[1] - a[1]) * 111320 * cos;
            const py = (lat - a[0]) * 111320;
            const px = (lon - a[1]) * 111320 * cos;
            const l2 = dx * dx + dy * dy;
            let t = l2 ? (px * dx + py * dy) / l2 : 0;
            t = Math.max(0, Math.min(1, t));
            menor = Math.min(menor, Math.hypot(px - dx * t, py - dy * t));
        }
        return menor;
    }

    /* Manda la alarma: nativa si estamos en la app, y si no, pantalla completa */
    function disparar(unidad) {
        const titulo = 'EVACUACIÓN · ' + unidad;
        const cuerpo = 'Evacue de inmediato y diríjase a un lugar seguro.';

        try {
            const cap = window.Capacitor;
            const Alarma = cap && cap.Plugins && cap.Plugins.Alarma;
            if (Alarma && typeof Alarma.probarAlarma === 'function') {
                Alarma.probarAlarma({ titulo: titulo, cuerpo: cuerpo });
                return;
            }
        } catch (e) {}

        avisoPantallaCompleta(titulo, cuerpo);
    }

    function avisoPantallaCompleta(titulo, cuerpo) {
        if (document.getElementById('evac-auto')) return;
        const caja = document.createElement('div');
        caja.id = 'evac-auto';
        caja.setAttribute('style', [
            'position:fixed', 'inset:0', 'z-index:99999', 'background:#b91c1c', 'color:#fff',
            'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
            'gap:14px', 'padding:26px', 'text-align:center', 'font-family:Segoe UI,system-ui,sans-serif',
        ].join(';'));
        caja.innerHTML =
            '<div style="font-size:15px;letter-spacing:.14em;font-weight:800;opacity:.9">ALERTA DE EVACUACIÓN</div>' +
            '<div style="font-size:26px;font-weight:800;line-height:1.25">' + titulo + '</div>' +
            '<div style="font-size:17px;max-width:440px;line-height:1.45">' + cuerpo + '</div>' +
            '<button id="evac-auto-ok" style="margin-top:10px;background:#fff;color:#b91c1c;border:none;' +
            'border-radius:12px;padding:14px 26px;font-size:16px;font-weight:800;cursor:pointer">ENTENDIDO</button>';
        document.body.appendChild(caja);
        if (navigator.vibrate) { try { navigator.vibrate([400, 150, 400, 150, 700]); } catch (e) {} }
        const b = document.getElementById('evac-auto-ok');
        if (b) b.addEventListener('click', function () { caja.remove(); });
    }

    /* ¿Ya salió el aviso por la vía normal en los últimos minutos? */
    async function yaAvisado(unidad) {
        const desde = new Date(Date.now() - 4 * 60000).toISOString();
        const filas = await api(
            'alertas_log?select=unidad,resultado,creado_en&resultado=eq.enviada&creado_en=gte.' +
            encodeURIComponent(desde) + '&order=creado_en.desc&limit=20'
        );
        const buscada = norm(unidad);
        return (filas || []).some(function (f) { return norm(f.unidad) === buscada; });
    }

    let ultimoLog = '';

    async function revisar() {
        const s = sesion();
        if (!s || !s.unidad) return;

        const estado = await api('semaforo_estado?select=nivel,vigente_desde&id=eq.1');
        const fila = (estado || [])[0];
        if (!fila) { await log('sin respuesta del semaforo'); return; }
        if (fila.nivel !== 'rojo') return;

        const marca = String(fila.vigente_desde || 'rojo');
        let hecha = null;
        try { hecha = localStorage.getItem(LS_MARCA); } catch (e) {}
        if (hecha === marca) return;

        const ub = await api('ubicaciones?select=lat,lon&unidad=eq.' + encodeURIComponent(s.unidad) + '&limit=1');
        const pos = (ub || [])[0];
        if (!pos) return;
        const lat = Number(pos.lat), lon = Number(pos.lon);
        if (!isFinite(lat) || !isFinite(lon)) return;

        if (anillos === null) await cargarCampos();
        if (!anillos || !anillos.length) return;

        let dist = Infinity, ins = false;
        anillos.forEach(function (a) {
            if (dentro(lat, lon, a)) ins = true;
            const d = distancia(lat, lon, a);
            if (d < dist) dist = d;
        });
        const cerca = ins || dist <= RADIO_M;

        const marcaLog = fila.nivel + '|' + Math.round(dist) + '|' + ins;
        if (marcaLog !== ultimoLog) {
            ultimoLog = marcaLog;
            await log('eval ' + s.unidad + ' · nivel=' + fila.nivel + ' · enCampo=' + ins +
                ' · distMin=' + Math.round(dist) + 'm · anillos=' + anillos.length +
                ' · dispara=' + cerca);
        }

        if (!cerca) return;

        /* La alarma del propio celular es la que se ve a pantalla completa,
           así que no se espera a ningún push. */
        try { localStorage.setItem(LS_MARCA, marca); } catch (e) {}
        const cap = window.Capacitor;
        const hay = !!(cap && cap.Plugins && cap.Plugins.Alarma && cap.Plugins.Alarma.probarAlarma);
        await log('DISPARO ' + s.unidad + ' · pluginNativo=' + hay + ' · plataforma=' +
            (cap && cap.getPlatform ? cap.getPlatform() : 'sin capacitor'));
        disparar(s.unidad);
    }

    function arrancar() {
        setTimeout(function () { revisar().catch(function () {}); }, 4000);
        setInterval(function () {
            if (document.hidden) return;
            revisar().catch(function () {});
        }, MS_REVISION);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', arrancar);
    } else {
        arrancar();
    }
})();
