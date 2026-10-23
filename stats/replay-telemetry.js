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
      availability, players: totals, events, samples };
  }
  return { SCHEMA_VERSION, normalize, parseLogs, compile };
});
