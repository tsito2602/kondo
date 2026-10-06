import { useEffect, useLayoutEffect, useRef } from "react";
import { Live, RM } from "./cartoon";
import { reduceMotion } from "./motion";

const longDate = (day: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${day}T12:00:00`));

/** kondo-itinerary's pill: its two edges ride their own springs. The edge on
    the side it travels to leads (k700/d34) and the other follows 40 ms later
    on the softer split spring (k230/d21), so it stretches and catches up. */
function usePillEdges(pill: React.RefObject<HTMLSpanElement | null>) {
  const edges = useRef<{
    L: Live;
    R: Live;
    tm?: ReturnType<typeof setTimeout>;
  } | null>(null);
  if (!edges.current) {
    let l = 0;
    let r = 0;
    const draw = () => {
      const el = pill.current;
      if (!el) return;
      el.style.left = `${Math.min(l, r)}px`;
      el.style.width = `${Math.abs(r - l)}px`;
    };
    edges.current = {
      L: new Live(0, (v) => {
        l = v;
        draw();
      }),
      R: new Live(0, (v) => {
        r = v;
        draw();
      }),
    };
  }
  useEffect(
    () => () => {
      const E = edges.current!;
      clearTimeout(E.tm);
      E.L.stop();
      E.R.stop();
    },
    [],
  );
  return (L: number, R: number, animate: boolean) => {
    const E = edges.current!;
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
  };
}

/** The trip's days in the header (tapped rarely, so outside thumb reach). */
export function DayStrip({
  days,
  selectedDay,
  today,
  onSelect,
}: {
  days: string[];
  selectedDay: string;
  /** While travelling, today's tab carries a dot. */
  today?: string | null;
  onSelect: (day: string, behavior: ScrollBehavior) => void;
}) {
  const strip = useRef<HTMLElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  const moveEdges = usePillEdges(indicator);
  const placed = useRef(false);
  useLayoutEffect(() => {
    const rail = strip.current!;
    const active = rail.querySelector<HTMLElement>('[aria-current="date"]');
    if (!active) return;
    const place = (animate: boolean) =>
      moveEdges(
        active.offsetLeft,
        active.offsetLeft + active.offsetWidth,
        animate,
      );
    place(placed.current);
    const first = !placed.current;
    placed.current = true;
    const bounds = active.getBoundingClientRect();
    const container = rail.getBoundingClientRect();
    if (bounds.left < container.left || bounds.right > container.right) {
      rail.scrollTo({
        left:
          rail.scrollLeft +
          bounds.left -
          container.left -
          (rail.clientWidth - bounds.width) / 2,
        behavior: first || reduceMotion() ? "instant" : "smooth",
      });
    }
    // Faces arriving late change the tabs' widths: settle without motion.
    let alive = true;
    if (first) void document.fonts?.ready.then(() => alive && place(false));
    // Only a real change of size re-places it (the first callback is not one).
    let width = rail.clientWidth;
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (rail.clientWidth === width) return;
            width = rail.clientWidth;
            place(false);
          });
    observer?.observe(rail);
    return () => {
      alive = false;
      observer?.disconnect();
    };
    // moveEdges is stable in behaviour (it reads refs only).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, selectedDay]);
  return (
    <nav
      ref={strip}
      className="date-strip"
      aria-label="旅の日付"
      data-live={today ? "true" : undefined}
    >
      <span ref={indicator} className="date-selection" aria-hidden="true" />
      {days.map((day, index) => (
        <button
          id={`date-tab-${day}`}
          key={day}
          className={selectedDay === day ? "on" : undefined}
          aria-current={selectedDay === day ? "date" : undefined}
          aria-label={`DAY ${index + 1} ${longDate(day)}${today === day ? "（今日）" : ""}`}
          onClick={() => onSelect(day, reduceMotion() ? "instant" : "smooth")}
        >
          <small>DAY {index + 1}</small>
          <span>{Number(day.slice(8, 10))}</span>
          {today === day && <i className="date-today" aria-hidden="true" />}
        </button>
      ))}
    </nav>
  );
}
