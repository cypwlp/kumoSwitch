import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The built bundle is emitted as a single classic <script> instead of an ES
 * module. Two reasons:
 *  - `file:///…/ui/dist/index.html` (the headless screenshot / browser preview
 *    path) refuses ES modules because of the null origin CORS rule.
 *  - Tauri's CSP is `default-src 'self'`, so everything stays in external files
 *    (no inlining) and keeps working inside the desktop shell.
 */
function classicScriptEntry(): Plugin {
  return {
    name: "kumoswitch-classic-script",
    apply: "build",
    closeBundle() {
      const file = fileURLToPath(new URL("./dist/index.html", import.meta.url));
      const html = readFileSync(file, "utf8");
      const patched = html
        .replace(/<script type="module" crossorigin src=/g, "<script defer src=")
        .replace(/<script type="module" src=/g, "<script defer src=")
        // `crossorigin` forces a CORS fetch, which a null-origin file:// page
        // can never satisfy — drop it from the stylesheet link too.
        .replace(/ crossorigin/g, "");
      if (patched !== html) writeFileSync(file, patched);
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), classicScriptEntry()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2019",
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: {
      output: {
        format: "iife",
        inlineDynamicImports: true,
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});