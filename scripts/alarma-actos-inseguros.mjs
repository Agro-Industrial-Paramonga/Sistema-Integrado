/* ============================================================
   RECORDATORIO DIARIO DE ACTOS INSEGUROS ABIERTOS
   ------------------------------------------------------------
   Se ejecuta desde GitHub Actions todos los dias a las
   15:00 UTC (10:00 a.m. hora Peru).

   Logica:
     1. Lee de la base de HALLAZGOS los registros con
        ESTADO = 'Abierto' y DESC_EVENTO = 'Acto Subestandar'.
     2. Lee los JEFES (usuarios que no son gerentes ni admin
        y tienen desc_seccion).
     3. Busca el token del celular del jefe en la base de
        NOTIFICACIONES, bajo la clave  jefe:<DESC_SECCION>.
     4. Envia UNA alarma por cada hallazgo abierto.

   Secciones sin jefe registrado se omiten (por decision).
   Si un jefe no tiene el celular registrado, se omite y se
   informa en el resumen.

   Uso:
     node scripts/alarma-actos-inseguros.mjs            -> envia
     node scripts/alarma-actos-inseguros.mjs --dry-run  -> solo simula
   ============================================================ */

const HALLAZGOS_URL = 'https://bfwyedbiguytlrooiglj.supabase.co';
const HALLAZGOS_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmd3llZGJpZ3V5dGxyb29pZ2xqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2Nzc5MzAsImV4cCI6MjEwNTI1MzkzMH0.5m5ZzlZ88FONEp1NDwhLXts3YToEk1AIA-AaCW-R6RQ';

const PUSH_URL = 'https://bfhfnldqwsrcpsdqpyat.supabase.co';
const PUSH_KEY = 'sb_publishable_z-jW4WrGLq7wEhCI_CW3Ig_vQZwtOMh';
const PUSH_FN  = `${PUSH_URL}/functions/v1/send-push-notification`;

const EVENTO = 'Acto Subestandar';
const PREFIJO = 'jefe:';
const DRY = process.argv.includes('--dry-run');

/* --- Opciones de prueba (para no esperar a las 10:00) ---
   --test-user "jefe:DPTO. DE ELABORACION"  envia UNA alarma de muestra
   --only "DPTO. DE ELABORACION"            limita a una seccion
   --limit 3                                maximo de alarmas
*/
function arg(nombre) {
  const i = process.argv.indexOf(nombre);
  return i !== -1 ? process.argv[i + 1] : null;
}
const TEST_USER = arg('--test-user');
const ONLY = arg('--only');
const LIMIT = arg('--limit') ? parseInt(arg('--limit'), 10) : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Colapsa espacios repetidos y recorta: los datos traen dobles espacios. */
function norm(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
}

async function getJson(url, key) {
  const res = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

function diasAbierto(fecha) {
  if (!fecha) return null;
  let d = null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (iso) d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  else {
    const lat = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(fecha);
    if (lat) d = new Date(Date.UTC(+lat[3], +lat[2] - 1, +lat[1]));
  }
  if (!d || isNaN(d)) return null;
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
  return dias >= 0 ? dias : null;
}

async function main() {
  console.log(`Modo: ${DRY ? 'SIMULACION (no envia nada)' : 'ENVIO REAL'}`);

  // --- Prueba directa a un solo destinatario ---
  if (TEST_USER) {
    const cuerpo = 'Prueba del recordatorio diario de actos inseguros. Si ves esta alarma, el envio funciona.';
    const titulo = '⚠️ PRUEBA · ACTO INSEGURO ABIERTO';
    console.log(`Destinatario de prueba: ${TEST_USER}`);
    if (DRY) {
      console.log(`[SIMULA] alarma de prueba -> ${TEST_USER}`);
      return;
    }
    const res = await fetch(PUSH_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: titulo, body: cuerpo, userId: TEST_USER }),
    });
    console.log(`Envio -> HTTP ${res.status} ${await res.text()}`);
    return;
  }

  // 1) Hallazgos abiertos de tipo acto inseguro
  const hallazgos = await getJson(
    `${HALLAZGOS_URL}/rest/v1/hallazgos?select=COD_HALLAZGO,DESC_SECCION,FECHA_ACONTECIMIENTO,ACONTECIMIENTO,descripcion_acto` +
      `&ESTADO=eq.Abierto&DESC_EVENTO=eq.${encodeURIComponent(EVENTO)}&order=DESC_SECCION`,
    HALLAZGOS_KEY
  );
  console.log(`Hallazgos abiertos (${EVENTO}): ${hallazgos.length}`);

  // 2) Jefes por seccion
  const jefes = await getJson(
    `${HALLAZGOS_URL}/rest/v1/gerencias_acceso?select=nombre,desc_seccion&es_gerente=eq.false&es_admin=eq.false&desc_seccion=not.is.null`,
    HALLAZGOS_KEY
  );
  const jefePorSeccion = new Map();
  for (const j of jefes) {
    const k = norm(j.desc_seccion);
    if (!k) continue;
    if (!jefePorSeccion.has(k)) jefePorSeccion.set(k, []);
    jefePorSeccion.get(k).push(norm(j.nombre));
  }
  console.log(`Jefes con seccion: ${jefePorSeccion.size}`);

  // 3) Tokens registrados
  const subs = await getJson(
    `${PUSH_URL}/rest/v1/push_subscriptions?select=user_id,token&user_id=like.${encodeURIComponent(PREFIJO + '*')}`,
    PUSH_KEY
  );
  const tokensPorClave = new Map();
  for (const s of subs) {
    const k = norm(s.user_id);
    if (!k || !s.token) continue;
    if (!tokensPorClave.has(k)) tokensPorClave.set(k, new Set());
    tokensPorClave.get(k).add(s.token);
  }
  console.log(`Dispositivos de jefes registrados: ${subs.length} en ${tokensPorClave.size} secciones`);

  // 4) Envio
  const resumen = { enviados: 0, sinJefe: [], sinDispositivo: [], errores: [] };
  const detalleSinJefe = new Set();
  const detalleSinDispositivo = new Set();

  for (const h of hallazgos) {
    const seccion = norm(h.DESC_SECCION);
    const clave = PREFIJO + seccion;
    const cod = norm(h.COD_HALLAZGO) || 'sin codigo';

    if (ONLY && norm(ONLY) !== seccion) continue;
    if (LIMIT !== null && resumen.enviados >= LIMIT) break;

    if (!jefePorSeccion.has(seccion)) {
      detalleSinJefe.add(seccion || '(sin seccion)');
      continue;
    }
    if (!tokensPorClave.has(clave)) {
      detalleSinDispositivo.add(seccion);
      continue;
    }

    const jefe = jefePorSeccion.get(seccion)[0];
    const dias = diasAbierto(h.FECHA_ACONTECIMIENTO);
    const desc = norm(h.descripcion_acto || h.ACONTECIMIENTO).slice(0, 120);

    const titulo = '⚠️ ACTO INSEGURO ABIERTO';
    const cuerpo =
      `${seccion} · ${cod}` +
      (dias !== null ? ` · ${dias} día${dias === 1 ? '' : 's'} abierto` : '') +
      (desc ? `\n${desc}` : '');

    if (DRY) {
      console.log(`[SIMULA] ${jefe} <- ${cuerpo.replace(/\n/g, ' | ')}`);
      resumen.enviados++;
      continue;
    }

    try {
      const res = await fetch(PUSH_FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: titulo, body: cuerpo, userId: clave }),
      });
      if (!res.ok) {
        resumen.errores.push(`${cod}: HTTP ${res.status}`);
        console.error(`ERROR ${cod}: HTTP ${res.status} ${await res.text()}`);
      } else {
        resumen.enviados++;
        console.log(`OK ${cod} -> ${jefe} (${seccion})`);
      }
    } catch (e) {
      resumen.errores.push(`${cod}: ${e.message}`);
      console.error(`ERROR ${cod}:`, e.message);
    }
    await sleep(300);
  }

  resumen.sinJefe = [...detalleSinJefe];
  resumen.sinDispositivo = [...detalleSinDispositivo];

  console.log('\n===== RESUMEN =====');
  console.log(`Alarmas ${DRY ? 'simuladas' : 'enviadas'}: ${resumen.enviados}`);
  console.log(`Secciones omitidas por no tener jefe (${resumen.sinJefe.length}): ${resumen.sinJefe.join(', ') || '-'}`);
  console.log(`Secciones omitidas por jefe sin celular registrado (${resumen.sinDispositivo.length}): ${resumen.sinDispositivo.join(', ') || '-'}`);
  if (resumen.errores.length) console.log(`Errores (${resumen.errores.length}): ${resumen.errores.join(' | ')}`);

  // Resumen legible en la pestana del workflow
  if (process.env.GITHUB_STEP_SUMMARY) {
    const fs = await import('node:fs');
    const lineas = [
      `### Recordatorio de actos inseguros (${DRY ? 'simulación' : 'envío'})`,
      '',
      `- Hallazgos abiertos: **${hallazgos.length}**`,
      `- Alarmas ${DRY ? 'simuladas' : 'enviadas'}: **${resumen.enviados}**`,
      `- Secciones sin jefe: ${resumen.sinJefe.length ? resumen.sinJefe.join(', ') : 'ninguna'}`,
      `- Jefes sin celular registrado: ${resumen.sinDispositivo.length ? resumen.sinDispositivo.join(', ') : 'ninguno'}`,
      resumen.errores.length ? `- Errores: ${resumen.errores.join(' | ')}` : '',
    ];
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lineas.join('\n') + '\n');
  }
}

main().catch((e) => {
  console.error('FALLO FATAL:', e);
  process.exit(1);
});
