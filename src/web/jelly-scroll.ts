import { useEffect, type RefObject } from "react";
import { Live, RM } from "./cartoon";

// Jelly scroll, as in kondo-itinerary.html and kondo-cartoon.html (section 3):
// a fast scroll leaves the items a little behind, and they settle on a spring.
// Each scroll step adds d × .55 to the lag (clamped to ±36 px, steps ≥ 120 px
// are jumps and add nothing); the lag springs back to 0 on k240 / d13. An item
// moves by lag × f × .9, where f is its distance down the visible area
// (0 at the top, 1 at the bottom), so the top holds and the bottom trails.
// Items more than 30 % above or 20 % below the visible area are left alone.

export type JellyOptions = {
  /** The scrolling element; the page itself (window) when omitted. */
  scroller?: HTMLElement | null;
  /** Skip while false, e.g. while the list's pane is hidden. */
  enabled?: () => boolean;
};

/** Starts jelly scroll on the items `items()` returns; returns a cleanup. */
export function jellyScroll(
  items: () => Iterable<HTMLElement>,
  { scroller = null, enabled = () => true }: JellyOptions = {},
) {
  const target: HTMLElement | Window = scroller ?? window;
  const top = () => (scroller ? scroller.scrollTop : window.scrollY);
  const view = () =>
    scroller
      ? {
          y: scroller.getBoundingClientRect().top + scroller.clientTop,
          h: scroller.clientHeight,
        }
      : { y: 0, h: window.innerHeight };
  // What this module set, so a moved item is measured where it would rest.
  const shift = new WeakMap<HTMLElement, number>();
  const touched = new Set<HTMLElement>();
  const place = (el: HTMLElement, px: number) => {
    if (px) {
      el.style.translate = `0 ${px.toFixed(2)}px`;
      shift.set(el, +px.toFixed(2));
      touched.add(el);
    } else if (shift.get(el)) {
      el.style.translate = "";
      shift.delete(el);
      touched.delete(el);
    }
  };
  const jelly = new Live(
    0,
    (v) => {
      const { y, h } = view();
      // Read every position before writing any, so a frame lays out once.
      const rows = [...items()].map((el) => ({
        el,
        f: (el.getBoundingClientRect().top - (shift.get(el) ?? 0) - y) / h,
      }));
      for (const { el, f } of rows) {
        if (f < -0.3 || f > 1.2) place(el, 0);
        else place(el, Math.abs(v) < 0.1 ? 0 : v * Math.max(0, f) * 0.9);
      }
    },
    { k: 240, d: 13 },
  );
  let lastTop = top();
  const onScroll = () => {
    const d = top() - lastTop;
    lastTop = top();
    if (!enabled()) return;
    if (!RM() && Math.abs(d) < 120) {
      jelly.v = Math.max(-36, Math.min(36, jelly.v + d * 0.55));
      void jelly.to(0);
    }
  };
  target.addEventListener("scroll", onScroll, { passive: true });
  return () => {
    target.removeEventListener("scroll", onScroll);
    jelly.stop();
    for (const el of touched) el.style.translate = "";
    touched.clear();
  };
}

/** React form: the items are `selector` matches inside `root`.
    `scroller` is a ref to the scrolling element; the page scrolls when omitted. */
export function useJellyScroll(
  root: RefObject<HTMLElement | null>,
  selector: string,
  {
    scroller,
    enabled,
  }: { scroller?: RefObject<HTMLElement | null>; enabled?: () => boolean } = {},
) {
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    return jellyScroll(() => node.querySelectorAll<HTMLElement>(selector), {
      scroller: scroller?.current ?? null,
      enabled,
    });
    // The enabled callback is read live; re-subscribing on every render is waste.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, selector, scroller]);
}
