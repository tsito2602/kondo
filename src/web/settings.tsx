import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { type Location, useLocation, useNavigate } from "react-router";
import { useAuth } from "@/auth/auth-provider";
import { useTravel } from "@/data/travel-provider";
import type { Trip } from "@/data/types";
import { localDate } from "@/utils/dates";
import { appVersion, updateLabel, useAppUpdate } from "./app-update";
import { RM, spring } from "./cartoon";
import { jellyScroll } from "./jelly-scroll";
import { Modal, useAction, useTheme, useToast } from "./ui";

/** A trip's entry stamp: a latin place becomes a 3-letter code, others keep their first word. */
export function stampLabel(trip: Pick<Trip, "destination" | "name">) {
  const word =
    (trip.destination || trip.name)
      .trim()
      .split(/[\s,、，・/]+/)
      .find(Boolean) ?? "";
  const latin = word.normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/^[A-Za-z]/.test(latin))
    return latin
      .replace(/[^A-Za-z]/g, "")
      .slice(0, 3)
      .toUpperCase();
  return [...word].slice(0, 4).join("");
}

/** The logo hops and its dotted route runs, like the launch. */
function FooterLogo() {
  const mark = useRef<SVGSVGElement>(null);
  const route = useRef<SVGPathElement>(null);
  return (
    <footer className="settings-foot">
      <button
        type="button"
        aria-label="kondo"
        onClick={() => {
          if (RM() || !mark.current) return;
          void spring(
            mark.current,
            [
              { transform: "translateY(0)" },
              {
                transform: "translateY(-26px) scale(.92,1.08)",
                offset: 0.4,
              },
              { transform: "translateY(0) scale(1.12,.86)", offset: 0.75 },
              { transform: "none" },
            ],
            "boing",
          );
          route.current?.animate(
            [{ strokeDashoffset: 0 }, { strokeDashoffset: -137 }],
            { duration: 900, easing: "cubic-bezier(.3,0,.2,1)" },
          );
        }}
      >
        <svg
          ref={mark}
          className="settings-logo"
          viewBox="180 200 400 340"
          aria-hidden="true"
        >
          <g fill="none" stroke="currentColor" strokeLinecap="round">
            <path
              d="M393 395C478 385 555 366 618 374C664 380 654 416 615 447"
              strokeWidth="34"
              transform="translate(-180 -150)"
            />
            <path
              ref={route}
              d="M445 553C417 577 408 598 423 616C449 653 548 647 640 616"
              strokeDasharray="27.1676 41.5061"
              strokeWidth="26"
              transform="translate(-180 -150)"
            />
          </g>
          <path
            transform="translate(-180 -150)"
            d="M705 528C682 528 665 545 665 567C665 588 683 612 705 637C727 612 745 588 745 567C745 545 728 528 705 528ZM719 567A14 14 0 1 0 691 567A14 14 0 1 0 719 567Z"
            fill="currentColor"
            fillRule="evenodd"
          />
          <circle
            transform="translate(-180 -150)"
            cx="393"
            cy="395"
            r="32"
            fill="currentColor"
          />
        </svg>
      </button>
      <b>kondo</b>
    </footer>
  );
}

/** Name autosaves while typing; the page itself is the account's passport. */
function Passport() {
  const auth = useAuth();
  const travel = useTravel();
  const notify = useToast();
  const nameId = useId();
  const [name, setName] = useState(auth.user?.name ?? "");
  const saved = useRef(auth.user?.name ?? "");
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const update = useRef(auth.updateProfile);
  update.current = auth.updateProfile;
  const save = () => {
    clearTimeout(timer.current);
    const next = pending.current?.trim();
    pending.current = null;
    if (!next || next.length > 100 || next === saved.current) return;
    saved.current = next;
    void update
      .current(next)
      .then(() => notify("表示名を保存しました"))
      .catch((cause: unknown) => {
        saved.current = "";
        notify(
          cause instanceof Error
            ? cause.message
            : "表示名を保存できませんでした",
        );
      });
  };
  const saveRef = useRef(save);
  saveRef.current = save;
  // Leaving settings mid-typing still saves the last name.
  useEffect(() => () => saveRef.current(), []);
  const today = localDate();
  const past = travel.trips
    .filter((trip) => trip.endsOn < today)
    .sort((a, b) => b.endsOn.localeCompare(a.endsOn));
  const stamps = past
    .slice(0, 3)
    .map((trip) => ({ trip, label: stampLabel(trip) }))
    .filter((stamp) => stamp.label);
  const photo = auth.user?.avatarUrl;
  return (
    <div className="passport">
      <span className="passport-photo">
        {photo ? (
          <img
            src={photo}
            referrerPolicy="no-referrer"
            alt="Googleアカウントのアイコン"
          />
        ) : (
          <Face />
        )}
      </span>
      <div className="passport-fields">
        <label className="passport-key" htmlFor={nameId}>
          NAME / 表示名
        </label>
        <input
          id={nameId}
          className="passport-name"
          value={name}
          maxLength={100}
          autoComplete="nickname"
          enterKeyHint="done"
          onChange={(event) => {
            setName(event.target.value);
            pending.current = event.target.value;
            clearTimeout(timer.current);
            timer.current = setTimeout(save, 700);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          onBlur={() => {
            save();
            if (!name.trim()) setName(saved.current);
          }}
        />
        <span className="passport-key">ACCOUNT</span>
        <span className="passport-email">
          {auth.user?.email || "サンプルアカウント"}
        </span>
      </div>
      <div className="passport-stamps">
        <small>これまでの旅 {past.length}回</small>
        {stamps.map(({ trip, label }) => (
          <span
            key={trip.id}
            role="img"
            className={label.length > 3 ? "long" : ""}
            aria-label={trip.destination || trip.name}
            title={trip.destination || trip.name}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The mock's passport photo, for accounts without one. */
function Face() {
  return (
    <svg viewBox="0 0 30 30" aria-hidden="true">
      <rect width="30" height="30" fill="#E9B872" />
      <circle cx="15" cy="34" r="12" fill="#3a322c" />
      <circle cx="15" cy="14" r="7.5" fill="#F6D7B0" />
      <circle cx="12.4" cy="13.6" r="1" fill="#2a2420" />
      <circle cx="17.6" cy="13.6" r="1" fill="#2a2420" />
      <path
        d="M12.6 16.6q2.4 2 4.8 0"
        fill="none"
        stroke="#2a2420"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

const THEME_ICONS = {
  system: (
    <>
      <circle
        cx="12"
        cy="12"
        r="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
    </>
  ),
  light: (
    <>
      <circle
        cx="12"
        cy="12"
        r="4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <path
        d="M12 2.5v2.5M12 19v2.5M2.5 12h2.5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </>
  ),
  dark: (
    <path
      d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinejoin="round"
    />
  ),
};
const THEMES = [
  { value: "system", label: "自動" },
  { value: "light", label: "ライト" },
  { value: "dark", label: "ダーク" },
] as const;

/** 外観: three buttons; the chosen one turns paper, the pressed one boings. */
function Appearance() {
  const theme = useTheme();
  return (
    <div className="settings-theme" role="group" aria-label="表示モード">
      {THEMES.map((entry) => (
        <button
          key={entry.value}
          type="button"
          aria-pressed={theme.preference === entry.value}
          onClick={(event) => {
            theme.setPreference(entry.value);
            void spring(
              event.currentTarget,
              [{ transform: "scale(.9)" }, { transform: "none" }],
              "boing",
            );
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {THEME_ICONS[entry.value]}
          </svg>
          {entry.label}
        </button>
      ))}
    </div>
  );
}

type InstallEvent = Event & { prompt: () => Promise<void> };
function AppRows() {
  const { waiting, version } = useAppUpdate();
  const notify = useToast();
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [standalone] = useState(
    () =>
      matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
  );
  useEffect(() => {
    const install = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", install);
    return () => window.removeEventListener("beforeinstallprompt", install);
  }, []);
  return (
    <div className="settings-group">
      {!standalone && (
        <button
          type="button"
          className="settings-row"
          onClick={(event) => {
            void spring(
              event.currentTarget,
              [{ transform: "scale(.97)" }, { transform: "none" }],
              "squish",
            );
            if (installEvent) void installEvent.prompt();
            else
              notify(
                /iPhone|iPad/.test(navigator.userAgent)
                  ? "Safari の共有メニューから「ホーム画面に追加」"
                  : "ブラウザーのメニューから「アプリをインストール」または「ホーム画面に追加」",
              );
          }}
        >
          <svg
            className="settings-row-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <rect
              x="6"
              y="2.5"
              width="12"
              height="19"
              rx="3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M12 8v6M9 11h6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span>
            <b>ホーム画面に追加</b>
            <small>アプリのように全画面で開ける</small>
          </span>
          <span className="settings-row-end">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M9 5l7 7-7 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>
      )}
      <div className="settings-row" role="status" aria-live="polite">
        <span>
          <b>バージョン {appVersion()}</b>
        </span>
        <span className="settings-row-end">
          {waiting ? (
            `${updateLabel(version)} が届いています`
          ) : (
            <>
              <span className="settings-ok" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path
                    d="M5 12.5l4.5 4.5L19 7.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              最新です
            </>
          )}
        </span>
      </div>
    </div>
  );
}

// kondo-settings.html's sink: lands, flattens a little (1.06 × .9), settles.
const SETTLE: Keyframe[] = [
  { transform: "translateY(-20px) scale(.9,1.12)", opacity: 0 },
  { transform: "translateY(0) scale(.92,1.1)", opacity: 1, offset: 0.42 },
  { transform: "translateY(0) scale(1.06,.9)", offset: 0.6 },
  { transform: "translateY(-2px) scale(.99,1.02)", offset: 0.8 },
  { transform: "none", opacity: 1 },
];
const SETTLE_ITEMS =
  ":scope > .settings-label, :scope > .passport, :scope > .settings-theme, :scope > .settings-group";

export function SettingsScreen() {
  const location = useLocation();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
  const backTo = returnTo?.startsWith("/trips/") ? returnTo : "/";
  const auth = useAuth();
  const travel = useTravel();
  const { busy, run } = useAction();
  const navigate = useNavigate();
  const page = useRef<HTMLDivElement>(null);
  // The groups land one after another (40 ms apart), as the mock opens.
  useLayoutEffect(() => {
    if (RM()) return;
    page.current?.querySelectorAll(SETTLE_ITEMS).forEach((el, i) =>
      el.animate?.(SETTLE, {
        duration: 460,
        delay: i * 40,
        easing: "cubic-bezier(.4,0,.6,1)",
        fill: "backwards",
      }),
    );
  }, []);
  // Jelly scroll (kondo-cartoon §3) on the page's blocks.
  useEffect(() => {
    const root = page.current;
    const scroller = root?.closest<HTMLElement>(".modal-inner");
    if (!root || !scroller) return;
    return jellyScroll(
      () =>
        root.querySelectorAll<HTMLElement>(
          SETTLE_ITEMS + ", :scope > .settings-foot",
        ),
      { scroller },
    );
  }, []);
  return (
    <Modal
      title="設定"
      full
      dockActions={{}}
      onClose={() => {
        if ((location.state as { background?: Location } | null)?.background)
          navigate(-1);
        else navigate(backTo, { replace: true });
      }}
    >
      <div ref={page} className="settings-page settings-v2">
        <h3 className="settings-label">アカウント</h3>
        <Passport />
        <h3 className="settings-label">外観</h3>
        <Appearance />
        <h3 className="settings-label">アプリ</h3>
        <AppRows />
        <div className="settings-group settings-signout">
          <button
            type="button"
            className="settings-row danger"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (travel.pendingCount)
                  throw new Error(
                    "未同期の変更を送信してからログアウトしてください",
                  );
                if (auth.isDemo) auth.exitDemo();
                else await auth.signOut();
                navigate("/");
              })
            }
          >
            <span>
              <b>{auth.isDemo ? "サンプルを終了" : "ログアウト"}</b>
            </span>
          </button>
        </div>
        <FooterLogo />
      </div>
    </Modal>
  );
}
