"use strict";

(() => {
  const header = document.querySelector("[data-site-header]");
  const menuButton = document.querySelector(".menu-toggle");
  const navigation = document.querySelector(".site-nav");
  const navLinks = [...document.querySelectorAll('.site-nav a[href^="#"]')];
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const ryaCanvas = document.querySelector("#rya-canvas");
  const heroHost = document.querySelector(".hero");
  const sectionHost = document.querySelector("[data-rya-section-host]");
  let ryaHost = ryaCanvas?.parentElement;
  let placementFrame = 0;

  const moveRya = (target) => {
    if (!ryaCanvas || !target || ryaHost === target) return;
    target.appendChild(ryaCanvas);
    ryaHost = target;
    requestAnimationFrame(() => dispatchEvent(new Event("resize")));
  };

  const placeRya = () => {
    placementFrame = 0;
    if (!heroHost || !sectionHost) return;
    const sectionRect = sectionHost.getBoundingClientRect();
    const heroRect = heroHost.getBoundingClientRect();
    const sectionVisible = sectionRect.top < innerHeight * 0.84 && sectionRect.bottom > innerHeight * 0.16;
    if (sectionVisible) moveRya(sectionHost);
    else if (heroRect.bottom > 0 && heroRect.top < innerHeight) moveRya(heroHost);
  };

  const scheduleRyaPlacement = () => {
    if (placementFrame) return;
    placementFrame = requestAnimationFrame(placeRya);
  };

  placeRya();
  addEventListener("scroll", scheduleRyaPlacement, { passive: true });
  addEventListener("resize", scheduleRyaPlacement, { passive: true });

  const setMenu = (open) => {
    menuButton?.setAttribute("aria-expanded", String(open));
    navigation?.classList.toggle("is-open", open);
    header?.classList.toggle("is-open", open);
    const label = menuButton?.querySelector(".sr-only");
    if (label) label.textContent = open ? "Close navigation" : "Open navigation";
  };

  const updateHeader = () => header?.classList.toggle("is-scrolled", scrollY > 18);
  updateHeader();
  addEventListener("scroll", updateHeader, { passive: true });

  menuButton?.addEventListener("click", () => {
    setMenu(menuButton.getAttribute("aria-expanded") !== "true");
  });

  navigation?.addEventListener("click", (event) => {
    if (event.target.closest("a")) setMenu(false);
  });

  addEventListener("keydown", (event) => {
    if (event.key === "Escape") setMenu(false);
  });

  const reveals = [...document.querySelectorAll(".reveal")];
  if (reducedMotion.matches || !("IntersectionObserver" in window)) {
    reveals.forEach((element) => element.classList.add("is-visible"));
  } else {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -5%" });
    reveals.forEach((element) => revealObserver.observe(element));
  }

  const sections = navLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  if ("IntersectionObserver" in window) {
    const sectionObserver = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      navLinks.forEach((link) => {
        const current = link.getAttribute("href") === `#${visible.target.id}`;
        if (current) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      });
    }, { threshold: [0.2, 0.45, 0.7], rootMargin: "-20% 0px -55%" });
    sections.forEach((section) => sectionObserver.observe(section));
  }

  const year = document.querySelector("[data-year]");
  if (year) year.textContent = String(new Date().getFullYear());
})();
