package com.aipsa.sistema;

import com.getcapacitor.BridgeActivity;

import android.os.Bundle;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registrar el plugin propio de alarma.
        // IMPORTANTE: debe ir ANTES de super.onCreate().
        registerPlugin(AlarmaPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
