/* ============================================================
   CARTAS DISCIPLINARIAS (Relaciones Laborales)
   ------------------------------------------------------------
   Editor tipo Word: una sola hoja editable donde se escribe en
   cualquier parte, con negrita, cursiva, tamano de letra e
   imagenes que se arrastran con el mouse.
   El PDF se genera desde la propia hoja (fiel a lo que se ve).
   ============================================================ */
(function () {
    'use strict';

    var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

    var numeroCarta = 1;
    var tipoCartaActual = 'trabajador';
    var modoCarta = 'normal';
    var destinatarioActual = '';
    var ultimoRango = null;
    var imagenActiva = null;

    /* ---------------- utilidades de fecha ---------------- */
    function capitalizar(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

    function parsearFecha(v) {
        if (!v) return null;
        var m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (!m) return null;
        return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    }

    function fechaHechoLarga(f) {
        if (!f) return '____';
        var d = f.getDate();
        return DIAS[f.getDay()] + ' ' + (d < 10 ? '0' + d : d) + ' de ' + MESES[f.getMonth()];
    }

    function fechaCartaLarga(f) {
        return f.getDate() + ' de ' + capitalizar(MESES[f.getMonth()]) + ' del ' + f.getFullYear();
    }

    function minusculaInicial(t) { return t ? t.charAt(0).toLowerCase() + t.slice(1) : ''; }

    function enLetras(n) {
        var u = ['cero','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez',
                 'once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve','veinte',
                 'veintiuno','veintidós','veintitrés','veinticuatro','veinticinco','veintiséis','veintisiete','veintiocho','veintinueve','treinta'];
        return (n >= 0 && n <= 30) ? u[n] : String(n);
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /* ---------------- contenido de la hoja ---------------- */
    function construirHTML(h, numero, destinatario) {
        var hoy = new Date();
        var quien = (destinatario || h.TRABAJADOR || '').trim();
        var partes = [];

        partes.push('<p>' + esc('Paramonga, ' + fechaCartaLarga(hoy)) + '</p>');
        partes.push('<p>Señor<br>' + esc(quien) + '<br>Paramonga.-</p>');
        partes.push('<p>Estimado señor:</p>');

        const esPlantillaPrimera = (numero === 1) && (modoCarta !== 'medida');

        if (esPlantillaPrimera) {
            var fechaHecho = parsearFecha(h.FECHA_ACONTECIMIENTO);
            var hecho = minusculaInicial((h.ACONTECIMIENTO || '').trim().replace(/\.$/, ''));
            var anioHecho = fechaHecho ? fechaHecho.getFullYear() : null;
            var sufijo = (anioHecho && anioHecho !== hoy.getFullYear()) ? (' de ' + anioHecho) : ' del presente';

            var cuerpo = 'Hemos tomado conocimiento sobre el hecho ocurrido el día ' +
                fechaHechoLarga(fechaHecho) + sufijo +
                ', donde según correo enviado por el Ing. Cesa Chunga, Jefe de Seguridad Industrial, ' +
                'nos informa que ' + hecho +
                ', incumpliendo el <artículo/falta>, del RISST.';
            var plazo = 'Por lo que solicitamos que en el plazo de ' + RRLL_DIAS_DESCARGO +
                ' días hábiles después de recibida la presente, usted realice su descargo correspondiente.';

            partes.push('<p>' + esc(cuerpo) + '</p>');
            partes.push('<p>' + esc(plazo) + '</p>');
        } else if (modoCarta === 'medida') {
            var cm = (rrllCasoActual && rrllCasoActual.meta && rrllCasoActual.meta.carta_medida) || {};
            var detalle = '';

            if (cm.medida === 'Suspensión') {
                var dias = parseInt(cm.dias_suspension) || 1;
                detalle = 'Se le comunica que se ha resuelto imponerle la medida disciplinaria de SUSPENSIÓN de ' +
                    dias + ' (' + enLetras(dias) + ') día' + (dias === 1 ? '' : 's') + ' hábil' + (dias === 1 ? '' : 'es') +
                    ', por los hechos que se le imputaron.';
            } else if (cm.medida === 'Amonestación') {
                detalle = 'Se le comunica que se ha resuelto imponerle la medida disciplinaria de AMONESTACIÓN ESCRITA, ' +
                    (cm.afecta_incentivos ? 'la cual SÍ afecta los incentivos' : 'la cual NO afecta los incentivos') +
                    ', por los hechos que se le imputaron.';
            }

            partes.push('<p>' + esc(detalle) + '</p>');
            partes.push('<p><br></p>');
        } else {
            partes.push('<p><br></p>');
        }

        partes.push('<p>Atentamente,</p>');
        partes.push('<p><br><br><br>_______________________________________<br>Nombre y firma</p>');

        return partes.join('');
    }

    /* ---------------- modal ---------------- */
    function doc() { return document.getElementById('carta-doc'); }

    function urlTexto(num) {
        var archivo;
        if (modoCarta === 'medida') {
            archivo = 'carta_medida_' + num + '_texto.json';
        } else if (num === 1) {
            archivo = '1era_carta_texto.json';
        } else {
            archivo = 'carta_' + num + '_texto.json';
        }
        return supabaseClient.storage
            .from('relaciones-cargos')
            .getPublicUrl(rrllHallazgoActual.COD_HALLAZGO + '/' + archivo).data.publicUrl;
    }

    async function cargarHTMLGuardado(num) {
        try {
            var resp = await fetch(urlTexto(num) + '?v=' + Date.now());
            if (!resp.ok) return null;
            var guardado = await resp.json();
            if (!guardado || typeof guardado.html !== 'string' || !guardado.html.trim()) return null;
            var modoGuardado = guardado.modo || 'normal';
            if (modoGuardado !== modoCarta) return null;
            return guardado.html;
        } catch (e) { return null; }
    }

    function prepararImagenes() {
        doc().querySelectorAll('img').forEach(function (img) { hacerArrastrable(img); });
    }

    async function abrirModal(numero, destinatario, tipo, modo) {
        var h = rrllHallazgoActual;
        if (!h) { alert('Abre primero un caso de la lista.'); return; }

        numeroCarta = numero || 1;
        tipoCartaActual = tipo || 'trabajador';
        modoCarta = modo || 'normal';
        destinatarioActual = (destinatario || h.TRABAJADOR || '').trim();
        if (!destinatarioActual) { alert('⚠️ El hallazgo no tiene trabajador asignado.'); return; }

        var titulo = document.querySelector('#modal-carta h3');
        if (titulo) titulo.textContent = (modoCarta === 'medida')
            ? 'Carta de medida disciplinaria'
            : ((numeroCarta === 1) ? 'Primera carta' : ('Carta ' + numeroCarta));

        var html = await cargarHTMLGuardado(numeroCarta);
        doc().innerHTML = html || construirHTML(h, numeroCarta, destinatarioActual);
        prepararImagenes();

        var m = document.getElementById('modal-carta');
        m.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        m.scrollTop = 0;
    }

    function cerrarModal() {
        deseleccionarImagen();
        var m = document.getElementById('modal-carta');
        if (m) m.classList.add('hidden');
        document.body.style.overflow = '';
    }

    /* ---------------- seleccion ---------------- */
    function guardarSeleccion() {
        var sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        var d = doc();
        if (d && d.contains(sel.anchorNode)) ultimoRango = sel.getRangeAt(0).cloneRange();
    }

    function restaurarSeleccion() {
        if (!ultimoRango) return false;
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(ultimoRango);
        return true;
    }

    function tamanoEnPt(nodo) {
        var el = (nodo && nodo.nodeType === 1) ? nodo : (nodo ? nodo.parentElement : null);
        if (!el) return 11;
        var px = parseFloat(getComputedStyle(el).fontSize) || 14.67;
        return Math.max(6, Math.round(px * 0.75));
    }

    function aplicarComando(cmd) {
        restaurarSeleccion();
        try { document.execCommand(cmd, false, null); } catch (e) {}
        guardarSeleccion();
    }

    function cambiarTamano(delta) {
        if (!restaurarSeleccion()) return;
        var sel = window.getSelection();
        if (!sel.rangeCount || sel.isCollapsed) return;

        var rango = sel.getRangeAt(0);
        var nuevo = Math.min(26, Math.max(8, tamanoEnPt(rango.startContainer) + delta));
        var frag = rango.extractContents();
        var span = document.createElement('span');
        span.style.fontSize = nuevo + 'pt';
        span.appendChild(frag);
        rango.insertNode(span);

        var r2 = document.createRange();
        r2.selectNodeContents(span);
        sel.removeAllRanges();
        sel.addRange(r2);
        guardarSeleccion();
    }

    /* ---------------- imagenes: mover y redimensionar ---------------- */
    function hacerArrastrable(img) {
        img.style.position = 'absolute';
        img.style.cursor = 'move';
        img.draggable = false;

        img.addEventListener('mousedown', function (e) {
            e.preventDefault();
            seleccionarImagen(img);

            var r = img.getBoundingClientRect();
            var offX = e.clientX - r.left;
            var offY = e.clientY - r.top;

            function mover(ev) {
                var d = doc();
                var dr = d.getBoundingClientRect();
                img.style.left = Math.max(0, ev.clientX - dr.left - offX) + 'px';
                img.style.top = Math.max(0, ev.clientY - dr.top - offY) + 'px';
            }
            function soltar() {
                document.removeEventListener('mousemove', mover);
                document.removeEventListener('mouseup', soltar);
            }
            document.addEventListener('mousemove', mover);
            document.addEventListener('mouseup', soltar);
        });
    }

    function seleccionarImagen(img) {
        deseleccionarImagen();
        imagenActiva = img;
        img.style.outline = '2px solid #2563eb';

        var barra = document.getElementById('carta-img-toolbar');
        if (!barra) return;
        barra.classList.remove('hidden');
        var r = img.getBoundingClientRect();
        barra.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 220)) + 'px';
        barra.style.top = Math.max(8, r.top - 46) + 'px';
    }

    function deseleccionarImagen() {
        if (imagenActiva) imagenActiva.style.outline = '';
        imagenActiva = null;
        var barra = document.getElementById('carta-img-toolbar');
        if (barra) barra.classList.add('hidden');
    }

    function accionImagen(accion) {
        var img = imagenActiva;
        if (!img) return;

        if (accion === 'borrar') { img.remove(); deseleccionarImagen(); return; }

        var ancho = img.getBoundingClientRect().width;
        if (accion === 'menos') ancho = Math.max(60, ancho - 40);
        if (accion === 'mas') ancho = Math.min(doc().clientWidth, ancho + 40);

        img.style.width = ancho + 'px';
        img.style.height = 'auto';
        seleccionarImagen(img);
    }

    function insertarImagen(archivo) {
        var lector = new FileReader();
        lector.onload = function () {
            var img = document.createElement('img');
            img.src = lector.result;
            img.style.width = '180px';
            img.style.left = '40px';
            img.style.top = '120px';

            doc().appendChild(img);
            hacerArrastrable(img);
            seleccionarImagen(img);
        };
        lector.readAsDataURL(archivo);
    }

    /* ---------------- PDF desde la hoja ---------------- */
    async function generarPDF() {
        if (!window.html2canvas) throw new Error('No se cargó html2canvas.');
        if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('No se cargó jsPDF.');

        var pagina = document.getElementById('carta-pagina');
        var canvas = await window.html2canvas(pagina, {
            scale: 3,
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false
        });

        var anchoMM = 210;
        var altoMM = canvas.height * anchoMM / canvas.width;
        var altoPagina = Math.max(297, altoMM);
        var img = canvas.toDataURL('image/jpeg', 0.92);

        var pdf = new window.jspdf.jsPDF({ unit: 'mm', format: [anchoMM, altoPagina] });
        pdf.addImage(img, 'JPEG', 0, 0, anchoMM, altoMM);

        return pdf.output('blob');
    }

    /* ---------------- guardar ---------------- */
    async function guardarYemitir() {
        var h = rrllHallazgoActual;
        var caso = rrllCasoActual;
        if (!h || !caso) { alert('No se encontró el caso. Vuelve a abrir el expediente.'); return; }

        var boton = document.getElementById('carta-guardar');
        var original = boton.innerHTML;
        boton.disabled = true;
        boton.textContent = 'Generando PDF...';

        var ventana = null;
        try { ventana = window.open('', '_blank'); } catch (e) { ventana = null; }

        try {
            deseleccionarImagen();
            var blob = await generarPDF();
            boton.textContent = 'Guardando...';

            var num = numeroCarta;
            var nombrePdf = (modoCarta === 'medida')
                ? ('carta_medida_' + num + '_' + Date.now() + '.pdf')
                : ((num === 1) ? ('1era_carta_' + Date.now() + '.pdf') : ('carta_' + num + '_' + Date.now() + '.pdf'));
            var path = h.COD_HALLAZGO + '/' + nombrePdf;

            var subida = await supabaseClient.storage
                .from('relaciones-cargos')
                .upload(path, blob, { contentType: 'application/pdf', upsert: true });
            if (subida.error) throw subida.error;

            var url = supabaseClient.storage.from('relaciones-cargos').getPublicUrl(path).data.publicUrl;

            var archivoTexto = (modoCarta === 'medida')
                ? ('carta_medida_' + num + '_texto.json')
                : ((num === 1) ? '1era_carta_texto.json' : ('carta_' + num + '_texto.json'));
            try {
                var json = new Blob([JSON.stringify({ html: doc().innerHTML, modo: modoCarta })], { type: 'application/json' });
                await supabaseClient.storage.from('relaciones-cargos')
                    .upload(h.COD_HALLAZGO + '/' + archivoTexto, json,
                            { contentType: 'application/json', upsert: true });
            } catch (e) { console.error('[carta] no se pudo guardar el HTML:', e); }

            if (modoCarta === 'medida') {
                var cm = Object.assign({}, (caso.meta && caso.meta.carta_medida) || {});
                cm.url = url;
                cm.destinatario = destinatarioActual;
                cm.fecha_emision = new Date().toISOString();
                await guardarPaso(caso.id, { meta: Object.assign({}, caso.meta || {}, { carta_medida: cm }) });
            } else if (num === 1) {
                var payload = { cargo_1_url: url, cargo_1_destinatario: destinatarioActual };
                if (!caso.fecha_emision_1) {
                    var fechaEmision = new Date();
                    var fechaLimite = new Date(fechaEmision);
                    var contados = 0;
                    while (contados < RRLL_DIAS_DESCARGO) {
                        fechaLimite.setDate(fechaLimite.getDate() + 1);
                        if (esDiaHabil(fechaLimite)) contados++;
                    }
                    payload.fecha_emision_1 = fechaEmision.toISOString();
                    payload.fecha_limite_descargo = fechaLimite.toISOString();
                    payload.paso_actual = 2;
                }
                await guardarPaso(caso.id, payload);
            } else {
                var fresh = await supabaseClient.from('relaciones_casos')
                    .select('cartas_adicionales').eq('id', caso.id).single();
                var cartas = Array.isArray(fresh.data && fresh.data.cartas_adicionales)
                    ? fresh.data.cartas_adicionales.slice() : [];

                cartas[num - 2] = {
                    numero: num,
                    tipo: tipoCartaActual,
                    destinatario: destinatarioActual,
                    url: url,
                    fecha_emision: new Date().toISOString(),
                    fecha_recepcion: null,
                    descargo: null,
                    descargo_url: null
                };

                const casoCerrado = !!(caso.fecha_cierre || caso.paso_actual >= 8);
                await guardarPaso(caso.id, casoCerrado
                    ? { cartas_adicionales: cartas }
                    : { cartas_adicionales: cartas, paso_actual: 5 });
            }

            if (ventana) { ventana.location.href = url; } else { window.open(url, '_blank'); }

            try { rrllBorrador = null; } catch (e) {}
            cerrarModal();
            await abrirDrawerRRLL(h.COD_HALLAZGO);
            await cargarTablaRRLL();
            if (typeof cargarPanelAvisos === 'function') await cargarPanelAvisos();
        } catch (err) {
            console.error('[carta] Error:', err);
            if (ventana) { try { ventana.close(); } catch (e) {} }
            alert('❌ No se pudo generar la carta: ' + (err.message || err));
        } finally {
            boton.disabled = false;
            boton.innerHTML = original;
        }
    }

    /* ---------------- arranque ---------------- */
    function iniciar() {
        var cerrar = document.getElementById('carta-cerrar');
        var cancelar = document.getElementById('carta-cancelar');
        var guardar = document.getElementById('carta-guardar');
        var fondo = document.getElementById('modal-carta');
        var barra = document.getElementById('carta-toolbar');
        var imgInput = document.getElementById('carta-imagen');

        if (cerrar) cerrar.addEventListener('click', cerrarModal);
        if (cancelar) cancelar.addEventListener('click', cerrarModal);
        if (guardar) guardar.addEventListener('click', guardarYemitir);
        if (fondo) fondo.addEventListener('click', function (e) { if (e.target === fondo) cerrarModal(); });

        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrarModal(); });
        document.addEventListener('selectionchange', guardarSeleccion);

        if (barra) {
            barra.addEventListener('mousedown', function (e) { e.preventDefault(); });
            barra.addEventListener('click', function (e) {
                var btn = e.target.closest('button[data-cmd]');
                if (!btn) return;
                var cmd = btn.dataset.cmd;
                if (cmd === 'bold' || cmd === 'italic') aplicarComando(cmd);
                else if (cmd === 'menos') cambiarTamano(-1);
                else if (cmd === 'mas') cambiarTamano(+1);
                else if (cmd === 'imagen' && imgInput) imgInput.click();
            });
        }

        if (imgInput) {
            imgInput.addEventListener('change', function () {
                if (imgInput.files && imgInput.files[0]) insertarImagen(imgInput.files[0]);
                imgInput.value = '';
            });
        }

        var barraImg = document.getElementById('carta-img-toolbar');
        if (barraImg) {
            barraImg.addEventListener('mousedown', function (e) { e.preventDefault(); });
            barraImg.addEventListener('click', function (e) {
                var btn = e.target.closest('button[data-img]');
                if (!btn) return;
                if (btn.dataset.img === 'borrar') accionImagen('borrar');
                else if (btn.dataset.img === 'menos') accionImagen('menos');
                else if (btn.dataset.img === 'mas') accionImagen('mas');
            });
        }

        var d = doc();
        if (d) {
            d.addEventListener('click', function (e) {
                var img = e.target.closest('img');
                if (img) seleccionarImagen(img);
                else if (!e.target.closest('#carta-img-toolbar')) deseleccionarImagen();
            });
        }

        window.CartaRRLL = { abrir: abrirModal, cerrar: cerrarModal };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();
