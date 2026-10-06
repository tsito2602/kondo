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
      "export * from './src/web/cartoon'; export { CartoonDock, DockGroup } from './src/web/cartoon-dock'; export { TripDock, tripTabs, moveEdges } from './src/web/trip-dock'; export { ThumbDockProvider, ThumbDock, ContextDock, DockToast } from './src/web/thumb-dock'; export { jellyScroll } from './src/web/jelly-scroll'; export { openFromCard, closeToCard, sheetIn, sheetOut, cardOrigin } from './src/web/transitions'; export { installPressFeedback } from './src/web/press-feedback';",
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
  toast: [16, 358],
  "toast-r": [90, 284],
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
const islands = () =>
  [...document.querySelectorAll(".cdock-isl")].map((el) => [
    parseFloat(el.style.left),
    parseFloat(el.style.left) + parseFloat(el.style.width),
  ]);
const near = (a, b, eps = 0.6) =>
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
      h(M.TripDock, { tripId: "demo", onBack() {} }),
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
    calls.length = 0;
    await act(async () => dock.go("ctx", 0));
    const copy = document.querySelector(".cdock-ui > [data-outgoing]");
    assert.ok(copy, "the tab row fades out in place");
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

test("the trip dock has a back button and six labelled tabs that navigate", async () => {
  stubAnimate();
  const root = createRoot(document.getElementById("root"));
  let backs = 0;
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
              h(M.TripDock, { tripId: "demo", onBack: () => backs++ }),
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
    await act(async () =>
      document.querySelector('[aria-label="旅行一覧へ戻る"]').click(),
    );
    assert.equal(backs, 1);
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
    assert.ok(
      near(islands(), [
        [16, 374],
        [16, 374],
      ]),
    );
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
    assert.ok(
      near(islands(), [
        [16, 78],
        [90, 374],
      ]),
      "the islands follow",
    );
  } finally {
    dockHidden = false;
    await act(async () => dock.root.unmount());
  }
});
