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
  [...document.querySelectorAll("dialog label.field")]
    .find((node) => node.querySelector("span")?.textContent === label)
    ?.querySelector("input,select,textarea");
const fill = async (label, value) => {
  const input = field(label);
  assert.ok(input, `field ${label} exists`);
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
  await act(async () =>
    document
      .querySelector("dialog form")
      .dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      ),
  );
  await tick(30);
};

test("legacy account cache and pending changes survive React migration; real forms sync through Hono", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec(await readFile("worker/schema.sql", "utf8"));
  db.prepare("INSERT INTO users(id,email,display_name) VALUES (?,?,?)").run(
    "owner",
    "test@example.test",
    "テスト",
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
          { initialEntries: [`/trips/${trip.id}/itinerary`] },
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
    assert.match(document.body.textContent, /圏外で追加した予定/);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM itinerary_items").get().n,
      1,
    );
    assert.equal((await loadTravelCache("owner")).pending.length, 0);
    assert.equal(localStorage.getItem("tabi.session"), "test-session");
    assert.equal(sessionStorage.getItem("tabi.session"), null);
    await click(document.querySelector('[aria-label="予定を追加"]'));
    await fill("タイトル", "市内を歩く");
    await fill("開始時刻", "14:00");
    await fill("終了時刻", "15:00");
    await submit();
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM itinerary_items").get().n,
      2,
      "end time supplies same-day end date",
    );
    await click(byText("nav a", "予約"));
    await click(document.querySelector('[aria-label="予約を追加"]'));
    await fill("種類", "hotel");
    await fill("予約名", "テストホテル");
    await fill("チェックイン日", trip.startsOn);
    await fill("チェックアウト日", "2026-11-25");
    await submit();
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings").get().n, 1);
    await click(byText("nav a", "行きたい場所"));
    await click(document.querySelector('[aria-label="場所を追加"]'));
    await fill("場所の名前", "美術館");
    await submit();
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM places").get().n, 1);
    await click([...document.querySelectorAll(".place-card")][0]);
    await click(byText("dialog button", "しおりへ追加"));
    await fill("開始時刻", "16:00");
    await submit();
    assert.match(document.querySelector("dialog").textContent, /しおりを見る/);
    const link = db.prepare("SELECT item_id FROM place_itinerary_links").get();
    assert.ok(link.item_id);
    await click(document.querySelector('dialog [aria-label="閉じる"]'));
    await tick(200);
    await click(byText("nav a", "準備"));
    await click(document.querySelector('[aria-label="やることを追加"]'));
    await fill("やること", "チケットを予約");
    await submit();
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM travel_tasks").get().n,
      1,
    );
    await click(document.querySelector('[role="tab"][aria-label="持ち物"]'));
    await click(document.querySelector('[aria-label="持ち物を追加"]'));
    await fill("持ち物", "充電器");
    await submit();
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM packing_items").get().n,
      1,
    );
    await click(byText("nav a", "メモ"));
    await click(document.querySelector('[aria-label="メモを書く"]'));
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
    await click(byText("dialog button", "完了"));
    await tick();
    assert.deepEqual(
      failures,
      [],
      "all emitted form payloads are accepted by the existing API",
    );
    assert.equal((await loadTravelCache("owner")).pending.length, 0);
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
