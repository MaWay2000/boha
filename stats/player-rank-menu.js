const rankHeading = document.getElementById("statsPlayerGamesTitle");
const filterButtons = document.getElementById("statsLeaderboardButtons");
const recentMatches = document.getElementById("statsLeaderboardRecentMatches");
const recentPicker = document.getElementById("statsRecentLeaderboardPicker");
const recentTrigger = recentPicker?.querySelector(".stats-player-rank-trigger");
const recentPopup = document.getElementById("statsRecentLeaderboardOptions");
const openPopupSelector = ".stats-player-rank-popup:not([hidden])";

function orderRankOptions(popup) {
  // The Games filter already uses the total match count for each leaderboard.
  const filterOrder = new Map(Array.from(filterButtons.querySelectorAll("[data-leaderboard]"),
    (button, index) => [button.dataset.leaderboard, index]));
  const options = [...popup.querySelectorAll("[data-player-rank-leaderboard]")];
  const position = (option) => filterOrder.get(option.dataset.playerRankLeaderboard) ?? filterOrder.size;
  options.sort((left, right) => position(left) - position(right));
  popup.append(...options);
}

function fitLeaderboardPopup(popup) {
  const anchor = popup.parentElement.getBoundingClientRect();
  let viewportTop = 0;
  let viewportBottom = document.documentElement.clientHeight;
  const frame = window.frameElement;
  if (frame) {
    const parentDocument = frame.ownerDocument;
    const frameTop = frame.getBoundingClientRect().top + frame.clientTop;
    const headerBottom = parentDocument.querySelector(".site-app-shell .topbar")?.getBoundingClientRect().bottom ?? 0;
    viewportTop = Math.max(0, headerBottom - frameTop);
    viewportBottom = Math.min(viewportBottom, parentDocument.documentElement.clientHeight - frameTop);
  }

  const spacing = Number.parseFloat(getComputedStyle(popup).marginTop) + 8;
  const spaceBelow = viewportBottom - anchor.bottom - spacing;
  const spaceAbove = anchor.top - viewportTop - spacing;
  const contentHeight = popup.scrollHeight + popup.offsetHeight - popup.clientHeight;
  const openAbove = contentHeight > spaceBelow && spaceAbove > spaceBelow;
  popup.classList.toggle("is-above", openAbove);
  popup.style.maxHeight = `${Math.max(0, Math.floor(openAbove ? spaceAbove : spaceBelow))}px`;
}

function fitRecentPopup() {
  fitLeaderboardPopup(recentPopup);
  const anchor = recentPopup.offsetParent.getBoundingClientRect();
  const popupWidth = recentPopup.offsetWidth;
  const naturalLeft = (anchor.left + anchor.right - popupWidth) / 2;
  const rightLimit = document.documentElement.clientWidth - popupWidth - 8;
  const left = Math.max(8, Math.min(naturalLeft, rightLimit));
  recentPopup.style.marginLeft = `${left - naturalLeft}px`;
}

function fitOpenLeaderboardPopups() {
  const rankPopup = rankHeading.querySelector(openPopupSelector);
  if (rankPopup) fitLeaderboardPopup(rankPopup);
  if (recentPopup && !recentPopup.hidden) fitRecentPopup();
}

function setRecentPickerOpen(open) {
  recentPopup.hidden = !open;
  recentTrigger.setAttribute("aria-expanded", String(open));
  recentPicker.classList.toggle("is-open", open);
}

function syncRecentPicker() {
  recentPicker.hidden = recentMatches.hidden;
  recentTrigger.disabled = !filterButtons.querySelector("button[data-leaderboard]");
  setRecentPickerOpen(false);
}

rankHeading.addEventListener("click", (event) => {
  if (!event.target.closest(".stats-player-rank-trigger")) return;
  const popup = rankHeading.querySelector(openPopupSelector);
  if (!popup) return;

  orderRankOptions(popup);
  fitLeaderboardPopup(popup);
});

recentTrigger?.addEventListener("click", () => {
  if (!recentPopup.hidden) {
    setRecentPickerOpen(false);
    return;
  }

  const options = Array.from(filterButtons.querySelectorAll("button[data-leaderboard]"), (source) => {
    const option = document.createElement("button");
    const active = source.classList.contains("is-active");
    option.type = "button";
    option.className = "stats-player-rank-option";
    option.classList.toggle("is-active", active);
    option.setAttribute("aria-pressed", String(active));
    option.textContent = source.textContent;
    option.addEventListener("click", () => {
      setRecentPickerOpen(false);
      if (!active) source.click();
      recentTrigger.focus();
    });
    return option;
  });
  recentPopup.replaceChildren(...options);
  document.querySelector('details[name="player-header-menu"][open]')?.removeAttribute("open");
  setRecentPickerOpen(true);
  fitRecentPopup();
});

recentPicker?.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !recentPopup.hidden) {
    setRecentPickerOpen(false);
    recentTrigger.focus();
  }
});
recentPicker?.addEventListener("focusout", (event) => {
  if (!recentPicker.contains(event.relatedTarget)) setRecentPickerOpen(false);
});
if (recentPicker) {
  document.addEventListener("click", (event) => {
    if (!recentPopup.hidden && !recentPicker.contains(event.target)) setRecentPickerOpen(false);
  });
  const pickerObserver = new MutationObserver(syncRecentPicker);
  pickerObserver.observe(recentMatches, { attributeFilter: ["hidden"] });
  pickerObserver.observe(filterButtons, { childList: true });
  syncRecentPicker();
}

window.addEventListener("resize", fitOpenLeaderboardPopups);
window.addEventListener("scroll", fitOpenLeaderboardPopups, { passive: true });
if (window.frameElement) {
  const viewportEvents = new AbortController();
  window.parent.addEventListener("resize", fitOpenLeaderboardPopups, { signal: viewportEvents.signal });
  window.parent.addEventListener("scroll", fitOpenLeaderboardPopups, { passive: true, signal: viewportEvents.signal });
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) viewportEvents.abort();
  });
}
