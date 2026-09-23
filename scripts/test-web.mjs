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

// Safari can pan its visual viewport while the keyboard resizes it. Every
// editor uses the same viewport-sized dialog; its dock must stay inside it.
const keyboardWhileEditing = async () => {
  const dialog = [...document.querySelectorAll("dialog[open]")].at(-1);
  const dock = document.querySelector(".thumb-dock-host");
  const field = dialog.querySelector('input:not([type="checkbox"]), textarea');
  const panel = dialog.querySelector(".modal-inner");
  const header = panel.querySelector(".modal-header");
  const measurePanel = panel.getBoundingClientRect;
  const measureHeader = header.getBoundingClientRect;
  const measureField = field.getBoundingClientRect;
  panel.getBoundingClientRect = () => ({
    top: visualViewport.offsetTop,
    bottom: visualViewport.offsetTop + visualViewport.height - 100,
  });
  header.getBoundingClientRect = () => ({
    bottom: visualViewport.offsetTop + 56,
  });
  field.getBoundingClientRect = () => ({
    top: visualViewport.offsetTop + 380 - panel.scrollTop,
    bottom: visualViewport.offsetTop + 426 - panel.scrollTop,
  });
  await act(async () => field.focus());
  for (const offsetTop of [0, 64, 112]) {
    panel.scrollTop = 0;
    await act(async () => {
      visualViewport.height = 340;
      visualViewport.offsetTop = offsetTop;
      visualViewport.dispatchEvent(new dom.window.Event("resize"));
      visualViewport.dispatchEvent(new dom.window.Event("scroll"));
    });
    assert.equal(
      document.documentElement.style.getPropertyValue("--modal-height"),
      "340px",
    );
    assert.equal(
      document.documentElement.style.getPropertyValue("--modal-top"),
      offsetTop + "px",
    );
    await tick(30);
    assert.equal(
      panel.scrollTop,
      198,
      "viewport resize reveals the focused field above the dock",
    );
    assert.equal(dock.parentElement, dialog);
    assert.ok(dock.querySelector('button[type="submit"]'));
  }
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
    dialog.querySelector('[aria-label="戻る"]'),
    "Back returns after dismissal",
  );
  panel.getBoundingClientRect = measurePanel;
  header.getBoundingClientRect = measureHeader;
  field.getBoundingClientRect = measureField;
  await act(async () => {
    field.blur();
    visualViewport.height = window.innerHeight;
    visualViewport.offsetTop = 0;
    visualViewport.dispatchEvent(new dom.window.Event("resize"));
  });
  assert.equal(
    document.documentElement.style.getPropertyValue("--dock-keyboard-inset"),
    "0px",
  );
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
    const response = await worker.fetch(request, { DB, BUCKET: {} });
    if (!response.ok)
      failures.push({
        url,
        status: response.status,
        error: await response.clone().text(),
      });
    return response;
  };
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
    await fill("予約名", "テストホテル");
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
    await editAndReturn("予約名", "更新したホテル");
    await click(document.querySelector('.context-back [aria-label="戻る"]'));
    await tick(30);
    await click(byText("nav a", "行きたい場所"));
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
    await click(byText("nav a", "準備"));
    await click(document.querySelector('[aria-label="やることを追加"]'));
    assert.equal(
      field("担当").querySelector('option[value=""]').textContent,
      "未指定",
    );
    assert.equal(document.activeElement, document.querySelector("dialog h2"));
    assert.equal(document.querySelector("dialog input[autofocus]"), null);
    assert.equal(
      document.querySelector("dialog").classList.contains("full"),
      true,
    );
    assert.equal(field("期限"), undefined);
    assert.equal(
      byText("label", "期限を設定する").querySelector("input").checked,
      false,
    );
    await keyboardWhileEditing();
    await fill("やること", "チケットを予約");
    await submit();
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM travel_tasks").get().n,
      1,
    );
    const preparationPanel = document.querySelector('[role="tabpanel"]');
    assert.match(document.querySelector(".task-list").textContent, /未指定/);
    preparationPanel.focus();
    await click(
      document.querySelector('[aria-label="チケットを予約の詳細を編集"]'),
    );
    assert.equal(document.activeElement, document.querySelector("dialog h2"));
    assert.equal(
      document.querySelector("dialog").classList.contains("full"),
      true,
    );
    const deadlineToggle = () =>
      byText("label", "期限を設定する").querySelector("input");
    assert.equal(deadlineToggle().checked, false);
    assert.equal(
      db.prepare("SELECT due_on FROM travel_tasks").get().due_on,
      "",
    );
    await click(deadlineToggle());
    assert.equal(field("期限").getAttribute("aria-required"), "true");
    await submit();
    assert.match(
      document.querySelector("dialog .error").textContent,
      /正しい期限/,
    );
    await fill("期限", "2026-11-20");
    await fill("担当", "member:owner");
    await submit();
    assert.equal(
      document
        .querySelector(".task-list .assignee-avatar")
        .getAttribute("aria-label"),
      "テスト",
    );
    assert.doesNotMatch(
      document.querySelector(".task-list .preparation-meta").textContent,
      /テスト|未指定/,
    );
    const avatarImage = document.querySelector(
      ".task-list .assignee-avatar img",
    );
    assert.equal(avatarImage.src, "https://example.test/avatar.png");
    await act(async () =>
      avatarImage.dispatchEvent(new dom.window.Event("error")),
    );
    assert.equal(
      document.querySelector(".task-list .assignee-avatar img"),
      null,
    );
    assert.equal(
      document.querySelector(".task-list .assignee-avatar").textContent,
      "テ",
    );
    assert.equal(
      db.prepare("SELECT due_on FROM travel_tasks").get().due_on,
      "2026-11-20",
    );
    await click(
      document.querySelector('[aria-label="チケットを予約の詳細を編集"]'),
    );
    assert.equal(deadlineToggle().checked, true);
    assert.equal(field("期限").dataset.dateValue, "2026-11-20");
    await click(deadlineToggle());
    assert.equal(field("期限"), undefined);
    await click(deadlineToggle());
    assert.equal(
      field("期限").dataset.dateValue,
      "2026-11-20",
      "temporary toggle keeps the draft date",
    );
    await click(deadlineToggle());
    await submit();
    assert.equal(
      db.prepare("SELECT due_on FROM travel_tasks").get().due_on,
      "",
    );
    await click(
      document.querySelector('[aria-label="チケットを予約の詳細を編集"]'),
    );
    assert.equal(deadlineToggle().checked, false);
    assert.equal(field("期限"), undefined);
    await click(document.querySelector('.context-back [aria-label="戻る"]'));
    await tick(30);
    assert.equal(document.querySelector("dialog"), null);
    assert.notEqual(document.activeElement, preparationPanel);
    assert.equal(
      document.querySelector('.task-list [aria-label*="削除"]'),
      null,
    );
    await click(
      document.querySelector('[aria-label="チケットを予約の詳細を編集"]'),
    );
    const taskDelete = document.querySelector(
      '.context-actions [aria-label="やることを削除"]',
    );
    assert.ok(
      taskDelete,
      "delete sits to the right of save in the task editor",
    );
    assert.ok(document.querySelector('.context-primary button[type="submit"]'));
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
    await click(document.querySelector('[role="tab"][aria-label="持ち物"]'));
    assert.doesNotMatch(
      document.querySelector(".filter-strip").textContent,
      /未指定/,
    );
    await click(document.querySelector('[aria-label="持ち物を追加"]'));
    assert.equal(
      field("担当").querySelector('option[value=""]').textContent,
      "共用",
    );
    await fill("持ち物", "充電器");
    await submit();
    assert.match(
      document.querySelector(".task-list .preparation-meta").textContent,
      /共用/,
    );
    assert.doesNotMatch(
      document.querySelector(".task-list .preparation-meta").textContent,
      /未指定/,
    );
    assert.equal(
      db.prepare("SELECT shared FROM packing_details").get().shared,
      1,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM packing_items").get().n,
      1,
    );
    await click(byText("nav a", "メモ"));
    await click(document.querySelector('[aria-label="メモを書く"]'));
    assert.equal(document.activeElement, document.querySelector("dialog h2"));
    const textarea = document.querySelector('[aria-label="メモ本文"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLTextAreaElement.prototype,
        "value",
      ).set.call(textarea, "旅のメモ\n- [ ] お土産");
      textarea.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    await tick(550);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM travel_notes").get().n,
      1,
    );
    await click(byText(".context-primary button", "保存する"));
    await tick();
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
    let updateFails = false;
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration: async () => ({
          waiting: null,
          update: async () => {
            if (updateFails) throw new Error("offline");
          },
        }),
      },
    });
    await click(byText("dialog button", "更新を確認"));
    const updateStatus = document.querySelector(".pwa-update-status");
    assert.match(updateStatus.textContent, /更新を確認しました/);
    assert.equal(
      updateStatus.previousElementSibling,
      byText("dialog button", "更新を確認"),
      "confirmation stays in document flow below its button",
    );
    assert.ok(
      !document
        .querySelector(".toast")
        .textContent.includes("更新を確認しました"),
    );
    updateFails = true;
    await click(byText("dialog button", "更新を確認"));
    assert.match(updateStatus.textContent, /更新を確認できませんでした/);
    assert.equal(
      byText("dialog button", "更新を確認").disabled,
      false,
      "failed checks can be retried",
    );
    delete navigator.serviceWorker;
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

    await click(
      document.querySelector('.trip-heading [aria-label="旅行一覧へ戻る"]'),
    );
    assert.equal(
      document.querySelector(".context-primary").textContent,
      "旅行を作成",
    );
    assert.equal(document.querySelector(".context-back"), null);
    await click(document.querySelector('.context-actions [aria-label="設定"]'));
    assert.equal(document.querySelectorAll(".context-island").length, 1);
    await click(document.querySelector('.context-back [aria-label="戻る"]'));
    await tick(30);
    await click(byText(".context-primary button", "旅行を作成"));
    assert.equal(
      document.querySelector('.context-primary button[type="submit"]').form,
      document.querySelector("dialog form"),
    );
    await click(document.querySelector('.context-back [aria-label="戻る"]'));
    await tick(30);
  } finally {
    await act(async () => root.unmount());
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

test("journeys join endpoints without moving intervening events; stays do not interrupt flights", async () => {
  const { dayTimeline, staysOnDay, JourneyPair, StayCards } = await bundle(
    "export * from './src/web/itinerary-bookings';",
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
  assert.equal(
    joined.length,
    1,
    "a check-in while flying belongs in the stay band",
  );
  assert.equal(joined[0].joinedArrival, true);
  const event = { id: "event", day, time: "16:00", title: "別の予定" };
  const split = dayTimeline(timelineEntries([event], bookings), day);
  assert.deepEqual(
    split.map((entry) => entry.key),
    ["booking-flight-start", "item-event", "booking-flight-end"],
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
    React.createElement(StayCards, {
      bookings: [{ ...hotel, time: "", endTime: "" }],
      day: "2026-11-25",
      onOpen() {},
    }),
  );
  assert.match(untimed, /チェックアウト日/);
  assert.match(untimed, /時刻未定/);
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
