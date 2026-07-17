(function () {
  const replayFile = document.getElementById("replayFile");
  const replayUrl = document.getElementById("replayUrl");
  const analyzeButton = document.getElementById("analyzeReplay");
  const downloadButton = document.getElementById("downloadReplayJson");
  const status = document.getElementById("replayStatus");
  const results = document.getElementById("replayResults");
  const summary = document.getElementById("replaySummary");
  const playersBody = document.getElementById("replayPlayers");
  const playersHeadRow = playersBody.closest("table").querySelector("thead tr");
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
  let latestExtraction = null;
  let latestFileName = "replay-analysis.json";
  let latestReplayId = "";

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

  function replaceChildren(element, children) {
    element.replaceChildren(...children);
  }

  function createCell(value) {
    const cell = document.createElement("td");
    cell.textContent = value == null || value === "" ? "—" : String(value);
    return cell;
  }

  function createHeaderCell(label) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
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
      renderSummaryItem("Game version", extraction.format.gameVersion),
      renderSummaryItem("Replay format", String(extraction.format.replayFormat)),
      renderSummaryItem("Players / observers", `${playerCount} / ${observerCount}`),
      renderSummaryItem("Messages", extraction.messages.count.toLocaleString()),
      renderSummaryItem("Replay size", formatBytes(extraction.file.bytes)),
      renderSummaryItem("Embedded map", formatBytes(extraction.file.embeddedMapBytes))
    ]);

    replaceChildren(playersHeadRow, [
      "Name",
      "Result",
      "Kills",
      "Units built",
      "Units lost",
      "Structures destroyed",
      "Structures built",
      "Structures lost",
      "Research",
      "Score",
      "Power",
      "Oil rigs",
      "Units remaining",
      "Structures remaining",
      "Position",
      "Team",
      "Colour",
      "Role",
      "Faction"
    ].map(createHeaderCell));

    replaceChildren(playersBody, extraction.players.map((player) => {
      const row = document.createElement("tr");
      let role = "Player";
      if (player.spectator) {
        role = player.admin ? "Admin spectator" : "Spectator";
      } else if (player.ai >= 0) {
        role = "Bot";
      }

      const stats = player.summary || {};
      row.append(
        createCell(player.name),
        createCell(formatPlayerResult(player)),
        createCell(formatStat(stats.kills)),
        createCell(formatStat(stats.droidsBuilt)),
        createCell(formatStat(stats.droidsLost)),
        createCell(formatStat(stats.structuresDestroyed)),
        createCell(formatStat(stats.structuresBuilt)),
        createCell(formatStat(stats.structuresLost)),
        createCell(formatStat(stats.researchComplete)),
        createCell(formatStat(stats.score)),
        createCell(formatStat(stats.power)),
        createCell(formatStat(stats.oilRigs)),
        createCell(formatStat(stats.remainingDroids)),
        createCell(formatStat(stats.remainingStructures)),
        createCell(player.position),
        createCell(player.team),
        createCell(player.colour),
        createCell(role),
        createCell(player.faction)
      );
      return row;
    }));

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
    downloadButton.disabled = false;
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
      latestFileName = `${file.name.replace(/\.wzrp$/i, "") || "replay"}-analysis.json`;
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

    const urlName = url.pathname.split("/").pop() || "replay";
    latestFileName = `${urlName.replace(/\.wzrp$/i, "")}-analysis.json`;
    return response.arrayBuffer();
  }

  analyzeButton.addEventListener("click", async () => {
    analyzeButton.disabled = true;
    downloadButton.disabled = true;
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
      const summaryStatus = publishedResult ? " Player summary loaded." : " Player summary unavailable.";
      setStatus(`Analysis complete: ${latestExtraction.messages.count.toLocaleString()} messages found.${summaryStatus}`);
    } catch (error) {
      const corsHint = error instanceof TypeError
        ? " The server may block browser downloads; download the replay and choose the local file instead."
        : "";
      setStatus(`${error.message || "Replay analysis failed."}${corsHint}`, true);
    } finally {
      analyzeButton.disabled = false;
    }
  });

  downloadButton.addEventListener("click", () => {
    if (!latestExtraction) {
      return;
    }

    const blob = new Blob([JSON.stringify(latestExtraction, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = latestFileName;
    link.click();
    URL.revokeObjectURL(url);
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
