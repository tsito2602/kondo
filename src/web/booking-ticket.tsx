import { ArrowRight, Plane, createLucideIcon } from "lucide-react";
import { findAirportByCode } from "@/data/airports";
import type { Booking } from "@/data/types";
import { ticketDate } from "./ticket-content";

const TrainSide = createLucideIcon("TrainSide", [
  [
    "path",
    {
      d: "M3 5h10a8 8 0 0 1 8 8v3H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
      key: "body",
    },
  ],
  ["path", { d: "M2 10h18M7 5v5m6-5v5", key: "windows" }],
  ["circle", { cx: "7", cy: "18", r: "2", key: "rear-wheel" }],
  ["circle", { cx: "17", cy: "18", r: "2", key: "front-wheel" }],
]);

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
      {hasRoute && booking.title && (
        <div className="ticket-service">{booking.title}</div>
      )}
      {hasRoute ? (
        <div className="ticket-route" aria-label="出発地から到着地">
          <RoutePlace
            name={booking.origin}
            code={booking.originCode}
            flight={booking.kind === "flight"}
          />
          <div className="ticket-route-line" aria-hidden="true">
            <span />
            {booking.kind === "flight" ? (
              <Plane className="ticket-route-plane" size={18} />
            ) : booking.kind === "train" ? (
              <TrainSide size={18} />
            ) : (
              <ArrowRight size={16} />
            )}
            <span />
          </div>
          <RoutePlace
            name={booking.destination}
            code={booking.destinationCode}
            flight={booking.kind === "flight"}
          />
        </div>
      ) : (
        <h2 className="ticket-title">{booking.title}</h2>
      )}
      <div
        className={`ticket-schedule${range ? "" : " single"}${hasRoute ? " with-route" : ""}`}
      >
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
          <div key={point.label} aria-label={point.label}>
            {(!hasRoute || booking.kind === "car") && (
              <small>{point.label}</small>
            )}
            <span>{ticketDate(point.day, booking.day)}</span>
            <time>
              {point.time &&
                booking.kind === "hotel" &&
                point.label === endpointLabels[1] &&
                "〜"}
              {point.time || "時刻未定"}
              {point.time &&
                booking.kind === "hotel" &&
                point.label === endpointLabels[0] &&
                "〜"}
            </time>
          </div>
        ))}
      </div>
      {booking.confirmationCode && (
        <div className="ticket-reference">
          <span>予約番号</span>
          <strong>{booking.confirmationCode}</strong>
        </div>
      )}
    </>
  );
}
