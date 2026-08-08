"use strict";

(() => {
    const navbar = document.querySelector("[data-public-navbar]");
    const menuButton = document.querySelector(".public-menu-toggle");
    const navigation = document.querySelector(".public-nav-links");

    const updateNavbar = () => navbar?.classList.toggle("is-scrolled", window.scrollY > 16);
    updateNavbar();
    window.addEventListener("scroll", updateNavbar, { passive: true });

    menuButton?.addEventListener("click", () => {
        const isOpen = menuButton.getAttribute("aria-expanded") === "true";
        menuButton.setAttribute("aria-expanded", String(!isOpen));
        navigation?.classList.toggle("is-open", !isOpen);
    });

    navigation?.addEventListener("click", (event) => {
        if (event.target.closest("a")) {
            menuButton?.setAttribute("aria-expanded", "false");
            navigation.classList.remove("is-open");
        }
    });
})();
