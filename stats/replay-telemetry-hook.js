// Read-only Warzone JS API instrumentation. No orders, power changes, or game
// state mutations. eventAttacked is throttled and eventDestroyed has no killer:
// neither is treated as a confirmed kill or an exact damage measurement.
namespace("_bohaTelemetry_");
receiveAllEvents(true);
var _bohaTelemetry_sequence = 0;
var _bohaTelemetry_seenBuildings = {};
var _bohaTelemetry_lastAttack = {};
var _bohaTelemetry_overflow = false;

function _bohaTelemetry_number(value)
{
  return typeof value === "number" && isFinite(value) && value >= 0 ? value : null;
}

function _bohaTelemetry_object(object)
{
  if (!object || (object.type !== DROID && object.type !== STRUCTURE)) return null;
  return {
    id: object.id, player: object.player,
    kind: object.type === DROID ? "unit" : "structure",
    name: object.name || null, cost: _bohaTelemetry_number(object.cost),
    x: object.x, y: object.y,
    statType: object.type === STRUCTURE ? object.stattype : null
  };
}

function _bohaTelemetry_emit(type, details)
{
  // Bound logs on unusually long/busy replays. A rejected sentinel explicitly
  // invalidates completeness instead of silently publishing truncated totals.
  if (_bohaTelemetry_sequence >= 100000)
  {
    if (!_bohaTelemetry_overflow)
    {
      _bohaTelemetry_overflow = true;
      dump('__BOHATELEMETRY__{"schemaVersion":1,"type":"overflow"}__ENDBOHATELEMETRY__');
    }
    return;
  }
  var record = details || {};
  record.schemaVersion = 1;
  record.sequence = ++_bohaTelemetry_sequence;
  record.type = type;
  record.timeMilliseconds = gameTime;
  dump("__BOHATELEMETRY__" + JSON.stringify(record) + "__ENDBOHATELEMETRY__");
}

function _bohaTelemetry_eventStartLevel()
{
  _bohaTelemetry_emit("start", { source: "warzone-script-events-v1" });
  _bohaTelemetry_sample();
}

function _bohaTelemetry_eventDroidBuilt(droid, factory)
{
  var object = _bohaTelemetry_object(droid);
  if (object) _bohaTelemetry_emit("unitBuilt", { object: object, factoryId: factory ? factory.id : null });
}

function _bohaTelemetry_eventStructureBuilt(structure, builder)
{
  var object = _bohaTelemetry_object(structure);
  if (!object || _bohaTelemetry_seenBuildings[object.id]) return;
  _bohaTelemetry_seenBuildings[object.id] = true;
  _bohaTelemetry_emit("structureBuilt", { object: object, builderId: builder ? builder.id : null });
}

function _bohaTelemetry_eventDestroyed(object)
{
  var observed = _bohaTelemetry_object(object);
  if (observed) _bohaTelemetry_emit("destroyed", { object: observed, cause: "unknown" });
}

function _bohaTelemetry_eventStructureDemolish(structure, builder)
{
  var object = _bohaTelemetry_object(structure);
  if (object) _bohaTelemetry_emit("demolitionStarted", { object: object, builderId: builder ? builder.id : null });
}

function _bohaTelemetry_eventObjectTransfer(object, from)
{
  var observed = _bohaTelemetry_object(object);
  if (observed) _bohaTelemetry_emit("ownershipTransfer", { object: observed, from: from, to: object.player, reason: "unknown" });
}

function _bohaTelemetry_eventResearched(research, lab, player)
{
  if (!research) return;
  // A null lab can mean shared research. It must not be counted as this
  // player's own completed research or research expenditure.
  _bohaTelemetry_emit("researchCompleted", {
    player: player, research: research.id || research.name || null,
    labId: lab ? lab.id : null, locallyCompleted: !!lab && lab.player === player,
    nominalCost: _bohaTelemetry_number(research.power)
  });
}

function _bohaTelemetry_eventAttacked(victim, attacker)
{
  var observed = _bohaTelemetry_object(victim);
  // Informational notices only, further sampled to at most one per victim
  // every ten seconds. They must never be interpreted as hit/kill counts.
  if (observed && _bohaTelemetry_lastAttack[observed.id] !== undefined
    && gameTime - _bohaTelemetry_lastAttack[observed.id] < 10000) return;
  if (observed) _bohaTelemetry_lastAttack[observed.id] = gameTime;
  if (observed) _bohaTelemetry_emit("attackNotice", {
    object: observed, attacker: _bohaTelemetry_object(attacker)
  });
}

function _bohaTelemetry_sample()
{
  var players = [];
  for (var player = 0; player < maxPlayers; ++player)
  {
    var units = enumDroid(player);
    var structures = enumStruct(player);
    var unitValue = 0, structureValue = 0;
    for (var i = 0; i < units.length; ++i)
    {
      var cost = _bohaTelemetry_number(units[i].cost);
      unitValue = unitValue === null || cost === null ? null : unitValue + cost;
    }
    for (var j = 0; j < structures.length; ++j)
    {
      var structureCost = _bohaTelemetry_number(structures[j].cost);
      structureValue = structureValue === null || structureCost === null ? null : structureValue + structureCost;
    }
    players.push({ player: player, units: units.length, structures: structures.length,
      unitValue: unitValue, structureValue: structureValue,
      powerBalance: typeof playerPower === "function" ? _bohaTelemetry_number(playerPower(player)) : null });
  }
  _bohaTelemetry_emit("sample", { players: players });
}

// Sampling shows balances and army values, not income, spending, repairs,
// damage, or kill attribution. Health deltas cannot recover those exactly.
setTimer("_bohaTelemetry_sample", 10000);
