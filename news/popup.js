(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root.document) api.mount(root);
})(typeof globalThis === "object" ? globalThis : this, function () {
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
      let link;
      if (entry.link != null) {
        if (typeof entry.link.label !== 'string' || !entry.link.label.trim() || typeof entry.link.href !== 'string'
          || (!/^(?:[a-z0-9_-]+\/)+(?:[a-z0-9_-]+\.html)?$/i.test(entry.link.href)
            && !['index.html?tab=wavehoster', 'index.html?tab=leaderboards'].includes(entry.link.href))) throw new Error('Invalid news link.');
        link = { label: entry.link.label, href: entry.link.href };
      }
      let image;
      if (entry.image != null) {
        const value = entry.image;
        if (typeof value.src !== 'string' || !/^news\/images\/[a-z0-9_-]+\.(?:png|jpg|webp)$/i.test(value.src)
          || typeof value.alt !== 'string' || !value.alt.trim()
          || !Number.isInteger(value.width) || value.width < 1 || value.width > 4096
          || !Number.isInteger(value.height) || value.height < 1 || value.height > 4096) throw new Error('Invalid news image.');
        image = { src: value.src, alt: value.alt, width: value.width, height: value.height };
      }
      return { id: entry.id, date: entry.date, category: entry.category, title: entry.title, text: entry.text, ...(link ? {link} : {}), ...(image ? {image} : {}) };
    }).sort((a, b) => b.date.localeCompare(a.date));
  }
  function mount(win, initialRecords = []) {
    const doc = win.document;
    const button = doc.getElementById("siteNewsButton");
    const dialog = doc.getElementById("siteNewsDialog");
    if (!button || !dialog || button.dataset.mounted) return;
    button.dataset.mounted = "true";
    const close = doc.getElementById("siteNewsClose");
    const list = doc.getElementById("siteNewsList");
    const archiveStatus = doc.getElementById("siteNewsArchiveStatus");
    const older = doc.getElementById("siteNewsOlder");
    let records = [...initialRecords], loaded = records.length > 0;
    let visibleCount = PAGE_SIZE, renderedCount = 0, loading = false, loadError = false;
    let ready = Promise.resolve();
    const createEntry = entry => {
      const item = doc.createElement("li"); item.className = "site-news-entry";
      const meta = doc.createElement("div"); meta.className = "site-news-meta";
      const date = doc.createElement("time"); date.dateTime = entry.date;
      date.textContent = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Vilnius" })
        .format(new Date(entry.date + "T12:00:00Z"));
      const category = doc.createElement("span"); category.className = "site-news-category"; category.textContent = entry.category;
      const heading = doc.createElement("h3"); heading.textContent = entry.title;
      const text = doc.createElement("p"); text.textContent = entry.text;
      if (entry.link) {
        const link = doc.createElement('a'); link.className = 'site-news-link';
        link.textContent = entry.link.label; link.setAttribute('href', entry.link.href);
        text.append(link);
      }
      heading.tabIndex = -1;
      meta.append(date, category); item.append(meta, heading, text);
      if (entry.image) {
        const image = doc.createElement('img'); image.className = 'site-news-image';
        for (const [key, value] of Object.entries(entry.image)) image.setAttribute(key, String(value));
        image.setAttribute('loading', 'lazy'); image.setAttribute('decoding', 'async');
        item.append(image);
      }
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
    const refreshArchive = async () => {
      if (loading) return;
      loading = true; older.disabled = true; archiveStatus.textContent = "Loading news archive…";
      try {
        const url = new URL("news/records.json", doc.baseURI || win.location.href);
        const response = await win.fetch(url.href, { cache: "no-cache", credentials: "same-origin" });
        if (!response.ok) throw new Error("News archive request failed.");
        const next = normalizeArchive(await response.json());
        records = next; loaded = true; visibleCount = PAGE_SIZE; renderedCount = 0;
        loadError = false; list.replaceChildren(); renderOlder();

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
    if (loaded) renderOlder();
    button.addEventListener("click", () => {
      if (dialog.open) return;
      dialog.showModal();
      dialog.scrollTop = 0;
      button.setAttribute("aria-expanded", "true");
      doc.body.classList.add("site-news-open");
      close.focus();
      if (!loaded || loadError) ready = refreshArchive();
    });
    close.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", event => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
    dialog.addEventListener("close", () => {
      doc.body.classList.remove("site-news-open");
      button.setAttribute("aria-expanded", "false");
      button.focus({ preventScroll: true });
    });
    return { get ready() { return ready; } };
  }
  return { normalizeArchive, mount };
});
