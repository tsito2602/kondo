import type { RemovalKind } from "@/data/travel-provider";
import { poof } from "./itinerary-motion";

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
  const nodes = [...document.querySelectorAll<HTMLElement>(selector)];
  await Promise.all(nodes.map((node) => poof(node)));
  removeLater(kind, id, message);
}
