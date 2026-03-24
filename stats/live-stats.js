const MANIFEST_URL = new URL("./upstream-manifest.json", import.meta.url);
const CALCULATE_URL = new URL("./calculate.js", import.meta.url);
const LEADERBOARDS_URL = new URL("./leaderboards.js", import.meta.url);
const SNAPSHOT_URL = new URL("./results-snapshot.json", import.meta.url);
const PLAYER_KEYS_URL = new URL("./player-public-keys.json", import.meta.url);
const LIVE_RESULTS_URL = new URL("../results.json", import.meta.url);
const PLAYER_LIMIT = 12;
const MATCH_LIMIT = 12;
const AUTO_REFRESH_MS = 60_000;

const statusElement = document.getElementById("resultsStatus");
const summaryElement = document.getElementById("statsSummary");
const buttonsElement = document.getElementById("statsLeaderboardButtons");
const ranksElement = document.getElementById("statsRanks");
const matchesElement = document.getElementById("statsMatches");

let selectedLeaderboard = "Global";
let resultsData = { format: 0, results: [] };
let liveFeedState = "idle";
let playerPublicKeys = {};
let upstreamManifest = null;
let runtime = createRuntime();
let currentRuntimeKey = "";
let currentPlayerKeysKey = "";
let currentSnapshotKey = "";
let eventSource = null;
let refreshTimer = null;
let visibilityListenerAttached = false;

function createRuntime() {
  return {
    gather: null,
    calculate: null,
    leaderboards: ["Global"],
    filterGame() {
      return true;
    }
  };
}

function stripBom(text) {
  return text.replace(/^\uFEFF/, "");
}

function getAssetHash(name) {
  return upstreamManifest?.files?.[name]?.sha256?.slice(0, 16) || "local";
}

function buildVersionedUrl(baseUrl, version, bust = false) {
  const url = new URL(baseUrl);
  if (version) {
    url.searchParams.set("v", version);
  }
  if (bust) {
    url.searchParams.set("t", Date.now().toString());
  }
  return url;
}

async function readJson(baseUrl, version, bust = false) {
  const response = await fetch(buildVersionedUrl(baseUrl, version, bust), {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Unable to load ${baseUrl.pathname} (${response.status})`);
  }
  return JSON.parse(stripBom(await response.text()));
}

async function readManifest() {
  try {
    return await readJson(MANIFEST_URL, "manifest", true);
  } catch (error) {
    console.warn("Unable to refresh the upstream manifest.", error);
    return null;
  }
}

async function ensureRuntime(force = false) {
  const runtimeKey = `${getAssetHash("calculate.js")}:${getAssetHash("leaderboards.js")}`;
  if (!force && runtimeKey === currentRuntimeKey) {
    return false;
  }

  const [calculateModule, leaderboardsModule] = await Promise.all([
    import(buildVersionedUrl(CALCULATE_URL, getAssetHash("calculate.js")).href),
    import(buildVersionedUrl(LEADERBOARDS_URL, getAssetHash("leaderboards.js")).href)
  ]);

  runtime = {
    gather: calculateModule.gather,
    calculate: calculateModule.calculate,
    leaderboards: leaderboardsModule.leaderboards,
    filterGame: leaderboardsModule.filterGame
  };

  currentRuntimeKey = runtimeKey;
  ensureSelectedLeaderboard();
  renderButtons();
  return true;
}

async function ensurePlayerKeys(force = false) {
  const playerKeysKey = getAssetHash("player-public-keys.json");
  if (!force && playerKeysKey === currentPlayerKeysKey) {
    return false;
  }

  playerPublicKeys = await readJson(PLAYER_KEYS_URL, playerKeysKey);
  currentPlayerKeysKey = playerKeysKey;
  return true;
}

async function ensureSnapshot(force = false) {
  const snapshotKey = getAssetHash("results-snapshot.json");
  if (!force && snapshotKey === currentSnapshotKey) {
    return false;
  }

  resultsData = await readJson(SNAPSHOT_URL, snapshotKey);
  currentSnapshotKey = snapshotKey;
  return true;
}

function ensureSelectedLeaderboard() {
  const availableLeaderboards = runtime.leaderboards?.length ? runtime.leaderboards : ["Global"];
  if (!availableLeaderboards.includes(selectedLeaderboard)) {
    selectedLeaderboard = availableLeaderboards.includes("Global")
      ? "Global"
      : availableLeaderboards[0];
  }
}

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

function getTeamToneClass(userType) {
  switch (userType) {
    case "winner":
      return "stats-team-winner";
    case "loser":
      return "stats-team-loser";
    case "contender":
      return "stats-team-contender";
    default:
      return "stats-team-neutral";
  }
}

function formatTeamNames(team) {
  return team.players
    .map((player) => player.account?.name || "Unknown")
    .join(", ");
}

function renderMatchup(game) {
  const teams = game.teams.filter((team) => team.players.length);
  if (!teams.length) {
    return `<span class="stats-note">Player list unavailable.</span>`;
  }

  return `
    <div class="stats-matchup-list">
      ${teams.map((team, index) => {
        const vsLabel = index < teams.length - 1 ? `<span class="stats-versus">vs</span>` : "";
        return `
          <span class="stats-team ${getTeamToneClass(team.userType)}">${escapeHtml(formatTeamNames(team))}</span>
          ${vsLabel}
        `;
      }).join("")}
    </div>
  `;
}

function getMirrorSyncLabel() {
  if (!upstreamManifest?.syncedAt) {
    return "";
  }

  return ` Mirror synced ${formatDate(upstreamManifest.syncedAt)}.`;
}

function updateStatusText(results) {
  if (!statusElement) {
    return;
  }

  const latestEndDate = getLatestEndDate(results);
  const latestLabel = latestEndDate ? formatDate(latestEndDate) : "unknown date";
  const mirrorLabel = getMirrorSyncLabel();

  if (!results.length) {
    statusElement.textContent = `No mirrored stats data is available yet.${mirrorLabel}`;
    return;
  }

  if (liveFeedState === "live") {
    statusElement.textContent = `Live results feed active through ${latestLabel}.${mirrorLabel}`;
    return;
  }

  if (liveFeedState === "unavailable") {
    statusElement.textContent = `Showing mirrored upstream snapshot through ${latestLabel}.${mirrorLabel} Auto-refresh checks every minute.`;
    return;
  }

  statusElement.textContent = `Showing mirrored upstream snapshot through ${latestLabel}.${mirrorLabel}`;
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
      const publicKeys = [...account.publicKeys].sort();
      const note = account.discounted ? "Provisional" : `${publicKeys.length} key(s) tracked`;
      const keyDetails = publicKeys.length
        ? `
            <details class="stats-key-details">
              <summary class="stats-player-note stats-key-summary">${escapeHtml(note)}</summary>
              <div class="stats-key-list">
                ${publicKeys
                  .map((publicKey) => `<code class="stats-key-value">${escapeHtml(publicKey)}</code>`)
                  .join("")}
              </div>
            </details>
          `
        : `<span class="stats-player-note">${escapeHtml(note)}</span>`;
      return `
        <tr>
          <td class="stats-rank">${index + 1}</td>
          <td class="stats-player-name">
            ${escapeHtml(account.name || "Unknown")}
            ${keyDetails}
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
        <td colspan="6">No matches found for this slice.</td>
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
          <td class="stats-matchup">${renderMatchup(game)}</td>
          <td><span class="stats-tag">${escapeHtml(formatAlliance(game))}</span></td>
          <td class="stats-duration">${escapeHtml(formatDuration(game.duration))}</td>
          <td><a class="stats-replay-link" href="${escapeHtml(normalizeReplayUrl(game.replayUrl))}" target="_blank" rel="noreferrer">Replay</a></td>
        </tr>
      `;
    })
    .join("");
}

function render() {
  if (!runtime.gather || !runtime.calculate || !runtime.filterGame) {
    updateStatusText([]);
    return;
  }

  if (!resultsData.results.length) {
    updateStatusText([]);
    renderSummary([], []);
    renderRanks([]);
    renderMatches([]);
    return;
  }

  const { accounts, games } = runtime.gather(
    resultsData.results,
    playerPublicKeys,
    function* filterSelectedGames(allGames) {
      for (const game of allGames) {
        if (runtime.filterGame(selectedLeaderboard, game)) {
          yield game;
        }
      }
    }
  );

  runtime.calculate(games);

  const accountList = sortAccounts(accounts.values());
  const gameList = [...games].sort((left, right) => right.endDate - left.endDate);

  updateStatusText(resultsData.results);
  renderSummary(accountList, gameList);
  renderRanks(accountList);
  renderMatches(gameList);
}

function updateActiveButtons() {
  if (!buttonsElement) {
    return;
  }

  buttonsElement.querySelectorAll(".stats-filter-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.leaderboard === selectedLeaderboard);
  });
}

function renderButtons() {
  if (!buttonsElement) {
    return;
  }

  buttonsElement.innerHTML = "";
  const availableLeaderboards = runtime.leaderboards?.length ? runtime.leaderboards : ["Global"];
  availableLeaderboards.forEach((leaderboard) => {
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

function closeLiveFeed() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

function startLiveSync() {
  if (window.location.protocol === "file:") {
    liveFeedState = "unavailable";
    render();
    return;
  }

  closeLiveFeed();

  const latestEndDate = getLatestEndDate(resultsData.results);
  const feedUrl = new URL(LIVE_RESULTS_URL);
  feedUrl.search = `?id=${encodeURIComponent(`${resultsData.format} ${resultsData.results.length} ${latestEndDate}`)}`;

  let sawSignal = false;
  eventSource = new EventSource(feedUrl);

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
      closeLiveFeed();
      render();
    }
  };
}

async function refreshFromMirror(force = false) {
  const manifest = await readManifest();
  if (manifest) {
    upstreamManifest = manifest;
  }

  const runtimeChanged = await ensureRuntime(force);
  const playerKeysChanged = await ensurePlayerKeys(force);
  const shouldRefreshSnapshot = force || liveFeedState !== "live";
  const snapshotChanged = shouldRefreshSnapshot ? await ensureSnapshot(force) : false;

  if (runtimeChanged || playerKeysChanged || snapshotChanged || force) {
    render();
  }
}

function startRefreshLoop() {
  if (!refreshTimer) {
    refreshTimer = window.setInterval(() => {
      refreshFromMirror(false).catch((error) => {
        console.warn("Automatic upstream refresh failed.", error);
      });
    }, AUTO_REFRESH_MS);
  }

  if (!visibilityListenerAttached) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        refreshFromMirror(false).catch((error) => {
          console.warn("Foreground refresh failed.", error);
        });
      }
    });
    visibilityListenerAttached = true;
  }
}

window.addEventListener("beforeunload", () => {
  closeLiveFeed();
  if (refreshTimer) {
    window.clearInterval(refreshTimer);
  }
});

async function init() {
  try {
    await refreshFromMirror(true);
  } catch (error) {
    console.error(error);
    if (statusElement) {
      statusElement.textContent = "Unable to load mirrored upstream stats.";
    }
    return;
  }

  startLiveSync();
  startRefreshLoop();
}

init();
