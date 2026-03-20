# boha

Modern remake of the legacy Warzone 2100 community hub.

## Included here

- `index.html` - remade front page
- `styles.css` - visual system and responsive layout
- `app.js` - section reveal effects, copy buttons, and lobby rendering
- `assets/` - local branding and artwork used by the remake
- `stats/` - leaderboard logic, player-key mapping, and bundled results snapshot
- `radio/` - the original Warzone Radio player and its local assets

## Notes

- The page is ready for static hosting, including GitHub Pages.
- The radio player is available at `radio/`.
- The embedded stats board uses `stats/results-snapshot.json` so it can render off-domain.
- Refresh the bundled stats snapshot with `node stats/update-snapshot.js`.
- Live lobby streaming expects `lobby.http-event-stream.json` to exist beside the page.
- Several resource links intentionally point to the existing `warzone2100.retropaganda.info` endpoints.
- When I verified the legacy routes on March 20, 2026, `results.json` was returning HTTP 500, so the remake links to the working legacy leaderboard view instead.
