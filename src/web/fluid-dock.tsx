import {
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type Ref,
  type RefObject,
} from "react";
import { reduceMotion } from "./motion";

export type DockIsland = { left: number; width: number; radius: number };
const samples = 320;
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Three overlapping lobes make one capsule, with no internal seams. */
export function joinedDock(width: number, radius = 32): DockIsland[] {
  return [
    { left: 0, width: width / 3 + radius, radius },
    { left: width / 3 - radius, width: width / 3 + radius * 2, radius },
    { left: (width * 2) / 3 - radius, width: width / 3 + radius, radius },
  ];
}

/** Absent controls dissolve into the closest surviving surface. */
export function dockSlots(
  width: number,
  slots: (DockIsland | null)[],
): DockIsland[] {
  const present = slots.filter((slot): slot is DockIsland => Boolean(slot));
  return slots.map((slot, index) => {
    if (slot) return slot;
    const anchor = (width * index) / 2;
    const points = present.map(({ left, width: w, radius: r }) =>
      Math.max(left + r, Math.min(left + w - r, anchor)),
    );
    const point =
      points.sort((a, b) => Math.abs(a - anchor) - Math.abs(b - anchor))[0] ??
      width / 2;
    return { left: point, width: 0, radius: 0 };
  });
}

export function morphDock(
  from: DockIsland[],
  to: DockIsland[],
  tension: number,
  t: number,
) {
  if (t >= 1) return { islands: to, tension: 0 };
  if (t <= 0) return { islands: from, tension };
  const p = ease(t);
  return {
    islands: from.map((island, i) => ({
      left: island.left + (to[i].left - island.left) * p,
      width: island.width + (to[i].width - island.width) * p,
      radius: island.radius + (to[i].radius - island.radius) * p,
    })),
    tension: tension * (1 - p) + 1800 * Math.sin(Math.PI * p) ** 2,
  };
}

/** A capsule's horizontal slice: y² < field(x). Negative values are real gaps. */
export function dockField(width: number, islands: DockIsland[], tension = 0) {
  const ceiling = Math.max(...islands.map((island) => island.radius ** 2));
  return Array.from({ length: samples + 1 }, (_, i) => {
    const x = (i / samples) * width;
    let value = -width * width;
    for (const island of islands) {
      const r = Math.min(island.radius, island.width / 2);
      if (r <= 0) continue;
      const dx = Math.max(
        island.left + r - x,
        0,
        x - (island.left + island.width - r),
      );
      const next = r * r - dx * dx;
      // Smooth union draws a neck between nearby droplets, without double blur
      // or a border through the join. Distant islands remain separate.
      const h = tension
        ? Math.max(tension - Math.abs(value - next), 0) / tension
        : 0;
      value = Math.max(value, next) + h * h * tension * 0.25;
    }
    return Math.min(value, ceiling);
  });
}

/** Trace one closed contour per connected region, including subpixel pinch-off. */
export function dockFieldPath(width: number, field: number[]) {
  const step = width / (field.length - 1);
  const contours: string[] = [];
  let points: [number, number][] = [];
  const point = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  const close = () => {
    if (points.length < 2) {
      points = [];
      return;
    }
    contours.push(
      `M ${points.map(([x, y]) => point(x, 32 - y)).join(" L ")} L ${points
        .reverse()
        .map(([x, y]) => point(x, 32 + y))
        .join(" L ")} Z`,
    );
    points = [];
  };
  for (let i = 0; i < field.length; i++) {
    const v = field[i];
    const prev = field[i - 1];
    if (v >= 0) {
      if (prev < 0) points.push([(i - 1 + -prev / (v - prev)) * step, 0]);
      points.push([i * step, Math.sqrt(v)]);
    } else if (prev >= 0) {
      points.push([(i - 1 + prev / (prev - v)) * step, 0]);
      close();
    }
  }
  close();
  return contours.join(" ");
}

export type FluidDockHandle = { measure: () => void };

/** Lives in the provider, so routes and nested dialogs never replace the glass. */
export function FluidDockSurface({
  root,
  ref,
}: {
  root: RefObject<HTMLDivElement | null>;
  ref: Ref<FluidDockHandle>;
}) {
  const glass = useRef<HTMLDivElement>(null);
  const outline = useRef<SVGPathElement>(null);
  const shadow = useRef<SVGPathElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const shape = useRef<{ islands: DockIsland[]; tension: number } | null>(null);
  const target = useRef("");
  const width = useRef(0);
  const frame = useRef(0);
  const id = useId();
  const paint = () => {
    if (!shape.current || !glass.current) return;
    const d = dockFieldPath(
      width.current,
      dockField(width.current, shape.current.islands, shape.current.tension),
    );
    glass.current.style.clipPath = `path("${d}")`;
    outline.current!.setAttribute("d", d);
    shadow.current!.setAttribute("d", d);
    svg.current!.setAttribute("viewBox", `0 0 ${width.current} 64`);
  };
  const measure = () => {
    const node = root.current;
    if (!node) return;
    const w = node.clientWidth;
    if (!w) return; // Hidden desktop dock or a host not yet in the top layer.
    const tabs = node.querySelector<HTMLElement>(".safari-dock");
    let islands: DockIsland[];
    if (tabs) {
      const style = window.getComputedStyle(tabs);
      const side =
        parseFloat(style.getPropertyValue("--safari-side-size")) || 52;
      const inset =
        parseFloat(style.getPropertyValue("--safari-center-inset")) || 60;
      const radius = Math.min(side, inset - 4) / 2;
      islands =
        tabs.dataset.wide === "false"
          ? [
              { left: 0, width: radius * 2, radius },
              { left: inset, width: w - 2 * inset, radius },
              { left: w - radius * 2, width: radius * 2, radius },
            ]
          : joinedDock(w);
    } else {
      const bounds = node.getBoundingClientRect();
      const scale = bounds.width / w || 1;
      const slots = ["back", "primary", "actions"].map((role) => {
        const element = node.querySelector<HTMLElement>(
          `.context-island.context-${role}`,
        );
        return element
          ? {
              left:
                Math.round(
                  ((element.getBoundingClientRect().left - bounds.left) /
                    scale) *
                    100,
                ) / 100,
              width: element.offsetWidth,
              radius: 26,
            }
          : null;
      });
      islands = slots.some(Boolean) ? dockSlots(w, slots) : joinedDock(w, 30);
    }
    node.style.setProperty(
      "--safari-press-scale",
      String(Math.max(1, Math.min(1.06, (window.innerWidth - 8) / w))),
    );
    const key = JSON.stringify([w, islands]);
    if (key === target.current) return;
    target.current = key;
    cancelAnimationFrame(frame.current);
    const from = shape.current;
    const resized = width.current !== w;
    width.current = w;
    if (!from || resized || reduceMotion()) {
      shape.current = { islands, tension: 0 };
      paint();
      return;
    }
    // Interrupted transitions start at the exact rendered geometry, not a layout
    // endpoint. Both the glass mask and its border use that same contour.
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / 820));
      shape.current = morphDock(from.islands, islands, from.tension, t);
      paint();
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };
  useImperativeHandle(ref, () => ({ measure }));
  useLayoutEffect(() => {
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    if (root.current) observer?.observe(root.current);
    // Hold expansion changes within SafariTabs without updating the registry.
    const mutations = new window.MutationObserver(measure);
    if (root.current)
      mutations.observe(root.current, {
        subtree: true,
        attributes: true,
        attributeFilter: ["data-wide"],
      });
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", measure);
      cancelAnimationFrame(frame.current);
    };
  }, []);
  return (
    <div className="thumb-dock-material safari-surface" aria-hidden="true">
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
