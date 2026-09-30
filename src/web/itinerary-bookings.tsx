import {
  ArrowRight,
  BedDouble,
  LogIn,
  LogOut,
  PlaneLanding,
  PlaneTakeoff,
} from "lucide-react";
import type { Booking } from "@/data/types";
import type { Entry } from "./screens";

export const isJourney = (booking?: Booking) =>
  booking?.kind === "flight" || booking?.kind === "train";

export function dayTimeline(entries: Entry[], day: string) {
  const timed = entries.filter((entry) => entry.day === day);
  // Only join neighbours. Other appointments keep their chronological position.
  return timed.flatMap((entry, index) => {
    const previous = timed[index - 1];
    if (
      isJourney(entry.booking) &&
      entry.endpoint === "end" &&
      previous?.booking?.id === entry.booking?.id &&
      previous.endpoint === "start"
    )
      return [];
    const next = timed[index + 1];
    return [
      {
        ...entry,
        joinedArrival: Boolean(
          isJourney(entry.booking) &&
          entry.endpoint === "start" &&
          next?.booking?.id === entry.booking?.id &&
          next.endpoint === "end",
        ),
      },
    ];
  });
}

export function staysOnDay(bookings: Booking[], day: string) {
  return bookings
    .filter(
      (booking) =>
        booking.kind === "hotel" &&
        booking.day <= day &&
        day <= (booking.endDay || booking.day),
    )
    .sort((a, b) => a.day.localeCompare(b.day) || a.id.localeCompare(b.id));
}

const shortDate = (day: string) =>
  day ? day.slice(5).replace("-", "/") : "日付未定";

export function JourneyPair({
  booking,
  arrival,
}: {
  booking: Booking;
  arrival: boolean;
}) {
  const start = booking.originCode || booking.origin || "出発地未設定";
  const end = booking.destinationCode || booking.destination || "到着地未設定";
  if (arrival)
    return (
      <div className="journey-arrival">
        <strong>{end} 到着</strong>
        <span>
          {shortDate(booking.day)} {booking.time || "時刻未定"} {start} 発
        </span>
      </div>
    );
  return (
    <div className="journey-pair" aria-label="出発から到着まで">
      {[
        {
          label: booking.kind === "train" ? "乗車" : "出発",
          day: booking.day,
          time: booking.time,
          place: start,
        },
        {
          label: "到着",
          day: booking.endDay || (booking.endTime ? booking.day : ""),
          time: booking.endTime,
          place: end,
        },
      ].map((point) => (
        <div className="journey-point" key={point.label}>
          <span className="journey-point-label">
            {booking.kind === "flight" &&
              (point.label === "到着" ? (
                <PlaneLanding size={13} aria-hidden="true" />
              ) : (
                <PlaneTakeoff size={13} aria-hidden="true" />
              ))}
            {point.label}
          </span>
          <div className="journey-point-main">
            <span className="journey-clock">{point.time || "時刻未定"}</span>
            <strong>{point.place}</strong>
          </div>
          <span className="journey-date">
            {shortDate(point.day)}
            {booking.kind === "flight" ? " · 現地時刻" : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

export function StayCards({
  bookings,
  day,
  onOpen,
}: {
  bookings: Booking[];
  day: string;
  onOpen: (id: string) => void;
}) {
  const stays = staysOnDay(bookings, day).filter(
    (booking) => booking.day < day && day < booking.endDay,
  );
  if (!stays.length) return null;
  return (
    <div className="day-stays" aria-label="この日の連泊">
      {stays.map((booking) => (
        <StayCard key={booking.id} booking={booking} onOpen={onOpen} />
      ))}
    </div>
  );
}

export function StayCard({
  booking,
  endpoint,
  onOpen,
}: {
  booking: Booking;
  endpoint?: "start" | "end";
  onOpen: (id: string) => void;
}) {
  const time =
    endpoint === "start"
      ? booking.time
      : endpoint === "end"
        ? booking.endTime
        : "";
  const label =
    endpoint === "start"
      ? "チェックイン"
      : endpoint === "end"
        ? "チェックアウト"
        : "連泊";
  const StayIcon =
    endpoint === "start" ? LogIn : endpoint === "end" ? LogOut : BedDouble;
  return (
    <button
      className="timeline-entry stay-entry"
      onClick={() => onOpen(booking.id)}
    >
      <time>{endpoint ? time || "未定" : ""}</time>
      <span
        className="timeline-marker"
        data-endpoint={endpoint}
        aria-hidden="true"
      >
        <StayIcon size={16} />
      </span>
      <div className="stay-card" data-press-card>
        <div className="stay-heading">
          <span>{label}</span>
        </div>
        <h3>{booking.title}</h3>
        <div className="stay-range">
          <div>
            <span>チェックイン</span>
            <strong>{shortDate(booking.day)}</strong>
            <span>{booking.time ? `${booking.time}〜` : "時刻未定"}</span>
          </div>
          <ArrowRight size={15} aria-hidden="true" />
          <div>
            <span>チェックアウト</span>
            <strong>{shortDate(booking.endDay || booking.day)}</strong>
            <span>{booking.endTime ? `〜${booking.endTime}` : "時刻未定"}</span>
          </div>
        </div>
      </div>
    </button>
  );
}
