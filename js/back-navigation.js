"use strict";

(function initializeBackNavigation() {
document
    .querySelectorAll(
        "[data-back-navigation]"
    )
    .forEach((container) => {
        const destination =
            container.dataset.backHref;

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
        link.href = destination;
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
