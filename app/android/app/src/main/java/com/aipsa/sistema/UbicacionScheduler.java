package com.aipsa.sistema;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import androidx.core.content.ContextCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

/**
 * Mantiene el envio de ubicacion funcionando aunque la app este cerrada:
 *  - Servicio en primer plano (envia cada 30 segundos).
 *  - Alarma exacta cada 2 minutos que revive el servicio si Android lo mata.
 *  - WorkManager cada 15 minutos como ultimo respaldo.
 */
public class UbicacionScheduler {

    private static final String TAG = "UbicacionScheduler";
    private static final String TRABAJO = "envio-ubicacion-periodico";
    private static final int PEDIDO_ALARMA = 4401;
    private static final long INTERVALO_ALARMA_MS = 2 * 60 * 1000L;   // revive cada 2 minutos

    /** Guarda quien es el usuario y su unidad, y arranca el envio periodico. */
    public static void iniciar(Context ctx, String usuario, String unidad) {
        SharedPreferences prefs = ctx.getSharedPreferences("ubicacion", Context.MODE_PRIVATE);
        prefs.edit()
                .putString("usuario", usuario)
                .putString("unidad", unidad == null ? "" : unidad)
                .apply();

        // Servicio en primer plano SOLO si ya hay permiso de ubicacion.
        // Sin permiso, Android lanza SecurityException y cierra la app.
        boolean tieneUbicacion = ContextCompat.checkSelfPermission(ctx,
                android.Manifest.permission.ACCESS_FINE_LOCATION)
                == android.content.pm.PackageManager.PERMISSION_GRANTED;

        if (tieneUbicacion) {
            try {
                Intent servicio = new Intent(ctx, UbicacionService.class);
                ContextCompat.startForegroundService(ctx, servicio);
            } catch (Exception e) {
                Log.w(TAG, "No se pudo iniciar el servicio", e);
            }
            programar(ctx);
        }

        // Respaldo: si el servicio y la alarma fallan, WorkManager envia igual
        Constraints restricciones = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

        PeriodicWorkRequest trabajo = new PeriodicWorkRequest.Builder(
                UbicacionWorker.class, 15, TimeUnit.MINUTES)
                .setConstraints(restricciones)
                .build();

        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
                TRABAJO,
                ExistingPeriodicWorkPolicy.UPDATE,
                trabajo
        );
    }

    /* ------------------------------------------------------------
       Alarma exacta: es lo que revive el servicio tras cerrar la app
       ------------------------------------------------------------ */
    public static void programar(Context ctx) {
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;

            PendingIntent pi = pendiente(ctx);
            long cuando = System.currentTimeMillis() + INTERVALO_ALARMA_MS;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                try {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cuando, pi);
                } catch (SecurityException se) {
                    // Android 13+ puede no haber concedido alarmas exactas
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cuando, pi);
                }
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, cuando, pi);
            }
        } catch (Exception e) {
            Log.w(TAG, "No se pudo programar la alarma", e);
        }
    }

    public static void cancelarAlarma(Context ctx) {
        try {
            AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
            if (am != null) am.cancel(pendiente(ctx));
        } catch (Exception e) {
            Log.w(TAG, "No se pudo cancelar la alarma", e);
        }
    }

    private static PendingIntent pendiente(Context ctx) {
        Intent i = new Intent(ctx, UbicacionAlarma.class).setAction(UbicacionAlarma.ACCION);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(ctx, PEDIDO_ALARMA, i, flags);
    }

    /** Cambia solo la unidad asignada, sin reiniciar el envio. */
    public static void cambiarUnidad(Context ctx, String unidad) {
        SharedPreferences prefs = ctx.getSharedPreferences("ubicacion", Context.MODE_PRIVATE);
        prefs.edit().putString("unidad", unidad == null ? "" : unidad).apply();
    }

    /** Detiene el envio y olvida la sesion. */
    public static void detener(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences("ubicacion", Context.MODE_PRIVATE);
        prefs.edit().clear().apply();          // primero se olvida la sesion
        cancelarAlarma(ctx);
        try { ctx.stopService(new Intent(ctx, UbicacionService.class)); } catch (Exception e) { Log.w(TAG, "stopService", e); }
        WorkManager.getInstance(ctx).cancelUniqueWork(TRABAJO);
    }
}
