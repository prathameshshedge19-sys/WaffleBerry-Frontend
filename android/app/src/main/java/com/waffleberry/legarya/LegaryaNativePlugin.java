package com.waffleberry.legarya;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.provider.Settings;
import android.webkit.CookieManager;
import android.webkit.WebStorage;

import androidx.activity.result.ActivityResult;
import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.CreateCredentialResponse;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.ClearCredentialException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.NoCredentialException;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

import java.io.File;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.Executor;

@CapacitorPlugin(
    name = "LegaryaNative",
    permissions = @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
)
public class LegaryaNativePlugin extends Plugin {
    private static final String BACKEND_ORIGIN = "https://89-167-14-211.sslip.io";
    private static volatile boolean appForeground;
    private static String armedOwner;
    private static long armedAt;

    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private String audioOwner;
    private final Set<Uri> persistedUriGrants = new HashSet<>();

    static void setAppForeground(boolean foreground) {
        appForeground = foreground;
        if (!foreground) {
            synchronized (LegaryaNativePlugin.class) {
                armedOwner = null;
                armedAt = 0;
            }
        }
    }

    static synchronized boolean consumeAudioGrant(Uri origin, String[] resources, Context context) {
        boolean allowed = TrustedRequestPolicy.isAllowedMicrophoneRequest(
            origin == null ? "" : origin.toString().replaceAll("/$", ""),
            resources,
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED,
            appForeground,
            armedOwner,
            armedAt,
            SystemClock.elapsedRealtime()
        );
        armedOwner = null;
        armedAt = 0;
        return allowed;
    }

    @PluginMethod
    public void configureTrustedWebView(PluginCall call) {
        JSObject result = new JSObject();
        result.put("origin", TrustedRequestPolicy.TRUSTED_ORIGIN);
        result.put("thirdPartyCookies", true);
        call.resolve(result);
    }

    @PluginMethod
    public void armMicrophone(PluginCall call) {
        String owner = call.getString("owner", "");
        if (!TrustedRequestPolicy.MICROPHONE_OWNERS.contains(owner)) {
            call.reject("Unknown microphone owner.", "INVALID_OWNER");
            return;
        }
        if (!appForeground) {
            call.reject("Microphone cannot start in the background.", "APP_BACKGROUND");
            return;
        }
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermissionResult");
            return;
        }
        arm(owner, call);
    }

    @PermissionCallback
    private void microphonePermissionResult(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("Microphone permission was denied.", "MICROPHONE_DENIED");
            return;
        }
        // Android may deliver the permission result just before onResume restores
        // the foreground flag. Wait briefly for that ordered lifecycle handoff;
        // a genuinely backgrounded app still fails closed after one second.
        armAfterPermissionResume(call, 10);
    }

    private void armAfterPermissionResume(PluginCall call, int attemptsRemaining) {
        if (appForeground) {
            arm(call.getString("owner", ""), call);
            return;
        }
        if (attemptsRemaining <= 0) {
            call.reject("Microphone cannot start in the background.", "APP_BACKGROUND");
            return;
        }
        new Handler(Looper.getMainLooper()).postDelayed(
            () -> armAfterPermissionResume(call, attemptsRemaining - 1), 100L
        );
    }

    private static synchronized void arm(String owner, PluginCall call) {
        armedOwner = owner;
        armedAt = SystemClock.elapsedRealtime();
        JSObject result = new JSObject();
        result.put("owner", owner);
        result.put("expiresInMs", 10_000);
        call.resolve(result);
    }

    private volatile long focusGeneration = 0;
    private AudioManager.OnAudioFocusChangeListener focusListener;

    @PluginMethod
    public void requestAudioFocus(PluginCall call) {
        String owner = call.getString("owner", "");
        if (!TrustedRequestPolicy.MICROPHONE_OWNERS.contains(owner) || !appForeground) {
            call.reject("Audio focus request is not allowed.", "AUDIO_FOCUS_DENIED");
            return;
        }
        if (owner.equals(audioOwner)) {
            JSObject unchanged = new JSObject(); unchanged.put("granted", true); unchanged.put("idempotent", true); unchanged.put("generation", focusGeneration); call.resolve(unchanged); return;
        }
        releaseAudioFocusInternal();
        final long generation = focusGeneration;
        focusListener = change -> {
            if (generation != focusGeneration) return;
            JSObject event = new JSObject();
            event.put("change", change); event.put("owner", owner); event.put("generation", generation);
            // Never retain a focus event to deliver to a future page/owner.
            notifyListeners("audioFocusChange", event, false);
        };
        audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        int result;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioAttributes attributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build();
            audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(attributes)
                .setOnAudioFocusChangeListener(focusListener)
                .build();
            result = audioManager.requestAudioFocus(audioFocusRequest);
        } else {
            result = audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
        }
        if (result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) audioOwner = owner;
        JSObject response = new JSObject(); response.put("granted", result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED); response.put("idempotent", false); response.put("generation", generation); call.resolve(response);
    }

    @PluginMethod
    public void releaseAudioFocus(PluginCall call) {
        releaseAudioFocusInternal();
        call.resolve();
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent intent = new Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.fromParts("package", getContext().getPackageName(), null)
        );
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (RuntimeException error) {
            call.reject("Application settings could not be opened.", "SETTINGS_UNAVAILABLE", error);
        }
    }

    private void releaseAudioFocusInternal() {
        ++focusGeneration;
        if (audioManager != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) audioManager.abandonAudioFocusRequest(audioFocusRequest);
            else audioManager.abandonAudioFocus(focusListener);
        }
        audioOwner = null;
        audioFocusRequest = null;
        audioManager = null;
    }

    @PluginMethod
    public void googleSignIn(PluginCall call) {
        String clientId = call.getString("serverClientId", "");
        if (clientId.isBlank() || !appForeground) {
            call.reject("Google sign-in is not configured.", "GOOGLE_NOT_CONFIGURED");
            return;
        }
        GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(clientId).build();
        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
        CredentialManager manager = CredentialManager.create(getActivity());
        Executor executor = ContextCompat.getMainExecutor(getContext());
        manager.getCredentialAsync(getActivity(), request, new CancellationSignal(), executor,
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override public void onResult(GetCredentialResponse response) {
                    if (!(response.getCredential() instanceof CustomCredential credential)
                        || !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                        call.reject("Unexpected credential type.", "GOOGLE_INVALID_CREDENTIAL");
                        return;
                    }
                    try {
                        GoogleIdTokenCredential google = GoogleIdTokenCredential.createFrom(credential.getData());
                        JSObject result = new JSObject(); result.put("idToken", google.getIdToken()); call.resolve(result);
                    } catch (RuntimeException error) {
                        call.reject("Invalid Google ID token.", "GOOGLE_INVALID_CREDENTIAL", error);
                    }
                }
                @Override public void onError(@NonNull GetCredentialException error) {
                    String code = error instanceof NoCredentialException ? "GOOGLE_NO_CREDENTIAL"
                        : error.getClass().getSimpleName().contains("Cancellation") ? "SIGN_IN_CANCELLED" : "GOOGLE_SIGN_IN_FAILED";
                    call.reject("Google sign-in did not complete.", code, error);
                }
            });
    }

    @PluginMethod
    public void pickPhoto(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent = new Intent(MediaStore.ACTION_PICK_IMAGES).setType("image/*");
        } else {
            intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*");
            intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "image/jpeg", "image/png", "image/webp" });
        }
        startActivityForResult(call, intent, "pickerResult");
    }

    @PluginMethod
    public void pickDocument(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "application/pdf", "text/plain", "image/jpeg", "image/png", "image/webp" });
        startActivityForResult(call, intent, "pickerResult");
    }

    @ActivityCallback
    private void pickerResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        Uri uri = data == null ? null : data.getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            call.reject("Picker cancelled.", "PICKER_CANCELLED");
            return;
        }
        String mime = getContext().getContentResolver().getType(uri);
        Set<String> allowed = Set.of("application/pdf", "text/plain", "image/jpeg", "image/png", "image/webp");
        if (!allowed.contains(mime)) {
            call.reject("Unsupported file type.", "UNSUPPORTED_FILE_TYPE");
            return;
        }
        if (data != null && (data.getFlags() & Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION) != 0) {
            try {
                getContext().getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                persistedUriGrants.add(uri);
            } catch (SecurityException ignored) {}
        }
        JSObject response = new JSObject(); response.put("uri", uri.toString()); response.put("mimeType", mime); call.resolve(response);
    }

    @PluginMethod
    public void clearSessionData(PluginCall call) {
        synchronized (LegaryaNativePlugin.class) { armedOwner = null; armedAt = 0; }
        releaseAudioFocusInternal();
        for (Uri uri : persistedUriGrants) {
            try { getContext().getContentResolver().releasePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION); }
            catch (SecurityException ignored) {}
        }
        persistedUriGrants.clear();
        CookieManager cookies = CookieManager.getInstance();
        cookies.setCookie(BACKEND_ORIGIN, "legarya_refresh=; Max-Age=0; Path=/api/v1/auth; Secure; HttpOnly; SameSite=None");
        cookies.flush();
        WebStorage.getInstance().deleteAllData();
        if (getBridge() != null) {
            getActivity().runOnUiThread(() -> {
                if (getBridge() != null) getBridge().getWebView().clearCache(true);
            });
        }
        deletePrivateShareTree(new File(getContext().getCacheDir(), "legarya-shared"));

        CredentialManager manager = CredentialManager.create(getActivity());
        manager.clearCredentialStateAsync(new ClearCredentialStateRequest(), new CancellationSignal(),
            ContextCompat.getMainExecutor(getContext()), new CredentialManagerCallback<Void, ClearCredentialException>() {
                @Override public void onResult(Void unused) { call.resolve(); }
                @Override public void onError(@NonNull ClearCredentialException error) { call.resolve(); }
            });
    }

    private static void deletePrivateShareTree(File directory) {
        File[] children = directory.listFiles();
        if (children != null) for (File child : children) {
            if (child.isDirectory()) deletePrivateShareTree(child);
            else child.delete();
        }
        directory.delete();
    }

    @Override
    protected void handleOnPause() {
        synchronized (LegaryaNativePlugin.class) { armedOwner = null; armedAt = 0; }
        releaseAudioFocusInternal();
    }
}
