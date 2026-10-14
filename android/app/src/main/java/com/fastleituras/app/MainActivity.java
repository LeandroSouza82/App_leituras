package com.fastleituras.app;

import android.content.ContentResolver;
import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Log;
import android.widget.Toast;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivityShare";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // O Bridge captura a URI inicial durante super.onCreate: prepare o arquivo antes.
        handleIntent(getIntent());
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    /**
     * Intercepta Intents de compartilhamento (ACTION_SEND / ACTION_VIEW),
     * copia o arquivo para o armazenamento interno acessível do app e
     * notifica o Capacitor Bridge para disparar o evento 'appUrlOpen'.
     */
    private void handleIntent(Intent intent) {
        if (intent == null) return;

        String action = intent.getAction();
        String type = intent.getType();

        Log.d(TAG, "handleIntent chamado com Action: " + action + ", Type: " + type);

        Uri incomingUri = null;

        if (Intent.ACTION_SEND.equals(action)) {
            incomingUri = (Uri) intent.getParcelableExtra(Intent.EXTRA_STREAM);
        } else if (Intent.ACTION_VIEW.equals(action)) {
            incomingUri = intent.getData();
            if (incomingUri != null && !"content".equals(incomingUri.getScheme()) && !"file".equals(incomingUri.getScheme())) return;
        }

        if (Intent.ACTION_SEND.equals(action) && incomingUri == null) {
            ClipData clipData = intent.getClipData();
            if (clipData != null && clipData.getItemCount() > 0) {
                incomingUri = clipData.getItemAt(0).getUri();
            }
            if (incomingUri == null) incomingUri = intent.getData();
        }

        if (Intent.ACTION_SEND.equals(action) && incomingUri == null) {
            Toast.makeText(this, "Nenhum arquivo recebido. Baixe a planilha e compartilhe pelo aplicativo Arquivos.", Toast.LENGTH_LONG).show();
        }

        if (incomingUri != null) {
            try {
                // Copia o arquivo recebido para a pasta de arquivos do app
                Uri localFileUri = copyUriToInternalStorage(incomingUri);
                if (localFileUri != null) {
                    intent.setData(localFileUri);
                    intent.setAction(Intent.ACTION_VIEW);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    setIntent(intent);

                    if (getBridge() != null) {
                        getBridge().onNewIntent(intent);
                    }
                } else {
                    Toast.makeText(this, "Não foi possível acessar a planilha. Baixe o arquivo novamente e tente compartilhar.", Toast.LENGTH_LONG).show();
                }
            } catch (Exception e) {
                Log.e(TAG, "Erro ao processar URI de compartilhamento", e);
                Toast.makeText(this, "Não foi possível receber a planilha. Tente compartilhar pelo aplicativo Arquivos.", Toast.LENGTH_LONG).show();
            }
        }
    }

    private Uri copyUriToInternalStorage(Uri uri) {
        try {
            ContentResolver resolver = getContentResolver();
            String fileName = getFileNameFromUri(uri);
            if (fileName == null || fileName.isEmpty()) {
                fileName = "shared_" + System.currentTimeMillis() + ".xlsx";
            }
            fileName = fileName.replace('\\', '_').replace('/', '_');

            File targetDir = new File(getFilesDir(), "planilhas_recebidas");
            if (!targetDir.exists()) {
                if (!targetDir.mkdirs()) throw new java.io.IOException("Não foi possível criar a pasta de recebimento");
            }

            File deliveryDir = new File(targetDir, java.util.UUID.randomUUID().toString());
            if (!deliveryDir.mkdirs()) throw new java.io.IOException("Não foi possível criar a pasta do arquivo");
            File destFile = new File(deliveryDir, fileName);

            try (InputStream inputStream = resolver.openInputStream(uri)) {
                if (inputStream == null) throw new java.io.IOException("Arquivo indisponível");
                try (FileOutputStream outputStream = new FileOutputStream(destFile)) {
                    byte[] buffer = new byte[4096];
                    int bytesRead;
                    while ((bytesRead = inputStream.read(buffer)) != -1) {
                        outputStream.write(buffer, 0, bytesRead);
                    }
                }
            }
            if (destFile.length() == 0) throw new java.io.IOException("Arquivo vazio");

            Log.d(TAG, "Arquivo copiado com sucesso para: " + destFile.getAbsolutePath());
            return Uri.fromFile(destFile);
        } catch (Exception e) {
            Log.e(TAG, "Falha ao copiar URI para armazenamento interno: " + uri, e);
            return null;
        }
    }

    private String getFileNameFromUri(Uri uri) {
        String result = null;
        if ("content".equals(uri.getScheme())) {
            try (Cursor cursor = getContentResolver().query(uri, null, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    if (nameIndex >= 0) {
                        result = cursor.getString(nameIndex);
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "Não foi possível obter nome do arquivo via ContentResolver", e);
            }
        }
        if (result == null) {
            result = uri.getLastPathSegment();
        }
        return result;
    }
}
