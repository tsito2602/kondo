import {
  useId,
  useImperativeHandle,
  useEffect,
  useRef,
  type Ref,
  type RefObject,
} from "react";
import { reduceMotion } from "./motion";
import { animateDockPress } from "./dock-surface";

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
  // Stretch slowly against a persistent bridge, then release quickly. The
  // final damped squeeze is horizontal so every surface keeps the same height.
  const release = Math.max(0, Math.min(1, (t - 0.52) / 0.22));
  const p = t < 0.52 ? 0.68 * ease(t / 0.52) : 0.68 + 0.32 * ease(release);
  const settle = Math.max(0, (t - 0.66) / 0.34);
  const recoil =
    0.065 * Math.sin(settle * Math.PI * 2) ** 2 * (1 - settle) ** 2;
  const stick = ease(Math.min(1, t / 0.24)) * (1 - ease(release));
  return {
    islands: from.map((island, i) => {
      const width = island.width + (to[i].width - island.width) * p;
      const squeeze = width * recoil;
      return {
        left: island.left + (to[i].left - island.left) * p + squeeze / 2,
        width: width - squeeze,
        radius: island.radius + (to[i].radius - island.radius) * p,
      };
    }),
    tension: tension * (1 - p) + 2200 * stick,
  };
}

/** A capsule's horizontal slice: y² < field(x). Negative values are real gaps. */
export function dockField(
  width: number,
  islands: DockIsland[],
  tension = 0,
  scales: { x: number; y: number }[] = [],
) {
  const ceiling = Math.max(
    ...islands.map((island, i) => (island.radius * (scales[i]?.y ?? 1)) ** 2),
  );
  return Array.from({ length: samples + 1 }, (_, i) => {
    const x = (i / samples) * width;
    let value = -width * width;
    for (const [index, island] of islands.entries()) {
      const { x: sx, y: sy } = scales[index] ?? { x: 1, y: 1 };
      const localX =
        (x - island.left - island.width / 2) / sx +
        island.left +
        island.width / 2;
      const r = Math.min(island.radius, island.width / 2);
      if (r <= 0) continue;
      const dx = Math.max(
        island.left + r - localX,
        0,
        localX - (island.left + island.width - r),
      );
      const next = (r * r - dx * dx) * sy * sy;
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
export function dockFieldPath(width: number, field: number[], center = 32) {
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
      `M ${points.map(([x, y]) => point(x, center - y)).join(" L ")} L ${points
        .reverse()
        .map(([x, y]) => point(x, center + y))
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
  const accent = useRef<HTMLDivElement>(null);
  const outline = useRef<SVGPathElement>(null);
  const shadow = useRef<SVGPathElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const shape = useRef<{ islands: DockIsland[]; tension: number } | null>(null);
  const target = useRef("");
  const width = useRef(0);
  const frame = useRef(0);
  const pressFrame = useRef(0);
  const controls = useRef<(HTMLElement | null)[]>([]);
  const id = useId();
  const paint = () => {
    if (!shape.current || !glass.current) return;
    const w = width.current + 24;
    const islands = shape.current.islands.map((island) => ({
      ...island,
      left: island.left + 12,
    }));
    const scales = controls.current.map((element) => {
      const matrix =
        element &&
        window.getComputedStyle(element).transform.match(/^matrix\(([^)]+)\)$/);
      const values = matrix?.[1].split(",").map(Number);
      return { x: values?.[0] || 1, y: values?.[3] || 1 };
    });
    const d = dockFieldPath(
      w,
      dockField(w, islands, shape.current.tension, scales),
      44,
    );
    glass.current.style.clipPath = `path("${d}")`;
    if (accent.current)
      accent.current.style.clipPath = `path("${dockFieldPath(w, dockField(w, [islands[1]], 0, [scales[1] ?? { x: 1, y: 1 }]), 44)}")`;
    outline.current!.setAttribute("d", d);
    shadow.current!.setAttribute("d", d);
    svg.current!.setAttribute("viewBox", `0 0 ${w} 88`);
  };
  const measure = () => {
    const node = root.current;
    if (!node) return;
    const w = node.clientWidth;
    if (!w) return; // Hidden desktop dock or a host not yet in the top layer.
    const content = node.querySelector<HTMLElement>(
      ".thumb-dock-content:not([data-outgoing])",
    );
    const tabs = content?.querySelector<HTMLElement>(".safari-dock");
    controls.current = ["back", "primary", "actions"].map(
      (role) =>
        content?.querySelector<HTMLElement>(
          `.context-island.context-${role}`,
        ) ?? null,
    );
    glass.current?.setAttribute(
      "data-accent",
      String(Boolean(controls.current[1])),
    );
    let islands: DockIsland[];
    if (tabs) {
      const side = node.clientHeight || 64;
      const inset = side + 10;
      const radius = side / 2;
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
      const slots = controls.current.map((element) => {
        return element
          ? {
              left:
                Math.round(
                  ((element.getBoundingClientRect().left - bounds.left) /
                    scale +
                    (element.getBoundingClientRect().width / scale -
                      element.offsetWidth) /
                      2) *
                    100,
                ) / 100,
              width: element.offsetWidth,
              radius: (node.clientHeight || 64) / 2,
            }
          : null;
      });
      islands = slots.some(Boolean) ? dockSlots(w, slots) : joinedDock(w);
    }
    node.style.setProperty(
      "--safari-press-scale",
      String(Math.max(1, Math.min(1.06, (window.innerWidth - 8) / w))),
    );
    const key = JSON.stringify([w, islands]);
    if (key === target.current) {
      paint();
      return;
    }
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
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    let pressed: HTMLElement | null = null;
    let pointerId: number | null = null;
    const animations = new Map<HTMLElement, Animation>();
    const feedback = (element: HTMLElement, down: boolean) => {
      const motion = animateDockPress(element, down, animations.get(element));
      if (motion) {
        animations.set(element, motion);
        void motion.finished.then(
          () => {
            if (animations.get(element) === motion) animations.delete(element);
          },
          () => {},
        );
      }
      element.dataset.pressed = String(down);
      cancelAnimationFrame(pressFrame.current);
      const start = performance.now();
      const tick = () => {
        paint();
        if (!reduceMotion() && performance.now() - start < 920)
          pressFrame.current = requestAnimationFrame(tick);
      };
      tick();
    };
    const release = () => {
      if (pressed) feedback(pressed, false);
      pressed = null;
      pointerId = null;
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || event.isPrimary === false) return;
      const target = event.target as HTMLElement;
      const element = target.closest<HTMLElement>(".context-island");
      if (!element || target.closest("[disabled], [inert], [data-outgoing]"))
        return;
      release();
      pressed = element;
      pointerId = event.pointerId;
      feedback(element, true);
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId === pointerId) release();
    };
    const out = (event: PointerEvent) => {
      if (
        event.pointerId === pointerId &&
        !pressed?.contains(event.relatedTarget as Node | null)
      )
        release();
    };
    node.addEventListener("pointerdown", down);
    node.addEventListener("pointerout", out);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("blur", release);
    return () => {
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointerout", out);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", release);
      animations.forEach((animation) => animation.cancel());
      cancelAnimationFrame(pressFrame.current);
    };
  }, []);
  useImperativeHandle(ref, () => ({ measure }));
  useEffect(() => {
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
      <div ref={glass} className="safari-glass">
        <div ref={accent} className="fluid-dock-accent" />
      </div>
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
