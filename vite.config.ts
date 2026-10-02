import { defineConfig } from "vite";
import { build } from "esbuild";
import { resolve } from "node:path";
import livePreview from "vite-live-preview";

export default defineConfig({
  plugins: [
    {
      name: 'penpot-controller',
      apply: 'build',
      buildStart() {
        this.addWatchFile(resolve('src/plugin.ts'));
      },
      async generateBundle() {
        // Penpot evaluates a script, so controller imports must stay in one file.
        const controller = await build({
          entryPoints: ['src/plugin.ts'],
          bundle: true,
          format: 'iife',
          target: 'es2020',
          minify: true,
          write: false,
          metafile: true,
        });
        for (const path of Object.keys(controller.metafile.inputs)) this.addWatchFile(resolve(path));
        this.emitFile({ type: 'asset', fileName: 'plugin.js', source: controller.outputFiles[0].text });
      },
    },
    livePreview(),
  ],
  build: {
    target: "es2020",
    rollupOptions: {
      input: {
        index: "./index.html",
      },
      output: {
        entryFileNames: "[name].js",
      },
    },
  },
  preview: {
    host: "localhost",
    port: 4400,
    strictPort: true,
    // Penpot loads these public plugin assets from a different origin.
    cors: true,
  },
});
