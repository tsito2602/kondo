import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { NavLink, useLocation, useNavigate } from "react-router";
import {
  ArrowLeft,
  BookOpen,
  ListChecks,
  MapPin,
  MoreHorizontal,
  NotebookPen,
  Ticket,
} from "lucide-react";

import { reduceMotion, startRouteTransition } from "./motion";
import { ios } from "./haptics";
import { animateDockPress, DockSurface } from "./dock-surface";
import { DockNavigationContext, SharedDockSurfaceContext } from "./thumb-dock";

export const tripTabs = [
  { path: "itinerary", label: "しおり", icon: BookOpen },
  { path: "places", label: "行きたい場所", icon: MapPin },
  { path: "packing", label: "準備", icon: ListChecks },
  { path: "bookings", label: "予約", icon: Ticket },
  { path: "notes", label: "メモ", icon: NotebookPen },
];

/** Preview on contact, scrub immediately, or hold to expand the detail dock. */
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
  const previousControls = useRef(controls);
  if (controls) previousControls.current = controls;
  const sideControls = controls ?? previousControls.current;
  const detail = Boolean(controls);
  const split = detail && !expanded;
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
  const tapTab = useRef(-1);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [holding, setHolding] = useState(false);
  const [preview, setPreview] = useState(-1);
  const [touching, setTouching] = useState(false);
  const [pending, setPending] = useState(-1);
  const frame = useRef<number | undefined>(undefined);
  const transition = useRef<ViewTransition | undefined>(undefined);
  const nav = useRef<HTMLElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const pressAnimation = useRef<Animation | undefined>(undefined);
  const sharedSurface = useContext(SharedDockSurfaceContext);
  const pressDock = (pressed: boolean) => {
    if (dock.current)
      pressAnimation.current = animateDockPress(
        dock.current.closest<HTMLElement>(".thumb-dock") ?? dock.current,
        pressed,
        pressAnimation.current,
      );
  };
  const restoreFocus = useRef(false);
  const active = tripTabs.findIndex((tab) =>
    location.pathname.endsWith(`/${tab.path}`),
  );
  const stopGesture = () => {
    clearTimeout(holdTimer.current);
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    const id = pointer.current?.id;
    if (id !== undefined) pressDock(false);
    pointer.current = null;
    setTouching(false);
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
    if (!gesture) return;
    setPreview(hitTab(gesture.x, gesture.y));
    // Tabs move while the material expands; hit-test their live positions.
    frame.current = requestAnimationFrame(followPointer);
  };
  const collapse = () => {
    stopGesture();
    restoreFocus.current = true;
    setExpanded(false);
  };
  const selectTab = (index: number) => {
    setPending(index);
    const to = `/trips/${tripId}/${tripTabs[index].path}`;
    if (controls) {
      controls.beforeNavigate(() => navigate(to));
    } else if (
      typeof document.startViewTransition === "function" &&
      !reduceMotion()
    ) {
      document.documentElement.style.setProperty(
        "--route-direction",
        String(index < active ? -1 : 1),
      );
      transition.current?.skipTransition();
      transition.current = startRouteTransition(() => navigate(to));
    } else {
      navigate(to);
    }
  };
  const commitTap = () => {
    clearTimeout(tapTimer.current);
    const index = tapTab.current;
    tapTab.current = -1;
    if (index >= 0) selectTab(index);
  };
  useEffect(
    () => () => {
      clearTimeout(tapTimer.current);
      clearTimeout(holdTimer.current);
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      transition.current?.skipTransition();
      pressAnimation.current?.cancel();
    },
    [],
  );
  useLayoutEffect(() => {
    stopGesture();
    setExpanded(false);
  }, [detail]);
  useLayoutEffect(() => setPending(-1), [location.pathname]);
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
      <div
        ref={dock}
        className="safari-dock"
        data-expanded={expanded}
        data-wide={!split}
        data-level={detail ? "detail" : "trip"}
        data-touching={touching}
      >
        {!sharedSurface && <DockSurface split={split} />}
        <div
          className="safari-side safari-left"
          inert={!split}
          aria-hidden={!split}
        >
          <button
            className="safari-side-button"
            aria-label="詳細を閉じて戻る"
            onClick={sideControls?.back}
          >
            <ArrowLeft size={22} />
          </button>
        </div>
        <div
          className="safari-side safari-right"
          inert={!split}
          aria-hidden={!split}
        >
          {sideControls?.action ? (
            <div className="safari-side-button safari-detail-action">
              {sideControls.action}
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
          <nav
            ref={nav}
            className="safari-tabs"
            aria-label="旅行のページ"
            data-dock-hold={holding}
            data-scrubbing={preview >= 0}
            data-no-haptic={ios || undefined}
            onPointerDown={(event) => {
              if (
                event.button !== 0 ||
                !event.isPrimary ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              transition.current?.skipTransition();
              stopGesture();
              suppressClick.current = false;
              setHolding(false);
              event.currentTarget.dataset.dockHold = "false";
              pointer.current = {
                id: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                startX: event.clientX,
                startY: event.clientY,
                held: false,
                dragged: false,
              };
              setTouching(true);
              pressDock(true);
              setPreview(hitTab(event.clientX, event.clientY));
              // On iPhone a touch stays implicitly captured by the haptic
              // label, so a tap's click lands on it and toggles its switch.
              if (!(ios && event.pointerType === "touch"))
                nav.current?.setPointerCapture?.(event.pointerId);
              followPointer();
              if (expanded) return;
              holdTimer.current = setTimeout(() => {
                const gesture = pointer.current;
                if (!gesture) return;
                gesture.held = true;
                blockReleaseClick();
                setExpanded(true);
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
              gesture.dragged ||= distance > 8;
              setPreview(hitTab(gesture.x, gesture.y));
              if (gesture.dragged && !gesture.held)
                clearTimeout(holdTimer.current);
            }}
            onPointerUp={(event) => {
              const gesture = pointer.current;
              if (!gesture || gesture.id !== event.pointerId) return;
              event.preventDefault();
              const selected = hitTab(event.clientX, event.clientY);
              const dragged = gesture.dragged;
              const commit = !gesture.held || dragged;
              // An iPhone tap's click must reach the haptic label (that is
              // what ticks), so the tab is chosen after it; every other
              // release click is swallowed.
              const tap =
                ios &&
                event.pointerType === "touch" &&
                !gesture.held &&
                !dragged;
              if (!tap) blockReleaseClick();
              stopGesture();
              if (commit || selected < 0) collapse();
              if (tap && selected >= 0) {
                tapTab.current = selected;
                clearTimeout(tapTimer.current);
                tapTimer.current = setTimeout(commitTap, 350);
                return;
              }
              if (commit && selected >= 0) selectTab(selected);
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
            style={
              {
                "--selection-tab":
                  preview >= 0
                    ? preview
                    : pending >= 0
                      ? pending
                      : Math.max(0, active),
              } as CSSProperties
            }
          >
            <span className="safari-selection" aria-hidden="true" />
            {ios && <TabHaptic onToggle={commitTap} />}
            {tripTabs.map((tab, index) => (
              <NavLink
                key={tab.path}
                to={`/trips/${tripId}/${tab.path}`}
                aria-label={tab.label}
                data-preview={preview === index}
                draggable={false}
                aria-keyshortcuts="ArrowUp"
                data-dock-managed=""
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
                  event.preventDefault();
                  selectTab(index);
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

/** iPhone ticks only when a real tap toggles a native switch. One transparent
    label covers the tabs; the tab itself was chosen by the pointer gesture and
    is committed once the switch has toggled. */
function TabHaptic({ onToggle }: { onToggle: () => void }) {
  return (
    <label
      className="haptic-touch safari-tabs-haptic"
      aria-hidden="true"
      onClick={(event) => event.stopPropagation()}
    >
      <input
        type="checkbox"
        {...{ switch: "" }}
        className="haptic-touch"
        tabIndex={-1}
        onChange={onToggle}
      />
    </label>
  );
}
