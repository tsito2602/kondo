import { Component, createRef, type ReactNode } from "react";
import { anim, Live, RM, sleep, spring } from "./cartoon";

// The cartoon dock from kondo-cartoon.html (section 9) and kondo-itinerary.html:
// two solid islands that crouch, tear apart and bump together. Every island has
// a left and a right edge on their own springs; before it moves it crouches
// (0.9), springs up as it stretches, the edge that travels further leads
// ('lead') and the other trails ('split'), and it lands with a squish. Merging
// into one island (the undo toast) ends in a bump; leaving it tears the seam.
// Pressing anywhere on an island squishes the whole island (scale 2-v, v).
//
// What sits on the islands is plain markup in groups ([data-slot]): l (back),
// tabs, r (context actions) and toast. The islands follow the groups' boxes.

export type DockSlot = "l" | "tabs" | "r" | "toast";

/** One group of dock controls; its CSS box decides where its island goes. */
export function DockGroup({
  slot,
  tone,
  mixed,
  wide,
  className,
  children,
}: {
  slot: DockSlot;
  /** "ink": the island under this group turns ink (a lone save button);
      "ink-dim": that ink at the mocks' disabled .4 (読み取る before a file). */
  tone?: "ink" | "ink-dim";
  /** Several actions with a primary one: the primary is an ink pill. */
  mixed?: boolean;
  /** Spread over the tab row's span (context tools such as a note's). */
  wide?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`cdock-group${className ? ` ${className}` : ""}`}
      data-slot={slot}
      data-tone={tone}
      data-mixed={mixed || undefined}
      data-wide={wide || undefined}
    >
      {children}
    </div>
  );
}

/** The mocks' back chevron (stroke 2.4). */
export function DockBackIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

type Span = [number, number];
type Island = {
  el: HTMLDivElement;
  L: Live;
  R: Live;
  Q: Live;
};
type Groups = { key: string; el: HTMLElement }[];

function mkIsl(el: HTMLDivElement): Island {
  const st = { l: 0, r: 0, q: 1 };
  const draw = () => {
    const w = Math.abs(st.r - st.l);
    el.style.left = Math.min(st.l, st.r) + "px";
    el.style.width = w + "px";
    el.style.borderRadius = Math.min(31, w / 2) + "px";
    el.style.opacity = w < 4 ? "0" : "1";
    el.style.scale =
      Math.abs(st.q - 1) < 0.0005
        ? ""
        : `${(2 - st.q).toFixed(4)} ${st.q.toFixed(4)}`;
  };
  return {
    el,
    L: new Live(0, (v) => ((st.l = v), draw()), "lead", 0.3),
    R: new Live(0, (v) => ((st.r = v), draw()), "lead", 0.3),
    Q: new Live(1, (v) => ((st.q = v), draw()), { k: 600, d: 18 }, 0.0005),
  };
}

/** The mock's moveIsl(): crouch, spring up and stretch out, land. */
async function moveIsl(I: Island, [l, r]: Span, delay = 0) {
  const dl = l - I.L.t,
    dr = r - I.R.t;
  if (Math.abs(dl) < 0.5 && Math.abs(dr) < 0.5) return;
  if (RM()) {
    I.L.set(l);
    I.R.set(r);
    return;
  }
  void I.Q.to(0.9, { k: 700, d: 26 });
  await sleep(70 + delay); // crouch
  void I.Q.to(1, { k: 420, d: 11 }, 3); // spring up and stretch out
  const leadL = Math.abs(dl) >= Math.abs(dr);
  await Promise.race([
    Promise.all([
      I.L.to(l, leadL ? "lead" : "split"),
      I.R.to(r, leadL ? "split" : "lead"),
    ]),
    sleep(380),
  ]);
  void I.Q.to(1, { k: 420, d: 12 }, -4); // land
}

/** Hides and shows groups as the mock's show(): fade out .12s; fade in .14s
    after .08s while each control pops from 0.4 (k380 d13, 110 ms + 45 ms each). */
function popIn(group: HTMLElement) {
  if (RM()) return;
  void anim(group, [{ opacity: 0 }, { opacity: 1 }], {
    duration: 140,
    delay: 80,
    easing: "ease",
    fill: "backwards",
  });
  const parts = [...group.children].filter(
    (child) => !child.matches(".cdock-ind, .haptic-touch"),
  );
  const frames = [
    { transform: "scale(.4)", opacity: 0 },
    { transform: "none", opacity: 1 },
  ];
  parts.forEach((b, i) =>
    spring(
      b,
      frames,
      { k: 380, d: 13 },
      { delay: 110 + i * 45, fill: "backwards" },
    ),
  );
  // The selection pill pops with its own tab, so it never shows empty while
  // a tab further along is still on its way in.
  const on = parts.findIndex((b) => b.matches('[data-on="true"]'));
  const pill = group.querySelector<HTMLElement>(":scope > .cdock-ind");
  if (pill && on >= 0)
    spring(
      pill,
      frames,
      { k: 380, d: 13 },
      { delay: 110 + on * 45, fill: "backwards" },
    );
}

const keyOf = (el: HTMLElement, identity: string) => {
  const slot = el.dataset.slot ?? "";
  // The back circle and the tab row stay put across modes; context actions
  // and toasts belong to the screen that put them there.
  return slot === "l" || slot === "tabs" ? slot : `${slot}:${identity}`;
};

type Props = { identity: string; children: ReactNode };

/** Dispatched on window when the launch logo lands in the dock (boot.ts). */
export const DOCK_INFLATE = "kondo:dock-inflate";

export class CartoonDock extends Component<Props> {
  root = createRef<HTMLDivElement>();
  goo = createRef<HTMLDivElement>();
  a = createRef<HTMLDivElement>();
  b = createRef<HTMLDivElement>();
  seam = createRef<HTMLSpanElement>();
  ui = createRef<HTMLDivElement>();
  IA?: Island;
  IB?: Island;
  geo = "";
  merged = false;
  width = 0;
  retry = 0;
  tries = 0;
  pressed: Island | null = null;
  observer?: ResizeObserver;

  groups(): Groups {
    const ui = this.ui.current;
    if (!ui) return [];
    return [
      ...ui.querySelectorAll<HTMLElement>(
        ":scope > .cdock-content > [data-slot]",
      ),
    ].map((el) => ({ key: keyOf(el, this.props.identity), el }));
  }

  getSnapshotBeforeUpdate(previous: Props) {
    const ui = this.ui.current;
    if (!ui) return null;
    // React may reuse a group's node for the next screen's controls, so keep a
    // copy of what is showing now to fade it out in place.
    return [
      ...ui.querySelectorAll<HTMLElement>(
        ":scope > .cdock-content > [data-slot]",
      ),
    ].map((el) => ({
      key: keyOf(el, previous.identity),
      el,
      copy: RM() ? null : (el.cloneNode(true) as HTMLElement),
    }));
  }

  componentDidMount() {
    const root = this.root.current!;
    this.IA = mkIsl(this.a.current!);
    this.IB = mkIsl(this.b.current!);
    this.layout(true);
    this.observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : // Only a change between two real widths (a rotation) jumps; coming
          // back from hidden (0) animates from where the islands were.
          new ResizeObserver(() =>
            this.layout(
              Boolean(this.width && root.clientWidth) &&
                this.width !== root.clientWidth,
            ),
          );
    this.observer?.observe(root);
    root.addEventListener("pointerdown", this.down, true);
    window.addEventListener(DOCK_INFLATE, this.onInflate);
    window.addEventListener("pointerup", this.up, true);
    window.addEventListener("pointercancel", this.up, true);
  }

  componentDidUpdate(
    _previous: Props,
    _state: unknown,
    before: { key: string; el: HTMLElement; copy: HTMLElement | null }[] | null,
  ) {
    const now = this.groups();
    if (before) {
      const keys = new Set(now.map((g) => g.key));
      const old = new Set(before.map((g) => g.key));
      for (const { key, copy } of before) {
        if (keys.has(key) || !copy) continue;
        copy.inert = true;
        copy.dataset.outgoing = "true";
        copy.setAttribute("aria-hidden", "true");
        for (const node of [copy, ...copy.querySelectorAll("*")])
          for (const attribute of ["id", "name", "form", "href", "autofocus"])
            node.removeAttribute(attribute);
        this.ui.current!.appendChild(copy);
        void anim(copy, [{ opacity: 1 }, { opacity: 0 }], {
          duration: 120,
          easing: "ease",
          fill: "forwards",
        }).then(() => copy.remove());
      }
      for (const { key, el } of now) if (!old.has(key)) popIn(el);
    }
    this.layout(false);
  }

  componentWillUnmount() {
    this.observer?.disconnect();
    cancelAnimationFrame(this.retry);
    const root = this.root.current;
    root?.removeEventListener("pointerdown", this.down, true);
    window.removeEventListener(DOCK_INFLATE, this.onInflate);
    window.removeEventListener("pointerup", this.up, true);
    window.removeEventListener("pointercancel", this.up, true);
    for (const I of [this.IA, this.IB]) {
      I?.L.stop();
      I?.R.stop();
      I?.Q.stop();
    }
  }

  /** Where each island should be, from the visible groups' boxes. */
  targets(): { a: Span; b: Span; merged: boolean; tone?: string } | null {
    const box = (el?: HTMLElement): Span | null =>
      el ? [el.offsetLeft, el.offsetLeft + el.offsetWidth] : null;
    const find = (...slots: DockSlot[]) =>
      this.groups().find(({ el }) =>
        slots.includes(el.dataset.slot as DockSlot),
      )?.el;
    const toast = find("toast"),
      left = find("l"),
      right = find("tabs", "r");
    if (toast) {
      const t = box(toast)!;
      if (left) return { a: box(left)!, b: t, merged: false };
      return { a: t, b: t, merged: true };
    }
    const a = box(left),
      b = box(right);
    if (!a && !b) return null;
    return {
      // A missing island shrinks into its neighbour's near edge and vanishes.
      a: a ?? [b![0], b![0]],
      b: b ?? [a![1], a![1]],
      merged: false,
      tone: right?.dataset.tone,
    };
  }

  layout(instant: boolean) {
    const root = this.root.current,
      IA = this.IA,
      IB = this.IB;
    if (!root || !IA || !IB) return;
    cancelAnimationFrame(this.retry);
    if (!root.clientWidth) {
      // Hidden for a moment: a closing dialog that still holds the dock is
      // display:none until the provider moves the dock back to the page.
      // Try again on the next frames rather than leave the islands stale.
      if (this.tries++ < 30)
        this.retry = requestAnimationFrame(() => this.layout(instant));
      return;
    }
    this.tries = 0;
    this.width = root.clientWidth;
    const t = this.targets();
    if (!t) return;
    const key = JSON.stringify([t.a, t.b]);
    const tone = t.tone ?? "";
    const paint = () => {
      if (this.geo === key) IB.el.dataset.tone = tone;
    };
    if (key === this.geo && !instant) return paint();
    const first = !this.geo;
    this.geo = key;
    // An island only turns ink once it has its new shape, so a wide plain
    // island never flashes as a wide black bar on its way to 「閉じる」.
    const late = tone === "ink" && !(instant || first || RM());
    if (!late) paint();
    const wasMerged = this.merged;
    this.merged = t.merged;
    let landB: Promise<unknown> = Promise.resolve();
    if (instant || first || RM()) {
      IA.L.set(t.a[0]);
      IA.R.set(t.a[1]);
      IB.L.set(t.b[0]);
      IB.R.set(t.b[1]);
    } else if (t.merged) {
      // the two islands run into each other and become one, with a bump
      void Promise.all([moveIsl(IA, t.a), moveIsl(IB, t.b)]).then(() =>
        spring(
          this.goo.current!,
          [{ transform: "scale(1.05,.82)" }, { transform: "none" }],
          "boing",
        ),
      );
    } else if (wasMerged) {
      // tear the one island apart where the back circle will be
      this.tearAt((t.a[1] + t.b[0]) / 2);
      landB = sleep(120).then(() => {
        void moveIsl(IA, t.a);
        return moveIsl(IB, t.b);
      });
    } else {
      void moveIsl(IA, t.a);
      landB = moveIsl(IB, t.b, 30);
    }
    if (late) void landB.then(paint);
  }

  tearAt(x: number) {
    const seam = this.seam.current;
    if (RM() || !seam) return;
    seam.style.left = x + "px";
    void anim(
      seam,
      [
        { opacity: 0, transform: "scaleY(.3)" },
        { opacity: 1, transform: "scaleY(1.1)", offset: 0.3 },
        { opacity: 1, transform: "none", offset: 0.6 },
        { opacity: 0, transform: "scaleY(.6)" },
      ],
      { duration: 360 },
    );
  }

  /** Launch: the dock inflates out of the logo's impact (kondo-cartoon §1). */
  inflate(from?: Span) {
    const mid = (this.root.current?.clientWidth ?? 390) / 2;
    from ??= [mid - 31, mid + 31];
    const IA = this.IA,
      IB = this.IB;
    if (!IA || !IB || RM()) return;
    for (const I of [IA, IB]) {
      I.L.set(from[0]);
      I.R.set(from[1]);
      I.Q.set(1);
    }
    this.merged = false;
    void spring(
      this.goo.current!,
      [{ transform: "scale(1.3,.62)" }, { transform: "none" }],
      "boing",
    );
    void sleep(140).then(() => {
      const t = this.targets();
      if (!t) return;
      this.tearAt((t.a[1] + t.b[0]) / 2);
      this.geo = JSON.stringify([t.a, t.b]);
      void moveIsl(IA, t.a);
      void moveIsl(IB, t.b, 30);
    });
  }

  onInflate = () => this.inflate();

  // pressing anywhere on an island squishes the whole island too
  down = (e: PointerEvent) => {
    if (RM() || e.button !== 0) return;
    const root = this.root.current;
    if (!root || !(e.target as Element).closest?.(".cdock-content")) return;
    const r = root.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * root.clientWidth;
    this.pressed =
      [this.IA!, this.IB!].find(
        (I) => x >= Math.min(I.L.v, I.R.v) && x <= Math.max(I.L.v, I.R.v),
      ) ?? null;
    void this.pressed?.Q.to(0.95, { k: 600, d: 22 });
  };
  up = () => {
    void this.pressed?.Q.to(1, { k: 420, d: 12 });
    this.pressed = null;
  };

  render() {
    return (
      <div ref={this.root} className="cdock">
        <div ref={this.goo} className="cdock-islands" aria-hidden="true">
          <div ref={this.a} className="cdock-isl" />
          <div ref={this.b} className="cdock-isl" />
          <span ref={this.seam} className="cdock-seam">
            <i />
          </span>
        </div>
        <div ref={this.ui} className="cdock-ui">
          <div className="cdock-content">{this.props.children}</div>
        </div>
      </div>
    );
  }
}
