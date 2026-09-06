import { isBrowserHost } from "./async-load.mjs";

export const BROWSER_QUALITY = isBrowserHost();

const BROWSER = Object.freeze({
  antialias: false,
  pixelRatioCap: 1.25,
  rasterPixels: 1920 * 1080,
  shadowMapSize: 2048,
  pcfSoft: true,
  terrainCastShadow: false,
  cloudSteps: 24,
  cloudLightProbe: true,
  cloudShellWidth: 24,
  cloudShellHeight: 16,
  rainCount: 360,
  waterSegmentsX: 96,
  waterSegmentsZ: 72,
  foamSize: 256,
  foamHz: 12,
  foamMaxSteps: 1,
  foamPreRollSeconds: 1.2,
  simpleTerrainMaps: true,
  textureAnisotropy: 4,
});

const NATIVE = Object.freeze({
  antialias: true,
  pixelRatioCap: 2.25,
  rasterPixels: 2560 * 1440,
  shadowMapSize: 2048,
  pcfSoft: true,
  terrainCastShadow: true,
  cloudSteps: 48,
  cloudLightProbe: true,
  cloudShellWidth: 48,
  cloudShellHeight: 24,
  rainCount: 1800,
  waterSegmentsX: 180,
  waterSegmentsZ: 140,
  foamSize: 512,
  foamHz: 30,
  foamMaxSteps: 3,
  foamPreRollSeconds: 4.2,
  simpleTerrainMaps: false,
  textureAnisotropy: 8,
});

export const QUALITY = BROWSER_QUALITY ? BROWSER : NATIVE;
