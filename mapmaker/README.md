# Warzone2100 MapMaker

Browser-based 3D map editor for Warzone 2100 maps.

Warzone2100 MapMaker lets you load, inspect, edit, validate, and export Warzone 2100 `.wz` maps directly in the browser. It uses plain HTML, JavaScript, and Three.js/WebGL, so it can run as static files on GitHub Pages.

Created by [MaWay2000](https://github.com/MaWay2000).

## Live App

[Open Warzone2100 MapMaker](https://maway2000.github.io/boha/mapmaker/)

## What It Can Do

- Load local `.wz`, `.zip`, `.7z`, `.map`, `.gam`, and `.json` map files.
- Browse maps from the repository `maps/filelist.txt` server-map list.
- Open the official Warzone 2100 map download site.
- Preview maps in a 3D WebGL scene.
- Move the camera with mouse, scroll, WASD, arrow keys, and reset view.
- Edit terrain tiles with brush painting or area selection.
- Rotate, flip, and inspect terrain tile IDs and tile types.
- Edit terrain height with brush painting, presets, sliders, and area selection.
- Resize maps while preserving existing terrain data.
- Place, preview, rotate, inspect, delete, and recolor structures.
- Select structure owner/player before building.
- Add official Warzone 2100 structures including resources, base buildings, sensors, walls, towers, bunkers, hardpoints, fortresses, artillery, anti-air, and other defenses.
- Place oil resources and oil derricks from the Structures resource list.
- Place, preview, inspect, delete, and recolor droids.
- Build droids from official body, propulsion, weapon, construction, repair, sensor, brain, and ECM parts.
- Show only scavenger droids when needed.
- Restrict cyborg and transport body options to compatible official parts.
- Render droid turret yaw, pitch, recoil, and muzzle effects where supported.
- Place feature objects such as trees, bushes, boulders, ruins, buildings, wrecks, vehicles, pipes, debris, oil resources, oil drums, and crates.
- Validate maps before export.
- Save/export maps as `.wz` archives.
- Choose a map name before saving.
- Undo and redo editor actions.
- Open project help and community Discussions from the About tab.

## Editor Tabs

### File

Create a new map, load a local map, browse server maps, open official maps, validate, set the map name, and save/export.

### View

Camera help, map inspection, object selection, and bulk owner assignment.

### Tiles

Choose tilesets, paint terrain tiles, draw tile areas, rotate tiles, show tile IDs, and show tile types.

### Height

Paint terrain heights, draw height areas, use height presets, and show terrain heights.

### Resize

Change map width and height while keeping existing map data inside the new bounds.

### Structures

Build and manage structures with player ownership, rotation, model previews, map previews, modules, and delete/view modes.

### Droids

Build and manage droids from official components, including player ownership, rotation, scavenger lists, and model previews.

### Objects

Build and manage feature objects such as scenery, ruins, wrecks, debris, oil resources, and crates.

### About

Help links, project information, creator information, and GitHub Discussions.

## Project Folders

- `index.html` - main browser app.
- `js/` - JavaScript editor, renderer, loader, and helper modules.
- `pies/` - Warzone 2100 PIE models and component data used by previews.
- `classic/` - tileset textures and classic Warzone 2100 assets.
- `maps/` - optional bundled/server maps.
- `maps/filelist.txt` - list used by Browse server maps.
- `maps/index.php` - optional helper that can generate/update `maps/filelist.txt` on a PHP-capable server.

## Local Use

Because the app loads JSON, textures, and PIE files, run it through a small local web server instead of opening every file directly.

```bash
python -m http.server 8765
```

Then open:

```text
http://127.0.0.1:8765/index.html
```

## Community

Use GitHub Discussions for bug reports, suggestions, questions, mapmaking screenshots, shared maps, and general Warzone 2100 MapMaker talk:

[Warzone2100 MapMaker Discussions](https://github.com/MaWay2000/warzone2100-mapmaker/discussions/1)

## License

MIT License. See [LICENSE](LICENSE).
