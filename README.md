# boha

Modern remake of the legacy Warzone 2100 community hub.

## Included here

- `index.html` - remade front page
- `styles.css` - visual system and responsive layout
- `app.js` - section reveal effects, copy buttons, and lobby rendering
- `assets/` - local branding and artwork used by the remake
- `stats/` - mirrored upstream leaderboard logic, player-key mapping, live snapshot data, and auto-refresh manifest
- `radio/` - the original Warzone Radio player and its local assets

## Notes

- The page is ready for static hosting, including GitHub Pages.
- The radio player is available at `radio/`.
- The embedded stats board auto-refreshes mirrored upstream files through `stats/upstream-manifest.json`.
- Because the upstream site does not expose CORS headers, GitHub Pages cannot read those files directly from the browser.
- `node stats/sync-upstream.js` refreshes `calculate.js`, `leaderboards.js`, `upstream-results.js`, `player-public-keys.json`, `results-snapshot.json`, and the manifest in one pass.
- The sync script also supports optional upstream auth via `UPSTREAM_BASIC_USER` and `UPSTREAM_BASIC_PASSWORD`, or a prebuilt `UPSTREAM_BASIC_AUTH` header.
- `.github/workflows/sync-warzone-upstream.yml` is set to mirror the upstream stats stack every 5 minutes.
- Live lobby streaming expects `lobby.http-event-stream.json` to exist beside the page.
- Several resource links intentionally point to the existing `warzone2100.retropaganda.info` endpoints.
- When I verified the legacy routes on March 20, 2026, `results.json` was returning HTTP 500, so the remake links to the working legacy leaderboard view instead.
