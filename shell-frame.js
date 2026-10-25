const contentFrame = document.getElementById("contentFrame");
const navLinks = [...document.querySelectorAll(".topnav a[data-tab]")];
const tabControls = [...document.querySelectorAll("[data-tab]")];
let frameIsLoading = false;
let activeProfileName = "";
let frameTitleObserver = null;

const tabs = Object.fromEntries(
  navLinks.map((link) => [
    link.dataset.tab,
    {
      href: link.getAttribute("href"),
      label: link.textContent.trim()
    }
  ])
);

function normalizeTab(value) {
  return tabs[value] ? value : "leaderboards";
}

function getPageSearchParams() {
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.search);
  params.delete("tab");
  params.delete("_framev");
  return params;
}

function getTabFromLocation() {
  const url = new URL(window.location.href);
  if (url.searchParams.has("C")) {
    return "compare";
  }
  return normalizeTab(url.searchParams.get("tab"));
}

function updateDocumentTitle(tab) {
  const label = tabs[tab]?.label || "Leaderboards";
  const section = tab === "compare" ? "Compare" : label.replace(/\s+/g, " ").trim();
  const player = activeProfileName.replace(/\s+/g, " ").trim().slice(0, 80);
  const suffix = tab === "leaderboards" && player ? player : section;
  const title = `Warzone 2100 - ${suffix}`;
  if (document.title !== title) document.title = title;
}

function observeFrameTitle() {
  frameTitleObserver?.disconnect();
  frameTitleObserver = null;
  const tab = contentFrame.dataset.currentTab || getTabFromLocation();
  try {
    const frameDocument = contentFrame.contentDocument;
    const syncTitle = () => {
      if (frameIsLoading || contentFrame.dataset.currentTab !== tab) return;
      const heading = tab === "leaderboards"
        ? frameDocument.querySelector(".stats-player-profile-heading-name")
        : null;
      activeProfileName = heading?.textContent || "";
      updateDocumentTitle(tab);
    };
    syncTitle();
    if (frameDocument?.body && tab === "leaderboards") {
      frameTitleObserver = new MutationObserver(syncTitle);
      frameTitleObserver.observe(frameDocument.body, {subtree: true, childList: true, characterData: true});
    }
  } catch (error) {
    activeProfileName = "";
    updateDocumentTitle(tab);
  }
}

function setActiveTab(tab) {
  navLinks.forEach((link) => {
    if (link.dataset.tab === tab) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
  updateDocumentTitle(tab);
}

function syncFrameHeightFromDocument() {
  try {
    const documentRoot = contentFrame.contentDocument?.documentElement;
    const body = contentFrame.contentDocument?.body;
    const height = Math.max(
      documentRoot ? documentRoot.scrollHeight : 0,
      body ? body.scrollHeight : 0,
      documentRoot ? documentRoot.offsetHeight : 0,
      body ? body.offsetHeight : 0
    );

    if (height) {
      contentFrame.style.height = `${Math.max(480, height)}px`;
    }
  } catch (error) {
    console.warn("Unable to sync iframe height.", error);
  }
}

function buildFrameUrl(tab, params = getPageSearchParams()) {
  const normalizedTab = normalizeTab(tab);
  const tabConfig = tabs[normalizedTab];
  const url = new URL(tabConfig.href, window.location.href);
  url.search = params.toString();
  if (normalizedTab === "leaderboards") {
    url.searchParams.set("_framev", "20260909-replay-analyzer-5");
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function updateLocation(tab, replace = false, search = null) {
  const url = new URL(window.location.href);
  const params = search === null
    ? getPageSearchParams()
    : new URLSearchParams(String(search).replace(/^\?/, ""));
  params.delete("_framev");

  url.search = params.toString();
  if (tab === "leaderboards" || (tab === "compare" && url.searchParams.has("C"))) {
    url.searchParams.delete("tab");
  } else {
    url.searchParams.set("tab", tab);
  }

  if (replace) {
    window.history.replaceState({ tab }, "", url);
  } else {
    window.history.pushState({ tab }, "", url);
  }
}

function loadTab(tab, { updateHistory = false, replaceHistory = false, resetSearch = false, forceReload = false } = {}) {
  const normalizedTab = normalizeTab(tab);
  const tabConfig = tabs[normalizedTab];
  if (!tabConfig) {
    return;
  }

  activeProfileName = "";
  frameTitleObserver?.disconnect();
  setActiveTab(normalizedTab);

  const searchParams = resetSearch ? new URLSearchParams() : getPageSearchParams();
  const nextSrc = buildFrameUrl(normalizedTab, searchParams);
  const currentSrc = contentFrame.getAttribute("src") || "";
  if (forceReload || contentFrame.dataset.currentTab !== normalizedTab || currentSrc !== nextSrc) {
    frameIsLoading = true;
    contentFrame.style.height = "480px";
    contentFrame.dataset.currentTab = normalizedTab;
    contentFrame.src = nextSrc;
  } else {
    observeFrameTitle();
  }

  if (updateHistory) {
    updateLocation(normalizedTab, replaceHistory, resetSearch ? "" : null);
  }
}

tabControls.forEach((control) => {
  control.addEventListener("click", (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const tab = control.dataset.tab;
    if (!tabs[tab]) {
      return;
    }

    event.preventDefault();
    const resetFilters = control.classList.contains("brand");
    loadTab(tab, { updateHistory: true, resetSearch: resetFilters, forceReload: resetFilters });
  });
});

contentFrame.addEventListener("load", () => {
  frameIsLoading = false;
  syncFrameHeightFromDocument();
  observeFrameTitle();
});

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) {
    return;
  }

  if (event.source !== contentFrame.contentWindow) {
    return;
  }

  if (event.data?.type === "boha:frame-height") {
    if (frameIsLoading) {
      return;
    }

    const height = Number(event.data.height);
    if (Number.isFinite(height) && height > 0) {
      contentFrame.style.height = `${Math.max(480, height)}px`;
    }
    return;
  }

  if (event.data?.type === "boha:scroll-content-top") {
    window.scrollTo({
      top: contentFrame.getBoundingClientRect().top + window.scrollY,
      behavior: "smooth"
    });
    return;
  }

  if (event.data?.type === "boha:page-state") {
    updateLocation(contentFrame.dataset.currentTab || getTabFromLocation(), true, event.data.search || "");
  }
});

window.addEventListener("popstate", () => {
  loadTab(getTabFromLocation(), { updateHistory: false });
});

loadTab(getTabFromLocation(), { updateHistory: true, replaceHistory: true });
