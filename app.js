const revealItems = document.querySelectorAll("[data-reveal]");
const lobbyCaption = document.getElementById("lobbyCaption");
const lobbyGames = document.getElementById("lobbyGames");
const lobbyBadge = document.getElementById("lobbyBadge");
const lobbyUpdated = document.getElementById("lobbyUpdated");
const heroStatus = document.getElementById("heroStatus");
const statGames = document.getElementById("statGames");
const statPlayers = document.getElementById("statPlayers");
const statSpectators = document.getElementById("statSpectators");

const MAP_IMAGE_BASE = "https://warzone2100.retropaganda.info/images/maps/";
const GITHUB_RAW_STATS_BASE_URL = "https://raw.githubusercontent.com/MaWay2000/boha/main/stats/";
const USE_REMOTE_LOBBY_MIRROR = window.location.hostname.endsWith("github.io");
const LOBBY_SNAPSHOT_URL = USE_REMOTE_LOBBY_MIRROR
  ? new URL("lobby-snapshot.json", GITHUB_RAW_STATS_BASE_URL)
  : new URL("./stats/lobby-snapshot.json", window.location.href);
const LOBBY_REFRESH_MS = 5 * 60_000;
const LOBBY_SORT_DEFAULT = { key: "players", direction: "desc" };
const LOBBY_SORT_DIRECTIONS = {
  host: "asc",
  players: "desc",
  spectators: "desc",
  status: "desc",
  map: "asc",
  title: "asc"
};
const SAMPLE_LOBBY = {
  motd: "Deploy alongside lobby endpoints to activate the live feed.",
  games: []
};
let lobbyMirrorTimer = null;
let lobbyUpdatedTimer = null;
let lastLobbyUpdatedAt = null;
let latestLobbySnapshot = null;
let lobbySortState = { ...LOBBY_SORT_DEFAULT };
const lobbySortHeaders = [...document.querySelectorAll("[data-sort-table=\"lobby\"][data-sort-key]")];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function compareNumberValues(left, right) {
  return Number(left || 0) - Number(right || 0);
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

function parseLobbyStateFromUrl() {
  const url = new URL(window.location.href);
  const [key, direction] = String(url.searchParams.get("lobbySort") || "").split(":");
  if (key && key in LOBBY_SORT_DIRECTIONS) {
    lobbySortState = {
      key,
      direction: direction === "asc" ? "asc" : "desc"
    };
  } else {
    lobbySortState = { ...LOBBY_SORT_DEFAULT };
  }
  updateLobbySortIndicators();
}

function syncLobbyStateToUrl() {
  const url = new URL(window.location.href);
  if (
    lobbySortState.key === LOBBY_SORT_DEFAULT.key
    && lobbySortState.direction === LOBBY_SORT_DEFAULT.direction
  ) {
    url.searchParams.delete("lobbySort");
  } else {
    url.searchParams.set("lobbySort", `${lobbySortState.key}:${lobbySortState.direction}`);
  }

  window.history.replaceState({ search: url.search }, "", url);
  window.bohaEmbeddedPage?.postState(url.search);
}

function updateLobbySortIndicators() {
  lobbySortHeaders.forEach((header) => {
    const isActive = lobbySortState.key === header.dataset.sortKey;
    header.setAttribute("aria-sort", isActive
      ? (lobbySortState.direction === "asc" ? "ascending" : "descending")
      : "none");

    const button = header.querySelector(".stats-sort-button");
    if (!button) {
      return;
    }

    button.classList.toggle("is-active", isActive);
    button.dataset.direction = isActive ? lobbySortState.direction : "";
  });
}

function setupLobbySortHeaders() {
  lobbySortHeaders.forEach((header) => {
    const button = header.querySelector(".stats-sort-button");
    if (!button || button.dataset.sortBound === "true") {
      return;
    }

    button.dataset.sortBound = "true";
    button.addEventListener("click", () => {
      const key = header.dataset.sortKey;
      if (!key) {
        return;
      }

      lobbySortState = lobbySortState.key === key
        ? { key, direction: lobbySortState.direction === "asc" ? "desc" : "asc" }
        : { key, direction: LOBBY_SORT_DIRECTIONS[key] || "asc" };

      updateLobbySortIndicators();
      if (latestLobbySnapshot) {
        renderLobby(latestLobbySnapshot);
      }
    });
  });

  updateLobbySortIndicators();
}

function renderLobbyLoadingState() {
  lobbyCaption.textContent = "Connecting to lobby feed...";
  lobbyBadge.textContent = "Loading";
  lobbyBadge.classList.remove("is-live");
  setLobbyUpdatedAt(null);
}

function revealOnScroll() {
  if (!("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  revealItems.forEach((item) => observer.observe(item));
}

function updateLobbyStats(games) {
  const players = games.reduce((sum, game) => sum + Number(game.current_players || 0), 0);
  const spectators = games.reduce((sum, game) => sum + Number(game.current_spectators || 0), 0);

  if (statGames) {
    statGames.textContent = String(games.length);
  }
  if (statPlayers) {
    statPlayers.textContent = String(players);
  }
  if (statSpectators) {
    statSpectators.textContent = String(spectators);
  }
}

function formatDateTime(value) {
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

function updateLobbyUpdatedLabel() {
  if (!lobbyUpdated) {
    return;
  }

  if (!lastLobbyUpdatedAt) {
    lobbyUpdated.replaceChildren();
    lobbyUpdated.removeAttribute("title");
    return;
  }

  const absoluteLabel = `Last update: ${formatDateTime(lastLobbyUpdatedAt)}`;
  const relativeLabel = formatRelativeTime(lastLobbyUpdatedAt);
  const absoluteText = document.createElement("span");
  absoluteText.className = "live-board-updated-time";
  absoluteText.textContent = absoluteLabel;

  const relativeText = document.createElement("span");
  relativeText.className = "live-board-updated-relative";
  relativeText.textContent = relativeLabel;

  lobbyUpdated.replaceChildren(absoluteText, relativeText);
  lobbyUpdated.title = `${absoluteLabel} (${relativeLabel})`;
}

function setLobbyUpdatedAt(value) {
  lastLobbyUpdatedAt = value ? new Date(value).toISOString() : null;
  updateLobbyUpdatedLabel();

  if (!lobbyUpdatedTimer) {
    lobbyUpdatedTimer = window.setInterval(updateLobbyUpdatedLabel, 60_000);
  }
}

function getLobbyStatusClass(status) {
  switch (String(status || "").toLowerCase()) {
    case "waiting":
    case "started":
    case "empty":
    case "completed":
      return String(status).toLowerCase();
    default:
      return "unknown";
  }
}

function formatLobbyStatus(status) {
  const value = String(status || "unknown").toLowerCase();
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Unknown";
}

function getLobbyStatusOrder(status) {
  switch (String(status || "").toLowerCase()) {
    case "started":
      return 4;
    case "waiting":
      return 3;
    case "empty":
      return 2;
    case "completed":
      return 1;
    default:
      return 0;
  }
}

function compareLobbyGames(left, right) {
  let result = 0;

  switch (lobbySortState.key) {
    case "host":
      result = compareTextValues(left.host_name || left.host2, right.host_name || right.host2)
        || compareNumberValues(left.game_id, right.game_id);
      break;
    case "spectators":
      result = compareNumberValues(left.current_spectators || 0, right.current_spectators || 0)
        || compareNumberValues(left.current_players || 0, right.current_players || 0);
      break;
    case "status":
      result = compareNumberValues(getLobbyStatusOrder(left.status), getLobbyStatusOrder(right.status))
        || compareNumberValues(left.current_players || 0, right.current_players || 0);
      break;
    case "map":
      result = compareTextValues(left.map_name, right.map_name)
        || compareNumberValues(left.current_players || 0, right.current_players || 0);
      break;
    case "title":
      result = compareTextValues(left.name, right.name)
        || compareNumberValues(left.current_players || 0, right.current_players || 0);
      break;
    case "players":
    default:
      result = compareNumberValues(left.current_players || 0, right.current_players || 0)
        || compareTextValues(left.host_name || left.host2, right.host_name || right.host2)
        || compareNumberValues(left.game_id, right.game_id);
      break;
  }

  return applySortDirection(result, lobbySortState.direction);
}

function renderLobby(lobby) {
  latestLobbySnapshot = lobby;
  const games = [...(lobby.games || [])].sort(compareLobbyGames);

  lobbyCaption.textContent = lobby.motd || "Warzone 2100 lobby";
  updateLobbyStats(games);
  updateLobbySortIndicators();
  syncLobbyStateToUrl();

  if (!games.length) {
    lobbyGames.innerHTML = `
      <tr class="empty-row">
        <td colspan="6">No public games are visible right now.</td>
      </tr>
    `;
    return;
  }

  lobbyGames.innerHTML = games
    .map((game) => {
      const status = String(game.status || "unknown").toLowerCase();
      const mapName = game.map_name || "-";
      const mapImage = `${MAP_IMAGE_BASE}${encodeURIComponent(mapName)}.png`;
      const hostName = escapeHtml(game.host_name || game.host2 || "-");
      const title = escapeHtml(game.name || "-");

      return `
        <tr>
          <td>${hostName}</td>
          <td class="player-count">${Number(game.current_players || 0)}/${Number(game.max_players || 0)}</td>
          <td class="spectator-count">${Number(game.current_spectators || 0)}/${Number(game.max_spectators || 0)}</td>
          <td><span class="status-pill ${getLobbyStatusClass(status)}">${escapeHtml(formatLobbyStatus(status))}</span></td>
          <td>
            <span class="map-cell">
              <img src="${mapImage}" alt="" loading="lazy">
              <span>${escapeHtml(mapName)}</span>
            </span>
          </td>
          <td>${title}</td>
        </tr>
      `;
    })
    .join("");
}

function markLobbyState(online, message, badgeLabel = online ? "Live" : "Offline") {
  lobbyBadge.textContent = badgeLabel;
  lobbyBadge.classList.toggle("is-live", online);
  if (heroStatus) {
    heroStatus.textContent = message;
  }
}

function loadFallbackLobby(message) {
  renderLobby(SAMPLE_LOBBY);
  setLobbyUpdatedAt(null);
  markLobbyState(false, message);
}

async function readLobbySnapshot() {
  const url = new URL(LOBBY_SNAPSHOT_URL);
  url.searchParams.set("t", Date.now().toString());

  const response = await fetch(url, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Unable to load mirrored lobby snapshot (${response.status})`);
  }

  return response.json();
}

async function refreshLobbyFromMirror() {
  const lobby = await readLobbySnapshot();
  renderLobby(lobby);
  setLobbyUpdatedAt(lobby.syncedAt || new Date().toISOString());
  markLobbyState(true, "Lobby snapshot loaded.", "Online");
  return true;
}

function startLobbyMirrorLoop() {
  if (lobbyMirrorTimer) {
    return;
  }

  lobbyMirrorTimer = window.setInterval(() => {
    refreshLobbyFromMirror().catch((error) => {
      console.warn("Unable to refresh lobby snapshot.", error);
    });
  }, LOBBY_REFRESH_MS);
}

async function connectLobbyStream() {
  if (window.location.protocol === "file:") {
    loadFallbackLobby("Live lobby is unavailable in file preview. Serve this page from the site to enable streaming.");
    return;
  }

  if (USE_REMOTE_LOBBY_MIRROR) {
    try {
      await refreshLobbyFromMirror();
      startLobbyMirrorLoop();
    } catch (error) {
      console.warn("Unable to load mirrored lobby snapshot.", error);
      loadFallbackLobby("Lobby mirror unavailable right now.");
    }
    return;
  }

  let hasReceivedData = false;

  try {
    const stream = new EventSource("lobby.http-event-stream.json");

    stream.onmessage = (event) => {
      hasReceivedData = true;
      const lobby = JSON.parse(event.data);
      renderLobby(lobby);
      setLobbyUpdatedAt(new Date().toISOString());
      markLobbyState(true, "Lobby stream connected. Updates arrive without refreshing the page.");
    };

    stream.onerror = () => {
      if (!hasReceivedData) {
        stream.close();
        refreshLobbyFromMirror()
          .catch(() => {
            loadFallbackLobby("Lobby stream unavailable here. Lobby snapshot also could not be loaded.");
          });
      } else {
        markLobbyState(false, "Lobby stream interrupted. Waiting for reconnection...");
      }
    };
  } catch (error) {
    loadFallbackLobby("Lobby stream failed to initialize in this environment.");
  }
}

function setupCopyButtons() {
  document.querySelectorAll("[data-copy-target]").forEach((button) => {
    button.addEventListener("click", async () => {
      const target = document.getElementById(button.dataset.copyTarget);
      if (!target) {
        return;
      }

      try {
        await navigator.clipboard.writeText(target.textContent.trim());
        const previous = button.textContent;
        button.textContent = "Copied";
        window.setTimeout(() => {
          button.textContent = previous;
        }, 1400);
      } catch (error) {
        button.textContent = "Copy failed";
      }
    });
  });
}

revealOnScroll();
parseLobbyStateFromUrl();
setupLobbySortHeaders();
renderLobbyLoadingState();
setupCopyButtons();
connectLobbyStream();

window.addEventListener("popstate", () => {
  parseLobbyStateFromUrl();
  if (latestLobbySnapshot) {
    renderLobby(latestLobbySnapshot);
  }
});
