import {
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { flushSync } from "react-dom";
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

import { reduceMotion } from "./motion";
import { DockNavigationContext } from "./thumb-dock";

export const tripTabs = [
  { path: "itinerary", label: "しおり", icon: BookOpen },
  { path: "places", label: "行きたい場所", icon: MapPin },
  { path: "packing", label: "準備", icon: ListChecks },
  { path: "bookings", label: "予約", icon: Ticket },
  { path: "notes", label: "メモ", icon: NotebookPen },
];

/** Tap directly, or hold then scrub across the expanded tabs and release. */
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
  const pointer = useRef<{
    id: number;
    x: number;
    y: number;
    startX: number;
    startY: number;
    held: boolean;
    dragged: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const [holding, setHolding] = useState(false);
  const [preview, setPreview] = useState(-1);
  const frame = useRef<number | undefined>(undefined);
  const transition = useRef<ViewTransition | undefined>(undefined);
  const nav = useRef<HTMLElement>(null);
  const restoreFocus = useRef(false);
  const active = tripTabs.findIndex((tab) =>
    location.pathname.endsWith(`/${tab.path}`),
  );
  const stopGesture = () => {
    clearTimeout(holdTimer.current);
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    const id = pointer.current?.id;
    pointer.current = null;
    setPreview(-1);
    if (id !== undefined && nav.current?.hasPointerCapture?.(id))
      nav.current.releasePointerCapture(id);
  };
  const blockReleaseClick = () => {
    suppressClick.current = true;
    setHolding(true);
    // The document's capture listener runs before React's click handlers.
    // Set this immediately, including when release and click share a frame.
    if (nav.current) nav.current.dataset.dockHold = "true";
  };
  const hitTab = (x: number, y: number) =>
    [
      ...(nav.current?.querySelectorAll<HTMLAnchorElement>("a") ?? []),
    ].findIndex((link) => {
      const rect = link.getBoundingClientRect();
      return (
        rect.width > 0 &&
        x >= rect.left &&
        x < rect.right &&
        y >= rect.top &&
        y <= rect.bottom
      );
    });
  const followPointer = () => {
    const gesture = pointer.current;
    if (!gesture?.held) return;
    if (gesture.dragged) setPreview(hitTab(gesture.x, gesture.y));
    // Tabs move while the material expands; hit-test their live positions.
    frame.current = requestAnimationFrame(followPointer);
  };
  const collapse = () => {
    stopGesture();
    restoreFocus.current = true;
    setExpanded(false);
  };
  const selectTab = (index: number) => {
    const to = `/trips/${tripId}/${tripTabs[index].path}`;
    if (controls) {
      controls.beforeNavigate(() => navigate(to));
    } else if (document.startViewTransition && !reduceMotion()) {
      document.documentElement.style.setProperty(
        "--route-direction",
        String(index < active ? -1 : 1),
      );
      transition.current?.skipTransition();
      transition.current = document.startViewTransition(() =>
        flushSync(() => navigate(to)),
      );
      void transition.current.ready.catch(() => undefined);
      void transition.current.finished.catch(() => undefined);
    } else {
      navigate(to);
    }
  };
  useEffect(
    () => () => {
      clearTimeout(holdTimer.current);
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      transition.current?.skipTransition();
    },
    [],
  );
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
            data-scrubbing={preview >= 0}
            onPointerDown={(event) => {
              if (event.button !== 0 || !event.isPrimary) return;
              transition.current?.skipTransition();
              stopGesture();
              suppressClick.current = false;
              setHolding(false);
              event.currentTarget.dataset.dockHold = "false";
              if (expanded) return;
              pointer.current = {
                id: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                startX: event.clientX,
                startY: event.clientY,
                held: false,
                dragged: false,
              };
              holdTimer.current = setTimeout(() => {
                const gesture = pointer.current;
                if (!gesture) return;
                gesture.held = true;
                gesture.startX = gesture.x;
                gesture.startY = gesture.y;
                blockReleaseClick();
                setExpanded(true);
                nav.current?.setPointerCapture?.(gesture.id);
                followPointer();
              }, 420);
            }}
            onPointerMove={(event) => {
              const gesture = pointer.current;
              if (!gesture || gesture.id !== event.pointerId) return;
              gesture.x = event.clientX;
              gesture.y = event.clientY;
              const distance = Math.hypot(
                gesture.x - gesture.startX,
                gesture.y - gesture.startY,
              );
              if (gesture.held) {
                gesture.dragged ||= distance > 8;
                if (gesture.dragged) setPreview(hitTab(gesture.x, gesture.y));
              } else if (distance > 10) {
                blockReleaseClick();
                stopGesture();
              }
            }}
            onPointerUp={(event) => {
              const gesture = pointer.current;
              if (!gesture || gesture.id !== event.pointerId) return;
              if (!gesture.held) {
                stopGesture();
                return;
              }
              event.preventDefault();
              blockReleaseClick();
              const selected = hitTab(event.clientX, event.clientY);
              const dragged = gesture.dragged;
              stopGesture();
              if (dragged || selected < 0) collapse();
              if (dragged && selected >= 0) selectTab(selected);
            }}
            onPointerCancel={(event) => {
              if (pointer.current?.id !== event.pointerId) return;
              blockReleaseClick();
              collapse();
            }}
            onLostPointerCapture={(event) => {
              // Touch starts with implicit capture on the pressed link. Its
              // capture loss when ownership moves to this nav is expected.
              if (event.target !== event.currentTarget) return;
              if (pointer.current?.id !== event.pointerId) return;
              blockReleaseClick();
              collapse();
            }}
            onClickCapture={(event) => {
              if (!suppressClick.current) return;
              event.preventDefault();
              event.stopPropagation();
              suppressClick.current = false;
              setHolding(false);
              event.currentTarget.dataset.dockHold = "false";
            }}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={(event) => {
              if (!pointer.current) {
                suppressClick.current = false;
                setHolding(false);
                event.currentTarget.dataset.dockHold = "false";
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setExpanded(true);
              }
            }}
            style={{ "--active-tab": active } as CSSProperties}
          >
            {tripTabs.map((tab, index) => (
              <NavLink
                key={tab.path}
                to={`/trips/${tripId}/${tab.path}`}
                aria-label={tab.label}
                data-preview={preview === index}
                draggable={false}
                aria-keyshortcuts="ArrowUp"
                data-dock-managed={controls ? "" : undefined}
                onClick={(event) => {
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
                    selectTab(index);
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
