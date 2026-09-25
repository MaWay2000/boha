# OPUS to MP3 Converter

[**Open the live converter**](https://maway2000.github.io/boha/opus2mp3/) · [Community hub](https://maway2000.github.io/boha/) · [Report an issue](https://github.com/MaWay2000/boha/issues)

A browser-based audio converter built around the single-threaded FFmpeg WebAssembly core. Conversion runs in the browser, so the static website does not need a server-side FFmpeg process or PHP.

## Features

- Convert OPUS audio to MP3, or switch to MP3-to-OPUS conversion.
- Queue multiple files for batch conversion.
- Adjust the quality controls available for the selected mode.
- Download converted files through the browser.
- Load the FFmpeg wrapper, core, and WebAssembly assets from this project.

## How to use it

1. Open the live converter and select your audio files.
2. Choose the conversion mode and quality settings.
3. Start the conversion and follow the queue's progress.
4. Download the completed files before closing the page.

Keep the page open while conversion is running. Large files or batches can use substantial browser memory, and processing speed depends on your device. Try a smaller batch if the browser becomes unresponsive. Your browser may request permission before allowing multiple downloads.

## Why single-threaded FFmpeg?

This package is designed for static hosting on GitHub Pages without custom cross-origin isolation headers. Its single-threaded core avoids the SharedArrayBuffer setup required by multi-threaded builds.

The FFmpeg assets are vendored locally rather than fetched from an FFmpeg CDN. The wrapper embeds its worker code, and the page includes local file-loading helpers.

## Run locally

From the root of the `boha` repository:

```bash
python -m http.server 8000
```

Open [http://localhost:8000/opus2mp3/](http://localhost:8000/opus2mp3/). Serve the files over HTTP instead of opening `index.html` directly, so the worker and WebAssembly assets can load correctly.

## Package contents

- `index.html`: conversion interface, queue, and file-loading helpers.
- `ffmpeg.js`: FFmpeg wrapper with embedded worker.
- `ffmpeg-core.js`: single-threaded core loader.
- `ffmpeg-core.wasm`: WebAssembly conversion engine.
- `.nojekyll`: static-hosting marker.

## Troubleshooting

If startup fails, check that all FFmpeg files were deployed together and that the browser can load the `.wasm` file. For a reproducible issue, include your browser, file format, approximate file size, and the error message in the [issue tracker](https://github.com/MaWay2000/boha/issues).

Third-party components, including FFmpeg, have their own licenses. See the repository [LICENSE](../LICENSE) for project licensing.
