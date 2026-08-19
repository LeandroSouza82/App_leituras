package com.fastleituras.app;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivityShare";

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
                }
            } catch (Exception e) {
                Log.e(TAG, "Erro ao processar URI de compartilhamento", e);
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

            File targetDir = new File(getFilesDir(), "planilhas_recebidas");
            if (!targetDir.exists()) {
                targetDir.mkdirs();
            }

            File destFile = new File(targetDir, fileName);

            InputStream inputStream = resolver.openInputStream(uri);
            FileOutputStream outputStream = new FileOutputStream(destFile);

            byte[] buffer = new byte[4096];
            int bytesRead;
            while ((bytesRead = inputStream.read(buffer)) != -1) {
                outputStream.write(buffer, 0, bytesRead);
            }

            outputStream.flush();
            outputStream.close();
            inputStream.close();

            Log.d(TAG, "Arquivo copiado com sucesso para: " + destFile.getAbsolutePath());
            return Uri.fromFile(destFile);
        } catch (Exception e) {
            Log.e(TAG, "Falha ao copiar URI para armazenamento interno: " + uri, e);
            return uri;
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
