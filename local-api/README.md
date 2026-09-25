# BOHA local API

This service exposes the small public API surface still needed by the GitHub Pages site while keeping MariaDB bound to localhost.

## Routes

- `GET /healthz`
- `GET /wzstats/api/v1/matches/{id}`
- `GET /wzstats/api/v1/replays/{sha256}`
- `GET /wzstats/data/{matches.json,leaderboards.json,manifest.json}`
- `POST /wzstats/api/v1/visitors`
- `GET /wzstats/visitors` (visitor dashboard; localhost is trusted by the local configuration)
- `GET/POST /wzstats/player-bans` (local-only player-ban administration)

## Local setup

Run `scripts/Setup-LocalApi.ps1` once from an elevated PowerShell session. It creates a least-privilege MariaDB account and writes its generated credential outside the repository to:

`C:\Users\Admin\AppData\Local\BohaApi\config.php`

Start the local-only listener with `scripts/Start-LocalApi.ps1`. The service listens on `127.0.0.1:8787`; MariaDB port 3306 must never be exposed publicly.

Tailscale Funnel publishes the listener at `https://desktop-0467j9q.tail41fd3a.ts.net`. The Funnel configuration is persistent and Tailscale runs in unattended mode.

## Collector

The hosted WzStats code is mirrored under `hosted-wzstats`. Generated publication files and replay caches are ignored by Git. Its private MariaDB worker configuration is stored outside the repository at:

`local-api/private/config.local.php`

`scripts/Run-WzStatsWorker.cmd` runs one collection cycle. `scripts/Run-WzStatsLoop.cmd` supervises the 15-minute loop and restarts it after an unexpected exit. Run `scripts/Install-StartupTasks.ps1` to install the restartable API task and the collector Startup launcher.

The verified Mozilla CA bundle used by PHP is stored at `local-api/private/cacert.pem`.

# Player bans

Open `http://127.0.0.1:8787/wzstats/player-bans` on the server PC and sign in to manage
confirmed player bans. The password hash is stored only in the ignored
`local-api/private/player-ban-auth.php` file; never commit that file. The panel
remains local-only and requires a public-key account
from the published Global leaderboard; nickname-only players cannot be banned.
Do not expose the panel through Tailscale Funnel or another public tunnel, especially with a short password.
Each action requires a reason and is recorded in the private audit log.

The private list lives in `local-api/private/player-bans.json` and is excluded
from Git. Active bans give the account an effective ELO of -2000 and hide it
from the public leaderboard and player search without deleting historical
matches or changing other players' match results. Saving a ban republishes
local stats and updates the local preview. Commit and push the generated
`stats/published` files to update the hosted website.
