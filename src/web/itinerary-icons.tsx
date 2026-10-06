import type { ReactNode } from "react";
import type { ItineraryCategory } from "@/data/types";

/** The しおり mock's glyphs, drawn on a 24px grid in currentColor. */
const line = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;
const glyphs: Record<string, ReactNode> = {
  sight: (
    <path
      {...line}
      d="M3 21h18M5 21V10M19 21V10M9 21v-7M15 21v-7M3 10l9-6 9 6z"
    />
  ),
  meal: (
    <path
      {...line}
      d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M17 21V3c-2.5 1-4 4-4 8h4"
    />
  ),
  move: (
    <>
      <rect {...line} x="6" y="3" width="12" height="14" rx="3" />
      <path {...line} d="M6 11h12M9 21l1.5-4M15 21l-1.5-4" />
      <circle cx="9.5" cy="14" r="1" fill="currentColor" />
      <circle cx="14.5" cy="14" r="1" fill="currentColor" />
    </>
  ),
  shop: <path {...line} d="M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2" />,
  other: (
    <>
      <circle {...line} cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" />
    </>
  ),
  up: (
    <path
      {...line}
      strokeWidth={1.7}
      d="M2 20h20M4.5 13.5l3 3 12-4.5c1.2-.5 1.6-1.8.8-2.6-.6-.6-1.6-.8-2.4-.4L14 11 7 5 5 6l4 6.3-3.3 1.3-1.7-1.6z"
    />
  ),
  down: (
    <path
      {...line}
      strokeWidth={1.7}
      d="M2 20h20M3.5 8.5l.5 4.6 15.4 4.3c1.3.3 2.4-.5 2.4-1.6 0-.9-.6-1.7-1.5-2L15 12.5 12 4h-2.3l.8 7.3L7 10.4 6.2 8z"
    />
  ),
  in: (
    <path
      {...line}
      d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M3 12h11M10 8l4 4-4 4"
    />
  ),
  out: (
    <path
      {...line}
      d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M9 12h12M17 8l4 4-4 4"
    />
  ),
  bed: (
    <path
      {...line}
      d="M3 19V6M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6M7 12.5a1.8 1.8 0 1 0 0-.01"
    />
  ),
  ticket: (
    <>
      <path {...line} d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z" />
      <path
        d="M14 7v10"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeDasharray="2 2"
      />
    </>
  ),
  clock: (
    <>
      <circle {...line} strokeWidth={2} cx="12" cy="12" r="8.5" />
      <path {...line} strokeWidth={2} d="M12 7.5V12l3 2" />
    </>
  ),
  walk: (
    <>
      <circle cx="13" cy="4" r="2.2" fill="currentColor" />
      <path
        {...line}
        strokeWidth={2.4}
        d="M10 21l2-6 3 3v3M9 12l2-4 4 2 2 3M11 8l-3 2-1 3"
      />
    </>
  ),
  arrow: <path {...line} strokeWidth={2.4} d="M5 12h13M13 6l6 6-6 6" />,
  pin: (
    <>
      <path {...line} d="M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11z" />
      <circle cx="12" cy="10" r="2" fill="currentColor" />
    </>
  ),
  note: (
    <>
      <path {...line} d="M5 4h10l4 4v12H5z" />
      <path {...line} d="M8 12h8M8 16h5" />
    </>
  ),
  plus: <path {...line} strokeWidth={2.6} d="M12 5v14M5 12h14" />,
  ext: (
    <path
      {...line}
      strokeWidth={2}
      d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"
    />
  ),
  edit: <path {...line} strokeWidth={2} d="M4 20h4L19 9l-4-4L4 16z" />,
  trash: (
    <path {...line} strokeWidth={2} d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" />
  ),
  close: <path {...line} strokeWidth={2.2} d="M6 6l12 12M18 6L6 18" />,
};
export type GlyphName = keyof typeof glyphs;
export function Glyph({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      {glyphs[name]}
    </svg>
  );
}
export const categoryGlyph: Record<ItineraryCategory, string> = {
  sightseeing: "sight",
  meal: "meal",
  transport: "move",
  shopping: "shop",
  other: "other",
};

const PIN =
  "M17 2a15 15 0 0 1 15 15c0 11-15 25-15 25S2 28 2 17A15 15 0 0 1 17 2z";
/** The places map's pin: its number, a house for the stay, or a plain dot. */
export function MapPin({
  number,
  stay = false,
  className = "it-pin",
}: {
  number?: number;
  stay?: boolean;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 34 44"
      role="img"
      aria-label={number ? `地図の ${number}` : stay ? "宿" : "場所"}
    >
      <path d={PIN} />
      {number ? (
        <text x="17" y="22.5">
          {number}
        </text>
      ) : stay ? (
        <path className="it-pin-house" d="M10 19 L17 12.5 L24 19 V25 H10Z" />
      ) : (
        <circle className="it-pin-house" cx="17" cy="17" r="5" />
      )}
    </svg>
  );
}
