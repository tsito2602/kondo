import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";

const dom = new JSDOM('<div id="root"></div>', { url: "https://tabi.test/" });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  CustomEvent: dom.window.CustomEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
  requestAnimationFrame: (callback) =>
    setTimeout(() => callback(performance.now()), 16),
  cancelAnimationFrame: clearTimeout,
});
// Load the DOM renderer after jsdom so React detects native input events.
const { createRoot } = await import("react-dom/client");
let reduced = false;
globalThis.matchMedia = () => ({ matches: reduced });
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
const { outputFiles } = await build({
  stdin: {
    contents:
      "export { guardModalKeyboardFocus } from './src/web/modal-keyboard'; export { lockModalPage } from './src/web/modal-scroll-lock'; " +
      "export { finishBootScreen } from './src/web/boot'; export { PlaceSheet, placeMapsHref } from './src/web/place-sheet'; export { PlaceStatusLabel } from './src/web/place-status'; export { DayStrip } from './src/web/day-strip'; export { DatePicker } from './src/web/date-picker'; export { startTripTransition } from './src/web/trip-transition'; export { menuDepth } from './src/web/menu-depth'; export { installPressFeedback } from './src/web/press-feedback'; export { AppRouter } from './src/web/router'; export { useItineraryScroll } from './src/web/itinerary-scroll'; export { startRouteTransition } from './src/web/motion'; export { keyboardInset, revealModalField } from './src/web/viewport'; export { AnchoredMenu } from './src/web/anchored-menu'; export { TripDock } from './src/web/trip-dock'; export { ThumbDockProvider, ThumbDock, ThumbAction, ThumbActions, ContextDock } from './src/web/thumb-dock'; export { Modal, SaveButton, AddButton } from './src/web/ui'; export { dismissModal, useMotionNavigation } from './src/web/motion';",
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  packages: "external",
  jsx: "automatic",
});
const module = { exports: {} };
new Function("require", "module", "exports", outputFiles[0].text)(
  createRequire(import.meta.url),
  module,
  module.exports,
);
const {
  guardModalKeyboardFocus,
  lockModalPage,
  finishBootScreen,
  PlaceSheet,
  placeMapsHref,
  PlaceStatusLabel,
  DayStrip,
  DatePicker,
  startTripTransition,
  menuDepth,
  Modal,
  AddButton,
  installPressFeedback,
  AppRouter,
  useItineraryScroll,
  startRouteTransition,
  AnchoredMenu,
  ContextDock,
  keyboardInset,
  revealModalField,
  SaveButton,
  dismissModal,
  useMotionNavigation,
  ThumbDockProvider,
  ThumbDock,
  ThumbAction,
  ThumbActions,
  TripDock,
} = module.exports;

function timeline() {
  let resolve;
  const entry = {
    currentTime: 0,
    playbackRate: 1,
    cancelled: false,
    plays: 0,
    finished: new Promise((done) => {
      resolve = done;
    }),
    play() {
      this.plays++;
      this.finished = new Promise((done) => {
        resolve = done;
      });
    },
    finish() {
      resolve();
    },
    cancel() {
      this.cancelled = true;
    },
  };
  return entry;
}

test("date clicks retain the target through intermediate days, retargeting and short final days", async () => {
  const root = createRoot(document.getElementById("root"));
  const days = ["2026-11-22", "2026-11-23", "2026-11-24"];
  let visible = 0;
  const originalBounds = HTMLElement.prototype.getBoundingClientRect;
  const originalScroll = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.getBoundingClientRect = function () {
    const index = days.indexOf(this.id.replace("day-", ""));
    return {
      top: (index - visible) * 500,
      bottom: 0,
      height: 500,
      width: 400,
      left: 0,
      right: 400,
    };
  };
  const targets = [];
  HTMLElement.prototype.scrollIntoView = function (options) {
    targets.push([this.id, options.behavior]);
  };
  function Harness() {
    const { selectedDay, selectDay } = useItineraryScroll(days, days[0]);
    return React.createElement(
      "div",
      null,
      React.createElement("output", null, selectedDay),
      ...days.map((day) =>
        React.createElement(
          "section",
          { id: `day-${day}`, key: day },
          React.createElement(
            "button",
            { onClick: () => selectDay(day, "smooth") },
            day,
          ),
        ),
      ),
    );
  }
  const selected = () => document.querySelector("output").textContent;
  const scroll = async (index) => {
    visible = index;
    await act(async () => {
      window.dispatchEvent(new dom.window.Event("scroll"));
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  };
  try {
    await act(async () => root.render(React.createElement(Harness)));
    await act(async () =>
      document.querySelectorAll("section button")[2].click(),
    );
    await scroll(0);
    assert.equal(selected(), days[2]);
    await scroll(1);
    assert.equal(selected(), days[2], "do not flash the intermediate date");
    await act(async () =>
      document.querySelectorAll("section button")[0].click(),
    );
    window.dispatchEvent(new dom.window.Event("scrollend"));
    await scroll(1);
    assert.equal(
      selected(),
      days[0],
      "old completion must not unlock a new target",
    );
    await scroll(0);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 200)));
    await scroll(1);
    assert.equal(
      selected(),
      days[1],
      "manual scrolling follows sections after settling",
    );
    await act(async () =>
      document.querySelectorAll("section button")[2].click(),
    );
    await scroll(1);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 200)));
    assert.equal(
      selected(),
      days[2],
      "a short final day retains explicit selection",
    );
    await act(async () =>
      document.querySelectorAll("section button")[0].click(),
    );
    await act(async () => {
      window.dispatchEvent(new dom.window.Event("wheel"));
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    assert.equal(
      selected(),
      days[1],
      "user input releases the automatic-scroll lock",
    );
    assert.deepEqual(
      targets.map(([id]) => id),
      [days[2], days[0], days[2], days[0]].map((day) => `day-${day}`),
    );
  } finally {
    await act(async () => root.unmount());
    HTMLElement.prototype.getBoundingClientRect = originalBounds;
    HTMLElement.prototype.scrollIntoView = originalScroll;
  }
});

test("real router commits the new page inside the snapshot update, retaining the old scroll position", async () => {
  const root = createRoot(document.getElementById("root"));
  const originalBounds = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.tagName === "HEADER")
      return { bottom: this.textContent === "/bookings" ? 108 : 72 };
    return this.textContent === "/bookings"
      ? { top: 72, left: 0, width: 390, height: 500 }
      : { top: -1200, left: 0, width: 390, height: 3000 };
  };
  const nativeStart = document.startViewTransition;
  let captureNew;
  document.startViewTransition = (update) => {
    captureNew = update;
    return {
      ready: Promise.resolve(),
      finished: Promise.resolve(),
      skipTransition() {},
    };
  };
  let go;
  function Page() {
    const location = useLocation();
    const navigate = useNavigate();
    go = () => startRouteTransition(() => navigate("/bookings"));
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "header",
        { className: "trip-header" },
        location.pathname,
      ),
      React.createElement("main", { id: "main-content" }, location.pathname),
    );
  }
  try {
    await act(async () =>
      root.render(
        React.createElement(AppRouter, null, React.createElement(Page)),
      ),
    );
    await act(async () => go());
    const style = document.documentElement.style;
    assert.equal(style.getPropertyValue("--route-old-top"), "-1200px");
    assert.notEqual(
      document.querySelector("main").textContent,
      "/bookings",
      "old page remains until snapshot callback",
    );
    await act(async () => {
      captureNew();
      assert.equal(
        document.querySelector("main").textContent,
        "/bookings",
        "route must commit before capture returns",
      );
      assert.equal(style.getPropertyValue("--route-new-top"), "72px");
      assert.equal(style.getPropertyValue("--route-new-height"), "500px");
      assert.ok(
        document.querySelector("main").classList.contains("route-page-enter"),
        "the live incoming page staggers its pieces in",
      );
    });
    assert.equal(style.getPropertyValue("--route-old-top"), "-1200px");
    assert.equal(style.getPropertyValue("--route-old-height"), "3000px");
    assert.equal(style.getPropertyValue("--route-old-header-bottom"), "72px");
    assert.equal(style.getPropertyValue("--route-new-header-bottom"), "108px");
  } finally {
    await act(async () => root.unmount());
    document.startViewTransition = nativeStart;
    HTMLElement.prototype.getBoundingClientRect = originalBounds;
    window.history.replaceState(null, "", "/");
  }
});

test("dialog reverses its retained timeline and backdrop before dismissing, including interrupted opening and Save", async () => {
  for (const trigger of ["close", "early-close", "save", "escape"]) {
    let surface, backdrop, background;
    HTMLElement.prototype.animate = function () {
      if (this.id === "main-content") return (background = timeline());
      surface = timeline();
      return surface;
    };
    HTMLElement.prototype.getAnimations = function () {
      backdrop = Object.assign(timeline(), { animationName: "backdrop-enter" });
      return [backdrop];
    };
    let dismissed = 0;
    const root = createRoot(document.getElementById("root"));
    function Harness() {
      const [open, setOpen] = React.useState(true);
      const close = () => {
        dismissed++;
        setOpen(false);
      };
      return React.createElement(
        React.Fragment,
        null,
        React.createElement("main", { id: "main-content" }),
        open
          ? React.createElement(
              Modal,
              { title: "詳細", onClose: close },
              React.createElement(
                "button",
                { onClick: () => dismissModal(close) },
                "保存",
              ),
            )
          : null,
      );
    }
    try {
      await act(async () => root.render(React.createElement(Harness)));
      const dialog = document.querySelector("dialog");
      assert.equal(
        dialog.parentElement,
        document.body,
        "foreground stays outside the blurred root",
      );
      surface.currentTime = trigger === "early-close" ? 80 : 320;
      backdrop.currentTime = surface.currentTime;
      if (trigger !== "early-close") await act(async () => surface.finish());
      assert.equal(
        surface.cancelled,
        false,
        "finished entrance must retain its endpoint",
      );
      await act(async () => {
        if (trigger === "save")
          dialog.querySelector(".modal-body button").click();
        else if (trigger === "escape")
          dialog.dispatchEvent(
            new dom.window.Event("cancel", { cancelable: true }),
          );
        else dialog.querySelector('[aria-label="閉じる"]').click();
      });
      assert.ok(surface.playbackRate < 0, "the entrance plays backwards");
      assert.equal(background.playbackRate, surface.playbackRate);
      assert.equal(background.currentTime, surface.currentTime);
      assert.equal(backdrop.playbackRate, surface.playbackRate);
      assert.equal(
        surface.currentTime,
        trigger === "early-close" ? 80 : 320,
        "closing must not jump back to a full-open frame",
      );
      assert.equal(dismissed, 0);
      assert.ok(dialog.isConnected, "keep live dialog until reverse completes");
      await act(async () => surface.finish());
      assert.equal(dismissed, 1);
      assert.equal(document.querySelector("dialog"), null);
      assert.equal(document.body.style.overflow, "");
      assert.equal(surface.cancelled, true);
      assert.equal(background.cancelled, true);
    } finally {
      await act(async () => root.unmount());
    }
  }
});

test("forms open without activating inputs and only keyboard dismissal restores the opener", async () => {
  const nativeShow = dom.window.HTMLDialogElement.prototype.showModal;
  const nativeClose = dom.window.HTMLDialogElement.prototype.close;
  const previousFocus = new WeakMap();
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    previousFocus.set(this, document.activeElement);
    this.open = true;
    (
      this.querySelector("[autofocus]") ?? this.querySelector("input, button")
    )?.focus();
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    previousFocus.get(this)?.focus();
  };
  try {
    for (const modality of ["pointer", "keyboard"]) {
      document.documentElement.dataset.inputModality = modality;
      const opener = document.createElement("button");
      opener.textContent = "やることを編集";
      document.body.append(opener);
      opener.focus();
      const root = createRoot(document.getElementById("root"));
      try {
        await act(async () =>
          root.render(
            React.createElement(
              Modal,
              { title: "やることを編集", onClose: () => {} },
              React.createElement("input", { "aria-label": "やること" }),
            ),
          ),
        );
        const dialog = document.querySelector("dialog");
        assert.equal(document.activeElement, dialog.querySelector("h2"));
        const input = dialog.querySelector("input");
        input.focus();
        assert.equal(
          document.activeElement,
          input,
          "explicit input focus still works",
        );
        await act(async () => root.unmount());
        assert.equal(
          document.activeElement,
          modality === "keyboard" ? opener : document.body,
        );
      } finally {
        opener.remove();
      }
    }
    // On touch Safari, the active element can still be the preparation tab panel.
    document.documentElement.dataset.inputModality = "pointer";
    const panel = document.createElement("div");
    panel.tabIndex = 0;
    panel.setAttribute("role", "tabpanel");
    document.body.append(panel);
    panel.focus();
    const root = createRoot(document.getElementById("root"));
    await act(async () =>
      root.render(
        React.createElement(Modal, {
          title: "やることを編集",
          onClose: () => {},
        }),
      ),
    );
    await act(async () => root.unmount());
    assert.equal(
      document.activeElement,
      document.body,
      "no stale panel focus after returning",
    );
    panel.remove();
  } finally {
    delete document.documentElement.dataset.inputModality;
    dom.window.HTMLDialogElement.prototype.showModal = nativeShow;
    dom.window.HTMLDialogElement.prototype.close = nativeClose;
  }
});

test.afterEach(() => {
  HTMLElement.prototype.animate = () => timeline();
});

test("header menu retains the actual button and fixed icon through opening, closing and reopening", async () => {
  const root = createRoot(document.getElementById("root"));
  const anchor = document.createElement("div");
  document.body.append(anchor);
  anchor.getBoundingClientRect = () => ({
    left: 926,
    top: 20,
    right: 970,
    bottom: 64,
    width: 44,
    height: 44,
  });
  const originalBounds = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.classList.contains("trip-menu-body"))
      return { width: 300, height: 340 };
    if (this.classList.contains("trip-menu-toggle"))
      return { width: 44, height: 44 };
    return originalBounds.call(this);
  };
  let motion,
    contentMotion,
    frames,
    animatedButton,
    navigated = 0;
  HTMLElement.prototype.animate = function (keyframes) {
    if (this.classList.contains("trip-menu-toggle")) {
      animatedButton = this;
      frames = keyframes;
      return (motion = timeline());
    }
    return (contentMotion = timeline());
  };
  function Harness() {
    const [open, setOpen] = React.useState(false);
    const anchorRef = React.useRef(anchor);
    return React.createElement(
      AnchoredMenu,
      {
        anchor: anchorRef,
        open,
        onOpen: () => setOpen(true),
        onClose: () => setOpen(false),
      },
      (close) =>
        React.createElement(
          "button",
          { onClick: () => close(() => navigated++) },
          "設定",
        ),
    );
  }
  try {
    await act(async () => root.render(React.createElement(Harness)));
    const trigger = anchor.querySelector("button");
    const icon = trigger.querySelector("svg");
    trigger.focus();
    await act(async () => trigger.click());
    assert.equal(
      animatedButton,
      trigger,
      "the original button itself is animated",
    );
    assert.equal(trigger.querySelector("svg"), icon, "no replacement dot icon");
    assert.equal(trigger.style.visibility, "");
    assert.equal(frames[0].width, "44px");
    assert.equal(frames[0].height, "44px");
    assert.equal(
      frames[0].transform,
      undefined,
      "the fixed icon is never translated or scaled",
    );
    assert.equal(frames[1].width, "300px");
    assert.equal(frames[1].height, "340px");
    assert.equal(document.querySelectorAll(".trip-menu-toggle").length, 1);
    const dialog = document.querySelector("dialog");
    assert.equal(dialog.style.left, "926px");
    assert.equal(dialog.style.top, "20px");
    motion.currentTime = 440;
    await act(async () => motion.finish());
    await act(async () =>
      [...dialog.querySelectorAll("button")]
        .find((node) => node.textContent === "設定")
        .click(),
    );
    assert.equal(motion.playbackRate, -1);
    assert.equal(contentMotion.playbackRate, -1);
    assert.equal(navigated, 0);
    assert.equal(dialog.open, true);
    await act(async () => motion.finish());
    assert.equal(navigated, 1);
    assert.equal(dialog.open, false);
    assert.equal(anchor.querySelector("button"), trigger);
    assert.equal(trigger.querySelector("svg"), icon);
    assert.ok(
      document.activeElement === trigger,
      "focus restored to the same button",
    );
    assert.equal(trigger.style.width, "");
    reduced = true;
    await act(async () => trigger.click());
    assert.equal(document.querySelector("dialog").open, true);
    assert.equal(document.querySelector("dialog .trip-menu-toggle"), trigger);
    await act(async () => trigger.click());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    assert.equal(dialog.open, false);
    assert.equal(anchor.querySelector("button"), trigger);
  } finally {
    reduced = false;
    await act(async () => root.unmount());
    HTMLElement.prototype.getBoundingClientRect = originalBounds;
    anchor.remove();
  }
});

test("reduced motion dismisses without waiting for a cosmetic animation", async () => {
  reduced = true;
  HTMLElement.prototype.animate = () => {
    throw new Error("must not animate");
  };
  let dismissed = 0;
  const root = createRoot(document.getElementById("root"));
  try {
    await act(async () =>
      root.render(
        React.createElement(Modal, {
          title: "詳細",
          onClose: () => {
            dismissed++;
          },
        }),
      ),
    );
    await act(async () =>
      document.querySelector('[aria-label="閉じる"]').click(),
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    assert.equal(dismissed, 1);
  } finally {
    await act(async () => root.unmount());
    reduced = false;
  }
});

test("one dock follows dialog focus scopes, restores the parent, and submits the associated form", async () => {
  reduced = true;
  let saved = 0;
  let setBusy;
  const root = createRoot(document.getElementById("root"));
  const h = React.createElement;
  function Harness() {
    const [mode, setMode] = React.useState("browse");
    const [nested, setNested] = React.useState(false);
    const [busy, updateBusy] = React.useState(false);
    setBusy = updateBusy;
    return h(
      ThumbDockProvider,
      null,
      h(
        ThumbDock,
        { mode: "browse" },
        h("button", { onClick: () => setMode("detail") }, "詳細を開く"),
        h(ThumbActions),
      ),
      h(ThumbAction, null, h("button", null, "ページの操作")),
      mode !== "browse" &&
        h(
          Modal,
          {
            title: mode === "edit" ? "編集" : "詳細",
            onClose: () => setMode("browse"),
            action:
              mode === "detail"
                ? h("button", { onClick: () => setMode("edit") }, "編集する")
                : null,
          },
          mode === "edit"
            ? h(
                "form",
                {
                  onSubmit: (event) => {
                    event.preventDefault();
                    saved++;
                  },
                },
                h("input", { required: true, name: "title" }),
                h(SaveButton, { busy }),
              )
            : h("button", { onClick: () => setNested(true) }, "子画面を開く"),
          nested &&
            h(
              Modal,
              { title: "子画面", onClose: () => setNested(false) },
              "子画面の本文",
            ),
        ),
    );
  }
  try {
    await act(async () => root.render(h(Harness)));
    const host = document.querySelector(".thumb-dock-host");
    const surface = host.querySelector(".cdock-islands");
    const dockButton = (text) =>
      [...host.querySelectorAll("button")].find(
        (button) => button.textContent === text,
      );
    assert.equal(host.parentElement, document.body);
    assert.ok(dockButton("ページの操作"));
    await act(async () => dockButton("詳細を開く").click());
    const detail = document.querySelector("dialog");
    assert.equal(
      host.parentElement,
      detail,
      "dock must belong to the active dialog's focus trap",
    );
    assert.equal(
      host.querySelector(".cdock-islands"),
      surface,
      "islands must not remount",
    );
    await act(async () => detail.querySelector(".modal-body button").click());
    const nested = document.querySelectorAll("dialog")[1];
    assert.equal(host.parentElement, nested);
    await act(async () => host.querySelector('[aria-label="戻る"]').click());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    assert.equal(host.parentElement, detail);
    await act(async () => dockButton("編集する").click());
    assert.equal(host.querySelector(".thumb-dock").dataset.mode, "edit");
    const save = dockButton("保存する");
    assert.equal(save.form, detail.querySelector("form"));
    await act(async () => save.click());
    assert.equal(
      saved,
      0,
      "required fields must still be validated by the browser",
    );
    detail.querySelector("input").value = "テスト予定";
    await act(async () => save.click());
    assert.equal(saved, 1);
    await act(async () => setBusy(true));
    assert.equal(dockButton("保存中…").disabled, true);
    await act(async () => setBusy(false));
    assert.equal(dockButton("保存する").form, detail.querySelector("form"));
    assert.equal(
      host.querySelectorAll(".cdock-content > [data-slot]").length,
      2,
    );
    assert.ok(save.closest('[data-slot="r"]'));
    await act(async () =>
      host.querySelector('.context-back [aria-label="戻る"]').click(),
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    assert.equal(host.parentElement, document.body);
    assert.equal(host.querySelector(".cdock-islands"), surface);
    assert.ok(dockButton("詳細を開く"));
    assert.equal(document.querySelectorAll(".thumb-dock-host").length, 1);
  } finally {
    await act(async () => root.unmount());
    reduced = false;
  }
  assert.equal(document.querySelector(".thumb-dock-host"), null);
});

function pointer(target, type, x = 0, y = 0, extra = {}) {
  const event = new dom.window.Event(type, { bubbles: true });
  Object.assign(event, {
    button: 0,
    isPrimary: true,
    pointerType: "touch",
    pointerId: 1,
    clientX: x,
    clientY: y,
    ...extra,
  });
  target.dispatchEvent(event);
}

test("details retain the same six tab nodes and close before one-tap navigation, including the current tab", async () => {
  let surface;
  HTMLElement.prototype.animate = function () {
    const animation = timeline();
    if (this.matches("dialog, .modal-inner")) surface = animation;
    return animation;
  };
  document.startViewTransition = () => {
    throw new Error("detail must close before route snapshots");
  };
  const h = React.createElement;
  const root = createRoot(document.getElementById("root"));
  let openDetail;
  let edits = 0;
  function Harness() {
    useMotionNavigation();
    const [open, setOpen] = React.useState(false);
    openDetail = () => setOpen(true);
    return h(
      ThumbDockProvider,
      null,
      h("output", null, useLocation().pathname),
      h(ThumbDock, { mode: "browse" }, h(TripDock, { tripId: "demo" })),
      open &&
        h(
          Modal,
          {
            title: "予約詳細",
            preserveNavigation: true,
            onClose: () => setOpen(false),
            action: h("button", { onClick: () => edits++ }, "編集"),
          },
          "詳細本文",
        ),
    );
  }
  try {
    await act(async () =>
      root.render(
        h(
          MemoryRouter,
          { initialEntries: ["/trips/demo/bookings"] },
          h(Harness),
        ),
      ),
    );
    const nav = document.querySelector(".cdock-tabs");
    const islands = document.querySelector(".cdock-islands");
    assert.ok(islands);
    const icons = [...nav.querySelectorAll("svg")];
    const host = document.querySelector(".thumb-dock-host");
    for (const destination of ["bookings", "places", "notes"]) {
      await act(async () => openDetail());
      const dialog = document.querySelector("dialog");
      assert.equal(document.querySelector(".cdock-islands"), islands);
      assert.equal(host.parentElement, dialog);
      assert.equal(dialog.querySelector(".cdock-tabs"), nav);
      assert.deepEqual([...nav.querySelectorAll("svg")], icons);
      assert.equal(host.querySelector(".thumb-dock").dataset.mode, "browse");
      assert.ok(host.querySelector('[data-slot="l"] [aria-label="戻る"]'));
      // The detail's own action stays in its header.
      await act(async () =>
        [...dialog.querySelectorAll("button")]
          .find((button) => button.textContent === "編集")
          .click(),
      );
      await act(async () =>
        nav.querySelector(`a[href$="/${destination}"]`).click(),
      );
      assert.ok(
        dialog.isConnected,
        "close animation gets to finish before routing",
      );
      await act(async () => surface.finish());
      assert.equal(document.querySelector("dialog"), null);
      assert.equal(
        document.querySelector("output").textContent,
        `/trips/demo/${destination}`,
      );
      assert.equal(host.parentElement, document.body);
      assert.equal(document.querySelector(".cdock-islands"), islands);
      assert.equal(host.querySelector(".cdock-tabs"), nav);
      assert.deepEqual([...nav.querySelectorAll("svg")], icons);
      // Back on the tabs, the trip header (not the dock) leads home.
      assert.equal(
        host.querySelector('[data-slot="l"]:not([data-outgoing])'),
        null,
      );
    }
    assert.equal(edits, 3);
    await act(async () => openDetail());
    await act(async () =>
      host.querySelector('[data-slot="l"] [aria-label="戻る"]').click(),
    );
    await act(async () => surface.finish());
    assert.equal(document.querySelector("dialog"), null);
    assert.equal(
      document.querySelector("output").textContent,
      "/trips/demo/notes",
    );
  } finally {
    await act(async () => root.unmount());
    delete document.startViewTransition;
  }
});

// Press feedback is behaviour, not the squish's spring amounts: a press marks
// the right surface, releases on cancel/scroll, never blocks the tap, and
// leaves disabled controls and reduced motion alone.
test("press feedback marks the pressed surface, releases on cancel or scroll and keeps taps working", () => {
  const host = document.createElement("div");
  host.innerHTML =
    '<button class="icon-button">メニュー</button><button class="icon-button" disabled>無効</button><article class="place-card" data-press-card><button class="place-card-main">場所詳細</button><button class="place-card-action">しおりへ</button></article><button class="timeline-empty" disabled><div data-press-card>閲覧のみ</div></button>';
  document.body.append(host);
  const cleanup = installPressFeedback();
  const [menu, disabled] = host.querySelectorAll(".icon-button");
  const card = host.querySelector(".place-card");
  const detail = host.querySelector(".place-card-main");
  const add = host.querySelector(".place-card-action");
  try {
    pointer(menu, "pointerdown");
    assert.equal(menu.dataset.pressActive, "true");
    pointer(document, "pointerup");
    assert.equal(menu.dataset.pressActive, undefined);
    pointer(menu, "pointerdown");
    pointer(menu, "pointercancel");
    assert.equal(menu.dataset.pressActive, undefined, "cancel releases");
    pointer(menu, "pointerdown");
    pointer(menu, "pointerout", 0, 0, { relatedTarget: document.body });
    assert.equal(menu.dataset.pressActive, undefined, "leaving releases");
    menu.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: " ", bubbles: true }),
    );
    assert.equal(menu.dataset.pressActive, "true", "keyboard presses too");
    menu.dispatchEvent(
      new dom.window.KeyboardEvent("keyup", { key: " ", bubbles: true }),
    );
    assert.equal(menu.dataset.pressActive, undefined);
    let activated = 0;
    menu.onclick = () => activated++;
    menu.click();
    assert.equal(activated, 1, "native activation is untouched");

    // A card squishes as one surface; its inner actions stay independent.
    pointer(add, "pointerdown", 20, 20);
    assert.equal(card.dataset.pressActive, "true");
    pointer(add, "pointermove", 22, 23);
    assert.equal(
      card.dataset.pressActive,
      "true",
      "a small move keeps contact",
    );
    pointer(add, "pointermove", 20, 45);
    assert.equal(card.dataset.pressActive, undefined, "scrolling releases");
    let details = 0,
      additions = 0;
    detail.onclick = () => details++;
    add.onclick = () => additions++;
    add.click();
    assert.deepEqual([details, additions], [0, 1]);

    for (const node of host.querySelectorAll(":disabled")) {
      pointer(node, "pointerdown");
      const surface = node.querySelector("[data-press-card]") ?? node;
      assert.equal(surface.dataset.pressActive, undefined, "disabled stays");
      pointer(document, "pointerup");
    }
    assert.equal(disabled.dataset.pressActive, undefined);
    reduced = true;
    pointer(menu, "pointerdown");
    assert.equal(menu.dataset.pressActive, undefined, "reduced motion");
    reduced = false;
    pointer(menu, "pointerdown");
    cleanup();
    assert.equal(menu.dataset.pressActive, undefined, "cleanup releases");
  } finally {
    reduced = false;
    cleanup();
    host.remove();
  }
});

test("keyboard occlusion ignores rubber banding and non-editable focus", () => {
  const input = document.createElement("input");
  const viewport = { height: 800, offsetTop: 0, scale: 1 };
  for (const offsetTop of [-240, -120, -20, 0, 80]) {
    assert.equal(
      keyboardInset(800, { ...viewport, offsetTop }, document.body),
      0,
    );
    assert.equal(keyboardInset(800, { ...viewport, offsetTop }, input), 0);
  }
  assert.equal(
    keyboardInset(800, { ...viewport, height: 740 }, input),
    0,
    "browser chrome does not open a keyboard",
  );
  assert.equal(
    keyboardInset(800, { ...viewport, height: 480 }, document.body),
    0,
    "no focused editor means no keyboard lift",
  );
  assert.equal(keyboardInset(800, { ...viewport, height: 480 }, input), 320);
  assert.equal(
    keyboardInset(800, { ...viewport, height: 480, offsetTop: 50 }, input),
    320,
  );
  assert.equal(
    keyboardInset(800, { ...viewport, height: 480, offsetTop: -30 }, input),
    320,
    "negative overscroll never adds extra lift",
  );
  assert.equal(
    keyboardInset(800, { ...viewport, height: 400, scale: 2 }, input),
    0,
    "pinch zoom is not a keyboard",
  );
  input.readOnly = true;
  assert.equal(keyboardInset(800, { ...viewport, height: 480 }, input), 0);
  input.readOnly = false;
  input.type = "checkbox";
  assert.equal(
    keyboardInset(800, { ...viewport, height: 480 }, input),
    0,
    "checkbox focus does not require a keyboard",
  );
  assert.equal(keyboardInset(800, null, input), 0);
});

test("menu depth keeps scrolled fixed controls in place and reverses from an interrupted opening", () => {
  const main = document.createElement("main");
  main.id = "main-content";
  main.style.position = "relative";
  const add = document.createElement("button");
  add.className = "floating-add";
  add.style.position = "fixed";
  const originalStyle = add.getAttribute("style");
  main.append(add);
  document.getElementById("root").append(main);
  main.getBoundingClientRect = () => ({
    left: 0,
    top: -1200,
    width: 390,
    height: 3000,
  });
  add.getBoundingClientRect = () => ({
    left: 320,
    top: 650,
    width: 52,
    height: 52,
  });
  const calls = [];
  HTMLElement.prototype.animate = function (frames) {
    const motion = timeline();
    calls.push({ element: this, frames, motion });
    return motion;
  };
  try {
    const effect = menuDepth(false, { duration: 440, fill: "both" });
    assert.equal(add.style.position, "absolute");
    assert.equal(add.style.top, "1850px");
    assert.equal(add.style.left, "320px");
    assert.equal(calls[0].element, main);
    assert.equal(
      calls[0].frames[1].transformOrigin,
      `${window.innerWidth / 2}px ${window.innerHeight / 2 + 1200}px`,
      "the page recedes around the visible centre, not the document's",
    );
    effect.reverse(120);
    assert.equal(calls[0].motion.currentTime, 120);
    assert.equal(calls[0].motion.playbackRate, -1);
    effect.cancel();
    assert.equal(calls[0].motion.cancelled, true);
    assert.equal(add.getAttribute("style"), originalStyle);
    assert.equal(main.style.position, "relative");
    calls.length = 0;
    const reducedEffect = menuDepth(true, { duration: 440 });
    assert.equal(calls.length, 0);
    assert.notEqual(main.style.filter, "", "reduced motion still dims at once");
    reducedEffect.cancel();
    assert.equal(main.style.filter, "");
    assert.equal(add.getAttribute("style"), originalStyle);
  } finally {
    main.remove();
  }
});

test("a foreground panel leaves the dock sharp and a nested panel only recedes its parent", () => {
  const main = document.createElement("main");
  main.id = "main-content";
  document.getElementById("root").append(main);
  const dockHost = document.createElement("div");
  dockHost.className = "thumb-dock-host";
  dockHost.innerHTML = '<div class="thumb-dock"></div>';
  const first = document.createElement("dialog");
  first.className = "modal";
  first.open = true;
  first.innerHTML = '<div class="modal-inner"></div>';
  document.body.append(dockHost, first);
  const animated = [];
  HTMLElement.prototype.animate = function () {
    animated.push(this);
    return timeline();
  };
  try {
    const outer = menuDepth(false, { duration: 320 }, first);
    assert.deepEqual(animated, [main]);
    const second = document.createElement("dialog");
    second.className = "modal";
    second.open = true;
    document.body.append(second);
    animated.length = 0;
    const inner = menuDepth(false, { duration: 320 }, second);
    assert.deepEqual(animated, [first.querySelector(".modal-inner")]);
    inner.cancel();
    second.remove();
    outer.cancel();
  } finally {
    main.remove();
    first.remove();
    dockHost.remove();
  }
});

test("the mobile add button survives page replacement and uses the current page action", async () => {
  const h = React.createElement;
  const root = createRoot(document.getElementById("root"));
  let change;
  const clicked = [];
  function Harness() {
    const [page, setPage] = React.useState("予定");
    change = setPage;
    return h(
      ThumbDockProvider,
      null,
      h(
        "main",
        { id: "main-content" },
        page &&
          h(AddButton, {
            key: page,
            label: page + "を追加",
            onClick: () => clicked.push(page),
          }),
      ),
    );
  }
  try {
    await act(async () => root.render(h(Harness)));
    const button = document.querySelector(".persistent-add");
    assert.equal(
      button.parentElement,
      document.body,
      "outside the moving route",
    );
    for (const page of ["予定", "予約", "場所", "メモ", "予定"]) {
      await act(async () => change(page));
      assert.equal(document.querySelector(".persistent-add"), button);
      assert.equal(button.hidden, false);
      assert.equal(button.getAttribute("aria-label"), page + "を追加");
      await act(async () => button.click());
      assert.equal(clicked.at(-1), page);
    }
    await act(async () => change(null));
    assert.equal(
      button.hidden,
      true,
      "viewer/no-add pages expose no stale action",
    );
    await act(async () => change("予約"));
    assert.equal(document.querySelector(".persistent-add"), button);
    assert.equal(button.hidden, false);
  } finally {
    await act(async () => root.unmount());
  }
});

test("calendar floats above its editor, commits ranges only on confirmation and restores the editor dock", async () => {
  reduced = true;
  const root = createRoot(document.getElementById("root"));
  const h = React.createElement;
  function Harness() {
    const [dates, setDates] = React.useState(["2028-02-20", "2028-02-24"]);
    return h(
      ThumbDockProvider,
      null,
      h(
        Modal,
        { title: "旅行を編集", full: true, onClose() {} },
        h("input", { defaultValue: "編集中の旅行名" }),
        h(DatePicker, {
          label: "旅行期間",
          value: dates[0],
          endValue: dates[1],
          range: true,
          showTime: true,
          startTime: dates[2] ?? "",
          endTime: dates[3] ?? "",
          required: true,
          min: "2028-02-05",
          onChange: (start, end, startTime, endTime) =>
            setDates([start, end, startTime, endTime]),
        }),
      ),
    );
  }
  const click = async (node) => {
    assert.ok(node);
    await act(async () => node.click());
  };
  const closeWait = async () =>
    act(async () => new Promise((resolve) => setTimeout(resolve, 15)));
  try {
    await act(async () => root.render(h(Harness)));
    const editor = document.querySelector("dialog");
    const trigger = editor.querySelector(".date-trigger");
    const input = editor.querySelector("input");
    const host = document.querySelector(".thumb-dock-host");
    await click(trigger);
    const panel = [...document.querySelectorAll("dialog")].at(-1);
    assert.notEqual(panel, editor);
    assert.equal(
      panel.classList.contains("full"),
      false,
      "calendar is a floating child panel",
    );
    assert.equal(
      host.parentElement,
      panel,
      "keyboard-safe dock follows the foreground panel",
    );
    const yearSelect = panel.querySelector('[aria-label="年を選択"]');
    assert.equal(yearSelect.tagName, "SELECT", "year uses the OS selection UI");
    const monthSelect = panel.querySelector('[aria-label="月を選択"]');
    assert.equal(monthSelect.tagName, "SELECT");
    await act(async () => {
      monthSelect.value = "3";
      monthSelect.dispatchEvent(
        new dom.window.Event("change", { bubbles: true }),
      );
    });
    assert.ok(panel.querySelector('[data-date="2028-03-31"]'));
    await act(async () => {
      monthSelect.value = "2";
      monthSelect.dispatchEvent(
        new dom.window.Event("change", { bubbles: true }),
      );
    });

    await act(async () => {
      yearSelect.value = "2027";
      yearSelect.dispatchEvent(
        new dom.window.Event("change", { bubbles: true }),
      );
    });
    assert.equal(panel.querySelector('[data-date="2027-02-29"]'), null);
    await act(async () => {
      yearSelect.value = "2028";
      yearSelect.dispatchEvent(
        new dom.window.Event("change", { bubbles: true }),
      );
    });
    assert.equal(
      panel.querySelector('[data-date="2028-02-04"]').disabled,
      true,
    );
    assert.ok(
      panel.querySelector('[data-date="2028-02-29"]'),
      "leap day selectable",
    );
    await click(panel.querySelector('[data-date="2028-02-29"]'));
    assert.equal(
      host.querySelector('[data-slot="r"] button').disabled,
      true,
      "range needs its second date",
    );
    await click(panel.querySelector('[data-date="2028-02-12"]'));
    assert.equal(
      trigger.dataset.dateValue,
      "2028-02-20",
      "changes stay in the child draft",
    );
    const setTime = async (value) =>
      act(async () => {
        const input = panel.querySelector('input[type="time"]');
        Object.getOwnPropertyDescriptor(
          dom.window.HTMLInputElement.prototype,
          "value",
        ).set.call(input, value);
        input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      });
    assert.match(
      panel.querySelector(".calendar-time label").textContent,
      /帰着日の時刻/,
    );
    await setTime("09:30");
    await click(panel.querySelector(".calendar-summary button"));
    await setTime("13:00");
    await click(host.querySelector('[data-slot="r"] button'));
    await closeWait();
    assert.match(trigger.textContent, /13:00/);
    assert.match(trigger.textContent, /09:30/);
    assert.equal(document.querySelectorAll("dialog").length, 1);
    assert.equal(trigger.dataset.dateValue, "2028-02-12");
    assert.equal(
      trigger.dataset.dateEnd,
      "2028-02-29",
      "earlier second date swaps the endpoints",
    );
    assert.equal(host.parentElement, editor);
    assert.equal(editor.querySelector("input"), input);
    assert.equal(input.value, "編集中の旅行名");
    await click(trigger);
    const cancelled = [...document.querySelectorAll("dialog")].at(-1);
    await click(cancelled.querySelector('[data-date="2028-02-06"]'));
    await click(host.querySelector('[aria-label="戻る"]'));
    await closeWait();
    assert.equal(
      trigger.dataset.dateValue,
      "2028-02-12",
      "closing without confirming preserves both dates",
    );
    assert.equal(trigger.dataset.dateEnd, "2028-02-29");
    assert.equal(host.parentElement, editor);
    await click(trigger);
    const sameDay = [...document.querySelectorAll("dialog")].at(-1);
    await click(sameDay.querySelector('[data-date="2028-02-20"]'));
    await click(sameDay.querySelector('[data-date="2028-02-20"]'));
    assert.ok(
      [...sameDay.querySelectorAll(".calendar-range-band")].every(
        (band) => band.style.width === "0%",
      ),
      "same-day selection has only a round marker, no square range background",
    );
    assert.equal(
      sameDay.querySelectorAll('.calendar-marker[style*="opacity: 1"]').length,
      1,
    );
    await click(host.querySelector('[data-slot="r"] button'));
    await closeWait();
    assert.equal(trigger.dataset.dateValue, "2028-02-20");
    assert.equal(trigger.dataset.dateEnd, "2028-02-20");
  } finally {
    await act(async () => root.unmount());
    reduced = false;
  }
});

test("a trip opens by stretching its card into the screen and returns into the card, restoring list scroll", async () => {
  const root = createRoot(document.getElementById("root"));
  const h = React.createElement;
  const originalScroll = window.scrollTo;
  const originalY = window.scrollY;
  const nativeRect = dom.window.HTMLElement.prototype.getBoundingClientRect;
  const nativeAnimate = HTMLElement.prototype.animate;
  HTMLElement.prototype.animate = () => ({
    finished: Promise.resolve(),
    cancel() {},
  });
  const wait = (ms) =>
    act(async () => new Promise((resolve) => setTimeout(resolve, ms)));
  let navigate;
  let scroll;
  const pages = [];
  window.scrollTo = (options) => {
    scroll = options.top;
  };
  window.scrollY = 560;
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    return this.classList.contains("home-trip")
      ? { left: 18, top: 120, width: 354, height: 196 }
      : nativeRect.call(this);
  };
  function Harness() {
    const [page, setPage] = React.useState("list");
    navigate = (next) => {
      pages.push(next);
      setPage(next);
    };
    return page === "list"
      ? h("a", { className: "home-trip", "data-trip-surface": "trip1" }, page)
      : h("main", null, page);
  }
  const card = () => document.querySelector(".home-trip");
  const ink = () => document.querySelector(".cartoon-morph");
  try {
    await act(async () => root.render(h(Harness)));
    startTripTransition(() => navigate("itinerary"), "trip1");
    assert.ok(ink(), "the card's ink stretches out");
    assert.equal(ink().style.left, "18px");
    assert.equal(card().style.visibility, "hidden");
    assert.equal(document.documentElement.dataset.tripTransition, "open");
    assert.ok(card(), "the trip waits under the stretch");
    await wait(470);
    assert.equal(document.querySelector("main").textContent, "itinerary");
    assert.equal(scroll, 0);
    await wait(20);
    assert.equal(ink(), null, "the ink fades off the trip");
    assert.equal(document.documentElement.dataset.tripTransition, undefined);

    startTripTransition(() => navigate("list"), "trip1", true);
    await wait(20);
    assert.ok(card(), "home returns under the ink");
    assert.equal(scroll, 560);
    assert.equal(card().style.visibility, "hidden");
    assert.ok(ink(), "the ink shrinks into the card");
    await wait(520);
    assert.equal(card().style.visibility, "");
    assert.equal(ink(), null);
    assert.equal(document.documentElement.dataset.tripTransition, undefined);

    startTripTransition(() => navigate("stale"), "trip1");
    startTripTransition(() => navigate("itinerary"), "trip1");
    await wait(490);
    assert.ok(
      !pages.includes("stale"),
      "a superseded open cannot replace the newer navigation",
    );
    assert.equal(document.querySelector("main").textContent, "itinerary");
    reduced = true;
    await act(async () =>
      startTripTransition(() => navigate("list"), "trip1", true),
    );
    assert.ok(card(), "reduced motion commits at once");
    assert.equal(ink(), null);
  } finally {
    await act(async () => root.unmount());
    dom.window.HTMLElement.prototype.getBoundingClientRect = nativeRect;
    HTMLElement.prototype.animate = nativeAnimate;
    window.scrollTo = originalScroll;
    window.scrollY = originalY;
    reduced = false;
  }
});

test("returning home when the trip's card is off screen fades the ink instead of shrinking it", async () => {
  const originalScroll = window.scrollTo;
  const host = document.getElementById("root");
  const nativeAnimate = HTMLElement.prototype.animate;
  HTMLElement.prototype.animate = () => ({
    finished: Promise.resolve(),
    cancel() {},
  });
  window.scrollTo = () => {};
  try {
    host.innerHTML = '<main id="main-content"><p>Bookings</p></main>';
    startTripTransition(
      () => {
        host.innerHTML =
          '<main id="main-content"><a class="home-trip" data-trip-surface="trip1">Trip</a></main>';
      },
      "trip1",
      true,
    );
    assert.equal(document.documentElement.dataset.tripTransition, "close");
    assert.ok(document.querySelector(".cartoon-morph"), "ink covers the trip");
    await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
    assert.ok(host.querySelector(".home-trip"));
    assert.equal(host.querySelector(".home-trip").style.visibility, "");
    assert.equal(document.querySelector(".cartoon-morph"), null);
    assert.equal(document.documentElement.dataset.tripTransition, undefined);
  } finally {
    HTMLElement.prototype.animate = nativeAnimate;
    window.scrollTo = originalScroll;
    host.innerHTML = "";
  }
});

test("date strip slides to the selected day and scrolls only when needed, respecting reduced motion", async () => {
  const root = createRoot(document.getElementById("root"));
  const days = ["2026-10-07", "2026-10-08", "2026-10-09"];
  const selections = [];
  const scrolls = [];
  const render = (selectedDay) =>
    root.render(
      React.createElement(DayStrip, {
        days,
        selectedDay,
        onSelect: (...args) => selections.push(args),
      }),
    );
  try {
    await act(async () => render(days[0]));
    const rail = document.querySelector(".date-strip");
    const buttons = [...rail.querySelectorAll("button")];
    const marker = rail.querySelector(".date-selection");
    rail.scrollTo = (options) => scrolls.push(options);
    rail.getBoundingClientRect = () => ({ left: 0, right: 150, width: 150 });
    Object.defineProperty(rail, "clientWidth", { value: 150 });
    buttons.forEach((button, index) => {
      Object.defineProperties(button, {
        offsetLeft: { value: 16 + index * 64 },
        offsetTop: { value: 9 },
        offsetWidth: { value: 58 },
        offsetHeight: { value: 46 },
      });
      button.getBoundingClientRect = () => ({
        left: 16 + index * 64,
        right: 74 + index * 64,
        width: 58,
      });
    });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    await act(async () => buttons[2].click());
    assert.deepEqual(selections.at(-1), [days[2], "smooth"]);
    await act(async () => render(days[2]));
    assert.equal(
      marker,
      rail.querySelector(".date-selection"),
      "the same selection surface moves between days",
    );
    assert.deepEqual(scrolls.at(-1), { left: 98, behavior: "smooth" });
    assert.equal(buttons[2].getAttribute("aria-current"), "date");
    const count = scrolls.length;
    await act(async () => render(days[1]));
    assert.equal(
      scrolls.length,
      count,
      "a visible selected day does not move the strip",
    );
    reduced = true;
    await act(async () => buttons[2].click());
    assert.deepEqual(selections.at(-1), [days[2], "instant"]);
    await act(async () => render(days[2]));
    assert.equal(scrolls.at(-1).behavior, "instant");
  } finally {
    reduced = false;
    await act(async () => root.unmount());
  }
});

test("place cards separate detail and scheduling actions, and open Google Maps only from a saved link or the pin", async () => {
  const root = createRoot(document.getElementById("root"));
  let opened = 0;
  let scheduled = 0;
  let closed = 0;
  const render = (props = {}) =>
    root.render(
      React.createElement(PlaceSheet, {
        title: "美術館",
        tag: React.createElement("span", null, "候補 · まだ予定なし"),
        lines: ["展示を見る"],
        mapsHref: "https://maps.app.goo.gl/demo",
        onOpen: () => opened++,
        onClose: () => closed++,
        onSchedule: () => scheduled++,
        ...props,
      }),
    );
  try {
    await act(async () => render());
    await act(async () =>
      document.querySelector('[aria-label="美術館の詳細"]').click(),
    );
    assert.equal(opened, 1);
    assert.equal(scheduled, 0);
    await act(async () =>
      document.querySelector(".places-card-actions .is-secondary").click(),
    );
    assert.equal(scheduled, 1);
    assert.equal(opened, 1, "scheduling does not also open the detail panel");
    assert.equal(
      document.querySelector(".places-card-actions .is-secondary")
        .nextElementSibling.tagName,
      "A",
      "scheduling precedes the map, as in the mock",
    );
    await act(async () =>
      document.querySelector('.places-card [aria-label="閉じる"]').click(),
    );
    assert.equal(closed, 1);
    assert.equal(opened, 1, "closing does not open the detail panel");
    await act(async () => render({ onSchedule: undefined }));
    assert.equal(
      document.querySelector(".places-card-actions .is-secondary"),
      null,
      "read-only visitors and scheduled places cannot schedule",
    );
    assert.ok(
      document.querySelector(".places-card a.is-primary"),
      "viewers can open maps",
    );
    await act(async () => render({ mapsHref: null }));
    assert.equal(document.querySelector(".places-card a"), null);
    for (const [status, icon] of [
      ["want", "heart"],
      ["planned", "calendar-check"],
      ["visited", "circle-check"],
      ["skipped", "circle-pause"],
    ]) {
      await act(async () =>
        root.render(React.createElement(PlaceStatusLabel, { status })),
      );
      assert.ok(document.querySelector(`.place-status-label .lucide-${icon}`));
    }
    const pin = { lat: 48.2, lng: 16.37 };
    for (const location of [
      "https://maps.app.goo.gl/demo",
      "https://goo.gl/maps/demo",
      "https://www.google.com/maps/search/?api=1&query=Vienna",
      "https://maps.google.co.jp/?q=Vienna",
    ]) {
      assert.equal(placeMapsHref(location, null), location);
      assert.equal(
        placeMapsHref(location, pin),
        location,
        "the saved link wins",
      );
    }
    for (const location of [
      "",
      "旧市街",
      "https://museum.example/",
      "https://google.com.evil.example/maps",
      "javascript:alert(1)",
    ]) {
      assert.equal(placeMapsHref(location, null), null);
      assert.equal(
        placeMapsHref(location, pin),
        "https://www.google.com/maps/search/?api=1&query=48.2,16.37",
        "a pin without a Google link opens its coordinates",
      );
    }
  } finally {
    await act(async () => root.unmount());
  }
});

test("focused modal fields remain above the moving dock inside an unchanged panel", () => {
  const dialog = document.createElement("dialog");
  dialog.open = true;
  dialog.innerHTML =
    '<div class="modal-inner"><header class="modal-header"></header><label class="field"><textarea></textarea></label></div><div class="thumb-dock-host"></div>';
  document.body.append(dialog);
  const panel = dialog.firstElementChild;
  const header = panel.firstElementChild;
  const field = panel.lastElementChild;
  const input = field.firstElementChild;
  let panelTop = 64;
  const panelBottom = 800;
  const dock = dialog.lastElementChild;
  let dockTop = 356;
  dock.getBoundingClientRect = () => ({ top: dockTop, height: 64 });
  let inputTop = 420;
  let inputHeight = 80;
  panel.getBoundingClientRect = () => ({ top: panelTop, bottom: panelBottom });
  header.getBoundingClientRect = () => ({ bottom: panelTop + 56 });
  input.getBoundingClientRect = () => ({
    top: inputTop - panel.scrollTop,
    bottom: inputTop + inputHeight - panel.scrollTop,
  });
  field.getBoundingClientRect = () => ({
    top: inputTop - 24 - panel.scrollTop,
  });
  try {
    revealModalField(input);
    assert.equal(
      panel.scrollTop,
      172,
      "lower field and label clear the floating dock",
    );
    revealModalField(input);
    assert.equal(panel.scrollTop, 172, "visible field does not move again");
    dockTop = 296;
    revealModalField(input);
    assert.equal(panel.scrollTop, 232, "follows the keyboard's later resize");
    inputTop = 270;
    revealModalField(input);
    assert.equal(panel.scrollTop, 114, "previous field clears sticky header");
    inputHeight = 400;
    revealModalField(input);
    assert.equal(
      panel.scrollTop,
      138,
      "oversized textarea starts below header",
    );
    revealModalField(input);
    assert.equal(panel.scrollTop, 138, "oversized textarea does not oscillate");
    dialog.classList.add("closing");
    inputTop = 700;
    revealModalField(input);
    assert.equal(panel.scrollTop, 138, "closing panels do not scroll");
    dialog.classList.remove("closing");
    panel.setAttribute("inert", "");
    revealModalField(input);
    assert.equal(panel.scrollTop, 138, "background panels do not scroll");
  } finally {
    dialog.remove();
  }
});

test("iOS focus guard keeps touch and accessory focus local while preserving caret, picker and swipe behavior", async () => {
  const ua = Object.getOwnPropertyDescriptor(window.navigator, "userAgent");
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value: "iPhone",
  });
  const dialog = document.createElement("dialog");
  dialog.open = true;
  dialog.innerHTML =
    '<div class="modal-inner"><label>上<input id="top"></label><input id="middle"><textarea id="bottom">draft</textarea><input type="date"><input type="checkbox"><input readonly><select><option>A</option></select></div>';
  document.body.append(dialog);
  const [first, middle] = dialog.querySelectorAll("input:not([type])");
  const last = dialog.querySelector("textarea");
  const touch = (target, type, points, changed = points, stamp) => {
    const event = new dom.window.Event(type, {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperties(event, {
      touches: { value: points },
      changedTouches: { value: changed },
    });
    if (stamp !== undefined)
      Object.defineProperty(event, "timeStamp", { value: stamp });
    target.dispatchEvent(event);
    return event;
  };
  const point = { identifier: 1, clientX: 50, clientY: 100 };
  const tap = (target) => {
    touch(target, "touchstart", [point]);
    return touch(target, "touchend", [], [point]);
  };
  const release = guardModalKeyboardFocus(document);
  try {
    first.style.setProperty("transform", "translateX(2px)", "important");
    first.style.transition = "color 1s";
    for (const field of [first, middle, last]) {
      const event = tap(field === first ? first.closest("label") : field);
      assert.equal(event.defaultPrevented, true);
      assert.equal(
        document.activeElement,
        field,
        "focus is synchronous so the keyboard still opens",
      );
      assert.equal(field.style.transform, "translateY(-10000px)");
      await new Promise((resolve) => setTimeout(resolve, 25));
      assert.equal(
        field.style.transform,
        field === first ? "translateX(2px)" : "",
      );
    }
    assert.equal(first.style.getPropertyPriority("transform"), "important");
    assert.equal(first.style.transition, "color 1s");
    last.setSelectionRange(2, 2);
    assert.equal(
      tap(last).defaultPrevented,
      false,
      "active editor retains native caret placement",
    );
    assert.equal(last.selectionStart, 2);
    assert.equal(last.value, "draft");
    first.focus();
    assert.equal(
      first.style.transform,
      "translateY(-10000px)",
      "accessory next/previous also guarded",
    );
    await new Promise((resolve) => setTimeout(resolve, 25));
    for (const field of dialog.querySelectorAll(
      "input[type],input[readonly],select",
    ))
      assert.equal(
        tap(field).defaultPrevented,
        false,
        "native pickers and non-editors stay native",
      );
    touch(last, "touchstart", [point]);
    touch(last, "touchmove", [{ ...point, clientY: 160 }]);
    assert.equal(
      touch(last, "touchend", [], [{ ...point, clientY: 160 }])
        .defaultPrevented,
      false,
      "swiping does not focus",
    );
    touch(last, "touchstart", [point, { ...point, identifier: 2 }]);
    assert.equal(
      touch(last, "touchend", [], [point]).defaultPrevented,
      false,
      "pinch is not a tap",
    );
    touch(last, "touchstart", [point], [point], 0);
    assert.equal(
      touch(last, "touchend", [], [point], 600).defaultPrevented,
      false,
      "long press retains selection",
    );
    const nested = document.createElement("dialog");
    nested.open = true;
    document.body.append(nested);
    assert.equal(
      tap(last).defaultPrevented,
      false,
      "background dialogs are not focus targets",
    );
    nested.remove();
    last.focus();
    release();
    assert.equal(
      last.style.transform,
      "",
      "cleanup restores a pending focus transform immediately",
    );
    first.focus();
    assert.equal(
      first.style.transform,
      "translateX(2px)",
      "no focus interception remains after cleanup",
    );
  } finally {
    release();
    dialog.remove();
    if (ua) Object.defineProperty(window.navigator, "userAgent", ua);
    else delete window.navigator.userAgent;
  }
});

test("modal page lock survives nested replacement and restores the original scroll and inline styles", () => {
  const ua = Object.getOwnPropertyDescriptor(window.navigator, "userAgent");
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value: "iPhone",
  });
  const originalScroll = window.scrollTo,
    originalY = window.scrollY;
  const bodyStyle = document.body.getAttribute("style"),
    rootStyle = document.documentElement.getAttribute("style");
  window.scrollY = 320;
  window.scrollTo = ({ top }) => {
    window.scrollY = top;
  };
  document.body.style.setProperty("overflow", "auto", "important");
  document.body.style.position = "relative";
  const releaseFirst = lockModalPage(),
    releaseNested = lockModalPage();
  try {
    assert.equal(document.body.style.position, "fixed");
    assert.equal(document.body.style.top, "-320px");
    assert.equal(
      window.scrollY,
      0,
      "focus begins with an anchored layout viewport",
    );
    window.scrollY = 180;
    window.dispatchEvent(new dom.window.Event("scroll"));
    assert.equal(window.scrollY, 0, "native page pan cannot move the panel");
    releaseFirst();
    releaseFirst();
    assert.equal(
      document.body.style.position,
      "fixed",
      "an outgoing dialog cannot unlock its replacement",
    );
    releaseNested();
    assert.equal(window.scrollY, 320);
    assert.equal(document.body.style.position, "relative");
    assert.equal(
      document.body.style.getPropertyPriority("overflow"),
      "important",
    );
    window.scrollY = 180;
    window.dispatchEvent(new dom.window.Event("scroll"));
    assert.equal(
      window.scrollY,
      180,
      "normal page scrolling returns after the last close",
    );
  } finally {
    releaseFirst();
    releaseNested();
    window.scrollTo = originalScroll;
    window.scrollY = originalY;
    if (bodyStyle === null) document.body.removeAttribute("style");
    else document.body.setAttribute("style", bodyStyle);
    if (rootStyle === null) document.documentElement.removeAttribute("style");
    else document.documentElement.setAttribute("style", rootStyle);
    if (ua) Object.defineProperty(window.navigator, "userAgent", ua);
    else delete window.navigator.userAgent;
  }
});

test("top, middle, last and tall textarea editors stay visible without moving the panel or dock", () => {
  const previousViewport = Object.getOwnPropertyDescriptor(
    window,
    "visualViewport",
  );
  const viewport = { height: 400, offsetTop: 0, scale: 1 };
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: viewport,
  });
  const dialog = document.createElement("dialog");
  dialog.open = true;
  dialog.innerHTML =
    '<div class="modal-inner"><header class="modal-header"></header><label class="field"><textarea>keep draft</textarea></label></div><div class="thumb-dock-host"></div>';
  document.body.append(dialog);
  const panel = dialog.firstElementChild,
    field = panel.lastElementChild,
    input = field.firstElementChild;
  const geometry = { top: 12, bottom: 684, height: 672 };
  panel.getBoundingClientRect = () => geometry;
  panel.firstElementChild.getBoundingClientRect = () => ({ bottom: 68 });
  dialog.lastElementChild.getBoundingClientRect = () => ({
    top: 700,
    height: 64,
  });
  let inputTop = 120,
    inputHeight = 44;
  input.getBoundingClientRect = () => ({
    top: inputTop - panel.scrollTop,
    bottom: inputTop + inputHeight - panel.scrollTop,
  });
  field.getBoundingClientRect = () => ({
    top: inputTop - 24 - panel.scrollTop,
  });
  try {
    for (const [top, height] of [
      [120, 44],
      [420, 44],
      [840, 44],
      [120, 44],
      [1000, 500],
    ]) {
      inputTop = top;
      inputHeight = height;
      revealModalField(input);
      const bounds = input.getBoundingClientRect();
      assert.ok(bounds.top >= 80 && bounds.top < 388);
      if (height < 308)
        assert.ok(bounds.bottom <= 388, "deep fields rise above the keyboard");
      assert.deepEqual(panel.getBoundingClientRect(), geometry);
      assert.equal(dialog.lastElementChild.getBoundingClientRect().top, 700);
      assert.equal(input.value, "keep draft");
      const scroll = panel.scrollTop;
      revealModalField(input);
      assert.equal(panel.scrollTop, scroll, "settled focus never oscillates");
    }
    viewport.offsetTop = 400;
    assert.equal(
      keyboardInset(window.innerHeight, viewport, input),
      window.innerHeight - 400,
      "native panning cannot erase keyboard scroll space",
    );
  } finally {
    dialog.remove();
    if (previousViewport)
      Object.defineProperty(window, "visualViewport", previousViewport);
    else delete window.visualViewport;
  }
});

function bootFixture() {
  const screen = document.createElement("div");
  screen.id = "initial-boot";
  document.body.append(screen);
  const root = document.getElementById("root");
  root.setAttribute("inert", "");
  return { screen, root };
}
const flushBoot = () => new Promise((resolve) => setImmediate(resolve));

test("boot keeps controls inert until drawing and exit complete, then never replays", async () => {
  const { screen, root } = bootFixture();
  const drawing = Promise.withResolvers();
  const exit = Promise.withResolvers();
  screen.getAnimations = (options) => [
    { finished: options?.subtree ? drawing.promise : exit.promise },
  ];
  finishBootScreen();
  await flushBoot();
  assert.equal(screen.classList.contains("boot-leaving"), false);
  assert.ok(root.hasAttribute("inert"));
  drawing.resolve();
  await flushBoot();
  assert.ok(screen.classList.contains("boot-leaving"));
  assert.ok(screen.isConnected);
  assert.ok(root.hasAttribute("inert"));
  exit.resolve();
  await flushBoot();
  assert.equal(screen.isConnected, false);
  assert.equal(root.hasAttribute("inert"), false);
  assert.equal(finishBootScreen(), undefined);
});

test("boot skips completed drawing after a slow load and tolerates cancelled animations", async () => {
  const { screen, root } = bootFixture();
  screen.getAnimations = () => [
    { finished: Promise.reject(new Error("cancelled")) },
  ];
  finishBootScreen();
  await flushBoot();
  assert.equal(screen.isConnected, false);
  assert.equal(root.hasAttribute("inert"), false);
});

test("boot cleanup does not remove a still-needed splash; a new effect can finish it", async () => {
  const { screen, root } = bootFixture();
  const drawing = Promise.withResolvers();
  screen.getAnimations = (options) =>
    options?.subtree ? [{ finished: drawing.promise }] : [];
  const cancel = finishBootScreen();
  cancel();
  drawing.resolve();
  await flushBoot();
  assert.ok(screen.isConnected);
  assert.ok(root.hasAttribute("inert"));
  finishBootScreen();
  await flushBoot();
  assert.equal(screen.isConnected, false);
  assert.equal(root.hasAttribute("inert"), false);
});

test("reduced motion releases boot immediately without waiting for animations", () => {
  const { screen, root } = bootFixture();
  reduced = true;
  try {
    screen.getAnimations = () => {
      throw new Error("must not wait");
    };
    finishBootScreen();
    assert.equal(screen.isConnected, false);
    assert.equal(root.hasAttribute("inert"), false);
  } finally {
    reduced = false;
  }
});
