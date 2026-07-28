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


async function getHeadingText() {
    try {
        await window.authReady;

        const currentUser =
            window.WaffleBerryApi
                .getStoredUser();

        const firstName =
            getFirstName(
                currentUser?.full_name
            );

        if (firstName) {
            return (
                `Hello, ${firstName}. ` +
                "I'm Berry."
            );
        }
    } catch {
        // Use the default greeting.
    }

    return fallbackHeadingText;
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

    const headingText =
        await getHeadingText();

    typedHeading.setAttribute(
        "aria-label",
        headingText
    );

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
        descriptionText,
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
            window.location.href =
                "chat.html?new=1";
        }
    );
}


startHomepageTyping();
})();
