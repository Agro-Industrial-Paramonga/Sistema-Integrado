package com.aipsa.sistema;

import android.content.Context;
import android.content.SharedPreferences;

import android.content.Intent;
import androidx.core.content.ContextCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

/**
 * Programa el envio de ubicacion cada hora, incluso con la app cerrada.
 */
public class UbicacionScheduler {

    private static final String TRABAJO = "envio-ubicacion-horario";

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
                android.util.Log.w("UbicacionScheduler", "No se pudo iniciar el servicio", e);
            }
        }

        // Respaldo: si el servicio se detiene, WorkManager lo reactiva cada hora
        Constraints restricciones = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

        PeriodicWorkRequest trabajo = new PeriodicWorkRequest.Builder(
                UbicacionWorker.class, 1, TimeUnit.HOURS)
                .setConstraints(restricciones)
                .build();

        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
                TRABAJO,
                ExistingPeriodicWorkPolicy.UPDATE,
                trabajo
        );
    }

    /** Cambia solo la unidad asignada, sin reiniciar el envio. */
    public static void cambiarUnidad(Context ctx, String unidad) {
        SharedPreferences prefs = ctx.getSharedPreferences("ubicacion", Context.MODE_PRIVATE);
        prefs.edit().putString("unidad", unidad == null ? "" : unidad).apply();
    }

    /** Detiene el envio y olvida la sesion. */
    public static void detener(Context ctx) {
        ctx.stopService(new Intent(ctx, UbicacionService.class));
        WorkManager.getInstance(ctx).cancelUniqueWork(TRABAJO);
        SharedPreferences prefs = ctx.getSharedPreferences("ubicacion", Context.MODE_PRIVATE);
        prefs.edit().clear().apply();
    }
}
