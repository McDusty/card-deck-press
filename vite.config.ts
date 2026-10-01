import { defineConfig } from "vite";
import livePreview from "vite-live-preview";

export default defineConfig({
  plugins: [livePreview()],
  build: {
    target: "es2020",
    rollupOptions: {
      input: {
        plugin: "src/plugin.ts",
        index: "./index.html",
      },
      output: {
        entryFileNames: "[name].js",
      },
    },
  },
  preview: {
    port: 4400,
  },
});
