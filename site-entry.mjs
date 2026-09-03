// Native ThreeBrowser Runtime entry. Browsers load browser-entry.mjs instead.
globalThis.__DESERTED_ISLAND_RUNTIME_MODE__ = "native";
globalThis.__threeBrowserSourceURL =
  "https://deserted-island.runtime.threebrowser.local/";
await import("./src/main.mjs");
