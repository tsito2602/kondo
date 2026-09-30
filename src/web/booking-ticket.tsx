import { ArrowRight } from "lucide-react";
import { findAirportByCode } from "@/data/airports";
import type { Booking } from "@/data/types";
import { ticketDate } from "./ticket-content";

function RoutePlace({
  name,
  code,
  flight,
}: {
  name: string;
  code: string;
  flight: boolean;
}) {
  const airport = flight ? findAirportByCode(code) : undefined;
  const label = airport?.name || name || code || "未定";
  const airportCode = flight ? airport?.code || code.trim().toUpperCase() : "";
  const primary = airportCode || label;
  const secondary = airportCode ? label : code;
  return (
    <div className="ticket-place">
      <strong className={airportCode ? "ticket-place-code" : undefined}>
        {primary}
      </strong>
      {secondary && secondary !== primary && <span>{secondary}</span>}
    </div>
  );
}

export function BookingTicketContent({ booking }: { booking: Booking }) {
  const route = ["flight", "train", "car"].includes(booking.kind);
  const hasRoute =
    route &&
    Boolean(
      booking.origin ||
      booking.originCode ||
      booking.destination ||
      booking.destinationCode,
    );
  const range = route || booking.kind === "hotel";
  const endpointLabels =
    booking.kind === "hotel"
      ? ["チェックイン", "チェックアウト"]
      : booking.kind === "car"
        ? ["受取", "返却"]
        : ["出発", "到着"];
  return (
    <>
      {hasRoute ? (
        <div className="ticket-route" aria-label="出発地から到着地">
          <RoutePlace
            name={booking.origin}
            code={booking.originCode}
            flight={booking.kind === "flight"}
          />
          <ArrowRight size={16} aria-hidden="true" />
          <RoutePlace
            name={booking.destination}
            code={booking.destinationCode}
            flight={booking.kind === "flight"}
          />
        </div>
      ) : (
        <h2 className="ticket-title">{booking.title}</h2>
      )}
      <div className={`ticket-schedule${range ? "" : " single"}`}>
        {[
          {
            label: range ? endpointLabels[0] : "利用日時",
            day: booking.day,
            time: booking.time,
          },
          ...(range
            ? [
                {
                  label: endpointLabels[1],
                  day: booking.endDay || booking.day,
                  time: booking.endTime,
                },
              ]
            : []),
        ].map((point) => (
          <div key={point.label}>
            <small>{point.label}</small>
            <span>{ticketDate(point.day, booking.day)}</span>
            <time>
              {point.time || "時刻未定"}
              {point.time && booking.kind === "hotel"
                ? point.label === endpointLabels[0]
                  ? "〜"
                  : "まで"
                : ""}
            </time>
          </div>
        ))}
      </div>
      {(hasRoute || booking.confirmationCode) && (
        <div className="ticket-meta">
          {hasRoute && <span>{booking.title}</span>}
          {booking.confirmationCode && (
            <span>
              予約番号 <b>{booking.confirmationCode}</b>
            </span>
          )}
        </div>
      )}
    </>
  );
}
