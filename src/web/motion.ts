import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router";
import { isHapticTouch } from "./haptics";

export const motionEase = "cubic-bezier(.22, 1, .36, 1)";
export const reduceMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;
let lastOrigin: { element: HTMLElement; time: number } | null = null;

export function captureMotionOrigin(event: MouseEvent) {
  if (isHapticTouch(event.target)) return;
  const target = event.target instanceof Element ? event.target : null;
  const element = target?.closest<HTMLElement>("button, a, [role=button]");
  lastOrigin = element ? { element, time: performance.now() } : null;
}

export function motionOrigin() {
  return lastOrigin && performance.now() - lastOrigin.time < 700
    ? lastOrigin.element
    : null;
}

// Keep one timeline alive for the lifetime of the dialog. Reversing it also
// handles dismissal halfway through opening, without sampling `clip-path:none`.
export function animateDialog(
  dialog: HTMLDialogElement,
  origin: HTMLElement | null,
) {
  if (reduceMotion() || !dialog.animate) return null;
  // The mobile dock is a sibling in the dialog's top layer; animate only the
  // reading panel so its material never moves or fades with the page.
  const panel = matchMedia("(max-width: 759px)").matches
    ? (dialog.querySelector<HTMLElement>(".modal-inner") ?? dialog)
    : dialog;
  const bounds = panel.getBoundingClientRect();
  const source = origin?.isConnected ? origin.getBoundingClientRect() : null;
  const full = {
    clipPath: `inset(0px 0px 0px 0px round ${window.getComputedStyle(panel).borderRadius || "0px"})`,
    transform: "translateY(0px)",
    opacity: 1,
  };
  let folded: Keyframe = {
    clipPath: "inset(0px 0px 0px 0px round 22px)",
    transform: "translateY(48px)",
    opacity: 0,
  };
  if (
    source &&
    source.width > 100 &&
    source.height > 65 &&
    source.bottom > bounds.top &&
    source.top < bounds.bottom &&
    source.right > bounds.left &&
    source.left < bounds.right
  ) {
    const top = Math.max(0, source.top - bounds.top);
    const right = Math.max(0, bounds.right - source.right);
    const bottom = Math.max(0, bounds.bottom - source.bottom);
    const left = Math.max(0, source.left - bounds.left);
    folded = {
      clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px round 16px)`,
      transform: "translateY(0px)",
      opacity: 0,
    };
  }
  return panel.animate([folded, full], {
    duration: 320,
    easing: "cubic-bezier(.32, 0, .2, 1)",
    fill: "both",
  });
}

// Save/Done actions use the same exit path as Escape, backdrop and close button.
// Capture a particular dialog before awaiting a save; never close a newer dialog.
export function dismissModal(
  afterClose: () => void,
  dialog?: HTMLDialogElement | null,
) {
  const target =
    dialog === undefined
      ? Array.from(
          document.querySelectorAll<HTMLDialogElement>("dialog.modal[open]"),
        ).at(-1)
      : dialog;
  if (!target?.isConnected) {
    afterClose();
    return;
  }
  target.dispatchEvent(
    new CustomEvent("tabi:modal-close", { detail: afterClose }),
  );
}

const tabOrder = [
  "itinerary",
  "places",
  "tasks",
  "packing",
  "bookings",
  "notes",
];

let enterTimer = 0;

// The incoming snapshot is live, so the page's pieces rise in a short stagger
// inside it (CSS). Drop the class once that is over, so rows added later are
// never delayed.
function markPageEnter() {
  const page = document.getElementById("main-content");
  if (!page) return;
  page.classList.remove("route-page-enter");
  void page.offsetWidth;
  page.classList.add("route-page-enter");
  window.clearTimeout(enterTimer);
  enterTimer = window.setTimeout(
    () => page.classList.remove("route-page-enter"),
    1100,
  );
}

// Pin each snapshot to its own viewport coordinates. The browser's default
// group animation otherwise interpolates a scrolled, tall page into the next
// page's top/height, visibly pulling the outgoing content back to the top.
export function startRouteTransition(update: () => void) {
  const capture = (side: "old" | "new") => {
    const bounds = document
      .getElementById("main-content")
      ?.getBoundingClientRect();
    for (const property of ["top", "left", "width", "height"] as const) {
      document.documentElement.style.setProperty(
        `--route-${side}-${property}`,
        `${bounds?.[property] ?? 0}px`,
      );
    }
    // View-transition snapshots paint above sticky/fixed chrome regardless of
    // its z-index. Keep scrolled itinerary pixels out of the live header.
    const header = document.querySelector<HTMLElement>(
      ".trip-header, .home-header, .simple-header",
    );
    document.documentElement.style.setProperty(
      `--route-${side}-header-bottom`,
      `${Math.max(0, header?.getBoundingClientRect().bottom ?? 0)}px`,
    );
  };
  capture("old");
  const transition = document.startViewTransition(() => {
    flushSync(update);
    markPageEnter();
    capture("new");
  });
  void transition.ready.catch(() => undefined);
  void transition.finished.catch(() => undefined);
  return transition;
}

// Use native snapshots for both sides of a route transition; older browsers
// keep immediate React Router navigation. Only the content is snapshotted.
export function useMotionNavigation() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  useEffect(() => {
    let active: ViewTransition | undefined;
    const interrupt = () => active?.skipTransition();
    const click = (event: MouseEvent) => {
      // The iPhone haptic label's own click is not a navigation.
      if (isHapticTouch(event.target)) return;
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (
        !link ||
        link.hasAttribute("data-dock-managed") ||
        link.hasAttribute("data-motion-managed") ||
        link.closest('[data-dock-hold="true"]') ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        link.hasAttribute("download") ||
        (link.target && link.target !== "_self")
      )
        return;
      const url = new URL(link.href);
      if (
        url.origin !== window.location.origin ||
        url.hash ||
        url.pathname === "/settings" ||
        url.pathname === window.location.pathname
      )
        return;
      const from = tabOrder.indexOf(
        window.location.pathname.split("/").at(-1) ?? "",
      );
      const to = tabOrder.indexOf(url.pathname.split("/").at(-1) ?? "");
      document.documentElement.style.setProperty(
        "--route-direction",
        String(from >= 0 && to >= 0 && to < from ? -1 : 1),
      );
      // Between one trip's tabs the mocks swap the page at once (only its
      // parts drop in), so no page cross-fade or slide.
      const trip = (path: string) => path.split("/").slice(0, 3).join("/");
      if (
        from >= 0 &&
        to >= 0 &&
        trip(url.pathname) === trip(window.location.pathname)
      )
        return;
      if (!document.startViewTransition || reduceMotion()) return;
      event.preventDefault();
      active?.skipTransition();
      active = startRouteTransition(() =>
        navigateRef.current(url.pathname + url.search),
      );
    };
    document.addEventListener("pointerdown", interrupt, true);
    document.addEventListener("keydown", interrupt, true);
    document.addEventListener("click", click, true);
    return () => {
      document.removeEventListener("pointerdown", interrupt, true);
      document.removeEventListener("keydown", interrupt, true);
      document.removeEventListener("click", click, true);
      active?.skipTransition();
    };
  }, []);
}
