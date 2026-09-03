# Deserted Island

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
`threebrowser.pull.json` tells the native host to install WebGPU before the
demo module loads.

Native Runtime is canvas-only: controls and RTX path are reported on stdout.
Browsers show a short boot card, then the same canvas.

## Controls

| Input | Action |
| --- | --- |
| Click | Lock the cursor and look |
| `W` `A` `S` `D` | Walk |
| Shift | Sprint |
| `Space` | Jump |
| `E` | Pick up / place the shovel |
| Primary click | Dig while carrying the shovel |
| `X` | Toggle native RTX lighting/reflections |

## Layout

| Path | Host |
| --- | --- |
| `site-entry.mjs` | ThreeBrowser Runtime |
| `browser-entry.mjs` + `index.html` | GitHub Pages / Vite |
| `src/main.mjs` | Shared WebGPU scene |
| `play.ps1` | Native launcher |
| `.github/workflows/pages.yml` | Pages build and deploy |

Regenerate the native manifest after adding files:

```powershell
npm run manifest
```
