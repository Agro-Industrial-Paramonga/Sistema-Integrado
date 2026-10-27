package com.aipsa.sistema;

import android.content.Context;
import android.content.SharedPreferences;
import android.location.Location;
import android.location.LocationManager;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Envia la ubicacion del celular a Supabase aunque la app este cerrada.
 * Se ejecuta cada hora mediante WorkManager (gratuito, parte de Android).
 */
public class UbicacionWorker extends Worker {

    private static final String TAG = "UbicacionWorker";

    private static final String SUPABASE_URL = "https://bfhfnldqwsrcpsdqpyat.supabase.co";
    private static final String SUPABASE_KEY = "sb_publishable_z-jW4WrGLq7wEhCI_CW3Ig_vQZwtOMh";

    public UbicacionWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        SharedPreferences prefs = ctx.getSharedPreferences("ubicacion", Context.MODE_PRIVATE);

        String usuario = prefs.getString("usuario", null);
        String unidad = prefs.getString("unidad", "");

        if (usuario == null || usuario.isEmpty()) {
            return Result.success();   // no hay sesion: nada que enviar
        }

        // Respaldo del respaldo: si la alarma se perdio, se vuelve a programar
        try { UbicacionScheduler.programar(ctx); } catch (Exception e) {
            Log.w(TAG, "No se pudo reprogramar la alarma", e);
        }

        Location loc = ultimaUbicacion(ctx);
        if (loc == null) {
            return Result.retry();
        }

        boolean ok = enviar(usuario, unidad, loc.getLatitude(), loc.getLongitude(), loc.getAccuracy());
        return ok ? Result.success() : Result.retry();
    }

    private Location ultimaUbicacion(Context ctx) {
        try {
            LocationManager lm = (LocationManager) ctx.getSystemService(Context.LOCATION_SERVICE);
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
            Log.e(TAG, "Error leyendo ubicacion", e);
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

            String json = "{"
                    + "\"user_id\":\"" + escapar(usuario) + "\","
                    + "\"unidad\":" + (unidad == null || unidad.isEmpty() ? "null" : "\"" + escapar(unidad) + "\"") + ","
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
            Log.i(TAG, "Envio ubicacion -> HTTP " + codigo);
            return codigo >= 200 && codigo < 300;
        } catch (Exception e) {
            Log.e(TAG, "Error enviando ubicacion", e);
            return false;
        } finally {
            if (conexion != null) conexion.disconnect();
        }
    }

    private String escapar(String texto) {
        return texto.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
