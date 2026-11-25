function moveMapStarsToDuration(matches) {
  for (const star of matches.querySelectorAll(".stats-recent-map-line > .stats-mega-win-star")) {
    const mapLine = star.parentElement;
    const duration = mapLine.parentElement.querySelector(":scope > .stats-recent-map-duration");
    if (duration) {
      duration.append(star);
      mapLine.replaceWith(...mapLine.childNodes);
    }
  }
}

for (const matches of document.querySelectorAll("#statsMatches, #statsPlayerGames")) {
  moveMapStarsToDuration(matches);
  new MutationObserver(() => moveMapStarsToDuration(matches)).observe(matches, { childList: true });
}
