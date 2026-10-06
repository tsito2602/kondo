import { RM } from "./cartoon";

// The 予約 mock's own sink (kondo-bookings.html SINK): softer than the
// cartoon one, 460 ms on cubic-bezier(.4,0,.6,1), held back until its delay.
export const BOOKING_SINK = (from: number): Keyframe[] => [
  { transform: `translateY(${from}px) scale(.9,1.12)`, opacity: 0 },
  { transform: "translateY(0) scale(.92,1.1)", opacity: 1, offset: 0.42 },
  { transform: "translateY(0) scale(1.06,.9)", offset: 0.6 },
  { transform: "translateY(-2px) scale(.99,1.02)", offset: 0.8 },
  { transform: "none", opacity: 1 },
];
export function bookingSink(element: Element, from: number, delay = 0) {
  if (RM() || !element.animate) return;
  element.animate(BOOKING_SINK(from), {
    duration: 460,
    delay,
    easing: "cubic-bezier(.4,0,.6,1)",
    fill: "backwards",
  });
}
