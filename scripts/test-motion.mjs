import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
import sharp from "sharp";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router";

const dom = new JSDOM('<div id="root"></div>', { url: "https://tabi.test/" });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  CustomEvent: dom.window.CustomEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
  requestAnimationFrame: (callback) =>
    setTimeout(() => callback(performance.now()), 16),
  cancelAnimationFrame: clearTimeout,
});
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
      "export { DockContent } from './src/web/dock-content'; export { dockField, dockFieldPath, dockSlots, joinedDock, morphDock } from './src/web/fluid-dock'; export { dockKeyboardInset } from './src/web/viewport'; export { dockOutline, animateDockPress } from './src/web/dock-surface'; export { AnchoredMenu } from './src/web/anchored-menu'; export { SafariTabs } from './src/web/safari-tabs'; export { ThumbDockProvider, ThumbDock, ThumbAction, ThumbActions, ContextDock } from './src/web/thumb-dock'; export { Modal, SaveButton } from './src/web/ui'; export { dismissModal, useMotionNavigation } from './src/web/motion';",
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
  Modal,
  DockContent,
  AnchoredMenu,
  SafariTabs,
  dockOutline,
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

test("dialog reverses its retained timeline and backdrop before dismissing, including interrupted opening and Save", async () => {
  for (const trigger of ["close", "early-close", "save", "escape"]) {
    let surface, backdrop;
    HTMLElement.prototype.animate = function () {
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
      return open
        ? React.createElement(
            Modal,
            { title: "詳細", onClose: close },
            React.createElement(
              "button",
              { onClick: () => dismissModal(close) },
              "保存",
            ),
          )
        : null;
    }
    try {
      await act(async () => root.render(React.createElement(Harness)));
      const dialog = document.querySelector("dialog");
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
    } finally {
      await act(async () => root.unmount());
    }
  }
});

test.afterEach(() => {
  HTMLElement.prototype.animate = () => timeline();
});

test("header menu expands from its trigger and reverses before navigating, restoring focus", async () => {
  const root = createRoot(document.getElementById("root"));
  const trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  trigger.getBoundingClientRect = () => ({
    left: 926,
    top: 20,
    right: 970,
    bottom: 64,
    width: 44,
    height: 44,
  });
  const originalBounds = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.classList.contains("trip-menu-popover"))
      return {
        left: 670,
        top: 20,
        right: 970,
        bottom: 360,
        width: 300,
        height: 340,
      };
    return originalBounds.call(this);
  };
  let motion,
    frames,
    navigated = 0;
  HTMLElement.prototype.animate = (keyframes) => {
    frames = keyframes;
    return (motion = timeline());
  };
  function Harness() {
    const [open, setOpen] = React.useState(true);
    return open
      ? React.createElement(
          AnchoredMenu,
          { trigger: { current: trigger }, onClose: () => setOpen(false) },
          (close) =>
            React.createElement(
              "button",
              { onClick: () => close(() => navigated++) },
              "設定",
            ),
        )
      : null;
  }
  try {
    await act(async () => root.render(React.createElement(Harness)));
    assert.match(frames[0].clipPath, /0px 0px 296px 256px/);
    motion.currentTime = 440;
    await act(async () => motion.finish());
    await act(async () =>
      [...document.querySelectorAll("dialog button")]
        .find((node) => node.textContent === "設定")
        .click(),
    );
    assert.equal(motion.playbackRate, -1);
    assert.equal(navigated, 0);
    assert.ok(document.querySelector(".trip-menu-popover[open]"));
    await act(async () => motion.finish());
    assert.equal(navigated, 1);
    assert.equal(document.querySelector("dialog"), null);
    assert.equal(document.activeElement, trigger);
  } finally {
    await act(async () => root.unmount());
    HTMLElement.prototype.getBoundingClientRect = originalBounds;
    trigger.remove();
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
    // Fixed nearby islands actually pull together through a concave bridge,
    // then separate again, even when the surrounding layout is already split.
    const neck = await raster(layouts[1], layouts[3], 0.5);
    assert.equal(neck(69, 32), 255);
    assert.equal(neck(69, 8), 0, "the bridge must have a visible waist");
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
    const back = context?.querySelector(".context-back") ? 64 : 0;
    const actions = context?.querySelector(".context-actions") ? 128 : 0;
    if (element.classList.contains("context-back"))
      return { left: 0, width: back };
    if (element.classList.contains("context-actions"))
      return { left: w - actions, width: actions };
    if (element.classList.contains("context-primary"))
      return {
        left: back ? 74 : 0,
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
    return { ...box(this), top: 0, bottom: 64, height: 64 };
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
      { left: 0, width: 64, radius: 32 },
      null,
      null,
    ]);
    assert.equal(
      border.getAttribute("d"),
      dockFieldPath(
        w + 24,
        dockField(
          w + 24,
          settings.map((island) => ({ ...island, left: island.left + 12 })),
        ),
        44,
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
      dockFieldPath(
        w + 24,
        dockField(
          w + 24,
          settings.map((island) => ({ ...island, left: island.left + 12 })),
        ),
        44,
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
