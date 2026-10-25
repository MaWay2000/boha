# Balloon news and mini-game

This folder contains all 15 JavaScript/module and CSS files for the flying news
balloon and its optional target-practice game. The root `index.html` loads them
from here; no compatibility copies are kept in the repository root.

- `site-news*`: flight, news dialog, and 3D balloon rendering.
- `site-armory*`: weapons, sound, combat, drops, scores, research tiers, and unit
  previews.

The permanent news records stay in `../news/`. Balloon artwork stays in
`../assets/`; shared Warzone components, textures and renderers stay in
`../mapmaker/` and `../assets/vendor/`. Module-relative resource paths climb one
directory with `../`, while page-relative paths still resolve from `index.html`.

Gameplay documentation: [ARMORY-GAME.md](../stats/ARMORY-GAME.md).
Tests remain under `../stats/` and use the same commands as before the move.
