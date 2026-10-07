import { reduceMotion } from "./motion";

/** uchiwake's springs (kondo-theme-cartoon), sampled into CSS linear() easings. */
const SPRINGS = {
  squish: { k: 520, d: 20 },
  boing: { k: 420, d: 14 },
  split: { k: 230, d: 21 },
  lead: { k: 700, d: 34 },
} as const;
type SpringName = keyof typeof SPRINGS;
const cache = new Map<SpringName, { easing: string; ms: number }>();
function sampled(name: SpringName) {
  const hit = cache.get(name);
  if (hit) return hit;
  const { k, d } = SPRINGS[name];
  const values = [0];
  let x = 0;
  let v = 0;
  let t = 0;
  const dt = 1 / 120;
  while (t < 2) {
    v += (-k * (x - 1) - d * v) * dt;
    x += v * dt;
    t += dt;
    values.push(x);
    if (Math.abs(x - 1) < 0.0008 && Math.abs(v) < 0.01) break;
  }
  values[values.length - 1] = 1;
  const step = Math.max(1, Math.floor(values.length / 64));
  let linear = false;
  try {
    linear = CSS.supports("transition-timing-function", "linear(0, 1)");
  } catch {
    linear = false;
  }
  const result = {
    easing: linear
      ? `linear(${values
          .filter((_, i) => i % step === 0 || i === values.length - 1)
          .map((value) => +value.toFixed(4))
          .join(",")})`
      : "cubic-bezier(.34,1.56,.64,1)",
    ms: Math.round(t * 1000),
  };
  cache.set(name, result);
  return result;
}

export function spring(
  element: Element | null | undefined,
  frames: Keyframe[],
  name: SpringName = "boing",
  extra: KeyframeAnimationOptions = {},
): Promise<unknown> {
  if (!element?.animate || reduceMotion()) return Promise.resolve();
  const { easing, ms } = sampled(name);
  return element
    .animate(frames, { duration: ms, easing, ...extra })
    .finished.catch(() => undefined);
}

/** A dot or pin appearing: kondo's "pop". */
export const pop = (element: Element | null | undefined, delay = 0) =>
  spring(
    element,
    [{ transform: "scale(0)" }, { transform: "scale(1)" }],
    "boing",
    {
      delay,
      fill: "backwards",
    },
  );

/** A card dropping into place and flattening on landing: kondo's "sink". */
export function sink(
  element: Element | null | undefined,
  from = -60,
  delay = 0,
) {
  if (!element?.animate || reduceMotion()) return;
  element.animate(
    [
      { transform: `translateY(${from}px) scale(.9,1.12)`, opacity: 0 },
      { transform: "translateY(0) scale(.92,1.1)", opacity: 1, offset: 0.42 },
      { transform: "translateY(0) scale(1.14,.8)", offset: 0.58 },
      { transform: "translateY(-3px) scale(.96,1.05)", offset: 0.78 },
      { transform: "none", opacity: 1 },
    ],
    {
      duration: 420,
      delay,
      easing: "cubic-bezier(.4,0,.6,1)",
      fill: "backwards",
    },
  );
}

/** A deleted card flattens, then bursts into dots: kondo's "poof". */
export async function poof(element: HTMLElement | null | undefined) {
  if (!element?.animate || reduceMotion()) return;
  element.style.transformOrigin = "50% 50%";
  await element
    .animate(
      [
        { transform: "none" },
        { transform: "scale(.94,1.08)", offset: 0.3 },
        { transform: "scale(1.2,.08)" },
      ],
      { duration: 240, easing: "cubic-bezier(.5,0,.8,.4)", fill: "forwards" },
    )
    .finished.catch(() => undefined);
  const box = element.getBoundingClientRect();
  element.style.opacity = "0";
  // Nothing on screen to burst from (a hidden or detached card): no dots at 0,0.
  if (!box.width || !box.height) return;
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  for (let index = 0; index < 12; index++) {
    const angle = (index / 12) * Math.PI * 2 + Math.random() * 0.5;
    const distance = 90 * (0.6 + Math.random() * 0.6);
    const size = 8 + Math.random() * 8;
    const dot = document.createElement("i");
    dot.className = "itinerary-poof-dot";
    dot.setAttribute("aria-hidden", "true");
    Object.assign(dot.style, {
      left: `${cx - size / 2}px`,
      top: `${cy - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
    });
    document.body.appendChild(dot);
    void dot
      .animate(
        [
          { transform: "translate(0,0) scale(.4)" },
          {
            transform: `translate(${Math.cos(angle) * distance * 0.7}px,${Math.sin(angle) * distance * 0.7}px) scale(1.2)`,
            offset: 0.45,
          },
          {
            transform: `translate(${Math.cos(angle) * distance}px,${Math.sin(angle) * distance + 18}px) scale(0)`,
          },
        ],
        { duration: 520, easing: "cubic-bezier(.2,.7,.3,1)" },
      )
      .finished.catch(() => undefined)
      .finally(() => dot.remove());
  }
}
