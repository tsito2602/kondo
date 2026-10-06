// The places map's ground: real roads, buildings, water and parks from
// OpenStreetMap (OpenFreeMap's free vector tiles), drawn by MapLibre in the
// app's own warm greys, without any labels (the pins carry the names).
// The pins, edge arrows and gestures stay kondo's own; this layer only
// follows their camera. MapLibre is loaded only when a map is on screen.
import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";

const TILES = "https://tiles.openfreemap.org/planet";

type Palette = {
  ground: string;
  water: string;
  park: string;
  building: string;
  buildingLine: string;
  minor: string;
  major: string;
  casing: string;
  rail: string;
};

const LIGHT: Palette = {
  ground: "#f6f5f2",
  water: "#dfe2e1",
  park: "#eceae2",
  building: "#e9e6df",
  buildingLine: "#dcd8cf",
  minor: "#ffffff",
  major: "#ffffff",
  casing: "#e1ddd5",
  rail: "#d6d2c9",
};
const DARK: Palette = {
  ground: "#1b1a18",
  water: "#121313",
  park: "#1f1f1b",
  building: "#252421",
  buildingLine: "#2e2c29",
  minor: "#2b2926",
  major: "#36332f",
  casing: "#1b1a18",
  rail: "#34312d",
};

const width = (stops: [number, number][]) =>
  ["interpolate", ["exponential", 1.6], ["zoom"], ...stops.flat()] as never;
const MAJOR = ["motorway", "trunk", "primary", "secondary", "tertiary"];
const MINOR = ["minor", "service", "track"];

export function basemapStyle(dark: boolean): StyleSpecification {
  const c = dark ? DARK : LIGHT;
  return {
    version: 8,
    sources: { omt: { type: "vector", url: TILES } },
    layers: [
      {
        id: "ground",
        type: "background",
        paint: { "background-color": c.ground },
      },
      {
        id: "park",
        type: "fill",
        source: "omt",
        "source-layer": "landuse",
        filter: [
          "in",
          ["get", "class"],
          ["literal", ["park", "cemetery", "grass", "pitch", "playground"]],
        ],
        paint: { "fill-color": c.park },
      },
      {
        id: "park-cover",
        type: "fill",
        source: "omt",
        "source-layer": "park",
        paint: { "fill-color": c.park },
      },
      {
        id: "wood",
        type: "fill",
        source: "omt",
        "source-layer": "landcover",
        filter: ["in", ["get", "class"], ["literal", ["wood", "grass"]]],
        paint: { "fill-color": c.park },
      },
      {
        id: "water",
        type: "fill",
        source: "omt",
        "source-layer": "water",
        paint: { "fill-color": c.water },
      },
      {
        id: "river",
        type: "line",
        source: "omt",
        "source-layer": "waterway",
        paint: {
          "line-color": c.water,
          "line-width": width([
            [10, 1],
            [18, 8],
          ]),
        },
      },
      {
        id: "building",
        type: "fill",
        source: "omt",
        "source-layer": "building",
        minzoom: 14,
        paint: {
          "fill-color": c.building,
          "fill-outline-color": c.buildingLine,
        },
      },
      {
        id: "rail",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        filter: ["==", ["get", "class"], "rail"],
        paint: {
          "line-color": c.rail,
          "line-width": width([
            [12, 0.6],
            [18, 2],
          ]),
          "line-dasharray": [3, 3],
        },
      },
      {
        id: "minor-casing",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        minzoom: 13,
        filter: ["in", ["get", "class"], ["literal", MINOR]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": c.casing,
          "line-width": width([
            [13, 1.6],
            [18, 12],
          ]),
        },
      },
      {
        id: "minor",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        minzoom: 13,
        filter: ["in", ["get", "class"], ["literal", MINOR]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": c.minor,
          "line-width": width([
            [13, 0.8],
            [18, 10],
          ]),
        },
      },
      {
        id: "path",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        minzoom: 15,
        filter: ["==", ["get", "class"], "path"],
        paint: {
          "line-color": c.casing,
          "line-width": width([
            [15, 0.6],
            [18, 2],
          ]),
          "line-dasharray": [2, 1.5],
        },
      },
      {
        id: "major-casing",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", MAJOR]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": c.casing,
          "line-width": width([
            [10, 1.6],
            [18, 22],
          ]),
        },
      },
      {
        id: "major",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", MAJOR]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": c.major,
          "line-width": width([
            [10, 1],
            [18, 19],
          ]),
        },
      },
    ],
  };
}

export const isDark = () => {
  const theme = document.documentElement.dataset.theme;
  return theme
    ? theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
};

/** Mercator units are radians (place-geo.ts); MapLibre's world is 512·2^z px. */
export const zoomFor = (k: number) => Math.log2((2 * Math.PI * k) / 512);
export const lngLatFor = (cx: number, cy: number): [number, number] => [
  (cx * 180) / Math.PI,
  ((2 * Math.atan(Math.exp(cy)) - Math.PI / 2) * 180) / Math.PI,
];

/** Google Maps at the same place and scale (its tiles are 256 px: one zoom up). */
export function mapsViewHref(cx: number, cy: number, k: number) {
  const [lng, lat] = lngLatFor(cx, cy);
  const zoom = Math.max(3, Math.min(21, zoomFor(k) + 1));
  return `https://www.google.com/maps/@${lat.toFixed(6)},${lng.toFixed(6)},${zoom.toFixed(1)}z`;
}

export async function createBasemap(container: HTMLElement) {
  const { Map } = await import("maplibre-gl");
  const map: MapLibreMap = new Map({
    container,
    style: basemapStyle(isDark()),
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    renderWorldCopies: false,
    maxZoom: 21,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
  });
  // The app's light/dark switch repaints the ground.
  const observer = new MutationObserver(() =>
    map.setStyle(basemapStyle(isDark())),
  );
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return {
    map,
    remove() {
      observer.disconnect();
      map.remove();
    },
  };
}
