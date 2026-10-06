import {
  BookingCard,
  dayLabel,
  isUsed,
  monthDay,
  spring,
  useClockNow,
} from "./booking-card";
import { AddBookingSheet } from "./booking-add";
import { reduceMotion } from "./motion";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PlusIcon } from "./booking-icons";
import { PageTop } from "./page-top";
import { bookingSink } from "./booking-motion";
import { useJellyScroll } from "./jelly-scroll";
import { useSearchParams } from "react-router";
import { BookOpen } from "lucide-react";
import { useTravel } from "@/data/travel-provider";
import { durationMinutes } from "@/data/itinerary";
import {
  findFlightConnections,
  formatConnectionDuration,
} from "@/data/flight-connections";
import type { Booking } from "@/data/types";
import { Empty } from "./ui";
import { BookingDetail } from "./details";

export { ItineraryScreen } from "./itinerary-screen";
export { timelineEntries, type Entry } from "@/data/plan-timeline";
export function BookingsScreen() {
  const { bookings, canEdit, selectedTrip } = useTravel();
  const [id, setId] = useState<string | null>(null);
  // しおり links here with ?booking=<id> to open that booking directly.
  const [params, setParams] = useSearchParams();
  const linked = params.get("booking");
  useEffect(() => {
    if (!linked || !bookings.some((booking) => booking.id === linked)) return;
    setId(linked);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("booking");
        return next;
      },
      { replace: true },
    );
  }, [linked, bookings, setParams]);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const now = useClockNow();
  const page = useRef<HTMLDivElement>(null);
  useJellyScroll(page, ".bk-card, .bk-dayh, .bk-conn");
  // The list sinks in, card by card (the mock's first render: 40 ms apart).
  useLayoutEffect(() => {
    page.current
      ?.querySelectorAll<HTMLElement>(".bk-card, .bk-dayh")
      .forEach((element, index) => bookingSink(element, -20, index * 40));
  }, []);
  // A stamp spins in only when a booking turns 済 while this screen is open.
  const wasUsed = useRef<Map<string, boolean> | null>(null);
  const previous = wasUsed.current;
  useEffect(() => {
    wasUsed.current = new Map(
      bookings.map((booking) => [booking.id, isUsed(booking, now)]),
    );
  });
  const connections = useMemo(
    () => findFlightConnections(bookings),
    [bookings],
  );
  const days = useMemo(() => {
    const groups: { day: string; bookings: Booking[] }[] = [];
    for (const booking of bookings) {
      const last = groups.at(-1);
      if (last?.day === booking.day) last.bookings.push(booking);
      else groups.push({ day: booking.day, bookings: [booking] });
    }
    return groups;
  }, [bookings]);
  useEffect(() => {
    if (!added.length) return;
    const cards = added
      .map((entry) =>
        document.querySelector(`.bookings-page [data-booking="${entry}"]`),
      )
      .filter(Boolean);
    cards[0]?.scrollIntoView({
      block: "center",
      behavior: reduceMotion() ? "auto" : "smooth",
    });
    cards.forEach((card, index) =>
      spring(
        card,
        [{ transform: "scale(.8) rotate(-3deg)" }, { transform: "none" }],
        "boing",
        { delay: index * 120, fill: "backwards" },
      ),
    );
    setAdded([]);
  }, [added]);
  const tripDay = (day: string) => {
    if (!selectedTrip?.startsOn || !day) return "";
    const index =
      Math.round(
        (new Date(`${day}T12:00:00`).getTime() -
          new Date(`${selectedTrip.startsOn}T12:00:00`).getTime()) /
          864e5,
      ) + 1;
    return index >= 1 ? `${index}日目` : "";
  };
  return (
    <div className="page page-scroll bookings-page" ref={page}>
      <PageTop
        sub={
          tripDay(now.slice(0, 10)) &&
          now.slice(0, 10) <= (selectedTrip?.endsOn ?? "")
            ? `旅の${tripDay(now.slice(0, 10))} · ${monthDay(now.slice(0, 10))} ${now.slice(11)}`
            : `${selectedTrip?.name ? `${selectedTrip.name} · ` : ""}${bookings.length}件`
        }
        title="予約"
        actions={
          canEdit && (
            <button
              type="button"
              className="page-plus"
              aria-label="予約を追加"
              onClick={() => setAdding(true)}
            >
              <PlusIcon size={20} />
            </button>
          )
        }
      />
      {!bookings.length ? (
        <Empty>
          <BookOpen />
          <h2>予約はまだありません</h2>
          <p>予約確認のスクショやPDFから取り込めます。</p>
        </Empty>
      ) : (
        <div className="bk-list">
          {days.map((group) => (
            <section key={group.day || "undated"} className="bk-day">
              <h3 className="bk-dayh">
                <b>{group.day ? dayLabel(group.day) : "日付未定"}</b>
                <span>{tripDay(group.day)}</span>
              </h3>
              {group.bookings.map((booking) => {
                const connection = connections.find(
                  (entry) => entry.arrivalBookingId === booking.id,
                );
                return (
                  <Fragment key={booking.id}>
                    <BookingCard
                      booking={booking}
                      now={now}
                      spinStamp={
                        previous?.get(booking.id) === false &&
                        isUsed(booking, now)
                      }
                      onOpen={() => setId(booking.id)}
                    />
                    {connection && (
                      <p className="bk-conn">
                        {connection.airportName}で乗り継ぎ ·{" "}
                        {formatConnectionDuration(connection.durationMinutes)}
                      </p>
                    )}
                  </Fragment>
                );
              })}
            </section>
          ))}
        </div>
      )}
      {adding && (
        <AddBookingSheet
          onClose={() => setAdding(false)}
          onAdded={(ids) => setAdded(ids)}
        />
      )}
      {id && <BookingDetail id={id} onClose={() => setId(null)} />}
    </div>
  );
}
export { PlacesScreen } from "./places-screen";
export { NotesScreen } from "./notes-screen";
