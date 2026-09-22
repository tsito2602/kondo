import {
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import {
  ArrowLeft,
  BookOpen,
  ListChecks,
  MapPin,
  MoreHorizontal,
  NotebookPen,
  Ticket,
} from "lucide-react";

import { DockNavigationContext } from "./thumb-dock";

export const tripTabs = [
  { path: "itinerary", label: "しおり", icon: BookOpen },
  { path: "places", label: "行きたい場所", icon: MapPin },
  { path: "packing", label: "準備", icon: ListChecks },
  { path: "bookings", label: "予約", icon: Ticket },
  { path: "notes", label: "メモ", icon: NotebookPen },
];

/** Tap any icon directly; holding reveals names without changing pages. */
export function SafariTabs({
  tripId,
  onMenu,
}: {
  tripId: string;
  onMenu: () => void;
}) {
  const location = useLocation();
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const controls = useContext(DockNavigationContext);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const held = useRef(false);
  const [holding, setHolding] = useState(false);
  const cancelHold = () => {
    clearTimeout(holdTimer.current);
    pointer.current = null;
  };
  const nav = useRef<HTMLElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => () => clearTimeout(holdTimer.current), []);
  const active = tripTabs.findIndex((tab) =>
    location.pathname.endsWith(`/${tab.path}`),
  );
  const collapse = () => {
    cancelHold();
    held.current = false;
    setHolding(false);
    restoreFocus.current = true;
    setExpanded(false);
  };
  useEffect(() => {
    if (!expanded) {
      if (restoreFocus.current)
        nav.current
          ?.querySelector<HTMLAnchorElement>('[aria-current="page"]')
          ?.focus({ preventScroll: true });
      restoreFocus.current = false;
      return;
    }
    (
      nav.current?.querySelector<HTMLAnchorElement>('[aria-current="page"]') ??
      nav.current?.querySelector<HTMLAnchorElement>("a")
    )?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      collapse();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [expanded]);
  return (
    <>
      {expanded && (
        <button
          className="safari-dismiss"
          aria-label="タブ選択を閉じる"
          tabIndex={-1}
          onClick={collapse}
        />
      )}
      <div className="safari-dock" data-expanded={expanded}>
        <span className="safari-circle safari-left" aria-hidden="true" />
        <span className="safari-circle safari-right" aria-hidden="true" />
        <span className="safari-bridge safari-left" aria-hidden="true" />
        <span className="safari-bridge safari-right" aria-hidden="true" />
        <div
          className="safari-side safari-left"
          inert={expanded}
          aria-hidden={expanded}
        >
          {controls ? (
            <button
              className="safari-side-button"
              aria-label="詳細を閉じて戻る"
              onClick={controls.back}
            >
              <ArrowLeft size={22} />
            </button>
          ) : (
            <Link
              to="/"
              className="safari-side-button"
              aria-label="旅行一覧へ戻る"
            >
              <ArrowLeft size={22} />
            </Link>
          )}
        </div>
        <div
          className="safari-side safari-right"
          inert={expanded}
          aria-hidden={expanded}
        >
          {controls?.action ? (
            <div className="safari-side-button safari-detail-action">
              {controls.action}
            </div>
          ) : (
            <button
              className="safari-side-button"
              aria-label="旅行メニュー"
              onClick={onMenu}
            >
              <MoreHorizontal size={24} />
            </button>
          )}
        </div>
        <div className="safari-center">
          <div className="safari-material" aria-hidden="true" />
          <nav
            ref={nav}
            className="safari-tabs"
            aria-label="旅行のページ"
            data-dock-hold={holding}
            onPointerDown={(event) => {
              cancelHold();
              held.current = false;
              setHolding(false);
              if (expanded || event.button !== 0 || !event.isPrimary) return;
              pointer.current = { x: event.clientX, y: event.clientY };
              holdTimer.current = setTimeout(() => {
                held.current = true;
                setHolding(true);
                setExpanded(true);
              }, 420);
            }}
            onPointerMove={(event) => {
              if (
                pointer.current &&
                Math.hypot(
                  event.clientX - pointer.current.x,
                  event.clientY - pointer.current.y,
                ) > 10
              )
                cancelHold();
            }}
            onPointerUp={cancelHold}
            onPointerCancel={() => {
              cancelHold();
              held.current = false;
              setHolding(false);
            }}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setExpanded(true);
              }
            }}
            style={{ "--active-tab": active } as CSSProperties}
          >
            {tripTabs.map((tab) => (
              <NavLink
                key={tab.path}
                to={`/trips/${tripId}/${tab.path}`}
                aria-label={tab.label}
                aria-keyshortcuts="ArrowUp"
                data-dock-managed={controls ? "" : undefined}
                onClick={(event) => {
                  if (held.current) {
                    event.preventDefault();
                    held.current = false;
                    setHolding(false);
                    return;
                  }
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  collapse();
                  if (controls) {
                    event.preventDefault();
                    controls.beforeNavigate(() =>
                      navigate(`/trips/${tripId}/${tab.path}`),
                    );
                  }
                }}
              >
                <tab.icon size={21} />
                <span>{tab.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
    </>
  );
}
