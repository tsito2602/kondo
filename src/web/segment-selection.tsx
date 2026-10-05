// Adapted from tsito2602/uchino. The selected face of a segmented control.
import { useLayoutEffect, useRef } from "react";
import { reduceMotion } from "./motion";

const DURATION = 640;

/** Moves like the dock: it first stretches to reach the new option, then lets go of the old one. */
export function SegmentSelection({ index }: { index: number }) {
  const face = useRef<HTMLSpanElement>(null);
  const previous = useRef<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const node = face.current;
    const host = node?.parentElement;
    if (!node || !host) return;
    const options = () =>
      Array.from(host.children).filter(
        (child): child is HTMLElement =>
          child instanceof HTMLElement && child !== node,
      );
    const place = () => {
      const option = options()[index];
      if (!option) {
        node.hidden = true;
        return null;
      }
      node.hidden = false;
      const box = { left: option.offsetLeft, width: option.offsetWidth };
      node.style.left = `${box.left}px`;
      node.style.width = `${box.width}px`;
      return box;
    };
    const to = place();
    const from = previous.current;
    previous.current = to;
    const observer =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
            previous.current = place();
          })
        : undefined;
    observer?.observe(host);
    let animation: Animation | undefined;
    if (
      to &&
      from &&
      from.left !== to.left &&
      !reduceMotion() &&
      node.animate
    ) {
      const start = Math.min(from.left, to.left);
      const end = Math.max(from.left + from.width, to.left + to.width);
      animation = node.animate(
        [
          {
            left: `${from.left}px`,
            width: `${from.width}px`,
            transform: "none",
          },
          {
            left: `${start}px`,
            width: `${end - start}px`,
            transform: "scaleY(.92)",
            offset: 0.42,
          },
          { left: `${to.left}px`, width: `${to.width}px`, transform: "none" },
        ],
        { duration: DURATION, easing: "cubic-bezier(0.22, 0.72, 0.18, 1)" },
      );
    }
    return () => {
      observer?.disconnect();
      animation?.cancel();
    };
  }, [index]);
  return <span ref={face} className="segment-selection" aria-hidden="true" />;
}
