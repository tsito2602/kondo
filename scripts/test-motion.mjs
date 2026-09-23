import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import sharp from "sharp";
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
      "export { PlaceCard } from './src/web/place-card'; export { DayStrip } from './src/web/day-strip'; export { TaskList } from './src/web/task-list'; export { DatePicker } from './src/web/date-picker'; export { startTripTransition } from './src/web/trip-transition'; export { menuDepth } from './src/web/menu-depth'; export { installPressFeedback } from './src/web/press-feedback'; export { AppRouter } from './src/web/router'; export { useItineraryScroll } from './src/web/itinerary-scroll'; export { startRouteTransition } from './src/web/motion'; export { DockContent } from './src/web/dock-content'; export { prepareDockMorph, dockContour, dockField, dockFieldPath, dockSlots, joinedDock, morphDock } from './src/web/fluid-dock'; export { dockKeyboardInset } from './src/web/viewport'; export { dockOutline, animateDockPress } from './src/web/dock-surface'; export { AnchoredMenu } from './src/web/anchored-menu'; export { SafariTabs } from './src/web/safari-tabs'; export { ThumbDockProvider, ThumbDock, ThumbAction, ThumbActions, ContextDock } from './src/web/thumb-dock'; export { Modal, SaveButton, AddButton } from './src/web/ui'; export { dismissModal, useMotionNavigation } from './src/web/motion';",
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
  PlaceCard,
  DayStrip,
  TaskList,
  DatePicker,
  startTripTransition,
  menuDepth,
  Modal,
  AddButton,
  installPressFeedback,
  AppRouter,
  useItineraryScroll,
  startRouteTransition,
  DockContent,
  AnchoredMenu,
  SafariTabs,
  dockOutline,
  prepareDockMorph,
  dockContour,
  dockField,
  dockFieldPath,
  dockSlots,
  joinedDock,
  morphDock,
  ContextDock,
  animateDockPress,
  dockKeyboardInset,
  SaveButton,
  dismissModal,
  useMotionNavigation,
  ThumbDockProvider,
  ThumbDock,
  ThumbAction,
  ThumbActions,
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

test("route layers cover short pages, clip header and dock, and leave no opaque outgoing fragments", async () => {
  const css = await readFile("src/web/styles.css", "utf8");
  assert.match(
    css,
    /#root:has\(> #main-content\)\s*\{[^}]*display: flex;[^}]*flex-direction: column;/,
  );
  assert.match(css, /#root > #main-content\s*\{[^}]*flex: 1 0 auto;/);
  assert.match(
    css,
    /::view-transition\s*\{[^}]*clip-path: inset\([^}]*--route-old-header-bottom[^}]*--route-new-header-bottom[^}]*--route-clip-bottom/,
  );
  assert.match(css, /@keyframes route-out\s*\{\s*to\s*\{[^}]*opacity: 0;/);
  assert.equal((css.match(/clip-path: inset\(/g) ?? []).length >= 1, true);
  // Mobile dock rules may supply a bottom inset, but must not replace the top clip.
  assert.doesNotMatch(
    css,
    /:root:has\([^}]+::view-transition\s*\{[^}]*clip-path:/,
  );
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
      assert.equal(surface.playbackRate, -1.15);
      assert.equal(background.playbackRate, -1.15);
      assert.equal(background.currentTime, surface.currentTime);
      assert.equal(backdrop.playbackRate, -1.15);
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
    const surface = host.querySelector(".thumb-dock-material");
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
      host.querySelector(".thumb-dock-material"),
      surface,
      "material must not remount",
    );
    await act(async () => detail.querySelector(".modal-body button").click());
    const nested = document.querySelectorAll("dialog")[1];
    assert.equal(host.parentElement, nested);
    await act(async () => dockButton("戻る").click());
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
    assert.equal(host.querySelectorAll(".context-island").length, 2);
    assert.ok(save.closest(".context-primary"));
    await act(async () =>
      host.querySelector('.context-back [aria-label="戻る"]').click(),
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    assert.equal(host.parentElement, document.body);
    assert.equal(host.querySelector(".thumb-dock-material"), surface);
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

function layoutTabs(nav, width = () => 360) {
  [...nav.querySelectorAll("a")].forEach((link, index) => {
    link.getBoundingClientRect = () => ({
      left: (index * width()) / 5,
      right: ((index + 1) * width()) / 5,
      top: 100,
      bottom: 164,
      width: width() / 5,
      height: 64,
    });
  });
  let captured;
  nav.setPointerCapture = (id) => {
    captured = id;
  };
  nav.hasPointerCapture = (id) => captured === id;
  nav.releasePointerCapture = (id) => {
    if (captured === id) captured = undefined;
  };
}

test("trip tabs stay joined with names and support one-tap or hold selection", async () => {
  const root = createRoot(document.getElementById("root"));
  const h = React.createElement;
  let menus = 0;
  let transitions = 0;
  document.startViewTransition = (update) => {
    transitions++;
    update();
    return {
      ready: Promise.resolve(),
      finished: Promise.resolve(),
      skipTransition() {},
    };
  };
  function Harness() {
    useMotionNavigation();
    return h(
      React.Fragment,
      null,
      h("output", null, useLocation().pathname),
      h(SafariTabs, { tripId: "demo", onMenu: () => menus++ }),
    );
  }
  try {
    await act(async () =>
      root.render(
        h(
          MemoryRouter,
          { initialEntries: ["/trips/demo/itinerary"] },
          h(Harness),
        ),
      ),
    );
    const nav = document.querySelector(".safari-tabs");
    layoutTabs(nav);
    const dock = document.querySelector(".safari-dock");
    const icons = [...nav.querySelectorAll("svg")];
    const places = nav.querySelector('a[href$="/places"]');
    const notes = nav.querySelector('a[href$="/notes"]');
    assert.equal(icons.length, 5);
    assert.equal(dock.dataset.level, "trip");
    assert.equal(dock.dataset.wide, "true");
    assert.equal(document.querySelectorAll(".safari-side[inert]").length, 2);
    assert.equal(
      dock.querySelector('a[href="/"]'),
      null,
      "trip-list navigation belongs in the header",
    );
    assert.equal(nav.hasAttribute("inert"), false);
    assert.equal(nav.querySelectorAll('a[tabindex="-1"]').length, 0);
    await act(async () => places.click());
    assert.equal(
      document.querySelector("output").textContent,
      "/trips/demo/places",
    );
    assert.equal(dock.dataset.expanded, "false");
    await act(async () => pointer(notes, "pointerdown", 324, 130));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 450)));
    assert.equal(dock.dataset.expanded, "true");
    assert.equal(document.querySelectorAll(".safari-side[inert]").length, 2);
    await act(async () => {
      pointer(nav, "pointerup", 324, 130);
      notes.click();
    });
    assert.equal(
      document.querySelector("output").textContent,
      "/trips/demo/places",
      "release after a hold must not select a tab",
    );
    assert.equal(dock.dataset.expanded, "true");
    assert.equal(
      transitions,
      1,
      "holding must bypass native route transitions",
    );
    await act(async () => notes.click());
    assert.equal(
      document.querySelector("output").textContent,
      "/trips/demo/notes",
    );
    assert.equal(dock.dataset.expanded, "false");
    assert.deepEqual([...nav.querySelectorAll("svg")], icons);
    for (const dismiss of ["outside", "escape"]) {
      await act(async () =>
        notes.dispatchEvent(
          new dom.window.KeyboardEvent("keydown", {
            key: "ArrowUp",
            bubbles: true,
          }),
        ),
      );
      assert.equal(dock.dataset.expanded, "true");
      await act(async () => {
        if (dismiss === "outside")
          document.querySelector(".safari-dismiss").click();
        else
          window.dispatchEvent(
            new dom.window.KeyboardEvent("keydown", {
              key: "Escape",
              cancelable: true,
            }),
          );
      });
      assert.equal(dock.dataset.expanded, "false");
    }
    await act(async () => {
      pointer(notes, "pointerdown", 324, 130);
      pointer(notes, "pointermove", 20);
    });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 450)));
    assert.equal(dock.dataset.expanded, "false", "dragging cancels a hold");
    assert.equal(
      document
        .querySelector('[aria-label="旅行メニュー"]')
        .closest(".safari-side")
        .hasAttribute("inert"),
      true,
    );
    assert.equal(menus, 0);
  } finally {
    await act(async () => root.unmount());
    delete document.startViewTransition;
  }
});

test("details retain the same five tab nodes and close before one-tap navigation, including the current tab", async () => {
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
      h(
        ThumbDock,
        { mode: "browse" },
        h(SafariTabs, { tripId: "demo", onMenu: () => {} }),
      ),
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
    const nav = document.querySelector(".safari-tabs");
    const dock = document.querySelector(".safari-dock");
    const material = document.querySelector(
      ".thumb-dock-material .safari-glass",
    );
    assert.ok(material);
    assert.equal(dock.dataset.wide, "true");
    const icons = [...nav.querySelectorAll("svg")];
    const host = document.querySelector(".thumb-dock-host");
    for (const destination of ["bookings", "places", "notes"]) {
      await act(async () => openDetail());
      const dialog = document.querySelector("dialog");
      assert.equal(dock.dataset.level, "detail");
      assert.equal(dock.dataset.wide, "false");
      assert.equal(
        document.querySelector(".thumb-dock-material .safari-glass"),
        material,
      );
      assert.equal(dock.querySelectorAll(".safari-side[inert]").length, 0);
      assert.equal(host.parentElement, dialog);
      assert.equal(dialog.querySelector(".safari-tabs"), nav);
      assert.deepEqual([...nav.querySelectorAll("svg")], icons);
      assert.equal(host.querySelector(".thumb-dock").dataset.mode, "browse");
      assert.ok(host.querySelector('[aria-label="詳細を閉じて戻る"]'));
      await act(async () =>
        host.querySelector(".safari-detail-action button").click(),
      );
      if (destination === "notes") {
        layoutTabs(nav);
        const origin = nav.querySelector('a[href$="/places"]');
        await act(async () => pointer(origin, "pointerdown", 108, 130));
        await act(
          async () => new Promise((resolve) => setTimeout(resolve, 450)),
        );
        assert.equal(
          dock.dataset.wide,
          "true",
          "holding reunites detail controls with the tab bar",
        );
        await act(async () => pointer(nav, "pointermove", 324, 130));
        await act(async () => {
          pointer(nav, "pointerup", 324, 130);
          origin.click();
        });
      } else {
        await act(async () =>
          nav.querySelector(`a[href$="/${destination}"]`).click(),
        );
      }
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
      assert.equal(dock.dataset.level, "trip");
      assert.equal(dock.dataset.wide, "true");
      assert.equal(
        document.querySelector(".thumb-dock-material .safari-glass"),
        material,
      );
      assert.equal(host.querySelector(".safari-tabs"), nav);
      assert.deepEqual([...nav.querySelectorAll("svg")], icons);
    }
    assert.equal(edits, 3);
    await act(async () => openDetail());
    await act(async () =>
      host.querySelector('[aria-label="詳細を閉じて戻る"]').click(),
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

test("hold and drag previews live tab bounds, commits once on release, and cancels outside or on interruption", async () => {
  const root = createRoot(document.getElementById("root"));
  const h = React.createElement;
  let transitions = 0;
  document.startViewTransition = (update) => {
    transitions++;
    update();
    return {
      ready: Promise.resolve(),
      finished: Promise.resolve(),
      skipTransition() {},
    };
  };
  function Harness() {
    useMotionNavigation();
    return h(
      React.Fragment,
      null,
      h("output", null, useLocation().pathname),
      h(SafariTabs, { tripId: "demo", onMenu() {} }),
    );
  }
  try {
    await act(async () =>
      root.render(
        h(
          MemoryRouter,
          { initialEntries: ["/trips/demo/itinerary"] },
          h(Harness),
        ),
      ),
    );
    const nav = document.querySelector(".safari-tabs");
    const links = [...nav.querySelectorAll("a")];
    const dock = document.querySelector(".safari-dock");
    let width = 360;
    layoutTabs(nav, () => width);
    const hold = async () => {
      await act(async () => pointer(links[0], "pointerdown", 36, 130));
      await act(async () => new Promise((resolve) => setTimeout(resolve, 450)));
      assert.equal(dock.dataset.expanded, "true");
      assert.equal(nav.hasPointerCapture(1), true);
    };
    await hold();
    await act(async () => pointer(links[0], "lostpointercapture", 36, 130));
    assert.equal(
      dock.dataset.expanded,
      "true",
      "transferring implicit touch capture from link to nav is not cancellation",
    );
    await act(async () => pointer(nav, "pointermove", 225, 130));
    assert.equal(links[3].dataset.preview, "true");
    assert.equal(
      document.querySelector("output").textContent,
      "/trips/demo/itinerary",
    );
    width = 420;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 25)));
    assert.equal(
      links[2].dataset.preview,
      "true",
      "preview follows expanding hit regions even with a stationary finger",
    );
    await act(async () =>
      pointer(nav, "pointermove", 378, 130, { pointerId: 2, isPrimary: false }),
    );
    assert.equal(
      links[2].dataset.preview,
      "true",
      "another finger cannot change this gesture",
    );
    await act(async () => {
      pointer(nav, "pointerup", 225, 130);
      links[0].click(); // Compatibility click may still target the initial link.
    });
    assert.equal(
      document.querySelector("output").textContent,
      "/trips/demo/packing",
    );
    assert.equal(transitions, 1, "release must navigate exactly once");
    assert.equal(nav.hasPointerCapture(1), false);
    assert.equal(dock.dataset.expanded, "false");
    for (const reason of [
      "outside",
      "pointercancel",
      "lostpointercapture",
      "escape",
    ]) {
      await hold();
      await act(async () => pointer(nav, "pointermove", 378, 130));
      assert.equal(links[4].dataset.preview, "true");
      await act(async () => {
        if (reason === "outside") {
          pointer(nav, "pointermove", 378, 70);
          pointer(nav, "pointerup", 378, 70);
        } else if (reason === "escape") {
          window.dispatchEvent(
            new dom.window.KeyboardEvent("keydown", {
              key: "Escape",
              cancelable: true,
            }),
          );
          pointer(nav, "pointerup", 378, 130);
        } else {
          pointer(nav, reason, 378, 130);
        }
        links[0].click();
      });
      assert.equal(
        document.querySelector("output").textContent,
        "/trips/demo/packing",
        reason,
      );
      assert.equal(dock.dataset.expanded, "false", reason);
      assert.equal(nav.hasPointerCapture(1), false);
    }
    assert.equal(transitions, 1);
    await act(async () => {
      pointer(links[1], "pointerdown", 126, 130);
      pointer(links[1], "pointerup", 126, 130);
      links[1].click();
    });
    assert.equal(
      document.querySelector("output").textContent,
      "/trips/demo/places",
      "a fresh tap still navigates immediately",
    );
  } finally {
    await act(async () => root.unmount());
    delete document.startViewTransition;
  }
});

test("contact previews immediately and a short scrub commits once without waiting for a hold", async () => {
  const root = createRoot(document.getElementById("root"));
  const h = React.createElement;
  let updateRoute;
  let transitions = 0;
  document.startViewTransition = (update) => {
    transitions++;
    updateRoute = update;
    return {
      ready: Promise.resolve(),
      finished: Promise.resolve(),
      skipTransition() {},
    };
  };
  function Harness() {
    useMotionNavigation();
    return h(
      React.Fragment,
      null,
      h("output", null, useLocation().pathname),
      h(SafariTabs, { tripId: "demo", onMenu() {} }),
    );
  }
  try {
    await act(async () =>
      root.render(
        h(
          MemoryRouter,
          { initialEntries: ["/trips/demo/itinerary"] },
          h(Harness),
        ),
      ),
    );
    const nav = document.querySelector(".safari-tabs");
    const dock = document.querySelector(".safari-dock");
    const links = [...nav.querySelectorAll("a")];
    const indicator = nav.querySelector(".safari-selection");
    const pressMotions = [];
    dock.animate = (frames, options) => {
      const animation = timeline();
      pressMotions.push({ animation, options });
      return animation;
    };
    const selected = () => nav.style.getPropertyValue("--selection-tab");
    layoutTabs(nav);
    await act(async () => pointer(links[1], "pointerdown", 108, 130));
    assert.equal(selected(), "1", "feedback starts before the hold timer");
    assert.equal(dock.dataset.touching, "true");
    assert.equal(dock.dataset.expanded, "false");
    assert.equal(
      document.querySelector("output").textContent,
      "/trips/demo/itinerary",
    );
    await act(async () => pointer(nav, "pointermove", 324, 130));
    assert.equal(selected(), "4", "short drags track the finger immediately");
    await act(async () => {
      pointer(nav, "pointerup", 324, 130);
      links[1].click();
    });
    assert.equal(transitions, 1);
    assert.equal(dock.dataset.touching, "false");
    assert.equal(pressMotions.at(-1).options.duration, 900);
    assert.equal(
      pressMotions.at(-1).animation.cancelled,
      false,
      "routing must retain the release animation",
    );
    assert.equal(
      selected(),
      "4",
      "release must not flash the old tab while the route waits",
    );
    await act(async () => updateRoute());
    assert.equal(pressMotions.at(-1).animation.cancelled, false);
    assert.equal(
      document.querySelector("output").textContent,
      "/trips/demo/notes",
    );
    assert.equal(selected(), "4");
    assert.equal(
      nav.querySelector(".safari-selection"),
      indicator,
      "one indicator survives navigation",
    );
    await act(async () => pointer(links[0], "pointerdown", 36, 130));
    assert.equal(selected(), "0");
    await act(async () => {
      pointer(nav, "pointerup", 36, 70);
      links[0].click();
    });
    assert.equal(selected(), "4", "outside release restores the current tab");
    assert.equal(dock.dataset.touching, "false");
    assert.equal(transitions, 1);
    await act(async () =>
      pointer(links[0], "pointerdown", 36, 130, { ctrlKey: true }),
    );
    assert.equal(
      dock.dataset.touching,
      "false",
      "modified links retain their browser behavior",
    );
  } finally {
    await act(async () => root.unmount());
    delete document.startViewTransition;
  }
});

test("standalone controls share dock press timing, release on cancellation, and preserve native activation", () => {
  const host = document.createElement("div");
  host.innerHTML =
    '<a class="icon-button" href="#back"><span>戻る</span></a><button class="icon-button">メニュー</button><button class="primary add-action">追加</button><button class="floating-add">予定追加</button><button class="icon-button" disabled>無効</button><div class="thumb-dock"><button class="icon-button">既存ナビ</button></div>';
  document.body.append(host);
  const calls = [];
  for (const element of host.querySelectorAll("a, button")) {
    element.style.setProperty("--safari-press-scale", "1.1");
    element.animate = (frames, options) => {
      const animation = timeline();
      calls.push({ element, frames, options, animation });
      return animation;
    };
  }
  const cleanup = installPressFeedback();
  try {
    for (const element of [...host.querySelectorAll("a, button")].slice(0, 4)) {
      pointer(element.firstElementChild ?? element, "pointerdown");
      assert.equal(element.dataset.pressActive, "true");
      assert.equal(calls.at(-1).options.duration, 320);
      assert.equal(calls.at(-1).frames[1].transform, "scale(1.1, 1.1)");
      pointer(document, "pointerup");
      assert.equal(element.dataset.pressActive, undefined);
      assert.equal(calls.at(-1).options.duration, 900);
    }
    const menu = host.querySelector("button");
    pointer(menu, "pointerdown");
    pointer(menu, "pointercancel");
    assert.equal(menu.dataset.pressActive, undefined);
    pointer(menu, "pointerdown");
    pointer(menu, "pointerout", 0, 0, { relatedTarget: document.body });
    assert.equal(menu.dataset.pressActive, undefined);
    menu.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: " ", bubbles: true }),
    );
    assert.equal(menu.dataset.pressActive, "true");
    menu.dispatchEvent(
      new dom.window.KeyboardEvent("keyup", { key: " ", bubbles: true }),
    );
    assert.equal(menu.dataset.pressActive, undefined);
    let activated = 0;
    menu.onclick = () => activated++;
    menu.click();
    assert.equal(activated, 1);
    const count = calls.length;
    pointer(host.querySelector(":disabled"), "pointerdown");
    pointer(host.querySelector(".thumb-dock button"), "pointerdown");
    reduced = true;
    pointer(menu, "pointerdown");
    assert.equal(
      calls.length,
      count,
      "disabled, existing dock and reduced motion stay untouched",
    );
    reduced = false;
    pointer(menu, "pointerdown");
    cleanup();
    assert.equal(menu.dataset.pressActive, undefined);
    assert.equal(calls.at(-1).animation.cancelled, true);
  } finally {
    reduced = false;
    cleanup();
    host.remove();
  }
});

test("dock release keeps its full duration after a short tap and retouches continue from the rendered scale", () => {
  const dock = document.createElement("div");
  document.body.append(dock);
  const calls = [];
  dock.animate = (frames, options) => {
    calls.push({ frames, options });
    return {
      cancel() {
        dock.style.transform = "scale(1)";
      },
    };
  };
  dock.style.setProperty("--safari-press-scale", "1.04");
  try {
    const press = animateDockPress(dock, true);
    dock.style.transform = "matrix(1.01, 0, 0, 1.025, 0, 0)";
    const release = animateDockPress(dock, false, press);
    assert.equal(
      calls[1].options.duration,
      900,
      "short contact does not shorten the release",
    );
    assert.equal(
      calls[1].frames[0].transform,
      "matrix(1.01, 0, 0, 1.025, 0, 0)",
    );
    assert.equal(calls[1].frames[1].transform, "scale(1)");
    dock.style.transform = "matrix(1.005, 0, 0, 1.012, 0, 0)";
    animateDockPress(dock, true, release);
    assert.equal(
      calls[2].frames[0].transform,
      "matrix(1.005, 0, 0, 1.012, 0, 0)",
      "sample before cancelling the old animation",
    );
    assert.equal(calls[2].frames[1].transform, "scale(1.04, 1.1)");
    reduced = true;
    assert.equal(animateDockPress(dock, false, release), undefined);
    assert.equal(calls.length, 3);
  } finally {
    reduced = false;
    dock.remove();
  }
});

test("dock contour pinches continuously and separates into three surfaces at mobile widths", async () => {
  for (const [width, side, inset] of [
    [308, 44, 44],
    [336, 44, 52],
    [366, 52, 60],
    [420, 52, 60],
  ]) {
    const pixel = async (progress, x, y) => {
      const d = dockOutline(width, side, inset, progress);
      assert.equal(/NaN|Infinity/.test(d), false);
      const { data, info } = await sharp(
        Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="64"><path d="${d}" fill="white" /></svg>`,
        ),
      )
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return data[(Math.floor(y) * info.width + Math.floor(x)) * 4 + 3];
    };
    const gap = (Math.min(side, inset - 4) + inset) / 2;
    assert.equal(
      await pixel(0, gap, 32),
      255,
      "trip-level surface is connected",
    );
    assert.equal(
      await pixel(1, gap, 32),
      0,
      "detail surface has an actual gap",
    );
    assert.equal(await pixel(1, side / 2, 32), 255);
    assert.equal(await pixel(1, width / 2, 32), 255);
    assert.equal(await pixel(1, width - side / 2, 32), 255);
    const r = 32 + (Math.min(side, inset - 4) / 2 - 32) * 0.5;
    const neck = r + inset / 2;
    assert.equal(
      await pixel(0.5, neck, 32),
      255,
      "material remains joined while the neck thins",
    );
    assert.equal(
      await pixel(0.5, neck, 8),
      0,
      "upper contour forms a visible concave neck",
    );
  }
});

test("dock ignores top-edge rubber banding and only lifts for a focused software keyboard", () => {
  const input = document.createElement("input");
  const viewport = { height: 800, offsetTop: 0, scale: 1 };
  for (const offsetTop of [-240, -120, -20, 0, 80]) {
    assert.equal(
      dockKeyboardInset(800, { ...viewport, offsetTop }, document.body),
      0,
    );
    assert.equal(dockKeyboardInset(800, { ...viewport, offsetTop }, input), 0);
  }
  assert.equal(
    dockKeyboardInset(800, { ...viewport, height: 740 }, input),
    0,
    "browser chrome does not open a keyboard",
  );
  assert.equal(
    dockKeyboardInset(800, { ...viewport, height: 480 }, document.body),
    0,
    "no focused editor means no keyboard lift",
  );
  assert.equal(
    dockKeyboardInset(800, { ...viewport, height: 480 }, input),
    320,
  );
  assert.equal(
    dockKeyboardInset(800, { ...viewport, height: 480, offsetTop: 50 }, input),
    270,
  );
  assert.equal(
    dockKeyboardInset(800, { ...viewport, height: 480, offsetTop: -30 }, input),
    320,
    "negative overscroll never adds extra lift",
  );
  assert.equal(
    dockKeyboardInset(800, { ...viewport, height: 400, scale: 2 }, input),
    0,
    "pinch zoom is not a keyboard",
  );
  input.readOnly = true;
  assert.equal(dockKeyboardInset(800, { ...viewport, height: 480 }, input), 0);
  input.readOnly = false;
  input.type = "checkbox";
  assert.equal(
    dockKeyboardInset(800, { ...viewport, height: 480 }, input),
    0,
    "checkbox focus does not require a keyboard",
  );
  assert.equal(dockKeyboardInset(800, null, input), 0);
});

test("all dock layouts morph through a shared contour with real necks and clean separated endpoints", async () => {
  for (const width of [308, 366, 420]) {
    const capsule = (left, width, radius = 32) => ({ left, width, radius });
    const layouts = [
      joinedDock(width),
      dockSlots(width, [
        capsule(0, 64),
        capsule(74, width - 212),
        capsule(width - 128, 128),
      ]),
      dockSlots(width, [capsule(0, 64), null, capsule(width - 128, 128)]),
      dockSlots(width, [capsule(0, 64), capsule(74, width - 74), null]),
      dockSlots(width, [null, capsule(0, width - 74), capsule(width - 64, 64)]),
      dockSlots(width, [capsule(0, 64), null, null]),
    ];
    for (const from of layouts) {
      for (const to of layouts) {
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          const shape = morphDock(from, to, 0, t);
          const field = dockField(width, shape.islands, shape.tension);
          assert.ok(field.every(Number.isFinite));
          assert.ok(
            Math.max(...field) <= 1024.001,
            "material stays within the dock's height",
          );
          assert.equal(/NaN|Infinity/.test(dockFieldPath(width, field)), false);
          if (t === 1) assert.deepEqual(shape.islands, to);
        }
      }
    }
    const raster = async (from, to, t) => {
      const shape = morphDock(from, to, 0, t);
      const d = dockFieldPath(
        width,
        dockField(width, shape.islands, shape.tension),
      );
      const { data, info } = await sharp(
        Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="64"><path d="${d}" fill="white"/></svg>`,
        ),
      )
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return (x, y) =>
        data[(Math.floor(y) * info.width + Math.floor(x)) * 4 + 3];
    };
    const joined = await raster(layouts[0], layouts[1], 0);
    const split = await raster(layouts[0], layouts[1], 1);
    assert.equal(joined(69, 32), 255);
    assert.equal(split(69, 32), 0, "back/primary gap is transparent");
    assert.equal(
      split(width - 133, 32),
      0,
      "primary/actions gap is transparent",
    );
    for (const x of [32, width / 2, width - 64])
      assert.equal(split(x, 32), 255);
    const neck = await raster(layouts[1], layouts[3], 0.1);
    assert.equal(neck(69, 32), 0, "stationary back stays detached");
    assert.equal(
      neck(width - 133, 32),
      255,
      "the changing primary and actions surfaces join",
    );
  }
});

test("shared glass retargets from the rendered shape, survives layout changes, and honors reduced motion", async () => {
  const h = React.createElement;
  const originalBounds = HTMLElement.prototype.getBoundingClientRect;
  const client = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientWidth",
  );
  const offset = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetWidth",
  );
  const originalRAF = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const originalNow = performance.now;
  const pending = new Map();
  let clock = 0,
    sequence = 0,
    setMode;
  const w = 366;
  function box(element) {
    const context = element.closest(".context-dock");
    const back = context?.querySelector(".context-back") ? 56 : 0;
    const actions = context?.querySelector(".context-actions") ? 112 : 0;
    if (element.classList.contains("context-back"))
      return { left: 0, width: back };
    if (element.classList.contains("context-actions"))
      return { left: w - actions, width: actions };
    if (element.classList.contains("context-primary"))
      return {
        left: back ? 66 : 0,
        width: w - back - actions - (back ? 10 : 0) - (actions ? 10 : 0),
      };
    return { left: 0, width: w };
  }
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return this.classList.contains("thumb-dock") ? w : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
      return box(this).width;
    },
  });
  HTMLElement.prototype.getBoundingClientRect = function () {
    return { ...box(this), top: 0, bottom: 56, height: 56 };
  };
  globalThis.requestAnimationFrame = (callback) => {
    pending.set(++sequence, callback);
    return sequence;
  };
  globalThis.cancelAnimationFrame = (id) => pending.delete(id);
  performance.now = () => clock;
  const advance = (ms) => {
    clock += ms;
    const callbacks = [...pending.values()];
    pending.clear();
    callbacks.forEach((callback) => callback(clock));
  };
  const root = createRoot(document.getElementById("root"));
  function Harness() {
    const [mode, update] = React.useState("tabs");
    setMode = update;
    return h(
      ThumbDockProvider,
      null,
      h(
        ThumbDock,
        { mode: mode === "tabs" ? "browse" : "context" },
        mode === "tabs"
          ? h("div", { className: "safari-dock", "data-wide": "true" })
          : h(ContextDock, {
              back: h("button", null, "戻る"),
              primary: mode === "place" ? h("button", null, "追加") : null,
              actions: mode === "place" ? h("button", null, "編集") : null,
            }),
      ),
    );
  }
  try {
    await act(async () => root.render(h(Harness)));
    const material = document.querySelector(".thumb-dock-material");
    const glass = material.querySelector(".safari-glass");
    const border = material.querySelector("path[stroke]");
    const initial = border.getAttribute("d");
    assert.ok(initial);
    assert.equal(
      material.querySelector("svg").getAttribute("viewBox"),
      `0 0 ${w + 24} 80`,
    );
    await act(async () => setMode("place"));
    assert.equal(border.getAttribute("d"), initial, "no jump on registration");
    advance(410);
    const midway = border.getAttribute("d");
    assert.notEqual(midway, initial);
    assert.equal(
      glass.style.clipPath,
      `path("${midway}")`,
      "border and blur follow exactly the same contour",
    );
    await act(async () => setMode("settings"));
    assert.equal(
      border.getAttribute("d"),
      midway,
      "interruptions retain the visible neck",
    );
    assert.equal(pending.size, 1, "only the new animation remains active");
    advance(820);
    const settings = dockSlots(w, [
      { left: 0, width: 56, radius: 28 },
      null,
      null,
    ]);
    assert.equal(
      border.getAttribute("d"),
      dockContour(
        w + 24,
        settings.map((island) => ({ ...island, left: island.left + 12 })),
        0,
        [],
        40,
      ),
    );
    assert.equal(pending.size, 0);
    const back = document.querySelector(".context-back");
    const button = back.querySelector("button");
    const motions = [];
    back.animate = (frames, options) => {
      const animation = timeline();
      motions.push({ frames, options, animation });
      return animation;
    };
    await act(async () => pointer(button, "pointerdown"));
    assert.equal(back.dataset.pressed, "true");
    assert.equal(motions[0].options.duration, 320);
    back.style.transform = "matrix(1.06, 0, 0, 1.1, 0, 0)";
    advance(320);
    const expanded = border.getAttribute("d");
    assert.notEqual(
      expanded,
      dockContour(
        w + 24,
        settings.map((island) => ({ ...island, left: island.left + 12 })),
        0,
        [],
        40,
      ),
    );
    await act(async () => pointer(button, "pointerup"));
    assert.equal(back.dataset.pressed, "false");
    assert.equal(motions[1].options.duration, 900);
    assert.equal(
      motions[1].frames[0].transform,
      "matrix(1.06, 0, 0, 1.1, 0, 0)",
    );
    back.style.transform = "none";
    advance(920);
    button.disabled = true;
    await act(async () => pointer(button, "pointerdown"));
    assert.equal(motions.length, 2, "disabled controls do not expand");
    button.disabled = false;
    await act(async () => pointer(button, "pointerdown"));
    await act(async () => pointer(button, "pointercancel"));
    assert.equal(back.dataset.pressed, "false");
    advance(920);
    reduced = true;
    await act(async () => setMode("tabs"));
    assert.equal(border.getAttribute("d"), initial);
    assert.equal(pending.size, 0, "reduced motion settles immediately");
    reduced = false;
    await act(async () =>
      document.querySelector(".safari-dock").setAttribute("data-wide", "false"),
    );
    advance(820);
    assert.notEqual(
      border.getAttribute("d"),
      initial,
      "hold expansion is observed without a registry update",
    );
    assert.equal(document.querySelectorAll(".safari-glass").length, 1);
    assert.equal(document.querySelector(".thumb-dock-material"), material);
  } finally {
    await act(async () => root.unmount());
    assert.equal(pending.size, 0);
    reduced = false;
    HTMLElement.prototype.getBoundingClientRect = originalBounds;
    if (client)
      Object.defineProperty(HTMLElement.prototype, "clientWidth", client);
    else delete HTMLElement.prototype.clientWidth;
    if (offset)
      Object.defineProperty(HTMLElement.prototype, "offsetWidth", offset);
    else delete HTMLElement.prototype.offsetWidth;
    globalThis.requestAnimationFrame = originalRAF;
    globalThis.cancelAnimationFrame = originalCancel;
    performance.now = originalNow;
  }
});

test("dock labels fade out before replacement appears, with inert snapshots and interruption cleanup", async () => {
  const original = HTMLElement.prototype.animate;
  const calls = [];
  HTMLElement.prototype.animate = function (frames, options) {
    const animation = timeline();
    calls.push({ node: this, frames, options, animation });
    return animation;
  };
  const root = createRoot(document.getElementById("root"));
  const h = React.createElement;
  const render = (identity, label) =>
    act(async () =>
      root.render(
        h(
          DockContent,
          { identity, mode: "context" },
          h("button", { id: "dock-save", form: "editor" }, label),
        ),
      ),
    );
  try {
    await render("home", "旅行を作成");
    await render("save", "保存する");
    const current = document.querySelector(
      ".thumb-dock-content:not([data-outgoing])",
    );
    const old = document.querySelector("[data-outgoing]");
    assert.equal(old.textContent, "旅行を作成");
    assert.equal(old.inert, true);
    assert.equal(old.getAttribute("aria-hidden"), "true");
    assert.equal(old.querySelector("[id], [form]"), null);
    assert.equal(
      current.inert,
      true,
      "invisible incoming controls cannot be activated",
    );
    assert.equal(calls[1].frames[0].opacity, 0);
    assert.ok(calls[1].options.delay >= calls[0].options.duration);
    await render("save", "保存中…");
    assert.equal(
      calls.length,
      2,
      "busy/validation updates do not restart the transition",
    );
    await render("detail", "編集");
    assert.equal(old.isConnected, false);
    assert.equal(calls[1].animation.cancelled, true);
    assert.equal(document.querySelectorAll("[data-outgoing]").length, 1);
    await act(async () => {
      calls.at(-2).animation.finish();
      calls.at(-1).animation.finish();
    });
    assert.equal(document.querySelector("[data-outgoing]"), null);
    assert.equal(current.inert, false);
    reduced = true;
    await render("settings", "戻る");
    assert.equal(calls.length, 4);
    assert.equal(current.inert, false);
  } finally {
    reduced = false;
    await act(async () => root.unmount());
    if (original) HTMLElement.prototype.animate = original;
    else delete HTMLElement.prototype.animate;
  }
});

test("edit/delete stretches left into save without shrinking, rebounding, or moving back", () => {
  for (const w of [308, 366, 420]) {
    const back = { left: 0, width: 64, radius: 32 };
    const actions = { left: w - 128, width: 128, radius: 32 };
    const save = { left: 74, width: w - 74, radius: 32 };
    const detail = dockSlots(w, [back, null, actions]);
    const edit = dockSlots(w, [back, save, null]);
    for (const [from, to, grows] of [
      [detail, edit, true],
      [edit, detail, false],
    ]) {
      let previous = grows ? actions.width : save.width;
      for (let frame = 1; frame <= 120; frame++) {
        const shape = morphDock(from, to, 0, frame / 120);
        const visible = shape.islands.filter((island) => island.width > 0);
        assert.equal(visible.length, 2, "no new droplet is created");
        assert.deepEqual(
          {
            left: visible[0].left,
            width: visible[0].width,
            radius: visible[0].radius,
          },
          back,
        );
        const right = visible[1];
        assert.ok(
          Math.abs(right.left + right.width - w) < 0.001,
          "right edge stays anchored",
        );
        assert.equal(right.radius, 32, "height remains 64px throughout");
        assert.ok(
          grows ? right.width >= previous : right.width <= previous,
          "motion never reverses",
        );
        assert.equal(shape.tension, 0, "back remains separate");
        previous = right.width;
        const d = dockContour(w, shape.islands);
        assert.equal((d.match(/M /g) ?? []).length, 2);
        assert.ok(
          d.length < 500,
          "simple resizing uses short exact arcs instead of hundreds of samples",
        );
      }
    }
    const interrupted = morphDock(detail, edit, 0, 0.35);
    const reverse = morphDock(
      interrupted.islands,
      detail,
      interrupted.tension,
      0,
    );
    assert.equal(
      dockContour(w, reverse.islands),
      dockContour(w, interrupted.islands),
    );
  }
});

test("exact dock capsules retain transparent gaps, round edges, and pressed geometry", async () => {
  const w = 366;
  const islands = dockSlots(w, [
    { left: 0, width: 64, radius: 32 },
    { left: 74, width: w - 74, radius: 32 },
    null,
  ]);
  const d = dockContour(
    w + 24,
    islands.map((island) => ({ ...island, left: island.left + 12 })),
    0,
    [
      { x: 1, y: 1 },
      { x: 1.06, y: 1.1 },
    ],
    44,
  );
  const { data, info } = await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="88"><path d="${d}" fill="white"/></svg>`,
    ),
  )
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixel = (x, y) => data[(y * info.width + x) * 4 + 3];
  assert.equal(pixel(44, 13), 255);
  assert.equal(pixel(12, 12), 0, "circular back corner is transparent");
  assert.equal(pixel(76, 44), 0, "controls do not share an internal fill");
  assert.equal(
    pixel(230, 9),
    255,
    "pressed save grows above its normal top edge",
  );
  assert.equal(
    (dockContour(w, joinedDock(w)).match(/M /g) ?? []).length,
    1,
    "joined tabs have one contour without internal borders",
  );
});

test("all colored and neutral dock layouts reshape existing surfaces without zero-size seeds", () => {
  for (const w of [308, 366, 420]) {
    const c = (left, width) => ({ left, width, radius: 28 });
    const tag = (slots) =>
      dockSlots(w, slots).map((island, slot) => ({
        ...island,
        slot,
        tint: slot === 1 && slots[1] ? 1 : 0,
      }));
    const home = tag([null, c(0, w - 66), c(w - 56, 56)]);
    const tabs = joinedDock(w, 28).map((island) => ({
      ...island,
      slot: -1,
      tint: 0,
    }));
    const layouts = [
      home,
      tabs,
      tag([c(0, 56), c(66, w - 188), c(w - 112, 112)]),
      tag([c(0, 56), null, c(w - 112, 112)]),
      tag([c(0, 56), c(66, w - 66), null]),
      tag([c(0, 56), null, null]),
    ];
    const sameField = (a, b, label) => {
      const field = dockField(w, a),
        other = dockField(w, b);
      field.forEach((value, i) =>
        assert.ok(Math.abs(value - other[i]) < 0.00001, label),
      );
    };
    for (const from of layouts)
      for (const to of layouts) {
        const plan = prepareDockMorph(from, to);
        sameField(
          from,
          plan.from,
          "planning preserves the entire source silhouette",
        );
        sameField(
          to,
          plan.to,
          "planning preserves the entire destination silhouette",
        );
        if (from.some((island) => island.tint > 0))
          sameField(
            from.filter((island) => island.tint > 0),
            plan.from.filter((island) => island.tint > 0),
            "splitting preserves the whole colored surface",
          );
        for (const t of [0.001, 0.1, 0.3, 0.5, 0.75, 0.999]) {
          const shape = morphDock(from, to, 0, t, plan);
          for (const island of shape.islands) {
            assert.equal(island.radius, 28);
            assert.ok(
              island.width >= 56 - 0.00001,
              "a surface never sprouts from a point",
            );
            assert.ok(
              island.left >= -0.00001 &&
                island.left + island.width <= w + 0.00001,
            );
          }
          const uncolored = morphDock(
            from.map((island) => ({ ...island, tint: 0 })),
            to.map((island) => ({ ...island, tint: 0 })),
            0,
            t,
          );
          sameField(
            shape.islands,
            uncolored.islands,
            "color never changes shape correspondence",
          );
        }
      }
    for (const [from, to] of [
      [home, tabs],
      [tabs, home],
    ]) {
      for (const t of [0.001, 0.05, 0.1, 0.4, 0.8]) {
        const shape = morphDock(from, to, 0, t);
        assert.equal(
          Math.min(...shape.islands.map((island) => island.left)),
          0,
        );
        assert.equal(
          Math.max(
            ...shape.islands.map((island) => island.left + island.width),
          ),
          w,
        );
        const colored = shape.islands.filter((island) => island.tint > 0);
        if (colored.length)
          assert.equal(
            Math.min(...colored.map((island) => island.left)),
            0,
            "create tint remains on the left edge, never the center",
          );
      }
    }
  }
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
    assert.equal(calls[0].frames[1].scale, ".94");
    assert.equal(calls[0].frames[1].filter, "blur(6px)");
    assert.equal(
      calls[0].frames[1].transformOrigin,
      `${window.innerWidth / 2}px ${window.innerHeight / 2 + 1200}px`,
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
    assert.equal(main.style.filter, "blur(6px)");
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
    const css = await readFile("src/web/styles.css", "utf8");
    assert.match(
      css,
      /::view-transition-group\(floating-add\)\s*\{[^}]*animation: none/,
    );
    assert.match(
      css,
      /::view-transition-old\(floating-add\)\s*\{[^}]*display: none/,
    );
    assert.match(
      css,
      /::view-transition-new\(floating-add\)\s*\{[^}]*animation: none/,
    );
  } finally {
    await act(async () => root.unmount());
  }
});

test("panel docks anchor inside the visual viewport shell without applying keyboard lift twice", async () => {
  const css = await readFile("src/web/styles.css", "utf8");
  const panelDock = css.match(
    /dialog \.thumb-dock-host:not\(\[hidden\]\)\s*\{([^}]+)\}/,
  )?.[1];
  assert.ok(panelDock);
  assert.match(panelDock, /position: absolute;/);
  assert.match(
    panelDock,
    /bottom: calc\(var\(--dock-bottom-gap\) \+ env\(safe-area-inset-bottom\)\);/,
  );
  assert.doesNotMatch(panelDock, /--dock-keyboard-inset/);
  assert.match(
    css,
    /:root:has\(\.thumb-dock-host\) \.modal.full\s*\{[^}]*top: var\(--modal-top[^}]*height: var\(--modal-height/,
  );
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
      host.querySelector(".context-primary button").disabled,
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
    await click(host.querySelector(".context-primary button"));
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
    await click(host.querySelector(".context-primary button"));
    await closeWait();
    assert.equal(trigger.dataset.dateValue, "2028-02-20");
    assert.equal(trigger.dataset.dateEnd, "2028-02-20");
  } finally {
    await act(async () => root.unmount());
    reduced = false;
  }
});

test("trip expansion shares the cover across snapshots, restores list scroll and cleans up on interruption", async () => {
  const root = createRoot(document.getElementById("root"));
  const h = React.createElement;
  const originalScroll = window.scrollTo;
  const originalY = window.scrollY;
  const nativeStart = document.startViewTransition;
  let navigate;
  let scroll;
  const captures = [];
  window.scrollTo = (options) => {
    scroll = options.top;
  };
  window.scrollY = 560;
  document.startViewTransition = (update) => {
    const motion = timeline();
    captures.push({ update, motion });
    return {
      ready: Promise.resolve(),
      finished: motion.finished,
      skipTransition: () => motion.finish(),
    };
  };
  function Harness() {
    const [page, setPage] = React.useState("list");
    navigate = setPage;
    return h(
      page === "list" ? "article" : "main",
      { "data-trip-surface": "trip1" },
      h("img", { "data-trip-cover": "trip1", src: "/cover.jpg" }),
      page,
    );
  }
  const cover = () => document.querySelector("[data-trip-cover]");
  try {
    await act(async () => root.render(h(Harness)));
    const oldCover = cover();
    startTripTransition(() => navigate("itinerary"), "trip1");
    assert.equal(oldCover.style.viewTransitionName, "trip-cover");
    await act(async () => captures[0].update());
    assert.notEqual(cover(), oldCover);
    assert.equal(cover().style.viewTransitionName, "trip-cover");
    assert.equal(
      document.querySelector("main").style.viewTransitionName,
      "trip-surface",
    );
    assert.equal(scroll, 0);
    captures[0].motion.finish();
    await act(async () => {});
    assert.equal(cover().style.viewTransitionName, "");
    assert.equal(oldCover.style.viewTransitionName, "");
    startTripTransition(() => navigate("list"), "trip1", true);
    await act(async () => captures[1].update());
    assert.equal(scroll, 560);
    assert.equal(
      cover().style.viewTransitionName,
      "",
      "return keeps the card and photo together",
    );
    assert.equal(
      document.querySelector("article").style.viewTransitionName,
      "",
    );
    document.dispatchEvent(new dom.window.Event("pointerdown"));
    await act(async () => {});
    assert.equal(document.documentElement.dataset.tripTransition, undefined);
    assert.equal(cover().style.viewTransitionName, "");
    startTripTransition(() => navigate("stale"), "trip1");
    startTripTransition(() => navigate("itinerary"), "trip1");
    await act(async () => captures[2].update());
    assert.ok(
      document.querySelector("article"),
      "superseded callback cannot replace the newer navigation",
    );
    await act(async () => captures[3].update());
    captures[3].motion.finish();
    await act(async () => {});
    reduced = true;
    await act(async () =>
      startTripTransition(() => navigate("list"), "trip1", true),
    );
    assert.equal(
      captures.length,
      4,
      "reduced motion commits without snapshots",
    );
    assert.ok(document.querySelector("article"));
  } finally {
    await act(async () => root.unmount());
    document.startViewTransition = nativeStart;
    window.scrollTo = originalScroll;
    window.scrollY = originalY;
    reduced = false;
  }
});

test("task list strikes before reordering, preserves row identity, and keeps edit separate from completion", async () => {
  const h = React.createElement;
  const root = createRoot(document.getElementById("root"));
  const edits = [];
  let readOnly;
  function Harness() {
    const [canEdit, setEditable] = React.useState(true);
    readOnly = () => setEditable(false);
    const [items, setItems] = React.useState([
      { id: "a", title: "航空券", meta: "期限なし", done: false },
      { id: "b", title: "パスポート", meta: "期限なし", done: false },
      { id: "c", title: "ホテル", meta: "期限なし", done: true },
    ]);
    return h(TaskList, {
      items,
      canEdit,
      onToggle: (id, done) =>
        setItems((items) =>
          items.map((item) => (item.id === id ? { ...item, done } : item)),
        ),
      onEdit: (id) => edits.push(id),
    });
  }
  const ids = () =>
    [...document.querySelectorAll("[data-task-id]")].map(
      (row) => row.dataset.taskId,
    );
  try {
    await act(async () => root.render(h(Harness)));
    const row = document.querySelector('[data-task-id="a"]');
    await act(async () => row.querySelector(".task-edit").click());
    assert.deepEqual(edits, ["a"]);
    assert.equal(
      row.querySelector('[role="checkbox"]').getAttribute("aria-checked"),
      "false",
    );
    await act(async () => row.querySelector('[role="checkbox"]').click());
    assert.equal(row.classList.contains("is-done"), true);
    assert.deepEqual(
      ids(),
      ["a", "b", "c"],
      "strike plays before the row moves",
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 270)));
    assert.deepEqual(ids(), ["b", "a", "c"]);
    assert.equal(document.querySelector('[data-task-id="a"]'), row);
    await act(async () => row.querySelector('[role="checkbox"]').click());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 270)));
    assert.deepEqual(ids(), ["a", "b", "c"]);
    await act(async () => readOnly());
    assert.equal(document.querySelector(".task-edit"), null);
    assert.ok(
      [...document.querySelectorAll('[role="checkbox"]')].every(
        (button) => button.disabled,
      ),
    );
  } finally {
    await act(async () => root.unmount());
  }
});

test("returning from bookings captures the full list without creating a disconnected cover layer", async () => {
  const nativeStart = document.startViewTransition;
  const originalScroll = window.scrollTo;
  const host = document.getElementById("root");
  let update;
  const motion = timeline();
  document.startViewTransition = (callback) => {
    update = callback;
    return {
      ready: Promise.resolve(),
      finished: motion.finished,
      skipTransition: () => motion.finish(),
    };
  };
  window.scrollTo = () => {};
  try {
    host.innerHTML =
      '<main id="main-content" data-trip-surface="trip1"><p>Bookings</p></main>';
    const oldMain = host.firstElementChild;
    oldMain.getBoundingClientRect = () => ({
      top: -240,
      left: 0,
      width: 390,
      height: 1800,
    });
    startTripTransition(
      () => {
        host.innerHTML =
          '<main id="main-content"><article data-trip-surface="trip1"><img data-trip-cover="trip1"><h2>Trip title</h2></article></main>';
        host.firstElementChild.getBoundingClientRect = () => ({
          top: 64,
          left: 0,
          width: 390,
          height: 700,
        });
      },
      "trip1",
      true,
    );
    assert.equal(oldMain.style.viewTransitionName, "");
    await update();
    assert.equal(
      document.documentElement.style.getPropertyValue("--route-old-top"),
      "-240px",
    );
    assert.equal(
      document.documentElement.style.getPropertyValue("--route-new-top"),
      "64px",
    );
    assert.equal(host.querySelector("img").style.viewTransitionName, "");
    assert.equal(host.querySelector("article").style.viewTransitionName, "");
    assert.equal(
      document.documentElement.style.getPropertyValue("--route-direction"),
      "-1",
    );
    motion.finish();
    await act(async () => {});
    assert.equal(document.documentElement.dataset.tripTransition, undefined);
  } finally {
    motion.finish();
    document.startViewTransition = nativeStart;
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
    assert.equal(marker.style.transform, "translate(144px, 9px)");
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

test("place cards separate detail and scheduling actions, and link scheduled visits to the correct itinerary", async () => {
  const root = createRoot(document.getElementById("root"));
  const place = {
    id: "p",
    title: "美術館",
    status: "want",
    reservationStatus: "needed",
    location: "旧市街",
    note: "展示を見る",
  };
  let opened = 0;
  let scheduled = 0;
  const render = (props = {}) =>
    root.render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(PlaceCard, {
          place,
          tripId: "trip",
          onOpen: () => opened++,
          onSchedule: () => scheduled++,
          ...props,
        }),
      ),
    );
  try {
    await act(async () => render());
    await act(async () => document.querySelector(".place-card-main").click());
    assert.equal(opened, 1);
    assert.equal(scheduled, 0);
    await act(async () => document.querySelector(".place-card-action").click());
    assert.equal(scheduled, 1);
    assert.equal(opened, 1, "scheduling does not also open the detail panel");
    await act(async () =>
      render({
        linked: { id: "item", day: "2026-11-22", time: "16:00" },
        onSchedule: undefined,
      }),
    );
    assert.equal(
      document.querySelector(".place-card-action").getAttribute("href"),
      "/trips/trip/itinerary?day=2026-11-22&item=item",
    );
    assert.match(
      document.querySelector(".place-card-schedule").textContent,
      /16:00/,
    );
    await act(async () => render({ onSchedule: undefined }));
    assert.equal(
      document.querySelector(".place-card-action"),
      null,
      "read-only visitors cannot schedule",
    );
    assert.ok(document.querySelector(".place-card-main"));
  } finally {
    await act(async () => root.unmount());
  }
});

test("card contact scales the whole surface, keeps actions independent and releases on scrolling", async () => {
  const host = document.createElement("div");
  host.innerHTML =
    '<button class="timeline-entry"><time>10:00</time><div data-press-card><h3>予定</h3></div></button><button class="timeline-empty"><div data-press-card>追加</div></button><article class="place-card" data-press-card><button class="place-card-main">場所詳細</button><button class="place-card-action">しおりへ</button><button disabled>無効</button></article><button class="booking-ticket" data-press-card>予約</button><button class="note-card" data-press-card>メモ</button><a href="#trip" class="trip-ticket" data-press-card>旅行</a><button class="timeline-empty" disabled><div data-press-card>閲覧のみ</div></button>';
  document.body.append(host);
  const calls = [];
  for (const surface of host.querySelectorAll("[data-press-card]")) {
    surface.style.setProperty("--safari-press-scale", "1.04");
    surface.style.setProperty("--safari-press-scale-y", "1.04");
    surface.animate = (frames, options) => {
      const animation = timeline();
      calls.push({ surface, frames, options, animation });
      return animation;
    };
  }
  const cleanup = installPressFeedback();
  try {
    const controls = [...host.querySelectorAll("button:not(:disabled), a")];
    for (const control of controls) {
      pointer(control, "pointerdown", 20, 20);
      const { surface, frames, animation } = calls.at(-1);
      assert.equal(surface.dataset.pressActive, "true");
      assert.equal(frames[1].transform, "scale(1.04, 1.04)");
      assert.equal(
        surface,
        control.closest("[data-press-card]") ??
          control.querySelector("[data-press-card]"),
      );
      animation.finish();
      await Promise.resolve();
      assert.equal(
        surface.dataset.pressActive,
        "true",
        "hold persists after animation completes",
      );
      pointer(control, "pointermove", 22, 23);
      assert.equal(
        surface.dataset.pressActive,
        "true",
        "small touch movement keeps contact",
      );
      pointer(control, "pointermove", 20, 45);
      assert.equal(
        surface.dataset.pressActive,
        undefined,
        "scroll releases without blocking the gesture",
      );
      assert.equal(calls.at(-1).options.duration, 900);
    }
    const detail = host.querySelector(".place-card-main");
    const add = host.querySelector(".place-card-action");
    let details = 0,
      additions = 0;
    detail.onclick = () => details++;
    add.onclick = () => additions++;
    pointer(add, "pointerdown");
    pointer(document, "pointerup");
    add.click();
    assert.equal(details, 0);
    assert.equal(additions, 1);
    detail.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    assert.equal(detail.parentElement.dataset.pressActive, "true");
    detail.dispatchEvent(
      new dom.window.KeyboardEvent("keyup", { key: "Enter", bubbles: true }),
    );
    assert.equal(detail.parentElement.dataset.pressActive, undefined);
    const count = calls.length;
    for (const disabled of host.querySelectorAll(":disabled"))
      pointer(disabled, "pointerdown");
    assert.equal(calls.length, count, "disabled card actions never animate");
  } finally {
    cleanup();
    host.remove();
  }
});
