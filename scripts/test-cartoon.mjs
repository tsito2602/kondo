// The cartoon dock and card/sheet transitions: what a user can rely on, not the
// mock's spring constants or keyframes. The dock must end in the right shape
// for each mode (also when hidden mid-change), leave no clickable ghosts behind,
// navigate between tabs, and do nothing animated under reduced motion.
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { MemoryRouter, useLocation } from "react-router";

const dom = new JSDOM('<div id="root"></div>', { url: "https://kondo.test/" });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  SVGElement: dom.window.SVGElement,
  CustomEvent: dom.window.CustomEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
  requestAnimationFrame: (callback) =>
    setTimeout(() => callback(performance.now()), 16),
  cancelAnimationFrame: clearTimeout,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
});
const { createRoot } = await import("react-dom/client");
let reduced = false;
globalThis.matchMedia = window.matchMedia = () => ({
  matches: reduced,
  addEventListener() {},
  removeEventListener() {},
});
globalThis.CSS = { supports: () => true };
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
const { outputFiles } = await build({
  stdin: {
    contents:
      "export * from './src/web/cartoon'; export { CartoonDock, DockGroup } from './src/web/cartoon-dock'; export { morphDock, dockContour, prepareDockMorph } from './src/web/dock-morph'; export { watchPanelFit } from './src/web/panel-fit'; export { TripDock, tripTabs, moveEdges } from './src/web/trip-dock'; export { ThumbDockProvider, ThumbDock, ContextDock, DockToast } from './src/web/thumb-dock'; export { jellyScroll } from './src/web/jelly-scroll'; export { openFromCard, closeToCard, sheetIn, sheetOut, cardOrigin } from './src/web/transitions'; export { installPressFeedback } from './src/web/press-feedback';",
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  packages: "external",
  jsx: "automatic",
  loader: { ".css": "empty" },
});
const module = { exports: {} };
new Function("require", "module", "exports", outputFiles[0].text)(
  createRequire(import.meta.url),
  module,
  module.exports,
);
const M = module.exports;
const h = React.createElement;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Every WAAPI call is recorded and finishes after its duration (at most 200 ms). */
const calls = [];
function stubAnimate() {
  calls.length = 0;
  dom.window.Element.prototype.animate = function (frames, options) {
    const entry = {
      el: this,
      frames,
      options,
      cancelled: false,
      finished: new Promise((resolve) =>
        setTimeout(resolve, Math.min(200, Number(options?.duration) || 0)),
      ),
      cancel() {
        this.cancelled = true;
      },
    };
    calls.push(entry);
    return entry;
  };
  dom.window.Element.prototype.getAnimations = () => [];
}
stubAnimate();

/** jsdom has no layout: the dock groups take the mock's boxes (390 wide). */
const BOX = {
  l: [16, 62],
  tabs: [90, 284],
  "tabs-full": [16, 358],
  toast: [16, 358],
  "toast-r": [90, 284],
  // しおりで見る's own island, 12 px left of 編集 削除 (238).
  m: [123, 103],
};
function rightBox(el) {
  const n = el.querySelectorAll(":scope > button, :scope > a").length;
  return n >= 2 ? [238, 136] : [225, 149];
}
Object.defineProperty(dom.window.HTMLElement.prototype, "offsetLeft", {
  configurable: true,
  get() {
    const slot = this.dataset?.slot;
    if (slot === "r") return rightBox(this)[0];
    if (slot === "toast" && this.classList.contains("cdock-toast-r"))
      return BOX["toast-r"][0];
    if (slot === "tabs" && this.hasAttribute("data-full"))
      return BOX["tabs-full"][0];
    if (slot) return BOX[slot][0];
    const i = this.parentElement
      ? [...this.parentElement.querySelectorAll(":scope > a")].indexOf(this)
      : -1;
    return i >= 0 ? 4 + i * 46 : 0;
  },
});
Object.defineProperty(dom.window.HTMLElement.prototype, "offsetWidth", {
  configurable: true,
  get() {
    const slot = this.dataset?.slot;
    if (slot === "r") return rightBox(this)[1];
    if (slot === "toast" && this.classList.contains("cdock-toast-r"))
      return BOX["toast-r"][1];
    if (slot === "tabs" && this.hasAttribute("data-full"))
      return BOX["tabs-full"][1];
    if (slot) return BOX[slot][1];
    return this.tagName === "A" ? 46 : 0;
  },
});
let dockHidden = false;
Object.defineProperty(dom.window.HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get() {
    return this.classList?.contains("cdock") && !dockHidden ? 390 : 0;
  },
});
/** The visible islands' [left, right] spans as the dock draws them now. */
const islands = () =>
  JSON.parse(document.querySelector(".cdock-islands")?.dataset.shape ?? "[]");
const near = (a, b, eps = 0.6) =>
  a.length === b.length &&
  a.every((pair, i) => pair.every((v, j) => Math.abs(v - b[i][j]) < eps));

test("Live retargets mid-flight, settles on its target and jumps under reduced motion", async () => {
  const seen = [];
  const live = new M.Live(0, (v) => seen.push(v), "boing");
  const settled = live.to(100);
  await wait(60);
  assert.ok(live.v > 0 && live.v < 100);
  const again = live.to(50, "lead");
  assert.deepEqual(live.s, M.SPRINGS.lead);
  await Promise.all([settled, again]);
  assert.equal(live.v, 50, "both promises resolve at the final target");
  assert.equal(seen.at(-1), 50);
  reduced = true;
  await live.to(10);
  assert.equal(live.v, 10);
  reduced = false;
  live.set(3);
  assert.equal(live.vel, 0);
});

function DockHarness({ mode }) {
  const back = h("button", { "aria-label": "戻る" }, "<");
  if (mode === "home")
    return h(
      M.ThumbDock,
      { mode: "context" },
      h(M.ContextDock, {
        back: h("button", { "aria-label": "設定" }, "s"),
        actions: h("button", null, "旅行を作成"),
      }),
    );
  if (mode === "tabs")
    return h(
      M.ThumbDock,
      { mode: "browse" },
      h(M.TripDock, { tripId: "demo" }),
    );
  if (mode === "ctx")
    return h(
      M.ThumbDock,
      { mode: "context" },
      h(M.ContextDock, {
        back,
        actions: h(
          React.Fragment,
          null,
          h("button", { "aria-label": "編集" }, "e"),
          h("button", { "aria-label": "削除", className: "danger" }, "d"),
        ),
      }),
    );
  if (mode === "three")
    // A detail with a separate function: ‹ | しおり | 編集 削除.
    return h(
      M.ThumbDock,
      { mode: "context" },
      h(M.ContextDock, {
        back,
        secondary: h("button", { "aria-label": "しおりで見る" }, "しおり"),
        actions: h(
          React.Fragment,
          null,
          h("button", { "aria-label": "編集" }, "e"),
          h("button", { "aria-label": "削除", className: "danger" }, "d"),
        ),
      }),
    );
  if (mode === "lone")
    // A separate function with nothing beside it: no island of its own.
    return h(
      M.ThumbDock,
      { mode: "context" },
      h(M.ContextDock, {
        back,
        secondary: h("button", { "aria-label": "しおりで見る" }, "しおり"),
      }),
    );
  if (mode === "back")
    // 設定 over a trip: nothing but the back circle on the left.
    return h(M.ThumbDock, { mode: "context" }, h(M.ContextDock, { back }));
  if (mode === "edit")
    return h(
      M.ThumbDock,
      { mode: "edit" },
      h(M.ContextDock, { back, primary: h("button", null, "保存") }),
    );
  return h(
    M.ThumbDock,
    { mode: "toast" },
    h(M.DockToast, { message: "予定を消しました", onUndo() {} }),
  );
}
async function mountDock() {
  const root = createRoot(document.getElementById("root"));
  let setMode;
  function App() {
    const [mode, update] = React.useState("tabs");
    setMode = update;
    return h(M.ThumbDockProvider, null, h(DockHarness, { mode }));
  }
  await act(async () =>
    root.render(
      h(MemoryRouter, { initialEntries: ["/trips/demo/itinerary"] }, h(App)),
    ),
  );
  return {
    root,
    async go(mode, ms = 700) {
      await act(async () => setMode(mode));
      await act(async () => wait(ms));
    },
  };
}

test("leaving controls fade out as inert copies that cannot be tapped, then go", async () => {
  stubAnimate();
  const dock = await mountDock();
  try {
    await dock.go("edit");
    calls.length = 0;
    await act(async () => dock.go("ctx", 0));
    const copy = document.querySelector(".cdock-ui > [data-outgoing]");
    assert.ok(copy, "the save fades out in place");
    assert.equal(copy.inert, true);
    assert.equal(copy.getAttribute("aria-hidden"), "true");
    assert.equal(copy.querySelector("[href]"), null);
    assert.ok(
      document.querySelector('[data-slot="l"] [aria-label="戻る"]'),
      "the back circle stays",
    );
    await act(async () => wait(220));
    assert.equal(document.querySelector(".cdock-ui > [data-outgoing]"), null);
  } finally {
    await act(async () => dock.root.unmount());
  }
});

test("the trip dock has six labelled tabs that navigate and no back circle (the trip header goes back)", async () => {
  stubAnimate();
  const root = createRoot(document.getElementById("root"));
  function Where() {
    return h("output", null, useLocation().pathname);
  }
  try {
    await act(async () =>
      root.render(
        h(
          MemoryRouter,
          { initialEntries: ["/trips/demo/itinerary"] },
          h(
            M.ThumbDockProvider,
            null,
            h(Where),
            h(
              M.ThumbDock,
              { mode: "browse" },
              h(M.TripDock, { tripId: "demo" }),
            ),
          ),
        ),
      ),
    );
    const tabs = [...document.querySelectorAll(".cdock-tabs a")];
    assert.deepEqual(
      tabs.map((a) => a.getAttribute("aria-label")),
      ["しおり", "場所", "やること", "持ち物", "予約", "メモ"],
    );
    assert.ok(
      tabs.every((a) => a.textContent === ""),
      "icons only",
    );
    assert.equal(tabs[0].getAttribute("aria-current"), "page");
    await act(async () => tabs[4].click());
    assert.equal(
      document.querySelector("output").textContent,
      "/trips/demo/bookings",
    );
    assert.equal(tabs[4].getAttribute("aria-current"), "page");
    assert.equal(document.querySelector('[data-slot="l"]'), null);
  } finally {
    await act(async () => root.unmount());
  }
});

test("reduced motion places the islands at once and animates nothing", async () => {
  reduced = true;
  stubAnimate();
  const dock = await mountDock();
  try {
    await act(async () => dock.go("toast", 0));
    assert.ok(near(islands(), [[16, 374]]), "the toast is one island");
    await act(async () => dock.go("ctx", 0));
    assert.ok(
      near(islands(), [
        [16, 78],
        [238, 374],
      ]),
    );
    assert.equal(calls.length, 0);
    assert.equal(document.querySelector("[data-outgoing]"), null);
  } finally {
    await act(async () => dock.root.unmount());
    reduced = false;
  }
});

test("the trip tabs fold into a lone back circle (設定) and back as one island, never a separate pill", async () => {
  stubAnimate();
  const dock = await mountDock();
  const watch = async (mode, ms = 1100) => {
    const seen = [];
    await act(async () => dock.go(mode, 0));
    for (let t = 0; t < ms; t += 16) {
      await act(async () => wait(16));
      seen.push(islands());
    }
    return seen;
  };
  try {
    assert.ok(near(islands(), [[16, 374]]), "full-width tabs");
    const folding = await watch("back");
    assert.ok(
      folding.every((shape) => shape.length === 1),
      "one island all the way: " + JSON.stringify(folding),
    );
    assert.ok(
      folding.every(([[l]]) => Math.abs(l - 16) < 1),
      "its left edge stays where the circle is",
    );
    assert.ok(near(islands(), [[16, 78]]), "it lands as the back circle");
    const opening = await watch("tabs");
    assert.ok(
      opening.every((shape) => shape.length === 1),
      "the circle stretches back into the tabs in one piece",
    );
    assert.ok(
      opening.some(([[, r]]) => r > 80 && r < 370),
      "and it moves there rather than jumping",
    );
    assert.ok(near(islands(), [[16, 374]]));
    // Home's two islands (設定, 旅行を作成) join into the tabs through a neck.
    await dock.go("home", 1100);
    assert.ok(
      near(islands(), [
        [16, 78],
        [225, 374],
      ]),
    );
    const joining = await watch("tabs");
    assert.ok(joining.every((shape) => shape.length <= 2));
    assert.ok(near(islands(), [[16, 374]]), "one island at the end");
  } finally {
    await act(async () => dock.root.unmount());
  }
});

test("a springy morph may overshoot its edges but never thins an island below both of its shapes", () => {
  const circle = [{ left: 16, width: 62, radius: 31 }];
  const tabs = [{ left: 16, width: 358, radius: 31 }];
  for (const t of [0.5, 0.8, 0.95]) {
    const { islands: shape } = M.morphDock(
      tabs,
      circle,
      0,
      t,
      undefined,
      () => 1.08,
    );
    assert.ok(shape[0].width >= 62, "the circle never shrinks in height");
    const d = M.dockContour(390, shape, 0, [], 59);
    assert.equal(/NaN|Infinity/.test(d), false);
  }
  const grown = M.morphDock(circle, tabs, 0, 0.9, undefined, () => 1.05);
  assert.ok(
    grown.islands[0].width > 358,
    "growing, it stretches past and settles",
  );
});

test("a sheet opens out of its card and closes back onto it without leaving an overlay", async () => {
  stubAnimate();
  const card = document.createElement("div");
  card.dataset.pressCard = "";
  card.getBoundingClientRect = () => ({
    left: 20,
    top: 500,
    width: 340,
    height: 70,
  });
  const sheet = document.createElement("div");
  sheet.getBoundingClientRect = () => ({
    left: 10,
    top: 60,
    width: 370,
    height: 674,
  });
  sheet.append(document.createElement("p"));
  document.body.append(card, sheet);
  const inner = document.createElement("span");
  card.append(inner);
  assert.equal(M.cardOrigin(inner), card, "a tap inside finds its card");
  const opening = M.openFromCard(card, sheet);
  assert.ok(document.querySelector(".cartoon-morph"), "the card stretches");
  assert.equal(card.style.visibility, "hidden");
  await opening;
  assert.equal(
    document.querySelector(".cartoon-morph"),
    null,
    "no overlay is left over the sheet",
  );
  assert.equal(sheet.style.opacity, "", "the sheet is fully shown");
  await M.closeToCard(card, sheet);
  assert.equal(card.style.visibility, "", "the card comes back");
  await M.sheetIn(sheet);
  await M.sheetOut(sheet);
  reduced = true;
  calls.length = 0;
  await M.openFromCard(card, sheet);
  await M.sheetIn(sheet);
  assert.equal(calls.length, 0, "reduced motion: nothing moves");
  reduced = false;
  card.remove();
  sheet.remove();
});

test("a dock that is hidden while its controls change (a closing dialog) still moves its islands", async () => {
  stubAnimate();
  const dock = await mountDock();
  try {
    await dock.go("ctx");
    assert.ok(
      near(islands(), [
        [16, 78],
        [238, 374],
      ]),
    );
    // The dialog closes (display:none) before the provider moves the dock out,
    // and comes back within the same frame, so no resize is ever observed.
    dockHidden = true;
    await act(async () => dock.go("tabs", 0));
    dockHidden = false;
    await act(async () => wait(900));
    assert.ok(near(islands(), [[16, 374]]), "the islands follow");
  } finally {
    dockHidden = false;
    await act(async () => dock.root.unmount());
  }
});

test("a separate function gets its own island: the tabs part into three and join back into one", async () => {
  stubAnimate();
  const dock = await mountDock();
  const watch = async (mode, ms = 1100) => {
    const seen = [];
    await act(async () => dock.go(mode, 0));
    for (let t = 0; t < ms; t += 16) {
      await act(async () => wait(16));
      seen.push(islands());
    }
    return seen;
  };
  try {
    assert.ok(near(islands(), [[16, 374]]), "full-width tabs");
    const parting = await watch("three");
    assert.ok(
      parting.every((shape) => shape.length <= 3),
      "never more than three pieces",
    );
    assert.ok(
      near(islands(), [
        [16, 78],
        [123, 226],
        [238, 374],
      ]),
      "‹, the function, then 編集 削除 at the right edge",
    );
    const groups = [
      ...document.querySelectorAll(".cdock-content > [data-slot]"),
    ];
    assert.deepEqual(
      groups.map((g) => g.dataset.slot),
      ["l", "m", "r"],
    );
    // Equal counts only move: from three islands to the two of a plain
    // detail, and back to three, with no neck while they stay apart.
    await dock.go("ctx", 1100);
    assert.ok(
      near(islands(), [
        [16, 78],
        [238, 374],
      ]),
    );
    await dock.go("three", 1100);
    const joining = await watch("tabs");
    assert.ok(joining.every((shape) => shape.length <= 3));
    assert.ok(near(islands(), [[16, 374]]), "one island at the end");
    await dock.go("lone", 1100);
    assert.equal(document.querySelector('[data-slot="m"]'), null);
    assert.ok(near(islands(), [[16, 78]]), "only the back circle");
  } finally {
    await act(async () => dock.root.unmount());
  }
});

test("islands that only move and resize morph without a neck, whatever their number", () => {
  const three = [
    { left: 16, width: 62, radius: 31 },
    { left: 123, width: 103, radius: 31 },
    { left: 238, width: 136, radius: 31 },
  ];
  const moved = [
    { left: 16, width: 62, radius: 31 },
    { left: 176, width: 118, radius: 31 },
    { left: 306, width: 68, radius: 31 },
  ];
  const plan = M.prepareDockMorph(three, moved);
  assert.equal(plan.simple, true);
  for (const t of [0.2, 0.5, 0.8])
    assert.equal(M.morphDock(three, moved, 0, t, plan).tension, 0);
  assert.equal(
    M.prepareDockMorph([{ left: 16, width: 358, radius: 31 }], three).simple,
    false,
    "one island parting into three draws necks",
  );
});

test("a floating panel whose content would scroll takes the full height, and gives it back", async () => {
  const host = document.createElement("dialog");
  const panel = document.createElement("div");
  const body = document.createElement("div");
  panel.style.border = "0";
  panel.append(body);
  host.append(panel);
  document.body.append(host);
  let content = 300;
  const room = 500;
  const tall = () => host.dataset.tall === "true";
  const sizes = new Map([
    [panel, () => (tall() ? 700 : Math.min(content, room))],
    [body, () => content],
  ]);
  const height = Object.getOwnPropertyDescriptor(
    dom.window.HTMLElement.prototype,
    "offsetHeight",
  );
  Object.defineProperty(dom.window.HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      return sizes.get(this)?.() ?? 0;
    },
  });
  Object.defineProperty(panel, "offsetParent", { get: () => document.body });
  try {
    const stop = M.watchPanelFit(host, panel);
    assert.equal(tall(), false, "short content: the compact panel");
    content = 640;
    window.dispatchEvent(new window.Event("resize"));
    await wait(40);
    assert.equal(tall(), true, "content that would scroll: the full height");
    content = 420;
    window.dispatchEvent(new window.Event("resize"));
    await wait(40);
    assert.equal(tall(), false, "short again: compact again");
    stop();
  } finally {
    if (height)
      Object.defineProperty(
        dom.window.HTMLElement.prototype,
        "offsetHeight",
        height,
      );
    else delete dom.window.HTMLElement.prototype.offsetHeight;
    host.remove();
  }
});
