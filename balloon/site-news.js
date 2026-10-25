(function (root, factory) {
  const api = factory(typeof module === "object" && module.exports ? require("../news/records.json") : null);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root.document) api.mount(root);
})(typeof globalThis === "object" ? globalThis : this, function (initialArchive) {
  "use strict";

  const PAGE_SIZE = 3;
  function normalizeArchive(archive) {
    if (archive?.schemaVersion !== 1 || !Array.isArray(archive.entries)) throw new Error("Unsupported news archive.");
    const ids = new Set();
    return archive.entries.map(entry => {
      if (!entry || ["id", "date", "category", "title", "text"].some(key => typeof entry[key] !== "string" || !entry[key].trim()))
        throw new Error("Invalid news record.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)
        || !Number.isFinite(Date.parse(entry.date + "T12:00:00Z"))
        || new Date(entry.date + "T12:00:00Z").toISOString().slice(0, 10) !== entry.date || ids.has(entry.id))
        throw new Error("Invalid news date or duplicate record ID.");
      ids.add(entry.id);
      return { id: entry.id, date: entry.date, category: entry.category, title: entry.title, text: entry.text };
    }).sort((a, b) => b.date.localeCompare(a.date));
  }
  const NEWS = initialArchive ? normalizeArchive(initialArchive) : [];

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

  function mount(win, initialRecords = NEWS) {
    const doc = win.document;
    const button = doc.getElementById("siteNewsBalloon");
    const dialog = doc.getElementById("siteNewsDialog");
    if (!button || !dialog || button.dataset.mounted) return;
    button.dataset.mounted = "true";
    const close = doc.getElementById("siteNewsClose");
    const unread = doc.getElementById("siteNewsUnread");
    const list = doc.getElementById("siteNewsList");
    const archiveStatus = doc.getElementById("siteNewsArchiveStatus");
    const older = doc.getElementById("siteNewsOlder");
    let records = [...initialRecords], latest = records[0]?.id || null;
    let visibleCount = PAGE_SIZE, renderedCount = 0, loading = false, loadError = false;
    const storageKey = "boha.siteNews.lastRead";
    const read = () => { try { return win.localStorage.getItem(storageKey); } catch { return null; } };
    const markRead = () => { if (latest) { try { win.localStorage.setItem(storageKey, latest); } catch {} } };
    const syncUnread = () => { unread.hidden = !latest || read() === latest; };
    syncUnread();
    const createEntry = entry => {
      const item = doc.createElement("li"); item.className = "site-news-entry";
      const meta = doc.createElement("div"); meta.className = "site-news-meta";
      const date = doc.createElement("time"); date.dateTime = entry.date;
      date.textContent = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Vilnius" })
        .format(new Date(entry.date + "T12:00:00Z"));
      const category = doc.createElement("span"); category.className = "site-news-category"; category.textContent = entry.category;
      const heading = doc.createElement("h3"); heading.textContent = entry.title;
      const text = doc.createElement("p"); text.textContent = entry.text;
      heading.tabIndex = -1;
      meta.append(date, category); item.append(meta, heading, text);
      return { item, heading };
    };
    const renderOlder = () => {
      const until = Math.min(visibleCount, records.length);
      let firstNewHeading = null;
      for (const entry of records.slice(renderedCount, until)) {
        const node = createEntry(entry); list.append(node.item); firstNewHeading ||= node.heading;
      }
      renderedCount = until;
      archiveStatus.textContent = records.length ? `Showing ${until} of ${records.length} updates · newest first`
        : "No news records yet.";
      older.hidden = until >= records.length;
      older.disabled = false; older.textContent = "Load older news";
      return firstNewHeading;
    };
    renderOlder();
    const refreshArchive = async () => {
      if (loading) return;
      loading = true; older.disabled = true; archiveStatus.textContent = "Loading news archive…";
      try {
        const url = new URL("news/records.json", doc.baseURI || win.location.href);
        const response = await win.fetch(url.href, { cache: "no-cache", credentials: "same-origin" });
        if (!response.ok) throw new Error("News archive request failed.");
        const next = normalizeArchive(await response.json());
        records = next; latest = records[0]?.id || null; visibleCount = PAGE_SIZE; renderedCount = 0;
        loadError = false; list.replaceChildren(); renderOlder();
        if (dialog.open) markRead(); syncUnread();
      } catch {
        loadError = true;
        archiveStatus.textContent = records.length ? "Showing loaded news. The archive could not be refreshed."
          : "Could not load the news archive. Please try again.";
        older.hidden = false; older.disabled = false; older.textContent = "Retry loading news";
      } finally { loading = false; }
    };
    older.addEventListener("click", () => {
      if (loadError) { refreshArchive(); return; }
      if (loading) return;
      visibleCount += PAGE_SIZE;
      const heading = renderOlder();
      if (heading && dialog.open) {
        heading.focus({ preventScroll: true });
        heading.scrollIntoView?.({ block: "nearest", behavior: "instant" });
      }
    });
    const reducedMotion = win.matchMedia("(prefers-reduced-motion: reduce)");
    const motionControl = doc.getElementById("siteNewsMotion");
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
      motionControl.title = !motionEnabled
        ? (savedMotion === "off" ? "Flight is off. Enable Animate balloon to make it fly around the page."
          : "Reduced motion is enabled on your system. You can opt in here.")
        : "Flies near the top of the page. Hover pauses briefly; opening news pauses the flight.";
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
    const inView = () => state && state.y + button.offsetHeight > (win.scrollY || 0)
      && state.y < (win.scrollY || 0) + win.innerHeight;
    const canFly = () => !doc.hidden && !dialog.open && inView() && balloonAlive() && !pointerInside && !focusInside && motionEnabled;
    const balloonAlive = () => button.dataset.destroyed !== "true";
    const stop = () => { if (frame != null) win.cancelAnimationFrame(frame); frame = null; previous = null; };
    const tick = now => {
      frame = null;
      if (!canFly()) { sync(); return; }
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
      if (dialog.open || !balloonAlive()) return;
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
    button.addEventListener("boha:news-balloon-destroyed", sync);
    button.addEventListener("boha:news-balloon-repaired", sync);
    win.addEventListener("resize", () => { resize(); sync(); });
    win.addEventListener("scroll", sync, { passive: true });
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
    win.addEventListener("storage", event => { if (event.key === storageKey) syncUnread(); });
    win.addEventListener("pagehide", () => { clearHoverTimer(); pointerInside = false; stop(); });
    win.addEventListener("pageshow", sync);
    resize(); sync();
    const ready = typeof win.fetch === "function" ? refreshArchive() : Promise.resolve(records);
    return { ready };
  }
  return { NEWS, PAGE_SIZE, normalizeArchive, bounds, createFlight, advanceFlight, mount };
});
