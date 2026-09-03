const boot = document.querySelector("#boot");
const status = document.querySelector("#boot-status");
const detail = document.querySelector("#boot-detail");
const meter = document.querySelector("#boot-meter");
const fill = document.querySelector("#boot-meter-fill");
const percent = document.querySelector("#boot-percent");

function fail(message) {
  if (status) {
    status.textContent = message;
    status.classList.add("error");
  }
  if (detail) detail.textContent = "";
  if (meter) meter.hidden = true;
  if (percent) percent.hidden = true;
  document.body.dataset.demoStatus = "unsupported";
}

function setProgress({ stage, detail: extra = "", ratio = 0 } = {}) {
  const clamped = Math.max(0, Math.min(1, Number(ratio) || 0));
  const shown = Math.round(clamped * 100);
  if (status) status.textContent = stage || "Loading";
  if (detail) detail.textContent = extra;
  if (fill) fill.style.width = `${shown}%`;
  if (meter) meter.setAttribute("aria-valuenow", String(shown));
  if (percent) percent.textContent = `${shown}%`;
}

function yieldPaint() {
  if (globalThis.scheduler?.yield) return globalThis.scheduler.yield();
  return new Promise(resolve => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

async function dismissBoot() {
  if (!boot) return;
  boot.classList.add("is-leaving");
  await new Promise(resolve => setTimeout(resolve, 420));
  boot.remove();
}

globalThis.__DESERTED_ISLAND_RUNTIME_MODE__ = "browser";
globalThis.__threeBrowserSourceURL = new URL("./", document.baseURI).href;

if (!window.isSecureContext) {
  fail("WebGPU needs a secure context. Open the HTTPS GitHub Pages URL rather than a downloaded file.");
} else if (!navigator.gpu) {
  fail("This browser does not expose WebGPU. Use a current desktop Chrome or Edge with WebGPU enabled.");
} else {
  try {
    setProgress({ stage: "Checking graphics adapter", ratio: 0.03 });
    await yieldPaint();
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      fail("WebGPU exists, but no compatible graphics adapter was available on this device.");
    } else {
      setProgress({ stage: "Loading engine", detail: adapter.info?.vendor || adapter.info?.device || "", ratio: 0.06 });
      await yieldPaint();
      const { startDesertedIsland } = await import("./src/main.mjs");
      await startDesertedIsland({ onProgress: setProgress });
      document.body.dataset.demoStatus = "ready";
      await dismissBoot();
    }
  } catch (error) {
    console.error("[Deserted Island browser boot]", error);
    fail(`Startup failed: ${error?.message || error}`);
  }
}
