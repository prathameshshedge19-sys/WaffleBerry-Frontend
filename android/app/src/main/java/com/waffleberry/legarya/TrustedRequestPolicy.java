package com.waffleberry.legarya;

import android.webkit.PermissionRequest;
import java.util.Set;

final class TrustedRequestPolicy {
    static final String TRUSTED_ORIGIN = "https://localhost";
    static final Set<String> MICROPHONE_OWNERS = Set.of("l12", "l15");

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
}
