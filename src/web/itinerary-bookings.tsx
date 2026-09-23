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
  const timed = entries.filter(
    (entry) => entry.day === day && entry.booking?.kind !== "hotel",
  );
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
  const stays = staysOnDay(bookings, day);
  if (!stays.length) return null;
  return (
    <div className="day-stays" aria-label="この日の宿泊">
      {stays.map((booking) => {
        const label =
          day === booking.day
            ? "宿泊開始"
            : day === booking.endDay
              ? "チェックアウト日"
              : "連泊";
        const StayIcon =
          day === booking.day
            ? LogIn
            : day === booking.endDay
              ? LogOut
              : BedDouble;
        return (
          <button
            className="stay-card"
            data-press-card
            key={booking.id}
            onClick={() => onOpen(booking.id)}
          >
            <div className="stay-heading">
              <StayIcon size={16} aria-hidden="true" />
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
                <strong>{shortDate(booking.endDay)}</strong>
                <span>
                  {booking.endTime ? `〜${booking.endTime}` : "時刻未定"}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
