import { defineConfig } from "vite";
import { createReadStream, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extname, resolve, sep } from "node:path";

// The library is shared with Mapmaker and sits outside this app's Vite root.
// Serve only its public model and texture directories during local development.
const mapmakerRoot = resolve(fileURLToPath(new URL("../mapmaker/", import.meta.url)));
function serveMapmaker(server) {
  const prefix = new URL("../mapmaker", new URL(server.config.base, "http://localhost")).pathname;
  server.middlewares.use(prefix, (request, response, next) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      if (!/^\/(?:pies\/|classic\/texpages\/texpages\/)/.test(pathname)) return next();
      const filename = resolve(mapmakerRoot, `.${pathname}`);
      if (!filename.startsWith(mapmakerRoot + sep) || !statSync(filename).isFile()) return next();
      const types = { ".json": "application/json", ".png": "image/png", ".pie": "text/plain" };
      response.setHeader("Content-Type", types[extname(filename)] ?? "application/octet-stream");
      createReadStream(filename).on("error", next).pipe(response);
    } catch { next(); }
  });
}

export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages project sites are served from /<repo-name>/ instead of /.
  base: command === "build" || isPreview ? "/boha/model-editor/" : "/",
  plugins: [{ name: "local-mapmaker-assets", configureServer: serveMapmaker, configurePreviewServer: serveMapmaker }],
  build: {
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three", "three/examples/jsm/controls/OrbitControls.js"],
        },
      },
    },
  },
}));
