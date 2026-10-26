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

    private void reanudarServicioSiHabiaTurno() {
        android.content.SharedPreferences prefs =
                getSharedPreferences("ubicacion", MODE_PRIVATE);
        String usuario = prefs.getString("usuario", null);
        if (usuario == null || usuario.isEmpty()) return;

        String unidad = prefs.getString("unidad", "");
        UbicacionScheduler.iniciar(getApplicationContext(), usuario, unidad);
        android.util.Log.i("MainActivity", "Servicio de ubicacion reanudado para " + usuario);
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

        // Si habia un turno activo, reactivar el envio de ubicacion al abrir
        try { reanudarServicioSiHabiaTurno(); } catch (Exception e) { e.printStackTrace(); }

        // Pedir permiso de instalacion y revisar si hay version nueva
        try { Actualizador.pedirPermisoInstalacion(this); } catch (Exception e) { e.printStackTrace(); }
        try { Actualizador.revisar(this); } catch (Exception e) { e.printStackTrace(); }

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
                            UbicacionScheduler.iniciar(getApplicationContext(), usuario, unidad);
                        } catch (Exception e) {
                            android.util.Log.e("MainActivity", "iniciarServicio fallo", e);
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
