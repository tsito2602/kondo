// The timeline time picker (kondo-time-pickers.html, option C) and the numeric
// time field: what a traveller can rely on when dragging, resizing, typing and
// using the keyboard, and when the walk to the next plan makes them late.
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const dom = new JSDOM('<div id="root"></div>', { url: "https://kondo.test/" });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  IS_REACT_ACT_ENVIRONMENT: true,
});
globalThis.matchMedia = window.matchMedia = () => ({
  matches: true,
  addEventListener() {},
  removeEventListener() {},
});
const require = createRequire(import.meta.url);
async function bundle(contents) {
  const { outputFiles } = await build({
    stdin: { contents, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    jsx: "automatic",
    packages: "external",
    logLevel: "silent",
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputFiles[0].text)(
    require,
    module,
    module.exports,
  );
  return module.exports;
}
const picker = await bundle(
  "export * from './src/data/time-picker'; export { TimeField } from './src/web/time-field';",
);
const {
  snap,
  moveSpan,
  resizeStart,
  resizeEnd,
  keySpan,
  typedStart,
  typedEnd,
  walkFlags,
  neighbours,
  freeStart,
  typedClock,
  parseClock,
  clockOf,
  lengthLabel,
  MIN_LENGTH,
  DAY_END,
  TimeField,
} = picker;
const at = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const span = (start, end) => ({ start: at(start), end: at(end) });
const shown = ({ start, end }) =>
  `${clockOf(start)}–${end >= 1440 ? "翌" : ""}${clockOf(end)}`;

test("dragging snaps to 5 minutes and moves start and end together", () => {
  assert.equal(snap(512), 510);
  assert.equal(snap(513), 515);
  const plan = span("08:30", "09:30");
  assert.equal(shown(moveSpan(plan, at("08:30") + 23)), "08:55–09:55");
  assert.equal(shown(moveSpan(plan, at("08:30") - 61)), "07:30–08:30");
  // The block stays on its day: the end never passes 翌02:00.
  const late = moveSpan(plan, at("23:59") + 400);
  assert.ok(late.end <= DAY_END);
  assert.equal(late.end - late.start, 60, "moving keeps the length");
  assert.equal(moveSpan(plan, -200).start, 0);
});

test("the grips resize one end, never shorter than 15 minutes", () => {
  const plan = span("08:30", "09:30");
  assert.equal(shown(resizeStart(plan, at("08:02"))), "08:00–09:30");
  assert.equal(shown(resizeEnd(plan, at("10:13"))), "08:30–10:15");
  assert.equal(MIN_LENGTH, 15);
  assert.equal(shown(resizeStart(plan, at("09:29"))), "09:15–09:30");
  assert.equal(shown(resizeEnd(plan, at("07:00"))), "08:30–08:45");
  assert.equal(shown(resizeEnd(plan, at("23:59") + 120)), "08:30–翌02:00");
});

test("keyboard: arrows move 5 minutes, Shift 15, Alt/Option resizes the end", () => {
  const plan = span("08:30", "09:30");
  assert.equal(shown(keySpan(plan, "ArrowDown")), "08:35–09:35");
  assert.equal(shown(keySpan(plan, "ArrowUp", { shift: true })), "08:15–09:15");
  assert.equal(shown(keySpan(plan, "ArrowDown", { alt: true })), "08:30–09:35");
  assert.equal(
    shown(keySpan(plan, "ArrowUp", { alt: true, shift: true })),
    "08:30–09:15",
  );
  assert.equal(
    shown(keySpan(span("08:30", "08:45"), "ArrowUp", { alt: true })),
    "08:30–08:45",
    "the end cannot come closer than 15 minutes",
  );
  assert.equal(shown(keySpan(plan, "PageDown")), "09:30–10:30");
  assert.equal(keySpan(plan, "Enter"), null);
});

test("typed times jump exactly; an earlier end is after midnight", () => {
  const plan = span("08:30", "09:30");
  assert.equal(shown(typedStart(plan, at("11:07"))), "11:07–12:07");
  assert.equal(shown(typedEnd(plan, at("10:02"))), "08:30–10:02");
  assert.equal(typedEnd(plan, at("08:40")), null, "less than 15 minutes");
  assert.equal(
    shown(typedEnd(span("21:00", "22:00"), at("00:30"))),
    "21:00–翌00:30",
  );
  assert.equal(typedEnd(plan, at("05:00")), null, "past 翌02:00");
  assert.equal(lengthLabel(90), "1時間30分");
  assert.equal(lengthLabel(45), "45分");
});

test("walks to the neighbours flag lateness like the しおり", () => {
  const blocks = [
    {
      key: "a",
      title: "ホテルで朝食",
      start: at("07:00"),
      end: at("08:00"),
      walk: 6,
    },
    {
      key: "b",
      title: "美術史美術館",
      start: at("10:00"),
      end: at("12:00"),
      walk: 12,
    },
    { key: "c", title: "集合", start: at("13:00"), end: null, walk: 4 },
  ];
  const fine = walkFlags(span("08:30", "09:30"), blocks);
  assert.deepEqual(fine.before, { minutes: 6, late: 0, at: at("08:00") });
  assert.deepEqual(fine.after, { minutes: 12, late: 0, at: at("09:30") });
  // Ending at 09:55 with a 12-minute walk is 7 minutes late for 10:00.
  const late = walkFlags(span("08:55", "09:55"), blocks);
  assert.equal(late.after.late, 7);
  // Starting 2 minutes after breakfast ends cannot make the 6-minute walk.
  assert.equal(walkFlags(span("08:02", "09:00"), blocks).before.late, 4);
  // A plan without an end time has no lateness (as in the しおり).
  const afterOpen = walkFlags(span("13:05", "14:00"), blocks);
  assert.equal(afterOpen.before.late, 0);
  assert.equal(neighbours(span("12:10", "12:40"), blocks).next.key, "c");
  // No coordinates, no walk.
  assert.equal(
    walkFlags(span("08:30", "09:30"), [{ ...blocks[0], walk: null }]).before,
    null,
  );
  // A plan without a time starts in the first free hour.
  assert.equal(
    clockOf(freeStart(blocks.slice(0, 1), 60, at("07:30"))),
    "08:00",
  );
});

test("numeric time field parsing: 2220 → 22:20; anything else is refused", () => {
  assert.equal(typedClock("2"), "2");
  assert.equal(typedClock("22"), "22");
  assert.equal(typedClock("222"), "22:2");
  assert.equal(typedClock("2220"), "22:20");
  assert.equal(typedClock("930"), "9:30");
  assert.equal(typedClock("22:205"), "22:20");
  assert.equal(typedClock("２２２０"), "22:20");
  assert.equal(parseClock("2220"), "22:20");
  assert.equal(parseClock("930"), "09:30");
  assert.equal(parseClock("9:30"), "09:30");
  assert.equal(parseClock("0830"), "08:30");
  assert.equal(parseClock("7"), "07:00");
  assert.equal(parseClock("0000"), "00:00");
  assert.equal(parseClock("2359"), "23:59");
  assert.equal(parseClock(""), "");
  for (const bad of ["2400", "2360", "9999", "12:3", "ab", "1:2:3", "12345"])
    assert.equal(parseClock(bad), null, bad);
});

test("TimeField formats as you type, commits on Enter and reverts invalid input", async () => {
  const React = await import("react");
  const { act } = React;
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root"));
  const seen = [];
  function Form({ live }) {
    const [value, setValue] = React.useState("08:30");
    return React.createElement(TimeField, {
      "aria-label": "時刻",
      live,
      allowEmpty: false,
      value,
      onChange: (next) => {
        seen.push(next);
        if (next === "23:00") return false;
        setValue(next);
      },
    });
  }
  await act(async () =>
    root.render(React.createElement(Form, { live: false })),
  );
  const input = document.querySelector("input");
  assert.equal(input.getAttribute("inputmode"), "numeric");
  const type = async (text) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        "value",
      ).set.call(input, text);
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
  const enter = async () =>
    act(async () => {
      input.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
        }),
      );
    });
  await type("222");
  assert.equal(input.value, "22:2");
  await type("2220");
  assert.equal(input.value, "22:20");
  assert.deepEqual(seen, [], "not committed before Enter");
  await enter();
  assert.deepEqual(seen, ["22:20"]);
  assert.equal(input.value, "22:20");
  await type("2599");
  await enter();
  assert.equal(input.value, "22:20", "an invalid time goes back");
  assert.equal(input.getAttribute("aria-invalid"), "true");
  assert.deepEqual(seen, ["22:20"]);
  await type("");
  await enter();
  assert.equal(input.value, "22:20", "empty is refused when a time is needed");
  await type("2300");
  await enter();
  assert.equal(input.value, "22:20", "a time the picker refuses goes back");
  assert.deepEqual(seen, ["22:20", "23:00"]);
  // Live (forms): a complete time is passed on without leaving the field.
  await act(async () =>
    root.render(React.createElement(Form, { live: true, key: "live" })),
  );
  const live = document.querySelector("input");
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      "value",
    ).set.call(live, "0930");
    live.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  assert.equal(seen.at(-1), "09:30");
  await act(async () => root.unmount());
});
