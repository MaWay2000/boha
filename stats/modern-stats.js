import { gather, calculate } from "./calculate.js";
import { leaderboards, filterGame } from "./leaderboard-meta.js";

const SNAPSHOT_URL = new URL("./results-snapshot.json", import.meta.url);
const PLAYER_KEYS_URL = new URL("./player-public-keys.json", import.meta.url);
const LIVE_RESULTS_URL = new URL("../results.json", import.meta.url);
const PLAYER_LIMIT = 12;
const MATCH_LIMIT = 12;

const statusElement = document.getElementById("resultsStatus");
const summaryElement = document.getElementById("statsSummary");
const buttonsElement = document.getElementById("statsLeaderboardButtons");
const ranksElement = document.getElementById("statsRanks");
const matchesElement = document.getElementById("statsMatches");

let selectedLeaderboard = "Global";
let resultsData = { format: 0, results: [] };
let liveFeedState = "idle";
let playerPublicKeys = {};

function accountSortKey(account) {
  return !account.discounted ? account.elo : -1000000000 + account.games.length;
}

function sortAccounts(accounts) {
  return [...accounts].sort((left, right) => accountSortKey(right) - accountSortKey(left));
}

function getLatestEndDate(results) {
  return results.reduce((max, result) => Math.max(max, Number(result.endDate || 0)), 0);
}

function normalizeReplayUrl(url) {
  return String(url || "").replace(/^http:\/\//i, "https://");
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

function formatDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.floor((durationMs || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatAlliance(game) {
  if (game.players.length === 2) {
    return "1v1";
  }

  if (game.teams.every((team) => team.players.length === 1)) {
    return "FFA";
  }

  switch (game.alliancesType) {
    case 0:
      return "FFA";
    case 1:
      return "Allow";
    case 2:
      return "Shared";
    case 3:
      return "Nonshared";
    default:
      return "?";
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function updateStatusText(results) {
  if (!statusElement) {
    return;
  }

  const latestEndDate = getLatestEndDate(results);
  const latestLabel = latestEndDate ? formatDate(latestEndDate) : "unknown date";

  if (!results.length) {
    statusElement.textContent = "No stats data is bundled yet.";
    return;
  }

  if (liveFeedState === "live") {
    statusElement.textContent = `Live sync active. Snapshot base updated through ${latestLabel}.`;
    return;
  }

  if (liveFeedState === "unavailable") {
    statusElement.textContent = `Showing bundled snapshot through ${latestLabel}. Live feed was not found on this host.`;
    return;
  }

  statusElement.textContent = `Showing bundled snapshot through ${latestLabel}.`;
}

function renderSummary(accountList, gameList) {
  if (!summaryElement) {
    return;
  }

  if (!accountList.length || !gameList.length) {
    summaryElement.innerHTML = `
      <article class="stats-card">
        <span class="stats-card-label">Stats</span>
        <strong class="stats-card-value">Unavailable</strong>
      </article>
    `;
    return;
  }

  const rankedPlayers = accountList.filter((account) => !account.discounted);
  const topPlayer = rankedPlayers[0] || accountList[0];
  const latestMatch = gameList[0];

  summaryElement.innerHTML = `
    <article class="stats-card">
      <span class="stats-card-label">Ranked Players</span>
      <strong class="stats-card-value">${rankedPlayers.length}</strong>
      <span class="stats-player-note">Players above the provisional threshold</span>
    </article>
    <article class="stats-card">
      <span class="stats-card-label">Matches</span>
      <strong class="stats-card-value">${gameList.length}</strong>
      <span class="stats-player-note">In the ${escapeHtml(selectedLeaderboard)} slice</span>
    </article>
    <article class="stats-card">
      <span class="stats-card-label">Top Elo</span>
      <strong class="stats-card-value">${topPlayer ? topPlayer.elo.toFixed(2) : "--"}</strong>
      <span class="stats-player-note">${escapeHtml(topPlayer ? topPlayer.name : "Unknown player")}</span>
    </article>
    <article class="stats-card">
      <span class="stats-card-label">Latest Match</span>
      <strong class="stats-card-value">${latestMatch ? formatShortDate(latestMatch.endDate) : "--"}</strong>
      <span class="stats-player-note">${escapeHtml(latestMatch ? latestMatch.mapName : "Unknown map")}</span>
    </article>
  `;
}

function renderRanks(accountList) {
  if (!ranksElement) {
    return;
  }

  const rows = accountList
    .filter((account) => !account.discounted || account.games.length >= 2)
    .slice(0, PLAYER_LIMIT);

  if (!rows.length) {
    ranksElement.innerHTML = `
      <tr class="stats-empty-row">
        <td colspan="5">No ranked players found for this slice.</td>
      </tr>
    `;
    return;
  }

  ranksElement.innerHTML = rows
    .map((account, index) => {
      const eloLabel = account.discounted ? "--" : account.elo.toFixed(2);
      const note = account.discounted ? "Provisional" : `${account.publicKeys.size} key(s) tracked`;
      return `
        <tr>
          <td class="stats-rank">${index + 1}</td>
          <td class="stats-player-name">
            ${escapeHtml(account.name || "Unknown")}
            <span class="stats-player-note">${escapeHtml(note)}</span>
          </td>
          <td class="stats-elo">${eloLabel}</td>
          <td>${account.games.length}</td>
          <td class="stats-record">${account.winCount}/${account.loseCount}/${account.drawCount}</td>
        </tr>
      `;
    })
    .join("");
}

function renderMatches(gameList) {
  if (!matchesElement) {
    return;
  }

  const rows = gameList.slice(0, MATCH_LIMIT);

  if (!rows.length) {
    matchesElement.innerHTML = `
      <tr class="stats-empty-row">
        <td colspan="5">No matches found for this slice.</td>
      </tr>
    `;
    return;
  }

  matchesElement.innerHTML = rows
    .map((game) => {
      return `
        <tr>
          <td class="stats-date">
            ${escapeHtml(formatDate(game.endDate))}
            <span class="stats-note">${escapeHtml(game.version || "Unknown version")}</span>
          </td>
          <td>
            ${escapeHtml(game.mapName)}
            ${game.mods ? `<span class="stats-note">${escapeHtml(game.mods)}</span>` : ""}
          </td>
          <td><span class="stats-tag">${escapeHtml(formatAlliance(game))}</span></td>
          <td class="stats-duration">${escapeHtml(formatDuration(game.duration))}</td>
          <td><a class="stats-replay-link" href="${escapeHtml(normalizeReplayUrl(game.replayUrl))}" target="_blank" rel="noreferrer">Replay</a></td>
        </tr>
      `;
    })
    .join("");
}

function render() {
  if (!resultsData.results.length) {
    updateStatusText([]);
    renderSummary([], []);
    renderRanks([]);
    renderMatches([]);
    return;
  }

  const { accounts, games } = gather(
    resultsData.results,
    playerPublicKeys,
    function* filterSelectedGames(allGames) {
      for (const game of allGames) {
        if (filterGame(selectedLeaderboard, game)) {
          yield game;
        }
      }
    }
  );

  calculate(games);

  const accountList = sortAccounts(accounts.values());
  const gameList = [...games].sort((left, right) => right.endDate - left.endDate);

  updateStatusText(resultsData.results);
  renderSummary(accountList, gameList);
  renderRanks(accountList);
  renderMatches(gameList);
}

function updateActiveButtons() {
  buttonsElement.querySelectorAll(".stats-filter-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.leaderboard === selectedLeaderboard);
  });
}

function renderButtons() {
  if (!buttonsElement) {
    return;
  }

  buttonsElement.innerHTML = "";
  leaderboards.forEach((leaderboard) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "stats-filter-button";
    button.dataset.leaderboard = leaderboard;
    button.textContent = leaderboard;
    button.addEventListener("click", () => {
      selectedLeaderboard = leaderboard;
      updateActiveButtons();
      render();
    });
    buttonsElement.appendChild(button);
  });

  updateActiveButtons();
}

async function loadSnapshot() {
  const response = await fetch(SNAPSHOT_URL);
  if (!response.ok) {
    throw new Error(`Unable to load stats snapshot (${response.status})`);
  }

  const snapshotText = await response.text();
  resultsData = JSON.parse(snapshotText.replace(/^\uFEFF/, ""));
  render();
}

function startLiveSync() {
  if (window.location.protocol === "file:") {
    liveFeedState = "unavailable";
    render();
    return;
  }

  const latestEndDate = getLatestEndDate(resultsData.results);
  const feedUrl = new URL(LIVE_RESULTS_URL);
  feedUrl.search = `?id=${encodeURIComponent(`${resultsData.format} ${resultsData.results.length} ${latestEndDate}`)}`;

  let sawSignal = false;
  const eventSource = new EventSource(feedUrl);

  eventSource.addEventListener("reset", (event) => {
    sawSignal = true;
    resultsData.format = Number(event.data);
    resultsData.results = [];
  });

  eventSource.onmessage = (event) => {
    sawSignal = true;
    resultsData.results.push(JSON.parse(event.data));
  };

  eventSource.addEventListener("synced", () => {
    sawSignal = true;
    liveFeedState = "live";
    render();
  });

  eventSource.onerror = () => {
    if (!sawSignal) {
      liveFeedState = "unavailable";
      eventSource.close();
      render();
    }
  };
}

async function init() {
  renderButtons();

  try {
    const playerKeysResponse = await fetch(PLAYER_KEYS_URL);
    if (!playerKeysResponse.ok) {
      throw new Error(`Unable to load player keys (${playerKeysResponse.status})`);
    }

    const playerKeysText = await playerKeysResponse.text();
    playerPublicKeys = JSON.parse(playerKeysText.replace(/^\uFEFF/, ""));
    await loadSnapshot();
  } catch (error) {
    if (statusElement) {
      statusElement.textContent = "Unable to load the bundled stats snapshot.";
    }
    return;
  }

  startLiveSync();
}

init();
