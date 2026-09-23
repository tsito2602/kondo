import { findAirportByCode } from "@/data/airports";
import { localDateTimeToEpoch } from "@/data/flight-connections";
import type { Booking, BookingKind } from "@/data/types";
import { formatDate } from "@/utils/dates";

const labels: Record<BookingKind, [string, string]> = {
  flight: ["出発", "到着"],
  train: ["出発", "到着"],
  hotel: ["チェックイン", "チェックアウト"],
  car: ["受取", "返却"],
  restaurant: ["予約", "終了"],
  ticket: ["入場", "終了"],
  other: ["開始", "終了"],
};

function ScheduleTime({
  day,
  time,
  code,
}: {
  day: string;
  time: string;
  code?: string;
}) {
  const zone =
    code === undefined ? undefined : findAirportByCode(code)?.timeZone;
  const epoch = zone ? localDateTimeToEpoch(day, time, zone) : null;
  const offset =
    epoch !== null && zone
      ? new Intl.DateTimeFormat("en", {
          timeZone: zone,
          timeZoneName: "shortOffset",
        })
          .formatToParts(epoch)
          .find((part) => part.type === "timeZoneName")
          ?.value.replace(/^GMT$/, "UTC+0")
          .replace(/^GMT/, "UTC")
      : undefined;
  const japanTime =
    epoch !== null && offset !== "UTC+9"
      ? new Intl.DateTimeFormat("ja-JP", {
          timeZone: "Asia/Tokyo",
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(epoch)
      : undefined;
  return (
    <div className="booking-time">
      <span className="booking-time-date">{formatDate(day)}</span>
      {time ? (
        <time className="booking-time-clock" dateTime={`${day}T${time}`}>
          {time}
        </time>
      ) : (
        <span className="booking-time-missing">時刻未設定</span>
      )}
      {code !== undefined && (
        <span className="booking-time-zone">
          {offset
            ? `現地時刻 · ${offset}`
            : zone
              ? "現地時刻"
              : "現地時刻 · 時差未確認"}
        </span>
      )}
      {japanTime && (
        <span className="booking-time-japan">
          <span>日本時間（UTC+9）</span>
          <span>{japanTime}</span>
        </span>
      )}
    </div>
  );
}

export function BookingSchedule({ booking }: { booking: Booking }) {
  const [startLabel, endLabel] = labels[booking.kind];
  const endDay = booking.endDay || booking.day;
  const range =
    ["flight", "train", "hotel", "car"].includes(booking.kind) ||
    endDay !== booking.day ||
    Boolean(booking.endTime && booking.endTime !== booking.time);
  return (
    <div className={`detail-grid booking-schedule${range ? "" : " single"}`}>
      <section>
        <h3>{startLabel}</h3>
        <ScheduleTime
          day={booking.day}
          time={booking.time}
          code={booking.kind === "flight" ? booking.originCode : undefined}
        />
      </section>
      {range && (
        <section>
          <h3>{endLabel}</h3>
          <ScheduleTime
            day={endDay}
            time={booking.endTime}
            code={
              booking.kind === "flight" ? booking.destinationCode : undefined
            }
          />
        </section>
      )}
    </div>
  );
}
