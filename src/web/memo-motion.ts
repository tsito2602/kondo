import { reduceMotion } from "./motion";

/** uchiwake's springs, sampled into CSS linear() easings (see kondo-theme-cartoon). */
const SPRINGS = {
  squish: { k: 520, d: 20 },
  boing: { k: 420, d: 14 },
  split: { k: 230, d: 21 },
} as const;
export type SpringName = keyof typeof SPRINGS;
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
  const easing = linear
    ? `linear(${values
        .filter((_, i) => i % step === 0 || i === values.length - 1)
        .map((value) => +value.toFixed(4))
        .join(",")})`
    : "cubic-bezier(.34,1.56,.64,1)";
  const result = { easing, ms: Math.round(t * 1000) };
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

/** A pin flattening on landing: kondo's "sink". */
export function sink(
  element: Element | null | undefined,
  from: number,
  delay = 0,
) {
  if (!element?.animate || reduceMotion()) return;
  element.animate(
    [
      { transform: `translateY(${from}px) scale(.9,1.12)`, opacity: 0 },
      { transform: "translateY(0) scale(.92,1.1)", opacity: 1, offset: 0.42 },
      { transform: "translateY(0) scale(1.06,.9)", offset: 0.6 },
      { transform: "translateY(-2px) scale(.99,1.02)", offset: 0.8 },
      { transform: "none", opacity: 1 },
    ],
    {
      duration: 460,
      delay,
      easing: "cubic-bezier(.4,0,.6,1)",
      fill: "backwards",
    },
  );
}

/** A deleted card flattens, then bursts into dots: kondo's "poof". */
export async function poof(element: HTMLElement | null | undefined) {
  if (!element?.animate || reduceMotion()) return;
  const box = element.getBoundingClientRect();
  await element
    .animate(
      [{ transform: "none" }, { transform: "scale(1.04,.2)", opacity: 0.8 }],
      { duration: 200, easing: "cubic-bezier(.5,0,.9,.5)", fill: "forwards" },
    )
    .finished.catch(() => undefined);
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const dots = Array.from({ length: 9 }, (_, k) => {
    const angle = (k / 9) * Math.PI * 2;
    const distance = 34 + (k % 3) * 14;
    const dot = document.createElement("i");
    dot.className = "memo-poof-dot";
    dot.setAttribute("aria-hidden", "true");
    dot.style.left = `${cx - 4}px`;
    dot.style.top = `${cy - 4}px`;
    document.body.appendChild(dot);
    return dot
      .animate(
        [
          { transform: "scale(1)", opacity: 1 },
          {
            transform: `translate(${Math.cos(angle) * distance * 1.6}px,${Math.sin(angle) * distance * 0.7}px) scale(0)`,
            opacity: 0,
          },
        ],
        { duration: 420, easing: "cubic-bezier(.15,.8,.3,1)" },
      )
      .finished.catch(() => undefined)
      .finally(() => dot.remove());
  });
  void Promise.all(dots);
}
