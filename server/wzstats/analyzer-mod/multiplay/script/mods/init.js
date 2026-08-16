// Read-only telemetry hook loaded only by the local replay analyzer.
var _mawayTacticalInterval = maxPlayers <= 2 ? 3000 : 10000;
var _mawayTacticalFirstFrame = true;
var _mawayTacticalKnownDroids = {};
var _mawayTacticalKnownStructures = {};

receiveAllEvents(true);

function _mawayComponentName(component)
{
	if (component === null || component === undefined)
	{
		return null;
	}
	if (typeof component === "string")
	{
		return component;
	}
	return component.id || component.name || null;
}

function _mawayDroidDefinition(droid)
{
	var weapons = [];
	if (droid.weapons && droid.weapons.length)
	{
		for (var index = 0; index < droid.weapons.length; ++index)
		{
			var weapon = _mawayComponentName(droid.weapons[index]);
			if (weapon)
			{
				weapons.push(weapon);
			}
		}
	}
	return [
		droid.id, droid.name || null, _mawayComponentName(droid.body),
		_mawayComponentName(droid.propulsion), weapons, droid.droidType
	];
}

function _mawayStructureDefinition(structure)
{
	return [structure.id, structure.name || null, structure.stattype];
}

function eventDestroyed(object)
{
	if (!object || (object.type !== DROID && object.type !== STRUCTURE))
	{
		return;
	}
	dump("__WZTACTICAL__" + JSON.stringify({
		time: gameTime,
		interval: _mawayTacticalInterval,
		eventsOnly: true,
		destroyed: [[
			gameTime, object.type === DROID ? "droid" : "structure",
			object.id, object.player, object.x, object.y
		]]
	}) + "__ENDWZTACTICAL__");
}

function _mawayCaptureTacticalFrame()
{
	var frame = {
		time: gameTime,
		interval: _mawayTacticalInterval,
		droids: [],
		structures: [],
		droidDefinitions: [],
		structureDefinitions: []
	};
	if (_mawayTacticalFirstFrame)
	{
		frame.map = { width: mapWidth, height: mapHeight };
		_mawayTacticalFirstFrame = false;
	}
	for (var player = 0; player < maxPlayers; ++player)
	{
		var droids = enumDroid(player);
		for (var droidIndex = 0; droidIndex < droids.length; ++droidIndex)
		{
			var droid = droids[droidIndex];
			if (!_mawayTacticalKnownDroids[droid.id])
			{
				_mawayTacticalKnownDroids[droid.id] = true;
				frame.droidDefinitions.push(_mawayDroidDefinition(droid));
			}
			frame.droids.push([
				droid.id, droid.player, droid.x, droid.y, droid.health,
				droid.droidType, droid.order, droid.direction
			]);
		}
		var structures = enumStruct(player);
		for (var structureIndex = 0; structureIndex < structures.length; ++structureIndex)
		{
			var structure = structures[structureIndex];
			if (!_mawayTacticalKnownStructures[structure.id])
			{
				_mawayTacticalKnownStructures[structure.id] = true;
				frame.structureDefinitions.push(_mawayStructureDefinition(structure));
			}
			frame.structures.push([
				structure.id, structure.player, structure.x, structure.y,
				structure.health, structure.stattype, structure.status, structure.direction
			]);
		}
	}
	dump("__WZTACTICAL__" + JSON.stringify(frame) + "__ENDWZTACTICAL__");
}

setTimer("_mawayCaptureTacticalFrame", _mawayTacticalInterval);
