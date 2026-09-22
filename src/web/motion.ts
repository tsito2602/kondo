import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router";

export const motionEase = "cubic-bezier(.22, 1, .36, 1)";
export const reduceMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;
let lastOrigin: { element: HTMLElement; time: number } | null = null;

export function captureMotionOrigin(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null;
  const element = target?.closest<HTMLElement>("button, a, [role=button]");
  lastOrigin = element ? { element, time: performance.now() } : null;
}

export function motionOrigin() {
  return lastOrigin && performance.now() - lastOrigin.time < 700
    ? lastOrigin.element
    : null;
}

export function animateDialog(
  dialog: HTMLDialogElement,
  origin: HTMLElement | null,
  closing = false,
  current?: Keyframe,
) {
  if (reduceMotion() || !dialog.animate) return null;
  const bounds = dialog.getBoundingClientRect();
  const source = origin?.isConnected ? origin.getBoundingClientRect() : null;
  const full = {
    clipPath: "inset(0px 0px 0px 0px round 0px)",
    transform: "translateY(0px)",
    opacity: 1,
  };
  let folded: Keyframe = {
    clipPath: "inset(0px 0px 0px 0px round 22px)",
    transform: "translateY(24px)",
    opacity: 0,
  };
  // Reveal the surface from the tapped card without scaling or blurring its text.
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
      opacity: 0.55,
    };
  }
  return dialog.animate(closing ? [current ?? full, folded] : [folded, full], {
    duration: closing ? 180 : 280,
    easing: motionEase,
    fill: "both",
  });
}

const tabOrder = ["itinerary", "places", "packing", "bookings", "notes"];

// Use native snapshots for both sides of a route transition; older browsers
// keep immediate React Router navigation and the short CSS entry motion.
export function useMotionNavigation() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  useEffect(() => {
    let active: ViewTransition | undefined;
    const interrupt = () => active?.skipTransition();
    const click = (event: MouseEvent) => {
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (
        !link ||
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
      if (!document.startViewTransition || reduceMotion()) return;
      event.preventDefault();
      active?.skipTransition();
      active = document.startViewTransition(() => {
        flushSync(() => navigateRef.current(url.pathname + url.search));
      });
      void active.ready.catch(() => undefined);
      void active.finished.catch(() => undefined);
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
