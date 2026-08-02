import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  // GitHub Pages project sites are served from /<repo-name>/ instead of /.
  base: command === "build" ? "/boha/model-editor/" : "/",
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
