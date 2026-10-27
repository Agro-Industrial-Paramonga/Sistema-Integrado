package com.aipsa.sistema;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.JavascriptInterface;
import android.provider.Settings;
import android.Manifest;
import android.content.pm.PackageManager;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import androidx.activity.OnBackPressedCallback;

public class MainActivity extends BridgeActivity {

    private GeolocationPermissions.Callback callbackUbicacion;
    private String origenUbicacion;
    private static final int CODIGO_UBICACION = 4711;
    private static final int CODIGO_NOTIFICACIONES = 4712;

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

    private void exigirUbicacionObligatoria() {
        android.content.SharedPreferences prefs = getSharedPreferences("ubicacion", MODE_PRIVATE);
        String usuario = prefs.getString("usuario", null);
        if (usuario == null || usuario.isEmpty()) return;   // sin turno, no se exige

        boolean fina = androidx.core.content.ContextCompat.checkSelfPermission(this,
                android.Manifest.permission.ACCESS_FINE_LOCATION)
                == android.content.pm.PackageManager.PERMISSION_GRANTED;

        boolean fondo = true;
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            fondo = androidx.core.content.ContextCompat.checkSelfPermission(this,
                    android.Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                    == android.content.pm.PackageManager.PERMISSION_GRANTED;
        }

        // El interruptor de ubicacion del celular debe estar encendido
        final boolean encendida = ubicacionEncendida();

        // Tambien exigir exencion del ahorro de bateria
        boolean bateriaTemp = true;
        try {
            android.os.PowerManager pm = (android.os.PowerManager) getSystemService(POWER_SERVICE);
            bateriaTemp = pm == null || pm.isIgnoringBatteryOptimizations(getPackageName());
        } catch (Exception e) { }
        final boolean bateriaOk = bateriaTemp;

        if (fina && fondo && encendida && bateriaOk) return;
        if (dialogoUbicacionVisible) return;
        dialogoUbicacionVisible = true;

        final String mensaje = !encendida
                ? "La ubicación del celular está desactivada.\n\nActívala para que la unidad siga reportando su posición durante el turno."
                : "Para usar la app durante el turno necesitas:\n\n• Ubicación en \"Permitir todo el tiempo\"\n• Exención del ahorro de batería\n\nSin ambos, la posición de tu unidad deja de compartirse.";

        new android.app.AlertDialog.Builder(this)
                .setTitle(!encendida ? "Activa la ubicación" : "Ubicación obligatoria")
                .setMessage(mensaje)
                .setCancelable(false)
                .setPositiveButton(!encendida ? "Activar ubicación" : "Permitir", (d1, w) -> {
                    dialogoUbicacionVisible = false;
                    if (!encendida) {
                        abrirAjustesUbicacionSistema();
                    } else if (!fina) {
                        androidx.core.app.ActivityCompat.requestPermissions(this,
                                new String[]{android.Manifest.permission.ACCESS_FINE_LOCATION}, CODIGO_UBICACION);
                    } else if (!bateriaOk) {
                        pedirExencionBateriaDirecto();
                    } else {
                        try {
                            android.content.Intent i = new android.content.Intent(
                                    android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                            i.setData(android.net.Uri.parse("package:" + getPackageName()));
                            startActivity(i);
                        } catch (Exception e) { e.printStackTrace(); }
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

    private boolean dialogoUbicacionVisible = false;

    /**
     * Revisa lo que hace falta para que la ALERTA EMERGENTE aparezca de verdad.
     * La alarma se muestra como notificacion con fullScreenIntent: sin permiso de
     * notificaciones, sin "pantalla completa" o con el canal silenciado, no sale nada.
     */
    private void verificarAlarmaEmergente(boolean alAbrir) {
        try {
            // 1) Permiso de notificaciones (Android 13+)
            if (android.os.Build.VERSION.SDK_INT >= 33) {
                boolean notificaciones = androidx.core.content.ContextCompat.checkSelfPermission(
                        this, "android.permission.POST_NOTIFICATIONS")
                        == android.content.pm.PackageManager.PERMISSION_GRANTED;

                if (!notificaciones) {
                    if (alAbrir) {
                        androidx.core.app.ActivityCompat.requestPermissions(this,
                                new String[]{"android.permission.POST_NOTIFICATIONS"}, CODIGO_NOTIFICACIONES);
                    } else {
                        avisarNotificacionesApagadas();
                    }
                    return;
                }
            }

            android.app.NotificationManager nm =
                    (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm == null) return;

            // 2) Permitir pantalla completa (Android 14+)
            if (android.os.Build.VERSION.SDK_INT >= 34 && !nm.canUseFullScreenIntent()) {
                avisarPantallaCompleta();
                return;
            }

            // 3) El canal de la alarma silenciado por el usuario
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

    private void avisarNotificacionesApagadas() {
        if (!puedoAvisar("aviso_notificaciones", 6L * 60 * 60 * 1000)) return;
        runOnUiThread(() -> new android.app.AlertDialog.Builder(this)
                .setTitle("Sin permiso de notificaciones")
                .setMessage("Así no pueden aparecer las alertas de evacuación.\n\nActiva las notificaciones de esta app para recibir la alarma a pantalla completa.")
                .setPositiveButton("Abrir ajustes", (d1, w) -> {
                    try {
                        android.content.Intent i = new android.content.Intent(
                                android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                        i.putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getPackageName());
                        startActivity(i);
                    } catch (Exception e) { abrirAjustesApp(); }
                })
                .setNegativeButton("Ahora no", null)
                .show());
    }

    private void avisarPantallaCompleta() {
        if (!puedoAvisar("pantalla_completa", 12L * 60 * 60 * 1000)) return;
        runOnUiThread(() -> new android.app.AlertDialog.Builder(this)
                .setTitle("Permitir alertas a pantalla completa")
                .setMessage("Para que la alarma de evacuación aparezca aunque el teléfono esté bloqueado, activa \"Permitir pantalla completa\".")
                .setPositiveButton("Abrir ajustes", (d1, w) -> {
                    try {
                        android.content.Intent i = new android.content.Intent(
                                android.provider.Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                        i.setData(android.net.Uri.parse("package:" + getPackageName()));
                        startActivity(i);
                    } catch (Exception e) { abrirAjustesApp(); }
                })
                .setNegativeButton("Ahora no", null)
                .show());
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

    private void pedirPantallaCompletaAlIniciar() {
        if (android.os.Build.VERSION.SDK_INT < 34) return;

        android.app.NotificationManager nm =
                (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null || nm.canUseFullScreenIntent()) return;

        android.content.SharedPreferences prefs = getSharedPreferences("avisos", MODE_PRIVATE);
        long ultima = prefs.getLong("pantalla_completa", 0);
        if (System.currentTimeMillis() - ultima < 12L * 60 * 60 * 1000) return;   // cada 12 h
        prefs.edit().putLong("pantalla_completa", System.currentTimeMillis()).apply();

        runOnUiThread(() -> new android.app.AlertDialog.Builder(this)
                .setTitle("Permitir alertas a pantalla completa")
                .setMessage("Para que la alarma de evacuación aparezca aunque el teléfono esté bloqueado, activa \"Permitir pantalla completa\".")
                .setPositiveButton("Abrir ajustes", (d1, w) -> {
                    try {
                        android.content.Intent i = new android.content.Intent(
                                android.provider.Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                        i.setData(android.net.Uri.parse("package:" + getPackageName()));
                        startActivity(i);
                    } catch (Exception e) { e.printStackTrace(); }
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
    private static final long CADA_REVISION_MS = 20 * 60 * 1000L;
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
        try { verificarAlarmaEmergente(false); } catch (Exception e) { e.printStackTrace(); }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        // Si concedio la ubicacion normal, pedir "Todo el tiempo" (segundo plano)
        if (requestCode == CODIGO_UBICACION
                && grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED
                && android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {

            boolean tieneFondo = ContextCompat.checkSelfPermission(this,
                    Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;

            if (!tieneFondo) {
                ActivityCompat.requestPermissions(MainActivity.this,
                        new String[]{Manifest.permission.ACCESS_BACKGROUND_LOCATION},
                        CODIGO_UBICACION + 1);
            }
        }

        try { exigirUbicacionObligatoria(); } catch (Exception e) { }

        if (requestCode == CODIGO_NOTIFICACIONES) {
            try { verificarAlarmaEmergente(false); } catch (Exception e) { }
        }

        if (requestCode == CODIGO_UBICACION && callbackUbicacion != null) {
            boolean concedido = grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            callbackUbicacion.invoke(origenUbicacion, concedido, false);
            callbackUbicacion = null;
            origenUbicacion = null;
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registrar el plugin propio de alarma.
        // IMPORTANTE: debe ir ANTES de super.onCreate().
        registerPlugin(AlarmaPlugin.class);
        super.onCreate(savedInstanceState);

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

        // Permiso de pantalla completa para que la alarma salte sola
        try { verificarAlarmaEmergente(true); } catch (Exception e) { e.printStackTrace(); }

        // Si habia un turno activo, reactivar el envio de ubicacion al abrir
        try { reanudarServicioSiHabiaTurno(); } catch (Exception e) { e.printStackTrace(); }

        // Pedir permiso de instalacion y revisar si hay version nueva
        try { Actualizador.pedirPermisoInstalacion(this); } catch (Exception e) { e.printStackTrace(); }
        revisarActualizacion(true);

        // Boton/gesto de retroceder:
        //  - Si hay historial en el WebView, retrocede (p. ej. de Hallazgos
        //    o Plan de Contingencia vuelve al portal Seguridad y salud en el trabajo).
        //  - Si ya estamos en el portal, sale de la app como siempre.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
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
}
