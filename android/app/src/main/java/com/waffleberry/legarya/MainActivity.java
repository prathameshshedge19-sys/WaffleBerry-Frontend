package com.waffleberry.legarya;

import android.content.Intent;
import android.app.Activity;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.ValueCallback;

import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TRUSTED_ORIGIN = "https://localhost";
    private static final int VOICE_PICKER_REQUEST = 21021;
    private ValueCallback<Uri[]> pendingVoicePicker;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(LegaryaNativePlugin.class);
        super.onCreate(savedInstanceState);
        if (bridge == null) return;

        WebView webView = bridge.getWebView();
        WebSettings settings = webView.getSettings();
        settings.setAllowFileAccess(false);
        // The WebView needs ContentResolver access to consume the one URI
        // explicitly returned by Android's system picker. With no storage
        // permissions, the OS grant remains scoped to that selected item.
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) WebView.startSafeBrowsing(this, null);
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.setWebChromeClient(new TrustedWebChromeClient());
        bridge.setWebViewClient(new TrustedWebViewClient());
    }

    @Override
    public void onResume() {
        super.onResume();
        LegaryaNativePlugin.setAppForeground(true);
    }

    @Override
    public void onPause() {
        LegaryaNativePlugin.setAppForeground(false);
        // Persist the rotating cross-site refresh cookie before Android may
        // reclaim this process while it is backgrounded.
        CookieManager.getInstance().flush();
        super.onPause();
    }

    private final class TrustedWebChromeClient extends BridgeWebChromeClient {
        TrustedWebChromeClient() { super(bridge); }

        @Override
        public void onPermissionRequest(PermissionRequest request) {
            runOnUiThread(() -> {
                if (LegaryaNativePlugin.consumeAudioGrant(request.getOrigin(), request.getResources(), MainActivity.this)) {
                    request.grant(new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE });
                } else {
                    request.deny();
                }
            });
        }

        @Override
        public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (TrustedRequestPolicy.requestsVoiceMedia(params.getAcceptTypes())) {
                if (!TrustedRequestPolicy.isAllowedVoicePicker(webView.getUrl(), params.getAcceptTypes(),
                        params.isCaptureEnabled(), LegaryaNativePlugin.isAppForeground() && webView.hasWindowFocus())) {
                    callback.onReceiveValue(null);
                    return true;
                }
                if (pendingVoicePicker != null) pendingVoicePicker.onReceiveValue(null);
                pendingVoicePicker = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("*/*")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    .putExtra(Intent.EXTRA_MIME_TYPES, TrustedRequestPolicy.VOICE_PICKER_TYPES.toArray(new String[0]));
                try {
                    startActivityForResult(intent, VOICE_PICKER_REQUEST);
                } catch (RuntimeException error) {
                    pendingVoicePicker = null;
                    callback.onReceiveValue(null);
                }
                return true;
            }
            if (params.isCaptureEnabled()) {
                callback.onReceiveValue(null);
                return true;
            }
            return super.onShowFileChooser(webView, callback, params);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != VOICE_PICKER_REQUEST) {
            super.onActivityResult(requestCode, resultCode, data);
            return;
        }
        ValueCallback<Uri[]> callback = pendingVoicePicker;
        pendingVoicePicker = null;
        if (callback == null) return;
        Uri uri = resultCode == Activity.RESULT_OK && data != null ? data.getData() : null;
        String mime = uri == null ? null : getContentResolver().getType(uri);
        if (uri == null || !"content".equals(uri.getScheme())
                || !TrustedRequestPolicy.VOICE_PICKER_TYPES.contains(mime)) {
            callback.onReceiveValue(null);
            return;
        }
        callback.onReceiveValue(new Uri[] { uri });
    }

    @Override
    public void onDestroy() {
        if (pendingVoicePicker != null) pendingVoicePicker.onReceiveValue(null);
        pendingVoicePicker = null;
        super.onDestroy();
    }

    private final class TrustedWebViewClient extends BridgeWebViewClient {
        TrustedWebViewClient() { super(bridge); }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (!request.isForMainFrame()) return super.shouldOverrideUrlLoading(view, request);
            Uri uri = request.getUrl();
            String origin = uri.getScheme() + "://" + uri.getHost() + (uri.getPort() == -1 ? "" : ":" + uri.getPort());
            if (TRUSTED_ORIGIN.equals(origin)) return false;
            if (TrustedRequestPolicy.isSafeExternalScheme(uri.getScheme())) {
                Intent external = new Intent(Intent.ACTION_VIEW, uri);
                external.addCategory(Intent.CATEGORY_BROWSABLE);
                try { startActivity(external); } catch (RuntimeException ignored) {}
            }
            return true;
        }
    }
}
