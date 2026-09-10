"use strict";

(() => {
  const page = location.pathname.split("/").pop() || "index.html";
  const $ = (selector) => document.querySelector(selector);
  const make = (tag, text, cls) => { const node = document.createElement(tag); if (text) node.textContent = text; if (cls) node.className = cls; return node; };
  const button = (text, action, cls = "") => { const node = make("button", text, cls); node.type = "button"; node.addEventListener("click", action); return node; };
  const read = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
  const userId = () => read(window.LegaryaAuthApi?.STORAGE_KEYS?.CURRENT_USER || "currentUser")?.id;
  const tourKey = () => `legarya:guide:v1:${userId()}:${page}`;
  const rewardCopy = "Complete a 30-day streak to earn 1 month of Legarya Plus.";
  const guides = {
    "index.html": ["A place for the stories that matter", ["Start your journey", "Create an account or sign in to choose your path."], ["Build with Rya", "Rya guides you through preserving a person's memories, stories and personality."], ["Talk with a Legacy", "Use a shared Legacy code to open a separate AI conversation grounded in preserved memories."]],
    "gateway.html": ["Choose the experience you want", ["Build with Rya", "Choose the first card to create or continue a legacy. Rya is your guide for collecting stories."], ["Help someone build", "Choose Collaborate and enter the COL code shared by the owner. You can contribute memories."], ["Talk with a Legacy", "Choose Talk with a Legacy and enter a LEG code. This opens the AI legacy conversation, separate from Rya's builder chat."]],
    "chat.html": ["Build a legacy, one memory at a time", ["You're talking to Rya", "Rya helps you build and improve a legacy. Tell her whose story you want to preserve, then share a specific memory, habit or life moment."], ["Photos & documents: the + button", "Use + beside the microphone to open your source library and upload photos or documents. These are memory sources; uploading here does not set the legacy's display picture."], ["Legacy photo: their display picture", "Open Legacy photo in the sidebar to choose the picture that represents this legacy."], ["Memories & access", "Open Memories to review what has been preserved. Use Access to manage the sharing options available to you."], ["Talk with the legacy", "Use Back to return to the path selection page, then choose Talk with a Legacy and enter its Legacy code. This is a separate conversation from building with Rya."], ["Keep your story growing", "Preserve a meaningful memory each day. The streak updates when today's preservation is confirmed. " + rewardCopy + " A streak counts consecutive days."]],
    "legacy-chat.html": ["A conversation with an AI legacy", ["Meet the legacy", "This is an AI representation grounded in preserved memories, not the real person or the Rya builder."], ["Introduce yourself", "Say who you are and how you know this person. Ask about a memory, a favourite story or something meaningful to you."], ["Type or speak", "Type your message, use the microphone to dictate, or use the phone button when voice conversation is available."], ["Want to add memories?", "This conversation is read-only for the legacy's memories. Go Back and choose Build with Rya or Collaborate to contribute stories."]],
    "auth.html": ["Welcome to Legarya", ["Sign in or create an account", "Use your email and password. If you're new, choose the sign-up option and complete email verification."], ["Forgot your password?", "Use Forgot password to receive a recovery code. Once signed in, choose whether to build or talk with a legacy."]],
    "forgot-password.html": ["Recover your account", ["Enter your email", "Use the email address you signed up with. Request a reset code, then check your inbox and spam folder."], ["Continue securely", "Enter the code on the next page. Never share your verification code with anyone."]],
    "verify-reset-otp.html": ["Verify your recovery code", ["Check your inbox", "Enter the password-reset code sent to your email. Use the resend option if it has expired."], ["Set a new password", "Once the code is verified, you'll be able to choose a new password."]],
    "reset-password.html": ["Choose a new password", ["Update your password", "Enter and confirm your new password, following the requirements shown in the form."], ["Sign in again", "After the reset succeeds, sign in with your new password. If your reset session expired, request another code."]],
    "verify-email.html": ["Verify your email", ["Check your inbox", "Enter the verification code sent to your email address. Check spam if it hasn't arrived."], ["Need a fresh code?", "Use the resend option when available, then enter the newest code. Verification lets you continue into Legarya."]],
    "invite.html": ["Open your invitation", ["Check who invited you", "Review the legacy and invitation details. Sign in with the account you want to use."], ["Accept and continue", "Use the invitation's action to continue. A collaboration invitation lets you help build; a legacy conversation invitation lets you talk with the AI legacy."], ["Invitation unavailable?", "If it has expired or been revoked, ask the owner for a fresh invitation."]],
    "privacy.html": ["Understand your privacy", ["Read the policy", "This page explains how Legarya handles your information. Scroll through the sections for the details relevant to you."], ["Return to your journey", "Use Back to leave this page. Reading the policy doesn't change your account or sharing settings."]],
    "terms.html": ["Understand the terms", ["Read before using Legarya", "This page sets out the terms for using the service. Review its sections and any contact information provided."], ["Return when you're ready", "Use Back to return to the home page."]],
    "realtime-dev.html": ["Voice development workspace", ["Choose your normal workspace", "For everyday use, open the path selection page and choose Build with Rya or Talk with a Legacy."], ["Voice controls", "In your chat, the microphone dictates a message. The phone button starts a voice conversation when available."]],
  };
  const content = guides[page] || guides["index.html"];
  const help = make("dialog", null, "lg-help"); help.id = "legaryaHelp"; help.setAttribute("aria-labelledby", "lgHelpTitle");
  const helpHeader = make("header"); const heading = make("div"); heading.append(make("small", "A LITTLE GUIDANCE")); const helpTitle = make("h2", content[0]); helpTitle.id = "lgHelpTitle"; heading.append(helpTitle);
  helpHeader.append(heading, button("×", () => help.close(), "lg-close")); helpHeader.lastChild.setAttribute("aria-label", "Close Help"); help.append(helpHeader);
  const sections = make("div", null, "lg-help-sections");
  content.slice(1).forEach(([title, body], index) => { const item = make("details"); item.open = index < 2; item.append(make("summary", title), make("p", body)); sections.append(item); }); help.append(sections);
  const helpFooter = make("footer"); helpFooter.append(make("span", "A little guidance, whenever you need it.")); help.append(helpFooter);
  const launcher = button("?  Help", () => { pauseTour(); help.showModal(); }, "lg-help-launcher"); launcher.setAttribute("aria-haspopup", "dialog"); launcher.setAttribute("aria-controls", help.id);
  // Keep the chat composer unobstructed and put Help next to the page's navigation.
  const chatHeader = $(".chat-header");
  if (chatHeader) { chatHeader.classList.add("lg-has-help"); $(".header-spacer")?.remove(); chatHeader.append(launcher); }
  else { launcher.classList.add("lg-help-floating"); document.body.append(launcher); }
  document.body.append(help);

  const steps = page === "chat.html" ? [
    { target: ".rya-heading", title: "Meet Rya, your legacy guide", text: "Rya helps you collect stories and build a legacy. The conversation with the AI legacy lives in a separate place." },
    { target: "#composer", title: "Start with a person. Then a memory.", text: "Tell Rya whose legacy you're creating. Answer her questions in your own words. Try a favourite moment, a small habit or a story you don't want to lose.", action: "Write to Rya", run: () => $("#messageInput")?.focus(), next: "Explore the tools" },
    { target: "#openMediaSources", title: "Add pieces of their story", text: "The + opens Photos & documents. Upload a memory source here; it won't change the legacy's display picture.", action: "Open photos & documents", run: () => $("#openMediaSources")?.click() },
    { target: "#openVisualPresence", title: "Give the legacy a familiar face", text: "Legacy photo sets the picture that represents this legacy. It's separate from photos uploaded as memories.", sidebar: true, action: "Choose a legacy photo", run: () => $("#openVisualPresence")?.click() },
    { target: ".premium-back", title: "Ready to talk with a legacy?", text: "Use Back, choose Talk with a Legacy, then enter its Legacy code. Keep coming to Rya when you want to build or add memories." },
  ] : page === "legacy-chat.html" ? [
    { target: ".legacy-persona-heading", title: "You're now talking with an AI legacy", text: "This conversation draws on preserved memories. It is an AI representation, not the real person or Rya's builder chat." },
    { target: "#composer", title: "Start by saying hello", text: "Introduce yourself and your relationship. Ask about a memory or favourite story. You can type, dictate with the microphone or use the phone button when available.", action: "Start a conversation", run: () => $("#messageInput")?.focus() },
    { target: ".premium-back", title: "Have another story to preserve?", text: "Use Back and choose Build with Rya or Collaborate to add memories. This legacy conversation doesn't edit the preserved memories." },
  ] : null;
  const coach = make("section", null, "lg-coach"); coach.hidden = true; coach.setAttribute("role", "region"); coach.setAttribute("aria-label", "Getting started tutorial");
  const spot = make("div", null, "lg-spotlight"); spot.hidden = true; spot.setAttribute("aria-hidden", "true");
  document.body.append(spot, coach);
  let tour = null, target = null, sidebarOpened = false, frame = 0, celebration = null, timer = null, sessionEnded = false;
  let pendingCelebration = null;
  const visible = (el) => el && !el.hidden && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden";
  const blocking = () => !!document.querySelector("dialog[open], [aria-modal='true']:not([hidden])") || !!celebration;
  const saveTour = (done = false) => { if (userId()) write(tourKey(), { step: tour?.index || 0, done }); };
  function pauseTour() { coach.hidden = spot.hidden = true; }
  function closeSidebar() { if (sidebarOpened) { $("#closeSidebar")?.click(); sidebarOpened = false; } }
  function finishTour() { saveTour(true); tour = null; pauseTour(); closeSidebar(); launcher.focus(); }
  function layout() {
    frame = 0;
    if (!tour || blocking()) { pauseTour(); return; }
    const step = steps[tour.index];
    if (step.sidebar && matchMedia("(max-width: 800px)").matches && !document.body.classList.contains("drawer-open")) { $("#openSidebar")?.click(); sidebarOpened = true; }
    target = $(step.target); coach.hidden = false;
    const viewport = window.visualViewport; const width = viewport?.width || innerWidth; const height = viewport?.height || innerHeight; const topOffset = viewport?.offsetTop || 0;
    coach.style.maxHeight = `${Math.max(130, height - 24)}px`;
    const r = visible(target) ? target.getBoundingClientRect() : null;
    spot.hidden = !r;
    if (r) Object.assign(spot.style, { left: `${Math.max(4, r.left - 5)}px`, top: `${r.top - 5}px`, width: `${Math.min(width - 8, r.width + 10)}px`, height: `${r.height + 10}px` });
    const box = coach.getBoundingClientRect();
    const x = r ? Math.max(12, Math.min(width - box.width - 12, r.left)) : Math.max(12, (width - box.width) / 2);
    let y = r ? r.bottom + 18 : topOffset + (height - box.height) / 2;
    if (y + box.height > topOffset + height - 12) y = r ? r.top - box.height - 18 : y;
    y = Math.max(topOffset + 12, Math.min(y, topOffset + height - box.height - 12));
    Object.assign(coach.style, { left: `${x}px`, top: `${y}px` });
    const action = coach.querySelector("[data-guide-action]"); if (action) action.hidden = !visible(target);
  }
  const scheduleLayout = () => { if (!frame) frame = requestAnimationFrame(layout); };
  function renderStep(focus = false) {
    if (!tour) return;
    closeSidebar(); const step = steps[tour.index]; coach.replaceChildren();
    const top = make("div", null, "lg-coach-top"); top.append(make("small", `YOUR FIRST STEPS · ${tour.index + 1} / ${steps.length}`), button("Skip tutorial", finishTour, "lg-skip"));
    coach.append(top, make("h2", step.title), make("p", step.text));
    const controls = make("div", null, "lg-coach-controls");
    if (step.action) { const act = button(step.action, () => { step.run(); scheduleLayout(); }, "lg-primary"); act.dataset.guideAction = ""; controls.append(act); }
    if (tour.index > 0) controls.append(button("Back", () => { tour.index--; saveTour(); renderStep(true); }, "lg-secondary"));
    const next = button(tour.index === steps.length - 1 ? "Let's begin" : step.next || "Next", () => { if (tour.index === steps.length - 1) finishTour(); else { tour.index++; saveTour(); renderStep(true); } }, step.action ? "lg-secondary" : "lg-primary");
    controls.append(next); coach.append(controls); layout(); if (focus && !coach.hidden) next.focus({ preventScroll: true });
  }
  function startTour(replay = false) {
    if (!steps || tour || sessionEnded || !userId()) return;
    const saved = read(tourKey()); if (!replay && saved?.done) return;
    tour = { index: replay ? 0 : Math.max(0, Math.min(steps.length - 1, Number(saved?.step) || 0)) }; renderStep(replay);
  }
  if (steps) helpFooter.append(button("Replay walkthrough", () => { help.close(); tour = null; startTour(true); }, "lg-primary"));
  help.addEventListener("close", () => { scheduleLayout(); tryCelebration(); });
  help.addEventListener("click", (e) => { if (e.target === help) { const r = help.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) help.close(); } });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && celebration) dismissCelebration(); else if (e.key === "Escape" && tour && !blocking()) finishTour(); });
  window.addEventListener("resize", scheduleLayout); document.addEventListener("scroll", scheduleLayout, true); window.visualViewport?.addEventListener("resize", scheduleLayout);
  // Modal tools temporarily pause guidance. Resume at the same step on close.
  new MutationObserver((records) => { if (records.some((record) => record.target.matches("dialog, [aria-modal='true'], #openMediaSources, #openVisualPresence"))) { scheduleLayout(); tryCelebration(); } }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open", "hidden"] });

  let legacyId = null, confirmed = false, lastDays = null;
  function reward(days = 0) {
    const summary = $("#journeySummary"); if (!summary) return;
    let box = $("#lgReward");
    if (!box) { box = make("div", null, "lg-reward"); box.id = "lgReward"; box.append(make("small", "YOUR 30-DAY JOURNEY"), make("strong"), make("progress"), make("p", rewardCopy), make("span", "One meaningful memory, every day.")); summary.append(box); }
    const count = Math.min(30, Math.max(0, Number(days) || 0)); box.querySelector("strong").textContent = `${count} of 30 days`;
    const meter = box.querySelector("progress"); meter.max = 30; meter.value = count; meter.setAttribute("aria-label", `${count} of 30 consecutive preservation days`);
  }
  function dismissCelebration() { clearTimeout(timer); celebration?.close(); celebration?.remove(); celebration = null; scheduleLayout(); }
  function tryCelebration() {
    if (!pendingCelebration || blocking() || sessionEnded) return;
    const { days, key } = pendingCelebration; pendingCelebration = null;
    if (read(key)) return; write(key, true); pauseTour();
    celebration = make("dialog", null, "lg-celebration"); celebration.setAttribute("aria-labelledby", "lgCelebrationTitle"); celebration.setAttribute("aria-describedby", "lgCelebrationMessage");
    const panel = make("div", null, "lg-celebration-card");
    const art = make("div", null, "lg-streak-art"); art.setAttribute("aria-hidden", "true");
    art.append(make("div", null, "lg-orbit"), make("span", "✦", "lg-spark"));
    for (let i = 0; i < 12; i++) { const particle = make("i", null, "lg-particle"); particle.style.setProperty("--angle", `${i * 30}deg`); particle.style.setProperty("--delay", `${i % 4 * 70}ms`); art.append(particle); }
    panel.append(make("small", "SOMETHING WORTH CELEBRATING"), art, make("h2", `${days} DAY STREAK`), make("p", days === 1 ? "Every legacy starts with one memory. Today, you preserved one." : "A little each day. A story that keeps growing.", "lg-celebration-message"), make("p", rewardCopy, "lg-celebration-reward"), make("span", "Come back tomorrow to preserve another piece of the story."));
    panel.querySelector("h2").id = "lgCelebrationTitle"; panel.querySelector(".lg-celebration-message").id = "lgCelebrationMessage";
    const dismiss = button("Keep going", dismissCelebration, "lg-primary"); panel.append(dismiss); celebration.append(panel); document.body.append(celebration); celebration.showModal();
    celebration.addEventListener("cancel", (event) => { event.preventDefault(); dismissCelebration(); });
    timer = setTimeout(dismissCelebration, 4500);
    panel.addEventListener("pointerenter", () => clearTimeout(timer)); panel.addEventListener("pointerleave", () => { timer = setTimeout(dismissCelebration, 2000); });
    celebration.addEventListener("focusin", () => clearTimeout(timer));
  }
  function considerCelebration(streak, explicit = false) {
    const days = Number(streak?.current_streak_days);
    if (!streak?.today_completed || ![1, 7, 30].includes(days) || !legacyId || !userId()) return;
    if (!explicit && !(confirmed && lastDays !== null && days > lastDays)) return;
    const key = `legarya:celebrated:v1:${userId()}:${legacyId}:${days}`;
    pendingCelebration = { days, key }; tryCelebration();
  }
  window.addEventListener("legarya-legacy-change", (e) => { const nextId = e.detail?.legacy?.id; if (nextId && userId()) sessionEnded = false; if (nextId !== legacyId) { legacyId = nextId; confirmed = false; lastDays = null; pendingCelebration = null; dismissCelebration(); reward(); } if (nextId) startTour(); scheduleLayout(); });
  window.addEventListener("legarya-progress-update", (e) => { if (!e.detail?.today_just_completed) return; confirmed = true; considerCelebration({ ...e.detail.streak, today_completed: true }, true); });
  window.addEventListener("legarya:activity-changed", (e) => { if (e.detail?.legacyId === legacyId) confirmed = true; });
  window.addEventListener("legarya-journey-loaded", (e) => { reward(e.detail?.streak?.current_streak_days); considerCelebration(e.detail?.streak); lastDays = Number(e.detail?.streak?.current_streak_days) || 0; confirmed = false; });
  window.addEventListener("legarya:chat-context", () => { if (page === "legacy-chat.html" && window.LegaryaLiveChat?.context()?.ready && userId()) { sessionEnded = false; startTour(); } });
  window.addEventListener("legarya:session-ending", () => { sessionEnded = true; tour = null; pendingCelebration = null; pauseTour(); dismissCelebration(); help.close(); });
  // A deferred script can run after a fast cached workspace initialization.
  if (page === "chat.html" && window.LegaryaWorkspace?.getActiveLegacy()) { legacyId = window.LegaryaWorkspace.getActiveLegacy().id; startTour(); }
  if (page === "legacy-chat.html" && window.LegaryaLiveChat?.context()?.ready) startTour();
})();
