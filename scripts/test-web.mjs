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
  [...document.querySelectorAll("dialog .field")]
    .find((node) => node.querySelector("span")?.textContent === label)
    ?.querySelector("input,select,textarea,.date-trigger");
const fill = async (label, value) => {
  const input = field(label);
  assert.ok(input, `field ${label} exists`);
  if (input.matches(".date-trigger")) {
    await click(input);
    const selection = typeof value === "string" ? { start: value } : value;
    const chooseDate = async (date) => {
      const yearSelect = document.querySelector(
        'dialog:last-of-type [aria-label="年を選択"]',
      );
      await act(async () => {
        yearSelect.value = String(Number(date.slice(0, 4)));
        yearSelect.dispatchEvent(
          new dom.window.Event("change", { bubbles: true }),
        );
      });
      const first = document.querySelector("dialog:last-of-type [data-date]");
      const difference =
        Number(date.slice(5, 7)) - Number(first.dataset.date.slice(5, 7));
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
      await click(
        document.querySelector("dialog:last-of-type .calendar-summary button"),
      );
      await chooseDate(selection.start);
    }
    if (selection.end) await chooseDate(selection.end);
    if (selection.time !== undefined) {
      const time = document.querySelector(
        'dialog:last-of-type input[type="time"]',
      );
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          dom.window.HTMLInputElement.prototype,
          "value",
        ).set.call(time, selection.time);
        time.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      });
    }
    assert.equal(byText(".context-primary button", "決定").disabled, false);
    await click(byText(".context-primary button", "決定"));
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
  const save = dock.querySelector('.context-primary button[type="submit"]');
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
const keyboardWhileEditing = async () => {
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
    dialog.querySelector('[aria-label="戻る"], .context-back-label'),
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
    await keyboardWhileEditing();
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
      dialog.querySelector(".context-primary a").textContent,
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
    const emptyDay = document.querySelector("#day-2026-11-24 .timeline-empty");
    assert.ok(emptyDay && !emptyDay.disabled);
    await click(emptyDay);
    assert.match(field("開始").textContent, /2026年11月24日/);
    await click(document.querySelector('.context-back [aria-label="戻る"]'));
    await tick(30);
    await click(document.querySelector('[aria-label="予定を追加"]'));
    await fill("タイトル", "市内を歩く");
    await fill("開始", { time: "14:00" });
    await fill("終了", { start: trip.startsOn, time: "15:00" });
    await submit();
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM itinerary_items").get().n,
      2,
      "end time supplies same-day end date",
    );
    await click(
      [...document.querySelectorAll(".timeline-entry")].find((entry) =>
        entry.textContent.includes("市内を歩く"),
      ),
    );
    assert.ok(
      document.querySelector('.context-actions [aria-label="予定を削除"]'),
    );
    await editAndReturn("タイトル", "市内を散策");
    assert.equal(document.querySelector(".context-primary").textContent, "");
    assert.equal(document.querySelector(".thumb-dock-host .safari-tabs"), null);
    await click(document.querySelector('.context-back [aria-label="戻る"]'));
    await tick(30);
    await click(byText("nav a", "予約"));
    await click(document.querySelector('[aria-label="予約を追加"]'));
    await fill("種類", "hotel");
    await fill("宿泊施設名", "テストホテル");
    const hotelUrl =
      "https://links.h6.hilton.com/f/a/" +
      "long-link-".repeat(30) +
      "?reservation=private";
    await fill("予約内容", hotelUrl);
    await fill("住所・Google MapsのURL", hotelUrl);
    await fill("宿泊期間", { start: trip.startsOn, end: "2026-11-25" });
    await submit();
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings").get().n, 1);
    await click(document.querySelector(".booking-ticket"));
    const hotelLink = document.querySelector("dialog .reference-link");
    assert.equal(hotelLink.href, hotelUrl);
    assert.match(hotelLink.textContent, /サイトを開く/);
    assert.equal(
      hotelLink.querySelector("small").textContent,
      "links.h6.hilton.com",
    );
    assert.doesNotMatch(
      document.querySelector("dialog").textContent,
      /long-link-|reservation=private|Google Mapsで開く/,
    );
    assert.equal(document.querySelector(".thumb-dock-host .safari-tabs"), null);
    assert.equal(
      document.querySelectorAll(".context-actions button").length,
      2,
    );
    assert.ok(
      document.querySelector('.context-actions [aria-label="予約を削除"]'),
    );
    await editAndReturn("宿泊施設名", "更新したホテル");
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
    await click([...document.querySelectorAll(".place-card-main")][0]);
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
    assert.equal(document.querySelector(".thumb-dock-host .safari-tabs"), null);
    const placeDetail = document.querySelector("dialog[open]");
    await click(byText(".context-primary button", "しおりへ追加"));
    assert.equal(document.querySelectorAll("dialog[open]").length, 2);
    await fill("開始", { time: "16:00" });
    await submit();
    assert.equal(document.querySelector("dialog[open]"), placeDetail);
    assert.match(document.querySelector("dialog").textContent, /しおりを見る/);
    const link = db.prepare("SELECT item_id FROM place_itinerary_links").get();
    assert.ok(link.item_id);
    assert.equal(
      document.querySelector(".detail-visit .booking-time-clock").textContent,
      "16:00",
    );
    assert.equal(
      document.querySelector(".context-primary").textContent,
      "しおりを見る",
    );
    globalThis.confirm = () => false;
    await click(
      document.querySelector('.context-actions [aria-label="場所を削除"]'),
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM places").get().n,
      1,
      "cancelled deletion preserves the place",
    );
    globalThis.confirm = () => true;
    await click(document.querySelector('.context-actions [aria-label="編集"]'));
    assert.ok(document.querySelector('.context-primary button[type="submit"]'));
    assert.equal(
      field("予約状況").value,
      "needed",
      "existing reservation status remains visible",
    );
    assert.equal(field("URL").value, "https://example.com/museum");
    await click(document.querySelector('.context-back [aria-label="戻る"]'));
    await tick(30);
    assert.equal(
      document.querySelector(".context-primary").textContent,
      "しおりを見る",
    );
    await click(document.querySelector('.context-back [aria-label="戻る"]'));
    await tick(200);
    // やること and 持ち物 are separate icon-only dock pages.
    const dockTab = (label) =>
      document.querySelector(
        `.thumb-dock-host .safari-tabs a[aria-label="${label}"]`,
      );
    assert.deepEqual(
      [...document.querySelectorAll(".thumb-dock-host .safari-tabs a")].map(
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
      const save = dock.querySelector('.context-primary button[type="submit"]');
      assert.equal(save?.textContent, primary);
      assert.equal(save.form, document.querySelector("dialog form"));
      assert.equal(
        dock.querySelector(".context-back .context-back-label")?.textContent,
        "やめる",
      );
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
      document.querySelector(".prep-top h2").textContent,
      "やること",
    );
    assert.equal(
      document.querySelector('[data-ring="owner"] b').textContent,
      "あなた",
    );
    assert.equal(ringCount(), "あと0");
    await click(
      document.querySelector('.prep-top [aria-label="やることを追加"]'),
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
    if (document.querySelector(`[data-day="${before}"]`))
      assert.equal(
        document.querySelector(`[data-day="${before}"]`).disabled,
        true,
        "past days cannot be a deadline",
      );
    assert.equal(
      document.querySelector('.prep-cal [aria-label="前の月"]').disabled,
      true,
    );
    while (!document.querySelector(`[data-day="${due}"]`))
      await click(document.querySelector('.prep-cal [aria-label="次の月"]'));
    await click(document.querySelector(`[data-day="${due}"]`));
    assert.equal(
      document
        .querySelector(`[data-day="${due}"]`)
        .getAttribute("aria-pressed"),
      "true",
    );
    assert.match(
      document.querySelector(".prep-label").textContent,
      new RegExp(`期限 · ${+due.slice(5, 7)}/${+due.slice(8)}（`),
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
    await click(document.querySelector('[aria-label="チケットを予約を直す"]'));
    assert.equal(
      document.querySelector("dialog h2").textContent,
      "やることを直す",
    );
    await click(document.querySelector(".prep-cal-none"));
    assert.equal(
      document.querySelector(".prep-label").textContent,
      "期限 · 期限なし",
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
    await click(document.querySelector('[aria-label="チケットを予約を直す"]'));
    const taskDelete = document.querySelector(
      '.context-actions [aria-label="やることを削除"]',
    );
    assert.ok(
      taskDelete,
      "delete sits to the right of save in the task editor",
    );
    globalThis.confirm = () => false;
    await click(taskDelete);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM travel_tasks").get().n,
      1,
    );
    globalThis.confirm = () => true;
    await click(taskDelete);
    await tick(30);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM travel_tasks").get().n,
      0,
    );
    assert.equal(document.querySelector("dialog"), null);

    await click(dockTab("持ち物"));
    assert.equal(document.querySelector(".prep-top h2").textContent, "持ち物");
    const addPacking = async (name, kind) => {
      await click(
        document.querySelector('.prep-top [aria-label="持ち物を追加"]'),
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
    await click(byText(`[data-item="${medicine}"] button`, "私が持つ"));
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
    await click(document.querySelector('[aria-label="充電器を直す"]'));
    assert.equal(
      document.querySelector("dialog h2").textContent,
      "持ち物を直す",
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
    await click(document.querySelector('[aria-label="メモを書く"]'));
    await tick(550);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM travel_notes").get().n,
      0,
      "opening an empty note does not save it",
    );
    await click(byText(".context-primary button", "完了"));
    await click(document.querySelector('[aria-label="メモを書く"]'));
    assert.equal(document.activeElement, document.querySelector("dialog h2"));
    assert.equal(document.querySelector('[aria-label="ピン留め"]'), null);
    const title = document.querySelector('[aria-label="メモのタイトル"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        "value",
      ).set.call(title, "旅先の買い物");
      title.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    const textarea = document.querySelector('textarea[aria-label="メモ本文"]');
    assert.equal(textarea.placeholder, "メモを入力...");
    assert.equal(document.querySelector('[aria-label="本文の書式"]'), null);
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLTextAreaElement.prototype,
        "value",
      ).set.call(textarea, "お土産\n待ち合わせ場所");
      textarea.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await tick(550);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM travel_notes").get().n,
      1,
    );
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
      "お土産\n待ち合わせ場所",
    );
    await click(byText(".context-primary button", "完了"));
    await tick();
    assert.match(
      document.querySelector(".note-card").textContent,
      /旅先の買い物/,
    );
    await click(document.querySelector(".note-card"));
    assert.equal(
      document.querySelector('textarea[aria-label="メモ本文"]').value,
      "お土産\n待ち合わせ場所",
    );
    await click(byText(".context-primary button", "完了"));
    await tick();
    await click(document.querySelector('[aria-label="メモを書く"]'));
    const temporaryTitle = document.querySelector(
      '[aria-label="メモのタイトル"]',
    );
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        "value",
      ).set.call(temporaryTitle, "削除するメモ");
      temporaryTitle.dispatchEvent(
        new dom.window.Event("input", { bubbles: true }),
      );
    });
    await click(document.querySelector('[aria-label="メモを削除"]'));
    await tick(550);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM travel_notes").get().n,
      1,
      "deleting a pending draft cancels its autosave",
    );
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
      document.querySelector(".thumb-dock-host .safari-tabs"),
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
      /アップデートされました\s*kondo 2026\.10\.7\.1432\s*新しくする/,
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
    assert.equal(field("予約名"), undefined);
    assert.equal(field("出発空港（IATA）"), undefined);
    await fill("出発地", "成田");
    await click(document.querySelector('[role="option"]'));
    assert.equal(field("出発地").value, "成田国際空港");
    assert.equal(document.querySelector(".airport-code").textContent, "NRT");
    await fill("出発地", "羽田");
    assert.equal(
      document.querySelector(".airport-code"),
      null,
      "editing clears the previously selected code",
    );
    await fill("出発地", "nrt");
    await act(async () =>
      field("出発地").dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
        }),
      ),
    );
    await act(async () =>
      field("出発地").dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    await fill("到着地", "kix");
    await click(document.querySelector('[role="option"]'));
    await fill("航空会社・補足（任意）", "Jetstar Japan");
    await fill("予約番号", "JM6EQC");
    await submit();
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
      [...document.querySelectorAll(".booking-ticket")].find((entry) =>
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
    // Home keeps settings (left) and create (right) in the dock only.
    assert.equal(
      document.querySelector(".context-actions .home-create").textContent,
      "旅行を作成",
    );
    assert.equal(
      document.querySelector(".context-primary.context-island"),
      null,
    );
    await click(document.querySelector('.context-back [aria-label="設定"]'));
    assert.equal(document.querySelectorAll(".context-island").length, 1);
    await click(document.querySelector('.context-back [aria-label="戻る"]'));
    await tick(30);
    await click(byText(".context-actions button", "旅行を作成"));
    assert.equal(
      document.querySelector('.context-primary button[type="submit"]').form,
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
  const { dayTimeline, staysOnDay, JourneyPair, StayCards, StayCard } =
    await bundle("export * from './src/web/itinerary-bookings';");
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
  const pair = renderToStaticMarkup(
    React.createElement(JourneyPair, { booking: flight, arrival: false }),
  );
  assert.match(pair, /14:00/);
  assert.match(pair, /18:00/);
  assert.match(pair, /現地時刻/);
  const arrival = renderToStaticMarkup(
    React.createElement(JourneyPair, { booking: flight, arrival: true }),
  );
  assert.match(arrival, /DXB/);
  assert.match(arrival, /VIE/);
  const stay = renderToStaticMarkup(
    React.createElement(StayCards, {
      bookings,
      day: "2026-11-23",
      onOpen() {},
    }),
  );
  assert.match(stay, /連泊/);
  assert.match(stay, /15:00〜/);
  assert.match(stay, /〜11:00/);
  const untimed = renderToStaticMarkup(
    React.createElement(StayCard, {
      booking: { ...hotel, time: "", endTime: "" },
      endpoint: "end",
      onOpen() {},
    }),
  );
  assert.match(untimed, /チェックアウト/);
  assert.match(untimed, /時刻未定/);
  const checkoutMarker = new JSDOM(untimed).window.document.querySelector(
    ".timeline-marker",
  );
  assert.equal(checkoutMarker.dataset.endpoint, "end");
  assert.equal(checkoutMarker.querySelectorAll("svg").length, 1);
  for (const boundary of [hotel.day, hotel.endDay]) {
    assert.equal(
      renderToStaticMarkup(
        React.createElement(StayCards, {
          bookings,
          day: boundary,
          onOpen() {},
        }),
      ),
      "",
      "check-in/out are not duplicated in the stay band",
    );
  }
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

test("compact reservation tickets retain airport names and both dates", async () => {
  const { BookingTicketContent } = await bundle(
    "export { BookingTicketContent } from './src/web/booking-ticket';",
  );
  const { renderToStaticMarkup } = await import("react-dom/server");
  const booking = {
    kind: "flight",
    title: "GK211",
    origin: "",
    originCode: "NRT",
    destination: "",
    destinationCode: "KIX",
    day: "2026-12-31",
    time: "19:00",
    endDay: "2027-01-01",
    endTime: "01:00",
    confirmationCode: "JM6EQC",
  };
  const render = (value) =>
    new JSDOM(
      renderToStaticMarkup(
        React.createElement(BookingTicketContent, { booking: value }),
      ),
    ).window.document;
  const flight = render(booking);
  assert.deepEqual(
    [...flight.querySelectorAll(".ticket-place strong")].map(
      (node) => node.textContent,
    ),
    ["NRT", "KIX"],
  );
  assert.deepEqual(
    [...flight.querySelectorAll(".ticket-place span")].map(
      (node) => node.textContent,
    ),
    ["成田国際空港", "関西国際空港"],
  );
  assert.equal(flight.querySelector(".ticket-service").textContent, "GK211");
  assert.equal(
    flight.querySelector(".ticket-reference strong").textContent,
    "JM6EQC",
  );
  assert.match(
    flight.querySelector(".ticket-schedule").textContent,
    /12\/31.*19:00.*2027\/1\/1.*01:00/,
  );
  const hotel = render({
    ...booking,
    kind: "hotel",
    title: "星の宿",
    time: "22:30",
    endTime: "11:00",
  });
  assert.equal(hotel.querySelector(".ticket-title").textContent, "星の宿");
  assert.equal(hotel.querySelector(".ticket-route"), null);
  assert.match(
    hotel.querySelector(".ticket-schedule").textContent,
    /チェックイン.*22:30〜.*チェックアウト.*〜11:00/,
  );
  assert.equal(
    render({
      ...booking,
      kind: "hotel",
      time: "",
      endTime: "",
      confirmationCode: "",
    }).querySelector(".ticket-reference"),
    null,
  );
  assert.deepEqual(
    [
      ...render({
        ...booking,
        kind: "hotel",
        time: "",
        endTime: "",
      }).querySelectorAll("time"),
    ].map((node) => node.textContent),
    ["時刻未定", "時刻未定"],
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
  const later = render(h(UpcomingTripCard, { ...props, trip, nearest: false }));
  assert.equal(later.querySelector(".home-trip-countdown"), null);
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
