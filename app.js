const revealItems = document.querySelectorAll("[data-reveal]");
const lobbyCaption = document.getElementById("lobbyCaption");
const lobbyGames = document.getElementById("lobbyGames");
const lobbyBadge = document.getElementById("lobbyBadge");
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
const LOBBY_REFRESH_MS = 10_000;
const SAMPLE_LOBBY = {
  motd: "Deploy alongside lobby endpoints to activate the live feed.",
  games: []
};
let lobbyMirrorTimer = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

function renderLobby(lobby) {
  const games = [...(lobby.games || [])].sort(
    (a, b) =>
      1000000 * ((b.current_players || 0) - (a.current_players || 0)) +
      1000 * ((b.host2 || "") < (a.host2 || "") ? 1 : (b.host2 || "") > (a.host2 || "") ? -1 : 0) +
      ((b.game_id || 0) - (a.game_id || 0))
  );

  lobbyCaption.textContent = lobby.motd || "Warzone 2100 lobby";
  updateLobbyStats(games);

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

  const lastUpdateLabel = lobby.syncedAt
    ? `Last update: ${formatDateTime(lobby.syncedAt)}`
    : "Lobby snapshot loaded.";

  markLobbyState(true, lastUpdateLabel, "Online");
  return true;
}

function startLobbyMirrorLoop() {
  if (lobbyMirrorTimer || !USE_POLLING_LOBBY_SOURCE) {
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
renderLobby(SAMPLE_LOBBY);
setupCopyButtons();
connectLobbyStream();
