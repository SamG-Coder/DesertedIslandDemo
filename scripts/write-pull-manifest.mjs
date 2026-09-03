import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const virtualURL = "https://deserted-island.runtime.threebrowser.local/";

const skip = new Set(["node_modules", "dist", ".git", ".github", "artifacts"]);
const skipFiles = new Set([".gitignore", "package-lock.json"]);

async function walk(directory, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (skip.has(entry.name) || entry.name.startsWith(".")) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(full, files);
    else if (!skipFiles.has(entry.name)) files.push(full);
  }
  return files;
}

function fileType(relative) {
  if (relative.endsWith(".mjs")) return "module";
  if (relative === "native.html" || relative === "index.html") return "html";
  if (relative.endsWith(".md") || relative.endsWith(".json") || relative.endsWith(".ps1")) return "text";
  return "asset";
}

const files = (await walk(root))
  .map(full => path.relative(root, full).replaceAll("\\", "/"))
  .sort();

const manifest = {
  format: 2,
  projectId: "a7c3e91d4b2f6805",
  virtualURL,
  source: virtualURL,
  pulledAt: "2026-09-03T00:00:00.000Z",
  entry: "site-entry.mjs",
  html: "native.html",
  requiresWebGPU: true,
  files: files.map(relative => ({
    url: new URL(relative, virtualURL).href,
    path: relative,
    type: fileType(relative),
    bytes: 0,
  })),
  compatibility: {
    rendererCandidates: ["webgpu"],
    canvasOnly: true,
    htmlOverlay: false,
    domRequired: false,
    notes: [
      "Native Runtime launches site-entry.mjs and paints one swapchain image.",
      "Browsers load browser-entry.mjs from index.html after a WebGPU capability check.",
      "RTX lighting is used when navigator.gpu.threeBrowserRTX is present; otherwise the WebGPU raster path remains.",
    ],
  },
};

await writeFile(path.join(root, "threebrowser.pull.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[deserted-island] wrote threebrowser.pull.json with ${files.length} files`);
