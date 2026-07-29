"use strict";

(function initializeGuidedStories() {
const CHAPTERS =
    window.WaffleBerryStoryChapters;
const parameters =
    new URLSearchParams(
        window.location.search
    );
const legacyId =
    parameters.get("legacyId");
const legacy = legacyId
    ? window.WaffleBerryLegacyState
        .select(legacyId)
    : window.WaffleBerryLegacyState
        .getActive();

if (!legacy) {
    window.location.replace(
        "legacy-dashboard.html"
    );
    return;
}

const state =
    window.WaffleBerryGuidedStoriesState;
const welcome =
    document.getElementById("guidedWelcome");
const chaptersScreen =
    document.getElementById("guidedChapters");
const beginButton =
    document.getElementById(
        "beginStoryButton"
    );
const chapterGrid =
    document.getElementById(
        "guidedChapterGrid"
    );
const overallProgress =
    document.getElementById(
        "guidedOverallProgress"
    );


function showScreen(screen) {
    [welcome, chaptersScreen]
        .forEach((candidate) => {
            if (candidate) {
                candidate.hidden =
                    candidate !== screen;
            }
        });
}


function statusLabel(status) {
    return status === "completed"
        ? "Completed"
        : status === "in-progress"
            ? "In Progress"
            : "Not Started";
}


function sessionUrl(chapterId) {
    return `story-session.html?${
        new URLSearchParams({
            legacyId: legacy.id,
            chapter: chapterId
        })
    }`;
}


function createChapterCard(
    chapter,
    progress
) {
    const card =
        document.createElement("a");
    const icon =
        document.createElement("span");
    const copy =
        document.createElement("span");
    const title =
        document.createElement("strong");
    const badge =
        document.createElement("span");

    card.className =
        "glass-card guided-chapter-card";
    card.href = sessionUrl(chapter.id);
    card.dataset.status =
        progress?.status || "not-started";
    card.setAttribute(
        "aria-label",
        `${chapter.title}, ${
            statusLabel(progress?.status)
        }`
    );
    icon.className =
        "guided-chapter-card-icon";
    icon.setAttribute(
        "aria-hidden",
        "true"
    );
    icon.textContent = chapter.icon;
    copy.className =
        "guided-chapter-card-copy";
    title.textContent = chapter.title;
    badge.className =
        "guided-chapter-status";
    badge.textContent =
        statusLabel(progress?.status);
    copy.append(title, badge);
    card.append(icon, copy);
    return card;
}


function renderChapters() {
    const progress =
        state.load(legacy.id);
    const completed =
        Object.values(progress)
            .filter((chapter) =>
                chapter.status ===
                    "completed"
            ).length;

    chapterGrid?.replaceChildren(
        ...CHAPTERS.map((chapter) =>
            createChapterCard(
                chapter,
                progress[chapter.id]
            )
        )
    );

    if (overallProgress) {
        overallProgress.textContent =
            `${completed} of ${
                CHAPTERS.length
            } chapters preserved`;
    }
}


document
    .querySelectorAll(
        "[data-legacy-name]"
    )
    .forEach((element) => {
        element.textContent =
            legacy.displayName;
    });

document.title =
    `${legacy.displayName}'s Story | Waffle Berry`;

if (beginButton) {
    beginButton.textContent =
        state.hasProgress(legacy.id)
            ? "Continue Story"
            : "Begin Story";
    beginButton.addEventListener(
        "click",
        () => {
            renderChapters();
            showScreen(chaptersScreen);
        }
    );
}

if (parameters.get("view") === "chapters") {
    renderChapters();
    showScreen(chaptersScreen);
}

if (
    parameters.get("paused") === "1"
) {
    const note =
        document.createElement("p");
    note.className =
        "glass-card guided-return-note";
    note.setAttribute(
        "role",
        "status"
    );
    note.textContent =
        "Your story will be waiting whenever you're ready.";
    chaptersScreen?.prepend(note);
}
})();
