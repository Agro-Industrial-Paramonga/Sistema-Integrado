/* ============================================================
   MOVIL.JS — Navegación de la vista de celular
   ------------------------------------------------------------
   Construye la barra inferior de secciones (Antes / Durante /
   Después / Flujo / Mapa), la sincroniza con la sección activa y
   ajusta el color de la barra del navegador según el semáforo.

   No toca nada del escritorio: la barra solo existe cuando el
   ancho es de celular (ver movil.css).
   ============================================================ */

(function () {
    'use strict';

    var SECCIONES = [
        { id: 'antes',    icono: 'fa-clipboard-check',      texto: 'Antes' },
        { id: 'durante',  icono: 'fa-triangle-exclamation', texto: 'Durante' },
        { id: 'despues',  icono: 'fa-arrow-rotate-left',    texto: 'Después' },
        { id: 'flujo',    icono: 'fa-diagram-project',      texto: 'Flujo' }
    ];

    var COLORES_SEM = {
        verde:    '#0B6B44',
        amarillo: '#B45309',
        naranja:  '#C2410C',
        rojo:     '#B91C1C'
    };

    var barra = null;

    function esCelular() {
        return window.matchMedia('(max-width: 768px)').matches;
    }

    function crearBarra() {
        if (document.getElementById('tabbar-plan')) {
            barra = document.getElementById('tabbar-plan');
            return;
        }

        barra = document.createElement('nav');
        barra.id = 'tabbar-plan';
        barra.className = 'tabbar-plan';
        barra.hidden = true;
        barra.setAttribute('aria-label', 'Secciones del plan');

        SECCIONES.forEach(function (s) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'tabbar-item';
            b.dataset.seccion = s.id;
            b.setAttribute('aria-controls', 'section-' + s.id);
            b.innerHTML = '<i class="fas ' + s.icono + '" aria-hidden="true"></i>' +
                          '<span>' + s.texto + '</span>';
            b.addEventListener('click', function () {
                if (typeof irASeccion === 'function') {
                    irASeccion(s.id);
                }
            });
            barra.appendChild(b);
        });

        /* El mapa es otro destino: guarda la sección y se va al mapa */
        var mapa = document.createElement('a');
        mapa.id = 'tab-mapa';
        mapa.className = 'tabbar-item tabbar-mapa';
        mapa.href = 'mapa.html';
        mapa.hidden = true;
        mapa.innerHTML = '<i class="fas fa-map-location-dot" aria-hidden="true"></i>' +
                         '<span>Mapa</span>';
        mapa.addEventListener('click', function (ev) {
            ev.preventDefault();
            if (typeof guardarEstadoYIrAlMapa === 'function') {
                try { guardarEstadoYIrAlMapa(ev); } catch (e) {}
            }
            window.location.href = 'mapa.html';
        });
        barra.appendChild(mapa);

        document.body.appendChild(barra);
    }

    /* Marca la pestaña activa. Se llama desde script.js cada vez que
       cambia la sección. */
    function movilSeccionActiva(nombre) {
        if (!barra) crearBarra();
        barra.querySelectorAll('.tabbar-item[data-seccion]').forEach(function (b) {
            var activo = b.dataset.seccion === nombre;
            b.classList.toggle('activo', activo);
            if (activo) b.setAttribute('aria-current', 'page');
            else b.removeAttribute('aria-current');
        });
    }

    /* Muestra u oculta la barra (solo se ve dentro del plan) */
    function movilMostrar(mostrar) {
        if (!barra) crearBarra();
        var si = !!mostrar && esCelular();
        barra.hidden = !si;
        document.body.classList.toggle('con-tabbar', si);
        if (si) movilActualizar();
    }

    /* Permisos: la pestaña Mapa aparece solo si el usuario puede verlo.
       Se apoya en el botón de escritorio (#btn-mapa-plan), que ya
       resuelve el permiso en un solo lugar. */
    function movilActualizar() {
        if (!barra) crearBarra();
        var boton = document.getElementById('btn-mapa-plan');
        var puede = !!(boton && boton.style.display !== 'none');
        var tab = document.getElementById('tab-mapa');
        if (tab) tab.hidden = !puede;
    }

    /* La barra del navegador toma el color del semáforo */
    function pintarTema(nivel) {
        var meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'theme-color';
            document.head.appendChild(meta);
        }
        meta.setAttribute('content', COLORES_SEM[nivel] || COLORES_SEM.verde);
    }

    function nivelGuardado() {
        try {
            var sem = JSON.parse(localStorage.getItem('sem_estado') || 'null');
            if (sem && sem.nivel) return sem.nivel;
        } catch (e) {}
        return 'verde';
    }

    function iniciar() {
        crearBarra();
        movilActualizar();
        pintarTema(nivelGuardado());

        window.addEventListener('sem:nivel', function (ev) {
            if (ev && ev.detail && ev.detail.nivel) pintarTema(ev.detail.nivel);
        });

        /* Si el usuario gira el celular o cambia el tamaño, se recalcula */
        window.addEventListener('resize', movilActualizar);

        /* Al volver del mapa con el botón "atrás", el navegador puede
           restaurar la página desde caché: se revisa el estado. */
        window.addEventListener('pageshow', function () {
            var activa = document.querySelector('.section-view.active');
            var plan = document.getElementById('screen-plan');
            if (activa && plan && plan.classList.contains('active')) {
                movilMostrar(true);
                movilSeccionActiva(activa.id.replace('section-', ''));
            }
        });

        // ============================================================
        // MANEJO DEL BOTÓN "ATRÁS" DEL CELULAR
        // ============================================================
        var panelesModal = ['turnos-panel', 'alarmas-panel', 'personas-panel', 'wh-panel'];

        // 1. Vigilar cuando se abre un panel para agregar un paso al historial
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(m) {
                if (m.attributeName === 'class') {
                    var el = m.target;
                    if (el.classList.contains('abierto') && !el.dataset.historialCreado) {
                        el.dataset.historialCreado = 'true';
                        history.pushState({ modal: el.id }, '');
                    } else if (!el.classList.contains('abierto')) {
                        delete el.dataset.historialCreado;
                    }
                }
            });
        });

        // Revisar periódicamente si los paneles ya existen en la pantalla
        setInterval(function() {
            panelesModal.forEach(function(id) {
                var p = document.getElementById(id);
                if (p && !p.dataset.observando) {
                    p.dataset.observando = 'true';
                    observer.observe(p, { attributes: true });
                }
            });
        }, 500);

        // 2. Escuchar cuando el usuario presiona "Atrás"
        window.addEventListener('popstate', function() {
            var seCerroAlguno = false;
            
            panelesModal.forEach(function(id) {
                var p = document.getElementById(id);
                if (p && p.classList.contains('abierto')) {
                    p.classList.remove('abierto');
                    delete p.dataset.historialCreado;
                    seCerroAlguno = true;
                }
            });

            // Si cerramos un panel, nos mantenemos en la misma página
            if (seCerroAlguno) {
                history.pushState({ app: 'main' }, '');
            }
        });
    }

    window.movilSeccionActiva = movilSeccionActiva;
    window.movilMostrar = movilMostrar;
    window.movilActualizar = movilActualizar;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();