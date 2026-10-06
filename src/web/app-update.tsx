import {
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { anim, RM, spring } from "./cartoon";
import { useToast } from "./ui";

// The app checks for a new service worker on its own (on open, when it comes
// back to the foreground and periodically). A waiting worker is never applied
// without the user's tap, so open forms are not reloaded underneath them.

type UpdateState = { waiting: ServiceWorker | null; version: string };
let state: UpdateState = { waiting: null, version: "" };
const listeners = new Set<() => void>();
const publish = (next: UpdateState) => {
  state = next;
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const useAppUpdate = () => useSyncExternalStore(subscribe, () => state);

// Read lazily: some test bundles load this module without Vite's env.
export const appVersion = () => import.meta.env.VITE_APP_VERSION;
/** The waiting build's name; an older worker that cannot say is just "new". */
export const updateLabel = (version: string) =>
  version && version !== appVersion() ? version : "新しいバージョン";

/** Shows the notice without a real worker: for screenshots in development. */
export function previewUpdate(version: string) {
  if (!import.meta.env.DEV) return;
  publish({
    waiting: { postMessage() {} } as unknown as ServiceWorker,
    version,
  });
}

const CHECK_INTERVAL = 30 * 60 * 1000;
const UPDATED_KEY = "kondo.updated";

/** Older workers never answer, so the question gives up quickly. */
function askVersion(worker: ServiceWorker) {
  return new Promise<string>((resolve) => {
    if (typeof MessageChannel !== "function") return resolve("");
    const channel = new MessageChannel();
    const finish = (version: unknown) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(typeof version === "string" ? version : "");
    };
    const timer = setTimeout(() => finish(""), 1500);
    channel.port1.onmessage = (event: MessageEvent) =>
      finish((event.data as { version?: unknown } | null)?.version);
    try {
      worker.postMessage({ type: "GET_VERSION" }, [channel.port2]);
    } catch {
      finish("");
    }
  });
}

async function track(registration?: ServiceWorkerRegistration | null) {
  const waiting = registration?.waiting ?? null;
  if (waiting === state.waiting) return;
  if (!waiting) return publish({ waiting: null, version: "" });
  const version = await askVersion(waiting);
  if (registration?.waiting === waiting) publish({ waiting, version });
}

/** Registers the worker (production only) and keeps looking for updates. */
export function startUpdateChecks() {
  if (!("serviceWorker" in navigator)) return;
  const container = navigator.serviceWorker;
  let registration: ServiceWorkerRegistration | undefined;
  let stopped = false;
  const watch = (next?: ServiceWorkerRegistration | null) => {
    if (!next || next === registration || stopped) return;
    registration = next;
    next.addEventListener?.("updatefound", () => {
      const worker = next.installing;
      worker?.addEventListener("statechange", () => void track(next));
    });
  };
  const check = async () => {
    if (stopped || document.visibilityState !== "visible") return;
    try {
      watch(registration ?? (await container.getRegistration()));
      await track(registration);
      await registration?.update();
      await track(registration);
    } catch {
      /* Offline or blocked: the next check tries again. */
    }
  };
  const settle = () => void track(registration);
  const ready = import.meta.env.PROD
    ? container
        .register("/sw.js", { updateViaCache: "none" })
        .then(watch)
        .catch(() => undefined)
    : Promise.resolve();
  void ready.then(check);
  const timer = setInterval(check, CHECK_INTERVAL);
  document.addEventListener("visibilitychange", check);
  container.addEventListener?.("controllerchange", settle);
  return () => {
    stopped = true;
    clearInterval(timer);
    document.removeEventListener("visibilitychange", check);
    container.removeEventListener?.("controllerchange", settle);
  };
}

/** Hands control to the waiting worker; the page reloads once it takes over. */
export function applyUpdate() {
  const worker = state.waiting;
  if (!worker) return;
  try {
    sessionStorage.setItem(UPDATED_KEY, "1");
  } catch {
    /* The toast after the reload is a nicety only. */
  }
  navigator.serviceWorker.addEventListener(
    "controllerchange",
    () => location.reload(),
    { once: true },
  );
  worker.postMessage({ type: "ACTIVATE_UPDATE" });
}

// Updating reloads the page, so it waits until local changes have been sent.
let pendingChanges = 0;

/** Tells the notice about unsynced changes, and toasts once after an update's reload. */
export function useUpdateGuard(ready: boolean, pendingCount: number) {
  const notify = useToast();
  useEffect(() => {
    pendingChanges = pendingCount;
  }, [pendingCount]);
  useEffect(() => {
    if (!ready) return;
    let updated = false;
    try {
      updated = sessionStorage.getItem(UPDATED_KEY) === "1";
      sessionStorage.removeItem(UPDATED_KEY);
    } catch {
      return;
    }
    if (updated) notify(`アップデートしました · ${appVersion()}`);
  }, [ready, notify]);
}

/** Floats above the dock on every screen while a new version is waiting. */
export function UpdateNotice() {
  const { waiting, version } = useAppUpdate();
  const notify = useToast();
  const pill = useRef<HTMLButtonElement>(null);
  // Arrives like the mock's blocks: lands and flattens a little.
  useLayoutEffect(() => {
    if (!waiting || !pill.current || RM()) return;
    void anim(
      pill.current,
      [
        { transform: "translateY(18px) scale(.9,1.12)", opacity: 0 },
        { transform: "translateY(0) scale(.92,1.1)", opacity: 1, offset: 0.42 },
        { transform: "translateY(0) scale(1.06,.9)", offset: 0.6 },
        { transform: "translateY(-2px) scale(.99,1.02)", offset: 0.8 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 460, easing: "cubic-bezier(.4,0,.6,1)" },
    );
  }, [waiting]);
  useLayoutEffect(() => {
    if (!waiting) return;
    // Pages and sheets add room underneath so the pill never hides content.
    const root = document.documentElement;
    root.dataset.appUpdate = "waiting";
    return () => {
      delete root.dataset.appUpdate;
    };
  }, [waiting]);
  if (!waiting) return null;
  const label = updateLabel(version);
  return (
    <button
      type="button"
      ref={pill}
      className="update-notice"
      aria-label={`アップデートされました。kondo ${label}。更新する`}
      onClick={async (event) => {
        if (pendingChanges) {
          notify("未同期の変更を送信してから新しくできます");
          return;
        }
        // kondo-settings.html: the pill squishes, the screen blurs away, then
        // the new version takes over (and toasts after the reload).
        await spring(
          event.currentTarget,
          [{ transform: "scale(.94)" }, { transform: "none" }],
          "squish",
        );
        const screens = [
          ...document.querySelectorAll<HTMLElement>(
            "#main-content, dialog[open] .modal-inner",
          ),
        ];
        await Promise.all(
          screens.map((screen) =>
            anim(
              screen,
              [
                { opacity: 1, filter: "blur(0)" },
                { opacity: 0, filter: "blur(6px)" },
              ],
              { duration: 260, fill: "forwards" },
            ),
          ),
        );
        applyUpdate();
      }}
    >
      <span className="update-notice-spark" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path
            d="M12 3l2 6.2L20 12l-6 2.8L12 21l-2-6.2L4 12l6-2.8z"
            fill="currentColor"
          />
        </svg>
      </span>
      <span className="update-notice-text" aria-hidden="true">
        <b>アップデートされました</b>
        <small>kondo {label}</small>
      </span>
      <span className="update-notice-action" aria-hidden="true">
        更新する
      </span>
    </button>
  );
}
