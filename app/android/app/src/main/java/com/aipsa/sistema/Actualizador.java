package com.aipsa.sistema;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Actualizador propio: consulta version.json en GitHub Pages,
 * avisa al usuario y descarga el APK nuevo para instalarlo.
 * No usa Play Store.
 */
public class Actualizador {

    private static final String TAG = "Actualizador";
    private static final String URL_VERSION =
            "https://agro-industrial-paramonga.github.io/Sistema-Integrado/app/version.json";

    public static void revisar(final Activity actividad) {
        new Thread(() -> {
            try {
                JSONObject info = descargarVersion();
                if (info == null) return;

                int nueva = info.optInt("versionCode", 0);
                int actual = actividad.getPackageManager()
                        .getPackageInfo(actividad.getPackageName(), 0).versionCode;

                Log.i(TAG, "Version instalada " + actual + " / publicada " + nueva);
                if (nueva <= actual) return;

                String notas = info.optString("notas", "Mejoras y correcciones.");
                String apk = info.optString("apk", "");
                if (apk.isEmpty()) return;

                new Handler(Looper.getMainLooper()).post(() -> mostrarDialogo(actividad, nueva, notas, apk));

            } catch (Exception e) {
                Log.w(TAG, "No se pudo verificar actualizacion", e);
            }
        }).start();
    }

    private static JSONObject descargarVersion() {
        HttpURLConnection conexion = null;
        try {
            URL url = new URL(URL_VERSION + "?t=" + System.currentTimeMillis());
            conexion = (HttpURLConnection) url.openConnection();
            conexion.setConnectTimeout(8000);
            conexion.setReadTimeout(8000);
            conexion.setRequestProperty("Cache-Control", "no-cache");

            if (conexion.getResponseCode() != 200) return null;

            StringBuilder sb = new StringBuilder();
            try (InputStream in = conexion.getInputStream()) {
                byte[] buf = new byte[4096];
                int n;
                while ((n = in.read(buf)) > 0) sb.append(new String(buf, 0, n, "UTF-8"));
            }
            return new JSONObject(sb.toString());
        } catch (Exception e) {
            Log.w(TAG, "version.json no disponible", e);
            return null;
        } finally {
            if (conexion != null) conexion.disconnect();
        }
    }

    private static void mostrarDialogo(final Activity actividad, int version,
                                       String notas, final String urlApk) {
        new AlertDialog.Builder(actividad)
                .setTitle("Nueva versión disponible")
                .setMessage(notas)
                .setPositiveButton("Actualizar", (d, w) -> descargarEInstalar(actividad, urlApk))
                .setNegativeButton("Después", null)
                .setCancelable(true)
                .show();
    }

    private static void descargarEInstalar(final Activity actividad, String urlApk) {
        new Thread(() -> {
            try {
                File destino = new File(actividad.getCacheDir(), "actualizacion.apk");
                if (destino.exists()) destino.delete();

                HttpURLConnection conexion = (HttpURLConnection) new URL(urlApk).openConnection();
                conexion.setConnectTimeout(15000);
                conexion.setReadTimeout(60000);
                conexion.setInstanceFollowRedirects(true);

                try (InputStream in = conexion.getInputStream();
                     FileOutputStream out = new FileOutputStream(destino)) {
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                }
                conexion.disconnect();

                new Handler(Looper.getMainLooper()).post(() -> instalar(actividad, destino));

            } catch (Exception e) {
                Log.e(TAG, "Error descargando APK", e);
            }
        }).start();
    }

    private static void instalar(Activity actividad, File apk) {
        try {
            // Android 8+: el usuario debe permitir instalar apps desconocidas para esta app
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    && !actividad.getPackageManager().canRequestPackageInstalls()) {
                new AlertDialog.Builder(actividad)
                        .setTitle("Falta un permiso")
                        .setMessage("Para instalar la actualización, permite que esta app instale aplicaciones.")
                        .setPositiveButton("Abrir ajustes", (d, w) -> {
                            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                            i.setData(Uri.parse("package:" + actividad.getPackageName()));
                            actividad.startActivity(i);
                        })
                        .setNegativeButton("Cancelar", null)
                        .show();
                return;
            }

            Uri uri = FileProvider.getUriForFile(actividad,
                    actividad.getPackageName() + ".fileprovider", apk);

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            actividad.startActivity(intent);

        } catch (Exception e) {
            Log.e(TAG, "No se pudo instalar", e);
        }
    }
}
