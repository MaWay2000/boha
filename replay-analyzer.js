(function () {
  const wzstatsPublishedUrl = new URL("stats/published/matches.json", document.baseURI);
  const replayFile = document.getElementById("replayFile");
  const replayFileName = document.getElementById("replayFileName");
  const replayUrl = document.getElementById("replayUrl");
  const replayUrlGo = document.getElementById("replayUrlGo");
  const status = document.getElementById("replayStatus");
  const demoButton = document.getElementById("replayDemo");
  const demoButtons = document.createElement("span");
  demoButtons.style.display = "inline-flex";
  demoButtons.style.gap = "8px";
  demoButtons.style.alignItems = "center";
  demoButton.before(demoButtons);
  demoButtons.append(demoButton);
  const demoButton2 = demoButton.cloneNode(true);
  demoButton2.id = "replayDemo2";
  demoButton2.textContent = "Test demo 2";
  demoButtons.append(demoButton2);
  const results = document.getElementById("replayResults");
  const summary = document.getElementById("replaySummary");
  const matchSummary = document.getElementById("replayMatchSummary");
  const playersBody = document.getElementById("replayPlayers");
  const playersHead = playersBody.closest("table").querySelector("thead");
  const messagesBody = document.getElementById("replayMessages");
  const eventsBody = document.getElementById("replayEvents");
  const eventsNote = document.getElementById("replayEventsNote");
  const eventCategory = document.getElementById("replayEventCategory");
  const eventPlayer = document.getElementById("replayEventPlayer");
  const eventSearch = document.getElementById("replayEventSearch");
  const snapshotPanel = document.getElementById("replaySnapshotPanel");
  const snapshotMeta = document.getElementById("replaySnapshotMeta");
  const snapshotRange = document.getElementById("replaySnapshotRange");
  const snapshotTime = document.getElementById("replaySnapshotTime");
  const snapshotPlayers = document.getElementById("replaySnapshotPlayers");
  const battlefieldPanel = document.getElementById("replayBattlefieldPanel");
  const battlefieldMeta = document.getElementById("replayBattlefieldMeta");
  const battlefieldPlay = document.getElementById("replayBattlefieldPlay");
  const battlefieldSpeed = document.getElementById("replayBattlefieldSpeed");
  const battlefieldDroids = document.getElementById("replayBattlefieldDroids");
  const battlefieldStructures = document.getElementById("replayBattlefieldStructures");
  const battlefieldBackground = document.getElementById("replayBattlefieldBackground");
  const battlefieldZoomOut = document.getElementById("replayBattlefieldZoomOut");
  const battlefieldZoomIn = document.getElementById("replayBattlefieldZoomIn");
  const battlefieldResetView = document.getElementById("replayBattlefieldResetView");
  const battlefieldFullscreen = document.getElementById("replayBattlefieldFullscreen");
  const battlefieldZoom = document.getElementById("replayBattlefieldZoom");
  const battlefieldCanvas = document.getElementById("replayBattlefieldCanvas");
  const battlefieldMinimap = document.getElementById("replayBattlefieldMinimap");
  const battlefieldLegend = document.getElementById("replayBattlefieldLegend");
  const battlefieldRange = document.getElementById("replayBattlefieldRange");
  const battlefieldTime = document.getElementById("replayBattlefieldTime");
  const battlefieldDuration = document.getElementById("replayBattlefieldDuration");
  const battlefieldStatus = document.getElementById("replayBattlefieldStatus");
  const researchPanel = document.getElementById("replayResearchPanel");
  const researchMeta = document.getElementById("replayResearchMeta");
  const researchPlayer = document.getElementById("replayResearchPlayer");
  const researchSearch = document.getElementById("replayResearchSearch");
  const researchNote = document.getElementById("replayResearchNote");
  const researchEvents = document.getElementById("replayResearchEvents");
  const rawJson = document.getElementById("replayRawJson");
  const playerStoryPopup = document.createElement("div");
  playerStoryPopup.className = "replay-player-story-popup";
  playerStoryPopup.hidden = true;
  document.body.append(playerStoryPopup);

  const textDecoder = new TextDecoder("utf-8", { fatal: true });
  const displayedEventLimit = 500;
  const displayedResearchLimit = 500;
  const messageTypeNames = Object.freeze({
    112: "GAME_DROIDINFO",
    113: "GAME_STRUCTUREINFO",
    114: "GAME_RESEARCHSTATUS",
    115: "GAME_TEMPLATE",
    116: "GAME_TEMPLATEDEST",
    117: "GAME_ALLIANCE",
    118: "GAME_GIFT",
    119: "GAME_LASSAT",
    120: "GAME_GAME_TIME",
    121: "GAME_PLAYER_LEFT",
    122: "GAME_DROIDDISEMBARK",
    123: "GAME_SYNC_REQUEST",
    124: "GAME_DEBUG_MODE",
    125: "GAME_DEBUG_ADD_DROID",
    126: "GAME_DEBUG_ADD_STRUCTURE",
    127: "GAME_DEBUG_ADD_FEATURE",
    128: "GAME_DEBUG_REMOVE_DROID",
    129: "GAME_DEBUG_REMOVE_STRUCTURE",
    130: "GAME_DEBUG_REMOVE_FEATURE",
    131: "GAME_DEBUG_FINISH_RESEARCH",
    132: "GAME_SYNC_OPT_CHANGE",
    255: "REPLAY_ENDED"
  });
  const droidOrderNames = Object.freeze({
    0: "None",
    1: "Stop",
    2: "Move",
    3: "Attack",
    4: "Build",
    5: "Help build",
    6: "Line build",
    7: "Demolish",
    8: "Repair structure",
    9: "Observe",
    10: "Fire support",
    13: "Return to base",
    14: "Return to repair",
    16: "Embark",
    17: "Disembark",
    18: "Attack target",
    19: "Commander support",
    20: "Build module",
    21: "Recycle",
    22: "Transport out",
    23: "Transport in",
    24: "Transport return",
    25: "Guard",
    26: "Repair droid",
    27: "Restore",
    28: "Scout",
    31: "Patrol",
    32: "Rearm",
    33: "Recover artifact",
    35: "Return to specified repair",
    40: "Circle",
    41: "Hold"
  });
  const structureActionNames = Object.freeze([
    "Manufacture",
    "Cancel production",
    "Hold production",
    "Release production",
    "Hold research",
    "Release research"
  ]);
  const giftTypeNames = Object.freeze({
    1: "Radar gift",
    2: "Droid gift",
    3: "Research gift",
    4: "Power gift",
    5: "Structure gift",
    6: "Autogame gift"
  });
  const varUintFactors = Object.freeze([78, 95, 32, 70, 0]);
  const varUintMultipliers = Object.freeze([1, 78, 7410, 237120, 16598400]);
  const playerColours = Object.freeze([
    { name: "Green", value: "#107010" },
    { name: "Orange", value: "#ffb035" },
    { name: "Grey", value: "#909090" },
    { name: "Black", value: "#202020" },
    { name: "Red", value: "#9b0f0f" },
    { name: "Blue", value: "#2731b9" },
    { name: "Pink", value: "#d010b0" },
    { name: "Cyan", value: "#20d0d0" },
    { name: "Yellow", value: "#f0e810" },
    { name: "Purple", value: "#700074" },
    { name: "White", value: "#e0e0e0" },
    { name: "Bright blue", value: "#2020ff" },
    { name: "Neon green", value: "#00a000" },
    { name: "Infrared", value: "#400000" },
    { name: "Ultraviolet", value: "#100040" },
    { name: "Brown", value: "#406000" }
  ]);
  let latestExtraction = null;
  let analysisRunning = false;
  let latestReplayId = "";
  let latestReplaySha256 = "";
  let playerSortState = { key: "position", direction: "asc" };
  let battlefieldFrames = [];
  let battlefieldExtraction = null;
  let battlefieldCurrentTime = 0;
  let battlefieldPlaying = false;
  let battlefieldAnimationFrame = 0;
  let battlefieldLastTick = 0;
  let battlefieldLastDraw = 0;
  let battlefieldTerrain = null;
  let battlefieldDroidDefinitions = new Map();
  let battlefieldStructureDefinitions = new Map();
  let battlefieldModelLibraryPromise = null;
  const battlefieldSpriteCache = new Map();
  const battlefieldHiddenPlayers = new Set();
  const battlefieldView = { scale: 1, offsetX: 0, offsetY: 0 };
  let battlefieldPan = null;

  class ReplayMessageReader {
    constructor(bytes) {
      this.bytes = bytes;
      this.offset = 0;
    }

    ensure(length) {
      if (length < 0 || this.offset + length > this.bytes.length) {
        throw new Error("Message payload is truncated.");
      }
    }

    uint8() {
      this.ensure(1);
      return this.bytes[this.offset++];
    }

    int8() {
      const value = this.uint8();
      return value > 127 ? value - 256 : value;
    }

    uint16() {
      this.ensure(2);
      const value = this.bytes[this.offset] * 256 + this.bytes[this.offset + 1];
      this.offset += 2;
      return value;
    }

    uint32() {
      let value = 0;

      for (let index = 0; index < varUintFactors.length; index += 1) {
        const byte = this.uint8();
        const factor = varUintFactors[index];
        const multiplier = varUintMultipliers[index];
        const isLastByte = byte < 256 - factor;
        value += (isLastByte ? byte : 256 - factor + 255 - byte) * multiplier;

        if (isLastByte) {
          return value;
        }
      }

      throw new Error("Invalid compressed integer.");
    }

    int32() {
      const value = this.uint32();
      return value % 2 === 0 ? value / 2 : -((value + 1) / 2);
    }

    boolean() {
      return this.uint8() !== 0;
    }

    string() {
      const length = this.uint32();
      this.ensure(length);
      const value = textDecoder.decode(this.bytes.subarray(this.offset, this.offset + length));
      this.offset += length;
      return value;
    }

    done() {
      return this.offset === this.bytes.length;
    }
  }

  function assertRange(offset, length, totalLength, label) {
    if (offset < 0 || length < 0 || offset + length > totalLength) {
      throw new Error(`The replay is truncated while reading ${label}.`);
    }
  }

  function readJson(bytes, offset, length, label) {
    assertRange(offset, length, bytes.length, label);

    try {
      return JSON.parse(textDecoder.decode(bytes.subarray(offset, offset + length)));
    } catch (error) {
      throw new Error(`The replay contains invalid ${label} JSON.`);
    }
  }

  function extractReplayId(value) {
    const match = String(value || "").match(/(\d{10,})(?:\.wzrp)?(?:[?#].*)?$/i);
    return match ? match[1] : "";
  }

  function extractReplaySha256(value) {
    const match = String(value || "").match(/\/replays\/([a-f0-9]{64})(?:[/?#]|$)/i);
    return match ? match[1].toLowerCase() : "";
  }

  async function decodeGzipBase64Json(value) {
    if (typeof DecompressionStream !== "function") {
      throw new Error("This browser cannot expand compressed replay telemetry.");
    }
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(stream).text());
  }

  async function expandCompressedEngineAnalysis(engineAnalysis) {
    const extended = engineAnalysis?.extended;
    if (!extended) {
      return;
    }
    try {
      if (extended.snapshotsEncoding === "gzip+base64"
          && typeof extended.snapshotsGzipBase64 === "string") {
        extended.snapshots = await decodeGzipBase64Json(extended.snapshotsGzipBase64);
        delete extended.snapshotsGzipBase64;
      }
      const tacticalReplay = extended.tacticalReplay;
      if (tacticalReplay?.positionFramesEncoding === "gzip+base64"
          && typeof tacticalReplay.positionFramesGzipBase64 === "string") {
        tacticalReplay.positionFrames = await decodeGzipBase64Json(tacticalReplay.positionFramesGzipBase64);
        delete tacticalReplay.positionFramesGzipBase64;
      }
    } catch (error) {
      console.warn("Unable to expand compressed replay telemetry.", error);
    }
  }

  async function loadWzstatsResult(replaySha256) {
    if (!replaySha256) {
      return null;
    }

    const matchesResponse = await fetch(wzstatsPublishedUrl, { cache: "no-store" });
    if (!matchesResponse.ok) {
      throw new Error(`Unable to load wz2100.uk match index (${matchesResponse.status}).`);
    }

    const matchesPayload = await matchesResponse.json();
    const match = (matchesPayload.matches || []).find((item) => item.replay_sha256 === replaySha256);
    if (!match) {
      return null;
    }

    let detailMatch = null;
    try {
      const detailResponse = await fetch(`https://onit.lt/wzstats/api/v1/matches/${encodeURIComponent(match.id)}`, {
        cache: "no-store"
      });
      if (detailResponse.ok) {
        const detailPayload = await detailResponse.json();
        detailMatch = detailPayload.match || null;
        await expandCompressedEngineAnalysis(detailMatch?.telemetry?.engineAnalysis);
      }
    } catch (error) {
      detailMatch = null;
    }

    const players = Array.isArray(detailMatch?.players) ? detailMatch.players : (match.players || []);

    return {
      replayUrl: match.replay_url,
      endDate: (detailMatch?.ended_at || match.ended_at)
        ? `${(detailMatch?.ended_at || match.ended_at).replace(" ", "T")}Z`
        : null,
      partialStats: true,
      engineAnalysis: detailMatch?.telemetry?.engineAnalysis || null,
      playerData: players.map((player) => {
        const hasReplayEngineStats = player.stats_source === "replay-engine";
        let rawPlayer = {};
        if (hasReplayEngineStats) {
          try {
            rawPlayer = typeof player.raw_json === "string"
              ? JSON.parse(player.raw_json)
              : (player.raw_json || {});
          } catch (error) {
            rawPlayer = {};
          }
        }

        return {
          position: player.position ?? player.position_number,
          usertype: hasReplayEngineStats ? player.result : null,
          kills: hasReplayEngineStats ? player.kills : null,
          droidsBuilt: hasReplayEngineStats ? player.droids_built : null,
          droidsLost: hasReplayEngineStats ? player.droids_lost : null,
          structuresBuilt: hasReplayEngineStats ? player.structures_built : null,
          structuresLost: hasReplayEngineStats ? player.structures_lost : null,
          structureKills: hasReplayEngineStats ? player.structures_destroyed : null,
          researchComplete: hasReplayEngineStats ? player.research_complete : null,
          score: hasReplayEngineStats ? player.score : null,
          power: hasReplayEngineStats ? player.power : null,
          oilRigs: hasReplayEngineStats ? player.oil_rigs : null,
          droids: hasReplayEngineStats ? player.remaining_droids : null,
          structs: hasReplayEngineStats ? player.remaining_structures : null,
          statsSource: hasReplayEngineStats ? player.stats_source : null,
          labResearchPerformance: rawPlayer.labResearchPerformance ?? rawPlayer.recentResearchPerformance,
          labResearchPotential: rawPlayer.labResearchPotential ?? rawPlayer.recentResearchPotential,
          playerLeftGameTime: rawPlayer.playerLeftGameTime
        };
      })
    };
  }

  function attachPublishedPlayerStats(extraction, publishedResult) {
    const publishedPlayers = publishedResult && Array.isArray(publishedResult.playerData)
      ? publishedResult.playerData
      : [];
    const playersByPosition = new Map(
      publishedPlayers.map((player) => [Number(player.position), player])
    );

    let playersMatched = 0;
    extraction.players.forEach((player) => {
      const published = playersByPosition.get(Number(player.position));
      if (!published) {
        player.summary = null;
        return;
      }

      playersMatched += 1;
      player.summary = {
        partialStats: Boolean(publishedResult.partialStats),
        result: published.usertype || "",
        kills: published.kills,
        droidsBuilt: published.droidsBuilt,
        droidsLost: published.droidsLost,
        structuresBuilt: published.structuresBuilt,
        structuresLost: published.structuresLost,
        structuresDestroyed: published.structureKills,
        researchComplete: published.researchComplete,
        score: published.score,
        power: published.power,
        oilRigs: published.oilRigs,
        remainingDroids: published.droids,
        remainingStructures: published.structs,
        labResearchPerformance: published.labResearchPerformance,
        labResearchPotential: published.labResearchPotential,
        playerLeftGameTime: published.playerLeftGameTime,
        statsSource: published.statsSource
      };
    });

    extraction.publishedStats = publishedResult
      ? {
          replayUrl: publishedResult.replayUrl,
          endDate: publishedResult.endDate,
          partialStats: Boolean(publishedResult.partialStats),
          playersMatched
        }
      : null;
    extraction.engineAnalysis = publishedResult?.engineAnalysis || null;
  }

  function decodeGameTime(payload) {
    const reader = new ReplayMessageReader(payload);
    const event = {
      latencyTicks: reader.uint32(),
      gameTime: reader.uint32(),
      checksum: reader.uint16(),
      wantedLatency: reader.uint16()
    };

    if (!reader.done()) {
      throw new Error("Unexpected game-time payload data.");
    }

    return event;
  }

  function decodeResearch(payload) {
    const reader = new ReplayMessageReader(payload);
    const player = reader.uint8();
    const started = reader.boolean();
    const structureId = reader.uint32();
    const researchIndex = reader.uint32();

    if (!reader.done()) {
      throw new Error("Unexpected research payload data.");
    }

    return {
      player,
      category: "Research",
      action: started ? "Research started" : "Research stopped",
      details: `Topic #${researchIndex}${structureId ? ` in lab ${structureId}` : ""}`,
      data: { started, structureId, researchIndex }
    };
  }

  function decodeStructure(payload) {
    const reader = new ReplayMessageReader(payload);
    const player = reader.uint8();
    const structureId = reader.uint32();
    const actionCode = reader.uint8();
    const action = structureActionNames[actionCode] || `Structure action #${actionCode}`;
    const data = { structureId, actionCode };
    let details = `Structure ${structureId}`;

    if (actionCode === 0) {
      data.templateName = reader.string();
      data.templateId = reader.uint32();
      data.droidType = reader.int32();
      data.body = reader.uint8();
      data.brain = reader.uint8();
      data.propulsion = reader.uint8();
      data.repairUnit = reader.uint8();
      data.ecm = reader.uint8();
      data.sensor = reader.uint8();
      data.construct = reader.uint8();
      const weaponCount = reader.int8();
      data.weapons = [];

      if (weaponCount < 0 || weaponCount > 16) {
        throw new Error("Invalid manufactured-unit weapon count.");
      }

      for (let index = 0; index < weaponCount; index += 1) {
        data.weapons.push(reader.uint32());
      }

      details = `${data.templateName || `Template #${data.templateId}`} at factory ${structureId}`;
    }

    if (!reader.done()) {
      throw new Error("Unexpected structure payload data.");
    }

    return {
      player,
      category: "Production",
      action,
      details,
      data
    };
  }

  function decodeGift(payload) {
    const reader = new ReplayMessageReader(payload);
    const giftType = reader.uint8();
    const from = reader.uint8();
    const to = reader.uint8();
    const objectId = reader.uint32();

    if (!reader.done()) {
      throw new Error("Unexpected gift payload data.");
    }

    return {
      player: from,
      category: "Gift",
      action: giftTypeNames[giftType] || `Gift #${giftType}`,
      details: `Player ${from} → player ${to}${objectId ? `, object/value ${objectId}` : ""}`,
      data: { giftType, from, to, objectId }
    };
  }

  function decodeLasSat(payload) {
    const reader = new ReplayMessageReader(payload);
    const player = reader.uint8();
    const structureId = reader.uint32();
    const targetId = reader.uint32();
    const targetPlayer = reader.uint8();

    if (!reader.done()) {
      throw new Error("Unexpected laser-satellite payload data.");
    }

    return {
      player,
      category: "Combat",
      action: "Laser satellite fired",
      details: `Structure ${structureId} → player ${targetPlayer}, object ${targetId}`,
      data: { structureId, targetId, targetPlayer }
    };
  }

  function decodePlayerLeft(payload) {
    const reader = new ReplayMessageReader(payload);
    const player = reader.uint32();

    if (!reader.done()) {
      throw new Error("Unexpected player-left payload data.");
    }

    return {
      player,
      category: "Player",
      action: "Player left",
      details: `Player ${player} left the game`,
      data: { player }
    };
  }

  function decodeDroidOrder(payload) {
    const reader = new ReplayMessageReader(payload);
    const player = reader.uint8();
    const subType = reader.uint32();
    const data = { subType, droidIds: [] };
    let action = "Secondary droid order";
    let details = "";

    if (subType === 0 || subType === 1) {
      data.order = reader.uint32();
      action = droidOrderNames[data.order] || `Droid order #${data.order}`;

      if (subType === 0) {
        data.targetId = reader.uint32();
        data.targetType = reader.uint32();
      } else {
        data.x = reader.int32();
        data.y = reader.int32();
      }

      if (data.order === 4 || data.order === 6) {
        data.structureRef = reader.uint32();
        data.direction = reader.uint16();
      }

      if (data.order === 6) {
        data.x2 = reader.int32();
        data.y2 = reader.int32();
      }

      if (data.order === 20) {
        data.moduleIndex = reader.uint32();
      }

      data.add = reader.boolean();
    } else if (subType === 2) {
      data.secondaryOrder = reader.uint32();
      data.secondaryState = reader.uint32();
      action = `Secondary order #${data.secondaryOrder}`;
    } else {
      throw new Error(`Unknown droid-order subtype ${subType}.`);
    }

    const droidCount = reader.uint32();
    let droidId = 0;

    if (droidCount > 10000) {
      throw new Error("Invalid droid-order count.");
    }

    for (let index = 0; index < droidCount; index += 1) {
      droidId += reader.uint32();
      data.droidIds.push(droidId);
    }

    if (!reader.done()) {
      throw new Error("Unexpected droid-order payload data.");
    }

    if (subType === 0) {
      details = `${droidCount} droid${droidCount === 1 ? "" : "s"} → object ${data.targetId}`;
    } else if (subType === 1) {
      details = `${droidCount} droid${droidCount === 1 ? "" : "s"} at ${data.x}, ${data.y}`;
      if (data.structureRef) {
        details += `, structure ref ${data.structureRef}`;
      }
    } else {
      details = `${droidCount} droid${droidCount === 1 ? "" : "s"}, state ${data.secondaryState}`;
    }

    return {
      player,
      category: "Droid order",
      action,
      details,
      data
    };
  }

  function decodeEvent(type, payload) {
    switch (type) {
    case 112:
      return decodeDroidOrder(payload);
    case 113:
      return decodeStructure(payload);
    case 114:
      return decodeResearch(payload);
    case 118:
      return decodeGift(payload);
    case 119:
      return decodeLasSat(payload);
    case 121:
      return decodePlayerLeft(payload);
    case 255:
      return {
        player: null,
        category: "Replay",
        action: "Replay ended",
        details: "End-of-replay marker",
        data: {}
      };
    default:
      return null;
    }
  }

  function parseReplay(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);

    if (bytes.length < 16) {
      throw new Error("This file is too small to be a Warzone replay.");
    }

    if (view.getUint32(0, false) !== 0x575a7270) {
      throw new Error("Invalid replay header. Expected a WZrp file.");
    }

    const headerLength = view.getUint32(4, false);
    const headerOffset = 8;
    const header = readJson(bytes, headerOffset, headerLength, "header");
    const replayFormat = Number(header.replayFormatVer || 0);
    let messageOffset = headerOffset + headerLength;
    let embeddedMapVersion = null;
    let embeddedMapBytes = 0;
    let embeddedMapArchive = null;

    if (replayFormat >= 2) {
      assertRange(messageOffset, 8, bytes.length, "embedded map header");
      embeddedMapVersion = view.getUint32(messageOffset, false);
      embeddedMapBytes = view.getUint32(messageOffset + 4, false);
      messageOffset += 8;
      assertRange(messageOffset, embeddedMapBytes, bytes.length, "embedded map");
      embeddedMapArchive = bytes.slice(messageOffset, messageOffset + embeddedMapBytes);
      messageOffset += embeddedMapBytes;
    }

    assertRange(bytes.length - 4, 4, bytes.length, "end marker");
    const endJsonLength = view.getUint32(bytes.length - 4, false);
    const endJsonOffset = bytes.length - 4 - endJsonLength;
    assertRange(endJsonOffset - 4, endJsonLength + 8, bytes.length, "end information");

    if (view.getUint32(endJsonOffset - 4, false) !== endJsonLength) {
      throw new Error("The replay end information is malformed.");
    }

    const endInfo = readJson(bytes, endJsonOffset, endJsonLength, "end information");
    const messageEnd = endJsonOffset - 4;
    const messageTypes = new Map();
    const queueTimes = new Map();
    const decodedEvents = [];
    const decodeErrors = new Map();
    let messageCount = 0;
    let cursor = messageOffset;

    while (cursor < messageEnd) {
      assertRange(cursor, 4, messageEnd, "network message header");
      const player = view.getUint8(cursor);
      const type = view.getUint8(cursor + 1);
      const payloadLength = view.getUint16(cursor + 2, false);
      cursor += 4;
      assertRange(cursor, payloadLength, messageEnd, `network message type ${type}`);
      const payload = bytes.subarray(cursor, cursor + payloadLength);

      if (!messageTypes.has(type)) {
        messageTypes.set(type, {
          type,
          name: messageTypeNames[type] || "UNKNOWN",
          count: 0,
          payloadBytes: 0,
          players: new Set(),
          decodedEvents: 0
        });
      }

      const item = messageTypes.get(type);
      item.count += 1;
      item.payloadBytes += payloadLength;
      item.players.add(player);
      messageCount += 1;

      try {
        if (type === 120) {
          const gameTime = decodeGameTime(payload);
          queueTimes.set(player, gameTime.gameTime);
        } else {
          const event = decodeEvent(type, payload);
          if (event) {
            event.time = queueTimes.has(player) ? queueTimes.get(player) : null;
            event.queuePlayer = player;
            event.messageType = type;
            decodedEvents.push(event);
            item.decodedEvents += 1;
          }
        }
      } catch (error) {
        decodeErrors.set(type, (decodeErrors.get(type) || 0) + 1);
      }

      cursor += payloadLength;
    }

    if (cursor !== messageEnd) {
      throw new Error("The network message stream does not end cleanly.");
    }

    const gameOptions = header.gameOptions || {};
    const allPlayers = Array.isArray(gameOptions["netplay.players"])
      ? gameOptions["netplay.players"]
      : [];
    const activePlayers = allPlayers.filter((player) => player && (player.allocated || player.name));
    const game = gameOptions.game || {};
    const decodedCategoryCounts = decodedEvents.reduce((counts, event) => {
      counts[event.category] = (counts[event.category] || 0) + 1;
      return counts;
    }, {});

    const extraction = {
      format: {
        magic: "WZrp",
        replayFormat,
        netcodeMajor: header.major,
        netcodeMinor: header.minor,
        gameVersion: gameOptions.versionString || "Unknown"
      },
      file: {
        bytes: bytes.length,
        headerBytes: headerLength,
        embeddedMapVersion,
        embeddedMapBytes,
        networkMessageBytes: messageEnd - messageOffset
      },
      match: {
        name: game.name || "",
        map: game.map || "Unknown",
        maxPlayers: game.maxPlayers,
        type: game.type,
        alliance: game.alliance,
        base: game.base,
        power: game.power,
        scavengers: game.scavengers,
        techLevel: game.techLevel,
        timeLimitMinutes: game.gameTimeLimitMinutes,
        elapsedMilliseconds: endInfo.gameTimeElapsed
      },
      players: activePlayers.map((player) => ({
        name: player.name || "Unnamed",
        position: player.position,
        team: player.team,
        colour: player.colour,
        faction: player.faction,
        ai: player.ai,
        spectator: Boolean(player.isSpectator),
        admin: Boolean(player.isAdmin)
      })),
      messages: {
        count: messageCount,
        types: Array.from(messageTypes.values())
          .map((item) => ({
            type: item.type,
            name: item.name,
            count: item.count,
            payloadBytes: item.payloadBytes,
            players: Array.from(item.players).sort((left, right) => left - right),
            decodedEvents: item.decodedEvents,
            decodeErrors: decodeErrors.get(item.type) || 0
          }))
          .sort((left, right) => left.type - right.type)
      },
      events: {
        count: decodedEvents.length,
        categoryCounts: decodedCategoryCounts,
        records: decodedEvents
      },
      header,
      endInfo
    };
    Object.defineProperty(extraction, "embeddedMapArchive", {
      value: embeddedMapArchive,
      enumerable: false
    });
    return extraction;
  }

  async function decompressZipEntry(compressed, method, expectedSize) {
    if (method === 0) {
      return compressed;
    }
    if (method !== 8 || typeof DecompressionStream !== "function") {
      throw new Error("This browser cannot decompress the embedded map.");
    }

    const stream = new Blob([compressed])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    if (expectedSize && bytes.length !== expectedSize) {
      throw new Error("The embedded map contains a damaged ZIP entry.");
    }
    return bytes;
  }

  async function readEmbeddedZipEntries(archive, requestedNames) {
    if (!(archive instanceof Uint8Array) || archive.length < 22) {
      return new Map();
    }

    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    const minimumOffset = Math.max(0, archive.length - 65557);
    let endOffset = -1;
    for (let offset = archive.length - 22; offset >= minimumOffset; offset -= 1) {
      if (view.getUint32(offset, true) === 0x06054b50) {
        endOffset = offset;
        break;
      }
    }
    if (endOffset < 0) {
      throw new Error("The embedded map ZIP directory is missing.");
    }

    const entryCount = view.getUint16(endOffset + 10, true);
    let offset = view.getUint32(endOffset + 16, true);
    const requested = new Set([...requestedNames].map((name) => name.toLowerCase()));
    const entries = new Map();
    if (entryCount > 2048 || offset >= archive.length) {
      throw new Error("The embedded map ZIP directory is invalid.");
    }

    for (let index = 0; index < entryCount && requested.size; index += 1) {
      if (offset + 46 > archive.length || view.getUint32(offset, true) !== 0x02014b50) {
        throw new Error("The embedded map ZIP entry is invalid.");
      }
      const flags = view.getUint16(offset + 8, true);
      const method = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const uncompressedSize = view.getUint32(offset + 24, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      const nameStart = offset + 46;
      const nameEnd = nameStart + nameLength;
      if (nameEnd > archive.length || uncompressedSize > 8 * 1024 * 1024 || flags & 1) {
        throw new Error("The embedded map ZIP entry is unsupported.");
      }
      const name = textDecoder.decode(archive.subarray(nameStart, nameEnd)).toLowerCase();
      const normalizedName = name.split("/").pop();
      if (requested.has(normalizedName)) {
        if (localOffset + 30 > archive.length || view.getUint32(localOffset, true) !== 0x04034b50) {
          throw new Error("The embedded map ZIP local entry is invalid.");
        }
        const localNameLength = view.getUint16(localOffset + 26, true);
        const localExtraLength = view.getUint16(localOffset + 28, true);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        const dataEnd = dataStart + compressedSize;
        if (dataEnd > archive.length) {
          throw new Error("The embedded map ZIP data is truncated.");
        }
        entries.set(
          normalizedName,
          await decompressZipEntry(archive.slice(dataStart, dataEnd), method, uncompressedSize)
        );
        requested.delete(normalizedName);
      }
      offset = nameEnd + extraLength + commentLength;
    }
    return entries;
  }

  function parseEmbeddedMapTerrain(entries) {
    const mapBytes = entries.get("game.map");
    const terrainBytes = entries.get("ttypes.ttp");
    if (!mapBytes || !terrainBytes || mapBytes.length < 16 || terrainBytes.length < 12) {
      return null;
    }

    const mapView = new DataView(mapBytes.buffer, mapBytes.byteOffset, mapBytes.byteLength);
    const terrainView = new DataView(terrainBytes.buffer, terrainBytes.byteOffset, terrainBytes.byteLength);
    if (mapBytes[0] !== 109 || mapBytes[1] !== 97 || mapBytes[2] !== 112
        || terrainBytes[0] !== 116 || terrainBytes[1] !== 116
        || terrainBytes[2] !== 121 || terrainBytes[3] !== 112) {
      return null;
    }

    const version = mapView.getUint32(4, true);
    const width = mapView.getUint32(8, true);
    const height = mapView.getUint32(12, true);
    const tileBytes = version >= 40 ? 4 : 3;
    const tileCount = width * height;
    if (version <= 9 || version > 40 || width <= 1 || height <= 1
        || width > 256 || height > 256 || 16 + tileCount * tileBytes > mapBytes.length) {
      return null;
    }

    const terrainCount = Math.min(terrainView.getUint32(8, true), 511);
    if (12 + terrainCount * 2 > terrainBytes.length) {
      return null;
    }
    const textureTerrain = new Uint8Array(terrainCount);
    for (let index = 0; index < terrainCount; index += 1) {
      textureTerrain[index] = Math.min(11, terrainView.getUint16(12 + index * 2, true));
    }

    const heights = new Uint16Array(tileCount);
    const terrainTypes = new Uint8Array(tileCount);
    let minimumHeight = Number.MAX_SAFE_INTEGER;
    let maximumHeight = 0;
    let offset = 16;
    for (let index = 0; index < tileCount; index += 1) {
      const texture = mapView.getUint16(offset, true) & 0x01ff;
      const tileHeight = version >= 40
        ? mapView.getUint16(offset + 2, true)
        : mapView.getUint8(offset + 2) * 2;
      heights[index] = tileHeight;
      terrainTypes[index] = textureTerrain[texture] || 0;
      minimumHeight = Math.min(minimumHeight, tileHeight);
      maximumHeight = Math.max(maximumHeight, tileHeight);
      offset += tileBytes;
    }

    let tileset = "arizona";
    const levelBytes = entries.get("level.json");
    if (levelBytes) {
      try {
        tileset = String(JSON.parse(textDecoder.decode(levelBytes)).tileset || tileset).toLowerCase();
      } catch (error) {
        tileset = "arizona";
      }
    }
    return { width, height, heights, terrainTypes, minimumHeight, maximumHeight, tileset };
  }

  async function loadEmbeddedMapTerrain(extraction) {
    if (!extraction.embeddedMapArchive) {
      return;
    }
    const entries = await readEmbeddedZipEntries(
      extraction.embeddedMapArchive,
      new Set(["game.map", "ttypes.ttp", "level.json"])
    );
    const terrain = parseEmbeddedMapTerrain(entries);
    if (terrain) {
      Object.defineProperty(extraction, "mapTerrain", {
        value: terrain,
        enumerable: false
      });
    }
  }

  function formatBytes(value) {
    if (!Number.isFinite(value)) {
      return "Unknown";
    }

    const units = ["B", "KB", "MB", "GB"];
    let amount = value;
    let unit = units[0];

    for (let index = 1; index < units.length && amount >= 1024; index += 1) {
      amount /= 1024;
      unit = units[index];
    }

    return `${amount >= 10 || unit === "B" ? amount.toFixed(0) : amount.toFixed(1)} ${unit}`;
  }

  function formatDuration(milliseconds) {
    if (!Number.isFinite(milliseconds)) {
      return "Unknown";
    }

    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      : `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function formatReplayDate(value) {
    const timestamp = Number(value);
    const date = Number.isFinite(timestamp) && String(value).trim() !== ""
      ? new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp)
      : new Date(value);
    return Number.isNaN(date.getTime())
      ? "Unknown"
      : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function replaceChildren(element, children) {
    element.replaceChildren(...children);
  }

  function createCell(value) {
    const cell = document.createElement("td");
    cell.textContent = value == null || value === "" ? "—" : String(value);
    return cell;
  }

  function createHeaderCell(label, options = {}) {
    const cell = document.createElement("th");
    cell.scope = options.scope || "col";
    cell.rowSpan = options.rowSpan || 1;
    cell.colSpan = options.colSpan || 1;
    if (options.className) {
      cell.className = options.className;
    }
    cell.textContent = label;
    return cell;
  }

  function createPlayerSlotCell(player) {
    const cell = document.createElement("td");
    const identity = document.createElement("span");
    identity.className = "replay-player-identity";

    const colourId = player.spectator ? 10 : Number(player.colour);
    const colour = playerColours[colourId];
    if (colour) {
      const marker = document.createElement("span");
      marker.className = "replay-player-colour";
      marker.style.backgroundColor = colour.value;
      marker.title = player.spectator ? "Spectator" : `${colour.name} (colour ${colourId})`;
      marker.setAttribute("aria-label", player.spectator ? "Spectator" : colour.name);
      identity.append(marker);
    }

    const slotNumber = document.createElement("span");
    slotNumber.textContent = player.position == null ? "—" : String(player.position);
    identity.append(slotNumber);
    cell.append(identity);
    return cell;
  }

  function formatStat(value) {
    if (value == null || value === "") {
      return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString() : null;
  }

  function formatPlayerResult(player) {
    if (player.spectator) {
      return "Spectator";
    }

    const result = player.summary && String(player.summary.result).toLowerCase();
    if (result === "winner") {
      return "Won";
    }
    if (result === "loser") {
      return "Lost";
    }
    if (result === "draw") {
      return "Draw";
    }
    return null;
  }

  function playerStat(player, key) {
    const value = player.summary && player.summary[key];
    if (value == null || value === "") {
      return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function calculatePlayerAwards(players, events = []) {
    const awardsByPlayer = new Map(players.map((player) => [player, []]));
    const competitors = players.filter((player) => (
      !player.spectator && player.summary && (
        !player.summary.partialStats || player.summary.statsSource === "replay-engine"
      )
    ));
    const number = (value) => Number(value).toLocaleString();
    const stat = (player, key) => playerStat(player, key) || 0;
    const isWinner = (player) => formatPlayerResult(player) === "Won";
    const isLoser = (player) => formatPlayerResult(player) === "Lost";
    const totalBuilt = (player) => stat(player, "droidsBuilt") + stat(player, "structuresBuilt");
    const totalRemaining = (player) => stat(player, "remainingDroids") + stat(player, "remainingStructures");
    const totalDestruction = (player) => stat(player, "kills") + stat(player, "structuresDestroyed");
    const totalLost = (player) => stat(player, "droidsLost") + stat(player, "structuresLost");

    const giveAward = (player, icon, label, details) => {
      awardsByPlayer.get(player).push({ icon, label, details });
    };

    const addTopAward = ({ icon, label, candidates = competitors, value, details }) => {
      const scored = candidates
        .map((player) => ({ player, value: Number(value(player)) }))
        .filter((entry) => Number.isFinite(entry.value));
      if (!scored.length) {
        return;
      }

      const bestValue = Math.max(...scored.map((entry) => entry.value));
      if (bestValue <= 0) {
        return;
      }

      scored
        .filter((entry) => entry.value === bestValue)
        .forEach((entry) => {
          awardsByPlayer.get(entry.player).push({
            icon,
            label,
            details: details(entry.player, entry.value)
          });
        });
    };

    const addBottomAward = ({ icon, label, candidates = competitors, value, details }) => {
      const scored = candidates
        .map((player) => ({ player, value: Number(value(player)) }))
        .filter((entry) => Number.isFinite(entry.value) && entry.value >= 0);
      if (!scored.length) {
        return;
      }

      const bestValue = Math.min(...scored.map((entry) => entry.value));
      scored
        .filter((entry) => entry.value === bestValue)
        .forEach((entry) => giveAward(entry.player, icon, label, details(entry.player, entry.value)));
    };

    addTopAward({
      icon: "🏆",
      label: "Match MVP",
      value: (player) => stat(player, "score"),
      details: (player) => `Highest score: ${number(stat(player, "score"))}`
    });
    addTopAward({
      icon: "🎯",
      label: "Top Fragger",
      value: (player) => stat(player, "kills"),
      details: (player) => `Most kills: ${number(stat(player, "kills"))}`
    });
    addTopAward({
      icon: "🔥",
      label: "Killing Streak",
      candidates: competitors.filter((player) => (
        stat(player, "kills") > 0 && stat(player, "droidsLost") === 0
      )),
      value: (player) => stat(player, "kills"),
      details: (player) => `${number(stat(player, "kills"))} kills without losing a unit`
    });
    addTopAward({
      icon: "💥",
      label: "Demolition Expert",
      value: (player) => stat(player, "structuresDestroyed"),
      details: (player) => `Most structures destroyed: ${number(stat(player, "structuresDestroyed"))}`
    });
    addTopAward({
      icon: "⚙️",
      label: "War Machine",
      value: (player) => stat(player, "droidsBuilt"),
      details: (player) => `Most units built: ${number(stat(player, "droidsBuilt"))}`
    });
    addTopAward({
      icon: "🏗️",
      label: "Master Builder",
      value: (player) => stat(player, "structuresBuilt"),
      details: (player) => `Most structures built: ${number(stat(player, "structuresBuilt"))}`
    });
    addTopAward({
      icon: "🧪",
      label: "Research Pioneer",
      value: (player) => stat(player, "researchComplete"),
      details: (player) => `Most research completed: ${number(stat(player, "researchComplete"))}`
    });
    addTopAward({
      icon: "⚔️",
      label: "Combat Efficiency",
      candidates: competitors.filter((player) => stat(player, "droidsLost") >= 25),
      value: (player) => stat(player, "kills") / stat(player, "droidsLost"),
      details: (player, value) => `Best kills-to-units-lost ratio: ${value.toFixed(2)}`
    });
    addTopAward({
      icon: "🛡️",
      label: "Last Army Standing",
      value: (player) => stat(player, "remainingDroids"),
      details: (player) => `Most units remaining: ${number(stat(player, "remainingDroids"))}`
    });
    addTopAward({
      icon: "🏰",
      label: "Fortress Keeper",
      value: (player) => stat(player, "remainingStructures"),
      details: (player) => `Most structures remaining: ${number(stat(player, "remainingStructures"))}`
    });
    addTopAward({
      icon: "🏭",
      label: "Production Powerhouse",
      value: totalBuilt,
      details: (player) => `Most total production: ${number(totalBuilt(player))}`
    });
    addTopAward({
      icon: "☄️",
      label: "Total Destruction",
      value: totalDestruction,
      details: (player) => `Kills plus structures destroyed: ${number(totalDestruction(player))}`
    });
    addTopAward({
      icon: "⚡",
      label: "Power Hoarder",
      value: (player) => stat(player, "power"),
      details: (player) => `Most power remaining: ${number(stat(player, "power"))}`
    });
    addTopAward({
      icon: "🩸",
      label: "Costly Victory",
      candidates: competitors.filter(isWinner),
      value: (player) => stat(player, "droidsLost"),
      details: (player) => `Winner with most units lost: ${number(stat(player, "droidsLost"))}`
    });
    addTopAward({
      icon: "🔥",
      label: "Last Stand",
      candidates: competitors.filter(isLoser),
      value: totalRemaining,
      details: (player) => `Losing player with most assets remaining: ${number(totalRemaining(player))}`
    });
    addTopAward({
      icon: "💀",
      label: "Glass Cannon",
      value: (player) => stat(player, "kills") * stat(player, "droidsLost"),
      details: (player) => `${number(stat(player, "kills"))} kills with ${number(stat(player, "droidsLost"))} units lost`
    });
    addTopAward({
      icon: "🪦",
      label: "Army Grinder",
      value: (player) => stat(player, "droidsLost"),
      details: (player) => `Most units lost: ${number(stat(player, "droidsLost"))}`
    });
    addTopAward({
      icon: "🧱",
      label: "Structure Casualty",
      value: (player) => stat(player, "structuresLost"),
      details: (player) => `Most structures lost: ${number(stat(player, "structuresLost"))}`
    });
    addTopAward({
      icon: "♻️",
      label: "Efficient Builder",
      candidates: competitors.filter((player) => totalBuilt(player) >= 50),
      value: (player) => totalRemaining(player) / totalBuilt(player),
      details: (player, value) => `Best remaining-assets-to-production ratio: ${(value * 100).toFixed(1)}%`
    });
    addTopAward({
      icon: "🌅",
      label: "Comeback Survivor",
      candidates: competitors.filter((player) => isLoser(player) && totalRemaining(player) > 0),
      value: (player) => totalDestruction(player) / totalRemaining(player),
      details: (player, value) => `Best destruction per remaining asset among losing survivors: ${value.toFixed(2)}`
    });
    competitors
      .filter((player) => isWinner(player) && stat(player, "structuresLost") === 0)
      .forEach((player) => giveAward(player, "🧹", "Clean Sweep", "Won without losing a structure"));
    addTopAward({
      icon: "🩹",
      label: "Army Preservation",
      candidates: competitors.filter((player) => stat(player, "remainingDroids") + stat(player, "droidsLost") >= 25),
      value: (player) => stat(player, "remainingDroids") / (
        stat(player, "remainingDroids") + stat(player, "droidsLost")
      ),
      details: (player, value) => `Best unit survival share: ${(value * 100).toFixed(1)}%`
    });
    addTopAward({
      icon: "🏯",
      label: "Perfect Defense",
      candidates: competitors.filter((player) => stat(player, "remainingStructures") + stat(player, "structuresLost") >= 25),
      value: (player) => stat(player, "remainingStructures") / (
        stat(player, "remainingStructures") + stat(player, "structuresLost")
      ),
      details: (player, value) => `Best structure survival share: ${(value * 100).toFixed(1)}%`
    });
    addTopAward({
      icon: "🔨",
      label: "Rebuild Master",
      value: (player) => stat(player, "structuresBuilt") * stat(player, "structuresLost"),
      details: (player) => `${number(stat(player, "structuresBuilt"))} structures built despite ${number(stat(player, "structuresLost"))} lost`
    });
    addTopAward({
      icon: "🗡️",
      label: "Siege Efficiency",
      candidates: competitors.filter((player) => stat(player, "droidsLost") >= 25),
      value: (player) => stat(player, "structuresDestroyed") / stat(player, "droidsLost"),
      details: (player, value) => `Best structures-destroyed-to-units-lost ratio: ${value.toFixed(2)}`
    });
    addTopAward({
      icon: "📈",
      label: "Score Efficiency",
      candidates: competitors.filter((player) => totalBuilt(player) >= 50 && stat(player, "score") > 0),
      value: (player) => stat(player, "score") / totalBuilt(player),
      details: (player, value) => `Best score per produced asset: ${number(Math.round(value))}`
    });

    const balancedMaxima = {
      kills: Math.max(...competitors.map((player) => stat(player, "kills")), 1),
      production: Math.max(...competitors.map(totalBuilt), 1),
      research: Math.max(...competitors.map((player) => stat(player, "researchComplete")), 1),
      survival: Math.max(...competitors.map(totalRemaining), 1)
    };
    addTopAward({
      icon: "⚖️",
      label: "Balanced Commander",
      value: (player) => Math.min(
        stat(player, "kills") / balancedMaxima.kills,
        totalBuilt(player) / balancedMaxima.production,
        stat(player, "researchComplete") / balancedMaxima.research,
        totalRemaining(player) / balancedMaxima.survival
      ),
      details: (player, value) => `Strongest balanced combat, production, research, and survival rating: ${(value * 100).toFixed(1)}%`
    });
    addBottomAward({
      icon: "🐺",
      label: "Underdog Victor",
      candidates: competitors.filter((player) => isWinner(player) && stat(player, "score") >= 0),
      value: (player) => stat(player, "score"),
      details: (player) => `Victory with the lowest winning score: ${number(stat(player, "score"))}`
    });
    addTopAward({
      icon: "🧨",
      label: "All-Out Assault",
      candidates: competitors.filter(isWinner),
      value: totalLost,
      details: (player) => `Winner with most combined losses: ${number(totalLost(player))}`
    });

    const meaningfulKillThreshold = Math.max(
      50,
      Math.ceil(Math.max(...competitors.map((player) => stat(player, "kills")), 0) * 0.25)
    );
    addBottomAward({
      icon: "💎",
      label: "Untouchable",
      candidates: competitors.filter((player) => stat(player, "kills") >= meaningfulKillThreshold),
      value: (player) => stat(player, "droidsLost"),
      details: (player) => `Fewest unit losses among major combatants: ${number(stat(player, "droidsLost"))}`
    });
    addTopAward({
      icon: "🛠️",
      label: "Industrial Recovery",
      value: (player) => totalRemaining(player) * totalLost(player),
      details: (player) => `${number(totalRemaining(player))} assets remained after ${number(totalLost(player))} losses`
    });
    addTopAward({
      icon: "🚀",
      label: "Overproducer",
      value: (player) => Math.max(0, totalBuilt(player) - totalRemaining(player)),
      details: (player) => `Production exceeded remaining assets by ${number(Math.max(0, totalBuilt(player) - totalRemaining(player)))}`
    });
    addTopAward({
      icon: "🧠",
      label: "Research Efficiency",
      candidates: competitors.filter((player) => stat(player, "structuresBuilt") >= 25),
      value: (player) => stat(player, "researchComplete") / stat(player, "structuresBuilt"),
      details: (player, value) => `Best research-to-structures-built ratio: ${value.toFixed(2)}`
    });

    const teams = new Map();
    competitors.forEach((player) => {
      const team = Number(player.team);
      if (!teams.has(team)) {
        teams.set(team, []);
      }
      teams.get(team).push(player);
    });
    teams.forEach((teamPlayers, team) => {
      const teamScore = teamPlayers.reduce((sum, player) => sum + Math.max(0, stat(player, "score")), 0);
      const teamKills = teamPlayers.reduce((sum, player) => sum + stat(player, "kills"), 0);
      addTopAward({
        icon: "⭐",
        label: "Team MVP",
        candidates: teamPlayers,
        value: (player) => stat(player, "score"),
        details: (player) => `Highest score on team ${team}: ${number(stat(player, "score"))}`
      });
      addTopAward({
        icon: "👑",
        label: "Team Carry",
        candidates: teamPlayers,
        value: (player) => teamScore > 0 ? Math.max(0, stat(player, "score")) / teamScore : 0,
        details: (player, value) => `Largest share of team ${team}'s score: ${(value * 100).toFixed(1)}%`
      });
      addTopAward({
        icon: "🦅",
        label: "Team Slayer",
        candidates: teamPlayers,
        value: (player) => teamKills > 0 ? stat(player, "kills") / teamKills : 0,
        details: (player, value) => `Largest share of team ${team}'s kills: ${(value * 100).toFixed(1)}%`
      });
    });

    const competitorsByPosition = new Map(
      competitors.map((player) => [Number(player.position), player])
    );
    const timelineEvents = events.filter((event) => (
      competitorsByPosition.has(Number(event.player))
      && event.time != null
      && Number.isFinite(Number(event.time))
    ));
    const playerForEvent = (event) => competitorsByPosition.get(Number(event.player));
    const countEvents = (predicate) => {
      const counts = new Map(competitors.map((player) => [player, 0]));
      timelineEvents.filter(predicate).forEach((event) => {
        const player = playerForEvent(event);
        counts.set(player, counts.get(player) + 1);
      });
      return counts;
    };
    const addCountAward = (icon, label, predicate, details) => {
      const counts = countEvents(predicate);
      addTopAward({
        icon,
        label,
        value: (player) => counts.get(player) || 0,
        details: (player, value) => details(player, value)
      });
    };
    const addEarliestEventAward = (icon, label, predicate, details) => {
      const matching = timelineEvents.filter(predicate);
      if (!matching.length) {
        return;
      }
      const earliestTime = Math.min(...matching.map((event) => Number(event.time)));
      const awarded = new Set();
      matching
        .filter((event) => Number(event.time) === earliestTime)
        .forEach((event) => {
          const player = playerForEvent(event);
          if (!awarded.has(player)) {
            awarded.add(player);
            giveAward(player, icon, label, details(event, earliestTime));
          }
        });
    };

    const gifts = timelineEvents.filter((event) => event.category === "Gift");
    addCountAward(
      "🎁",
      "Generous Ally",
      (event) => event.category === "Gift",
      (player, value) => `Most gifts sent: ${number(value)}`
    );
    const giftRecipients = new Map(competitors.map((player) => [player, new Set()]));
    gifts.forEach((event) => {
      giftRecipients.get(playerForEvent(event)).add(Number(event.data && event.data.to));
    });
    addTopAward({
      icon: "🤝",
      label: "Team Support",
      value: (player) => giftRecipients.get(player).size,
      details: (player, value) => `Helped the most distinct players: ${number(value)}`
    });
    addEarliestEventAward(
      "🔬",
      "Research Sprinter",
      (event) => event.category === "Research" && event.action === "Research started",
      (event, time) => `Started the match's first recorded research at ${formatDuration(time)}`
    );
    addEarliestEventAward(
      "🏭",
      "Early Industrialist",
      (event) => event.category === "Production" && event.action === "Manufacture",
      (event, time) => `Issued the first manufacturing order at ${formatDuration(time)}`
    );
    const attackActions = new Set(["Attack", "Attack target"]);
    addEarliestEventAward(
      "🩸",
      "First Blood",
      (event) => (
        event.category === "Droid order"
        && attackActions.has(event.action)
        && stat(playerForEvent(event), "kills") > 0
      ),
      (event, time) => `Earliest recorded attack by a player who finished with kills, at ${formatDuration(time)}`
    );
    addEarliestEventAward(
      "⚔️",
      "First Mobilization",
      (event) => event.category === "Droid order" && attackActions.has(event.action),
      (event, time) => `Issued the first attack order at ${formatDuration(time)}`
    );
    addCountAward(
      "🗺️",
      "Most Aggressive",
      (event) => event.category === "Droid order" && attackActions.has(event.action),
      (player, value) => `Most attack orders issued: ${number(value)}`
    );
    const defensiveActions = new Set([
      "Guard",
      "Hold",
      "Patrol",
      "Repair droid",
      "Repair structure",
      "Return to repair",
      "Return to specified repair"
    ]);
    addCountAward(
      "🧱",
      "Defensive Commander",
      (event) => event.category === "Droid order" && defensiveActions.has(event.action),
      (player, value) => `Most defensive orders issued: ${number(value)}`
    );
    competitors
      .filter((player) => playerStat(player, "playerLeftGameTime") == null)
      .forEach((player) => giveAward(player, "⏱️", "Endurance Award", "Remained active through the end of the match"));
    addTopAward({
      icon: "🚪",
      label: "Last to Leave",
      candidates: competitors.filter((player) => playerStat(player, "playerLeftGameTime") != null),
      value: (player) => stat(player, "playerLeftGameTime"),
      details: (player, value) => `Latest recorded departure: ${formatDuration(value)}`
    });
    const coordinationActions = new Set(["Help build", "Fire support", "Commander support", "Guard"]);
    addCountAward(
      "📡",
      "Field Coordinator",
      (event) => event.category === "Gift" || (
        event.category === "Droid order" && coordinationActions.has(event.action)
      ),
      (player, value) => `Most support gifts and coordination orders: ${number(value)}`
    );

    return awardsByPlayer;
  }

  function createPlayerAwardsCell(awards) {
    const cell = document.createElement("td");
    if (!awards || !awards.length) {
      cell.textContent = "—";
      return cell;
    }

    const list = document.createElement("span");
    list.className = "replay-player-awards";
    awards.forEach((award) => {
      const icon = document.createElement("span");
      icon.className = "replay-player-award replay-tooltip";
      icon.textContent = award.icon;
      icon.dataset.tooltip = `${award.label} — ${award.details}`;
      icon.setAttribute("aria-label", icon.dataset.tooltip);
      icon.tabIndex = 0;
      list.append(icon);
    });
    cell.append(list);
    return cell;
  }

  function createPlayerStory(player, players, events, researchActivity) {
    if (player.spectator) {
      return `${player.name} observed the match from slot ${player.position} and did not participate in the recorded combat.`;
    }

    const stats = player.summary || {};
    const partialStats = Boolean(stats.partialStats);
    const result = formatPlayerResult(player);
    const score = formatStat(stats.score) || "an unrecorded score";
    const variants = {
      Won: ["secured victory", "emerged victorious", "finished on the winning side"],
      Lost: ["fought on the defeated side", "continued the campaign despite defeat", "saw the campaign end in defeat"],
      Draw: ["finished the match in a draw"]
    };
    const outcomeOptions = variants[result] || ["completed the match"];
    const outcome = outcomeOptions[Math.abs(Number(player.position) || 0) % outcomeOptions.length];
    const kills = playerStat(player, "kills") || 0;
    const unitsBuilt = playerStat(player, "droidsBuilt") || 0;
    const unitsLost = playerStat(player, "droidsLost") || 0;
    const unitsAlive = playerStat(player, "remainingDroids") || 0;
    const structuresBuilt = playerStat(player, "structuresBuilt") || 0;
    const structuresLost = playerStat(player, "structuresLost") || 0;
    const structuresDestroyed = playerStat(player, "structuresDestroyed") || 0;
    const structuresAlive = playerStat(player, "remainingStructures") || 0;
    const research = playerStat(player, "researchComplete");
    const number = (value) => Number(value).toLocaleString();
    const competitors = players.filter((item) => !item.spectator && item.summary);
    const highestKills = Math.max(...competitors.map((item) => playerStat(item, "kills") || 0), 0);
    const highestProduction = Math.max(...competitors.map((item) => playerStat(item, "droidsBuilt") || 0), 0);
    const highestConstruction = Math.max(...competitors.map((item) => playerStat(item, "structuresBuilt") || 0), 0);
    const highestDemolition = Math.max(...competitors.map((item) => playerStat(item, "structuresDestroyed") || 0), 0);
    const story = [`${player.name} ${outcome} with a final score of ${score}.`];

    if (kills === highestKills && kills > 0) {
      story.push(
        `They led the battlefield with ${number(kills)} kills after building ${number(unitsBuilt)} units and losing ${number(unitsLost)}.`
      );
    } else if (unitsBuilt === highestProduction && unitsBuilt > 0) {
      story.push(
        `Their war machine produced a match-leading ${number(unitsBuilt)} units, converting them into ${number(kills)} kills at the cost of ${number(unitsLost)} losses.`
      );
    } else if (unitsLost > 0 && kills / unitsLost >= 2) {
      story.push(
        `They fought efficiently, recording ${number(kills)} kills from ${number(unitsBuilt)} produced units while losing ${number(unitsLost)}.`
      );
    } else if (unitsLost > 0) {
      story.push(
        `They fought a costly war of attrition, building ${number(unitsBuilt)} units, recording ${number(kills)} kills, and losing ${number(unitsLost)}.`
      );
    } else {
      story.push(`They built ${number(unitsBuilt)} units and recorded ${number(kills)} kills without a recorded unit loss.`);
    }

    if (partialStats) {
      story.push(
        `The source records ${number(structuresDestroyed)} enemy structures destroyed; final structure and surviving-unit totals are unavailable.`
      );
    } else if (structuresBuilt === highestConstruction && structuresBuilt > 0) {
      story.push(
        `Industrial expansion defined their campaign: ${number(structuresBuilt)} structures were built, ${number(structuresDestroyed)} were destroyed, and ${number(structuresAlive)} remained.`
      );
    } else if (structuresDestroyed === highestDemolition && structuresDestroyed > 0) {
      story.push(
        `Their siege campaign destroyed a match-leading ${number(structuresDestroyed)} structures; ${number(unitsAlive)} units and ${number(structuresAlive)} structures survived.`
      );
    } else if (structuresLost === 0 && structuresBuilt > 0) {
      story.push(
        `Their base remained intact, with all ${number(structuresAlive)} surviving structures supporting an army of ${number(unitsAlive)} units at the end.`
      );
    } else {
      story.push(
        `Their forces destroyed ${number(structuresDestroyed)} structures while their industry built ${number(structuresBuilt)}; ${number(unitsAlive)} units and ${number(structuresAlive)} structures remained at the end.`
      );
    }

    const attackActions = new Set(["Attack", "Attack target"]);
    const playerEvents = events.filter((event) => Number(event.player) === Number(player.position));
    const attackEvents = playerEvents.filter((event) => (
      event.category === "Droid order" && attackActions.has(event.action)
    ));
    const giftCount = playerEvents.filter((event) => event.category === "Gift").length;
    const activity = [];
    if (attackEvents.length) {
      const firstAttack = Math.min(...attackEvents.map((event) => Number(event.time)).filter(Number.isFinite));
      activity.push(
        Number.isFinite(firstAttack)
          ? `${number(attackEvents.length)} attack orders beginning at ${formatDuration(firstAttack)}`
          : `${number(attackEvents.length)} attack orders`
      );
    }
    if (giftCount) {
      activity.push(`${number(giftCount)} gifts to other players`);
    }
    if (activity.length) {
      story.push(`The replay records ${activity.join(" and ")}.`);
    }

    if (research != null && researchActivity != null) {
      story.push(`They completed ${number(research)} research topics with an estimated ${researchActivity.toFixed(2)}% research-lab activity.`);
    }

    return story.join(" ");
  }

  function createPlayerNameCell(player, story) {
    const cell = document.createElement("td");
    const name = document.createElement("span");
    name.className = "replay-player-story replay-tooltip";
    name.textContent = player.name;
    name.dataset.tooltip = story;
    name.setAttribute("aria-label", `${player.name}. ${story}`);
    name.tabIndex = 0;
    name.addEventListener("mouseenter", () => showPlayerStory(name));
    name.addEventListener("mouseleave", hidePlayerStory);
    name.addEventListener("focus", () => showPlayerStory(name));
    name.addEventListener("blur", hidePlayerStory);
    cell.append(name);
    return cell;
  }

  function showPlayerStory(target) {
    const row = target.closest("tr");
    const statsCell = row && row.cells[2];
    if (!row || !statsCell) {
      return;
    }

    playerStoryPopup.textContent = target.dataset.tooltip;
    playerStoryPopup.hidden = false;

    const rowRect = row.getBoundingClientRect();
    const statsRect = statsCell.getBoundingClientRect();
    const popupRect = playerStoryPopup.getBoundingClientRect();
    const left = Math.min(
      Math.max(16, statsRect.left),
      window.innerWidth - popupRect.width - 16
    );
    const top = Math.min(
      Math.max(16, rowRect.top + ((rowRect.height - popupRect.height) / 2)),
      window.innerHeight - popupRect.height - 16
    );

    playerStoryPopup.style.left = `${left}px`;
    playerStoryPopup.style.top = `${top}px`;
  }

  function hidePlayerStory() {
    playerStoryPopup.hidden = true;
  }

  window.addEventListener("scroll", hidePlayerStory, true);
  window.addEventListener("resize", hidePlayerStory);

  function calculateResearchActivity(players, events, matchDuration) {
    return new Map(players.map((player) => {
      if (player.summary?.statsSource !== "replay-engine") {
        return [player, null];
      }
      const performance = playerStat(player, "labResearchPerformance");
      const potential = playerStat(player, "labResearchPotential");
      if (player.spectator) {
        return [player, null];
      }
      if (performance != null && potential != null && potential > 0) {
        return [player, Math.max(0, Math.min(1, performance / potential)) * 100];
      }
      return [player, null];
    }));
  }

  function createResearchCell(researchActivity) {
    const cell = document.createElement("td");
    if (researchActivity == null) {
      cell.textContent = "—";
      return cell;
    }

    const content = document.createElement("span");
    content.className = "replay-research-stat";
    const activity = document.createElement("span");
    activity.className = "replay-research-idle replay-tooltip";
    activity.textContent = `${researchActivity.toFixed(2)}%`;
    activity.dataset.tooltip = "Research-lab activity based only on recorded lab performance and busy time; it is not compared with other players.";
    activity.setAttribute("aria-label", activity.dataset.tooltip);
    activity.tabIndex = 0;
    content.append(activity);

    cell.append(content);
    return cell;
  }

  function playerKdValue(player) {
    if (player.spectator) {
      return null;
    }

    const kills = playerStat(player, "kills");
    const unitsLost = playerStat(player, "droidsLost");
    if (kills == null || unitsLost == null) {
      return null;
    }
    if (unitsLost === 0) {
      return kills > 0 ? Number.MAX_SAFE_INTEGER : 0;
    }
    return kills / unitsLost;
  }

  function formatPlayerKd(player) {
    const value = playerKdValue(player);
    if (value == null) {
      return "\u2014";
    }
    return value === Number.MAX_SAFE_INTEGER ? "\u221e" : value.toFixed(2);
  }

  function totalKdValue(player) {
    if (player.spectator) {
      return null;
    }

    const unitKills = playerStat(player, "kills");
    const structureKills = playerStat(player, "structuresDestroyed");
    const unitsLost = playerStat(player, "droidsLost");
    const structuresLost = playerStat(player, "structuresLost");
    if ([unitKills, structureKills, unitsLost, structuresLost].some((value) => value == null)) {
      return null;
    }

    const totalKills = unitKills + structureKills;
    const totalLost = unitsLost + structuresLost;
    if (totalLost === 0) {
      return totalKills > 0 ? Number.MAX_SAFE_INTEGER : 0;
    }
    return totalKills / totalLost;
  }

  function formatTotalKd(player) {
    const value = totalKdValue(player);
    if (value == null) {
      return "\u2014";
    }
    return value === Number.MAX_SAFE_INTEGER ? "\u221e" : value.toFixed(2);
  }

  function structureKdValue(player) {
    if (player.spectator) {
      return null;
    }

    const kills = playerStat(player, "structuresDestroyed");
    const structuresLost = playerStat(player, "structuresLost");
    if (kills == null || structuresLost == null) {
      return null;
    }
    if (structuresLost === 0) {
      return kills > 0 ? Number.MAX_SAFE_INTEGER : 0;
    }
    return kills / structuresLost;
  }

  function formatStructureKd(player) {
    const value = structureKdValue(player);
    if (value == null) {
      return "\u2014";
    }
    return value === Number.MAX_SAFE_INTEGER ? "\u221e" : value.toFixed(2);
  }

  function playerSortValue(player, key, awardsByPlayer) {
    if (key === "position") {
      return Number(player.position);
    }
    if (key === "name") {
      return String(player.name || "").toLocaleLowerCase();
    }
    if (key === "awards") {
      return (awardsByPlayer.get(player) || []).length;
    }
    if (key === "kd") {
      return playerKdValue(player);
    }
    if (key === "totalKd") {
      return totalKdValue(player);
    }
    if (key === "structureKd") {
      return structureKdValue(player);
    }
    if (key === "researchActivity") {
      return player.researchActivity;
    }
    return playerStat(player, key);
  }

  function sortPlayers(players, awardsByPlayer) {
    return [...players].sort((left, right) => {
      if (left.spectator !== right.spectator) {
        return left.spectator ? 1 : -1;
      }

      const leftValue = playerSortValue(left, playerSortState.key, awardsByPlayer);
      const rightValue = playerSortValue(right, playerSortState.key, awardsByPlayer);
      const leftMissing = leftValue == null || (typeof leftValue === "number" && !Number.isFinite(leftValue));
      const rightMissing = rightValue == null || (typeof rightValue === "number" && !Number.isFinite(rightValue));
      if (leftMissing !== rightMissing) {
        return leftMissing ? 1 : -1;
      }

      let comparison = 0;
      if (typeof leftValue === "string" || typeof rightValue === "string") {
        comparison = String(leftValue).localeCompare(String(rightValue), undefined, { sensitivity: "base" });
      } else {
        comparison = Number(leftValue) - Number(rightValue);
      }
      if (comparison !== 0) {
        return playerSortState.direction === "asc" ? comparison : -comparison;
      }
      return Number(left.position) - Number(right.position);
    });
  }

  function updatePlayerSortIndicators() {
    playersHead.querySelectorAll(".stats-sort-button[data-player-sort-key]").forEach((button) => {
      const active = button.dataset.playerSortKey === playerSortState.key;
      button.dataset.direction = active ? playerSortState.direction : "";
      button.classList.toggle("is-active", active);
      button.closest("th").setAttribute(
        "aria-sort",
        active ? (playerSortState.direction === "asc" ? "ascending" : "descending") : "none"
      );
    });
  }

  function createPlayerSortHeader(label, key, options, renderRows) {
    const cell = createHeaderCell("", options);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "stats-sort-button stats-sort-button-compact";
    button.dataset.playerSortKey = key;
    button.textContent = label;
    button.title = `Sort players by ${label}`;
    button.addEventListener("click", () => {
      if (playerSortState.key === key) {
        playerSortState.direction = playerSortState.direction === "asc" ? "desc" : "asc";
      } else {
        playerSortState = {
          key,
          direction: key === "position" || key === "name" ? "asc" : "desc"
        };
      }
      updatePlayerSortIndicators();
      renderRows();
    });
    cell.append(button);
    return cell;
  }

  function createPlayerRow(player, players, events, awards, researchActivity) {
    const row = document.createElement("tr");
    const result = formatPlayerResult(player);
    if (result === "Won") {
      row.className = "replay-player-won";
    } else if (result === "Lost") {
      row.className = "replay-player-lost";
    }

    const stats = player.summary || {};
    row.append(
      createPlayerSlotCell(player),
      createPlayerNameCell(player, createPlayerStory(player, players, events, researchActivity)),
      createPlayerAwardsCell(awards),
      createCell(formatStat(stats.score)),
      createCell(formatTotalKd(player)),
      createResearchCell(researchActivity),
      createCell(formatStat(stats.droidsBuilt)),
      createCell(formatStat(stats.droidsLost)),
      createCell(formatStat(stats.kills)),
      createCell(formatStat(stats.remainingDroids)),
      createCell(formatPlayerKd(player)),
      createCell(formatStat(stats.structuresBuilt)),
      createCell(formatStat(stats.structuresLost)),
      createCell(formatStat(stats.structuresDestroyed)),
      createCell(formatStat(stats.remainingStructures)),
      createCell(formatStructureKd(player))
    );
    return row;
  }

  function renderSummaryItem(label, value) {
    const card = document.createElement("article");
    card.className = "data-card replay-summary-card";

    const labelElement = document.createElement("span");
    labelElement.className = "replay-summary-label";
    labelElement.textContent = label;

    const valueElement = document.createElement("strong");
    valueElement.className = "replay-summary-value";
    valueElement.textContent = value;

    card.append(labelElement, valueElement);
    return card;
  }

  function getBestPlayer(players, value) {
    return players.reduce((best, player) => {
      const rawValue = value(player);
      if (rawValue == null || rawValue === "") {
        return best;
      }
      const playerValue = Number(rawValue);
      if (!Number.isFinite(playerValue)) {
        return best;
      }
      return !best || playerValue > best.value ? { player, value: playerValue } : best;
    }, null);
  }

  function renderCompactMatchSummary(extraction) {
    if (!matchSummary) {
      return;
    }

    const competitors = extraction.players.filter((player) => !player.spectator && player.summary);
    if (!competitors.length) {
      matchSummary.hidden = true;
      matchSummary.replaceChildren();
      return;
    }

    const winners = competitors.filter((player) => formatPlayerResult(player) === "Won");
    const mvpPool = winners.length ? winners : competitors;
    const mvp = getBestPlayer(mvpPool, (player) => playerStat(player, "score"));
    const mostKills = getBestPlayer(competitors, (player) => playerStat(player, "kills"));
    const bestKd = getBestPlayer(competitors, totalKdValue);
    const bestResearch = getBestPlayer(competitors, (player) => player.researchActivity);
    const totalKills = competitors.reduce((sum, player) => sum + Math.max(0, playerStat(player, "kills") || 0), 0);
    const durationMinutes = Number(extraction.match.elapsedMilliseconds) / 60000;
    const combatPace = durationMinutes > 0 ? totalKills / durationMinutes : null;
    const winningTeamKey = winners.length ? String(winners[0].team ?? winners[0].position) : null;
    const teamScores = new Map();
    competitors.forEach((player) => {
      const key = String(player.team ?? player.position);
      const team = teamScores.get(key) || { players: [], score: 0 };
      team.players.push(player);
      team.score += Math.max(0, playerStat(player, "score") || 0);
      teamScores.set(key, team);
    });
    const winningPower = winningTeamKey == null ? null : teamScores.get(winningTeamKey)?.score;
    const strongestOpponent = [...teamScores.entries()]
      .filter(([key]) => key !== winningTeamKey)
      .sort((left, right) => right[1].score - left[1].score)[0]?.[1] || null;
    const comparisonMaximum = Math.max(Number(winningPower || 0), Number(strongestOpponent?.score || 0));
    const teamPowerGap = strongestOpponent && Number.isFinite(winningPower) && comparisonMaximum > 0
      ? (Math.abs(winningPower - strongestOpponent.score) / comparisonMaximum) * 100
      : null;
    const upsetVictory = Number.isFinite(winningPower)
      && strongestOpponent
      && winningPower < strongestOpponent.score;

    const heading = document.createElement("div");
    heading.className = "replay-match-summary-heading";
    const title = document.createElement("h3");
    title.textContent = "Match summary";
    heading.append(title);
    if (upsetVictory) {
      const badge = document.createElement("span");
      badge.className = "replay-upset-badge";
      badge.textContent = "Upset victory";
      badge.title = "The winning team finished with a lower combined replay score than the strongest opposing team.";
      heading.append(badge);
    }

    const grid = document.createElement("div");
    grid.className = "replay-match-summary-grid";
    const items = [
      ["MVP", mvp ? `${mvp.player.name} · ${mvp.value.toLocaleString()}` : "--"],
      ["Most kills", mostKills ? `${mostKills.player.name} · ${mostKills.value.toLocaleString()}` : "--"],
      ["Best KD", bestKd ? `${bestKd.player.name} · ${bestKd.value === Number.MAX_SAFE_INTEGER ? "∞" : bestKd.value.toFixed(2)}` : "--"],
      ["Best research", bestResearch ? `${bestResearch.player.name} · ${bestResearch.value.toFixed(2)}%` : "--"],
      ["Combat race", combatPace == null ? "--" : `${combatPace.toFixed(1)} kills/min`],
      ["Team power difference", teamPowerGap == null ? "--" : `${teamPowerGap.toFixed(1)}%`]
    ];
    items.forEach(([label, value]) => {
      const item = document.createElement("article");
      const itemLabel = document.createElement("span");
      const itemValue = document.createElement("strong");
      itemLabel.textContent = label;
      itemValue.textContent = value;
      if (label === "Combat race") {
        item.title = `${totalKills.toLocaleString()} total kills across ${formatDuration(extraction.match.elapsedMilliseconds)}.`;
      } else if (label === "Team power difference") {
        item.title = "Difference between the winning team and strongest opposing team by combined replay score.";
      }
      item.append(itemLabel, itemValue);
      grid.append(item);
    });

    matchSummary.hidden = false;
    matchSummary.replaceChildren(heading, grid);
  }

  function playerNameForPosition(extraction, position) {
    if (position == null) {
      return "—";
    }

    const player = extraction.players.find((item) => item.position === position);
    return player ? player.name : `Player ${position}`;
  }

  function renderSnapshotFrame(extraction) {
    const snapshots = extraction.engineAnalysis?.extended?.snapshots || [];
    const snapshot = snapshots[Number(snapshotRange.value)] || snapshots[0];
    if (!snapshot) {
      snapshotPlayers.replaceChildren();
      return;
    }

    snapshotTime.value = formatDuration(snapshot.timeMilliseconds);
    replaceChildren(snapshotPlayers, (snapshot.players || []).map((player) => {
      const row = document.createElement("tr");
      row.append(
        createCell(playerNameForPosition(extraction, Number(player.position))),
        createCell(player.state || "--"),
        createCell(formatStat(player.score)),
        createCell(formatStat(player.kills)),
        createCell(formatStat(player.droidsBuilt)),
        createCell(formatStat(player.droidsLost)),
        createCell(formatStat(player.droidsAlive)),
        createCell(formatStat(player.structuresBuilt)),
        createCell(formatStat(player.structuresLost)),
        createCell(formatStat(player.structuresAlive)),
        createCell(formatStat(player.researchComplete)),
        createCell(formatStat(player.power)),
        createCell(formatStat(player.oilRigs))
      );
      return row;
    }));
  }

  function renderResearchTimeline(extraction) {
    const timeline = extraction.engineAnalysis?.extended?.researchTimeline || [];
    const selectedPlayer = researchPlayer.value;
    const search = researchSearch.value.trim().toLowerCase();
    const filtered = timeline.filter((event) => {
      if (selectedPlayer && Number(event.position) !== Number(selectedPlayer)) {
        return false;
      }
      return !search || String(event.research || "").toLowerCase().includes(search);
    });
    const displayed = filtered.slice(0, displayedResearchLimit);

    researchNote.textContent = filtered.length > displayed.length
      ? `Showing the first ${displayed.length.toLocaleString()} of ${filtered.length.toLocaleString()} matching events.`
      : `${filtered.length.toLocaleString()} matching research event${filtered.length === 1 ? "" : "s"}.`;
    replaceChildren(researchEvents, displayed.map((event) => {
      const row = document.createElement("tr");
      row.append(
        createCell(formatDuration(event.timeMilliseconds)),
        createCell(playerNameForPosition(extraction, Number(event.position))),
        createCell(event.research || "--")
      );
      return row;
    }));
  }

  function stopBattlefieldPlayback() {
    battlefieldPlaying = false;
    battlefieldPlay.classList.remove("is-playing");
    battlefieldPlay.setAttribute("aria-label", "Play replay");
    battlefieldPlay.title = "Play replay";
    battlefieldLastTick = 0;
    if (battlefieldAnimationFrame) {
      cancelAnimationFrame(battlefieldAnimationFrame);
      battlefieldAnimationFrame = 0;
    }
  }

  function battlefieldPlayerColour(playerPosition) {
    const player = battlefieldExtraction?.players.find((item) => (
      Number(item.position) === Number(playerPosition)
    ));
    return playerColours[Number(player?.colour)]?.value
      || playerColours[Math.abs(Number(playerPosition)) % playerColours.length].value;
  }

  function battlefieldFramePair(timeMilliseconds) {
    if (battlefieldFrames.length === 1 || timeMilliseconds <= Number(battlefieldFrames[0].time || 0)) {
      return { current: battlefieldFrames[0], next: battlefieldFrames[0], ratio: 0 };
    }

    let low = 0;
    let high = battlefieldFrames.length - 1;
    while (low < high - 1) {
      const middle = Math.floor((low + high) / 2);
      if (Number(battlefieldFrames[middle].time || 0) <= timeMilliseconds) {
        low = middle;
      } else {
        high = middle;
      }
    }

    const current = battlefieldFrames[low];
    const next = battlefieldFrames[high];
    const currentTime = Number(current.time || 0);
    const nextTime = Number(next.time || currentTime);
    return {
      current,
      next,
      ratio: nextTime > currentTime
        ? Math.max(0, Math.min(1, (timeMilliseconds - currentTime) / (nextTime - currentTime)))
        : 0
    };
  }

  function interpolateBattlefieldObjects(currentObjects, nextObjects, ratio) {
    const nextById = new Map(nextObjects.map((object) => [Number(object[0]), object]));
    const currentIds = new Set();
    const objects = currentObjects.map((object) => {
      const id = Number(object[0]);
      currentIds.add(id);
      const next = nextById.get(id);
      if (!next || Number(next[1]) !== Number(object[1])) {
        return object;
      }
      const interpolated = [...object];
      interpolated[2] = Number(object[2]) + (Number(next[2]) - Number(object[2])) * ratio;
      interpolated[3] = Number(object[3]) + (Number(next[3]) - Number(object[3])) * ratio;
      interpolated[4] = Number(object[4]) + (Number(next[4]) - Number(object[4])) * ratio;
      if (interpolated[7] === null || interpolated[7] === undefined) {
        const deltaX = Number(next[2]) - Number(object[2]);
        const deltaY = Number(next[3]) - Number(object[3]);
        if (deltaX || deltaY) interpolated[7] = Math.atan2(deltaX, -deltaY) * 180 / Math.PI;
      }
      return interpolated;
    });

    if (ratio >= 0.85) {
      nextObjects.forEach((object) => {
        if (!currentIds.has(Number(object[0]))) {
          objects.push(object);
        }
      });
    }
    return objects;
  }

  function collectBattlefieldObjectDefinitions(frames) {
    battlefieldDroidDefinitions = new Map();
    battlefieldStructureDefinitions = new Map();
    frames.forEach((frame) => {
      (frame.droidDefinitions || []).forEach((definition) => {
        battlefieldDroidDefinitions.set(Number(definition[0]), {
          id: Number(definition[0]),
          name: definition[1] || "",
          body: definition[2] || "",
          propulsion: definition[3] || "",
          weapons: Array.isArray(definition[4]) ? definition[4].filter(Boolean) : [],
          droidType: definition[5]
        });
      });
      (frame.structureDefinitions || []).forEach((definition) => {
        battlefieldStructureDefinitions.set(Number(definition[0]), {
          id: Number(definition[0]),
          name: definition[1] || "",
          statType: definition[2]
        });
      });
    });
  }

  function normalizeBattlefieldModelName(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  async function loadBattlefieldModelLibrary() {
    if (battlefieldModelLibraryPromise) {
      return battlefieldModelLibraryPromise;
    }
    battlefieldModelLibraryPromise = (async () => {
      window.PIES_BASE = new URL("mapmaker/pies/", window.location.href).href;
      window.TEX_BASE = new URL("mapmaker/classic/texpages/texpages/", window.location.href).href;
      const [THREE, droidModule, structureModule, bodyDefs, propDefs, weaponDefs, templateDefs,
        constructionDefs, repairDefs, sensorDefs, brainDefs, ecmDefs, structureDefs] = await Promise.all([
        import("./mapmaker/js/three.module.js"),
        import("./mapmaker/js/droidGroup.js"),
        import("./mapmaker/js/structureGroup.js"),
        fetch("mapmaker/pies/components/bodies/body.json").then((response) => response.json()),
        fetch("mapmaker/pies/components/prop/propulsion.json").then((response) => response.json()),
        fetch("mapmaker/pies/components/weapons/weapons.json").then((response) => response.json()),
        fetch("mapmaker/pies/components/templates.json").then((response) => response.json()),
        fetch("mapmaker/pies/components/construction.json").then((response) => response.json()),
        fetch("mapmaker/pies/components/repair.json").then((response) => response.json()),
        fetch("mapmaker/pies/components/sensor.json").then((response) => response.json()),
        fetch("mapmaker/pies/components/brain.json").then((response) => response.json()),
        fetch("mapmaker/pies/components/ecm.json").then((response) => response.json()),
        fetch("mapmaker/structure.json").then((response) => response.json())
      ]);
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      renderer.setSize(192, 192, false);
      renderer.setClearColor(0x000000, 0);
      const structureNames = new Map();
      Object.values(structureDefs).forEach((definition) => {
        [definition.id, definition.name].filter(Boolean).forEach((name) => {
          structureNames.set(normalizeBattlefieldModelName(name), definition);
        });
      });
      const templateNames = new Map();
      Object.values(templateDefs).forEach((definition) => {
        [definition.id, definition.name].filter(Boolean).forEach((name) => {
          templateNames.set(normalizeBattlefieldModelName(name), definition);
        });
      });
      return {
        THREE, renderer, buildDroidGroup: droidModule.buildDroidGroup,
        buildStructureGroup: structureModule.buildStructureGroup,
        bodyDefs, propDefs, weaponDefs, templateDefs, templateNames,
        constructionDefs, repairDefs, sensorDefs, brainDefs, ecmDefs,
        structureDefs, structureNames
      };
    })();
    return battlefieldModelLibraryPromise;
  }

  function battlefieldPiePath(value, prefix = "") {
    let name = String(value || "");
    if (!name.toLowerCase().endsWith(".pie")) name += ".pie";
    return name.includes("/") ? name : `${prefix}${name}`;
  }

  function battlefieldDroidParts(definition, library) {
    const template = library.templateNames.get(normalizeBattlefieldModelName(definition.name));
    const design = template || definition;
    const bodyId = definition.body || design.body;
    const propulsionId = definition.propulsion || design.propulsion;
    const weapons = definition.weapons.length ? definition.weapons : (design.weapons || []);
    const parts = [];
    const body = library.bodyDefs[bodyId];
    const propulsion = library.propDefs[propulsionId];
    parts.push({
      role: "meta",
      propulsionType: propulsion?.type,
      droidType: design.type || definition.droidType
    });
    if (bodyId) {
      parts.push({ role: "body", path: battlefieldPiePath(body?.model || bodyId, "components/bodies/") });
    }
    let bodySpecificPropulsion = false;
    const propulsionModels = body?.propulsionExtraModels?.[propulsionId];
    if (propulsionModels) {
      const left = typeof propulsionModels === "string" ? propulsionModels : propulsionModels.left;
      if (left) {
        parts.push({ role: "propulsion", path: battlefieldPiePath(left, "components/prop/"), side: "left" });
        const right = String(left).replace(/^pr([lmh])(whl|trk|htr|vtl)/i, "pr$1r$2");
        if (right !== left && !/^prmvtl/i.test(left)) {
          parts.push({ role: "propulsion", path: battlefieldPiePath(right, "components/prop/"), side: "right" });
        }
        bodySpecificPropulsion = true;
      }
    }
    if (propulsionId && !bodySpecificPropulsion) {
      parts.push({
        role: "propulsion",
        path: battlefieldPiePath(propulsion?.model || propulsionId, "components/prop/")
      });
    }
    const addTurret = (componentId, definitions, kind, slot = 0) => {
      if (!componentId) return;
      const component = definitions[componentId];
      const mount = component?.mountModel;
      const model = component?.model || component?.sensorModel || componentId;
      if (mount) parts.push({ role: "mount", path: battlefieldPiePath(mount, "components/weapons/"), kind, slot });
      if (model && model !== mount) {
        parts.push({ role: "weapon", path: battlefieldPiePath(model, "components/weapons/"), kind, slot });
      }
    };
    weapons.forEach((weapon, index) => addTurret(weapon, library.weaponDefs, "weapon", index));
    if (!weapons.length) {
      const droidType = Number(definition.droidType);
      addTurret(design.construct || (droidType === 3 ? "Spade1Mk1" : droidType === 10 ? "CyborgSpade" : ""), library.constructionDefs, "construct");
      addTurret(design.repair || (droidType === 8 ? "LightRepair1" : droidType === 11 ? "CyborgRepair" : ""), library.repairDefs, "repair");
      addTurret(design.sensor || (droidType === 1 ? "SensorTurret1Mk1" : ""), library.sensorDefs, "sensor");
      addTurret(design.ecm || (droidType === 2 ? "ECM1TurretMk1" : ""), library.ecmDefs, "ecm");
      const brainWeapon = library.brainDefs[design.brain]?.turret;
      if (brainWeapon) addTurret(brainWeapon, library.weaponDefs, "weapon");
      else addTurret(design.brain || (droidType === 7 ? "CommandBrain01" : ""), library.brainDefs, "brain");
    }
    return parts;
  }

  function disposeBattlefieldModel(group) {
    group.traverse((item) => {
      item.geometry?.dispose?.();
      const materials = Array.isArray(item.material) ? item.material : [item.material];
      materials.filter(Boolean).forEach((material) => {
        material.map?.dispose?.();
        material.dispose?.();
      });
    });
  }

  async function waitForBattlefieldModelTextures(group, timeoutMilliseconds = 5000) {
    const textures = new Set();
    group.traverse((item) => {
      const materials = Array.isArray(item.material) ? item.material : [item.material];
      materials.filter(Boolean).forEach((material) => {
        if (material.map) textures.add(material.map);
      });
    });
    if (!textures.size) return;

    const startedAt = performance.now();
    const textureReady = (texture) => {
      const image = texture.image || texture.source?.data;
      if (!image) return false;
      if (typeof image.complete === "boolean") {
        return image.complete && image.naturalWidth > 0;
      }
      return Boolean(image.width || image.videoWidth);
    };
    while ([...textures].some((texture) => !textureReady(texture))
        && performance.now() - startedAt < timeoutMilliseconds) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async function createBattlefieldModelSprite(kind, definition) {
    const library = await loadBattlefieldModelLibrary();
    const { THREE, renderer } = library;
    let group;
    if (kind === "droid") {
      const parts = battlefieldDroidParts(definition, library);
      if (parts.length <= 1) return null;
      group = await library.buildDroidGroup(parts);
    } else {
      const structure = library.structureNames.get(normalizeBattlefieldModelName(definition.name));
      if (!structure) return null;
      const models = Array.isArray(structure.structureModel)
        ? structure.structureModel
        : (structure.structureModel ? [structure.structureModel] : []);
      const nonModules = models.filter((model) => !/module/i.test(model));
      const mainModel = nonModules.find((model) => !/^tr/i.test(model));
      const turretPieces = nonModules.filter((model) => /^tr/i.test(model));
      const pies = [structure.baseModel, mainModel, ...turretPieces].filter(Boolean);
      group = await library.buildStructureGroup({
        ...structure,
        pies,
        alignPiesByOrigin: Boolean(structure.baseModel),
        preserveModelOrigin: structure.type === "WALL" || structure.type === "GATE"
      }, 0, structure.width || 1, structure.breadth || 1);
    }
    await waitForBattlefieldModelTextures(group);
    group.traverse((item) => {
      const materials = Array.isArray(item.material) ? item.material : [item.material];
      materials.filter(Boolean).forEach((material) => {
        if (material.map && material.blending === THREE.NormalBlending) {
          material.transparent = true;
          material.alphaTest = Math.max(Number(material.alphaTest) || 0, 0.5);
          material.needsUpdate = true;
        }
      });
    });
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const directional = new THREE.DirectionalLight(0xffffff, 0.6);
    directional.position.set(10, 20, 10);
    scene.add(directional, group);
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z, 0.5) * 0.66;
    const camera = new THREE.OrthographicCamera(-span, span, span, -span, 0.1, 1000);
    camera.position.set(center.x, box.max.y + Math.max(size.x, size.z, 2) * 3, center.z + 0.001);
    camera.up.set(0, 0, -1);
    camera.lookAt(center);
    renderer.clear();
    renderer.render(scene, camera);
    const sprite = document.createElement("canvas");
    sprite.width = 192;
    sprite.height = 192;
    const spriteContext = sprite.getContext("2d");
    spriteContext.imageSmoothingEnabled = true;
    spriteContext.imageSmoothingQuality = "high";
    spriteContext.drawImage(renderer.domElement, 0, 0);
    disposeBattlefieldModel(group);
    return sprite;
  }

  function battlefieldModelSprite(kind, object) {
    const id = Number(object[0]);
    const definition = kind === "droid"
      ? battlefieldDroidDefinitions.get(id)
      : battlefieldStructureDefinitions.get(id);
    if (!definition) return null;
    const key = kind === "droid"
      ? `${kind}:${definition.body}:${definition.propulsion}:${definition.weapons.join(",")}:${definition.droidType}`
      : `${kind}:${normalizeBattlefieldModelName(definition.name)}:${definition.statType}`;
    if (!battlefieldSpriteCache.has(key)) {
      battlefieldSpriteCache.set(key, null);
      createBattlefieldModelSprite(kind, definition)
        .then((sprite) => {
          if (sprite) battlefieldSpriteCache.set(key, sprite);
          drawBattlefield();
        })
        .catch(() => {});
    }
    return battlefieldSpriteCache.get(key);
  }

  function battlefieldDirectionRadians(value) {
    let direction = Number(value) || 0;
    if (Math.abs(direction) > 360) direction = direction * 360 / 65536;
    return direction * Math.PI / 180;
  }

  function battlefieldTerrainColour(tileset, terrainType) {
    const palettes = {
      arizona: {
        ground: [116, 88, 46], brush: [100, 76, 38], rock: [136, 91, 58],
        road: [112, 104, 87], water: [28, 87, 118], cliff: [76, 61, 44], rubble: [91, 76, 58]
      },
      urban: {
        ground: [72, 78, 75], brush: [61, 73, 66], rock: [92, 91, 86],
        road: [112, 112, 105], water: [31, 76, 99], cliff: [60, 62, 59], rubble: [83, 77, 70]
      },
      rockies: {
        ground: [76, 96, 75], brush: [62, 84, 62], rock: [104, 108, 101],
        road: [105, 105, 96], water: [35, 91, 122], cliff: [67, 72, 68], rubble: [88, 85, 75]
      }
    };
    const palette = palettes[tileset] || palettes.arizona;
    if (terrainType === 6) return palette.road;
    if (terrainType === 7) return palette.water;
    if (terrainType === 8) return palette.cliff;
    if (terrainType === 9) return palette.rubble;
    if (terrainType === 5 || terrainType === 2) return palette.rock;
    if (terrainType === 1 || terrainType === 3 || terrainType === 4) return palette.brush;
    if (terrainType === 10 || terrainType === 11) return [153, 167, 169];
    return palette.ground;
  }

  function createBattlefieldTerrain(terrain) {
    if (!terrain) {
      return null;
    }
    const canvas = document.createElement("canvas");
    canvas.width = terrain.width;
    canvas.height = terrain.height;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }
    const image = context.createImageData(terrain.width, terrain.height);
    const heightRange = Math.max(1, terrain.maximumHeight - terrain.minimumHeight);
    const heightAt = (x, y) => terrain.heights[
      Math.max(0, Math.min(terrain.height - 1, y)) * terrain.width
      + Math.max(0, Math.min(terrain.width - 1, x))
    ];

    for (let y = 0; y < terrain.height; y += 1) {
      for (let x = 0; x < terrain.width; x += 1) {
        const index = y * terrain.width + x;
        const terrainType = terrain.terrainTypes[index];
        const base = battlefieldTerrainColour(terrain.tileset, terrainType);
        const elevation = (terrain.heights[index] - terrain.minimumHeight) / heightRange;
        const slope = (
          heightAt(x - 1, y) - heightAt(x + 1, y)
          + heightAt(x, y - 1) - heightAt(x, y + 1)
        ) / Math.max(64, heightRange);
        const light = terrainType === 7
          ? 0.82
          : Math.max(0.48, Math.min(1.28, 0.66 + elevation * 0.42 + slope * 0.22));
        const pixel = index * 4;
        image.data[pixel] = Math.round(base[0] * light);
        image.data[pixel + 1] = Math.round(base[1] * light);
        image.data[pixel + 2] = Math.round(base[2] * light);
        image.data[pixel + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
    return { ...terrain, canvas };
  }

  function battlefieldMapSize(frame) {
    if (battlefieldTerrain) {
      return { width: battlefieldTerrain.width, height: battlefieldTerrain.height };
    }
    const firstMap = battlefieldFrames.find((item) => item.map)?.map;
    if (firstMap?.width > 0 && firstMap?.height > 0) {
      return { width: Number(firstMap.width), height: Number(firstMap.height) };
    }

    const objects = [...(frame.droids || []), ...(frame.structures || [])];
    return {
      width: Math.max(...objects.map((object) => Number(object[2]) || 0), 1),
      height: Math.max(...objects.map((object) => Number(object[3]) || 0), 1)
    };
  }

  function drawBattlefield() {
    if (!battlefieldFrames.length || !battlefieldExtraction || battlefieldPanel.hidden) {
      return;
    }

    const context = battlefieldCanvas.getContext("2d");
    if (!context) {
      return;
    }

    const pair = battlefieldFramePair(battlefieldCurrentTime);
    const map = battlefieldMapSize(pair.current);
    battlefieldCanvas.style.aspectRatio = `${map.width} / ${map.height}`;
    const rect = battlefieldCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const canvasWidth = Math.max(1, Math.round(rect.width * pixelRatio));
    const canvasHeight = Math.max(1, Math.round(rect.height * pixelRatio));
    if (battlefieldCanvas.width !== canvasWidth || battlefieldCanvas.height !== canvasHeight) {
      battlefieldCanvas.width = canvasWidth;
      battlefieldCanvas.height = canvasHeight;
    }

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    context.fillStyle = "#071016";
    context.fillRect(0, 0, rect.width, rect.height);

    const margin = 12;
    const fieldWidth = Math.max(1, rect.width - margin * 2);
    const fieldHeight = Math.max(1, rect.height - margin * 2);
    const fieldCenterX = margin + fieldWidth / 2;
    const fieldCenterY = margin + fieldHeight / 2;
    context.save();
    context.beginPath();
    context.rect(margin, margin, fieldWidth, fieldHeight);
    context.clip();
    context.translate(fieldCenterX + battlefieldView.offsetX, fieldCenterY + battlefieldView.offsetY);
    context.scale(battlefieldView.scale, battlefieldView.scale);
    context.translate(-fieldCenterX, -fieldCenterY);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    if (battlefieldBackground.checked && battlefieldTerrain) {
      context.globalAlpha = 0.9;
      context.drawImage(battlefieldTerrain.canvas, margin, margin, fieldWidth, fieldHeight);
      context.globalAlpha = 1;
      context.fillStyle = "rgba(2, 8, 13, 0.12)";
      context.fillRect(margin, margin, fieldWidth, fieldHeight);
    }
    context.strokeStyle = battlefieldBackground.checked && battlefieldTerrain
      ? "rgba(109, 232, 255, 0.17)"
      : "rgba(109, 232, 255, 0.11)";
    context.lineWidth = 1;
    for (let index = 0; index <= 10; index += 1) {
      const x = margin + fieldWidth * index / 10;
      const y = margin + fieldHeight * index / 10;
      context.beginPath();
      context.moveTo(x, margin);
      context.lineTo(x, margin + fieldHeight);
      context.stroke();
      context.beginPath();
      context.moveTo(margin, y);
      context.lineTo(margin + fieldWidth, y);
      context.stroke();
    }
    context.strokeStyle = "rgba(109, 232, 255, 0.38)";
    context.strokeRect(margin, margin, fieldWidth, fieldHeight);

    const projectX = (x) => margin + Math.max(0, Math.min(map.width, Number(x))) / map.width * fieldWidth;
    const projectY = (y) => margin + Math.max(0, Math.min(map.height, Number(y))) / map.height * fieldHeight;
    const structures = battlefieldStructures.checked
      ? interpolateBattlefieldObjects(pair.current.structures || [], pair.next.structures || [], pair.ratio)
      : [];
    const droids = battlefieldDroids.checked
      ? interpolateBattlefieldObjects(pair.current.droids || [], pair.next.droids || [], pair.ratio)
      : [];
    let visibleStructures = 0;
    let visibleDroids = 0;
    const showDetailedModels = battlefieldView.scale >= 1;

    structures.forEach((structure) => {
      const player = Number(structure[1]);
      if (battlefieldHiddenPlayers.has(player)) {
        return;
      }
      visibleStructures += 1;
      const health = Math.max(0, Math.min(100, Number(structure[4]) || 0));
      const size = Math.max(7, Math.min(18, fieldWidth / map.width * 3));
      const sprite = showDetailedModels ? battlefieldModelSprite("structure", structure) : null;
      const x = projectX(structure[2]);
      const y = projectY(structure[3]);
      context.globalAlpha = 0.35 + health / 155;
      if (sprite) {
        context.save();
        context.translate(x, y);
        context.rotate(battlefieldDirectionRadians(structure[7]));
        context.drawImage(sprite, -size / 2, -size / 2, size, size);
        context.restore();
      } else {
        context.fillStyle = battlefieldPlayerColour(player);
        context.fillRect(x - size / 2, y - size / 2, size, size);
        context.strokeStyle = "rgba(255, 255, 255, 0.55)";
        context.lineWidth = 0.7;
        context.strokeRect(x - size / 2, y - size / 2, size, size);
      }
    });

    droids.forEach((droid) => {
      const player = Number(droid[1]);
      if (battlefieldHiddenPlayers.has(player)) {
        return;
      }
      visibleDroids += 1;
      const health = Math.max(0, Math.min(100, Number(droid[4]) || 0));
      const radius = Math.max(3.5, Math.min(8, fieldWidth / map.width * 1.35));
      const sprite = showDetailedModels ? battlefieldModelSprite("droid", droid) : null;
      const x = projectX(droid[2]);
      const y = projectY(droid[3]);
      context.globalAlpha = 0.4 + health / 150;
      if (sprite) {
        context.save();
        context.translate(x, y);
        context.rotate(battlefieldDirectionRadians(droid[7]));
        context.drawImage(sprite, -radius, -radius, radius * 2, radius * 2);
        context.restore();
      } else {
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fillStyle = battlefieldPlayerColour(player);
        context.fill();
        context.strokeStyle = "rgba(255, 255, 255, 0.7)";
        context.lineWidth = 0.65;
        context.stroke();
      }
    });
    context.globalAlpha = 1;
    context.restore();
    drawBattlefieldMinimap(map, structures, droids, fieldWidth, fieldHeight);

    battlefieldTime.value = formatDuration(battlefieldCurrentTime);
    battlefieldRange.value = String(Math.round(battlefieldCurrentTime));
    battlefieldZoom.value = `${Math.round(battlefieldView.scale * 100)}%`;
    battlefieldStatus.textContent = `${visibleDroids.toLocaleString()} units · ${visibleStructures.toLocaleString()} structures · ${showDetailedModels ? "detailed" : "simplified"} view`;
  }

  function drawBattlefieldMinimap(map, structures, droids, fieldWidth, fieldHeight) {
    const minimapHeight = Math.max(90, Math.min(240, Math.round(battlefieldMinimap.width * map.height / map.width)));
    if (battlefieldMinimap.height !== minimapHeight) {
      battlefieldMinimap.height = minimapHeight;
    }
    const context = battlefieldMinimap.getContext("2d");
    if (!context) return;
    const width = battlefieldMinimap.width;
    const height = battlefieldMinimap.height;
    const margin = 5;
    const mapWidth = width - margin * 2;
    const mapHeight = height - margin * 2;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#071016";
    context.fillRect(0, 0, width, height);
    if (battlefieldBackground.checked && battlefieldTerrain) {
      context.globalAlpha = 0.78;
      context.drawImage(battlefieldTerrain.canvas, margin, margin, mapWidth, mapHeight);
      context.globalAlpha = 1;
    }
    const projectX = (x) => margin + Math.max(0, Math.min(map.width, Number(x))) / map.width * mapWidth;
    const projectY = (y) => margin + Math.max(0, Math.min(map.height, Number(y))) / map.height * mapHeight;
    structures.forEach((structure) => {
      const player = Number(structure[1]);
      if (battlefieldHiddenPlayers.has(player)) return;
      context.fillStyle = battlefieldPlayerColour(player);
      context.fillRect(projectX(structure[2]) - 1.5, projectY(structure[3]) - 1.5, 3, 3);
    });
    droids.forEach((droid) => {
      const player = Number(droid[1]);
      if (battlefieldHiddenPlayers.has(player)) return;
      context.fillStyle = battlefieldPlayerColour(player);
      context.fillRect(projectX(droid[2]) - 1, projectY(droid[3]) - 1, 2, 2);
    });
    const scale = battlefieldView.scale;
    const visibleWidth = Math.min(1, 1 / scale);
    const visibleHeight = Math.min(1, 1 / scale);
    const centerX = 0.5 - battlefieldView.offsetX / (fieldWidth * scale);
    const centerY = 0.5 - battlefieldView.offsetY / (fieldHeight * scale);
    const left = Math.max(0, Math.min(1 - visibleWidth, centerX - visibleWidth / 2));
    const top = Math.max(0, Math.min(1 - visibleHeight, centerY - visibleHeight / 2));
    context.strokeStyle = "#6de8ff";
    context.lineWidth = 2;
    context.strokeRect(
      margin + left * mapWidth,
      margin + top * mapHeight,
      visibleWidth * mapWidth,
      visibleHeight * mapHeight
    );
  }

  function setBattlefieldZoom(nextScale, anchorX = null, anchorY = null) {
    const previousScale = battlefieldView.scale;
    const scale = Math.max(0.75, Math.min(16, Number(nextScale) || 1));
    if (scale === previousScale) {
      return;
    }
    const rect = battlefieldCanvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const x = anchorX == null ? centerX : anchorX;
    const y = anchorY == null ? centerY : anchorY;
    battlefieldView.offsetX = x - centerX - (x - centerX - battlefieldView.offsetX) * scale / previousScale;
    battlefieldView.offsetY = y - centerY - (y - centerY - battlefieldView.offsetY) * scale / previousScale;
    battlefieldView.scale = scale;
    drawBattlefield();
  }

  function resetBattlefieldView() {
    battlefieldView.scale = 1;
    battlefieldView.offsetX = 0;
    battlefieldView.offsetY = 0;
    drawBattlefield();
  }

  function animateBattlefield(timestamp) {
    if (!battlefieldPlaying) {
      return;
    }
    if (!battlefieldLastTick) {
      battlefieldLastTick = timestamp;
    }
    const elapsed = Math.min(250, timestamp - battlefieldLastTick);
    battlefieldLastTick = timestamp;
    battlefieldCurrentTime = Math.min(
      Number(battlefieldRange.max),
      battlefieldCurrentTime + elapsed * Number(battlefieldSpeed.value || 1)
    );
    if (timestamp - battlefieldLastDraw >= 30 || battlefieldCurrentTime >= Number(battlefieldRange.max)) {
      battlefieldLastDraw = timestamp;
      drawBattlefield();
    }
    if (battlefieldCurrentTime >= Number(battlefieldRange.max)) {
      stopBattlefieldPlayback();
      return;
    }
    battlefieldAnimationFrame = requestAnimationFrame(animateBattlefield);
  }

  function populateBattlefieldLegend(extraction) {
    battlefieldLegend.replaceChildren();
    extraction.players
      .filter((player) => !player.spectator)
      .sort((left, right) => Number(left.position) - Number(right.position))
      .forEach((player) => {
        const button = document.createElement("button");
        const marker = document.createElement("span");
        button.type = "button";
        button.className = "replay-battlefield-player";
        button.setAttribute("aria-pressed", "true");
        button.title = `Show or hide ${player.name}`;
        marker.className = "replay-battlefield-player-marker";
        marker.style.backgroundColor = playerColours[Number(player.colour)]?.value
          || battlefieldPlayerColour(player.position);
        button.append(marker, document.createTextNode(player.name));
        button.addEventListener("click", () => {
          const position = Number(player.position);
          if (battlefieldHiddenPlayers.has(position)) {
            battlefieldHiddenPlayers.delete(position);
          } else {
            battlefieldHiddenPlayers.add(position);
          }
          button.setAttribute("aria-pressed", String(!battlefieldHiddenPlayers.has(position)));
          drawBattlefield();
        });
        battlefieldLegend.append(button);
      });
  }

  function renderBattlefield(extraction, tacticalReplay) {
    stopBattlefieldPlayback();
    battlefieldFrames = tacticalReplay.positionFrames;
    battlefieldExtraction = extraction;
    battlefieldTerrain = createBattlefieldTerrain(extraction.mapTerrain);
    collectBattlefieldObjectDefinitions(battlefieldFrames);
    battlefieldSpriteCache.clear();
    battlefieldCurrentTime = 0;
    battlefieldLastDraw = 0;
    battlefieldHiddenPlayers.clear();
    battlefieldView.scale = 1;
    battlefieldView.offsetX = 0;
    battlefieldView.offsetY = 0;
    const lastFrameTime = Number(battlefieldFrames[battlefieldFrames.length - 1]?.time || 0);
    const duration = Math.max(lastFrameTime, Number(extraction.match.elapsedMilliseconds) || 0);
    const interval = Number(tacticalReplay.positionFrameIntervalSeconds) || 0;
    battlefieldRange.min = "0";
    battlefieldRange.max = String(duration);
    battlefieldRange.value = "0";
    battlefieldDuration.value = formatDuration(duration);
    const modelDefinitionCount = battlefieldDroidDefinitions.size + battlefieldStructureDefinitions.size;
    battlefieldMeta.textContent = `${battlefieldFrames.length.toLocaleString()} frames · exact positions${interval ? ` every ${interval}s` : ""}${battlefieldTerrain ? " · embedded terrain" : ""}${modelDefinitionCount ? ` · ${modelDefinitionCount.toLocaleString()} model definitions` : ""}`;
    battlefieldDroids.checked = true;
    battlefieldStructures.checked = true;
    battlefieldBackground.checked = Boolean(battlefieldTerrain);
    battlefieldBackground.disabled = !battlefieldTerrain;
    populateBattlefieldLegend(extraction);
    requestAnimationFrame(drawBattlefield);
  }

  function renderExtendedAnalysis(extraction) {
    const engineAnalysis = extraction.engineAnalysis;
    const extended = engineAnalysis?.extended;
    const snapshots = Array.isArray(extended?.snapshots) ? extended.snapshots : [];
    const timeline = Array.isArray(extended?.researchTimeline) ? extended.researchTimeline : [];
    const tacticalReplay = extended?.tacticalReplay;
    const positionFrames = Array.isArray(tacticalReplay?.positionFrames)
      ? tacticalReplay.positionFrames
      : [];

    battlefieldPanel.hidden = positionFrames.length === 0;
    if (positionFrames.length) {
      renderBattlefield(extraction, tacticalReplay);
    } else {
      stopBattlefieldPlayback();
      battlefieldFrames = [];
      battlefieldExtraction = null;
      battlefieldTerrain = null;
      battlefieldDroidDefinitions = new Map();
      battlefieldStructureDefinitions = new Map();
      battlefieldSpriteCache.clear();
    }

    snapshotPanel.hidden = snapshots.length === 0;
    if (snapshots.length) {
      snapshotMeta.textContent = `${snapshots.length.toLocaleString()} snapshots · Analyzer ${engineAnalysis.analyzerVersion || "--"}`;
      snapshotRange.min = "0";
      snapshotRange.max = String(snapshots.length - 1);
      snapshotRange.value = String(snapshots.length - 1);
      renderSnapshotFrame(extraction);
    }

    researchPanel.hidden = timeline.length === 0;
    if (timeline.length) {
      researchMeta.textContent = `${timeline.length.toLocaleString()} completed topics`;
      researchPlayer.replaceChildren();
      appendOption(researchPlayer, "", "All players");
      extraction.players
        .filter((player) => !player.spectator)
        .sort((left, right) => left.position - right.position)
        .forEach((player) => appendOption(researchPlayer, String(player.position), player.name));
      researchSearch.value = "";
      renderResearchTimeline(extraction);
    }
  }

  function appendOption(select, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }

  function populateEventFilters(extraction) {
    eventCategory.replaceChildren();
    appendOption(eventCategory, "", "All categories");
    Object.entries(extraction.events.categoryCounts)
      .sort(([left], [right]) => left.localeCompare(right))
      .forEach(([category, count]) => {
        appendOption(eventCategory, category, `${category} (${count.toLocaleString()})`);
      });

    eventPlayer.replaceChildren();
    appendOption(eventPlayer, "", "All players");
    extraction.players
      .filter((player) => !player.spectator)
      .sort((left, right) => left.position - right.position)
      .forEach((player) => {
        appendOption(eventPlayer, String(player.position), player.name);
      });

    eventSearch.value = "";
  }

  function renderEventTimeline(extraction) {
    const category = eventCategory.value;
    const playerValue = eventPlayer.value;
    const search = eventSearch.value.trim().toLowerCase();
    const filteredEvents = extraction.events.records.filter((event) => {
      if (category && event.category !== category) {
        return false;
      }
      if (playerValue && event.player !== Number(playerValue)) {
        return false;
      }
      if (!search) {
        return true;
      }

      const playerName = playerNameForPosition(extraction, event.player);
      return `${event.category} ${event.action} ${event.details} ${playerName}`
        .toLowerCase()
        .includes(search);
    });
    const displayedEvents = filteredEvents.slice(0, displayedEventLimit);

    eventsNote.textContent = filteredEvents.length > displayedEventLimit
      ? `Showing the first ${displayedEventLimit.toLocaleString()} of ${filteredEvents.length.toLocaleString()} matching events. Download JSON contains all ${extraction.events.count.toLocaleString()} decoded events.`
      : `${filteredEvents.length.toLocaleString()} matching event${filteredEvents.length === 1 ? "" : "s"}.`;

    replaceChildren(eventsBody, displayedEvents.map((event) => {
      const row = document.createElement("tr");
      row.append(
        createCell(formatDuration(event.time)),
        createCell(playerNameForPosition(extraction, event.player)),
        createCell(event.action),
        createCell(event.details)
      );
      return row;
    }));

    return displayedEvents;
  }

  function renderExtraction(extraction) {
    const playerCount = extraction.players.filter((player) => !player.spectator).length;
    const observerCount = extraction.players.length - playerCount;

    replaceChildren(summary, [
      renderSummaryItem("Map", extraction.match.map),
      renderSummaryItem("Duration", formatDuration(extraction.match.elapsedMilliseconds)),
      renderSummaryItem("Players / observers", `${playerCount} / ${observerCount}`),
      renderSummaryItem("Date", formatReplayDate(extraction.publishedStats?.endDate || latestReplayId))
    ]);

    const awardsByPlayer = calculatePlayerAwards(extraction.players, extraction.events.records);
    const researchActivityByPlayer = calculateResearchActivity(
      extraction.players,
      extraction.events.records,
      extraction.match.elapsedMilliseconds
    );
    extraction.players.forEach((player) => {
      player.researchActivity = researchActivityByPlayer.get(player);
    });
    renderCompactMatchSummary(extraction);
    renderExtendedAnalysis(extraction);
    const renderPlayerRows = () => {
      replaceChildren(
        playersBody,
        sortPlayers(extraction.players, awardsByPlayer).map((player) => (
          createPlayerRow(
            player,
            extraction.players,
            extraction.events.records,
            awardsByPlayer.get(player),
            researchActivityByPlayer.get(player)
          )
        ))
      );
    };

    const playerHeaderGroups = document.createElement("tr");
    playerHeaderGroups.append(
      createPlayerSortHeader("Slot", "position", { rowSpan: 2 }, renderPlayerRows),
      createPlayerSortHeader("Nick", "name", { rowSpan: 2 }, renderPlayerRows),
      createPlayerSortHeader("Awards", "awards", { rowSpan: 2 }, renderPlayerRows),
      createPlayerSortHeader("Score", "score", { rowSpan: 2 }, renderPlayerRows),
      createPlayerSortHeader("KD", "totalKd", { rowSpan: 2 }, renderPlayerRows),
      createPlayerSortHeader("Res", "researchActivity", { rowSpan: 2 }, renderPlayerRows),
      createHeaderCell("Units", {
        colSpan: 5,
        scope: "colgroup",
        className: "replay-stat-group"
      }),
      createHeaderCell("Structures", {
        colSpan: 5,
        scope: "colgroup",
        className: "replay-stat-group"
      })
    );

    const playerHeaderDetails = document.createElement("tr");
    playerHeaderDetails.className = "replay-stat-details";
    playerHeaderDetails.append(
      createPlayerSortHeader("Built", "droidsBuilt", {}, renderPlayerRows),
      createPlayerSortHeader("Lost", "droidsLost", {}, renderPlayerRows),
      createPlayerSortHeader("Kills", "kills", {}, renderPlayerRows),
      createPlayerSortHeader("Alive", "remainingDroids", {}, renderPlayerRows),
      createPlayerSortHeader("KD", "kd", {}, renderPlayerRows),
      createPlayerSortHeader("Built", "structuresBuilt", {}, renderPlayerRows),
      createPlayerSortHeader("Lost", "structuresLost", {}, renderPlayerRows),
      createPlayerSortHeader("Kills", "structuresDestroyed", {}, renderPlayerRows),
      createPlayerSortHeader("Alive", "remainingStructures", {}, renderPlayerRows),
      createPlayerSortHeader("KD", "structureKd", {}, renderPlayerRows)
    );
    replaceChildren(playersHead, [playerHeaderGroups, playerHeaderDetails]);
    updatePlayerSortIndicators();
    renderPlayerRows();

    replaceChildren(messagesBody, extraction.messages.types.map((message) => {
      const row = document.createElement("tr");
      row.append(
        createCell(message.type),
        createCell(message.name),
        createCell(message.count.toLocaleString()),
        createCell(message.payloadBytes.toLocaleString()),
        createCell(message.players.join(", "))
      );
      return row;
    }));

    populateEventFilters(extraction);
    const displayedEvents = renderEventTimeline(extraction);

    const rawPreview = {
      ...extraction,
      events: {
        ...extraction.events,
        records: displayedEvents,
        previewTruncated: extraction.events.count > displayedEventLimit
      }
    };
    rawJson.textContent = JSON.stringify(rawPreview, null, 2);
    results.hidden = false;
  }

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("replay-status-error", isError);
  }

  async function loadReplay() {
    const file = replayFile.files[0];
    const urlValue = replayUrl.value.trim();
    latestReplayId = "";
    latestReplaySha256 = "";

    if (!file && !urlValue) {
      throw new Error("Choose a replay file or paste a replay URL first.");
    }

    if (file) {
      latestReplayId = extractReplayId(file.name);
      return file.arrayBuffer();
    }

    const url = new URL(urlValue);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Replay URLs must use HTTP or HTTPS.");
    }

    latestReplayId = extractReplayId(url.href);
    latestReplaySha256 = extractReplaySha256(url.href);
    setStatus("Downloading replay…");
    const response = await fetch(url.href);
    if (!response.ok) {
      throw new Error(`Replay download failed with HTTP ${response.status}.`);
    }

    return response.arrayBuffer();
  }

  async function analyzeReplay() {
    if (analysisRunning) {
      return;
    }

    analysisRunning = true;
    stopBattlefieldPlayback();
    results.hidden = true;
    latestExtraction = null;
    setStatus("Reading replay…");

    try {
      const arrayBuffer = await loadReplay();
      setStatus("Parsing replay…");
      latestExtraction = parseReplay(arrayBuffer);
      if (latestExtraction.embeddedMapArchive) {
        setStatus("Reading embedded map terrain…");
        try {
          await loadEmbeddedMapTerrain(latestExtraction);
        } catch (error) {
          latestExtraction.mapTerrainError = error.message || "Embedded map terrain could not be loaded.";
        }
      }
      let publishedResult = null;
      if (latestReplaySha256) {
        setStatus("Loading replay-engine player summary…");
        try {
          publishedResult = await loadWzstatsResult(latestReplaySha256);
        } catch (error) {
          latestExtraction.publishedStatsError = error.message || "Replay-engine player summary could not be loaded.";
        }
      }
      attachPublishedPlayerStats(latestExtraction, publishedResult);
      renderExtraction(latestExtraction);
      setStatus("");
    } catch (error) {
      const corsHint = error instanceof TypeError
        ? " The server may block browser downloads; download the replay and choose the local file instead."
        : "";
      setStatus(`${error.message || "Replay analysis failed."}${corsHint}`, true);
    } finally {
      analysisRunning = false;
    }
  }

  replayFile.addEventListener("change", () => {
    if (replayFile.files.length) {
      replayFileName.textContent = replayFile.files[0].name;
      replayUrl.value = "";
      analyzeReplay();
    }
  });

  demoButton.addEventListener("click", () => {
    replayFile.value = "";
    replayFileName.textContent = "Demo replay";
    replayUrl.value = new URL("assets/demo-1784228315284.wzrp", document.baseURI).href;
    analyzeReplay();
  });

  demoButton2.addEventListener("click", () => {
    replayFile.value = "";
    replayFileName.textContent = "Demo replay 2";
    replayUrl.value = new URL("assets/demo-1784409240892.wzrp", document.baseURI).href;
    analyzeReplay();
  });

  function analyzeReplayUrl() {
    if (!replayUrl.value.trim()) {
      setStatus("Paste a direct replay URL first.", true);
      replayUrl.focus();
      return;
    }

    replayFile.value = "";
    replayFileName.textContent = "No file selected";
    analyzeReplay();
  }

  replayUrlGo.addEventListener("click", analyzeReplayUrl);

  replayUrl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      replayUrl.blur();
      analyzeReplayUrl();
    }
  });

  const linkedReplayUrl = new URLSearchParams(window.location.search).get("replay");
  if (linkedReplayUrl) {
    replayUrl.value = linkedReplayUrl;
    analyzeReplayUrl();
  }

  eventCategory.addEventListener("change", () => {
    if (latestExtraction) {
      renderEventTimeline(latestExtraction);
    }
  });

  eventPlayer.addEventListener("change", () => {
    if (latestExtraction) {
      renderEventTimeline(latestExtraction);
    }
  });

  eventSearch.addEventListener("input", () => {
    if (latestExtraction) {
      renderEventTimeline(latestExtraction);
    }
  });

  snapshotRange.addEventListener("input", () => {
    if (latestExtraction) {
      renderSnapshotFrame(latestExtraction);
    }
  });

  battlefieldPlay.addEventListener("click", () => {
    if (!battlefieldFrames.length) {
      return;
    }
    if (battlefieldPlaying) {
      stopBattlefieldPlayback();
      return;
    }
    if (battlefieldCurrentTime >= Number(battlefieldRange.max)) {
      battlefieldCurrentTime = 0;
    }
    battlefieldPlaying = true;
    battlefieldPlay.classList.add("is-playing");
    battlefieldPlay.setAttribute("aria-label", "Pause replay");
    battlefieldPlay.title = "Pause replay";
    battlefieldLastTick = 0;
    battlefieldAnimationFrame = requestAnimationFrame(animateBattlefield);
  });

  battlefieldRange.addEventListener("input", () => {
    battlefieldCurrentTime = Number(battlefieldRange.value);
    battlefieldLastTick = 0;
    drawBattlefield();
  });

  battlefieldDroids.addEventListener("change", drawBattlefield);
  battlefieldStructures.addEventListener("change", drawBattlefield);
  battlefieldBackground.addEventListener("change", drawBattlefield);
  battlefieldZoomOut.addEventListener("click", () => setBattlefieldZoom(battlefieldView.scale / 1.25));
  battlefieldZoomIn.addEventListener("click", () => setBattlefieldZoom(battlefieldView.scale * 1.25));
  battlefieldResetView.addEventListener("click", resetBattlefieldView);
  battlefieldFullscreen.addEventListener("click", async () => {
    if (document.fullscreenElement === battlefieldPanel) {
      await document.exitFullscreen();
    } else {
      await battlefieldPanel.requestFullscreen();
    }
  });
  document.addEventListener("fullscreenchange", () => {
    const active = document.fullscreenElement === battlefieldPanel;
    battlefieldFullscreen.textContent = active ? "Exit full screen" : "Full screen";
    battlefieldFullscreen.setAttribute("aria-pressed", String(active));
    requestAnimationFrame(drawBattlefield);
  });
  battlefieldCanvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = battlefieldCanvas.getBoundingClientRect();
    setBattlefieldZoom(
      battlefieldView.scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15),
      event.clientX - rect.left,
      event.clientY - rect.top
    );
  }, { passive: false });
  battlefieldCanvas.addEventListener("pointerdown", (event) => {
    battlefieldPan = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX: battlefieldView.offsetX,
      offsetY: battlefieldView.offsetY
    };
    battlefieldCanvas.setPointerCapture(event.pointerId);
    battlefieldCanvas.classList.add("is-panning");
  });
  battlefieldCanvas.addEventListener("pointermove", (event) => {
    if (!battlefieldPan || battlefieldPan.pointerId !== event.pointerId) {
      return;
    }
    battlefieldView.offsetX = battlefieldPan.offsetX + event.clientX - battlefieldPan.x;
    battlefieldView.offsetY = battlefieldPan.offsetY + event.clientY - battlefieldPan.y;
    drawBattlefield();
  });
  battlefieldCanvas.addEventListener("pointerup", (event) => {
    if (battlefieldPan?.pointerId === event.pointerId) {
      battlefieldPan = null;
      battlefieldCanvas.classList.remove("is-panning");
    }
  });
  battlefieldCanvas.addEventListener("pointercancel", () => {
    battlefieldPan = null;
    battlefieldCanvas.classList.remove("is-panning");
  });
  battlefieldCanvas.addEventListener("dblclick", resetBattlefieldView);

  if (typeof ResizeObserver === "function") {
    const battlefieldResizeObserver = new ResizeObserver(() => drawBattlefield());
    battlefieldResizeObserver.observe(battlefieldCanvas);
  } else {
    window.addEventListener("resize", drawBattlefield);
  }

  researchPlayer.addEventListener("change", () => {
    if (latestExtraction) {
      renderResearchTimeline(latestExtraction);
    }
  });

  researchSearch.addEventListener("input", () => {
    if (latestExtraction) {
      renderResearchTimeline(latestExtraction);
    }
  });
})();
