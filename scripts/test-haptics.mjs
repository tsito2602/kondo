import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

async function load(userAgent) {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://kondo.test/",
  });
  Object.defineProperty(dom.window.navigator, "userAgent", {
    value: userAgent,
  });
  const vibrations = [];
  dom.window.navigator.vibrate = (ms) => vibrations.push(ms);
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver,
  });
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator,
    configurable: true,
  });
  const { outputFiles } = await build({
    entryPoints: ["src/web/haptics.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputFiles[0].text)(
    createRequire(import.meta.url),
    module,
    module.exports,
  );
  return { dom, vibrations, ...module.exports };
}

test("iPhone ticks through a hidden label only after a real click, never covering controls", async () => {
  const { dom, installHaptics } = await load(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
  );
  const document = dom.window.document;
  document.body.innerHTML =
    '<button id="a">A</button><button id="off" disabled>Off</button><div data-no-haptic><button id="b">B</button></div>';
  installHaptics();
  assert.equal(
    document.querySelectorAll("button .haptic-touch").length,
    0,
    "nothing is laid over a control, so touches on it can scroll",
  );
  const tap = (element) => element.click();
  let toggles = 0;
  let clicks = 0;
  document.getElementById("a").addEventListener("click", () => clicks++);
  tap(document.getElementById("a"));
  const label = document.querySelector("label.haptic-touch");
  const input = label.querySelector("input");
  assert.equal(input.getAttribute("switch"), "");
  assert.equal(label.getAttribute("aria-hidden"), "true");
  assert.equal(input.checked, true, "the label toggled the switch");
  assert.equal(clicks, 1, "the control still receives exactly one click");
  input.addEventListener("change", () => toggles++);
  tap(document.getElementById("a"));
  assert.equal(toggles, 1, "one shared switch is reused");
  tap(document.getElementById("b"));
  tap(document.getElementById("off"));
  assert.equal(toggles, 1, "disabled and opted-out controls stay silent");
});

test("Android vibrates only for confirmed actions", async () => {
  const { dom, installHaptics, vibrations } = await load(
    "Mozilla/5.0 (Linux; Android 14)",
  );
  const document = dom.window.document;
  document.body.innerHTML =
    '<a href="#x" id="nav">Nav</a><button id="task" data-haptic>Task</button><form id="form"><button>Save</button></form>';
  installHaptics();
  assert.equal(document.querySelectorAll(".haptic-touch").length, 0);
  document.getElementById("nav").click();
  assert.deepEqual(vibrations, []);
  document.getElementById("task").click();
  document
    .getElementById("form")
    .dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
  assert.deepEqual(vibrations, [5, 5]);
});
