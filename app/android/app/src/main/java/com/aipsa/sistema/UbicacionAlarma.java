package com.aipsa.sistema;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.core.content.ContextCompat;

/**
 * Se dispara cada 5 minutos con AlarmManager.
 * Es lo que mantiene vivo el envio de ubicacion aunque Android haya
 * matado la aplicacion: la alarma despierta el proceso y vuelve a
 * arrancar el servicio en primer plano.
 */
public class UbicacionAlarma extends BroadcastReceiver {

    public static final String ACCION = "com.aipsa.sistema.UBICACION_TICK";
    private static final String TAG = "UbicacionAlarma";

    @Override
    public void onReceive(Context context, Intent intent) {
        // Sin turno activo no se revive nada
        String usuario = context.getSharedPreferences("ubicacion", Context.MODE_PRIVATE)
                .getString("usuario", null);
        if (usuario == null || usuario.isEmpty()) {
            UbicacionScheduler.cancelarAlarma(context);
            return;
        }

        try {
            Intent servicio = new Intent(context, UbicacionService.class);
            servicio.putExtra("desde_alarma", true);
            ContextCompat.startForegroundService(context, servicio);
        } catch (Exception e) {
            Log.w(TAG, "No se pudo arrancar el servicio desde la alarma", e);
        }

        // La alarma exacta se consume: hay que volver a programarla
        try {
            UbicacionScheduler.programar(context);
        } catch (Exception e) {
            Log.w(TAG, "No se pudo reprogramar la alarma", e);
        }
    }
}
