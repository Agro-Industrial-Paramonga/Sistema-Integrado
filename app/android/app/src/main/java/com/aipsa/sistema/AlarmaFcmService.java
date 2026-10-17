package com.aipsa.sistema;

import androidx.annotation.NonNull;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * Servicio de Firebase propio.
 *
 * Extiende el de Capacitor (para no romper las notificaciones normales)
 * y ademas, cuando llega una alerta, lanza la PANTALLA DE ALARMA
 * a pantalla completa con sonido en bucle y vibracion.
 */
public class AlarmaFcmService extends MessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage mensaje) {
        // 1) Mantener el comportamiento normal de Capacitor (evento en la app)
        try {
            super.onMessageReceived(mensaje);
        } catch (Exception e) {
            e.printStackTrace();
        }

        // 2) Sacar el texto del mensaje (acepta varios formatos)
        String titulo = null;
        String cuerpo = null;

        try {
            if (mensaje.getNotification() != null) {
                titulo = mensaje.getNotification().getTitle();
                cuerpo = mensaje.getNotification().getBody();
            }
            if (mensaje.getData() != null) {
                if (mensaje.getData().get("title") != null)  titulo = mensaje.getData().get("title");
                if (mensaje.getData().get("titulo") != null) titulo = mensaje.getData().get("titulo");
                if (mensaje.getData().get("body") != null)   cuerpo = mensaje.getData().get("body");
                if (mensaje.getData().get("cuerpo") != null) cuerpo = mensaje.getData().get("cuerpo");
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        // 3) Disparar la alarma
        AlarmaNotificacion.mostrar(getApplicationContext(), titulo, cuerpo);
    }
}
