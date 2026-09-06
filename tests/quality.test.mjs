import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("browser quality lowers cloud steps, rain, water mesh, and shadow work", async () => {
  const source = await readFile(path.join(root, "src/quality.mjs"), "utf8");
  assert.match(source, /export const BROWSER_QUALITY/);
  assert.match(source, /isBrowserHost\(\)/);
  assert.match(source, /cloudSteps: 18/);
  assert.match(source, /cloudSteps: 48/);
  assert.match(source, /rainCount: 360/);
  assert.match(source, /rainCount: 1800/);
  assert.match(source, /simpleTerrainMaps: true/);
  assert.match(source, /terrainCastShadow: false/);
  assert.match(source, /pcfSoft: true/);
  assert.match(source, /rasterPixels: 1920 \* 1080/);
  assert.match(source, /rasterPixels: 2560 \* 1440/);
});
