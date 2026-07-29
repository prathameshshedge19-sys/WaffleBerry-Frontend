"use strict";

(function initializeLegacyState() {
const LEGACIES_STORAGE_KEY =
    "waffleBerrySessionLegacies";
const DRAFT_STORAGE_KEY =
    "waffleBerryLegacyDraftId";
const ACTIVE_STORAGE_KEY =
    "waffleBerryActiveLegacyId";


function storageKey(baseKey) {
    const userId =
        window.WaffleBerryApi
            ?.getStoredUser?.()
            ?.user_id;

    return userId === undefined ||
        userId === null
        ? baseKey
        : `${baseKey}:${userId}`;
}


function createId() {
    if (
        typeof globalThis.crypto?.randomUUID ===
        "function"
    ) {
        return globalThis.crypto.randomUUID();
    }

    return [
        "legacy",
        Date.now().toString(36),
        Math.random()
            .toString(36)
            .slice(2, 10)
    ].join("-");
}


function normalizeLegacy(value) {
    const id =
        typeof value?.id === "string"
            ? value.id.trim()
            : "";
    const relationship =
        typeof value?.relationship ===
            "string"
            ? value.relationship.trim()
            : "";
    const displayName =
        typeof value?.displayName ===
            "string"
            ? value.displayName.trim()
            : "";
    const createdAt =
        typeof value?.createdAt === "string" &&
        !Number.isNaN(
            Date.parse(value.createdAt)
        )
            ? value.createdAt
            : "";

    if (
        !id ||
        !relationship ||
        !displayName ||
        !createdAt
    ) {
        return null;
    }

    return {
        id,
        relationship,
        displayName,
        createdAt
    };
}


function list() {
    try {
        const stored =
            sessionStorage.getItem(
                storageKey(
                    LEGACIES_STORAGE_KEY
                )
            );
        const parsed = stored
            ? JSON.parse(stored)
            : [];

        if (!Array.isArray(parsed)) {
            return [];
        }

        const seenIds = new Set();

        return parsed
            .map(normalizeLegacy)
            .filter((legacy) => {
                if (
                    !legacy ||
                    seenIds.has(legacy.id)
                ) {
                    return false;
                }

                seenIds.add(legacy.id);
                return true;
            });
    } catch {
        return [];
    }
}


function store(legacies) {
    sessionStorage.setItem(
        storageKey(
            LEGACIES_STORAGE_KEY
        ),
        JSON.stringify(legacies)
    );
}


function startDraft() {
    const id = createId();
    sessionStorage.setItem(
        storageKey(DRAFT_STORAGE_KEY),
        id
    );
    return id;
}


function currentDraftId() {
    const id =
        sessionStorage.getItem(
            storageKey(DRAFT_STORAGE_KEY)
        )?.trim();

    return id || startDraft();
}


function create(details) {
    const relationship =
        typeof details?.relationship ===
            "string"
            ? details.relationship.trim()
            : "";
    const displayName =
        typeof details?.displayName ===
            "string"
            ? details.displayName.trim()
            : "";

    if (!relationship || !displayName) {
        return null;
    }

    const id = currentDraftId();
    const legacies = list();
    const existingIndex =
        legacies.findIndex(
            (legacy) => legacy.id === id
        );
    const legacy = {
        id,
        relationship,
        displayName,
        createdAt:
            existingIndex >= 0
                ? legacies[existingIndex]
                    .createdAt
                : new Date().toISOString()
    };

    if (existingIndex >= 0) {
        legacies[existingIndex] = legacy;
    } else {
        legacies.push(legacy);
    }

    store(legacies);
    return legacy;
}


function get(id) {
    if (typeof id !== "string") {
        return null;
    }

    return (
        list().find(
            (legacy) => legacy.id === id
        ) || null
    );
}


function select(id) {
    const legacy = get(id);
    if (!legacy) {
        return null;
    }

    sessionStorage.setItem(
        storageKey(ACTIVE_STORAGE_KEY),
        legacy.id
    );
    return legacy;
}


function getActive() {
    const id =
        sessionStorage.getItem(
            storageKey(
                ACTIVE_STORAGE_KEY
            )
        );

    return id ? get(id) : null;
}

function remove(id) {
    if (typeof id !== "string") {
        return false;
    }

    const legacies = list();
    const remainingLegacies =
        legacies.filter(
            (legacy) => legacy.id !== id
        );

    if (
        remainingLegacies.length ===
        legacies.length
    ) {
        return false;
    }

    store(remainingLegacies);

    const activeStorageKey =
        storageKey(ACTIVE_STORAGE_KEY);

    if (
        sessionStorage.getItem(
            activeStorageKey
        ) === id
    ) {
        sessionStorage.removeItem(
            activeStorageKey
        );
    }

    return true;
}


window.WaffleBerryLegacyState =
    Object.freeze({
        create,
        get,
        getActive,
        list,
        remove,
        select,
        startDraft
    });
})();
