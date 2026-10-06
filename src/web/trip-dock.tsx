import {
  startTransition,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Live, RM } from "./cartoon";
import { DockBackIcon, DockGroup } from "./cartoon-dock";
import { DockNavigationContext } from "./thumb-dock";
import { useContext } from "react";

// The trip dock (kondo-prep3.html, kondo-memo.html, kondo-bookings.html): the
// back circle on the left island and six icon-only tabs on the right one, each
// tab named by its aria-label. The selection is an icon pill whose two edges
// run on springs, the leading edge first (kondo-cartoon §3 and §9).

const icon = (paths: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {paths}
  </svg>
);

/** The mocks' TABI table: route, label and icon. */
export const tripTabs = [
  {
    path: "itinerary",
    label: "しおり",
    icon: icon(
      <path d="M4 5c3-1 5-1 8 1v14c-3-2-5-2-8-1zM20 5c-3-1-5-1-8 1v14c3-2 5-2 8-1z" />,
    ),
  },
  {
    path: "places",
    label: "場所",
    icon: icon(
      <>
        <path d="M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11z" />
        <circle cx="12" cy="10" r="2" />
      </>,
    ),
  },
  {
    path: "tasks",
    label: "やること",
    icon: icon(<path d="M4 7l2 2 3-3M4 15l2 2 3-3M12 8h8M12 16h8" />),
  },
  {
    path: "packing",
    label: "持ち物",
    icon: icon(
      <>
        <rect x="4" y="8" width="16" height="12" rx="3" />
        <path d="M9 8a3 3 0 0 1 6 0" />
      </>,
    ),
  },
  {
    path: "bookings",
    label: "予約",
    icon: icon(
      <>
        <path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z" />
        <path d="M12 7v10" strokeDasharray="2 2" />
      </>,
    ),
  },
  {
    path: "notes",
    label: "メモ",
    icon: icon(
      <>
        <path d="M5 4h10l4 4v12H5z" />
        <path d="M8 12h8M8 16h5" />
      </>,
    ),
  },
];

/** Two edges on two springs; moving right, the right edge leads (40 ms). */
function edges(el: HTMLElement) {
  let l = 0,
    r = 0;
  const draw = () => {
    el.style.left = Math.min(l, r) + "px";
    el.style.width = Math.abs(r - l) + "px";
  };
  return {
    L: new Live(0, (v) => ((l = v), draw())),
    R: new Live(0, (v) => ((r = v), draw())),
    tm: 0 as ReturnType<typeof setTimeout> | 0,
  };
}
type Edges = ReturnType<typeof edges>;
export function moveEdges(E: Edges, L: number, R: number, animate: boolean) {
  clearTimeout(E.tm);
  if (!animate || RM()) {
    E.L.set(L);
    E.R.set(R);
    return;
  }
  const right = L > E.L.t;
  void (right ? E.R : E.L).to(right ? R : L, "lead");
  E.tm = setTimeout(
    () => void (right ? E.L : E.R).to(right ? L : R, "split"),
    40,
  );
}

/** The trip's dock: back to the trip list, and the six tabs. */
export function TripDock({
  tripId,
  onBack,
}: {
  tripId: string;
  onBack: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const controls = useContext(DockNavigationContext);
  const active = tripTabs.findIndex((tab) =>
    location.pathname.endsWith(`/${tab.path}`),
  );
  const [pending, setPending] = useState(-1);
  const shown = pending >= 0 ? pending : active;
  const group = useRef<HTMLDivElement>(null);
  const ind = useRef<HTMLSpanElement>(null);
  const springs = useRef<Edges | null>(null);
  const placed = useRef(false);
  useLayoutEffect(() => setPending(-1), [location.pathname]);
  useLayoutEffect(() => {
    const node = group.current,
      pill = ind.current;
    if (!node || !pill) return;
    springs.current ??= edges(pill);
    const place = (animate: boolean) => {
      const link = node.querySelectorAll<HTMLElement>("a")[shown];
      if (!link) {
        pill.style.width = "0px";
        return;
      }
      moveEdges(
        springs.current!,
        link.offsetLeft,
        link.offsetLeft + link.offsetWidth,
        animate,
      );
    };
    // The first placement (and a return from a detail) is instant, as in the mock.
    place(placed.current);
    placed.current = true;
    // Only a real change of width re-places the pill at once; observe()
    // reports the current size straight away, which must not cut the move.
    let width = node.offsetWidth;
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (node.offsetWidth === width) return;
            width = node.offsetWidth;
            place(false);
          });
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [shown]);
  const select = (index: number) => {
    setPending(index);
    const to = `/trips/${tripId}/${tripTabs[index].path}`;
    // The mocks swap the pane at once (no page slide) while the pill runs;
    // rendering the next screen as a transition keeps the pill's frames.
    if (controls) controls.beforeNavigate(() => navigate(to));
    else startTransition(() => void navigate(to));
  };
  return (
    <>
      <DockGroup slot="l" className="context-back">
        <button
          type="button"
          className="cdock-btn"
          aria-label={controls ? "戻る" : "旅行一覧へ戻る"}
          onClick={controls?.back ?? onBack}
        >
          <DockBackIcon />
        </button>
      </DockGroup>
      <div
        ref={group}
        className="cdock-group cdock-tabs"
        data-slot="tabs"
        role="navigation"
        aria-label="旅行のページ"
      >
        <span ref={ind} className="cdock-ind" aria-hidden="true" />
        {tripTabs.map((tab, index) => (
          <Link
            key={tab.path}
            to={`/trips/${tripId}/${tab.path}`}
            aria-label={tab.label}
            aria-current={index === shown ? "page" : undefined}
            data-on={index === shown}
            data-dock-managed=""
            draggable={false}
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
              if (index !== active || controls) select(index);
            }}
          >
            {tab.icon}
          </Link>
        ))}
      </div>
    </>
  );
}
