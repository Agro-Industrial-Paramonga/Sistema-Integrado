/* ------------------------------------------------------------
   USUARIOS Y ALARMAS — panel del portal
   ------------------------------------------------------------
   Solo Seguridad Industrial. Lista a TODAS las personas registradas
   (estén o no con sesión abierta) con:

     · interruptor maestro  -> todas las alarmas sí / no (pruebas)
     · casilla semáforo
     · casilla compuertas
     · casilla medida

   Son dos cosas distintas y no se mezclan:
     el maestro apaga todo; la casilla apaga solo esa alarma.

   El alta de personas ya no vive aquí: está en el panel «＋ Personas».

   Datos:
     alarmas_personas_lista(clave)        -> lista con casillas y maestro
     alternar_alarma_persona(clave,...)   -> enciende / apaga una casilla
     alternar_alarma(clave, ...)          -> maestro (todas)
   ------------------------------------------------------------ */
(function () {
    'use strict';

    var PANEL = 'alarmas-panel';
    var ALARMAS = [
        ['semaforo', 'Semáforo'],
        ['compuertas', 'Compuertas'],
        ['medida', 'Medida']
    ];

    var CACHE = [];

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
            return texto.indexOf('seguridad industrial') !== -1;
        } catch (e) { return false; }
    }

    async function rpc(nombre, args) {
        var resp = await db.rpc(nombre, args);
        if (resp.error) throw new Error(resp.error.message || 'Error de base');
        return resp.data;
    }

    /* ---------------- CSS ---------------- */
    function css() {
        if (document.getElementById('alarmas-css')) return;
        var s = document.createElement('style');
        s.id = 'alarmas-css';
        s.textContent = [
            '#alarmas-panel{position:fixed;inset:0;z-index:4300;display:none;align-items:flex-start;justify-content:center;',
            'padding:16px;background:rgba(15,23,42,.88);overflow:auto}',
            '#alarmas-panel.abierto{display:flex}',
            '.al-caja{background:#fff;border-radius:16px;width:100%;max-width:820px;padding:18px;font-family:inherit}',
            '.al-cab{display:flex;align-items:center;justify-content:space-between;gap:10px}',
            '.al-cab h2{margin:0;font-size:1.02rem;color:#0f172a}',
            '.al-x{border:none;background:#f1f5f9;color:#475569;width:30px;height:30px;border-radius:8px;cursor:pointer}',
            '.al-sub{margin:4px 0 12px;font-size:.73rem;color:#64748b;line-height:1.45}',
            '.al-filtros{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}',
            '.al-filtros input[type=text]{flex:1 1 190px;min-width:150px;padding:9px 11px;border:1px solid #cbd5e1;',
            'border-radius:10px;font-size:.8rem;font-family:inherit}',
            '.al-filtros select{padding:9px 11px;border:1px solid #cbd5e1;border-radius:10px;font-size:.78rem;',
            'font-family:inherit;background:#fff;max-width:230px}',
            '.al-filtros label{font-size:.75rem;color:#475569;display:inline-flex;align-items:center;gap:6px}',
            '.al-cuenta{margin-left:auto;font-size:.72rem;color:#64748b;font-weight:700}',
            '.al-tabla{border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}',
            '.al-fila{display:grid;grid-template-columns:1fr 72px 78px 88px 72px;align-items:center;gap:6px;',
            'padding:8px 11px;border-bottom:1px solid #f1f5f9}',
            '.al-fila:last-child{border-bottom:none}',
            '.al-fila.cabecera{background:#f8fafc;font-size:.6rem;letter-spacing:.05em;color:#64748b;',
            'font-weight:800;text-transform:uppercase}',
            '.al-fila.cabecera span{text-align:center}',
            '.al-fila.cabecera span:first-child{text-align:left}',
            '.al-nombre{font-size:.79rem;font-weight:700;color:#0f172a;line-height:1.25}',
            '.al-meta{font-size:.66rem;color:#64748b;margin-top:2px}',
            '.al-casilla{display:flex;justify-content:center}',
            '.al-casilla input{width:19px;height:19px;accent-color:#10a35e;cursor:pointer}',
            '.al-casilla input:disabled{opacity:.5;cursor:wait}',
            '.al-maestro input{accent-color:#dc2626}',
            '.al-fila.apagada .al-casilla input:not(:disabled){opacity:.45}',
            '.al-acceso{border:none;background:#f8fafc;color:#475569;border-radius:8px;width:24px;height:24px;',
            'cursor:pointer;margin-left:6px;font-size:.72rem}',
            '.al-aviso{margin-top:9px;font-size:.73rem;font-weight:700;min-height:15px}',
            '.al-aviso.ok{color:#047857}',
            '.al-aviso.malo{color:#b91c1c}',
            '.al-vacio{padding:18px;text-align:center;font-size:.78rem;color:#64748b}'
        ].join('');
        document.head.appendChild(s);
    }

    /* ---------------- Panel ---------------- */
    function html() {
        var panel = document.createElement('div');
        panel.id = PANEL;
        panel.innerHTML =
            '<div class="al-caja">' +
                '<div class="al-cab"><h2>Usuarios y alarmas</h2>' +
                    '<button type="button" class="al-x" id="al-cerrar" title="Cerrar">&#10005;</button></div>' +
                '<p class="al-sub"><b>Todas</b> apaga o enciende todas las alarmas de esa persona de una vez ' +
                    '(útil para pruebas). Las tres casillas deciden, una por una, qué alarma le llega. ' +
                    'El rol no influye: solo define sus permisos dentro del plan.</p>' +
                '<div class="al-filtros">' +
                    '<input type="text" id="al-buscar" placeholder="Buscar por nombre..." autocomplete="off">' +
                    '<select id="al-seccion"><option value="">Todas las secciones</option></select>' +
                    '<label><input type="checkbox" id="al-activos" checked> Solo activos</label>' +
                    '<span class="al-cuenta" id="al-cuenta"></span>' +
                '</div>' +
                '<div class="al-tabla" id="al-tabla"></div>' +
                '<div class="al-aviso" id="al-aviso"></div>' +
            '</div>';
        document.body.appendChild(panel);

        document.getElementById('al-cerrar').addEventListener('click', cerrar);
        document.getElementById('al-buscar').addEventListener('input', pintarFilas);
        document.getElementById('al-seccion').addEventListener('change', pintarFilas);
        document.getElementById('al-activos').addEventListener('change', pintarFilas);
    }

    function abrir() {
        if (!puedeVer()) return;
        css();
        if (!document.getElementById(PANEL)) html();
        document.getElementById(PANEL).classList.add('abierto');
        cargar();
    }

    function cerrar() {
        var p = document.getElementById(PANEL);
        if (p) p.classList.remove('abierto');
    }

    function aviso(texto, tipo) {
        var a = document.getElementById('al-aviso');
        if (!a) return;
        a.textContent = texto || '';
        a.className = 'al-aviso' + (tipo ? ' ' + tipo : '');
    }

    async function cargar() {
        var tabla = document.getElementById('al-tabla');
        tabla.innerHTML = '<div class="al-vacio">Cargando...</div>';
        aviso('');
        try {
            var filas = await rpc('alarmas_personas_lista', { p_clave_quien: clavePortal() });
            CACHE = filas || [];
            llenarSecciones();
            pintarFilas();
        } catch (e) {
            tabla.innerHTML = '<div class="al-vacio">No se pudo cargar la lista.</div>';
            aviso('No se pudo cargar: ' + e.message, 'malo');
        }
    }

    function llenarSecciones() {
        var sel = document.getElementById('al-seccion');
        var actual = sel.value;
        var vistas = {};
        CACHE.forEach(function (f) {
            var s = String(f.seccion || '').trim();
            if (s) vistas[s] = true;
        });
        var opciones = Object.keys(vistas).sort(function (a, b) { return a.localeCompare(b, 'es'); });
        sel.innerHTML = '<option value="">Todas las secciones</option>' +
            opciones.map(function (o) { return '<option value="' + esc(o) + '">' + esc(o) + '</option>'; }).join('');
        if (opciones.indexOf(actual) !== -1) sel.value = actual;
    }

    function pintarFilas() {
        var tabla = document.getElementById('al-tabla');
        var q = normalizar(document.getElementById('al-buscar').value);
        var sec = document.getElementById('al-seccion').value;
        var soloActivos = document.getElementById('al-activos').checked;

        var lista = CACHE.filter(function (f) {
            if (soloActivos && !f.activo) return false;
            if (sec && String(f.seccion || '') !== sec) return false;
            if (q && normalizar(f.nombre).indexOf(q) === -1) return false;
            return true;
        });

        document.getElementById('al-cuenta').textContent =
            lista.length + ' de ' + CACHE.length;

        if (!lista.length) {
            tabla.innerHTML = '<div class="al-vacio">Sin coincidencias.</div>';
            return;
        }

        var out = ['<div class="al-fila cabecera"><span>Persona</span><span>Todas</span>' +
                   '<span>Semáforo</span><span>Compuertas</span><span>Medida</span></div>'];

        lista.forEach(function (f) {
            var id = esc(f.nombre);
            var apagada = f.alarma_off === true;
            out.push('<div class="al-fila' + (apagada ? ' apagada' : '') + '">' +
                '<div>' +
                    '<div class="al-nombre">' + id +
                        (f.activo ? '' : ' <span style="color:#b91c1c;font-weight:700">(inactivo)</span>') +
                        '<button type="button" class="al-acceso" data-editar="' + id + '" title="Editar permisos">&#9998;</button>' +
                    '</div>' +
                    '<div class="al-meta">' + esc(f.seccion || 'sin sección') + ' · ' + esc(f.rol || 'sin rol') + '</div>' +
                '</div>' +
                '<div class="al-casilla al-maestro"><input type="checkbox" data-maestro="' + id + '"' +
                    (apagada ? '' : ' checked') + ' aria-label="Todas las alarmas"></div>' +
                ALARMAS.map(function (a) {
                    return '<div class="al-casilla"><input type="checkbox" data-user="' + id + '" data-alarma="' + a[0] + '"' +
                        (f[a[0]] ? ' checked' : '') + ' aria-label="' + esc(a[1]) + '"></div>';
                }).join('') +
            '</div>');
        });

        tabla.innerHTML = out.join('');

        tabla.querySelectorAll('input[data-maestro]').forEach(function (c) {
            c.addEventListener('change', function () {
                alternarMaestro(c.dataset.maestro, c.checked, c);
            });
        });
        tabla.querySelectorAll('input[data-alarma]').forEach(function (c) {
            c.addEventListener('change', function () {
                alternar(c.dataset.user, c.dataset.alarma, c.checked, c);
            });
        });
        tabla.querySelectorAll('[data-editar]').forEach(function (b) {
            b.addEventListener('click', function () {
                if (window.abrirPersona) window.abrirPersona(b.dataset.editar);
            });
        });
    }

    /* Interruptor maestro: todas las alarmas de esa persona */
    async function alternarMaestro(persona, activo, casilla) {
        casilla.disabled = true;
        aviso('');
        try {
            var r = await rpc('alternar_alarma', {
                p_clave_quien: clavePortal(),
                p_user_id: persona,
                p_apagar: !activo,
                p_tipo: null
            });
            if (!r || r.ok !== true) {
                casilla.checked = !activo;
                aviso('No se pudo guardar (' + ((r && r.motivo) || 'error') + ').', 'malo');
            } else {
                var f = CACHE.find(function (x) { return x.nombre === persona; });
                if (f) f.alarma_off = !activo;
                aviso(persona + ': ' + (activo ? 'recibe todas las alarmas' : 'NO recibe ninguna alarma'), 'ok');
                pintarFilas();
            }
        } catch (e) {
            casilla.checked = !activo;
            aviso('No se pudo guardar: ' + e.message, 'malo');
        } finally {
            casilla.disabled = false;
        }
    }

    async function alternar(persona, alarma, activo, casilla) {
        casilla.disabled = true;
        aviso('');
        try {
            var r = await rpc('alternar_alarma_persona', {
                p_clave_quien: clavePortal(),
                p_user_id: persona,
                p_alarma: alarma,
                p_activo: activo
            });
            if (!r || r.ok !== true) {
                casilla.checked = !activo;
                aviso('No se pudo guardar (' + ((r && r.motivo) || 'error') + ').', 'malo');
            } else {
                var f = CACHE.find(function (x) { return x.nombre === persona; });
                if (f) f[alarma] = activo;
                aviso(persona + ' · ' + alarma + ': ' + (activo ? 'encendida' : 'apagada'), 'ok');
            }
        } catch (e) {
            casilla.checked = !activo;
            aviso('No se pudo guardar: ' + e.message, 'malo');
        } finally {
            casilla.disabled = false;
        }
    }

    /* ---------------- Botón en la cabecera ---------------- */
    function crearBoton() {
        if (!puedeVer()) return;

        var caja = document.getElementById('acciones-cabecera');
        var ancla = caja || document.getElementById('btn-mapa-plan');
        if (!ancla || !ancla.parentNode) return;

        var b = document.getElementById('btn-alarmas');
        if (!b) {
            b = document.createElement('button');
            b.type = 'button';
            b.id = 'btn-alarmas';
            b.className = 'btn-cabecera-accion';
            b.title = 'Usuarios y alarmas';
            b.setAttribute('aria-label', 'Usuarios y alarmas');
            b.innerHTML = '<i class="fas fa-bell"></i>';
            b.addEventListener('click', abrir);
        }

        if (b.parentNode !== ancla) {
            if (caja) caja.appendChild(b);
            else ancla.parentNode.insertBefore(b, ancla);
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        var intentos = 0;
        crearBoton();
        var t = setInterval(function () {
            intentos++;
            crearBoton();
            if (document.getElementById('btn-alarmas') || intentos > 60) clearInterval(t);
        }, 700);
    });
})();
