# Replay-engine statistics contract

Analyzer contract: `3.0.0`

The replay file is the only authority for player statistics. Source adapters may
discover replay URLs and supply listing metadata, but source-calculated player
totals must never be published as replay-engine statistics.

## Final player record

Every confirmed result contains one record for each non-observer replay slot:

- identity: position, name, public key, team, faction and colour;
- outcome: winner, loser or unknown, plus departure time;
- combat: score, unit kills, structure kills and experience;
- production: droids and structures built, lost and alive;
- economy: current power, oil rigs, recent power won and recent power lost;
- research: completed topics, recent performance and recent potential;
- final state: health percentage and remaining droids and structures.

`RES` is calculated only as:

`recentResearchPerformance / recentResearchPotential * 100`

If either replay-engine value is absent, the website displays no RES value. It
must not substitute source statistics or estimate the value from command timing.

## Extended record

- completed-research timeline;
- one-minute player snapshots;
- decoded production, construction, attack and research commands;
- player departure and chat events;
- player activity counts and last recorded activity;
- manufactured unit designs and their weapon/component identifiers;
- decoder error counts and explicit availability flags.

The decoded network record is stored losslessly as `gzip+base64` to stay within
shared-hosting request and database packet limits.

## Not currently available

The analyzer must report these as unavailable rather than inventing values:

- damage dealt per player;
- exact defeat reason;
- exact remaining factory count;
- authoritative inactivity/passivity reason;
- produced/lost totals by individual unit design;
- kills and damage by individual weapon.

## Publication rule

Normalized player totals are publishable only when `stats_source` is
`replay-engine` and the stored replay hash matches the analyzed file. Unprocessed
or failed matches keep their listing metadata but publish blank player totals.

Historical reanalysis is disabled by default. It is enabled only after the
contract, API, desktop worker and website have passed the sample replay checks.
