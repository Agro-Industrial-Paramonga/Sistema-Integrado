/* ------------------------------------------------------------
   PERSONAS — alta y edición de usuarios
   ------------------------------------------------------------ */
(function () {
    'use strict';

    var PANEL = 'personas-panel';
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

    async function rpc(nombre, args) {
        var resp = await db.rpc(nombre, args);
        if (resp.error) throw new Error(resp.error.message || 'Error de base');
        return resp.data;
    }

    /* ---------------- CSS ---------------- */
    function css() {
        if (document.getElementById('personas-css')) return;
        var s = document.createElement('style');
        s.id = 'personas-css';
        s.textContent = [
            '#personas-panel{position:fixed;inset:0;z-index:4400;display:none;align-items:flex-start;justify-content:center;',
            'padding:16px;background:rgba(15,23,42,.88);overflow:auto}',
            '#personas-panel.abierto{display:flex}',
            '.pe-caja{background:#fff;border-radius:16px;width:100%;max-width:780px;padding:18px;font-family:inherit}',
            '.pe-cab{display:flex;align-items:center;justify-content:space-between;gap:10px}',
            '.pe-cab h2{margin:0;font-size:1.02rem;color:#0f172a}',
            '.pe-x{border:none;background:#f1f5f9;color:#475569;width:30px;height:30px;border-radius:8px;cursor:pointer}',
            '.pe-sub{margin:4px 0 12px;font-size:.73rem;color:#64748b;line-height:1.45}',
            '.pe-filtros{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}',
            '.pe-filtros input[type=text]{flex:1 1 190px;min-width:150px;padding:9px 11px;border:1px solid #cbd5e1;',
            'border-radius:10px;font-size:.8rem;font-family:inherit}',
            '.pe-nuevo{border:1px solid #bbf7d0;background:#f0fdf4;color:#047857;border-radius:10px;padding:9px 13px;',
            'font-size:.76rem;font-weight:800;cursor:pointer}',
            '.pe-cuenta{margin-left:auto;font-size:.72rem;color:#64748b;font-weight:700}',
            '.pe-tabla{border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}',
            '.pe-fila{display:grid;grid-template-columns:1fr 78px 62px 78px;align-items:center;gap:6px;',
            'padding:10px 11px;border-bottom:1px solid #f1f5f9;position:relative}',
            '.pe-fila:last-child{border-bottom:none}',
            '.pe-fila.cabecera{background:#f8fafc;font-size:.6rem;letter-spacing:.05em;color:#64748b;',
            'font-weight:800;text-transform:uppercase}',
            '.pe-fila.cabecera span{text-align:center}',
            '.pe-fila.cabecera span:first-child{text-align:left}',
            
            /* Interacción del nombre */
            '.pe-nombre{font-size:.79rem;font-weight:700;color:#0f172a;line-height:1.25;display:inline-block;',
            'cursor:pointer;transition:color 0.15s ease}',
            '.pe-nombre:hover{color:#10a35e}',
            
            '.pe-meta{font-size:.66rem;color:#64748b;margin-top:2px}',
            '.pe-marca{text-align:center;font-size:.72rem;font-weight:800;color:#cbd5e1}',
            '.pe-marca.si{color:#10a35e}',
            
            /* Menú flotante (Opciones) */
            '.pe-menu{position:fixed;z-index:5000;background:#fff;border:1px solid #e2e8f0;border-radius:8px;',
            'box-shadow:0 4px 12px rgba(0,0,0,0.15);display:none;flex-direction:column;min-width:120px;overflow:hidden}',
            '.pe-menu.abierto{display:flex}',
            '.pe-menu button{border:none;background:transparent;padding:9px 12px;text-align:left;font-size:.76rem;',
            'cursor:pointer;font-weight:600;color:#334155;font-family:inherit;transition:background 0.15s}',
            '.pe-menu button:hover{background:#f8fafc}',
            '.pe-menu button.pe-eliminar{color:#b91c1c}',
            '.pe-menu button.pe-eliminar:hover{background:#fef2f2}',
            
            /* FORMULARIO COMO VENTANA EMERGENTE (MODAL) */
            '.pe-form{position:fixed;inset:0;z-index:4500;display:none;align-items:center;justify-content:center;',
            'padding:16px;background:rgba(15,23,42,.6)}',
            '.pe-form.abierto{display:flex}',
            '.pe-form-caja{background:#fff;border-radius:16px;width:100%;max-width:680px;padding:18px;',
            'max-height:90vh;overflow-y:auto;box-shadow:0 10px 25px rgba(0,0,0,0.25);font-family:inherit}',
            
            '.pe-form h3{margin:0 0 10px;font-size:.84rem;color:#0f172a}',
            '.pe-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}',
            '.pe-grid label{display:block;font-size:.68rem;color:#64748b;font-weight:700;margin-bottom:3px}',
            '.pe-grid input,.pe-grid select{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #cbd5e1;',
            'border-radius:9px;font-size:.78rem;font-family:inherit;background:#fff}',
            '.pe-campo-ancho{grid-column:1/-1}',
            '.pe-permisos{border:1px solid #e2e8f0;border-radius:10px;padding:10px;margin-top:11px;background:#f8fafc}',
            '.pe-permisos h4{margin:0 0 7px;font-size:.7rem;letter-spacing:.04em;text-transform:uppercase;color:#64748b}',
            '.pe-permisos label{display:flex;align-items:flex-start;gap:8px;font-size:.76rem;color:#334155;',
            'margin-bottom:7px;line-height:1.3}',
            '.pe-permisos input{margin-top:2px;width:17px;height:17px;accent-color:#10a35e;cursor:pointer}',
            '.pe-permisos small{display:block;color:#94a3b8;font-size:.66rem}',
            '.pe-cheques{display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;font-size:.75rem;color:#334155}',
            '.pe-cheques label{display:inline-flex;align-items:center;gap:6px}',
            '.pe-botones{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}',
            '.pe-botones button{flex:1 1 auto;border-radius:10px;padding:10px 12px;font-size:.78rem;font-weight:800;',
            'cursor:pointer;border:1px solid transparent}',
            '.pe-guardar{background:#10a35e;color:#fff}',
            '.pe-cancelar{background:#f1f5f9;color:#475569;border-color:#e2e8f0}',
            '.pe-aviso{margin-top:9px;font-size:.73rem;font-weight:700;min-height:15px}',
            '.pe-aviso.ok{color:#047857}',
            '.pe-aviso.malo{color:#b91c1c}',
            '.pe-vacio{padding:18px;text-align:center;font-size:.78rem;color:#64748b}'
        ].join('');
        document.head.appendChild(s);
    }

    function html() {
        var panel = document.createElement('div');
        panel.id = PANEL;
        panel.innerHTML =
            '<div class="pe-caja">' +
                '<div class="pe-cab"><h2>Personas</h2>' +
                    '<button type="button" class="pe-x" id="pe-cerrar" title="Cerrar">&#10005;</button></div>' +
                '<p class="pe-sub">Crea la persona y elige qué puede ver. El rol y la gerencia quedan registrados, ' +
                    'pero no le dan acceso a nada: eso lo deciden estas casillas. Las alarmas se activan aparte, ' +
                    'en «Usuarios y alarmas».</p>' +
                '<div class="pe-filtros">' +
                    '<input type="text" id="pe-buscar" placeholder="Buscar por nombre..." autocomplete="off">' +
                    '<button type="button" class="pe-nuevo" id="pe-nuevo"><i class="fas fa-plus"></i> Nueva persona</button>' +
                    '<span class="pe-cuenta" id="pe-cuenta"></span>' +
                '</div>' +
                '<div class="pe-tabla" id="pe-tabla"></div>' +
                '<div class="pe-aviso" id="pe-aviso"></div>' +
                '<div class="pe-form" id="pe-form"></div>' +
            '</div>';
        document.body.appendChild(panel);

        // Menú flotante independiente (fuera del contenedor con scroll)
        var menu = document.createElement('div');
        menu.id = 'pe-menu-opciones';
        menu.className = 'pe-menu';
        menu.innerHTML =
            '<button type="button" id="pe-btn-editar">✏️ Editar</button>' +
            '<button type="button" class="pe-eliminar" id="pe-btn-eliminar">🗑️ Eliminar</button>';
        document.body.appendChild(menu);

        document.getElementById('pe-cerrar').addEventListener('click', cerrar);
        document.getElementById('pe-buscar').addEventListener('input', pintarFilas);
        document.getElementById('pe-nuevo').addEventListener('click', function () { abrirForm(null); });
        
        // Ocultar menú si se hace clic fuera de él
        document.addEventListener('click', function(e) {
            var m = document.getElementById('pe-menu-opciones');
            if (m && m.classList.contains('abierto')) {
                if (!m.contains(e.target) && !e.target.classList.contains('pe-nombre')) {
                    m.classList.remove('abierto');
                }
            }
        });

        // Ocultar menú si se hace scroll en el panel
        panel.addEventListener('scroll', function() {
            var m = document.getElementById('pe-menu-opciones');
            if (m && m.classList.contains('abierto')) {
                m.classList.remove('abierto');
            }
        });
    }

    function abrir() {
        if (!puedeVer()) return;
        css();
        if (!document.getElementById(PANEL)) html();
        document.getElementById(PANEL).classList.add('abierto');
        cargar();
    }

    function abrirPersona(nombre) {
        if (!puedeVer()) return;
        css();
        if (!document.getElementById(PANEL)) html();
        document.getElementById(PANEL).classList.add('abierto');
        cargar().then(function () {
            var f = CACHE.find(function (x) { return x.nombre === nombre; });
            if (f) abrirForm(f);
        });
    }

    function cerrar() {
        var p = document.getElementById(PANEL);
        if (p) p.classList.remove('abierto');
        EDITANDO = null;
        document.getElementById('pe-menu-opciones').classList.remove('abierto');
    }

    function aviso(texto, tipo) {
        var a = document.getElementById('pe-aviso');
        if (!a) return;
        a.textContent = texto || '';
        a.className = 'pe-aviso' + (tipo ? ' ' + tipo : '');
    }

    async function cargar() {
        var tabla = document.getElementById('pe-tabla');
        tabla.innerHTML = '<div class="pe-vacio">Cargando...</div>';
        aviso('');
        try {
            var filas = await rpc('alarmas_personas_lista', { p_clave_quien: clavePortal() });
            CACHE = filas || [];
            pintarFilas();
        } catch (e) {
            tabla.innerHTML = '<div class="pe-vacio">No se pudo cargar la lista.</div>';
            aviso('No se pudo cargar: ' + e.message, 'malo');
        }
    }

    function pintarFilas() {
        var tabla = document.getElementById('pe-tabla');
        if (!tabla) return;
        var q = normalizar(document.getElementById('pe-buscar').value);

        var lista = CACHE.filter(function (f) {
            if (q && normalizar(f.nombre).indexOf(q) === -1) return false;
            return true;
        });

        document.getElementById('pe-cuenta').textContent = lista.length + ' de ' + CACHE.length;

        if (!lista.length) {
            tabla.innerHTML = '<div class="pe-vacio">Sin coincidencias.</div>';
            return;
        }

        function marca(v) {
            return '<span class="pe-marca' + (v ? ' si' : '') + '">' + (v ? '&#10003;' : '—') + '</span>';
        }

        var out = ['<div class="pe-fila cabecera"><span>Persona</span><span>Medidas</span>' +
                   '<span>Mapa</span><span>Compuertas</span></div>'];

        lista.forEach(function (f) {
            var id = esc(f.nombre);
            out.push('<div class="pe-fila">' +
                '<div>' +
                    '<div class="pe-nombre" data-nombre="' + id + '">' + id +
                        (f.activo ? '' : ' <span style="color:#b91c1c;font-weight:700">(inactivo)</span>') +
                    '</div>' +
                    '<div class="pe-meta">' + esc(f.seccion || 'sin sección') + ' · ' + esc(f.rol || 'sin rol') + '</div>' +
                '</div>' +
                marca(f.puede_medidas) +
                marca(f.puede_mapa) +
                marca(f.puede_compuertas) +
            '</div>');
        });

        tabla.innerHTML = out.join('');

        tabla.querySelectorAll('.pe-nombre').forEach(function (el) {
            el.addEventListener('click', function (e) {
                e.stopPropagation();
                var nombre = el.dataset.nombre;
                var f = CACHE.find(function (x) { return x.nombre === nombre; });
                if (f) abrirMenuOpciones(e, f, el);
            });
        });
    }

    /* ---------------- Menú de opciones (Editar / Eliminar) ---------------- */
    function abrirMenuOpciones(event, fila, elementoNombre) {
        var menu = document.getElementById('pe-menu-opciones');
        var btnEditar = document.getElementById('pe-btn-editar');
        var btnEliminar = document.getElementById('pe-btn-eliminar');

        // Posicionar el menú justo debajo del nombre clickeado
        var rect = elementoNombre.getBoundingClientRect();
        menu.style.top = (rect.bottom + 4) + 'px';
        menu.style.left = rect.left + 'px';
        menu.classList.add('abierto');

        // Remover listeners anteriores para no duplicar
        var nuevoEditar = btnEditar.cloneNode(true);
        var nuevoEliminar = btnEliminar.cloneNode(true);
        btnEditar.parentNode.replaceChild(nuevoEditar, btnEditar);
        btnEliminar.parentNode.replaceChild(nuevoEliminar, btnEliminar);

        nuevoEditar.addEventListener('click', function (e) {
            e.stopPropagation();
            menu.classList.remove('abierto');
            abrirForm(fila);
        });

        nuevoEliminar.addEventListener('click', function (e) {
            e.stopPropagation();
            menu.classList.remove('abierto');
            confirmarEliminar(fila);
        });
    }

       /* ---------------- Eliminar ---------------- */
    async function confirmarEliminar(fila) {
        if (!confirm('¿Estás seguro de que deseas eliminar a ' + fila.nombre + '?\n\nEsta acción no se puede deshacer.')) {
            return;
        }
        
        aviso('Eliminando a ' + fila.nombre + '...', '');
        try {
            var r = await rpc('eliminar_usuario_panel', {
                p_clave_quien: clavePortal(),
                p_user_id: fila.nombre
            });
            
            if (!r || r.ok !== true) {
                var errorMsg = 'No se pudo eliminar: ' + ((r && r.motivo) || 'error desconocido');
                aviso(errorMsg, 'malo');
                alert(errorMsg); // <-- Esto te mostrará una ventana con el error exacto
                return;
            }
            aviso('Persona eliminada correctamente.', 'ok');
            await cargar();
        } catch (e) {
            aviso('No se pudo eliminar: ' + e.message, 'malo');
            alert('Error del sistema: ' + e.message); // <-- Alerta si falla la conexión
        }
    }

    /* ---------------- Alta / edición ---------------- */
    function abrirForm(fila) {
        EDITANDO = fila || null;
        var form = document.getElementById('pe-form');
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
        var datos = Object.keys(secciones).sort().map(function (s) {
            return '<option value="' + esc(s) + '">';
        }).join('');

        var p = {
            medidas: !!(fila && fila.puede_medidas),
            mapa: !!(fila && fila.puede_mapa),
            compuertas: !!(fila && fila.puede_compuertas)
        };

        form.innerHTML =
            '<div class="pe-form-caja">' +
                '<h3>' + (esNuevo ? 'Nueva persona' : 'Editar: ' + esc(fila.nombre)) + '</h3>' +
                '<div class="pe-grid">' +
                    (esNuevo
                        ? '<div class="pe-campo-ancho"><label>Nombre completo (como figura en el sistema)</label>' +
                          '<input type="text" id="pe-f-nombre" placeholder="APELLIDOS NOMBRES" autocomplete="off"></div>'
                        : '') +
                    '<div><label>Sección / área</label>' +
                        '<input type="text" id="pe-f-seccion" list="pe-f-secciones" value="' + esc(fila ? (fila.seccion || '') : '') + '" autocomplete="off">' +
                        '<datalist id="pe-f-secciones">' + datos + '</datalist></div>' +
                    '<div><label>Rol <small style="font-weight:400">(solo registro)</small></label>' +
                        '<select id="pe-f-rol">' + roles + '</select></div>' +
                    '<div><label>Gerencia <small style="font-weight:400">(solo registro)</small></label>' +
                        '<select id="pe-f-gerencia"><option value="">(sin gerencia)</option>' + gers + '</select></div>' +
                    '<div><label>Contraseña ' + (esNuevo ? '(vacío = apellido + 2026)' : '(vacío = no cambiar)') + '</label>' +
                        '<input type="text" id="pe-f-password" autocomplete="off"></div>' +
                '</div>' +
                '<div class="pe-permisos">' +
                    '<h4>Qué puede ver</h4>' +
                    '<label><input type="checkbox" id="pe-p-medidas"' + (p.medidas ? ' checked' : '') + '>' +
                        '<span>Medidas <small>Antes / durante / después y el flujo de respuesta de emergencia</small></span></label>' +
                    '<label><input type="checkbox" id="pe-p-mapa"' + (p.mapa ? ' checked' : '') + '>' +
                        '<span>Mapa <small>Mapa completo; incluye las compuertas y el semáforo</small></span></label>' +
                    '<label><input type="checkbox" id="pe-p-compuertas"' + (p.compuertas ? ' checked' : '') + '>' +
                        '<span>Compuertas <small>Solo el panel de compuertas, sin mapa ni semáforo</small></span></label>' +
                '</div>' +
                (esNuevo ? '' : '<div class="pe-cheques"><label><input type="checkbox" id="pe-f-activo"' +
                    (fila.activo ? ' checked' : '') + '> Activo (puede iniciar sesión)</label></div>') +
                '<div class="pe-botones">' +
                    '<button type="button" class="pe-guardar" id="pe-f-guardar">' +
                        (esNuevo ? 'Crear persona' : 'Guardar cambios') + '</button>' +
                    '<button type="button" class="pe-cancelar" id="pe-f-cancelar">Cancelar</button>' +
                '</div>' +
                '<div class="pe-aviso" id="pe-f-aviso"></div>' +
            '</div>';

        form.classList.add('abierto');

        form.onclick = function(e) {
            if (e.target === form) {
                form.classList.remove('abierto');
                EDITANDO = null;
            }
        };

        var cMapa = document.getElementById('pe-p-mapa');
        var cComp = document.getElementById('pe-p-compuertas');
        function sincronizarCompuertas() {
            if (cMapa.checked) {
                cComp.checked = true;
                cComp.disabled = true;
            } else {
                cComp.disabled = false;
            }
        }
        cMapa.addEventListener('change', sincronizarCompuertas);
        sincronizarCompuertas();

        document.getElementById('pe-f-cancelar').addEventListener('click', function () {
            form.classList.remove('abierto');
            EDITANDO = null;
        });
        document.getElementById('pe-f-guardar').addEventListener('click', esNuevo ? crear : guardar);
    }

    function avisoForm(texto, tipo) {
        var a = document.getElementById('pe-f-aviso');
        if (!a) return;
        a.textContent = texto || '';
        a.className = 'pe-aviso' + (tipo ? ' ' + tipo : '');
        if (tipo === 'ok') setTimeout(function () { if (a) a.textContent = ''; }, 8000);
    }

    function permisosElegidos() {
        var lista = [];
        if (document.getElementById('pe-p-medidas').checked) lista.push('medidas');
        if (document.getElementById('pe-p-mapa').checked) lista.push('mapa');
        if (document.getElementById('pe-p-compuertas').checked) lista.push('compuertas');
        return lista;
    }

    async function crear() {
        var nombre = document.getElementById('pe-f-nombre').value.trim();
        var seccion = document.getElementById('pe-f-seccion').value.trim();
        var rol = document.getElementById('pe-f-rol').value;
        var gerencia = document.getElementById('pe-f-gerencia').value;
        var password = document.getElementById('pe-f-password').value.trim();
        var permisos = permisosElegidos();

        if (!nombre) { avisoForm('Escribe el nombre.', 'malo'); return; }
        if (!seccion) { avisoForm('Escribe la sección.', 'malo'); return; }
        if (!permisos.length) { avisoForm('Marca al menos qué puede ver.', 'malo'); return; }

        var b = document.getElementById('pe-f-guardar');
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
                p_alarmas: [],
                p_permisos: permisos
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
            avisoForm('Creado: ' + r.user_id + ' · contraseña: ' + r.password +
                      ' · alarmas apagadas (actívalas en «Usuarios y alarmas»)', 'ok');
            document.getElementById('pe-form').classList.remove('abierto');
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
        var b = document.getElementById('pe-f-guardar');
        b.disabled = true;
        b.textContent = 'Guardando...';
        try {
            var r = await rpc('editar_usuario_panel', {
                p_clave_quien: clavePortal(),
                p_user_id: EDITANDO.nombre,
                p_seccion: document.getElementById('pe-f-seccion').value.trim(),
                p_rol: document.getElementById('pe-f-rol').value,
                p_gerencia: document.getElementById('pe-f-gerencia').value,
                p_password: document.getElementById('pe-f-password').value.trim() || null,
                p_activo: document.getElementById('pe-f-activo').checked,
                p_permisos: permisosElegidos()
            });
            if (!r || r.ok !== true) {
                avisoForm('No se pudo guardar (' + ((r && r.motivo) || 'error') + ').', 'malo');
                return;
            }
            document.getElementById('pe-form').classList.remove('abierto');
            EDITANDO = null;
            await cargar();
            aviso('Cambios guardados. Se aplican la próxima vez que la persona inicie sesión.', 'ok');
        } catch (e) {
            avisoForm('No se pudo guardar: ' + e.message, 'malo');
        } finally {
            b.disabled = false;
            b.textContent = 'Guardar cambios';
        }
    }

    /* ---------------- Tecla ESC ---------------- */
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' || e.key === 'Esc') {
            var menu = document.getElementById('pe-menu-opciones');
            var form = document.getElementById('pe-form');
            var panel = document.getElementById(PANEL);

            if (menu && menu.classList.contains('abierto')) {
                e.preventDefault();
                e.stopPropagation();
                menu.classList.remove('abierto');
            } else if (form && form.classList.contains('abierto')) {
                e.preventDefault();
                e.stopPropagation();
                form.classList.remove('abierto');
                EDITANDO = null;
            } else if (panel && panel.classList.contains('abierto')) {
                e.preventDefault();
                e.stopPropagation();
                cerrar();
            }
        }
    });

    /* ---------------- Botón ＋ en la cabecera ---------------- */
    function crearBoton() {
        if (!puedeVer()) return;

        var caja = document.getElementById('acciones-cabecera');
        var ancla = caja || document.getElementById('btn-mapa-plan');
        if (!ancla || !ancla.parentNode) return;

        var b = document.getElementById('btn-personas');
        if (!b) {
            b = document.createElement('button');
            b.type = 'button';
            b.id = 'btn-personas';
            b.className = 'btn-cabecera-accion';
            b.title = 'Agregar persona';
            b.setAttribute('aria-label', 'Agregar persona');
            b.innerHTML = '<i class="fas fa-plus"></i>';
            b.addEventListener('click', abrir);
        }

               if (b.parentNode !== ancla) {
            if (caja) caja.prepend(b); // <--- Cambiamos appendChild por prepend
            else ancla.parentNode.insertBefore(b, ancla);
        }
    }

    window.abrirPersona = abrirPersona;

    document.addEventListener('DOMContentLoaded', function () {
        var intentos = 0;
        crearBoton();
        var t = setInterval(function () {
            intentos++;
            crearBoton();
            if (document.getElementById('btn-personas') || intentos > 60) clearInterval(t);
        }, 700);
    });
})();