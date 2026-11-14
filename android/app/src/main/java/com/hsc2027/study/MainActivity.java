package com.hsc2027.study;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.webkit.WebViewAssetLoader;
import java.io.ByteArrayInputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

/** Local-only WebView. Only packaged app assets run with access to the bridge. */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/assets/index.html";
    private static final int PICK_FILE = 101, SAVE_FILE = 102;
    private WebView web;
    private WebViewAssetLoader assets;
    private ValueCallback<Uri[]> chooser;
    private byte[] pendingExport;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        assets = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();
        web = new WebView(this);
        setContentView(web);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true); // Required for the Android file picker.
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.addJavascriptInterface(new LocalBridge(), "HSCAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isLocal(uri) && "GET".equals(request.getMethod())) {
                    WebResourceResponse response = assets.shouldInterceptRequest(uri);
                    if (response != null) return response;
                }
                // Never fall through to a network host or load another origin in this WebView.
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                    Collections.singletonMap("Cache-Control", "no-store"),
                    new ByteArrayInputStream("Not available in offline app".getBytes(StandardCharsets.UTF_8)));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isLocal(uri)) return false;
                if (request.isForMainFrame() && request.hasGesture()) openExternal(uri);
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (chooser != null) chooser.onReceiveValue(null);
                chooser = callback;
                try { startActivityForResult(params.createIntent(), PICK_FILE); }
                catch (ActivityNotFoundException e) { chooser = null; callback.onReceiveValue(null); message("No file picker available."); }
                return true;
            }
            @Override public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message)
                    .setPositiveButton(android.R.string.ok, (dialog, which) -> result.confirm())
                    .setOnCancelListener(dialog -> result.cancel()).show();
                return true;
            }
            @Override public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message)
                    .setPositiveButton(android.R.string.ok, (dialog, which) -> result.confirm())
                    .setNegativeButton(android.R.string.cancel, (dialog, which) -> result.cancel())
                    .setOnCancelListener(dialog -> result.cancel()).show();
                return true;
            }
        });
        web.loadUrl(START);
    }

    private boolean isLocal(Uri uri) {
        return uri != null && "https".equals(uri.getScheme()) && HOST.equals(uri.getHost())
            && uri.getPort() == -1 && uri.getPath() != null && uri.getPath().startsWith("/assets/");
    }
    private void message(String text) { runOnUiThread(() -> Toast.makeText(this, text, Toast.LENGTH_LONG).show()); }
    private void openExternal(Uri uri) {
        if (uri == null || !("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) || uri.getHost() == null) {
            message("Only HTTP or HTTPS links can be opened."); return;
        }
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)); }
        catch (ActivityNotFoundException e) { message("No browser available to open this link."); }
    }
    private class LocalBridge {
        @JavascriptInterface public void openExternal(String url) { runOnUiThread(() -> openExternal(Uri.parse(url))); }
        @JavascriptInterface public void saveFile(String name, String mime, String encoded) {
            if (encoded == null || encoded.length() > 44 * 1024 * 1024) { message("Export is too large. Keep your data and try a smaller export."); return; }
            final byte[] bytes;
            try { bytes = Base64.decode(encoded, Base64.DEFAULT); }
            catch (IllegalArgumentException e) { message("Could not prepare export. Your data is unchanged."); return; }
            final String safeName = (name == null ? "export" : name.replaceAll("[/\\\\\\p{Cntrl}]", "_")).substring(0, Math.min(name == null ? 6 : name.length(), 180));
            final String safeType = mime != null && mime.startsWith("application/pdf") ? "application/pdf" : mime != null && mime.startsWith("text/csv") ? "text/csv" : "application/json";
            runOnUiThread(() -> {
                if (pendingExport != null) { message("Finish the current export first."); return; }
                pendingExport = bytes;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                    .setType(safeType).putExtra(Intent.EXTRA_TITLE, safeName);
                try { startActivityForResult(intent, SAVE_FILE); }
                catch (ActivityNotFoundException e) { pendingExport = null; message("No document picker available. Your data is unchanged."); }
            });
        }
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_FILE && chooser != null) {
            chooser.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data)); chooser = null;
        } else if (requestCode == SAVE_FILE) {
            byte[] bytes = pendingExport; pendingExport = null;
            Uri uri = resultCode == RESULT_OK && data != null ? data.getData() : null;
            if (bytes != null && uri != null) {
                new Thread(() -> {
                    try (OutputStream out = getContentResolver().openOutputStream(uri, "wt")) {
                        if (out == null) throw new java.io.IOException("No output stream");
                        out.write(bytes); out.flush(); message("Export saved. Keep this file private.");
                    } catch (Exception e) { message("Export failed. Your app data is unchanged; please retry."); }
                }).start();
            }
        }
    }
    @Override public void onBackPressed() {
        web.evaluateJavascript("(function(){if(typeof modalState!=='undefined' && modalState){closeModal();return true;}if(currentRoute.name!=='dashboard'){navigate('dashboard');return true;}return false;})()", value -> {
            if (!"true".equals(value)) MainActivity.super.onBackPressed();
        });
    }
    @Override protected void onDestroy() {
        if (chooser != null) { chooser.onReceiveValue(null); chooser = null; }
        web.removeJavascriptInterface("HSCAndroid"); web.destroy();
        super.onDestroy();
    }
}
