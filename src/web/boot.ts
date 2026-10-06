import { ease, linearSupported } from "./cartoon";

/** Hand off the original HTML splash without remounting/replaying its SVG. */
export function finishBootScreen() {
  const screen = document.getElementById("initial-boot");
  const root = document.getElementById("root");
  if (!screen) return;
  let cancelled = false;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const remove = () => {
    if (cancelled) return;
    screen.remove();
    root?.removeAttribute("inert");
  };
  const dismiss = async () => {
    // Finished animations may already have elapsed while the app was loading.
    // allSettled also releases the gate if a preference change cancels them.
    if (!motion.matches)
      await Promise.allSettled(
        Array.from(screen.getAnimations({ subtree: true }), (a) => a.finished),
      );
    if (cancelled) return;
    if (!motion.matches && (await landInDock(screen))) return remove();
    if (cancelled) return;
    if (!motion.matches) {
      screen.classList.add("boot-leaving");
      await Promise.allSettled(screen.getAnimations().map((a) => a.finished));
    }
    remove();
  };
  void dismiss();
  return () => {
    cancelled = true;
    screen.classList.remove("boot-leaving");
  };
}

const SVG = "http://www.w3.org/2000/svg";
const UPPER = "M393 395C478 385 555 366 618 374C664 380 654 416 615 447";
const LOWER = "M445 553C417 577 408 598 423 616C449 653 548 647 640 616";
const DOTS = "27.1676 41.5061";
/** The logo's dotted stroke at its on-screen size: 11 px dots every 29 px. */
const DOT_MASK = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='29' height='11'%3E%3Crect width='11.5' height='11' rx='5.5'/%3E%3C/svg%3E") repeat-x 0 0 / 29px 11px`;
const FLY_MS = 480;
const easeIn = (p: number, power: number) =>
  Math.min(1, Math.max(0, p)) ** power;

function make<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  parent.appendChild(el);
  return el;
}

/** The launch's ending (Tsubasa 2026-10-06, mock C'): once こ is written, the
    line runs on along its own strokes and whips off the right edge. A moment
    later the logo's dotted line comes back in from the right at the dock,
    closes up into one line and swells into each island, right one first.
    Only where the phone dock is showing. */
async function landInDock(screen: HTMLElement) {
  const host = document.querySelector<HTMLElement>(
    ".thumb-dock-host:not([hidden])",
  );
  const logo = screen.querySelector<SVGSVGElement>(".boot-symbol");
  const group = logo?.querySelector<SVGGElement>(":scope > g");
  const ctm = group?.getScreenCTM();
  const islands = host
    ? [...host.querySelectorAll<HTMLElement>(".cdock-content > [data-slot]")]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0)
        .sort((a, b) => b.right - a.right)
    : [];
  if (!logo?.animate || !group || !ctm || !host || !islands.length)
    return false;

  // The line leaves along the heading of the こ's last stroke.
  const [x0, y0] = [640, 616];
  const [dx, dy] = [92 / 97.1, -31 / 97.1];
  const exitX = new DOMPoint(innerWidth + 80, 0).matrixTransform(
    ctm.inverse(),
  ).x;
  const exitY = y0 + (dy / dx) * (exitX - x0) - 60;
  const reach = Math.hypot(exitX - x0, exitY - y0);
  const route =
    `${LOWER}C${x0 + dx * reach * 0.45} ${y0 + dy * reach * 0.45} ` +
    `${exitX - reach * 0.3} ${exitY} ${exitX} ${exitY}`;

  const defs = make("defs", {}, group);
  const windowOf = (id: string, d: string) => {
    const mask = make(
      "mask",
      {
        id,
        maskUnits: "userSpaceOnUse",
        x: -20000,
        y: -20000,
        width: 40000,
        height: 40000,
      },
      defs,
    );
    return make(
      "path",
      { d, fill: "none", stroke: "white", "stroke-width": 64 },
      mask,
    );
  };
  const upperWin = windowOf("boot-fly-upper", UPPER);
  const lowerWin = windowOf("boot-fly-lower", route);
  const upper = make(
    "g",
    { mask: "url(#boot-fly-upper)", fill: "none" },
    group,
  );
  make(
    "use",
    {
      class: "boot-edge",
      href: "#boot-upper",
      stroke: "white",
      "stroke-width": 42,
    },
    upper,
  );
  make(
    "use",
    { href: "#boot-upper", stroke: "currentColor", "stroke-width": 34 },
    upper,
  );
  const lower = make(
    "g",
    { mask: "url(#boot-fly-lower)", fill: "none", "stroke-dasharray": DOTS },
    group,
  );
  make(
    "path",
    { class: "boot-edge", d: route, stroke: "white", "stroke-width": 34 },
    lower,
  );
  make("path", { d: route, stroke: "currentColor", "stroke-width": 26 }, lower);

  const lenU = upperWin.getTotalLength();
  const lenL = make("path", { d: LOWER }, defs).getTotalLength();
  const lenR = lowerWin.getTotalLength();
  const total = lenU + lenR;
  const paint = (tail: number, head: number) => {
    upperWin.setAttribute(
      "stroke-dasharray",
      `${Math.max(0, lenU - tail)} 99999`,
    );
    upperWin.setAttribute("stroke-dashoffset", `${-tail}`);
    const from = Math.max(0, tail - lenU);
    lowerWin.setAttribute(
      "stroke-dasharray",
      `${Math.max(0, head - from)} 99999`,
    );
    lowerWin.setAttribute("stroke-dashoffset", `${-from}`);
  };
  paint(0, lenL);
  // The written こ hands over to the line that will fly.
  for (const el of screen.querySelectorAll<SVGElement>(
    ".boot-pen-tip, g[mask^='url(#boot-upper'], g[mask^='url(#boot-lower']",
  ))
    el.style.display = "none";

  screen
    .querySelector(".boot-name")
    ?.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 140,
      fill: "forwards",
    });
  for (const el of screen.querySelectorAll(".boot-pin, .boot-dot"))
    el.animate(
      [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: "scale(.6)" },
      ],
      { duration: 180, easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards" },
    );
  // The page shows through while the line is still in the air.
  screen.animate([{}, { backgroundColor: "transparent" }], {
    duration: 240,
    delay: FLY_MS * 0.35,
    easing: "ease-out",
    fill: "forwards",
  });
  // The real dock waits, hidden, until the line has become it.
  const hide = host.animate([{ opacity: 0 }, { opacity: 0 }], {
    duration: 1e6,
    fill: "both",
  });

  // Each island arrives as the logo's dotted line, joins up and swells.
  const css = getComputedStyle(document.documentElement);
  const ink = css.getPropertyValue("--p-ink").trim();
  const fill = css.getPropertyValue("--p-dock").trim();
  const shadow = css.getPropertyValue("--p-dock-shadow").trim();
  const bounce = ease("boing");
  const springy = linearSupported()
    ? bounce.easing
    : "cubic-bezier(.34,1.56,.64,1)";
  const arrive = FLY_MS + 60;
  const landed = islands.map((r, i) => {
    const at = arrive + i * 60;
    const slug = document.createElement("div");
    slug.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;display:grid;align-items:center;pointer-events:none`;
    const line = document.createElement("div");
    line.style.cssText = `height:11px;border-radius:${r.height / 2}px;position:relative`;
    const dots = document.createElement("i");
    dots.style.cssText = `position:absolute;inset:0;background:${ink};-webkit-mask:${DOT_MASK};mask:${DOT_MASK}`;
    line.appendChild(dots);
    slug.appendChild(line);
    screen.appendChild(slug);
    slug.animate(
      [
        {
          transform: `translateX(${innerWidth - r.left + 80}px) scaleX(1.25)`,
        },
        { transform: "none" },
      ],
      { duration: bounce.ms, easing: springy, delay: at, fill: "backwards" },
    );
    // the dots close up into one line…
    line.animate(
      [{ backgroundColor: "transparent" }, { backgroundColor: ink }],
      {
        duration: 90,
        delay: at + 150,
        fill: "both",
      },
    );
    dots.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 90,
      delay: at + 150,
      fill: "forwards",
    });
    // …which swells into the island and takes on the dock's colour (on a
    // plain ease: a spring would overshoot the colour too).
    line.animate([{ height: "11px" }, { height: `${r.height}px` }], {
      duration: bounce.ms,
      easing: springy,
      delay: at + 220,
      fill: "forwards",
    });
    return line
      .animate(
        [
          { backgroundColor: ink, boxShadow: "none" },
          { backgroundColor: fill, boxShadow: shadow },
        ],
        { duration: 200, delay: at + 220, easing: "ease-out", fill: "both" },
      )
      .finished.catch(() => undefined);
  });

  await new Promise<void>((done) => {
    const start = performance.now();
    const step = (now: number) => {
      const p = (now - start) / FLY_MS;
      const head = lenL + (lenR - lenL) * easeIn(p / 0.7, 2.2);
      const tail = Math.min(total * easeIn(p, 2.6), lenU + head);
      paint(tail, head);
      if (p < 1) requestAnimationFrame(step);
      else done();
    };
    requestAnimationFrame(step);
  });
  await Promise.all(landed);
  // The islands' controls come in over the swollen line, then it steps aside.
  hide.cancel();
  await host
    .animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 })
    .finished.catch(() => undefined);
  return true;
}
