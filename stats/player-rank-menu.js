const rankHeading = document.getElementById("statsPlayerGamesTitle");
const filterButtons = document.getElementById("statsLeaderboardButtons");
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

function fitRankPopup(popup) {
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

function fitOpenRankPopup() {
  const popup = rankHeading.querySelector(openPopupSelector);
  if (popup) fitRankPopup(popup);
}

rankHeading.addEventListener("click", (event) => {
  if (!event.target.closest(".stats-player-rank-trigger")) return;
  const popup = rankHeading.querySelector(openPopupSelector);
  if (!popup) return;

  orderRankOptions(popup);
  fitRankPopup(popup);
});

window.addEventListener("resize", fitOpenRankPopup);
window.addEventListener("scroll", fitOpenRankPopup, { passive: true });
if (window.frameElement) {
  const viewportEvents = new AbortController();
  window.parent.addEventListener("resize", fitOpenRankPopup, { signal: viewportEvents.signal });
  window.parent.addEventListener("scroll", fitOpenRankPopup, { passive: true, signal: viewportEvents.signal });
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) viewportEvents.abort();
  });
}
