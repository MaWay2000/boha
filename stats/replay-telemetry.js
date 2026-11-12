(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BohaReplayTelemetry = factory();
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const SCHEMA_VERSION = 1;
  const types = new Set(["start", "unitBuilt", "structureBuilt", "destroyed", "demolitionStarted",
    "ownershipTransfer", "researchCompleted", "attackNotice", "sample"]);
  const number = value => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  const index = value => number(value) != null && Number.isSafeInteger(value) ? value : null;
  const label = value => typeof value === "string" ? value.slice(0, 160) : null;
  const nativeReasons = {
    killHistory: "Engine-confirmed kill credit is recorded separately from uncredited combat deaths.",
    combatValue: "Nominal unit value at confirmed enemy kills. Friendly fire, recycling and captures are excluded; this is not actual power spent.",
    damage: "Actual combat HP removed and shield loss, recorded separately. Damage with no surviving attacker reference remains unattributed.",
    repairs: "Actual restored HP and repairer from repair units, trucks, facilities, rearm pads and self-repair. Script health edits are separate.",
    donations: "Applied object gifts and actual power debited/credited. Captures and recipient storage losses remain distinct.",
    economy: "Exact fixed-point power changes: generation, spending, refunds, gifts, adjustments and storage waste. Adjustments are not earned income."
  };
  function nativeEvidence(value, duration) {
    if (!value || value.schemaVersion !== 1 || value.profile !== "maway-native-events-v1"
      || value.durationMilliseconds !== duration || !Number.isSafeInteger(value.rawRecords) || value.rawRecords < 2
      || !/^[a-f0-9]{64}$/.test(value.logSha256 || "") || !/^[a-f0-9]{64}$/.test(value.engineSha256 || "")
      || !Array.isArray(value.errors) || !Array.isArray(value.players) || value.players.length > 32
      || !Array.isArray(value.events) || value.events.length > 200000) return null;
    const numeric = ["hitPointsDealt", "hitPointsLost", "shieldPointsDealt", "shieldPointsLost", "unattributedHitPointsLost",
      "enemyKills", "enemyStructureKills", "alliedKills", "alliedStructureKills", "combatDeaths", "unattributedCombatDeaths", "enemyUnitValueDestroyed", "enemyUnitValueLost",
      "repairPointsGiven", "repairPointsReceived", "donatedObjects", "receivedObjects"];
    const exact = ["donatedPowerDebitFixed", "receivedPowerCreditFixed", "powerCreditFixed", "powerDebitFixed", "wastedPowerFixed"];
    const slots = new Set(), nativeTypes = new Set(["damage", "combatKill", "repair", "objectDonation", "capture", "powerDonation", "powerFlow", "scriptHealth"]);
    for (const player of value.players) {
      if (!player || index(player.player) == null || player.player > 31 || slots.has(player.player)
        || numeric.some(key => index(player[key]) == null)
        || exact.some(key => typeof player[key] !== "string" || !/^\d{1,30}$/.test(player[key]))) return null;
      slots.add(player.player);
      if (!player.powerOperations || typeof player.powerOperations !== "object" || Array.isArray(player.powerOperations)
        || Object.keys(player.powerOperations).length > 64 || Object.values(player.powerOperations).some(operation => !operation
          || index(operation.transactions) == null || ["creditFixed", "debitFixed", "wastedFixed"].some(key => typeof operation[key] !== "string" || !/^\d{1,30}$/.test(operation[key])))) return null;
      if (player.initialPowerFixed != null || player.finalPowerFixed != null) {
        if (typeof player.initialPowerFixed !== "string" || !/^-?\d{1,30}$/.test(player.initialPowerFixed)
          || typeof player.finalPowerFixed !== "string" || !/^-?\d{1,30}$/.test(player.finalPowerFixed)) return null;
        if (BigInt(player.finalPowerFixed) - BigInt(player.initialPowerFixed)
          !== BigInt(player.powerCreditFixed) - BigInt(player.powerDebitFixed)) return null;
      }
    }
    if (value.events.some(event => !event || !nativeTypes.has(event.type) || number(event.timeMilliseconds) == null
      || event.timeMilliseconds > duration)) return null;
    const nativeSlot = value => index(value) != null && value < 32;
    const nativeFixed = (value, signed = false) => typeof value === "string" && (signed ? /^-?\d{1,30}$/ : /^\d{1,30}$/).test(value);
    for (const event of value.events) {
      if (["combatKill", "repair", "objectDonation", "capture", "scriptHealth"].includes(event.type) && !object(event.object)) return null;
      if (event.type === "combatKill" && (typeof event.credited !== "boolean" || (event.credited && !nativeSlot(event.source?.player)))) return null;
      if (event.type === "damage" && (!nativeSlot(event.targetPlayer) || (event.player != null && !nativeSlot(event.player)) || index(event.hitPoints) == null || index(event.shieldPoints) == null)) return null;
      if (event.type === "repair" && (index(event.hitPoints) == null || (event.repairer && !object(event.repairer)) || typeof event.mechanism !== "string")) return null;
      if (["objectDonation", "capture", "powerDonation"].includes(event.type) && (!nativeSlot(event.from) || !nativeSlot(event.to) || event.from === event.to)) return null;
      if (event.type === "powerDonation" && (!nativeFixed(event.debitedFixed) || !nativeFixed(event.creditedFixed))) return null;
      if (event.type === "powerFlow" && (!nativeSlot(event.player) || !nativeFixed(event.beforeFixed, true) || !nativeFixed(event.afterFixed, true)
        || ["creditFixed", "debitFixed", "wastedFixed"].some(key => !nativeFixed(event[key])) || index(event.transactions) == null)) return null;
      if (event.type === "scriptHealth" && (index(event.before) == null || index(event.after) == null)) return null;
    }
    return { ...value, complete: value.complete === true && value.errors.length === 0 };
  }
  function object(value) {
    if (!value || index(value.id) == null || index(value.player) == null
      || !["unit", "structure"].includes(value.kind)) return null;
    return { id: value.id, player: value.player, kind: value.kind, name: label(value.name),
      cost: number(value.cost), x: number(value.x), y: number(value.y), statType: index(value.statType) };
  }
  function normalize(record) {
    if (!record || record.schemaVersion !== SCHEMA_VERSION || !types.has(record.type)
      || number(record.timeMilliseconds) == null) return null;
    const result = { schemaVersion: SCHEMA_VERSION, type: record.type, timeMilliseconds: record.timeMilliseconds };
    if (record.type === "start") return { ...result, source: "warzone-script-events-v1" };
    if (record.type === "sample") {
      if (!Array.isArray(record.players) || record.players.length === 0) return null;
      if (record.players.some(player => !player || typeof player !== "object")) return null;
      const players = record.players.map(player => ({ player: index(player.player),
        units: index(player.units), structures: index(player.structures),
        unitValue: number(player.unitValue), structureValue: number(player.structureValue),
        powerBalance: number(player.powerBalance) }));
      if (players.some(player => player.player == null || player.units == null || player.structures == null)
        || new Set(players.map(player => player.player)).size !== players.length) return null;
      return { ...result, players };
    }
    if (record.type === "researchCompleted") {
      if (index(record.player) == null || !label(record.research)) return null;
      return { ...result, player: record.player, research: label(record.research),
        labId: index(record.labId), locallyCompleted: record.locallyCompleted === true && index(record.labId) != null,
        nominalCost: number(record.nominalCost) };
    }
    const observed = object(record.object);
    if (!observed) return null;
    if (record.type === "unitBuilt" && observed.kind !== "unit") return null;
    if (["structureBuilt", "demolitionStarted"].includes(record.type) && observed.kind !== "structure") return null;
    result.object = observed;
    if (record.type === "ownershipTransfer") {
      if (index(record.from) == null || index(record.to) == null || record.to !== observed.player
        || record.from === record.to) return null;
      result.from = record.from; result.to = record.to; result.reason = "unknown";
    }
    if (record.type === "destroyed") result.cause = "unknown";
    if (record.type === "attackNotice") result.attacker = object(record.attacker);
    if (record.type === "unitBuilt") result.factoryId = index(record.factoryId);
    if (["structureBuilt", "demolitionStarted"].includes(record.type)) result.builderId = index(record.builderId);
    return result;
  }
  function parseLogs(texts) {
    const records = []; let malformedRecords = 0;
    for (const text of texts) {
      const markers = [...String(text).matchAll(/__BOHATELEMETRY__/g)].length;
      let matched = 0;
      for (const match of String(text).matchAll(/__BOHATELEMETRY__(.*?)__ENDBOHATELEMETRY__/gs)) {
        matched++;
        try { records.push(JSON.parse(match[1])); } catch { malformedRecords++; }
      }
      malformedRecords += markers - matched;
    }
    return { records, malformedRecords };
  }
  function compile(records, options = {}) {
    if (!Array.isArray(records)) records = [];
    const unique = new Map(); let rejectedRecords = index(options.malformedRecords) ?? 0;
    for (const raw of records) {
      const record = normalize(raw);
      if (!record) { rejectedRecords++; continue; }
      // All-events callbacks can arrive through multiple script instances.
      // Their instance-local sequence numbers are deliberately not part of identity.
      const key = JSON.stringify(record);
      if (!unique.has(key)) unique.set(key, record);
    }
    const events = [...unique.values()].sort((a, b) => a.timeMilliseconds - b.timeMilliseconds);
    const started = events.some(event => event.type === "start" && event.timeMilliseconds <= 1000);
    const duration = number(options.durationMilliseconds);
    const complete = options.complete === true && duration != null && duration > 0 && started
      && rejectedRecords === 0 && events.every(event => event.timeMilliseconds <= duration);
    const tracked = events.some(event => event.type === "start");
    const observed = tracked ? events.filter(event => event.type !== "start").length : null;
    const samples = events.filter(event => event.type === "sample");
    const reasons = {
      killHistory: "The stock engine does not provide the killer on destruction callbacks. Attack notices are throttled and are not kill credit.",
      combatValue: "Enemy-unit value trades need confirmed killer, cause, ownership and cost together. Destruction costs alone are not combat losses.",
      damage: "The stock script API does not report exact hit damage. Health snapshots cannot recover damage absorbed between repairs.",
      repairs: "No exact repair-amount or repairer callback is available; health increases are not attributed repairs.",
      donations: "Ownership transfers are recorded, but the callback does not distinguish gifts from captures or confirm power gifts.",
      economy: "Power balances and completed-asset values are recorded, not exact income, spending or refunds."
    };
    const availability = {};
    for (const [key, reason] of Object.entries(reasons)) availability[key] = { available: false, reason };
    const native = nativeEvidence(options.nativeTelemetry, duration);
    if (native?.complete) for (const [key, reason] of Object.entries(nativeReasons)) availability[key] = { available: true, reason };
    else if (options.nativeTelemetry) for (const key of Object.keys(nativeReasons)) availability[key] = {
      available: false, reason: "Native engine recording is incomplete or could not be verified. Reanalysis is needed before these totals can be shown."
    };
    const historyReason = !tracked ? "Reanalyse with telemetry v1 to collect these events."
      : !complete ? "Partial or unverified replay coverage; records are observations, not complete totals." : null;
    for (const key of ["objectHistory", "construction", "research", "ownershipTransfers", "armyValueHistory", "powerBalanceHistory"])
      availability[key] = { available: complete, reason: historyReason };
    for (const [key, field] of [["armyValueHistory", "unitValue"], ["powerBalanceHistory", "powerBalance"]]) {
      if (!samples.length || samples.some(sample => sample.players.some(player => player[field] == null)))
        availability[key] = { available: false, reason: "Complete numeric samples are unavailable." };
    }
    const players = new Map();
    function stats(player) {
      if (!players.has(player)) players.set(player, { player, completedUnits: 0, completedStructures: 0,
        completedUnitValue: 0, completedStructureValue: 0, observedDestroyedUnits: 0,
        observedDestroyedUnitValue: 0, observedDestroyedStructures: 0,
        locallyCompletedResearch: 0, ownershipTransfersIn: 0, ownershipTransfersOut: 0,
        structuresReplaced: 0 });
      return players.get(player);
    }
    function addValue(target, key, value) { target[key] = target[key] == null || value == null ? null : target[key] + value; }
    const built = new Set(), destroyed = new Set(), lostSites = new Map(), replaced = new Set();
    const site = item => item.name && item.x != null && item.y != null
      ? JSON.stringify([item.player, item.name, item.x, item.y]) : null;
    for (const event of events) {
      if (event.type === "sample") { event.players.forEach(player => stats(player.player)); continue; }
      if (event.type === "researchCompleted") {
        if (event.locallyCompleted) stats(event.player).locallyCompletedResearch++;
        continue;
      }
      if (!event.object) continue;
      const item = event.object, target = stats(item.player);
      if (["unitBuilt", "structureBuilt"].includes(event.type)) {
        const identity = `${item.kind}:${item.id}`;
        if (built.has(identity)) continue;
        built.add(identity);
        if (event.type === "unitBuilt") { target.completedUnits++; addValue(target, "completedUnitValue", item.cost); }
        else {
          target.completedStructures++; addValue(target, "completedStructureValue", item.cost);
          const location = site(item), previous = location && lostSites.get(location);
          if (previous && previous.time < event.timeMilliseconds && previous.id !== item.id && !replaced.has(previous.id)) {
            target.structuresReplaced++; replaced.add(previous.id);
          }
        }
      } else if (event.type === "destroyed") {
        const identity = `${item.kind}:${item.id}`;
        if (destroyed.has(identity)) continue;
        destroyed.add(identity);
        if (item.kind === "unit") { target.observedDestroyedUnits++; addValue(target, "observedDestroyedUnitValue", item.cost); }
        else { target.observedDestroyedStructures++; const location = site(item);
          if (location) lostSites.set(location, { id: item.id, time: event.timeMilliseconds }); }
      } else if (event.type === "ownershipTransfer") {
        stats(event.from).ownershipTransfersOut++; target.ownershipTransfersIn++;
      }
    }
    const totals = [...players.values()].map(player => {
      if (complete) return player;
      return Object.fromEntries(Object.keys(player).map(key => [key, key === "player" ? player.player : null]));
    });
    return { schemaVersion: SCHEMA_VERSION, source: "warzone-script-events-v1", complete,
      durationMilliseconds: duration, rejectedRecords, observedRecords: observed,
      availability, players: totals, events, samples, ...(native ? { native } : {}) };
  }
  return { SCHEMA_VERSION, normalize, parseLogs, compile, nativeEvidence };
});
