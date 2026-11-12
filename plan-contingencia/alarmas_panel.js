/* ------------------------------------------------------------
   ALARMAS POR PERSONA — panel del portal
   ------------------------------------------------------------
   Solo Seguridad Industrial. Lista a todas las personas con tres
   casillas (semáforo / compuertas / medida) que encienden o apagan
   lo que les suena en el celular, sin tocar su rol.

   El rol sigue mandando en los permisos del portal; las casillas
   solo deciden qué alarmas llegan. La casilla manda sobre el rol.

   Datos:
     alarmas_personas_lista(clave)          -> lista con las casillas
     alternar_alarma_persona(clave, ...)    -> enciende / apaga una
     crear_usuario_panel(...)               -> alta de persona
     editar_usuario_panel(...)              -> edición de persona

   Reusa la `db` global de script.js y la clave de sesión del portal.
   ------------------------------------------------------------ */
(function () {
    'use strict';

    var PANEL = 'alarmas-panel';
    var ROLES = [
        ['jefe_area', 'Jefe de área'],
        ['sup_area', 'Supervisor de área'],
        ['area', 'Área (administrador de campo)'],
        ['gerente_general', 'Gerente general'],
        ['gerente_campo', 'Gerente de campo'],
        ['gerente_fabrica', 'Gerente de fábrica'],
        ['gerencial_legal', 'Gerencia legal'],
        ['gdo', 'Gerencia DSRR / GDO']
    ];
    var ALARMAS = [
        ['semaforo', 'Semáforo'],
        ['compuertas', 'Compuertas'],
        ['medida', 'Medida']
    ];

    var CACHE = [];
    var EDITANDO = null;

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

    /* Mismo criterio que alarmas_por_defecto() en la base */
    function porDefecto(rol, seccion) {
        var r = String(rol || '').toLowerCase();
        var s = normalizar(seccion);
        return {
            semaforo: r !== 'area',
            compuertas: (r === 'area' || r === 'sup_area') && s === 'administradores de campo',
            medida: r !== 'area'
        };
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
            '.al-caja{background:#fff;border-radius:16px;width:100%;max-width:760px;padding:18px;font-family:inherit}',
            '.al-cab{display:flex;align-items:center;justify-content:space-between;gap:10px}',
            '.al-cab h2{margin:0;font-size:1.02rem;color:#0f172a}',
            '.al-x{border:none;background:#f1f5f9;color:#475569;width:30px;height:30px;border-radius:8px;cursor:pointer}',
            '.al-sub{margin:4px 0 12px;font-size:.73rem;color:#64748b;line-height:1.4}',
            '.al-filtros{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}',
            '.al-filtros input[type=text]{flex:1 1 190px;min-width:150px;padding:9px 11px;border:1px solid #cbd5e1;',
            'border-radius:10px;font-size:.8rem;font-family:inherit}',
            '.al-filtros select{padding:9px 11px;border:1px solid #cbd5e1;border-radius:10px;font-size:.78rem;',
            'font-family:inherit;background:#fff;max-width:230px}',
            '.al-filtros label{font-size:.75rem;color:#475569;display:inline-flex;align-items:center;gap:6px}',
            '.al-cuenta{margin-left:auto;font-size:.72rem;color:#64748b;font-weight:700}',
            '.al-nuevo{border:1px solid #bbf7d0;background:#f0fdf4;color:#047857;border-radius:10px;padding:9px 13px;',
            'font-size:.76rem;font-weight:800;cursor:pointer}',
            '.al-tabla{border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}',
            '.al-fila{display:grid;grid-template-columns:1fr 82px 90px 74px;align-items:center;gap:6px;',
            'padding:8px 11px;border-bottom:1px solid #f1f5f9}',
            '.al-fila:last-child{border-bottom:none}',
            '.al-fila.cabecera{background:#f8fafc;font-size:.63rem;letter-spacing:.06em;color:#64748b;',
            'font-weight:800;text-transform:uppercase}',
            '.al-fila.cabecera span{text-align:center}',
            '.al-fila.cabecera span:first-child{text-align:left}',
            '.al-nombre{font-size:.79rem;font-weight:700;color:#0f172a;line-height:1.25}',
            '.al-meta{font-size:.66rem;color:#64748b;margin-top:2px}',
            '.al-casilla{display:flex;justify-content:center}',
            '.al-casilla input{width:19px;height:19px;accent-color:#10a35e;cursor:pointer}',
            '.al-casilla input:disabled{opacity:.5;cursor:wait}',
            '.al-acceso{border:none;background:#f8fafc;color:#475569;border-radius:8px;width:26px;height:26px;',
            'cursor:pointer;margin-left:6px;font-size:.72rem}',
            '.al-form{display:none;border:1px solid #e2e8f0;border-radius:12px;padding:13px;margin-bottom:12px;',
            'background:#f8fafc}',
            '.al-form.abierto{display:block}',
            '.al-form h3{margin:0 0 10px;font-size:.84rem;color:#0f172a}',
            '.al-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}',
            '.al-grid label{display:block;font-size:.68rem;color:#64748b;font-weight:700;margin-bottom:3px}',
            '.al-grid input,.al-grid select{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #cbd5e1;',
            'border-radius:9px;font-size:.78rem;font-family:inherit;background:#fff}',
            '.al-cheques{display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;font-size:.75rem;color:#334155}',
            '.al-cheques label{display:inline-flex;align-items:center;gap:6px}',
            '.al-botones{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}',
            '.al-botones button{flex:1 1 auto;border-radius:10px;padding:10px 12px;font-size:.78rem;font-weight:800;',
            'cursor:pointer;border:1px solid transparent}',
            '.al-guardar{background:#10a35e;color:#fff}',
            '.al-cancelar{background:#f1f5f9;color:#475569;border-color:#e2e8f0}',
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
                '<p class="al-sub">Marca o desmarca lo que le suena a cada persona. ' +
                    'El rol solo define sus permisos en el portal y los valores iniciales.</p>' +
                '<div class="al-filtros">' +
                    '<input type="text" id="al-buscar" placeholder="Buscar por nombre..." autocomplete="off">' +
                    '<select id="al-seccion"><option value="">Todas las secciones</option></select>' +
                    '<label><input type="checkbox" id="al-activos" checked> Solo activos</label>' +
                    '<button type="button" class="al-nuevo" id="al-nuevo">+ Agregar persona</button>' +
                    '<span class="al-cuenta" id="al-cuenta"></span>' +
                '</div>' +
                '<div class="al-form" id="al-form"></div>' +
                '<div class="al-tabla" id="al-tabla"></div>' +
                '<div class="al-aviso" id="al-aviso"></div>' +
            '</div>';
        document.body.appendChild(panel);

        document.getElementById('al-cerrar').addEventListener('click', cerrar);
        document.getElementById('al-buscar').addEventListener('input', pintarFilas);
        document.getElementById('al-seccion').addEventListener('change', pintarFilas);
        document.getElementById('al-activos').addEventListener('change', pintarFilas);
        document.getElementById('al-nuevo').addEventListener('click', function () { abrirForm(null); });
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

        var out = ['<div class="al-fila cabecera"><span>Persona</span><span>Semáforo</span><span>Compuertas</span><span>Medida</span></div>'];

        lista.forEach(function (f) {
            var id = esc(f.nombre);
            out.push('<div class="al-fila">' +
                '<div>' +
                    '<div class="al-nombre">' + id +
                        (f.activo ? '' : ' <span style="color:#b91c1c;font-weight:700">(inactivo)</span>') +
                        '<button type="button" class="al-acceso" data-editar="' + id + '" title="Editar">&#9998;</button>' +
                    '</div>' +
                    '<div class="al-meta">' + esc(f.seccion || 'sin sección') + ' · ' + esc(f.rol || 'sin rol') + '</div>' +
                '</div>' +
                ALARMAS.map(function (a) {
                    return '<div class="al-casilla"><input type="checkbox" data-user="' + id + '" data-alarma="' + a[0] + '"' +
                        (f[a[0]] ? ' checked' : '') + ' aria-label="' + esc(a[1]) + '"></div>';
                }).join('') +
            '</div>');
        });

        tabla.innerHTML = out.join('');

        tabla.querySelectorAll('input[type=checkbox]').forEach(function (c) {
            c.addEventListener('change', function () {
                alternar(c.dataset.user, c.dataset.alarma, c.checked, c);
            });
        });
        tabla.querySelectorAll('[data-editar]').forEach(function (b) {
            b.addEventListener('click', function () {
                var f = CACHE.find(function (x) { return x.nombre === b.dataset.editar; });
                if (f) abrirForm(f);
            });
        });
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

    /* ---------------- Alta / edición ---------------- */
    function abrirForm(fila) {
        EDITANDO = fila || null;
        var form = document.getElementById('al-form');
        var esNuevo = !fila;
        var roles = ROLES.map(function (r) {
            var sel = (fila && fila.rol === r[0]) ? ' selected' : '';
            return '<option value="' + r[0] + '"' + sel + '>' + esc(r[1]) + '</option>';
        }).join('');

        var gerencias = {};
        CACHE.forEach(function (f) { if (f.gerencia_key) gerencias[f.gerencia_key] = true; });
        var gers = Object.keys(gerencias).sort().map(function (g) {
            var sel = (fila && fila.gerencia_key === g) ? ' selected' : '';
            return '<option value="' + esc(g) + '"' + sel + '>' + esc(g) + '</option>';
        }).join('');

        var secciones = {};
        CACHE.forEach(function (f) { if (f.seccion) secciones[f.seccion] = true; });
        var datos = Object.keys(secciones).sort().map(function (s) { return '<option value="' + esc(s) + '">'; }).join('');

        form.innerHTML =
            '<h3>' + (esNuevo ? 'Agregar persona' : 'Editar: ' + esc(fila.nombre)) + '</h3>' +
            '<div class="al-grid">' +
                (esNuevo
                    ? '<div style="grid-column:1/-1"><label>Nombre completo (como figura en el sistema)</label>' +
                      '<input type="text" id="al-f-nombre" placeholder="APELLIDOS NOMBRES" autocomplete="off"></div>'
                    : '') +
                '<div><label>Sección / área</label>' +
                    '<input type="text" id="al-f-seccion" list="al-f-secciones" value="' + esc(fila ? (fila.seccion || '') : '') + '" autocomplete="off">' +
                    '<datalist id="al-f-secciones">' + datos + '</datalist></div>' +
                '<div><label>Rol</label><select id="al-f-rol">' + roles + '</select></div>' +
                '<div><label>Gerencia</label><select id="al-f-gerencia"><option value="">(sin gerencia)</option>' + gers + '</select></div>' +
                '<div><label>Contraseña ' + (esNuevo ? '(vacío = apellido + 2026)' : '(vacío = no cambiar)') + '</label>' +
                    '<input type="text" id="al-f-password" autocomplete="off"></div>' +
            '</div>' +
            (esNuevo ? '' : '<div class="al-cheques"><label><input type="checkbox" id="al-f-activo"' +
                (fila.activo ? ' checked' : '') + '> Activo (puede iniciar sesión)</label></div>') +
            (esNuevo
                ? '<div class="al-cheques" id="al-f-cheques">' +
                    ALARMAS.map(function (a) {
                        return '<label><input type="checkbox" data-alarma="' + a[0] + '"> ' + esc(a[1]) + '</label>';
                    }).join('') + '</div>'
                : '') +
            '<div class="al-botones">' +
                '<button type="button" class="al-guardar" id="al-f-guardar">' +
                    (esNuevo ? 'Crear persona' : 'Guardar cambios') + '</button>' +
                '<button type="button" class="al-cancelar" id="al-f-cancelar">Cancelar</button>' +
            '</div>' +
            '<div class="al-aviso" id="al-f-aviso"></div>';

        form.classList.add('abierto');

        if (esNuevo) {
            aplicarDefectos();
            document.getElementById('al-f-rol').addEventListener('change', aplicarDefectos);
            document.getElementById('al-f-seccion').addEventListener('input', aplicarDefectos);
        }

        document.getElementById('al-f-cancelar').addEventListener('click', function () {
            form.classList.remove('abierto');
            EDITANDO = null;
        });
        document.getElementById('al-f-guardar').addEventListener('click', esNuevo ? crear : guardar);
    }

    /* Marca las casillas según el rol y la sección (solo al crear) */
    function aplicarDefectos() {
        var rol = document.getElementById('al-f-rol').value;
        var sec = document.getElementById('al-f-seccion').value;
        var d = porDefecto(rol, sec);
        document.querySelectorAll('#al-f-cheques input').forEach(function (c) {
            c.checked = !!d[c.dataset.alarma];
        });
    }

    function avisoForm(texto, tipo) {
        var a = document.getElementById('al-f-aviso');
        if (!a) return;
        a.textContent = texto || '';
        a.className = 'al-aviso' + (tipo ? ' ' + tipo : '');
        if (tipo === 'ok') setTimeout(function () { a.textContent = ''; }, 6000);
    }

    async function crear() {
        var nombre = document.getElementById('al-f-nombre').value.trim();
        var seccion = document.getElementById('al-f-seccion').value.trim();
        var rol = document.getElementById('al-f-rol').value;
        var gerencia = document.getElementById('al-f-gerencia').value;
        var password = document.getElementById('al-f-password').value.trim();
        var alarmas = [];
        document.querySelectorAll('#al-f-cheques input').forEach(function (c) {
            if (c.checked) alarmas.push(c.dataset.alarma);
        });

        if (!nombre) { avisoForm('Escribe el nombre.', 'malo'); return; }
        if (!seccion) { avisoForm('Escribe la sección.', 'malo'); return; }

        var b = document.getElementById('al-f-guardar');
        b.disabled = true;
        b.textContent = 'Creando...';
        try {
            var r = await rpc('crear_usuario_panel', {
                p_clave_quien: clavePortal(),
                p_nombre: nombre,
                p_seccion: seccion,
                p_rol: rol,
                p_gerencia: gerencia,
                p_password: password || null,
                p_alarmas: alarmas
            });
            if (!r || r.ok !== true) {
                var motivos = {
                    ya_existe: 'Ya existe una persona con ese nombre.',
                    rol_invalido: 'Ese rol no es válido.',
                    sin_seccion: 'Falta la sección.',
                    gerencia_invalida: 'Esa gerencia no existe.',
                    sin_permiso: 'Tu sesión no tiene permiso (solo Seguridad Industrial).'
                };
                avisoForm(motivos[(r && r.motivo)] || ('No se pudo crear (' + ((r && r.motivo) || 'error') + ').'), 'malo');
                return;
            }
            avisoForm('Creado: ' + r.user_id + ' · contraseña: ' + r.password, 'ok');
            document.getElementById('al-form').classList.remove('abierto');
            await cargar();
        } catch (e) {
            avisoForm('No se pudo crear: ' + e.message, 'malo');
        } finally {
            b.disabled = false;
            b.textContent = 'Crear persona';
        }
    }

    async function guardar() {
        if (!EDITANDO) return;
        var b = document.getElementById('al-f-guardar');
        b.disabled = true;
        b.textContent = 'Guardando...';
        try {
            var r = await rpc('editar_usuario_panel', {
                p_clave_quien: clavePortal(),
                p_user_id: EDITANDO.nombre,
                p_seccion: document.getElementById('al-f-seccion').value.trim(),
                p_rol: document.getElementById('al-f-rol').value,
                p_gerencia: document.getElementById('al-f-gerencia').value,
                p_password: document.getElementById('al-f-password').value.trim() || null,
                p_activo: document.getElementById('al-f-activo').checked
            });
            if (!r || r.ok !== true) {
                avisoForm('No se pudo guardar (' + ((r && r.motivo) || 'error') + ').', 'malo');
                return;
            }
            document.getElementById('al-form').classList.remove('abierto');
            EDITANDO = null;
            await cargar();
            aviso('Cambios guardados.', 'ok');
        } catch (e) {
            avisoForm('No se pudo guardar: ' + e.message, 'malo');
        } finally {
            b.disabled = false;
            b.textContent = 'Guardar cambios';
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
