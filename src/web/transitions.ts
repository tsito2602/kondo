import {
  anim,
  cascade,
  morph,
  rect,
  RM,
  sleep,
  spring,
  type Box,
} from "./cartoon";

// The mocks' shared transitions (kondo-cartoon.html §4, and the sheets in
// kondo-bookings / kondo-prep3). Every move is a no-op under reduced motion.

/** A bottom sheet rises with a little overshoot (420 ms) … */
export const SHEET_IN: KeyframeAnimationOptions = {
  duration: 420,
  easing: "cubic-bezier(.2,1.2,.4,1)",
};
/** … and drops away faster (260 ms). */
export const SHEET_OUT: KeyframeAnimationOptions = {
  duration: 260,
  easing: "cubic-bezier(.5,0,.8,.4)",
};

export function sheetIn(sheet: HTMLElement) {
  if (RM()) return Promise.resolve();
  return anim(
    sheet,
    [{ transform: "translateY(100%)" }, { transform: "none" }],
    {
      ...SHEET_IN,
    },
  );
}

export function sheetOut(sheet: HTMLElement) {
  if (RM()) return Promise.resolve();
  const from = getComputedStyle(sheet).transform;
  return anim(
    sheet,
    [
      { transform: from && from !== "none" ? from : "none" },
      { transform: "translateY(100%)" },
    ],
    { ...SHEET_OUT, fill: "forwards" },
  );
}

/** The card a press opened from: the pressed surface, when it is card sized. */
export function cardOrigin(origin: Element | null | undefined) {
  if (!origin?.isConnected) return null;
  const card =
    origin.closest<HTMLElement>("[data-press-card]") ??
    origin.querySelector<HTMLElement>("[data-press-card]") ??
    (origin as HTMLElement);
  const box = card.getBoundingClientRect();
  return box.width > 100 && box.height > 40 ? card : null;
}

export const SHEET_SHADOW = "var(--p-sheet-shadow)";

/** §4 open: the card stretches into the sheet, away from where it sits (the
    far edge leads, the near edge follows 60 ms later, the sides 90 ms later);
    after 300 ms the sheet appears over it and its parts spring in. */
export async function openFromCard(
  card: HTMLElement,
  sheet: HTMLElement,
  {
    parent,
    parts = [...sheet.children] as HTMLElement[],
    radius = 20,
  }: { parent?: HTMLElement; parts?: HTMLElement[]; radius?: number } = {},
) {
  if (RM()) return;
  const s = rect(card),
    to: Box = { ...rect(sheet), r: 30 };
  const up = s.y > to.y + to.h / 2;
  const m = morph({ ...s, r: radius }, to, {
    bg: "var(--p-paper)",
    shadow: SHEET_SHADOW,
    springs: up
      ? { t: "lead", b: "split", l: "boing", r: "boing" }
      : { t: "split", b: "lead", l: "boing", r: "boing" },
    lag: up ? { b: 60, l: 90, r: 90 } : { t: 60, l: 90, r: 90 },
    parent,
    zIndex: -1,
  });
  card.style.visibility = "hidden";
  sheet.style.opacity = "0";
  await sleep(300);
  sheet.style.opacity = "";
  parts.forEach((part, i) =>
    spring(
      part,
      [
        { transform: "translateY(26px) scale(.9)", opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      "boing",
      { delay: i * 45, fill: "backwards" },
    ),
  );
  await m.done;
  m.el.remove();
}

/** §4 close: the sheet fades (90 ms), its shape shrinks back onto the card
    (the sides lead) and the card lands with a squash, scale(1.06, .9). */
export async function closeToCard(
  card: HTMLElement,
  sheet: HTMLElement,
  { parent, radius = 20 }: { parent?: HTMLElement; radius?: number } = {},
) {
  const restore = () => {
    card.style.visibility = "";
  };
  if (RM() || !card.isConnected) return restore();
  const from: Box = { ...rect(sheet), r: 30 };
  await anim(sheet, [{ opacity: 1 }, { opacity: 0 }], {
    duration: 90,
    easing: "ease-in",
    fill: "forwards",
  });
  const m = morph(
    from,
    { ...rect(card), r: radius },
    {
      bg: "var(--p-paper)",
      shadow: "0 0 0 1px var(--p-line)",
      springs: { t: "boing", b: "boing", l: "lead", r: "lead" },
      parent,
    },
  );
  await Promise.race([m.done, sleep(400)]);
  m.el.remove();
  restore();
  void spring(
    card,
    [{ transform: "scale(1.06,.9)" }, { transform: "none" }],
    "boing",
  );
}

/** A screen's parts rise into place one after another (kondo-cartoon §2). */
export { cascade };
