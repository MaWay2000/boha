// Read-only telemetry hook loaded only by the local replay analyzer.
var _mawayTacticalInterval = maxPlayers <= 2 ? 3000 : 10000;
var _mawayTacticalFirstFrame = true;

function _mawayCaptureTacticalFrame()
{
	var frame = {
		time: gameTime,
		interval: _mawayTacticalInterval,
		droids: [],
		structures: []
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
			frame.droids.push([
				droid.id, droid.player, droid.x, droid.y, droid.health,
				droid.droidType, droid.order
			]);
		}
		var structures = enumStruct(player);
		for (var structureIndex = 0; structureIndex < structures.length; ++structureIndex)
		{
			var structure = structures[structureIndex];
			frame.structures.push([
				structure.id, structure.player, structure.x, structure.y,
				structure.health, structure.stattype, structure.status
			]);
		}
	}
	dump("__WZTACTICAL__" + JSON.stringify(frame) + "__ENDWZTACTICAL__");
}

setTimer("_mawayCaptureTacticalFrame", _mawayTacticalInterval);
