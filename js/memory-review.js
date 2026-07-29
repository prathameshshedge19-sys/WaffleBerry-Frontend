"use strict";

(function initializeMemoryReview() {
const parameters =
    new URLSearchParams(window.location.search);
const legacyId = parameters.get("legacyId");
const legacy = legacyId
    ? window.WaffleBerryLegacyState.select(legacyId)
    : window.WaffleBerryLegacyState.getActive();
const list = document.getElementById("memoryReviewList");
const status = document.getElementById("memoryReviewStatus");
const count = document.getElementById("memoryReviewCount");
const retry = document.getElementById("memoryReviewRetry");
const categoryFilter =
    document.getElementById("memoryCategoryFilter");
const editDialog =
    document.getElementById("memoryEditDialog");
const editForm =
    document.getElementById("memoryEditForm");
const rejectDialog =
    document.getElementById("memoryRejectDialog");
const rejectForm =
    document.getElementById("memoryRejectForm");
let memories = new Map();
let activeFilter = "all";
let rejectingMemory = null;

function persistedId(value) {
    const candidate =
        value?.backendLegacyId ?? value?.id;
    const parsed = Number(candidate);
    return Number.isInteger(parsed) && parsed > 0
        ? parsed
        : null;
}

const backendLegacyId = persistedId(legacy);

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
        node.className = className;
    }
    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
}

function friendlyCategory(value) {
    return String(value || "memory")
        .replaceAll("_", " ")
        .replace(/\b\w/g, (letter) =>
            letter.toUpperCase()
        );
}

function provenanceNode(source) {
    const item = element("li", "memory-provenance-item");
    item.append(
        element(
            "strong",
            "",
            source.story_session_title ||
                source.chapter ||
                friendlyCategory(source.source_type)
        )
    );
    if (source.excerpt) {
        item.append(
            element("blockquote", "", source.excerpt)
        );
    }
    const metadata = [
        source.speaker
            ? `Shared by ${source.speaker}`
            : null,
        source.captured_at
            ? new Date(
                source.captured_at
            ).toLocaleDateString()
            : null
    ].filter(Boolean).join(" · ");
    if (metadata) {
        item.append(element("small", "", metadata));
    }
    return item;
}

function relatedNode(related) {
    const item = element("article", "memory-related-item");
    const label =
        related.relationship === "conflicting"
            ? "Conflicting Memory"
            : "Related Memory";
    item.append(
        element("span", "memory-review-badge", label),
        element("h4", "", related.title),
        element("p", "", related.summary),
        element(
            "small",
            "",
            `Review state: ${
                related.review_status === "candidate"
                    ? "Needs Review"
                    : friendlyCategory(
                        related.review_status
                    )
            }`
        )
    );
    if (related.relationship === "conflicting") {
        item.append(
            element(
                "p",
                "memory-related-note",
                "Another preserved account contains a different detail. Neither account is treated as false."
            )
        );
    } else {
        item.append(
            element(
                "p",
                "memory-related-note",
                "This memory adds related detail. Keeping it will not merge or change the existing memory."
            )
        );
    }
    return item;
}

function actionButton(label, className, handler) {
    const button = element("button", className, label);
    button.type = "button";
    button.addEventListener("click", handler);
    return button;
}

function memoryCard(memory) {
    const card = element("article", "glass-card memory-review-card");
    card.dataset.memoryId = String(memory.memory_id);
    const heading = element("div", "memory-card-heading");
    const badges = element("div", "memory-card-badges");
    badges.append(
        element(
            "span",
            "memory-review-badge",
            friendlyCategory(memory.category)
        ),
        element(
            "span",
            "memory-review-badge memory-review-badge-pending",
            "Needs Review"
        )
    );
    if (memory.has_contradiction) {
        badges.append(
            element(
                "span",
                "memory-review-badge memory-review-badge-warning",
                "Conflicting Memory"
            )
        );
    }
    if (memory.has_possible_enrichment) {
        badges.append(
            element(
                "span",
                "memory-review-badge memory-review-badge-related",
                "Related Memory"
            )
        );
    }
    heading.append(
        badges,
        element("h2", "", memory.title)
    );
    card.append(
        heading,
        element("p", "memory-card-summary", memory.summary)
    );
    if (memory.uncertainty_note) {
        card.append(
            element(
                "p",
                "memory-uncertainty",
                `Approximate or uncertain: ${memory.uncertainty_note}`
            )
        );
    }
    if (memory.importance) {
        card.append(
            element(
                "p",
                "memory-importance",
                `Legacy importance: ${memory.importance} of 5`
            )
        );
    }

    const details = element("details", "memory-card-details");
    details.append(
        element("summary", "", "Why Berry remembered this")
    );
    const provenanceList =
        element("ul", "memory-provenance-list");
    memory.provenance.forEach((source) =>
        provenanceList.append(provenanceNode(source))
    );
    details.append(provenanceList);
    if (memory.participants.length) {
        details.append(
            element(
                "p",
                "",
                `People: ${memory.participants
                    .map((person) => person.name)
                    .join(", ")}`
            )
        );
    }
    if (memory.tags.length) {
        details.append(
            element(
                "p",
                "",
                `Tags: ${memory.tags.join(", ")}`
            )
        );
    }
    memory.related_memories.forEach((related) =>
        details.append(relatedNode(related))
    );
    card.append(details);

    const actions = element("div", "memory-card-actions");
    actions.append(
        actionButton(
            "Keep Memory",
            "primary-button",
            () => approve(memory)
        ),
        actionButton(
            "Edit",
            "secondary-button",
            () => openEdit(memory)
        ),
        actionButton(
            "Remove",
            "memory-reject-button",
            () => openReject(memory)
        )
    );
    card.append(actions);
    return card;
}

function render(items) {
    list.replaceChildren();
    if (!items.length) {
        status.textContent =
            "All caught up. There are no memories waiting for review.";
        status.hidden = false;
        count.textContent = "No memories need your attention right now.";
        return;
    }
    status.hidden = true;
    count.textContent =
        `${items.length} ${
            items.length === 1 ? "memory" : "memories"
        } waiting for your decision.`;
    items.forEach((memory) =>
        list.append(memoryCard(memory))
    );
}

function filters() {
    const values = {
        category: categoryFilter.value || undefined,
        limit: 100
    };
    if (activeFilter === "contradictions") {
        values.has_contradiction = true;
    }
    if (activeFilter === "enrichments") {
        values.has_enrichment = true;
    }
    return values;
}

async function load() {
    if (!legacy) {
        window.location.replace("legacy-dashboard.html");
        return;
    }
    document.getElementById("memoryReviewTitle").textContent =
        `${legacy.displayName}'s Memories`;
    document.title =
        `${legacy.displayName}'s Memories | Waffle Berry`;
    retry.hidden = true;
    status.hidden = false;
    status.textContent = "Loading memories…";
    list.replaceChildren();
    if (!backendLegacyId) {
        status.textContent =
            "This legacy has not been connected to secure memory storage yet.";
        count.textContent =
            "Return to Legacy Studio and try again after the legacy is saved.";
        return;
    }
    try {
        const result =
            await window.WaffleBerryApi.listMemoryReview(
                backendLegacyId,
                filters()
            );
        memories = new Map(
            result.items.map((item) => [
                item.memory_id,
                item
            ])
        );
        render(result.items);
    } catch (error) {
        if (error.status === 401) {
            window.WaffleBerryApi.clearStoredSession();
            window.location.replace("login.html");
            return;
        }
        status.textContent =
            error.status === 404
                ? "This legacy or its memories could not be found."
                : "Memories could not be loaded safely. Please try again.";
        retry.hidden = false;
    }
}

async function approve(memory) {
    await performAction(memory, "approve");
}

async function performAction(memory, action) {
    const card = list.querySelector(
        `[data-memory-id="${memory.memory_id}"]`
    );
    card?.setAttribute("aria-busy", "true");
    try {
        await window.WaffleBerryApi.reviewMemoryAction(
            backendLegacyId,
            memory.memory_id,
            action,
            memory.updated_at
        );
        memories.delete(memory.memory_id);
        render([...memories.values()]);
    } catch (error) {
        status.hidden = false;
        status.textContent =
            error.status === 409
                ? "This memory changed in another review. Refreshing it now."
                : "That decision could not be saved. Please try again.";
        if (error.status === 409) {
            await load();
        }
    } finally {
        card?.removeAttribute("aria-busy");
    }
}

function openEdit(memory) {
    document.getElementById("memoryEditId").value =
        String(memory.memory_id);
    document.getElementById("memoryEditTitleInput").value =
        memory.title;
    document.getElementById("memoryEditSummary").value =
        memory.summary;
    const category =
        document.getElementById("memoryEditCategory");
    category.replaceChildren();
    [...categoryFilter.options]
        .filter((option) => option.value)
        .forEach((option) => {
            const clone = option.cloneNode(true);
            category.append(clone);
        });
    category.value = memory.category;
    document.getElementById("memoryEditImportance").value =
        memory.importance ?? "";
    document.getElementById("memoryEditUncertainty").value =
        memory.uncertainty_note ?? "";
    document.getElementById("memoryEditError").textContent = "";
    editDialog.showModal();
    document.getElementById("memoryEditTitleInput").focus();
}

function openReject(memory) {
    rejectingMemory = memory;
    document.getElementById("memoryRejectMessage").textContent =
        `“${memory.title}” will be removed from future preserved-memory use.`;
    rejectDialog.showModal();
    rejectDialog.querySelector(".danger-button").focus();
}

editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!editForm.reportValidity()) {
        return;
    }
    const id = Number(
        document.getElementById("memoryEditId").value
    );
    const memory = memories.get(id);
    const importance =
        document.getElementById("memoryEditImportance").value;
    try {
        const updated =
            await window.WaffleBerryApi.editMemoryReview(
                backendLegacyId,
                id,
                {
                    expected_updated_at: memory.updated_at,
                    title: document
                        .getElementById("memoryEditTitleInput")
                        .value.trim(),
                    summary: document
                        .getElementById("memoryEditSummary")
                        .value.trim(),
                    category: document
                        .getElementById("memoryEditCategory")
                        .value,
                    importance: importance
                        ? Number(importance)
                        : null,
                    uncertainty_note: document
                        .getElementById("memoryEditUncertainty")
                        .value.trim() || null
                }
            );
        memories.set(id, updated);
        editDialog.close();
        render([...memories.values()]);
    } catch (error) {
        document.getElementById("memoryEditError").textContent =
            error.status === 409
                ? "An equivalent memory exists, or this memory changed. Refresh before editing again."
                : "Changes could not be saved. Please check the fields and try again.";
    }
});

rejectForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    rejectDialog.close();
    if (rejectingMemory) {
        await performAction(rejectingMemory, "reject");
    }
    rejectingMemory = null;
});

document.querySelectorAll("[data-close-dialog]")
    .forEach((button) => {
        button.addEventListener("click", () =>
            button.closest("dialog")?.close()
        );
    });

document.querySelectorAll("[data-review-filter]")
    .forEach((button) => {
        button.addEventListener("click", () => {
            activeFilter = button.dataset.reviewFilter;
            document.querySelectorAll("[data-review-filter]")
                .forEach((item) =>
                    item.classList.toggle(
                        "is-active",
                        item === button
                    )
                );
            load();
        });
    });
categoryFilter.addEventListener("change", load);
retry.addEventListener("click", load);

window.WaffleBerryMemoryReview = Object.freeze({
    element,
    friendlyCategory,
    persistedId
});
load();
})();
