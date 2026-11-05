package com.aipsa.sistema;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.Gravity;
import android.view.KeyEvent;
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
// version de prueba del actualizador: 2026-10-26
// prueba de actualizacion 2026-10-26 16:09
// prueba v108 16:18:30
// prueba firma fija 16:28:12
// prueba final de actualizacion 16:35
// prueba actualizacion 26/10 17:12
public class AlarmaActivity extends Activity {

    public static final int ID_NOTIFICACION = 1001;

    /** Cada cuantos milisegundos se repite el aviso hablado. */
    private static final long REPETIR_VOZ_MS = 5000;

    private MediaPlayer reproductor;
    private AudioTrack pistaSirena;
    private Vibrator vibrador;

    /* Volumen: la sirena va por el canal de ALARMA. Mientras la alarma esta
       en pantalla se fuerza ese canal al maximo y se vigila cada segundo,
       para que bajar el volumen o silenciar el equipo no la apague. */
    private AudioManager audio;
    private final Handler manejadorVolumen = new Handler(Looper.getMainLooper());
    private int volumenPrevio = -1;
    private boolean volumenForzado = false;

    /* No Molestar: si el equipo esta en silencio total, la sirena no suena.
       Con el permiso de acceso a No molestar se cambia el filtro mientras
       dura la alarma y se restaura al pulsar DETENER. Sin el permiso, se
       muestra un boton que lleva directo a concederlo. */
    private NotificationManager notificaciones;
    private int filtroPrevio = -1;
    private boolean filtroForzado = false;

    private TextToSpeech voz;
    private boolean vozLista = false;
    private String textoParaVoz = "";
    private final Handler manejador = new Handler(Looper.getMainLooper());
            private final Runnable repetirVoz = new Runnable() {
        @Override
        public void run() {
            hablar();
            // Ya NO ponemos aquí el postDelayed, se lo dejamos al sistema
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
        
        // 👇 CREAMOS LA VARIABLE DEL COLOR (por defecto rojo) 👇
        String colorFondo = "#B91C1C"; 

        if (titulo != null && titulo.contains("VERDE")) {
            titulo = "MONITOREO DIARIO"; 
            cuerpo = "José Mariano Melgar Belmont ha declarado el estado de emergencia en nivel VERDE.";
            colorFondo = "#16A34A"; // 🟢 Verde
            
        } else if (titulo != null && titulo.contains("AMARILLO")) {
            titulo = "Semáforo: AMARILLO";
            cuerpo = "José Mariano Melgar Belmont ha declarado el estado de emergencia en nivel AMARILLO. Se solicita ejecutar inmediatamente las actividades que comprenden el plan de contingencia.";
            colorFondo = "#EAB308"; // 🟡 Ámbar / Amarillo
            
        } else if (titulo != null && titulo.contains("ROJO")) {
            titulo = "Semáforo: ROJO";
            cuerpo = "José Mariano Melgar Belmont ha declarado el Estado de Emergencia en Nivel ROJO. Se solicita ejecutar inmediatamente las actividades que comprenden el plan de contingencia.";
            colorFondo = "#B91C1C"; // 🔴 Rojo
        } else {
            // Texto de respaldo
            if (titulo == null || titulo.trim().isEmpty()) titulo = "ALERTA DE HUAYCO";
            if (cuerpo == null || cuerpo.trim().isEmpty()) {
                cuerpo = "Se ha autorizado el inicio de los planes de accion.";
            }
        }

        // 👇 LE PASAMOS EL COLOR A LA VISTA 👇
        LinearLayout raiz = construirVista(titulo, cuerpo, colorFondo);
        setContentView(raiz);

        // La pantalla ya esta abierta: se corta el tono de la notificacion
        // para que solo suene la sirena (evita audio duplicado).
        try {
            NotificationManager nm =
                    (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(ID_NOTIFICACION);
        } catch (Exception e) {
            e.printStackTrace();
        }

        iniciarSonido();
        iniciarVibracion();
        iniciarVoz(titulo, cuerpo);

        // Que suene fuerte aunque el equipo este en silencio o con el
        // audio del sistema bajo
        prepararVolumen();
        revisarNoMolestar(raiz);
    }

           // 👇 Recibe el parámetro colorFondo 👇
    private LinearLayout construirVista(String titulo, String cuerpo, String colorFondo) {
        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        
        // 👇 Aplica el color al fondo 👇
        raiz.setBackgroundColor(Color.parseColor(colorFondo)); 
        
        raiz.setGravity(Gravity.CENTER);
        raiz.setPadding(56, 56, 56, 56);

        // 1. Ícono de advertencia
        TextView icono = new TextView(this);
        icono.setText("\u26A0");
        icono.setTextSize(80);
        icono.setGravity(Gravity.CENTER);
        icono.setTextColor(Color.WHITE);
        raiz.addView(icono);

        // 2. Título
        TextView tvTitulo = new TextView(this);
        tvTitulo.setText(titulo);
        tvTitulo.setTextSize(30);
        tvTitulo.setTextColor(Color.WHITE);
        tvTitulo.setTypeface(Typeface.DEFAULT_BOLD);
        tvTitulo.setGravity(Gravity.CENTER);
        tvTitulo.setPadding(0, 28, 0, 18);
        raiz.addView(tvTitulo);

        // 3. Mensaje
        TextView tvCuerpo = new TextView(this);
        tvCuerpo.setText(cuerpo);
        tvCuerpo.setTextSize(18);
        tvCuerpo.setTextColor(Color.WHITE);
        tvCuerpo.setGravity(Gravity.CENTER);
        raiz.addView(tvCuerpo);

        // 4. Botón
        Button boton = new Button(this);
        boton.setText("DETENER");
        boton.setTextSize(26);
        boton.setTypeface(Typeface.DEFAULT_BOLD);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 170);
        params.setMargins(0, 72, 0, 0);
        boton.setLayoutParams(params);
        boton.setBackgroundColor(Color.WHITE);
        
        // 👇 El texto del botón también cambia al color del fondo 👇
        boton.setTextColor(Color.parseColor(colorFondo)); 
        
        boton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                detenerTodo();
            }
        });
        raiz.addView(boton);

        return raiz;
    }

    /** Sirena generada en el propio telefono: sube y baja de tono. */
    private void iniciarSonido() {
        try {
            final int frecuencia = 44100;
            final int duracionMs = 3600;
            final int muestras = frecuencia * duracionMs / 1000;

            final short[] buffer = new short[muestras];
            double fase = 0.0;
            for (int i = 0; i < muestras; i++) {
                double avance = (double) i / muestras;

                // Barrido tipo sirena de emergencia: sube y baja lentamente
                double ciclo = 0.5 - 0.5 * Math.cos(2 * Math.PI * avance);
                double tono = 520 + 620 * ciclo;

                fase += 2 * Math.PI * tono / frecuencia;

                // Tono con armonicos: mas grave y con cuerpo, menos "juguete"
                double onda = Math.sin(fase) * 0.62
                        + Math.sin(2 * fase) * 0.22
                        + Math.sin(3 * fase) * 0.10;

                // Envolvente suave para evitar chasquidos al repetir
                double envolvente = Math.min(1.0, Math.min(avance, 1.0 - avance) * 25);

                buffer[i] = (short) (onda * envolvente * 0.9 * Short.MAX_VALUE);
            }

            pistaSirena = new AudioTrack.Builder()
                    .setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build())
                    .setAudioFormat(new AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setSampleRate(frecuencia)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build())
                    .setBufferSizeInBytes(buffer.length * 2)
                    .setTransferMode(AudioTrack.MODE_STATIC)
                    .build();

            pistaSirena.write(buffer, 0, buffer.length);
            pistaSirena.setLoopPoints(0, buffer.length, -1);
            pistaSirena.setVolume(1.0f);
            pistaSirena.play();
        } catch (Exception e) {
            e.printStackTrace();
            iniciarSonidoRespaldo();
        }
    }

    /** Si la sirena falla, usa el tono de alarma del sistema. */
    private void iniciarSonidoRespaldo() {
        try {
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (uri == null) return;
            reproductor = new MediaPlayer();
            reproductor.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            reproductor.setDataSource(this, uri);
            reproductor.setLooping(true);
            reproductor.prepare();
            reproductor.start();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void bajarVolumen() {
        try {
            if (pistaSirena != null) pistaSirena.setVolume(0.18f);
            if (reproductor != null) reproductor.setVolume(0.18f, 0.18f);
        } catch (Exception e) { e.printStackTrace(); }
    }

    private void subirVolumen() {
        try {
            if (pistaSirena != null) pistaSirena.setVolume(1.0f);
            if (reproductor != null) reproductor.setVolume(1.0f, 1.0f);
        } catch (Exception e) { e.printStackTrace(); }
    }

    /* ============================================================
       QUE SUENE FUERTE AUNQUE EL EQUIPO ESTE EN SILENCIO
       ------------------------------------------------------------
       La sirena va por el canal "Alarma", que Android NO apaga con el
       modo silencio/vibrar. El problema es otro: ese canal puede estar
       bajo o en cero, y los botones de volumen lo bajan mientras suena.
       Por eso se guarda el volumen, se pone al maximo y se vuelve a
       subir cada segundo hasta que se pulsa DETENER.
       ============================================================ */
    private void prepararVolumen() {
        try {
            audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (audio == null) return;
            if (volumenPrevio < 0) {
                volumenPrevio = audio.getStreamVolume(AudioManager.STREAM_ALARM);
            }
            subirCanalAlarma();
            manejadorVolumen.removeCallbacksAndMessages(null);
            manejadorVolumen.postDelayed(vigilarVolumen, 1000);
        } catch (Exception e) { e.printStackTrace(); }
    }

    private final Runnable vigilarVolumen = new Runnable() {
        @Override
        public void run() {
            subirCanalAlarma();
            manejadorVolumen.postDelayed(this, 1000);
        }
    };

    /** Sube el canal de alarma al maximo (flag 0: sin interfaz y sin pitido). */
    private void subirCanalAlarma() {
        try {
            if (audio == null) return;
            int maximo = audio.getStreamMaxVolume(AudioManager.STREAM_ALARM);
            int actual = audio.getStreamVolume(AudioManager.STREAM_ALARM);
            if (actual < maximo) {
                audio.setStreamVolume(AudioManager.STREAM_ALARM, maximo, 0);
                volumenForzado = true;
            }
        } catch (Exception e) { e.printStackTrace(); }
    }

    /** Devuelve el volumen que tenia el equipo antes de la alarma. */
    private void restaurarCanalAlarma() {
        try {
            manejadorVolumen.removeCallbacksAndMessages(null);
            if (audio != null && volumenForzado && volumenPrevio >= 0) {
                audio.setStreamVolume(AudioManager.STREAM_ALARM, volumenPrevio, 0);
            }
        } catch (Exception e) { e.printStackTrace(); }
        volumenForzado = false;
    }

    /* ============================================================
       NO MOLESTAR (silencio total)
       Con el permiso de "acceso a No molestar" se cambia el filtro
       mientras dura la alarma y se restaura al cerrarla. Sin permiso,
       se muestra un boton que lleva directo a concederlo.
       ============================================================ */
    private void revisarNoMolestar(LinearLayout raiz) {
        try {
            notificaciones = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (notificaciones == null) return;
            if (alarmaBloqueada()) {
                if (notificaciones.isNotificationPolicyAccessGranted()) {
                    abrirFiltro();
                } else {
                    mostrarBotonNoMolestar(raiz);
                }
            }
        } catch (Exception e) { e.printStackTrace(); }
    }

    /** true si No molestar esta activo y las alarmas no pasan. */
    private boolean alarmaBloqueada() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false;
        try {
            if (notificaciones == null) return false;
            int filtro = notificaciones.getCurrentInterruptionFilter();
            if (filtro == NotificationManager.INTERRUPTION_FILTER_ALL
                    || filtro == NotificationManager.INTERRUPTION_FILTER_UNKNOWN) return false;
            if (filtro == NotificationManager.INTERRUPTION_FILTER_NONE) return true;
            NotificationManager.Policy politica = notificaciones.getNotificationPolicy();
            boolean alarmas = (politica.priorityCategories
                    & NotificationManager.Policy.PRIORITY_CATEGORY_ALARMS) != 0;
            return !alarmas;
        } catch (Exception e) {
            return false;
        }
    }

    private void abrirFiltro() {
        try {
            if (notificaciones == null) return;
            filtroPrevio = notificaciones.getCurrentInterruptionFilter();
            notificaciones.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALL);
            filtroForzado = true;
        } catch (Exception e) { e.printStackTrace(); }
    }

    private void restaurarNoMolestar() {
        try {
            if (notificaciones != null && filtroForzado && filtroPrevio >= 0) {
                notificaciones.setInterruptionFilter(filtroPrevio);
            }
        } catch (Exception e) { e.printStackTrace(); }
        filtroForzado = false;
    }

    private void mostrarBotonNoMolestar(LinearLayout raiz) {
        if (raiz == null) return;
        try {
            TextView aviso = new TextView(this);
            aviso.setText("Tu equipo esta en No molestar y las alarmas estan bloqueadas. "
                    + "Concede el acceso para que esta alarma suene.");
            aviso.setTextSize(15);
            aviso.setTextColor(Color.WHITE);
            aviso.setGravity(Gravity.CENTER);
            aviso.setPadding(0, 26, 0, 8);
            raiz.addView(aviso);

            Button boton = new Button(this);
            boton.setText("PERMITIR SONIDO DE ALARMA");
            boton.setTextSize(16);
            boton.setTypeface(Typeface.DEFAULT_BOLD);
            boton.setBackgroundColor(Color.WHITE);
            boton.setTextColor(Color.parseColor("#B91C1C"));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, 130);
            params.setMargins(0, 4, 0, 0);
            boton.setLayoutParams(params);
            boton.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    abrirAjusteNoMolestar();
                }
            });
            raiz.addView(boton);
        } catch (Exception e) { e.printStackTrace(); }
    }

    /** Lleva directo a la pantalla donde se concede el acceso a No molestar. */
    private void abrirAjusteNoMolestar() {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS);
            startActivity(intent);
        } catch (Exception e) {
            try {
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            } catch (Exception e2) { e.printStackTrace(); }
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        /* Al volver de los ajustes de No molestar se aplica sin reiniciar
           la alarma; y se reafirma el volumen por si el sistema lo bajo. */
        try {
            if (notificaciones == null) {
                notificaciones = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            }
            if (notificaciones != null && !filtroForzado
                    && notificaciones.isNotificationPolicyAccessGranted()
                    && alarmaBloqueada()) {
                abrirFiltro();
            }
        } catch (Exception e) { e.printStackTrace(); }
        subirCanalAlarma();
    }

    /** Las teclas de volumen no bajan ni silencian la alarma. */
    @Override
    public boolean dispatchKeyEvent(KeyEvent evento) {
        int codigo = evento.getKeyCode();
        if (codigo == KeyEvent.KEYCODE_VOLUME_UP
                || codigo == KeyEvent.KEYCODE_VOLUME_DOWN
                || codigo == KeyEvent.KEYCODE_VOLUME_MUTE) {
            return true;
        }
        return super.dispatchKeyEvent(evento);
    }

    private void detenerSonido() {
        try {
            if (pistaSirena != null) {
                if (pistaSirena.getPlayState() == AudioTrack.PLAYSTATE_PLAYING) pistaSirena.stop();
                pistaSirena.release();
                pistaSirena = null;
            }
        } catch (Exception e) { e.printStackTrace(); }
        try {
            if (reproductor != null) {
                if (reproductor.isPlaying()) reproductor.stop();
                reproductor.release();
                reproductor = null;
            }
        } catch (Exception e) { e.printStackTrace(); }
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

                /* La voz tambien por el canal de alarma: si el equipo tiene
                   el volumen de multimedia en cero, igual se escucha. */
                try {
                    voz.setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build());
                } catch (Exception e) { e.printStackTrace(); }

                voz.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String id) { }
                    @Override public void onDone(String id) { 
                        restaurarVolumen(); 
                        // 👇 Se repite solo cuando termina de hablar 👇
                        manejador.postDelayed(repetirVoz, REPETIR_VOZ_MS);
                    }
                    @Override public void onError(String id) { 
                        restaurarVolumen(); 
                    }
                });

                // 👇 ESTAS DOS LÍNEAS TE FALTABAN Y SON VITALES 👇
                vozLista = true;
                hablar(); 
                // 👆 SIN ESTO, NO HABLA 👆
            }
        });
    }

    /** Baja el sonido de la alarma mientras habla, para que se entienda. */
    private void hablar() {
        if (!vozLista || voz == null || textoParaVoz.isEmpty()) return;
        try {
            bajarVolumen();
            voz.speak(textoParaVoz, TextToSpeech.QUEUE_FLUSH, null, "alarma-voz");
        } catch (Exception e) {
            e.printStackTrace();
            restaurarVolumen();
        }
    }

    private void restaurarVolumen() {
        subirVolumen();
    }

    /** Quita emojis y simbolos raros para que la voz no los lea. */
    private String limpiarParaVoz(String texto) {
        if (texto == null) return "";
        String limpio = texto
                .replaceAll("[\\p{So}\\p{Sk}\\p{Cn}]", " ")
                .replaceAll("\\s+", " ")
                .trim();

        // El sintetizador deletrea las siglas en mayuscula: se le da la
        // forma hablada para que diga "huayco" de corrido.
        limpio = limpio.replaceAll("(?i)huayco", "uayco");
        limpio = limpio.replaceAll("(?i)huaycos", "uaycos");
        limpio = limpio.replaceAll("(?i)alerta de uayco", "alerta de uayco");

        return limpio;
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
        detenerSonido();
        restaurarCanalAlarma();
        restaurarNoMolestar();
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
        detenerSonido();
        restaurarCanalAlarma();
        restaurarNoMolestar();
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
