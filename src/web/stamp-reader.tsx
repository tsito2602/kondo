import { useEffect, useRef } from "react";
import { reduceMotion } from "./motion";

// 予約の読み取り中 (Tsubasa 2026-10-07 chose A スタンプ, mock
// kondo-reading.html): the documents lie on the desk while a rubber stamp
// hovers over them. For every booking the AI finds, the stamp slams down,
// its 「予約」 mark splashes onto the front document, and the mark becomes the
// booking's row, arcing down into the list and landing with a squash. Then
// the front document slides to the back of the pile.

const PLACES = [
  "rotate(-2deg) translate(0,0)",
  "rotate(-9deg) translate(-26px,8px)",
  "rotate(7deg) translate(26px,10px)",
];
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
const frame = () => new Promise((done) => requestAnimationFrame(done));
const play = (
  element: Element,
  frames: Keyframe[],
  options: KeyframeAnimationOptions,
) =>
  element
    .animate(frames, { fill: "forwards", ...options })
    .finished.catch(() => undefined);

export function StampReader({
  tags,
  found,
  landed,
  onLand,
  list,
}: {
  /** The documents' badges (PNG, PDF…), at most three on the desk. */
  tags: string[];
  /** Bookings read so far. */
  found: number;
  /** Bookings already shown in the list. */
  landed: number;
  /** Show the next booking's row (its slot); the reader flies into it. */
  onLand: () => void;
  /** The panel the rows live in. */
  list: { current: HTMLElement | null };
}) {
  const stage = useRef<HTMLDivElement>(null);
  const count = useRef({ found, landed });
  count.current = { found, landed };
  const land = useRef(onLand);
  land.current = onLand;

  useEffect(() => {
    const desk = stage.current;
    if (!desk) return;
    let alive = true;
    const docs = [...desk.querySelectorAll<HTMLElement>(".bk-doc")];
    const stamp = desk.querySelector<HTMLElement>(".bk-stamp")!;
    const flying: HTMLElement[] = [];

    const shuffle = async () => {
      if (docs.length < 2) return;
      const front = docs.shift()!;
      docs.push(front);
      const last = PLACES[docs.length - 1];
      await play(
        front,
        [
          { transform: front.style.transform },
          { transform: "rotate(-16deg) translate(-150px,10px)", offset: 0.45 },
          { transform: last },
        ],
        { duration: 700, easing: "cubic-bezier(.3,1.1,.5,1)" },
      );
      front.getAnimations().forEach((animation) => animation.cancel());
      front.style.transform = last;
      desk.insertBefore(front, desk.firstChild);
      docs.forEach((doc, index) => (doc.style.transform = PLACES[index]));
      docs[0].animate([{ transform: PLACES[1] }, { transform: PLACES[0] }], {
        duration: 420,
        easing: "cubic-bezier(.3,1.4,.5,1)",
      });
    };

    const slam = async () => {
      await play(
        stamp,
        [
          { transform: "translateY(-10px)" },
          { transform: "translateY(-30px) scale(.95,1.08)", offset: 0.35 },
          { transform: "translateY(84px) scale(1.12,.78)", offset: 0.62 },
          { transform: "translateY(80px) scale(.97,1.04)", offset: 0.8 },
          { transform: "translateY(82px)" },
        ],
        { duration: 480, easing: "cubic-bezier(.5,0,.6,1)" },
      );
      const front = docs[0];
      front?.animate(
        [
          { transform: front.style.transform },
          { transform: "rotate(-2deg) scale(1.04,.94)" },
          { transform: front.style.transform },
        ],
        { duration: 260, easing: "cubic-bezier(.3,1.5,.5,1)" },
      );
      desk.animate(
        [{ translate: "0 0" }, { translate: "0 2px" }, { translate: "0 0" }],
        { duration: 120 },
      );
      const mark = document.createElement("div");
      mark.className = "bk-mark";
      mark.innerHTML = "<span></span>予約";
      desk.appendChild(mark);
      mark.animate(
        [
          { opacity: 0, transform: "rotate(-12deg) scale(1.3)" },
          { opacity: 1, transform: "rotate(-12deg) scale(1)" },
        ],
        { duration: 160, fill: "forwards" },
      );
      for (let index = 0; index < 6; index++) {
        const dot = document.createElement("i");
        dot.className = "bk-splat";
        const angle = (index / 6) * Math.PI * 2 + 0.4;
        const [x, y] = [Math.cos(angle), Math.sin(angle)];
        Object.assign(dot.style, {
          left: `calc(50% + ${x * 34}px)`,
          top: `${145 + y * 34}px`,
        });
        desk.appendChild(dot);
        void play(
          dot,
          [
            { transform: "scale(0)", opacity: 1 },
            {
              transform: `translate(${x * 10}px,${y * 10}px) scale(1)`,
              opacity: 1,
              offset: 0.4,
            },
            {
              transform: `translate(${x * 14}px,${y * 14}px) scale(.3)`,
              opacity: 0,
            },
          ],
          { duration: 520 },
        ).then(() => dot.remove());
      }
      await sleep(160);
      void play(
        stamp,
        [{ transform: "translateY(82px)" }, { transform: "translateY(-10px)" }],
        { duration: 420, easing: "cubic-bezier(.3,1.4,.5,1)" },
      );
      await sleep(260);
      return mark;
    };

    // The mark turns into the booking's row, cartoon-style (Tsubasa
    // 2026-10-07: 「もっと気持ちよくカートゥーンふうに」): it crouches, peels
    // off the paper and leaps up, pops into the booking at the top of the
    // leap, then drops into its slot stretched and lands with a squash and a
    // puff of ink dots.
    const fly = async (mark: HTMLElement) => {
      await play(
        mark,
        [
          { transform: "rotate(-12deg)" },
          { transform: "rotate(-12deg) scale(1.18,.78)" },
        ],
        { duration: 130, easing: "cubic-bezier(.3,0,.6,1)" },
      );
      const from = mark.getBoundingClientRect();
      void play(
        mark,
        [
          { transform: "rotate(-12deg) scale(1.18,.78)" },
          {
            transform:
              "perspective(300px) rotateX(40deg) rotate(-4deg) translateY(-58px) scale(.82,1.22)",
          },
        ],
        { duration: 220, easing: "cubic-bezier(.2,.9,.3,1)" },
      );
      land.current();
      await frame();
      await frame();
      const rows = list.current?.querySelectorAll<HTMLElement>(
        ".bk-irow:not(.skel)",
      );
      const row = rows?.[rows.length - 1];
      if (!row || !alive) return mark.remove();
      row.scrollIntoView({ block: "nearest" });
      const to = row.getBoundingClientRect();
      row.style.visibility = "hidden";
      // Its slot opens just before it drops in.
      row.animate(
        [
          { height: "0px", marginTop: "-8px", paddingBlock: "0px" },
          {
            height: "0px",
            marginTop: "-8px",
            paddingBlock: "0px",
            offset: 0.4,
          },
          { height: `${to.height}px` },
        ],
        { duration: 760, easing: "cubic-bezier(.3,1.2,.5,1)" },
      );
      const piece = row.cloneNode(true) as HTMLElement;
      piece.classList.add("bk-fly");
      Object.assign(piece.style, {
        visibility: "",
        left: `${to.left}px`,
        top: `${to.top}px`,
        width: `${to.width}px`,
        height: `${to.height}px`,
      });
      (row.closest("dialog") ?? document.body).appendChild(piece);
      flying.push(piece);
      const dx = from.left + from.width / 2 - (to.left + to.width / 2);
      const dy = from.top + from.height / 2 - (to.top + to.height / 2) - 58;
      const sx = from.width / to.width;
      const sy = from.height / to.height;
      await sleep(180);
      mark.remove();
      await play(
        piece,
        [
          {
            transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})`,
            borderRadius: "40px",
            opacity: 0,
            easing: "cubic-bezier(.3,1.6,.5,1)",
          },
          { opacity: 1, offset: 0.08 },
          {
            transform: `translate(${dx}px,${dy}px) scale(1.12,1.12) rotate(-3deg)`,
            borderRadius: "18px",
            offset: 0.3,
            easing: "ease-out",
          },
          {
            transform: `translate(${dx}px,${dy - 10}px) scale(1) rotate(2deg)`,
            offset: 0.44,
            easing: "cubic-bezier(.55,0,.9,.5)",
          },
          {
            transform: "translate(0,6px) scale(.92,1.14)",
            offset: 0.78,
            easing: "ease-out",
          },
          { transform: "translate(0,4px) scale(1.12,.78)", offset: 0.86 },
          { transform: "scale(.96,1.06)", offset: 0.94 },
          { transform: "none" },
        ],
        { duration: 980 },
      );
      piece.remove();
      row.style.visibility = "";
      // Landing: a puff of ink dots from under its corners, the panel jolts.
      const box = row.getBoundingClientRect();
      const host = row.closest("dialog") ?? document.body;
      for (const [x, side] of [
        [box.left + 10, -1],
        [box.left + 22, -1],
        [box.right - 22, 1],
        [box.right - 10, 1],
      ]) {
        const dot = document.createElement("i");
        dot.className = "bk-puff";
        Object.assign(dot.style, {
          left: `${x}px`,
          top: `${box.bottom - 4}px`,
        });
        host.appendChild(dot);
        void play(
          dot,
          [
            { transform: "scale(.4)", opacity: 1 },
            {
              transform: `translate(${side * 16}px,-6px) scale(1)`,
              opacity: 1,
              offset: 0.5,
            },
            {
              transform: `translate(${side * 22}px,-9px) scale(.2)`,
              opacity: 0,
            },
          ],
          { duration: 420, easing: "cubic-bezier(.2,.8,.3,1)" },
        ).then(() => dot.remove());
      }
      row
        .closest(".bk-sheet")
        ?.animate(
          [
            { translate: "0 0" },
            { translate: "0 2px" },
            { translate: "0 -1px" },
            { translate: "0 0" },
          ],
          { duration: 160 },
        );
    };

    void (async () => {
      if (reduceMotion()) {
        while (alive) {
          while (alive && count.current.landed < count.current.found)
            (land.current(), (count.current.landed += 1));
          await sleep(200);
        }
        return;
      }
      while (alive) {
        if (count.current.landed >= count.current.found) {
          // Waiting for the AI: the stamp hovers and wobbles, ready.
          await play(
            stamp,
            [
              { transform: "translateY(0)" },
              { transform: "translateY(-14px) rotate(-6deg)" },
              { transform: "translateY(-8px) rotate(5deg)" },
              { transform: "translateY(-14px) rotate(-4deg)" },
              { transform: "translateY(-10px)" },
            ],
            { duration: 1300, easing: "ease-in-out" },
          );
          continue;
        }
        const mark = await slam();
        if (!alive) return;
        await fly(mark);
        if (!alive) return;
        await sleep(120);
        await shuffle();
      }
    })();
    return () => {
      alive = false;
      flying.forEach((piece) => piece.remove());
    };
  }, [list]);

  const shown = tags.slice(0, 3);
  return (
    <div className="bk-desk" ref={stage} aria-hidden="true">
      {shown
        .map((tag, index) => (
          <div
            key={index}
            className="bk-doc"
            style={{ transform: PLACES[index] }}
          >
            {Array.from({ length: 10 }, (_, line) => (
              <i key={line} />
            ))}
            <span>{tag}</span>
          </div>
        ))
        .reverse()}
      <div className="bk-stamp">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}
