const screenKey = Symbol.for("boha.loading-screen");

function createLoadingScreen(host) {
  const view = host.defaultView;
  const style = host.createElement("style");
  style.textContent = `
    .boha-loading-screen {
      position: fixed;
      inset: 0;
      z-index: 1900;
      display: grid;
      place-items: center;
      pointer-events: none;
      visibility: hidden;
      opacity: 0;
      background: rgb(3 10 17 / 70%);
      transition: opacity 180ms ease, visibility 0ms linear 180ms;
    }
    .boha-loading-screen.is-loading {
      visibility: visible;
      opacity: 1;
      transition-delay: 0ms;
    }
    .boha-loading-card {
      display: flex;
      gap: 12px;
      align-items: center;
      max-width: calc(100vw - 32px);
      padding: 16px 20px;
      border: 1px solid #2c6376;
      border-radius: 10px;
      background: #0d1c28;
      box-shadow: 0 12px 40px rgb(0 0 0 / 45%);
      color: #d9f7ff;
      font: 600 0.9rem system-ui, sans-serif;
    }
    .boha-loading-spinner {
      flex: none;
      width: 18px;
      height: 18px;
      border: 2px solid #294956;
      border-top-color: #69e5ff;
      border-radius: 50%;
      animation: boha-loading-spin 750ms linear infinite;
      animation-play-state: paused;
    }
    .is-loading .boha-loading-spinner { animation-play-state: running; }
    @keyframes boha-loading-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) {
      .boha-loading-screen { transition: none; }
      .boha-loading-spinner { animation: none; }
    }
  `;
  const overlay = host.createElement("div");
  overlay.className = "boha-loading-screen";
  const card = host.createElement("div");
  card.className = "boha-loading-card";
  const spinner = host.createElement("span");
  spinner.className = "boha-loading-spinner";
  spinner.setAttribute("aria-hidden", "true");
  const label = host.createElement("span");
  label.setAttribute("role", "status");
  card.append(spinner, label);
  overlay.append(card);
  host.head.append(style);
  host.body.append(overlay);

  const pending = new Map();
  let showTimer;
  let hideTimer;
  let visibleSince;
  const show = () => {
    view.clearTimeout(showTimer);
    showTimer = undefined;
    if (!pending.size) return;
    label.textContent = [...pending.values()].at(-1);
    if (visibleSince === undefined) {
      visibleSince = view.performance.now();
      overlay.classList.add("is-loading");
    }
  };

  return {
    begin(message, immediate) {
      const token = Symbol();
      pending.set(token, message);
      view.clearTimeout(hideTimer);
      if (immediate || visibleSince !== undefined) show();
      else if (showTimer === undefined) showTimer = view.setTimeout(show, 120);

      return () => {
        if (!pending.delete(token)) return;
        if (pending.size) {
          if (visibleSince !== undefined) show();
          return;
        }
        view.clearTimeout(showTimer);
        showTimer = undefined;
        if (visibleSince === undefined) return;
        hideTimer = view.setTimeout(() => {
          overlay.classList.remove("is-loading");
          visibleSince = undefined;
        }, Math.max(0, 200 - (view.performance.now() - visibleSince)));
      };
    }
  };
}

const activeLoads = new Set();

export function beginLoading(message, { immediate = false } = {}) {
  const frame = window.frameElement;
  const host = frame?.id === "contentFrame" ? frame.ownerDocument : document;
  host[screenKey] ??= createLoadingScreen(host);
  const release = host[screenKey].begin(message, immediate);
  const finish = () => {
    activeLoads.delete(finish);
    release();
  };
  activeLoads.add(finish);
  return finish;
}

export async function withLoading(message, action, { paint = false } = {}) {
  const finish = beginLoading(message, { immediate: paint });
  try {
    if (paint) {
      // Let the browser paint the overlay before synchronous filtering or ranking.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
    return await action();
  } finally {
    finish();
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    for (const finish of activeLoads) finish();
  });
}
