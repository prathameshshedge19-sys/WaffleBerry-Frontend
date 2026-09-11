package com.waffleberry.legarya;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TRUSTED_ORIGIN = "https://localhost";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(LegaryaNativePlugin.class);
        super.onCreate(savedInstanceState);
        if (bridge == null) return;

        WebView webView = bridge.getWebView();
        WebSettings settings = webView.getSettings();
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
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
        public boolean onShowFileChooser(WebView webView, android.webkit.ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (params.isCaptureEnabled()) {
                callback.onReceiveValue(null);
                return true;
            }
            return super.onShowFileChooser(webView, callback, params);
        }
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
