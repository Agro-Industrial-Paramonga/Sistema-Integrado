/* ============================================================
   send-push-notification
   Manda la alarma a los celulares: FCM (Android/web) y los
   webhooks de NotiAlarm (iPhone).

   Sin imports a proposito: se despliega con la Management API
   enviando el codigo como body, y esa via no resuelve imports
   remotos (falla con BOOT_ERROR). Todo va por fetch contra
   PostgREST y FCM, que son HTTP puro.
   ============================================================ */

const FCM_PROJECT_ID    = Deno.env.get('FCM_PROJECT_ID')!;
const FCM_CLIENT_EMAIL  = Deno.env.get('FCM_CLIENT_EMAIL')!;
const FCM_PRIVATE_KEY   = Deno.env.get('FCM_PRIVATE_KEY')!.replace(/\\n/g, '\n');
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const REST = SUPABASE_URL + '/rest/v1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const headersRest: Record<string, string> = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
  'Content-Type': 'application/json'
};

async function rpc(nombre: string, args: unknown): Promise<any> {
  const res = await fetch(REST + '/rpc/' + nombre, {
    method: 'POST',
    headers: headersRest,
    body: JSON.stringify(args)
  });
  if (!res.ok) throw new Error(nombre + ': ' + res.status + ' ' + (await res.text()));
  return await res.json();
}

async function tabla(ruta: string): Promise<any[]> {
  const res = await fetch(REST + '/' + ruta, { headers: headersRest });
  if (!res.ok) throw new Error(ruta + ': ' + res.status + ' ' + (await res.text()));
  return await res.json();
}

function base64url(data: Uint8Array | string): string {
  let str = typeof data === 'string' ? data : String.fromCharCode(...data);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    'pkcs8', binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: FCM_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };

  const encoder = new TextEncoder();
  const unsigned = base64url(encoder.encode(JSON.stringify(header))) + '.' +
                   base64url(encoder.encode(JSON.stringify(payload)));

  const key = await importPrivateKey(FCM_PRIVATE_KEY);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', key, encoder.encode(unsigned)
  );

  const jwt = unsigned + '.' + base64url(new Uint8Array(signature));

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  const data = await res.json();
  if (!data.access_token) {
    throw new Error('No se pudo obtener access token: ' + JSON.stringify(data));
  }
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { title, body, userId, token, excluir, tipo, webhook, probar, soloCuerpo, alarma } = await req.json();

    // ============================================================
    // 0. Prueba suelta de una URL de NotiAlarm (boton "Probar" del panel).
    //    No consulta destinatarios, no manda FCM y no toca la base:
    //    solo dice si la URL contesto. El texto lleva la hora para que
    //    NotiAlarm no lo tome como repetido y lo descarte.
    // ============================================================
    if (probar) {
      const url = String(webhook || '').trim();
      if (!/^https:\/\//i.test(url)) {
        return new Response(JSON.stringify({ ok: false, motivo: 'url_invalida' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'PRUEBA ' + new Date().toISOString().slice(11, 19) + ' - ' + (title || 'Sistema Integrado')
          })
        });
        return new Response(JSON.stringify({ ok: r.ok, estado: r.status }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, motivo: 'sin_conexion',
          detalle: (err as Error).message }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ============================================================
    // 1. Obtener tokens del destinatario + webhooks globales de iPhone
    //
    // Quien recibe lo decide la base, no este archivo: la funcion
    // destinatarios_push() solo devuelve jefes con sesion abierta,
    // deja fuera a quien tenga el switch verde/rojo en rojo, y —si el
    // envio trae "alarma"— solo a quien tenga ESA casilla encendida.
    //  - con "tipo" explicito  -> solo ese canal
    //  - sin "tipo" ni userId  -> jefes (alarma general)
    //  - con userId            -> ese usuario, del canal que sea
    //  - con "alarma"          -> solo los suscritos a esa alarma
    // ============================================================
    const canal = (tipo === 'jefe' || tipo === 'conductor')
      ? tipo
      : (userId ? null : 'jefe');

    const todos = await rpc('destinatarios_push', { p_tipo: canal, p_alarma: alarma || null });

    // Comparacion sin importar mayusculas, tildes ni espacios sobrantes
    const norm = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

    // Un usuario puede cubrir varias areas: "Operaciones Agricolas / Cosecha"
    const partes = (v: unknown) => String(v ?? '').split('/').map(norm).filter(Boolean);

    // Si el celular quedo registrado con el NOMBRE de la persona,
    // se traduce a su seccion usando la tabla usuarios.
    let usuarios: any[] = [];
    try {
      usuarios = await tabla('usuarios?select=area,seccion');
    } catch (e) {
      console.error('usuarios:', (e as Error).message);
    }

    const mapaSeccion = new Map<string, string[]>();
    for (const u of usuarios || []) {
      const clave = norm(u.area);
      const secciones = partes(u.seccion);
      if (clave && secciones.length) mapaSeccion.set(clave, secciones);
    }

    const clavesDe = (fila: any): string[] => {
      const propias = partes(fila.user_id);
      const traducidas = propias.flatMap((p) => mapaSeccion.get(p) || []);
      return [...new Set([...propias, ...traducidas])];
    };

    // Envio directo a un solo celular (alerta a una unidad concreta)
    if (token) {
      if (excluir && token === excluir) {
        return new Response(JSON.stringify({ ok: true, fcm_enviados: 0, notialarm_disparados: 0, total_subs: 0,
          nota: 'El destinatario es el mismo dispositivo que envia' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Celular silenciado desde el panel (switch rojo): no recibe nada.
      // La lista de destinatarios ya lo excluye, pero este envio directo
      // por token no pasa por ahi, asi que se pregunta a la base.
      let silenciado = false;
      try {
        silenciado = (await rpc('token_silenciado', { p_token: token })) === true;
      } catch (e) {
        console.error('silencio:', (e as Error).message);
      }

      if (silenciado) {
        return new Response(JSON.stringify({ ok: true, fcm_enviados: 0, notialarm_disparados: 0,
          total_subs: 0, nota: 'celular silenciado desde el panel' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const soloEse = (todos || []).filter((s: any) => s.token === token);
      const lista = soloEse.length ? soloEse : [{ token, notialarm_webhook: null }];

      const accessTokenDirecto = await getAccessToken();
      let enviadosDirecto = 0;

      for (const s of lista) {
        if (!s.token) continue;
        const res = await fetch(
          `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessTokenDirecto}` },
            body: JSON.stringify({
              message: { token: s.token, data: { titulo: title || 'ALERTA', cuerpo: body || '', alarma: 'true' },
                android: { priority: 'high', ttl: '3600s' } }
            })
          }
        );
        if (res.ok) enviadosDirecto++;
      }

      return new Response(JSON.stringify({ ok: true, fcm_enviados: enviadosDirecto, notialarm_disparados: 0, total_subs: lista.length }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const subsFiltrados = (todos || []).filter((s: any) => !excluir || s.token !== excluir);

    // El rol ya NO decide quien recibe: eso lo resuelve la casilla de cada
    // persona en suscripciones_alarma, dentro de destinatarios_push().
    // Aqui solo queda el filtro por area destinataria cuando el envio
    // lleva userId (alarma de una medida).
    //
    // Compatibilidad: mientras algun equipo tenga abierta una version vieja
    // del portal (que no manda "alarma"), se mantiene la regla antigua de no
    // enviar la medida a los de rol 'area'. En cuanto la version nueva este
    // publicada, todos mandan "alarma" y esa regla deja de aplicarse.
    const esRolArea = (s: any) => norm(s.rol) === 'area';

    const subs = userId
      ? subsFiltrados.filter((s: any) => {
          if (!alarma && esRolArea(s)) return false;
          const buscado = norm(userId);
          const claves = clavesDe(s);
          return claves.includes(buscado) || claves.includes('__global__');
        })
      : subsFiltrados;

    let enviados = 0;
    const tituloFinal = title || '🚨 ALERTA DE HUAYCO';
    const cuerpoFinal = body  || 'Gerencia General ha autorizado el inicio de los planes de acción.';

    // ============================================================
    // 2. Enviar notificaciones FCM (Android)
    // ============================================================
    if (subs && subs.length > 0) {
      const accessToken = await getAccessToken();

      for (const s of subs) {
        if (!s.token) continue;
        const res = await fetch(
          `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
              message: {
                token: s.token,
                data: {
                  titulo: tituloFinal,
                  cuerpo: cuerpoFinal,
                  alarma: 'true'
                },
                android: {
                  priority: 'high',
                  ttl: '3600s'
                },
                webpush: {
                  headers: { Urgency: 'high' }
                }
              }
            })
          }
        );
        const data = await res.json();
        if (res.ok) enviados++;
        else console.error('FCM error:', data);
      }
    }

    // ============================================================
    // 3. Disparar alarma en TODOS los iPhones con NotiAlarm
    //    (incluye los webhooks globales, con user_id nulo)
    // ============================================================
    const webhooksUnicos = [...new Set(
      (subs || [])
        .map((s: any) => s.notialarm_webhook)
        .filter((w: string) => w && w.trim() !== '')
    )];

    let notialarmCount = 0;

    for (const webhook of webhooksUnicos) {
      try {
        const respNotiAlarm = await fetch(webhook as string, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({
            // NotiAlarm lee alert_tag, tag, message o title (en ese orden).
            // Con soloCuerpo llega unicamente el texto que se lee en Android;
            // sin el, titulo y detalle van en la misma linea.
            // El separador va en ASCII a proposito: el guion largo se corrompia
            // al desplegar y llegaba basura a la pantalla del iPhone.
            message: (soloCuerpo && cuerpoFinal)
              ? cuerpoFinal
              : (cuerpoFinal && cuerpoFinal !== tituloFinal
                  ? tituloFinal + ' - ' + cuerpoFinal
                  : tituloFinal),
            title: tituloFinal
          })
        });

        if (respNotiAlarm.ok) {
          notialarmCount++;
        } else {
          console.error('NotiAlarm error:', await respNotiAlarm.text());
        }
      } catch (err) {
        console.error('Error de conexion con NotiAlarm:', err);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      fcm_enviados: enviados,
      notialarm_disparados: notialarmCount,
      total_subs: subs?.length || 0,
      canal
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
