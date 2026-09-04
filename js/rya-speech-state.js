"use strict";

(() => {
  let owner = null;
  let active = false;

  function publish(nextActive) {
    if (active === nextActive) return;
    active = nextActive;
    window.RyaEnergyControl?.setSpeechEnergy({
      active,
      scale: active ? 0.3 : 0,
      glow: active ? 0.55 : 0,
      particles: active ? 0.28 : 0,
    });
    window.dispatchEvent(new CustomEvent("legarya-rya-speech", {
      detail: { active, owner },
    }));
  }

  window.LegaryaRyaSpeech = Object.freeze({
    claim(nextOwner) {
      if (!nextOwner || (owner && owner !== nextOwner)) return false;
      owner = nextOwner;
      return true;
    },
    activate(nextOwner) {
      if (owner !== nextOwner) return false;
      publish(true);
      return true;
    },
    release(nextOwner) {
      if (owner !== nextOwner) return false;
      publish(false);
      owner = null;
      return true;
    },
    isClaimed() {
      return Boolean(owner);
    },
    isActive() {
      return active;
    },
    getOwner() {
      return owner;
    },
  });
})();
