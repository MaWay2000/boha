const GITHUB_RAW_STATS_BASE_URL = "https://raw.githubusercontent.com/MaWay2000/boha/main/stats/";
const USE_REMOTE_MIRROR_JSON = window.location.hostname.endsWith("github.io");
const MANIFEST_URL = USE_REMOTE_MIRROR_JSON
  ? new URL("upstream-manifest.json", GITHUB_RAW_STATS_BASE_URL)
  : new URL("./upstream-manifest.json", import.meta.url);
const CALCULATE_URL = new URL("./calculate.js", import.meta.url);
const LEADERBOARDS_URL = new URL("./leaderboards.js", import.meta.url);
const SNAPSHOT_URL = USE_REMOTE_MIRROR_JSON
  ? new URL("results-snapshot.json", GITHUB_RAW_STATS_BASE_URL)
  : new URL("./results-snapshot.json", import.meta.url);
const PLAYER_KEYS_URL = USE_REMOTE_MIRROR_JSON
  ? new URL("player-public-keys.json", GITHUB_RAW_STATS_BASE_URL)
  : new URL("./player-public-keys.json", import.meta.url);
const LIVE_RESULTS_URL = new URL("../results.json", import.meta.url);
const INITIAL_PLAYER_LIMIT = 20;
const PLAYER_LIMIT_STEP = 100;
const MATCH_LIMIT = 12;
const PLAYER_GAME_LIMIT = 10;
const AUTO_REFRESH_MS = 5 * 60_000;
const STALE_MIRROR_MS = 20 * 60_000;
const HIDDEN_LEADERBOARDS = new Set(["NTW >= 6 Players", "1v1 High Oil"]);

const statusElement = document.getElementById("resultsStatus");
const summaryElement = document.getElementById("statsSummary");
const buttonsElement = document.getElementById("statsLeaderboardButtons");
const ranksElement = document.getElementById("statsRanks");
const rankActionsElement = document.getElementById("statsRanksActions");
const playerGamesTitleElement = document.getElementById("statsPlayerGamesTitle");
const playerGamesMetaElement = document.getElementById("statsPlayerGamesMeta");
const playerGamesElement = document.getElementById("statsPlayerGames");
const playerSearchElement = document.getElementById("statsPlayerSearch");
const matchesSearchElement = document.getElementById("statsMatchesSearch");
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
let visiblePlayerCount = INITIAL_PLAYER_LIMIT;
let playerSearchQuery = "";
let matchesSearchQuery = "";
let leaderboardGameCounts = new Map();
let statusRefreshTimer = null;
let lastStatsUpdateAt = 0;
let expandedAccounts = new Set();
let activeExpandedAccountKey = null;
let activeExpandedPlayerGameKey = null;

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
  const previousLeaderboard = selectedLeaderboard;
  if (!availableLeaderboards.includes(selectedLeaderboard)) {
    selectedLeaderboard = availableLeaderboards.includes("Global")
      ? "Global"
      : availableLeaderboards[0];
  }
  if (selectedLeaderboard !== previousLeaderboard) {
    visiblePlayerCount = INITIAL_PLAYER_LIMIT;
  }
}

function accountSortKey(account) {
  return !account.discounted ? account.elo : -1000000000 + account.games.length;
}

function sortAccounts(accounts) {
  return [...accounts].sort((left, right) => accountSortKey(right) - accountSortKey(left));
}

function filterVisibleAccounts(accountList) {
  return accountList.filter((account) => !account.discounted || account.games.length >= 2);
}

function getNextPlayerLimit(currentCount, totalCount) {
  if (currentCount < PLAYER_LIMIT_STEP) {
    return Math.min(PLAYER_LIMIT_STEP, totalCount);
  }

  return Math.min(currentCount + PLAYER_LIMIT_STEP, totalCount);
}

function normalizeSearchQuery(value) {
  return String(value || "").trim().toLowerCase();
}

function getMirrorSyncTime() {
  return upstreamManifest?.syncedAt ? new Date(upstreamManifest.syncedAt).getTime() : 0;
}

function isMirrorStale() {
  const mirrorSyncTime = getMirrorSyncTime();
  return Boolean(mirrorSyncTime) && Date.now() - mirrorSyncTime > STALE_MIRROR_MS;
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

function formatRelativeTime(value) {
  const updatedAt = new Date(value).getTime();
  if (!Number.isFinite(updatedAt)) {
    return "Update unavailable";
  }

  const diffMs = Math.max(0, Date.now() - updatedAt);
  if (diffMs < 60_000) {
    return "Updated just now";
  }

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) {
    return `Updated ${minutes} min${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Updated ${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);
  return `Updated ${days} day${days === 1 ? "" : "s"} ago`;
}

function formatMatchDate(value) {
  const date = new Date(value);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function formatMatchTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
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

function matchesPlayerSearch(account, searchQuery) {
  if (!searchQuery) {
    return true;
  }

  const playerName = String(account.name || "").toLowerCase();
  if (playerName.includes(searchQuery)) {
    return true;
  }

  if ([...account.names.keys()].some((name) => String(name || "").toLowerCase().includes(searchQuery))) {
    return true;
  }

  return [...account.publicKeys].some((publicKey) => String(publicKey || "").toLowerCase().includes(searchQuery));
}

function getSortedAccountNames(account) {
  return [...account.names.entries()]
    .filter(([name, count]) => name && count > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}

function matchesRecentGameSearch(game, searchQuery) {
  if (!searchQuery) {
    return true;
  }

  if (String(game.mapName || "").toLowerCase().includes(searchQuery)) {
    return true;
  }

  if (String(game.mods || "").toLowerCase().includes(searchQuery)) {
    return true;
  }

  if (String(game.replayUrl || "").toLowerCase().includes(searchQuery)) {
    return true;
  }

  return game.players.some((slot) => {
    const account = slot.account;
    if (!account) {
      return false;
    }

    if (String(account.name || "").toLowerCase().includes(searchQuery)) {
      return true;
    }

    if ([...account.names.keys()].some((name) => String(name || "").toLowerCase().includes(searchQuery))) {
      return true;
    }

    return [...account.publicKeys].some((publicKey) => String(publicKey || "").toLowerCase().includes(searchQuery));
  });
}

function getAccountExpandKey(account) {
  if (account.mainPublicKey) {
    return `main:${account.mainPublicKey}`;
  }

  const publicKeys = [...account.publicKeys].sort();
  if (publicKeys.length) {
    return `keys:${publicKeys.join("|")}`;
  }

  return `name:${account.name || "unknown"}:${account.games.length}:${account.winCount}:${account.loseCount}:${account.drawCount}`;
}

function getPlayerGameOutcome(game, account) {
  const slot = game.players.find((playerSlot) => playerSlot.account === account)
    || (game.slots || []).find((playerSlot) => playerSlot.account === account);

  switch (slot?.userType) {
    case "winner":
      return { label: "Won", className: "is-win" };
    case "loser":
      return { label: "Lost", className: "is-loss" };
    case "contender":
      return { label: "Draw", className: "is-draw" };
    default:
      return { label: "Played", className: "is-neutral" };
  }
}

function getPlayerGameKey(game) {
  return [
    Number(game.endDate || 0),
    String(game.mapName || ""),
    Number(game.duration || 0),
    String(game.replayUrl || "")
  ].join("|");
}

function renderPlayerGameDetails(game, outcome) {
  const detailItems = [
    ["Played", formatDate(game.endDate)],
    ["Map", game.mapName || "Unknown"],
    ["Mode", formatAlliance(game)],
    ["Result", outcome.label]
  ];

  if (game.mods) {
    detailItems.push(["Rules", game.mods]);
  }

  return `
    <div class="stats-player-game-detail-panel">
      <div class="stats-player-game-meta">
        ${detailItems
          .map(([label, value]) => `
            <div class="stats-player-game-meta-item">
              <span class="stats-player-game-meta-label">${escapeHtml(label)}</span>
              <strong class="stats-player-game-meta-value">${escapeHtml(value)}</strong>
            </div>
          `)
          .join("")}
      </div>
      <div class="stats-detail-group">
        <span class="stats-detail-label">Players</span>
        <div class="stats-matchup">
          ${renderMatchup(game)}
        </div>
      </div>
    </div>
  `;
}

function renderPlayerGames(accounts) {
  if (!playerGamesElement || !playerGamesTitleElement || !playerGamesMetaElement) {
    return;
  }

  const activeAccount = accounts.find((account) => getAccountExpandKey(account) === activeExpandedAccountKey);
  if (!activeAccount) {
    activeExpandedAccountKey = null;
    activeExpandedPlayerGameKey = null;
    expandedAccounts.clear();
    playerGamesTitleElement.textContent = "Expand a player to inspect recent games";
    playerGamesMetaElement.textContent = "The selected player's latest matches will appear here.";
    playerGamesElement.innerHTML = `
      <tr class="stats-empty-row">
        <td colspan="5">Use + on a player to show their latest games here.</td>
      </tr>
    `;
    return;
  }

  const latestGames = [...activeAccount.games]
    .sort((left, right) => Number(right.endDate || 0) - Number(left.endDate || 0))
    .slice(0, PLAYER_GAME_LIMIT);
  const latestGameKeys = new Set(latestGames.map(getPlayerGameKey));

  if (activeExpandedPlayerGameKey && !latestGameKeys.has(activeExpandedPlayerGameKey)) {
    activeExpandedPlayerGameKey = null;
  }

  playerGamesTitleElement.textContent = `${activeAccount.name || "Player"} recent games`;
  playerGamesMetaElement.textContent = `Latest ${latestGames.length} matches in the ${selectedLeaderboard} slice.`;

  if (!latestGames.length) {
    playerGamesElement.innerHTML = `
      <tr class="stats-empty-row">
        <td colspan="5">No recent games found for this player in the selected slice.</td>
      </tr>
    `;
    return;
  }

  playerGamesElement.innerHTML = latestGames
    .map((game) => {
      const outcome = getPlayerGameOutcome(game, activeAccount);
      const replayUrl = game.replayUrl ? normalizeReplayUrl(game.replayUrl) : "";
      const gameKey = getPlayerGameKey(game);
      const isExpanded = activeExpandedPlayerGameKey === gameKey;
      const detailRow = isExpanded
        ? `
          <tr class="stats-player-game-detail-row">
            <td colspan="5">
              ${renderPlayerGameDetails(game, outcome)}
            </td>
          </tr>
        `
        : "";

      return `
        <tr class="stats-player-game-row${isExpanded ? " is-expanded" : ""}" data-player-game-key="${escapeHtml(gameKey)}">
          <td class="stats-date">
            ${escapeHtml(formatMatchDate(game.endDate))}
            <span class="stats-date-time">${escapeHtml(formatMatchTime(game.endDate))}</span>
          </td>
          <td>
            ${escapeHtml(game.mapName)}
            ${game.mods ? `<span class="stats-note">${escapeHtml(game.mods)}</span>` : ""}
          </td>
          <td><span class="stats-tag stats-player-game-result ${outcome.className}">${escapeHtml(outcome.label)}</span></td>
          <td class="stats-duration">${escapeHtml(formatDuration(game.duration))}</td>
          <td>
            ${replayUrl
              ? `<a class="stats-replay-link" href="${escapeHtml(replayUrl)}" target="_blank" rel="noreferrer">Replay</a>`
              : `<span class="stats-note">Unavailable</span>`}
          </td>
        </tr>
        ${detailRow}
      `;
    })
    .join("");

  playerGamesElement.querySelectorAll(".stats-player-game-row").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        return;
      }

      const { playerGameKey } = row.dataset;
      if (!playerGameKey) {
        return;
      }

      activeExpandedPlayerGameKey = activeExpandedPlayerGameKey === playerGameKey
        ? null
        : playerGameKey;

      renderPlayerGames(accounts);
    });
  });
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
          <span class="stats-team ${getTeamToneClass(team.userType)}">
            ${team.players
              .map((player) => `<span class="stats-team-player">${escapeHtml(player.account?.name || "Unknown")}</span>`)
              .join("")}
          </span>
          ${vsLabel}
        `;
      }).join("")}
    </div>
  `;
}

function getLastUpdateTime(results) {
  if (liveFeedState === "live") {
    return getLatestEndDate(results) || getMirrorSyncTime();
  }

  return getMirrorSyncTime() || getLatestEndDate(results);
}

function renderStatusText() {
  if (!statusElement) {
    return;
  }

  const mirrorStale = isMirrorStale();
  statusElement.classList.toggle("is-stale", mirrorStale);

  if (!lastStatsUpdateAt) {
    statusElement.textContent = "Last update: unavailable";
    statusElement.removeAttribute("title");
    return;
  }

  const absoluteLabel = `Last update: ${formatDate(lastStatsUpdateAt)}`;
  const relativeLabel = formatRelativeTime(lastStatsUpdateAt);
  const absoluteText = document.createElement("span");
  absoluteText.className = "stats-status-time";
  absoluteText.textContent = absoluteLabel;

  const relativeText = document.createElement("span");
  relativeText.className = "stats-status-relative";
  relativeText.textContent = relativeLabel;

  statusElement.replaceChildren(absoluteText, relativeText);
  statusElement.title = `${absoluteLabel} (${relativeLabel})`;
}

function updateStatusText(results) {
  if (!statusElement) {
    return;
  }

  lastStatsUpdateAt = getLastUpdateTime(results);
  renderStatusText();

  if (!statusRefreshTimer) {
    statusRefreshTimer = window.setInterval(renderStatusText, 60_000);
  }
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
    return [];
  }

  const eligibleAccounts = filterVisibleAccounts(accountList);
  const searchQuery = normalizeSearchQuery(playerSearchQuery);
  const matchingRows = eligibleAccounts
    .map((account, index) => ({ account, rank: index + 1 }))
    .filter(({ account }) => matchesPlayerSearch(account, searchQuery));
  const rows = searchQuery ? matchingRows : matchingRows.slice(0, visiblePlayerCount);

  if (!rows.length) {
    ranksElement.innerHTML = `
      <tr class="stats-empty-row">
        <td colspan="5">${searchQuery ? "No players matched that nickname or key." : "No ranked players found for this slice."}</td>
      </tr>
    `;
    renderRankActions(eligibleAccounts.length, 0, searchQuery);
    return [];
  }

  ranksElement.innerHTML = rows
    .map(({ account, rank }) => {
      const eloLabel = account.discounted ? "--" : account.elo.toFixed(2);
      const publicKeys = [...account.publicKeys].sort();
      const accountNames = getSortedAccountNames(account);
      const note = account.discounted ? "Provisional" : `${publicKeys.length} key(s) tracked`;
      const keyCountLabel = `${publicKeys.length} key(s) tracked`;
      const playerLine = escapeHtml(account.name || "Unknown");
      const hasDetails = Boolean(publicKeys.length || accountNames.length > 1);
      const expandKey = getAccountExpandKey(account);
      const isExpanded = hasDetails && expandedAccounts.has(expandKey);
      const expandLabel = isExpanded
        ? "Hide player names and keys"
        : accountNames.length > 1
          ? "Show player names and keys"
          : keyCountLabel;
      const nameDetails = accountNames.length > 1
        ? `
            <div class="stats-detail-group">
              <span class="stats-detail-label">Player names</span>
              <div class="stats-name-list">
                ${accountNames
                  .map(([name, count]) => `
                    <span class="stats-name-chip${name === account.name ? " is-primary" : ""}">
                      <span class="stats-name-text">${escapeHtml(name)}</span>
                      <sup class="stats-name-count">${count}</sup>
                    </span>
                  `)
                  .join("")}
              </div>
            </div>
          `
        : "";
      const keyDetails = publicKeys.length
        ? `
            <div class="stats-detail-group">
              <span class="stats-detail-label">${escapeHtml(keyCountLabel)}</span>
              <div class="stats-key-list">
                ${publicKeys
                  .map((publicKey) => `<code class="stats-key-value">${escapeHtml(publicKey)}</code>`)
                  .join("")}
              </div>
            </div>
          `
        : "";
      const playerDetails = hasDetails
        ? `
            <div class="stats-player-line">
              <span class="stats-player-label">${playerLine}</span>
              <button
                class="stats-expand-toggle"
                type="button"
                data-expand-account="${escapeHtml(expandKey)}"
                aria-expanded="${isExpanded ? "true" : "false"}"
              >
                <span aria-hidden="true">${isExpanded ? "-" : "+"}</span>
                <span class="visually-hidden">${escapeHtml(expandLabel)}</span>
              </button>
            </div>
          `
        : `
            <div class="stats-player-line">
              <span class="stats-player-label">${playerLine}</span>
              <span class="stats-player-note">${escapeHtml(note)}</span>
            </div>
          `;
      const detailRow = hasDetails && isExpanded
        ? `
            <tr class="stats-detail-row">
              <td colspan="5">
                <div class="stats-detail-panel">
                  <div class="stats-key-panel">
                    ${nameDetails}
                    ${keyDetails}
                  </div>
                </div>
              </td>
            </tr>
          `
        : "";
      return `
        <tr class="stats-rank-row${isExpanded ? " is-expanded" : ""}${hasDetails ? " is-clickable" : ""}"${hasDetails ? ` data-expand-account="${escapeHtml(expandKey)}"` : ""}>
          <td class="stats-rank">${rank}</td>
          <td class="stats-player-name">
            ${playerDetails}
          </td>
          <td class="stats-elo">${eloLabel}</td>
          <td>${account.games.length}</td>
          <td class="stats-record">${account.winCount}/${account.loseCount}/${account.drawCount}</td>
        </tr>
        ${detailRow}
      `;
    })
    .join("");

  function toggleExpandedAccount(expandAccount) {
    if (!expandAccount) {
      return;
    }

    if (expandedAccounts.has(expandAccount)) {
      expandedAccounts.delete(expandAccount);
      activeExpandedAccountKey = null;
      activeExpandedPlayerGameKey = null;
    } else {
      expandedAccounts = new Set([expandAccount]);
      activeExpandedAccountKey = expandAccount;
      activeExpandedPlayerGameKey = null;
    }

    render();
  }

  ranksElement.querySelectorAll(".stats-rank-row[data-expand-account]").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        return;
      }

      const { expandAccount } = row.dataset;
      if (!expandAccount) {
        return;
      }

      toggleExpandedAccount(expandAccount);
    });
  });

  renderRankActions(eligibleAccounts.length, matchingRows.length, searchQuery);
  return rows.map(({ account }) => account);
}

function renderRankActions(totalPlayers, matchingPlayers = totalPlayers, searchQuery = "") {
  if (!rankActionsElement) {
    return;
  }

  if (!totalPlayers && !searchQuery) {
    rankActionsElement.innerHTML = "";
    return;
  }

  if (searchQuery) {
    const matchLabel = matchingPlayers === 1 ? "player" : "players";
    rankActionsElement.innerHTML = `
      <span class="stats-panel-note">Found ${matchingPlayers} ${matchLabel} for "${escapeHtml(playerSearchQuery.trim())}".</span>
    `;
    return;
  }

  const shownCount = Math.min(visiblePlayerCount, totalPlayers);
  const canLoadMore = shownCount < totalPlayers;

  if (!canLoadMore) {
    rankActionsElement.innerHTML = `
      <span class="stats-panel-note">Showing all ${totalPlayers} listed players.</span>
    `;
    return;
  }

  const nextLimit = getNextPlayerLimit(shownCount, totalPlayers);
  const actionLabel = shownCount < PLAYER_LIMIT_STEP ? "Show more" : "Load more";
  const targetLabel = nextLimit >= totalPlayers ? `all ${totalPlayers}` : `top ${nextLimit}`;

  rankActionsElement.innerHTML = `
    <span class="stats-panel-note">Showing top ${shownCount} of ${totalPlayers} listed players.</span>
    <button class="stats-load-more" id="statsLoadMore" type="button">${actionLabel} (${targetLabel})</button>
  `;

  const loadMoreButton = rankActionsElement.querySelector(".stats-load-more");
  if (!loadMoreButton) {
    return;
  }

  loadMoreButton.addEventListener("click", () => {
    visiblePlayerCount = nextLimit;
    render();
  });
}

function renderMatches(gameList) {
  if (!matchesElement) {
    return;
  }

  const searchQuery = normalizeSearchQuery(matchesSearchQuery);
  const configuredMatchLimit = Number(matchesElement.dataset.matchLimit || MATCH_LIMIT);
  const matchLimit = Number.isFinite(configuredMatchLimit) && configuredMatchLimit > 0
    ? configuredMatchLimit
    : MATCH_LIMIT;
  const filteredGames = gameList.filter((game) => matchesRecentGameSearch(game, searchQuery));
  const rows = filteredGames.slice(0, matchLimit);

  if (!rows.length) {
    matchesElement.innerHTML = `
      <tr class="stats-empty-row">
        <td colspan="5">${searchQuery ? "No matches matched that nickname, key, or map." : "No matches found for this slice."}</td>
      </tr>
    `;
    return;
  }

  matchesElement.innerHTML = rows
    .map((game) => {
      return `
        <tr>
          <td class="stats-date">
            ${escapeHtml(formatMatchDate(game.endDate))}
            <span class="stats-date-time">${escapeHtml(formatMatchTime(game.endDate))}</span>
          </td>
          <td>
            ${escapeHtml(game.mapName)}
            ${game.mods ? `<span class="stats-note">${escapeHtml(game.mods)}</span>` : ""}
          </td>
          <td class="stats-matchup">${renderMatchup(game)}</td>
          <td class="stats-duration">${escapeHtml(formatDuration(game.duration))}</td>
          <td><a class="stats-replay-link" href="${escapeHtml(normalizeReplayUrl(game.replayUrl))}" target="_blank" rel="noreferrer">Replay</a></td>
        </tr>
      `;
    })
    .join("");
}

function collectAllGames() {
  if (!runtime.gather) {
    return [];
  }

  const { games } = runtime.gather(
    resultsData.results,
    playerPublicKeys,
    function* includeAllGames(allGames) {
      yield* allGames;
    }
  );

  return [...games];
}

function render() {
  if (!runtime.gather || !runtime.calculate || !runtime.filterGame) {
    updateStatusText([]);
    return;
  }

  if (!resultsData.results.length) {
    updateStatusText([]);
    leaderboardGameCounts = new Map();
    renderButtons();
    renderSummary([], []);
    renderPlayerGames(renderRanks([]));
    renderMatches([]);
    return;
  }

  const allGames = collectAllGames();
  leaderboardGameCounts = new Map(
    (runtime.leaderboards?.length ? runtime.leaderboards : ["Global"]).map((leaderboard) => [
      leaderboard,
      allGames.reduce(
        (count, game) => count + (runtime.filterGame(leaderboard, game) ? 1 : 0),
        0
      )
    ])
  );

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
  renderButtons();
  renderSummary(accountList, gameList);
  renderPlayerGames(renderRanks(accountList));
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

function getLeaderboardGameCount(leaderboard) {
  return leaderboardGameCounts.get(leaderboard) || 0;
}

function getOrderedLeaderboards() {
  const availableLeaderboards = runtime.leaderboards?.length ? runtime.leaderboards : ["Global"];

  return [...availableLeaderboards]
    .filter((leaderboard) => !HIDDEN_LEADERBOARDS.has(leaderboard))
    .sort((left, right) => {
    const countDelta = getLeaderboardGameCount(right) - getLeaderboardGameCount(left);
    if (countDelta !== 0) {
      return countDelta;
    }

    if (left === "Global") {
      return -1;
    }
    if (right === "Global") {
      return 1;
    }

      return left.localeCompare(right);
    });
}

function renderButtons() {
  if (!buttonsElement) {
    return;
  }

  buttonsElement.innerHTML = "";
  const orderedLeaderboards = getOrderedLeaderboards();
  orderedLeaderboards.forEach((leaderboard) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "stats-filter-button";
    button.dataset.leaderboard = leaderboard;
    button.textContent = leaderboard;
    button.addEventListener("click", () => {
      if (selectedLeaderboard !== leaderboard) {
        visiblePlayerCount = INITIAL_PLAYER_LIMIT;
      }
      selectedLeaderboard = leaderboard;
      updateActiveButtons();
      render();
    });
    buttonsElement.appendChild(button);
  });

  updateActiveButtons();
}

if (playerSearchElement) {
  playerSearchElement.addEventListener("input", (event) => {
    playerSearchQuery = event.currentTarget.value;
    render();
  });
}

if (matchesSearchElement) {
  matchesSearchElement.addEventListener("input", (event) => {
    matchesSearchQuery = event.currentTarget.value;
    render();
  });
}

function closeLiveFeed() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

function startLiveSync() {
  if (window.location.protocol === "file:" || USE_REMOTE_MIRROR_JSON) {
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
  if (statusRefreshTimer) {
    window.clearInterval(statusRefreshTimer);
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
