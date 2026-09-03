const boot = document.querySelector("#boot");
const status = document.querySelector("#boot-status");
const meter = document.querySelector("#boot-meter");

function fail(message) {
  if (status) {
    status.textContent = message;
    status.classList.add("error");
  }
  if (meter) meter.hidden = true;
  document.body.dataset.demoStatus = "unsupported";
}

globalThis.__DESERTED_ISLAND_RUNTIME_MODE__ = "browser";
globalThis.__threeBrowserSourceURL = new URL("./", document.baseURI).href;

if (!window.isSecureContext) {
  fail("WebGPU needs a secure context. Open the HTTPS GitHub Pages URL rather than a downloaded file.");
} else if (!navigator.gpu) {
  fail("This browser does not expose WebGPU. Use a current desktop Chrome or Edge with WebGPU enabled.");
} else {
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      fail("WebGPU exists, but no compatible graphics adapter was available on this device.");
    } else {
      if (status) status.textContent = "WebGPU ready. Loading the island…";
      await import("./src/main.mjs");
      document.body.dataset.demoStatus = "ready";
      boot?.remove();
    }
  } catch (error) {
    console.error("[Deserted Island browser boot]", error);
    fail(`Startup failed: ${error?.message || error}`);
  }
}
