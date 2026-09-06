import { TREASURES } from './treasure-catalog.mjs';
export const MAX_STACK = 255;
export const HOTBAR_SIZE = 9;
export const STORAGE_COLUMNS = 9;
export const STORAGE_ROWS = 3;

export const BUCKET_CAPACITY = 3;
export const CASTLE_SAND_COST = 3;

export const BEACH_ITEMS = Object.freeze({
  ...Object.fromEntries(TREASURES.map(item=>[item.id,Object.freeze({id:item.id,name:item.name,
    maxStack:MAX_STACK,category:'decoration',colors:Object.freeze({top:item.color,left:item.color,right:item.color})})])),
  shovel: Object.freeze({
    id: "shovel",
    name: "Builder's Shovel",
    maxStack: 1,
    category: "tool",
    colors: Object.freeze({ top: "#d7dde4", left: "#8d5b34", right: "#6d4728" }),
  }),
  bucket: Object.freeze({
    id: "bucket",
    name: "Builder's Bucket",
    maxStack: 1,
    category: "tool",
    colors: Object.freeze({ top: "#79b9bc", left: "#43868c", right: "#305f68" }),
  }),
  "dry-sand": Object.freeze({
    id: "dry-sand",
    name: "Dry Sand",
    maxStack: MAX_STACK,
    category: "block",
    colors: Object.freeze({ top: "#e4c48c", left: "#c9a66c", right: "#a98552" }),
  }),
  "wet-sand": Object.freeze({
    id: "wet-sand",
    name: "Wet Sand",
    maxStack: MAX_STACK,
    category: "block",
    colors: Object.freeze({ top: "#9b734c", left: "#7a5738", right: "#5a3f28" }),
  }),
  rock: Object.freeze({
    id: "rock",
    name: "Coastal Rock",
    maxStack: MAX_STACK,
    category: "block",
    colors: Object.freeze({ top: "#8d8a84", left: "#6c6964", right: "#4c4a46" }),
  }),
  "palm-wood": Object.freeze({
    id: "palm-wood",
    name: "Palm Wood",
    maxStack: MAX_STACK,
    category: "block",
    colors: Object.freeze({ top: "#c4a06a", left: "#8a5a32", right: "#5c3a20" }),
  }),
});

export function emptySlot() {
  return { itemId: null, count: 0, fill: 0, fillItemId: null };
}

export function cloneSlot(slot) {
  if (!slot?.itemId || slot.count <= 0) return emptySlot();
  const cloned = { itemId: slot.itemId, count: slot.count, fill: 0, fillItemId: null };
  if (slot.itemId === "bucket") {
    cloned.fill = Math.max(0, Math.trunc(slot.fill) || 0);
    cloned.fillItemId = slot.fillItemId ?? null;
  }
  return cloned;
}

export function isEmptySlot(slot) {
  return !slot?.itemId || slot.count <= 0;
}

export function getItem(itemId, catalog = BEACH_ITEMS) {
  return catalog[itemId] ?? null;
}

export function stackLimit(itemId, catalog = BEACH_ITEMS, maxStack = MAX_STACK) {
  const item = getItem(itemId, catalog);
  if (!item) return 0;
  return Math.max(1, Math.min(item.maxStack ?? maxStack, maxStack));
}

export function harvestItemId({ kind, surface } = {}) {
  if (kind === "rock") return "rock";
  if (kind === "palm" || kind === "wood") return "palm-wood";
  if (kind && kind !== "terrain") return null;
  if (surface === "dry-sand") return "dry-sand";
  if (surface === "wet-sand" || surface === "shallow-water") return "wet-sand";
  return null;
}

export function isSandItemId(itemId) {
  return itemId === "dry-sand" || itemId === "wet-sand";
}

export function dumpableSandId(inventory) {
  const selected = inventory?.selectedItemId?.();
  if (isSandItemId(selected)) return selected;
  if (inventory?.findItem?.("dry-sand") >= 0) return "dry-sand";
  if (inventory?.findItem?.("wet-sand") >= 0) return "wet-sand";
  return null;
}

export function hotbarIndexFromCode(code) {
  const value = String(code || "");
  const digit = value.startsWith("Digit") ? Number(value.slice(5))
    : value.startsWith("Numpad") ? Number(value.slice(6))
    : NaN;
  if (!Number.isInteger(digit) || digit < 1 || digit > HOTBAR_SIZE) return -1;
  return digit - 1;
}

function makeSlots(count) {
  return Array.from({ length: count }, emptySlot);
}

function clearSlot(slot) {
  slot.itemId = null;
  slot.count = 0;
  slot.fill = 0;
  slot.fillItemId = null;
  return slot;
}

function writeSlot(slot, itemId, count, extra = null) {
  if (!itemId || count <= 0) return clearSlot(slot);
  slot.itemId = itemId;
  slot.count = count;
  if (itemId === "bucket") {
    slot.fill = Math.max(0, Math.trunc(extra?.fill ?? slot.fill ?? 0));
    slot.fillItemId = extra?.fillItemId ?? slot.fillItemId ?? null;
  } else {
    slot.fill = 0;
    slot.fillItemId = null;
  }
  return slot;
}

export function createInventory({
  catalog = BEACH_ITEMS,
  storageColumns = STORAGE_COLUMNS,
  storageRows = STORAGE_ROWS,
  hotbarSize = HOTBAR_SIZE,
  maxStack = MAX_STACK,
  onChange = null,
} = {}) {
  const columns = Math.max(1, Math.trunc(storageColumns));
  const rows = Math.max(1, Math.trunc(storageRows));
  const bar = Math.max(1, Math.trunc(hotbarSize));
  const storageSize = columns * rows;
  const size = storageSize + bar;
  const slots = makeSlots(size);
  const cursor = emptySlot();
  let selectedHotbar = 0;
  let revision = 1;
  let dragOrigin = -1;

  function notify() {
    revision += 1;
    onChange?.(revision);
    return revision;
  }

  function itemCap(itemId) {
    return stackLimit(itemId, catalog, maxStack);
  }

  function hotbarIndex(offset) {
    return storageSize + offset;
  }

  function inRange(index) {
    return Number.isInteger(index) && index >= 0 && index < size;
  }

  function fillExisting(itemId, remaining, indices) {
    const cap = itemCap(itemId);
    for (const index of indices) {
      if (remaining <= 0) break;
      const slot = slots[index];
      if (slot.itemId !== itemId || slot.count >= cap) continue;
      const moved = Math.min(cap - slot.count, remaining);
      slot.count += moved;
      remaining -= moved;
    }
    return remaining;
  }

  function fillEmpty(itemId, remaining, indices) {
    const cap = itemCap(itemId);
    for (const index of indices) {
      if (remaining <= 0) break;
      if (!isEmptySlot(slots[index])) continue;
      const moved = Math.min(cap, remaining);
      writeSlot(slots[index], itemId, moved);
      remaining -= moved;
    }
    return remaining;
  }

  function hotbarThenStorage() {
    const indices = [];
    for (let index = 0; index < bar; index += 1) indices.push(hotbarIndex(index));
    for (let index = 0; index < storageSize; index += 1) indices.push(index);
    return indices;
  }

  function storageThenHotbar() {
    const indices = [];
    for (let index = 0; index < storageSize; index += 1) indices.push(index);
    for (let index = 0; index < bar; index += 1) indices.push(hotbarIndex(index));
    return indices;
  }

  function allIndices() {
    return Array.from({ length: size }, (_, index) => index);
  }

  const inventory = {
    get catalog() {
      return catalog;
    },
    get storageSize() {
      return storageSize;
    },
    get storageColumns() {
      return columns;
    },
    get storageRows() {
      return rows;
    },
    get hotbarSize() {
      return bar;
    },
    get size() {
      return size;
    },
    get maxStack() {
      return maxStack;
    },
    get slots() {
      return slots;
    },
    get cursor() {
      return cursor;
    },
    get selectedHotbar() {
      return selectedHotbar;
    },
    get revision() {
      return revision;
    },
    get dragOrigin() {
      return dragOrigin;
    },
    slot(index) {
      return inRange(index) ? slots[index] : emptySlot();
    },
    isHotbar(index) {
      return index >= storageSize && index < size;
    },
    isStorage(index) {
      return index >= 0 && index < storageSize;
    },
    selectedIndex() {
      return hotbarIndex(selectedHotbar);
    },
    selectedSlot() {
      return cloneSlot(slots[hotbarIndex(selectedHotbar)]);
    },
    selectedItemId() {
      const slot = slots[hotbarIndex(selectedHotbar)];
      return isEmptySlot(slot) ? null : slot.itemId;
    },
    selectHotbar(offset) {
      if (!Number.isInteger(offset) || offset < 0 || offset >= bar) return selectedHotbar;
      if (selectedHotbar === offset) return selectedHotbar;
      selectedHotbar = offset;
      notify();
      return selectedHotbar;
    },
    findItem(itemId) {
      if (!itemId) return -1;
      for (let index = 0; index < size; index += 1) {
        if (slots[index].itemId === itemId) return index;
      }
      return -1;
    },
    canAdd(itemId, count = 1) {
      if (!getItem(itemId, catalog)) return false;
      const cap = itemCap(itemId);
      let remaining = Math.max(0, Math.trunc(count));
      for (const index of allIndices()) {
        const slot = slots[index];
        if (isEmptySlot(slot)) remaining -= cap;
        else if (slot.itemId === itemId) remaining -= Math.max(0, cap - slot.count);
        if (remaining <= 0) return true;
      }
      return remaining <= 0;
    },
    add(itemId, count = 1, { preferSelected = false } = {}) {
      if (!getItem(itemId, catalog)) return Math.max(0, Math.trunc(count));
      const requested = Math.max(0, Math.trunc(count));
      let remaining = requested;
      if (remaining <= 0) return 0;
      const order = hotbarThenStorage();
      if (preferSelected) {
        const selected = hotbarIndex(selectedHotbar);
        remaining = fillExisting(itemId, remaining, [selected]);
        remaining = fillEmpty(itemId, remaining, [selected]);
      }
      remaining = fillExisting(itemId, remaining, order);
      remaining = fillEmpty(itemId, remaining, order);
      if (remaining !== requested) notify();
      return remaining;
    },
    remove(itemId, count = 1) {
      let remaining = Math.max(0, Math.trunc(count));
      if (!itemId || remaining <= 0) return 0;
      const order = [hotbarIndex(selectedHotbar), ...hotbarThenStorage()];
      const seen = new Set();
      let taken = 0;
      for (const index of order) {
        if (seen.has(index)) continue;
        seen.add(index);
        const slot = slots[index];
        if (slot.itemId !== itemId) continue;
        const moved = Math.min(slot.count, remaining);
        slot.count -= moved;
        remaining -= moved;
        taken += moved;
        if (slot.count <= 0) clearSlot(slot);
        if (remaining <= 0) break;
      }
      if (taken > 0) notify();
      return taken;
    },
    takeFromSlot(index, count = Infinity) {
      if (!inRange(index) || isEmptySlot(slots[index])) return emptySlot();
      const taken = Math.min(slots[index].count, Math.max(0, Math.trunc(count)));
      if (taken <= 0) return emptySlot();
      const result = cloneSlot({ ...slots[index], count: taken });
      slots[index].count -= taken;
      if (slots[index].count <= 0) clearSlot(slots[index]);
      notify();
      return result;
    },
    pickupFromSlot(index, { half = false } = {}) {
      if (!inRange(index) || isEmptySlot(slots[index])) return false;
      if (!isEmptySlot(cursor)) return false;
      const amount = half ? Math.max(1, Math.ceil(slots[index].count / 2)) : slots[index].count;
      const taken = inventory.takeFromSlot(index, amount);
      writeSlot(cursor, taken.itemId, taken.count, taken);
      dragOrigin = index;
      notify();
      return true;
    },
    setToolData(index, { fill = 0, fillItemId = null } = {}) {
      if (!inRange(index) || slots[index].itemId !== "bucket") return false;
      slots[index].fill = Math.max(0, Math.min(BUCKET_CAPACITY, Math.trunc(fill) || 0));
      slots[index].fillItemId = slots[index].fill > 0 && isSandItemId(fillItemId) ? fillItemId : null;
      notify();
      return true;
    },
    dropCursorOn(index, { one = false } = {}) {
      if (isEmptySlot(cursor)) return false;
      if (!inRange(index)) return false;
      const slot = slots[index];
      const cap = itemCap(cursor.itemId);
      if (isEmptySlot(slot)) {
        const moved = one ? 1 : cursor.count;
        writeSlot(slot, cursor.itemId, moved, cursor);
        cursor.count -= moved;
        if (cursor.count <= 0) {
          clearSlot(cursor);
          dragOrigin = -1;
        }
        notify();
        return true;
      }
      if (slot.itemId === cursor.itemId) {
        const moved = Math.min(cap - slot.count, one ? 1 : cursor.count);
        if (moved <= 0) return false;
        slot.count += moved;
        cursor.count -= moved;
        if (cursor.count <= 0) {
          clearSlot(cursor);
          dragOrigin = -1;
        }
        notify();
        return true;
      }
      if (one) return false;
      const held = cloneSlot(cursor);
      const parked = cloneSlot(slot);
      writeSlot(cursor, parked.itemId, parked.count, parked);
      writeSlot(slot, held.itemId, held.count, held);
      dragOrigin = index;
      notify();
      return true;
    },
    transfer(index) {
      if (!inRange(index) || isEmptySlot(slots[index])) return false;
      const moving = cloneSlot(slots[index]);
      const targets = inventory.isHotbar(index) ? storageThenHotbar() : hotbarThenStorage();
      const filtered = targets.filter(target => target !== index);
      clearSlot(slots[index]);
      let remaining = fillExisting(moving.itemId, moving.count, filtered);
      remaining = fillEmpty(moving.itemId, remaining, filtered);
      if (remaining > 0) writeSlot(slots[index], moving.itemId, remaining, moving);
      else if (moving.itemId === "bucket") {
        const dest = inventory.findItem("bucket");
        if (dest >= 0) {
          slots[dest].fill = moving.fill;
          slots[dest].fillItemId = moving.fillItemId;
        }
      }
      notify();
      return remaining < moving.count;
    },
    parkCursor() {
      if (isEmptySlot(cursor)) return 0;
      const moving = cloneSlot(cursor);
      clearSlot(cursor);
      let remaining = moving.count;
      if (inRange(dragOrigin) && isEmptySlot(slots[dragOrigin])) {
        remaining = fillEmpty(moving.itemId, remaining, [dragOrigin]);
      }
      remaining = inventory.add(moving.itemId, remaining);
      if (remaining > 0 && inRange(dragOrigin)) {
        const slot = slots[dragOrigin];
        if (isEmptySlot(slot) || slot.itemId === moving.itemId) {
          const cap = itemCap(moving.itemId);
          const already = isEmptySlot(slot) ? 0 : slot.count;
          const moved = Math.min(Math.max(0, cap - already), remaining);
          writeSlot(slot, moving.itemId, already + moved, moving);
          remaining -= moved;
        }
      }
      if (moving.itemId === "bucket" && remaining === 0) {
        const dest = inventory.findItem("bucket");
        if (dest >= 0) {
          slots[dest].fill = moving.fill;
          slots[dest].fillItemId = moving.fillItemId;
        }
      }
      if (remaining > 0) writeSlot(cursor, moving.itemId, remaining, moving);
      else dragOrigin = -1;
      notify();
      return remaining;
    },
    snapshot() {
      return {
        selectedHotbar,
        slots: slots.map(cloneSlot),
        cursor: cloneSlot(cursor),
      };
    },
  };

  return inventory;
}
