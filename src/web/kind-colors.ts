import { useSyncExternalStore } from "react";
import type { BookingKind, ItineraryCategory } from "@/data/types";

// カテゴリの色 (Tsubasa 2026-10-06; first called 種類の色): the screens stay black and white, and only
// what a plan or booking is (a meal, a sight, a journey…) carries a colour, the
// way uchiwake colours its 費目. The colours, their names, the 6 × 4 picker and
// the light/dark display pairs (styles/palette.css) are uchiwake's.

export type KindKey =
  | "sightseeing"
  | "meal"
  | "transport"
  | "stay"
  | "ticket"
  | "shopping"
  | "other";

/** Every kind, in the order the settings list them, with its glyph and default. */
export const KINDS: {
  key: KindKey;
  label: string;
  glyph: string;
  color: string;
}[] = [
  { key: "sightseeing", label: "観光", glyph: "sight", color: "#738778" },
  { key: "meal", label: "食事", glyph: "meal", color: "#b78d6a" },
  { key: "transport", label: "移動", glyph: "move", color: "#8995a5" },
  { key: "stay", label: "宿", glyph: "bed", color: "#a28c80" },
  { key: "ticket", label: "チケット", glyph: "ticket", color: "#8a87a4" },
  { key: "shopping", label: "買い物", glyph: "shop", color: "#b48a96" },
  { key: "other", label: "その他", glyph: "other", color: "#989898" },
];

/** uchiwake's shared 6 × 4 palette (card-colors.ts), ordered by hue. */
export const PALETTE: { value: string; label: string }[] = [
  ["#a32931", "レッド"],
  ["#d46e55", "コーラル"],
  ["#b78d6a", "オレンジ"],
  ["#b7863a", "アンバー"],
  ["#c0a16e", "イエロー"],
  ["#a38f19", "レモン"],
  ["#5b9837", "ライム"],
  ["#6e8b3d", "オリーブ"],
  ["#738778", "グリーン"],
  ["#4d977e", "ミント"],
  ["#22665f", "ティール"],
  ["#6f98a1", "シアン"],
  ["#328cae", "スカイブルー"],
  ["#8995a5", "ブルー"],
  ["#304666", "ネイビー"],
  ["#4a4390", "インディゴ"],
  ["#8a87a4", "パープル"],
  ["#9984b9", "ラベンダー"],
  ["#9c94b4", "マゼンタ"],
  ["#c4739e", "ピンク"],
  ["#b48a96", "ローズ"],
  ["#a28c80", "ブラウン"],
  ["#989898", "グレー"],
  ["#171717", "ブラック"],
].map(([value, label]) => ({ value, label }));

/** The colour's name as uchiwake shows it (black reads as white in dark). */
export const colorLabel = (value: string, dark: boolean) =>
  value === "#171717" && dark
    ? "ホワイト"
    : (PALETTE.find((color) => color.value === value)?.label ?? value);

/** A palette ID as CSS: its display colour for the current theme. */
export const displayColor = (value: string) =>
  `var(--palette-${value.slice(1).toLowerCase()}, ${value})`;

export const kindOfCategory = (category: ItineraryCategory): KindKey =>
  category;
export const kindOfBooking = (kind: BookingKind): KindKey =>
  kind === "flight" || kind === "train" || kind === "car"
    ? "transport"
    : kind === "hotel"
      ? "stay"
      : kind === "restaurant"
        ? "meal"
        : kind === "ticket"
          ? "ticket"
          : "other";

// Kept on this device, as the 外観 choice is.
const KEY = "kondo:kind-colors";
type Colors = Record<KindKey, string>;
const defaults = Object.fromEntries(
  KINDS.map((kind) => [kind.key, kind.color]),
) as Colors;
const valid = (value: unknown): value is string =>
  typeof value === "string" && PALETTE.some((color) => color.value === value);

function read(): Colors {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<
      string,
      unknown
    >;
    return Object.fromEntries(
      KINDS.map(({ key }) => [
        key,
        valid(saved[key]) ? saved[key] : defaults[key],
      ]),
    ) as Colors;
  } catch {
    return { ...defaults };
  }
}

let colors: Colors = defaults;
const listeners = new Set<() => void>();

function paint() {
  const root = document.documentElement.style;
  for (const { key } of KINDS)
    root.setProperty(`--kind-${key}`, displayColor(colors[key]));
}

/** Publishes --kind-<key> on :root; call once at start-up. */
export function installKindColors() {
  colors = read();
  paint();
}

export function setKindColor(key: KindKey, value: string) {
  if (!valid(value)) return;
  colors = { ...colors, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(colors));
  } catch {
    // Private mode: the colour still applies until the app closes.
  }
  paint();
  listeners.forEach((listener) => listener());
}

export function useKindColors(): Colors {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => colors,
  );
}
