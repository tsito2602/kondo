import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { indexedDB } from "fake-indexeddb";

const dom = new JSDOM(
  '<!doctype html><html><head><meta name="theme-color"></head><body><div id="root"></div></body></html>',
  { url: "https://tabi.test/", pretendToBeVisual: true },
);
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  sessionStorage: dom.window.sessionStorage,
  Element: dom.window.Element,
  Node: dom.window.Node,
  MutationObserver: dom.window.MutationObserver,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  CustomEvent: dom.window.CustomEvent,
  indexedDB,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
globalThis.matchMedia = window.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
});
globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
};
globalThis.IntersectionObserver = class {
  observe() {}
  disconnect() {}
};
const visualViewport = Object.assign(new dom.window.EventTarget(), {
  height: window.innerHeight,
  offsetTop: 0,
  scale: 1,
});
Object.defineProperty(window, "visualViewport", {
  value: visualViewport,
  configurable: true,
});
window.scrollTo = () => {};
dom.window.Range.prototype.getClientRects = () => [];
dom.window.Range.prototype.getBoundingClientRect = () => ({
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
  width: 0,
  height: 0,
});
document.elementFromPoint = () => document.body;
HTMLElement.prototype.scrollIntoView = () => {};
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
globalThis.confirm = () => true;
const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { MemoryRouter } = await import("react-router");
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
    define: {
      "import.meta.env.DEV": "false",
      "import.meta.env.PROD": "false",
      "import.meta.env.VITE_API_URL": '"https://tabi.test"',
      "import.meta.env.VITE_GOOGLE_CLIENT_ID": '""',
      "import.meta.env.VITE_ENABLE_DEMO": '"false"',
      "import.meta.env.VITE_APP_VERSION": '"2.0.0"',
    },
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
const {
  App,
  AuthProvider,
  ThemeProvider,
  ToastProvider,
  timelineEntries,
  loadTravelCache,
  saveTravelCache,
  emptyTravelCache,
} = await bundle(
  "export { App } from './src/web/app'; export { AuthProvider } from './src/auth/auth-provider'; export { ThemeProvider, ToastProvider } from './src/web/ui'; export { timelineEntries } from './src/web/screens'; export { loadTravelCache, saveTravelCache } from './src/data/cache'; export { emptyTravelCache } from './src/data/types';",
);
const { default: worker } = await bundle(
  "export { default } from './worker/index';",
);
const tick = async (ms = 5) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
const waitFor = async (read, message) => {
  const deadline = Date.now() + 2000;
  do {
    const result = read();
    if (result) return result;
    await tick(10);
  } while (Date.now() < deadline);
  assert.fail(message);
};
const byText = (tag, text) =>
  [...document.querySelectorAll(tag)].find(
    (node) => node.textContent.trim() === text,
  );
const click = async (node) => {
  assert.ok(node, "control exists");
  await act(async () => {
    node.dispatchEvent(
      new dom.window.MouseEvent("mousedown", { bubbles: true, button: 0 }),
    );
    node.click();
  });
  await tick();
};
const field = (label) =>
  [...document.querySelectorAll("dialog .field, dialog .bk-fld")]
    .find((node) => node.querySelector("span, small")?.textContent === label)
    ?.querySelector(
      ".bk-date,input,select,textarea,.date-trigger,[data-time-trigger]",
    );
// A plan's times: the button opens the timeline picker, whose big 開始/終了
// readout is typed into (digits, then Enter) and saved with 「保存する」.
const pickTime = async (trigger, values) => {
  await click(trigger);
  const picker = [...document.querySelectorAll("dialog[open]")].at(-1);
  assert.ok(picker.querySelector(".tlp"), "the time picker opens");
  for (const [label, value] of Object.entries(values)) {
    const input = picker.querySelector(`.tlp-readout [aria-label="${label}"]`);
    assert.ok(input, `picker ${label} exists`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        "value",
      ).set.call(input, value.replace(":", ""));
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
        }),
      );
    });
    assert.equal(input.value, value);
  }
  await click(byText(".context-actions button", "保存する"));
  await waitFor(() => !picker.isConnected || !picker.open, "the picker closes");
  await tick(30);
};
const fill = async (label, value) => {
  const input = field(label);
  assert.ok(input, `field ${label} exists`);
  if (input.matches("[data-time-trigger]"))
    return pickTime(input, { 開始: value });
  if (input.matches(".date-trigger, .bk-date")) {
    await click(input);
    const selection = typeof value === "string" ? { start: value } : value;
    const chooseDate = async (date) => {
      const first = document.querySelector("dialog:last-of-type [data-date]");
      const months = (value) =>
        Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7));
      const difference = months(date) - months(first.dataset.date);
      for (let index = 0; index < Math.abs(difference); index++)
        await click(
          document.querySelector(
            `dialog:last-of-type [aria-label="${difference > 0 ? "次の月" : "前の月"}"]`,
          ),
        );
      await click(
        document.querySelector(`dialog:last-of-type [data-date="${date}"]`),
      );
    };
    if (selection.start) {
      await click(document.querySelector("dialog:last-of-type .dp-end"));
      await chooseDate(selection.start);
    }
    if (selection.end) await chooseDate(selection.end);
    assert.equal(byText(".context-actions button", "決定").disabled, false);
    await click(byText(".context-actions button", "決定"));
    await tick(30);
    return;
  }
  const proto =
    input instanceof dom.window.HTMLSelectElement
      ? dom.window.HTMLSelectElement.prototype
      : input instanceof dom.window.HTMLTextAreaElement
        ? dom.window.HTMLTextAreaElement.prototype
        : dom.window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value").set.call(input, value);
    input.dispatchEvent(
      new dom.window.Event(input.tagName === "SELECT" ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
};
const submit = async () => {
  const dock = document.querySelector(".thumb-dock-host");
  const save = dock.querySelector(
    ':is(.context-actions, .context-primary) button[type="submit"]',
  );
  assert.ok(dock.querySelector('.context-back [aria-label="戻る"]'));
  assert.equal(save?.form, document.querySelector("dialog form"));
  await act(async () =>
    document
      .querySelector("dialog form")
      .dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
  );
  await tick(30);
};

// Panels and dock retain the layout viewport when the keyboard opens.
// Exercise focus, keyboard resizing/panning and dismissal in each real editor.
const keyboardWhileEditing = async (backLabel = "戻る") => {
  const dialog = [...document.querySelectorAll("dialog[open]")].at(-1);
  const dock = document.querySelector(".thumb-dock-host");
  const field = dialog.querySelector('input:not([type="checkbox"]), textarea');
  const panel = dialog.querySelector(".modal-inner");
  const header = panel.querySelector(".modal-header");
  const measurePanel = panel.getBoundingClientRect;
  const measureHeader = header.getBoundingClientRect;
  const measureField = field.getBoundingClientRect;
  const measureDock = dock.getBoundingClientRect;
  dock.getBoundingClientRect = () => ({
    top: window.innerHeight - 84,
    height: 64,
  });
  panel.getBoundingClientRect = () => ({
    top: 0,
    bottom: window.innerHeight - 100,
    height: window.innerHeight - 100,
  });
  header.getBoundingClientRect = () => ({
    bottom: 56,
  });
  field.getBoundingClientRect = () => ({
    top: 380 - panel.scrollTop,
    bottom: 426 - panel.scrollTop,
  });
  await act(async () => field.focus());
  panel.scrollTop = 0;
  for (const offsetTop of [0, 64, 112]) {
    await act(async () => {
      visualViewport.height = 340;
      visualViewport.offsetTop = offsetTop;
      visualViewport.dispatchEvent(new dom.window.Event("resize"));
      visualViewport.dispatchEvent(new dom.window.Event("scroll"));
    });
    assert.equal(
      document.documentElement.style.getPropertyValue("--modal-layout-height"),
      window.innerHeight + "px",
    );
    assert.equal(
      document.documentElement.style.getPropertyValue("--modal-top"),
      offsetTop + "px",
    );
    await tick(30);
    assert.equal(document.documentElement.dataset.keyboardOpen, "true");
    if (!dialog.classList.contains("full"))
      assert.equal(
        panel.style.getPropertyValue("--modal-panel-height"),
        `${window.innerHeight - 100}px`,
        "compact panels preserve their height too",
      );
    assert.equal(
      panel.scrollTop,
      98,
      "reveal once on keyboard resize, not repeatedly during native viewport pan",
    );
    assert.equal(dock.parentElement, dialog);
    assert.ok(dock.querySelector('button[type="submit"]'));
  }
  const keyboardPadding = document.documentElement.style.getPropertyValue(
    "--panel-keyboard-inset",
  );
  await act(async () => {
    field.blur();
    assert.equal(
      document.documentElement.style.getPropertyValue("--panel-keyboard-inset"),
      keyboardPadding,
      "transient body focus between editors must not remove keyboard scroll space",
    );
    field.focus();
  });
  const previousValue = field.value;
  const dismiss = dialog.querySelector('[aria-label="キーボードを閉じる"]');
  assert.ok(dismiss, "focused editor replaces Back with keyboard dismissal");
  const pointerDown = new dom.window.Event("pointerdown", {
    bubbles: true,
    cancelable: true,
  });
  await act(async () => dismiss.dispatchEvent(pointerDown));
  assert.ok(
    pointerDown.defaultPrevented,
    "tap does not transfer focus before its action",
  );
  // Even if Safari blurs before click, this gesture must never leave the form.
  await act(async () => field.blur());
  await tick(30);
  await click(dismiss);
  assert.ok(
    dialog.isConnected && dialog.open,
    "keyboard dismissal keeps the editor open",
  );
  assert.equal(
    field.value,
    previousValue,
    "keyboard dismissal preserves the draft",
  );
  assert.ok(
    dialog.querySelector(`[aria-label="${backLabel}"], .context-back-label`),
    "Back returns after dismissal",
  );
  panel.getBoundingClientRect = measurePanel;
  header.getBoundingClientRect = measureHeader;
  field.getBoundingClientRect = measureField;
  dock.getBoundingClientRect = measureDock;
  await act(async () => {
    field.blur();
    visualViewport.height = window.innerHeight;
    visualViewport.offsetTop = 0;
    visualViewport.dispatchEvent(new dom.window.Event("resize"));
  });
  assert.equal(
    document.documentElement.style.getPropertyValue("--panel-keyboard-inset"),
    "0px",
  );
  assert.equal(document.documentElement.dataset.keyboardOpen, "false");
  assert.equal(panel.style.getPropertyValue("--modal-panel-height"), "");
};

const setTime = async (label, value) => {
  const trigger = document.querySelector("dialog[open] [data-time-trigger]");
  assert.ok(trigger, `time ${label} exists`);
  await pickTime(trigger, { [label]: value });
};

// 予定の詳細 edits in place: the same sheet becomes the form and comes back.
const editInPlace = async (change) => {
  const detail = document.querySelector("dialog[open]");
  const dock = document.querySelector(".thumb-dock-host");
  // Every detail panel keeps 編集 just left of 削除 on the right island.
  const edit = '.context-actions [aria-label="編集"]';
  for (const save of [false, true]) {
    await click(document.querySelector(edit));
    assert.equal(document.querySelectorAll("dialog[open]").length, 1);
    assert.equal(document.querySelector("dialog[open]"), detail);
    assert.equal(dock.parentElement, detail);
    assert.ok(detail.querySelector("form"));
    if (!save) await keyboardWhileEditing("やめる");
    if (save) {
      await change();
      const submitButton = dock.querySelector(
        '.context-actions button[type="submit"]',
      );
      assert.equal(submitButton?.form, detail.querySelector("form"));
      await act(async () =>
        detail
          .querySelector("form")
          .dispatchEvent(
            new dom.window.Event("submit", { bubbles: true, cancelable: true }),
          ),
      );
      await tick(30);
    } else {
      await click(
        document.querySelector('.context-back [aria-label="やめる"]'),
      );
      await tick(30);
    }
    assert.equal(document.querySelector("dialog[open]"), detail);
    assert.equal(detail.querySelector("form"), null, "back to the details");
    assert.ok(document.querySelector(edit));
  }
};

// Exercise real details/editors: a fresh dialog would replay its entrance and
// lose scroll, even if it rendered exactly the same text after returning.
const editAndReturn = async (label, value) => {
  const detail = document.querySelector("dialog[open]");
  const panel = detail.querySelector(".modal-inner");
  const dock = document.querySelector(".thumb-dock-host");
  panel.scrollTop = 137;
  for (const save of [false, true, false]) {
    await click(document.querySelector('.context-actions [aria-label="編集"]'));
    const dialogs = [...document.querySelectorAll("dialog[open]")];
    assert.equal(dialogs.length, 2, "detail stays behind its editor");
    assert.equal(dialogs[0], detail);
    assert.equal(dock.parentElement, dialogs[1]);
    if (save) await keyboardWhileEditing();
    if (save) {
      await fill(label, value);
      await submit();
    } else {
      await click(document.querySelector('.context-back [aria-label="戻る"]'));
      await tick(30);
    }
    assert.equal(document.querySelectorAll("dialog[open]").length, 1);
    assert.equal(document.querySelector("dialog[open]"), detail);
    assert.equal(detail.querySelector(".modal-inner"), panel);
    assert.equal(panel.scrollTop, 137);
    assert.equal(dock.parentElement, detail);
    assert.equal(document.body.style.overflow, "hidden");
    if (save) assert.ok(detail.textContent.includes(value));
  }
};

test("attachment preview uses a fullscreen dialog with close and download controls", async () => {
  const { DocumentPreview, ThumbDockProvider } = await bundle(
    "export { DocumentPreview } from './src/web/document-preview'; export { ThumbDockProvider } from './src/web/thumb-dock';",
  );
  const preview = (props) =>
    React.createElement(
      ThumbDockProvider,
      null,
      React.createElement(DocumentPreview, props),
    );
  const root = createRoot(document.getElementById("root"));
  let closed = 0;
  const file = {
    id: "document",
    filename: "reservation.pdf",
    contentType: "application/pdf",
    size: 100,
  };
  try {
    await act(async () =>
      root.render(
        preview({
          url: "blob:https://tabi.test/document",
          file,
          onClose: () => closed++,
        }),
      ),
    );
    const dialog = document.querySelector("dialog.fullscreen[open]");
    assert.ok(dialog);
    assert.ok(dialog.querySelector(".thumb-dock-host"));
    assert.equal(
      dialog.querySelector(".context-back button").getAttribute("aria-label"),
      "閉じる",
    );
    assert.equal(dialog.querySelector(".context-back button").textContent, "");
    assert.equal(
      dialog.querySelector('[data-slot="r"] a').textContent,
      "端末に保存",
    );
    assert.equal(
      dialog.querySelector("iframe").getAttribute("title"),
      file.filename,
    );
    assert.equal(
      dialog.querySelector("a[download]").getAttribute("download"),
      file.filename,
    );
    await act(async () =>
      root.render(
        preview({
          url: "blob:https://tabi.test/photo",
          file: { ...file, filename: "ticket.png", contentType: "image/png" },
          onClose: () => closed++,
        }),
      ),
    );
    assert.equal(dialog.querySelector("iframe"), null);
    assert.equal(
      dialog.querySelector(".document-preview img").alt,
      "ticket.png",
    );
    await click(dialog.querySelector('.context-back [aria-label="閉じる"]'));
    await tick(30);
    assert.equal(closed, 1);
  } finally {
    await act(async () => root.unmount());
  }
});

test("legacy account cache and pending changes survive React migration; real forms sync through Hono", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(await readFile("worker/schema.sql", "utf8"));
  db.prepare("INSERT INTO users(id,email,display_name) VALUES (?,?,?)").run(
    "owner",
    "test@example.test",
    "テスト",
  );
  db.prepare("INSERT INTO user_profiles(user_id,avatar_url) VALUES (?,?)").run(
    "owner",
    "https://example.test/avatar.png",
  );
  db.prepare(
    "INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES (?,?,unixepoch()+1000,unixepoch())",
  ).run(createHash("sha256").update("test-session").digest("hex"), "owner");
  const DB = {
    prepare(sql) {
      return {
        args: [],
        bind(...args) {
          this.args = args;
          return this;
        },
        async first() {
          return db.prepare(sql).get(...this.args) ?? null;
        },
        async all() {
          return { results: db.prepare(sql).all(...this.args) };
        },
        async run() {
          return {
            meta: { changes: db.prepare(sql).run(...this.args).changes },
          };
        },
      };
    },
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec("COMMIT");
        return results;
      } catch (cause) {
        db.exec("ROLLBACK");
        throw cause;
      }
    },
  };
  const trip = {
    id: randomUUID(),
    name: "移行前の旅行",
    destination: "ウィーン",
    startsOn: "2026-11-22",
    endsOn: "2026-11-25",
    role: "owner",
    memberCount: 1,
  };
  const item = {
    id: randomUUID(),
    title: "圏外で追加した予定",
    day: trip.startsOn,
    time: "10:00",
    kind: "観光",
    note: "",
  };
  const cache = {
    ...emptyTravelCache(),
    trips: [trip],
    selectedTripId: trip.id,
    itemsByTrip: { [trip.id]: [item] },
    pending: [
      { id: randomUUID(), method: "POST", path: "/v1/trips", body: trip },
      {
        id: randomUUID(),
        method: "POST",
        path: `/v1/trips/${trip.id}/items`,
        body: item,
      },
    ],
  };
  // These are the exact keys used by the old Expo Web client.
  sessionStorage.setItem("tabi.session", "test-session");
  localStorage.setItem(
    "tabi.offline-user",
    JSON.stringify({
      user: { id: "owner", email: "test@example.test", name: "テスト" },
      expiresAt: Date.now() + 86400000,
    }),
  );
  await saveTravelCache(cache, "owner");
  const failures = [];
  globalThis.fetch = async (url, init) => {
    const request = new Request(url, init);
    // Flight saves are optimistic. Exercise a server response slower than the
    // form helper's 30ms wait so database assertions cannot rely on that delay.
    if (
      ["POST", "PATCH"].includes(request.method) &&
      /\/bookings(?:\/[^/]+)?$/.test(new URL(request.url).pathname) &&
      (await request.clone().json()).kind === "flight"
    ) {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    const response = await worker.fetch(request, { DB, BUCKET: {} });
    if (!response.ok)
      failures.push({
        url,
        status: response.status,
        error: await response.clone().text(),
      });
    return response;
  };
  // The app looks for a waiting service worker from launch.
  const swRegistration = {
    waiting: null,
    update: async () => {},
    addEventListener() {},
  };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration: async () => swRegistration,
      addEventListener() {},
      removeEventListener() {},
    },
  });
  const root = createRoot(document.getElementById("root"));
  try {
    await act(async () =>
      root.render(
        React.createElement(
          MemoryRouter,
          { initialEntries: [`/trips/${trip.id}/members`] },
          React.createElement(
            ThemeProvider,
            null,
            React.createElement(
              ToastProvider,
              null,
              React.createElement(AuthProvider, null, React.createElement(App)),
            ),
          ),
        ),
      ),
    );
    await tick(80);
    assert.equal(
      document.querySelector("dialog h2").textContent,
      "メンバー管理",
    );
    assert.ok(
      document.querySelector("dialog.full .members-page"),
      "direct member URL opens a floating panel above the itinerary",
    );
    await click(document.querySelector('.context-back [aria-label="戻る"]'));
    await tick(30);
    assert.equal(document.querySelector("dialog[open]"), null);
    assert.match(document.body.textContent, /圏外で追加した予定/);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM itinerary_items").get().n,
      1,
    );
    assert.equal((await loadTravelCache("owner")).pending.length, 0);
    assert.equal(localStorage.getItem("tabi.session"), "test-session");
    assert.equal(sessionStorage.getItem("tabi.session"), null);
    const emptyDay = document.querySelector("#day-2026-11-24 .it-empty button");
    assert.ok(emptyDay && !emptyDay.disabled);
    await click(emptyDay);
    assert.match(
      document.querySelector("dialog [data-time-trigger]").textContent,
      /^11\/24/,
      "an empty day's button adds on that day",
    );
    await click(document.querySelector('.context-back [aria-label="戻る"]'));
    await tick(30);
    await click(document.querySelector('[aria-label="予定を追加"]'));
    await fill("なにをする？", "市内を歩く");
    await fill("時刻", "14:00");
    await submit();
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM itinerary_items").get().n,
      2,
    );
    await click(
      [...document.querySelectorAll(".it-ev")].find((entry) =>
        entry.textContent.includes("市内を歩く"),
      ),
    );
    // The plan's detail is the ＋ button's floating panel.
    assert.equal(document.querySelector("dialog[open]").dataset.panel, "add");
    assert.ok(
      document.querySelector('.context-actions [aria-label="予定を削除"]'),
    );
    await editInPlace(async () => {
      await fill("タイトル", "市内を散策");
      await setTime("終了", "15:00");
    });
    assert.deepEqual(
      JSON.parse(
        db
          .prepare(
            "SELECT details FROM itinerary_details d JOIN itinerary_items i ON i.id = d.item_id WHERE i.title = ?",
          )
          .get("市内を散策").details,
      ).endDay,
      trip.startsOn,
      "end time supplies same-day end date",
    );
    // Every detail panel's dock: ‹ on the left, 編集 then 削除 at the right edge.
    assert.ok(document.querySelector('.context-back [aria-label="戻る"]'));
    assert.deepEqual(
      [...document.querySelectorAll(".context-actions button")].map((node) =>
        node.getAttribute("aria-label"),
      ),
      ["編集", "予定を削除"],
    );
    assert.equal(document.querySelector(".thumb-dock-host .cdock-tabs"), null);
    // Deleting is quiet: the plan goes at once and 「元に戻す」 brings it back.
    await click(
      document.querySelector('.context-actions [aria-label="予定を削除"]'),
    );
    await waitFor(
      () => !document.querySelector("dialog[open]"),
      "deleting closes the plan at once",
    );
    assert.equal(document.querySelector("dialog[open]"), null);
    assert.equal(
      [...document.querySelectorAll(".it-ev")].some((entry) =>
        entry.textContent.includes("市内を散策"),
      ),
      false,
    );
    await click(
      document.querySelector('.cdock-group[data-slot="toast"] button'),
    );
    await tick(30);
    assert.ok(
      [...document.querySelectorAll(".it-ev")].some((entry) =>
        entry.textContent.includes("市内を散策"),
      ),
      "undo restores the plan",
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM itinerary_items").get().n,
      2,
    );
    await click(byText("nav a", "予約"));
    await click(document.querySelector('[aria-label="予約を追加"]'));
    assert.equal(
      document.querySelector("dialog.bk-sheetl h3").textContent,
      "予約を取り込む",
    );
    await click(document.querySelector("dialog .bk-swap"));
    assert.equal(
      field("宿の名前"),
      undefined,
      "the manual form shows no fields before a kind is chosen",
    );
    await click(byText("dialog .bk-kinds button", "ホテル"));
    await fill("宿の名前", "テストホテル");
    const hotelUrl =
      "https://links.h6.hilton.com/f/a/" +
      "long-link-".repeat(30) +
      "?reservation=private";
    // The dates: one calendar for the stay (チェックイン, then チェックアウト).
    await fill("チェックイン", {
      start: trip.startsOn,
      end: `${trip.startsOn.slice(0, 4)}-11-25`,
    });
    assert.match(field("チェックアウト").textContent, /^11\/25（/);
    // The times: each chip opens that day's timeline (時刻の粒).
    await pickTime(
      document.querySelector(
        'dialog [data-time-trigger][aria-label^="チェックインの時刻"]',
      ),
      { チェックイン: "15:00" },
    );
    await pickTime(
      document.querySelector(
        'dialog [data-time-trigger][aria-label^="チェックアウトの時刻"]',
      ),
      { チェックアウト: "11:00" },
    );
    await fill("場所", hotelUrl);
    // The ＋ panel's dock: the ‹ circle on the left island (it closes the
    // keyboard first while typing), 「追加する」 in ink.
    assert.ok(
      document.querySelector(
        '.thumb-dock-host .context-back button:is([aria-label="戻る"], [aria-label="キーボードを閉じる"])',
      ),
    );
    assert.equal(
      byText(".thumb-dock-host .context-back button", "やめる"),
      undefined,
    );
    await click(byText(".thumb-dock-host .cdock-group button", "追加する"));
    await waitFor(
      () =>
        !document.querySelector("dialog[open]") &&
        db.prepare("SELECT COUNT(*) AS n FROM bookings").get().n === 1,
      "the hotel reaches the server and the sheet closes",
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings").get().n, 1);
    const saved = db.prepare("SELECT * FROM bookings").get();
    assert.equal(saved.title, "テストホテル");
    await click(document.querySelector(".bk-card"));
    const detail = document.querySelector("dialog[open]");
    assert.equal(detail.dataset.panel, "add");
    const hotelLink = [...detail.querySelectorAll(".bk-kv a")].find(
      (node) => node.textContent === "地図",
    );
    assert.equal(hotelLink.href, hotelUrl);
    assert.doesNotMatch(
      detail.textContent,
      /long-link-|reservation=private|Google Mapsで開く/,
    );
    assert.equal(document.querySelector(".thumb-dock-host .cdock-tabs"), null);
    // The detail panel's dock: ‹, then 編集 and 削除 at the right; no 「見せる」.
    assert.ok(document.querySelector('.context-back [aria-label="戻る"]'));
    assert.deepEqual(
      [...document.querySelectorAll(".context-actions button")].map((node) =>
        node.getAttribute("aria-label"),
      ),
      ["編集", "予約を削除"],
    );
    assert.equal(
      byText(".thumb-dock-host .cdock-group button", "見せる"),
      undefined,
    );
    await click(document.querySelector('.context-actions [aria-label="編集"]'));
    assert.equal(document.querySelectorAll("dialog[open]").length, 2);
    await fill("宿泊施設名", "更新したホテル");
    await submit();
    assert.equal(
      db.prepare("SELECT title FROM bookings").get().title,
      "更新したホテル",
    );
    assert.match(detail.querySelector(".bk-hd").textContent, /更新したホテル/);
    await click(document.querySelector('.context-back [aria-label="戻る"]'));
    await tick(30);
    await click(byText("nav a", "場所"));
    await click(document.querySelector('[aria-label="場所を追加"]'));
    assert.equal(field("訪問ステータス").closest("details"), null);
    assert.equal(field("訪問ステータス").value, "want");
    assert.equal(field("予約状況").value, "not_needed");
    assert.notEqual(
      document.activeElement,
      field("場所の名前"),
      "opening does not activate the keyboard",
    );
    await fill("場所の名前", "美術館");
    await fill("メモ", "見たい展示");
    await fill("営業時間", "10:00〜18:00");
    await fill("予約状況", "needed");
    assert.equal(field("予約状況").closest("details"), null);
    await click(byText("dialog button", "リンクを追加"));
    await fill("URL", "https://example.com/museum");
    await fill("名前", "公式サイト");
    await click(byText("dialog button", "リンクを追加"));
    await click(document.querySelectorAll('[aria-label="リンクを削除"]')[1]);
    assert.equal(
      field("URL").value,
      "https://example.com/museum",
      "removing a new link preserves the existing link",
    );
    await submit();
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM places").get().n, 1);
    const placeRow = document.querySelector(".places-row");
    assert.equal(placeRow.querySelector(".places-badge").textContent, "1");
    assert.equal(
      placeRow.querySelector(".places-row-distance").textContent,
      "位置なし",
      "a place without a map link says why it has no pin",
    );
    // Without coordinates the row opens 場所の詳細 directly.
    await click(placeRow);
    const placeMapLink = [
      ...document.querySelectorAll("dialog .reference-link"),
    ].find((link) => link.textContent.includes("Google Mapsで開く"));
    assert.equal(placeMapLink.querySelector("small").textContent, "google.com");
    assert.equal(
      placeMapLink.href.startsWith("https://www.google.com/maps/"),
      true,
    );
    assert.equal(
      document.querySelector(
        'dialog a[href="https://example.com/museum"] small',
      ).textContent,
      "example.com",
    );
    assert.ok(
      document.querySelector('.context-actions [aria-label="場所を削除"]'),
    );
    await editAndReturn("場所の名前", "更新した美術館");
    const savedPlace = db
      .prepare("SELECT note, opening_hours, reservation_status FROM places")
      .get();
    assert.equal(savedPlace.note, "見たい展示");
    assert.equal(savedPlace.opening_hours, "10:00〜18:00");
    assert.equal(
      savedPlace.reservation_status,
      "needed",
      "collapsed options survive saving and editing the name",
    );
    assert.equal(document.querySelector(".thumb-dock-host .cdock-tabs"), null);
    const placeDetail = document.querySelector("dialog[open]");
    // 編集 and 削除 share the right island; しおり's action is a function of
    // its own on the island left of them (the panel repeats it for wide
    // screens without the dock).
    assert.deepEqual(
      [...document.querySelectorAll(".context-actions button")].map((node) =>
        node.getAttribute("aria-label"),
      ),
      ["編集", "場所を削除"],
    );
    assert.deepEqual(
      [...document.querySelectorAll(".context-secondary button")].map((node) =>
        node.getAttribute("aria-label"),
      ),
      ["しおりに追加"],
    );
    await click(
      byText("dialog .detail-itinerary-action button", "しおりに追加"),
    );
    assert.equal(document.querySelectorAll("dialog[open]").length, 2);
    await fill("日時", "16:00");
    await submit();
    assert.equal(document.querySelector("dialog[open]"), placeDetail);
    assert.match(document.querySelector("dialog").textContent, /しおりを見る/);
    const link = db.prepare("SELECT item_id FROM place_itinerary_links").get();
    assert.ok(link.item_id);
    assert.equal(
      document.querySelector(".detail-visit .booking-time-clock").textContent,
      "16:00",
    );
    // The times themselves open the timeline picker; no separate button.
    assert.equal(
      byText("dialog .detail-visit button", "予定の日時を編集"),
      undefined,
    );
    assert.match(
      document.querySelector(".detail-visit").textContent,
      /時刻をタップすると直せます/,
    );
    await pickTime(document.querySelector(".detail-visit .time-tap"), {
      開始: "17:05",
    });
    assert.equal(document.querySelector("dialog[open]"), placeDetail);
    assert.equal(
      document.querySelector(".detail-visit .booking-time-clock").textContent,
      "17:05",
    );
    await pickTime(document.querySelector(".detail-visit .time-tap"), {
      開始: "16:00",
    });
    assert.equal(
      document.querySelector("dialog .detail-itinerary-action").textContent,
      "しおりを見る",
    );
    assert.equal(
      document
        .querySelector(".context-secondary button")
        .getAttribute("aria-label"),
      "しおりを見る",
    );
    await click(document.querySelector('.context-actions [aria-label="編集"]'));
    assert.ok(document.querySelector('.context-actions button[type="submit"]'));
    assert.equal(
      field("予約状況").value,
      "needed",
      "existing reservation status remains visible",
    );
    assert.equal(field("URL").value, "https://example.com/museum");
    await click(document.querySelector('.context-back [aria-label="戻る"]'));
    await tick(30);
    assert.equal(
      document.querySelector("dialog .detail-itinerary-action").textContent,
      "しおりを見る",
    );
    await click(document.querySelector('.context-actions [aria-label="編集"]'));
    await fill(
      "住所・Google MapsのURL",
      "https://www.google.com/maps/place/Kunsthistorisches+Museum/@48.2037,16.3616,17z/data=!4m6!3m5!8m2!3d48.20379!4d16.36166",
    );
    await submit();
    assert.deepEqual(
      { ...db.prepare("SELECT lat, lng FROM place_coordinates").get() },
      { lat: 48.20379, lng: 16.36166 },
      "the Worker stores the pin from the pasted Google Maps link",
    );
    await click(document.querySelector('.context-back [aria-label="戻る"]'));

    const pin = await waitFor(
      () =>
        document.querySelector('.places-pin[aria-label="1 更新した美術館"]'),
      "the scheduled place appears as pin 1 on its day",
    );
    assert.ok(pin.classList.contains("plan"));
    assert.equal(
      [...document.querySelectorAll(".places-chips button[aria-pressed]")]
        .map((chip) => chip.textContent)
        .join(","),
      "全日程,11/22",
    );
    await click(pin);
    assert.equal(
      document.querySelector(".places-card .places-tag").textContent,
      "DAY 1 · 11/22 16:00",
    );
    assert.ok(
      document
        .querySelector(".places-card a.is-primary")
        .href.startsWith("https://www.google.com/maps/place/"),
    );
    await click(
      document.querySelector(
        'dialog[open] .modal-header [aria-label="閉じる"]',
      ),
    );
    await tick(50);
    assert.equal(document.querySelector(".places-card"), null);
    // やること and 持ち物 are separate icon-only dock pages.
    const dockTab = (label) =>
      document.querySelector(
        `.thumb-dock-host .cdock-tabs a[aria-label="${label}"]`,
      );
    assert.deepEqual(
      [...document.querySelectorAll(".thumb-dock-host .cdock-tabs a")].map(
        (link) => [link.getAttribute("aria-label"), link.textContent],
      ),
      [
        ["しおり", ""],
        ["場所", ""],
        ["やること", ""],
        ["持ち物", ""],
        ["予約", ""],
        ["メモ", ""],
      ],
    );
    const typeInto = async (input, value) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          dom.window.HTMLInputElement.prototype,
          "value",
        ).set.call(input, value);
        input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      });
    };
    const submitSheet = async (primary) => {
      // While typing, the back island closes the keyboard instead.
      await act(async () => document.activeElement?.blur());
      await tick(30);
      const dock = document.querySelector(".thumb-dock-host");
      const save = dock.querySelector(
        ':is(.context-actions, .context-primary) button[type="submit"]',
      );
      assert.equal(save?.textContent, primary);
      assert.equal(save.form, document.querySelector("dialog form"));
      // Adding or editing: a floating panel, ‹ on the left goes back.
      assert.equal(document.querySelector("dialog[open]").dataset.panel, "add");
      assert.ok(dock.querySelector('.context-back [aria-label="戻る"]'));
      await act(async () =>
        save.form.dispatchEvent(
          new dom.window.Event("submit", { bubbles: true, cancelable: true }),
        ),
      );
      await tick(30);
    };
    const ringCount = () =>
      document.querySelector('[data-ring="owner"] small').textContent;
    await click(dockTab("やること"));
    assert.equal(
      document.querySelector(".page-top h2").textContent,
      "やること",
    );
    assert.equal(
      document.querySelector('[data-ring="owner"] b').textContent,
      "あなた",
    );
    assert.equal(ringCount(), "あと0");
    await click(
      document.querySelector('.persistent-add[aria-label="やることを追加"]'),
    );
    assert.equal(document.activeElement, document.querySelector("dialog h2"));
    assert.equal(
      document.querySelector("dialog h2").textContent,
      "やることを追加",
    );
    assert.equal(document.querySelector("dialog input[autofocus]"), null);
    assert.equal(
      document.querySelector(".prep-who-all"),
      null,
      "みんな各自 needs more than one member",
    );
    assert.match(
      document.querySelector('.prep-whos [aria-pressed="true"]').textContent,
      /あなた$/,
      "a new task is mine unless I choose someone else",
    );
    await keyboardWhileEditing();
    await submitSheet("追加する");
    assert.match(
      document.querySelector("dialog .error").textContent,
      /やることの名前を入れてください/,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM travel_tasks").get().n,
      0,
    );
    await typeInto(
      document.querySelector('dialog input[aria-label="やること"]'),
      "チケットを予約",
    );
    const dueDay = new Date();
    dueDay.setDate(dueDay.getDate() + 40);
    const due = `${dueDay.getFullYear()}-${String(dueDay.getMonth() + 1).padStart(2, "0")}-${String(dueDay.getDate()).padStart(2, "0")}`;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const before = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    await click(document.querySelector("dialog .date-trigger"));
    const duePanel = () => [...document.querySelectorAll("dialog")].at(-1);
    if (duePanel().querySelector(`[data-date="${before}"]`))
      assert.equal(
        duePanel().querySelector(`[data-date="${before}"]`).disabled,
        true,
        "past days cannot be a deadline",
      );
    while (!duePanel().querySelector(`[data-date="${due}"]`))
      await click(duePanel().querySelector('[aria-label="次の月"]'));
    await click(duePanel().querySelector(`[data-date="${due}"]`));
    assert.equal(
      duePanel()
        .querySelector(`[data-date="${due}"]`)
        .getAttribute("aria-pressed"),
      "true",
    );
    await click(byText(".context-actions button", "決定"));
    await tick(30);
    assert.equal(
      document.querySelector("dialog .date-trigger").dataset.dateValue,
      due,
    );
    assert.match(
      document.querySelector("dialog .date-trigger").textContent,
      new RegExp(`${+due.slice(5, 7)}/${+due.slice(8)}（`),
    );
    await submitSheet("追加する");
    assert.equal(document.querySelector("dialog"), null);
    const savedTask = db
      .prepare("SELECT id, title, due_on, assignee, done FROM travel_tasks")
      .get();
    assert.deepEqual(
      [savedTask.title, savedTask.due_on, savedTask.assignee, savedTask.done],
      ["チケットを予約", due, "member:owner", 0],
    );
    assert.equal(ringCount(), "あと1");
    assert.equal(
      document.querySelector(`[data-task="${savedTask.id}"] small`).textContent,
      `${+due.slice(5, 7)}/${+due.slice(8)}まで`,
    );
    const ringAvatar = () =>
      document.querySelector('[data-ring="owner"] .assignee-avatar');
    assert.equal(ringAvatar().getAttribute("aria-label"), "テスト");
    const avatarImage = ringAvatar().querySelector("img");
    assert.equal(avatarImage.src, "https://example.test/avatar.png");
    await act(async () =>
      avatarImage.dispatchEvent(new dom.window.Event("error")),
    );
    assert.equal(ringAvatar().querySelector("img"), null);
    assert.equal(ringAvatar().textContent, "テ");
    await click(
      document.querySelector(`[data-task="${savedTask.id}"] [role="checkbox"]`),
    );
    await tick(30);
    assert.equal(db.prepare("SELECT done FROM travel_tasks").get().done, 1);
    assert.equal(ringCount(), "あと0");
    assert.ok(
      document
        .querySelector('[data-ring="owner"]')
        .classList.contains("is-closed"),
      "the ring closes when every task is done",
    );
    await click(document.querySelector('[aria-label="チケットを予約を編集"]'));
    assert.equal(
      document.querySelector("dialog h2").textContent,
      "やることを編集",
    );
    await click(document.querySelector("dialog .date-trigger"));
    await click(
      [...document.querySelectorAll("dialog")].at(-1).querySelector(".dp-none"),
    );
    await click(byText(".context-actions button", "決定"));
    await tick(30);
    assert.match(
      document.querySelector("dialog .date-trigger").textContent,
      /期限なし/,
    );
    await submitSheet("保存");
    const editedTask = db
      .prepare("SELECT due_on, done FROM travel_tasks")
      .get();
    assert.deepEqual([editedTask.due_on, editedTask.done], ["", 1]);
    assert.equal(
      document.querySelector(`[data-task="${savedTask.id}"] small`).textContent,
      "期限なし",
    );
    await click(document.querySelector('[aria-label="チケットを予約を編集"]'));
    const taskDelete = document.querySelector(
      '.context-actions [aria-label="やることを削除"]',
    );
    assert.ok(
      taskDelete,
      "delete sits to the right of save in the task editor",
    );
    // No confirm: it leaves the list at once and the dock offers 元に戻す.
    await click(taskDelete);
    await tick(30);
    assert.equal(document.querySelector("dialog"), null);
    assert.equal(document.querySelector(`[data-task="${savedTask.id}"]`), null);
    const toast = () =>
      document.querySelector('.cdock-group[data-slot="toast"]');
    assert.match(toast().textContent, /やることを消しました/);
    await click(toast().querySelector("button"));
    assert.ok(
      document.querySelector(`[data-task="${savedTask.id}"]`),
      "元に戻す brings it back",
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM travel_tasks").get().n,
      1,
    );
    await click(document.querySelector('[aria-label="チケットを予約を編集"]'));
    await click(
      document.querySelector('.context-actions [aria-label="やることを削除"]'),
    );
    await tick(30);
    // Leaving the page settles the deletion instead of waiting for the timer.
    await act(async () =>
      window.dispatchEvent(new dom.window.Event("pagehide")),
    );
    await waitFor(
      () => db.prepare("SELECT COUNT(*) AS n FROM travel_tasks").get().n === 0,
      "the undo window ends in a real delete",
    );

    await click(dockTab("持ち物"));
    assert.equal(document.querySelector(".page-top h2").textContent, "持ち物");
    const addPacking = async (name, kind) => {
      await click(
        document.querySelector('.persistent-add[aria-label="持ち物を追加"]'),
      );
      assert.equal(
        document.querySelector('[role="radio"][aria-checked="true"] b')
          .textContent,
        "みんな各自",
        "みんな各自 is the default kind",
      );
      await typeInto(
        document.querySelector('dialog input[aria-label="持ち物"]'),
        name,
      );
      await click(byText('[role="radio"] b', kind).closest("button"));
      await submitSheet("追加する");
      return db.prepare("SELECT id FROM packing_items WHERE name = ?").get(name)
        .id;
    };
    const kindRow = (id) => document.querySelector(`[data-item="${id}"]`);
    const charger = await addPacking("充電器", "みんな各自");
    assert.equal(
      db
        .prepare("SELECT kind FROM packing_kinds WHERE item_id = ?")
        .get(charger).kind,
      "each",
    );
    assert.ok(
      document.querySelector(`[data-kind="each"] [data-item="${charger}"]`),
    );
    await click(kindRow(charger).querySelector('[role="checkbox"]'));
    await tick(30);
    assert.deepEqual(
      db
        .prepare("SELECT user_id FROM packing_marks WHERE item_id = ?")
        .all(charger)
        .map((row) => row.user_id),
      ["owner"],
      "みんな各自 keeps each member's own tick",
    );
    const medicine = await addPacking("常備薬", "1つでいい");
    assert.match(kindRow(medicine).textContent, /まだ誰も持っていない/);
    assert.equal(kindRow(medicine).querySelector('[role="checkbox"]'), null);
    await click(byText(`[data-item="${medicine}"] button`, "自分が持つ"));
    await tick(30);
    assert.equal(
      db
        .prepare("SELECT assignee FROM packing_details WHERE item_id = ?")
        .get(medicine).assignee,
      "member:owner",
    );
    assert.match(kindRow(medicine).textContent, /あなたが持つ/);
    assert.ok(kindRow(medicine).querySelector('[role="checkbox"]'));
    const diary = await addPacking("日記", "自分だけ");
    assert.deepEqual(
      {
        ...db
          .prepare("SELECT kind, owner_id FROM packing_kinds WHERE item_id = ?")
          .get(diary),
      },
      { kind: "mine", owner_id: "owner" },
    );
    assert.match(kindRow(diary).textContent, /ほかの人には見えない/);
    await click(document.querySelector('[aria-label="充電器を編集"]'));
    assert.equal(
      document.querySelector("dialog h2").textContent,
      "持ち物を編集",
    );
    await click(byText('[role="radio"] b', "1つでいい").closest("button"));
    await submitSheet("保存");
    assert.equal(
      db
        .prepare("SELECT kind FROM packing_kinds WHERE item_id = ?")
        .get(charger).kind,
      "one",
      "the kind can be changed later",
    );
    assert.ok(
      document.querySelector(`[data-kind="one"] [data-item="${charger}"]`),
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM packing_items").get().n,
      3,
    );
    await click(byText("nav a", "メモ"));
    const noteCount = () =>
      db.prepare("SELECT COUNT(*) AS n FROM travel_notes").get().n;
    const typeIntoNote = async (node, value) => {
      assert.ok(node, "text field exists");
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          dom.window.HTMLTextAreaElement.prototype,
          "value",
        ).set.call(node, value);
        node.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      });
    };
    const closeNote = async () => {
      // The dock's back button first dismisses the keyboard, then goes back.
      document.activeElement?.blur();
      await tick(40);
      await click(document.querySelector('dialog [aria-label="戻る"]'));
      await tick();
    };
    const addNote = async () => {
      document.activeElement?.blur();
      await tick(40);
      await click(byText("dialog .context-actions button", "追加する"));
      await tick(50);
    };
    await click(document.querySelector('[aria-label="メモを書く"]'));
    await tick(550);
    assert.equal(noteCount(), 0, "opening an empty note does not save it");
    assert.equal(
      document.querySelector("dialog[open]").dataset.panel,
      "add",
      "＋ opens the new memo in the floating add panel",
    );
    assert.equal(byText("dialog button", "完了"), undefined);
    await closeNote();
    // ‹ on the add panel cancels: the draft is never saved.
    await click(document.querySelector('[aria-label="メモを書く"]'));
    await typeIntoNote(
      document.querySelector('[aria-label="メモのタイトル"]'),
      "捨てるメモ",
    );
    await tick(550);
    assert.equal(noteCount(), 0, "the add panel does not autosave");
    await closeNote();
    await tick(550);
    assert.equal(noteCount(), 0, "‹ drops the draft");
    await click(document.querySelector('[aria-label="メモを書く"]'));
    assert.equal(
      document.activeElement,
      document.querySelector('[aria-label="メモのタイトル"]'),
      "＋ starts on the title",
    );
    await typeIntoNote(
      document.querySelector('[aria-label="メモのタイトル"]'),
      "旅先の買い物",
    );
    await typeIntoNote(
      document.querySelector('textarea[aria-label="1行目"]'),
      "お土産",
    );
    await click(document.querySelector('[aria-label="チェックを足す"]'));
    await typeIntoNote(
      document.querySelector('textarea[aria-label="2行目"]'),
      "待ち合わせ場所",
    );
    assert.ok(
      document.querySelector('dialog .memo-ln.c [role="checkbox"]'),
      "a check line renders as a box",
    );
    await click(document.querySelector('[aria-label="ピン留め"]'));
    assert.equal(noteCount(), 0, "nothing is saved before 追加する");
    await addNote();
    await waitFor(() => noteCount() === 1, "追加する saves the note");
    assert.equal(noteCount(), 1);
    assert.equal(document.querySelector("dialog[open]"), null);
    assert.equal(
      db.prepare("SELECT title FROM note_details").get().title,
      "旅先の買い物",
    );
    assert.equal(
      db.prepare("SELECT content FROM note_details").get().content,
      null,
    );
    assert.equal(
      db.prepare("SELECT body FROM travel_notes").get().body,
      "お土産\n- [ ] 待ち合わせ場所",
    );
    await waitFor(
      () => db.prepare("SELECT pinned FROM travel_notes").get().pinned === 1,
      "pinning saves",
    );
    assert.equal(db.prepare("SELECT pinned FROM travel_notes").get().pinned, 1);
    assert.match(
      document.querySelector(".memo-tile").textContent,
      /旅先の買い物/,
    );
    assert.ok(byText(".memo-lab b", "ピン留め"), "pinned notes group on top");
    assert.match(document.querySelector(".memo-meta").textContent, /あなた/);
    // Ticking on the tile saves without opening the note.
    await click(document.querySelector('.memo-tile [role="checkbox"]'));
    await waitFor(
      () =>
        db.prepare("SELECT body FROM travel_notes").get().body.includes("[x]"),
      "ticking on the tile saves",
    );
    assert.equal(document.querySelector("dialog"), null);
    assert.equal(
      db.prepare("SELECT body FROM travel_notes").get().body,
      "お土産\n- [x] 待ち合わせ場所",
    );
    await click(document.querySelector(".memo-tile-open"));
    assert.equal(
      document.querySelector('textarea[aria-label="2行目"]').value,
      "待ち合わせ場所",
    );
    assert.equal(
      document
        .querySelector('dialog [role="checkbox"]')
        .getAttribute("aria-checked"),
      "true",
    );
    await closeNote();
    await click(document.querySelector('[aria-label="メモを書く"]'));
    await typeIntoNote(
      document.querySelector('[aria-label="メモのタイトル"]'),
      "削除するメモ",
    );
    await addNote();
    await waitFor(() => noteCount() === 2, "the second note is added");
    await click(
      [...document.querySelectorAll(".memo-tile-open")].find((button) =>
        button.textContent.includes("削除するメモ"),
      ),
    );
    await click(document.querySelector('[aria-label="メモを消す"]'));
    await tick(50);
    assert.ok(
      ![...document.querySelectorAll(".memo-tile")].some((tile) =>
        tile.textContent.includes("削除するメモ"),
      ),
      "a deleted note leaves the list at once, with no confirm",
    );
    await click(
      document.querySelector('.cdock-group[data-slot="toast"] button'),
    );
    assert.ok(
      [...document.querySelectorAll(".memo-tile")].some((tile) =>
        tile.textContent.includes("削除するメモ"),
      ),
      "元に戻す brings it back",
    );
    await click(
      [...document.querySelectorAll(".memo-tile-open")].find((button) =>
        button.textContent.includes("削除するメモ"),
      ),
    );
    await click(document.querySelector('[aria-label="メモを消す"]'));
    await tick(50);
    assert.ok(document.querySelector('.cdock-group[data-slot="toast"]'));
    // Leaving the page settles the deletion instead of waiting for the timer.
    await click(byText("nav a", "しおり"));
    await waitFor(
      () => noteCount() === 1,
      "the undo window ends in a real delete",
    );
    assert.equal(noteCount(), 1, "the undo window ends in a real delete");
    await click(byText("nav a", "メモ"));
    assert.deepEqual(
      failures,
      [],
      "all emitted form payloads are accepted by the existing API",
    );
    assert.equal((await loadTravelCache("owner")).pending.length, 0);
    await click(
      document.querySelector('.trip-heading [aria-label="旅行メニュー"]'),
    );
    assert.ok(document.querySelector(".trip-menu-popover[open]"));
    assert.ok(
      document.querySelector(".thumb-dock-host .cdock-tabs"),
      "header menu keeps the trip dock",
    );
    await click(byText(".trip-menu-popover button", "設定"));
    await tick(30);
    assert.equal(document.querySelector(".trip-menu-popover"), null);
    const settingsBackground = document.querySelector("#main-content");
    assert.equal(document.querySelector("dialog h2").textContent, "設定");
    assert.ok(document.querySelector("dialog.full .settings-page"));
    const foot = document.querySelector("dialog .settings-foot");
    assert.match(
      foot.textContent,
      /^kondo$/,
      "the version moved to the app row",
    );
    assert.ok(foot.querySelector("button[aria-label='kondo'] svg"));
    assert.match(
      document.querySelector("dialog .passport-stamps").textContent,
      /これまでの旅 \d+回/,
    );
    assert.equal(byText("dialog button", "表示名を保存"), undefined);
    assert.equal(byText("dialog button", "更新を確認"), undefined);
    const versionRow = [
      ...document.querySelectorAll("dialog .settings-row"),
    ].find((row) => row.textContent.includes("バージョン 2.0.0"));
    assert.match(versionRow.textContent, /最新です/);
    const nameInput = document.querySelector("dialog .passport-name");
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        "value",
      ).set.call(nameInput, "つばさ");
      nameInput.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await waitFor(
      () =>
        document.querySelector(".toast.visible")?.textContent ===
        "表示名を保存しました",
      "the display name autosaves while typing",
    );
    const posted = [];
    const waitingWorker = {
      postMessage(message, ports) {
        posted.push(message.type);
        if (message.type === "GET_VERSION")
          ports[0].postMessage({ version: "2026.10.7.1432" });
      },
    };
    swRegistration.waiting = waitingWorker;
    await act(async () => {
      document.dispatchEvent(new dom.window.Event("visibilitychange"));
    });
    const notice = await waitFor(
      () => document.querySelector("dialog .update-notice"),
      "a waiting version shows the notice inside the open sheet",
    );
    assert.match(
      notice.textContent,
      /アップデートされました\s*kondo 2026\.10\.7\.1432\s*更新する/,
    );
    assert.equal(document.documentElement.dataset.appUpdate, "waiting");
    assert.match(versionRow.textContent, /2026\.10\.7\.1432 が届いています/);
    await click(notice);
    assert.deepEqual(posted, ["GET_VERSION", "ACTIVATE_UPDATE"]);
    assert.equal(sessionStorage.getItem("kondo.updated"), "1");
    sessionStorage.removeItem("kondo.updated");
    swRegistration.waiting = null;
    await act(async () => {
      document.dispatchEvent(new dom.window.Event("visibilitychange"));
    });
    await waitFor(
      () => !document.querySelector(".update-notice"),
      "the notice leaves once nothing is waiting",
    );
    await click(document.querySelector('.context-back [aria-label="戻る"]'));
    await tick(30);
    assert.equal(document.querySelector("#main-content"), settingsBackground);
    assert.ok(document.querySelector(".trip-title"));
    const membersBackground = document.querySelector("#main-content");
    await click(
      document.querySelector('.trip-heading [aria-label="旅行メニュー"]'),
    );
    await click(byText(".trip-menu-popover button", "メンバー管理"));
    await tick(30);
    assert.equal(
      document.querySelector("#main-content"),
      membersBackground,
      "opening members preserves the current page",
    );
    assert.equal(
      document.querySelector("dialog h2").textContent,
      "メンバー管理",
    );
    assert.ok(document.querySelector("dialog.full .members-page"));
    assert.ok(byText("dialog button", "招待リンクを作成"));
    assert.equal(
      document.querySelector(".thumb-dock-host").parentElement,
      document.querySelector("dialog"),
    );
    await click(document.querySelector('.context-back [aria-label="戻る"]'));
    await tick(30);
    assert.equal(document.querySelector("dialog[open]"), null);
    assert.equal(
      document.querySelector("#main-content"),
      membersBackground,
      "closing members restores the same page",
    );

    await click(byText("nav a", "予約"));
    await click(document.querySelector('[aria-label="予約を追加"]'));
    await click(document.querySelector("dialog .bk-swap"));
    await click(byText("dialog .bk-kinds button", "航空券"));
    // Only the flight's fields, as the mock draws them.
    assert.deepEqual(
      [...document.querySelectorAll("dialog .bk-fld small")].map(
        (node) => node.textContent,
      ),
      [
        "航空会社",
        "便名",
        "出発の空港",
        "到着の空港",
        "出発",
        "到着",
        "予約番号",
      ],
    );
    assert.equal(field("便名").placeholder, "EK 319");
    await fill("出発の空港", "成田（NRT）");
    await fill("到着の空港", "kix");
    await fill("出発", { start: trip.startsOn });
    await pickTime(
      document.querySelector(
        'dialog [data-time-trigger][aria-label^="出発の時刻"]',
      ),
      { 出発: "09:30" },
    );
    await fill("予約番号", "JM6EQC");
    await click(byText(".thumb-dock-host .cdock-group button", "追加する"));
    await waitFor(
      () => !document.querySelector("dialog[open]"),
      "the flight sheet closes after adding",
    );
    const savedFlight = await waitFor(
      () =>
        db
          .prepare(
            "SELECT b.*, d.* FROM bookings b JOIN booking_details d ON d.booking_id = b.id WHERE b.kind = 'flight'",
          )
          .get(),
      "the flight and its details reach the server after form submission",
    );
    assert.equal(
      savedFlight.title,
      "NRT → KIX",
      "a flight saves without a separate reservation title",
    );
    assert.equal(savedFlight.origin, "成田国際空港");
    assert.equal(savedFlight.origin_code, "NRT");
    assert.equal(savedFlight.destination_code, "KIX");
    assert.equal(savedFlight.confirmation_code, "JM6EQC");
    await click(
      [...document.querySelectorAll(".bk-card")].find((entry) =>
        entry.textContent.includes("NRT → KIX"),
      ),
    );
    await click(document.querySelector('.context-actions [aria-label="編集"]'));
    assert.equal(
      field("便名（任意）").value,
      "",
      "generated route titles do not become flight numbers on edit",
    );
    await fill("便名（任意）", "GK211");
    await submit();
    await waitFor(
      () =>
        db
          .prepare("SELECT title FROM bookings WHERE id = ?")
          .get(savedFlight.id)?.title === "GK211",
      "the edited flight number reaches the server",
    );
    await click(document.querySelector('.context-back [aria-label="戻る"]'));
    await tick(30);

    await click(
      document.querySelector('.trip-heading [aria-label="旅行一覧へ戻る"]'),
    );
    await tick(150); // the back button's bounce plays before the trip folds
    // Home keeps settings (left) and create (right) in the dock only.
    assert.equal(
      document.querySelector(".context-actions .home-create").textContent,
      "旅行を作成",
    );
    assert.equal(
      document.querySelector('.context-actions[data-tone="ink"]'),
      null,
    );
    await click(document.querySelector('.context-back [aria-label="設定"]'));
    assert.equal(
      document.querySelectorAll(".cdock-content > [data-slot]").length,
      1,
    );
    await click(document.querySelector('.context-back [aria-label="戻る"]'));
    await tick(30);
    await click(byText(".context-actions button", "旅行を作成"));
    assert.equal(
      document.querySelector('.context-actions button[type="submit"]').form,
      document.querySelector("dialog form"),
    );
    await click(document.querySelector('.context-back [aria-label="戻る"]'));
    await tick(30);
  } finally {
    await act(async () => root.unmount());
    delete navigator.serviceWorker;
    db.close();
    dom.window.close();
  }
});
test("places map reads Google Maps links and numbers places with walking estimates", async () => {
  const { mapCoordinates, isShortMapsLink, placeCoordinates } = await bundle(
    "export * from './src/data/places';",
  );
  const { distanceMeters, walkMinutes, formatMeters } = await bundle(
    "export * from './src/data/place-geo';",
  );
  const { placeNumbers } = await bundle(
    "export * from './src/data/place-numbers';",
  );
  // The place's own pin wins over the camera position.
  assert.deepEqual(
    mapCoordinates(
      "https://www.google.com/maps/place/Stephansdom/@48.2,16.37,17z/data=!3m1!4b1!4m6!3m5!8m2!3d48.20849!4d16.37314",
    ),
    { lat: 48.20849, lng: 16.37314 },
  );
  assert.deepEqual(
    mapCoordinates("https://www.google.com/maps/@48.21,16.36,15z"),
    { lat: 48.21, lng: 16.36 },
  );
  assert.deepEqual(
    mapCoordinates("https://maps.google.com/?q=48.1984,16.363"),
    { lat: 48.1984, lng: 16.363 },
  );
  assert.deepEqual(
    mapCoordinates(
      "https://www.google.com/maps/search/?api=1&query=48.21665%2C16.39585",
    ),
    { lat: 48.21665, lng: 16.39585 },
  );
  assert.equal(
    mapCoordinates(
      "https://www.google.com/maps/search/?api=1&query=Kunsthistorisches+Museum",
    ),
    null,
  );
  assert.equal(mapCoordinates("https://example.com/@48.2,16.3"), null);
  assert.equal(mapCoordinates("Stephansplatz 3, Wien"), null);
  assert.equal(
    mapCoordinates("https://www.google.com/maps/@95.0,16.3,15z"),
    null,
  );
  assert.equal(isShortMapsLink("https://maps.app.goo.gl/AbCdEf"), true);
  assert.equal(isShortMapsLink("https://www.google.com/maps/@1,2,3z"), false);
  assert.deepEqual(
    placeCoordinates({
      lat: 1,
      lng: 2,
      location: "https://maps.google.com/?q=3,4",
    }),
    { lat: 1, lng: 2 },
    "stored coordinates win; the link is only a fallback",
  );
  // Cafe Central to Stephansdom: about 610 m straight, x1.3 at 80 m/min.
  const metres = distanceMeters(
    { lat: 48.21043, lng: 16.36547 },
    { lat: 48.20849, lng: 16.37314 },
  );
  assert.ok(metres > 590 && metres < 630, `${metres}`);
  assert.equal(walkMinutes(metres), 10);
  assert.equal(formatMeters(metres), `${Math.round(metres / 10) * 10}m`);
  assert.equal(formatMeters(1234), "1.2km");
  const items = [
    { id: "late", day: "2026-11-23", time: "09:00" },
    { id: "early", day: "2026-11-22", time: "18:30" },
  ];
  const numbers = placeNumbers(
    [
      { id: "c-b" },
      { id: "p-late", itineraryItemId: "late" },
      { id: "c-a" },
      { id: "p-early", itineraryItemId: "early" },
    ],
    items,
  );
  assert.deepEqual(Object.fromEntries(numbers), {
    "p-early": 1,
    "p-late": 2,
    "c-a": 3,
    "c-b": 4,
  });
});

test("all-day hotel checkout remains visible in itinerary without an end time", () => {
  const entries = timelineEntries(
    [],
    [
      {
        id: "hotel",
        kind: "hotel",
        title: "Hotel",
        day: "2026-11-22",
        time: "",
        endDay: "2026-11-25",
        endTime: "",
      },
    ],
  );
  assert.deepEqual(
    entries.map((entry) => [entry.day, entry.stage]),
    [
      ["2026-11-22", "チェックイン"],
      ["2026-11-25", "チェックアウト"],
    ],
  );
});

test("journeys and hotel endpoints retain chronological order; only ongoing stays lead the day", async () => {
  const { dayTimeline, staysOnDay, buildTimeline, JourneyLine, TimelineRow } =
    await bundle(
      "export { dayTimeline, staysOnDay, buildTimeline } from './src/data/plan-timeline'; export { JourneyLine, TimelineRow } from './src/web/itinerary-rows';",
    );
  const day = "2026-11-22";
  const flight = {
    id: "flight",
    kind: "flight",
    title: "EK127",
    day,
    time: "14:00",
    endDay: day,
    endTime: "18:00",
    originCode: "DXB",
    destinationCode: "VIE",
  };
  const hotel = {
    id: "hotel",
    kind: "hotel",
    title: "Astoria",
    day,
    time: "15:00",
    endDay: "2026-11-25",
    endTime: "11:00",
  };
  const bookings = [flight, hotel];
  const joined = dayTimeline(timelineEntries([], bookings), day);
  assert.deepEqual(
    joined.map((entry) => entry.key),
    ["booking-flight-start", "booking-hotel-start", "booking-flight-end"],
  );
  assert.equal(joined[0].joinedArrival, false);
  const lateHotel = { ...hotel, time: "22:30" };
  const eveningFlight = { ...flight, time: "19:00", endTime: "20:50" };
  const evening = dayTimeline(
    timelineEntries([], [lateHotel, eveningFlight]),
    day,
  );
  assert.deepEqual(
    evening.map((entry) => entry.key),
    ["booking-flight-start", "booking-hotel-start"],
  );
  assert.equal(evening[0].joinedArrival, true);
  const checkout = dayTimeline(
    timelineEntries(
      [{ id: "breakfast", day: hotel.endDay, time: "08:00", title: "朝食" }],
      [hotel],
    ),
    hotel.endDay,
  );
  assert.deepEqual(
    checkout.map((entry) => entry.key),
    ["item-breakfast", "booking-hotel-end"],
  );
  const dayUse = dayTimeline(
    timelineEntries(
      [],
      [{ ...hotel, time: "09:00", endDay: day, endTime: "17:00" }],
    ),
    day,
  );
  assert.deepEqual(
    dayUse.map((entry) => entry.time),
    ["09:00", "17:00"],
  );
  const event = { id: "event", day, time: "16:00", title: "別の予定" };
  const split = dayTimeline(timelineEntries([event], bookings), day);
  assert.deepEqual(
    split.map((entry) => entry.key),
    [
      "booking-flight-start",
      "booking-hotel-start",
      "item-event",
      "booking-flight-end",
    ],
  );
  assert.equal(split[0].joinedArrival, false);
  const overnight = timelineEntries(
    [],
    [{ ...flight, endDay: "2026-11-23", endTime: "02:00" }],
  );
  assert.equal(dayTimeline(overnight, day)[0].joinedArrival, false);
  assert.equal(dayTimeline(overnight, "2026-11-23")[0].endpoint, "end");
  const sameDayFallback = dayTimeline(
    timelineEntries([], [{ ...flight, endDay: "" }]),
    day,
  );
  assert.equal(sameDayFallback[0].joinedArrival, true);
  assert.equal(staysOnDay(bookings, "2026-11-21").length, 0);
  assert.equal(staysOnDay(bookings, "2026-11-23").length, 1);
  assert.equal(staysOnDay(bookings, "2026-11-25").length, 1);
  assert.equal(staysOnDay(bookings, "2026-11-26").length, 0);
  const nextHotel = {
    ...hotel,
    id: "next-hotel",
    day: "2026-11-25",
    endDay: "2026-11-26",
  };
  assert.deepEqual(
    staysOnDay([...bookings, nextHotel], "2026-11-25").map((b) => b.id),
    ["hotel", "next-hotel"],
  );

  const { renderToStaticMarkup } = await import("react-dom/server");
  const days = ["2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25"];
  const timeline = (bookingList) =>
    buildTimeline({ days, items: [], bookings: bookingList, places: [] });
  const markup = (row) =>
    renderToStaticMarkup(
      React.createElement(TimelineRow, {
        row,
        places: [],
        numbers: new Map(),
        onOpen() {},
      }),
    );
  const render = (row) =>
    new JSDOM(markup(row)).window.document.body.textContent;
  const [first, second, , last] = timeline(bookings);
  const departure = render(
    first.rows.find((row) => row.key === "booking-flight-start"),
  );
  assert.match(departure, /14:00/, "departure in the time column");
  assert.match(departure, /18:00/, "arrival on the card");
  assert.match(departure, /予約/, "a booked time is marked as fixed");
  const pair = renderToStaticMarkup(
    React.createElement(JourneyLine, { booking: flight }),
  );
  assert.match(pair, /DXB/);
  assert.match(pair, /VIE/);
  assert.match(pair, /着/);
  // The 予約 tab's stacked layout: departure over arrival, dot by dot.
  const stacked = new JSDOM(pair).window.document;
  assert.ok(stacked.querySelector(".bk-vj"), "the 予約 card's stacked body");
  assert.equal(stacked.querySelectorAll(".bk-pt").length, 2);
  assert.deepEqual(
    [...stacked.querySelectorAll(".bk-t b")].map((node) => node.textContent),
    ["14:00", "18:00"],
  );
  const checkIn = render(
    first.rows.find((row) => row.key === "booking-hotel-start"),
  );
  assert.match(checkIn, /チェックイン/);
  assert.match(checkIn, /15:00〜/);
  assert.match(checkIn, /3泊/);
  const stay = second.rows.filter((row) => row.type === "stay");
  assert.equal(stay.length, 1, "an ongoing stay leads the day");
  assert.equal(second.rows[0].type, "stay");
  assert.match(render(stay[0]), /連泊 · 2泊目/);
  assert.match(
    render(last.rows.find((row) => row.key === "booking-hotel-end")),
    /〜11:00/,
  );
  const untimedDays = timeline([{ ...hotel, time: "", endTime: "" }]);
  const untimedRow = untimedDays[3].rows.find(
    (row) => row.key === "booking-hotel-end",
  );
  const untimed = render(untimedRow);
  assert.match(untimed, /チェックアウト/);
  assert.match(untimed, /未定/);
  const checkoutRow = new JSDOM(
    markup(untimedRow),
  ).window.document.querySelector("[data-entry-key]");
  assert.equal(checkoutRow.dataset.entryKey, "booking-hotel-end");
  assert.equal(checkoutRow.querySelectorAll(".it-node").length, 1);
  for (const boundary of [first, last])
    assert.equal(
      boundary.rows.some((row) => row.type === "stay"),
      false,
      "check-in/out are not duplicated in the stay band",
    );
});

test("our own hotel in/out times stay out of every plan list", async () => {
  const { ordinaryPlans, isStayRecord, findMatchingItineraryItem } =
    await bundle(
      "export { ordinaryPlans, isStayRecord } from './src/data/itinerary'; export { findMatchingItineraryItem } from './src/data/booking-match';",
    );
  const day = "2026-11-22";
  const stay = {
    id: "stay",
    day,
    time: "15:00",
    kind: "その他",
    title: "チェックイン",
    note: "",
    details: {
      category: "other",
      location: "",
      endDay: "",
      endTime: "",
      stay: { bookingId: "hotel", endpoint: "start" },
    },
  };
  const plan = {
    id: "plan",
    day,
    time: "18:00",
    kind: "食事",
    title: "夕食",
    note: "",
  };
  assert.equal(isStayRecord(stay), true);
  assert.equal(isStayRecord(plan), false);
  assert.deepEqual(
    ordinaryPlans([stay, plan]).map((item) => item.id),
    ["plan"],
  );
  assert.equal(
    findMatchingItineraryItem([stay], {
      kind: "hotel",
      title: "チェックイン",
      detail: "",
      origin: "",
      originCode: "",
      destination: "",
      destinationCode: "",
      day,
      time: "15:00",
    }),
    null,
    "a new hotel booking never links to our own check-in time",
  );
  assert.equal(
    findMatchingItineraryItem([{ ...stay, details: undefined }], {
      kind: "hotel",
      title: "チェックイン",
      detail: "",
      origin: "",
      originCode: "",
      destination: "",
      destinationCode: "",
      day,
      time: "15:00",
    })?.item.id,
    "stay",
    "the same item without details.stay is an ordinary plan",
  );
});

test("しおり: walks between places, lateness and いま", async () => {
  const { buildTimeline, walkBetween, timelineEntries } = await bundle(
    "export { buildTimeline, walkBetween, timelineEntries } from './src/data/plan-timeline';",
  );
  const { coordsFromLink, walkMinutes, distanceMeters } = await bundle(
    "export * from './src/data/geo';",
  );
  assert.deepEqual(
    coordsFromLink(
      "https://www.google.com/maps/place/Stephansdom/@48.2084,16.3731,17z/data=!3d48.2085!4d16.3733",
    ),
    { lat: 48.2085, lng: 16.3733 },
  );
  assert.equal(
    coordsFromLink("https://example.com/?query=48.2,16.3"),
    null,
    "only map links carry coordinates",
  );
  const link = (lat, lng) =>
    `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const day = "2026-11-23";
  const item = (id, time, location, endTime = "") => ({
    id,
    day,
    time,
    kind: "予定",
    title: id,
    note: "",
    details: {
      category: "sightseeing",
      location,
      endDay: endTime ? day : "",
      endTime,
    },
  });
  // Stephansdom → Belvedere is about 1.7 km in a straight line.
  const items = [
    item("dom", "09:00", link(48.2085, 16.3733), "10:00"),
    item("belvedere", "10:20", link(48.1915, 16.3809)),
    item("later", "", ""),
  ];
  const meters = distanceMeters(
    { lat: 48.2085, lng: 16.3733 },
    { lat: 48.1915, lng: 16.3809 },
  );
  const [dom, belvedere] = timelineEntries(items, []);
  const walk = walkBetween(dom, belvedere, []);
  assert.equal(walk.minutes, walkMinutes(meters));
  assert.equal(
    walk.late,
    walk.minutes - 20,
    "leaving at the end time arrives after the next plan starts",
  );
  const [plain] = buildTimeline({
    days: [day],
    items,
    bookings: [],
    places: [],
  });
  assert.deepEqual(
    plain.rows.map((row) => row.type),
    ["entry", "walk", "entry", "entry"],
    "no walk to or from a plan without a place",
  );
  assert.equal(plain.today, false);
  // A landing in Vienna the day before puts the clock on Vienna time.
  const landed = {
    id: "in",
    kind: "flight",
    title: "OS52",
    day: "2026-11-22",
    time: "11:00",
    endDay: "2026-11-22",
    endTime: "16:00",
    originCode: "NRT",
    destinationCode: "VIE",
  };
  const [live] = buildTimeline({
    days: [day],
    items,
    bookings: [landed],
    places: [],
    now: new Date("2026-11-23T08:30:00Z"),
  });
  assert.equal(live.today, true);
  const now = live.rows.findIndex((row) => row.type === "now");
  assert.equal(live.rows[now - 1].key, "item-dom");
  assert.equal(live.rows[now - 1].past, true);
  assert.equal(live.rows[now + 1].key, "item-belvedere");
  assert.equal(live.rows[now + 1].past, false);
});

test("booking clocks align Japan conversions in a shared row and preserve seasonal UTC offsets", async () => {
  const { BookingSchedule } = await bundle(
    "export { BookingSchedule } from './src/web/booking-schedule';",
  );
  const { renderToStaticMarkup } = await import("react-dom/server");
  const booking = {
    kind: "flight",
    day: "2026-09-28",
    time: "22:20",
    endDay: "2026-09-29",
    endTime: "05:30",
    originCode: "NRT",
    destinationCode: "DXB",
  };
  const render = (patch = {}) =>
    new JSDOM(
      renderToStaticMarkup(
        React.createElement(BookingSchedule, {
          booking: { ...booking, ...patch },
        }),
      ),
    ).window.document;
  const doc = render();
  assert.deepEqual(
    [...doc.querySelectorAll("h3")].map((n) => n.textContent),
    ["出発", "到着"],
  );
  assert.deepEqual(
    [...doc.querySelectorAll("time")].map((n) => n.textContent),
    ["22:20", "05:30"],
  );
  assert.deepEqual(
    [...doc.querySelectorAll(".booking-time-zone")].map((n) => n.textContent),
    ["現地時刻 · UTC+9", "現地時刻 · UTC+4"],
  );
  assert.equal(doc.querySelectorAll(".booking-japan-row").length, 1);
  assert.match(
    doc.querySelector(".booking-japan-row").textContent,
    /9\/29 10:30/,
  );
  assert.deepEqual(
    [...doc.querySelectorAll(".booking-japan-row dt")].map(
      (n) => n.textContent,
    ),
    ["出発", "到着"],
  );
  assert.deepEqual(
    [...doc.querySelectorAll(".booking-japan-row dd")].map(
      (n) => n.textContent,
    ),
    ["9/28 22:20", "9/29 10:30"],
  );
  assert.equal(
    doc.querySelectorAll(".booking-time .booking-japan-row").length,
    0,
    "both local-clock columns keep the same structure",
  );
  assert.equal(
    render({ destinationCode: "HND" }).querySelectorAll(".booking-japan-row")
      .length,
    0,
  );
  const partial = render({ originCode: "XXX" });
  assert.equal(
    partial.querySelector(".booking-japan-row dd").textContent,
    "時差未確認",
  );
  assert.ok(!doc.body.textContent.includes("GMT"));
  assert.match(
    render({ destinationCode: "VIE", endDay: "2026-07-01" }).body.textContent,
    /UTC\+2/,
  );
  assert.match(
    render({ destinationCode: "VIE", endDay: "2026-11-22" }).body.textContent,
    /UTC\+1/,
  );
  assert.match(
    render({ destinationCode: "LHR", endDay: "2026-11-22" }).body.textContent,
    /UTC\+0/,
  );
  const unknown = render({ destinationCode: "XXX" });
  assert.match(unknown.body.textContent, /時差未確認/);
  assert.equal(unknown.querySelectorAll(".booking-japan-row").length, 0);
  const missing = render({ endTime: "" });
  assert.match(missing.body.textContent, /時刻未設定/);
  assert.equal(missing.querySelectorAll("time").length, 1);
  assert.equal(missing.querySelectorAll(".booking-japan-row").length, 0);
});

test("booking details use kind-specific labels and keep single-date reservations to one column", async () => {
  const { BookingSchedule } = await bundle(
    "export { BookingSchedule } from './src/web/booking-schedule';",
  );
  const { renderToStaticMarkup } = await import("react-dom/server");
  const render = (kind, patch = {}) =>
    new JSDOM(
      renderToStaticMarkup(
        React.createElement(BookingSchedule, {
          booking: {
            kind,
            day: "2026-11-22",
            time: "15:00",
            endDay: "2026-11-22",
            endTime: "15:00",
            ...patch,
          },
        }),
      ),
    ).window.document;
  for (const [kind, labels] of [
    ["hotel", ["チェックイン", "チェックアウト"]],
    ["train", ["出発", "到着"]],
    ["car", ["受取", "返却"]],
    ["restaurant", ["予約"]],
    ["ticket", ["入場"]],
    ["other", ["開始"]],
  ]) {
    const doc = render(kind);
    assert.deepEqual(
      [...doc.querySelectorAll("h3")].map((n) => n.textContent),
      labels,
    );
    assert.equal(
      doc.querySelectorAll(".booking-time-zone").length,
      0,
      "no airport timezone is inferred for other reservation kinds",
    );
  }
  assert.equal(
    render("restaurant", { endTime: "17:00" }).querySelectorAll("section")
      .length,
    2,
    "a meaningful existing end time is preserved",
  );
  assert.equal(
    render("ticket", { endDay: "2026-11-23" }).querySelectorAll("section")
      .length,
    2,
  );
});

test("booking cards stack journeys, lead stays with dates and stamp used bookings", async () => {
  const { BookingCard } = await bundle(
    "export { BookingCard } from './src/web/booking-card';",
  );
  const { renderToStaticMarkup } = await import("react-dom/server");
  const booking = {
    id: "f1",
    kind: "flight",
    title: "GK211",
    detail: "",
    origin: "",
    originCode: "NRT",
    destination: "",
    destinationCode: "KIX",
    day: "2026-12-31",
    time: "19:00",
    endDay: "2027-01-01",
    endTime: "01:00",
    confirmationCode: "JM6EQC",
    note: "",
  };
  const render = (value, now = "2026-12-01T09:00", showDate = false) =>
    new JSDOM(
      renderToStaticMarkup(
        React.createElement(BookingCard, { booking: value, now, showDate }),
      ),
    ).window.document;
  const flight = render(booking);
  assert.deepEqual(
    [...flight.querySelectorAll(".bk-pl b")].map((node) => node.textContent),
    ["NRT", "KIX"],
  );
  assert.deepEqual(
    [...flight.querySelectorAll(".bk-pl small")].map(
      (node) => node.textContent,
    ),
    ["成田国際空港", "関西国際空港"],
  );
  assert.deepEqual(
    [...flight.querySelectorAll(".bk-t")].map((node) => node.textContent),
    ["19:00発", "01:00翌日 着"],
    "each big time sits on its stop row with its label below",
  );
  assert.equal(flight.querySelector(".bk-code b").textContent, "JM6EQC");
  assert.equal(
    flight.querySelector(".bk-hd span"),
    null,
    "no date under a day heading",
  );
  assert.equal(
    render(booking, undefined, true).querySelector(".bk-hd span").textContent,
    "12/31（木）",
  );
  assert.equal(flight.querySelector(".bk-stamp"), null);
  const train = render({
    ...booking,
    kind: "train",
    origin: "東京",
    originCode: "",
    destination: "新大阪",
    destinationCode: "",
    endDay: "2026-12-31",
    endTime: "21:30",
  });
  assert.equal(train.querySelector(".bk-du").textContent, "2時間30分");
  const hotel = {
    ...booking,
    kind: "hotel",
    title: "星の宿",
    detail: "旧市街",
    day: "2026-10-20",
    time: "15:00",
    endDay: "2026-10-23",
    endTime: "11:00",
  };
  const stay = render(hotel, "2026-10-21T13:00", true);
  assert.deepEqual(
    [...stay.querySelectorAll(".bk-t b")].map((node) => node.textContent),
    ["10/20", "10/23"],
  );
  assert.deepEqual(
    [...stay.querySelectorAll(".bk-pl")].map((node) => node.textContent),
    ["チェックイン15:00から", "チェックアウト11:00まで"],
  );
  assert.equal(stay.querySelector(".bk-du").textContent, "3泊 · いま2泊目");
  assert.equal(
    stay.querySelector(".bk-hd span:not(.bk-chip)"),
    null,
    "hotels never show a header date",
  );
  assert.equal(
    stay.querySelector(".bk-hd .bk-chip")?.textContent,
    "滞在中",
    "a stay in progress wears the mock's 滞在中 chip",
  );
  assert.equal(
    render(hotel, "2026-10-01T09:00").querySelector(".bk-du").textContent,
    "3泊",
  );
  const used = render(hotel, "2026-10-23T11:01");
  assert.ok(used.querySelector(".bk-card.used"));
  assert.match(
    used.querySelector(".bk-stamp textPath").textContent,
    /USED · USED · USED · USED/,
  );
  assert.equal(used.querySelector(".bk-stamp .bk-c").textContent, "済");
  assert.equal(
    render({ ...hotel, confirmationCode: "" }).querySelector(".bk-code"),
    null,
  );
});

test("home trip cards: destination lines, countdown and companion icons", async () => {
  const {
    destinationPlaces,
    destinationLines,
    daysUntil,
    UpcomingTripCard,
    PastTripCard,
  } = await bundle("export * from './src/web/home-trips';");
  // 「・」 lives inside one place name; only list separators split.
  assert.deepEqual(destinationPlaces("サンティアゴ・デ・コンポステーラ"), [
    "サンティアゴ・デ・コンポステーラ",
  ]);
  assert.deepEqual(destinationPlaces("シュトゥットガルト、ウィーン"), [
    "シュトゥットガルト",
    "ウィーン",
  ]);
  assert.deepEqual(destinationPlaces("Vienna, Austria / Prague／Brno，Linz"), [
    "Vienna",
    "Austria",
    "Prague",
    "Brno",
    "Linz",
  ]);
  assert.deepEqual(destinationLines("ミラノ、フィレンツェ、ローマ、ナポリ"), [
    { text: "ミラノ" },
    { text: "フィレンツェ", more: "ほか2" },
  ]);
  assert.equal(destinationLines("京都、大阪、神戸").length, 3);
  assert.equal(daysUntil("2026-10-06", "2026-10-19"), 13);
  assert.equal(daysUntil("2026-10-06", "2026-10-04"), -2);

  const { renderToStaticMarkup } = await import("react-dom/server");
  const h = React.createElement;
  const render = (element) =>
    new JSDOM(renderToStaticMarkup(h(MemoryRouter, null, element))).window
      .document;
  const people = ["つ", "み", "け", "さ", "ゆ", "あ"].map((name, index) => ({
    id: `m${index}`,
    name,
    email: "",
    role: "editor",
    avatarUrl: index === 0 ? "data:image/png;base64,AA==" : null,
  }));
  const trip = {
    id: "t1",
    name: "イタリアを南へ縦断",
    destination: "ミラノ、フィレンツェ、ローマ、ナポリ",
    startsOn: "2026-10-19",
    endsOn: "2026-10-23",
    role: "owner",
    memberCount: 6,
  };
  const props = { today: "2026-10-06", onOpen() {}, members: people };
  const next = render(h(UpcomingTripCard, { ...props, trip, nearest: true }));
  const card = next.querySelector("a.home-trip");
  assert.equal(card.getAttribute("href"), "/trips/t1/itinerary");
  assert.equal(
    card.dataset.tripSurface,
    "t1",
    "the trip-open transition finds the card",
  );
  assert.ok(card.classList.contains("no-photo"));
  assert.equal(
    next.querySelector(".home-trip-countdown").textContent,
    "あと13日",
  );
  assert.deepEqual(
    [...next.querySelectorAll(".home-trip-place > span")].map(
      (n) => n.textContent,
    ),
    ["ミラノ", "フィレンツェほか2"],
  );
  assert.equal(
    next.querySelector(".home-trip-place").getAttribute("aria-hidden"),
    "true",
  );
  assert.equal(
    next.querySelector(".home-trip-dates").textContent,
    "10/19 – 10/23",
  );
  const faces = next.querySelector(".home-trip-faces");
  assert.equal(faces.getAttribute("aria-label"), "6人");
  assert.equal(
    faces.querySelectorAll("img").length,
    1,
    "a set icon shows as a picture",
  );
  assert.deepEqual(
    [...faces.children].map((n) => n.textContent),
    ["", "み", "け", "+3"],
  );
  const during = render(
    h(UpcomingTripCard, { ...props, trip, today: "2026-10-20", nearest: true }),
  );
  assert.equal(
    during.querySelector(".home-trip-countdown").textContent,
    "2日目",
  );
  const later = (today) =>
    render(
      h(UpcomingTripCard, { ...props, trip, today, nearest: false }),
    ).querySelector(".home-trip-countdown")?.textContent;
  assert.equal(later("2026-10-06"), "あと13日");
  assert.equal(later("2026-09-03"), "あと1ヶ月半", "later trips count roughly");
  assert.equal(later("2026-08-19"), "あと2ヶ月");
  assert.equal(later("2026-10-20"), undefined);
  const photo = render(
    h(PastTripCard, {
      onOpen() {},
      trip: {
        ...trip,
        startsOn: "2025-12-27",
        coverImage: "data:image/png;base64,AA==",
      },
    }),
  );
  assert.equal(
    photo.querySelector("img[data-trip-cover]").dataset.tripCover,
    "t1",
  );
  assert.equal(photo.querySelector(".home-trip-place"), null);
  assert.equal(photo.querySelector("small").textContent, "2025.12");
});

test("booking import reads streamed rows, flags duplicates and goes through the AI Gateway", async () => {
  const {
    findDuplicateBooking,
    normalizeImportedBooking,
    receiveBookingImport,
    importedBookingInput,
  } = await bundle("export * from './src/data/booking-import';");
  const { startBookingImport, BookingDecoder } = await bundle(
    "export * from './worker/booking-import';",
  );
  const existing = [
    {
      id: "a",
      kind: "flight",
      title: "EK 319",
      day: "2026-10-19",
      time: "22:20",
      originCode: "NRT",
      destinationCode: "DXB",
    },
  ];
  const row = normalizeImportedBooking(
    {
      kind: "flight",
      title: "EK319",
      day: "2026-10-19",
      time: "22:20",
      origin_code: "nrt",
      destination_code: "dxb",
      review_reason: "none",
      source_file: 4,
    },
    2,
  );
  assert.equal(row.originCode, "NRT");
  assert.equal(
    row.source,
    0,
    "an unknown file index falls back to the first file",
  );
  assert.equal(findDuplicateBooking(row, existing)?.id, "a");
  assert.equal(
    findDuplicateBooking({ ...row, title: "EK 128", time: "14:40" }, existing),
    undefined,
  );
  assert.equal(
    normalizeImportedBooking(
      { kind: "ticket", title: "魔笛", day: "10/20", review_reason: "none" },
      1,
    ).review,
    "missing_date",
    "an unreadable date is never guessed",
  );
  assert.equal(
    importedBookingInput({ ...row, party: "34A" }).note,
    "人数・座席：34A",
  );

  const decoder = new BookingDecoder(1);
  const text = JSON.stringify({
    bookings: [
      {
        kind: "hotel",
        title: "宿 {本館}",
        day: "2026-10-20",
        review_reason: "none",
      },
      {
        kind: "ticket",
        title: "魔笛",
        day: "2026-10-20",
        review_reason: "none",
      },
    ],
  });
  const rows = [
    ...decoder.append(text.slice(0, 60)),
    ...decoder.append(text.slice(60)),
  ];
  assert.deepEqual(
    rows.map((entry) => entry.title),
    ["宿 {本館}", "魔笛"],
  );
  decoder.finish();

  const request = (body) =>
    new Request("https://tabi.test/v1/trips/t/booking-import", {
      method: "POST",
      body: JSON.stringify(body),
    });
  const png =
    "data:image/png;base64," +
    Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ]).toString("base64");
  const files = {
    files: [{ name: "a.png", kind: "image", data: png, size: 12 }],
  };
  const trip = { startsOn: "2026-10-19", endsOn: "2026-10-23" };
  let sent;
  const sse = [
    { type: "response.output_text.delta", delta: text.slice(0, 50) },
    { type: "response.output_text.delta", delta: text.slice(50) },
    { type: "response.completed", response: { status: "completed" } },
  ]
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("");
  const AI = {
    run: async (model, input, options) => {
      sent = { model, input, options };
      return new Response(sse, {
        headers: { "content-type": "text/event-stream" },
      });
    },
  };
  const env = { AI, AI_GATEWAY_ID: "kondo" };
  for (const missing of [{}, { AI }, { AI_GATEWAY_ID: "kondo" }])
    assert.equal(
      (await startBookingImport(request(files), missing, trip)).status,
      503,
      "import stays off without the AI binding and gateway",
    );
  assert.equal(
    (
      await startBookingImport(
        request({
          files: [
            {
              name: "a.png",
              kind: "image",
              data: "data:image/png;base64,AAAA",
              size: 3,
            },
          ],
        }),
        env,
        trip,
      )
    ).status,
    400,
  );
  const response = await startBookingImport(request(files), env, trip);
  assert.equal(sent.model, "openai/gpt-6-luna");
  assert.deepEqual(sent.options.gateway, {
    id: "kondo",
    skipCache: true,
    collectLog: false,
  });
  assert.equal(sent.options.returnRawResponse, true);
  const payload = sent.input;
  assert.equal(payload.stream, true);
  assert.equal(payload.store, false);
  assert.equal(payload.text.format.type, "json_schema");
  const received = [];
  await receiveBookingImport(
    response,
    (entry) => received.push(entry.title),
    new AbortController().signal,
    1,
  );
  assert.deepEqual(received, ["宿 {本館}", "魔笛"]);
});
