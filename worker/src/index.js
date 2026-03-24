const UPSTREAM_LOBBY_URL = "https://warzone2100.retropaganda.info/lobby.txt";

function buildCorsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type"
  };
}

function jsonResponse(payload, init = {}) {
  const headers = new Headers(init.headers || {});
  const corsHeaders = buildCorsHeaders();

  Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");

  return new Response(JSON.stringify(payload), {
    ...init,
    headers
  });
}

function textResponse(text, init = {}) {
  const headers = new Headers(init.headers || {});
  const corsHeaders = buildCorsHeaders();

  Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));
  headers.set("content-type", "text/plain; charset=utf-8");
  headers.set("cache-control", "no-store");

  return new Response(text, {
    ...init,
    headers
  });
}

function parseRatioPair(value) {
  const match = String(value || "").match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) {
    return { current: 0, max: 0 };
  }

  return {
    current: Number(match[1]),
    max: Number(match[2])
  };
}

function getStatusPriority(status) {
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

function parseLobbySnapshot(text, syncedAt, sourceLastModified = "") {
  const motdLines = [];
  const gamesByKey = new Map();
  const lines = String(text).replace(/\r/g, "").split("\n");
  let readingMotd = false;
  let gameCount = 0;
  let inTable = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, "  ").trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      readingMotd = false;
      continue;
    }

    if (trimmed === "MotD:") {
      readingMotd = true;
      continue;
    }

    if (readingMotd) {
      motdLines.push(trimmed);
      continue;
    }

    const gameCountMatch = trimmed.match(/^Game count:\s*(\d+)/i);
    if (gameCountMatch) {
      gameCount = Number(gameCountMatch[1]);
      continue;
    }

    if (trimmed.startsWith("Confederate address")) {
      inTable = true;
      continue;
    }

    if (!inTable) {
      continue;
    }

    const columns = trimmed.split(/\s{2,}/);
    if (columns.length < 10) {
      continue;
    }

    const [
      confederateAddress,
      confederatePortText,
      hostAddress,
      hostPortText,
      spectatorsText,
      playersText,
      statusText,
      mapName,
      hostName,
      ...titleParts
    ] = columns;

    const spectators = parseRatioPair(spectatorsText);
    const players = parseRatioPair(playersText);
    const status = String(statusText || "").toLowerCase();
    const hostPort = Number(hostPortText || 0);
    const confederatePort = Number(confederatePortText || 0);
    const dedupeKey = `${hostAddress}:${hostPort}`;
    const title = titleParts.join("  ").trim() || hostName || hostAddress;

    const nextGame = {
      game_id: hostPort,
      confederate_address: confederateAddress,
      confederate_port: confederatePort,
      host_address: hostAddress,
      host_port: hostPort,
      host_name: hostName,
      host2: hostAddress,
      current_spectators: spectators.current,
      max_spectators: spectators.max,
      current_players: players.current,
      max_players: players.max,
      status,
      map_name: mapName,
      name: title
    };

    const existingGame = gamesByKey.get(dedupeKey);
    if (!existingGame || getStatusPriority(status) >= getStatusPriority(existingGame.status)) {
      gamesByKey.set(dedupeKey, nextGame);
    }
  }

  const games = [...gamesByKey.values()].filter((game) => game.status !== "completed");

  return {
    sourceUrl: UPSTREAM_LOBBY_URL,
    syncedAt,
    sourceLastModified,
    motd: motdLines[0] || "Warzone 2100 lobby",
    motdLines,
    gameCount,
    games
  };
}

async function fetchUpstreamLobby(env) {
  if (!env.UPSTREAM_BASIC_USER || !env.UPSTREAM_BASIC_PASSWORD) {
    throw new Error("Missing UPSTREAM_BASIC_USER or UPSTREAM_BASIC_PASSWORD.");
  }

  const authHeader = `Basic ${btoa(`${env.UPSTREAM_BASIC_USER}:${env.UPSTREAM_BASIC_PASSWORD}`)}`;
  const response = await fetch(UPSTREAM_LOBBY_URL, {
    headers: {
      Authorization: authHeader,
      Accept: "text/plain, */*"
    },
    cf: {
      cacheEverything: false,
      cacheTtl: 0
    }
  });

  if (!response.ok) {
    throw new Error(`Upstream returned HTTP ${response.status}.`);
  }

  return response;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders()
      });
    }

    if (url.pathname === "/healthz") {
      return jsonResponse({
        ok: true,
        upstream: UPSTREAM_LOBBY_URL
      });
    }

    if (url.pathname !== "/lobby" && url.pathname !== "/lobby.txt") {
      return jsonResponse({
        error: "Not found."
      }, { status: 404 });
    }

    try {
      const upstream = await fetchUpstreamLobby(env);
      const sourceLastModified = String(upstream.headers.get("last-modified") || "");
      const text = await upstream.text();

      if (url.pathname === "/lobby.txt") {
        return textResponse(text);
      }

      const snapshot = parseLobbySnapshot(text, new Date().toISOString(), sourceLastModified);
      return jsonResponse(snapshot);
    } catch (error) {
      return jsonResponse({
        error: error.message || "Unable to load upstream lobby."
      }, { status: 502 });
    }
  }
};
