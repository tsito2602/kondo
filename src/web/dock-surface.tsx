import { useId, useLayoutEffect, useRef } from "react";
import { reduceMotion } from "./motion";

/** Start each release at its rendered scale, without CSS reversal shortening. */
export function animateDockPress(
  element: HTMLElement,
  pressed: boolean,
  previous?: Animation,
) {
  const style = window.getComputedStyle(element);
  const from = style.transform || "none";
  const scale = style.getPropertyValue("--safari-press-scale").trim() || "1.06";
  previous?.cancel();
  if (reduceMotion() || !element.animate) return undefined;
  return element.animate(
    [
      { transform: from },
      { transform: pressed ? `scale(${scale}, 1.1)` : "scale(1)" },
    ],
    {
      duration: pressed ? 320 : 900,
      easing: pressed
        ? "cubic-bezier(0.16, 1, 0.3, 1)"
        : "cubic-bezier(0.22, 0.72, 0.18, 1)",
    },
  );
}

type Point = [number, number];
type Curve = [Point, Point, Point, Point];
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const reverse = (curve: Curve): Curve => [
  curve[3],
  curve[2],
  curve[1],
  curve[0],
];
const mapCurve = (curve: Curve, map: (p: Point) => Point) =>
  curve.map(map) as Curve;
const line = (a: Point, b: Point): Curve => [a, a, b, b];
const path = (curves: Curve[]) => {
  const point = (p: Point) => p.map((n) => Number(n.toFixed(3))).join(" ");
  return (
    `M ${point(curves[0][0])} ` +
    curves
      .map((c) => `C ${point(c[1])} ${point(c[2])} ${point(c[3])}`)
      .join(" ") +
    " Z"
  );
};

/** One contour pinches into three contours; the join has no overlapping seams. */
export function dockOutline(
  width: number,
  side: number,
  inset: number,
  separation: number,
) {
  const t = Math.max(0, Math.min(1, separation));
  const r = mix(32, Math.min(side, inset - 4) / 2, t);
  const top = 32 - r,
    bottom = 32 + r,
    k = r * 0.55228475;
  const center = inset + r,
    neck = (r + center) / 2;
  const distance = center - r,
    handle = distance * 0.14;
  const mirrorX = ([x, y]: Point): Point => [width - x, y];
  const mirrorY = ([x, y]: Point): Point => [x, 64 - y];
  const leftOuter: Curve[] = [
    [
      [r, bottom],
      [r - k, bottom],
      [0, 32 + k],
      [0, 32],
    ],
    [
      [0, 32],
      [0, 32 - k],
      [r - k, top],
      [r, top],
    ],
  ];
  const rightOuter = leftOuter.map((c) => mapCurve(c, mirrorX));
  if (t <= 0.72) {
    const halfNeck = r * (1 - t / 0.72);
    const bridge: Curve[] = [
      [
        [r, top],
        [r + distance * 0.42, top],
        [neck - handle, 32 - halfNeck],
        [neck, 32 - halfNeck],
      ],
      [
        [neck, 32 - halfNeck],
        [neck + handle, 32 - halfNeck],
        [center - distance * 0.42, top],
        [center, top],
      ],
    ];
    const upper = [
      ...bridge,
      line([center, top], [width - center, top]),
      ...bridge
        .slice()
        .reverse()
        .map((c) => mapCurve(reverse(c), mirrorX)),
    ];
    return path([
      ...upper,
      ...rightOuter.slice().reverse().map(reverse),
      ...upper
        .slice()
        .reverse()
        .map((c) => mapCurve(reverse(c), mirrorY)),
      ...leftOuter,
    ]);
  }
  const release = (t - 0.72) / 0.28;
  const tip = mix(neck, 2 * r, release);
  const innerTip = mix(neck, inset, release);
  const lobe: Curve = [
    [r, top],
    [mix(r + distance * 0.42, r + k, release), top],
    [mix(neck - handle, tip, release), mix(32, 32 - k, release)],
    [tip, 32],
  ];
  const left = [lobe, mapCurve(reverse(lobe), mirrorY), ...leftOuter];
  const shoulder: Curve = [
    [innerTip, 32],
    [mix(neck + handle, innerTip, release), mix(32, 32 - k, release)],
    [mix(center - distance * 0.42, center - k, release), top],
    [center, top],
  ];
  const upper = [
    shoulder,
    line([center, top], [width - center, top]),
    mapCurve(reverse(shoulder), mirrorX),
  ];
  return (
    path(left) +
    " " +
    path([
      ...upper,
      ...upper
        .slice()
        .reverse()
        .map((c) => mapCurve(reverse(c), mirrorY)),
    ]) +
    " " +
    path(left.map((c) => mapCurve(c, mirrorX)))
  );
}

export function DockSurface({ split }: { split: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const glass = useRef<HTMLDivElement>(null);
  const outline = useRef<SVGPathElement>(null);
  const shadow = useRef<SVGPathElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const progress = useRef(split ? 1 : 0);
  const geometry = useRef({ width: 360, side: 52, inset: 60 });
  const id = useId();
  const paint = () => {
    const { width, side, inset } = geometry.current;
    const d = dockOutline(width, side, inset, progress.current);
    glass.current!.style.clipPath = `path("${d}")`;
    outline.current!.setAttribute("d", d);
    shadow.current!.setAttribute("d", d);
    svg.current!.setAttribute("viewBox", `0 0 ${width} 64`);
  };
  useLayoutEffect(() => {
    const measure = () => {
      const parent = root.current!.parentElement!;
      const style = window.getComputedStyle(parent);
      geometry.current = {
        // Press feedback scales the whole dock; contours use its layout width.
        width:
          parent.clientWidth || parent.getBoundingClientRect().width || 360,
        side: parseFloat(style.getPropertyValue("--safari-side-size")) || 52,
        inset:
          parseFloat(style.getPropertyValue("--safari-center-inset")) || 60,
      };
      // Keep the stronger press expansion inside even a narrow phone screen.
      parent.style.setProperty(
        "--safari-press-scale",
        String(
          Math.max(
            1,
            Math.min(1.06, (window.innerWidth - 8) / geometry.current.width),
          ),
        ),
      );
      paint();
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(root.current!.parentElement!);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  useLayoutEffect(() => {
    const from = progress.current,
      to = split ? 1 : 0;
    if (reduceMotion() || from === to) {
      progress.current = to;
      paint();
      return;
    }
    let frame: number;
    const start = performance.now();
    const duration = 520 * Math.abs(to - from);
    const tick = (now: number) => {
      const elapsed = Math.min(1, (now - start) / duration);
      const eased = elapsed * elapsed * (3 - 2 * elapsed);
      progress.current = mix(from, to, eased);
      paint();
      if (elapsed < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [split]);
  return (
    <div ref={root} className="safari-surface" aria-hidden="true">
      <div ref={glass} className="safari-glass" />
      <svg ref={svg} width="100%" height="64" preserveAspectRatio="none">
        <defs>
          <filter
            id={`${id}-shadow`}
            x="-20%"
            y="-50%"
            width="140%"
            height="220%"
          >
            <feGaussianBlur in="SourceAlpha" stdDeviation="6" />
            <feOffset dy="5" />
            <feComposite in2="SourceAlpha" operator="out" />
          </filter>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--dock-border-top)" />
            <stop offset="1" stopColor="var(--dock-border-bottom)" />
          </linearGradient>
        </defs>
        <path
          ref={shadow}
          fill="black"
          opacity="0.18"
          filter={`url(#${id}-shadow)`}
        />
        <path
          ref={outline}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
