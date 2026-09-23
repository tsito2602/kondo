import { findAirportByCode } from "@/data/airports";
import { localDateTimeToEpoch } from "@/data/flight-connections";
import { itemDetails } from "@/data/itinerary";
import type { Booking, BookingKind, ItineraryItem } from "@/data/types";
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
function flightClock(day: string, time: string, code: string) {
  const zone = findAirportByCode(code)?.timeZone;
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
    epoch !== null
      ? new Intl.DateTimeFormat("ja-JP", {
          timeZone: "Asia/Tokyo",
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).format(epoch)
      : undefined;
  return { offset, japanTime, zone };
}
function ScheduleTime({
  day,
  time,
  zoneLabel,
}: {
  day: string;
  time: string;
  zoneLabel?: string;
}) {
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
      {zoneLabel && <span className="booking-time-zone">{zoneLabel}</span>}
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
  const endpoints = [
    {
      label: startLabel,
      day: booking.day,
      time: booking.time,
      code: booking.originCode,
    },
    ...(range
      ? [
          {
            label: endLabel,
            day: endDay,
            time: booking.endTime,
            code: booking.destinationCode,
          },
        ]
      : []),
  ].map((endpoint) => ({
    ...endpoint,
    clock:
      booking.kind === "flight"
        ? flightClock(endpoint.day, endpoint.time, endpoint.code)
        : null,
  }));
  const showJapan = endpoints.some(
    ({ clock }) => clock?.japanTime && clock.offset !== "UTC+9",
  );
  return (
    <div className={`detail-grid booking-schedule${range ? "" : " single"}`}>
      {endpoints.map(({ label, day, time, clock }) => (
        <section key={label}>
          <h3>{label}</h3>
          <ScheduleTime
            day={day}
            time={time}
            zoneLabel={
              clock
                ? clock.offset
                  ? `現地時刻 · ${clock.offset}`
                  : clock.zone
                    ? "現地時刻"
                    : "現地時刻 · 時差未確認"
                : undefined
            }
          />
        </section>
      ))}
      {showJapan && (
        <div className="booking-japan-row">
          <p className="booking-japan-heading">
            日本時間 <span>UTC+9</span>
          </p>
          <dl>
            {endpoints.map(({ label, clock, time }) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  {clock?.japanTime ?? (time ? "時差未確認" : "時刻未設定")}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
export function ItemSchedule({ item }: { item: ItineraryItem }) {
  const details = itemDetails(item);
  const range = Boolean(details.endTime || details.endDay);
  const transport = details.category === "transport";
  return (
    <div className={`detail-grid booking-schedule${range ? "" : " single"}`}>
      <section>
        <h3>{transport ? "出発" : range ? "開始" : "日時"}</h3>
        <ScheduleTime day={item.day} time={item.time} />
      </section>
      {range && (
        <section>
          <h3>{transport ? "到着" : "終了"}</h3>
          <ScheduleTime
            day={details.endDay || item.day}
            time={details.endTime || ""}
          />
        </section>
      )}
    </div>
  );
}
