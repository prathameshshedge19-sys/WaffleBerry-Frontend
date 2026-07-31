"use strict";

(function initializeLegacyState() {
const LEGACIES_STORAGE_KEY =
    "waffleBerrySessionLegacies";
const DRAFT_STORAGE_KEY =
    "waffleBerryLegacyDraftId";
const ACTIVE_STORAGE_KEY =
    "waffleBerryActiveLegacyId";
const HIDDEN_LEGACIES_KEY =
    "waffleBerryHiddenPersistedLegacies";


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
    const backendLegacyId =
        Number.isInteger(
            Number(value?.backendLegacyId)
        ) &&
        Number(value?.backendLegacyId) > 0
            ? Number(value.backendLegacyId)
            : null;
    const status = value?.status === "archived"
        ? "archived"
        : "active";

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
        createdAt,
        backendLegacyId,
        status
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
        const seenBackendIds = new Set();

        return parsed
            .map(normalizeLegacy)
            .filter((legacy) => {
                if (
                    !legacy ||
                    seenIds.has(legacy.id) ||
                    (
                        legacy.backendLegacyId &&
                        seenBackendIds.has(legacy.backendLegacyId)
                    )
                ) {
                    return false;
                }

                seenIds.add(legacy.id);
                if (legacy.backendLegacyId) {
                    seenBackendIds.add(legacy.backendLegacyId);
                }
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

function hiddenPersistedIds() {
    try {
        const parsed = JSON.parse(
            localStorage.getItem(
                storageKey(HIDDEN_LEGACIES_KEY)
            ) || "[]"
        );
        return new Set(
            Array.isArray(parsed)
                ? parsed.map(String)
                : []
        );
    } catch {
        return new Set();
    }
}

async function hydratePersisted(status = "active") {
    const listPersisted =
        window.WaffleBerryApi.listOwnedLegaciesByStatus
        || window.WaffleBerryApi.listOwnedLegacies;
    const persisted =
        await listPersisted.call(
            window.WaffleBerryApi,
            status
        );
    const hidden = hiddenPersistedIds();
    const returnedIds = new Set(
        persisted.map((item) => item.legacy_id)
    );
    const current = list().filter(
        (item) => !(
            item.backendLegacyId &&
            item.status === status &&
            !returnedIds.has(item.backendLegacyId)
        )
    );
    const byBackendId = new Map(
        current
            .filter((item) =>
                item.backendLegacyId
            )
            .map((item) => [
                item.backendLegacyId,
                item
            ])
    );
    persisted.forEach((item) => {
        if (
            hidden.has(
                String(item.legacy_id)
            )
        ) {
            return;
        }
        const existing =
            byBackendId.get(item.legacy_id);
        if (existing) {
            existing.displayName =
                item.display_name;
            existing.relationship =
                item.relationship;
            existing.status = item.status || status;
            return;
        }
        const correlation =
            item.client_correlation_id;
        const localMatch = current.find(
            (legacy) =>
                legacy.id === correlation
        );
        if (localMatch) {
            localMatch.backendLegacyId =
                item.legacy_id;
            localMatch.displayName =
                item.display_name;
            localMatch.relationship =
                item.relationship;
            localMatch.status = item.status || status;
            return;
        }
        current.push({
            id: correlation ||
                `persisted-${item.legacy_id}`,
            relationship:
                item.relationship,
            displayName:
                item.display_name,
            createdAt:
                item.created_at,
            backendLegacyId:
                item.legacy_id,
            status: item.status || status
        });
    });
    store(current);
    return current;
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
        backendLegacyId:
            existingIndex >= 0
                ? legacies[existingIndex]
                    .backendLegacyId
                : null,
        createdAt:
            existingIndex >= 0
                ? legacies[existingIndex]
                    .createdAt
                : new Date().toISOString(),
        status: "active"
    };

    if (existingIndex >= 0) {
        legacies[existingIndex] = legacy;
    } else {
        legacies.push(legacy);
    }

    store(legacies);
    return legacy;
}

async function ensurePersisted(id) {
    const legacy = get(id);
    if (!legacy) {
        return null;
    }
    if (legacy.backendLegacyId) {
        return legacy;
    }
    const persisted =
        await window.WaffleBerryApi
            .synchronizeLegacy({
                display_name:
                    legacy.displayName,
                relationship:
                    legacy.relationship,
                client_correlation_id:
                    legacy.id
            });
    const legacies = list();
    const index = legacies.findIndex(
        (item) => item.id === legacy.id
    );
    if (index < 0) {
        return null;
    }
    legacies[index] = {
        ...legacies[index],
        backendLegacyId:
            persisted.legacy_id,
        status: persisted.status || "active"
    };
    store(legacies);
    return legacies[index];
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

function updatePersisted(backendLegacyId, details) {
    const numericId = Number(backendLegacyId);
    const displayName =
        typeof details?.display_name === "string"
            ? details.display_name.trim()
            : "";
    const relationship =
        typeof details?.relationship === "string"
            ? details.relationship.trim()
            : "";
    if (
        !Number.isInteger(numericId) ||
        numericId <= 0 ||
        !displayName ||
        !relationship
    ) {
        return null;
    }
    const legacies = list();
    const index = legacies.findIndex(
        (legacy) => legacy.backendLegacyId === numericId
    );
    if (index < 0) {
        return null;
    }
    legacies[index] = {
        ...legacies[index],
        displayName,
        relationship,
        status: details.status === "archived"
            ? "archived"
            : details.status === "active"
                ? "active"
                : legacies[index].status
    };
    store(legacies);
    return legacies[index];
}

function remove(id, options = {}) {
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

    const removed = legacies.find(
        (legacy) => legacy.id === id
    );
    if (removed?.backendLegacyId) {
        const hidden = hiddenPersistedIds();
        const backendId = String(removed.backendLegacyId);
        if (options.backendDeleted === true) {
            hidden.delete(backendId);
        } else {
            hidden.add(backendId);
        }
        localStorage.setItem(
            storageKey(HIDDEN_LEGACIES_KEY),
            JSON.stringify([...hidden])
        );
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
        ensurePersisted,
        get,
        getActive,
        hydratePersisted,
        list,
        remove,
        select,
        startDraft,
        updatePersisted
    });
})();
