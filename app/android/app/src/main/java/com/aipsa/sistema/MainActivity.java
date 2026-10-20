package com.aipsa.sistema;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registrar el plugin propio de alarma.
        // IMPORTANTE: debe ir ANTES de super.onCreate().
        registerPlugin(AlarmaPlugin.class);
        super.onCreate(savedInstanceState);

        // Boton/gesto de retroceder:
        //  - Si hay historial en el WebView, retrocede (p. ej. de Hallazgos
        //    o Plan de Contingencia vuelve al portal Sistema Integrado).
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
