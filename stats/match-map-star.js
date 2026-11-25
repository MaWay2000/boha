function decorateMapStars(matches) {
  for (const star of matches.querySelectorAll(".stats-recent-map-line > .stats-mega-win-star")) {
    const mapLine = star.parentElement;
    const duration = mapLine.parentElement.querySelector(":scope > .stats-recent-map-duration");
    if (duration) {
      duration.append(star);
      mapLine.replaceWith(...mapLine.childNodes);
    }

    const description = star.getAttribute("title");
    if (description) {
      star.removeAttribute("title");
      star.setAttribute("aria-description", description);
      star.tabIndex = 0;
      const hint = document.createElement("span");
      hint.className = "stats-sort-hint";
      hint.setAttribute("aria-hidden", "true");
      hint.textContent = description;
      star.append(hint);
    }
  }
}

for (const matches of document.querySelectorAll("#statsMatches, #statsPlayerGames")) {
  decorateMapStars(matches);
  new MutationObserver(() => decorateMapStars(matches)).observe(matches, { childList: true });
}
