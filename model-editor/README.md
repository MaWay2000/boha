# Warzone 2100 PIE Model Viewer and Editor

[**Open the live model editor**](https://maway2000.github.io/boha/model-editor/) · [Community hub](https://maway2000.github.io/boha/) · [Report an issue](https://github.com/MaWay2000/boha/issues)

A browser-based tool for inspecting and editing Warzone 2100 `.pie` models. It renders models in a Three.js viewport and lets you change vertex coordinates without installing a desktop model editor.

## Features

- Load PIE 2, PIE 3, and PIE 4 files, including multi-level models and polygon texture-animation data.
- Match uploaded texture pages to the filenames referenced by the model.
- Inspect model metadata, points, wireframe, and connectors.
- Toggle the grid, axes, and texture V orientation.
- Edit a selected point's X, Y, and Z coordinates; press Enter or leave the field to apply, or Escape to cancel a draft.
- Export the modified model while preserving the original section order, metadata, comments, line endings, and untouched coordinate precision.
- Load a bundled sample to explore the viewer.
- Build droids with independent Body, Propulsion, and Gun selectors, or start from an existing preset.

## Quick start

1. Open the live editor and choose **Load Sample**, or **Open PIE + Textures**.
2. For your own model, select the PIE file and its required texture images together.
3. Drag to orbit, use the mouse wheel to zoom, and use the right mouse button to pan.
4. Use the display controls to inspect the geometry and select a point to edit its coordinates.
5. Choose **Export .pie** to download the result.

Keep the original model and textures as a backup. Exporting the PIE does not replace the texture files it references. A model without matching textures may not look like it does in the game.

The library can show individual PIE files or assemble complete droids from the shared Mapmaker assets. Export saves the currently selected PIE part. Animation data and material extensions are preserved on export; the viewport shows static geometry and the main color texture.

### Build a droid

In **Complete droid modules**, select a body, propulsion, and gun. Changes rebuild the preview automatically; **Build droid** also previews the initial selection. The preset search and list remain below the selectors. Selecting a compatible preset fills the selectors so you can customize it.

- Normal vehicles use designable components. VTOL propulsion shows aircraft guns; ground and naval propulsion show ground guns. Anti-air targeting does not make a gun aircraft-mounted.
- Cyborg bodies use cyborg legs and weapons from their own regular or super-cyborg family.
- Extra gun choices follow the body's weapon-slot capacity. The stock Dragon offers a second optional gun. Explicit weapon-size limits are honored when present; gun names and weight do not introduce additional exclusions.
- Incompatible selections reset to compatible components with an explanation. Bomb bays remain valid even when they have only a mount and no separate gun mesh.
- Special presets remain viewable. Choose a standard body to start customizing one; their non-designable parts do not enter the normal selectors. Research availability is not enforced in this offline viewer.

The assembly uses each body's explicit propulsion models, including combined meshes and any explicitly specified right side. Cyborg legs are drawn once. Aircraft turrets use underside connectors and inverted mounting; point selection and editing overlays follow the same transforms. Changing a component retains vertex edits in parts that remain in the assembly. Export still saves one selected PIE part rather than a complete game template.

Invalid files report a filename and error instead of replacing the currently loaded model. A texture that cannot be decoded shows a warning and leaves the geometry usable. The viewer renders on demand, including frames needed for orbit damping, and sleeps while idle or hidden.

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

Vite serves the shared model and texture folders from the sibling `mapmaker/` directory for development and local preview. Keep that directory alongside `model-editor/`. The production preview URL includes `/boha/model-editor/`.

### Regression checks

After installing dependencies, run `npm test` from `model-editor/`. The tests cover lossless import/export and a vertex edit across all bundled PIE files, malformed input, polygon animation data, overlapping scene loads, loading errors, coordinate editing, and rendering while idle or hidden.

## Project layout

- `index.html`: app shell and browser entry point.
- `src/main.js`: model loading, rendering, and editor interaction.
- `src/styles.css`: interface styling.
- `package.json`: Vite commands and dependencies.

## Feedback and license

Report problems in the [boha issue tracker](https://github.com/MaWay2000/boha/issues). Include the browser, console error, and a shareable PIE/texture sample where possible.

See [LICENSE](LICENSE). Warzone 2100 assets and third-party dependencies retain their own licensing terms.
