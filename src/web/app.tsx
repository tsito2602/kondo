import { startTripTransition } from "./trip-transition";
import { TripCover } from "./trip-cover";
import { ticketDate } from "./ticket-content";
import {
  captureMotionOrigin,
  dismissModal,
  useMotionNavigation,
} from "./motion";
import type { CSSProperties } from "react";
import { Button } from "./obsidian/button";
import { Input } from "./obsidian/input";
import {
  type FormEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  type Location,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import {
  ArrowLeft,
  Monitor,
  Sun,
  Moon,
  Settings,
  Users,
  Download,
  Pencil,
  Trash2,
  RefreshCw,
  LogOut,
  Plane,
  ChevronRight,
  Copy,
  BookOpen,
  Plus,
  MapPin,
  Check,
} from "lucide-react";
import { Card } from "./obsidian/card";
import { GoogleSignIn, useAuth } from "@/auth/auth-provider";
import { TravelProvider, useTravel } from "@/data/travel-provider";
import type { TripMember } from "@/data/types";
import { formatDate, localDate } from "@/utils/dates";
import { TripEditor } from "./editors";
import { SafariTabs, tripTabs } from "./safari-tabs";
import { AnchoredMenu } from "./anchored-menu";
import { installPressFeedback } from "./press-feedback";
import { dockKeyboardInset } from "./viewport";
import { ThumbDock, ThumbDockProvider, ContextDock } from "./thumb-dock";
import {
  BookingsScreen,
  ItineraryScreen,
  NotesScreen,
  PackingScreen,
  PlacesScreen,
} from "./screens";
import {
  Empty,
  Field,
  Loading,
  Modal,
  copyText,
  useAction,
  useTheme,
  useToast,
} from "./ui";

export function App() {
  const auth = useAuth();
  useEffect(installPressFeedback, []);
  useEffect(() => {
    const root = document.documentElement;
    const pointer = () => {
      root.dataset.inputModality = "pointer";
    };
    const keyboard = (event: KeyboardEvent) => {
      if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !["Shift", "Control", "Alt", "Meta"].includes(event.key)
      ) {
        root.dataset.inputModality = "keyboard";
      }
    };
    pointer();
    document.addEventListener("click", captureMotionOrigin, true);
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("keydown", keyboard, true);
    return () => {
      document.removeEventListener("click", captureMotionOrigin, true);
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("keydown", keyboard, true);
      delete root.dataset.inputModality;
    };
  }, []);
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .catch(() => undefined);
    const update = () => {
      if (document.visibilityState === "visible")
        void navigator.serviceWorker
          .getRegistration()
          .then((registration) => registration?.update())
          .catch(() => undefined);
    };
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      document.documentElement.style.setProperty(
        "--modal-height",
        `${viewport?.height ?? window.innerHeight}px`,
      );
      document.documentElement.style.setProperty(
        "--modal-top",
        `${Math.max(0, viewport?.offsetTop ?? 0)}px`,
      );
      document.documentElement.style.setProperty(
        "--dock-keyboard-inset",
        `${dockKeyboardInset(window.innerHeight, viewport, document.activeElement)}px`,
      );
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);
  if (auth.loading) return <Loading />;
  if (!auth.user) return <Login />;
  return (
    <TravelProvider key={auth.isDemo ? "demo" : auth.user.id}>
      <ThumbDockProvider>
        <TravelApp />
      </ThumbDockProvider>
    </TravelProvider>
  );
}
function Logo() {
  return (
    <span className="brand">
      <img className="logo light-logo" src="/logo.svg" alt="tabi" />
      <img className="logo dark-logo" src="/logo-dark.svg" alt="tabi" />
    </span>
  );
}
function Login() {
  const auth = useAuth();
  return (
    <main className="login">
      <div className="login-art" aria-hidden="true">
        <Plane />
        <div className="orbit" />
      </div>
      <div className="login-panel">
        <Logo />
        <h1>
          旅のしおりを、
          <br />
          ひとつに。
        </h1>
        <p className="muted">予定・予約・持ち物を、一緒に旅する人と。</p>
        <GoogleSignIn />
        {auth.error && (
          <p className="error" role="alert">
            {auth.error}
          </p>
        )}
        {auth.demoEnabled && (
          <Button
            variant="ghost"
            className="secondary"
            onClick={auth.startDemo}
          >
            サンプルの旅を見てみる
            <ChevronRight size={18} />
          </Button>
        )}
      </div>
    </main>
  );
}
function TravelApp() {
  useMotionNavigation();
  const travel = useTravel();
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const settingsOpen = location.pathname === "/settings";
  const membersTripId = location.pathname.match(
    /^\/trips\/([^/]+)\/members$/,
  )?.[1];
  const background = (location.state as { background?: Location } | null)
    ?.background;
  const membersFallback = membersTripId
    ? `/trips/${membersTripId}/itinerary`
    : "/";
  const routeLocation = settingsOpen
    ? (background ?? "/")
    : membersTripId
      ? (background ?? membersFallback)
      : location;
  const routePath =
    typeof routeLocation === "string" ? routeLocation : routeLocation.pathname;
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [routePath]);
  if (!travel.ready) return <Loading />;
  return (
    <>
      <a className="skip-link" href="#main-content">
        本文へ移動
      </a>
      {auth.isDemo && (
        <div className="demo-banner">
          <span>サンプル · この端末に保存</span>
          <button onClick={auth.exitDemo}>終了</button>
        </div>
      )}
      <Routes location={routeLocation}>
        <Route path="/" element={<Home />} />
        <Route path="/trips/:tripId" element={<TripLayout />}>
          <Route index element={<Navigate to="itinerary" replace />} />
          <Route path="itinerary" element={<ItineraryScreen />} />
          <Route path="bookings" element={<BookingsScreen />} />
          <Route path="places" element={<PlacesScreen />} />
          <Route path="packing" element={<PackingScreen />} />
          <Route path="notes" element={<NotesScreen />} />
        </Route>
        <Route
          path="*"
          element={
            <main className="page">
              <Empty>
                <h1>ページが見つかりません</h1>
                <Link to="/">旅行一覧へ</Link>
              </Empty>
            </main>
          }
        />
      </Routes>
      {settingsOpen && <SettingsScreen />}
      {membersTripId && travel.selectedTrip?.id === membersTripId && (
        <MembersScreen
          onClose={() =>
            background
              ? navigate(-1)
              : navigate(membersFallback, { replace: true })
          }
        />
      )}
    </>
  );
}
function SyncStatus() {
  const { syncing, pendingCount, error, sync } = useTravel();
  const { isDemo } = useAuth();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return (
    <button
      className={`sync-status ${error && online ? "warning" : ""}`}
      onClick={() => void sync()}
      title={error ?? "同期する"}
    >
      {syncing || pendingCount || error || !online ? (
        <RefreshCw size={12} className={syncing ? "spin" : ""} />
      ) : (
        <Check size={12} />
      )}
      <span>
        {isDemo
          ? "この端末に保存"
          : syncing
            ? "同期中"
            : !online
              ? `オフライン${pendingCount ? ` · ${pendingCount}件待ち` : ""}`
              : pendingCount
                ? `${pendingCount}件の変更を同期待ち`
                : error
                  ? "同期を再試行"
                  : "同期済み"}
      </span>
    </button>
  );
}
function Home() {
  const travel = useTravel();
  const navigate = useNavigate();
  const location = useLocation();
  const [editing, setEditing] = useState(false);
  const [params, setParams] = useSearchParams();
  const [invite, setInvite] = useState(params.get("invite") ?? "");
  const { busy, run } = useAction();
  const today = localDate();
  const future = travel.trips.filter((trip) => trip.endsOn >= today);
  const past = travel.trips.filter((trip) => trip.endsOn < today);
  return (
    <>
      <ThumbDock mode="context">
        <ContextDock
          primary={
            <button onClick={() => setEditing(true)}>
              <Plus size={18} aria-hidden="true" />
              旅行を作成
            </button>
          }
          actions={
            <Link
              to="/settings"
              state={{ background: location }}
              aria-label="設定"
            >
              <Settings size={22} />
            </Link>
          }
        />
      </ThumbDock>
      <main id="main-content" className="page home-page">
        <div className="home-toolbar">
          <h1>旅行</h1>
          <Link
            className="icon-button home-settings"
            to="/settings"
            state={{ background: location }}
            aria-label="設定"
          >
            <Settings />
          </Link>
          <Button
            variant="ghost"
            className="primary"
            onClick={() => setEditing(true)}
          >
            <Plus size={18} />
            旅行を作成
          </Button>
        </div>
        {travel.error && (
          <p className="notice" role="status">
            {travel.error}
          </p>
        )}
        {!travel.trips.length && (
          <Empty>
            <BookOpen />
            <h2>旅行はまだありません</h2>
            <p>旅行を作成するか、招待リンクから参加できます。</p>
          </Empty>
        )}
        {[
          { label: "これからの旅", trips: future },
          { label: "これまでの旅", trips: past },
        ].map(
          (group) =>
            group.trips.length > 0 && (
              <section className="trip-group" key={group.label}>
                <div className="section-heading">
                  <h2>{group.label}</h2>
                  <span className="muted">{group.trips.length}</span>
                </div>
                <div className="trip-grid">
                  {group.trips.map((trip) => (
                    <Link
                      className="trip-ticket"
                      data-press-card
                      data-trip-surface={trip.id}
                      data-motion-managed
                      onClick={(event) => {
                        if (
                          event.button !== 0 ||
                          event.metaKey ||
                          event.ctrlKey ||
                          event.shiftKey ||
                          event.altKey
                        )
                          return;
                        event.preventDefault();
                        startTripTransition(() => {
                          travel.selectTrip(trip.id);
                          navigate(`/trips/${trip.id}/itinerary`);
                        }, trip.id);
                      }}
                      key={trip.id}
                      to={`/trips/${trip.id}/itinerary`}
                    >
                      <div className="trip-photo">
                        <TripCover id={trip.id} src={trip.coverImage ?? ""} />
                        <div className="trip-photo-content">
                          <h2>{trip.name}</h2>
                          {trip.destination && (
                            <span className="trip-destination">
                              <MapPin size={13} />
                              {trip.destination}
                            </span>
                          )}
                          <div className="trip-ticket-period">
                            <p>
                              {ticketDate(trip.startsOn)}
                              <span className="ticket-range-end">
                                〜 {ticketDate(trip.endsOn, trip.startsOn)}
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="trip-stub">
                        <strong>
                          {Math.round(
                            (Date.parse(trip.endsOn) -
                              Date.parse(trip.startsOn)) /
                              86400000,
                          ) + 1}
                          <small>日間</small>
                        </strong>
                        <span>
                          <Users size={14} />
                          {trip.memberCount}人
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ),
        )}
        <Button
          variant="ghost"
          className="subtle invite-entry"
          onClick={() => setInvite(" ")}
        >
          招待リンクから参加
        </Button>
        {editing && (
          <TripEditor
            onClose={() => setEditing(false)}
            onCreated={(id) => navigate(`/trips/${id}/itinerary`)}
          />
        )}
        {invite && (
          <Modal
            title="旅行に参加"
            onClose={() => {
              setInvite("");
              setParams({});
            }}
          >
            <form
              className="form"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  let token = invite.trim();
                  try {
                    token = new URL(token).searchParams.get("invite") ?? token;
                  } catch {
                    /* Direct token. */
                  }
                  if (!token) throw new Error("招待リンクを入力してください");
                  const id = await travel.acceptInvite(token);
                  dismissModal(() => {
                    setInvite("");
                    navigate(`/trips/${id}/itinerary`);
                  });
                });
              }}
            >
              <p>共有された旅のしおりに参加します。</p>
              <Field label="招待リンク">
                <Input
                  required
                  value={invite.trimStart()}
                  onChange={(event) => setInvite(event.target.value || " ")}
                />
              </Field>
              <Button
                variant="ghost"
                type="submit"
                className="primary"
                disabled={busy}
              >
                この旅行に参加
              </Button>
            </form>
          </Modal>
        )}
      </main>
    </>
  );
}
function TripLayout() {
  const { tripId } = useParams();
  const travel = useTravel();
  const navigate = useNavigate();
  const notify = useToast();
  const location = useLocation();
  const [menu, setMenu] = useState(false);
  const menuTrigger = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [progress, setProgress] = useState("");
  const { busy, run } = useAction();
  const ref = useRef<HTMLElement>(null);
  const trip = travel.trips.find((trip) => trip.id === tripId);
  useEffect(() => {
    if (trip && travel.selectedTrip?.id !== trip.id) travel.selectTrip(trip.id);
  }, [trip, travel.selectedTrip?.id, travel.selectTrip]);
  useEffect(() => {
    ref.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [location.pathname]);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const update = () =>
      document.documentElement.style.setProperty(
        "--trip-header-height",
        `${ref.current!.getBoundingClientRect().height}px`,
      );
    const observer = new ResizeObserver(update);
    observer.observe(ref.current);
    update();
    return () => observer.disconnect();
  }, [trip?.id, travel.selectedTrip?.id]);
  if (!trip)
    return (
      <main className="page">
        <Empty>
          <h1>旅行が見つかりません</h1>
          <Link to="/">旅行一覧へ</Link>
        </Empty>
      </main>
    );
  if (travel.selectedTrip?.id !== trip.id) return <Loading />;
  return (
    <>
      <header className="trip-header" ref={ref}>
        <div className="trip-heading">
          <Link
            className="icon-button"
            to="/"
            aria-label="旅行一覧へ戻る"
            data-motion-managed
            onClick={(event) => {
              if (
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              event.preventDefault();
              startTripTransition(() => navigate("/"), trip.id, true);
            }}
          >
            <ArrowLeft />
          </Link>
          <div className="trip-title">
            <h1>{trip.name}</h1>
            <p>
              {formatDate(trip.startsOn)} — {formatDate(trip.endsOn)}
            </p>
          </div>
          <div ref={menuTrigger} className="trip-menu-anchor" />
        </div>
        {trip.role === "viewer" && (
          <div className="viewer-status">閲覧のみ</div>
        )}
        <nav
          className="trip-tabs"
          aria-label="旅行のページ"
          style={
            {
              "--active-tab": Math.max(
                0,
                tripTabs.findIndex((tab) =>
                  location.pathname.endsWith(`/${tab.path}`),
                ),
              ),
            } as CSSProperties
          }
        >
          {tripTabs.map((tab) => (
            <NavLink key={tab.path} to={`/trips/${trip.id}/${tab.path}`}>
              <tab.icon size={20} />
              <span>{tab.label}</span>
            </NavLink>
          ))}
        </nav>
      </header>
      <main id="main-content" key={trip.id} data-trip-surface={trip.id}>
        <Outlet />
      </main>
      <ThumbDock mode="browse">
        <SafariTabs tripId={trip.id} onMenu={() => setMenu(true)} />
      </ThumbDock>
      <AnchoredMenu
        anchor={menuTrigger}
        open={menu}
        onOpen={() => setMenu(true)}
        onClose={() => setMenu(false)}
      >
        {(closeMenu) => (
          <>
            <div className="menu-list">
              <button
                onClick={() => {
                  closeMenu(() => {
                    navigate(`/trips/${trip.id}/members`, {
                      state: { background: location },
                    });
                  });
                }}
              >
                <Users />
                メンバー管理
              </button>
              {travel.canEdit && (
                <button
                  onClick={() => {
                    closeMenu(() => {
                      setEditing(true);
                    });
                  }}
                >
                  <Pencil />
                  旅行を編集
                </button>
              )}
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const count = await travel.saveTripOffline((done, total) =>
                      setProgress(`${done} / ${total}件の書類を保存中`),
                    );
                    setProgress("");
                    notify(`旅行と${count}件の書類をオフライン保存しました`);
                  })
                }
              >
                <Download />
                オフライン保存
              </button>
              {progress && <p role="status">{progress}</p>}
              <button
                onClick={() =>
                  closeMenu(() =>
                    navigate("/settings", {
                      state: {
                        returnTo: location.pathname,
                        background: location,
                      },
                    }),
                  )
                }
              >
                <Settings />
                設定
              </button>
              {trip.role === "owner" && (
                <button
                  disabled={busy}
                  className="danger"
                  onClick={() =>
                    void run(async () => {
                      if (
                        confirm(
                          `「${trip.name}」と旅行内のすべてのデータを削除しますか？この操作は取り消せません。`,
                        )
                      ) {
                        await travel.deleteTrip(trip.id);
                        navigate("/");
                      }
                    })
                  }
                >
                  <Trash2 />
                  旅行を削除
                </button>
              )}
            </div>
            <div className="trip-menu-sync">
              <SyncStatus />
            </div>
          </>
        )}
      </AnchoredMenu>
      {editing && <TripEditor trip={trip} onClose={() => setEditing(false)} />}
    </>
  );
}
function MembersScreen({ onClose }: { onClose: () => void }) {
  const travel = useTravel();
  const auth = useAuth();
  const notify = useToast();
  const { busy, run } = useAction();
  const [invite, setInvite] = useState("");
  const owner = travel.selectedTrip!.role === "owner";
  const change = async (member: TripMember, role?: "editor" | "viewer") => {
    if (auth.isDemo) throw new Error("サンプルではメンバーを変更できません");
    await auth.request(
      `/v1/trips/${travel.selectedTrip!.id}/members/${member.id}`,
      {
        method: role ? "PATCH" : "DELETE",
        ...(role ? { body: JSON.stringify({ role }) } : {}),
      },
    );
    await travel.sync();
  };
  return (
    <Modal title="メンバー管理" full dockActions={{}} onClose={onClose}>
      <div className="settings-page members-page">
        <div className="section-heading">
          <h2>一緒に旅する人</h2>
          <span>{travel.members.length}人</span>
        </div>
        <div className="check-list">
          {travel.members.map((member) => (
            <div className="member-row" key={member.id}>
              {member.avatarUrl ? (
                <img
                  className="avatar"
                  src={member.avatarUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="avatar">
                  {(member.name || member.email).slice(0, 1)}
                </span>
              )}
              <div className="grow">
                <strong>{member.name || member.email}</strong>
                <small>{member.email}</small>
              </div>
              {owner && member.role !== "owner" ? (
                <>
                  <select
                    aria-label={`${member.name || member.email}の権限`}
                    disabled={busy}
                    value={member.role}
                    onChange={(event) =>
                      void run(() =>
                        change(
                          member,
                          event.target.value as "editor" | "viewer",
                        ),
                      )
                    }
                  >
                    <option value="editor">編集可</option>
                    <option value="viewer">閲覧のみ</option>
                  </select>
                  <Button
                    variant="ghost"
                    className="icon-button danger"
                    disabled={busy}
                    aria-label="メンバーを削除"
                    onClick={() => {
                      if (confirm("このメンバーを旅行から削除しますか？"))
                        void run(() => change(member));
                    }}
                  >
                    <Trash2 />
                  </Button>
                </>
              ) : (
                <span className="badge">
                  {member.role === "owner"
                    ? "オーナー"
                    : member.role === "editor"
                      ? "編集可"
                      : "閲覧のみ"}
                </span>
              )}
            </div>
          ))}
        </div>
        {owner && (
          <Card className="settings-card">
            <h3>旅のしおりを共有</h3>
            <p>招待リンクは1回限り、7日間有効です。</p>
            <Button
              variant="ghost"
              className="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setInvite(await travel.createInvite());
                })
              }
            >
              招待リンクを作成
            </Button>
            {invite && (
              <div className="form">
                <Field label="招待リンク">
                  <Input
                    readOnly
                    value={invite}
                    onFocus={(event) => event.target.select()}
                  />
                </Field>
                <Button
                  variant="ghost"
                  className="secondary"
                  onClick={() =>
                    void run(async () => {
                      await copyText(invite);
                      notify("招待リンクをコピーしました");
                    })
                  }
                >
                  <Copy />
                  リンクをコピー
                </Button>
              </div>
            )}
            <Button
              variant="ghost"
              className="subtle danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (confirm("発行済みの招待リンクを無効にしますか？")) {
                    await auth.request(
                      `/v1/trips/${travel.selectedTrip!.id}/invites`,
                      { method: "DELETE" },
                    );
                    setInvite("");
                    notify("招待リンクを無効にしました");
                  }
                })
              }
            >
              発行済みの招待を無効にする
            </Button>
          </Card>
        )}
      </div>
    </Modal>
  );
}
function SettingsScreen() {
  const location = useLocation();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
  const backTo = returnTo?.startsWith("/trips/") ? returnTo : "/";
  const auth = useAuth();
  const travel = useTravel();
  const theme = useTheme();
  const notify = useToast();
  const { busy, run } = useAction();
  const navigate = useNavigate();
  const [name, setName] = useState(auth.user?.name ?? "");
  const save = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await auth.updateProfile(name);
      notify("表示名を保存しました");
    });
  };
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
      <div className="settings-page">
        <Card className="settings-card">
          <h2>アカウント</h2>
          <div className="member-row">
            {auth.user?.avatarUrl && (
              <img
                className="avatar"
                src={auth.user.avatarUrl}
                referrerPolicy="no-referrer"
                alt="Googleアカウントのアイコン"
              />
            )}
            <span>{auth.user?.email || "サンプルアカウント"}</span>
          </div>
          <form className="form" onSubmit={save}>
            <Field label="表示名">
              <Input
                required
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Button variant="ghost" className="secondary" disabled={busy}>
              表示名を保存
            </Button>
          </form>
        </Card>
        <Card className="settings-card">
          <h2>外観</h2>
          <div className="segmented appearance-control" aria-label="表示モード">
            {(
              [
                { value: "system", label: "端末に合わせる", icon: Monitor },
                { value: "light", label: "ライト", icon: Sun },
                { value: "dark", label: "ダーク", icon: Moon },
              ] as const
            ).map((entry) => (
              <button
                key={entry.value}
                aria-label={entry.label}
                aria-pressed={theme.preference === entry.value}
                className={theme.preference === entry.value ? "selected" : ""}
                onClick={() => theme.setPreference(entry.value)}
              >
                <entry.icon size={18} aria-hidden="true" />
                {entry.value === "system" ? "自動" : entry.label}
              </button>
            ))}
          </div>
        </Card>
        <Card className="settings-card">
          <h2>アプリ</h2>
          <PwaControls />
          <p className="muted small">tabi {import.meta.env.VITE_APP_VERSION}</p>
        </Card>
        <Button
          variant="ghost"
          className="secondary danger"
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
          <LogOut />
          {auth.isDemo ? "サンプルを終了" : "ログアウト"}
        </Button>
      </div>
    </Modal>
  );
}
type InstallEvent = Event & { prompt: () => Promise<void> };
function PwaControls() {
  const { pendingCount } = useTravel();
  const [checking, setChecking] = useState(false);
  const [updateStatus, setUpdateStatus] = useState("");
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [standalone] = useState(
    () =>
      matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
  );
  const notify = useToast();
  useEffect(() => {
    let active = true;
    const check = () => {
      if ("serviceWorker" in navigator)
        void navigator.serviceWorker.getRegistration().then((registration) => {
          if (active) setWaiting(registration?.waiting ?? null);
        });
    };
    const install = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
    };
    check();
    const timer = setInterval(check, 3000);
    window.addEventListener("beforeinstallprompt", install);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("beforeinstallprompt", install);
    };
  }, []);
  return (
    <div className="form">
      {!standalone && (
        <Button
          variant="ghost"
          className="secondary"
          onClick={() => {
            if (installEvent) void installEvent.prompt();
            else
              notify(
                /iPhone|iPad/.test(navigator.userAgent)
                  ? "Safariの共有メニューから「ホーム画面に追加」を選んでください"
                  : "ブラウザーのメニューから「アプリをインストール」または「ホーム画面に追加」を選んでください",
              );
          }}
        >
          ホーム画面に追加
        </Button>
      )}
      <Button
        variant="ghost"
        className="secondary"
        disabled={pendingCount > 0 || checking}
        onClick={async () => {
          setUpdateStatus("");
          if (waiting) {
            navigator.serviceWorker.addEventListener(
              "controllerchange",
              () => location.reload(),
              { once: true },
            );
            waiting.postMessage({ type: "ACTIVATE_UPDATE" });
          } else {
            setChecking(true);
            try {
              const registration =
                "serviceWorker" in navigator
                  ? await navigator.serviceWorker.getRegistration()
                  : undefined;
              if (!registration) throw new Error("Service worker unavailable");
              await registration.update();
              if (registration.waiting) setWaiting(registration.waiting);
              else
                setUpdateStatus(
                  "更新を確認しました。準備ができると更新ボタンが表示されます",
                );
            } catch {
              setUpdateStatus("更新を確認できませんでした");
            } finally {
              setChecking(false);
            }
          }
        }}
      >
        {checking
          ? "確認中…"
          : waiting
            ? "新しいバージョンに更新"
            : "更新を確認"}
      </Button>
      <p
        className="pwa-update-status muted small"
        role="status"
        aria-live="polite"
      >
        {waiting ? "" : updateStatus}
      </p>
      {pendingCount > 0 && (
        <p className="muted">未同期の変更を送信してから更新できます。</p>
      )}
    </div>
  );
}
