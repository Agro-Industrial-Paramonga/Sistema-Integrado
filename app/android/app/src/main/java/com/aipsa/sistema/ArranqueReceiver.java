package com.aipsa.sistema;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

/**
 * Al encender el telefono, si el conductor tenia un turno activo,
 * vuelve a arrancar el envio de ubicacion.
 */
public class ArranqueReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String accion = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(accion)
                && !"android.intent.action.QUICKBOOT_POWERON".equals(accion)) {
            return;
        }

        SharedPreferences prefs = context.getSharedPreferences("ubicacion", Context.MODE_PRIVATE);
        String usuario = prefs.getString("usuario", null);
        if (usuario == null || usuario.isEmpty()) return;

        Intent servicio = new Intent(context, UbicacionService.class);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            androidx.core.content.ContextCompat.startForegroundService(context, servicio);
        } else {
            context.startService(servicio);
        }

        // Volver a poner la alarma de 5 minutos tras el reinicio
        UbicacionScheduler.programar(context);
    }
}
