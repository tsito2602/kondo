import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
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
      "export { SafariTabs } from './src/web/safari-tabs'; export { ThumbDockProvider, ThumbDock, ThumbAction, ThumbActions } from './src/web/thumb-dock'; export { Modal, SaveButton } from './src/web/ui'; export { dismissModal, useMotionNavigation } from './src/web/motion';",
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
  SafariTabs,
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
    await act(async () => dockButton("キャンセル").click());
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

test("compact tabs navigate with one tap; holding reveals names without navigating on release", async () => {
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
    await act(async () =>
      document.querySelector('[aria-label="旅行メニュー"]').click(),
    );
    assert.equal(menus, 1);
  } finally {
    await act(async () => root.unmount());
    delete document.startViewTransition;
  }
});

test("details retain the same five tab nodes and close before one-tap navigation, including the current tab", async () => {
  let surface;
  HTMLElement.prototype.animate = () => (surface = timeline());
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
    const icons = [...nav.querySelectorAll("svg")];
    const host = document.querySelector(".thumb-dock-host");
    for (const destination of ["bookings", "places", "notes"]) {
      await act(async () => openDetail());
      const dialog = document.querySelector("dialog");
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
