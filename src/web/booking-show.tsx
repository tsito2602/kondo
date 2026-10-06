import { useLayoutEffect, useRef } from "react";
import { findAirportByCode } from "@/data/airports";
import type { Booking, BookingDocument } from "@/data/types";
import { addDays } from "@/utils/dates";
import { dayLabel, monthDay, spring } from "./booking-card";
import { bookingKinds } from "./editors";
import { Modal } from "./ui";

/** 見せる: the booking big enough to hold up at a counter. */
export function BookingShow({
  booking,
  documents,
  onOpen,
  onClose,
}: {
  booking: Booking;
  documents: BookingDocument[];
  onOpen: (document: BookingDocument) => void;
  onClose: () => void;
}) {
  const code = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    spring(
      code.current,
      [{ transform: "scale(.7)" }, { transform: "none" }],
      "boing",
      {
        delay: 160,
        fill: "backwards",
      },
    );
  }, []);
  const kind = bookingKinds.find(
    (entry) => entry.value === booking.kind,
  )?.label;
  const route = ["flight", "train", "car"].includes(booking.kind);
  const place = (name: string, airportCode: string) =>
    booking.kind === "flight"
      ? findAirportByCode(airportCode)?.code || airportCode || name
      : name || airportCode;
  const end = booking.endDay || booking.day;
  const nextDay = end > booking.day;
  const document = documents[0];
  return (
    <Modal title={booking.title} onClose={onClose} fullscreen dockActions={{}}>
      <div className="bk-show">
        <span className="bk-show-k">
          {[
            kind,
            booking.detail && !/^https?:/i.test(booking.detail)
              ? booking.detail
              : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <div
          className={`bk-show-big${route && booking.kind !== "flight" ? " words" : ""}`}
        >
          {route ? (
            <>
              {place(booking.origin, booking.originCode)} →{" "}
              {place(booking.destination, booking.destinationCode)}
              <small>
                {dayLabel(booking.day)} {booking.time} 発 →{" "}
                {nextDay
                  ? end === addDays(booking.day, 1)
                    ? "翌日 "
                    : `${monthDay(end)} `
                  : ""}
                {booking.endTime} 着
              </small>
            </>
          ) : (
            <>
              {booking.time || monthDay(booking.day)}
              <small>
                {dayLabel(booking.day)}
                {booking.kind === "hotel"
                  ? ` チェックイン · ${monthDay(end)} チェックアウト`
                  : ""}
              </small>
            </>
          )}
        </div>
        {booking.confirmationCode && (
          <div className="bk-show-code" ref={code}>
            <small>予約番号</small>
            <b>{booking.confirmationCode}</b>
          </div>
        )}
        {document && (
          <button
            type="button"
            className="bk-show-page"
            onClick={() => onOpen(document)}
          >
            <b>{document.filename}</b>
            <i style={{ width: "80%" }} />
            <i style={{ width: "60%" }} />
            <i style={{ width: "90%" }} />
            <i style={{ width: "45%" }} />
            <small>押すと書類を全画面で開く</small>
          </button>
        )}
      </div>
    </Modal>
  );
}
