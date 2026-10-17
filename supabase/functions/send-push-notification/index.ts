import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FCM_PROJECT_ID    = Deno.env.get('FCM_PROJECT_ID')!;
const FCM_CLIENT_EMAIL  = Deno.env.get('FCM_CLIENT_EMAIL')!;
const FCM_PRIVATE_KEY   = Deno.env.get('FCM_PRIVATE_KEY')!.replace(/\\n/g, '\n');
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

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
    const { title, body, userId } = await req.json();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ============================================================
    // 1. Obtener todos los tokens y webhooks
    // ============================================================
    let query = supabase.from('push_subscriptions').select('token, notialarm_webhook');
    if (userId) query = query.eq('user_id', userId);

    const { data: subs, error } = await query;
    if (error) throw new Error('Error al leer tokens: ' + error.message);

    // ============================================================
    // 2. Enviar notificaciones FCM
    // ============================================================
    let enviados = 0;
    const tituloFinal = title || '🚨 ALERTA DE HUAYCO';
    const cuerpoFinal = body  || 'Gerencia General ha autorizado el inicio de los planes de acción.';

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

                // ============================================================
                // MENSAJE "URGENTE" (data-only)  <-- LO UNICO QUE CAMBIO
                // Asi Android entrega la alerta a la APP aunque el celular
                // este bloqueado o la app cerrada, y se dispara la ALARMA
                // a pantalla completa con sonido en bucle.
                // ============================================================
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
    // ============================================================
    const webhooksUnicos = [...new Set(
      (subs || [])
        .map(s => s.notialarm_webhook)
        .filter(w => w && w.trim() !== '')
    )];

    let notialarmCount = 0;

    for (const webhook of webhooksUnicos) {
      try {
        const respNotiAlarm = await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: tituloFinal,
            body: cuerpoFinal
          })
        });

        if (respNotiAlarm.ok) {
          notialarmCount++;
        } else {
          console.error('NotiAlarm error:', await respNotiAlarm.text());
        }
      } catch (err) {
        console.error('Error de conexión con NotiAlarm:', err);
      }
    }

    // ============================================================
    // 4. Respuesta final
    // ============================================================
    return new Response(JSON.stringify({
      ok: true,
      fcm_enviados: enviados,
      notialarm_disparados: notialarmCount,
      total_subs: subs?.length || 0
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
