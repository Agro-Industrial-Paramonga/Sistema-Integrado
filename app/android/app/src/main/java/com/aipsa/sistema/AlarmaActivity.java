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
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.Locale;

/**
 * Pantalla de ALARMA.
 *
 * Se muestra encima de la pantalla de bloqueo, enciende la pantalla sola,
 * reproduce el sonido de alarma del celular EN BUCLE, VIBRA y ADEMAS DICE
 * EN VOZ ALTA la alerta, hasta que el usuario pulsa el boton DETENER.
 */
public class AlarmaActivity extends Activity {

    public static final int ID_NOTIFICACION = 1001;

    /** Cada cuantos milisegundos se repite el aviso hablado. */
    private static final long REPETIR_VOZ_MS = 12000;

    private MediaPlayer reproductor;
    private Vibrator vibrador;

    private TextToSpeech voz;
    private boolean vozLista = false;
    private String textoParaVoz = "";
    private final Handler manejador = new Handler(Looper.getMainLooper());
    private final Runnable repetirVoz = new Runnable() {
        @Override
        public void run() {
            hablar();
            manejador.postDelayed(this, REPETIR_VOZ_MS);
        }
    };

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
        iniciarVoz(titulo, cuerpo);
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

    /* ============================================================
       VOZ: dice en voz alta el titulo y el mensaje de la alerta,
       y lo repite cada pocos segundos mientras la alarma este activa.
       ============================================================ */
    private void iniciarVoz(String titulo, String cuerpo) {
        textoParaVoz = limpiarParaVoz(titulo + ". " + cuerpo);
        if (textoParaVoz.isEmpty()) return;

        voz = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int estado) {
                if (estado != TextToSpeech.SUCCESS || voz == null) return;

                int resultado = voz.setLanguage(new Locale("es", "ES"));
                if (resultado == TextToSpeech.LANG_MISSING_DATA
                        || resultado == TextToSpeech.LANG_NOT_SUPPORTED) {
                    resultado = voz.setLanguage(new Locale("es", "US"));
                }
                if (resultado == TextToSpeech.LANG_MISSING_DATA
                        || resultado == TextToSpeech.LANG_NOT_SUPPORTED) {
                    voz.setLanguage(Locale.getDefault());
                }

                voz.setSpeechRate(0.95f);
                voz.setPitch(1.0f);

                voz.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String id) { }
                    @Override public void onDone(String id) { restaurarVolumen(); }
                    @Override public void onError(String id) { restaurarVolumen(); }
                });

                vozLista = true;
                hablar();
                manejador.postDelayed(repetirVoz, REPETIR_VOZ_MS);
            }
        });
    }

    /** Baja el sonido de la alarma mientras habla, para que se entienda. */
    private void hablar() {
        if (!vozLista || voz == null || textoParaVoz.isEmpty()) return;
        try {
            if (reproductor != null) reproductor.setVolume(0.15f, 0.15f);
            voz.speak(textoParaVoz, TextToSpeech.QUEUE_FLUSH, null, "alarma-voz");
        } catch (Exception e) {
            e.printStackTrace();
            restaurarVolumen();
        }
    }

    private void restaurarVolumen() {
        try {
            if (reproductor != null) reproductor.setVolume(1.0f, 1.0f);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    /** Quita emojis y simbolos raros para que la voz no los lea. */
    private String limpiarParaVoz(String texto) {
        if (texto == null) return "";
        return texto
                .replaceAll("[\\p{So}\\p{Sk}\\p{Cn}]", " ")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private void detenerVoz() {
        try {
            manejador.removeCallbacksAndMessages(null);
            if (voz != null) {
                voz.stop();
                voz.shutdown();
                voz = null;
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        vozLista = false;
        restaurarVolumen();
    }

    /** Detiene sonido, vibracion, voz y la notificacion, y cierra la pantalla. */
    private void detenerTodo() {
        detenerVoz();
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
        detenerVoz();
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
