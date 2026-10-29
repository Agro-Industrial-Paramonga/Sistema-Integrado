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
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
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
 * Servicio en primer plano: envia la ubicacion cada 30 segundos
 * aunque la aplicacion este cerrada.
 *
 * Tres cosas juntas para que no se detenga:
 *  1. Servicio en primer plano con START_STICKY.
 *  2. Escucha activa de GPS (pide posiciones nuevas, no lee solo el cache).
 *  3. Alarma exacta cada 2 minutos que lo revive si Android mata el proceso.
 */
public class UbicacionService extends Service {

    private static final String TAG = "UbicacionService";
    private static final String CANAL = "ubicacion_activa";
    private static final int ID_NOTIFICACION = 5511;

    private static final long INTERVALO_MS = 30 * 1000L;               // cada 30 segundos
    private static final long MINIMO_ENTRE_ENVIOS_MS = 10 * 1000L;     // no saturar

    private static final String SUPABASE_URL = "https://bfhfnldqwsrcpsdqpyat.supabase.co";
    private static final String SUPABASE_KEY = "sb_publishable_z-jW4WrGLq7wEhCI_CW3Ig_vQZwtOMh";

    private LocationManager gestor;
    private LocationListener escucha;
    private long ultimoEnvio = 0;
    private volatile boolean enviando = false;

    /* Diagnostico remoto: se guarda en app_log para saber por que no envia */
    private static final String APP_LOG_URL = SUPABASE_URL + "/rest/v1/app_log";
    private long ultimoLogOk = 0;
    private long ultimoLogFallo = 0;

    @Override
    public void onCreate() {
        super.onCreate();
        try {
            crearCanal();
            iniciarForeground();
        } catch (Exception e) {
            Log.e(TAG, "No se pudo iniciar en primer plano", e);
            stopSelf();
            return;
        }
        iniciarEscucha();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Si ya no hay turno activo, no se envia nada
        if (!haySesion()) {
            stopSelf();
            return START_NOT_STICKY;
        }

        // Asegura que sigue en primer plano (algunos equipos lo degradan)
        try { iniciarForeground(); } catch (Exception e) { Log.w(TAG, "foreground", e); }

        iniciarEscucha();

        boolean desdeAlarma = intent != null && intent.getBooleanExtra("desde_alarma", false);
        enviarAhora(desdeAlarma);

        // Se reprograma siempre: si el proceso muere, la alarma lo revive
        UbicacionScheduler.programar(this);

        return START_STICKY;
    }

    private boolean haySesion() {
        SharedPreferences prefs = getSharedPreferences("ubicacion", Context.MODE_PRIVATE);
        String usuario = prefs.getString("usuario", null);
        return usuario != null && !usuario.isEmpty();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // El usuario cerro la app desde "recientes": seguimos enviando
        Log.i(TAG, "App cerrada por el usuario; el servicio continua");
        UbicacionScheduler.programar(this);
        super.onTaskRemoved(rootIntent);
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        detenerEscucha();
        super.onDestroy();
        // Si el sistema lo destruye con turno activo, deja la alarma puesta
        if (haySesion()) UbicacionScheduler.programar(this);
    }

    /* ------------------------------------------------------------
       Escucha activa de ubicacion (posiciones frescas)
       ------------------------------------------------------------ */
    private void iniciarEscucha() {
        if (escucha != null) return;
        try {
            gestor = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            if (gestor == null) return;

            escucha = new LocationListener() {
                @Override
                public void onLocationChanged(Location location) {
                    enviarAhora(false);
                }

                @Override
                public void onProviderEnabled(String provider) {}

                @Override
                public void onProviderDisabled(String provider) {}

                @Override
                public void onStatusChanged(String provider, int status, Bundle extras) {}
            };

            for (String proveedor : new String[]{LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER}) {
                try {
                    if (!gestor.isProviderEnabled(proveedor)) continue;
                    gestor.requestLocationUpdates(proveedor, INTERVALO_MS, 0f, escucha, Looper.getMainLooper());
                    Log.i(TAG, "Escuchando " + proveedor);
                } catch (SecurityException se) {
                    Log.w(TAG, "Sin permiso para " + proveedor);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "No se pudo iniciar la escucha", e);
        }
    }

    private void detenerEscucha() {
        try {
            if (gestor != null && escucha != null) gestor.removeUpdates(escucha);
        } catch (Exception e) {
            Log.w(TAG, "removeUpdates", e);
        }
        escucha = null;
    }

    /* ------------------------------------------------------------
       Envio
       ------------------------------------------------------------ */
    private void enviarAhora(boolean forzar) {
        long ahora = System.currentTimeMillis();
        if (!forzar && ahora - ultimoEnvio < MINIMO_ENTRE_ENVIOS_MS) return;
        if (enviando) return;

        ultimoEnvio = ahora;
        enviando = true;

        new Thread(() -> {
            try {
                SharedPreferences prefs = getSharedPreferences("ubicacion", Context.MODE_PRIVATE);
                String usuario = prefs.getString("usuario", null);
                String unidad = prefs.getString("unidad", "");
                if (usuario == null || usuario.isEmpty()) return;

                String permiso = describirPermiso();
                if (!permiso.startsWith("fino")) {
                    logFallo("sin permiso de ubicacion (" + permiso + ")");
                    return;
                }

                Location loc = ultimaUbicacion();
                if (loc == null) {
                    logFallo("sin fix de GPS (" + describirProveedores() + ")");
                    return;
                }

                long edadMin = (System.currentTimeMillis() - loc.getTime()) / 60000L;

                int codigo = enviar(usuario, unidad, loc.getLatitude(), loc.getLongitude(), loc.getAccuracy());

                if (codigo >= 200 && codigo < 300) {
                    Log.i(TAG, "Envio OK (" + usuario + ")");
                    if (ahora - ultimoLogOk > 60 * 60 * 1000L) {
                        ultimoLogOk = ahora;
                        logRemoto("ok · " + usuario + " · " + unidad + " · prec=" + Math.round(loc.getAccuracy())
                                + "m · fix=" + edadMin + "min · codigo=" + codigo);
                    }
                } else {
                    Log.w(TAG, "Envio FALLO (" + usuario + ") codigo=" + codigo);
                    logFallo("envio fallo codigo=" + codigo + " · " + describirProveedores()
                            + " · fix=" + edadMin + "min");
                }
            } catch (Exception e) {
                Log.e(TAG, "Error en envio", e);
                logFallo("excepcion: " + e.getClass().getSimpleName() + " " + e.getMessage());
            } finally {
                enviando = false;
            }
        }).start();
    }

    private String describirPermiso() {
        boolean fino = androidx.core.content.ContextCompat.checkSelfPermission(this,
                android.Manifest.permission.ACCESS_FINE_LOCATION)
                == android.content.pm.PackageManager.PERMISSION_GRANTED;
        boolean grueso = androidx.core.content.ContextCompat.checkSelfPermission(this,
                android.Manifest.permission.ACCESS_COARSE_LOCATION)
                == android.content.pm.PackageManager.PERMISSION_GRANTED;
        boolean fondo = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            fondo = androidx.core.content.ContextCompat.checkSelfPermission(this,
                    android.Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                    == android.content.pm.PackageManager.PERMISSION_GRANTED;
        }
        if (fino) return "fino" + (fondo ? "+fondo" : " SIN fondo");
        if (grueso) return "grueso";
        return "NINGUNO";
    }

    private String describirProveedores() {
        try {
            if (gestor == null) gestor = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            if (gestor == null) return "sin LocationManager";
            boolean gps = gestor.isProviderEnabled(LocationManager.GPS_PROVIDER);
            boolean red = gestor.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
            return "gps=" + (gps ? "si" : "NO") + " red=" + (red ? "si" : "NO");
        } catch (Exception e) {
            return "proveedores?";
        }
    }

    /* Se guarda en app_log; con limite para no llenar la tabla */
    private void logFallo(String motivo) {
        long ahora = System.currentTimeMillis();
        if (ahora - ultimoLogFallo < 10 * 60 * 1000L) return;
        ultimoLogFallo = ahora;
        logRemoto("fallo · " + motivo);
    }

    private void logRemoto(String detalle) {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(APP_LOG_URL).openConnection();
            c.setRequestMethod("POST");
            c.setRequestProperty("apikey", SUPABASE_KEY);
            c.setRequestProperty("Authorization", "Bearer " + SUPABASE_KEY);
            c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("Prefer", "return=minimal");
            c.setConnectTimeout(10000);
            c.setReadTimeout(10000);
            c.setDoOutput(true);
            String json = "{\"origen\":\"ubicacion\",\"detalle\":\"" + escapar(detalle) + "\"}";
            try (OutputStream salida = c.getOutputStream()) {
                salida.write(json.getBytes(StandardCharsets.UTF_8));
            }
            c.getResponseCode();
            c.disconnect();
        } catch (Exception e) {
            Log.w(TAG, "log remoto fallo", e);
        }
    }

    private Location ultimaUbicacion() {
        Location mejor = null;
        try {
            if (gestor == null) gestor = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            if (gestor == null) return null;

            for (String proveedor : new String[]{LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER}) {
                try {
                    if (!gestor.isProviderEnabled(proveedor)) continue;
                    Location l = gestor.getLastKnownLocation(proveedor);
                    if (l == null) continue;
                    if (mejor == null || l.getTime() > mejor.getTime()) mejor = l;
                } catch (SecurityException se) {
                    Log.w(TAG, "Sin permiso para " + proveedor);
                }
            }
        } catch (Exception e) {
            return mejor;
        }
        return mejor;
    }

    private int enviar(String usuario, String unidad, double lat, double lon, float precision) {
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
            return codigo;
        } catch (Exception e) {
            Log.e(TAG, "Error de red", e);
            return 0;
        } finally {
            if (conexion != null) conexion.disconnect();
        }
    }

    private String escapar(String texto) {
        return texto.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    /* ------------------------------------------------------------
       Notificacion fija (requisito de Android)
       ------------------------------------------------------------ */
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

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(ID_NOTIFICACION, notificacion,
                        android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(ID_NOTIFICACION, notificacion);
            }
        } catch (Exception e) {
            Log.e(TAG, "startForeground fallo", e);
            stopSelf();
        }
    }
}
