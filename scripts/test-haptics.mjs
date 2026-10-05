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

test("iPhone controls carry a transparent label that ticks a hidden switch, then hands the tap back", async () => {
  const { dom, installHaptics, isHapticTouch } = await load(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
  );
  const document = dom.window.document;
  document.body.innerHTML =
    '<button id="a">A</button><input id="field"><div data-no-haptic><button id="b">B</button></div>';
  installHaptics();
  const button = document.getElementById("a");
  const label = button.querySelector(":scope > label.haptic-touch");
  assert.ok(label, "the finger lands on a label, not on a switch");
  const input = label.querySelector("input");
  assert.equal(input.getAttribute("switch"), "");
  assert.equal(label.getAttribute("aria-hidden"), "true");
  assert.equal(input.tabIndex, -1);
  assert.ok(isHapticTouch(label) && isHapticTouch(input));
  assert.equal(document.querySelectorAll("#b .haptic-touch").length, 0);
  let clicks = 0;
  let bubbled = 0;
  button.addEventListener("click", (event) => {
    if (event.target === button) clicks++;
  });
  document.body.addEventListener("click", () => bubbled++);
  label.click();
  assert.equal(input.checked, true, "the label toggled the switch");
  assert.equal(clicks, 1, "the control receives exactly one click");
  assert.equal(bubbled, 1, "only the handed-back click bubbles");
  button.click();
  assert.equal(clicks, 2, "a direct click is not repeated");
  const late = document.createElement("button");
  document.body.appendChild(late);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(late.querySelectorAll(":scope > .haptic-touch").length, 1);
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
