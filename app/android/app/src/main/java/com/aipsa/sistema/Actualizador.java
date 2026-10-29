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


    /** Pide, al abrir la app, el permiso para instalar actualizaciones. */
    public static void pedirPermisoInstalacion(final Activity actividad) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
            if (actividad.getPackageManager().canRequestPackageInstalls()) return;

            new AlertDialog.Builder(actividad)
                    .setTitle("Permitir actualizaciones")
                    .setMessage("Para recibir las actualizaciones del sistema, permite que esta app instale aplicaciones.\n\nSolo se hace una vez.")
                    .setPositiveButton("Permitir", (d1, w) -> {
                        try {
                            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                            i.setData(Uri.parse("package:" + actividad.getPackageName()));
                            actividad.startActivity(i);
                        } catch (Exception e) {
                            Log.e(TAG, "No se pudo abrir ajustes", e);
                        }
                    })
                    .setNegativeButton("Ahora no", null)
                    .setCancelable(false)
                    .show();
        } catch (Exception e) {
            Log.e(TAG, "Error pidiendo permiso", e);
        }
    }

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

                new Handler(Looper.getMainLooper()).post(() -> mostrarBloqueo(actividad, nueva, notas, apk));

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

    /* BLINDAJE: mientras se descarga o instala, la app no se puede usar.
       El diálogo no se cancela, no tiene "después" y el botón atrás no lo cierra. */
    private static android.app.Dialog bloqueo;
    private static android.widget.ProgressBar barraBloqueo;
    private static android.widget.TextView textoBloqueo;
    private static android.widget.Button botonBloqueo;
    private static boolean descargando = false;

    private static final String CANAL_ACTUALIZACION = "actualizacion";
    private static final int ID_NOTIFICACION_DESCARGA = 6011;

    /** Pantalla obligatoria: sin actualizar no se puede usar la app. */
    private static void mostrarBloqueo(final Activity actividad, int version,
                                       String notas, final String urlApk) {
        if (bloqueo != null && bloqueo.isShowing()) return;
        try {
            if (actividad == null || actividad.isFinishing()) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1
                    && actividad.isDestroyed()) return;

            int relleno = Math.round(20 * actividad.getResources().getDisplayMetrics().density);

            android.widget.LinearLayout caja = new android.widget.LinearLayout(actividad);
            caja.setOrientation(android.widget.LinearLayout.VERTICAL);
            caja.setPadding(relleno, relleno, relleno, relleno);

            android.widget.TextView titulo = new android.widget.TextView(actividad);
            titulo.setText("Actualización obligatoria");
            titulo.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 20);
            titulo.setTypeface(titulo.getTypeface(), android.graphics.Typeface.BOLD);
            caja.addView(titulo);

            android.widget.TextView mensaje = new android.widget.TextView(actividad);
            mensaje.setText("La versión " + version + " ya está disponible.\n" +
                    "Debes actualizar para seguir usando la app.\n\n" + (notas == null ? "" : notas));
            mensaje.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 14);
            mensaje.setPadding(0, Math.round(10 * actividad.getResources().getDisplayMetrics().density), 0, 0);
            caja.addView(mensaje);

            barraBloqueo = new android.widget.ProgressBar(actividad, null,
                    android.R.attr.progressBarStyleHorizontal);
            barraBloqueo.setMax(100);
            barraBloqueo.setProgress(0);
            android.widget.LinearLayout.LayoutParams paramsBarra =
                    new android.widget.LinearLayout.LayoutParams(
                            android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                            android.widget.LinearLayout.LayoutParams.WRAP_CONTENT);
            paramsBarra.topMargin = Math.round(14 * actividad.getResources().getDisplayMetrics().density);
            barraBloqueo.setLayoutParams(paramsBarra);
            caja.addView(barraBloqueo);

            textoBloqueo = new android.widget.TextView(actividad);
            textoBloqueo.setText("Pulsa Actualizar ahora para empezar.");
            textoBloqueo.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 12);
            textoBloqueo.setPadding(0, Math.round(6 * actividad.getResources().getDisplayMetrics().density), 0, 0);
            caja.addView(textoBloqueo);

            botonBloqueo = new android.widget.Button(actividad);
            botonBloqueo.setText("Actualizar ahora");
            botonBloqueo.setOnClickListener(v -> descargarEInstalar(actividad, urlApk, version));
            android.widget.LinearLayout.LayoutParams paramsBoton =
                    new android.widget.LinearLayout.LayoutParams(
                            android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                            android.widget.LinearLayout.LayoutParams.WRAP_CONTENT);
            paramsBoton.topMargin = Math.round(14 * actividad.getResources().getDisplayMetrics().density);
            botonBloqueo.setLayoutParams(paramsBoton);
            caja.addView(botonBloqueo);

            bloqueo = new android.app.Dialog(actividad);
            bloqueo.requestWindowFeature(android.view.Window.FEATURE_NO_TITLE);
            bloqueo.setContentView(caja);
            bloqueo.setCancelable(false);
            bloqueo.setCanceledOnTouchOutside(false);
            if (bloqueo.getWindow() != null) {
                bloqueo.getWindow().setBackgroundDrawable(
                        new android.graphics.drawable.ColorDrawable(
                                android.graphics.Color.argb(245, 255, 255, 255)));
            }
            bloqueo.setOnKeyListener((d, keyCode, ev) ->
                    keyCode == android.view.KeyEvent.KEYCODE_BACK);
            bloqueo.show();
        } catch (Exception e) {
            Log.w(TAG, "No se pudo mostrar el bloqueo de actualizacion", e);
        }
    }

    /** Notificación con la barra de descarga, para que se vea el avance aunque salga de la app. */
    private static void notificarProgreso(Activity actividad, int version, int porcentaje, String texto) {
        try {
            android.app.NotificationManager nm =
                    (android.app.NotificationManager) actividad.getSystemService(Activity.NOTIFICATION_SERVICE);
            if (nm == null) return;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                android.app.NotificationChannel canal = new android.app.NotificationChannel(
                        CANAL_ACTUALIZACION, "Actualización de la app",
                        android.app.NotificationManager.IMPORTANCE_LOW);
                canal.setDescription("Descarga e instalación de la versión nueva");
                nm.createNotificationChannel(canal);
            }

            androidx.core.app.NotificationCompat.Builder b =
                    new androidx.core.app.NotificationCompat.Builder(actividad, CANAL_ACTUALIZACION)
                            .setSmallIcon(android.R.drawable.stat_sys_download)
                            .setContentTitle("Descargando versión " + version)
                            .setContentText(texto)
                            .setOnlyAlertOnce(true)
                            .setOngoing(true)
                            .setProgress(100, porcentaje, false);

            nm.notify(ID_NOTIFICACION_DESCARGA, b.build());
        } catch (Exception e) {
            Log.w(TAG, "no se pudo notificar el progreso", e);
        }
    }

    private static void cerrarNotificacion(Activity actividad) {
        try {
            android.app.NotificationManager nm =
                    (android.app.NotificationManager) actividad.getSystemService(Activity.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(ID_NOTIFICACION_DESCARGA);
        } catch (Exception e) { }
    }

    private static void descargarEInstalar(final Activity actividad, final String urlApk, final int version) {
        if (descargando) return;
        descargando = true;

        if (botonBloqueo != null) botonBloqueo.setEnabled(false);
        if (textoBloqueo != null) textoBloqueo.setText("Conectando…");
        if (barraBloqueo != null) barraBloqueo.setProgress(0);

        new Thread(() -> {
            File destino = new File(actividad.getCacheDir(), "actualizacion.apk");
            try {
                if (destino.exists()) destino.delete();

                HttpURLConnection conexion = (HttpURLConnection) new URL(urlApk).openConnection();
                conexion.setConnectTimeout(15000);
                conexion.setReadTimeout(60000);
                conexion.setInstanceFollowRedirects(true);

                int total = conexion.getContentLength();
                InputStream in = conexion.getInputStream();
                FileOutputStream out = new FileOutputStream(destino);

                byte[] buf = new byte[8192];
                long leido = 0;
                int ultimo = -1;
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    leido += n;
                    int pct = (total > 0) ? (int) (leido * 100 / total) : 0;
                    if (pct != ultimo && (pct % 2 == 0 || pct == 100)) {
                        ultimo = pct;
                        final int p = pct;
                        final String mb = String.format(java.util.Locale.US, "%.1f MB de %.1f MB",
                                leido / 1048576.0, total > 0 ? total / 1048576.0 : 0);
                        new Handler(Looper.getMainLooper()).post(() -> {
                            if (barraBloqueo != null) barraBloqueo.setProgress(p);
                            if (textoBloqueo != null) textoBloqueo.setText("Descargando… " + p + "% · " + mb);
                            notificarProgreso(actividad, version, p, "Descargando… " + p + "%");
                        });
                    }
                }
                out.close();
                in.close();
                conexion.disconnect();

                new Handler(Looper.getMainLooper()).post(() -> {
                    if (textoBloqueo != null) textoBloqueo.setText("Descarga lista. Instalando…");
                    if (barraBloqueo != null) barraBloqueo.setProgress(100);
                    descargando = false;
                    cerrarNotificacion(actividad);
                    instalar(actividad, destino);
                    /* Si cancela el instalador del sistema, puede reintentar
                       sin volver a descargar. La app sigue bloqueada. */
                    if (botonBloqueo != null) {
                        botonBloqueo.setEnabled(true);
                        botonBloqueo.setText("Instalar de nuevo");
                        botonBloqueo.setOnClickListener(v -> instalar(actividad, destino));
                    }
                });

            } catch (Exception e) {
                Log.e(TAG, "Error descargando APK", e);
                new Handler(Looper.getMainLooper()).post(() -> {
                    descargando = false;
                    if (textoBloqueo != null) {
                        textoBloqueo.setText("No se pudo descargar (" + e.getClass().getSimpleName() +
                                "). Revisa tu conexión y vuelve a intentarlo.");
                    }
                    if (botonBloqueo != null) {
                        botonBloqueo.setEnabled(true);
                        botonBloqueo.setText("Reintentar");
                    }
                    cerrarNotificacion(actividad);
                });
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
                        .setNegativeButton("Reintentar", (d, w) -> instalar(actividad, apk))
                        .setCancelable(false)
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
