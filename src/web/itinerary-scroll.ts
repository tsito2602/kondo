import { useCallback, useEffect, useRef, useState } from "react";

/** Keep explicit date selection stable while passing intermediate sections. */
export function useItineraryScroll(days: string[], initialDay: string) {
  const [selectedDay, setSelectedDay] = useState(initialDay);
  const pending = useRef<string | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const settle = useCallback(() => {
    pending.current = null;
    clearTimeout(settleTimer.current);
  }, []);
  const waitForRest = useCallback(() => {
    clearTimeout(settleTimer.current);
    // Fallback for browsers without scrollend, and already-visible targets.
    settleTimer.current = setTimeout(settle, 180);
  }, [settle]);
  const selectDay = useCallback(
    (day: string, behavior: ScrollBehavior) => {
      const section = document.getElementById(`day-${day}`);
      if (!section) return;
      pending.current = day;
      setSelectedDay(day);
      section.scrollIntoView({ block: "start", behavior });
      waitForRest();
    },
    [waitForRest],
  );

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      if (pending.current) return;
      const sections = days.flatMap((day) => {
        const node = document.getElementById(`day-${day}`);
        return node ? [{ day, bounds: node.getBoundingClientRect() }] : [];
      });
      if (!sections.length || !sections.some(({ bounds }) => bounds.height))
        return;
      const boundary =
        (document.querySelector(".date-strip")?.getBoundingClientRect()
          .bottom ?? 0) + 24;
      const atBottom =
        window.scrollY > 0 &&
        Math.ceil(window.scrollY + window.innerHeight) >=
          document.documentElement.scrollHeight - 2;
      const active = atBottom
        ? sections.at(-1)
        : (sections.filter(({ bounds }) => bounds.top <= boundary).at(-1) ??
          sections[0]);
      if (active) setSelectedDay(active.day);
    };
    const schedule = () => {
      if (pending.current) waitForRest();
      if (!frame) frame = requestAnimationFrame(update);
    };
    const interrupt = () => {
      settle();
      schedule();
    };
    const key = (event: KeyboardEvent) => {
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "PageUp",
          "PageDown",
          "Home",
          "End",
          " ",
        ].includes(event.key)
      )
        interrupt();
    };
    // An old scrollend can arrive after a second date click. The idle debounce
    // is deliberately shared by all requests so it cannot unlock a newer one.
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("wheel", interrupt, { passive: true });
    window.addEventListener("touchstart", interrupt, { passive: true });
    window.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(frame);
      settle();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("wheel", interrupt);
      window.removeEventListener("touchstart", interrupt);
      window.removeEventListener("keydown", key);
    };
  }, [days, settle, waitForRest]);

  return { selectedDay, selectDay };
}
