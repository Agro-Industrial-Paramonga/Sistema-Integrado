package com.aipsa.sistema;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Plugin que usa la pagina web para:
 *  - saber si tiene permiso de "pantalla completa"
 *  - abrir la pantalla de ajustes donde se concede ese permiso
 *  - probar la alarma (botones de prueba)
 */
@CapacitorPlugin(name = "Alarma")
public class AlarmaPlugin extends Plugin {

    @PluginMethod
    public void puedePantallaCompleta(PluginCall call) {
        boolean puede = true;
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                NotificationManager nm = (NotificationManager)
                        getContext().getSystemService(Context.NOTIFICATION_SERVICE);
                puede = (nm != null) && nm.canUseFullScreenIntent();
            }
        } catch (Exception e) {
            puede = true;
        }
        JSObject r = new JSObject();
        r.put("puede", puede);
        r.put("android", Build.VERSION.SDK_INT);
        call.resolve(r);
    }

    @PluginMethod
    public void abrirAjustesPantallaCompleta(PluginCall call) {
        try {
            Intent i;
            if (Build.VERSION.SDK_INT >= 34) {
                i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                i.setData(Uri.parse("package:" + getContext().getPackageName()));
            } else {
                i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                i.setData(Uri.parse("package:" + getContext().getPackageName()));
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudieron abrir los ajustes: " + e.getMessage());
        }
    }

    /**
     * Prueba la alarma.
     * Si se pasa "retraso" (en segundos), la alarma se dispara despues de ese
     * tiempo, para poder bloquear el celular y comprobar el comportamiento real.
     */
    @PluginMethod
    public void probarAlarma(PluginCall call) {
        try {
            String titulo = call.getString("titulo");
            String cuerpo = call.getString("cuerpo");
            Integer retraso = call.getInt("retraso");

            if (titulo == null || titulo.trim().isEmpty()) titulo = "ALERTA DE HUAYCO (PRUEBA)";
            if (cuerpo == null || cuerpo.trim().isEmpty()) {
                cuerpo = "Prueba del sistema de alarma. Pulsa DETENER para parar.";
            }

            final String t = titulo;
            final String c = cuerpo;

            if (retraso != null && retraso > 0) {
                new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            AlarmaNotificacion.mostrar(getContext(), t, c);
                        } catch (Exception e) {
                            e.printStackTrace();
                        }
                    }
                }, retraso * 1000L);
            } else {
                AlarmaNotificacion.mostrar(getContext(), t, c);
            }

            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo probar la alarma: " + e.getMessage());
        }
    }
}
