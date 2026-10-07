import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { findAirportByCode } from "@/data/airports";
import { bookingDuration } from "@/data/booking-duration";
import { placeNameFromLink } from "@/data/geo";
import { durationLabel } from "@/data/itinerary";
import { referenceUrl, registeredGoogleMapsUrl } from "@/data/places";
import type { Booking, BookingKind } from "@/data/types";
import { bookingIcons } from "./booking-icons";
import { kindOfBooking } from "./kind-colors";
import { localDate } from "@/utils/dates";
import { reduceMotion } from "./motion";

export { bookingIcons };

const WEEKDAYS = "日月火水木金土";
export const monthDay = (day: string) =>
  day ? `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}` : "";
export const weekday = (day: string) =>
  day ? `（${WEEKDAYS[new Date(`${day}T12:00:00`).getDay()]}）` : "";
export const dayLabel = (day: string) => `${monthDay(day)}${weekday(day)}`;
const dayCount = (from: string, to: string) =>
  Math.round(
    (new Date(`${to}T12:00:00`).getTime() -
      new Date(`${from}T12:00:00`).getTime()) /
      864e5,
  );

/** The words for a link given as a place: a Google Maps link's place name
    (or nothing), any other site's host name. */
export function linkPlaceName(link: string) {
  const href = referenceUrl(link);
  if (!href) return "";
  if (registeredGoogleMapsUrl(href)) return placeNameFromLink(href) ?? "";
  return new URL(href).hostname.replace(/^www\./, "");
}

/** The device's wall clock as "YYYY-MM-DDTHH:MM", comparable with booking times. */
export const clockNow = (date = new Date()) =>
  `${localDate(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
/** Re-render on each minute so a booking turns 済 while the screen stays open. */
export function useClockNow() {
  const [now, setNow] = useState(clockNow);
  useEffect(() => {
    const timer = setInterval(() => setNow(clockNow()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
const startOf = (booking: Booking) =>
  `${booking.day}T${booking.time || "00:00"}`;
const endOf = (booking: Booking) => {
  const day = booking.endDay || booking.day;
  const time =
    booking.endTime ||
    (day === booking.day && booking.time ? booking.time : "23:59");
  return `${day}T${time}`;
};
export const isUsed = (booking: Booking, now: string) =>
  Boolean(booking.day) && endOf(booking) < now;
const isStaying = (booking: Booking, now: string) =>
  startOf(booking) <= now && now < endOf(booking);

// uchiwake's springs, sampled into a linear() easing.
const SPRINGS = {
  squish: { k: 520, d: 20 },
  boing: { k: 420, d: 14 },
  split: { k: 230, d: 21 },
};
const springCache = new Map<string, { easing: string; ms: number }>();
function springEasing(name: keyof typeof SPRINGS) {
  const cached = springCache.get(name);
  if (cached) return cached;
  const { k, d } = SPRINGS[name];
  const values = [0];
  let x = 0;
  let v = 0;
  let t = 0;
  while (t < 2) {
    v += (-k * (x - 1) - d * v) / 120;
    x += v / 120;
    t += 1 / 120;
    values.push(x);
    if (Math.abs(x - 1) < 0.0008 && Math.abs(v) < 0.01) break;
  }
  values[values.length - 1] = 1;
  const step = Math.max(1, Math.floor(values.length / 64));
  const linear = CSS.supports?.("transition-timing-function", "linear(0, 1)");
  const result = {
    easing: linear
      ? `linear(${values
          .filter((_, i) => i % step === 0 || i === values.length - 1)
          .map((value) => +value.toFixed(4))
          .join(",")})`
      : "cubic-bezier(.34,1.56,.64,1)",
    ms: Math.round(t * 1000),
  };
  springCache.set(name, result);
  return result;
}
export function spring(
  element: Element | null | undefined,
  frames: Keyframe[],
  name: keyof typeof SPRINGS = "boing",
  extra: KeyframeAnimationOptions = {},
) {
  if (!element || reduceMotion() || !element.animate) return;
  const { easing, ms } = springEasing(name);
  element.animate(frames, { duration: ms, easing, ...extra });
}

function placeName(name: string, code: string, flight: boolean) {
  const airport = flight ? findAirportByCode(code) : undefined;
  const label = name || airport?.name || "";
  const primary = flight
    ? airport?.code || code || label || "未定"
    : label || code || "未定";
  return { primary, secondary: primary === label ? "" : label };
}

function Stop({
  row,
  big,
  small,
  place,
  note,
}: {
  row: number;
  big: string;
  small: string;
  place: string;
  note: string;
}) {
  return (
    <>
      <div className="bk-t" style={{ gridRow: row }}>
        <b>{big}</b>
        {small && <small>{small}</small>}
      </div>
      <i className="bk-pt" style={{ gridRow: row }} />
      <div className="bk-pl" style={{ gridRow: row }}>
        <b>{place}</b>
        {note && <small>{note}</small>}
      </div>
    </>
  );
}
function Connector({ arc }: { arc: boolean }) {
  // A box, not the svg itself, spans the rows: an svg would keep its own
  // height instead of stretching from dot to dot.
  return (
    <span className="bk-cn" aria-hidden="true">
      <svg viewBox="0 0 14 100" preserveAspectRatio="none">
        <path
          d={arc ? "M7 0 Q19 50 7 100" : "M7 0 V100"}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  );
}

const arrivalLabel = (booking: Booking, word: string) => {
  const end = booking.endDay || booking.day;
  const days = dayCount(booking.day, end);
  return days === 1
    ? `翌日 ${word}`
    : days > 1
      ? `${monthDay(end)} ${word}`
      : word;
};
const singleLabel: Record<BookingKind, string> = {
  flight: "発",
  train: "発",
  car: "受取",
  hotel: "チェックイン",
  restaurant: "予約",
  ticket: "入場",
  other: "予約",
};

/** A flight or a train is headed by its carrier, then its number or name
    (Tsubasa 2026-10-06: 「航空会社鉄道会社　便名と表示しよう」). */
export function bookingHeading(booking: Booking) {
  const detail = (booking.detail ?? "").trim();
  const carrier =
    (booking.kind === "flight" || booking.kind === "train") &&
    !/^https?:/i.test(detail)
      ? detail
      : "";
  return [carrier, (booking.title ?? "").trim()].filter(Boolean).join(" ");
}

/** The card's body: the moment that matters most on the left, what and where on the right. */
export function BookingBody({
  booking,
  now,
  arrivalOnly = false,
}: {
  booking: Booking;
  now: string;
  /** The しおり's left column already holds the departure time: the places
      sit at the left and the arrival time goes under them (Tsubasa
      2026-10-06: 「時刻は到着の方だけ」「到着時刻を下に、出発地点と到着地点を左に」). */
  arrivalOnly?: boolean;
}) {
  const { kind } = booking;
  if (kind === "flight" || kind === "train" || kind === "car") {
    const flight = kind === "flight";
    const from = placeName(booking.origin, booking.originCode, flight);
    const to = placeName(booking.destination, booking.destinationCode, flight);
    const duration = bookingDuration(booking);
    return (
      <div className={arrivalOnly ? "bk-vj is-arr" : "bk-vj"}>
        <Stop
          row={1}
          big={arrivalOnly ? "" : booking.time || "--:--"}
          small={arrivalOnly ? "" : kind === "car" ? "受取" : "発"}
          place={from.primary}
          note={from.secondary}
        />
        <Connector arc={flight} />
        <span className="bk-du">
          {duration ? durationLabel(duration.minutes) : ""}
        </span>
        <Stop
          row={3}
          big={arrivalOnly ? "" : booking.endTime}
          small={
            arrivalOnly
              ? ""
              : arrivalLabel(booking, kind === "car" ? "返却" : "着")
          }
          place={to.primary}
          note={to.secondary}
        />
        {arrivalOnly && booking.endTime && (
          <div className="bk-at">
            <b>{booking.endTime}</b>
            <small>
              {arrivalLabel(booking, kind === "car" ? "返却" : "着")}
            </small>
          </div>
        )}
      </div>
    );
  }
  if (kind === "hotel") {
    const end = booking.endDay || booking.day;
    const nights = Math.max(0, dayCount(booking.day, end));
    const tonight = dayCount(booking.day, now.slice(0, 10)) + 1;
    const staying =
      isStaying(booking, now) && tonight >= 1 && tonight <= nights;
    return (
      <div className="bk-vj bk-hv">
        <Stop
          row={1}
          big={monthDay(booking.day)}
          small={weekday(booking.day)}
          place="チェックイン"
          note={booking.time ? `${booking.time}から` : ""}
        />
        <Connector arc={false} />
        <span className="bk-du">
          {[nights ? `${nights}泊` : "", staying ? `いま${tonight}泊目` : ""]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <Stop
          row={3}
          big={monthDay(end)}
          small={weekday(end)}
          place="チェックアウト"
          note={booking.endTime ? `${booking.endTime}まで` : ""}
        />
      </div>
    );
  }
  // Where it happens comes from the place field (予約内容 stays off the card,
  // Tsubasa 2026-10-06; the detail panel shows it); not repeated when it is
  // the title itself.
  const location = (booking.location ?? "").trim();
  const place = /^https?:/i.test(location) ? linkPlaceName(location) : location;
  const where = place === booking.title ? "" : place;
  return (
    <div className="bk-uni">
      <div className="bk-t">
        <b>{booking.time || "--:--"}</b>
        <small>
          {kind === "ticket" && /劇場|ホール|シアター/.test(where)
            ? "開演"
            : singleLabel[kind]}
        </small>
      </div>
      {where && (
        <div className="bk-w">
          <b>{where}</b>
        </div>
      )}
    </div>
  );
}

/** 済: a thin ink ring badge. It spins in when a booking is used up while the screen is open. */
export function UsedStamp({
  id,
  spin,
  delay = 300,
}: {
  id: string;
  spin: boolean;
  /** The mock's slam(): 300 ms, then 180 ms per stamp landing together. */
  delay?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!spin || reduceMotion() || !ref.current?.animate) return;
    ref.current.animate(
      [
        { transform: "rotate(-200deg) scale(.4)", opacity: 0 },
        { transform: "rotate(8deg) scale(1.06)", opacity: 1, offset: 0.7 },
        { transform: "rotate(-12deg)" },
      ],
      {
        duration: 760,
        delay,
        easing: "cubic-bezier(.2,.9,.3,1)",
        fill: "backwards",
      },
    );
  }, [spin]);
  const ring = `bk-ring-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <span className="bk-stamp" ref={ref} role="img" aria-label="使用済み">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <path id={ring} d="M50 50m-35 0a35 35 0 1 1 70 0a35 35 0 1 1-70 0" />
        </defs>
        <circle cx="50" cy="50" r="48.5" className="bk-o" />
        <circle cx="50" cy="50" r="26" className="bk-o" />
        <text className="bk-rt">
          <textPath href={`#${ring}`} textLength="216">
            USED · USED · USED · USED ·{" "}
          </textPath>
        </text>
        <text x="50" y="59" textAnchor="middle" className="bk-c">
          済
        </text>
      </svg>
    </span>
  );
}

export function BookingCard({
  booking,
  now,
  showDate = false,
  spinStamp = false,
  spinDelay,
  onOpen,
}: {
  booking: Booking;
  now: string;
  /** Hidden under a day heading; hotels are led by their dates anyway. */
  showDate?: boolean;
  spinStamp?: boolean;
  spinDelay?: number;
  onOpen?: () => void;
}) {
  const Icon = bookingIcons[booking.kind];
  const used = isUsed(booking, now);
  const content = (
    <>
      {used && <UsedStamp id={booking.id} spin={spinStamp} delay={spinDelay} />}
      <div className="bk-mn">
        <div className="bk-hd" data-kind={kindOfBooking(booking.kind)}>
          <Icon size={20} strokeWidth={1.9} aria-hidden="true" />
          <b>{bookingHeading(booking)}</b>
          {!used && isStaying(booking, now) && (
            <span className="bk-chip">滞在中</span>
          )}
          {showDate && booking.kind !== "hotel" && booking.day && (
            <span>{dayLabel(booking.day)}</span>
          )}
        </div>
        <BookingBody booking={booking} now={now} />
        {booking.confirmationCode && (
          <div className="bk-code">
            予約番号 <b>{booking.confirmationCode}</b>
          </div>
        )}
      </div>
    </>
  );
  const className = `bk-card${used ? " used" : ""}`;
  return onOpen ? (
    <button
      type="button"
      className={className}
      data-press-card
      data-booking={booking.id}
      onClick={onOpen}
    >
      {content}
    </button>
  ) : (
    <div className={className} data-booking={booking.id}>
      {content}
    </div>
  );
}
