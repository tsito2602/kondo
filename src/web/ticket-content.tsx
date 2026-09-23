import type { Booking, BookingKind } from "@/data/types";

export function ticketDate(day: string, referenceDay?: string) {
  if (!day) return "日付未定";
  const [year, month, date] = day.split("-");
  const short = `${Number(month)}/${Number(date)}`;
  return referenceDay?.slice(0, 4) === year ? short : `${year}/${short}`;
}

const scheduleLabels: Record<BookingKind, [string, string]> = {
  flight: ["出発", "到着"],
  train: ["出発", "到着"],
  hotel: ["チェックイン", "チェックアウト"],
  car: ["受取", "返却"],
  restaurant: ["予約", "終了"],
  ticket: ["入場", "終了"],
  other: ["開始", "終了"],
};

export function BookingTicketDates({ booking }: { booking: Booking }) {
  const labels = scheduleLabels[booking.kind];
  const hasEnd =
    ["flight", "train", "hotel", "car"].includes(booking.kind) ||
    Boolean(
      (booking.endDay && booking.endDay !== booking.day) ||
      (booking.endTime && booking.endTime !== booking.time),
    );
  const points = [
    { label: labels[0], day: booking.day, time: booking.time, end: false },
    ...(hasEnd
      ? [
          {
            label: labels[1],
            day: booking.endDay || (booking.endTime ? booking.day : ""),
            time: booking.endTime,
            end: true,
          },
        ]
      : []),
  ];
  return (
    <div className="ticket-schedule">
      <dl>
        {points.map((point) => (
          <div key={point.label}>
            <dt>{point.label}</dt>
            <dd>
              <span>
                {ticketDate(point.day, point.end ? booking.day : undefined)}
              </span>
              <strong>
                {point.time
                  ? booking.kind === "hotel"
                    ? point.end
                      ? `〜${point.time}`
                      : `${point.time}〜`
                    : point.time
                  : "時刻未定"}
              </strong>
            </dd>
          </div>
        ))}
      </dl>
      {booking.kind === "flight" && (
        <span className="ticket-time-note">各空港の現地時刻</span>
      )}
    </div>
  );
}
