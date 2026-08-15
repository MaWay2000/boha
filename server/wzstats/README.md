# MaWay2000 wzstats server

Server-side collection, replay storage and read-only API for MaWay2000's second completed-match source.

## Replay-first synchronization

Every server adapter returns only a normalized remote replay listing: source, remote ID, filename and download URL. The shared queue stores that listing in `remote_replays`, compares it on every scan, and downloads only records whose status is `pending` or `retry`.

Downloaded files must have a valid `WZrp` header. They are stored by SHA-256, so the same replay discovered on multiple servers is saved and parsed only once. Remote HTTP 404 files are marked `missing`; transient download failures remain retryable. A server removing a file never deletes the local archived copy.

After parsing, `ReplayMaterializer` creates normalized match, map, duration and non-spectator player records from replay data. Source totals are not silently promoted into replay-derived fields. Missing replay-native values remain null and can be attached later as explicitly attributed source metadata.

Bohan/Retropaganda is the primary discovery source. Sunshine/wz2100.uk and future servers are additional discovery sources. Source website fields are provenance metadata; the replay file and versioned replay parser are the canonical data path.

## GitHub publication

Every completed cron run invokes `Publisher`, which atomically writes `data/matches.json` and `data/manifest.json`. The manifest includes the content SHA-256, byte size and match count. Its timestamp changes only when published match content changes.

GitHub Actions downloads the manifest and snapshot from `https://onit.lt/wzstats/data/`, verifies the SHA-256 and commits only changed files under `stats/published/`. GitHub Pages uses that snapshot for discovery and reads confirmed replay-engine player details from the live API. Replay binaries remain content-addressed downloads from onit.lt.

The legacy result snapshot is imported as an explicitly attributed outcome fact only when its source replay ID also exists in the new database. The server calculates `data/leaderboards.json`; matches without a trustworthy outcome are excluded from wins, losses and Elo. The existing public leaderboard remains unchanged until the server result has been validated.

This directory is isolated from the existing static `stats/` system. It does not replace or modify the Retropaganda/legacy source.

## Requirements

- PHP 8.1+ with PDO MySQL, cURL, DOM, JSON and mbstring
- MariaDB 10.6+ or MySQL 8+
- Apache `mod_rewrite`
- A scheduled cron job and PHP CLI

## Configuration

Copy `config.example.php` to a location outside `public_html` and set the `WZSTATS_CONFIG` environment variable for CLI jobs. If the hosting panel cannot expose an environment variable, `config.local.php` is supported as a fallback and is denied by the included `.htaccess`.

Never commit `config.local.php`.

## First run

```sh
php bin/wzstats.php migrate
php bin/wzstats.php status
php bin/wzstats.php sync 10
php bin/wzstats.php parse 10
node tools/build-legacy-outcomes.mjs
php bin/leaderboard.php
```

URL cron schedule:

```cron
0,30 * * * * cronurl 'https://onit.lt/wzstats/bin/bohan.php?key=BOHAN_CRON_KEY'
15,45 * * * * cronurl 'https://onit.lt/wzstats/bin/sun.php?key=SUN_CRON_KEY'
```

`bohan.php` and `sun.php` scan their complete available listings, compare them with the saved queue, download up to 100 unseen replay files, SHA-256 deduplicate them and parse up to 100 pending files. Normal 30-minute arrivals are fully drained in one run; the initial historical backlog is drained safely across multiple runs. Each URL requires its own secret key and returns 404 without it.

`tools/build-legacy-outcomes.mjs` creates the private upload artifact `data/legacy-outcomes.json`. `leaderboard.php` imports it, links facts to materialized matches by source ID, and atomically publishes `data/leaderboards.json`. The artifact and generated output are ignored by Git.

After the initial import, both source cron scripts recalculate the leaderboard. An unchanged calculation preserves the existing file and `generatedAt` value.

Replay parsing validates the WZrp container and records replay-native header, match, player and network-message metadata. Final player totals are published only after the PC replay engine confirms them with `stats_source = replay-engine`.

## API

- `GET /wzstats/api/v1/status`
- `GET /wzstats/api/v1/matches?limit=30&offset=0`
- `GET /wzstats/api/v1/matches/<database-id>`
- `GET /wzstats/api/v1/replays/<sha256>`

Authenticated worker operations:

- `GET /wzstats/api/v1/worker/status`
- `GET /wzstats/api/v1/worker/jobs?limit=5`
- `POST /wzstats/api/v1/worker/results`
- `POST /wzstats/api/v1/worker/retry-failed`

The public API is read-only. Worker mutation endpoints require the private bearer token. CORS is limited to the configured MaWay2000 and onit.lt origins.

## Data provenance

Source servers provide discovery metadata and replay downloads only. Player totals are public only when `stats_source = replay-engine`; all other player-stat fields are returned as null. See `REPLAY_ENGINE.md` for the versioned contract.
