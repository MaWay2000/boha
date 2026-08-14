# boha

Modern remake of the legacy Warzone 2100 community hub.

## Included here

- `index.html` - remade front page
- `styles.css` - visual system and responsive layout
- `assets/` - local branding and artwork used by the remake
- `stats/` - mirrored upstream leaderboard logic, player-key mapping, live snapshot data, and auto-refresh manifest
- `radio/` - the integrated Warzone Radio player, original MP3 tracks, and related pages
- `mapmaker/` - browser-based Warzone 2100 map editor
- `model-editor/` - browser-based PIE model viewer and editor
- `opus2mp3/` - browser-based OPUS-to-MP3 converter

## Notes

- The page is ready for static hosting, including GitHub Pages.
- The radio player is available at `radio/`.
- The consolidated tools are available at `mapmaker/`, `model-editor/`, and `opus2mp3/`.
- The embedded stats board auto-refreshes mirrored upstream files through `stats/upstream-manifest.json`.
- Because the upstream site does not expose CORS headers, GitHub Pages cannot read those files directly from the browser.
- `node stats/sync-upstream.js` refreshes `calculate.js`, `leaderboards.js`, `upstream-results.js`, `player-public-keys.json`, `results.json`-based snapshot data, and the manifest in one pass.
- The sync script also supports optional upstream auth via `UPSTREAM_BASIC_USER` and `UPSTREAM_BASIC_PASSWORD`, or a prebuilt `UPSTREAM_BASIC_AUTH` header.
- `.github/workflows/sync-warzone-upstream.yml` is retained as a manual-only legacy fallback while the final primary leaderboard output is validated.
- `.github/workflows/sync-onit-published.yml` verifies and mirrors normalized replay-derived snapshots published by onit.lt every 30 minutes.
- The browser reads secondary-source match metadata from `stats/published/matches.json`; onit.lt performs discovery, replay storage, parsing, normalization, and publication before GitHub receives it.
- Several resource links intentionally point to the existing `warzone2100.retropaganda.info` endpoints.
- When I verified the legacy routes on March 20, 2026, `results.json` was returning HTTP 500, so the remake links to the working legacy leaderboard view instead.
