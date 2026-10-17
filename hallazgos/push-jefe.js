/* ============================================================
   REGISTRO DE NOTIFICACIONES PARA JEFES
   ------------------------------------------------------------
   Guarda el token FCM del celular del jefe en el proyecto
   Supabase de notificaciones (el mismo que usa Plan de
   Contingencia), con el identificador:

       jefe:<DESC_SECCION>

   Ese identificador es el que busca el recordatorio diario de
   actos inseguros (GitHub Actions, 10:00 a.m. Peru).

   - Solo registra a usuarios que NO son gerentes ni admin y
     que tienen desc_seccion (es decir, jefes de departamento).
   - Solo funciona dentro de la APK (Capacitor); en navegador
     de escritorio no hace nada.
   ============================================================ */
(function () {
    'use strict';

    var PUSH_URL = 'https://bfhfnldqwsrcpsdqpyat.supabase.co';
    var PUSH_KEY = 'sb_publishable_z-jW4WrGLq7wEhCI_CW3Ig_vQZwtOMh';
    var PREFIJO  = 'jefe:';

    function esNativo() {
        return !!(window.Capacitor &&
                  typeof window.Capacitor.isNativePlatform === 'function' &&
                  window.Capacitor.isNativePlatform());
    }

    /* Devuelve el identificador del jefe, o null si no aplica. */
    function claveJefe(u) {
        if (!u) return null;
        if (u.es_gerente === true || u.esAdmin === true || u.es_admin === true) return null;
        if (!u.desc_seccion) return null;
        var seccion = String(u.desc_seccion).trim();
        if (!seccion) return null;
        return PREFIJO + seccion;
    }

    async function guardarToken(userId, token) {
        try {
            var base = PUSH_URL + '/rest/v1/push_subscriptions';
            var headers = {
                'apikey': PUSH_KEY,
                'Authorization': 'Bearer ' + PUSH_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            };

            var q = base + '?user_id=eq.' + encodeURIComponent(userId) +
                      '&token=eq.' + encodeURIComponent(token) + '&select=id';
            var existe = await fetch(q, { headers: headers });
            if (existe.ok) {
                var filas = await existe.json();
                if (filas && filas.length > 0) {
                    console.log('[push-jefe] Token ya registrado.');
                    return;
                }
            }

            var ins = await fetch(base, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ user_id: userId, token: token })
            });
            if (ins.ok) console.log('[push-jefe] Token registrado para ' + userId);
            else console.error('[push-jefe] Error al guardar token:', await ins.text());
        } catch (e) {
            console.error('[push-jefe] Error de red:', e);
        }
    }

    async function registrar(u) {
        var clave = claveJefe(u);
        if (!clave) return;
        if (!esNativo()) return;

        try {
            var plugins = window.Capacitor.Plugins || {};
            var Push = plugins.PushNotifications;
            if (!Push) {
                console.warn('[push-jefe] Plugin de notificaciones no disponible.');
                return;
            }

            var permiso = await Push.requestPermissions();
            if (permiso && permiso.receive === 'denied') {
                console.warn('[push-jefe] Permiso de notificaciones denegado.');
                return;
            }

            await Push.removeAllListeners();

            Push.addListener('registration', function (t) {
                if (t && t.value) guardarToken(clave, t.value);
            });

            Push.addListener('registrationError', function (err) {
                console.error('[push-jefe] Error de registro FCM:', err);
            });

            await Push.register();
        } catch (e) {
            console.error('[push-jefe] Error al registrar:', e);
        }
    }

    /* Se ejecuta tras el login y también si ya había sesión guardada. */
    function registrarDesdeSesion() {
        try {
            var raw = sessionStorage.getItem('usuario');
            if (!raw) return false;
            var u = JSON.parse(raw);
            if (!claveJefe(u)) return false;
            if (registrado) return true;
            registrado = true;
            registrar(u);
            return true;
        } catch (e) { return false; }
    }

    window.__registrarPushJefe = registrar;

    /* El botón de login se enlaza por referencia directa dentro de app.js,
       así que no podemos interceptarlo: observamos la sesión guardada. */
    var registrado = false;
    var intentos = 0;

    function vigilar() {
        if (registrado) return;
        intentos++;
        if (registrarDesdeSesion()) return;
        if (intentos > 900) return; // ~15 min y dejamos de mirar
        setTimeout(vigilar, 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', vigilar);
    } else {
        vigilar();
    }
})();
