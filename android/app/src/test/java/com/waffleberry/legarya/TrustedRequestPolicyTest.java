package com.waffleberry.legarya;

import android.webkit.PermissionRequest;
import org.junit.Test;
import static org.junit.Assert.*;

public class TrustedRequestPolicyTest {
    private static final long NOW = 50_000L;

    @Test public void exactForegroundAudioGestureIsAllowed() {
        assertTrue(TrustedRequestPolicy.isAllowedMicrophoneRequest("https://localhost",
            new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE }, true, true, "l15", NOW - 100, NOW));
    }

    @Test public void foreignOriginAndVideoAreDenied() {
        assertFalse(TrustedRequestPolicy.isAllowedMicrophoneRequest("https://evil.example",
            new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE }, true, true, "l15", NOW - 100, NOW));
        assertFalse(TrustedRequestPolicy.isAllowedMicrophoneRequest("https://localhost",
            new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE }, true, true, "l15", NOW - 100, NOW));
        assertFalse(TrustedRequestPolicy.isAllowedMicrophoneRequest("https://localhost",
            new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE, PermissionRequest.RESOURCE_VIDEO_CAPTURE }, true, true, "l15", NOW - 100, NOW));
    }

    @Test public void backgroundMissingPermissionWrongOwnerAndStaleGestureAreDenied() {
        String[] audio = { PermissionRequest.RESOURCE_AUDIO_CAPTURE };
        assertFalse(TrustedRequestPolicy.isAllowedMicrophoneRequest("https://localhost", audio, true, false, "l15", NOW - 100, NOW));
        assertFalse(TrustedRequestPolicy.isAllowedMicrophoneRequest("https://localhost", audio, false, true, "l15", NOW - 100, NOW));
        assertFalse(TrustedRequestPolicy.isAllowedMicrophoneRequest("https://localhost", audio, true, true, "camera", NOW - 100, NOW));
        assertFalse(TrustedRequestPolicy.isAllowedMicrophoneRequest("https://localhost", audio, true, true, "l12", NOW - 10_001, NOW));
    }

    @Test public void onlyHttpSchemesCanLeaveTrustedWebView() {
        assertTrue(TrustedRequestPolicy.isSafeExternalScheme("https"));
        assertTrue(TrustedRequestPolicy.isSafeExternalScheme("http"));
        assertFalse(TrustedRequestPolicy.isSafeExternalScheme("javascript"));
        assertFalse(TrustedRequestPolicy.isSafeExternalScheme("file"));
        assertFalse(TrustedRequestPolicy.isSafeExternalScheme("content"));
        assertFalse(TrustedRequestPolicy.isSafeExternalScheme("intent"));
    }
}
