# Warzone 2100 PIE Model Viewer and Editor

[**Open the live model editor**](https://maway2000.github.io/boha/model-editor/) · [Community hub](https://maway2000.github.io/boha/) · [Report an issue](https://github.com/MaWay2000/boha/issues)

A browser-based tool for inspecting and editing Warzone 2100 `.pie` models. It renders models in a Three.js viewport and lets you change vertex coordinates without installing a desktop model editor.

## Features

- Load PIE 2 and PIE 3 files, including multi-level models.
- Match uploaded texture pages to the filenames referenced by the model.
- Inspect model metadata, points, wireframe, and connectors.
- Toggle the grid, axes, and texture V orientation.
- Edit a selected point's X, Y, and Z coordinates.
- Export the modified model as a `.pie` file.
- Load a bundled sample to explore the viewer.

## Quick start

1. Open the live editor and choose **Load Sample**, or **Open PIE + Textures**.
2. For your own model, select the PIE file and its required texture images together.
3. Drag to orbit, use the mouse wheel to zoom, and use the right mouse button to pan.
4. Use the display controls to inspect the geometry and select a point to edit its coordinates.
5. Choose **Export .pie** to download the result.

Keep the original model and textures as a backup. Exporting the PIE does not replace the texture files it references. A model without matching textures may not look like it does in the game.

## Run locally

The hosted app can run as static files. From the root of the `boha` repository:

```bash
python -m http.server 8000
```

Open [http://localhost:8000/model-editor/](http://localhost:8000/model-editor/). Use a browser with WebGL enabled. An internet connection is needed for dependencies loaded through the page's import map.

### Vite development workflow

For development with Node.js and npm, run these commands from the repository root:

```bash
cd model-editor
npm install
npm run dev
```

Open the local URL printed by Vite. To build and preview the production output:

```bash
npm run build
npm run preview
```

## Project layout

- `index.html`: app shell and browser entry point.
- `src/main.js`: model loading, rendering, and editor interaction.
- `src/styles.css`: interface styling.
- `package.json`: Vite commands and dependencies.

## Feedback and license

Report problems in the [boha issue tracker](https://github.com/MaWay2000/boha/issues). Include the browser, console error, and a shareable PIE/texture sample where possible.

See [LICENSE](LICENSE). Warzone 2100 assets and third-party dependencies retain their own licensing terms.
