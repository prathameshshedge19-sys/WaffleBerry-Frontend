"use strict";

(function initializeLegacyOverview() {
const elements = {
    loading: document.getElementById("legacyOverviewLoading"),
    error: document.getElementById("legacyOverviewError"),
    errorTitle: document.getElementById("legacyOverviewErrorTitle"),
    errorMessage: document.getElementById("legacyOverviewErrorMessage"),
    retry: document.getElementById("legacyOverviewRetry"),
    content: document.getElementById("legacyOverviewContent"),
    title: document.getElementById("legacyOverviewTitle"),
    relationship: document.getElementById("legacyOverviewRelationship"),
    status: document.getElementById("legacyOverviewStatus"),
    relativeDate: document.getElementById("legacyOverviewRelativeDate"),
    date: document.getElementById("legacyOverviewDate"),
    approved: document.getElementById("legacyOverviewApprovedState"),
    stats: document.getElementById("legacyOverviewStats"),
    emptyNote: document.getElementById("legacyOverviewEmptyNote"),
    progressGrid: document.getElementById("legacyProgressGrid"),
    storySessionCategories: document.getElementById(
        "legacyStorySessionCategoriesGrid"
    ),
    storySessionCategoriesEmpty: document.getElementById(
        "legacyStorySessionCategoriesEmpty"
    ),
    health: document.getElementById("legacyHealthSummary"),
    activity: document.getElementById("legacyActivitySummary"),
    memoryTypes: document.getElementById("legacyMemoryTypes"),
};


function selectLegacy() {
    const requestedId =
        new URLSearchParams(
            window.location.search
        ).get("id");

    return requestedId
        ? window.WaffleBerryLegacyState.select(requestedId)
        : window.WaffleBerryLegacyState.getActive();
}


function safeCount(value) {
    const count = Number(value);
    return Number.isInteger(count) && count >= 0
        ? count
        : 0;
}


function formatDate(value) {
    if (
        typeof value !== "string" ||
        Number.isNaN(Date.parse(value))
    ) {
        return "Date unavailable";
    }

    return new Intl.DateTimeFormat(
        undefined,
        {
            month: "short",
            day: "numeric",
            year: "numeric"
        }
    ).format(new Date(value));
}


function validDate(...values) {
    return values.find(
        (value) =>
            typeof value === "string" &&
            !Number.isNaN(Date.parse(value))
    ) || null;
}


function formatRelativeTime(value, now = Date.now()) {
    if (!value) {
        return "Update time unavailable";
    }

    const difference =
        new Date(value).getTime() - now;
    const absolute = Math.abs(difference);
    const units = [
        ["year", 365 * 24 * 60 * 60 * 1000],
        ["month", 30 * 24 * 60 * 60 * 1000],
        ["day", 24 * 60 * 60 * 1000],
        ["hour", 60 * 60 * 1000],
        ["minute", 60 * 1000]
    ];
    const selected =
        units.find(([, milliseconds]) =>
            absolute >= milliseconds
        );

    if (!selected) {
        return "Updated just now";
    }

    const [unit, milliseconds] = selected;
    const valueForUnit =
        Math.round(difference / milliseconds);
    return `Updated ${new Intl.RelativeTimeFormat(
        undefined,
        { numeric: "auto" }
    ).format(valueForUnit, unit)}`;
}


function readableStatus(value) {
    if (typeof value !== "string" || !value.trim()) {
        return "Status unavailable";
    }

    return value
        .trim()
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (letter) =>
            letter.toLocaleUpperCase()
        );
}


function percentage(part, total) {
    const safePart = safeCount(part);
    const safeTotal = safeCount(total);

    if (safeTotal === 0) {
        return null;
    }

    return Math.min(
        100,
        Math.round((safePart / safeTotal) * 100)
    );
}


function safePercentage(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric)
        ? Math.min(100, Math.max(0, Math.round(numeric)))
        : 0;
}


function showLoading() {
    elements.loading.hidden = false;
    elements.error.hidden = true;
    elements.content.hidden = true;
}


function showError(kind) {
    const notFound = kind === "not-found";
    elements.loading.hidden = true;
    elements.content.hidden = true;
    elements.error.hidden = false;
    elements.retry.hidden = notFound;
    elements.errorTitle.textContent = notFound
        ? "This legacy is unavailable."
        : "We couldn’t load this legacy.";
    elements.errorMessage.textContent = notFound
        ? "Return to Your Legacies and choose an available legacy."
        : "Check your connection and try again. Your saved information has not been changed.";
}


function createStat(label, value) {
    const card = document.createElement("article");
    card.className = "glass-card legacy-overview-stat";

    const count = document.createElement("strong");
    count.textContent = String(safeCount(value));

    const name = document.createElement("span");
    name.textContent = label;

    card.append(count, name);
    return card;
}


function createStateRow(label, value) {
    const row = document.createElement("div");
    const name = document.createElement("span");
    const count = document.createElement("strong");
    name.textContent = label;
    count.textContent = String(safeCount(value));
    row.append(name, count);
    return row;
}


function renderStateList(container, items) {
    container.replaceChildren(
        ...items.map(([label, value]) =>
            createStateRow(label, value)
        )
    );
}


function createProgressCard({
    className,
    eyebrow,
    title,
    icon,
    completed,
    total,
    completedLabel,
    emptyLabel,
    states
}) {
    const card = document.createElement("article");
    card.className =
        `glass-card legacy-progress-card ${className}`;

    const heading = document.createElement("div");
    heading.className = "legacy-progress-card-heading";
    const iconElement = document.createElement("span");
    iconElement.className = "legacy-progress-card-icon";
    iconElement.setAttribute("aria-hidden", "true");
    iconElement.textContent = icon;
    const headingCopy = document.createElement("div");
    const eyebrowElement = document.createElement("p");
    eyebrowElement.className = "eyebrow";
    eyebrowElement.textContent = eyebrow;
    const titleElement = document.createElement("h3");
    titleElement.textContent = title;
    headingCopy.append(eyebrowElement, titleElement);
    heading.append(iconElement, headingCopy);

    const calculated = percentage(completed, total);
    const progressCopy = document.createElement("div");
    progressCopy.className = "legacy-progress-copy";
    const progressValue = document.createElement("strong");
    progressValue.textContent =
        calculated === null
            ? "—"
            : `${calculated}%`;
    const progressDescription = document.createElement("span");
    progressDescription.textContent =
        calculated === null
            ? emptyLabel
            : `${safeCount(completed)} of ${safeCount(total)} ${completedLabel}`;
    progressCopy.append(progressValue, progressDescription);

    const track = document.createElement("div");
    track.className = "legacy-progress-track";
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", `${title}: ${progressDescription.textContent}`);
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    track.setAttribute(
        "aria-valuetext",
        progressDescription.textContent
    );
    if (calculated !== null) {
        track.setAttribute(
            "aria-valuenow",
            String(calculated)
        );
    }
    const fill = document.createElement("span");
    fill.style.width =
        `${calculated === null ? 0 : calculated}%`;
    track.append(fill);

    const stateList = document.createElement("div");
    stateList.className =
        "legacy-state-list legacy-progress-state-list";
    renderStateList(stateList, states);

    card.append(
        heading,
        progressCopy,
        track,
        stateList
    );
    return card;
}


function createStorySessionCategoryCard(category) {
    const card = document.createElement("article");
    card.className = "glass-card legacy-story-category-card";
    const categoryId =
        typeof category?.id === "string"
            ? category.id.trim()
            : "";
    const canonicalChapter = Array.isArray(
        window.WaffleBerryStoryChapters
    )
        ? window.WaffleBerryStoryChapters.find(
            (chapter) => chapter.id === categoryId
        )
        : null;
    const title =
        canonicalChapter?.title || (
        typeof category?.title === "string" &&
        category.title.trim()
            ? category.title.trim()
            : readableStatus(categoryId || "Story category")
        );
    const completed = safeCount(category?.completed_sessions);
    const total = safeCount(category?.total_sessions);
    const completion = safePercentage(
        category?.session_completion_percentage
    );

    const heading = document.createElement("div");
    heading.className = "legacy-story-category-heading";
    const name = document.createElement("h4");
    name.textContent = title;
    const value = document.createElement("strong");
    value.textContent = `${completion}%`;
    heading.append(name, value);

    const track = document.createElement("div");
    track.className =
        "legacy-progress-track legacy-story-category-track";
    const valueText =
        `${completed} of ${total} sessions completed`;
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", `${title}: ${valueText}`);
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    track.setAttribute("aria-valuenow", String(completion));
    track.setAttribute("aria-valuetext", valueText);
    const fill = document.createElement("span");
    fill.style.width = `${completion}%`;
    track.append(fill);

    const detail = document.createElement("p");
    detail.textContent = `${completed} / ${total} ${
        total === 1 ? "session" : "sessions"
    } completed`;

    card.append(heading, track, detail);
    return card;
}


function renderStorySessionCategories(categories) {
    const available = Array.isArray(categories)
        ? categories
        : [];
    elements.storySessionCategories.replaceChildren(
        ...available.map(createStorySessionCategoryCard)
    );
    elements.storySessionCategories.hidden = available.length === 0;
    elements.storySessionCategoriesEmpty.hidden = available.length > 0;
}


function storyHealth(stories) {
    const total = safeCount(stories.total_sessions);
    if (total === 0) {
        return "No sessions yet";
    }
    if (safeCount(stories.in_progress_sessions) > 0) {
        return "Story work is in progress";
    }
    if (safeCount(stories.paused_sessions) > 0) {
        return "A story session is paused";
    }
    return "Completed story sessions available";
}


function memoryHealth(memories) {
    const total = safeCount(memories.total);
    const approved = safeCount(memories.approved);
    if (approved === 0) {
        return "No approved memories";
    }
    if (approved === total) {
        return "All current memories are approved";
    }
    return "Some memories are approved";
}


function extractionHealth(extraction) {
    if (safeCount(extraction.running_runs) > 0) {
        return "Extraction is in progress";
    }
    if (safeCount(extraction.pending_runs) > 0) {
        return "Waiting for extraction";
    }
    if (safeCount(extraction.completed_runs) > 0) {
        return "Successful extraction recorded";
    }
    if (safeCount(extraction.failed_runs) > 0) {
        return "An extraction needs attention";
    }
    return "No extraction runs yet";
}


function createHealthRow(label, description) {
    const row = document.createElement("div");
    const name = document.createElement("strong");
    const copy = document.createElement("span");
    name.textContent = label;
    copy.textContent = description;
    row.append(name, copy);
    return row;
}


function createActivityItem(value, singular, plural) {
    const item = document.createElement("li");
    const count = document.createElement("strong");
    const safeValue = safeCount(value);
    count.textContent = String(safeValue);
    item.append(
        count,
        ` ${safeValue === 1 ? singular : plural}`
    );
    return item;
}


function renderDashboard(data) {
    const stories = data?.stories || {};
    const memories = data?.memories || {};
    const extraction = data?.extraction || {};
    const title =
        typeof data?.title === "string" &&
        data.title.trim()
            ? data.title.trim()
            : "Legacy";
    const relationship =
        typeof data?.relationship === "string" &&
        data.relationship.trim()
            ? data.relationship.trim()
            : "Relationship unavailable";

    elements.title.textContent = title;
    elements.relationship.textContent = relationship;
    elements.status.textContent = readableStatus(data?.status);
    const displayedDate =
        validDate(data?.updated_at, data?.created_at);
    elements.relativeDate.textContent =
        formatRelativeTime(displayedDate);
    elements.date.textContent = formatDate(displayedDate);
    elements.date.dateTime = displayedDate || "";
    elements.approved.textContent =
        data?.has_approved_memories === true
            ? "Approved memories available"
            : "No approved memories yet";
    elements.approved.classList.toggle(
        "has-approved",
        data?.has_approved_memories === true
    );

    elements.stats.replaceChildren(
        createStat("Story sessions", stories.total_sessions),
        createStat("Distinct chapters", stories.distinct_chapters),
        createStat("Story contributions", stories.contributed_messages),
        createStat("Total memories", memories.total),
        createStat("Approved memories", memories.approved),
        createStat("Linked conversations", data?.linked_conversations)
    );

    elements.progressGrid.replaceChildren(
        createProgressCard({
            className: "legacy-progress-story",
            eyebrow: "Story progress",
            title: "Story sessions",
            icon: "📖",
            completed: stories.completed_sessions,
            total: stories.total_sessions,
            completedLabel: "sessions completed",
            emptyLabel: "No story sessions yet",
            states: [
                ["Total", stories.total_sessions],
                ["Completed", stories.completed_sessions],
                ["In progress", stories.in_progress_sessions],
                ["Paused", stories.paused_sessions]
            ]
        }),
        createProgressCard({
            className: "legacy-progress-memory",
            eyebrow: "Memory progress",
            title: "Approved memories",
            icon: "🫶",
            completed: memories.approved,
            total: memories.total,
            completedLabel: "memories approved",
            emptyLabel: "No memories yet",
            states: [
                ["Total", memories.total],
                ["Candidate", memories.candidate],
                ["Approved", memories.approved],
                ["Rejected", memories.rejected],
                ["Superseded", memories.superseded]
            ]
        }),
        createProgressCard({
            className: "legacy-progress-extraction",
            eyebrow: "Extraction progress",
            title: "Completed runs",
            icon: "◇",
            completed: extraction.completed_runs,
            total: extraction.total_runs,
            completedLabel: "runs completed",
            emptyLabel: "No extraction runs yet",
            states: [
                ["Pending", extraction.pending_runs],
                ["Running", extraction.running_runs],
                ["Completed", extraction.completed_runs],
                ["Failed", extraction.failed_runs]
            ]
        })
    );
    renderStorySessionCategories(data?.story_session_categories);

    elements.health.replaceChildren(
        createHealthRow("Stories", storyHealth(stories)),
        createHealthRow("Memories", memoryHealth(memories)),
        createHealthRow("Extraction", extractionHealth(extraction))
    );
    elements.activity.replaceChildren(
        createActivityItem(
            stories.total_sessions,
            "story session",
            "story sessions"
        ),
        createActivityItem(
            memories.approved,
            "approved memory",
            "approved memories"
        ),
        createActivityItem(
            data?.linked_conversations,
            "linked conversation",
            "linked conversations"
        )
    );

    renderStateList(elements.memoryTypes, [
        ["Atomic", memories.atomic],
        ["Narrative", memories.narrative]
    ]);

    const isEmpty = [
        stories.total_sessions,
        memories.total,
        data?.linked_conversations
    ].every((value) => safeCount(value) === 0);
    elements.emptyNote.hidden = !isEmpty;
    elements.loading.hidden = true;
    elements.error.hidden = true;
    elements.content.hidden = false;
    document.title = `${title} — My Legacy | Waffle Berry`;
}


async function loadDashboard() {
    showLoading();
    const legacy = selectLegacy();

    if (!legacy) {
        showError("not-found");
        return;
    }

    try {
        await window.authReady;
        const persisted =
            await window.WaffleBerryLegacyState
                .ensurePersisted(legacy.id);

        if (!persisted?.backendLegacyId) {
            showError("not-found");
            return;
        }

        const dashboard =
            await window.WaffleBerryApi
                .getLegacyDashboard(
                    persisted.backendLegacyId
                );
        renderDashboard(dashboard);
    } catch (error) {
        if (
            error instanceof window.WaffleBerryApi.ApiError &&
            error.status === 401
        ) {
            window.WaffleBerryApi.clearStoredSession();
            window.location.replace("login.html");
            return;
        }

        showError(
            error instanceof window.WaffleBerryApi.ApiError &&
            error.status === 404
                ? "not-found"
                : "recoverable"
        );
    }
}


elements.retry?.addEventListener("click", loadDashboard);
loadDashboard();
})();
