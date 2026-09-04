export function isBrowserHost() {
  return globalThis.__DESERTED_ISLAND_RUNTIME_MODE__ === "browser";
}

export function yieldToBrowser() {
  if (!isBrowserHost()) return Promise.resolve();
  if (globalThis.scheduler?.yield) return globalThis.scheduler.yield();
  return new Promise(resolve => {
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf === "function") {
      raf.call(globalThis, () => setTimeout(resolve, 0));
      return;
    }
    setTimeout(resolve, 0);
  });
}

export async function reportProgress(onProgress, stage, ratio, detail = "") {
  onProgress?.({
    stage,
    detail,
    ratio: Math.max(0, Math.min(1, ratio)),
  });
  await yieldToBrowser();
}

function textureFromBitmap(bitmap, { srgb = false, wrap, THREE }) {
  const textureMap = new THREE.Texture(bitmap);
  textureMap.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  textureMap.wrapS = wrap;
  textureMap.wrapT = wrap;
  textureMap.anisotropy = isBrowserHost() ? 4 : 8;
  textureMap.generateMipmaps = true;
  textureMap.minFilter = THREE.LinearMipmapLinearFilter;
  textureMap.magFilter = THREE.LinearFilter;
  textureMap.flipY = false;
  textureMap.needsUpdate = true;
  return textureMap;
}

async function loadBitmapTexture(url, options) {
  const response = await fetch(url.href || url);
  if (!response.ok) throw new Error(`Failed to fetch ${url.href || url} (${response.status})`);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob, {
    imageOrientation: "flipY",
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
  });
  return textureFromBitmap(bitmap, options);
}

export async function loadTextureAsync(THREE, url, { srgb = false, wrap = THREE.RepeatWrapping } = {}) {
  const source = url.href || url;
  if (isBrowserHost() && typeof fetch === "function" && typeof createImageBitmap === "function") {
    try {
      return await loadBitmapTexture(source, { srgb, wrap, THREE });
    } catch {
      // Hosts without bitmap decode fall through to TextureLoader.
    }
  }
  const textureMap = await new THREE.TextureLoader().loadAsync(source);
  textureMap.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  textureMap.wrapS = wrap;
  textureMap.wrapT = wrap;
  textureMap.anisotropy = isBrowserHost() ? 4 : 8;
  textureMap.generateMipmaps = true;
  textureMap.minFilter = THREE.LinearMipmapLinearFilter;
  textureMap.magFilter = THREE.LinearFilter;
  textureMap.needsUpdate = true;
  return textureMap;
}

export async function mapPool(items, limit, iterate) {
  const values = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      values[index] = await iterate(items[index], index);
    }
  });
  await Promise.all(workers);
  return values;
}
