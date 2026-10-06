import { PlaceStatusLabel } from "./place-status";
import { DayStrip } from "./day-strip";
import { BookingTicketContent } from "./booking-ticket";
import {
  dayTimeline,
  isJourney,
  JourneyPair,
  StayCards,
  StayCard,
} from "./itinerary-bookings";
import { PlaceCard } from "./place-card";
import { CalendarPanel } from "./date-picker";
import { TripCover } from "./trip-cover";
import { useItineraryScroll } from "./itinerary-scroll";
import { reduceMotion } from "./motion";
import { ThumbAction } from "./thumb-dock";
import { Button } from "./obsidian/button";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import {
  Camera,
  ShoppingBag,
  type LucideIcon,
  BookOpen,
  Plus,
  MapPin,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  CircleCheck,
  Route as RouteIcon,
  Clock,
  Hotel,
  TrainFront,
  Car,
  Utensils,
  Ticket,
  CalendarDays,
} from "lucide-react";
import { Badge } from "./obsidian/badge";
import { useTravel } from "@/data/travel-provider";
import { addDays, formatDate } from "@/utils/dates";
import {
  durationLabel,
  durationMinutes,
  itemDetails,
  itemCategory,
  orderItineraryEntries,
  transportLabel,
} from "@/data/itinerary";
import {
  findFlightConnections,
  formatConnectionDuration,
} from "@/data/flight-connections";
import { placeStatuses } from "@/data/places";
import type {
  Booking,
  Place,
  ItineraryItem,
  ItineraryCategory,
} from "@/data/types";
import { AddButton, Empty, ThumbTools, Field } from "./ui";
import {
  BookingEditor,
  ItemEditor,
  PlaceEditor,
  bookingKinds,
} from "./editors";
import { BookingDetail, ItemDetail, PlaceDetail } from "./details";

export type Entry = {
  key: string;
  day: string;
  time: string;
  title: string;
  item?: ItineraryItem;
  booking?: Booking;
  stage?: string;
  endpoint?: "start" | "end";
};
const stages = {
  flight: ["出発", "到着"],
  hotel: ["チェックイン", "チェックアウト"],
  train: ["乗車", "到着"],
  car: ["受取", "返却"],
  restaurant: ["予約", "終了"],
  ticket: ["利用", "終了"],
  other: ["予約", "終了"],
};
const bookingIcons = {
  flight: Plane,
  hotel: Hotel,
  train: TrainFront,
  car: Car,
  restaurant: Utensils,
  ticket: Ticket,
  other: BookOpen,
};
const itineraryIcons = {
  sightseeing: Camera,
  meal: Utensils,
  transport: RouteIcon,
  shopping: ShoppingBag,
  other: CalendarDays,
} satisfies Record<ItineraryCategory, LucideIcon>;
export function timelineEntries(
  items: ItineraryItem[],
  bookings: Booking[],
): Entry[] {
  return orderItineraryEntries([
    ...items.map((item) => ({
      key: `item-${item.id}`,
      day: item.day,
      time: item.time,
      title: item.title,
      item,
    })),
    ...bookings.flatMap((booking) => {
      const entries: Entry[] = [
        {
          key: `booking-${booking.id}-start`,
          day: booking.day,
          time: booking.time,
          title: booking.title,
          booking,
          stage: stages[booking.kind][0],
          endpoint: "start",
        },
      ];
      if (
        (booking.endDay || booking.endTime) &&
        ((booking.endDay && booking.endDay !== booking.day) ||
          (booking.endTime && booking.endTime !== booking.time))
      )
        entries.push({
          key: `booking-${booking.id}-end`,
          day: booking.endDay || booking.day,
          time: booking.endTime,
          title: booking.title,
          booking,
          stage: stages[booking.kind][1],
          endpoint: "end",
        });
      return entries;
    }),
  ]);
}
export function ItineraryScreen() {
  const travel = useTravel();
  const [params] = useSearchParams();
  const [adding, setAdding] = useState<string | null>(null);
  const [datePicker, setDatePicker] = useState(false);
  const [detail, setDetail] = useState<{
    type: "item" | "booking";
    id: string;
  } | null>(null);
  const entries = useMemo(
    () => timelineEntries(travel.items, travel.bookings),
    [travel.items, travel.bookings],
  );
  const days = useMemo(() => {
    const values = new Set(entries.map((entry) => entry.day));
    for (const booking of travel.bookings) {
      if (booking.kind !== "hotel") continue;
      for (
        let day = booking.day, count = 0;
        day <= booking.endDay && count < 1096;
        day = addDays(day, 1), count++
      )
        values.add(day);
    }
    const trip = travel.selectedTrip!;
    for (
      let day = trip.startsOn, count = 0;
      day <= trip.endsOn && count < 1096;
      day = addDays(day, 1), count++
    )
      values.add(day);
    return [...values].sort();
  }, [entries, travel.selectedTrip, travel.bookings]);
  const { selectedDay, selectDay } = useItineraryScroll(
    days,
    params.get("day") ?? travel.selectedTrip!.startsOn,
  );
  useEffect(() => {
    const day = params.get("day");
    if (!day) return;
    const timer = setTimeout(() => selectDay(day, "instant"), 50);
    return () => clearTimeout(timer);
  }, [params, selectDay]);
  const connections = findFlightConnections(travel.bookings);
  return (
    <>
      <ThumbAction>
        <button
          className="thumb-control"
          onClick={() => setDatePicker(true)}
          aria-label="日付を選ぶ"
        >
          <CalendarDays size={18} />
          {selectedDay.slice(5).replace("-", "/")}
        </button>
      </ThumbAction>
      {datePicker && (
        <CalendarPanel
          label="日付を選ぶ"
          required
          value={selectedDay}
          allowedDates={days}
          min={days[0]}
          max={days.at(-1)}
          onChange={(day) =>
            requestAnimationFrame(() =>
              selectDay(day, reduceMotion() ? "instant" : "smooth"),
            )
          }
          onClose={() => setDatePicker(false)}
        />
      )}
      {travel.selectedTrip!.coverImage && (
        <section className="itinerary-cover" aria-label="旅行のカバー">
          <TripCover
            id={travel.selectedTrip!.id}
            src={travel.selectedTrip!.coverImage}
          />
          <div className="itinerary-cover-caption">
            <span>{travel.selectedTrip!.destination}</span>
            <h2>{travel.selectedTrip!.name}</h2>
          </div>
        </section>
      )}
      <DayStrip days={days} selectedDay={selectedDay} onSelect={selectDay} />
      <div className="page timeline">
        {days.map((day, index) => {
          const dayEntries = dayTimeline(entries, day);
          return (
            <section className="day-section" id={`day-${day}`} key={day}>
              <div className="day-heading">
                <span className="eyebrow">
                  DAY {String(index + 1).padStart(2, "0")}
                </span>
                <h2>{formatDate(day)}</h2>
              </div>
              <StayCards
                bookings={travel.bookings}
                day={day}
                onOpen={(id) => setDetail({ type: "booking", id })}
              />
              {!dayEntries.length && (
                <button
                  className="timeline-entry timeline-empty"
                  disabled={!travel.canEdit}
                  aria-label={
                    travel.canEdit
                      ? `${formatDate(day)}に予定を追加`
                      : undefined
                  }
                  onClick={() => setAdding(day)}
                >
                  <div data-press-card>
                    <p>まだ予定はありません</p>
                    {travel.canEdit && (
                      <span className="empty-add">
                        <Plus size={16} />
                        予定を追加
                      </span>
                    )}
                  </div>
                </button>
              )}
              {dayEntries.map((entry) => {
                if (entry.booking?.kind === "hotel")
                  return (
                    <StayCard
                      key={entry.key}
                      booking={entry.booking}
                      endpoint={entry.endpoint}
                      onOpen={(id) => setDetail({ type: "booking", id })}
                    />
                  );
                const ItemIcon = entry.item
                  ? itineraryIcons[itemCategory(entry.item).value]
                  : CalendarDays;
                const BookingIcon = entry.booking
                  ? entry.booking.kind === "flight"
                    ? entry.endpoint === "end"
                      ? PlaneLanding
                      : PlaneTakeoff
                    : entry.booking.kind === "train" && entry.endpoint === "end"
                      ? MapPin
                      : bookingIcons[entry.booking.kind]
                  : BookOpen;
                const transport =
                  entry.item &&
                  itemDetails(entry.item).category === "transport";
                const connection =
                  entry.booking &&
                  (entry.stage === "到着" || entry.joinedArrival) &&
                  connections.find(
                    (connection) =>
                      connection.arrivalBookingId === entry.booking!.id,
                  );
                return (
                  <div key={entry.key}>
                    <button
                      id={entry.item ? `item-${entry.item.id}` : undefined}
                      className={`timeline-entry ${transport ? "transport-entry" : ""} ${isJourney(entry.booking) ? "journey-entry" : ""} ${params.get("item") === entry.item?.id ? "highlight" : ""}`}
                      onClick={() =>
                        setDetail({
                          type: entry.item ? "item" : "booking",
                          id: (entry.item ?? entry.booking)!.id,
                        })
                      }
                    >
                      <time>{entry.time || "未定"}</time>
                      <span
                        className="timeline-marker"
                        data-endpoint={
                          entry.joinedArrival
                            ? "both"
                            : isJourney(entry.booking)
                              ? entry.endpoint
                              : undefined
                        }
                        aria-hidden="true"
                      >
                        {entry.item ? (
                          <ItemIcon size={17} />
                        ) : entry.booking ? (
                          <BookingIcon size={17} />
                        ) : (
                          <span />
                        )}
                        {entry.joinedArrival &&
                          (entry.booking?.kind === "flight" ? (
                            <PlaneLanding size={17} />
                          ) : (
                            <MapPin size={17} />
                          ))}
                      </span>
                      <div data-press-card>
                        <small>
                          {entry.item
                            ? transport
                              ? `${transportLabel(itemDetails(entry.item))} ${durationLabel(durationMinutes(entry.item.day, entry.item.time, itemDetails(entry.item)))}`
                              : itemCategory(entry.item).label
                            : isJourney(entry.booking)
                              ? `${entry.booking!.kind === "flight" ? "フライト" : "鉄道"}${entry.endpoint === "end" ? " · 到着" : ""}`
                              : entry.stage}
                        </small>
                        <h3>{entry.title}</h3>
                        {entry.booking && isJourney(entry.booking) ? (
                          <JourneyPair
                            booking={entry.booking}
                            arrival={entry.endpoint === "end"}
                          />
                        ) : (
                          entry.booking && (
                            <p className="muted">
                              {entry.booking.originCode || entry.booking.origin}
                              {entry.booking.destinationCode ||
                              entry.booking.destination
                                ? " → "
                                : ""}
                              {entry.booking.destinationCode ||
                                entry.booking.destination}
                            </p>
                          )
                        )}
                      </div>
                    </button>
                    {connection && (
                      <button
                        className="connection-strip"
                        onClick={() =>
                          setDetail({ type: "booking", id: entry.booking!.id })
                        }
                      >
                        <Clock size={14} />
                        {connection.airportCode} 乗り継ぎ{" "}
                        {formatConnectionDuration(connection.durationMinutes)}
                      </button>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
      {travel.canEdit && (
        <AddButton
          floating
          label="予定を追加"
          onClick={() => setAdding(selectedDay)}
        />
      )}
      {adding && <ItemEditor day={adding} onClose={() => setAdding(null)} />}
      {detail?.type === "item" && (
        <ItemDetail id={detail.id} onClose={() => setDetail(null)} />
      )}
      {detail?.type === "booking" && (
        <BookingDetail id={detail.id} onClose={() => setDetail(null)} />
      )}
    </>
  );
}
export function BookingsScreen() {
  const { bookings, canEdit } = useTravel();
  const [id, setId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  return (
    <div className="page bookings-page">
      <div className="page-toolbar">
        <div>
          <h2>予約</h2>
          <span className="muted">{bookings.length}件</span>
        </div>
        {canEdit && (
          <AddButton label="予約を追加" onClick={() => setAdding(true)} />
        )}
      </div>
      {!bookings.length ? (
        <Empty>
          <BookOpen />
          <h2>予約はまだありません</h2>
          <p>航空券やホテルの予約を追加できます。</p>
        </Empty>
      ) : (
        <div className="booking-grid">
          {[...bookings]
            .sort(
              (a, b) =>
                a.day.localeCompare(b.day) || a.time.localeCompare(b.time),
            )
            .map((booking) => {
              const BookingIcon = bookingIcons[booking.kind];
              return (
                <button
                  className="booking-ticket"
                  data-press-card
                  key={booking.id}
                  onClick={() => setId(booking.id)}
                >
                  <div className="ticket-main">
                    <BookingTicketContent booking={booking} />
                  </div>
                  <div className="ticket-stub">
                    <BookingIcon
                      size={24}
                      strokeWidth={1.5}
                      role="img"
                      aria-label={
                        bookingKinds.find(
                          (entry) => entry.value === booking.kind,
                        )?.label
                      }
                    />
                  </div>
                </button>
              );
            })}
        </div>
      )}
      {adding && <BookingEditor onClose={() => setAdding(false)} />}
      {id && <BookingDetail id={id} onClose={() => setId(null)} />}
    </div>
  );
}
export function PlacesScreen() {
  const travel = useTravel();
  const [id, setId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [scheduling, setScheduling] = useState<Place | null>(null);
  const [filter, setFilter] = useState("all");
  const places = travel.places.filter(
    (place) => filter === "all" || place.status === filter,
  );
  return (
    <div className="page places-page">
      <ThumbTools title="場所の絞り込み" label="絞り込み">
        <div className="menu-list">
          {[{ value: "all", label: "すべて" }, ...placeStatuses].map(
            (entry) => (
              <button
                key={entry.value}
                aria-pressed={filter === entry.value}
                onClick={() => setFilter(entry.value)}
              >
                <PlaceStatusLabel
                  status={entry.value as Place["status"] | "all"}
                />
                {filter === entry.value && <CircleCheck size={18} />}
              </button>
            ),
          )}
        </div>
      </ThumbTools>
      <div className="page-toolbar">
        <div>
          <h2>行きたい場所</h2>
          <span className="muted">{travel.places.length}件</span>
        </div>
        {travel.canEdit && (
          <AddButton label="場所を追加" onClick={() => setAdding(true)} />
        )}
      </div>
      <div className="filter-strip" aria-label="訪問ステータス">
        {[{ value: "all", label: "すべて" }, ...placeStatuses].map((entry) => (
          <button
            key={entry.value}
            className={filter === entry.value ? "selected" : ""}
            aria-pressed={filter === entry.value}
            onClick={() => setFilter(entry.value)}
          >
            <PlaceStatusLabel status={entry.value as Place["status"] | "all"} />
          </button>
        ))}
      </div>
      {!places.length ? (
        <Empty>
          <MapPin />
          <h2>
            {travel.places.length
              ? "該当する場所はありません"
              : "場所はまだありません"}
          </h2>
          <p>
            {travel.places.length
              ? "絞り込みを変更してください。"
              : "訪れたい場所を追加できます。"}
          </p>
        </Empty>
      ) : (
        <div className="place-grid">
          {places.map((place) => (
            <PlaceCard
              key={place.id}
              place={place}
              linked={travel.items.find(
                (item) => item.id === place.itineraryItemId,
              )}
              tripId={travel.selectedTrip!.id}
              onOpen={() => setId(place.id)}
              onSchedule={
                travel.canEdit ? () => setScheduling(place) : undefined
              }
            />
          ))}
        </div>
      )}
      {scheduling && (
        <ItemEditor place={scheduling} onClose={() => setScheduling(null)} />
      )}
      {adding && <PlaceEditor onClose={() => setAdding(false)} />}
      {id && <PlaceDetail id={id} onClose={() => setId(null)} />}
    </div>
  );
}
export { NotesScreen } from "./notes-screen";
