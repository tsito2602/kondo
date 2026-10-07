import type { RemovalKind } from "@/data/travel-provider";
import { poof } from "./itinerary-motion";

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

/**
 * Every delete poofs (flattens, then bursts into dots) like しおり's plans and
 * the memo tiles, and only then leaves the list with 元に戻す in the dock.
 */
export async function poofAway(
  removeLater: (kind: RemovalKind, id: string, message: string) => void,
  kind: RemovalKind,
  id: string,
  message: string,
  selector: string,
  wait = 0,
) {
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  // Let the closing panel unmount first: it hands its card back (visible
  // again), and a copy of the card inside the panel must not burst from 0,0.
  await frame();
  await frame();
  const nodes = [...document.querySelectorAll<HTMLElement>(selector)].filter(
    (node) => {
      if (node.closest("dialog")) return false;
      const box = node.getBoundingClientRect();
      return (
        box.width > 0 &&
        box.height > 0 &&
        box.bottom > 0 &&
        box.top < innerHeight
      );
    },
  );
  await Promise.all(nodes.map((node) => poof(node)));
  // The gap closes up on a spring before the list lets it go.
  await Promise.all(nodes.map(collapse));
  removeLater(kind, id, message);
}

function collapse(node: HTMLElement) {
  if (!node.animate || node.closest(".home-trips-grid, .memo-grid"))
    return Promise.resolve();
  const style = getComputedStyle(node);
  node.style.overflow = "hidden";
  return node
    .animate(
      [
        {
          height: `${node.offsetHeight}px`,
          marginTop: style.marginTop,
          marginBottom: style.marginBottom,
        },
        { height: "0px", marginTop: "0px", marginBottom: "0px" },
      ],
      { duration: 300, easing: "cubic-bezier(.3,0,.2,1)", fill: "forwards" },
    )
    .finished.catch(() => undefined);
}
