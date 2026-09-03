# Deserted Island

<p align="center">
  <img src="./preview.jpg" alt="Sunset over the island shore, shovel standing in the sand" width="1200">
</p>

A walkable first-person tropical island for **ThreeBrowser Runtime** and
**desktop browsers with WebGPU**. The same source paints one canvas: dunes,
tiled sand and greywacke rocks, coconut palms, Gerstner water, a day/night
cycle, and optional native RTX lighting when `navigator.gpu.threeBrowserRTX`
is present.

There is no WebGL fallback.

## Play in a browser

After Pages is live:

**https://samg-coder.github.io/DesertedIslandDemo/**

Locally:

```powershell
cd C:\DesertedIslandDemo
npm ci
npm test
npm run dev
```

Production static site:

```powershell
npm run build
npm run pages:verify
npm run preview
```

Use a current desktop Chrome or Edge with WebGPU. Open the HTTPS origin, not a
`file://` copy.

## Play in ThreeBrowser Runtime

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\play.ps1
```

Equivalent:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File `
  C:\ThreeBrowser\ThreeBrowserRuntime\run.ps1 `
  .\site-entry.mjs
```

Always launch `site-entry.mjs`, not `src/main.mjs`. The sibling
`threebrowser.pull.json` points the native host at canvas-only `native.html`,
matching the original Runtime beach boot. Browsers keep using `index.html`.

Native Runtime is canvas-only: controls and RTX path are reported on stdout.
Browsers show a determinate loading card. Texture decode uses `createImageBitmap`
where available, work yields between stages, and shaders compile through
`compileAsync` so the tab can keep painting. Native Runtime logs the same
stages on stdout; it still presents one swapchain image with no HTML overlay.

## Controls

| Input | Action |
| --- | --- |
| Click | Lock the cursor and look |
| `W` `A` `S` `D` | Walk |
| Shift | Sprint |
| `Space` | Jump |
| `E` | Pick up / place the shovel |
| Primary click | Dig while the shovel is the focused hotbar item |
| `Tab` | Open / close the inventory canvas |
| `1`–`9` | Select the focused hotbar slot |
| Drag | Move stacks between storage (top) and the hotbar (bottom) |
| `X` | Toggle native RTX lighting/reflections |

The HUD is a 2D canvas composited over the WebGPU frame, not an HTML overlay.
Nine hotbar slots stay on screen. `Tab` opens a 9×3 storage grid above that
same bar. Digging sand or striking rock places a stack in the first matching
hotbar slot, up to **255** per slot. Drag or shift-click to move stacks between
storage and the hotbar. `1`–`9` change the focused equipment; the shovel only
swings while that slot holds it.

## Layout

| Path | Host |
| --- | --- |
| `site-entry.mjs` + `native.html` | ThreeBrowser Runtime |
| `browser-entry.mjs` + `index.html` | GitHub Pages / Vite |
| `src/main.mjs` | Shared WebGPU scene |
| `play.ps1` | Native launcher |
| `.github/workflows/pages.yml` | Pages build and deploy |

Regenerate the native manifest after adding files:

```powershell
npm run manifest
```

## License

Deserted Island is **MIT**. See `LICENSE`.

Third-party code redistributed with the browser and native builds is **Three.js**
and **threepp** (via ThreeBrowser Runtime). Both are also MIT; their copyright
notices are in `THIRD_PARTY_NOTICES.md`.
