(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteArmoryTech = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  // Real research unlocks and bundled models. Levels are the mini-game's own
  // power milestones, not Warzone research times or a complete prerequisite sim.
  const stage = (level, research, definition, name, mount, barrel) => Object.freeze({ level, research, definition, name, mount, barrel });
  const PATHS = Object.freeze({
    machinegun: Object.freeze([
      stage(1, 'R-Wpn-MG1Mk1', 'MG1Mk1', 'Machinegun', 'trlmg1.pie', 'gnlmg1.pie'),
      stage(5, 'R-Wpn-MG2Mk1', 'MG2Mk1', 'Twin Machinegun', 'trlmg2.pie', 'gnlmg2.pie'),
      stage(10, 'R-Wpn-MG3Mk1', 'MG3Mk1', 'Heavy Machinegun', 'trmmg.pie', 'gnmmg1.pie'),
      stage(15, 'R-Wpn-MG4', 'MG4ROTARYMk1', 'Assault Gun', 'trmmg.pie', 'gnmmg2.pie'),
      stage(20, 'R-Wpn-MG5', 'MG5TWINROTARY', 'Twin Assault Gun', 'trhmg.pie', 'gnhmg1.pie')
    ]),
    // Heavy Cannon and HVC are game branches, condensed into a single ladder here.
    cannon: Object.freeze([
      stage(1, 'R-Wpn-Cannon1Mk1', 'Cannon1Mk1', 'Light Cannon', 'trlcan.pie', 'gnlcan.pie'),
      stage(4, 'R-Wpn-Cannon2Mk1', 'Cannon2A-TMk1', 'Medium Cannon', 'trmcan.pie', 'gnmcan.pie'),
      stage(8, 'R-Wpn-Cannon3Mk1', 'Cannon375mmMk1', 'Heavy Cannon', 'trhcan.pie', 'gnhcan.pie'),
      stage(12, 'R-Wpn-Cannon4AMk1', 'Cannon4AUTOMk1', 'Hyper Velocity Cannon', 'trlacan.pie', 'gnlacan.pie'),
      stage(16, 'R-Wpn-Cannon5', 'Cannon5VulcanMk1', 'Assault Cannon', 'trmvcan.pie', 'gnmvcan.pie'),
      stage(20, 'R-Wpn-Cannon6TwinAslt', 'Cannon6TwinAslt', 'Twin Assault Cannon', 'trhvcan2.pie', 'gnhvcan2.pie')
    ]),
    laser: Object.freeze([
      stage(1, 'R-Wpn-Laser01', 'Laser3BEAMMk1', 'Flashlight', 'trmlas.pie', 'gnmrlas.pie'),
      stage(10, 'R-Wpn-Laser02', 'Laser2PULSEMk1', 'Pulse Laser', 'trmlas.pie', 'gnmlas.pie'),
      stage(20, 'R-Wpn-HvyLaser', 'HeavyLaser', 'Heavy Laser', 'trhlas.pie', 'gnhlas.pie')
    ]),
    rockets: Object.freeze([
      stage(1, 'R-Wpn-Rocket05-MiniPod', 'Rocket-Pod', 'Mini-Rocket Pod', 'trlrcktp.pie', 'gnlrcktp.pie'),
      stage(7, 'R-Wpn-Rocket01-LtAT', 'Rocket-LtA-T', 'Lancer', 'trmrckta.pie', 'gnmrckta.pie'),
      stage(13, 'R-Wpn-Rocket07-Tank-Killer', 'Rocket-HvyA-T', 'Tank Killer', 'trmrcktb.pie', 'gnmrcktb.pie'),
      stage(20, 'R-Wpn-Missile2A-T', 'Missile-A-T', 'Scourge Missile', 'trmmslat.pie', 'gnmmslat.pie')
    ]),
    flamer: Object.freeze([
      stage(1, 'R-Wpn-Flamer01Mk1', 'Flame1Mk1', 'Flamer', 'trlflmr.pie', 'gnlflmr.pie'),
      stage(10, 'R-Wpn-Flame2', 'Flame2', 'Inferno', 'trmflmr.pie', 'gnmflmr.pie'),
      stage(20, 'R-Wpn-Plasmite-Flamer', 'PlasmiteFlamer', 'Plasmite Flamer', 'trmflmrp.pie', 'gnmflmrp.pie')
    ])
  });
  function tierFor(weapon, level = 1) {
    if (!Object.hasOwn(PATHS, weapon)) return null;
    const path = PATHS[weapon], current = Number.isFinite(level) ? Math.max(1, Math.min(20, Math.floor(level))) : 1;
    let index = 0;
    while (index + 1 < path.length && current >= path[index + 1].level) index++;
    return { ...path[index], tier: index + 1, tierCount: path.length, nextTier: path[index + 1] || null };
  }
  return { PATHS, tierFor };
});
