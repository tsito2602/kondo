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
      "export { SafariTabs } from './src/web/safari-tabs'; export { ThumbDockProvider, ThumbDock, ThumbAction, ThumbActions } from './src/web/thumb-dock'; export { Modal, SaveButton } from './src/web/ui'; export { dismissModal } from './src/web/motion';",
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

test("compact icons expand without navigating, retain their DOM, and collapse after selection or dismissal", async () => {
  const root = createRoot(document.getElementById("root"));
  const h = React.createElement;
  let menus = 0;
  function Harness() {
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
    const trigger = document.querySelector(".safari-expand");
    const nav = document.querySelector(".safari-tabs");
    const icons = [...nav.querySelectorAll("svg")];
    assert.equal(icons.length, 5);
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    assert.ok(nav.hasAttribute("inert"));
    assert.equal(nav.querySelectorAll('a[tabindex="-1"]').length, 5);
    assert.equal(
      document.querySelector(".safari-dock").querySelectorAll(".thumb-add")
        .length,
      0,
    );
    await act(async () => trigger.click());
    assert.equal(
      document.querySelector("output").textContent,
      "/trips/demo/itinerary",
    );
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    assert.equal(nav.hasAttribute("inert"), false);
    assert.equal(
      document.activeElement,
      nav.querySelector('a[aria-current="page"]'),
    );
    assert.equal(document.querySelectorAll(".safari-side[inert]").length, 2);
    assert.deepEqual([...nav.querySelectorAll("svg")], icons);
    await act(async () => nav.querySelector('a[href$="/places"]').click());
    assert.equal(
      document.querySelector("output").textContent,
      "/trips/demo/places",
    );
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    assert.match(trigger.getAttribute("aria-label"), /行きたい場所/);
    assert.deepEqual([...nav.querySelectorAll("svg")], icons);
    assert.equal(document.activeElement, trigger);
    for (const dismiss of ["outside", "escape"]) {
      await act(async () => trigger.click());
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
      assert.equal(trigger.getAttribute("aria-expanded"), "false");
      assert.equal(
        document.querySelector("output").textContent,
        "/trips/demo/places",
      );
      assert.equal(document.querySelectorAll(".safari-side[inert]").length, 0);
    }
    await act(async () =>
      document
        .querySelector('.safari-side-button[aria-label="旅行メニュー"]')
        .click(),
    );
    assert.equal(menus, 1);
  } finally {
    await act(async () => root.unmount());
  }
});
