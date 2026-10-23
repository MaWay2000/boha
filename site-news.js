(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root.document) api.mount(root);
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  // Public release notes only. Add the newest entry first and give it a new ID.
  const NEWS = [
    { id: "2026-10-23-awards", date: "2026-10-23", category: "Awards",
      title: "Awards, with clearer rules",
      text: "Meet Slayer, War Factory, Mad scientist, Camper Hill and more. Award names and explanations have been updated, several eligibility rules corrected, and unsupported achievement claims removed. Open the awards guide in the Replay Analyzer for the details." },
    { id: "2026-10-23-telemetry", date: "2026-10-23", category: "Replay statistics",
      title: "A closer look at each match",
      text: "New analyses can record completed construction, research, ownership changes, sampled army value and power balances. The new coverage panel shows exactly what is available. Older cached matches need reanalysis; exact damage and killer attribution are not available yet." },
    { id: "2026-10-22-match-details", date: "2026-10-22", category: "Interface",
      title: "Faster match details",
      text: "Opening a match in a player profile now updates only that match row, keeping the rest of the profile and unit previews in place. Recent Matches & Analysis is centered, and the replay column is now called Statistics." }
  ];

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function bounds(width, height, balloonWidth, balloonHeight) {
    return { maxX: Math.max(0, width - balloonWidth), maxY: Math.max(0, Math.min(300, height - balloonHeight)) };
  }
  function createFlight(limits, random = Math.random) {
    return { x: limits.maxX * 0.72, y: Math.min(40, limits.maxY), direction: -1,
      fromY: Math.min(40, limits.maxY), targetY: random() * limits.maxY,
      verticalTime: 0, verticalDuration: 6 + random() * 5, lean: 0 };
  }
  function advanceFlight(state, seconds, limits, random = Math.random) {
    // Cap elapsed time so returning from a hidden tab never jumps across the page.
    const dt = clamp(Number.isFinite(seconds) ? seconds : 0, 0, 0.05);
    let x = clamp(state.x, 0, limits.maxX) + state.direction * 28 * dt;
    let direction = state.direction;
    if (x <= 0) { x = 0; direction = 1; }
    if (x >= limits.maxX) { x = limits.maxX; direction = -1; }
    let fromY = clamp(state.fromY, 0, limits.maxY), targetY = clamp(state.targetY, 0, limits.maxY);
    let verticalTime = state.verticalTime + dt, verticalDuration = state.verticalDuration;
    if (verticalTime >= verticalDuration) {
      fromY = targetY; targetY = random() * limits.maxY;
      verticalTime = 0; verticalDuration = 6 + random() * 5;
    }
    const progress = clamp(verticalTime / verticalDuration, 0, 1);
    const eased = progress * progress * (3 - 2 * progress);
    return { x, y: fromY + (targetY - fromY) * eased, direction, fromY, targetY,
      verticalTime, verticalDuration, lean: Math.sin(verticalTime * 0.8) * 2 };
  }

  function mount(win) {
    const doc = win.document;
    const button = doc.getElementById("siteNewsBalloon");
    const dialog = doc.getElementById("siteNewsDialog");
    if (!button || !dialog || button.dataset.mounted) return;
    button.dataset.mounted = "true";
    const close = doc.getElementById("siteNewsClose");
    const unread = doc.getElementById("siteNewsUnread");
    const list = doc.getElementById("siteNewsList");
    const storageKey = "boha.siteNews.lastRead";
    const latest = NEWS[0].id;
    const read = () => { try { return win.localStorage.getItem(storageKey); } catch { return null; } };
    const markRead = () => { try { win.localStorage.setItem(storageKey, latest); } catch {} };
    unread.hidden = read() === latest;
    for (const entry of NEWS.slice(0, 5)) {
      const item = doc.createElement("li"); item.className = "site-news-entry";
      const meta = doc.createElement("div"); meta.className = "site-news-meta";
      const date = doc.createElement("time"); date.dateTime = entry.date;
      date.textContent = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Vilnius" })
        .format(new Date(entry.date + "T12:00:00Z"));
      const category = doc.createElement("span"); category.className = "site-news-category"; category.textContent = entry.category;
      const heading = doc.createElement("h3"); heading.textContent = entry.title;
      const text = doc.createElement("p"); text.textContent = entry.text;
      meta.append(date, category); item.append(meta, heading, text); list.append(item);
    }
    const reducedMotion = win.matchMedia("(prefers-reduced-motion: reduce)");
    const motionControl = doc.getElementById("siteNewsMotion");
    const motionNote = doc.getElementById("siteNewsMotionNote");
    const motionStorageKey = "boha.siteNews.motion";
    let savedMotion = null;
    try { savedMotion = win.localStorage.getItem(motionStorageKey); } catch {}
    const pageUrl = win.location?.href ? new URL(win.location.href) : null;
    const localPreview = ["127.0.0.1", "localhost", "[::1]"].includes(pageUrl?.hostname);
    // The owner explicitly requested flight for the localhost preview. It
    // must work on the ordinary URL, not only a special query-string link.
    // Public visitors still default to their system motion preference, and
    // an explicit checkbox-off preference is respected everywhere.
    const requestedFlight = pageUrl?.searchParams.get("newsFlight");
    if (requestedFlight === "on") {
      savedMotion = "on";
      try { win.localStorage.setItem(motionStorageKey, savedMotion); } catch {}
    }
    const defaultMotionEnabled = () => localPreview || !reducedMotion.matches;
    let motionEnabled = savedMotion === "on" || (savedMotion !== "off" && defaultMotionEnabled());
    const updateMotionControl = () => {
      motionControl.checked = motionEnabled;
      motionNote.textContent = !motionEnabled
        ? (savedMotion === "off" ? "Flight is off. Enable Animate balloon to make it fly around the page."
          : "Reduced motion is enabled on your system. You can opt in here.")
        : "Flies across the page. Hover pauses briefly; opening news pauses the flight.";
    };
    updateMotionControl();
    let limits, state, frame = null, previous = null, hoverTimer = null, pointerInside = false, focusInside = false, keyboardNavigation = false;
    const place = () => { button.style.transform = `translate3d(${state.x.toFixed(2)}px, ${state.y.toFixed(2)}px, 0) rotate(${state.lean.toFixed(2)}deg)`; };
    const resize = () => {
      limits = bounds(doc.documentElement.clientWidth, win.innerHeight, button.offsetWidth, button.offsetHeight);
      if (!state) state = createFlight(limits);
      state.x = clamp(state.x, 0, limits.maxX); state.y = clamp(state.y, 0, limits.maxY);
      if (!motionEnabled) { state.x = limits.maxX; state.y = 12; state.y = Math.min(state.y, limits.maxY); state.lean = 0; }
      place();
    };
    const canFly = () => !doc.hidden && !dialog.open && !pointerInside && !focusInside && motionEnabled;
    const stop = () => { if (frame != null) win.cancelAnimationFrame(frame); frame = null; previous = null; };
    const tick = now => {
      frame = null;
      if (!canFly()) { previous = null; return; }
      if (previous != null) { state = advanceFlight(state, (now - previous) / 1000, limits); place(); }
      previous = now; frame = win.requestAnimationFrame(tick);
    };
    const sync = () => {
      stop();
      const flying = canFly();
      button.dataset.flying = flying ? "true" : "false";
      if (win.CustomEvent) button.dispatchEvent(new win.CustomEvent("boha:news-balloon-state"));
      if (flying) frame = win.requestAnimationFrame(tick);
    };
    const clearHoverTimer = () => { if (hoverTimer != null) win.clearTimeout(hoverTimer); hoverTimer = null; };
    button.addEventListener("pointerenter", event => {
      if (event.pointerType === "touch") return;
      clearHoverTimer(); pointerInside = true; sync();
      // Give the pointer time to click, without leaving the balloon parked
      // indefinitely under the cursor. Touch does not create a hover pause.
      hoverTimer = win.setTimeout(() => { hoverTimer = null; pointerInside = false; sync(); }, 1200);
    });
    button.addEventListener("pointerleave", () => { clearHoverTimer(); pointerInside = false; sync(); });
    doc.addEventListener("keydown", () => { keyboardNavigation = true; });
    doc.addEventListener("pointerdown", () => { keyboardNavigation = false; focusInside = false; sync(); });
    button.addEventListener("focus", () => { focusInside = keyboardNavigation; sync(); });
    button.addEventListener("blur", () => { focusInside = false; sync(); });
    button.addEventListener("click", () => {
      if (dialog.open) return;
      dialog.showModal();
      dialog.scrollTop = 0;
      button.setAttribute("aria-expanded", "true");
      doc.body.classList.add("site-news-open");
      unread.hidden = true; markRead(); sync(); close.focus();
    });
    close.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", event => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
    dialog.addEventListener("close", () => {
      doc.body.classList.remove("site-news-open"); button.setAttribute("aria-expanded", "false");
      button.focus({ preventScroll: true }); sync();
    });
    doc.addEventListener("visibilitychange", sync);
    win.addEventListener("resize", resize);
    motionControl.addEventListener("change", () => {
      motionEnabled = motionControl.checked; savedMotion = motionEnabled ? "on" : "off";
      try { win.localStorage.setItem(motionStorageKey, savedMotion); } catch {}
      if (win.location?.href && win.history?.replaceState) {
        const url = new URL(win.location.href);
        url.searchParams.delete("newsFlight");
        win.history.replaceState(win.history.state, "", url);
      }
      updateMotionControl(); resize();
      if (motionEnabled) { state.fromY = state.y; state.targetY = Math.random() * limits.maxY; state.verticalTime = 0; }
      sync();
    });
    reducedMotion.addEventListener("change", () => {
      if (savedMotion == null) motionEnabled = defaultMotionEnabled();
      updateMotionControl(); resize(); sync();
    });
    win.addEventListener("storage", event => { if (event.key === storageKey) unread.hidden = read() === latest; });
    win.addEventListener("pagehide", () => { clearHoverTimer(); pointerInside = false; stop(); });
    win.addEventListener("pageshow", sync);
    resize(); sync();
  }
  return { NEWS, bounds, createFlight, advanceFlight, mount };
});
