/* ============================================================
   PRIMERA CARTA DISCIPLINARIA (Relaciones Laborales)
   ------------------------------------------------------------
   Genera la carta con el modelo de la empresa, la muestra en una
   previsualización EDITABLE y, al guardar:
     1. crea el PDF,
     2. lo sube al bucket relaciones-cargos,
     3. registra la emisión en relaciones_casos,
     4. abre el PDF para imprimir / descargar.

   Depende de app.js: supabaseClient, rrllHallazgoActual,
   rrllCasoActual, rrllFaltasHallazgo, guardarPaso, RRLL_DIAS_DESCARGO,
   abrirDrawerRRLL, cargarTablaRRLL, cargarPanelAvisos.
   ============================================================ */
(function () {
    'use strict';

    var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

    function capitalizar(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

    /* FECHA_ACONTECIMIENTO viene como "05/09/2026 08:24:00 AM" */
    function parsearFecha(v) {
        if (!v) return null;
        var m = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (!m) return null;
        return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    }

    function fechaHechoLarga(fecha) {
        if (!fecha) return '____';
        var d = fecha.getDate();
        return DIAS[fecha.getDay()] + ' ' + (d < 10 ? '0' + d : d) +
               ' de ' + MESES[fecha.getMonth()];
    }

    function fechaCartaLarga(fecha) {
        return fecha.getDate() + ' de ' + capitalizar(MESES[fecha.getMonth()]) +
               ' del ' + fecha.getFullYear();
    }

    function minusculaInicial(t) {
        if (!t) return '';
        return t.charAt(0).toLowerCase() + t.slice(1);
    }

    /* ---------- textos del modelo ---------- */
    function construirTextos(h, faltas) {
        var hoy = new Date();
        var fechaHecho = parsearFecha(h.FECHA_ACONTECIMIENTO);
        var falta = '<artículo/falta>';
        var hecho = minusculaInicial((h.ACONTECIMIENTO || '').trim().replace(/\.$/, ''));

        var anioHecho = fechaHecho ? fechaHecho.getFullYear() : null;
        var sufijoAnio = (anioHecho && anioHecho !== hoy.getFullYear()) ? (' de ' + anioHecho) : ' del presente';

        return {
            fecha: 'Paramonga, ' + fechaCartaLarga(hoy),
            destinatario: 'Señor\n' + (h.TRABAJADOR || '') + '\nParamonga.-',
            saludo: 'Estimado señor:',
            cuerpo: 'Hemos tomado conocimiento sobre el hecho ocurrido el día ' +
                    fechaHechoLarga(fechaHecho) + sufijoAnio +
                    ', donde según correo enviado por el Ing. Cesa Chunga, Jefe de Seguridad Industrial, ' +
                    'nos informa que ' + hecho +
                    ', incumpliendo el ' + falta + ', del RISST.',
            plazo: 'Por lo que solicitamos que en el plazo de ' + RRLL_DIAS_DESCARGO +
                   ' días hábiles después de recibida la presente, usted realice su descargo correspondiente.',
            cierre: 'Atentamente,',
            firma: '\n\n\n_______________________________________\nNombre y firma'
        };
    }

    /* ---------- modal ---------- */
    function campo(nombre) {
        return document.querySelector('#carta-pagina [data-campo="' + nombre + '"]');
    }

    function volcarTextos(t) {
        ['fecha', 'destinatario', 'saludo', 'cuerpo', 'plazo', 'cierre', 'firma'].forEach(function (k) {
            var el = campo(k);
            if (el) el.textContent = t[k] || '';
        });
    }

    function leerTextos() {
        var out = {};
        ['fecha', 'destinatario', 'saludo', 'cuerpo', 'plazo', 'cierre', 'firma'].forEach(function (k) {
            var el = campo(k);
            out[k] = el ? el.innerText.replace(/\u00a0/g, ' ') : '';
        });
        return out;
    }

    /* Ruta del JSON donde se guarda el texto editado de la carta. */
    function urlTextoGuardado(cod) {
        return supabaseClient.storage
            .from('relaciones-cargos')
            .getPublicUrl(cod + '/1era_carta_texto.json').data.publicUrl;
    }

    /* Si la carta ya fue emitida, recupera el texto tal como se guardó. */
    async function textosParaEditar(h, caso) {
        var modelo = construirTextos(h, rrllFaltasHallazgo || []);
        if (!caso || !caso.fecha_emision_1) return modelo;
        try {
            var resp = await fetch(urlTextoGuardado(h.COD_HALLAZGO) + '?v=' + Date.now());
            if (!resp.ok) return modelo;
            var guardado = await resp.json();
            if (guardado && guardado.cuerpo) {
                ['fecha', 'destinatario', 'saludo', 'cuerpo', 'plazo', 'cierre', 'firma'].forEach(function (k) {
                    if (typeof guardado[k] === 'string') modelo[k] = guardado[k];
                });
            }
        } catch (e) { /* si no existe, se usa el modelo */ }
        return modelo;
    }

    async function abrirModal() {
        var h = rrllHallazgoActual;
        if (!h) { alert('Abre primero un caso de la lista.'); return; }
        if (!h.TRABAJADOR) { alert('⚠️ El hallazgo no tiene trabajador asignado.'); return; }

        volcarTextos(construirTextos(h, rrllFaltasHallazgo || []));

        var m = document.getElementById('modal-carta');
        m.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        m.scrollTop = 0;

        // Si ya se emitió, se sobrescribe con lo que se guardó.
        var textos = await textosParaEditar(h, rrllCasoActual);
        volcarTextos(textos);
    }

    function cerrarModal() {
        var m = document.getElementById('modal-carta');
        if (m) m.classList.add('hidden');
        document.body.style.overflow = '';
    }

    /* ---------- PDF ---------- */
    function cargarLogo() {
        return new Promise(function (resolve) {
            var img = new Image();
            img.onload = function () {
                try {
                    // Reducimos el logo: a 30 mm de ancho bastan ~360 px.
                    var MAX = 520;
                    var escala = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
                    var c = document.createElement('canvas');
                    c.width = Math.round(img.naturalWidth * escala);
                    c.height = Math.round(img.naturalHeight * escala);
                    var ctx = c.getContext('2d');
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, c.width, c.height);
                    ctx.drawImage(img, 0, 0, c.width, c.height);
                    resolve({ data: c.toDataURL('image/jpeg', 0.9), w: c.width, h: c.height });
                } catch (e) { resolve(null); }
            };
            img.onerror = function () { resolve(null); };
            img.src = 'assets/logo-carta.png';
        });
    }

    function escribir(doc, texto, y, opciones) {
        opciones = opciones || {};
        var size = opciones.size || 11;
        var ancho = opciones.ancho || 165;
        var x = opciones.x || 25;
        doc.setFontSize(size);
        var lineas = doc.splitTextToSize(String(texto || ''), ancho);
        var altoLinea = size * 0.3528 * 1.5;
        for (var i = 0; i < lineas.length; i++) {
            if (y > 272) { doc.addPage(); y = 20; }
            doc.text(lineas[i], x, y);
            y += altoLinea;
        }
        return y;
    }

    async function generarPDF(textos) {
        if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('No se cargó el generador de PDF (jsPDF).');
        var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });

        var logo = await cargarLogo();
        if (logo) {
            var alto = 36 * (logo.h / logo.w);
            doc.addImage(logo.data, 'JPEG', 25, 15, 36, alto);
        }

        doc.setFont('helvetica', 'normal');
        var y = 62;

        y = escribir(doc, textos.fecha, y);
        y += 6;
        y = escribir(doc, textos.destinatario, y);
        y += 6;
        y = escribir(doc, textos.saludo, y);
        y += 4;
        y = escribir(doc, textos.cuerpo, y);
        y += 4;
        y = escribir(doc, textos.plazo, y);
        y += 10;
        y = escribir(doc, textos.cierre, y);
        y = escribir(doc, textos.firma, y);

        return doc.output('blob');
    }

    /* ---------- guardar ---------- */
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
            var textos = leerTextos();
            var blob = await generarPDF(textos);

            boton.textContent = 'Guardando...';
            var path = h.COD_HALLAZGO + '/1era_carta_' + Date.now() + '.pdf';
            var subida = await supabaseClient.storage
                .from('relaciones-cargos')
                .upload(path, blob, { contentType: 'application/pdf', upsert: true });
            if (subida.error) throw subida.error;

            var urlData = supabaseClient.storage.from('relaciones-cargos').getPublicUrl(path);
            var url = urlData.data.publicUrl;

            // Guardamos el texto editado para poder reeditarlo tal cual después.
            try {
                var json = new Blob([JSON.stringify(textos)], { type: 'application/json' });
                await supabaseClient.storage
                    .from('relaciones-cargos')
                    .upload(h.COD_HALLAZGO + '/1era_carta_texto.json', json, { contentType: 'application/json', upsert: true });
            } catch (e) { console.error('[carta] No se pudo guardar el texto editable:', e); }

            var nombreDestinatario = (textos.destinatario || '').split('\n')[1] || h.TRABAJADOR || '';
            var payload = { cargo_1_url: url, cargo_1_destinatario: nombreDestinatario };

            // Primera emisión: fija fechas y avanza el expediente al paso 2.
            // Si ya estaba emitida (edición), solo se reemplaza el PDF.
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

            if (ventana) { ventana.location.href = url; } else { window.open(url, '_blank'); }

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

    /* ---------- arranque ---------- */
    function iniciar() {
        var cerrar = document.getElementById('carta-cerrar');
        var cancelar = document.getElementById('carta-cancelar');
        var guardar = document.getElementById('carta-guardar');
        var fondo = document.getElementById('modal-carta');

        if (cerrar) cerrar.addEventListener('click', cerrarModal);
        if (cancelar) cancelar.addEventListener('click', cerrarModal);
        if (guardar) guardar.addEventListener('click', guardarYemitir);
        if (fondo) fondo.addEventListener('click', function (e) { if (e.target === fondo) cerrarModal(); });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') cerrarModal();
        });

        window.CartaRRLL = { abrir: abrirModal, cerrar: cerrarModal };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();
