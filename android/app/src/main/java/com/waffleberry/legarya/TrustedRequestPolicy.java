package com.waffleberry.legarya;

import android.webkit.PermissionRequest;
import java.util.Set;

final class TrustedRequestPolicy {
    static final String TRUSTED_ORIGIN = "https://localhost";
    static final Set<String> MICROPHONE_OWNERS = Set.of("l12", "l15", "enrollment");
    static final Set<String> VOICE_PICKER_TYPES = Set.of(
        "audio/wav", "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/webm",
        "audio/ogg", "video/mp4", "video/webm"
    );

    private TrustedRequestPolicy() {}

    static boolean isAllowedMicrophoneRequest(String origin, String[] resources, boolean androidPermission,
                                               boolean foreground, String owner, long armedAt, long now) {
        return TRUSTED_ORIGIN.equals(origin)
            && resources != null
            && resources.length == 1
            && PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resources[0])
            && androidPermission
            && foreground
            && MICROPHONE_OWNERS.contains(owner)
            && armedAt > 0
            && now >= armedAt
            && now - armedAt <= 10_000L;
    }

    static boolean isSafeExternalScheme(String scheme) {
        return "https".equals(scheme) || "http".equals(scheme);
    }

    static boolean requestsVoiceMedia(String[] acceptTypes) {
        if (acceptTypes == null) return false;
        for (String group : acceptTypes) if (group != null) {
            for (String value : group.split(",")) if (VOICE_PICKER_TYPES.contains(value.trim().toLowerCase())) return true;
        }
        return false;
    }

    static boolean isAllowedVoicePicker(String pageUrl, String[] acceptTypes,
                                        boolean captureEnabled, boolean foreground) {
        if (captureEnabled || !foreground || pageUrl == null
                || !(pageUrl.equals(TRUSTED_ORIGIN + "/chat.html")
                    || pageUrl.startsWith(TRUSTED_ORIGIN + "/chat.html?"))) return false;
        java.util.Set<String> requested = new java.util.HashSet<>();
        if (acceptTypes != null) for (String group : acceptTypes) if (group != null) {
            for (String value : group.split(",")) if (!value.isBlank()) requested.add(value.trim().toLowerCase());
        }
        return requested.equals(VOICE_PICKER_TYPES);
    }
}
