import { formatConnectionDuration } from "@/data/flight-connections";
import { distanceLabel, WALK_LIMIT_METERS } from "@/data/geo";
import {
  durationLabel,
  durationMinutes,
  itemCategory,
  itemDetails,
  transportLabel,
} from "@/data/itinerary";
import {
  isJourney,
  nightsOf,
  planPlace,
  type DayEntry,
  type Row,
} from "@/data/plan-timeline";
import { referenceUrl } from "@/data/places";
import type { Booking, ItineraryItem, Place } from "@/data/types";
import { BookingBody, bookingHeading, linkPlaceName } from "./booking-card";
import { categoryGlyph, Glyph, MapPin } from "./itinerary-icons";
import { kindOfBooking, kindOfCategory } from "./kind-colors";

export type OpenTarget =
  | { kind: "item"; id: string }
  | { kind: "booking"; id: string; endpoint?: "start" | "end" };

/** Words for a booking kind as the しおり names it. */
export const bookingLabel: Record<Booking["kind"], string> = {
  flight: "フライト",
  train: "鉄道",
  hotel: "宿",
  car: "レンタカー",
  restaurant: "食事",
  ticket: "チケット",
  other: "予約",
};

/** A venue booking's glyph: a restaurant wears the fork and knife, as meals do. */
export const bookingGlyph = (kind: Booking["kind"]) =>
  kind === "restaurant"
    ? "meal"
    : kind === "car"
      ? "move"
      : kind === "other"
        ? "other"
        : "ticket";

/** A place for the card: its map number and name, or the plan's own words. */
export function placeLabel(
  item: ItineraryItem,
  places: readonly Place[],
  numbers: ReadonlyMap<string, number>,
) {
  const place = planPlace(item, places);
  if (place) return { number: numbers.get(place.id), name: place.title };
  const location = itemDetails(item).location.trim();
  if (!location) return null;
  if (referenceUrl(location)) {
    const name = linkPlaceName(location);
    return name ? { name } : null;
  }
  return { name: location };
}
export function bookingPlaceName(booking: Booking) {
  // Only 場所 names the place: 予約内容 (a room type) is never one.
  const text = (booking.location || "").trim();
  return referenceUrl(text) ? linkPlaceName(text) : text;
}

/** A flight or a train as the 予約 tab's card draws it: departure over
    arrival, each place level with its dot (Tsubasa 2026-10-06:
    「予約のカード同様縦並べにしよう」); the departure time is the row's own. */
export function JourneyLine({
  booking,
  arrivalOnly = false,
}: {
  booking: Booking;
  arrivalOnly?: boolean;
}) {
  return <BookingBody booking={booking} now="" arrivalOnly={arrivalOnly} />;
}

function PlanCard({
  item,
  places,
  numbers,
}: {
  item: ItineraryItem;
  places: readonly Place[];
  numbers: ReadonlyMap<string, number>;
}) {
  const details = itemDetails(item);
  const category = itemCategory(item);
  if (details.category === "transport") {
    const minutes = durationMinutes(item.day, item.time, details);
    const { origin = "", destination = "" } = details.transport ?? {};
    return (
      <>
        <div className="it-lab" data-kind="transport">
          <Glyph name="move" />
          {[transportLabel(details), durationLabel(minutes)]
            .filter(Boolean)
            .join(" · ")}
        </div>
        <h3>{item.title}</h3>
        {(origin || destination) && (
          <div className="it-route">
            {origin || "出発地"}
            <Glyph name="arrow" />
            {destination || "目的地"}
          </div>
        )}
      </>
    );
  }
  const place = placeLabel(item, places, numbers);
  return (
    <>
      <div className="it-lab" data-kind={kindOfCategory(category.value)}>
        <Glyph name={categoryGlyph[category.value]} />
        {category.label}
      </div>
      <h3>{item.title}</h3>
      {place && (
        <div className="it-where">
          {place.number ? (
            <MapPin number={place.number} />
          ) : (
            <Glyph name="pin" />
          )}
          {place.name && <span>{place.name}</span>}
        </div>
      )}
    </>
  );
}

function BookingCard({
  entry,
  used,
  places,
  numbers,
}: {
  entry: DayEntry;
  used: boolean;
  places: readonly Place[];
  numbers: ReadonlyMap<string, number>;
}) {
  const booking = entry.booking!;
  const chip = <b className="it-yk">{used ? "済" : "予約"}</b>;
  if (booking.kind === "hotel") {
    if (entry.endpoint === "end")
      return (
        <div className="it-card is-line">
          <div className="it-lnr" data-kind="stay">
            <Glyph name="out" />
            <b>チェックアウト</b>
            {booking.endTime && (
              <span className="it-cond">
                {chip}〜{booking.endTime}
              </span>
            )}
          </div>
          <div className="it-lnr2">{booking.title}</div>
        </div>
      );
    const nights = nightsOf(booking);
    return (
      <div className="it-card" data-press-card>
        <div className="it-lab" data-kind="stay">
          <Glyph name="in" />
          チェックイン
        </div>
        <h3>{booking.title}</h3>
        <div className="it-where">
          {booking.time && (
            <span className="it-cond">
              {chip}
              {booking.time}〜
            </span>
          )}
          {nights > 0 && (
            <span>
              {booking.time ? "· " : ""}
              {nights}泊
            </span>
          )}
        </div>
      </div>
    );
  }
  if (isJourney(booking)) {
    if (entry.endpoint === "end")
      return (
        <div className="it-card is-line">
          <div className="it-lnr" data-kind="transport">
            <Glyph name="down" />
            <b>
              {(booking.kind === "train"
                ? booking.destination
                : booking.destinationCode) ||
                booking.destination ||
                booking.destinationCode}{" "}
              到着
            </b>
            <span>{booking.title}</span>
          </div>
        </div>
      );
    return (
      <div className="it-card" data-press-card>
        <div className="it-lab is-single" data-kind="transport">
          <Glyph name={booking.kind === "train" ? "move" : "up"} />
          {bookingHeading(booking)}
        </div>
        <JourneyLine booking={booking} arrivalOnly />
      </div>
    );
  }
  if (entry.endpoint === "end")
    return (
      <div className="it-card is-line">
        <div className="it-lnr" data-kind={kindOfBooking(booking.kind)}>
          <Glyph name="out" />
          <b>{entry.stage}</b>
          <span>{booking.title}</span>
        </div>
      </div>
    );
  // A venue linked to the map wears its number pin, as plans do.
  const linked = booking.placeId
    ? places.find((candidate) => candidate.id === booking.placeId)
    : undefined;
  const place = linked?.title ?? bookingPlaceName(booking);
  const number = linked ? numbers.get(linked.id) : undefined;
  return (
    <div className="it-card" data-press-card>
      <div className="it-lab" data-kind={kindOfBooking(booking.kind)}>
        <Glyph name={bookingGlyph(booking.kind)} />
        {bookingLabel[booking.kind]}
      </div>
      <h3>{booking.title}</h3>
      {place && (
        <div className="it-where">
          {number ? <MapPin number={number} /> : <Glyph name="pin" />}
          <span>{place}</span>
        </div>
      )}
    </div>
  );
}

/** One row of a day: a plan, a booking end, a stay night, a walk, a connection or いま. */
export function TimelineRow({
  row,
  places,
  numbers,
  highlight,
  onOpen,
}: {
  row: Row;
  places: readonly Place[];
  numbers: ReadonlyMap<string, number>;
  highlight?: string | null;
  onOpen: (target: OpenTarget) => void;
}) {
  const past = "past" in row && row.past ? " is-past" : "";
  if (row.type === "walk") {
    const { meters, minutes, late } = row.walk;
    return (
      <div
        className={`it-gap${late ? " is-late" : meters > WALK_LIMIT_METERS ? " is-far" : ""}${past}`}
      >
        <Glyph name="walk" />
        {meters > WALK_LIMIT_METERS && !late
          ? `${distanceLabel(meters)} · 乗り物も検討`
          : `徒歩 約${minutes}分 · ${distanceLabel(meters)}`}
        {late > 0 && <i>{late}分遅れる</i>}
      </div>
    );
  }
  if (row.type === "connection")
    return (
      <button
        className={`it-conn${past}`}
        onClick={() =>
          onOpen({ kind: "booking", id: row.booking.id, endpoint: "end" })
        }
      >
        <span>
          <Glyph name="clock" />
          {row.connection.airportCode} 乗り継ぎ{" "}
          {formatConnectionDuration(row.connection.durationMinutes)}
        </span>
      </button>
    );
  if (row.type === "now")
    return (
      <div className="it-now" id="itinerary-now">
        <time>{row.time}</time>
        <i className="it-now-dot" aria-hidden="true" />
        <p>
          <b>いま</b>
        </p>
      </div>
    );
  if (row.type === "stay")
    return (
      <button
        className={`it-ev is-mid${past}`}
        onClick={() => onOpen({ kind: "booking", id: row.booking.id })}
      >
        <time />
        <i className="it-node" aria-hidden="true" />
        <div className="it-card is-mid" data-press-card>
          <div className="it-lab" data-kind="stay">
            <Glyph name="bed" />
            連泊 · {row.night}泊目
          </div>
          <h3>{row.booking.title}</h3>
        </div>
      </button>
    );
  const { entry } = row;
  const booking = entry.booking;
  // A booking pins its time down (departure, doors); an arrival only follows from it.
  // Hotel entries are our own plan of when we go in and out; the terms ride on the card.
  const fixed = Boolean(
    booking && entry.endpoint === "start" && booking.kind !== "hotel",
  );
  const isBooking = Boolean(booking);
  return (
    <button
      className={`it-ev${isBooking ? " is-booking" : ""}${fixed ? " is-fixed" : ""}${past}${highlight && entry.item?.id === highlight ? " is-highlight" : ""}`}
      id={entry.item ? `item-${entry.item.id}` : undefined}
      data-entry-key={entry.key}
      onClick={() =>
        onOpen(
          entry.item
            ? { kind: "item", id: entry.item.id }
            : { kind: "booking", id: booking!.id, endpoint: entry.endpoint },
        )
      }
    >
      <time className={entry.time ? undefined : "is-tbd"}>
        {entry.time || "未定"}
        {fixed && <b className="it-yk">{row.past ? "済" : "予約"}</b>}
      </time>
      <i className="it-node" aria-hidden="true" />
      {entry.item ? (
        <div className="it-card" data-press-card>
          <PlanCard item={entry.item} places={places} numbers={numbers} />
        </div>
      ) : (
        <BookingCard
          entry={entry}
          used={row.past}
          places={places}
          numbers={numbers}
        />
      )}
    </button>
  );
}
