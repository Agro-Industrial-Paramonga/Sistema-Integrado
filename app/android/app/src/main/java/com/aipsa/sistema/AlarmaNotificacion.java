package com.aipsa.sistema;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;

/**
 * Logica compartida para disparar la ALARMA.
 * La usan tanto el servicio de Firebase (alertas reales)
 * como el plugin (botones de prueba).
 */
public class AlarmaNotificacion {

    public static final String CANAL_ID = "alarma_huayco";
    private static final String TITULO_DEF = "\uD83D\uDEA8 ALERTA DE HUAYCO";
    private static final String CUERPO_DEF = "Se ha autorizado el inicio de los planes de accion.";

    /** Muestra la notificacion a pantalla completa y abre la pantalla de alarma. */
    public static void mostrar(Context ctx, String titulo, String cuerpo) {
        if (titulo == null || titulo.trim().isEmpty()) titulo = TITULO_DEF;
        if (cuerpo == null || cuerpo.trim().isEmpty()) cuerpo = CUERPO_DEF;

        NotificationManager nm =
                (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        crearCanal(ctx, nm);

        Intent intent = new Intent(ctx, AlarmaActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS);
        intent.putExtra("titulo", titulo);
        intent.putExtra("cuerpo", cuerpo);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getActivity(
                ctx, AlarmaActivity.ID_NOTIFICACION, intent, flags);

        Notification notificacion = new NotificationCompat.Builder(ctx, CANAL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentTitle(titulo)
                .setContentText(cuerpo)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(cuerpo))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setContentIntent(pi)
                .setFullScreenIntent(pi, true)
                .build();

        try {
            nm.notify(AlarmaActivity.ID_NOTIFICACION, notificacion);
        } catch (Exception e) {
            e.printStackTrace();
        }

        // Intento adicional de abrir la pantalla (puede estar restringido si el
        // celular esta bloqueado; la notificacion de pantalla completa es la via fiable)
        try {
            ctx.startActivity(intent);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private static void crearCanal(Context ctx, NotificationManager nm) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationChannel existente = nm.getNotificationChannel(CANAL_ID);
        if (existente != null) return;

        NotificationChannel canal = new NotificationChannel(
                CANAL_ID,
                "Alarma de Huayco",
                NotificationManager.IMPORTANCE_HIGH);
        canal.setDescription("Alarma critica: inicio de planes de accion");
        canal.enableVibration(true);
        canal.setVibrationPattern(new long[]{0, 800, 400});
        canal.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

        Uri sonido = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (sonido != null) {
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            canal.setSound(sonido, attrs);
        }

        try {
            nm.createNotificationChannel(canal);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
