import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router";
import { useTravel } from "@/data/travel-provider";
import { placeNumbers } from "@/data/place-numbers";
import { itemDetails } from "@/data/itinerary";
import {
  buildTimeline,
  planPlace,
  timelineEntries,
} from "@/data/plan-timeline";
import type { ItineraryItem } from "@/data/types";
import { addDays, formatDate } from "@/utils/dates";
import { DayStrip } from "./day-strip";
import { registerSquish, spring } from "./cartoon";
import { useJellyScroll } from "./jelly-scroll";
import { TripMenuButton, tripSpan } from "./trip-menu";
import { useItineraryScroll } from "./itinerary-scroll";
import { reduceMotion } from "./motion";
import { AddButton } from "./ui";
import { PlaceDetail } from "./details";
import { Glyph } from "./itinerary-icons";
import { poof, pop, sink } from "./itinerary-motion";
import { TimelineRow, type OpenTarget } from "./itinerary-rows";
import { BookingSheet, PlanSheet } from "./plan-sheet";
import { PlanAddSheet } from "./plan-add";
import { PlanUndoDock } from "./plan-undo";

const UNDO_MS = 4200;
/** The timeline's moving parts (the mock's jelly and cascade selectors). */
const ROWS = ".it-day-h, .it-ev, .it-gap, .it-conn, .it-now, .it-empty";

/** Entrance: the day's rows rise in one by one (kondo-itinerary cascade()). */
function cascadeRows(root: HTMLElement | null) {
  if (!root) return;
  const vh = window.innerHeight;
  [...root.querySelectorAll<HTMLElement>(ROWS)]
    .filter((el) => {
      const y = el.getBoundingClientRect().top;
      return y < vh + 20 && y > -200;
    })
    .forEach((el, i) =>
      spring(
        el,
        [
          { transform: "translateY(34px) scale(.95)", opacity: 0 },
          { transform: "none", opacity: 1 },
        ],
        "boing",
        { delay: 60 + i * 40, fill: "backwards" },
      ),
    );
}

/** The wall clock, ticking each minute, for the travelling view. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function ItineraryScreen() {
  const travel = useTravel();
  const [params] = useSearchParams();
  const now = useNow();
  const [adding, setAdding] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenTarget | null>(null);
  // D2: a deleted plan leaves the しおり at once and is really deleted when 「元に戻す」 times out.
  const [removed, setRemoved] = useState<ItineraryItem | null>(null);
  const removedRef = useRef<ItineraryItem | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [landed, setLanded] = useState<string | null>(null);
  const trip = travel.selectedTrip!;
  const root = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  // Jelly scroll: the rows lag behind a fast scroll and settle on a spring.
  useJellyScroll(root, ROWS);
  // kondo-itinerary's squish table (scale 2-v, v under the finger).
  useEffect(() => {
    const off = [
      registerSquish(".it-ev", 0.97),
      registerSquish(".it-conn, .it-empty button", 0.93),
      registerSquish(".itinerary-screen .floating-add", 0.88),
      registerSquish(".date-strip button", 0.9),
    ];
    return () => off.forEach((undo) => undo());
  }, []);
  // The head and date tabs stay put; days scroll in just under them.
  useLayoutEffect(() => {
    const node = top.current;
    if (!node) return;
    const update = () =>
      root.current?.style.setProperty(
        "--it-top-height",
        `${node.getBoundingClientRect().height}px`,
      );
    update();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(node);
    return () => observer?.disconnect();
  }, []);
  const items = useMemo(
    () => travel.items.filter((item) => item.id !== removed?.id),
    [travel.items, removed?.id],
  );
  const days = useMemo(() => {
    const values = new Set(
      timelineEntries(items, travel.bookings).map((entry) => entry.day),
    );
    for (const booking of travel.bookings) {
      if (booking.kind !== "hotel") continue;
      for (
        let day = booking.day, count = 0;
        day <= booking.endDay && count < 1096;
        day = addDays(day, 1), count++
      )
        values.add(day);
    }
    for (
      let day = trip.startsOn, count = 0;
      day <= trip.endsOn && count < 1096;
      day = addDays(day, 1), count++
    )
      values.add(day);
    return [...values].sort();
  }, [items, travel.bookings, trip.startsOn, trip.endsOn]);
  const timeline = useMemo(
    () =>
      buildTimeline({
        days,
        items,
        bookings: travel.bookings,
        places: travel.places,
        now,
      }),
    [days, items, travel.bookings, travel.places, now],
  );
  const today = timeline.find((day) => day.today)?.day ?? null;
  const numbers = useMemo(
    () => placeNumbers(travel.places, travel.items),
    [travel.places, travel.items],
  );
  const { selectedDay, selectDay } = useItineraryScroll(
    days,
    params.get("day") ?? today ?? trip.startsOn,
  );

  useEffect(() => {
    const day = params.get("day");
    if (!day) return;
    const timer = setTimeout(() => selectDay(day, "instant"), 50);
    return () => clearTimeout(timer);
  }, [params, selectDay]);
  useEffect(() => {
    if (!today && !params.get("day")) cascadeRows(root.current);
    // Only the first paint cascades.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Travelling: open scrolled to いま.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || params.get("day") || !today) return;
    opened.current = true;
    const timer = setTimeout(() => {
      const marker = document.getElementById("itinerary-now");
      if (!marker) return;
      window.scrollTo({
        top: Math.max(
          0,
          marker.getBoundingClientRect().top +
            window.scrollY -
            window.innerHeight * 0.38,
        ),
        behavior: "instant",
      });
      pop(marker.querySelector(".it-now-dot"), 300);
    }, 60);
    return () => clearTimeout(timer);
  }, [today, params]);

  const commitRemoval = useCallback(() => {
    clearTimeout(undoTimer.current);
    const item = removedRef.current;
    removedRef.current = null;
    if (!item) return;
    const place = planPlace(item, travel.places);
    travel.deleteItem(item.id);
    // A place made from this plan's own map link goes with it.
    if (place && itemDetails(item).ownPlace) travel.deletePlace(place.id);
  }, [travel]);
  const commitRef = useRef(commitRemoval);
  commitRef.current = commitRemoval;
  useEffect(() => () => commitRef.current(), []);
  const remove = (item: ItineraryItem) => {
    commitRemoval();
    const card = document.querySelector<HTMLElement>(
      `[data-entry-key="item-${item.id}"] .it-card`,
    );
    void poof(card).then(() => {
      removedRef.current = item;
      setRemoved(item);
      undoTimer.current = setTimeout(() => {
        commitRef.current();
        setRemoved(null);
      }, UNDO_MS);
    });
  };
  const undo = () => {
    clearTimeout(undoTimer.current);
    const item = removedRef.current;
    removedRef.current = null;
    setRemoved(null);
    if (item) setLanded(item.id);
  };
  // A plan that arrives (added or brought back) drops in and flattens on landing.
  useLayoutEffect(() => {
    if (!landed) return;
    const row = document.querySelector<HTMLElement>(
      `[data-entry-key="item-${landed}"]`,
    );
    setLanded(null);
    if (!row) return;
    const box = row.getBoundingClientRect();
    if (box.top < 120 || box.bottom > window.innerHeight - 120)
      window.scrollTo({
        top: Math.max(0, box.top + window.scrollY - window.innerHeight * 0.4),
        behavior: reduceMotion() ? "instant" : "smooth",
      });
    sink(row.querySelector(".it-card"), -60, 120);
    pop(row.querySelector(".it-node"), 300);
  }, [landed, items]);

  const openItem =
    open?.kind === "item"
      ? travel.items.find((item) => item.id === open.id)
      : undefined;
  const listPlace =
    openItem && !itemDetails(openItem).ownPlace
      ? planPlace(openItem, travel.places)
      : undefined;
  return (
    <div className="itinerary-screen" ref={root}>
      <div className="it-top" ref={top}>
        <header className="it-head">
          <h1>
            {trip.name}
            <small>{tripSpan(trip, now)}</small>
          </h1>
          <TripMenuButton tripId={trip.id} />
        </header>
        <DayStrip
          days={days}
          selectedDay={selectedDay}
          today={today}
          onSelect={selectDay}
        />
      </div>
      <div className="it-timeline">
        {timeline.map(({ day, rows }, index) => (
          <section className="it-day" id={`day-${day}`} key={day}>
            <h2 className="it-day-h">
              <span>DAY {String(index + 1).padStart(2, "0")}</span>
              {formatDate(day)}
            </h2>
            {!rows.some((row) => row.type !== "now") && (
              <div className="it-empty">
                <p>まだ予定はありません</p>
                {travel.canEdit && (
                  <button
                    aria-label={`${formatDate(day)}に予定を追加`}
                    onClick={() => setAdding(day)}
                  >
                    <Glyph name="plus" />
                    予定を追加
                  </button>
                )}
              </div>
            )}
            {rows.map((row) => (
              <TimelineRow
                key={row.key}
                row={row}
                places={travel.places}
                numbers={numbers}
                highlight={params.get("item")}
                onOpen={setOpen}
              />
            ))}
          </section>
        ))}
      </div>
      {travel.canEdit && (
        <AddButton
          floating
          label="予定を追加"
          onClick={() => setAdding(selectedDay)}
        />
      )}
      {adding && (
        <PlanAddSheet
          day={adding}
          days={days}
          onClose={() => setAdding(null)}
          onAdded={setLanded}
        />
      )}
      {open?.kind === "item" &&
        (listPlace ? (
          // P1: a plan scheduled from the places list keeps its 「場所の詳細」.
          <PlaceDetail id={listPlace.id} onClose={() => setOpen(null)} />
        ) : (
          <PlanSheet
            id={open.id}
            days={days}
            numbers={numbers}
            onClose={() => setOpen(null)}
            onDelete={remove}
          />
        ))}
      {open?.kind === "booking" && (
        <BookingSheet
          id={open.id}
          endpoint={open.endpoint}
          days={days}
          onClose={() => setOpen(null)}
        />
      )}
      {removed && <PlanUndoDock message="予定を消しました" onUndo={undo} />}
    </div>
  );
}
