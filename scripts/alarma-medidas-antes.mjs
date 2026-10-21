/**
 * ALARMA DE ACTIVIDADES VENCIDAS - MEDIDAS ANTES (PLAN DE CONTINGENCIA)
 * ----------------------------------------------------------------------
 * Revisa las actividades de "medidas_antes" cuyo periodo (DD/MM/AAAA) ya
 * vencio y que no esten finalizadas. Agrupa por AREA (seccion) y manda
 * UNA sola alarma al celular registrado de esa area.
 *
 * Se ejecuta desde GitHub Actions todos los dias a las 13:00 UTC
 * (08:00 en Peru).
 *
 * Uso:
 *   node scripts/alarma-medidas-antes.mjs             -> envia
 *   node scripts/alarma-medidas-antes.mjs --dry-run   -> solo simula
 *   node scripts/alarma-medidas-antes.mjs --only "Ingeniería Agrícola"
 *   node scripts/alarma-medidas-antes.mjs --limit 3
 */

const PLAN_URL = 'https://bfhfnldqwsrcpsdqpyat.supabase.co';
const PLAN_KEY = 'sb_publishable_z-jW4WrGLq7wEhCI_CW3Ig_vQZwtOMh';
const PUSH_FN = `${PLAN_URL}/functions/v1/send-push-notification`;

const DRY = process.argv.includes('--dry-run');

function arg(nombre) {
  const i = process.argv.indexOf(nombre);
  return i !== -1 ? process.argv[i + 1] : null;
}
const ONLY = arg('--only');
const LIMIT = arg('--limit') ? parseInt(arg('--limit'), 10) : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function norm(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
}

async function getJson(url) {
  const res = await fetch(url, {
    headers: { apikey: PLAN_KEY, Authorization: `Bearer ${PLAN_KEY}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Convierte DD/MM/AAAA (o AAAA-MM-DD) a dias de atraso. null si no es fecha. */
function diasVencido(periodo) {
  if (!periodo) return null;

  let y = null, m = null, d = null;
  const lat = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(periodo);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(periodo);
  if (lat) { d = +lat[1]; m = +lat[2]; y = +lat[3]; }
  else if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3]; }
  else return null;

  const hoyPeru = new Date(Date.now() - 5 * 3600000);
  const hoyUTC = Date.UTC(hoyPeru.getUTCFullYear(), hoyPeru.getUTCMonth(), hoyPeru.getUTCDate());
  const finUTC = Date.UTC(y, m - 1, d);

  const dias = Math.round((hoyUTC - finUTC) / 86400000);
  return dias > 0 ? dias : null;
}

async function main() {
  console.log(`Modo: ${DRY ? 'SIMULACION (no envia nada)' : 'ENVIO REAL'}`);

  // 1) Actividades de medidas_antes
  const medidas = await getJson(
    `${PLAN_URL}/rest/v1/medidas_antes?select=id,actividad,periodo,area,estado&limit=2000`
  );
  console.log(`Actividades en Medidas Antes: ${medidas.length}`);

  // 2) Celulares registrados (user_id = seccion)
  const subs = await getJson(
    `${PLAN_URL}/rest/v1/push_subscriptions?select=user_id,token&limit=2000`
  );
  const tokensPorArea = new Map();
  for (const s of subs) {
    const k = norm(s.user_id);
    if (!k || !s.token) continue;
    if (!tokensPorArea.has(k)) tokensPorArea.set(k, new Set());
    tokensPorArea.get(k).add(s.token);
  }
  console.log(`Celulares registrados: ${subs.length} en ${tokensPorArea.size} areas`);

  // 3) Agrupar vencidas por area
  const porArea = new Map();
  let sinFecha = 0;

  for (const m of medidas) {
    if (norm(m.estado) === 'finalizado') continue;

    const dias = diasVencido(m.periodo);
    if (dias === null) { sinFecha++; continue; }

    const areas = norm(m.area).split('/').map((a) => a.trim()).filter(Boolean);
    for (const area of areas) {
      if (ONLY && norm(ONLY).toLowerCase() !== area.toLowerCase()) continue;
      if (!porArea.has(area)) porArea.set(area, []);
      porArea.get(area).push({ actividad: norm(m.actividad), periodo: norm(m.periodo), dias });
    }
  }

  console.log(`Areas con actividades vencidas: ${porArea.size} (sin fecha: ${sinFecha})`);

  const resumen = { enviados: 0, sinCelular: [], errores: [] };

  for (const [area, items] of porArea) {
    const clave = area;
    if (LIMIT !== null && resumen.enviados >= LIMIT) break;

    if (!tokensPorArea.has(clave)) {
      resumen.sinCelular.push(area);
      continue;
    }

    const maxDias = Math.max(...items.map((i) => i.dias));
    const titulo = `\u26A0\uFE0F ACTIVIDADES VENCIDAS (${items.length})`;

    const lineas = items
      .slice()
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 5)
      .map((i) => `\u2022 ${i.actividad} \u00B7 ${i.periodo} \u00B7 ${i.dias} d\u00EDa${i.dias === 1 ? '' : 's'}`);
    const resto = items.length > 5 ? `\n+${items.length - 5} m\u00E1s` : '';

    const cuerpo =
      `\u00C1rea responsable: ${area}\n` +
      `${items.length} actividad${items.length === 1 ? '' : 'es'} vencida${items.length === 1 ? '' : 's'} \u00B7 ` +
      `hasta ${maxDias} d\u00EDa${maxDias === 1 ? '' : 's'} de atraso\n` +
      lineas.join('\n') + resto;

    if (DRY) {
      console.log(`[SIMULA] ${area} <- ${cuerpo.replace(/\n/g, ' | ')}`);
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
        resumen.errores.push(`${area}: HTTP ${res.status}`);
        console.error(`ERROR ${area}: HTTP ${res.status} ${await res.text()}`);
      } else {
        resumen.enviados++;
        console.log(`OK ${area} (${items.length} actividad/es)`);
      }
    } catch (e) {
      resumen.errores.push(`${area}: ${e.message}`);
      console.error(`ERROR ${area}:`, e.message);
    }

    await sleep(300);
  }

  console.log('\n===== RESUMEN =====');
  console.log(`Alarmas ${DRY ? 'simuladas' : 'enviadas'}: ${resumen.enviados}`);
  console.log(`Areas sin celular registrado (${resumen.sinCelular.length}): ${resumen.sinCelular.join(', ') || '-'}`);
  console.log(`Actividades sin fecha valida: ${sinFecha}`);
  if (resumen.errores.length) console.log(`Errores: ${resumen.errores.join(' | ')}`);
}

main().catch((e) => {
  console.error('FALLO FATAL:', e);
  process.exit(1);
});
