import { bookingDuration } from "@/data/booking-duration";
import { formatConnectionDuration } from "@/data/flight-connections";
import {
  distanceLabel,
  placeNameFromLink,
  WALK_LIMIT_METERS,
} from "@/data/geo";
import {
  durationLabel,
  durationMinutes,
  itemCategory,
  itemDetails,
  transportLabel,
} from "@/data/itinerary";
import {
  isJourney,
  laterDayMark,
  nightsOf,
  planPlace,
  type DayEntry,
  type Row,
} from "@/data/plan-timeline";
import { referenceUrl } from "@/data/places";
import type { Booking, ItineraryItem, Place } from "@/data/types";
import { categoryGlyph, Glyph, MapPin } from "./itinerary-icons";

export type OpenTarget =
  | { kind: "item"; id: string }
  | { kind: "booking"; id: string; endpoint?: "start" | "end" };

/** Words for a booking kind as the しおり names it. */
export const bookingLabel: Record<Booking["kind"], string> = {
  flight: "フライト",
  train: "鉄道",
  hotel: "宿",
  car: "レンタカー",
  restaurant: "食事の予約",
  ticket: "チケット",
  other: "予約",
};

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
    const name = placeNameFromLink(location);
    return name ? { name } : null;
  }
  return { name: location };
}
export function bookingPlaceName(booking: Booking) {
  const text = (booking.location || "").trim();
  if (!text)
    return booking.kind === "hotel" && !referenceUrl(booking.detail)
      ? booking.detail
      : "";
  return referenceUrl(text) ? (placeNameFromLink(text) ?? "") : text;
}

function Arc({ train }: { train: boolean }) {
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <path
        d={train ? "M3 15 H97" : "M3 24 Q 50 -6 97 24"}
        fill="none"
        stroke="currentColor"
        strokeOpacity=".45"
        strokeWidth="2.6"
        strokeDasharray="0 6.5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
/** From → to, arrival with 着 (翌 when later) and the real, zone-corrected time on board. */
export function JourneyLine({
  booking,
  large = false,
}: {
  booking: Booking;
  large?: boolean;
}) {
  const train = booking.kind === "train";
  const from =
    (train ? booking.origin : booking.originCode) ||
    booking.origin ||
    booking.originCode ||
    "出発地";
  const to =
    (train ? booking.destination : booking.destinationCode) ||
    booking.destination ||
    booking.destinationCode ||
    "到着地";
  const minutes = bookingDuration(booking)?.minutes;
  const later = laterDayMark(booking.day, booking.endDay || booking.day);
  return (
    <div
      className={`it-jp${train ? " is-train" : ""}${large ? " is-large" : ""}`}
    >
      <span className="it-jp-code">{from}</span>
      <span className="it-jp-mid">
        <Arc train={train} />
        {minutes !== undefined && <em>{durationLabel(minutes)}</em>}
      </span>
      <span className="it-jp-end">
        <span className="it-jp-code">{to}</span>
        {booking.endTime && (
          <b className="it-jp-arr">
            {later && <small>{later}</small>}
            {booking.endTime}
            <i>着</i>
          </b>
        )}
      </span>
    </div>
  );
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
        <div className="it-lab">
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
      <div className="it-lab">
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
          <div className="it-lnr">
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
        <div className="it-lab">
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
          <div className="it-lnr">
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
        <div className="it-lab is-single">
          <Glyph name={booking.kind === "train" ? "move" : "up"} />
          {booking.title}
        </div>
        <JourneyLine booking={booking} />
      </div>
    );
  }
  if (entry.endpoint === "end")
    return (
      <div className="it-card is-line">
        <div className="it-lnr">
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
      <div className="it-lab">
        <Glyph name="ticket" />
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
          <div className="it-lab">
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
