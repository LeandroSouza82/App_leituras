package com.fastleituras.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    /**
     * Intercepta Intents de compartilhamento (ACTION_SEND) e os converte
     * para um formato que o listener 'appUrlOpen' do Capacitor consiga processar.
     */
    private void handleIntent(Intent intent) {
        String action = intent.getAction();
        String type = intent.getType();

        if (Intent.ACTION_SEND.equals(action) && type != null) {
            Uri fileUri = (Uri) intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (fileUri != null) {
                // Redireciona o dado do stream para o Data do Intent
                // permitindo que o Capacitor trate como abertura de arquivo
                intent.setData(fileUri);
                intent.setAction(Intent.ACTION_VIEW);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                setIntent(intent);
            }
        }
    }
}
