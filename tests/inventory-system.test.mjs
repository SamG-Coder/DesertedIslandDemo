import assert from "node:assert/strict";
import test from "node:test";
import {
  BUCKET_CAPACITY,
  HOTBAR_SIZE,
  MAX_STACK,
  createInventory,
  dumpableSandId,
  harvestItemId,
  hotbarIndexFromCode,
} from "../src/inventory-system.mjs";
import {
  cssRectToPixelRect,
  hudAtlasBounds,
  layoutInventoryHud as layoutHud,
  mergeDirtyRects,
} from "../src/inventory-hud.mjs";

test("harvested sand and rock map to stackable inventory items", () => {
  assert.equal(harvestItemId({ kind: "terrain", surface: "dry-sand" }), "dry-sand");
  assert.equal(harvestItemId({ kind: "terrain", surface: "wet-sand" }), "wet-sand");
  assert.equal(harvestItemId({ kind: "terrain", surface: "shallow-water" }), "wet-sand");
  assert.equal(harvestItemId({ kind: "rock", surface: "dry-sand" }), "rock");
  assert.equal(harvestItemId({ kind: "wood", surface: "dry-sand" }), null);
  assert.equal(harvestItemId({ kind: "palm" }), null);
});

test("dumping spends selected sand, otherwise the first sand stack", () => {
  const inventory = createInventory();
  assert.equal(dumpableSandId(inventory), null);
  inventory.add("wet-sand", 3);
  inventory.add("dry-sand", 2);
  assert.equal(dumpableSandId(inventory), "wet-sand");
  inventory.selectHotbar(1);
  assert.equal(dumpableSandId(inventory), "dry-sand");
  assert.equal(inventory.remove("dry-sand", 1), 1);
  assert.equal(inventory.selectedSlot().count, 1);
});

test("hotbar keys 1-9 select the focused equipment slot", () => {
  assert.equal(hotbarIndexFromCode("Digit1"), 0);
  assert.equal(hotbarIndexFromCode("Digit8"), 7);
  assert.equal(hotbarIndexFromCode("Digit9"), 8);
  assert.equal(hotbarIndexFromCode("Numpad5"), 4);
  assert.equal(hotbarIndexFromCode("Digit0"), -1);
  assert.equal(HOTBAR_SIZE, 9);
});

test("dug items fill the hotbar first and stack to 255", () => {
  const inventory = createInventory();
  assert.equal(inventory.add("dry-sand", 40), 0);
  assert.equal(inventory.slots[inventory.storageSize].itemId, "dry-sand");
  assert.equal(inventory.slots[inventory.storageSize].count, 40);
  assert.equal(inventory.add("dry-sand", MAX_STACK), 0);
  assert.equal(inventory.slots[inventory.storageSize].count, MAX_STACK);
  assert.equal(inventory.slots[inventory.storageSize + 1].itemId, "dry-sand");
  assert.equal(inventory.slots[inventory.storageSize + 1].count, 40);
  assert.equal(inventory.add("rock", 1), 0);
  assert.equal(inventory.slots[inventory.storageSize + 2].itemId, "rock");
});

test("a full inventory of 255 stacks rejects leftover items", () => {
  const inventory = createInventory();
  for (let index = 0; index < inventory.size; index += 1) {
    assert.equal(inventory.add("wet-sand", MAX_STACK), 0);
  }
  assert.equal(inventory.add("wet-sand", 3), 3);
  assert.equal(inventory.canAdd("wet-sand", 1), false);
  assert.equal(inventory.canAdd("rock", 1), false);
});

test("dragging a storage stack onto the hotbar merges or swaps like Minecraft", () => {
  const inventory = createInventory();
  inventory.add("dry-sand", 10);
  inventory.add("rock", 4);
  const hotbar0 = inventory.storageSize;
  const hotbar1 = inventory.storageSize + 1;

  assert.equal(inventory.pickupFromSlot(hotbar0), true);
  assert.equal(inventory.cursor.itemId, "dry-sand");
  assert.equal(inventory.dropCursorOn(0), true);
  assert.equal(inventory.slots[0].itemId, "dry-sand");
  assert.equal(inventory.slots[0].count, 10);
  assert.equal(inventory.slots[hotbar0].itemId, null);

  assert.equal(inventory.pickupFromSlot(0), true);
  assert.equal(inventory.dropCursorOn(hotbar1), true);
  assert.equal(inventory.slots[hotbar1].itemId, "dry-sand");
  assert.equal(inventory.cursor.itemId, "rock");
  assert.equal(inventory.dropCursorOn(0), true);
  assert.equal(inventory.slots[0].itemId, "rock");

  assert.equal(inventory.pickupFromSlot(hotbar1, { half: true }), true);
  assert.equal(inventory.cursor.count, 5);
  assert.equal(inventory.slots[hotbar1].count, 5);
  assert.equal(inventory.dropCursorOn(1), true);
  assert.equal(inventory.pickupFromSlot(1), true);
  assert.equal(inventory.dropCursorOn(hotbar1), true);
  assert.equal(inventory.slots[hotbar1].count, 10);
  assert.equal(inventory.cursor.itemId, null);
});

test("shift-click moves a stack between the top storage and the hotbar", () => {
  const inventory = createInventory();
  inventory.add("rock", 12);
  const hotbarIndex = inventory.storageSize;
  assert.equal(inventory.transfer(hotbarIndex), true);
  assert.equal(inventory.slots[0].itemId, "rock");
  assert.equal(inventory.slots[0].count, 12);
  assert.equal(inventory.slots[hotbarIndex].itemId, null);
  assert.equal(inventory.transfer(0), true);
  assert.equal(inventory.slots[hotbarIndex].itemId, "rock");
  assert.equal(inventory.slots[0].itemId, null);
});

test("selecting a hotbar slot changes the focused equipment", () => {
  const inventory = createInventory();
  inventory.add("shovel", 1, { preferSelected: true });
  inventory.add("dry-sand", 3);
  assert.equal(inventory.selectedItemId(), "shovel");
  inventory.selectHotbar(1);
  assert.equal(inventory.selectedItemId(), "dry-sand");
  inventory.selectHotbar(0);
  assert.equal(inventory.selectedItemId(), "shovel");
});

test("the canvas HUD keeps storage on top and the hotbar along the bottom", () => {
  const inventory = createInventory();
  const closed = layoutHud(1280, 720, inventory, { open: false });
  assert.equal(closed.hotbar.length, 9);
  assert.equal(closed.storage.length, 0);
  assert.equal(closed.hotbar[0].index, inventory.storageSize);
  assert.ok(closed.hotbar[0].y > 720 * 0.7);
  const open = layoutHud(1280, 720, inventory, { open: true });
  assert.equal(open.storage.length, 27);
  assert.equal(open.hotbar.length, 9);
  assert.ok(open.storage[0].y < open.hotbar[0].y);
  assert.equal(open.storage[0].index, 0);
  assert.equal(open.hotbar[8].index, inventory.size - 1);
  assert.ok(open.panel.width > open.storage[8].x - open.storage[0].x);
  const closedAtlas = hudAtlasBounds(closed);
  const openAtlas = hudAtlasBounds(open);
  assert.ok(closedAtlas.width * closedAtlas.height < 1280 * 720 * 0.12);
  assert.ok(openAtlas.width * openAtlas.height < 1280 * 720 * 0.45);
  assert.ok(closedAtlas.y > 720 * 0.65);
});

test("HUD dirty rects merge overlaps and convert to canvas pixels", () => {
  const merged = mergeDirtyRects([
    { x: 10, y: 10, width: 20, height: 20 },
    { x: 20, y: 12, width: 20, height: 20 },
    { x: 200, y: 200, width: 8, height: 8 },
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].x, 10);
  assert.equal(merged[0].width, 30);
  const pixels = cssRectToPixelRect({ x: 100, y: 50, width: 10, height: 10 }, { x: 90, y: 40 }, 2);
  assert.deepEqual(pixels, { x: 20, y: 20, width: 20, height: 20 });
});

test("a placed bucket's fill survives pickup into the hotbar", () => {
  const inventory = createInventory();
  assert.equal(inventory.add("bucket", 1, { preferSelected: true }), 0);
  const hotbar = inventory.selectedIndex();
  assert.equal(inventory.setToolData(hotbar, { fill: 3, fillItemId: "dry-sand" }), true);
  assert.equal(inventory.transfer(hotbar), true);
  assert.equal(inventory.slots[0].itemId, "bucket");
  assert.equal(inventory.slots[0].fill, 3);
  assert.equal(inventory.slots[0].fillItemId, "dry-sand");
  assert.equal(BUCKET_CAPACITY, 8);
});
