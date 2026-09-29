"use strict";

const searchElement = document.getElementById("betaSearch");
const clearElement = document.getElementById("betaClear");
const playersElement = document.getElementById("betaPlayers");
const detailElement = document.getElementById("betaDetail");
const showingElement = document.getElementById("betaShowing");
const loadMoreElement = document.getElementById("betaLoadMore");
let snapshot = null;
let selected = null;
let shownPlayers = 100;
let shownHistory = 20;
let sortKey = "rating";
let sortDirection = -1;

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const signed = (number) => `${number > 0 ? "+" : ""}${Number(number).toFixed(2)}`;
const dateText = (value) => new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
const percent = (value, total) => `${Math.round(value / Math.max(1, total) * 100)}%`;

function renderToolbar() {
  const { coverage, players } = snapshot;
  document.getElementById("betaPlayerTotal").textContent = players.filter((player) => !player.provisional).length.toLocaleString();
  document.getElementById("betaMatchTotal").textContent = coverage.rated.toLocaleString();
  document.getElementById("betaPersonalTotal").textContent = coverage.withPersonal.toLocaleString();
  document.getElementById("betaStamp").textContent = dateText(snapshot.sourceGeneratedAt);
}

function matchesSearch(player, query) {
  if (!query) return !player.provisional;
  return [player.name, player.id, ...(player.names || []), ...(player.publicKeys || [])]
    .join(" ").toLocaleLowerCase().includes(query);
}

function renderPlayers() {
  if (!snapshot) return;
  const query = searchElement.value.trim().toLocaleLowerCase();
  const matching = snapshot.players.filter((player) => matchesSearch(player, query));
  matching.sort((left, right) => {
    const comparison = sortKey === "name"
      ? left.name.localeCompare(right.name)
      : left[sortKey] - right[sortKey];
    return sortDirection * comparison || right.rating - left.rating;
  });
  const limited = matching.slice(0, shownPlayers);
  const establishedRanks = new Map(snapshot.players.filter((player) => !player.provisional)
    .map((player, index) => [player.id, index + 1]));
  clearElement.hidden = !query;
  showingElement.textContent = `Showing ${limited.length} of ${matching.length} ${query ? "matching players (P = provisional)" : "established players"}.`;
  loadMoreElement.hidden = matching.length <= shownPlayers;
  loadMoreElement.textContent = `Load more (top ${Math.min(matching.length, shownPlayers + 100)})`;
  document.querySelectorAll("[data-beta-sort]").forEach((button) => {
    const active = button.dataset.betaSort === sortKey;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-label", `Sort by ${button.dataset.betaSort}${active ? `, currently ${sortDirection < 0 ? "descending" : "ascending"}` : ""}`);
  });
  playersElement.innerHTML = limited.length ? limited.map((player, index) => `
    <tr class="${selected?.id === player.id ? "is-active" : ""}" data-id="${escapeHtml(player.id)}">
      <td>${player.provisional ? "P" : establishedRanks.get(player.id) ?? index + 1}</td>
      <td><button type="button" data-id="${escapeHtml(player.id)}" aria-label="Open ${escapeHtml(player.name)} Beta 1 profile">${escapeHtml(player.name)}</button></td>
      <td><strong>${player.rating.toFixed(2)}</strong><small>${player.provisional ? "Provisional" : signed(player.history.slice(0, 10).reduce((sum, event) => sum + event.delta, 0)) + " last 10"}</small></td>
      <td>${player.games}</td>
      <td><div class="beta-record"><span>${player.wins}<small>${percent(player.wins, player.games)}</small></span><span>${player.losses}<small>${percent(player.losses, player.games)}</small></span><span>${player.draws}<small>${percent(player.draws, player.games)}</small></span></div></td>
    </tr>${selected?.id === player.id ? `<tr class="beta-detail-row"><td colspan="5"><div class="beta-expanded"><span>PLAYER NAMES</span><div class="beta-names">${(player.names || [player.name]).map((name) => `<span>${escapeHtml(name)}</span>`).join("")}</div><span>${(player.publicKeys || []).length} KEY(S) TRACKED</span><div class="beta-keys">${(player.publicKeys || []).map((key) => `<button type="button" class="beta-key" data-copy-key="${escapeHtml(key)}" title="Copy public key">${escapeHtml(key)}</button>`).join("")}</div></div></td></tr>` : ""}`).join("") : `<tr><td colspan="5">No matching rated accounts in this snapshot.</td></tr>`;
}

function chartMarkup(player) {
  const chronological = [...player.history].reverse();
  const all = [1500, ...chronological.map((event) => event.after)];
  const step = Math.max(1, Math.ceil(all.length / 180));
  const values = all.filter((_, index) => index % step === 0 || index === all.length - 1);
  const low = Math.floor((Math.min(...values) - 12) / 10) * 10;
  const high = Math.ceil((Math.max(...values) + 12) / 10) * 10;
  const points = values.map((value, index) => `${(index / Math.max(1, values.length - 1) * 600).toFixed(1)},${(118 - (value - low) / Math.max(1, high - low) * 102).toFixed(1)}`);
  const line = points.join(" ");
  const area = `0,132 ${line} 600,132`;
  return `<div class="beta-chart-panel"><h3>RATING RATIO · ${player.games} RATED GAMES</h3>
    <svg class="beta-chart" viewBox="0 0 600 135" preserveAspectRatio="none" role="img" aria-label="Beta 1 rating history from ${low} to ${high}">
      <defs><linearGradient id="betaChartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#40d7f4" stop-opacity=".28"/><stop offset="100%" stop-color="#40d7f4" stop-opacity="0"/></linearGradient></defs>
      <line x1="0" y1="132" x2="600" y2="132" stroke="#244f60"/><line x1="0" y1="65" x2="600" y2="65" stroke="#244f60" opacity=".45"/>
      <polygon points="${area}" fill="url(#betaChartFill)"/><polyline points="${line}" fill="none" stroke="#58daf5" stroke-width="2.4" vector-effect="non-scaling-stroke"/>
    </svg><div class="beta-chart-axis"><span>${low}</span><span>${high}</span></div></div>`;
}

function renderDetail() {
  if (!selected) return;
  const player = selected;
  const positiveLosses = player.history.filter((event) => event.outcome === "Loss" && event.delta > 0).length;
  const best = Math.max(1500, ...player.history.map((event) => event.after));
  const form = player.history.slice(0, 8).reverse().map((event) =>
    `<i class="${event.outcome.toLowerCase()}" title="${event.outcome}">${event.outcome[0]}</i>`).join("");
  const recent = player.history.slice(0, shownHistory);
  detailElement.innerHTML = `
    <div class="beta-profile-head"><span>${escapeHtml(player.name)}</span><strong>BETA 1 ${player.provisional ? "PROVISIONAL" : `RANK #${snapshot.players.filter((item) => !item.provisional).findIndex((item) => item.id === player.id) + 1}`}</strong><button class="beta-copy" type="button" id="betaShare">Copy profile link</button></div>
    <div class="beta-profile-inner">
      <div class="beta-stat-grid">
        <div class="beta-stat-tile"><span>CURRENT BETA</span><strong>${player.rating.toFixed(2)}</strong></div>
        <div class="beta-stat-tile"><span>BEST BETA</span><strong>${best.toFixed(2)}</strong></div>
        <div class="beta-stat-tile"><span>WIN / LOSS</span><strong>${percent(player.wins, player.games)} / ${percent(player.losses, player.games)}</strong></div>
        <div class="beta-stat-tile"><span>RATED GAMES</span><strong>${player.games}</strong></div>
        <div class="beta-stat-tile"><span>POSITIVE LOSSES</span><strong>${positiveLosses}</strong></div>
        <div class="beta-stat-tile"><span>RECENT FORM</span><div class="beta-form">${form}</div></div>
      </div>
      ${chartMarkup(player)}
      <div class="beta-history-panel"><h3>RECENT BETA 1 MATCHES</h3><div class="beta-history-wrap"><table class="beta-history-table"><thead><tr>
        <th>Date</th><th>Match / map</th><th>Result</th><th>Before → after</th><th>Team</th><th>Personal</th><th>Total</th>
      </tr></thead><tbody>${recent.map((event) => `<tr>
        <td>${dateText(event.date)}</td><td title="${escapeHtml(event.map)}">#${escapeHtml(event.matchId)} · ${escapeHtml(event.map)}</td>
        <td>${event.outcome}</td><td>${event.before.toFixed(2)} → ${event.after.toFixed(2)}</td>
        <td class="${event.resultDelta >= 0 ? "positive" : "negative"}">${signed(event.resultDelta)}</td>
        <td class="${event.observedShare === null ? "missing" : event.personalDelta >= 0 ? "positive" : "negative"}" title="${event.observedShare === null ? "Trusted counters or peer samples unavailable" : `Observed share ${event.observedShare}% vs expected ${event.expectedShare}%`}">${event.observedShare === null ? "—" : signed(event.personalDelta)}</td>
        <td class="${event.delta >= 0 ? "positive" : "negative"}">${signed(event.delta)}</td>
      </tr>`).join("")}</tbody></table></div>
      ${player.history.length > shownHistory ? `<button type="button" class="beta-more" id="betaMore">Show more matches</button>` : ""}
      <p class="beta-detail-note">Team = match result against expected team strength. Personal = share of team performance. “—” means result-only scoring.</p></div>
      <p class="beta-detail-note">${player.provisional ? "Provisional: fewer than 20 eligible games." : "Established rating."} Based on the ${dateText(snapshot.sourceGeneratedAt)} published snapshot. Public ELO is unaffected.</p>
    </div>`;
}

function selectPlayer(id, updateUrl = true) {
  const player = snapshot.players.find((item) => item.id === id);
  if (!player) return;
  selected = player;
  shownHistory = 20;
  renderPlayers();
  renderDetail();
  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set("betaPlayer", id);
    history.replaceState(null, "", url);
    window.bohaEmbeddedPage?.postState(url.search);
    if (window.matchMedia("(max-width: 820px)").matches) {
      requestAnimationFrame(() => detailElement.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }
}

playersElement.addEventListener("click", (event) => {
  const key = event.target.closest("button[data-copy-key]");
  if (key) {
    navigator.clipboard.writeText(key.dataset.copyKey).then(() => { key.title = "Copied"; }).catch(() => { key.title = "Copy failed"; });
    return;
  }
  const row = event.target.closest("tr[data-id]");
  if (row) selectPlayer(row.dataset.id);
});
detailElement.addEventListener("click", async (event) => {
  if (event.target.id === "betaMore") {
    shownHistory += 30;
    renderDetail();
  } else if (event.target.id === "betaShare" && selected) {
    const url = new URL(window.parent === window ? "beta1.html" : "index.html", window.location.href);
    url.searchParams.set(window.parent === window ? "betaPlayer" : "tab", window.parent === window ? selected.id : "beta1");
    if (window.parent !== window) url.searchParams.set("betaPlayer", selected.id);
    try {
      await navigator.clipboard.writeText(url.toString());
      event.target.textContent = "Copied";
    } catch {
      event.target.textContent = "Copy failed";
    }
  }
});
loadMoreElement.addEventListener("click", () => { shownPlayers += 100; renderPlayers(); });
document.querySelector(".beta-rank-table thead").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-beta-sort]");
  if (!button) return;
  const nextKey = button.dataset.betaSort;
  sortDirection = sortKey === nextKey ? -sortDirection : (nextKey === "name" ? 1 : -1);
  sortKey = nextKey;
  shownPlayers = 100;
  renderPlayers();
});
searchElement.addEventListener("input", () => { shownPlayers = 100; renderPlayers(); });
clearElement.addEventListener("click", () => { searchElement.value = ""; searchElement.focus(); shownPlayers = 100; renderPlayers(); });
document.querySelector('.beta-context a').addEventListener('click', () => { document.getElementById('betaRules').open = true; });

fetch("stats/published/beta1.json", { cache: "no-cache" })
  .then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
  .then((data) => {
    snapshot = data;
    renderToolbar();
    const requested = new URLSearchParams(window.location.search).get("betaPlayer");
    const initial = requested ? data.players.find((player) => player.id === requested) : null;
    if (initial) selectPlayer(initial.id, false);
    else renderPlayers();
  })
  .catch((error) => {
    playersElement.innerHTML = `<tr><td colspan="5">Beta 1 data could not be loaded: ${escapeHtml(error.message)}</td></tr>`;
    document.getElementById("betaStamp").textContent = "Unavailable";
  });
