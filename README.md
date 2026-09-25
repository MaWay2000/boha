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

The `sync-onit-published.yml` workflow verifies and mirrors normalized, replay-derived snapshots into `stats/published/` every 30 minutes. Its historical filename does not imply that the publisher must remain on the original host. The configured publisher is defined in `stats/sync-onit-published.js`.

A manual-only legacy workflow, `sync-warzone-upstream.yml`, remains available for upstream statistics synchronization. Maintainers can also run:

```bash
node stats/sync-upstream.js
```

That script refreshes mirrored leaderboard logic, player-key mappings, snapshot data, and `stats/upstream-manifest.json`. Some upstream requests may require `UPSTREAM_BASIC_USER` and `UPSTREAM_BASIC_PASSWORD`, or `UPSTREAM_BASIC_AUTH`. Keep credentials in environment variables or repository secrets, never committed files.

Running the static site locally does not start these backend or synchronization services. Features that use external APIs still depend on those services being available and allowing the request.

## Hosting and contributions

GitHub Pages publishes this repository from the main branch. Keep asset paths relative where possible and preserve filename casing.

For bugs or suggestions, [open an issue](https://github.com/MaWay2000/boha/issues) with the affected page, browser, reproduction steps, and a screenshot or console error if relevant. For editor problems, attach a small sample file when it is safe to share.

## License

See [LICENSE](LICENSE). Bundled third-party software and game assets may have their own licensing terms.
