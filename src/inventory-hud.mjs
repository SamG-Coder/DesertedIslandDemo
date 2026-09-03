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
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, r);
    return;
  }
  // Native Canvas2D implements arc, not the rounded-rect helpers.
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arc(x + width - r, y + r, r, -Math.PI / 2, 0);
  ctx.lineTo(x + width, y + height - r);
  ctx.arc(x + width - r, y + height - r, r, 0, Math.PI / 2);
  ctx.lineTo(x + r, y + height);
  ctx.arc(x + r, y + height - r, r, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
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

export function inflateRect(rect, pad) {
  const amount = Number(pad) || 0;
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  };
}

export function unionRects(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

function rectsOverlap(a, b, gap = 2) {
  return a.x < b.x + b.width + gap
    && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap
    && a.y + a.height + gap > b.y;
}

export function mergeDirtyRects(rects, gap = 2) {
  const list = [];
  for (const rect of rects) {
    if (!rect || rect.width <= 0 || rect.height <= 0) continue;
    list.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
  }
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        if (!rectsOverlap(list[i], list[j], gap)) continue;
        list[i] = unionRects(list[i], list[j]);
        list.splice(j, 1);
        merged = true;
        break;
      }
      if (merged) break;
    }
  }
  return list;
}

export function cssRectToPixelRect(rect, origin, pixelRatio) {
  const dpr = Math.max(1, Number(pixelRatio) || 1);
  const x = Math.floor((rect.x - origin.x) * dpr);
  const y = Math.floor((rect.y - origin.y) * dpr);
  return {
    x,
    y,
    width: Math.max(1, Math.ceil((rect.x + rect.width - origin.x) * dpr) - x),
    height: Math.max(1, Math.ceil((rect.y + rect.height - origin.y) * dpr) - y),
  };
}

function clampPixelRect(rect, width, height) {
  const x = Math.max(0, Math.min(width, Math.floor(rect.x)));
  const y = Math.max(0, Math.min(height, Math.floor(rect.y)));
  return {
    x,
    y,
    width: Math.max(0, Math.min(width - x, Math.ceil(rect.width))),
    height: Math.max(0, Math.min(height - y, Math.ceil(rect.height))),
  };
}

export function uploadCanvasDirtyRects(renderer, texture, canvas, pixelRects) {
  const device = renderer?.backend?.device;
  const textureGPU = renderer?.backend?.get?.(texture)?.texture;
  if (!device || !textureGPU || !pixelRects?.length) return false;
  let copied = 0;
  for (const raw of pixelRects) {
    const rect = clampPixelRect(raw, canvas.width, canvas.height);
    if (rect.width < 1 || rect.height < 1) continue;
    try {
      device.queue.copyExternalImageToTexture(
        { source: canvas, origin: { x: rect.x, y: rect.y }, flipY: false },
        {
          texture: textureGPU,
          origin: { x: rect.x, y: rect.y, z: 0 },
          premultipliedAlpha: Boolean(texture.premultiplyAlpha),
        },
        { width: rect.width, height: rect.height, depthOrArrayLayers: 1 },
      );
      copied += 1;
    } catch {
      return false;
    }
  }
  return copied > 0;
}

export function hudAtlasBounds(layout) {
  const pad = Math.max(8, 8 * layout.scale);
  if (layout.open && layout.panel) {
    return {
      x: layout.panel.x - pad,
      y: layout.panel.y - pad,
      width: layout.panel.width + pad * 2,
      height: layout.panel.height + pad * 2,
    };
  }
  if (!layout.hotbar.length) return { x: 0, y: 0, width: 1, height: 1 };
  const first = layout.hotbar[0];
  const last = layout.hotbar[layout.hotbar.length - 1];
  const trayPad = 8 * layout.scale;
  const trayX = first.x - trayPad;
  const trayY = first.y - trayPad;
  const trayW = last.x + last.size - first.x + trayPad * 2;
  const captionTop = layout.captionY - 16 * layout.scale;
  const y = Math.min(trayY, captionTop) - pad;
  return {
    x: trayX - pad,
    y,
    width: trayW + pad * 2,
    height: first.y + first.size + trayPad - y + pad,
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

function paintCount(target, rect, count, scale) {
  if (count <= 1) return;
  const text = String(count);
  const fontSize = Math.max(10, Math.round(13 * scale));
  target.font = `700 ${fontSize}px "Segoe UI", "Helvetica Neue", sans-serif`;
  target.textAlign = "right";
  target.textBaseline = "alphabetic";
  const x = rect.x + rect.size - 5 * scale;
  const y = rect.y + rect.size - 5 * scale;
  target.lineWidth = Math.max(2, 3 * scale);
  target.strokeStyle = "rgba(0,0,0,0.72)";
  target.strokeText(text, x, y);
  target.fillStyle = INVENTORY_THEME.count;
  target.fillText(text, x, y);
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
  nativeOverlay = false,
} = {}) {
  if (!inventory) throw new Error("createInventoryHud requires an inventory.");
  function makeCanvasTexture(name) {
    const surface = document.createElement("canvas");
    surface.width = 1;
    surface.height = 1;
    const textureMap = new THREE.CanvasTexture(surface);
    textureMap.name = name;
    textureMap.colorSpace = THREE.SRGBColorSpace;
    textureMap.flipY = false;
    textureMap.premultiplyAlpha = false;
    textureMap.generateMipmaps = false;
    textureMap.minFilter = THREE.LinearFilter;
    textureMap.magFilter = THREE.LinearFilter;
    textureMap.needsUpdate = true;
    return { canvas: surface, ctx: surface.getContext("2d", { alpha: true }), texture: textureMap };
  }

  const atlas = makeCanvasTexture("Inventory HUD");
  const cursor = makeCanvasTexture("Inventory cursor");
  const canvas = atlas.canvas;
  const ctx = atlas.ctx;
  const texture = atlas.texture;
  const iconCache = new Map();

  let cssWidth = 1;
  let cssHeight = 1;
  let pixelRatio = 1;
  let open = false;
  let fullRedraw = true;
  let cursorDirty = true;
  let hoverIndex = -1;
  let lastHover = -1;
  let pointer = { x: 0, y: 0, down: false };
  let downIndex = -1;
  let dragging = false;
  let layout = layoutInventoryHud(1, 1, inventory, { open });
  let atlasRect = { x: 0, y: 0, width: 1, height: 1 };
  let lastRevision = -1;
  let lastSelected = -1;
  let lastCursorKey = "";
  let lastCaptionKey = "";
  let lastOpen = false;
  let slotKeys = [];
  let pendingCssRects = [];

  function markDirty() {
    fullRedraw = true;
  }

  function markDirtyRect(rect) {
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    pendingCssRects.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
  }

  function slotVisualKey(index) {
    const slot = inventory.slot(index);
    return `${slot.itemId}:${slot.count}:${index === inventory.selectedIndex()}:${index === hoverIndex}`;
  }

  function slotDirtyRect(slotRect) {
    return inflateRect(
      { x: slotRect.x, y: slotRect.y, width: slotRect.size, height: slotRect.size },
      Math.max(3, 3 * layout.scale),
    );
  }

  function captionDirtyRect() {
    return {
      x: atlasRect.x,
      y: layout.captionY - 18 * layout.scale,
      width: atlasRect.width,
      height: 36 * layout.scale,
    };
  }

  function collectSlotDirt() {
    const nextKeys = layout.slots.map(rect => slotVisualKey(rect.index));
    const limit = Math.max(slotKeys.length, nextKeys.length);
    for (let index = 0; index < limit; index += 1) {
      if (slotKeys[index] === nextKeys[index]) continue;
      const rect = layout.slots[index];
      if (rect) markDirtyRect(slotDirtyRect(rect));
    }
    slotKeys = nextKeys;
  }

  function itemImage(itemId) {
    return imageFromTexture(icons[itemId]) ?? icons[itemId] ?? null;
  }

  function bakedIcon(item, size) {
    const pixels = Math.max(8, Math.round(size));
    const key = `${item.id}:${pixels}`;
    let baked = iconCache.get(key);
    if (baked) return baked;
    baked = document.createElement("canvas");
    baked.width = pixels;
    baked.height = pixels;
    const iconCtx = baked.getContext("2d");
    if (item.category === "tool") paintShovel(iconCtx, 0, 0, pixels);
    else paintIsoCube(iconCtx, 0, 0, pixels, item.colors, itemImage(item.id));
    iconCache.set(key, baked);
    return baked;
  }

  function paintItem(targetCtx, rect, slot, { ghost = false, scale = layout.scale } = {}) {
    if (isEmptySlot(slot)) return;
    const item = getItem(slot.itemId, catalog);
    if (!item) return;
    const inset = rect.size * 0.08;
    const icon = bakedIcon(item, rect.size - inset * 2);
    targetCtx.save();
    if (ghost) targetCtx.globalAlpha = 0.88;
    targetCtx.drawImage(icon, rect.x + inset, rect.y + inset, rect.size - inset * 2, rect.size - inset * 2);
    targetCtx.restore();
    paintCount(targetCtx, rect, slot.count, scale);
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
    paintItem(ctx, rect, slot);
    if (showKey) paintKey(ctx, rect, rect.index - inventory.storageSize + 1, layout.scale);
  }

  function paintPanel() {
    const panel = layout.panel;
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

  function fitCanvas(surface, width, height) {
    const nextWidth = Math.max(1, Math.ceil(width));
    const nextHeight = Math.max(1, Math.ceil(height));
    if (surface.width !== nextWidth) surface.width = nextWidth;
    if (surface.height !== nextHeight) surface.height = nextHeight;
  }

  function drawCursor() {
    const slot = inventory.cursor;
    const size = Math.max(24, layout.slot);
    const dpr = pixelRatio;
    fitCanvas(cursor.canvas, size * dpr, size * dpr);
    const cursorCtx = cursor.ctx;
    cursorCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cursorCtx.clearRect(0, 0, size, size);
    if (!isEmptySlot(slot)) {
      paintItem(cursorCtx, { x: 0, y: 0, size, index: -1 }, slot, { ghost: true, scale: layout.scale });
    }
    cursor.texture.needsUpdate = true;
    lastCursorKey = `${slot.itemId}:${slot.count}:${Math.round(size)}`;
    cursorDirty = false;
  }

  function paintChrome() {
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
  }

  function paintAllSlots() {
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
  }

  function paintCaptions() {
    if (!open) paintCaption(hoveredName(), cssWidth / 2, layout.captionY);
    else if (hoverIndex >= 0 && isEmptySlot(inventory.cursor)) {
      const rect = layout.slots.find(slot => slot.index === hoverIndex);
      if (rect) paintCaption(hoveredName(), rect.x + rect.size / 2, rect.y - 14 * layout.scale);
    }
  }

  function paintNativeCursor() {
    if (!nativeOverlay || isEmptySlot(inventory.cursor)) return;
    const size = Math.max(24, layout.slot);
    paintItem(ctx, {
      x: pointer.x - size * 0.42,
      y: pointer.y - size * 0.42,
      size,
      index: -1,
    }, inventory.cursor, { ghost: true });
  }

  function paintIntersectingSlots(area) {
    for (const rect of layout.slots) {
      const painted = slotDirtyRect(rect);
      if (!rectsOverlap(painted, area, 0)) continue;
      paintSlot(rect, {
        selected: rect.index === inventory.selectedIndex(),
        hover: hoverIndex === rect.index,
        showKey: !open && inventory.isHotbar(rect.index),
      });
    }
  }

  function cssToPixels(rect) {
    return cssRectToPixelRect(rect, atlasRect, pixelRatio);
  }

  function syncNativeOverlay() {
    if (!nativeOverlay || !document?.body) return;
    if (!canvas.parentNode) document.body.appendChild(canvas);
    canvas.style.position = "absolute";
    canvas.style.left = `${Math.round(atlasRect.x)}px`;
    canvas.style.top = `${Math.round(atlasRect.y)}px`;
    canvas.style.width = `${Math.round(atlasRect.width)}px`;
    canvas.style.height = `${Math.round(atlasRect.height)}px`;
    canvas.style.display = "block";
    canvas.style.zIndex = "20";
    canvas.style.pointerEvents = "none";
  }

  function commitAtlas(renderer, pixelRects, full) {
    lastRevision = inventory.revision;
    lastSelected = inventory.selectedHotbar;
    lastCaptionKey = `${hoveredName()}:${open}:${hoverIndex}`;
    lastOpen = open;
    slotKeys = layout.slots.map(rect => slotVisualKey(rect.index));
    pendingCssRects = [];
    fullRedraw = false;
    syncNativeOverlay();
    if (nativeOverlay) return;
    const sizeChanged = canvas.width !== texture.userData.gpuWidth
      || canvas.height !== texture.userData.gpuHeight;
    if (sizeChanged) {
      try {
        renderer?.backend?.destroyTexture?.(texture);
      } catch {
        // First frame has no GPU texture yet.
      }
      texture.userData.gpuWidth = canvas.width;
      texture.userData.gpuHeight = canvas.height;
      texture.needsUpdate = true;
      return;
    }
    if (full) {
      texture.needsUpdate = true;
      return;
    }
    if (!uploadCanvasDirtyRects(renderer, texture, canvas, pixelRects)) {
      texture.needsUpdate = true;
    }
  }

  function draw(renderer = null) {
    layout = layoutInventoryHud(cssWidth, cssHeight, inventory, { open });
    atlasRect = hudAtlasBounds(layout);
    const dpr = pixelRatio;
    const prevWidth = canvas.width;
    const prevHeight = canvas.height;
    fitCanvas(atlas.canvas, atlasRect.width * dpr, atlasRect.height * dpr);
    if (canvas.width !== prevWidth || canvas.height !== prevHeight) fullRedraw = true;
    ctx.setTransform(dpr, 0, 0, dpr, -atlasRect.x * dpr, -atlasRect.y * dpr);

    if (fullRedraw || lastOpen !== open) {
      ctx.clearRect(atlasRect.x, atlasRect.y, atlasRect.width, atlasRect.height);
      paintChrome();
      paintAllSlots();
      paintCaptions();
      paintNativeCursor();
      commitAtlas(renderer, [cssToPixels(atlasRect)], true);
      return;
    }

    const areas = mergeDirtyRects(pendingCssRects);
    if (!areas.length) {
      commitAtlas(renderer, [], false);
      return;
    }
    const pixelRects = [];
    for (const area of areas) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(area.x, area.y, area.width, area.height);
      ctx.clip();
      ctx.clearRect(area.x, area.y, area.width, area.height);
      paintChrome();
      paintIntersectingSlots(area);
      paintCaptions();
      paintNativeCursor();
      ctx.restore();
      pixelRects.push(cssToPixels(area));
    }
    commitAtlas(renderer, pixelRects, false);
  }

  function sync(renderer = null) {
    layout = layoutInventoryHud(cssWidth, cssHeight, inventory, { open });
    atlasRect = hudAtlasBounds(layout);
    if (open !== lastOpen) fullRedraw = true;
    if (nativeOverlay && !isEmptySlot(inventory.cursor)) fullRedraw = true;
    collectSlotDirt();
    const captionKey = `${hoveredName()}:${open}:${hoverIndex}`;
    if (captionKey !== lastCaptionKey) markDirtyRect(captionDirtyRect());
    if (fullRedraw || pendingCssRects.length) draw(renderer);
    else {
      lastRevision = inventory.revision;
      lastSelected = inventory.selectedHotbar;
    }
    const cursorKey = `${inventory.cursor.itemId}:${inventory.cursor.count}:${Math.round(layout.slot)}`;
    if (cursorDirty || cursorKey !== lastCursorKey) drawCursor();
  }

  function frame() {
    const holding = !isEmptySlot(inventory.cursor);
    const size = Math.max(24, layout.slot);
    return {
      texture: nativeOverlay ? null : texture,
      rect: atlasRect,
      viewWidth: cssWidth,
      viewHeight: cssHeight,
      overlay: open ? 0.58 : 0,
      nativeOverlay,
      cursorTexture: holding && !nativeOverlay ? cursor.texture : null,
      cursorRect: holding
        ? {
          x: pointer.x - size * 0.42,
          y: pointer.y - size * 0.42,
          width: size,
          height: size,
        }
        : null,
    };
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
    resize(width, height, nextPixelRatio = 1) {
      cssWidth = Math.max(1, Math.round(width));
      cssHeight = Math.max(1, Math.round(height));
      pixelRatio = Math.max(1, Number(nextPixelRatio) || 1);
      markDirty();
      cursorDirty = true;
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
      lastHover = hoverIndex;

      if (event.type === "pointerdown") {
        pointer.down = true;
        downIndex = hoverIndex;
        dragging = false;
        if (open) {
          consumeSlotAction(event, rect);
          return { handled: true, slotIndex: hoverIndex };
        }
        if (rect && inventory.isHotbar(rect.index) && event.button === 0) {
          inventory.selectHotbar(rect.index - inventory.storageSize);
          return { handled: true, slotIndex: hoverIndex };
        }
        return { handled: false, slotIndex: hoverIndex };
      }

      if (event.type === "pointermove") {
        if (open && pointer.down && !isEmptySlot(inventory.cursor) && hoverIndex !== downIndex) {
          dragging = true;
        }
        return { handled: open, slotIndex: hoverIndex };
      }

      if (event.type === "pointerup" || event.type === "pointercancel") {
        const wasDragging = dragging;
        pointer.down = false;
        dragging = false;
        if (open && wasDragging && rect && rect.index !== downIndex && !isEmptySlot(inventory.cursor)) {
          inventory.dropCursorOn(rect.index);
        }
        downIndex = -1;
        return { handled: open, slotIndex: hoverIndex };
      }

      return { handled: open, slotIndex: hoverIndex };
    },
    sync,
    frame,
    dispose() {
      canvas.remove?.();
      texture.dispose();
      cursor.texture.dispose();
    },
  };

  return hud;
}
