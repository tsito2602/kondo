import { squishDown, squishTarget, squishUp } from "./cartoon";
import { reduceMotion } from "./motion";

/** The mocks' squish under the finger (scale 2-v, v on k600/d22, released on
    k420/d13), for every control in cartoon.ts's table, by pointer or key. */
export function installPressFeedback() {
  const amounts = new Map<HTMLElement, number>();
  let active:
    | {
        element: HTMLElement;
        pointerId?: number;
        key?: string;
        x?: number;
        y?: number;
      }
    | undefined;
  const animate = (element: HTMLElement, pressed: boolean) => {
    if (pressed) void squishDown(element, amounts.get(element) ?? 0.97);
    else void squishUp(element);
  };
  const release = () => {
    if (!active) return;
    const { element } = active;
    active = undefined;
    animate(element, false);
    delete element.dataset.pressActive;
  };
  const target = (event: Event) => {
    if (!(event.target instanceof Element)) return null;
    const control = event.target.closest<HTMLElement>(
      "button, a, [role=button]",
    );
    if (
      !control ||
      control.closest('[inert], :disabled, [aria-disabled="true"]')
    )
      return null;
    // A card squishes as one surface even when its press lands on a control
    // inside it; timeline time/marker columns stay still.
    const hit =
      squishTarget(event.target) ??
      (control.querySelector<HTMLElement>("[data-press-card]")
        ? squishTarget(control.querySelector<HTMLElement>("[data-press-card]")!)
        : null);
    if (!hit) return null;
    amounts.set(hit[0], hit[1]);
    return hit[0];
  };
  const press = (element: HTMLElement) => {
    release();
    animate(element, true);
    // Hold the final scale after the entrance timeline finishes.
    element.dataset.pressActive = "true";
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || event.isPrimary === false || reduceMotion())
      return;
    const element = target(event);
    if (!element) return;
    press(element);
    active = {
      element,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  };
  const move = (event: PointerEvent) => {
    if (
      active?.pointerId === event.pointerId &&
      Math.hypot(
        event.clientX - (active.x ?? event.clientX),
        event.clientY - (active.y ?? event.clientY),
      ) > 10
    )
      release();
  };
  const up = (event: PointerEvent) => {
    if (active?.pointerId === event.pointerId) release();
  };
  const out = (event: PointerEvent) => {
    if (
      active?.pointerId === event.pointerId &&
      event.target instanceof Node &&
      active.element.contains(event.target) &&
      !(
        event.relatedTarget instanceof Node &&
        active.element.contains(event.relatedTarget)
      )
    )
      release();
  };
  const keydown = (event: KeyboardEvent) => {
    if (
      event.repeat ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      !["Enter", " "].includes(event.key) ||
      reduceMotion()
    )
      return;
    const element = target(event);
    if (!element || (event.key === " " && element.tagName === "A")) return;
    press(element);
    active = { element, key: event.key };
  };
  const keyup = (event: KeyboardEvent) => {
    if (active?.key === event.key) release();
  };
  const visibility = () => {
    if (document.hidden) release();
  };
  document.addEventListener("pointerdown", down, true);
  document.addEventListener("pointerup", up, true);
  document.addEventListener("pointermove", move, true);
  document.addEventListener("pointercancel", up, true);
  document.addEventListener("pointerout", out, true);
  document.addEventListener("keydown", keydown, true);
  document.addEventListener("keyup", keyup, true);
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("blur", release);
  return () => {
    document.removeEventListener("pointerdown", down, true);
    document.removeEventListener("pointerup", up, true);
    document.removeEventListener("pointermove", move, true);
    document.removeEventListener("pointercancel", up, true);
    document.removeEventListener("pointerout", out, true);
    document.removeEventListener("keydown", keydown, true);
    document.removeEventListener("keyup", keyup, true);
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("blur", release);
    if (active) {
      delete active.element.dataset.pressActive;
      animate(active.element, false);
    }
    amounts.clear();
  };
}
