// Wave gameplay must be mounted as a mod in Warzone 4.7, not as plain map data.
export function hasWaveRuntime(script) {
  return !!(script && script.enabled !== false && typeof script.source === 'string' &&
    /\/\* MAPMAKER_RUNTIME_BEGIN\r?\n[\s\S]*?MAPMAKER_RUNTIME_END \*\//.test(script.source));
}

export async function buildWaveMapPack(archive, base) {
  const runtime = archive.file('multiplay/script/mods/init.js');
  if ((!runtime || !archive.file('mapmaker-timed-waves.json')) && !archive.file('mapmaker-unit-designs.json')) {
    throw new Error('Enable a wave script or save a custom unit design before saving a one-file pack.');
  }
  const safeBase = String(base || 'Wave-map').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100) || 'Wave-map';
  const pack = archive.clone();
  pack.files = Object.create(null);
  pack.root = '';
  pack.comment = null;
  // Keep the complete editable map inside the bundle, including provenance and script drafts.
  pack.file('maps/' + safeBase + '.wz', await archive.generateAsync({type:'uint8array', compression:'DEFLATE'}));
  // Preserve gameplay scripts, AI and supporting mod assets at the mod mount root.
  const modPaths = /^(?:multiplay\/(?:script|skirmish)\/|(?:stats|components|features|structs|misc|texpages|tileset|effects|shaders|script|messages|audio|sequenceaudio|wrf)\/)/i;
  for (const [name, entry] of Object.entries(archive.files)) {
    if (!entry.dir && modPaths.test(name)) pack.file(name, await entry.async('uint8array'));
  }
  if (archive.file('mapmaker-unit-designs.json')) pack.file('mapmaker-unit-pack.json',JSON.stringify({version:1,mapPath:'maps/' + safeBase + '.wz'}));
  pack.file('README.txt', [
    safeBase + ' — single-file map and wave gameplay pack', '',
    'Install this .wz in your Warzone config folder: mods/<game-version>/autoload (for example mods/4.7.0/autoload).',
    'Restart Warzone, select the included map, and use its required lobby settings.',
    'For scavenger waves, enable Scavengers. For a wave-controlled player AI, use the AI specified by the map author.',
    'Do not install a separate copy of the map or wave mod.',
    'Remove this pack from autoload before playing other maps: its gameplay rules and AI overrides are active while installed.',
    '', 'The editable map and its attribution, license and script are preserved inside maps/' + safeBase + '.wz.',
    'Created with Warzone2100 MapMaker.'
  ].join('\n'));
  return pack;
}
