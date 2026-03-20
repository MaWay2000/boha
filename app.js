const revealItems = document.querySelectorAll("[data-reveal]");
const lobbyCaption = document.getElementById("lobbyCaption");
const lobbyGames = document.getElementById("lobbyGames");
const lobbyBadge = document.getElementById("lobbyBadge");
const lobbyStatus = document.getElementById("lobbyStatus");
const heroStatus = document.getElementById("heroStatus");
const statGames = document.getElementById("statGames");
const statPlayers = document.getElementById("statPlayers");
const statSpectators = document.getElementById("statSpectators");

const MAP_IMAGE_BASE = "https://warzone2100.retropaganda.info/images/maps/";
const SAMPLE_LOBBY = {
  motd: "Deploy alongside lobby endpoints to activate the live feed.",
  games: []
};

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

  statGames.textContent = String(games.length);
  statPlayers.textContent = String(players);
  statSpectators.textContent = String(spectators);
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
          <td><span class="status-pill ${status === "waiting" || status === "started" ? status : "unknown"}">${escapeHtml(status)}</span></td>
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

function markLobbyState(online, message) {
  lobbyBadge.textContent = online ? "Live" : "Offline";
  lobbyBadge.classList.toggle("is-live", online);
  heroStatus.textContent = message;
  lobbyStatus.textContent = message;
}

function loadFallbackLobby(message) {
  renderLobby(SAMPLE_LOBBY);
  markLobbyState(false, message);
}

function connectLobbyStream() {
  if (window.location.protocol === "file:") {
    loadFallbackLobby("Live lobby is unavailable in file preview. Serve this page from the site to enable streaming.");
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
        loadFallbackLobby("Lobby stream unavailable here. Deploy beside the lobby endpoints to restore live data.");
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
