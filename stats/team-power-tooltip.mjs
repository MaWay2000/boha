function addTeamPowerTooltips(root) {
  for (const team of root.querySelectorAll(".stats-team-inline-power.stats-team-power-fill")) {
    if (team.querySelector(":scope > .stats-team-power-trigger")) continue;

    const percent = team.style.getPropertyValue("--team-power-fill").trim();
    if (!/^\d{1,3}%$/.test(percent) || Number.parseInt(percent, 10) > 100) continue;

    const label = `Team power: ${percent}`;
    const trigger = document.createElement("span");
    trigger.className = "stats-team-power-trigger";
    trigger.tabIndex = 0;
    trigger.setAttribute("role", "img");
    trigger.setAttribute("aria-label", label);

    const hint = document.createElement("span");
    hint.className = "stats-sort-hint";
    hint.setAttribute("aria-hidden", "true");
    hint.textContent = label;
    trigger.append(hint);
    team.append(trigger);
  }
}

for (const matches of document.querySelectorAll("#statsMatches, #statsPlayerGames")) {
  addTeamPowerTooltips(matches);
  new MutationObserver(records => {
    for (const record of records) {
      for (const row of record.addedNodes) {
        if (row.nodeType === Node.ELEMENT_NODE) addTeamPowerTooltips(row);
      }
    }
  }).observe(matches, { childList: true });
}
