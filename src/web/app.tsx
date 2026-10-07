import { SettingsScreen } from "./settings";
import { startUpdateChecks, useUpdateGuard } from "./app-update";
import { startTripTransition } from "./trip-transition";
import { HomePull } from "./home-pull";
import { finishBootScreen } from "./boot";
import {
  PastTripCard,
  UpcomingTripCard,
  useHomeMotion,
  useTripListEntrance,
} from "./home-trips";
import {
  captureMotionOrigin,
  dismissModal,
  reduceMotion,
  useMotionNavigation,
} from "./motion";
import { spring } from "./cartoon";
import type { CSSProperties } from "react";
import { Button } from "./obsidian/button";
import { Input } from "./obsidian/input";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  Settings,
  Trash2,
  ChevronRight,
  Copy,
  BookOpen,
  Plus,
  Link2,
} from "lucide-react";
import { Card } from "./obsidian/card";
import { GoogleSignIn, useAuth } from "@/auth/auth-provider";
import {
  REMOVAL_UNDO_MS,
  TravelProvider,
  useTravel,
} from "@/data/travel-provider";
import type { Trip, TripMember } from "@/data/types";
import { localDate } from "@/utils/dates";
import { TripEditor } from "./editors";
import { TripDock, tripTabs } from "./trip-dock";
import { TripMenuButton, tripSpan } from "./trip-menu";
import { DockBackIcon } from "./cartoon-dock";
import { installPressFeedback } from "./press-feedback";
import { keyboardInset, revealModalField } from "./viewport";
import {
  ContextDock,
  DockToast,
  ThumbDock,
  ThumbDockProvider,
} from "./thumb-dock";
import {
  BookingsScreen,
  ItineraryScreen,
  NotesScreen,
  PlacesScreen,
} from "./screens";
import { PackingScreen, TasksScreen } from "./prep";
import {
  Empty,
  Field,
  Loading,
  Modal,
  DockFunction,
  copyText,
  useAction,
  useToast,
} from "./ui";

export function App() {
  const auth = useAuth();
  useEffect(() => {
    if (!auth.loading) return finishBootScreen();
  }, [auth.loading]);
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
  useEffect(startUpdateChecks, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    let revealFrame = 0;
    let blurFrame = 0;
    let lastHeight = 0;
    let lastLayoutHeight = 0;
    let lastFocused: Element | null = null;
    const update = () => {
      // Pinch zoom and Safari's viewport pan must not trigger a second scroll
      // of the field. Only a focus change or resized keyboard needs revealing.
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
      cancelAnimationFrame(blurFrame);
      const height = viewport?.height ?? window.innerHeight;
      const focused = document.activeElement;
      const reveal =
        focused !== lastFocused ||
        Math.abs(height - lastHeight) > 1 ||
        Math.abs(window.innerHeight - lastLayoutHeight) > 1;
      lastHeight = height;
      lastLayoutHeight = window.innerHeight;
      lastFocused = focused;
      const inset = keyboardInset(
        window.innerHeight,
        viewport,
        document.activeElement,
      );
      // Compact panels also retain their pre-keyboard height when scroll space
      // is added underneath their content.
      for (const panel of document.querySelectorAll<HTMLElement>(
        "dialog[open]:not(.full) .modal-inner, dialog[open] > .bk-sheet",
      )) {
        if (!inset) panel.style.removeProperty("--modal-panel-height");
        else if (!panel.style.getPropertyValue("--modal-panel-height"))
          panel.style.setProperty(
            "--modal-panel-height",
            `${panel.getBoundingClientRect().height}px`,
          );
      }
      document.documentElement.style.setProperty(
        "--modal-layout-height",
        `${window.innerHeight}px`,
      );
      document.documentElement.style.setProperty(
        "--modal-height",
        `${viewport?.height ?? window.innerHeight}px`,
      );
      document.documentElement.style.setProperty(
        "--modal-top",
        `${Math.max(0, viewport?.offsetTop ?? 0)}px`,
      );
      document.documentElement.style.setProperty(
        "--panel-keyboard-inset",
        `${inset}px`,
      );
      document.documentElement.dataset.keyboardOpen = String(inset > 0);
      // Keep the panel and dock in place. Only scroll its content to reveal
      // the field above the keyboard, including Safari's viewport panning.
      if (reveal) {
        cancelAnimationFrame(revealFrame);
        revealFrame = requestAnimationFrame(() =>
          revealModalField(document.activeElement),
        );
      }
    };
    // Switching between fields briefly focuses body. Keep keyboard padding and
    // panel scroll stable until the destination field receives focus.
    const afterBlur = () => {
      cancelAnimationFrame(blurFrame);
      blurFrame = requestAnimationFrame(update);
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", afterBlur);
    return () => {
      cancelAnimationFrame(revealFrame);
      cancelAnimationFrame(blurFrame);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", afterBlur);
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
      <img className="logo light-logo" src="/logo.svg" alt="" />
      <img className="logo dark-logo" src="/logo-dark.svg" alt="" />
      <span>kondo</span>
    </span>
  );
}
function Login() {
  const auth = useAuth();
  return (
    <main className="login">
      <div className="login-panel">
        <div className="login-brand">
          <Logo />
        </div>
        <div className="login-copy">
          <h1>こんど、どこ行こうか。</h1>
        </div>
        <div className="login-actions">
          <GoogleSignIn />
          {auth.error && (
            <p className="error" role="alert">
              {auth.error}
            </p>
          )}
          {auth.demoEnabled && (
            <Button
              variant="ghost"
              className="login-demo"
              onClick={auth.startDemo}
            >
              サンプルの旅を見てみる
              <ChevronRight size={18} />
            </Button>
          )}
        </div>
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
  useUpdateGuard(travel.ready, travel.pendingCount);
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
          <Route path="tasks" element={<TasksScreen />} />
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
      {travel.removal && (
        <ThumbDock mode="toast">
          <DockToast
            message={travel.removal.message}
            onUndo={travel.undoRemoval}
            duration={REMOVAL_UNDO_MS}
            restartKey={travel.removal.key}
          />
        </ThumbDock>
      )}
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
function Home() {
  const travel = useTravel();
  const navigate = useNavigate();
  const location = useLocation();
  const [editing, setEditing] = useState(false);
  const [params, setParams] = useSearchParams();
  const [invite, setInvite] = useState(params.get("invite") ?? "");
  const { busy, run } = useAction();
  const today = localDate();
  const future = travel.trips
    .filter((trip) => trip.endsOn >= today)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const past = travel.trips
    .filter((trip) => trip.endsOn < today)
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn));
  const list = useRef<HTMLElement>(null);
  useTripListEntrance(list);
  useHomeMotion(list);
  const open = (trip: Trip) =>
    startTripTransition(() => {
      travel.selectTrip(trip.id);
      navigate(`/trips/${trip.id}/itinerary`);
    }, trip.id);
  return (
    <>
      {/* Settings on the left, joining by invite and create on the right:
          only here on phones. */}
      <ThumbDock mode="context">
        <ContextDock
          back={
            <Link
              to="/settings"
              state={{ background: location }}
              aria-label="設定"
            >
              <Settings size={22} />
            </Link>
          }
          secondary={
            <DockFunction
              label="招待リンクから参加"
              short="招待で参加"
              className="home-join-dock"
              icon={<Link2 aria-hidden="true" />}
              onClick={() => setInvite(" ")}
            />
          }
          actions={
            <button className="home-create" onClick={() => setEditing(true)}>
              <Plus size={22} strokeWidth={2.6} aria-hidden="true" />
              旅行を作成
            </button>
          }
        />
      </ThumbDock>
      <main id="main-content" className="page home-page" ref={list}>
        <HomePull content={list} onSync={travel.sync} />
        <div className="home-toolbar">
          <h1>旅行</h1>
          {/* Wide screens have no dock, so the same two controls live here. */}
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
        {future.length > 0 && (
          <section className="home-group" aria-labelledby="home-upcoming">
            <h2 className="home-group-heading" id="home-upcoming">
              これからの旅<span>{future.length}</span>
            </h2>
            <div className="home-trip-list">
              {future.map((trip, index) => (
                <UpcomingTripCard
                  key={trip.id}
                  trip={trip}
                  members={travel.membersOf(trip.id)}
                  today={today}
                  nearest={index === 0}
                  onOpen={open}
                />
              ))}
            </div>
          </section>
        )}
        {past.length > 0 && (
          <section className="home-group" aria-labelledby="home-past">
            <h2 className="home-group-heading" id="home-past">
              これまでの旅<span>{past.length}</span>
            </h2>
            <div className="home-trip-shelf">
              {past.map((trip) => (
                <PastTripCard key={trip.id} trip={trip} onOpen={open} />
              ))}
            </div>
          </section>
        )}
        <button className="home-join" onClick={() => setInvite(" ")}>
          招待リンクから参加
        </button>
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
  const location = useLocation();
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
              // The back button's プルン, then the trip folds into its card.
              const back = event.currentTarget;
              void spring(
                back,
                [{ transform: "scale(1.2, .8)" }, { transform: "none" }],
                "boing",
              );
              setTimeout(
                () => startTripTransition(() => navigate("/"), trip.id, true),
                reduceMotion() ? 0 : 120,
              );
            }}
          >
            <DockBackIcon />
          </Link>
          <div className="trip-title">
            <h1>{trip.name}</h1>
            <p>{tripSpan(trip)}</p>
          </div>
          <TripMenuButton tripId={trip.id} />
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
              {tab.icon}
              <span>{tab.label}</span>
            </NavLink>
          ))}
        </nav>
      </header>
      <main id="main-content" key={trip.id} data-trip-surface={trip.id}>
        <Outlet />
      </main>
      <ThumbDock mode="browse">
        <TripDock tripId={trip.id} />
      </ThumbDock>
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
