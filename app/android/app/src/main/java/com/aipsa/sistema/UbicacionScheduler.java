package com.aipsa.sistema;

import android.content.Context;
import android.content.SharedPreferences;

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
        WorkManager.getInstance(ctx).cancelUniqueWork(TRABAJO);
        SharedPreferences prefs = ctx.getSharedPreferences("ubicacion", Context.MODE_PRIVATE);
        prefs.edit().clear().apply();
    }
}
