"use strict";

(function initializeHomePage() {
const typedHeading =
    document.getElementById("typedHeading");

const typedDescription =
    document.getElementById(
        "typedDescription"
    );

const startChatButton =
    document.getElementById(
        "startChatButton"
    );

const fallbackHeadingText =
    "Hello, I'm Berry.";

const descriptionText =
    "I preserve memories, stories and conversations so the people you love are never forgotten.";

const legacyDescriptionText =
    "Explore memories, stories and conversations that keep their story close.";


function getFirstName(fullName) {
    if (typeof fullName !== "string") {
        return "";
    }

    return (
        fullName
            .trim()
            .split(/\s+/)
            .find(Boolean) || ""
    );
}


async function getPageContext() {
    let legacy = null;
    try {
        await window.authReady;

        legacy = await window.WaffleBerryLegacyContextUi.resolveSelectedLegacy();
        window.WaffleBerryLegacyContextUi.updateLegacyAwareUI(legacy);

        const currentUser =
            window.WaffleBerryApi
                .getStoredUser();

        const firstName =
            getFirstName(
                currentUser?.full_name
            );

        if (firstName) {
            return {
                heading: `Hello, ${firstName}. I'm ${legacy?.displayName || "Berry"}.`,
                description: legacy ? legacyDescriptionText : descriptionText
            };
        }
    } catch {
        // Use the default greeting.
    }

    return {
        heading: legacy?.displayName ? `Hello, I'm ${legacy.displayName}.` : fallbackHeadingText,
        description: legacy ? legacyDescriptionText : descriptionText
    };
}


function typeText(element, text, speed) {
    return new Promise((resolve) => {
        let index = 0;

        element.textContent = "";
        element.classList.add(
            "typing-active"
        );

        const interval =
            window.setInterval(() => {
                element.textContent +=
                    text.charAt(index);

                index += 1;

                if (index >= text.length) {
                    window.clearInterval(
                        interval
                    );

                    element.classList.remove(
                        "typing-active"
                    );

                    resolve();
                }
            }, speed);
    });
}


async function startHomepageTyping() {
    if (
        !typedHeading ||
        !typedDescription ||
        !startChatButton
    ) {
        return;
    }

    const pageContext = await getPageContext();
    const headingText = pageContext.heading;

    typedHeading.setAttribute(
        "aria-label",
        headingText
    );
    typedDescription.setAttribute("aria-label", pageContext.description);

    await new Promise((resolve) => {
        window.setTimeout(resolve, 400);
    });

    await typeText(
        typedHeading,
        headingText,
        70
    );

    await new Promise((resolve) => {
        window.setTimeout(resolve, 200);
    });

    await typeText(
        typedDescription,
        pageContext.description,
        28
    );

    await new Promise((resolve) => {
        window.setTimeout(resolve, 220);
    });

    startChatButton.classList.add(
        "show-action"
    );
}


if (startChatButton) {
    startChatButton.addEventListener(
        "click",
        (event) => {
            event.preventDefault();
            const destination = new URL(startChatButton.href, window.location.href);
            destination.searchParams.set("new", "1");
            window.location.href = destination.href;
        }
    );
}


startHomepageTyping();
})();
