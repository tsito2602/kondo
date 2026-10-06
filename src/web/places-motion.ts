import { reduceMotion } from "./motion";

/** Samples a damped spring (uchiwake's cartoon-motion numbers) into CSS `linear()`. */
function linearSpring(stiffness: number, damping: number) {
  const values = [0];
  let x = 0;
  let velocity = 0;
  let time = 0;
  const dt = 1 / 120;
  while (time < 2) {
    velocity += (-stiffness * (x - 1) - damping * velocity) * dt;
    x += velocity * dt;
    time += dt;
    values.push(x);
    if (Math.abs(x - 1) < 0.0008 && Math.abs(velocity) < 0.01) break;
  }
  values[values.length - 1] = 1;
  const step = Math.max(1, Math.floor(values.length / 64));
  const points = values
    .filter((_, index) => index % step === 0 || index === values.length - 1)
    .map((value) => +value.toFixed(4));
  return {
    easing: `linear(${points.join(",")})`,
    duration: Math.round(time * 1000),
  };
}

const BOING = linearSpring(420, 14);
let linearEasing = false;
try {
  linearEasing = CSS.supports("transition-timing-function", "linear(0, 1)");
} catch {
  /* Older engines fall back to an overshooting bezier. */
}

/** boing (k420/d14): things that arrive, such as the place card and edge arrows. */
export function boing(element: Element, frames: Keyframe[], delay = 0) {
  if (reduceMotion() || !element.animate) return null;
  return element.animate(frames, {
    duration: BOING.duration,
    easing: linearEasing ? BOING.easing : "cubic-bezier(.34,1.56,.64,1)",
    delay,
    fill: "backwards",
  });
}

const SINK: Keyframe[] = [
  { transform: "translateY(-46px) scale(.9,1.12)", opacity: 0 },
  { transform: "translateY(0) scale(.92,1.1)", opacity: 1, offset: 0.42 },
  { transform: "scale(1.18,.74)", offset: 0.58 },
  { transform: "translateY(-3px) scale(.95,1.06)", offset: 0.78 },
  { transform: "none", opacity: 1 },
];
/** sink: a pin drops and flattens on landing. */
export function sink(element: Element, delay = 0) {
  if (reduceMotion() || !element.animate) return null;
  return element.animate(SINK, {
    duration: 400,
    delay,
    easing: "cubic-bezier(.4,0,.6,1)",
    fill: "backwards",
  });
}

/** A chosen pin hops once so the eye finds it. */
export function hop(element: Element) {
  if (reduceMotion() || !element.animate) return null;
  return element.animate(
    [
      { transform: "none" },
      { transform: "translateY(-14px) scale(.92,1.1)", offset: 0.35 },
      { transform: "scale(1.15,.82)", offset: 0.6 },
      { transform: "none" },
    ],
    { duration: 420, easing: "cubic-bezier(.4,0,.6,1)" },
  );
}
