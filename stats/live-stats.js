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
const PLAYER_GAME_LIMIT = 20;
const AUTO_REFRESH_MS = 5 * 60_000;
const STALE_MIRROR_MS = 20 * 60_000;
const HIDDEN_LEADERBOARDS = new Set(["NTW >= 6 Players", "1v1 High Oil"]);
const SORT_DEFAULTS = {
  ranks: { key: "rank", direction: "asc" },
  "player-games": { key: "date", direction: "desc" },
  matches: { key: "date", direction: "desc" }
};
const SORT_ALLOWED_KEYS = {
  ranks: new Set(["rank", "player", "elo", "matches", "record"]),
  "player-games": new Set(["date", "map", "result", "duration", "replay"]),
  matches: new Set(["date", "map", "players", "duration", "replay"])
};
const SORT_DEFAULT_DIRECTIONS = {
  ranks: {
    rank: "asc",
    player: "asc",
    elo: "desc",
    matches: "desc",
    record: "desc"
  },
  "player-games": {
    date: "desc",
    map: "asc",
    result: "desc",
    duration: "desc",
    replay: "desc"
  },
  matches: {
    date: "desc",
    map: "asc",
    players: "desc",
    duration: "desc",
    replay: "desc"
  }
};
const PLAYER_GAME_RESULT_ORDER = {
  Lost: 0,
  Played: 1,
  Draw: 2,
  Won: 3
};

const statusElement = document.getElementById("resultsStatus");
const summaryElement = document.getElementById("statsSummary");
const buttonsElement = document.getElementById("statsLeaderboardButtons");
const ranksElement = document.getElementById("statsRanks");
const rankActionsElement = document.getElementById("statsRanksActions");
const playerGamesTitleElement = document.getElementById("statsPlayerGamesTitle");
const playerGamesMetaElement = document.getElementById("statsPlayerGamesMeta");
const playerGamesElement = document.getElementById("statsPlayerGames");
const playerGamesActionsElement = document.getElementById("statsPlayerGamesActions");
const playerSearchElement = document.getElementById("statsPlayerSearch");
const matchesSearchElement = document.getElementById("statsMatchesSearch");
const matchesElement = document.getElementById("statsMatches");
const sortHeaderElements = [...document.querySelectorAll("[data-sort-table][data-sort-key]")];

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
let globalRankMap = new Map();
let statusRefreshTimer = null;
let lastStatsUpdateAt = 0;
let expandedAccounts = new Set();
let activeExpandedAccountKey = null;
let activeExpandedPlayerGameKey = null;
let showingAllPlayerGames = false;
let rankSortState = cloneSortState(SORT_DEFAULTS.ranks);
let playerGamesSortState = cloneSortState(SORT_DEFAULTS["player-games"]);
let matchesSortState = cloneSortState(SORT_DEFAULTS.matches);

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

function cloneSortState(sortState) {
  return {
    key: sortState.key,
    direction: sortState.direction
  };
}

function stripBom(text) {
  return text.replace(/^\uFEFF/, "");
}

function getAssetHash(name) {
  return upstreamManifest?.files?.[name]?.sha256?.slice(0, 16) || "local";
}

function getSortState(table) {
  switch (table) {
    case "ranks":
      return rankSortState;
    case "player-games":
      return playerGamesSortState;
    case "matches":
      return matchesSortState;
    default:
      return cloneSortState(SORT_DEFAULTS.ranks);
  }
}

function setSortState(table, sortState) {
  switch (table) {
    case "ranks":
      rankSortState = sortState;
      break;
    case "player-games":
      playerGamesSortState = sortState;
      break;
    case "matches":
      matchesSortState = sortState;
      break;
    default:
      break;
  }
}

function getDefaultSortDirection(table, key) {
  return SORT_DEFAULT_DIRECTIONS[table]?.[key] || "asc";
}

function parseSortState(value, table) {
  const fallback = SORT_DEFAULTS[table];
  if (!value || !fallback) {
    return cloneSortState(fallback || SORT_DEFAULTS.ranks);
  }

  const [key, direction] = String(value).split(":");
  if (!SORT_ALLOWED_KEYS[table]?.has(key)) {
    return cloneSortState(fallback);
  }

  return {
    key,
    direction: direction === "desc" ? "desc" : "asc"
  };
}

function encodeSortState(sortState) {
  return `${sortState.key}:${sortState.direction}`;
}

function isDefaultSortState(table, sortState) {
  const fallback = SORT_DEFAULTS[table];
  return Boolean(fallback)
    && fallback.key === sortState.key
    && fallback.direction === sortState.direction;
}

function compareNumberValues(left, right) {
  const normalizedLeft = Number.isFinite(left) ? left : Number.NEGATIVE_INFINITY;
  const normalizedRight = Number.isFinite(right) ? right : Number.NEGATIVE_INFINITY;
  return normalizedLeft - normalizedRight;
}

function compareTextValues(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, {
    sensitivity: "base",
    numeric: true
  });
}

function applySortDirection(result, direction) {
  return direction === "desc" ? -result : result;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function updateSortIndicators() {
  sortHeaderElements.forEach((header) => {
    const table = header.dataset.sortTable;
    const key = header.dataset.sortKey;
    const sortState = getSortState(table);
    const isActive = sortState.key === key;
    header.setAttribute(
      "aria-sort",
      isActive
        ? (sortState.direction === "asc" ? "ascending" : "descending")
        : "none"
    );

    const button = header.querySelector(".stats-sort-button");
    if (!button) {
      return;
    }

    button.classList.toggle("is-active", isActive);
    button.dataset.direction = isActive ? sortState.direction : "";
  });
}

function setupSortHeaders() {
  sortHeaderElements.forEach((header) => {
    const button = header.querySelector(".stats-sort-button");
    if (!button || button.dataset.sortBound === "true") {
      return;
    }

    button.dataset.sortBound = "true";
    button.addEventListener("click", () => {
      const table = header.dataset.sortTable;
      const key = header.dataset.sortKey;
      if (!table || !key) {
        return;
      }

      const currentSort = getSortState(table);
      const nextSort = currentSort.key === key
        ? {
            key,
            direction: currentSort.direction === "asc" ? "desc" : "asc"
          }
        : {
            key,
            direction: getDefaultSortDirection(table, key)
          };

      setSortState(table, nextSort);
      updateSortIndicators();
      render();
    });
  });

  updateSortIndicators();
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

function applyStateFromUrl() {
  const url = new URL(window.location.href);
  selectedLeaderboard = url.searchParams.get("leaderboard") || "Global";
  visiblePlayerCount = Math.max(
    INITIAL_PLAYER_LIMIT,
    parsePositiveInteger(url.searchParams.get("players"), INITIAL_PLAYER_LIMIT)
  );
  playerSearchQuery = url.searchParams.get("playerSearch") || "";
  matchesSearchQuery = url.searchParams.get("matchesSearch") || "";
  activeExpandedAccountKey = url.searchParams.get("player") || null;
  activeExpandedPlayerGameKey = url.searchParams.get("game") || null;
  showingAllPlayerGames = url.searchParams.get("playerGames") === "all";
  rankSortState = parseSortState(url.searchParams.get("ranksSort"), "ranks");
  playerGamesSortState = parseSortState(url.searchParams.get("playerGamesSort"), "player-games");
  matchesSortState = parseSortState(url.searchParams.get("matchesSort"), "matches");
  expandedAccounts = activeExpandedAccountKey ? new Set([activeExpandedAccountKey]) : new Set();

  if (playerSearchElement) {
    playerSearchElement.value = playerSearchQuery;
  }

  if (matchesSearchElement) {
    matchesSearchElement.value = matchesSearchQuery;
  }

  updateSortIndicators();
}

function buildStateParams() {
  const params = new URLSearchParams();

  if (selectedLeaderboard !== "Global") {
    params.set("leaderboard", selectedLeaderboard);
  }

  if (ranksElement && visiblePlayerCount > INITIAL_PLAYER_LIMIT) {
    params.set("players", String(visiblePlayerCount));
  }

  if (playerSearchElement && playerSearchQuery.trim()) {
    params.set("playerSearch", playerSearchQuery.trim());
  }

  if (matchesSearchElement && matchesSearchQuery.trim()) {
    params.set("matchesSearch", matchesSearchQuery.trim());
  }

  if (ranksElement && activeExpandedAccountKey) {
    params.set("player", activeExpandedAccountKey);
  }

  if (playerGamesElement && activeExpandedPlayerGameKey) {
    params.set("game", activeExpandedPlayerGameKey);
  }

  if (playerGamesElement && showingAllPlayerGames) {
    params.set("playerGames", "all");
  }

  if (ranksElement && !isDefaultSortState("ranks", rankSortState)) {
    params.set("ranksSort", encodeSortState(rankSortState));
  }

  if (playerGamesElement && !isDefaultSortState("player-games", playerGamesSortState)) {
    params.set("playerGamesSort", encodeSortState(playerGamesSortState));
  }

  if (matchesElement && !isDefaultSortState("matches", matchesSortState)) {
    params.set("matchesSort", encodeSortState(matchesSortState));
  }

  return params;
}

function syncStateToUrl() {
  const url = new URL(window.location.href);
  const params = buildStateParams();
  url.search = params.toString();
  window.history.replaceState({ search: url.search }, "", url);
  window.bohaEmbeddedPage?.postState(url.search);
}

function resetPlayerGamesView() {
  showingAllPlayerGames = false;
  activeExpandedPlayerGameKey = null;
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

function buildGlobalRankMap(accountList) {
  return new Map(
    filterVisibleAccounts(accountList)
      .map((account, index) => [getAccountExpandKey(account), index + 1])
  );
}

function getGlobalRankLabel(account) {
  if (!account) {
    return "NR";
  }

  return globalRankMap.get(getAccountExpandKey(account)) || "NR";
}

function getNumericGlobalRank(account) {
  if (!account) {
    return null;
  }

  const rank = globalRankMap.get(getAccountExpandKey(account));
  return Number.isFinite(rank) ? rank : null;
}

function getTeamStrengthPercent(team) {
  const totalRankedPlayers = globalRankMap.size;
  if (!totalRankedPlayers || !team.players.length) {
    return null;
  }

  const strengthScore = team.players.reduce((total, player) => {
    const rank = getNumericGlobalRank(player.account);
    if (!rank) {
      return total;
    }

    return total + ((totalRankedPlayers - rank + 1) / totalRankedPlayers);
  }, 0);

  return Math.round((strengthScore / team.players.length) * 100);
}

function getTeamStrengthToneClass(strengthPercent, allStrengths) {
  if (!Number.isFinite(strengthPercent)) {
    return "stats-team-strength-neutral";
  }

  const validStrengths = allStrengths.filter((value) => Number.isFinite(value));
  if (!validStrengths.length) {
    return "stats-team-strength-neutral";
  }

  const strongest = Math.max(...validStrengths);
  const weakest = Math.min(...validStrengths);
  if (strongest === weakest) {
    return "stats-team-strength-neutral";
  }

  if (strengthPercent === strongest) {
    return "stats-team-strength-stronger";
  }

  if (strengthPercent === weakest) {
    return "stats-team-strength-lower";
  }

  return "stats-team-strength-middle";
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

function getReplaySortValue(replayUrl) {
  if (!replayUrl) {
    return "";
  }

  return normalizeReplayUrl(replayUrl);
}

function getPlayerCount(game) {
  return Array.isArray(game.players) ? game.players.length : 0;
}

function getRankRecordScore(account) {
  const totalGames = account.games.length || 1;
  return ((account.winCount * 3) + account.drawCount) / totalGames;
}

function compareRankRows(left, right) {
  let result = 0;

  switch (rankSortState.key) {
    case "player":
      result = compareTextValues(left.account.name, right.account.name)
        || compareNumberValues(left.rank, right.rank);
      break;
    case "elo":
      result = compareNumberValues(
        left.account.discounted ? Number.NEGATIVE_INFINITY : left.account.elo,
        right.account.discounted ? Number.NEGATIVE_INFINITY : right.account.elo
      ) || compareNumberValues(left.rank, right.rank);
      break;
    case "matches":
      result = compareNumberValues(left.account.games.length, right.account.games.length)
        || compareNumberValues(left.rank, right.rank);
      break;
    case "record":
      result = compareNumberValues(getRankRecordScore(left.account), getRankRecordScore(right.account))
        || compareNumberValues(left.account.winCount, right.account.winCount)
        || compareNumberValues(right.account.loseCount, left.account.loseCount)
        || compareNumberValues(left.account.drawCount, right.account.drawCount)
        || compareNumberValues(left.rank, right.rank);
      break;
    case "rank":
    default:
      result = compareNumberValues(left.rank, right.rank);
      break;
  }

  return applySortDirection(result, rankSortState.direction);
}

function comparePlayerGames(left, right, activeAccount) {
  let result = 0;

  switch (playerGamesSortState.key) {
    case "map":
      result = compareTextValues(left.mapName, right.mapName)
        || compareNumberValues(left.endDate, right.endDate);
      break;
    case "result":
      result = compareNumberValues(
        PLAYER_GAME_RESULT_ORDER[getPlayerGameOutcome(left, activeAccount).label] || 0,
        PLAYER_GAME_RESULT_ORDER[getPlayerGameOutcome(right, activeAccount).label] || 0
      ) || compareNumberValues(left.endDate, right.endDate);
      break;
    case "duration":
      result = compareNumberValues(left.duration, right.duration)
        || compareNumberValues(left.endDate, right.endDate);
      break;
    case "replay":
      result = compareTextValues(getReplaySortValue(left.replayUrl), getReplaySortValue(right.replayUrl))
        || compareNumberValues(left.endDate, right.endDate);
      break;
    case "date":
    default:
      result = compareNumberValues(left.endDate, right.endDate);
      break;
  }

  return applySortDirection(result, playerGamesSortState.direction);
}

function compareMatches(left, right) {
  let result = 0;

  switch (matchesSortState.key) {
    case "map":
      result = compareTextValues(left.mapName, right.mapName)
        || compareNumberValues(left.endDate, right.endDate);
      break;
    case "players":
      result = compareNumberValues(getPlayerCount(left), getPlayerCount(right))
        || compareNumberValues(left.endDate, right.endDate);
      break;
    case "duration":
      result = compareNumberValues(left.duration, right.duration)
        || compareNumberValues(left.endDate, right.endDate);
      break;
    case "replay":
      result = compareTextValues(getReplaySortValue(left.replayUrl), getReplaySortValue(right.replayUrl))
        || compareNumberValues(left.endDate, right.endDate);
      break;
    case "date":
    default:
      result = compareNumberValues(left.endDate, right.endDate);
      break;
  }

  return applySortDirection(result, matchesSortState.direction);
}

async function copyValueToClipboard(button) {
  const value = button.dataset.copyValue;
  if (!value) {
    return;
  }

  const previousText = button.textContent;
  try {
    await navigator.clipboard.writeText(value);
    button.textContent = "Copied";
    button.classList.add("is-copied");
  } catch (error) {
    button.textContent = "Failed";
    button.classList.add("is-failed");
  }

  window.setTimeout(() => {
    button.textContent = previousText;
    button.classList.remove("is-copied", "is-failed");
  }, 1400);
}

function bindCopyButtons(scope) {
  scope.querySelectorAll("[data-copy-value]").forEach((button) => {
    if (button.dataset.copyBound === "true") {
      return;
    }

    button.dataset.copyBound = "true";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      copyValueToClipboard(button);
    });
  });
}

function renderPlayerGameDetails(game, activeAccount) {
  return `
    <div class="stats-player-game-detail-panel">
      <div class="stats-matchup stats-matchup-tiles">
        ${renderMatchup(game, {
          variant: "tiles",
          includeGlobalRank: true,
          showVersus: false,
          highlightedAccountKey: activeAccount ? getAccountExpandKey(activeAccount) : "",
          clickablePlayerTiles: true,
          currentGameKey: getPlayerGameKey(game)
        })}
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
    resetPlayerGamesView();
    expandedAccounts.clear();
    playerGamesTitleElement.textContent = "Expand a player to inspect recent games";
    playerGamesMetaElement.textContent = "The selected player's latest matches will appear here.";
    if (playerGamesActionsElement) {
      playerGamesActionsElement.innerHTML = "";
    }
    playerGamesElement.innerHTML = `
      <tr class="stats-empty-row">
        <td colspan="5">Use + on a player to show their latest games here.</td>
      </tr>
    `;
    return;
  }

  const sortedGames = [...activeAccount.games].sort((left, right) => comparePlayerGames(left, right, activeAccount));
  let latestGames = showingAllPlayerGames
    ? sortedGames
    : sortedGames.slice(0, PLAYER_GAME_LIMIT);

  if (activeExpandedPlayerGameKey) {
    const expandedGame = sortedGames.find((game) => getPlayerGameKey(game) === activeExpandedPlayerGameKey);
    if (expandedGame && !latestGames.some((game) => getPlayerGameKey(game) === activeExpandedPlayerGameKey)) {
      latestGames = [
        expandedGame,
        ...latestGames.filter((game) => getPlayerGameKey(game) !== activeExpandedPlayerGameKey)
      ].slice(0, showingAllPlayerGames ? sortedGames.length : PLAYER_GAME_LIMIT);
    }
  }

  const latestGameKeys = new Set(latestGames.map(getPlayerGameKey));

  if (activeExpandedPlayerGameKey && !latestGameKeys.has(activeExpandedPlayerGameKey)) {
    activeExpandedPlayerGameKey = null;
  }

  playerGamesTitleElement.textContent = `${activeAccount.name || "Player"} recent games`;
  playerGamesMetaElement.textContent = showingAllPlayerGames
    ? `All ${latestGames.length} matches in the ${selectedLeaderboard} slice.`
    : `Latest ${latestGames.length} matches in the ${selectedLeaderboard} slice.`;
  renderPlayerGameActions(sortedGames.length);

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
              ${renderPlayerGameDetails(game, activeAccount)}
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

  playerGamesElement.querySelectorAll(".stats-team-tile[data-jump-account]").forEach((tile) => {
    tile.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const { jumpAccount, jumpGame } = tile.dataset;
      if (!jumpAccount) {
        return;
      }

      const targetAccount = accounts.find((account) => getAccountExpandKey(account) === jumpAccount);
      if (!targetAccount) {
        return;
      }

      playerSearchQuery = String(targetAccount.name || "");
      if (playerSearchElement) {
        playerSearchElement.value = playerSearchQuery;
      }

      const eligibleAccounts = filterVisibleAccounts(accounts);
      const targetIndex = eligibleAccounts.findIndex((account) => getAccountExpandKey(account) === jumpAccount);
      if (targetIndex >= 0) {
        visiblePlayerCount = Math.max(visiblePlayerCount, targetIndex + 1);
      }

      activeExpandedAccountKey = jumpAccount;
      expandedAccounts = new Set([jumpAccount]);
      showingAllPlayerGames = false;
      activeExpandedPlayerGameKey = jumpGame || null;
      render();
    });
  });
}

function renderPlayerGameActions(totalGames) {
  if (!playerGamesActionsElement) {
    return;
  }

  if (!totalGames) {
    playerGamesActionsElement.innerHTML = "";
    return;
  }

  const shownCount = showingAllPlayerGames
    ? totalGames
    : Math.min(PLAYER_GAME_LIMIT, totalGames);

  if (totalGames <= PLAYER_GAME_LIMIT) {
    playerGamesActionsElement.innerHTML = `
      <span class="stats-panel-note">Showing all ${totalGames} player games.</span>
    `;
    return;
  }

  if (showingAllPlayerGames) {
    playerGamesActionsElement.innerHTML = `
      <span class="stats-panel-note">Showing all ${totalGames} player games.</span>
      <button class="stats-load-more" id="statsPlayerGamesShowLess" type="button">Show less</button>
    `;

    const showLessButton = playerGamesActionsElement.querySelector("#statsPlayerGamesShowLess");
    if (!showLessButton) {
      return;
    }

    showLessButton.addEventListener("click", () => {
      showingAllPlayerGames = false;
      render();
    });
    return;
  }

  playerGamesActionsElement.innerHTML = `
    <span class="stats-panel-note">Showing latest ${shownCount} of ${totalGames} player games.</span>
    <button class="stats-load-more" id="statsPlayerGamesShowAll" type="button">Show all (${totalGames})</button>
  `;

  const showAllButton = playerGamesActionsElement.querySelector("#statsPlayerGamesShowAll");
  if (!showAllButton) {
    return;
  }

  showAllButton.addEventListener("click", () => {
    showingAllPlayerGames = true;
    render();
  });
}

function renderMatchup(game, options = {}) {
  const {
    variant = "chips",
    includeGlobalRank = false,
    showVersus = true,
    highlightedAccountKey = "",
    clickablePlayerTiles = false,
    currentGameKey = ""
  } = options;
  const teams = game.teams.filter((team) => team.players.length);
  if (!teams.length) {
    return `<span class="stats-note">Player list unavailable.</span>`;
  }
  const teamStrengths = teams.map((team) => getTeamStrengthPercent(team));

  const renderPlayerLabel = (player) => {
    const playerName = player.account?.name || "Unknown";
    const rankSuffix = includeGlobalRank ? ` [${getGlobalRankLabel(player.account)}]` : "";
    return `${escapeHtml(playerName)}${escapeHtml(rankSuffix)}`;
  };

  if (variant === "tiles") {
    return `
      <div class="stats-matchup-list stats-matchup-list-tiles">
        ${teams.map((team, index) => {
          const strengthPercent = teamStrengths[index];
          return `
          <div class="stats-team-grid">
            ${team.players
              .map((player) => {
                const isHighlighted = highlightedAccountKey
                  && player.account
                  && getAccountExpandKey(player.account) === highlightedAccountKey;
                const jumpAccount = clickablePlayerTiles && player.account
                  ? getAccountExpandKey(player.account)
                  : "";
                const tileTag = jumpAccount ? "button" : "span";
                const tileAttrs = jumpAccount
                  ? `type="button" data-jump-account="${escapeHtml(jumpAccount)}" data-jump-game="${escapeHtml(currentGameKey)}"`
                  : "";
                return `
                <${tileTag} class="stats-team-tile ${getTeamToneClass(team.userType)}${isHighlighted ? " is-current-player" : ""}${jumpAccount ? " is-clickable-player" : ""}" ${tileAttrs}>
                  ${renderPlayerLabel(player)}
                </${tileTag}>
              `;
              })
              .join("")}
            <span class="stats-team-strength ${getTeamStrengthToneClass(strengthPercent, teamStrengths)}">
              Team power: ${escapeHtml(Number.isFinite(strengthPercent) ? `${strengthPercent}%` : "N/A")}
            </span>
          </div>
        `;
        }).join("")}
      </div>
    `;
  }

  return `
    <div class="stats-matchup-list">
      ${teams.map((team, index) => {
        const vsLabel = showVersus && index < teams.length - 1 ? `<span class="stats-versus">vs</span>` : "";
        return `
          <span class="stats-team ${getTeamToneClass(team.userType)}">
            ${team.players
              .map((player) => `<span class="stats-team-player">${renderPlayerLabel(player)}</span>`)
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
    .filter(({ account }) => matchesPlayerSearch(account, searchQuery))
    .sort(compareRankRows);
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
                      <span class="stats-name-copy">
                        <span class="stats-name-text">${escapeHtml(name)}</span>
                        <sup class="stats-name-count">${count}</sup>
                      </span>
                      <button
                        class="stats-copy-action"
                        type="button"
                        data-copy-value="${escapeHtml(name)}"
                        aria-label="Copy alias ${escapeHtml(name)}"
                      >
                        Copy
                      </button>
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
                  .map((publicKey) => `
                    <div class="stats-key-item">
                      <code class="stats-key-value">${escapeHtml(publicKey)}</code>
                      <button
                        class="stats-copy-action"
                        type="button"
                        data-copy-value="${escapeHtml(publicKey)}"
                        aria-label="Copy public key"
                      >
                        Copy
                      </button>
                    </div>
                  `)
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
      resetPlayerGamesView();
    } else {
      expandedAccounts = new Set([expandAccount]);
      activeExpandedAccountKey = expandAccount;
      resetPlayerGamesView();
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

  bindCopyButtons(ranksElement);

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
  const filteredGames = gameList
    .filter((game) => matchesRecentGameSearch(game, searchQuery))
    .sort(compareMatches);
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

function render() {
  if (!runtime.gather || !runtime.calculate || !runtime.filterGame) {
    updateStatusText([]);
    updateSortIndicators();
    syncStateToUrl();
    return;
  }

  if (!resultsData.results.length) {
    updateStatusText([]);
    leaderboardGameCounts = new Map();
    globalRankMap = new Map();
    renderButtons();
    renderSummary([], []);
    renderPlayerGames(renderRanks([]));
    renderMatches([]);
    updateSortIndicators();
    syncStateToUrl();
    return;
  }

  const {
    accounts: globalAccounts,
    games: globalGames
  } = runtime.gather(
    resultsData.results,
    playerPublicKeys,
    function* includeAllGames(allGames) {
      yield* allGames;
    }
  );

  runtime.calculate(globalGames);

  const allGames = [...globalGames];
  const globalAccountList = sortAccounts(globalAccounts.values());
  globalRankMap = buildGlobalRankMap(globalAccountList);

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
  renderRanks(accountList);
  renderPlayerGames(accountList);
  renderMatches(gameList);
  updateSortIndicators();
  syncStateToUrl();
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
        resetPlayerGamesView();
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

window.addEventListener("popstate", () => {
  applyStateFromUrl();
  render();
});

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
  applyStateFromUrl();
  setupSortHeaders();

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
