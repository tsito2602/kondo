import { flushSync } from "react-dom";
import { reduceMotion } from "./motion";

let active: ViewTransition | undefined;
let cleanupActive: (() => void) | undefined;
let listScroll = 0;
let generation = 0;

/** Share the actual photo separately from its expanding ticket/page surface. */
export function startTripTransition(
  update: () => void,
  tripId: string,
  closing = false,
) {
  const current = ++generation;
  active?.skipTransition();
  cleanupActive?.();
  if (!closing) listScroll = window.scrollY;
  const commit = () => {
    flushSync(update);
    window.scrollTo({ top: closing ? listScroll : 0, behavior: "instant" });
  };
  if (!document.startViewTransition || reduceMotion()) {
    commit();
    return;
  }
  const cleanups: (() => void)[] = [];
  const mark = () => {
    for (const [attribute, name] of [
      ["data-trip-surface", "trip-surface"],
      ["data-trip-cover", "trip-cover"],
    ]) {
      const node = Array.from(
        document.querySelectorAll<HTMLElement>(`[${attribute}]`),
      ).find((node) => node.getAttribute(attribute) === tripId);
      if (!node) continue;
      const previous = node.style.viewTransitionName;
      node.style.viewTransitionName = name;
      cleanups.push(() => {
        node.style.viewTransitionName = previous;
      });
    }
  };
  mark();
  const root = document.documentElement;
  root.dataset.tripTransition = closing ? "close" : "open";
  const transition = document.startViewTransition(async () => {
    if (current !== generation) return;
    commit();
    mark();
    const photo = document.querySelector<HTMLImageElement>(
      '[data-trip-cover][style*="trip-cover"]',
    );
    await photo?.decode?.().catch(() => undefined);
  });
  active = transition;
  const interrupt = () => transition.skipTransition();
  document.addEventListener("pointerdown", interrupt, true);
  document.addEventListener("keydown", interrupt, true);
  void transition.ready.catch(() => undefined);
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    cleanups.reverse().forEach((reset) => reset());
    document.removeEventListener("pointerdown", interrupt, true);
    document.removeEventListener("keydown", interrupt, true);
    if (active === transition) {
      active = undefined;
      cleanupActive = undefined;
      delete root.dataset.tripTransition;
    }
  };
  cleanupActive = cleanup;
  void transition.finished.catch(() => undefined).finally(cleanup);
}
