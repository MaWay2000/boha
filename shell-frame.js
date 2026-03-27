const contentFrame = document.getElementById("contentFrame");
const navLinks = [...document.querySelectorAll(".topnav a[data-tab]")];
const tabControls = [...document.querySelectorAll("[data-tab]")];

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

function getTabFromLocation() {
  const url = new URL(window.location.href);
  return normalizeTab(url.searchParams.get("tab"));
}

function updateDocumentTitle(tab) {
  const label = tabs[tab]?.label || "Leaderboards";
  document.title = `Warzone 2100 - ${label}`;
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

function updateLocation(tab, replace = false) {
  const url = new URL(window.location.href);
  if (tab === "leaderboards") {
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

function loadTab(tab, { updateHistory = false, replaceHistory = false } = {}) {
  const normalizedTab = normalizeTab(tab);
  const tabConfig = tabs[normalizedTab];
  if (!tabConfig) {
    return;
  }

  setActiveTab(normalizedTab);

  if (contentFrame.dataset.currentTab !== normalizedTab) {
    contentFrame.dataset.currentTab = normalizedTab;
    contentFrame.src = tabConfig.href;
  }

  if (updateHistory) {
    updateLocation(normalizedTab, replaceHistory);
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
    loadTab(tab, { updateHistory: true });
  });
});

contentFrame.addEventListener("load", syncFrameHeightFromDocument);

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) {
    return;
  }

  if (event.data?.type !== "boha:frame-height") {
    return;
  }

  const height = Number(event.data.height);
  if (Number.isFinite(height) && height > 0) {
    contentFrame.style.height = `${Math.max(480, height)}px`;
  }
});

window.addEventListener("popstate", () => {
  loadTab(getTabFromLocation(), { updateHistory: false });
});

loadTab(getTabFromLocation(), { updateHistory: true, replaceHistory: true });
