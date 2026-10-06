import { useLayoutEffect, useRef } from "react";
import { reduceMotion } from "./motion";

const longDate = (day: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${day}T12:00:00`));

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
  useLayoutEffect(() => {
    const rail = strip.current!;
    const marker = indicator.current!;
    const active = rail.querySelector<HTMLElement>('[aria-current="date"]');
    if (!active) return;
    const measure = () => {
      marker.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
      marker.style.width = `${active.offsetWidth}px`;
      marker.style.height = `${active.offsetHeight}px`;
    };
    measure();
    const first = !rail.dataset.ready;
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
    const frame = requestAnimationFrame(() => {
      rail.dataset.ready = "true";
    });
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(rail);
    observer?.observe(active);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [days, selectedDay]);
  return (
    <nav ref={strip} className="date-strip" aria-label="旅の日付">
      <span ref={indicator} className="date-selection" aria-hidden="true" />
      {days.map((day, index) => (
        <button
          id={`date-tab-${day}`}
          key={day}
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
