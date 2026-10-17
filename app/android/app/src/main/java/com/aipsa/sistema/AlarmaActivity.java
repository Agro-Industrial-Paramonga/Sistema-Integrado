package com.aipsa.sistema;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Pantalla de ALARMA.
 *
 * Se muestra encima de la pantalla de bloqueo, enciende la pantalla sola,
 * reproduce el sonido de alarma del celular EN BUCLE y vibra hasta que el
 * usuario pulsa el boton DETENER.
 */
public class AlarmaActivity extends Activity {

    public static final int ID_NOTIFICACION = 1001;

    private MediaPlayer reproductor;
    private Vibrator vibrador;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Mostrarse sobre el bloqueo y encender la pantalla
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
                | WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON);

        String titulo = getIntent().getStringExtra("titulo");
        String cuerpo = getIntent().getStringExtra("cuerpo");
        if (titulo == null || titulo.trim().isEmpty()) titulo = "ALERTA DE HUAYCO";
        if (cuerpo == null || cuerpo.trim().isEmpty()) {
            cuerpo = "Se ha autorizado el inicio de los planes de accion.";
        }

        setContentView(construirVista(titulo, cuerpo));

        iniciarSonido();
        iniciarVibracion();
    }

    private View construirVista(String titulo, String cuerpo) {
        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setBackgroundColor(Color.parseColor("#B91C1C"));
        raiz.setGravity(Gravity.CENTER);
        raiz.setPadding(56, 56, 56, 56);

        TextView icono = new TextView(this);
        icono.setText("\u26A0");
        icono.setTextSize(80);
        icono.setGravity(Gravity.CENTER);
        icono.setTextColor(Color.WHITE);
        raiz.addView(icono);

        TextView tvTitulo = new TextView(this);
        tvTitulo.setText(titulo);
        tvTitulo.setTextSize(30);
        tvTitulo.setTextColor(Color.WHITE);
        tvTitulo.setTypeface(Typeface.DEFAULT_BOLD);
        tvTitulo.setGravity(Gravity.CENTER);
        tvTitulo.setPadding(0, 28, 0, 18);
        raiz.addView(tvTitulo);

        TextView tvCuerpo = new TextView(this);
        tvCuerpo.setText(cuerpo);
        tvCuerpo.setTextSize(18);
        tvCuerpo.setTextColor(Color.WHITE);
        tvCuerpo.setGravity(Gravity.CENTER);
        raiz.addView(tvCuerpo);

        Button boton = new Button(this);
        boton.setText("DETENER");
        boton.setTextSize(26);
        boton.setTypeface(Typeface.DEFAULT_BOLD);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 170);
        params.setMargins(0, 72, 0, 0);
        boton.setLayoutParams(params);
        boton.setBackgroundColor(Color.WHITE);
        boton.setTextColor(Color.parseColor("#B91C1C"));
        boton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                detenerTodo();
            }
        });
        raiz.addView(boton);

        return raiz;
    }

    private void iniciarSonido() {
        try {
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            if (uri == null) return;

            reproductor = new MediaPlayer();
            reproductor.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            reproductor.setDataSource(this, uri);
            reproductor.setLooping(true);
            reproductor.setVolume(1.0f, 1.0f);
            reproductor.prepare();
            reproductor.start();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void iniciarVibracion() {
        try {
            vibrador = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrador == null || !vibrador.hasVibrator()) return;
            long[] patron = {0, 800, 400};
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrador.vibrate(VibrationEffect.createWaveform(patron, 0));
            } else {
                vibrador.vibrate(patron, 0);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    /** Detiene sonido, vibracion y la notificacion, y cierra la pantalla. */
    private void detenerTodo() {
        try {
            if (reproductor != null) {
                if (reproductor.isPlaying()) reproductor.stop();
                reproductor.release();
                reproductor = null;
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        try {
            if (vibrador != null) {
                vibrador.cancel();
                vibrador = null;
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        try {
            NotificationManager nm =
                    (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(ID_NOTIFICACION);
        } catch (Exception e) {
            e.printStackTrace();
        }
        finish();
    }

    @Override
    protected void onDestroy() {
        try {
            if (reproductor != null) {
                if (reproductor.isPlaying()) reproductor.stop();
                reproductor.release();
                reproductor = null;
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        try {
            if (vibrador != null) {
                vibrador.cancel();
                vibrador = null;
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        super.onDestroy();
    }

    /** El boton atras NO cierra la alarma: hay que pulsar DETENER. */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        // Intencionalmente vacio
    }
}
