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
const WZSTATS_LEADERBOARDS_URL = new URL("./published/leaderboards.json", import.meta.url);
const INITIAL_PLAYER_LIMIT = 20;
const PLAYER_LIMIT_STEP = 100;
const INITIAL_MATCH_LIMIT = 30;
const MATCH_LIMIT_STEP = 30;
const PLAYER_GAME_LIMIT = 20;
const AUTO_REFRESH_MS = 5 * 60_000;
const STALE_MIRROR_MS = 20 * 60_000;
const PLAYER_ACTIVITY_WINDOW_MS = 30 * 24 * 60 * 60_000;
const COMPACT_COMPARISON_PARAM = "C";
const COMPACT_PLAYER_PARAM = "p";
const RATE_SORT_MIN_GAMES = 10;
const HIDDEN_LEADERBOARDS = new Set(["NTW >= 6 Players", "1v1 High Oil"]);
const SORT_DEFAULTS = {
  ranks: { key: "rank", direction: "asc" },
  "player-games": { key: "date", direction: "desc" },
  matches: { key: "date", direction: "desc" }
};
const SORT_ALLOWED_KEYS = {
  ranks: new Set(["rank", "player", "elo", "matches", "wins", "losses", "draws", "crashes", "winRate", "lossRate", "drawRate", "crashRate"]),
  "player-games": new Set(["date", "map", "result", "duration", "replay"]),
  matches: new Set(["date", "map", "players", "duration", "replay"])
};
const SORT_DEFAULT_DIRECTIONS = {
  ranks: {
    rank: "asc",
    player: "asc",
    elo: "desc",
    matches: "desc",
    wins: "desc",
    losses: "desc",
    draws: "desc",
    crashes: "desc",
    winRate: "desc",
    lossRate: "desc",
    drawRate: "desc",
    crashRate: "desc"
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
  Crash: 2,
  Draw: 3,
  Won: 4
};

const statusElement = document.getElementById("resultsStatus");
const summaryElement = document.getElementById("statsSummary");
const buttonsElement = document.getElementById("statsLeaderboardButtons");
const ranksElement = document.getElementById("statsRanks");
const rankActionsElement = document.getElementById("statsRanksActions");
const playerGamesTitleElement = document.getElementById("statsPlayerGamesTitle");
const playerGamesMetaElement = document.getElementById("statsPlayerGamesMeta");
const playerProfileElement = document.getElementById("statsPlayerProfile");
const playerComparisonElement = document.getElementById("statsPlayerComparison");
const playerGamesElement = document.getElementById("statsPlayerGames");
const playerGamesActionsElement = document.getElementById("statsPlayerGamesActions");
const playerSearchElement = document.getElementById("statsPlayerSearch");
const matchesSearchElement = document.getElementById("statsMatchesSearch");
const matchesElement = document.getElementById("statsMatches");
const matchesActionsElement = document.getElementById("statsMatchesActions");
const matchFiltersElement = document.getElementById("statsMatchFilters");
const matchFilterCountElement = document.getElementById("statsMatchFilterCount");
const matchesDateFromElement = document.getElementById("statsMatchesDateFrom");
const matchesDateToElement = document.getElementById("statsMatchesDateTo");
const matchesMapElement = document.getElementById("statsMatchesMap");
const matchesMinDurationElement = document.getElementById("statsMatchesMinDuration");
const matchesMaxDurationElement = document.getElementById("statsMatchesMaxDuration");
const matchesMinPlayersElement = document.getElementById("statsMatchesMinPlayers");
const matchesMaxPlayersElement = document.getElementById("statsMatchesMaxPlayers");
const matchesMinPowerGapElement = document.getElementById("statsMatchesMinPowerGap");
const matchesUpsetsOnlyElement = document.getElementById("statsMatchesUpsetsOnly");
const sortHeaderElements = [...document.querySelectorAll("[data-sort-table][data-sort-key]")];

let selectedLeaderboard = "Global";
let resultsData = { format: 0, results: [] };
let leaderboardData = null;
let leaderboardDataSignature = "";
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
let visibleMatchCount = INITIAL_MATCH_LIMIT;
let playerSearchQuery = "";
let matchesSearchQuery = "";
let matchesDateFrom = "";
let matchesDateTo = "";
let matchesMap = "";
let matchesMinDuration = "";
let matchesMaxDuration = "";
let matchesMinPlayers = "";
let matchesMaxPlayers = "";
let matchesMinPowerGap = "";
let matchesUpsetsOnly = false;
let comparePlayerAKey = null;
let comparePlayerBKey = null;
let comparisonShareKeyByAccountKey = new Map();
let matchMapOptionsSignature = "";
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
const allTeamsLostDrawCache = new WeakMap();
const accountDisplayStatsCache = new WeakMap();

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
  if (table === "ranks" && key === "record") {
    return {
      key: "wins",
      direction: direction === "asc" ? "asc" : "desc"
    };
  }
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
  sortHeaderElements.forEach((sortTarget) => {
    const table = sortTarget.dataset.sortTable;
    const key = sortTarget.dataset.sortKey;
    const sortState = getSortState(table);
    const isActive = sortState.key === key;
    const button = sortTarget.matches(".stats-sort-button")
      ? sortTarget
      : sortTarget.querySelector(".stats-sort-button");
    const header = sortTarget.matches("th") ? sortTarget : sortTarget.closest("th");

    if (sortTarget.matches("th")) {
      sortTarget.setAttribute(
        "aria-sort",
        isActive
          ? (sortState.direction === "asc" ? "ascending" : "descending")
          : "none"
      );
    } else if (button) {
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    }

    if (!button) {
      return;
    }

    button.classList.toggle("is-active", isActive);
    button.dataset.direction = isActive ? sortState.direction : "";
    if (!sortTarget.matches("th") && header && !header.hasAttribute("data-sort-key")) {
      if (isActive) {
        header.setAttribute("aria-sort", sortState.direction === "asc" ? "ascending" : "descending");
      } else if (![...header.querySelectorAll(".stats-sort-button[data-direction]")].some((item) => item.dataset.direction)) {
        header.setAttribute("aria-sort", "none");
      }
    }
  });
}

function setupSortHeaders() {
  sortHeaderElements.forEach((sortTarget) => {
    const button = sortTarget.matches(".stats-sort-button")
      ? sortTarget
      : sortTarget.querySelector(".stats-sort-button");
    if (!button || button.dataset.sortBound === "true") {
      return;
    }

    button.dataset.sortBound = "true";
    button.addEventListener("click", () => {
      const table = sortTarget.dataset.sortTable;
      const key = sortTarget.dataset.sortKey;
      if (!table || !key) {
        return;
      }

      const currentSort = getSortState(table);
      const defaultDirection = getDefaultSortDirection(table, key);
      const defaultSort = cloneSortState(SORT_DEFAULTS[table] || SORT_DEFAULTS.ranks);
      const nextSort = currentSort.key === key
        ? (
            currentSort.direction === defaultDirection
              ? {
                  key,
                  direction: currentSort.direction === "asc" ? "desc" : "asc"
                }
              : defaultSort
          )
        : {
            key,
            direction: defaultDirection
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

async function ensureLeaderboardData(force = false) {
  const payload = await readJson(
    WZSTATS_LEADERBOARDS_URL,
    force ? Date.now().toString() : "leaderboards",
    force
  );
  const signature = `${payload.generatedAt || ""}:${payload.coverage?.attributedMatches || 0}`;
  if (!force && signature === leaderboardDataSignature) {
    return false;
  }
  if (!payload.leaderboards || !Array.isArray(payload.games)) {
    throw new Error("Published leaderboard data is incomplete.");
  }
  leaderboardData = payload;
  leaderboardDataSignature = signature;
  runtime.leaderboards = Object.keys(payload.leaderboards);
  ensureSelectedLeaderboard();
  renderButtons();
  return true;
}

function hydratePublishedBoard(name) {
  const board = leaderboardData?.leaderboards?.[name];
  if (!board) {
    return { accounts: new Map(), games: [] };
  }

  const accounts = new Map((board.players || []).map((player) => [String(player.id), {
    mainPublicKey: player.mainPublicKey || null,
    publicKeys: new Set(player.publicKeys || []),
    name: player.name || "Unknown",
    names: new Map(Object.entries(player.names || { [player.name || "Unknown"]: 1 })),
    bot: Boolean(player.bot),
    games: [],
    elo: Number(player.elo || 1500),
    winCount: Number(player.wins || 0),
    loseCount: Number(player.losses || 0),
    drawCount: Number(player.draws || 0),
    totalKills: Number(player.totalKills || 0),
    discounted: Boolean(player.discounted)
  }]));
  const gameIds = new Set(board.gameIds || []);
  const ratingEvents = board.ratingEvents || {};
  const games = (leaderboardData.games || [])
    .filter((game) => gameIds.has(game.id))
    .map((publishedGame) => {
      const slots = (publishedGame.slots || []).map((slot) => {
        let account = accounts.get(String(slot.id));
        if (!account) {
          account = {
            mainPublicKey: null, publicKeys: new Set(), name: slot.name || "Unknown",
            names: new Map([[slot.name || "Unknown", 1]]), bot: true, games: [],
            elo: 1500, winCount: 0, loseCount: 0, drawCount: 0, totalKills: 0, discounted: true
          };
          accounts.set(String(slot.id), account);
        }
        const rating = ratingEvents[publishedGame.id]?.[String(slot.id)];
        return {
          position: Number(slot.position || 0), team: Number(slot.team || 0),
          userType: slot.userType || null, account,
          elo: rating && Number.isFinite(Number(rating.elo)) ? Number(rating.elo) : null,
          eloDelta: rating && Number.isFinite(Number(rating.eloDelta)) ? Number(rating.eloDelta) : null
        };
      });
      const teamsByNumber = new Map();
      slots.forEach((slot) => {
        if (!teamsByNumber.has(slot.team)) {
          teamsByNumber.set(slot.team, { userType: null, slots: [], players: [] });
        }
        const team = teamsByNumber.get(slot.team);
        team.slots.push(slot);
        if (["winner", "loser", "contender"].includes(slot.userType)) team.players.push(slot);
      });
      const teams = [...teamsByNumber.values()];
      teams.forEach((team) => {
        const types = [...new Set(team.players.map((slot) => slot.userType))];
        team.userType = types.length === 1 ? types[0] : null;
      });
      const game = {
        ...publishedGame,
        endDate: Number(publishedGame.endDate || 0),
        duration: Number(publishedGame.duration || 0),
        alliancesType: Number(publishedGame.alliancesType || 0),
        slots,
        players: slots.filter((slot) => ["winner", "loser", "contender"].includes(slot.userType)),
        teams
      };
      slots.forEach((slot) => slot.account.games.push(game));
      return game;
    });
  return { accounts, games };
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
    visibleMatchCount = INITIAL_MATCH_LIMIT;
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
  const compactComparisonKeys = parseCompactComparisonValue(
    url.searchParams.get(COMPACT_COMPARISON_PARAM)
  );
  selectedLeaderboard = url.searchParams.get("leaderboard") || "Global";
  visibleMatchCount = INITIAL_MATCH_LIMIT;
  visiblePlayerCount = Math.max(
    INITIAL_PLAYER_LIMIT,
    parsePositiveInteger(url.searchParams.get("players"), INITIAL_PLAYER_LIMIT)
  );
  playerSearchQuery = url.searchParams.get("playerSearch") || "";
  matchesSearchQuery = url.searchParams.get("matchesSearch") || "";
  matchesDateFrom = url.searchParams.get("matchesFrom") || "";
  matchesDateTo = url.searchParams.get("matchesTo") || "";
  matchesMap = url.searchParams.get("matchesMap") || "";
  matchesMinDuration = url.searchParams.get("matchesMinMinutes") || "";
  matchesMaxDuration = url.searchParams.get("matchesMaxMinutes") || "";
  matchesMinPlayers = url.searchParams.get("matchesMinPlayers") || "";
  matchesMaxPlayers = url.searchParams.get("matchesMaxPlayers") || "";
  matchesMinPowerGap = url.searchParams.get("matchesMinPowerGap") || "";
  matchesUpsetsOnly = url.searchParams.get("matchesUpsets") === "1";
  comparePlayerAKey = compactComparisonKeys?.[0]
    || url.searchParams.get("a")
    || url.searchParams.get("compareA")
    || null;
  comparePlayerBKey = compactComparisonKeys?.[1]
    || url.searchParams.get("b")
    || url.searchParams.get("compareB")
    || null;
  activeExpandedAccountKey = parseCompactPlayerValue(url.searchParams.get(COMPACT_PLAYER_PARAM))
    || url.searchParams.get("player")
    || null;
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

  [
    [matchesDateFromElement, matchesDateFrom],
    [matchesDateToElement, matchesDateTo],
    [matchesMapElement, matchesMap],
    [matchesMinDurationElement, matchesMinDuration],
    [matchesMaxDurationElement, matchesMaxDuration],
    [matchesMinPlayersElement, matchesMinPlayers],
    [matchesMaxPlayersElement, matchesMaxPlayers],
    [matchesMinPowerGapElement, matchesMinPowerGap]
  ].forEach(([element, value]) => {
    if (element) {
      element.value = value;
    }
  });

  if (matchesUpsetsOnlyElement) {
    matchesUpsetsOnlyElement.checked = matchesUpsetsOnly;
  }

  if (matchFiltersElement && getActiveMatchFilterCount()) {
    matchFiltersElement.open = true;
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

  [
    ["matchesFrom", matchesDateFrom],
    ["matchesTo", matchesDateTo],
    ["matchesMap", matchesMap],
    ["matchesMinMinutes", matchesMinDuration],
    ["matchesMaxMinutes", matchesMaxDuration],
    ["matchesMinPlayers", matchesMinPlayers],
    ["matchesMaxPlayers", matchesMaxPlayers],
    ["matchesMinPowerGap", matchesMinPowerGap]
  ].forEach(([key, value]) => {
    if (matchesElement && String(value || "").trim()) {
      params.set(key, String(value).trim());
    }
  });

  if (matchesElement && matchesUpsetsOnly) {
    params.set("matchesUpsets", "1");
  }

  if (ranksElement && activeExpandedAccountKey) {
    const compactPlayerKey = /^p[a-z0-9]+$/i.test(activeExpandedAccountKey)
      ? activeExpandedAccountKey
      : getCompactAccountKey(activeExpandedAccountKey);
    params.set(COMPACT_PLAYER_PARAM, compactPlayerKey.replace(/^p/, ""));
  }

  if (playerComparisonElement && comparePlayerAKey && comparePlayerBKey) {
    setCompactComparisonParams(params, comparePlayerAKey, comparePlayerBKey);
  } else {
    if (playerComparisonElement && comparePlayerAKey) {
      params.set("a", comparisonShareKeyByAccountKey.get(comparePlayerAKey) || comparePlayerAKey);
    }

    if (playerComparisonElement && comparePlayerBKey) {
      params.set("b", comparisonShareKeyByAccountKey.get(comparePlayerBKey) || comparePlayerBKey);
    }
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
  const displayStats = getAccountDisplayStats(account);
  if (account.mainPublicKey) {
    return `main:${account.mainPublicKey}`;
  }

  const publicKeys = [...account.publicKeys].sort();
  if (publicKeys.length) {
    return `keys:${publicKeys.join("|")}`;
  }

  return `name:${account.name || "unknown"}:${account.games.length}:${displayStats.wins}:${displayStats.losses}:${displayStats.draws}:${displayStats.crashes}`;
}

function getCompactAccountKey(accountKey) {
  let firstHash = 2166136261;
  let secondHash = 2246822519;

  for (let index = 0; index < accountKey.length; index += 1) {
    const characterCode = accountKey.charCodeAt(index);
    firstHash = Math.imul(firstHash ^ characterCode, 16777619);
    secondHash = Math.imul(secondHash ^ characterCode, 3266489917);
  }

  return `p${(firstHash >>> 0).toString(36)}${(secondHash >>> 0).toString(36)}`;
}

function parseCompactPlayerValue(value) {
  const token = String(value || "").trim();
  if (!/^[a-z0-9]+$/i.test(token)) {
    return null;
  }

  return `p${token}`;
}

function resolveActivePlayerShareKey(accountList) {
  if (!/^p[a-z0-9]+$/i.test(activeExpandedAccountKey || "")) {
    return;
  }

  const matches = accountList.filter((account) => (
    getCompactAccountKey(getAccountExpandKey(account)) === activeExpandedAccountKey
  ));
  if (matches.length !== 1) {
    return;
  }

  activeExpandedAccountKey = getAccountExpandKey(matches[0]);
  expandedAccounts = new Set([activeExpandedAccountKey]);
}

function parseCompactComparisonValue(value) {
  const tokens = String(value || "").split(".");
  if (tokens.length !== 2 || tokens.some((token) => !/^[a-z0-9]+$/i.test(token))) {
    return null;
  }

  return tokens.map((token) => `p${token}`);
}

function setCompactComparisonParams(params, accountAKey, accountBKey) {
  const getToken = (accountKey) => (
    comparisonShareKeyByAccountKey.get(accountKey) || getCompactAccountKey(accountKey)
  ).replace(/^p/, "");
  params.set(COMPACT_COMPARISON_PARAM, `${getToken(accountAKey)}.${getToken(accountBKey)}`);
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

function getPlayerPowerLabel(account) {
  const totalRankedPlayers = globalRankMap.size;
  const rank = getNumericGlobalRank(account);
  if (!totalRankedPlayers || !rank) {
    return "50%";
  }

  return `${Math.round(((totalRankedPlayers - rank + 1) / totalRankedPlayers) * 100)}%`;
}

function getTeamStrengthPercent(team) {
  const totalRankedPlayers = globalRankMap.size;
  if (!totalRankedPlayers || !team.players.length) {
    return null;
  }

  const strengthScore = team.players.reduce((total, player) => {
    const rank = getNumericGlobalRank(player.account);
    if (!rank) {
      return total + 0.5;
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

function hasBalancedTeams(game) {
  const teams = Array.isArray(game?.teams) ? game.teams : [];
  if (!teams.length) {
    return false;
  }

  let smallestTeam = null;
  let biggestTeam = null;
  for (const team of teams) {
    if (!smallestTeam || team.players.length < smallestTeam.players.length) {
      smallestTeam = team;
    }
    if (!biggestTeam || team.players.length > biggestTeam.players.length) {
      biggestTeam = team;
    }
  }

  return Boolean(smallestTeam && biggestTeam)
    && smallestTeam.players.length === biggestTeam.players.length;
}

function shouldTreatAllTeamsLostAsDraw(game) {
  if (!game || typeof game !== "object") {
    return false;
  }

  if (allTeamsLostDrawCache.has(game)) {
    return allTeamsLostDrawCache.get(game);
  }

  const teams = Array.isArray(game.teams)
    ? game.teams.filter((team) => Array.isArray(team.players) && team.players.length)
    : [];
  const shouldTreatAsDraw = teams.length > 1
    && !game.cheated
    && Number(game.duration || 0) >= 3 * 60 * 1000
    && hasBalancedTeams(game)
    && teams.every((team) => team.userType === "loser");

  allTeamsLostDrawCache.set(game, shouldTreatAsDraw);
  return shouldTreatAsDraw;
}

function getNormalizedTeamUserType(game, team) {
  if (shouldTreatAllTeamsLostAsDraw(game) && Array.isArray(team?.players) && team.players.length) {
    return "neutral";
  }

  return team?.userType || null;
}

function getAccountDisplayStats(account) {
  if (!account || typeof account !== "object") {
    return { wins: 0, losses: 0, draws: 0, crashes: 0 };
  }

  if (accountDisplayStatsCache.has(account)) {
    return accountDisplayStatsCache.get(account);
  }

  const crashCount = (account.games || []).reduce(
    (count, game) => count + (shouldTreatAllTeamsLostAsDraw(game) ? 1 : 0),
    0
  );
  const displayStats = {
    wins: account.winCount || 0,
    losses: account.loseCount || 0,
    draws: account.drawCount || 0,
    crashes: crashCount
  };

  accountDisplayStatsCache.set(account, displayStats);
  return displayStats;
}

function getPlayerGameOutcome(game, account) {
  const slot = game.players.find((playerSlot) => playerSlot.account === account)
    || (game.slots || []).find((playerSlot) => playerSlot.account === account);
  if (shouldTreatAllTeamsLostAsDraw(game) && slot?.userType === "loser") {
    return { label: "Crash", className: "is-crash" };
  }

  const userType = slot?.userType;

  switch (userType) {
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
  const displayStats = getAccountDisplayStats(account);
  const totalGames = getAccountRankedGameCount(account) || 1;
  return ((displayStats.wins * 3) + displayStats.draws) / totalGames;
}

function getAccountRankedGameCount(account) {
  const displayStats = getAccountDisplayStats(account);
  return displayStats.wins + displayStats.losses + displayStats.draws;
}

function getAccountDisplayGameCount(account) {
  const displayStats = getAccountDisplayStats(account);
  return displayStats.wins + displayStats.losses + displayStats.draws + displayStats.crashes;
}

function getRankResultRate(account, type) {
  const displayStats = getAccountDisplayStats(account);
  const totalGames = getAccountDisplayGameCount(account);
  if (totalGames <= 0) {
    return 0;
  }

  switch (type) {
    case "winRate":
      return displayStats.wins / totalGames;
    case "lossRate":
      return displayStats.losses / totalGames;
    case "drawRate":
      return displayStats.draws / totalGames;
    case "crashRate":
      return displayStats.crashes / totalGames;
    default:
      return 0;
  }
}

function formatRecordPercentage(value, totalGames) {
  if (!Number.isFinite(totalGames) || totalGames <= 0) {
    return "0%";
  }

  return `${Math.round((value / totalGames) * 100)}%`;
}

function compareRankRateRows(left, right, type, direction) {
  const leftGames = getAccountDisplayGameCount(left.account);
  const rightGames = getAccountDisplayGameCount(right.account);
  const leftEligible = leftGames >= RATE_SORT_MIN_GAMES ? 1 : 0;
  const rightEligible = rightGames >= RATE_SORT_MIN_GAMES ? 1 : 0;
  const leftStats = getAccountDisplayStats(left.account);
  const rightStats = getAccountDisplayStats(right.account);

  return compareNumberValues(rightEligible, leftEligible)
    || applySortDirection(
      compareNumberValues(
        getRankResultRate(left.account, type),
        getRankResultRate(right.account, type)
      ),
      direction
    )
    || compareNumberValues(leftGames, rightGames)
    || compareNumberValues(leftStats.wins, rightStats.wins)
    || compareNumberValues(rightStats.losses, leftStats.losses)
    || compareNumberValues(leftStats.draws, rightStats.draws)
    || compareNumberValues(rightStats.crashes, leftStats.crashes)
    || compareNumberValues(left.rank, right.rank);
}

function compareRankRows(left, right) {
  const leftStats = getAccountDisplayStats(left.account);
  const rightStats = getAccountDisplayStats(right.account);
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
    case "wins":
      result = compareNumberValues(leftStats.wins, rightStats.wins)
        || compareNumberValues(getRankRecordScore(left.account), getRankRecordScore(right.account))
        || compareNumberValues(rightStats.losses, leftStats.losses)
        || compareNumberValues(leftStats.draws, rightStats.draws)
        || compareNumberValues(rightStats.crashes, leftStats.crashes)
        || compareNumberValues(left.rank, right.rank);
      break;
    case "losses":
      result = compareNumberValues(leftStats.losses, rightStats.losses)
        || compareNumberValues(rightStats.wins, leftStats.wins)
        || compareNumberValues(leftStats.draws, rightStats.draws)
        || compareNumberValues(rightStats.crashes, leftStats.crashes)
        || compareNumberValues(left.rank, right.rank);
      break;
    case "draws":
      result = compareNumberValues(leftStats.draws, rightStats.draws)
        || compareNumberValues(leftStats.wins, rightStats.wins)
        || compareNumberValues(rightStats.losses, leftStats.losses)
        || compareNumberValues(rightStats.crashes, leftStats.crashes)
        || compareNumberValues(left.rank, right.rank);
      break;
    case "crashes":
      result = compareNumberValues(leftStats.crashes, rightStats.crashes)
        || compareNumberValues(leftStats.draws, rightStats.draws)
        || compareNumberValues(leftStats.wins, rightStats.wins)
        || compareNumberValues(rightStats.losses, leftStats.losses)
        || compareNumberValues(left.rank, right.rank);
      break;
    case "winRate":
      return compareRankRateRows(left, right, "winRate", rankSortState.direction);
    case "lossRate":
      return compareRankRateRows(left, right, "lossRate", rankSortState.direction);
    case "drawRate":
      return compareRankRateRows(left, right, "drawRate", rankSortState.direction);
    case "crashRate":
      return compareRankRateRows(left, right, "crashRate", rankSortState.direction);
    case "record":
      result = compareNumberValues(getRankRecordScore(left.account), getRankRecordScore(right.account))
        || compareNumberValues(leftStats.wins, rightStats.wins)
        || compareNumberValues(rightStats.losses, leftStats.losses)
        || compareNumberValues(leftStats.draws, rightStats.draws)
        || compareNumberValues(rightStats.crashes, leftStats.crashes)
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

  const hintElement = button.querySelector(".stats-copy-hint");
  const defaultText = button.dataset.copyDefault || "Click to copy";
  if (hintElement) {
    hintElement.textContent = defaultText;
  }

  try {
    await navigator.clipboard.writeText(value);
    button.classList.add("is-copied");
    button.classList.remove("is-failed");
    if (hintElement) {
      hintElement.textContent = "Copied";
    }
  } catch (error) {
    button.classList.add("is-failed");
    button.classList.remove("is-copied");
    if (hintElement) {
      hintElement.textContent = "Copy failed";
    }
  }

  window.clearTimeout(button.copyResetTimer);
  button.classList.add("is-feedback-visible");
  button.copyResetTimer = window.setTimeout(() => {
    button.classList.remove("is-copied", "is-failed", "is-feedback-visible");
    if (hintElement) {
      hintElement.textContent = defaultText;
    }
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
          includePlayerPower: true,
          showVersus: false,
          highlightedAccountKey: activeAccount ? getAccountExpandKey(activeAccount) : "",
          clickablePlayerTiles: true,
          currentGameKey: getPlayerGameKey(game)
        })}
      </div>
    </div>
  `;
}

function getAccountGameSlot(game, account) {
  return (game.players || []).find((slot) => slot.account === account)
    || (game.slots || []).find((slot) => slot.account === account)
    || null;
}

function getCountedFavorites(values, limit = 3) {
  const counts = new Map();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit);
}

function formatPlayerMode(game) {
  const teamSizes = (game.teams || [])
    .map((team) => (team.players || []).length)
    .filter((size) => size > 0);
  if (teamSizes.length > 1 && teamSizes.every((size) => size === 1)) {
    return "FFA";
  }
  if (teamSizes.length > 1 && teamSizes.every((size) => size === teamSizes[0])) {
    return teamSizes.join("v");
  }
  return formatAlliance(game);
}

function getAccountEloHistory(account) {
  const points = [...account.games]
    .sort((left, right) => Number(left.endDate || 0) - Number(right.endDate || 0))
    .map((game) => {
      const slot = getAccountGameSlot(game, account);
      if (!Number.isFinite(slot?.elo)) {
        return null;
      }
      const delta = Number.isFinite(slot.eloDelta) ? slot.eloDelta : 0;
      return {
        date: Number(game.endDate || 0),
        value: slot.elo + delta
      };
    })
    .filter(Boolean);

  if (!account.discounted && Number.isFinite(account.elo)) {
    const lastPoint = points.at(-1);
    if (!lastPoint || Math.abs(lastPoint.value - account.elo) > 0.005) {
      points.push({ date: Number(lastPoint?.date || Date.now()), value: account.elo });
    }
  }

  return points;
}

function getCurrentWinStreak(account) {
  const games = [...(account?.games || [])]
    .sort((left, right) => Number(right.endDate || 0) - Number(left.endDate || 0));
  let streak = 0;
  for (const game of games) {
    if (getPlayerGameOutcome(game, account).label !== "Won") {
      break;
    }
    streak += 1;
  }
  return streak;
}

function filterRecentlyActiveAccounts(accountList, gameList = []) {
  let latestGameTimestamp = gameList.reduce((latest, game) => (
    Math.max(latest, Number(game?.endDate || 0))
  ), 0);

  if (!latestGameTimestamp) {
    latestGameTimestamp = accountList.reduce((latest, account) => (
      Math.max(
        latest,
        ...(account?.games || []).map((game) => Number(game?.endDate || 0))
      )
    ), 0);
  }

  const activityCutoff = latestGameTimestamp - PLAYER_ACTIVITY_WINDOW_MS;
  return accountList.filter((account) => (account?.games || []).some((game) => (
    Number(game?.endDate || 0) >= activityCutoff
  )));
}

function getRecentPlayerTrend(account, limit = 10) {
  const games = [...(account?.games || [])]
    .sort((left, right) => Number(right.endDate || 0) - Number(left.endDate || 0))
    .slice(0, limit);
  const wins = games.filter((game) => getPlayerGameOutcome(game, account).label === "Won").length;
  const eloGain = games.reduce((total, game) => {
    const slot = getAccountGameSlot(game, account);
    return total + (Number.isFinite(slot?.eloDelta) ? slot.eloDelta : 0);
  }, 0);
  const upsetWins = account.games.filter((game) => (
    isUpsetMatch(game) && getPlayerGameOutcome(game, account).label === "Won"
  )).length;
  return {
    games: games.length,
    wins,
    winRate: games.length ? (wins / games.length) * 100 : 0,
    eloGain,
    streak: getCurrentWinStreak(account),
    upsetWins
  };
}

function renderEloSparkline(points) {
  if (!points.length) {
    return '<p class="stats-profile-empty">Pulse Ratio begins after five ranked matches.</p>';
  }

  const width = 360;
  const height = 92;
  const inset = 7;
  const values = points.map((point) => point.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(1, maximum - minimum);
  const denominator = Math.max(1, points.length - 1);
  const coordinates = points.map((point, index) => {
    const x = inset + (index / denominator) * (width - inset * 2);
    const y = height - inset - ((point.value - minimum) / range) * (height - inset * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const latest = points.at(-1);

  return `
    <svg class="stats-profile-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Pulse Ratio from ${minimum.toFixed(0)} to ${maximum.toFixed(0)}">
      <polyline points="${coordinates}" vector-effect="non-scaling-stroke"></polyline>
    </svg>
    <div class="stats-profile-chart-scale">
      <span>${minimum.toFixed(0)}</span>
      <span>${formatShortDate(latest.date)}</span>
      <span>${maximum.toFixed(0)}</span>
    </div>
  `;
}

function getAccountOpponents(account) {
  const counts = new Map();
  account.games.forEach((game) => {
    const ownTeam = (game.teams || []).find((team) => (
      (team.players || []).some((slot) => slot.account === account)
    ));
    const opponents = ownTeam
      ? (game.teams || []).filter((team) => team !== ownTeam).flatMap((team) => team.players || [])
      : (game.players || []).filter((slot) => slot.account !== account);

    opponents.forEach((slot) => {
      if (!slot.account || slot.account === account) {
        return;
      }
      const key = getAccountExpandKey(slot.account);
      const current = counts.get(key) || { key, name: slot.account.name || "Unknown", count: 0 };
      current.count += 1;
      counts.set(key, current);
    });
  });

  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, 5);
}

function getAccountTeammates(account) {
  const counts = new Map();
  account.games.forEach((game) => {
    const ownTeam = (game.teams || []).find((team) => (
      (team.players || []).some((slot) => slot.account === account)
    ));

    (ownTeam?.players || []).forEach((slot) => {
      if (!slot.account || slot.account === account) {
        return;
      }
      const key = getAccountExpandKey(slot.account);
      const current = counts.get(key) || { key, name: slot.account.name || "Unknown", count: 0 };
      current.count += 1;
      counts.set(key, current);
    });
  });

  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, 5);
}

function renderProfileList(items, emptyLabel) {
  if (!items.length) {
    return `<span class="stats-profile-empty">${escapeHtml(emptyLabel)}</span>`;
  }
  return items.map(([label, count]) => (
    `<span class="stats-profile-chip">${escapeHtml(label)} <small>${count}</small></span>`
  )).join("");
}

function getMapMatchesUrl(mapName) {
  const mapUrl = new URL("index.html", window.location.href);
  const params = new URLSearchParams({
    matchesMap: mapName,
    tab: "recent-matches"
  });
  if (selectedLeaderboard !== "Global") {
    params.set("leaderboard", selectedLeaderboard);
  }
  mapUrl.search = params.toString();
  return mapUrl.href;
}

function renderMapFilterLink(mapName, label = mapName, className = "") {
  const linkClass = ["stats-map-filter-link", className].filter(Boolean).join(" ");
  return `<a class="${linkClass}" href="${escapeHtml(getMapMatchesUrl(mapName))}" target="_parent" aria-label="Show recent matches on ${escapeHtml(mapName)}">${escapeHtml(label)}</a>`;
}

function renderMapProfileLinks(items, emptyLabel) {
  if (!items.length) {
    return `<span class="stats-profile-empty">${escapeHtml(emptyLabel)}</span>`;
  }
  return items.map(([mapName, count]) => (
    `<a class="stats-map-filter-link stats-profile-chip stats-profile-compare-link" href="${escapeHtml(getMapMatchesUrl(mapName))}" target="_parent" aria-label="Show recent matches on ${escapeHtml(mapName)}">${escapeHtml(mapName)} <small>${count}</small></a>`
  )).join("");
}

function renderProfileComparisonLinks(account, items, emptyLabel) {
  if (!items.length) {
    return `<span class="stats-profile-empty">${escapeHtml(emptyLabel)}</span>`;
  }

  const accountKey = getAccountExpandKey(account);
  return items.map((item) => {
    const comparisonUrl = new URL("index.html", window.location.href);
    const params = new URLSearchParams();
    if (selectedLeaderboard !== "Global") {
      params.set("leaderboard", selectedLeaderboard);
    }
    setCompactComparisonParams(params, accountKey, item.key);
    comparisonUrl.search = params.toString();
    const comparisonLabel = `Compare ${account.name || "Unknown"} with ${item.name}`;
    return `<a class="stats-profile-chip stats-profile-compare-link" href="${escapeHtml(comparisonUrl.href)}" target="_parent" aria-label="${escapeHtml(comparisonLabel)}" title="${escapeHtml(comparisonLabel)}">${escapeHtml(item.name)} <small>${item.count}</small></a>`;
  }).join("");
}

function renderComparisonForm(account, limit = 8) {
  const outcomes = [...account.games]
    .sort((left, right) => Number(right.endDate || 0) - Number(left.endDate || 0))
    .slice(0, limit)
    .map((game) => getPlayerGameOutcome(game, account));

  if (!outcomes.length) {
    return '<span class="stats-profile-empty">No recent form</span>';
  }

  return `<span class="stats-comparison-form">${outcomes.map((outcome) => (
    `<i class="${outcome.className}" title="${escapeHtml(outcome.label)}">${escapeHtml(outcome.label.charAt(0))}</i>`
  )).join("")}</span>`;
}

function getComparisonAccountData(account) {
  const stats = getAccountDisplayStats(account);
  const gameCount = getAccountDisplayGameCount(account);
  return {
    elo: account.discounted ? "Provisional" : account.elo.toFixed(2),
    winRate: formatRecordPercentage(stats.wins, gameCount),
    form: renderComparisonForm(account),
    maps: getCountedFavorites(account.games.map((game) => game.mapName)),
    opponents: getAccountOpponents(account)
  };
}

function renderComparisonOpponentLinks(account, opponents, side) {
  if (!opponents.length) {
    return '<span class="stats-profile-empty">No opponents</span>';
  }

  const accountKey = getAccountExpandKey(account);
  return opponents.map((opponent) => {
    const comparisonUrl = new URL("index.html", window.location.href);
    const params = new URLSearchParams();
    setCompactComparisonParams(
      params,
      side === "A" ? accountKey : opponent.key,
      side === "A" ? opponent.key : accountKey
    );
    if (selectedLeaderboard !== "Global") {
      params.set("leaderboard", selectedLeaderboard);
    }
    comparisonUrl.search = params.toString();
    const comparisonLabel = `Compare ${account.name || "Unknown"} with ${opponent.name}`;
    return `<a class="stats-profile-chip stats-profile-compare-link" href="${escapeHtml(comparisonUrl.href)}" target="_parent" aria-label="${escapeHtml(comparisonLabel)}" title="${escapeHtml(comparisonLabel)}">${escapeHtml(opponent.name)} <small>${opponent.count}</small></a>`;
  }).join("");
}

function areAccountsOpponents(game, accountA, accountB) {
  const teamA = (game.teams || []).find((team) => (
    (team.players || []).some((slot) => slot.account === accountA)
  ));
  const teamB = (game.teams || []).find((team) => (
    (team.players || []).some((slot) => slot.account === accountB)
  ));

  return Boolean(teamA && teamB && teamA !== teamB);
}

function renderPlayerComparison(accounts) {
  if (!playerComparisonElement) {
    return;
  }

  const selectableAccounts = filterVisibleAccounts(accounts);
  const accountByKey = new Map(selectableAccounts.map((account) => [getAccountExpandKey(account), account]));
  comparisonShareKeyByAccountKey = new Map(
    selectableAccounts.map((account) => {
      const accountKey = getAccountExpandKey(account);
      return [accountKey, getCompactAccountKey(accountKey)];
    })
  );
  const accountKeyByShareKey = new Map(
    [...comparisonShareKeyByAccountKey].map(([accountKey, shareKey]) => [shareKey, accountKey])
  );
  const resolveComparisonKey = (value) => (
    accountByKey.has(value) ? value : accountKeyByShareKey.get(value) || null
  );
  const activeAccount = accountByKey.get(activeExpandedAccountKey);

  comparePlayerAKey = resolveComparisonKey(comparePlayerAKey);
  comparePlayerBKey = resolveComparisonKey(comparePlayerBKey);

  if (!accountByKey.has(comparePlayerAKey)) {
    comparePlayerAKey = activeAccount ? getAccountExpandKey(activeAccount) : null;
  }
  if (!accountByKey.has(comparePlayerBKey)) {
    comparePlayerBKey = null;
  }

  const accountA = accountByKey.get(comparePlayerAKey);
  const accountB = accountByKey.get(comparePlayerBKey);
  const comparisonShareUrl = new URL("index.html", window.location.href);
  const comparisonShareParams = buildStateParams();
  if (!comparisonShareParams.has(COMPACT_COMPARISON_PARAM)) {
    comparisonShareParams.set("tab", "compare");
  }
  comparisonShareUrl.search = comparisonShareParams.toString();
  const renderOptions = (selectedKey, excludedKey, searchValue = "") => {
    const searchQuery = normalizeSearchQuery(searchValue);
    const getPrimaryNamePriority = (account) => {
      const name = String(account.name || "").toLowerCase();
      if (!searchQuery || name === searchQuery) {
        return 0;
      }
      if (name.startsWith(searchQuery)) {
        return 1;
      }
      return name.includes(searchQuery) ? 2 : 3;
    };
    const matchingAccounts = selectableAccounts.filter((account) => {
      const key = getAccountExpandKey(account);
      return key === selectedKey || matchesPlayerSearch(account, searchQuery);
    }).sort((left, right) => getPrimaryNamePriority(left) - getPrimaryNamePriority(right));
    const hasSearchMatches = matchingAccounts.some((account) => (
      matchesPlayerSearch(account, searchQuery)
    ));
    return `
    <option value="">${searchQuery && !hasSearchMatches ? "No matching players" : "Select player"}</option>
    ${matchingAccounts.map((account) => {
      const key = getAccountExpandKey(account);
      const elo = account.discounted ? "provisional" : account.elo.toFixed(0);
      const isSearchMatch = matchesPlayerSearch(account, searchQuery);
      return `<option value="${escapeHtml(key)}" data-search-match="${isSearchMatch ? "true" : "false"}"${key === selectedKey ? " selected" : ""}${key === excludedKey ? " disabled" : ""}>${escapeHtml(account.name || "Unknown")} · ${elo} ELO</option>`;
    }).join("")}
  `;
  };

  let comparisonBody = '<p class="stats-comparison-empty">Select two players to compare their performance in this leaderboard slice.</p>';
  if (accountA && accountB && accountA !== accountB) {
    const dataA = getComparisonAccountData(accountA);
    const dataB = getComparisonAccountData(accountB);
    const headToHeadGames = accountA.games.filter((game) => areAccountsOpponents(game, accountA, accountB));
    const winsA = headToHeadGames.filter((game) => getPlayerGameOutcome(game, accountA).label === "Won").length;
    const winsB = headToHeadGames.filter((game) => getPlayerGameOutcome(game, accountB).label === "Won").length;
    const otherResults = Math.max(0, headToHeadGames.length - winsA - winsB);
    const winsAPercentage = headToHeadGames.length ? (winsA / headToHeadGames.length) * 100 : 0;
    const winsBPercentage = headToHeadGames.length ? (winsB / headToHeadGames.length) * 100 : 0;
    const otherPercentage = headToHeadGames.length ? (otherResults / headToHeadGames.length) * 100 : 0;
    const playerOneBarClass = winsA === winsB ? "is-tied" : winsA > winsB ? "is-winner" : "is-loser";
    const playerTwoBarClass = winsA === winsB ? "is-tied" : winsB > winsA ? "is-winner" : "is-loser";

    comparisonBody = `
      <div class="stats-comparison-grid">
        <strong>${escapeHtml(accountA.name || "Unknown")}</strong>
        <span class="stats-comparison-metric">Metric</span>
        <strong>${escapeHtml(accountB.name || "Unknown")}</strong>
        <span>${escapeHtml(dataA.elo)}</span><b>Current ELO</b><span>${escapeHtml(dataB.elo)}</span>
        <span>${escapeHtml(dataA.winRate)}</span><b>Win rate</b><span>${escapeHtml(dataB.winRate)}</span>
        <span>${dataA.form}</span><b>Recent form</b><span>${dataB.form}</span>
        <span class="stats-comparison-list">${renderMapProfileLinks(dataA.maps, "No map history")}</span><b>Favorite maps</b><span class="stats-comparison-list">${renderMapProfileLinks(dataB.maps, "No map history")}</span>
        <span class="stats-comparison-list">${renderComparisonOpponentLinks(accountA, dataA.opponents, "A")}</span><b>Top opponents</b><span class="stats-comparison-list">${renderComparisonOpponentLinks(accountB, dataB.opponents, "B")}</span>
      </div>
      <div class="stats-comparison-head-to-head">
        <span>Head to head</span>
        <div class="stats-comparison-head-to-head-result">
          <strong>${winsA} wins (${winsAPercentage.toFixed(0)}%) · ${otherResults} other (${otherPercentage.toFixed(0)}%) · ${winsB} wins (${winsBPercentage.toFixed(0)}%)</strong>
          <span class="stats-comparison-percentage-bar" role="img" aria-label="${escapeHtml(accountA.name || "Player one")} ${winsAPercentage.toFixed(0)} percent, other results ${otherPercentage.toFixed(0)} percent, ${escapeHtml(accountB.name || "Player two")} ${winsBPercentage.toFixed(0)} percent">
            <i class="${playerOneBarClass}" style="width: ${winsAPercentage}%"></i>
            <i class="is-other" style="width: ${otherPercentage}%"></i>
            <i class="${playerTwoBarClass}" style="width: ${winsBPercentage}%"></i>
          </span>
        </div>
        <small>${headToHeadGames.length} shared matches</small>
      </div>
    `;
  }

  playerComparisonElement.innerHTML = `
    <div class="stats-comparison-heading">
      <div><span class="stats-detail-label">Player comparison</span><strong>Compare two players</strong></div>
      ${accountA && accountB
        ? `<button class="stats-profile-share" type="button" data-comparison-url="${escapeHtml(comparisonShareUrl.href)}">Copy comparison link</button>`
        : "<small>Select two players to create a shareable link</small>"}
    </div>
    <div class="stats-comparison-selects">
      <div class="stats-comparison-picker">
        <span>Player one</span>
        <div class="stats-comparison-picker-controls">
          <div class="stats-comparison-search-wrap">
            <input id="statsCompareSearchA" type="search" placeholder="Search nickname or key" autocomplete="off" aria-label="Search player one" aria-controls="statsCompareSuggestionsA" aria-expanded="false">
            <div class="stats-comparison-suggestions" id="statsCompareSuggestionsA" role="listbox" hidden></div>
          </div>
          <select id="statsComparePlayerA" aria-label="Player one">${renderOptions(comparePlayerAKey, comparePlayerBKey)}</select>
        </div>
      </div>
      <span aria-hidden="true">VS</span>
      <div class="stats-comparison-picker">
        <span>Player two</span>
        <div class="stats-comparison-picker-controls">
          <div class="stats-comparison-search-wrap">
            <input id="statsCompareSearchB" type="search" placeholder="Search nickname or key" autocomplete="off" aria-label="Search player two" aria-controls="statsCompareSuggestionsB" aria-expanded="false">
            <div class="stats-comparison-suggestions" id="statsCompareSuggestionsB" role="listbox" hidden></div>
          </div>
          <select id="statsComparePlayerB" aria-label="Player two">${renderOptions(comparePlayerBKey, comparePlayerAKey)}</select>
        </div>
      </div>
    </div>
    ${comparisonBody}
  `;

  const bindComparisonSearch = (inputId, selectId, suggestionsId, selectedKey, excludedKey) => {
    const input = playerComparisonElement.querySelector(inputId);
    const select = playerComparisonElement.querySelector(selectId);
    const suggestions = playerComparisonElement.querySelector(suggestionsId);
    const hideSuggestions = () => {
      if (!suggestions || !input) {
        return;
      }
      suggestions.hidden = true;
      input.setAttribute("aria-expanded", "false");
    };
    const renderSuggestions = () => {
      if (!input || !select || !suggestions) {
        return;
      }
      const query = input.value.trim();
      if (!query) {
        hideSuggestions();
        return;
      }
      const matches = [...select.options]
        .filter((option) => option.dataset.searchMatch === "true" && !option.disabled && option.value)
        .slice(0, 6);
      suggestions.innerHTML = matches.length
        ? matches.map((option) => `<button type="button" role="option" data-player-key="${escapeHtml(option.value)}">${escapeHtml(option.textContent)}</button>`).join("")
        : '<span>No matching players</span>';
      suggestions.hidden = false;
      input.setAttribute("aria-expanded", "true");
    };
    input?.addEventListener("input", (event) => {
      select.innerHTML = renderOptions(select.value || selectedKey, excludedKey, event.currentTarget.value);
      renderSuggestions();
    });
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        hideSuggestions();
        return;
      }
      if (event.key !== "Enter") {
        return;
      }
      const firstMatch = [...select.options].find((option) => (
        option.dataset.searchMatch === "true" && !option.disabled
      ));
      if (!firstMatch) {
        return;
      }
      event.preventDefault();
      select.value = firstMatch.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    input?.addEventListener("focus", renderSuggestions);
    input?.addEventListener("blur", () => window.setTimeout(hideSuggestions, 120));
    suggestions?.addEventListener("click", (event) => {
      const option = event.target.closest("[data-player-key]");
      if (!option) {
        return;
      }
      select.value = option.dataset.playerKey;
      hideSuggestions();
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };

  bindComparisonSearch("#statsCompareSearchA", "#statsComparePlayerA", "#statsCompareSuggestionsA", comparePlayerAKey, comparePlayerBKey);
  bindComparisonSearch("#statsCompareSearchB", "#statsComparePlayerB", "#statsCompareSuggestionsB", comparePlayerBKey, comparePlayerAKey);

  playerComparisonElement.querySelector("#statsComparePlayerA")?.addEventListener("change", (event) => {
    comparePlayerAKey = event.currentTarget.value || null;
    render();
  });
  playerComparisonElement.querySelector("#statsComparePlayerB")?.addEventListener("change", (event) => {
    comparePlayerBKey = event.currentTarget.value || null;
    render();
  });

  const comparisonShareButton = playerComparisonElement.querySelector("[data-comparison-url]");
  comparisonShareButton?.addEventListener("click", async () => {
    const shareUrl = comparisonShareButton.dataset.comparisonUrl;
    const fallbackInput = document.createElement("textarea");
    fallbackInput.value = shareUrl;
    fallbackInput.setAttribute("readonly", "");
    fallbackInput.style.position = "fixed";
    fallbackInput.style.opacity = "0";
    document.body.append(fallbackInput);
    fallbackInput.select();
    let copied = document.execCommand("copy");
    fallbackInput.remove();

    if (!copied) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        copied = true;
      } catch {
        copied = false;
      }
    }
    comparisonShareButton.textContent = copied ? "Link copied" : "Copy failed";
    window.setTimeout(() => { comparisonShareButton.textContent = "Copy comparison link"; }, 1400);
  });
}

function renderPlayerProfile(account) {
  const shareButton = document.getElementById("statsProfileShare");
  if (!playerProfileElement || !account) {
    if (playerProfileElement) {
      playerProfileElement.hidden = true;
      playerProfileElement.innerHTML = "";
    }
    if (shareButton) {
      shareButton.hidden = true;
      shareButton.onclick = null;
    }
    return;
  }

  const displayStats = getAccountDisplayStats(account);
  const gameCount = getAccountDisplayGameCount(account);
  const eloHistory = getAccountEloHistory(account);
  const peakElo = eloHistory.length ? Math.max(...eloHistory.map((point) => point.value)) : null;
  const recentGames = [...account.games]
    .sort((left, right) => Number(right.endDate || 0) - Number(left.endDate || 0));
  const currentWinStreak = getCurrentWinStreak(account);
  const recentOutcomes = recentGames
    .slice(0, 10)
    .map((game) => getPlayerGameOutcome(game, account));
  const favoriteMaps = getCountedFavorites(account.games.map((game) => game.mapName));
  const favoriteModes = getCountedFavorites(account.games.map(formatPlayerMode));
  const opponents = getAccountOpponents(account);
  const teammates = getAccountTeammates(account);
  const profileUrl = new URL("index.html", window.location.href);
  profileUrl.search = "";
  profileUrl.searchParams.set(
    COMPACT_PLAYER_PARAM,
    getCompactAccountKey(getAccountExpandKey(account)).replace(/^p/, "")
  );

  playerProfileElement.hidden = false;
  playerProfileElement.innerHTML = `
    <div class="stats-profile-metrics">
      <article><span>Current ELO</span><strong>${account.discounted ? "Provisional" : account.elo.toFixed(2)}</strong></article>
      <article><span>Peak ELO</span><strong>${peakElo == null ? "--" : peakElo.toFixed(2)}</strong></article>
      <article><span>Win / loss</span><strong>${formatRecordPercentage(displayStats.wins, gameCount)} / ${formatRecordPercentage(displayStats.losses, gameCount)}</strong></article>
      <article><span>Win streak</span><strong>${currentWinStreak} ${currentWinStreak === 1 ? "win" : "wins"}</strong></article>
      <article class="stats-profile-form"><span>Recent form</span><strong>${recentOutcomes.map((outcome) => `<i class="${outcome.className}" title="${escapeHtml(outcome.label)}">${escapeHtml(outcome.label.charAt(0))}</i>`).join("") || "--"}</strong></article>
    </div>
    <div class="stats-profile-details">
      <article class="stats-profile-history">
        <span class="stats-detail-label">Pulse Ratio</span>
        ${renderEloSparkline(eloHistory)}
      </article>
      <article><span class="stats-detail-label">Favorite maps</span><div>${renderMapProfileLinks(favoriteMaps, "No map history")}</div></article>
      <article><span class="stats-detail-label">Favorite modes</span><div>${renderProfileList(favoriteModes, "No mode history")}</div></article>
      <article><span class="stats-detail-label">Most-played opponents</span><div>${renderProfileComparisonLinks(account, opponents, "No opponents")}</div></article>
      <article><span class="stats-detail-label">Most-played teammates</span><div>${renderProfileComparisonLinks(account, teammates, "No teammates")}</div></article>
    </div>
  `;

  if (shareButton) {
    shareButton.hidden = false;
    shareButton.dataset.profileUrl = profileUrl.href;
    shareButton.onclick = async () => {
      try {
        await navigator.clipboard.writeText(shareButton.dataset.profileUrl);
        shareButton.textContent = "Link copied";
      } catch {
        shareButton.textContent = "Copy failed";
      }
      window.setTimeout(() => { shareButton.textContent = "Copy profile link"; }, 1400);
    };
  }
}

function parseOptionalNumber(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }

  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function getMatchTeamStrengths(game) {
  return (game.teams || [])
    .filter((team) => Array.isArray(team.players) && team.players.length)
    .map((team) => ({
      team,
      strength: getTeamStrengthPercent(team),
      userType: getNormalizedTeamUserType(game, team)
    }));
}

function getMatchTeamPowerDifference(game) {
  const strengths = getMatchTeamStrengths(game)
    .map(({ strength }) => strength)
    .filter((strength) => Number.isFinite(strength));
  if (strengths.length < 2) {
    return null;
  }

  return Math.max(...strengths) - Math.min(...strengths);
}

function isUpsetMatch(game) {
  const strengths = getMatchTeamStrengths(game);
  const winnerStrengths = strengths
    .filter(({ userType, strength }) => userType === "winner" && Number.isFinite(strength))
    .map(({ strength }) => strength);
  const opponentStrengths = strengths
    .filter(({ userType, strength }) => userType !== "winner" && Number.isFinite(strength))
    .map(({ strength }) => strength);

  return winnerStrengths.length > 0
    && opponentStrengths.length > 0
    && Math.max(...winnerStrengths) < Math.max(...opponentStrengths);
}

function parseFilterDate(value, includeWholeDay = false) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (includeWholeDay) {
    date.setDate(date.getDate() + 1);
  }
  return date.getTime();
}

function matchesAdvancedFilters(game) {
  const fromTime = parseFilterDate(matchesDateFrom);
  const toTime = parseFilterDate(matchesDateTo, true);
  const gameTime = Number(game.endDate || 0);
  const durationMinutes = Number(game.duration || 0) / 60_000;
  const playerCount = getPlayerCount(game);
  const minDuration = parseOptionalNumber(matchesMinDuration);
  const maxDuration = parseOptionalNumber(matchesMaxDuration);
  const minPlayers = parseOptionalNumber(matchesMinPlayers);
  const maxPlayers = parseOptionalNumber(matchesMaxPlayers);
  const minPowerGap = parseOptionalNumber(matchesMinPowerGap);

  if (fromTime != null && gameTime < fromTime) {
    return false;
  }
  if (toTime != null && gameTime >= toTime) {
    return false;
  }
  if (matchesMap && game.mapName !== matchesMap) {
    return false;
  }
  if (minDuration != null && durationMinutes < minDuration) {
    return false;
  }
  if (maxDuration != null && durationMinutes > maxDuration) {
    return false;
  }
  if (minPlayers != null && playerCount < minPlayers) {
    return false;
  }
  if (maxPlayers != null && playerCount > maxPlayers) {
    return false;
  }
  if (minPowerGap != null) {
    const powerDifference = getMatchTeamPowerDifference(game);
    if (!Number.isFinite(powerDifference) || powerDifference < minPowerGap) {
      return false;
    }
  }
  if (matchesUpsetsOnly && !isUpsetMatch(game)) {
    return false;
  }

  return true;
}

function getActiveMatchFilterCount() {
  return [
    matchesDateFrom,
    matchesDateTo,
    matchesMap,
    matchesMinDuration,
    matchesMaxDuration,
    matchesMinPlayers,
    matchesMaxPlayers,
    matchesMinPowerGap,
    matchesUpsetsOnly
  ].filter(Boolean).length;
}

function getPlayerLeaderboardRanks(account) {
  if (!account || !leaderboardData?.leaderboards) {
    return [];
  }

  const accountKey = getAccountExpandKey(account);
  const leaderboards = runtime.leaderboards?.length
    ? runtime.leaderboards
    : Object.keys(leaderboardData.leaderboards);

  return leaderboards.flatMap((leaderboard) => {
    const { accounts } = hydratePublishedBoard(leaderboard);
    const rankedAccounts = filterVisibleAccounts(sortAccounts(accounts.values()));
    const rankIndex = rankedAccounts.findIndex((candidate) => getAccountExpandKey(candidate) === accountKey);
    return rankIndex >= 0 ? [{ leaderboard, rank: rankIndex + 1 }] : [];
  });
}

function renderPlayerRankMenu(account, currentRank) {
  const ranks = getPlayerLeaderboardRanks(account);
  const options = ranks.length
    ? ranks.map(({ leaderboard, rank }) => `
        <button
          class="stats-player-rank-option${leaderboard === selectedLeaderboard ? " is-active" : ""}"
          type="button"
          data-player-rank-leaderboard="${escapeHtml(leaderboard)}"
        >
          <span>${escapeHtml(leaderboard)}</span>
          <strong>#${rank}</strong>
        </button>
      `).join("")
    : '<span class="stats-player-rank-empty">No ranked filters</span>';

  return `
    <span class="stats-player-profile-rank">
      <span class="stats-player-rank-menu">
        <button
          class="stats-player-rank-trigger"
          type="button"
          aria-expanded="false"
          aria-haspopup="menu"
          aria-label="View ${escapeHtml(account.name || "player")} ranks across filters"
        >
          <span class="stats-detail-label stats-player-profile-rank-label">Rank</span>
          <strong>#${currentRank || "--"}</strong>
          <span class="stats-player-rank-chevron" aria-hidden="true"></span>
        </button>
        <span class="stats-player-rank-popup" role="menu" hidden>${options}</span>
      </span>
    </span>
  `;
}

function bindPlayerRankMenu() {
  const rankMenu = playerGamesTitleElement?.querySelector(".stats-player-rank-menu");
  const trigger = rankMenu?.querySelector(".stats-player-rank-trigger");
  const popup = rankMenu?.querySelector(".stats-player-rank-popup");
  if (!rankMenu || !trigger || !popup) {
    return;
  }

  const setOpen = (open) => {
    popup.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
    rankMenu.classList.toggle("is-open", open);
  };

  trigger.addEventListener("click", () => {
    setOpen(trigger.getAttribute("aria-expanded") !== "true");
  });

  popup.addEventListener("click", (event) => {
    const option = event.target.closest("[data-player-rank-leaderboard]");
    if (!option) {
      return;
    }

    const leaderboard = option.dataset.playerRankLeaderboard;
    setOpen(false);
    if (!leaderboard || selectedLeaderboard === leaderboard) {
      return;
    }

    visiblePlayerCount = INITIAL_PLAYER_LIMIT;
    visibleMatchCount = INITIAL_MATCH_LIMIT;
    resetPlayerGamesView();
    selectedLeaderboard = leaderboard;
    updateActiveButtons();
    render();
  });

  rankMenu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setOpen(false);
      trigger.focus();
    }
  });

  rankMenu.addEventListener("focusout", () => {
    window.setTimeout(() => {
      if (!rankMenu.contains(document.activeElement)) {
        setOpen(false);
      }
    }, 0);
  });
}

function renderPlayerGames(accounts, globalAccounts = accounts) {
  if (!playerGamesElement || !playerGamesTitleElement || !playerGamesMetaElement) {
    return;
  }

  const profileHeadingLabel = document.querySelector(".stats-player-profile-heading-line .panel-kicker");
  const activeAccount = accounts.find((account) => getAccountExpandKey(account) === activeExpandedAccountKey);
  const selectedAccount = globalAccounts.find((account) => getAccountExpandKey(account) === activeExpandedAccountKey);
  if (!activeAccount && selectedAccount) {
    if (profileHeadingLabel) {
      profileHeadingLabel.innerHTML = `<span class="stats-player-profile-heading-name">${escapeHtml(selectedAccount.name || "Player")}</span>`;
    }
    playerGamesTitleElement.innerHTML = `
      <span class="stats-player-profile-leaderboard">${escapeHtml(selectedLeaderboard)}</span>
      <span class="stats-player-profile-state">No data</span>
      ${renderPlayerRankMenu(selectedAccount, 0)}
    `;
    bindPlayerRankMenu();
    playerGamesMetaElement.textContent = `No data for this player in the ${selectedLeaderboard} leaderboard.`;
    if (playerGamesActionsElement) {
      playerGamesActionsElement.innerHTML = "";
    }
    renderPlayerProfile(selectedAccount);
    playerProfileElement.innerHTML = `
      <p class="stats-profile-no-data">No data for ${escapeHtml(selectedAccount.name || "this player")} in the ${escapeHtml(selectedLeaderboard)} leaderboard.</p>
    `;
    playerGamesElement.innerHTML = `
      <tr class="stats-empty-row">
        <td colspan="5">No match data for this player in the ${escapeHtml(selectedLeaderboard)} leaderboard.</td>
      </tr>
    `;
    return;
  }
  if (!activeAccount) {
    activeExpandedAccountKey = null;
    resetPlayerGamesView();
    expandedAccounts.clear();
    if (profileHeadingLabel) {
      profileHeadingLabel.textContent = "Player Profile";
    }
    playerGamesTitleElement.innerHTML = '<span class="stats-player-profile-empty-title">Select a player to open their profile</span>';
    playerGamesMetaElement.textContent = "The selected player's latest matches will appear here.";
    if (playerGamesActionsElement) {
      playerGamesActionsElement.innerHTML = "";
    }
    renderPlayerProfile(null);
    playerGamesElement.innerHTML = `
      <tr class="stats-empty-row">
        <td colspan="5">Use + on a player to show their latest games here.</td>
      </tr>
    `;
    return;
  }

  renderPlayerProfile(activeAccount);

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

  const playerRank = filterVisibleAccounts(accounts).indexOf(activeAccount) + 1;
  if (profileHeadingLabel) {
    profileHeadingLabel.innerHTML = `<span class="stats-player-profile-heading-name">${escapeHtml(activeAccount.name || "Player")}</span>`;
  }
  playerGamesTitleElement.innerHTML = `
    <span class="stats-player-profile-leaderboard">${escapeHtml(selectedLeaderboard)}</span>
    ${renderPlayerRankMenu(activeAccount, playerRank)}
  `;
  bindPlayerRankMenu();
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
            <span class="stats-player-game-map">
              ${renderMapFilterLink(game.mapName)}
              ${game.mods
                ? `
                  <button
                    class="stats-map-mod stats-copy-chip"
                    type="button"
                    data-copy-value="${escapeHtml(game.mods)}"
                    data-copy-default="Click to copy"
                    aria-label="Copy mod data"
                  >
                    mod
                    <span class="stats-copy-hint" aria-hidden="true">Click to copy</span>
                  </button>
                `
                : ""}
            </span>
          </td>
          <td><span class="stats-tag stats-player-game-result ${outcome.className}">${escapeHtml(outcome.label)}</span></td>
          <td class="stats-duration">${escapeHtml(formatDuration(game.duration))}</td>
          <td>
            ${replayUrl
              ? `<a class="stats-replay-link" href="${escapeHtml(replayUrl)}" data-replay-analyzer-url="${escapeHtml(replayUrl)}">Analyze</a>`
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

  bindCopyButtons(playerGamesElement);

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
    includePlayerPower = false,
    linkToLeaderboard = false,
    showVersus = true,
    highlightedAccountKey = "",
    clickablePlayerTiles = false,
    currentGameKey = "",
    showTeamStrength = true
  } = options;
  const teams = game.teams.filter((team) => team.players.length);
  if (!teams.length) {
    return `<span class="stats-note">Player list unavailable.</span>`;
  }
  const teamStrengths = teams.map((team) => getTeamStrengthPercent(team));
  const validTeamStrengths = teamStrengths.filter((value) => Number.isFinite(value));
  const weakestTeamStrength = validTeamStrengths.length ? Math.min(...validTeamStrengths) : null;
  const strongestTeamStrength = validTeamStrengths.length ? Math.max(...validTeamStrengths) : null;

  const renderUpsetBadge = (team, strengthPercent) => {
    if (!showTeamStrength) {
      return "";
    }
    const isUpsetWinner = getNormalizedTeamUserType(game, team) === "winner"
      && Number.isFinite(strengthPercent)
      && strengthPercent === weakestTeamStrength
      && weakestTeamStrength < strongestTeamStrength;
    return isUpsetWinner
      ? '<span class="stats-upset-victory" title="Mega win: the lower-powered team won." aria-label="Mega win">&#9733; Mega win!</span>'
      : "";
  };

  const renderPlayerLabel = (player) => {
    const playerName = player.account?.name || "Unknown";
    const powerSuffix = includePlayerPower ? ` [${getPlayerPowerLabel(player.account)}]` : "";
    const playerLabel = `${escapeHtml(playerName)}${escapeHtml(powerSuffix)}`;
    if (!linkToLeaderboard || !player.account) {
      return playerLabel;
    }

    const playerParams = new URLSearchParams({
      playerSearch: playerName,
      player: getAccountExpandKey(player.account)
    });
    return `<a class="stats-team-player-link" href="index.html?${escapeHtml(playerParams.toString())}" target="_parent" aria-label="Open ${escapeHtml(playerName)} on Leaderboards">${playerLabel}</a>`;
  };

  if (variant === "tiles") {
    return `
      <div class="stats-matchup-list stats-matchup-list-tiles">
        ${teams.map((team, index) => {
          const strengthPercent = teamStrengths[index];
          return `
          <div class="stats-team-grid">
            <div class="stats-team-players">
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
                  <${tileTag} class="stats-team-tile ${getTeamToneClass(getNormalizedTeamUserType(game, team))}${isHighlighted ? " is-current-player" : ""}${jumpAccount ? " is-clickable-player" : ""}" ${tileAttrs}>
                    ${renderPlayerLabel(player)}
                  </${tileTag}>
                `;
                })
                .join("")}
            </div>
            ${renderUpsetBadge(team, strengthPercent)}
            ${showTeamStrength ? `<span class="stats-team-strength ${getTeamStrengthToneClass(strengthPercent, teamStrengths)}">
              Team power: ${escapeHtml(Number.isFinite(strengthPercent) ? `${strengthPercent}%` : "N/A")}
            </span>` : ""}
          </div>
        `;
        }).join("")}
      </div>
    `;
  }

  return `
    <div class="stats-matchup-list">
      ${teams.map((team, index) => {
        const strengthPercent = teamStrengths[index];
        const vsLabel = showVersus && index < teams.length - 1 ? `<span class="stats-versus">vs</span>` : "";
        return `
          <div class="stats-matchup-team-row">
            <span class="stats-team ${getTeamToneClass(getNormalizedTeamUserType(game, team))}">
              ${team.players
                .map((player) => `<span class="stats-team-player">${renderPlayerLabel(player)}</span>`)
                .join("")}
            </span>
            ${renderUpsetBadge(team, strengthPercent)}
            ${showTeamStrength ? `<span class="stats-team-strength ${getTeamStrengthToneClass(strengthPercent, teamStrengths)}">
              Team power: ${escapeHtml(Number.isFinite(strengthPercent) ? `${strengthPercent}%` : "N/A")}
            </span>` : ""}
          </div>
          ${vsLabel}
        `;
      }).join("")}
    </div>
  `;
}

function getLastUpdateTime(results) {
  if (leaderboardData?.generatedAt) {
    return new Date(leaderboardData.generatedAt).getTime();
  }
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
    statusElement.innerHTML = `
      <span class="stats-card-label">Last Updated</span>
      <strong class="stats-card-value stats-update-value">Unavailable</strong>
    `;
    statusElement.removeAttribute("title");
    return;
  }

  const absoluteLabel = `Last update: ${formatDate(lastStatsUpdateAt)}`;
  const relativeLabel = formatRelativeTime(lastStatsUpdateAt);
  const updateLabel = document.createElement("span");
  updateLabel.className = "stats-card-label";
  updateLabel.textContent = "Last Updated";

  const updateLine = document.createElement("strong");
  updateLine.className = "stats-card-value stats-update-value";
  updateLine.textContent = relativeLabel.replace(/^Updated\s+/i, "");

  statusElement.replaceChildren(updateLabel, updateLine);
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

function renderTrendingPlayers(accountList, gameList = []) {
  if (!summaryElement) {
    return;
  }

  let trendingElement = document.getElementById("statsTrendingPlayers");
  if (!trendingElement) {
    trendingElement = document.createElement("section");
    trendingElement.id = "statsTrendingPlayers";
    trendingElement.className = "stats-trending-players";
    summaryElement.insertAdjacentElement("afterend", trendingElement);
  }

  const leaderboardRankedPlayers = accountList.filter((account) => !account.discounted);
  const topEloAccount = leaderboardRankedPlayers[0] || accountList[0] || null;
  const topKillsAccount = leaderboardRankedPlayers
    .filter((account) => account.totalKills > 0)
    .sort((left, right) => right.totalKills - left.totalKills || right.elo - left.elo)[0] || null;
  const rankedPlayers = filterRecentlyActiveAccounts(accountList, gameList)
    .filter((account) => !account.discounted);
  if (!leaderboardRankedPlayers.length) {
    trendingElement.hidden = true;
    trendingElement.innerHTML = "";
    return;
  }

  const trends = rankedPlayers.map((account) => ({
    account,
    trend: getRecentPlayerTrend(account)
  }));
  const recentTrends = trends.filter((entry) => entry.trend.games >= 10);
  const pickLeader = (entries, key) => [...entries]
    .sort((left, right) => (
      right.trend[key] - left.trend[key]
      || right.account.elo - left.account.elo
      || String(left.account.name || "").localeCompare(String(right.account.name || ""))
    ))[0] || null;
  const eloLeader = pickLeader(recentTrends, "eloGain");
  const streakLeader = pickLeader(trends, "streak");
  const winRateLeader = pickLeader(recentTrends, "winRate");
  const upsetLeader = pickLeader(trends, "upsetWins");

  const renderTrendingCard = (label, entry, value, detail) => {
    if (!entry) {
      return `
        <article class="stats-trending-card">
          <span>${escapeHtml(label)}</span>
          <strong>--</strong>
          <small>Not enough match history</small>
        </article>
      `;
    }
    const profileUrl = new URL("index.html", window.location.href);
    const params = new URLSearchParams({
      playerSearch: entry.account.name || "",
      player: getAccountExpandKey(entry.account)
    });
    if (selectedLeaderboard !== "Global") {
      params.set("leaderboard", selectedLeaderboard);
    }
    profileUrl.search = params.toString();
    return `
      <article class="stats-trending-card">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <a href="${escapeHtml(profileUrl.href)}" target="_parent" aria-label="Open ${escapeHtml(entry.account.name || "Unknown player")} profile">${escapeHtml(entry.account.name || "Unknown player")}</a>
        <small>${escapeHtml(detail)}</small>
      </article>
    `;
  };

  trendingElement.hidden = false;
  trendingElement.innerHTML = `
    <div class="stats-trending-grid">
      ${renderTrendingCard(
        "Top ELO",
        topEloAccount ? { account: topEloAccount } : null,
        topEloAccount ? topEloAccount.elo.toFixed(2) : "--",
        "Highest rating in this leaderboard"
      )}
      ${renderTrendingCard(
        "Total kills",
        topKillsAccount ? { account: topKillsAccount } : null,
        topKillsAccount ? `${topKillsAccount.totalKills.toLocaleString()} kills` : "--",
        "Unit kills + structures destroyed"
      )}
      ${renderTrendingCard(
        "Biggest ELO gain",
        eloLeader,
        eloLeader ? `${eloLeader.trend.eloGain >= 0 ? "+" : ""}${eloLeader.trend.eloGain.toFixed(2)}` : "--",
        "Across the latest 10 matches"
      )}
      ${renderTrendingCard(
        "Longest current streak",
        streakLeader,
        streakLeader ? `${streakLeader.trend.streak} ${streakLeader.trend.streak === 1 ? "win" : "wins"}` : "--",
        "Consecutive wins through the latest match"
      )}
      ${renderTrendingCard(
        "Best recent win rate",
        winRateLeader,
        winRateLeader ? `${winRateLeader.trend.winRate.toFixed(0)}%` : "--",
        winRateLeader ? `${winRateLeader.trend.wins} wins in the latest 10 matches` : "Not enough match history"
      )}
      ${renderTrendingCard(
        "Most upset victories",
        upsetLeader,
        upsetLeader ? `${upsetLeader.trend.upsetWins} ${upsetLeader.trend.upsetWins === 1 ? "win" : "wins"}` : "--",
        "Lower-powered team victories"
      )}
    </div>
  `;
}

function renderSummary(accountList, gameList) {
  if (!summaryElement) {
    return;
  }

  if (!accountList.length || !gameList.length) {
    renderTrendingPlayers([], []);
    summaryElement.innerHTML = `
      <article class="stats-card">
        <span class="stats-card-label">Stats</span>
        <strong class="stats-card-value">Unavailable</strong>
      </article>
    `;
    return;
  }

  const rankedPlayers = accountList.filter((account) => !account.discounted);
  const latestMatch = gameList[0];
  const latestReplayUrl = latestMatch?.replayUrl ? normalizeReplayUrl(latestMatch.replayUrl) : "";

  summaryElement.innerHTML = `
    <article class="stats-card">
      <span class="stats-card-label">Matches</span>
      <strong class="stats-card-value">${gameList.length}</strong>
    </article>
    <article class="stats-card">
      <span class="stats-card-label">Ranked Players</span>
      <strong class="stats-card-value">${rankedPlayers.length}</strong>
    </article>
    <article class="stats-card">
      <span class="stats-card-label">Latest Match</span>
      <strong class="stats-card-value">${latestMatch ? formatShortDate(latestMatch.endDate) : "--"}</strong>
      ${latestReplayUrl
        ? `<a class="stats-player-note stats-replay-link" href="${escapeHtml(latestReplayUrl)}" data-replay-analyzer-url="${escapeHtml(latestReplayUrl)}" aria-label="Analyze latest match on ${escapeHtml(latestMatch.mapName || "Unknown map")}">${escapeHtml(latestMatch.mapName || "Unknown map")}</a>`
        : `<span class="stats-player-note">${escapeHtml(latestMatch ? latestMatch.mapName : "Unknown map")}</span>`}
    </article>
  `;
  if (statusElement) {
    statusElement.classList.add("stats-card", "stats-update-card");
    summaryElement.append(statusElement);
    renderStatusText();
  }
  renderTrendingPlayers(accountList, gameList);
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
      const displayStats = getAccountDisplayStats(account);
      const displayGameCount = getAccountDisplayGameCount(account);
      const eloLabel = account.discounted ? "--" : account.elo.toFixed(2);
      const recentTrend = getRecentPlayerTrend(account);
      const eloChangeLabel = `${recentTrend.eloGain > 0 ? "+" : ""}${recentTrend.eloGain.toFixed(2)}`;
      const eloChangeClass = recentTrend.eloGain > 0
        ? "is-positive"
        : recentTrend.eloGain < 0
          ? "is-negative"
          : "is-neutral";
      const streakLabel = recentTrend.streak > 0 ? `🔥 ${recentTrend.streak}W` : "0W";
      const formLabel = `${eloChangeLabel} ELO over the latest ${recentTrend.games} matches; current win streak ${recentTrend.streak}`;
      const publicKeys = [...account.publicKeys].sort();
      const accountNames = getSortedAccountNames(account);
      const keyCountLabel = `${publicKeys.length} key(s) tracked`;
      const playerLine = escapeHtml(account.name || "Unknown");
      const botBadge = Boolean(account.bot) === true
        ? '<span class="stats-player-bot">bot</span>'
        : "";
      const hasDetails = Boolean(publicKeys.length || accountNames.length > 1);
      const expandKey = getAccountExpandKey(account);
      const isExpanded = expandedAccounts.has(expandKey);
      const expandLabel = isExpanded
        ? "Close player profile"
        : accountNames.length > 1
          ? "Open profile, player names, and keys"
          : "Open player profile";
      const nameDetails = accountNames.length > 1
        ? `
            <div class="stats-detail-group">
              <span class="stats-detail-label">Player names</span>
              <div class="stats-name-list">
                ${accountNames
                  .map(([name, count]) => `
                    <button
                      class="stats-name-chip stats-copy-chip${name === account.name ? " is-primary" : ""}"
                      type="button"
                      data-copy-value="${escapeHtml(name)}"
                      data-copy-default="Click to copy"
                      aria-label="Copy alias ${escapeHtml(name)}"
                    >
                      <span class="stats-name-copy">
                        <span class="stats-name-text">${escapeHtml(name)}</span>
                        <sup class="stats-name-count">${count}</sup>
                      </span>
                      <span class="stats-copy-hint" aria-hidden="true">Click to copy</span>
                    </button>
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
                    <button
                      class="stats-key-item stats-copy-chip"
                      type="button"
                      data-copy-value="${escapeHtml(publicKey)}"
                      data-copy-default="Click to copy"
                      aria-label="Copy public key"
                    >
                      <code class="stats-key-value">${escapeHtml(publicKey)}</code>
                      <span class="stats-copy-hint" aria-hidden="true">Click to copy</span>
                    </button>
                  `)
                  .join("")}
              </div>
            </div>
          `
        : "";
      const playerDetails = `
        <div class="stats-player-line">
          <span class="stats-player-label">${playerLine}</span>
          ${botBadge}
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
        <tr class="stats-rank-row${isExpanded ? " is-expanded" : ""} is-clickable" data-expand-account="${escapeHtml(expandKey)}">
          <td class="stats-rank">${rank}</td>
          <td class="stats-player-name">
            ${playerDetails}
          </td>
          <td class="stats-elo">
            <span class="stats-elo-value">${eloLabel}</span>
            <span class="stats-form-indicators" aria-label="${escapeHtml(formLabel)}" title="${escapeHtml(formLabel)}">
              <span class="stats-form-change ${eloChangeClass}">${eloChangeLabel}</span>
              <span class="stats-form-streak${recentTrend.streak > 0 ? " is-active" : ""}">${streakLabel}</span>
            </span>
          </td>
          <td>${account.games.length}</td>
          <td class="stats-record">
            <span class="stats-record-grid">
              <span class="stats-record-value">
                <span class="stats-record-count">${displayStats.wins}</span>
                <span class="stats-record-value-divider">/</span>
                <span class="stats-record-percent">${formatRecordPercentage(displayStats.wins, displayGameCount)}</span>
              </span>
              <span class="stats-record-sort-divider">/</span>
              <span class="stats-record-value">
                <span class="stats-record-count">${displayStats.losses}</span>
                <span class="stats-record-value-divider">/</span>
                <span class="stats-record-percent">${formatRecordPercentage(displayStats.losses, displayGameCount)}</span>
              </span>
              <span class="stats-record-sort-divider">/</span>
              <span class="stats-record-value">
                <span class="stats-record-count">${displayStats.draws}</span>
                <span class="stats-record-value-divider">/</span>
                <span class="stats-record-percent">${formatRecordPercentage(displayStats.draws, displayGameCount)}</span>
              </span>
              <span class="stats-record-sort-divider">/</span>
              <span class="stats-record-value">
                <span class="stats-record-count">${displayStats.crashes}</span>
                <span class="stats-record-value-divider">/</span>
                <span class="stats-record-percent">${formatRecordPercentage(displayStats.crashes, displayGameCount)}</span>
              </span>
            </span>
          </td>
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
  const canShowLess = shownCount > INITIAL_PLAYER_LIMIT;
  const nextLimit = canLoadMore ? getNextPlayerLimit(shownCount, totalPlayers) : shownCount;
  const actionLabel = shownCount < PLAYER_LIMIT_STEP ? "Show more" : "Load more";
  const targetLabel = nextLimit >= totalPlayers ? `all ${totalPlayers}` : `top ${nextLimit}`;

  rankActionsElement.innerHTML = `
    <span class="stats-panel-note">${canLoadMore ? `Showing top ${shownCount} of ${totalPlayers} listed players.` : `Showing all ${totalPlayers} listed players.`}</span>
    ${canShowLess ? '<button class="stats-load-more" id="statsShowLess" type="button">Show less</button>' : ""}
    ${canLoadMore ? `<button class="stats-load-more" id="statsLoadMore" type="button">${actionLabel} (${targetLabel})</button>` : ""}
  `;

  const showLessButton = rankActionsElement.querySelector("#statsShowLess");
  if (showLessButton) {
    showLessButton.addEventListener("click", () => {
      visiblePlayerCount = INITIAL_PLAYER_LIMIT;
      render();
      ranksElement.closest(".stats-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const loadMoreButton = rankActionsElement.querySelector("#statsLoadMore");
  if (loadMoreButton) {
    loadMoreButton.addEventListener("click", () => {
      visiblePlayerCount = nextLimit;
      render();
    });
  }
}

function renderMatches(gameList) {
  if (!matchesElement) {
    return;
  }

  renderMatchMapOptions(gameList);
  const activeFilterCount = getActiveMatchFilterCount();
  if (matchFilterCountElement) {
    matchFilterCountElement.textContent = activeFilterCount
      ? `${activeFilterCount} active ${activeFilterCount === 1 ? "filter" : "filters"}`
      : "No advanced filters";
  }

  const searchQuery = normalizeSearchQuery(matchesSearchQuery);
  const filteredGames = gameList
    .filter((game) => matchesRecentGameSearch(game, searchQuery))
    .filter(matchesAdvancedFilters)
    .sort(compareMatches);
  const rows = filteredGames.slice(0, visibleMatchCount);

  renderMapSummary(filteredGames);
  renderMatchActions(filteredGames.length, rows.length);

  if (!rows.length) {
    matchesElement.innerHTML = `
      <tr class="stats-empty-row">
        <td colspan="6">${searchQuery || activeFilterCount ? "No matches matched the current filters." : "No matches found for this slice."}</td>
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
            ${renderMapFilterLink(game.mapName)}
            ${game.mods ? `<span class="stats-note">${escapeHtml(game.mods)}</span>` : ""}
          </td>
          <td class="stats-matchup">${renderMatchup(game, {
            includePlayerPower: true,
            linkToLeaderboard: true,
            showTeamStrength: true,
            showVersus: false
          })}</td>
          <td class="stats-duration">${escapeHtml(formatDuration(game.duration))}</td>
          <td><span class="stats-note">${escapeHtml(game.sourceLabel || "Legacy")}</span></td>
          <td><a class="stats-replay-link" href="${escapeHtml(normalizeReplayUrl(game.replayUrl))}" data-replay-analyzer-url="${escapeHtml(normalizeReplayUrl(game.replayUrl))}">Analyze</a></td>
        </tr>
      `;
    })
    .join("");
}

function getSuccessfulMapPlayers(gameList) {
  const playerRecords = new Map();
  gameList.forEach((game) => {
    const seenAccounts = new Set();
    (game.teams || []).forEach((team) => {
      const won = getNormalizedTeamUserType(game, team) === "winner";
      (team.players || []).forEach((slot) => {
        const account = slot.account;
        if (!account) {
          return;
        }
        const key = getAccountExpandKey(account);
        if (seenAccounts.has(key)) {
          return;
        }
        seenAccounts.add(key);
        const record = playerRecords.get(key) || {
          name: account.name || "Unknown",
          games: 0,
          wins: 0
        };
        record.games += 1;
        record.wins += won ? 1 : 0;
        playerRecords.set(key, record);
      });
    });
  });

  return [...playerRecords.values()]
    .sort((left, right) => (
      right.wins - left.wins
      || (right.wins / right.games) - (left.wins / left.games)
      || right.games - left.games
      || left.name.localeCompare(right.name)
    ))
    .slice(0, 3);
}

function renderMapSummary(gameList) {
  const tableWrap = matchesElement?.closest(".stats-table-wrap-matches");
  if (!tableWrap) {
    return;
  }

  let summary = document.getElementById("statsMapSummary");
  if (!summary) {
    summary = document.createElement("section");
    summary.id = "statsMapSummary";
    summary.className = "stats-map-summary";
    tableWrap.insertAdjacentElement("beforebegin", summary);
  }

  if (!matchesMap) {
    summary.hidden = true;
    summary.innerHTML = "";
    return;
  }

  const averageDuration = gameList.length
    ? gameList.reduce((total, game) => total + Number(game.duration || 0), 0) / gameList.length
    : 0;
  const successfulPlayers = getSuccessfulMapPlayers(gameList);
  summary.hidden = false;
  summary.innerHTML = `
    <div class="stats-map-summary-title">
      <span>Map summary</span>
      <strong>${escapeHtml(matchesMap)}</strong>
    </div>
    <div class="stats-map-summary-metric">
      <span>Matches</span>
      <strong>${gameList.length}</strong>
    </div>
    <div class="stats-map-summary-metric">
      <span>Average duration</span>
      <strong>${gameList.length ? escapeHtml(formatDuration(averageDuration)) : "--"}</strong>
    </div>
    <div class="stats-map-summary-players">
      <span>Most successful players</span>
      <div>${successfulPlayers.length
        ? successfulPlayers.map((player) => `<strong>${escapeHtml(player.name)} <small>${player.wins} ${player.wins === 1 ? "win" : "wins"} · ${Math.round((player.wins / player.games) * 100)}%</small></strong>`).join("")
        : '<small class="stats-profile-empty">No player results</small>'}</div>
    </div>
  `;
}

function renderMatchMapOptions(gameList) {
  if (!matchesMapElement) {
    return;
  }

  const mapNames = [...new Set(gameList.map((game) => game.mapName).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
  if (matchesMap && !mapNames.includes(matchesMap)) {
    mapNames.unshift(matchesMap);
  }
  const signature = mapNames.join("\u0000");
  if (signature === matchMapOptionsSignature && matchesMapElement.value === matchesMap) {
    return;
  }

  matchMapOptionsSignature = signature;
  matchesMapElement.innerHTML = `
    <option value="">All maps</option>
    ${mapNames.map((mapName) => `<option value="${escapeHtml(mapName)}">${escapeHtml(mapName)}</option>`).join("")}
  `;
  matchesMapElement.value = matchesMap;
}

function renderMatchActions(totalMatches, shownMatches) {
  if (!matchesActionsElement) {
    return;
  }

  matchesActionsElement.innerHTML = `
    <span class="stats-panel-note">Showing ${shownMatches} of ${totalMatches} matches.</span>
    ${shownMatches < totalMatches ? '<button class="stats-load-more" id="statsMatchesLoadMore" type="button">Load more</button>' : ""}
  `;

  const loadMoreButton = matchesActionsElement.querySelector("#statsMatchesLoadMore");
  if (!loadMoreButton) {
    return;
  }

  loadMoreButton.addEventListener("click", () => {
    visibleMatchCount = Math.min(visibleMatchCount + MATCH_LIMIT_STEP, totalMatches);
    render();
  });
}

function render() {
  if (!leaderboardData) {
    updateStatusText([]);
    updateSortIndicators();
    syncStateToUrl();
    return;
  }

  if (!leaderboardData.games.length) {
    updateStatusText([]);
    leaderboardGameCounts = new Map();
    globalRankMap = new Map();
    renderButtons();
    renderSummary([], []);
    renderPlayerComparison([]);
    renderPlayerGames(renderRanks([]));
    renderMatches([]);
    updateSortIndicators();
    syncStateToUrl();
    return;
  }

  const { accounts: globalAccounts, games: globalGames } = hydratePublishedBoard("Global");

  const allGames = [...globalGames];
  const globalAccountList = sortAccounts(globalAccounts.values());
  resolveActivePlayerShareKey(globalAccountList);
  globalRankMap = buildGlobalRankMap(globalAccountList);

  leaderboardGameCounts = new Map(Object.entries(leaderboardData.leaderboards)
    .map(([leaderboard, board]) => [leaderboard, Number(board.matches || 0)]));

  const { accounts, games } = hydratePublishedBoard(selectedLeaderboard);

  const accountList = sortAccounts(accounts.values());
  const gameList = [...games].sort((left, right) => right.endDate - left.endDate);
  const recentGameList = gameList;

  updateStatusText(leaderboardData.games);
  renderButtons();
  renderSummary(accountList, gameList);
  renderRanks(accountList);
  renderPlayerComparison(accountList);
  renderPlayerGames(accountList, globalAccountList);
  renderMatches(recentGameList);
  updateSortIndicators();
  syncStateToUrl();
}

function updateActiveButtons() {
  if (!buttonsElement) {
    return;
  }

  buttonsElement.closest(".stats-leaderboard-filter-menu")
    ?.classList.toggle("has-active-filter", selectedLeaderboard !== "Global");
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
        visibleMatchCount = INITIAL_MATCH_LIMIT;
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
    visibleMatchCount = INITIAL_MATCH_LIMIT;
    render();
  });
}

function bindMatchFilter(element, eventName, updateValue) {
  element?.addEventListener(eventName, (event) => {
    updateValue(event.currentTarget);
    visibleMatchCount = INITIAL_MATCH_LIMIT;
    render();
  });
}

bindMatchFilter(matchesDateFromElement, "change", (element) => { matchesDateFrom = element.value; });
bindMatchFilter(matchesDateToElement, "change", (element) => { matchesDateTo = element.value; });
bindMatchFilter(matchesMapElement, "change", (element) => { matchesMap = element.value; });
bindMatchFilter(matchesMinDurationElement, "input", (element) => { matchesMinDuration = element.value; });
bindMatchFilter(matchesMaxDurationElement, "input", (element) => { matchesMaxDuration = element.value; });
bindMatchFilter(matchesMinPlayersElement, "input", (element) => { matchesMinPlayers = element.value; });
bindMatchFilter(matchesMaxPlayersElement, "input", (element) => { matchesMaxPlayers = element.value; });
bindMatchFilter(matchesMinPowerGapElement, "input", (element) => { matchesMinPowerGap = element.value; });
bindMatchFilter(matchesUpsetsOnlyElement, "change", (element) => { matchesUpsetsOnly = element.checked; });

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
    try {
      sawSignal = true;
      resultsData.results.push(JSON.parse(event.data));
    } catch (error) {
      console.warn("Unable to parse live results event.", error);
    }
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
  const leaderboardChanged = await ensureLeaderboardData(force);

  if (leaderboardChanged || force) {
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

document.addEventListener("click", (event) => {
  const replayLink = event.target.closest(".stats-replay-link[data-replay-analyzer-url]");
  if (!replayLink || window.parent === window) {
    return;
  }

  event.preventDefault();
  window.parent.postMessage(
    {
      type: "boha:open-replay-analyzer",
      replayUrl: replayLink.dataset.replayAnalyzerUrl
    },
    window.location.origin
  );
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

  startRefreshLoop();
}

init();
