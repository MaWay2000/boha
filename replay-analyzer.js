(function () {
  const replayFile = document.getElementById("replayFile");
  const replayFileName = document.getElementById("replayFileName");
  const replayUrl = document.getElementById("replayUrl");
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
  const playersBody = document.getElementById("replayPlayers");
  const playersHead = playersBody.closest("table").querySelector("thead");
  const messagesBody = document.getElementById("replayMessages");
  const eventsBody = document.getElementById("replayEvents");
  const eventsNote = document.getElementById("replayEventsNote");
  const eventCategory = document.getElementById("replayEventCategory");
  const eventPlayer = document.getElementById("replayEventPlayer");
  const eventSearch = document.getElementById("replayEventSearch");
  const rawJson = document.getElementById("replayRawJson");

  const textDecoder = new TextDecoder("utf-8", { fatal: true });
  const displayedEventLimit = 500;
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
  let playerSortState = { key: "position", direction: "asc" };

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

  async function loadPublishedResult(replayId) {
    if (!replayId) {
      return null;
    }

    const manifestUrl = new URL("stats/upstream-manifest.json", document.baseURI);
    const manifestResponse = await fetch(manifestUrl, { cache: "no-store" });
    if (!manifestResponse.ok) {
      throw new Error(`Unable to load player-stat index (${manifestResponse.status}).`);
    }

    const manifest = await manifestResponse.json();
    const snapshotMetadata = manifest.files && manifest.files["results-snapshot.json"];
    const range = snapshotMetadata && snapshotMetadata.replayOffsets
      ? snapshotMetadata.replayOffsets[replayId]
      : null;
    if (!Array.isArray(range) || range.length !== 2) {
      return null;
    }

    const [start, length] = range;
    const isLocalPreview = ["127.0.0.1", "localhost"].includes(window.location.hostname);
    const snapshotUrl = isLocalPreview
      ? new URL("https://raw.githubusercontent.com/MaWay2000/boha/main/stats/results-snapshot.json")
      : new URL("stats/results-snapshot.json", document.baseURI);
    const resultResponse = await fetch(snapshotUrl, {
      headers: {
        Range: `bytes=${start}-${start + length - 1}`
      }
    });

    if (resultResponse.status !== 206) {
      if (resultResponse.body) {
        await resultResponse.body.cancel();
      }
      throw new Error("The statistics host did not return the requested replay range.");
    }

    const publishedResult = await resultResponse.json();
    if (extractReplayId(publishedResult.replayUrl) !== replayId) {
      throw new Error("The player-stat index does not match this replay.");
    }

    return publishedResult;
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
        playerLeftGameTime: published.playerLeftGameTime
      };
    });

    extraction.publishedStats = publishedResult
      ? {
          replayUrl: publishedResult.replayUrl,
          endDate: publishedResult.endDate,
          playersMatched
        }
      : null;
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

    if (replayFormat >= 2) {
      assertRange(messageOffset, 8, bytes.length, "embedded map header");
      embeddedMapVersion = view.getUint32(messageOffset, false);
      embeddedMapBytes = view.getUint32(messageOffset + 4, false);
      messageOffset += 8;
      assertRange(messageOffset, embeddedMapBytes, bytes.length, "embedded map");
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

    return {
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

  function formatReplayDate(replayId) {
    const timestamp = Number(replayId);
    if (!Number.isFinite(timestamp)) {
      return "Unknown";
    }

    const date = new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp);
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
    const competitors = players.filter((player) => !player.spectator && player.summary);
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

  function createPlayerStory(player, players, events, idlePercent) {
    if (player.spectator) {
      return `${player.name} observed the match from slot ${player.position} and did not participate in the recorded combat.`;
    }

    const stats = player.summary || {};
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

    if (structuresBuilt === highestConstruction && structuresBuilt > 0) {
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

    if (research != null && idlePercent != null) {
      story.push(`They completed ${number(research)} research topics at an estimated ${100 - idlePercent}% research-lab utilization.`);
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
    cell.append(name);
    return cell;
  }

  function calculateResearchIdle(players, matchDuration) {
    const rates = new Map();
    players.forEach((player) => {
      const completed = playerStat(player, "researchComplete");
      const leftTime = playerStat(player, "playerLeftGameTime");
      const activeTime = Number.isFinite(leftTime) ? leftTime : Number(matchDuration);
      if (!player.spectator && completed != null && Number.isFinite(activeTime) && activeTime > 0) {
        rates.set(player, completed / activeTime);
      }
    });

    const fastestRate = Math.max(...rates.values(), 0);
    return new Map(players.map((player) => {
      const rate = rates.get(player);
      if (!Number.isFinite(rate) || fastestRate <= 0) {
        return [player, null];
      }
      return [player, Math.round((1 - (rate / fastestRate)) * 100)];
    }));
  }

  function createResearchCell(player, idlePercent) {
    const cell = document.createElement("td");
    const count = formatStat(player.summary && player.summary.researchComplete);
    if (count == null) {
      cell.textContent = "—";
      return cell;
    }

    const content = document.createElement("span");
    content.className = "replay-research-stat";
    const countElement = document.createElement("span");
    countElement.textContent = count;
    content.append(countElement);

    if (idlePercent != null) {
      const idle = document.createElement("span");
      idle.className = "replay-research-idle replay-tooltip";
      idle.textContent = `- ${100 - idlePercent}%`;
      idle.dataset.tooltip = "Estimated research-lab utilization based on completed research per active match minute versus the fastest player in this replay.";
      idle.setAttribute("aria-label", idle.dataset.tooltip);
      idle.tabIndex = 0;
      content.append(idle);
    }

    cell.append(content);
    return cell;
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

  function createPlayerRow(player, players, events, awards, researchIdle) {
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
      createPlayerNameCell(player, createPlayerStory(player, players, events, researchIdle)),
      createPlayerAwardsCell(awards),
      createCell(formatStat(stats.score)),
      createCell(formatStat(stats.droidsBuilt)),
      createCell(formatStat(stats.droidsLost)),
      createCell(formatStat(stats.kills)),
      createCell(formatStat(stats.remainingDroids)),
      createCell(formatStat(stats.structuresBuilt)),
      createCell(formatStat(stats.structuresLost)),
      createCell(formatStat(stats.structuresDestroyed)),
      createCell(formatStat(stats.remainingStructures)),
      createResearchCell(player, researchIdle)
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

  function playerNameForPosition(extraction, position) {
    if (position == null) {
      return "—";
    }

    const player = extraction.players.find((item) => item.position === position);
    return player ? player.name : `Player ${position}`;
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
      renderSummaryItem("Date", formatReplayDate(latestReplayId))
    ]);

    const awardsByPlayer = calculatePlayerAwards(extraction.players, extraction.events.records);
    const researchIdleByPlayer = calculateResearchIdle(
      extraction.players,
      extraction.match.elapsedMilliseconds
    );
    const renderPlayerRows = () => {
      replaceChildren(
        playersBody,
        sortPlayers(extraction.players, awardsByPlayer).map((player) => (
          createPlayerRow(
            player,
            extraction.players,
            extraction.events.records,
            awardsByPlayer.get(player),
            researchIdleByPlayer.get(player)
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
      createHeaderCell("Units", {
        colSpan: 4,
        scope: "colgroup",
        className: "replay-stat-group"
      }),
      createHeaderCell("Structures", {
        colSpan: 4,
        scope: "colgroup",
        className: "replay-stat-group"
      }),
      createPlayerSortHeader("Research", "researchComplete", { rowSpan: 2 }, renderPlayerRows)
    );

    const playerHeaderDetails = document.createElement("tr");
    playerHeaderDetails.className = "replay-stat-details";
    playerHeaderDetails.append(
      createPlayerSortHeader("Built", "droidsBuilt", {}, renderPlayerRows),
      createPlayerSortHeader("Lost", "droidsLost", {}, renderPlayerRows),
      createPlayerSortHeader("Destroyed", "kills", {}, renderPlayerRows),
      createPlayerSortHeader("Alive", "remainingDroids", {}, renderPlayerRows),
      createPlayerSortHeader("Built", "structuresBuilt", {}, renderPlayerRows),
      createPlayerSortHeader("Lost", "structuresLost", {}, renderPlayerRows),
      createPlayerSortHeader("Destroyed", "structuresDestroyed", {}, renderPlayerRows),
      createPlayerSortHeader("Alive", "remainingStructures", {}, renderPlayerRows)
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
    results.hidden = true;
    latestExtraction = null;
    setStatus("Reading replay…");

    try {
      const arrayBuffer = await loadReplay();
      setStatus("Parsing replay…");
      latestExtraction = parseReplay(arrayBuffer);
      let publishedResult = null;
      if (latestReplayId) {
        setStatus("Loading player summary…");
        try {
          publishedResult = await loadPublishedResult(latestReplayId);
        } catch (error) {
          latestExtraction.publishedStatsError = error.message || "Player summary could not be loaded.";
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

  replayUrl.addEventListener("change", () => {
    if (replayUrl.value.trim()) {
      replayFile.value = "";
      replayFileName.textContent = "No file selected";
      analyzeReplay();
    }
  });

  replayUrl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      replayFile.value = "";
      replayFileName.textContent = "No file selected";
      replayUrl.blur();
      analyzeReplay();
    }
  });

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
})();
