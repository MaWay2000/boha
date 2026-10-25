# Local target-practice game

Feature scripts and styles live in `balloon/`, not in the repository root.
The shared assets and permanent `news/` archive retain their existing locations.

## Start, nicknames and shared online Top 10

Before any weapon can arm (including keys 1–5), the player must enter a nickname
and press Start game in the lobby. Names accept 1–24 Unicode characters after
whitespace normalization; blank names, control characters and directional
override characters are rejected. A remembered name is prefilled but never
auto-starts a new page session. Names are rendered only as text, not HTML.

Start and Top scores buttons sit below the disarmed gun rack; Top scores is
also available in the game HUD. Opening the lobby disarms/pauses the game,
retains the selected gun and offers Resume game for the same player. The name
is locked during an existing round. New player / reset round saves the previous
best, clears round progress and requires a fresh nickname and Start. Restart game
resets the round but retains its player and never deletes saved best scores.

The table is shared online through the existing public API at
`https://desktop-0467j9q.tail41fd3a.ts.net/wzstats/api/v1/armory`:

- GET `/scores` loads the same public Top 10 for every browser.
- POST `/sessions` with `{name}` creates a 24-hour anonymous run token.
- POST `/scores` submits `{token,score,kills,bosses,wave,power}`. Names and
  timestamps come from the server, not from the submitted score body.

Viewing the table also reads `stats/published/armory-scores.json`, a validated
public Top 10 snapshot. A dedicated GitHub workflow checks the API about every
ten minutes and commits only changed rankings. Browser reads use the public
GitHub raw URL (bot commits do not trigger Pages builds), with the site copy
as a fallback. GitHub scheduling/CDN delays can add time. Live responses take
priority; slower snapshots cannot overwrite them. Failed publication retains
the last good snapshot, including its original publication date.

This lets visitors read the shared table when the PC-hosted API is unreachable
or browser network rules block it. The lobby labels the publication date and
live connection failure. Score submissions still require access to the live
API; pending uploads are explicitly shown and are never inserted into the
published table as if accepted. The snapshot contains only already-public
nicknames and run statistics; no session tokens, IPs or private server state.

One best run per case-insensitive nickname is retained, ordered by score, wave,
earned power and first-achieved time. Score is existing unit kills plus balloon
defeats, including friendly kills; earned power is total gained, not the bank.
The client batches updates over two seconds and flushes on disarm/reset/exit,
using credential-free keepalive requests. Temporary failures retain the latest
pending score with bounded backoff; rate limits wait a minute. Errors are shown
honestly, never as a local table pretending to be online. Play is not blocked by
an outage, but pending unsynced scores can be lost on page exit or starting a
new run. Reset/new-player starts a new server session rather than submitting
lower counters into the old session. Old async responses cannot replace a new
session or its token. Existing local scores are not automatically uploaded.

The lobby explicitly says that the chosen nickname and run statistics become
public. Nicknames are unverified: another player can use the same name, and this
is casual competition rather than an anti-cheat-protected ranking. No account,
password, replay identity, player key or admin credential is used. A separate
browser-only cache under `boha.armory.scores.v1` remembers the nickname and local
best for resilience; it is not the source for the shared table. Corrupt/blocked
storage cannot stop play. Session tokens stay in memory, not in localStorage.

The independent API stores at most 512 unexpired runs and 1,000 personal bests,
returning only the top ten public rows. JSON bodies are capped at 2 KiB; CORS is
limited to the production origin and port-4173 local previews. It validates
finite counters, kills+bosses=score, monotonic runs, possible wave progression
and generous elapsed-time bounds, plus per-session/client rate limits. Private
token hashes/rate state are never returned. File locking and atomic replacement
preserve data across restarts without touching replay MariaDB or admin access.
The backend/storage remain private and are never published in the Pages repo.

## Game rules

The balloon boss has 1,000 HP and a health bar. Defeating it for the first time
starts a round with score 1 and 500 power. It returns at full health after five
seconds, even while the unit round continues, and can be defeated again for
one score. Repeat boss defeats do not reset units, bank, damage counters or
upgrades, and do not grant another starting budget. Unit hits take priority
where a unit visually overlaps the balloon. Disarm restores a defeated balloon
immediately for news access; switching/rearming never hides a living balloon.
Restart game/page exit cancels any pending respawn so it cannot affect a fresh round.

Every actual balloon defeat also drops a clickable random supply crate,
including the introductory boss. The pool contains 30 equally likely rewards,
listed in the in-game "Balloon drops — all 30 rewards" guide and below.
Every non-power reward includes 250 power. A repair/heal roll without an army
becomes one fighter instead. Crate labels, icons
and colors show the actual reward before collection. Friendly reinforcements
respect the four-unit limit, with surplus going to reserves; repairs heal only
living friendlies and never resurrect casualties. Reloads reset cooldowns
without firing or changing ammo/damage statistics.

Rewards apply only on collection, not on drop. Uncollected power and fighter
counts stack into one crate, keeping the DOM bounded without losing rewards;
duplicate full-repair/reload effects apply once together at collection.
Clicking it (or Enter/Space on the focused button) does not fire
the selected gun or spend its cooldown. Collection adds power to bank and earned
upgrade power once; it does not count as a kill, score or unit damage. The
existing wave quota and budget rules still apply to purchased enemies; no new
wave starts early when collecting during a rest. `bonusEarned` records collected
crate power, while `earned` includes both unit rewards and collected crates, so
bank + spent = 500 + earned still holds.

The crate hides on disarm, hidden tabs, blur and modals, retaining its pending
reward on resume. It is positioned near the boss's last hit within viewport
bounds and above the game HUD, with a short reduced-motion-aware drop animation.
Restart game/page exit removes pending drops and collected bonus totals. Like the rest
of the mini-game, rewards exist only in the current page session.

## All 30 balloon drops

`site-armory-loot.js` is the shared source for the random pool, effects and UI
guide. Timed boosts last 30 active-play seconds, pausing while disarmed, hidden,
unfocused or covered by a modal. Repeat drops refresh to 30 seconds rather than
stacking damage or storing extra duration. Different effects multiply together;
rocket damage is snapshotted at launch. Passive upgrades last until Restart game/page
exit and stack only to their explicit caps. The HUD shows timers and passives.

Collecting a gun-specific +50% damage boost reveals it with a roulette highlight
across all five gun tabs in their visible order. It makes three or four laps,
slows down, stops on the gun already selected by the random drop, then gives it
two gentle gold pulses. A small +50% badge remains while its boost is active.
This is a visual reward reveal, not an auto-equip: shots, cooldowns and the
equipped weapon do not change. Stacked gun rewards reveal each distinct winner
in turn; power and army drops do not start a gun draw. Disarm, blur, hidden tabs,
modals and Restart game cancel the animation without losing earned effects. Reduced
motion skips the running highlight and pulses for public visitors, showing a
static gold winner. The owner-local preview opts into full requested motion,
matching the existing local balloon and model-preview behavior.

Power-only crates award the total shown; every other row also includes 250 power.

| # | Reward | Effect |
| --- | --- | --- |
| 1 | Power Cache | 250 power |
| 2 | Power Chest | 500 power |
| 3 | Power Vault | 750 power |
| 4 | Jackpot | 1,000 power |
| 5 | Wingman | 1 friendly fighter |
| 6 | Backup Pair | 2 friendly fighters |
| 7 | Strike Team | 3 friendly fighters |
| 8 | Full Squad | 4 friendly fighters |
| 9 | Field Workshop | Full repair for all living friendlies |
| 10 | Repair Kit | Heal every living friendly by 50 HP, capped at max HP |
| 11 | Ammo Drop | Instantly reload every player gun |
| 12 | Double Damage | ×2 player damage for 30s |
| 13 | Rapid Fire | 50% shorter player reloads for 30s |
| 14 | Army Fury | ×2 friendly damage for 30s |
| 15 | Army Overdrive | 50% shorter friendly firing intervals for 30s |
| 16 | Army Shield | Invulnerable friendlies for 30s |
| 17 | Stasis Field | 50% slower enemies for 30s |
| 18 | Enemy Jammer | 50% less enemy damage for 30s |
| 19 | Wide Blast | 50% larger cannon splash radius for 30s |
| 20 | Firestorm | 50% larger flame cone and splash for 30s |
| 21 | Machinegun Boost | +50% machinegun damage for 30s |
| 22 | Cannon Boost | +50% cannon damage for 30s |
| 23 | Laser Boost | +50% laser damage for 30s |
| 24 | Rocket Boost | +50% rocket damage for 30s |
| 25 | Flamer Boost | +50% flamer damage for 30s |
| 26 | Reinforced Hulls | Passive +10 max/current HP to living and future friendlies; cap +200 |
| 27 | Weapon Tuning | Passive +10% player damage; cap +100% |
| 28 | Veteran Crews | Passive +10% friendly damage; cap +100% |
| 29 | Quick Loaders | Passive 5 percentage points shorter player reloads; cap 40% |
| 30 | Reactive Armor | Passive 5 percentage points less incoming friendly damage; cap 50% |

The hull passive adds ten HP rather than fully healing; dead units never return.
Future reserve deployments inherit the accumulated max HP. Player reloads have
a 50ms safety minimum. Paused clocks do not burn buff time, and delayed callbacks
account for at most one 250ms tick, without catch-up attacks. Effect maps and
reward counts have a fixed set of allowed IDs; snapshots are deep-copied.

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
never skip ahead through multiple waves. Restart game/page exit removes it entirely.
Friendlies and reserves survive wave transitions. Rockets with no remaining
legal target when a wave clears finish as ground impacts: no phantom kills,
rewards or missiles waiting to damage the next wave. The HUD has no Fire button:
aim and click/hold directly on the page to shoot. Hold-to-fire, release-to-stop
and rocket auto-lock remain unchanged. The living balloon can still be shot
during a rest. News and normal browsing stay intact. The controller tolerates
older shells that include the optional fire control, but the published page
does not render it.

All nine unit designs (including the friendly Python and Pulse Laser Mantis)
use complete bundled PIE models and PNG textures. Geometry, texture and
template caches share successful requests but evict rejected promises. A
transient model failure retries three times with bounded 300/1,000ms waits,
reusing already-loaded parts. A still-failed visible unit can retry on reconnect,
game resume or returning to the page. Empty/non-finite geometry and zero-triangle
canvas draws cannot be reported as ready. Page teardown aborts geometry requests
and clears pending waits; late results never attach to removed/replaced units.
After texture retries are exhausted, valid geometry remains visible untextured
instead of being replaced by a flat silhouette.

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
Selecting a gun resumes the same score, bank and targets. Restart game resets
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
attack the balloon boss. Disarm/hidden tabs/modals pause the army; Restart game and
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
Restart game removes them all, including after disarming.

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

All guns upgrade automatically from cumulative kill rewards and collected boss crates in the current
round, not the leftover bank. There are 20 levels. Levels 2/3/4/5 still unlock
at 500/1,500/3,000/6,000 earned power; level 6 starts at 10,000. Later levels
require progressively more power, reaching level 20 at 300,000. Each level adds
25 percentage points of base damage, up to +475% at level 20 (5.75× base).
Total shot/burst damage
is rounded to the nearest HP. Starting power does not count, no power is spent
on upgrades, and all reload timings remain unchanged. A kill that unlocks a
level uses the old damage; the next shot uses the new level. Gun badges/tooltips
show the level/current damage, and the HUD shows progress and a level-up notice.
Disarm and weapon switching preserve upgrades; Restart game/reloading resets them.

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
research path. Disarm/weapon switching preserves tiers; Restart game resets to basic
models. Preview models/geometries/textures are cached, with five canvases and
at most five rendered models. Async model swaps discard stale completions so
an old request cannot override an upgrade or reset. All 21 models are checked
against the bundled component definitions, textures and compact preview bounds.

The HUD counts unit HP actually removed, in total and per weapon, plus unit
kills credited to each finishing weapon. A hit displays the damage and remaining
HP; damage beyond the target's remaining HP is excluded. Balloon hits, misses
and rejected cooldown shots never add unit damage. Disarming preserves the
counters; Restart game resets them. These are simplified mini-game values,
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
motion pauses when disarmed/hidden or the window loses focus. Enemies keep
wandering while inside firing range of friendlies and close the distance when
outside range. Public reduced-motion users get one gameplay reposition per
second, including wandering targets before friendlies are recruited. The owner's
localhost preview keeps smooth movement enabled, like the balloon.
The existing software 3D renderer draws units at no more than 20 frames/second.

Tests: `node --test stats/site-armory-battle.test.cjs stats/site-armory.test.cjs stats/site-armory-units.test.mjs`
