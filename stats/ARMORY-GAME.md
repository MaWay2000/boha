# Local target-practice game

The balloon boss has 1,000 HP and a health bar. Defeating it for the first time
starts a round with score 1 and 500 power. It returns at full health after five
seconds, even while the unit round continues, and can be defeated again for
one score. Repeat boss defeats do not reset units, bank, damage counters or
upgrades, and do not grant another starting budget. Unit hits take priority
where a unit visually overlaps the balloon. Disarm restores a defeated balloon
immediately for news access; switching/rearming never hides a living balloon.
Repair/page exit cancels any pending respawn so it cannot affect a fresh round.

Every unit
kill adds one score and credits exactly 1.5 times that unit's power cost. After
the credit, random affordable units are purchased until nothing else can be
afforded, eight targets are present, or the current wave quota is filled. Leftover power stays in the bank; a cap
never discards it. Costs and payouts can include half-power balances.

## Waves and returning boss phases

The intro balloon still unlocks the fight on its first defeat. Wave 1 contains
eight enemies in total, spawning as the bank and eight on-screen slots allow.
Clearing every enemy starts a four-second rest, then the next wave spends the
preserved bank. Each wave adds two enemies to its quota, capped at 32 before
boss reinforcements. The HUD shows wave number, defeated/total, queued enemies
and clear progress; during a rest it shows a countdown. There is no second
starting budget or free upgrade power between waves.

Per later wave, enemy HP increases by 15%, damage against friendlies by 10%,
and movement speed by 4%, capped after 20 increases (+300% HP, +200% damage,
+80% speed). HP/damage round to whole points. Costs, kill rewards, weapon ranges
and player reloads are unchanged; scaling does not affect friendly tanks.

Each returning balloon starts in a patrol phase. At or below half HP it
enrages, gains a steady orange glow and calls two additional enemies once per
life. Calls extend the current wave quota (hard cap 40), spending only the
existing bank and respecting eight screen slots. If slots or power are short,
the extra enemies remain in the quota until they can spawn. Calls during rest
queue for the next wave instead (up to eight queued extras). A killing shot
that crosses half HP still triggers the call. Respawn resets the boss phase;
repeated hits below half HP cannot duplicate a call. The introductory boss does
not summon enemies before the mini-game has unlocked.

The rest clock and combat pause on disarm, hidden tabs, lost focus and modal
opening. It runs only during rest, at 250ms intervals, and delayed callbacks
never skip ahead through multiple waves. Repair/page exit removes it entirely.
Friendlies and reserves survive wave transitions. Rockets with no remaining
legal target when a wave clears finish as ground impacts: no phantom kills,
rewards or missiles waiting to damage the next wave. The fire button can still
target the living balloon during a rest. News and normal browsing stay intact.
Held accessible fire waits without spending shots when both the wave and boss
are absent, then resumes on a legal target; releasing still cancels immediately.

The nine designs use the site's existing Warzone templates and component data.
Their cost is `floor(body power * (100 + propulsion power %) / 100) + weapon power`,
following [the engine's calcPower calculation](https://github.com/Warzone2100/warzone2100/blob/master/src/droid.cpp).
The bundled classic data is authoritative for this mini-game, not any current
multiplayer balance release or research upgrades. Target health is a simplified
mini-game value, not the unit's match hit points.

Arming a gun moves the page to the top and hides/locks page scrollbars. Targets
move within the top 300 pixels, clipped without adding document overflow.
Disarm/Escape pauses the round and restores normal browsing, the previous scroll
position, and news access. Opening a modal also disarms and releases the lock.
The entire game HUD hides when disarmed, even with score, units or page marks
remaining. Selecting a weapon shows it again without resetting progress.
Selecting a gun resumes the same score, bank and targets. Repair page resets
the round, removes damage and restores the balloon. Reloading also starts fresh;
no score, bank or shooting data is saved or transmitted.

Every accepted Heavy cannon shot adds one friendly Heavy Cannon tank, including
shots before the boss round starts. Other guns and rejected cooldown clicks do
not recruit. Four friendlies are visible at once; every extra recruit is kept
in a reserve count and deploys when a friendly dies. Recruitment is free and
does not spend the enemy spawn bank. Friendlies have 120 simplified HP, move
toward enemy tanks, and automatically deal 18 damage every 1.2 seconds, scaled
by the current gun damage upgrade. Enemies return 12 damage to the nearest
friendly every 1.5 seconds. There are no catch-up bursts after a pause.
Friendly kills earn the usual score/power and contribute to total unit damage,
with separate allied damage/kill counters rather than credit to a player gun.
Blue ALLY labels/health bars distinguish friendlies from red enemy bars.
Friendly fire and enemy rockets never target friendly units. Allies do not
attack the balloon boss. Disarm/hidden tabs/modals pause the army; Repair and
page exit remove it and its reserves. Models and textures share the existing
cache, with at most 12 unit previews total (8 enemies plus 4 friendlies).

Weapons: machine gun does 36 damage per three-round burst (160 ms reload),
heavy cannon 55 (3 seconds), pulse laser 34 (1 second), and rockets two
75-damage projectiles per salvo (1 second between salvos). Hold to repeat;
keys 1/2/3/4 select them, and key 5 selects the flamer described below. Rockets use the bundled Lancer turret, paired flight
trails and launch sounds, and the same reload indicator. With tanks on screen,
rockets automatically lock onto the clicked tank or the tank nearest the aim
point. The two rockets launch 70 ms apart, follow moving targets and deal their
individual damage on impact (150 base damage total). If a target dies, an
in-flight rocket retargets any living enemy, including newly spawned
replacements, so clearing the original enemy group cannot waste a missile.
Each rocket carries its launch-time upgrade
damage, so a mid-salvo level-up cannot retroactively increase its damage.
Disarm, blur, hiding the tab, opening a modal or repair cancels flights; they
never silently expire: after three seconds, a slow/contested flight resolves
against its current valid enemy. The eight-projectile visual cap also resolves
an older impact instead of discarding its damage. Reduced-motion visitors get
the same hit timing without animated rocket trails. No tank means automatic
aiming at the balloon boss, with cosmetic trails and immediate damage. If no
valid target is alive, no salvo or cooldown is consumed. These guaranteed hits
do not override the explicit safety cancellations on disarm/reset/hidden tabs.
Heavy cannon also has a 200px blast radius: the directly hit tank takes full
shot damage once, other enemies within 200px take 50% (rounded to the nearest
HP). A ground impact can splash nearby tanks without a direct hit. The blast
snapshots its victims and damage before any kills, so newly spawned enemies
are not hit by that explosion and a mid-blast upgrade cannot boost it. Allies
are never blast victims. Machine gun and laser remain direct-hit only; visual crack
radius is separate from actual cannon blast radius.

Rocket impacts now leave black, ember-rimmed holes and soot at each actual tank
impact (or both boss impacts). Cancelling a flight makes no scorch. These share
the 48-mark cap and document-anchored scroll behavior with other page damage;
Repair removes them all, including after disarming.

Flamer (key 5) deals 24 base damage per burst every 180ms while held, with the
same 20 damage upgrade levels, reload bar, weapon counters and mute control.
It sweeps a 220px-long, 160px-wide triangular jet around the crosshair, plus an
85px-radius splash area centered on the aim. The nozzle is 65% of the jet
length behind the aim, pointing from the turret toward
the crosshair. Directly clicked tanks and other enemy centers in that cone take
one full-damage burst each, including tanks touched by the cone or splash using
a simplified 28px body radius. A tank covered by both is hit only once; aiming
at empty ground still damages nearby enemies. Burst victims/damage are snapshotted before kills, excluding
new replacements and all friendlies. The boss takes damage only on a direct
aim, as with the other manual weapons. There is no lingering damage after
release: the jet is cosmetic, lasts at most 500ms and leaves capped soot marks. Releasing
the pointer stops the hiss; all normal pause/reset safety paths apply. Its real
Flame1Mk1 turret is rendered using the existing cached software preview.
The flame stream uses the original FXLThrow.PIE seven-frame 9×26 strip from
the locally bundled page-21-fx.png atlas, at 66ms per frame. Nine textured,
expanding stream particles and seven splash flames show the area per burst,
using no flat CSS triangle. Reduced-motion
visitors see three static stream and three static splash flames instead; the localhost preview keeps
animation enabled. Splash has the same per-burst damage as the stream; there
is no extra damage for overlapping effects. Attribution/license/source hash are in
assets/vendor/warzone-effects/README.md, COPYING and COPYING.README.

All guns upgrade automatically from cumulative kill rewards in the current
round, not the leftover bank. There are 20 levels. Levels 2/3/4/5 still unlock
at 500/1,500/3,000/6,000 earned power; level 6 starts at 10,000. Later levels
require progressively more power, reaching level 20 at 300,000. Each level adds
25 percentage points of base damage, up to +475% at level 20 (5.75× base).
Total shot/burst damage
is rounded to the nearest HP. Starting power does not count, no power is spent
on upgrades, and all reload timings remain unchanged. A kill that unlocks a
level uses the old damage; the next shot uses the new level. Gun badges/tooltips
show the level/current damage, and the HUD shows progress and a level-up notice.
Disarm and weapon switching preserve upgrades; Repair/reloading resets them.

## Research-based weapon tiers

All slots now start with their basic research variant and change their real
model, name and tier badge automatically as earned-power levels unlock variants.
The five ladders contain 21 variants from the official multiplayer research
tree. `site-armory-tech.js` is the shared gameplay/preview mapping;
`stats/armory-tech-research.json` records the real research IDs, prerequisites and
unlocked components, with the source URL, retrieval date and complete-source hash.

| Slot | Variants and mini-game unlock levels |
| --- | --- |
| Machine gun | Machinegun 1 → Twin Machinegun 5 → Heavy Machinegun 10 → Assault Gun 15 → Twin Assault Gun 20 |
| Cannon | Light 1 → Medium 4 → Heavy 8 → Hyper Velocity 12 → Assault 16 → Twin Assault 20 |
| Rockets | Mini-Rocket Pod 1 → Lancer 7 → Tank Killer 13 → Scourge Missile 20 |
| Laser | Flashlight 1 → Pulse Laser 10 → Heavy Laser 20 |
| Flamer | Flamer 1 → Inferno 10 → Plasmite Flamer 20 |

This is a research-inspired mini-game ladder, not a full Warzone research
simulation. Heavy Cannon/HVC and related branches are intentionally condensed,
not represented as literal prerequisites. Unlock costs are the existing
mini-game earned-power thresholds, not the game's research costs. Every level
still adds 25 percentage points of base damage: a tier unlock does not stack a
second hidden multiplier or spend the bank. Slot cooldowns, two homing rockets,
cannon splash and free fighter recruitment are unchanged. Per-weapon counters
remain grouped by slot, while hit messages retain the variant that fired.

The HUD shows current tier, next variant, required level/power and an expandable
research path. Disarm/weapon switching preserves tiers; Repair resets to basic
models. Preview models/geometries/textures are cached, with five canvases and
at most five rendered models. Async model swaps discard stale completions so
an old request cannot override an upgrade or reset. All 21 models are checked
against the bundled component definitions, textures and compact preview bounds.

The HUD counts unit HP actually removed, in total and per weapon, plus unit
kills credited to each finishing weapon. A hit displays the damage and remaining
HP; damage beyond the target's remaining HP is excluded. Balloon hits, misses
and rejected cooldown shots never add unit damage. Disarming preserves the
counters; Repair page resets them. These are simplified mini-game values,
without Warzone's armor, weapon-vs-propulsion modifiers or research upgrades.

## Unit firing ranges

Both armies use each template's first weapon `longRange` and `minRange` from
the bundled Warzone weapon definitions. Distances are scaled from 128 world
units per tile to 24 CSS pixels per tile for this compact arena. For example,
the recruited Heavy Cannon Python has a 9-tile / 216px range; the basic enemy
Machinegun has 6 tiles / 144px. The Lancer also respects its 1-tile minimum.
Unit tooltips show the range. These apply to autonomous tanks, not the player's
crosshair weapons; HP, damage and reloads remain mini-game values.

Cannon recruits advance toward the nearest enemy and fire only within their
weapon's range. Enemies likewise approach the nearest friendly and can return
fire only within their own range. Units too close for a minimum-range weapon
back away. Movement is bounded to the top arena and neither team damages
off-screen targets at unlimited range. Pause/hidden/modal/reset protections,
friendly-fire exclusions and reward accounting remain unchanged.

Models, geometry and textures are cached and reused across respawns. Target
motion pauses when disarmed/hidden; public reduced-motion users get stationary
wandering targets, with necessary combat repositioning limited to once per
second. The owner's localhost preview keeps smooth movement enabled, like the balloon.
The existing software 3D renderer draws units at no more than 20 frames/second.

Tests: `node --test stats/site-armory-battle.test.cjs stats/site-armory.test.cjs stats/site-armory-units.test.mjs`
