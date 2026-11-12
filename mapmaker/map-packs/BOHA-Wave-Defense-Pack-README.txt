BOHA Wave Defense v1.0.5 — 60-wave solo scenario

One human: position 0 (south). NEXUS / Wave Bot: position 1 (north), opposing team.
Advanced bases, T1, High power, Scavengers OFF.
60 waves: first at minute 1, then once per minute through minute 60.
On-screen status: current wave, countdown to next wave, and the next power budget. The native clock counts down continuously; the status line refreshes every four seconds.
Wave power budget = floor(1000 * 1.1^(waveNumber - 1)).
Random ground armies are chosen from 10 basic T1 infantry/light-vehicle designs using real Warzone makeTemplate costs.
Five invisible research slots: vehicle upgrades, new bodies, and three random topics; each runs at 70–99% of normal research speed. Researched bodies become available to later wave purchases.
The multiplier increases army purchasing power, not individual unit hitpoints or damage.
Units spawn in small batches and obey the native droid limit. Unspent wave budgets queue without postponing later wave start times.
Defeat all units of a fully spawned wave to earn one unbuilt OilResource spot within 20 tiles of your original HQ. Build a derrick to collect it.
Each wave rewards oil once. Occupied ground is skipped; blocked rewards retry later.

Install only BOHA-Wave-Defense-Pack.wz in mods/4.7.0/autoload, then select BOHA-Wave-Defense.
No separate map or wave-mod file is needed. Remove the pack before playing other maps.

Made with Warzone2100 MapMaker. Author: MaWay2000. License: CC0-1.0.