# Warzone 2100 Community Hub

[**Open the live project**](https://maway2000.github.io/boha/) · [Report an issue](https://github.com/MaWay2000/boha/issues)

A modern Warzone 2100 community hub bringing together player statistics, recent matches, replay-analysis information, map and model editors, radio, and audio tools. The website is built with HTML, CSS, and JavaScript and published through GitHub Pages.

## Explore the website

| Page or tool | What you can do |
| --- | --- |
| [Community hub](https://maway2000.github.io/boha/) | Open the main project and navigate its resources. |
| [Leaderboards](https://maway2000.github.io/boha/leaderboards.html) | Browse player rankings and statistics. |
| [Recent matches](https://maway2000.github.io/boha/recent-matches.html) | Browse recorded matches and their results. |
| [Compare players](https://maway2000.github.io/boha/compare.html) | Compare player statistics. |
| [Replay analyzer](https://maway2000.github.io/boha/replay-analyzer.html) | Visit the replay-analysis section. |
| [MapMaker](https://maway2000.github.io/boha/mapmaker/) | Load, edit, validate, and export Warzone 2100 maps. |
| [PIE model editor](https://maway2000.github.io/boha/model-editor/) | Inspect models, edit vertices, and export PIE files. |
| [OPUS to MP3](https://maway2000.github.io/boha/opus2mp3/) | Convert audio files in the browser. |
| [Warzone Radio](https://maway2000.github.io/boha/radio/) | Listen to the integrated music collection. |

You do not need to clone the repository to use the hosted website. Individual 3D tools require a browser with working WebGL support.

## Run locally

Install Python 3, then clone and serve the repository:

```bash
git clone https://github.com/MaWay2000/boha.git
cd boha
python -m http.server 8000
```

Open [http://localhost:8000/](http://localhost:8000/). Keep the terminal running while using the site; press Ctrl+C to stop the server.

Use a local HTTP server instead of opening HTML files directly, because the tools load additional models, textures, scripts, and data. No root-level build step is required. The model editor also offers a separate [Vite development workflow](model-editor/README.md).

## Repository layout

- `index.html`, `styles.css`, and `assets/`: front page, shared visual design, and artwork.
- `leaderboards.html`, `recent-matches.html`, and `compare.html`: statistics pages.
- `replay-analyzer.html` and `replay-analyzer.js`: replay-analysis web interface.
- `stats/`: statistics scripts, synchronization helpers, snapshots, and manifests.
- `radio/`: music player and tracks.
- `mapmaker/`: [map editor documentation](mapmaker/README.md).
- `model-editor/`: [PIE viewer/editor documentation](model-editor/README.md).
- `opus2mp3/`: [audio converter documentation](opus2mp3/README.md).
- `.github/workflows/`: automated and manually triggered data synchronization.

## Statistics and data updates

The website and the replay-processing backend are separate systems. GitHub Pages serves static files; it does not run the analyzer, a database, PHP, or Node.js backend services.

Local administration/backend files are deliberately excluded from this public
repository. Public statistics are privacy-filtered before publication; see
[SECURITY.md](SECURITY.md) for the boundary and pre-publication checks.

The `sync-onit-published.yml` workflow verifies and mirrors normalized, replay-derived snapshots into `stats/published/` every 30 minutes. Its historical filename does not imply that the publisher must remain on the original host. The configured publisher is defined in `stats/sync-onit-published.js`.

A manual-only legacy workflow, `sync-warzone-upstream.yml`, remains available for upstream statistics synchronization. Maintainers can also run:

```bash
node stats/sync-upstream.js
```

That script refreshes mirrored leaderboard logic, player-key mappings, snapshot data, and `stats/upstream-manifest.json`. Some upstream requests may require `UPSTREAM_BASIC_USER` and `UPSTREAM_BASIC_PASSWORD`, or `UPSTREAM_BASIC_AUTH`. Keep credentials in environment variables or repository secrets, never committed files.

Running the static site locally does not start these backend or synchronization services. Features that use external APIs still depend on those services being available and allowing the request.

## Personal rating previews

Leaderboards, player comparison, and recent matches share a browser-local rating
panel. Published ratings remain the initial view. The displayed site defaults
are editable: starting Elo 1500, K 20, Elo scale 400, minimum 5 games, minimum
3 match minutes, minimum 1 player per team, equal teams required, and no
new-player boost (multiplier 1). Users can load these defaults, customize them,
then select Recalculate. Reset to published restores the published leaderboard.

The Elo scale controls how rating gaps affect expected results. Minimum players
per team can restrict previews to larger team games. Saved preferences from older
versions adopt the original defaults for these new controls. Preferences remain
in the user's browser; match outcomes and server-published statistics are unchanged.
The preview uses published match data and is not an exact reproduction of
Bohan's leaderboard when required private identities or telemetry are missing.

## Hosting and contributions

GitHub Pages publishes this repository from the main branch. Keep asset paths relative where possible and preserve filename casing.

For bugs or suggestions, [open an issue](https://github.com/MaWay2000/boha/issues) with the affected page, browser, reproduction steps, and a screenshot or console error if relevant. For editor problems, attach a small sample file when it is safe to share.

## License

See [LICENSE](LICENSE). Bundled third-party software and game assets may have their own licensing terms.
