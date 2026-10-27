/* ============================================================
   SEMÁFORO DE CONTINGENCIA
   Banda siempre visible en el mapa y en el ingreso de conductores.

   Niveles anclados al plan:
   verde -> estado base, siempre vigente; NO se declara
   amarillo -> antes de la emergencia: señales iniciales
   naranja -> durante: bocatomas, compuertas, maquinaria (Nivel II)
   rojo -> Churlin Alto / zona industrial (Nivel III, AAQ)

   Quién declara:
   amarillo Jefe de Seguridad Industrial (o gerencia)
   naranja Gerente General / Gerente Legal (o Jefe SST como guardia)
   rojo solo Gerente General o alterno (Gerente Legal y RR.LL)
   Cerrar la alerta devuelve el semáforo a verde (estado base), con
   verificación en campo y queda registrado quién la cerró.
   Todo queda en semaforo_estado / semaforo_eventos (ver sql/semaforo.sql).
============================================================ */

(function () {
    'use strict';

    const SEM_URL = 'https://bfhfnldqwsrcpsdqpyat.supabase.co';
    const SEM_KEY = 'sb_publishable_z-jW4WrGLq7wEhCI_CW3Ig_vQZwtOMh';
    const LS_ESTADO = 'sem_estado';
    const LS_HISTORIAL = 'sem_historial';
    const REFRESCO_MS = 60000;

    /* ------------------------------------------------------------
       Definición de los niveles: texto de la lámina + acciones del plan
    ------------------------------------------------------------ */
    const NIVELES = {
        verde: {
            orden: 0,
            nombre: 'VERDE',
            base: true,
            frase: 'Sin novedad · Vigilancia normal',
            color: '#16a34a',
            color2: '#0f7a35',
            pasos: ['Vigilar diariamente los datos que emite el pluviómetro.'],
        },
        amarillo: {
            orden: 1,
            nombre: 'AMARILLO',
            frase: 'Señales iniciales · Prepararse',
            color: '#eab308',
            color2: '#a16207',
            pasos: [
                'Monitoreo de las quebradas Julquillas y Rinconada-Choque por Administración 1 y 3 con Seguridad Patrimonial.',
                'Contacto con la minera Castor (924823461) durante la época de lluvias.',
                'Aviso inmediato al Jefe de Seguridad y a las gerencias.',
                'Cuadrillas a los puntos de vigilancia: quebrada cargada de agua, turbiedad o crecida.',
                'Aviso preventivo a la Junta de Usuarios del Valle de Pativilca (997009846).',
                'Alistar maquinaria, personal de guardia, radios, linternas y lampas; botiquines abastecidos.',
            ],
        },
        naranja: {
            orden: 2,
            nombre: 'NARANJA',
            frase: 'Riesgo alto · Restringir y movilizar',
            color: '#ea580c',
            color2: '#9a3412',
            pasos: [
                'Solicitar a la Junta de Usuarios el cierre de bocatomas: Huayto, Otorongo, Paramonga, La Vega y Alpas.',
                'Abrir las compuertas de los laterales de riego de los 15 campos — se registra en el panel Compuertas.',
                'Trasladar la maquinaria de las Administraciones 1 y 3 a zona segura.',
                'Restringir accesos y reducir dotación en el centro de distribución.',
                'Instalar el Puesto de Comando en el Centro de Operaciones de Seguridad (Nivel II).',
                'Paralizar actividades en campo y evacuar al personal expuesto.',
            ],
        },
        rojo: {
            orden: 3,
            nombre: 'ROJO',
            frase: 'Peligro inminente · Activar AAQ',
            color: '#dc2626',
            color2: '#991b1b',
            pasos: [
                'Contención con tierra desde la puerta 1 hasta la puerta 3 cuando el huayco llegue a Churlin Alto.',
                'Detener el despacho de azúcar y sellar el almacén de producto terminado.',
                'Evacuación total o parcial de la planta; sirena de emergencia continua.',
                'Corte de energía en zonas administrativas y sectores afectados, bajo condiciones seguras.',
                'Activar el AAQ y comunicar a entidades externas: solo el Coordinador General habla con prensa.',
            ],
        },
    };

    /* ------------------------------------------------------------
       Estado en memoria
    ------------------------------------------------------------ */
    let estado = {
        nivel: 'verde',
        motivo: '',
        declarado_por: '',
        declarado_por_rol: '',
        es_guardia: false,
        vigente_desde: null,
    };
    let historial = [];
    let origen = 'local'; /* 'nube' | 'local' */
    let cliente = null;
    let usuario = null;
    let rol = 'ninguno';
    let banda = null;
    let luces = null;
    let barraMapa = null;
    let encabezado = null;
    let panel = null;
    let vista = 'detalle';

    /* ------------------------------------------------------------
       Utilidades
    ------------------------------------------------------------ */
    function semEscape(t) {
        return String(t == null ? '' : t)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function semNormalizar(v) {
        return String(v || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toLowerCase();
    }

    function semFecha(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d)) return '';
        return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    function semHace(iso) {
        if (!iso) return '';
        const ms = Date.now() - new Date(iso).getTime();
        if (!isFinite(ms) || ms < 0) return 'ahora';
        const min = Math.floor(ms / 60000);
        if (min < 1) return 'ahora';
        if (min < 60) return 'hace ' + min + ' min';
        const h = Math.floor(min / 60);
        if (h < 24) return 'hace ' + h + ' h';
        return 'hace ' + Math.floor(h / 24) + ' d';
    }

    function semAvisar(texto, tipo) {
        if (typeof window.avisar === 'function') {
            try {
                window.avisar(texto, tipo || 'info');
                return;
            } catch (e) {}
        }
        let caja = document.getElementById('sem-toast');
        if (!caja) {
            caja = document.createElement('div');
            caja.id = 'sem-toast';
            document.body.appendChild(caja);
        }
        caja.textContent = texto;
        caja.className = 'visible ' + (tipo || '');
        clearTimeout(semAvisar._t);
        semAvisar._t = setTimeout(() => {
            caja.className = '';
        }, 3800);
    }

    /* ------------------------------------------------------------
       Usuario y permisos
    ------------------------------------------------------------ */
    function semLeerUsuario() {
        try {
            return JSON.parse(localStorage.getItem('pc_user') || 'null');
        } catch (e) {
            return null;
        }
    }

    function semRol(u) {
        if (!u) return 'ninguno';
        if (u.rol === 'gerente_general' || u.rol === 'gerencial_legal') return 'gerencia';
        const texto = semNormalizar(
            String(u.seccion || '') + ' ' + String(u.area || '') + ' ' + String(u.nombre || ''),
        );
        if (texto.includes('seguridad industrial') || texto.includes('chunga')) return 'sst';
        return 'ninguno';
    }

    function semNombre(u) {
        if (!u) return '';
        return u.nombre || u.area || '';
    }

    /* El verde es el estado base: no se declara, se está. */
    function semNivelesAlerta() {
        return ['amarillo', 'naranja', 'rojo'];
    }

    /* ¿Puede declarar este nivel de alerta? */
    function semPuedeDeclarar(nuevo, esGuardia) {
        if (nuevo === 'verde') return false;
        if (rol === 'gerencia') return true;
        if (rol !== 'sst') return false;
        if (nuevo === 'rojo') return false; /* solo el Coordinador General */
        if (nuevo === 'naranja') return !!esGuardia; /* guardia de fin de semana */
        return nuevo === 'amarillo';
    }

    /* Volver a vigilancia normal es un cierre de alerta, no una declaración */
    function semPuedeNormalizar() {
        if (estado.nivel === 'verde') return false;
        if (rol === 'gerencia') return true;
        if (rol === 'sst') return estado.nivel === 'amarillo';
        return false;
    }

    function semPuedeVerBoton() {
        return rol === 'gerencia' || rol === 'sst';
    }

    /* ------------------------------------------------------------
       Cliente de base de datos (comparte el de mapa.js si existe)
    ------------------------------------------------------------ */
    function semCliente() {
        try {
            if (typeof db !== 'undefined' && db) return db;
        } catch (e) {
            /* mapa.js no cargado: se crea uno propio */
        }
        try {
            if (typeof supabase === 'undefined') return null;
            return supabase.createClient(SEM_URL, SEM_KEY);
        } catch (e) {
            return null;
        }
    }

    /* ------------------------------------------------------------
       Carga y guardado
    ------------------------------------------------------------ */
    function semLocalLeer() {
        try {
            const e = JSON.parse(localStorage.getItem(LS_ESTADO) || 'null');
            if (e && NIVELES[e.nivel]) return e;
        } catch (err) {}
        return null;
    }

    function semLocalHistorial() {
        try {
            const h = JSON.parse(localStorage.getItem(LS_HISTORIAL) || '[]');
            return Array.isArray(h) ? h.slice(0, 12) : [];
        } catch (e) {
            return [];
        }
    }

    function semLocalGuardar(e) {
        try {
            localStorage.setItem(LS_ESTADO, JSON.stringify(e));
            const h = semLocalHistorial();
            h.unshift({
                nivel: e.nivel,
                nivel_anterior: e.nivel_anterior || '',
                motivo: e.motivo || '',
                declarado_por: e.declarado_por || '',
                declarado_por_rol: e.declarado_por_rol || '',
                creado_en: e.vigente_desde || new Date().toISOString(),
            });
            localStorage.setItem(LS_HISTORIAL, JSON.stringify(h.slice(0, 12)));
        } catch (err) {}
    }

    async function semCargar() {
        const local = semLocalLeer();
        if (!cliente) {
            origen = 'local';
            if (local) estado = local;
            historial = semLocalHistorial();
            return;
        }

        try {
            const { data, error } = await cliente
                .from('semaforo_estado')
                .select('nivel, motivo, declarado_por, declarado_por_rol, es_guardia, vigente_desde')
                .eq('id', 1)
                .maybeSingle();

            if (error || !data) {
                origen = 'local';
                if (local) estado = local;
                historial = semLocalHistorial();
                return;
            }

            origen = 'nube';
            estado = {
                nivel: NIVELES[data.nivel] ? data.nivel : 'verde',
                motivo: data.motivo || '',
                declarado_por: data.declarado_por || '',
                declarado_por_rol: data.declarado_por_rol || '',
                es_guardia: !!data.es_guardia,
                vigente_desde: data.vigente_desde || null,
            };
            /* La nube manda, pero se guarda copia para el celular sin señal */
            try {
                localStorage.setItem(LS_ESTADO, JSON.stringify(estado));
            } catch (e) {}

            const { data: ev } = await cliente
                .from('semaforo_eventos')
                .select('nivel, nivel_anterior, motivo, declarado_por, declarado_por_rol, creado_en')
                .order('creado_en', { ascending: false })
                .limit(6);
            historial = (ev || []).slice(0, 6);
        } catch (e) {
            origen = 'local';
            if (local) estado = local;
            historial = semLocalHistorial();
        }
    }

    async function semGuardar(nivel, motivo, esGuardia, verifico) {
        const anterior = estado.nivel;
        const ahora = new Date().toISOString();
        const nuevo = {
            nivel: nivel,
            nivel_anterior: anterior,
            motivo: motivo,
            declarado_por: semNombre(usuario),
            declarado_por_rol: rol,
            es_guardia: !!esGuardia,
            vigente_desde: ahora,
            verifico: !!verifico,
        };

        let subio = false;

        if (cliente) {
            try {
                const { error } = await cliente.from('semaforo_estado').upsert(
                    {
                        id: 1,
                        nivel: nivel,
                        motivo: motivo,
                        declarado_por: nuevo.declarado_por,
                        declarado_por_rol: rol,
                        es_guardia: !!esGuardia,
                        vigente_desde: ahora,
                        actualizado_en: ahora,
                    },
                    { onConflict: 'id' },
                );

                if (!error) {
                    await cliente.from('semaforo_eventos').insert({
                        nivel: nivel,
                        nivel_anterior: anterior,
                        motivo: motivo,
                        declarado_por: nuevo.declarado_por,
                        declarado_por_rol: rol,
                        es_guardia: !!esGuardia,
                        verificado: !!verifico,
                    });
                    subio = true;
                    origen = 'nube';
                }
            } catch (e) {
                /* sigue el modo local */
            }
        }

        estado = nuevo;
        semLocalGuardar(nuevo);
        semPintar();
        if (panel) semPintarPanel();

        if (subio) {
            semAvisar(
                nivel === 'verde'
                    ? 'Alerta cerrada: el semáforo queda en vigilancia normal.'
                    : 'Semáforo: ' + NIVELES[nivel].nombre + ' declarado y publicado.',
                nivel === 'verde' ? 'ok' : 'warn',
            );
        } else {
            semAvisar(
                nivel === 'verde'
                    ? 'Alerta cerrada solo en este equipo (sin conexión con la base).'
                    : 'Semáforo: ' +
                          NIVELES[nivel].nombre +
                          ' guardado solo en este equipo (sin conexión con la base).',
                'warn',
            );
        }
        return subio;
    }

    /* ------------------------------------------------------------
       Estilos (inyectados: sirve igual en mapa.html y conductor.html)
    ------------------------------------------------------------ */
    function semEstilos() {
        if (document.getElementById('sem-estilos')) return;
        const css = document.createElement('style');
        css.id = 'sem-estilos';
        css.textContent = `
        #sem-banda {
        position: fixed; top: 0; left: 0; right: 0; z-index: 2400;
        display: flex; align-items: center; gap: 10px; width: 100%;
        padding: 9px 14px; border: none; margin: 0; cursor: pointer;
        font-family: inherit; text-align: left; color: #fff;
        background: #16a34a;
        box-shadow: 0 4px 16px rgba(15,23,42,.30);
        transition: background .25s ease;
        -webkit-appearance: none; appearance: none;
        }
        #sem-banda:focus-visible { outline: 3px solid #fff; outline-offset: -4px; }
        #sem-banda .sem-luz {
        width: 18px; height: 18px; border-radius: 50%; flex: 0 0 auto;
        background: #fff; box-shadow: 0 0 0 3px rgba(255,255,255,.35);
        }
        #sem-banda.sem-pulso .sem-luz { animation: semLatido 1.1s ease-in-out infinite; }
        @keyframes semLatido {
        0%, 100% { box-shadow: 0 0 0 3px rgba(255,255,255,.35); transform: scale(1); }
        50% { box-shadow: 0 0 0 9px rgba(255,255,255,.10); transform: scale(1.18); }
        }
        #sem-banda .sem-txt { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
        #sem-banda .sem-niv { font-size: .84rem; font-weight: 800; letter-spacing: .06em; line-height: 1.2; }
        #sem-banda .sem-frase {
        font-size: .72rem; opacity: .96; line-height: 1.25;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        #sem-banda .sem-meta {
        font-size: .64rem; opacity: .9; white-space: nowrap; flex: 0 0 auto;
        text-align: right; line-height: 1.3;
        }
        #sem-banda .sem-meta b { display: block; font-weight: 700; }
        #sem-banda .sem-flecha { font-size: .7rem; opacity: .85; flex: 0 0 auto; }
        @media (max-width: 520px) {
        #sem-banda { padding: 8px 10px; gap: 8px; }
        #sem-banda .sem-niv { font-size: .76rem; }
        #sem-banda .sem-frase { font-size: .66rem; }
        #sem-banda .sem-meta { display: none; }
        }

        /* Deja libre el espacio de la banda para no tapar la barra del mapa */
        body.sem-activo { --sem-alto: 0px; }
        body.sem-activo .barra { top: calc(12px + var(--sem-alto)); }
        body.sem-activo.sem-pagina-centrada { padding-top: calc(18px + var(--sem-alto)); }

        /* Panel de detalle */
        #sem-panel {
        position: fixed; inset: 0; z-index: 3300; display: none;
        align-items: flex-start; justify-content: center;
        background: rgba(15,23,42,.80); padding: 12px; overflow: auto;
        }
        #sem-panel.abierto { display: flex; }
        .sem-caja {
        background: #fff; border-radius: 16px; width: 100%; max-width: 620px;
        margin: auto; padding: 0; overflow: hidden;
        box-shadow: 0 24px 60px rgba(15,23,42,.35);
        }
        .sem-cab {
        padding: 14px 16px; color: #fff; display: flex; align-items: center; gap: 12px;
        }
        .sem-cab .sem-luz { width: 20px; height: 20px; border-radius: 50%; background: #fff; flex: 0 0 auto; }
        .sem-cab h2 { margin: 0; font-size: 1.05rem; letter-spacing: .05em; }
        .sem-cab p { margin: 2px 0 0; font-size: .74rem; opacity: .95; }
        .sem-cab .sem-x {
        margin-left: auto; background: rgba(255,255,255,.18); border: none; color: #fff;
        width: 34px; height: 34px; border-radius: 10px; font-size: 1rem; cursor: pointer; flex: 0 0 auto;
        }
        .sem-cuerpo { padding: 14px 16px 16px; }
        .sem-datos {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 8px; margin: 0 0 12px;
        }
        .sem-dato { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px 10px; }
        .sem-dato span { display: block; font-size: .6rem; letter-spacing: .06em; color: #64748b; font-weight: 700; }
        .sem-dato strong { display: block; font-size: .8rem; color: #0f172a; margin-top: 2px; }
        .sem-motivo {
        background: #f1f5f9; border-left: 4px solid #94a3b8; border-radius: 8px;
        padding: 9px 11px; font-size: .8rem; color: #334155; line-height: 1.45; margin: 0 0 14px;
        }
        .sem-sub {
        font-size: .66rem; font-weight: 800; letter-spacing: .07em; color: #64748b;
        margin: 0 0 8px; text-transform: uppercase;
        }
        .sem-pasos { list-style: none; margin: 0 0 14px; padding: 0; display: flex; flex-direction: column; gap: 7px; }
        .sem-pasos li {
        display: flex; gap: 9px; align-items: flex-start;
        background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;
        padding: 9px 11px; font-size: .79rem; color: #1e293b; line-height: 1.4;
        }
        .sem-pasos li i { color: #0f766e; font-size: .8rem; margin-top: 2px; flex: 0 0 auto; }
        .sem-hist { display: flex; flex-direction: column; gap: 6px; margin: 0 0 4px; }
        .sem-hecho { display: flex; align-items: center; gap: 8px; font-size: .74rem; color: #475569; }
        .sem-hecho .punto { width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto; }
        .sem-hecho b { color: #0f172a; }
        .sem-acciones { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
        .sem-btn {
        flex: 1 1 auto; min-width: 130px; padding: 11px; border-radius: 11px;
        border: 1px solid #e2e8f0; background: #fff; color: #334155;
        font-weight: 800; font-size: .82rem; cursor: pointer; font-family: inherit;
        display: inline-flex; align-items: center; justify-content: center; gap: 7px;
        }
        .sem-btn.principal { background: #0f172a; color: #fff; border-color: #0f172a; }
        .sem-btn:active { transform: scale(.99); }
        .sem-nota { font-size: .7rem; color: #94a3b8; margin: 10px 0 0; line-height: 1.4; }

        /* Formulario de declaración */
        .sem-opciones { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin: 0 0 12px; }
        .sem-opcion {
        border: 2px solid #e2e8f0; background: #fff; border-radius: 12px;
        padding: 10px; text-align: left; cursor: pointer; font-family: inherit;
        display: flex; align-items: center; gap: 9px;
        }
        .sem-opcion .punto { width: 14px; height: 14px; border-radius: 50%; flex: 0 0 auto; }
        .sem-opcion b { display: block; font-size: .76rem; color: #0f172a; }
        .sem-opcion small { display: block; font-size: .64rem; color: #64748b; line-height: 1.25; }
        .sem-opcion.elegido { border-color: #0f172a; box-shadow: 0 0 0 3px rgba(15,23,42,.08); }
        .sem-opcion:disabled { opacity: .40; cursor: not-allowed; }
        .sem-form textarea {
        width: 100%; min-height: 74px; resize: vertical; font-family: inherit; font-size: .84rem;
        border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px; color: #0f172a;
        }
        .sem-check {
        display: flex; align-items: flex-start; gap: 8px; font-size: .76rem;
        color: #334155; margin: 10px 0 0; line-height: 1.35; cursor: pointer;
        }
        .sem-check input { margin-top: 2px; width: 16px; height: 16px; flex: 0 0 auto; }
        .sem-error { color: #b91c1c; font-size: .74rem; margin-top: 8px; display: none; }
        .sem-error.visible { display: block; }

        /* Semáforo horizontal: cuatro luces, una por nivel */
        #sem-luces {
            display: inline-flex; align-items: center; gap: 7px;
            padding: 5px 10px; border-radius: 999px;
            background: #0f172a; border: 1px solid #1e293b;
            box-shadow: inset 0 1px 4px rgba(0,0,0,.55), 0 2px 8px rgba(15,23,42,.20);
            cursor: pointer; flex: 0 0 auto;
        }
        #sem-luces:focus-visible { outline: 3px solid #0f172a; outline-offset: 2px; }
        #sem-luces .foco {
            width: 15px; height: 15px; border-radius: 50%;
            background: var(--c); opacity: .22; filter: grayscale(.65);
            transition: opacity .22s ease, box-shadow .22s ease, filter .22s ease, transform .22s ease;
        }
        #sem-luces .foco.on {
            opacity: 1; filter: none; transform: scale(1.08);
            box-shadow: 0 0 9px var(--c), 0 0 18px var(--c);
        }
        #sem-luces.sem-pulso .foco.on { animation: semLatido 1.1s ease-in-out infinite; }
        #sem-luces.chico { padding: 4px 8px; gap: 6px; }
        #sem-luces.chico .foco { width: 12px; height: 12px; }
        #sem-grupo { display: inline-flex; align-items: center; gap: 8px; margin-left: 14px; }
        #sem-grupo-txt { font-size: .66rem; font-weight: 800; letter-spacing: .06em; color: #334155; }
        @media (max-width: 900px) {
            #sem-grupo { margin-left: 8px; }
            #sem-grupo-txt { display: none; }
            #sem-luces .foco { width: 12px; height: 12px; }
            #sem-luces { gap: 5px; padding: 4px 7px; }
        }

        /* Aviso flotante propio (cuando mapa.js no está) */
        #sem-toast {
        position: fixed; left: 50%; bottom: 24px; z-index: 3400;
        transform: translateX(-50%) translateY(14px);
        max-width: min(92vw, 480px); padding: 11px 15px; border-radius: 12px;
        font-size: .8rem; font-weight: 600; line-height: 1.35; text-align: center;
        background: #0f172a; color: #fff; box-shadow: 0 12px 30px rgba(15,23,42,.35);
        opacity: 0; pointer-events: none; transition: opacity .2s, transform .2s;
        }
        #sem-toast.visible { opacity: 1; transform: translateX(-50%) translateY(0); }
        #sem-toast.warn { background: #b45309; }
        #sem-toast.ok { background: #166534; }
        `;
        document.head.appendChild(css);
    }

    /* ------------------------------------------------------------
       Banda superior (siempre visible)
    ------------------------------------------------------------ */
    function semMontarBanda() {
        if (document.getElementById('sem-banda')) return;
        banda = document.createElement('button');
        banda.id = 'sem-banda';
        banda.type = 'button';
        banda.setAttribute('aria-live', 'polite');
        banda.innerHTML =
            '<span class="sem-luz"></span>' +
            '<span class="sem-txt">' +
            '<span class="sem-niv" id="sem-niv">VERDE</span>' +
            '<span class="sem-frase" id="sem-frase">Sin novedad · Vigilancia normal</span>' +
            '</span>' +
            '<span class="sem-meta" id="sem-meta"></span>' +
            '<i class="fas fa-chevron-down sem-flecha"></i>';
        banda.addEventListener('click', semAbrirPanel);
        document.body.insertBefore(banda, document.body.firstChild);
        document.body.classList.add('sem-activo');
    }

    /* ------------------------------------------------------------
       Modo encabezado: páginas con barra propia (index.html).
       La barra toma el color del nivel en lugar de llevar banda fija.
    ------------------------------------------------------------ */
    function semRgba(hex, alfa) {
        const h = String(hex || '#16a34a').replace('#', '');
        const r = parseInt(h.substring(0, 2), 16) || 0;
        const g = parseInt(h.substring(2, 4), 16) || 0;
        const b = parseInt(h.substring(4, 6), 16) || 0;
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alfa + ')';
    }

    /* Semáforo horizontal: un foco por nivel */
    function semMontarLuces(destino, chico) {
        const caja = document.createElement('span');
        caja.id = 'sem-luces';
        if (chico) caja.classList.add('chico');
        caja.setAttribute('role', 'button');
        caja.tabIndex = 0;
        caja.title = 'Semáforo de contingencia: ver detalle';
        caja.innerHTML = Object.keys(NIVELES)
            .map(function (k) {
                return (
                    '<span class="foco" data-nivel="' +
                    k +
                    '" style="--c:' +
                    NIVELES[k].color +
                    '"></span>'
                );
            })
            .join('');
        caja.addEventListener('click', semAbrirPanel);
        caja.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                semAbrirPanel();
            }
        });
        destino.appendChild(caja);
        luces = caja;
        return caja;
    }

    function semPintarLuces() {
        if (!luces) return;
        const nivel = estado.nivel;
        luces.querySelectorAll('.foco').forEach(function (f) {
            f.classList.toggle('on', f.dataset.nivel === nivel);
        });
        luces.classList.toggle('sem-pulso', nivel === 'naranja' || nivel === 'rojo');
    }

    /* Portal: encabezado con el color del nivel + semáforo al lado del logo */
    function semMontarEncabezado(cabecera) {
        encabezado = cabecera;
        cabecera.classList.add('sem-encabezado');
        if (document.getElementById('sem-luces')) return;

        const marca = cabecera.querySelector('.logo-area');
        const grupo = document.createElement('span');
        grupo.id = 'sem-grupo';
        semMontarLuces(grupo, false);
        const txt = document.createElement('span');
        txt.id = 'sem-grupo-txt';
        grupo.appendChild(txt);

        if (marca) marca.appendChild(grupo);
        else cabecera.appendChild(grupo);
    }

    function semPintarEncabezado() {
        const n = NIVELES[estado.nivel] || NIVELES.verde;

        if (encabezado) {
            encabezado.style.borderBottom = '3px solid ' + n.color;
            encabezado.style.background =
                'linear-gradient(180deg, #ffffff 52%, ' + semRgba(n.color, 0.14) + ' 100%)';
        }
        const txt = document.getElementById('sem-grupo-txt');
        if (txt) txt.textContent = n.nombre;
        semPintarLuces();
    }

    /* Mapa: la barra blanca se rodea del color del nivel y lleva el semáforo */
    function semMontarMapaBarra(barra) {
        barraMapa = barra;
        barra.classList.add('sem-barra');
        if (document.getElementById('sem-luces')) return;

        const sep = barra.querySelector('.sep');
        if (sep) {
            sep.style.display = 'flex';
            sep.style.alignItems = 'center';
            sep.style.justifyContent = 'center';
            semMontarLuces(sep, false);
        } else {
            semMontarLuces(barra, true);
        }
    }

    function semPintarMapa() {
        const n = NIVELES[estado.nivel] || NIVELES.verde;
        if (barraMapa) {
            barraMapa.style.border = '3px solid ' + n.color;
            barraMapa.style.boxShadow =
                '0 6px 24px rgba(15,23,42,.18), 0 0 0 4px ' + semRgba(n.color, 0.16);
        }
        semPintarLuces();
    }

    function semPintar() {
        if (banda) {
            const n = NIVELES[estado.nivel] || NIVELES.verde;
            banda.style.background = 'linear-gradient(90deg,' + n.color + ',' + n.color2 + ')';
            banda.classList.toggle(
                'sem-pulso',
                estado.nivel === 'naranja' || estado.nivel === 'rojo'
            );

            const niv = document.getElementById('sem-niv');
            const frase = document.getElementById('sem-frase');
            const meta = document.getElementById('sem-meta');
            if (niv) niv.textContent = n.nombre;
            if (frase) frase.textContent = n.frase;
            if (meta) {
                if (estado.nivel === 'verde') {
                    /* El verde es el estado base: no tiene autor ni hora que mostrar */
                    meta.innerHTML = '';
                } else {
                    const quien = estado.declarado_por ? semEscape(estado.declarado_por) : '';
                    meta.innerHTML =
                        (quien ? '<b>' + quien + '</b>' : '') + (semHace(estado.vigente_desde) || '');
                }
            }
            semAjustarAlto();
            return;
        }

        if (barraMapa) {
            semPintarMapa();
            return;
        }
        if (encabezado) {
            semPintarEncabezado();
            return;
        }
        semPintarLuces();
    }

    function semAjustarAlto() {
        if (!banda) return;
        const alto = banda.offsetHeight || 48;
        document.documentElement.style.setProperty('--sem-alto', alto + 'px');
        document.body.style.setProperty('--sem-alto', alto + 'px');
    }

    /* ------------------------------------------------------------
       Panel de detalle / declaración
    ------------------------------------------------------------ */
    function semMontarPanel() {
        if (document.getElementById('sem-panel')) return;
        panel = document.createElement('div');
        panel.id = 'sem-panel';
        panel.addEventListener('click', (ev) => {
            if (ev.target === panel) semCerrarPanel();
        });
        document.body.appendChild(panel);
    }

    function semAbrirPanel() {
        if (!panel) semMontarPanel();
        vista = 'detalle';
        semPintarPanel();
        panel.classList.add('abierto');
    }

    function semCerrarPanel() {
        if (panel) panel.classList.remove('abierto');
    }

    function semPintarPanel() {
        if (!panel) return;
        if (vista === 'declarar') panel.innerHTML = semHtmlDeclarar();
        else if (vista === 'normalizar') panel.innerHTML = semHtmlNormalizar();
        else panel.innerHTML = semHtmlDetalle();

        if (vista === 'declarar') semEngancharDeclarar();
        else if (vista === 'normalizar') semEngancharNormalizar();
        else semEngancharDetalle();

        semAjustarAlto();
    }

    function semHtmlDetalle() {
        const n = NIVELES[estado.nivel];
        const esBase = estado.nivel === 'verde';

        let datos = '';
        if (esBase) {
            datos =
                '<span class="sem-dato"><span>ESTADO</span><strong>Normal (base)</strong></span>' +
                '<span class="sem-dato"><span>VIGILANCIA</span><strong>Permanente</strong></span>';
        } else {
            datos =
                '<span class="sem-dato"><span>DECLARADO POR</span><strong>' +
                (semEscape(estado.declarado_por) || '—') +
                '</strong></span>' +
                '<span class="sem-dato"><span>CUÁNDO</span><strong>' +
                (semFecha(estado.vigente_desde) || '—') +
                '</strong></span>' +
                (estado.es_guardia
                    ? '<span class="sem-dato"><span>DECLARADO COMO</span><strong>Guardia</strong></span>'
                    : '');
        }

        let historialHtml = '';
        if (historial.length) {
            historialHtml = historial
                .slice(0, 5)
                .map((h) => {
                    const nn = NIVELES[h.nivel] || NIVELES.verde;
                    return (
                        '<div class="sem-hecho"><span class="punto" style="background:' +
                        nn.color +
                        '"></span>' +
                        '<span><b>' +
                        semEscape(nn.nombre) +
                        '</b> · ' +
                        semEscape(semFecha(h.creado_en)) +
                        (h.declarado_por ? ' · ' + semEscape(h.declarado_por) : '') +
                        '</span></div>'
                    );
                })
                .join('');
        } else {
            historialHtml =
                '<div class="sem-hecho"><span class="punto" style="background:#cbd5e1"></span><span>Sin cambios registrados todavía.</span></div>';
        }

        return (
            '<div class="sem-caja sem-form">' +
            '<div class="sem-cab" style="background:linear-gradient(90deg,' +
            n.color +
            ',' +
            n.color2 +
            ')">' +
            '<span class="sem-luz"></span>' +
            '<div><h2>' +
            n.nombre +
            '</h2><p>' +
            semEscape(n.frase) +
            '</p></div>' +
            '<button type="button" class="sem-x" id="sem-cerrar" aria-label="Cerrar"><i class="fas fa-xmark"></i></button>' +
            '</div>' +
            '<div class="sem-cuerpo">' +
            '<div class="sem-datos">' +
            datos +
            '</div>' +
            (!esBase && estado.motivo ? '<p class="sem-motivo">' + semEscape(estado.motivo) + '</p>' : '') +
            '<p class="sem-sub">Qué hacer en este nivel</p>' +
            '<ul class="sem-pasos">' +
            n.pasos
                .map((p) => '<li><i class="fas fa-circle-check"></i><span>' + semEscape(p) + '</span></li>')
                .join('') +
            '</ul>' +
            '<p class="sem-sub">Últimos cambios</p>' +
            '<div class="sem-hist">' +
            historialHtml +
            '</div>' +
            '<div class="sem-acciones">' +
            (semPuedeVerBoton()
                ? '<button type="button" class="sem-btn principal" id="sem-declarar"><i class="fas fa-triangle-exclamation"></i> Declarar alerta</button>'
                : '') +
            (semPuedeNormalizar()
                ? '<button type="button" class="sem-btn" id="sem-normalizar"><i class="fas fa-circle-check"></i> Cerrar alerta</button>'
                : '') +
            '<button type="button" class="sem-btn" id="sem-volver-cerrar"><i class="fas fa-xmark"></i> Cerrar</button>' +
            '</div>' +
            (origen === 'local'
                ? '<p class="sem-nota"><i class="fas fa-wifi"></i> Sin conexión con la base: este nivel se guarda en el equipo. Ejecuta sql/semaforo.sql para compartirlo con todos.</p>'
                : '<p class="sem-nota">Actualizado desde la base compartida · COS 994640405 / 987961673 / 987514910 · Jefe SST 994640311</p>') +
            '</div>' +
            '</div>'
        );
    }

    function semHtmlDeclarar() {
        const marcada = !!(panel.querySelector('#sem-guardia') && panel.querySelector('#sem-guardia').checked);

        const opciones = semNivelesAlerta()
            .map((clave) => {
                const n = NIVELES[clave];
                const permitido = semPuedeDeclarar(clave, marcada);
                return (
                    '<button type="button" class="sem-opcion' +
                    (clave === estado.nivel ? ' elegido' : '') +
                    '" ' +
                    'data-nivel="' +
                    clave +
                    '"' +
                    (permitido ? '' : ' disabled') +
                    '>' +
                    '<span class="punto" style="background:' +
                    n.color +
                    '"></span>' +
                    '<span><b>' +
                    n.nombre +
                    '</b><small>' +
                    semEscape(n.frase) +
                    '</small></span>' +
                    '</button>'
                );
            })
            .join('');

        const avisoBajar =
            estado.nivel === 'naranja' || estado.nivel === 'rojo'
                ? '<label class="sem-check"><input type="checkbox" id="sem-verifico"> Verifiqué en campo (obligatorio si bajas de nivel)</label>'
                : '';

        return (
            '<div class="sem-caja sem-form">' +
            '<div class="sem-cab" style="background:#0f172a">' +
            '<span class="sem-luz"></span>' +
            '<div><h2>Declarar alerta</h2><p>Queda registrado con tu nombre y la hora</p></div>' +
            '<button type="button" class="sem-x" id="sem-volver" aria-label="Volver"><i class="fas fa-arrow-left"></i></button>' +
            '</div>' +
            '<div class="sem-cuerpo">' +
            '<p class="sem-sub">Estado actual: ' +
            NIVELES[estado.nivel].nombre +
            '</p>' +
            '<div class="sem-opciones" id="sem-opciones">' +
            opciones +
            '</div>' +
            '<p class="sem-sub">Motivo (obligatorio)</p>' +
            '<textarea id="sem-motivo" maxlength="400" placeholder="Ej.: quebrada Rinconada-Choque cargada de abundante agua a las 14:20; reporte de Administración 1 y Seguridad Patrimonial."></textarea>' +
            (rol === 'sst'
                ? '<label class="sem-check"><input type="checkbox" id="sem-guardia"> Declaro en calidad de guardia (feriado o fin de semana)</label>'
                : '') +
            avisoBajar +
            '<p class="sem-error" id="sem-error"></p>' +
            '<div class="sem-acciones">' +
            '<button type="button" class="sem-btn" id="sem-cancelar">Cancelar</button>' +
            '<button type="button" class="sem-btn principal" id="sem-guardar"><i class="fas fa-check"></i> Confirmar y publicar</button>' +
            '</div>' +
            '<p class="sem-nota">' +
            (rol === 'gerencia'
                ? 'Como gerencia puedes declarar cualquier nivel de alerta, incluido el rojo.'
                : rol === 'sst'
                  ? 'Como Jefe de Seguridad Industrial puedes declarar amarillo; naranja solo como guardia; el rojo lo declara el Coordinador General.'
                  : 'No tienes permiso para declarar alertas.') +
            ' El verde no se declara: es el estado normal.' +
            '</p>' +
            '</div>' +
            '</div>'
        );
    }

    /* Cerrar la alerta devuelve el semáforo a verde: no es declarar un nivel */
    function semHtmlNormalizar() {
        return (
            '<div class="sem-caja sem-form">' +
            '<div class="sem-cab" style="background:linear-gradient(90deg,' +
            NIVELES.verde.color +
            ',' +
            NIVELES.verde.color2 +
            ')">' +
            '<span class="sem-luz"></span>' +
            '<div><h2>Cerrar alerta</h2><p>Volver a vigilancia normal (verde)</p></div>' +
            '<button type="button" class="sem-x" id="sem-volver" aria-label="Volver"><i class="fas fa-arrow-left"></i></button>' +
            '</div>' +
            '<div class="sem-cuerpo">' +
            '<p class="sem-sub">Nivel actual: ' +
            NIVELES[estado.nivel].nombre +
            '</p>' +
            '<p class="sem-motivo">El semáforo vuelve a VERDE, que es el estado base. Queda registrado quién cierra la alerta, a qué hora y con qué verificación.</p>' +
            '<p class="sem-sub">Verificación (obligatoria)</p>' +
            '<textarea id="sem-motivo" maxlength="400" placeholder="Ej.: quebrada Rinconada-Choque sin agua a las 06:40; verificado por Administración 1 y Seguridad Patrimonial."></textarea>' +
            '<label class="sem-check"><input type="checkbox" id="sem-verifico"> Verifiqué en campo que el riesgo cesó</label>' +
            '<p class="sem-error" id="sem-error"></p>' +
            '<div class="sem-acciones">' +
            '<button type="button" class="sem-btn" id="sem-cancelar">Cancelar</button>' +
            '<button type="button" class="sem-btn principal" id="sem-guardar"><i class="fas fa-circle-check"></i> Cerrar alerta</button>' +
            '</div>' +
            '</div>' +
            '</div>'
        );
    }

    function semEngancharDetalle() {
        const cerrar = panel.querySelector('#sem-cerrar');
        if (cerrar) cerrar.addEventListener('click', semCerrarPanel);
        const volver = panel.querySelector('#sem-volver-cerrar');
        if (volver) volver.addEventListener('click', semCerrarPanel);
        const declarar = panel.querySelector('#sem-declarar');
        if (declarar)
            declarar.addEventListener('click', () => {
                vista = 'declarar';
                semPintarPanel();
            });
        const normalizar = panel.querySelector('#sem-normalizar');
        if (normalizar)
            normalizar.addEventListener('click', () => {
                vista = 'normalizar';
                semPintarPanel();
            });
    }

    function semEngancharNormalizar() {
        const volver = panel.querySelector('#sem-volver');
        if (volver)
            volver.addEventListener('click', () => {
                vista = 'detalle';
                semPintarPanel();
            });
        const cancelar = panel.querySelector('#sem-cancelar');
        if (cancelar)
            cancelar.addEventListener('click', () => {
                vista = 'detalle';
                semPintarPanel();
            });

        const guardar = panel.querySelector('#sem-guardar');
        if (guardar) {
            guardar.addEventListener('click', async () => {
                const motivo = (panel.querySelector('#sem-motivo').value || '').trim();
                const verifico = !!panel.querySelector('#sem-verifico').checked;
                const err = panel.querySelector('#sem-error');
                const fallo = (texto) => {
                    if (!err) return;
                    err.textContent = texto;
                    err.classList.add('visible');
                };

                if (!semPuedeNormalizar()) return fallo('No tienes autoridad para cerrar esta alerta.');
                if (!verifico) return fallo('Marca que verificaste en campo.');
                if (!motivo || motivo.length < 8) return fallo('Escribe la verificación (mínimo 8 caracteres).');

                guardar.disabled = true;
                guardar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cerrando…';
                await semGuardar('verde', motivo, false, true);
                vista = 'detalle';
                semPintarPanel();
            });
        }
    }

    function semEngancharDeclarar() {
        const volver = panel.querySelector('#sem-volver');
        if (volver)
            volver.addEventListener('click', () => {
                vista = 'detalle';
                semPintarPanel();
            });
        const cancelar = panel.querySelector('#sem-cancelar');
        if (cancelar)
            cancelar.addEventListener('click', () => {
                vista = 'detalle';
                semPintarPanel();
            });

        const guardia = panel.querySelector('#sem-guardia');
        if (guardia) {
            guardia.addEventListener('change', () => {
                /* Repinta los botones: el permiso de naranja depende de la guardia */
                const marcado = guardia.checked;
                panel.querySelectorAll('.sem-opcion').forEach((b) => {
                    b.disabled = !semPuedeDeclarar(b.dataset.nivel, marcado);
                });
            });
        }

        const opciones = panel.querySelectorAll('.sem-opcion');
        opciones.forEach((b) => {
            b.addEventListener('click', () => {
                if (b.disabled) return;
                opciones.forEach((o) => o.classList.remove('elegido'));
                b.classList.add('elegido');
                const err = panel.querySelector('#sem-error');
                if (err) err.classList.remove('visible');
            });
        });

        const guardar = panel.querySelector('#sem-guardar');
        if (guardar) {
            guardar.addEventListener('click', async () => {
                const elegido = panel.querySelector('.sem-opcion.elegido');
                const motivo = (panel.querySelector('#sem-motivo').value || '').trim();
                const err = panel.querySelector('#sem-error');
                const esGuardia = !!(
                    panel.querySelector('#sem-guardia') && panel.querySelector('#sem-guardia').checked
                );
                const verifico = !!(
                    panel.querySelector('#sem-verifico') && panel.querySelector('#sem-verifico').checked
                );

                const fallo = (texto) => {
                    if (!err) return;
                    err.textContent = texto;
                    err.classList.add('visible');
                };

                if (!semPuedeVerBoton()) return fallo('Tu usuario no puede declarar alertas.');
                if (!elegido) return fallo('Elige el nivel de alerta.');
                if (!motivo || motivo.length < 8) return fallo('Escribe el motivo (mínimo 8 caracteres).');
                if (!semPuedeDeclarar(elegido.dataset.nivel, esGuardia))
                    return fallo('No tienes autoridad para ese nivel.');

                /* Bajar de nivel exige verificación en campo */
                const ordenNuevo = NIVELES[elegido.dataset.nivel].orden;
                const ordenActual = NIVELES[estado.nivel].orden;
                if (ordenNuevo < ordenActual && !verifico) {
                    return fallo('Para bajar de nivel marca que verificaste en campo.');
                }

                guardar.disabled = true;
                guardar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publicando…';
                await semGuardar(elegido.dataset.nivel, motivo, esGuardia, verifico);
                vista = 'detalle';
                semPintarPanel();
            });
        }
    }

    /* ------------------------------------------------------------
       Ciclo de vida
    ------------------------------------------------------------ */
    async function semIniciar() {
        usuario = semLeerUsuario();
        rol = semRol(usuario);
        cliente = semCliente();

        await semCargar();

        const cabecera = document.querySelector('.top-bar');
        const barra = document.querySelector('.barra');
        if (barra) {
            /* Mapa: se rodea la barra y el semáforo va en el espacio libre */
            semMontarMapaBarra(barra);
        } else if (cabecera) {
            /* Portal del plan: encabezado con el color del nivel */
            semMontarEncabezado(cabecera);
        } else {
            /* Ingreso de conductores: banda fija arriba */
            semMontarBanda();
            document.body.classList.add('sem-pagina-centrada');
        }

        semPintar();

        window.addEventListener('resize', semAjustarAlto);
        window.addEventListener('orientationchange', () => setTimeout(semAjustarAlto, 250));

        setInterval(async () => {
            if (document.hidden) return;
            await semCargar();
            semPintar();
            if (panel && panel.classList.contains('abierto') && vista === 'detalle') semPintarPanel();
        }, REFRESCO_MS);

        document.addEventListener('visibilitychange', async () => {
            if (document.hidden) return;
            await semCargar();
            semPintar();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            semEstilos();
            semIniciar();
        });
    } else {
        semEstilos();
        semIniciar();
    }
})();
