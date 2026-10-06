import { useEffect, useRef, type RefObject } from "react";
import { anim, Live, pop, RM, sleep, spring } from "./cartoon";

// kondo-cartoon.html §8: pull home down and the logo stretches like rubber.
// setPull(px): the list moves down px; the logo scales (1 - .12k, 1 +
// max(0, px - 40) / 160) with k = min(1, px / 120) and draws itself in as k
// grows (dot, top stroke, dots one by one, pin last). A Live on k300/d14
// springs it back. Released at 110 px or more it syncs: the logo is shown
// whole, its dots pop 40 ms apart, it squashes (1.25, .72) and boings back,
// 「同期しました」 pops in, the list holds at 90 px while the logo wobbles
// (600 ms), waits 300 ms, then everything springs back to 0.

const LOGO = {
  top: "M393 395C478 385 555 366 618 374C664 380 654 416 615 447",
  bot: "M445 553C417 577 408 598 423 616C449 653 548 647 640 616",
  pin: "M705 528C682 528 665 545 665 567C665 588 683 612 705 637C727 612 745 588 745 567C745 545 728 528 705 528ZM719 567A14 14 0 1 0 691 567A14 14 0 1 0 719 567Z",
};
const PULL_SPRING = { k: 300, d: 14 };
const SVG_NS = "http://www.w3.org/2000/svg";

/** The mock's dotted bottom stroke, cut into separate dots (27.17 on, 41.5 off). */
function buildDashes(svg: SVGSVGElement) {
  const group = svg.querySelector("g")!;
  group.replaceChildren();
  const src = document.createElementNS(SVG_NS, "path");
  src.setAttribute("d", LOGO.bot);
  svg.appendChild(src);
  const length = src.getTotalLength?.() ?? 0;
  const on = 27.17,
    off = 41.5;
  for (let s = 0; s < length; s += on + off) {
    let d = "";
    for (let i = 0; i <= 5; i++) {
      const p = src.getPointAtLength(Math.min(length, s + (on * i) / 5));
      d += `${i ? " L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }
    const dash = document.createElementNS(SVG_NS, "path");
    dash.setAttribute("d", d);
    dash.setAttribute("class", "ls pop");
    dash.setAttribute("stroke-width", "26");
    group.appendChild(dash);
  }
  src.remove();
  return Array.from(group.children) as SVGPathElement[];
}

const syncedAt = () => {
  const now = new Date();
  return `同期しました · ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
};

/** The pull-to-sync logo above home's list; `content` is what moves down. */
export function HomePull({
  content,
  onSync,
}: {
  content: RefObject<HTMLElement | null>;
  onSync: () => unknown;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const msgRef = useRef<HTMLElement>(null);
  const sync = useRef(onSync);
  sync.current = onSync;
  useEffect(() => {
    const svg = svgRef.current,
      msg = msgRef.current,
      page = content.current;
    if (!svg || !msg || !page) return;
    const dot = svg.querySelector<SVGElement>(".dot")!;
    const top = svg.querySelector<SVGPathElement>(".top")!;
    const pin = svg.querySelector<SVGElement>(".pin")!;
    const dashes = buildDashes(svg);
    let done = false;
    let busy = false;
    const show = () => {
      dot.style.transform = "";
      top.style.strokeDashoffset = "0";
      dashes.forEach((d) => (d.style.opacity = "1"));
      pin.style.opacity = "1";
    };
    const setPull = (px: number) => {
      page.style.transform = px ? `translateY(${px}px)` : "";
      svg.parentElement!.hidden = !px;
      const k = Math.min(1, px / 120);
      svg.style.transform = `scale(${(1 - k * 0.12).toFixed(3)},${(1 + Math.max(0, px - 40) / 160).toFixed(3)})`;
      if (done) return;
      dashes.forEach(
        (d, i) => (d.style.opacity = k > 0.35 + i * 0.1 ? "1" : "0"),
      );
      pin.style.opacity = k >= 0.95 ? "1" : "0";
      top.style.strokeDashoffset = String(1 - Math.min(1, k / 0.35));
      dot.style.transform = `scale(${Math.min(1, k / 0.15)})`;
    };
    const live = new Live(0, setPull, PULL_SPRING);
    setPull(0);
    const release = async (px: number) => {
      busy = true;
      if (px >= 110) {
        done = true;
        show();
        dashes.forEach((d, i) => void pop(d, i * 40));
        svg.style.transform = "";
        void spring(svg, [
          { transform: "scale(1.25,.72)" },
          { transform: "none" },
        ]);
        msg.textContent = syncedAt();
        msg.style.opacity = "1";
        void spring(msg, [
          { transform: "scale(.6)", opacity: 0 },
          { transform: "none", opacity: 1 },
        ]);
        void Promise.resolve()
          .then(() => sync.current())
          .catch(() => undefined);
        live.set(px);
        await live.to(90, PULL_SPRING);
        await anim(
          svg,
          [
            { transform: "none" },
            { transform: "scale(1.08,.92) rotate(-6deg)", offset: 0.3 },
            { transform: "scale(.95,1.06) rotate(5deg)", offset: 0.6 },
            { transform: "none" },
          ],
          { duration: 600, iterations: 1 },
        );
        await sleep(300);
      } else live.set(px);
      msg.style.opacity = "0";
      await live.to(0, PULL_SPRING);
      done = false;
      setPull(0);
      busy = false;
    };

    // Touch: a downward drag while the page is at the top pulls instead of
    // scrolling. Mouse/pen: a drag that starts off the controls, as in the mock.
    let pull: { y: number; px: number } | null = null;
    const atTop = () => window.scrollY <= 0;
    const start = (y: number) => {
      if (busy || !atTop() || document.querySelector("dialog[open], .modal"))
        return;
      pull = { y, px: 0 };
    };
    const move = (y: number, event: Event) => {
      if (!pull) return;
      const dy = y - pull.y;
      if (dy <= 0 && !pull.px) {
        pull = null; // scrolling up the list, not a pull
        return;
      }
      if (event.cancelable) event.preventDefault();
      // A mouse drag would select the cards' text.
      window.getSelection()?.removeAllRanges();
      pull.px = Math.max(0, Math.min(150, dy * 0.6));
      setPull(pull.px);
    };
    const end = () => {
      if (!pull) return;
      const { px } = pull;
      pull = null;
      if (px) void release(px);
    };
    const touchStart = (e: TouchEvent) =>
      e.touches.length === 1 && !RM() && start(e.touches[0].clientY);
    const touchMove = (e: TouchEvent) => move(e.touches[0].clientY, e);
    const pointerDown = (e: PointerEvent) => {
      if (
        e.pointerType === "touch" ||
        e.button !== 0 ||
        RM() ||
        (e.target instanceof Element && e.target.closest("button, a, input"))
      )
        return;
      start(e.clientY);
    };
    const pointerMove = (e: PointerEvent) => {
      if (e.pointerType !== "touch") move(e.clientY, e);
    };
    page.addEventListener("touchstart", touchStart, { passive: true });
    window.addEventListener("touchmove", touchMove, { passive: false });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    page.addEventListener("pointerdown", pointerDown);
    window.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerup", end);
    return () => {
      page.removeEventListener("touchstart", touchStart);
      window.removeEventListener("touchmove", touchMove);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
      page.removeEventListener("pointerdown", pointerDown);
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", end);
      live.stop();
      page.style.transform = "";
    };
  }, [content]);
  return (
    <div className="home-pull" aria-hidden="true" hidden>
      <svg ref={svgRef} className="home-pull-logo" viewBox="350 345 420 320">
        <circle className="lg pop dot" cx="393" cy="395" r="32" />
        <path
          className="ls top"
          d={LOGO.top}
          strokeWidth="34"
          pathLength={1}
          strokeDasharray="1"
        />
        <g />
        <path className="lg pin" d={LOGO.pin} fillRule="evenodd" />
      </svg>
      <small ref={msgRef} />
    </div>
  );
}
