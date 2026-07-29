"use strict";

(function initializeBackNavigation() {
document
    .querySelectorAll(
        "[data-back-navigation]"
    )
    .forEach((container) => {
        const destination =
            container.dataset.backHref;
        const parameterName =
            container.dataset.backParam;

        if (!destination) {
            return;
        }

        const link =
            document.createElement("a");
        const arrow =
            document.createElement("span");
        const label =
            document.createElement("span");

        container.classList.add(
            "app-back-navigation"
        );
        container
            .closest("main")
            ?.classList.add(
                "has-app-back-navigation"
            );
        container.setAttribute(
            "aria-label",
            "Page navigation"
        );

        link.className =
            "app-back-button";
        const parameterValue =
            parameterName
                ? new URLSearchParams(
                    window.location.search
                ).get(parameterName)
                : null;

        link.href = parameterValue
            ? `${destination}${
                destination.includes("?")
                    ? "&"
                    : "?"
            }${encodeURIComponent(
                parameterName
            )}=${encodeURIComponent(
                parameterValue
            )}`
            : destination;
        link.setAttribute(
            "aria-label",
            "Back"
        );

        arrow.className =
            "app-back-arrow";
        arrow.setAttribute(
            "aria-hidden",
            "true"
        );
        arrow.textContent = "←";

        label.textContent = "Back";

        link.append(arrow, label);
        container.replaceChildren(link);
    });
})();
