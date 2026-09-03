import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");

assert.ok((await stat(path.join(dist, "index.html"))).isFile(), "dist/index.html");
assert.ok((await stat(path.join(dist, ".nojekyll"))).isFile(), "dist/.nojekyll");

const html = await readFile(path.join(dist, "index.html"), "utf8");
assert.match(html, /Deserted Island/);
assert.match(html, /<script type="module"/);
assert.doesNotMatch(html, /node_modules\/three/);

const assets = await readdir(path.join(dist, "assets"));
assert.ok(assets.some(name => name.endsWith(".js")), "bundled javascript");
assert.ok(assets.some(name => name.endsWith(".glb")), "island models");
assert.ok(assets.some(name => name.endsWith(".png")), "island textures");
assert.ok(assets.some(name => name.endsWith(".wav")), "footstep audio");
console.log("[deserted-island] pages build looks complete");
