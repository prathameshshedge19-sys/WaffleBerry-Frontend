"use strict";

/* ==================================================
   THEME ELEMENT REFERENCES
================================================== */

const themeToggle =
    document.getElementById("themeToggle");

const themeIcon =
    document.getElementById("themeIcon");


/* ==================================================
   APPLY THEME
================================================== */

function applyTheme(themeName) {
    const isDark =
        themeName === "dark";

    document.body.classList.toggle(
        "dark-mode",
        isDark
    );

    if (themeIcon) {
        themeIcon.textContent =
            isDark ? "☀️" : "🌙";
    }

    if (themeToggle) {
        themeToggle.setAttribute(
            "aria-label",
            isDark
                ? "Switch to light mode"
                : "Switch to dark mode"
        );
    }

    localStorage.setItem(
        "waffleBerryTheme",
        themeName
    );

    document.dispatchEvent(
        new CustomEvent(
            "waffleberry:themechange",
            { detail: { theme: themeName } }
        )
    );
}

window.WaffleBerryTheme = Object.freeze({
    applyTheme,
    isDark() {
        return document.body.classList.contains(
            "dark-mode"
        );
    }
});


/* ==================================================
   LOAD SAVED THEME
================================================== */

const savedTheme =
    localStorage.getItem(
        "waffleBerryTheme"
    );

if (
    savedTheme === "dark" ||
    savedTheme === "light"
) {
    applyTheme(savedTheme);
}


/* ==================================================
   THEME BUTTON
================================================== */

if (themeToggle) {
    themeToggle.addEventListener(
        "click",
        () => {
            const isDark =
                document.body.classList.contains(
                    "dark-mode"
                );

            applyTheme(
                isDark ? "light" : "dark"
            );
        }
    );
}
