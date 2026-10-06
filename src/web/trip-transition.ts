import { flushSync } from "react-dom";
import { anim, morph, rect, sleep, spring, type Box } from "./cartoon";
import { reduceMotion } from "./motion";

// kondo-cartoon.html §2 (ticket): opening a trip, the card stretches into the
// screen, top edge first (lead), the bottom 70 ms behind (split), the sides
// 120 ms behind (boing). 200 ms in the dock turns to the trip's tabs, 230 ms
// later the trip is underneath and the ink fades off it in 240 ms (ease-out).
// Back: ink covers the trip in 160 ms, home returns underneath, and the ink
// shrinks into the card (bottom leads, top 60 ms behind on split); after the
// shrink settles or 480 ms the card shows and gives a boing (1.03, .95).
// The mock's card is a ticket with a stub; home's cards are photo cards, so
// there is no stub to tear.

let listScroll = 0;
let generation = 0;
const CARD_RADIUS = 26;

const screenBox = (): Box => ({
  x: 0,
  y: 0,
  w: window.innerWidth,
  h: window.innerHeight,
  // The mock's phone corners; a wide window has square ones.
  r: window.innerWidth < 760 ? 54 : 0,
});
const cardOf = (tripId: string) =>
  Array.from(
    document.querySelectorAll<HTMLElement>(".home-trip[data-trip-surface]"),
  ).find((node) => node.dataset.tripSurface === tripId);
const onScreen = (box: Box) =>
  box.w > 0 && box.y < window.innerHeight && box.y + box.h > 0;
// Under the dock (40), as in the mock. Ink in light mode; black in dark mode,
// where ink is white (Tsubasa 2026-10-06).
const MORPH = { zIndex: 30, bg: "var(--trip-morph, var(--p-ink))" } as const;

/** Open a trip from its home card, or go back home into that card. */
export function startTripTransition(
  update: () => void,
  tripId: string,
  closing = false,
) {
  const current = ++generation;
  if (!closing) listScroll = window.scrollY;
  const commit = () => {
    flushSync(update);
    window.scrollTo({ top: closing ? listScroll : 0, behavior: "instant" });
  };
  if (reduceMotion()) {
    commit();
    return;
  }
  const root = document.documentElement;
  root.dataset.tripTransition = closing ? "close" : "open";
  const finish = () => {
    if (current === generation) delete root.dataset.tripTransition;
  };
  void (
    closing ? close(commit, tripId, current) : open(commit, tripId, current)
  )
    .catch(() => undefined)
    .finally(finish);
}

async function open(commit: () => void, tripId: string, current: number) {
  const card = cardOf(tripId);
  const from = card && rect(card);
  if (!card || !from || !onScreen(from)) {
    commit();
    return;
  }
  const m = morph({ ...from, r: CARD_RADIUS }, screenBox(), {
    ...MORPH,
    springs: { t: "lead", b: "split", l: "boing", r: "boing" },
    lag: { b: 70, l: 120, r: 120 },
  });
  card.style.visibility = "hidden";
  await sleep(200 + 230);
  if (current === generation) commit();
  card.style.visibility = "";
  await anim(m.el, [{ opacity: 1 }, { opacity: 0 }], {
    duration: 240,
    easing: "ease-out",
    fill: "forwards",
  });
  m.el.remove();
}

async function close(commit: () => void, tripId: string, current: number) {
  const cover = morph(screenBox(), screenBox(), MORPH);
  cover.el.style.opacity = "0";
  await anim(cover.el, [{ opacity: 0 }, { opacity: 1 }], {
    duration: 160,
    fill: "forwards",
  });
  cover.el.style.opacity = "";
  if (current !== generation) {
    cover.el.remove();
    return;
  }
  commit();
  const card = cardOf(tripId);
  const to = card && rect(card);
  if (!card || !to || !onScreen(to)) {
    await anim(cover.el, [{ opacity: 1 }, { opacity: 0 }], {
      duration: 240,
      easing: "ease-out",
      fill: "forwards",
    });
    cover.el.remove();
    return;
  }
  card.style.visibility = "hidden";
  const back = morph(
    screenBox(),
    { ...to, r: CARD_RADIUS },
    {
      ...MORPH,
      springs: { t: "split", b: "lead", l: "boing", r: "boing" },
      lag: { t: 60 },
    },
  );
  cover.el.remove();
  await Promise.race([back.done, sleep(480)]);
  card.style.visibility = "";
  back.el.remove();
  void spring(card, [{ transform: "scale(1.03,.95)" }, { transform: "none" }]);
}
