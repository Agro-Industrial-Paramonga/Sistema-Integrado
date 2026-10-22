package com.aipsa.sistema;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Servicio en primer plano: envia la ubicacion cada 5 minutos
 * aunque la aplicacion este cerrada. Muestra una notificacion fija
 * mientras comparte (requisito de Android).
 */
public class UbicacionService extends Service {

    private static final String TAG = "UbicacionService";
    private static final String CANAL = "ubicacion_activa";
    private static final int ID_NOTIFICACION = 5511;
    private static final long INTERVALO_MS = 5 * 60 * 1000L;   // 5 minutos

    private static final String SUPABASE_URL = "https://bfhfnldqwsrcpsdqpyat.supabase.co";
    private static final String SUPABASE_KEY = "sb_publishable_z-jW4WrGLq7wEhCI_CW3Ig_vQZwtOMh";

    private Handler manejador;
    private Runnable tarea;

    @Override
    public void onCreate() {
        super.onCreate();
        crearCanal();
        iniciarForeground();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (manejador == null) {
            manejador = new Handler(Looper.getMainLooper());
        }

        if (tarea == null) {
            tarea = new Runnable() {
                @Override
                public void run() {
                    enviarAhora();
                    manejador.postDelayed(this, INTERVALO_MS);
                }
            };
        }

        manejador.removeCallbacks(tarea);
        manejador.post(tarea);   // envia de inmediato y luego cada 5 minutos

        return START_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        if (manejador != null && tarea != null) manejador.removeCallbacks(tarea);
        super.onDestroy();
    }

    /* ------------------------------------------------------------ */

    private void crearCanal() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(CANAL) != null) return;

        NotificationChannel canal = new NotificationChannel(
                CANAL, "Ubicación en turno", NotificationManager.IMPORTANCE_LOW);
        canal.setDescription("Comparte la ubicación de la unidad durante el turno");
        canal.setSound(null, null);
        nm.createNotificationChannel(canal);
    }

    private void iniciarForeground() {
        Intent abrir = new Intent(this, MainActivity.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(this, 0, abrir, flags);

        Notification notificacion = new NotificationCompat.Builder(this, CANAL)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentTitle("Compartiendo ubicación")
                .setContentText("Tu unidad está reportando su posición")
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setContentIntent(pi)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(ID_NOTIFICACION, notificacion,
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(ID_NOTIFICACION, notificacion);
        }
    }

    private void enviarAhora() {
        new Thread(() -> {
            try {
                SharedPreferences prefs = getSharedPreferences("ubicacion", Context.MODE_PRIVATE);
                String usuario = prefs.getString("usuario", null);
                String unidad = prefs.getString("unidad", "");
                if (usuario == null || usuario.isEmpty()) return;

                Location loc = ultimaUbicacion();
                if (loc == null) {
                    Log.w(TAG, "Sin ubicacion disponible");
                    return;
                }

                boolean ok = enviar(usuario, unidad, loc.getLatitude(), loc.getLongitude(), loc.getAccuracy());
                Log.i(TAG, "Envio " + (ok ? "OK" : "FALLO") + " (" + usuario + ")");
            } catch (Exception e) {
                Log.e(TAG, "Error en envio", e);
            }
        }).start();
    }

    private Location ultimaUbicacion() {
        try {
            LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            if (lm == null) return null;

            Location mejor = null;
            for (String proveedor : new String[]{LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER}) {
                try {
                    if (!lm.isProviderEnabled(proveedor)) continue;
                    Location l = lm.getLastKnownLocation(proveedor);
                    if (l == null) continue;
                    if (mejor == null || l.getTime() > mejor.getTime()) mejor = l;
                } catch (SecurityException se) {
                    Log.w(TAG, "Sin permiso para " + proveedor);
                }
            }
            return mejor;
        } catch (Exception e) {
            return null;
        }
    }

    private boolean enviar(String usuario, String unidad, double lat, double lon, float precision) {
        HttpURLConnection conexion = null;
        try {
            URL url = new URL(SUPABASE_URL + "/rest/v1/ubicaciones?on_conflict=user_id");
            conexion = (HttpURLConnection) url.openConnection();
            conexion.setRequestMethod("POST");
            conexion.setRequestProperty("apikey", SUPABASE_KEY);
            conexion.setRequestProperty("Authorization", "Bearer " + SUPABASE_KEY);
            conexion.setRequestProperty("Content-Type", "application/json");
            conexion.setRequestProperty("Prefer", "resolution=merge-duplicates,return=minimal");
            conexion.setConnectTimeout(15000);
            conexion.setReadTimeout(15000);
            conexion.setDoOutput(true);

            SimpleDateFormat formato = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
            formato.setTimeZone(TimeZone.getTimeZone("UTC"));
            String fecha = formato.format(new Date());

            String token = getSharedPreferences("ubicacion", Context.MODE_PRIVATE).getString("token", "");

            String json = "{"
                    + "\"user_id\":\"" + escapar(usuario) + "\","
                    + "\"unidad\":" + (unidad == null || unidad.isEmpty() ? "null" : "\"" + escapar(unidad) + "\"") + ","
                    + "\"token\":" + (token == null || token.isEmpty() ? "null" : "\"" + escapar(token) + "\"") + ","
                    + "\"lat\":" + lat + ","
                    + "\"lon\":" + lon + ","
                    + "\"precision_m\":" + precision + ","
                    + "\"actualizado_en\":\"" + fecha + "\""
                    + "}";

            byte[] datos = json.getBytes(StandardCharsets.UTF_8);
            try (OutputStream salida = conexion.getOutputStream()) {
                salida.write(datos);
            }

            int codigo = conexion.getResponseCode();
            return codigo >= 200 && codigo < 300;
        } catch (Exception e) {
            Log.e(TAG, "Error de red", e);
            return false;
        } finally {
            if (conexion != null) conexion.disconnect();
        }
    }

    private String escapar(String texto) {
        return texto.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
