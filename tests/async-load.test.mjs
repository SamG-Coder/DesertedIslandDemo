import assert from "node:assert/strict";
import test from "node:test";
import { mapPool, reportProgress, yieldToBrowser } from "../src/async-load.mjs";

test("yieldToBrowser is a no-op on the native host", async () => {
  globalThis.__DESERTED_ISLAND_RUNTIME_MODE__ = "native";
  const started = Date.now();
  await yieldToBrowser();
  assert.ok(Date.now() - started < 50);
});

test("yieldToBrowser resolves without throwing", async () => {
  globalThis.__DESERTED_ISLAND_RUNTIME_MODE__ = "browser";
  await yieldToBrowser();
});

test("reportProgress clamps ratio and yields to the caller", async () => {
  const seen = [];
  await reportProgress(event => seen.push(event), "Textures", 1.4, "2 / 2");
  assert.equal(seen.length, 1);
  assert.equal(seen[0].stage, "Textures");
  assert.equal(seen[0].detail, "2 / 2");
  assert.equal(seen[0].ratio, 1);
});

test("mapPool keeps order with a limited worker count", async () => {
  const values = await mapPool(["a", "b", "c", "d"], 2, async (item, index) => {
    await yieldToBrowser();
    return `${index}:${item}`;
  });
  assert.deepEqual(values, ["0:a", "1:b", "2:c", "3:d"]);
});
