package com.aipsa.sistema;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.JavascriptInterface;
import android.provider.Settings;
import android.Manifest;
import android.content.pm.PackageManager;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;

import androidx.activity.OnBackPressedCallback;

public class MainActivity extends BridgeActivity {

    private GeolocationPermissions.Callback callbackUbicacion;
    private String origenUbicacion;
    private static final int CODIGO_UBICACION = 4711;
    private static final int CODIGO_NOTIFICACIONES = 4712;
    private static final int CODIGO_CAMARA = 4713;
    private static final int CODIGO_FOTOS = 4714;

    /* Camara nativa: el WebView ignora el atributo capture de los
       <input type="file">, asi que la foto se toma aqui y se devuelve
       a la pagina como data URL. */
    private ActivityResultLauncher<Intent> camaraLauncher;
    private File camaraArchivo;

    private boolean tienePermisoUbicacion() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    /** Si hay un turno activo y falta el permiso de ubicacion, no deja usar la app. */
    /** Pide que Android no suspenda la app (envio cada 5 minutos). */
    private void pedirExencionBateria() {
        try {
            if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.M) return;

            android.os.PowerManager pm =
                    (android.os.PowerManager) getSystemService(POWER_SERVICE);
            if (pm == null || pm.isIgnoringBatteryOptimizations(getPackageName())) return;

            runOnUiThread(() -> new android.app.AlertDialog.Builder(this)
                    .setTitle("Permitir segundo plano")
                    .setMessage("Para que la ubicación se envíe cada 5 minutos aunque la app esté cerrada, permite que el sistema no la suspenda.")
                    .setPositiveButton("Permitir", (d1, w) -> {
                        try {
                            android.content.Intent i = new android.content.Intent(
                                    android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                            i.setData(android.net.Uri.parse("package:" + getPackageName()));
                            startActivity(i);
                        } catch (Exception e) {
                            try {
                                android.content.Intent i = new android.content.Intent(
                                        android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                                startActivity(i);
                            } catch (Exception e2) { e2.printStackTrace(); }
                        }
                    })
                    .setNegativeButton("Ahora no", null)
                    .show());
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void limpiarCacheSiCambioVersion(android.webkit.WebView webView) {
        try {
            int version = getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
            android.content.SharedPreferences prefs = getSharedPreferences("avisos", MODE_PRIVATE);
            if (prefs.getInt("cache_version", -1) == version) return;

            webView.clearCache(true);
            webView.clearHistory();
            prefs.edit().putInt("cache_version", version).apply();
            android.util.Log.i("MainActivity", "Cache del WebView limpiada para version " + version);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void pedirExencionBateriaDirecto() {
        try {
            android.content.Intent i = new android.content.Intent(
                    android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            i.setData(android.net.Uri.parse("package:" + getPackageName()));
            startActivity(i);
        } catch (Exception e) {
            try {
                startActivity(new android.content.Intent(
                        android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            } catch (Exception e2) { e2.printStackTrace(); }
        }
    }

    private boolean hayTurnoActivo() {
        android.content.SharedPreferences prefs = getSharedPreferences("ubicacion", MODE_PRIVATE);
        String usuario = prefs.getString("usuario", null);
        return usuario != null && !usuario.isEmpty();
    }

    /** Devuelve el primer permiso que falta, o null si ya estan todos. */
    private String permisoFaltante() {
        // 1) Ubicacion precisa
        boolean fina = androidx.core.content.ContextCompat.checkSelfPermission(this,
                android.Manifest.permission.ACCESS_FINE_LOCATION)
                == android.content.pm.PackageManager.PERMISSION_GRANTED;
        if (!fina) return "ubicacion";

        // 2) Interruptor de ubicacion del celular
        if (!ubicacionEncendida()) return "apagada";

        // 3) Ubicacion todo el tiempo
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            boolean fondo = androidx.core.content.ContextCompat.checkSelfPermission(this,
                    android.Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                    == android.content.pm.PackageManager.PERMISSION_GRANTED;
            if (!fondo) return "fondo";
        }

        // 4) Notificaciones
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            boolean notificaciones = androidx.core.content.ContextCompat.checkSelfPermission(this,
                    "android.permission.POST_NOTIFICATIONS")
                    == android.content.pm.PackageManager.PERMISSION_GRANTED;
            if (!notificaciones) return "notificaciones";
        }

        // 5) Alerta a pantalla completa (obligatorio desde Android 14)
        if (android.os.Build.VERSION.SDK_INT >= 34) {
            android.app.NotificationManager nm =
                    (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null && !nm.canUseFullScreenIntent()) return "pantalla_completa";
        }

        // 5b) Mostrar sobre otras apps: la alarma entra con el celular en uso
        if (!tieneSobreOtrasApps()) return "sobre_otras_apps";

        // 6) Exencion del ahorro de bateria
        try {
            android.os.PowerManager pm = (android.os.PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) return "bateria";
        } catch (Exception e) { }

        return null;
    }

    /**
     * Con turno activo no se entra sin los permisos que hacen falta:
     * ubicacion, "todo el tiempo", interruptor encendido, notificaciones,
     * pantalla completa y exencion de bateria.
     */
    private void exigirUbicacionObligatoria() {
        if (!hayTurnoActivo()) return;   // sin turno, no se exige

        final String falta = permisoFaltante();
        if (falta == null) { dialogoUbicacionVisible = false; return; }
        if (dialogoUbicacionVisible) return;
        dialogoUbicacionVisible = true;

        String titulo;
        String mensaje;
        String boton;

        switch (falta) {
            case "ubicacion":
                titulo = "Permiso de ubicación";
                mensaje = "La app necesita tu ubicación para compartir la posición de la unidad.";
                boton = "Permitir";
                break;
            case "apagada":
                titulo = "Activa la ubicación";
                mensaje = "El interruptor de ubicación del celular está apagado.\n\nActívalo para que la unidad siga reportando su posición.";
                boton = "Activar ubicación";
                break;
            case "fondo":
                titulo = "Ubicación todo el tiempo";
                mensaje = "En los permisos de ubicación elige \"Permitir todo el tiempo\".\n\nSi queda en \"Solo mientras se usa la app\", deja de reportar al cerrarla.";
                boton = "Abrir ajustes";
                break;
            case "notificaciones":
                titulo = "Permiso de notificaciones";
                mensaje = "Sin notificaciones no pueden aparecer las alertas de evacuación.";
                boton = "Permitir";
                break;
            case "pantalla_completa":
                titulo = "Alerta a pantalla completa";
                mensaje = "Para que la alarma aparezca aunque la app esté cerrada o el teléfono bloqueado, activa \"Permitir pantalla completa\".";
                boton = "Abrir ajustes";
                break;
            case "sobre_otras_apps":
                titulo = "Mostrar sobre otras apps";
                mensaje = "Para que la alarma te tape la pantalla aunque estés usando el celular.\n\n"
                        + "Se abre el interruptor de esta app: actívalo y vuelve.";
                boton = "Abrir interruptor";
                break;
            default:
                titulo = "Sin restricciones de batería";
                mensaje = "Android puede cerrar la app y dejar de enviar la ubicación.\n\nElige \"Sin restricciones\" / \"No optimizar\".";
                boton = "Permitir";
                break;
        }

        new android.app.AlertDialog.Builder(this)
                .setTitle(titulo)
                .setMessage(mensaje)
                .setCancelable(false)
                .setPositiveButton(boton, (d1, w) -> {
                    dialogoUbicacionVisible = false;
                    switch (falta) {
                        case "ubicacion":
                            solicitarUbicacionAhora();
                            break;
                        case "apagada":
                            abrirAjustesUbicacionSistema();
                            break;
                        case "fondo":
                            solicitarUbicacionAhora();
                            break;
                        case "notificaciones":
                            androidx.core.app.ActivityCompat.requestPermissions(this,
                                    new String[]{"android.permission.POST_NOTIFICATIONS"}, CODIGO_NOTIFICACIONES);
                            break;
                        case "pantalla_completa":
                            try {
                                android.content.Intent i = new android.content.Intent(
                                        android.provider.Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                                i.setData(android.net.Uri.parse("package:" + getPackageName()));
                                startActivity(i);
                            } catch (Exception e) { abrirAjustesApp(); }
                            break;
                        case "sobre_otras_apps":
                            try {
                                android.content.Intent i = new android.content.Intent(
                                        android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
                                i.setData(android.net.Uri.parse("package:" + getPackageName()));
                                startActivity(i);
                            } catch (Exception e) { abrirAjustesApp(); }
                            break;
                        default:
                            pedirExencionBateriaDirecto();
                            break;
                    }
                })
                .setNegativeButton("Cerrar app", (d1, w) -> {
                    dialogoUbicacionVisible = false;
                    finishAffinity();
                })
                .show();
    }

    /** Estado completo de la ubicacion: permiso, fondo e interruptor del sistema. */
    private String estadoUbicacionActual() {
        try {
            boolean fina = androidx.core.content.ContextCompat.checkSelfPermission(this,
                    android.Manifest.permission.ACCESS_FINE_LOCATION)
                    == android.content.pm.PackageManager.PERMISSION_GRANTED;
            if (!fina) return "sin_permiso";

            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                boolean fondo = androidx.core.content.ContextCompat.checkSelfPermission(this,
                        android.Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                        == android.content.pm.PackageManager.PERMISSION_GRANTED;
                if (!fondo) return "sin_permiso_fondo";
            }

            if (!ubicacionEncendida()) return "apagada";
            return "ok";
        } catch (Exception e) {
            return "error";
        }
    }

    /** true si el interruptor de ubicacion del celular esta encendido. */
    private boolean ubicacionEncendida() {
        try {
            android.location.LocationManager lm =
                    (android.location.LocationManager) getSystemService(LOCATION_SERVICE);
            if (lm == null) return false;
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                return lm.isLocationEnabled();
            }
            return lm.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER)
                    || lm.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER);
        } catch (Exception e) {
            return false;
        }
    }

    /** Abre la pantalla de ubicacion del sistema (interruptor general). */
    private void abrirAjustesUbicacionSistema() {
        try {
            android.content.Intent i = new android.content.Intent(
                    android.provider.Settings.ACTION_LOCATION_SOURCE_SETTINGS);
            i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            try {
                startActivity(new android.content.Intent(
                        android.provider.Settings.ACTION_SETTINGS));
            } catch (Exception e2) { e2.printStackTrace(); }
        }
    }

    /**
     * Lleva a "Pausar actividad en la app si no se usa" (Android 11+).
     * Se usa el nombre literal de la accion porque no esta en todas las
     * versiones del SDK de compilacion; si el fabricante no la expone,
     * cae al detalle de la app.
     */
    private void abrirAjustesPausaApp() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            try {
                android.content.Intent i = new android.content.Intent(
                        "android.settings.AUTO_REVOKE_PERMISSIONS");
                i.setData(android.net.Uri.parse("package:" + getPackageName()));
                i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
                return;
            } catch (Exception e) {
                android.util.Log.w("MainActivity", "sin pantalla de pausa, uso detalle de app", e);
            }
        }
        try {
            android.content.Intent detalle = new android.content.Intent(
                    android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            detalle.setData(android.net.Uri.parse("package:" + getPackageName()));
            detalle.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(detalle);
        } catch (Exception e2) {
            e2.printStackTrace();
        }
    }

    /**
     * Pide el permiso de ubicacion por la via correcta segun lo que falte:
     *  - permiso de la app       -> dialogo del sistema (o Ajustes si ya no aparece)
     *  - "todo el tiempo"        -> Ajustes de la app (obligatorio en Android 11+)
     *  - interruptor apagado     -> pantalla de ubicacion del sistema
     */
    private void solicitarUbicacionAhora() {
        try {
            boolean fina = androidx.core.content.ContextCompat.checkSelfPermission(this,
                    android.Manifest.permission.ACCESS_FINE_LOCATION)
                    == android.content.pm.PackageManager.PERMISSION_GRANTED;

            boolean fondo = true;
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                fondo = androidx.core.content.ContextCompat.checkSelfPermission(this,
                        android.Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                        == android.content.pm.PackageManager.PERMISSION_GRANTED;
            }

            if (!fina) {
                boolean yaNiega = getSharedPreferences("avisos", MODE_PRIVATE)
                        .getBoolean("ubicacion_negada", false);

                boolean puedeDialogo = !yaNiega
                        || androidx.core.app.ActivityCompat.shouldShowRequestPermissionRationale(
                                this, android.Manifest.permission.ACCESS_FINE_LOCATION);

                if (puedeDialogo) {
                    androidx.core.app.ActivityCompat.requestPermissions(this,
                            new String[]{android.Manifest.permission.ACCESS_FINE_LOCATION,
                                         android.Manifest.permission.ACCESS_COARSE_LOCATION},
                            CODIGO_UBICACION);
                } else {
                    abrirAjustesApp();   // Android ya no mostrará el dialogo
                }
                return;
            }

            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q && !fondo) {
                // Como antes: se pide el permiso y el sistema muestra la opcion
                // "Permitir todo el tiempo".
                androidx.core.app.ActivityCompat.requestPermissions(this,
                        new String[]{android.Manifest.permission.ACCESS_BACKGROUND_LOCATION},
                        CODIGO_UBICACION + 1);
                return;
            }

            if (!ubicacionEncendida()) abrirAjustesUbicacionSistema();
        } catch (Exception e) {
            android.util.Log.e("MainActivity", "solicitarUbicacionAhora", e);
        }
    }

    private boolean dialogoUbicacionVisible = false;

    /* ============================================================
       PERMISOS OBLIGATORIOS DEL PORTAL
       Notificaciones, pantalla completa, "sobre otras apps",
       No molestar e instalar apps. Se piden de a uno, en ese orden,
       y no se puede seguir sin concederlos. Vale para jefes,
       gerentes, area y tambien para el conductor: su porton de
       ubicacion es aparte, dentro de "iniciar turno".

       Cada boton lleva DIRECTO al interruptor de esta app, salvo
       "todo el tiempo" (ubicacion) y los extras del fabricante, que
       Android no deja abrir en un solo salto.
       ============================================================ */
    private static final String[] PASOS_PORTAL = {
            "notificaciones", "pantalla_completa", "sobre_otras_apps", "no_molestar", "instalar"
    };

    /** Accion del sistema que abre el acceso a No molestar DE ESTA APP. */
    private static final String ACCION_NOMOLESTAR_APP =
            "android.settings.NOTIFICATION_POLICY_ACCESS_DETAIL_SETTINGS";
    private boolean pasoPermisoVisible = false;
    private boolean esperandoSistema = false;
    private long proximoChequeoPermiso = 0;

    /** La web esta en el plan de contingencia (no en Hallazgos ni en licencias). */
    private boolean paginaDelPortal() {
        try {
            if (getBridge() == null || getBridge().getWebView() == null) return false;
            String url = getBridge().getWebView().getUrl();
            if (url == null) return false;
            return url.contains("plan-contingencia") && !url.contains("licencias.html");
        } catch (Exception e) {
            return false;
        }
    }

    private boolean tieneNotificaciones() {
        if (android.os.Build.VERSION.SDK_INT < 33) return true;
        return ContextCompat.checkSelfPermission(this, "android.permission.POST_NOTIFICATIONS")
                == PackageManager.PERMISSION_GRANTED;
    }

    private boolean tienePantallaCompleta() {
        if (android.os.Build.VERSION.SDK_INT < 34) return true;
        android.app.NotificationManager nm =
                (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        return nm != null && nm.canUseFullScreenIntent();
    }

    /** "Mostrar sobre otras apps": deja abrir la alarma con el celular en uso. */
    private boolean tieneSobreOtrasApps() {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.M) return true;
        return android.provider.Settings.canDrawOverlays(this);
    }

    private boolean tieneNoMolestar() {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.M) return true;
        android.app.NotificationManager nm =
                (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        return nm != null && nm.isNotificationPolicyAccessGranted();
    }

    private boolean puedeInstalarApps() {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.O) return true;
        return getPackageManager().canRequestPackageInstalls();
    }

    private boolean faltaPaso(String paso) {
        switch (paso) {
            case "notificaciones": return !tieneNotificaciones();
            case "pantalla_completa": return !tienePantallaCompleta();
            case "sobre_otras_apps": return !tieneSobreOtrasApps();
            case "no_molestar": return !tieneNoMolestar();
            default: return !puedeInstalarApps();
        }
    }

    /** Lista fija de pasos que aplican a esta version de Android. */
    private java.util.List<String> pasosPortal = null;

    private java.util.List<String> pasosPortal() {
        if (pasosPortal != null) return pasosPortal;
        java.util.List<String> lista = new java.util.ArrayList<>();
        for (String p : PASOS_PORTAL) {
            if (p.equals("notificaciones") && android.os.Build.VERSION.SDK_INT < 33) continue;
            if (p.equals("pantalla_completa") && android.os.Build.VERSION.SDK_INT < 34) continue;
            if (p.equals("sobre_otras_apps")
                    && android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.M) continue;
            if (p.equals("no_molestar")
                    && android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.M) continue;
            if (p.equals("instalar")
                    && android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.O) continue;
            lista.add(p);
        }
        pasosPortal = lista;
        return lista;
    }

    /** Primer permiso del portal que falta, o null si ya estan todos. */
    private String siguientePasoPortal() {
        for (String paso : pasosPortal()) if (faltaPaso(paso)) return paso;
        return null;
    }

    /** Muestra UN permiso por vez y espera; el vigilante lo revalida. */
    private void exigirPermisosPortal() {
        if (hayTurnoActivo()) return;              // con turno manda el porton de unidades
        if (!paginaDelPortal()) return;            // Hallazgos y la portada no piden nada
        if (pasoPermisoVisible || esperandoSistema) return;
        if (android.os.SystemClock.uptimeMillis() < proximoChequeoPermiso) return;

        final String paso = siguientePasoPortal();
        if (paso == null) return;

        java.util.List<String> lista = pasosPortal();
        int numero = lista.indexOf(paso) + 1;
        if (numero < 1) numero = 1;
        int total = lista.size();

        String titulo;
        String mensaje;
        String boton;
        switch (paso) {
            case "notificaciones":
                titulo = "Notificaciones";
                mensaje = "Sin notificaciones no llegan las alarmas ni los avisos de evacuación.\n\n"
                        + "Es obligatorio para usar la app.";
                boton = "Permitir";
                break;
            case "pantalla_completa":
                titulo = "Alerta a pantalla completa";
                mensaje = "Para que la alarma aparezca aunque el teléfono esté bloqueado.\n\n"
                        + "Es obligatorio para usar la app. Una vez concedido no se vuelve a pedir.";
                boton = "Abrir ajustes";
                break;
            case "sobre_otras_apps":
                titulo = "Mostrar sobre otras apps";
                mensaje = "Para que la alarma te tape la pantalla aunque estés usando el celular "
                        + "(WhatsApp, cámara, el mapa).\n\n"
                        + "Al pulsar el botón se abre el interruptor de ESTA app: actívalo y vuelve.\n\n"
                        + "Es obligatorio para usar la app.";
                boton = "Abrir interruptor";
                break;
            case "no_molestar":
                titulo = "Acceso a No molestar";
                mensaje = "Para que la sirena suene aunque el equipo esté en silencio total.\n\n"
                        + "Al pulsar el botón se abre el acceso de ESTA app: actívalo y vuelve.\n\n"
                        + "Es obligatorio para usar la app.";
                boton = "Abrir interruptor";
                break;
            default:
                titulo = "Instalar actualizaciones";
                mensaje = "Para que la app pueda actualizarse sola cuando haya una versión nueva.\n\n"
                        + "Es obligatorio para usar la app.";
                boton = "Abrir ajustes";
                break;
        }

        pasoPermisoVisible = true;

        new android.app.AlertDialog.Builder(this)
                .setTitle("Permiso " + numero + " de " + total + " — " + titulo)
                .setMessage(mensaje)
                .setCancelable(false)
                .setPositiveButton(boton, (d1, w) -> {
                    pasoPermisoVisible = false;
                    esperandoSistema = true;
                    proximoChequeoPermiso = android.os.SystemClock.uptimeMillis() + 1200;
                    lanzarPasoPortal(paso);
                })
                .show();
    }

    /**
     * Abre el acceso a "No molestar" DE ESTA APP. En Android 11+ existe una
     * pantalla por aplicacion; si el fabricante la quito, se cae en la lista
     * general (como antes) y, de ultima, en la ficha de la app.
     */
    private boolean abrirNoMolestarDeLaApp() {
        try {
            Intent detalle = new Intent(ACCION_NOMOLESTAR_APP);
            detalle.setData(Uri.parse("package:" + getPackageName()));
            detalle.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
            startActivity(detalle);
            return true;
        } catch (Exception e) {
            android.util.Log.w("MainActivity", "sin pantalla directa de No molestar", e);
        }
        try {
            startActivity(new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS));
            return true;
        } catch (Exception e) {
            abrirAjustesApp();
            return true;
        }
    }

    /** Abre el dialogo del sistema o la pantalla de Ajustes del permiso pedido. */
    private void lanzarPasoPortal(String paso) {
        boolean abierto = false;
        try {
            switch (paso) {
                case "notificaciones":
                    // Si Android ya no muestra el dialogo (lo nego dos veces),
                    // se abre directo la pantalla de notificaciones de la app.
                    boolean pedidas = getSharedPreferences("avisos", MODE_PRIVATE)
                            .getBoolean("notif_pedidas", false);
                    boolean puedeDialogo = !pedidas
                            || ActivityCompat.shouldShowRequestPermissionRationale(
                                    this, "android.permission.POST_NOTIFICATIONS");
                    if (puedeDialogo) {
                        ActivityCompat.requestPermissions(this,
                                new String[]{"android.permission.POST_NOTIFICATIONS"}, CODIGO_NOTIFICACIONES);
                    } else {
                        try {
                            Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                            i.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                            startActivity(i);
                        } catch (Exception e) { abrirAjustesApp(); }
                    }
                    abierto = true;
                    break;
                case "pantalla_completa":
                    try {
                        Intent i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                        i.setData(Uri.parse("package:" + getPackageName()));
                        startActivity(i);
                        abierto = true;
                    } catch (Exception e) { abrirAjustesApp(); }
                    break;
                case "sobre_otras_apps":
                    try {
                        // Pantalla de "Mostrar sobre otras apps" de ESTA app
                        Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
                        i.setData(Uri.parse("package:" + getPackageName()));
                        startActivity(i);
                        abierto = true;
                    } catch (Exception e) { abrirAjustesApp(); }
                    break;
                case "no_molestar":
                    abierto = abrirNoMolestarDeLaApp();
                    break;
                default:
                    try {
                        Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                        i.setData(Uri.parse("package:" + getPackageName()));
                        startActivity(i);
                        abierto = true;
                    } catch (Exception e) { abrirAjustesApp(); }
                    break;
            }
        } catch (Exception e) {
            android.util.Log.e("MainActivity", "lanzarPasoPortal " + paso, e);
        }

        // Si no se pudo abrir nada, se libera la cola para que no quede trabada
        if (!abierto) {
            esperandoSistema = false;
            proximoChequeoPermiso = android.os.SystemClock.uptimeMillis() + 1500;
        }
    }

    /**
     * Revisa lo que hace falta para que la ALERTA EMERGENTE suene de verdad.
     * Los permisos los maneja exigirPermisosPortal(); aqui solo queda el aviso
     * del canal de la alarma silenciado, que no es un permiso.
     */
    private void verificarAlarmaEmergente(boolean alAbrir) {
        try {
            if (hayTurnoActivo()) return;
            // Mientras la cola de permisos este trabajando no se encima otro aviso
            if (pasoPermisoVisible || siguientePasoPortal() != null) return;
            android.app.NotificationManager nm =
                    (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (android.os.Build.VERSION.SDK_INT >= 26) {
                android.app.NotificationChannel canal =
                        nm.getNotificationChannel(AlarmaNotificacion.CANAL_ID);
                if (canal != null && canal.getImportance() == android.app.NotificationManager.IMPORTANCE_NONE) {
                    avisarCanalSilenciado();
                }
            }
        } catch (Exception e) {
            android.util.Log.e("MainActivity", "verificarAlarmaEmergente", e);
        }
    }

    /** Evita repetir el mismo aviso cada vez que se abre la app. */
    private boolean puedoAvisar(String clave, long cadaMs) {
        android.content.SharedPreferences prefs = getSharedPreferences("avisos", MODE_PRIVATE);
        long ultima = prefs.getLong(clave, 0);
        if (System.currentTimeMillis() - ultima < cadaMs) return false;
        prefs.edit().putLong(clave, System.currentTimeMillis()).apply();
        return true;
    }

    private void abrirAjustesApp() {
        try {
            android.content.Intent i = new android.content.Intent(
                    android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            i.setData(android.net.Uri.parse("package:" + getPackageName()));
            startActivity(i);
        } catch (Exception e) { e.printStackTrace(); }
    }

    private void avisarCanalSilenciado() {
        if (!puedoAvisar("canal_alarma", 12L * 60 * 60 * 1000)) return;
        runOnUiThread(() -> new android.app.AlertDialog.Builder(this)
                .setTitle("Alarma silenciada")
                .setMessage("El aviso \"Alarma de Huayco\" está silenciado en este celular, por eso no aparece la alerta a pantalla completa.")
                .setPositiveButton("Abrir ajustes", (d1, w) -> {
                    try {
                        android.content.Intent i = new android.content.Intent(
                                android.provider.Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS);
                        i.putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getPackageName());
                        i.putExtra(android.provider.Settings.EXTRA_CHANNEL_ID, AlarmaNotificacion.CANAL_ID);
                        startActivity(i);
                    } catch (Exception e) { abrirAjustesApp(); }
                })
                .setNegativeButton("Ahora no", null)
                .show());
    }

    private void reanudarServicioSiHabiaTurno() {
        android.content.SharedPreferences prefs =
                getSharedPreferences("ubicacion", MODE_PRIVATE);
        String usuario = prefs.getString("usuario", null);
        if (usuario == null || usuario.isEmpty()) return;

        String unidad = prefs.getString("unidad", "");
        UbicacionScheduler.iniciar(getApplicationContext(), usuario, unidad);
        android.util.Log.i("MainActivity", "Servicio de ubicacion reanudado para " + usuario);
    }

    /** Cada cuanto se vuelve a consultar si hay version nueva. */
    private static final long CADA_REVISION_MS = 60 * 1000L;
    private long ultimaRevision = 0;

    /**
     * Consulta version.json al abrir y al volver a la app.
     * Antes solo se revisaba en onCreate, asi que con la app viva en segundo
     * plano (turnos abiertos) nunca volvia a avisar de una version nueva.
     */
    private void revisarActualizacion(boolean forzar) {
        long ahora = System.currentTimeMillis();
        if (!forzar && ahora - ultimaRevision < CADA_REVISION_MS) return;
        ultimaRevision = ahora;
        try { Actualizador.revisar(this); } catch (Exception e) { e.printStackTrace(); }
    }

    @Override
    public void onResume() {
        super.onResume();
        revisarActualizacion(false);
        // Al volver de Ajustes se deja pasar un momento y la cola revalida sola.
        if (esperandoSistema) {
            esperandoSistema = false;
            proximoChequeoPermiso = android.os.SystemClock.uptimeMillis() + 900;
        }
        try { verificarAlarmaEmergente(false); } catch (Exception e) { e.printStackTrace(); }
        try { exigirPermisosPortal(); } catch (Exception e) { }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        // Si concedio la ubicacion normal, pedir "Todo el tiempo" (segundo plano).
        // OJO: en Android 11+ ese permiso ya no se puede pedir con un dialogo
        // (el sistema ignora la peticion); solo se activa en Ajustes de la app.
        if (requestCode == CODIGO_UBICACION && grantResults.length > 0) {
            boolean concedido = grantResults[0] == PackageManager.PERMISSION_GRANTED;

            getSharedPreferences("avisos", MODE_PRIVATE)
                    .edit().putBoolean("ubicacion_negada", !concedido).apply();

            if (concedido
                    && android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {

                boolean tieneFondo = ContextCompat.checkSelfPermission(this,
                        Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;

                if (!tieneFondo) {
                    ActivityCompat.requestPermissions(MainActivity.this,
                            new String[]{Manifest.permission.ACCESS_BACKGROUND_LOCATION},
                            CODIGO_UBICACION + 1);
                }
            }
        }

        try { exigirUbicacionObligatoria(); } catch (Exception e) { }

        if (requestCode == CODIGO_NOTIFICACIONES) {
            getSharedPreferences("avisos", MODE_PRIVATE)
                    .edit().putBoolean("notif_pedidas", true).apply();
            // La cola de permisos retoma desde el paso que sigue
            esperandoSistema = false;
            proximoChequeoPermiso = android.os.SystemClock.uptimeMillis() + 500;
            try { verificarAlarmaEmergente(false); } catch (Exception e) { }
        }

        if (requestCode == CODIGO_FOTOS) {
            esperandoSistema = false;
        }

        if (requestCode == CODIGO_UBICACION && callbackUbicacion != null) {
            boolean concedido = grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            callbackUbicacion.invoke(origenUbicacion, concedido, false);
            callbackUbicacion = null;
            origenUbicacion = null;
        }

        // Resultado del permiso de camara para la foto nativa.
        if (requestCode == CODIGO_CAMARA) {
            getSharedPreferences("avisos", MODE_PRIVATE)
                    .edit().putBoolean("camara_pedida", true).apply();
            boolean concedido = grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (concedido) {
                abrirCamara();
            } else {
                respuestaCamara("permiso");
            }
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registrar el plugin propio de alarma.
        // IMPORTANTE: debe ir ANTES de super.onCreate().
        registerPlugin(AlarmaPlugin.class);
        super.onCreate(savedInstanceState);

        // Resultado de la foto tomada con la camara nativa.
        camaraLauncher = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                resultado -> {
                    String fin = "cancelado";
                    if (resultado.getResultCode() == android.app.Activity.RESULT_OK
                            && camaraArchivo != null && camaraArchivo.exists()) {
                        try {
                            byte[] bytes = leerArchivo(camaraArchivo);
                            fin = "data:image/jpeg;base64,"
                                    + Base64.encodeToString(bytes, Base64.NO_WRAP);
                        } catch (Exception e) {
                            fin = "error:" + e.getMessage();
                        }
                    }
                    if (camaraArchivo != null) {
                        try { camaraArchivo.delete(); } catch (Exception ignored) { }
                        camaraArchivo = null;
                    }
                    respuestaCamara(fin);
                });

        // Exigir ubicacion si hay un turno activo
        try { exigirUbicacionObligatoria(); } catch (Exception e) { e.printStackTrace(); }

        final android.os.Handler vigilante = new android.os.Handler(android.os.Looper.getMainLooper());
        vigilante.postDelayed(new Runnable() {
            @Override
            public void run() {
                try { exigirUbicacionObligatoria(); } catch (Exception e) { }
                try { revisarActualizacion(false); } catch (Exception e) { }
                vigilante.postDelayed(this, 4000);
            }
        }, 4000);

        // Cola de permisos del portal: uno por vez, sin salida.
        // Cada segundo revalida; si el usuario nego o se fue, vuelve a pedir.
        final android.os.Handler cola = new android.os.Handler(android.os.Looper.getMainLooper());
        cola.postDelayed(new Runnable() {
            @Override
            public void run() {
                try { exigirPermisosPortal(); } catch (Exception e) { }
                cola.postDelayed(this, 1000);
            }
        }, 1200);

        // Aviso del canal de la alarma silenciado (no es un permiso)
        try { verificarAlarmaEmergente(true); } catch (Exception e) { e.printStackTrace(); }

        // Si habia un turno activo, reactivar el envio de ubicacion al abrir
        try { reanudarServicioSiHabiaTurno(); } catch (Exception e) { e.printStackTrace(); }

        revisarActualizacion(true);

        // Boton/gesto de retroceder:
        //  - Si hay historial en el WebView, retrocede (p. ej. de Hallazgos
        //    o Plan de Contingencia vuelve al portal Seguridad y salud en el trabajo).
        //  - Si ya estamos en el portal, sale de la app como siempre.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                // Con permisos obligatorios pendientes, "atras" no hace nada
                if (pasoPermisoVisible || (!hayTurnoActivo() && paginaDelPortal()
                        && siguientePasoPortal() != null)) {
                    return;
                }
                WebView webView = (getBridge() != null) ? getBridge().getWebView() : null;
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                    return;
                }
                // Sin historial: comportamiento normal (salir).
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });

        // Numeros de telefono del diagrama de flujo: al tocar un enlace tel:
        // se abre el MARCADOR con el numero ya puesto. No se llama directo:
        // el usuario decide si marca.
        if (getBridge() != null) {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                // Permitir agrandar/achicar con dos dedos (por ejemplo el
                // diagrama de flujo del plan de contingencia).
                android.webkit.WebSettings ajustes = webView.getSettings();
                // Limpiar cache una vez por version instalada (evita paginas viejas)
                try { limpiarCacheSiCambioVersion(webView); } catch (Exception e) { e.printStackTrace(); }

                ajustes.setGeolocationEnabled(true);

                // Permitir que la web abra los ajustes de ubicacion de la app
                webView.addJavascriptInterface(new Object() {
                    @JavascriptInterface
                    public void abrirAjustes() {
                        runOnUiThread(() -> {
                            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                            i.setData(Uri.parse("package:" + getPackageName()));
                            startActivity(i);
                        });
                    }

                    /* Foto con la camara del telefono. Devuelve el resultado
                       a la pagina por window.__fotoCamara(...).
                       Si el permiso esta negado se vuelve a pedir en CADA
                       toque; si Android ya no muestra el dialogo, se abre
                       Ajustes para que lo active a mano. */
                    @JavascriptInterface
                    public void tomarFoto() {
                        runOnUiThread(() -> {
                            try {
                                if (ContextCompat.checkSelfPermission(MainActivity.this,
                                        Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                                    pedirPermisoCamara();
                                    return;
                                }
                                abrirCamara();
                            } catch (Exception e) {
                                android.util.Log.e("MainActivity", "tomarFoto", e);
                                respuestaCamara("error:" + e.getMessage());
                            }
                        });
                    }

                    /* Fotos/galeria: no bloquea la app, se pide al usar la
                       funcion y se vuelve a pedir en cada toque. */
                    @JavascriptInterface
                    public boolean tienePermisoFotos() {
                        try {
                            String permiso = permisoFotos();
                            if (permiso == null) return true;
                            return ContextCompat.checkSelfPermission(MainActivity.this, permiso)
                                    == PackageManager.PERMISSION_GRANTED;
                        } catch (Exception e) {
                            return true;
                        }
                    }

                    @JavascriptInterface
                    public void pedirPermisoFotos() {
                        runOnUiThread(() -> {
                            try {
                                String permiso = permisoFotos();
                                if (permiso == null) return;
                                if (ContextCompat.checkSelfPermission(MainActivity.this, permiso)
                                        == PackageManager.PERMISSION_GRANTED) return;
                                ActivityCompat.requestPermissions(MainActivity.this,
                                        new String[]{permiso}, CODIGO_FOTOS);
                            } catch (Exception e) {
                                android.util.Log.e("MainActivity", "pedirPermisoFotos", e);
                            }
                        });
                    }

                    @JavascriptInterface
                    public void iniciarServicio(String usuario, String unidad) {
                        try {
                            pedirExencionBateria();
                            UbicacionScheduler.iniciar(getApplicationContext(), usuario, unidad);
                        } catch (Exception e) {
                            android.util.Log.e("MainActivity", "iniciarServicio fallo", e);
                        }
                    }

                    @JavascriptInterface
                    public boolean tienePermisoUbicacionNativo() {
                        try {
                            boolean fina = androidx.core.content.ContextCompat.checkSelfPermission(
                                    MainActivity.this, android.Manifest.permission.ACCESS_FINE_LOCATION)
                                    == android.content.pm.PackageManager.PERMISSION_GRANTED;
                            boolean fondo = true;
                            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                                fondo = androidx.core.content.ContextCompat.checkSelfPermission(
                                        MainActivity.this, android.Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                                        == android.content.pm.PackageManager.PERMISSION_GRANTED;
                            }
                            return fina && fondo;
                        } catch (Exception e) {
                            return false;
                        }
                    }

                    /* ok | sin_permiso | sin_permiso_fondo | apagada | error */
                    @JavascriptInterface
                    public String estadoUbicacion() {
                        return estadoUbicacionActual();
                    }

                    /* Pausa de la app por desuso (Android 11+). Si el sistema puede
                       hibernarla, corta ubicacion y notificaciones. Exenta = true. */
                    @JavascriptInterface
                    public boolean estaExentaDePausa() {
                        try {
                            if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.R) return true;
                            return getPackageManager().isAutoRevokeWhitelisted();
                        } catch (Exception e) {
                            return true;
                        }
                    }

                    @JavascriptInterface
                    public void abrirAjustesPausa() {
                        runOnUiThread(() -> {
                            try { abrirAjustesPausaApp(); } catch (Exception e) {
                                android.util.Log.e("MainActivity", "ajustes pausa", e);
                            }
                        });
                    }

                    @JavascriptInterface
                    public void revisarActualizacion() {
                        runOnUiThread(() -> MainActivity.this.revisarActualizacion(true));
                    }

                    @JavascriptInterface
                    public void abrirAjustesUbicacion() {
                        runOnUiThread(() -> {
                            try { abrirAjustesUbicacionSistema(); } catch (Exception e) {
                                android.util.Log.e("MainActivity", "ajustes ubicacion", e);
                            }
                        });
                    }

                    /* Id estable del equipo. Vive en preferencias propias
                       ("identidad") que nunca se limpian: asi la sesion se
                       recupera de la base aunque se borre la cache del WebView. */
                    @JavascriptInterface
                    public String obtenerDispositivo() {
                        try {
                            android.content.SharedPreferences prefs =
                                    getSharedPreferences("identidad", MODE_PRIVATE);
                            String id = prefs.getString("dispositivo", null);
                            if (id == null || id.isEmpty()) {
                                id = java.util.UUID.randomUUID().toString();
                                prefs.edit().putString("dispositivo", id).apply();
                            }
                            return id;
                        } catch (Exception e) {
                            return "";
                        }
                    }

                    @JavascriptInterface
                    public String obtenerSesionGuardada() {
                        try {
                            android.content.SharedPreferences prefs =
                                    getSharedPreferences("ubicacion", MODE_PRIVATE);
                            String usuario = prefs.getString("usuario", null);
                            if (usuario == null || usuario.isEmpty()) return "";
                            String unidad = prefs.getString("unidad", "");
                            return usuario + "|" + unidad;
                        } catch (Exception e) {
                            return "";
                        }
                    }

                    @JavascriptInterface
                    public void pedirNotificaciones() {
                        try {
                            if (android.os.Build.VERSION.SDK_INT >= 33) {
                                boolean concedido = ContextCompat.checkSelfPermission(
                                        MainActivity.this, "android.permission.POST_NOTIFICATIONS")
                                        == PackageManager.PERMISSION_GRANTED;
                                if (!concedido) {
                                    ActivityCompat.requestPermissions(MainActivity.this,
                                            new String[]{"android.permission.POST_NOTIFICATIONS"},
                                            CODIGO_NOTIFICACIONES);
                                }
                            }
                        } catch (Exception e) {
                            android.util.Log.e("MainActivity", "pedirNotificaciones", e);
                        }
                    }

                    @JavascriptInterface
                    public void pedirPantallaCompleta() {
                        try {
                            if (android.os.Build.VERSION.SDK_INT >= 34) {
                                android.app.NotificationManager nm =
                                        (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                                if (nm != null && !nm.canUseFullScreenIntent()) {
                                    Intent i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                                    i.setData(Uri.parse("package:" + getPackageName()));
                                    startActivity(i);
                                }
                            }
                        } catch (Exception e) {
                            android.util.Log.e("MainActivity", "pantalla completa", e);
                        }
                    }

                    @JavascriptInterface
                    public void cambiarUnidad(String unidad) {
                        UbicacionScheduler.cambiarUnidad(getApplicationContext(), unidad);
                    }

                    /* Pide el permiso de ubicacion por la via correcta (dialogo o Ajustes) */
                    @JavascriptInterface
                    public void pedirPermisoUbicacion() {
                        runOnUiThread(() -> solicitarUbicacionAhora());
                    }

                    @JavascriptInterface
                    public void detenerServicio() {
                        try {
                            UbicacionScheduler.detener(getApplicationContext());
                        } catch (Exception e) {
                            android.util.Log.e("MainActivity", "detenerServicio fallo", e);
                        }
                    }
                }, "AndroidUbicacion");
                ajustes.setSupportZoom(true);
                ajustes.setBuiltInZoomControls(true);
                ajustes.setDisplayZoomControls(false);

                webView.setWebChromeClient(new com.getcapacitor.BridgeWebChromeClient(getBridge()) {
                    @Override
                    public void onGeolocationPermissionsShowPrompt(String origin,
                            GeolocationPermissions.Callback callback) {
                        if (tienePermisoUbicacion()) {
                            callback.invoke(origin, true, false);
                        } else {
                            callbackUbicacion = callback;
                            origenUbicacion = origin;
                            ActivityCompat.requestPermissions(MainActivity.this,
                                    new String[]{Manifest.permission.ACCESS_FINE_LOCATION},
                                    CODIGO_UBICACION);
                        }
                    }
                });

                webView.setWebViewClient(new BridgeWebViewClient(getBridge()) {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        super.onPageFinished(view, url);
                        // Al entrar al plan de contingencia arranca la cola de permisos
                        view.postDelayed(() -> {
                            try { exigirPermisosPortal(); } catch (Exception e) { }
                        }, 700);
                    }

                    @Override
                    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                        String url = (request != null && request.getUrl() != null)
                                ? request.getUrl().toString() : "";
                        if (url.startsWith("tel:")) {
                            abrirMarcador(url);
                            return true;
                        }
                        return super.shouldOverrideUrlLoading(view, request);
                    }

                    @Override
                    @SuppressWarnings("deprecation")
                    public boolean shouldOverrideUrlLoading(WebView view, String url) {
                        if (url != null && url.startsWith("tel:")) {
                            abrirMarcador(url);
                            return true;
                        }
                        return super.shouldOverrideUrlLoading(view, url);
                    }
                });
            }
        }
    }

    /** Abre la app de llamadas con el numero ya escrito (sin marcar). */
    private void abrirMarcador(String url) {
        try {
            Intent intent = new Intent(Intent.ACTION_DIAL);
            intent.setData(Uri.parse(url));
            startActivity(intent);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    /* ---------------- Camara nativa ---------------- */

    private byte[] leerArchivo(File archivo) throws Exception {
        FileInputStream entrada = new FileInputStream(archivo);
        ByteArrayOutputStream salida = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int leidos;
        while ((leidos = entrada.read(buffer)) > 0) {
            salida.write(buffer, 0, leidos);
        }
        entrada.close();
        return salida.toByteArray();
    }

    /** Devuelve el resultado a la pagina: data URL, "cancelado", "permiso"... */
    private void respuestaCamara(String payload) {
        final String dato = (payload == null) ? "cancelado" : payload;
        runOnUiThread(() -> {
            try {
                if (getBridge() == null || getBridge().getWebView() == null) return;
                String js = "window.__fotoCamara && window.__fotoCamara("
                        + org.json.JSONObject.quote(dato) + ")";
                getBridge().getWebView().evaluateJavascript(js, null);
            } catch (Exception e) {
                android.util.Log.e("MainActivity", "respuestaCamara", e);
            }
        });
    }

    /* Permiso de fotos segun la version de Android (null = no hace falta). */
    private String permisoFotos() {
        if (android.os.Build.VERSION.SDK_INT >= 33) return "android.permission.READ_MEDIA_IMAGES";
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            return Manifest.permission.READ_EXTERNAL_STORAGE;
        }
        return null;
    }

    /**
     * Camara: se pide en cada intento. Si Android ya no muestra el dialogo
     * (lo nego dos veces), se abre Ajustes para que lo active a mano.
     */
    private void pedirPermisoCamara() {
        try {
            boolean pedidaAntes = getSharedPreferences("avisos", MODE_PRIVATE)
                    .getBoolean("camara_pedida", false);
            boolean puedeDialogo = !pedidaAntes
                    || ActivityCompat.shouldShowRequestPermissionRationale(
                            this, Manifest.permission.CAMERA);

            if (puedeDialogo) {
                ActivityCompat.requestPermissions(this,
                        new String[]{Manifest.permission.CAMERA}, CODIGO_CAMARA);
            } else {
                abrirAjustesApp();
            }
        } catch (Exception e) {
            android.util.Log.e("MainActivity", "pedirPermisoCamara", e);
        }
    }

    private void abrirCamara() {
        try {
            camaraArchivo = File.createTempFile("foto", ".jpg", getCacheDir());
            Uri destino = FileProvider.getUriForFile(this,
                    getPackageName() + ".fileprovider", camaraArchivo);

            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, destino);
            intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                    | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            camaraLauncher.launch(intent);
        } catch (android.content.ActivityNotFoundException e) {
            respuestaCamara("sincamara");
        } catch (Exception e) {
            android.util.Log.e("MainActivity", "abrirCamara", e);
            respuestaCamara("error:" + e.getMessage());
        }
    }
}

