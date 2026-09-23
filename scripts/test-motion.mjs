import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

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
      "export { Modal } from './src/web/ui'; export { dismissModal } from './src/web/motion';",
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
const { Modal, dismissModal } = module.exports;

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
