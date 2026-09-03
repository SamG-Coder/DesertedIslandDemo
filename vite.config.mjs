import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "./",
  publicDir: false,
  build: {
    target: "esnext",
    assetsInlineLimit: 0,
    sourcemap: false,
    rollupOptions: {
      input: {
        game: path.join(root, "index.html"),
      },
    },
  },
  plugins: [{
    name: "deserted-island-pages",
    transformIndexHtml(html, ctx) {
      if (ctx.server) return html;
      return html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/m, "");
    },
    async closeBundle() {
      const output = path.join(root, "dist");
      await mkdir(output, { recursive: true });
      await writeFile(path.join(output, ".nojekyll"), "");
    },
  }],
});
