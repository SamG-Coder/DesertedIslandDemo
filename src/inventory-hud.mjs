import * as THREE from "three/webgpu";
import {
  BEACH_ITEMS,
  getItem,
  isEmptySlot,
} from "./inventory-system.mjs";

const SLOT = 56;
const GAP = 5;
const PANEL_PAD_X = 18;
const PANEL_PAD_TOP = 44;
const PANEL_PAD_BOTTOM = 16;
const SECTION_GAP = 16;
const HOTBAR_MARGIN = 20;
const PANEL_RADIUS = 18;

export const INVENTORY_THEME = Object.freeze({
  overlay: "rgba(5, 9, 14, 0.58)",
  panel: "rgba(18, 28, 36, 0.94)",
  panelEdge: "rgba(232, 205, 150, 0.42)",
  panelInner: "rgba(255, 255, 255, 0.06)",
  slot: "rgba(7, 12, 16, 0.82)",
  slotHover: "rgba(28, 46, 58, 0.92)",
  bevelLight: "rgba(255, 255, 255, 0.22)",
  bevelDark: "rgba(0, 0, 0, 0.58)",
  selected: "#f2d48a",
  text: "#eef3f7",
  muted: "rgba(214, 226, 232, 0.62)",
  count: "#fff6df",
  title: "#f4e6c4",
});

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function strokeBevel(ctx, x, y, size) {
  ctx.lineWidth = 1;
  ctx.strokeStyle = INVENTORY_THEME.bevelLight;
  ctx.beginPath();
  ctx.moveTo(x + 1, y + size - 1);
  ctx.lineTo(x + 1, y + 1);
  ctx.lineTo(x + size - 1, y + 1);
  ctx.stroke();
  ctx.strokeStyle = INVENTORY_THEME.bevelDark;
  ctx.beginPath();
  ctx.moveTo(x + size - 1, y + 1);
  ctx.lineTo(x + size - 1, y + size - 1);
  ctx.lineTo(x + 1, y + size - 1);
  ctx.stroke();
}

function gridWidth(columns, slot, gap) {
  return columns * slot + Math.max(0, columns - 1) * gap;
}

function gridHeight(rows, slot, gap) {
  return rows * slot + Math.max(0, rows - 1) * gap;
}

function mapSlots(originX, originY, columns, count, slot, gap, indexOf) {
  const rects = [];
  for (let offset = 0; offset < count; offset += 1) {
    const column = offset % columns;
    const row = Math.floor(offset / columns);
    rects.push({
      index: indexOf(offset),
      x: originX + column * (slot + gap),
      y: originY + row * (slot + gap),
      size: slot,
    });
  }
  return rects;
}

export function layoutInventoryHud(width, height, inventory, { open = false } = {}) {
  const columns = inventory.storageColumns;
  const storageRows = inventory.storageRows;
  const hotbarSize = inventory.hotbarSize;
  const naturalWidth = gridWidth(Math.max(columns, hotbarSize), SLOT, GAP) + PANEL_PAD_X * 2;
  const scale = Math.min(1.25, Math.max(0.68, (width * 0.58) / naturalWidth));
  const slot = SLOT * scale;
  const gap = GAP * scale;
  const padX = PANEL_PAD_X * scale;
  const padTop = PANEL_PAD_TOP * scale;
  const padBottom = PANEL_PAD_BOTTOM * scale;
  const sectionGap = SECTION_GAP * scale;
  const hotbarWidth = gridWidth(hotbarSize, slot, gap);
  const storageWidth = gridWidth(columns, slot, gap);
  const storageHeight = gridHeight(storageRows, slot, gap);
  const panelWidth = Math.max(storageWidth, hotbarWidth) + padX * 2;
  const panelHeight = padTop + storageHeight + sectionGap + slot + padBottom;
  const panelX = (width - panelWidth) / 2;
  const panelY = (height - panelHeight) / 2 - height * 0.02;
  const storageX = panelX + (panelWidth - storageWidth) / 2;
  const storageY = panelY + padTop;
  const panelHotbarX = panelX + (panelWidth - hotbarWidth) / 2;
  const panelHotbarY = storageY + storageHeight + sectionGap;
  const hudHotbarX = (width - hotbarWidth) / 2;
  const hudHotbarY = height - slot - HOTBAR_MARGIN * scale;

  const storage = open
    ? mapSlots(storageX, storageY, columns, inventory.storageSize, slot, gap, offset => offset)
    : [];
  const hotbarOriginX = open ? panelHotbarX : hudHotbarX;
  const hotbarOriginY = open ? panelHotbarY : hudHotbarY;
  const hotbar = mapSlots(
    hotbarOriginX,
    hotbarOriginY,
    hotbarSize,
    hotbarSize,
    slot,
    gap,
    offset => inventory.storageSize + offset,
  );

  return {
    width,
    height,
    scale,
    slot,
    gap,
    open,
    panel: open
      ? { x: panelX, y: panelY, width: panelWidth, height: panelHeight, radius: PANEL_RADIUS * scale }
      : null,
    storage,
    hotbar,
    slots: [...storage, ...hotbar],
    title: open
      ? { x: panelX + padX, y: panelY + 16 * scale, text: "Inventory" }
      : null,
    captionY: hudHotbarY - 18 * scale,
  };
}

export function hitTestHudSlot(layout, x, y) {
  for (const rect of layout.slots) {
    if (x >= rect.x && y >= rect.y && x < rect.x + rect.size && y < rect.y + rect.size) {
      return rect;
    }
  }
  return null;
}

export function pointerToHud(event, element, cssWidth, cssHeight) {
  const rect = element.getBoundingClientRect?.() ?? { left: 0, top: 0, width: cssWidth, height: cssHeight };
  const width = rect.width || cssWidth || 1;
  const height = rect.height || cssHeight || 1;
  const clientX = Number.isFinite(event.clientX) ? event.clientX : (rect.left + (event.offsetX || 0));
  const clientY = Number.isFinite(event.clientY) ? event.clientY : (rect.top + (event.offsetY || 0));
  return {
    x: (clientX - rect.left) * (cssWidth / width),
    y: (clientY - rect.top) * (cssHeight / height),
  };
}

function paintShovel(ctx, x, y, size) {
  const s = size;
  ctx.save();
  ctx.translate(x + s / 2, y + s / 2);
  ctx.rotate(-0.62);
  ctx.fillStyle = "#7a4e2c";
  ctx.fillRect(-s * 0.045, -s * 0.08, s * 0.09, s * 0.42);
  ctx.fillStyle = "#c9d0d8";
  ctx.beginPath();
  ctx.moveTo(-s * 0.18, -s * 0.08);
  ctx.lineTo(s * 0.18, -s * 0.08);
  ctx.lineTo(s * 0.14, -s * 0.38);
  ctx.lineTo(-s * 0.14, -s * 0.38);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#9aa3ad";
  ctx.lineWidth = Math.max(1, s * 0.02);
  ctx.stroke();
  ctx.strokeStyle = "#5b3a24";
  ctx.lineWidth = Math.max(2, s * 0.055);
  ctx.beginPath();
  ctx.arc(0, s * 0.34, s * 0.09, Math.PI * 0.15, Math.PI * 1.85);
  ctx.stroke();
  ctx.restore();
}

function paintIsoCube(ctx, x, y, size, colors, image) {
  const w = size * 0.36;
  const h = size * 0.21;
  const depth = size * 0.28;
  const cx = x + size / 2;
  const cy = y + size * 0.42;

  function topPath() {
    ctx.beginPath();
    ctx.moveTo(cx, cy - h);
    ctx.lineTo(cx + w, cy);
    ctx.lineTo(cx, cy + h);
    ctx.lineTo(cx - w, cy);
    ctx.closePath();
  }

  function leftPath() {
    ctx.beginPath();
    ctx.moveTo(cx - w, cy);
    ctx.lineTo(cx, cy + h);
    ctx.lineTo(cx, cy + h + depth);
    ctx.lineTo(cx - w, cy + depth);
    ctx.closePath();
  }

  function rightPath() {
    ctx.beginPath();
    ctx.moveTo(cx + w, cy);
    ctx.lineTo(cx, cy + h);
    ctx.lineTo(cx, cy + h + depth);
    ctx.lineTo(cx + w, cy + depth);
    ctx.closePath();
  }

  function fillFace(path, color, shade) {
    path();
    ctx.fillStyle = color;
    ctx.fill();
    if (image) {
      ctx.save();
      path();
      ctx.clip();
      ctx.globalAlpha = 0.78;
      const bounds = { x: cx - w, y: cy - h, w: w * 2, h: h * 2 + depth };
      ctx.drawImage(image, 0, 0, image.width || 64, image.height || 64, bounds.x, bounds.y, bounds.w, bounds.h);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    path();
    ctx.fillStyle = shade;
    ctx.fill();
  }

  fillFace(topPath, colors.top, "rgba(255,255,255,0.08)");
  fillFace(leftPath, colors.left, "rgba(0,0,0,0.18)");
  fillFace(rightPath, colors.right, "rgba(0,0,0,0.28)");
}

function paintCount(ctx, rect, count, scale) {
  if (count <= 1) return;
  const text = String(count);
  const fontSize = Math.max(10, Math.round(13 * scale));
  ctx.font = `700 ${fontSize}px "Segoe UI", "Helvetica Neue", sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  const x = rect.x + rect.size - 5 * scale;
  const y = rect.y + rect.size - 5 * scale;
  ctx.lineWidth = Math.max(2, 3 * scale);
  ctx.strokeStyle = "rgba(0,0,0,0.72)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = INVENTORY_THEME.count;
  ctx.fillText(text, x, y);
}

function paintKey(ctx, rect, key, scale) {
  ctx.font = `600 ${Math.max(8, Math.round(10 * scale))}px "Segoe UI", "Helvetica Neue", sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = INVENTORY_THEME.muted;
  ctx.fillText(String(key), rect.x + 4 * scale, rect.y + 3 * scale);
}

function imageFromTexture(texture) {
  return texture?.image ?? texture?.source?.data ?? null;
}

export function createInventoryHud({
  inventory,
  icons = {},
  catalog = inventory.catalog ?? BEACH_ITEMS,
} = {}) {
  if (!inventory) throw new Error("createInventoryHud requires an inventory.");
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { alpha: true });
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = "Inventory HUD";
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.premultiplyAlpha = false;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  let cssWidth = 1;
  let cssHeight = 1;
  let open = false;
  let dirty = true;
  let hoverIndex = -1;
  let lastHover = -1;
  let pointer = { x: 0, y: 0, down: false };
  let downIndex = -1;
  let dragging = false;
  let layout = layoutInventoryHud(1, 1, inventory, { open });
  let lastRevision = -1;
  let lastSelected = -1;

  function markDirty() {
    dirty = true;
  }

  function itemImage(itemId) {
    return imageFromTexture(icons[itemId]) ?? icons[itemId] ?? null;
  }

  function paintItem(rect, slot, { ghost = false } = {}) {
    if (isEmptySlot(slot)) return;
    const item = getItem(slot.itemId, catalog);
    if (!item) return;
    ctx.save();
    if (ghost) ctx.globalAlpha = 0.88;
    const inset = rect.size * 0.08;
    if (item.category === "tool") paintShovel(ctx, rect.x + inset, rect.y + inset, rect.size - inset * 2);
    else {
      paintIsoCube(
        ctx,
        rect.x + inset,
        rect.y + inset,
        rect.size - inset * 2,
        item.colors,
        itemImage(item.id),
      );
    }
    ctx.restore();
    paintCount(ctx, rect, slot.count, layout.scale);
  }

  function paintSlot(rect, { selected = false, hover = false, showKey = false } = {}) {
    ctx.fillStyle = hover ? INVENTORY_THEME.slotHover : INVENTORY_THEME.slot;
    ctx.fillRect(rect.x, rect.y, rect.size, rect.size);
    strokeBevel(ctx, rect.x, rect.y, rect.size);
    if (selected) {
      ctx.strokeStyle = INVENTORY_THEME.selected;
      ctx.lineWidth = Math.max(2, 2.4 * layout.scale);
      ctx.strokeRect(rect.x + 1.5, rect.y + 1.5, rect.size - 3, rect.size - 3);
    }
    const slot = inventory.slot(rect.index);
    paintItem(rect, slot);
    if (showKey) paintKey(ctx, rect, rect.index - inventory.storageSize + 1, layout.scale);
  }

  function paintPanel() {
    const panel = layout.panel;
    ctx.fillStyle = INVENTORY_THEME.overlay;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.save();
    roundRect(ctx, panel.x, panel.y, panel.width, panel.height, panel.radius);
    ctx.fillStyle = INVENTORY_THEME.panel;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, 2 * layout.scale);
    ctx.strokeStyle = INVENTORY_THEME.panelEdge;
    ctx.stroke();
    roundRect(ctx, panel.x + 6, panel.y + 6, panel.width - 12, panel.height - 12, panel.radius - 6);
    ctx.strokeStyle = INVENTORY_THEME.panelInner;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    ctx.font = `700 ${Math.max(13, Math.round(18 * layout.scale))}px "Segoe UI", "Helvetica Neue", sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = INVENTORY_THEME.title;
    ctx.fillText(layout.title.text, layout.title.x, layout.title.y);
    ctx.font = `500 ${Math.max(10, Math.round(12 * layout.scale))}px "Segoe UI", "Helvetica Neue", sans-serif`;
    ctx.fillStyle = INVENTORY_THEME.muted;
    ctx.fillText("Drag stacks between storage and the hotbar", layout.title.x, layout.title.y + 20 * layout.scale);
  }

  function hoveredName() {
    if (hoverIndex >= 0) {
      const slot = inventory.slot(hoverIndex);
      if (!isEmptySlot(slot)) return getItem(slot.itemId, catalog)?.name ?? "";
    }
    if (!isEmptySlot(inventory.cursor)) {
      return getItem(inventory.cursor.itemId, catalog)?.name ?? "";
    }
    const selected = inventory.selectedSlot();
    if (!isEmptySlot(selected)) return getItem(selected.itemId, catalog)?.name ?? "";
    return "";
  }

  function paintCaption(text, cx, cy) {
    if (!text) return;
    ctx.font = `600 ${Math.max(11, Math.round(13 * layout.scale))}px "Segoe UI", "Helvetica Neue", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const width = ctx.measureText(text).width + 18 * layout.scale;
    const height = 22 * layout.scale;
    const x = Math.min(cssWidth - width - 8, Math.max(8, cx - width / 2));
    const y = Math.min(cssHeight - height - 8, Math.max(8, cy - height / 2));
    ctx.fillStyle = "rgba(6, 10, 14, 0.62)";
    roundRect(ctx, x, y, width, height, 8);
    ctx.fill();
    ctx.fillStyle = INVENTORY_THEME.text;
    ctx.fillText(text, x + width / 2, y + height / 2);
  }

  function draw() {
    layout = layoutInventoryHud(cssWidth, cssHeight, inventory, { open });
    ctx.setTransform(canvas.width / cssWidth, 0, 0, canvas.height / cssHeight, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    if (open) paintPanel();
    else if (layout.hotbar.length > 0) {
      const first = layout.hotbar[0];
      const last = layout.hotbar[layout.hotbar.length - 1];
      const pad = 8 * layout.scale;
      roundRect(
        ctx,
        first.x - pad,
        first.y - pad,
        last.x + last.size - first.x + pad * 2,
        first.size + pad * 2,
        12 * layout.scale,
      );
      ctx.fillStyle = "rgba(8, 12, 16, 0.55)";
      ctx.fill();
      ctx.strokeStyle = "rgba(232, 205, 150, 0.22)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    for (const rect of layout.storage) {
      paintSlot(rect, { hover: hoverIndex === rect.index });
    }
    for (const rect of layout.hotbar) {
      paintSlot(rect, {
        selected: rect.index === inventory.selectedIndex(),
        hover: hoverIndex === rect.index,
        showKey: !open,
      });
    }
    if (!open) paintCaption(hoveredName(), cssWidth / 2, layout.captionY);
    else if (hoverIndex >= 0 && isEmptySlot(inventory.cursor)) {
      paintCaption(hoveredName(), pointer.x, pointer.y - 22 * layout.scale);
    }
    if (!isEmptySlot(inventory.cursor)) {
      const held = {
        x: pointer.x - layout.slot * 0.42,
        y: pointer.y - layout.slot * 0.42,
        size: layout.slot,
        index: -1,
      };
      paintItem(held, inventory.cursor, { ghost: true });
    }
    lastRevision = inventory.revision;
    lastSelected = inventory.selectedHotbar;
    dirty = false;
    texture.needsUpdate = true;
  }

  function sync() {
    if (
      dirty
      || inventory.revision !== lastRevision
      || inventory.selectedHotbar !== lastSelected
    ) draw();
  }

  function setOpen(next) {
    const value = Boolean(next);
    if (open === value) return open;
    open = value;
    hoverIndex = -1;
    dragging = false;
    pointer.down = false;
    downIndex = -1;
    if (!open) inventory.parkCursor();
    markDirty();
    return open;
  }

  function consumeSlotAction(event, rect) {
    const shift = Boolean(event.shiftKey);
    const right = event.button === 2;
    if (shift && rect) {
      inventory.parkCursor();
      inventory.transfer(rect.index);
      return true;
    }
    if (!rect) {
      if (event.type === "pointerdown" && event.button === 0 && !isEmptySlot(inventory.cursor)) {
        inventory.parkCursor();
        return true;
      }
      return false;
    }
    if (event.type !== "pointerdown") return false;
    if (event.button !== 0 && event.button !== 2) return false;
    if (isEmptySlot(inventory.cursor)) {
      inventory.pickupFromSlot(rect.index, { half: right });
    } else {
      inventory.dropCursorOn(rect.index, { one: right });
    }
    return true;
  }

  const hud = {
    canvas,
    texture,
    get open() {
      return open;
    },
    get layout() {
      return layout;
    },
    get hoverIndex() {
      return hoverIndex;
    },
    markDirty,
    resize(width, height, pixelRatio = 1) {
      cssWidth = Math.max(1, Math.round(width));
      cssHeight = Math.max(1, Math.round(height));
      const dpr = Math.max(1, Number(pixelRatio) || 1);
      const nextWidth = Math.max(1, Math.round(cssWidth * dpr));
      const nextHeight = Math.max(1, Math.round(cssHeight * dpr));
      if (canvas.width !== nextWidth) canvas.width = nextWidth;
      if (canvas.height !== nextHeight) canvas.height = nextHeight;
      markDirty();
    },
    setOpen,
    toggle() {
      return setOpen(!open);
    },
    handlePointer(event, element, { pointerLocked = false } = {}) {
      if (pointerLocked && !open) return { handled: false, slotIndex: -1 };
      const point = pointerToHud(event, element, cssWidth, cssHeight);
      pointer.x = point.x;
      pointer.y = point.y;
      layout = layoutInventoryHud(cssWidth, cssHeight, inventory, { open });
      const rect = hitTestHudSlot(layout, point.x, point.y);
      hoverIndex = rect?.index ?? -1;
      if (hoverIndex !== lastHover) {
        lastHover = hoverIndex;
        markDirty();
      }
      if (open) markDirty();

      if (event.type === "pointerdown") {
        pointer.down = true;
        downIndex = hoverIndex;
        dragging = false;
        if (open) {
          consumeSlotAction(event, rect);
          markDirty();
          return { handled: true, slotIndex: hoverIndex };
        }
        if (rect && inventory.isHotbar(rect.index) && event.button === 0) {
          inventory.selectHotbar(rect.index - inventory.storageSize);
          markDirty();
          return { handled: true, slotIndex: hoverIndex };
        }
        return { handled: false, slotIndex: hoverIndex };
      }

      if (event.type === "pointermove") {
        if (open && pointer.down && !isEmptySlot(inventory.cursor) && hoverIndex !== downIndex) {
          dragging = true;
        }
        if (open || !isEmptySlot(inventory.cursor)) markDirty();
        return { handled: open, slotIndex: hoverIndex };
      }

      if (event.type === "pointerup" || event.type === "pointercancel") {
        const wasDragging = dragging;
        pointer.down = false;
        dragging = false;
        if (open && wasDragging && rect && rect.index !== downIndex && !isEmptySlot(inventory.cursor)) {
          inventory.dropCursorOn(rect.index);
          markDirty();
        }
        downIndex = -1;
        return { handled: open, slotIndex: hoverIndex };
      }

      return { handled: open, slotIndex: hoverIndex };
    },
    sync,
    dispose() {
      texture.dispose();
    },
  };

  return hud;
}
