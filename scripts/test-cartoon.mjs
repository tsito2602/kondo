// Cartoon physics, the cartoon dock and jelly scroll, checked against the
// numbers in kondo-cartoon.html / kondo-itinerary.html. These replace the
// fluid (goo) dock's contour and scrub tests, which tested the dock that the
// mocks replaced.
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
/** A squish of `amount` is scale(2 - amount, amount), within settling noise. */
function assertScale(el, amount) {
  const [x, y] = el.style.scale.split(" ").map(Number);
  assert.ok(
    Math.abs(x - (2 - amount)) < 0.003 && Math.abs(y - amount) < 0.003,
    `scale ${el.style.scale} ≈ ${2 - amount} ${amount}`,
  );
}
const near = (a, b, eps = 0.6) =>
  a.every((pair, i) => pair.every((v, j) => Math.abs(v - b[i][j]) < eps));

function pointer(target, type, x = 0, y = 0) {
  const event = new dom.window.Event(type, { bubbles: true });
  Object.assign(event, {
    button: 0,
    isPrimary: true,
    pointerType: "touch",
    pointerId: 1,
    clientX: x,
    clientY: y,
  });
  target.dispatchEvent(event);
}

test("springs keep the mock's numbers and play as linear() easings", async () => {
  assert.deepEqual(M.SPRINGS, {
    squish: { k: 520, d: 20 },
    boing: { k: 420, d: 14 },
    split: { k: 230, d: 21 },
    lead: { k: 700, d: 34 },
    dock: { k: 260, d: 19 },
    soft: { k: 320, d: 24 },
  });
  const { vals, ms } = M.samples(M.SPRINGS.boing);
  assert.equal(vals.at(-1), 1);
  assert.ok(Math.max(...vals) > 1.1, "boing overshoots once");
  const lead = M.samples(M.SPRINGS.lead).vals;
  assert.ok(
    Math.max(...lead) < Math.max(...vals) / 1.5 + 0.4,
    "lead wobbles far less than boing",
  );
  const e = M.ease("boing");
  assert.match(e.easing, /^linear\(0,/);
  assert.equal(e.ms, ms);
  assert.ok(e.easing.split(",").length < 130, "64 to 128 points, as the mock");
  stubAnimate();
  const el = document.createElement("div");
  await M.spring(el, [{ opacity: 0 }, { opacity: 1 }], "split", { delay: 5 });
  assert.equal(calls[0].options.duration, M.ease("split").ms);
  assert.equal(calls[0].options.easing, M.ease("split").easing);
  assert.equal(calls[0].options.delay, 5);
  M.installSpringTokens(document.documentElement);
  assert.equal(
    document.documentElement.style.getPropertyValue("--sp-boing-d"),
    `${ms}ms`,
  );
  reduced = true;
  await M.spring(el, [{ opacity: 0 }, { opacity: 1 }]);
  assert.equal(calls.length, 1, "reduced motion plays nothing");
  reduced = false;
});

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

test("pop, sink, poof and tear use the mock's keyframes and timing", async () => {
  stubAnimate();
  const el = document.createElement("div");
  document.body.append(el);
  await M.sink(el, -40);
  assert.equal(calls[0].options.duration, 380);
  assert.equal(calls[0].frames[2].transform, "translateY(0) scale(1.18,.74)");
  assert.equal(
    calls[0].frames[0].transform,
    "translateY(-40px) scale(.9,1.12)",
  );
  await M.pop(el, 55);
  assert.equal(calls[1].options.delay, 55);
  assert.equal(calls[1].frames[0].transform, "scale(0)");
  el.getBoundingClientRect = () => ({
    left: 10,
    top: 20,
    width: 100,
    height: 40,
  });
  await M.poof(el);
  assert.equal(calls[2].options.duration, 240);
  assert.equal(calls[2].frames[2].transform, "scale(1.2,.08)");
  const dots = calls.filter((c) => c.el.tagName === "circle");
  assert.equal(dots.length, 12);
  assert.equal(dots[0].options.duration, 520);
  assert.equal(el.style.opacity, "0");
  calls.length = 0;
  const stub = document.createElement("div");
  const perf = [1, 2, 3].map(() => document.createElement("i"));
  await M.tearStub(stub, perf);
  assert.deepEqual(
    calls.filter((c) => c.el.tagName === "I").map((c) => c.options.delay),
    [0, 18, 36],
  );
  const fall = calls.find((c) => c.el === stub);
  assert.equal(fall.options.duration, 720);
  assert.equal(
    fall.frames.at(-1).transform,
    "translate(70px,900px) rotate(64deg)",
  );
  el.remove();
});

test("morph moves four edges on their own springs, with lags, into the target box", async () => {
  const m = M.morph(
    { x: 20, y: 300, w: 300, h: 80, r: 20 },
    { x: 10, y: 60, w: 370, h: 674, r: 30 },
    { lag: { b: 60, l: 90, r: 90 } },
  );
  assert.equal(m.el.className, "cartoon-morph");
  assert.equal(m.el.style.top, "300px");
  await wait(40);
  assert.ok(parseFloat(m.el.style.top) < 300, "the top edge leads");
  assert.equal(m.el.style.left, "20px", "the sides wait for their lag");
  await m.done;
  assert.equal(m.el.style.left, "10px");
  assert.equal(m.el.style.top, "60px");
  assert.equal(m.el.style.width, "370px");
  assert.equal(m.el.style.height, "674px");
  assert.equal(m.el.style.borderRadius, "30px");
  m.el.remove();
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

test("the islands follow the mock's geometry for tabs, context, edit, home and toast", async () => {
  stubAnimate();
  const dock = await mountDock();
  try {
    assert.ok(
      near(islands(), [
        [16, 78],
        [90, 374],
      ]),
      "tabs: back circle + tab row",
    );
    await dock.go("ctx");
    assert.ok(
      near(islands(), [
        [16, 78],
        [238, 374],
      ]),
      "ctx: 136 wide actions",
    );
    await dock.go("edit");
    assert.ok(
      near(islands(), [
        [16, 78],
        [225, 374],
      ]),
    );
    assert.equal(
      document.querySelectorAll(".cdock-isl")[1].dataset.tone,
      "ink",
      "a lone save turns its island ink",
    );
    await dock.go("home");
    assert.ok(
      near(islands(), [
        [16, 78],
        [225, 374],
      ]),
    );
    assert.equal(document.querySelectorAll(".cdock-isl")[1].dataset.tone, "");
    await dock.go("toast");
    assert.ok(
      near(islands(), [
        [16, 374],
        [16, 374],
      ]),
      "toast: one island",
    );
  } finally {
    await act(async () => dock.root.unmount());
  }
});

test("an island crouches before it moves, leads with its farther edge and lands with a squish", async () => {
  stubAnimate();
  const dock = await mountDock();
  try {
    const b = document.querySelectorAll(".cdock-isl")[1];
    await act(async () => dock.go("ctx", 0));
    await act(async () => wait(50));
    const scale = b.style.scale.split(" ").map(Number);
    assert.ok(scale[1] < 1 && scale[0] > 1, "crouch: wider and lower (2-v, v)");
    assert.equal(parseFloat(b.style.left), 90, "no travel during the crouch");
    await act(async () => wait(140));
    const left = parseFloat(b.style.left);
    assert.ok(left > 120, "the left edge (148 px to go) leads");
    await act(async () => wait(1600));
    assert.equal(b.style.scale, "", "landed and settled");
    assert.ok(
      near(islands(), [
        [16, 78],
        [238, 374],
      ]),
    );
  } finally {
    await act(async () => dock.root.unmount());
  }
});

test("the islands bump together into the toast and tear apart where the back circle returns", async () => {
  stubAnimate();
  const dock = await mountDock();
  try {
    await dock.go("toast", 800);
    const bump = calls.find((c) => c.el.classList?.contains("cdock-islands"));
    assert.ok(bump, "merging ends in a bump");
    assert.equal(bump.frames[0].transform, "scale(1.05,.82)");
    calls.length = 0;
    await act(async () => dock.go("tabs", 0));
    const seam = document.querySelector(".cdock-seam");
    assert.equal(seam.style.left, "84px", "torn between 78 and 90");
    const tear = calls.find((c) => c.el === seam);
    assert.equal(tear.options.duration, 360);
    assert.ok(
      near(islands(), [
        [16, 374],
        [16, 374],
      ]),
      "waits 120 ms first",
    );
    await act(async () => wait(900));
    assert.ok(
      near(islands(), [
        [16, 78],
        [90, 374],
      ]),
    );
  } finally {
    await act(async () => dock.root.unmount());
  }
});

test("pressing anywhere on an island squishes the whole island", async () => {
  stubAnimate();
  const dock = await mountDock();
  try {
    const root = document.querySelector(".cdock");
    root.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 390,
      height: 62,
    });
    const tab = document.querySelector(".cdock-tabs a");
    const b = document.querySelectorAll(".cdock-isl")[1];
    await act(async () => {
      pointer(tab, "pointerdown", 200, 20);
      await wait(250);
    });
    assertScale(b, 0.95);
    assert.equal(document.querySelectorAll(".cdock-isl")[0].style.scale, "");
    await act(async () => {
      pointer(window, "pointerup");
      await wait(1200);
    });
    assert.equal(b.style.scale, "");
    reduced = true;
    pointer(tab, "pointerdown", 200, 20);
    await wait(60);
    assert.equal(b.style.scale, "", "reduced motion: no squish");
    pointer(window, "pointerup");
    reduced = false;
  } finally {
    await act(async () => dock.root.unmount());
  }
});

test("leaving controls fade out as inert copies; arriving ones pop in turn, the back circle stays", async () => {
  stubAnimate();
  const dock = await mountDock();
  try {
    const back = document.querySelector('[data-slot="l"] button');
    calls.length = 0;
    await act(async () => dock.go("ctx", 0));
    const copy = document.querySelector(".cdock-ui > [data-outgoing]");
    assert.ok(copy, "the tab row fades out in place");
    assert.equal(copy.inert, true);
    assert.equal(copy.getAttribute("aria-hidden"), "true");
    assert.equal(copy.querySelector("[href]"), null);
    const fade = calls.find((c) => c.el === copy);
    assert.equal(fade.options.duration, 120);
    const pops = calls.filter(
      (c) => c.el.closest?.('[data-slot="r"]') && c.el.tagName === "BUTTON",
    );
    assert.deepEqual(
      pops.map((c) => c.options.delay),
      [110, 155],
    );
    assert.equal(pops[0].options.duration, M.ease({ k: 380, d: 13 }).ms);
    assert.equal(pops[0].frames[0].transform, "scale(.4)");
    assert.equal(
      calls.filter((c) => c.el.closest?.('[data-slot="l"]')).length,
      0,
      "the back circle was showing already",
    );
    assert.ok(back.isConnected || document.querySelector('[data-slot="l"]'));
    await act(async () => wait(220));
    assert.equal(document.querySelector(".cdock-ui > [data-outgoing]"), null);
  } finally {
    await act(async () => dock.root.unmount());
  }
});

test("the trip dock has a back circle and six icon-only tabs; the pill's leading edge runs first", async () => {
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
    const pill = document.querySelector(".cdock-ind");
    assert.equal(pill.style.left, "4px", "placed at once on arrival");
    assert.equal(pill.style.width, "46px");
    await act(async () => tabs[4].click());
    assert.equal(
      document.querySelector("output").textContent,
      "/trips/demo/bookings",
    );
    await act(async () => wait(30));
    const width = parseFloat(pill.style.width);
    assert.ok(width > 46, "the right edge leads, the left waits 40 ms");
    assert.equal(pill.style.left, "4px");
    await act(async () => wait(900));
    assert.equal(pill.style.left, "188px");
    assert.equal(pill.style.width, "46px");
    await act(async () =>
      document.querySelector('[aria-label="旅行一覧へ戻る"]').click(),
    );
    assert.equal(backs, 1);
  } finally {
    await act(async () => root.unmount());
  }
});

test("a primary beside other actions is an ink pill, and a note's tools spread like the tab row", async () => {
  const root = createRoot(document.getElementById("root"));
  try {
    await act(async () =>
      root.render(
        h(
          M.ThumbDockProvider,
          null,
          h(
            M.ThumbDock,
            { mode: "context" },
            h(M.ContextDock, {
              back: h("button", { "aria-label": "戻る" }),
              primary: h("button", null, "見せる"),
              actions: h("button", { "aria-label": "編集" }),
              wide: true,
            }),
          ),
        ),
      ),
    );
    const r = document.querySelector('[data-slot="r"]');
    assert.equal(r.dataset.mixed, "true");
    assert.equal(r.dataset.wide, "true");
    assert.equal(r.dataset.tone, undefined, "the island stays plain");
    assert.equal(r.lastElementChild.textContent, "見せる");
  } finally {
    await act(async () => root.unmount());
  }
});

test("jelly scroll lags by .55 per step (±36), trails by position and settles on k240/d13", async () => {
  const scroller = document.createElement("div");
  document.body.append(scroller);
  let top = 0;
  Object.defineProperty(scroller, "scrollTop", { get: () => top });
  Object.defineProperty(scroller, "clientHeight", { get: () => 800 });
  Object.defineProperty(scroller, "clientTop", { get: () => 0 });
  scroller.getBoundingClientRect = () => ({ top: 0 });
  const items = [0, 400, 800, 1200, -400].map((y) => {
    const el = document.createElement("div");
    // As in a browser, the box includes the translate the module applied.
    el.getBoundingClientRect = () => ({
      top: y - top + parseFloat(el.style.translate?.split(" ")[1] || "0"),
    });
    scroller.append(el);
    return el;
  });
  const stop = M.jellyScroll(() => items, { scroller });
  const scroll = (to) => {
    top = to;
    scroller.dispatchEvent(new dom.window.Event("scroll"));
  };
  scroll(40);
  await wait(20);
  const shift = (el) => parseFloat(el.style.translate?.split(" ")[1] || "0");
  assert.ok(shift(items[2]) > shift(items[1]), "the lower item trails more");
  assert.ok(Math.abs(shift(items[1])) < 22 * 0.5 + 1);
  assert.equal(items[4].style.translate, "", "far above: left alone");
  for (let i = 0; i < 6; i++) scroll(40 + (i + 1) * 100);
  await wait(40);
  assert.ok(Math.abs(shift(items[2]) / 0.9 / ((800 - 640) / 800)) <= 36.5);
  const before = shift(items[2]);
  scroll(5000);
  await wait(10);
  assert.ok(
    Math.abs(shift(items[2])) <= Math.abs(before) + 1,
    "a jump adds nothing",
  );
  await wait(1500);
  assert.ok(
    items.every((el) => !el.style.translate),
    "settles back to rest",
  );
  stop();
  reduced = true;
  const stop2 = M.jellyScroll(() => items, { scroller });
  scroll(5040);
  await wait(40);
  assert.ok(
    items.every((el) => !el.style.translate),
    "reduced motion: still",
  );
  stop2();
  reduced = false;
  scroller.remove();
});

test("controls squish under the finger by the mock's amounts (scale 2-v, v)", async () => {
  const host = document.createElement("div");
  host.innerHTML =
    '<button class="floating-add">+</button><div class="cdock-group"><button>戻る</button></div><button class="ticket" data-press-card>券</button><button class="x">x</button>';
  document.body.append(host);
  const cleanup = M.installPressFeedback();
  const undo = M.registerSquish(".x", 0.93);
  try {
    for (const [selector, amount] of [
      [".floating-add", 0.88],
      [".cdock-group > button", 0.9],
      ["[data-press-card]", 0.97],
      [".x", 0.93],
    ]) {
      const el = host.querySelector(selector);
      pointer(el, "pointerdown");
      await wait(400);
      assertScale(el, amount);
      pointer(document, "pointerup");
      await wait(1200);
      assert.equal(el.style.scale, "");
    }
  } finally {
    undo();
    cleanup();
    host.remove();
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

test("a sheet opens out of its card, closes back onto it and sheets rise and drop on the mock's curves", async () => {
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
  const parts = [1, 2, 3].map(() =>
    sheet.appendChild(document.createElement("p")),
  );
  document.body.append(card, sheet);
  const inner = document.createElement("span");
  card.append(inner);
  assert.equal(M.cardOrigin(inner), card);
  const opening = M.openFromCard(card, sheet);
  const layer = document.querySelector(".cartoon-morph");
  assert.equal(layer.style.top, "500px", "starts as the card");
  assert.equal(card.style.visibility, "hidden");
  assert.equal(sheet.style.opacity, "0");
  await wait(60);
  assert.ok(
    parseFloat(layer.style.top) < 500,
    "below the middle: the top edge leads",
  );
  assert.equal(parseFloat(layer.style.left), 20, "the sides wait 90 ms");
  await wait(300);
  assert.equal(sheet.style.opacity, "");
  const rise = calls.filter((c) => parts.includes(c.el));
  assert.deepEqual(
    rise.map((c) => c.options.delay),
    [0, 45, 90],
  );
  assert.equal(rise[0].frames[0].transform, "translateY(26px) scale(.9)");
  await opening;
  assert.equal(document.querySelector(".cartoon-morph"), null);
  calls.length = 0;
  await M.closeToCard(card, sheet);
  assert.equal(calls[0].el, sheet);
  assert.equal(calls[0].options.duration, 90);
  assert.equal(card.style.visibility, "");
  const land = calls.find((c) => c.el === card);
  assert.equal(land.frames[0].transform, "scale(1.06,.9)");
  calls.length = 0;
  await M.sheetIn(sheet);
  assert.equal(calls[0].options.duration, 420);
  assert.equal(calls[0].options.easing, "cubic-bezier(.2,1.2,.4,1)");
  assert.equal(calls[0].frames[0].transform, "translateY(100%)");
  await M.sheetOut(sheet);
  assert.equal(calls[1].options.duration, 260);
  assert.equal(calls[1].frames[1].transform, "translateY(100%)");
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
