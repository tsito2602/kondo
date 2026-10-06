import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { findAirportByCode } from "@/data/airports";
import {
  findFlightConnections,
  flightConnectionCandidates,
  formatConnectionDuration,
} from "@/data/flight-connections";
import { mapUrl, referenceUrl } from "@/data/places";
import { useTravel } from "@/data/travel-provider";
import type { Booking, BookingDocument } from "@/data/types";
import { addDays } from "@/utils/dates";
import { BookingCard, dayLabel, monthDay, useClockNow } from "./booking-card";
import {
  ArrowIcon,
  ClipIcon,
  CopyIcon,
  PinIcon,
  ShowIcon,
} from "./booking-icons";
import { bookingSink } from "./booking-motion";
import { japanTimes } from "./booking-schedule";
import { anim, ease, linearSupported, RM, spring } from "./cartoon";
import { DockBackIcon } from "./cartoon-dock";
import { DocumentPreview } from "./document-preview";
import { BookingEditor, bookingKinds } from "./editors";
import { lockModalPage } from "./modal-scroll-lock";
import { ContextDock, ThumbDock } from "./thumb-dock";
import { copyText, useAction, useToast } from "./ui";

const DOC_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
];

/** A full-screen layer of its own (the mock's .det and .show): a modal
    <dialog> so focus, Escape and the dock's top layer behave like a sheet. */
export function useLayer(onEscape: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const escape = useRef(onEscape);
  escape.current = onEscape;
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const release = lockModalPage();
    dialog.showModal();
    const cancel = (event: Event) => {
      event.preventDefault();
      escape.current();
    };
    dialog.addEventListener("cancel", cancel);
    return () => {
      dialog.removeEventListener("cancel", cancel);
      dialog.close();
      release();
    };
  }, []);
  return ref;
}

/** The booking opened from its card: the card on top, then what you need at
    the counter (kondo-bookings.html detailHTML / openDetail / closeDetail). */
export function BookingDetail({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const travel = useTravel();
  const notify = useToast();
  const navigate = useNavigate();
  const { busy, run } = useAction();
  const now = useClockNow();
  const [editing, setEditing] = useState(false);
  const [showing, setShowing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [preview, setPreview] = useState<{
    url: string;
    file: BookingDocument;
  } | null>(null);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );
  // The card it was opened from, measured before the page is locked.
  const [from] = useState(() =>
    [...document.querySelectorAll<HTMLElement>("[data-booking]")]
      .find((element) => element.dataset.booking === id)
      ?.getBoundingClientRect(),
  );
  const close = () => setClosing(true);
  const ref = useLayer(close);
  const booking = travel.bookings.find((entry) => entry.id === id);
  useLayoutEffect(() => {
    const dialog = ref.current;
    const card = dialog?.querySelector<HTMLElement>(".bk-card");
    if (!dialog?.animate || !card || RM()) return;
    // The card flies from where it sat in the list, on split.
    if (from) {
      const to = card.getBoundingClientRect();
      const split = ease("split");
      card.animate(
        [
          {
            transform: `translate(${from.left - to.left}px,${from.top - to.top}px) scale(${from.width / to.width})`,
          },
          { transform: "none" },
        ],
        {
          duration: split.ms,
          easing: linearSupported()
            ? split.easing
            : "cubic-bezier(.3,1.3,.5,1)",
        },
      );
    }
    dialog.animate(
      [
        { backgroundColor: "transparent" },
        { backgroundColor: getComputedStyle(dialog).backgroundColor },
      ],
      { duration: 220 },
    );
    dialog
      .querySelectorAll(".bk-kv")
      .forEach((element) => bookingSink(element, 30, 120));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!closing) return;
    const dialog = ref.current;
    if (!dialog || RM()) return onClose();
    let done = false;
    const finish = () => {
      if (!done) ((done = true), onClose());
    };
    void anim(
      dialog.querySelector(".bk-det-in") ?? dialog,
      [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: "translateY(40px)" },
      ],
      { duration: 200, easing: "ease-in", fill: "forwards" },
    ).then(finish);
    const timer = setTimeout(finish, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);
  useEffect(() => {
    if (!booking) onClose();
  }, [booking, onClose]);
  if (!booking) return null;

  const documents = travel.documentsByBooking[id] ?? [];
  const connection = findFlightConnections(travel.bookings).find(
    (entry) => entry.arrivalBookingId === id,
  );
  const candidates = flightConnectionCandidates(booking, travel.bookings).map(
    (entry) => entry.booking,
  );
  const japan = japanTimes(booking);
  const route = ["flight", "train"].includes(booking.kind);
  const placeText = (() => {
    const value = booking.location || booking.detail;
    if (!value) return "";
    return referenceUrl(value) ? booking.title : value;
  })();
  const map = mapUrl(booking.location || booking.detail);
  const upload = (files: FileList | File[]) =>
    void run(async () => {
      for (const file of Array.from(files)) {
        if (file.size > 20 * 1024 * 1024)
          throw new Error("書類は20MB以下にしてください");
        const type =
          file.type ||
          (/\.heic$/i.test(file.name)
            ? "image/heic"
            : /\.heif$/i.test(file.name)
              ? "image/heif"
              : "");
        if (!DOC_TYPES.includes(type))
          throw new Error("PDFまたは対応する画像ファイルを選択してください");
        await travel.uploadBookingDocument(id, {
          filename: file.name,
          contentType: type,
          size: file.size,
          bytes: await file.arrayBuffer(),
        });
      }
      notify("書類を追加しました");
    });
  const open = (file: BookingDocument) =>
    void run(async () => {
      const bytes = await travel.downloadBookingDocument(id, file.id);
      const url = URL.createObjectURL(
        new Blob([bytes], { type: file.contentType }),
      );
      setPreview({ url, file });
    });
  const remove = () =>
    void run(() => {
      if (confirm("この予約を削除しますか？")) {
        travel.deleteBooking(id);
        onClose();
      }
    });
  const press = (element: Element) =>
    spring(
      element,
      [{ transform: "scale(.9)" }, { transform: "none" }],
      "squish",
    );
  const seatLabel = booking.kind === "hotel" ? "部屋" : "メモ";

  return createPortal(
    <dialog
      ref={ref}
      className="bk-det"
      aria-label={booking.title}
      inert={closing}
    >
      <div className="bk-det-in">
        <div className="bk-detail">
          <BookingCard booking={booking} now={now} showDate />
          {connection && (
            <p className="bk-conn">
              {connection.airportName}で乗り継ぎ ·{" "}
              {formatConnectionDuration(connection.durationMinutes)}
            </p>
          )}
          <div className="bk-kv">
            <div>
              <span>
                <small>予約番号</small>
                <b className="bk-kv-code">
                  {booking.confirmationCode || "なし"}
                </b>
              </span>
              {booking.confirmationCode && (
                <button
                  type="button"
                  onClick={(event) => {
                    press(event.currentTarget);
                    void run(async () => {
                      await copyText(booking.confirmationCode);
                      notify("コピーしました");
                    });
                  }}
                >
                  <CopyIcon size={16} />
                  コピー
                </button>
              )}
            </div>
            {japan && (
              <div>
                <span>
                  <small>日本時間</small>
                  <b>
                    {japan[0]} → {japan[1]}
                  </b>
                </span>
              </div>
            )}
            {booking.note && (
              <div>
                <span>
                  <small>{seatLabel}</small>
                  <b className="bk-kv-note">{booking.note}</b>
                </span>
              </div>
            )}
            {documents.map((file) => (
              <div key={file.id}>
                <span className="bk-doc">
                  <span className="bk-pg">
                    {file.contentType === "application/pdf"
                      ? "PDF"
                      : (file.contentType.split("/")[1] ?? "IMG")
                          .replace("jpeg", "JPG")
                          .toUpperCase()}
                  </span>
                  <span>
                    <small>書類</small>
                    <b>{file.filename}</b>
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => open(file)}
                >
                  開く
                </button>
              </div>
            ))}
            {!route && placeText && (
              <div>
                <span>
                  <small>場所</small>
                  <b>{placeText}</b>
                </span>
                {map && (
                  <a href={map} target="_blank" rel="noreferrer">
                    <PinIcon size={16} />
                    地図
                  </a>
                )}
              </div>
            )}
            {booking.kind === "flight" && travel.canEdit && (
              <div>
                <span>
                  <small>乗り継ぎ</small>
                  <b>
                    {connection
                      ? `${connection.airportName}で乗り継ぎ`
                      : "乗り継ぎなし"}
                  </b>
                </span>
                <label className="bk-kv-pick">
                  変える
                  <select
                    aria-label="乗り継ぎの設定"
                    value={
                      booking.connectionMode === "manual"
                        ? (booking.nextFlightId ?? "auto")
                        : (booking.connectionMode ?? "auto")
                    }
                    onChange={(event) =>
                      void run(() => {
                        const value = event.target.value;
                        travel.setFlightConnection(
                          id,
                          value === "auto" || value === "none"
                            ? value
                            : "manual",
                          value === "auto" || value === "none" ? null : value,
                        );
                      })
                    }
                  >
                    <option value="auto">自動で検出</option>
                    <option value="none">乗り継ぎなし</option>
                    {candidates.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.title} · {entry.day} {entry.time}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {booking.day && (
              <div>
                <span>
                  <small>しおり</small>
                  <b>
                    {dayLabel(booking.day)}
                    {booking.time ? ` ${booking.time}` : ""} の予定
                  </b>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const trip = travel.selectedTrip?.id;
                    onClose();
                    if (trip)
                      navigate(`/trips/${trip}/itinerary?day=${booking.day}`);
                  }}
                >
                  <ArrowIcon size={16} />
                  しおりで見る
                </button>
              </div>
            )}
          </div>
          {travel.canEdit && (
            <>
              <label className={`bk-attach${busy ? " disabled" : ""}`}>
                <ClipIcon size={18} />
                書類（PDF・画像）を付ける
                <input
                  hidden
                  disabled={busy}
                  type="file"
                  multiple
                  accept="application/pdf,image/jpeg,image/png,image/gif,image/webp,.heic,.heif"
                  onChange={(event) => {
                    if (event.target.files) upload(event.target.files);
                    event.target.value = "";
                  }}
                />
              </label>
              <div className="bk-acts">
                <button type="button" onClick={() => setEditing(true)}>
                  編集する
                </button>
                <button type="button" className="danger" onClick={remove}>
                  削除する
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <ThumbDock mode="context" target={() => ref.current} disabled={closing}>
        <ContextDock
          back={
            <button type="button" aria-label="戻る" onClick={close}>
              <DockBackIcon />
            </button>
          }
          primary={
            <button type="button" onClick={() => setShowing(true)}>
              <ShowIcon size={22} />
              見せる
            </button>
          }
        />
      </ThumbDock>
      {editing && (
        <BookingEditor booking={booking} onClose={() => setEditing(false)} />
      )}
      {showing && (
        <BookingShow
          booking={booking}
          documents={documents}
          onOpen={open}
          onClose={() => setShowing(false)}
        />
      )}
      {preview && (
        <DocumentPreview {...preview} onClose={() => setPreview(null)} />
      )}
    </dialog>,
    document.body,
  );
}

/** 見せる: the booking big enough to hold up at a counter (the mock's .show). */
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
  const [closing, setClosing] = useState(false);
  const ref = useLayer(() => setClosing(true));
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog?.animate || RM()) return;
    dialog.animate(
      [
        { clipPath: "circle(0% at 80% 95%)" },
        { clipPath: "circle(150% at 80% 95%)" },
      ],
      { duration: 420, easing: "cubic-bezier(.3,0,.2,1)" },
    );
    const code = dialog.querySelector(".bk-show-code");
    if (code)
      void spring(
        code,
        [{ transform: "scale(.7)" }, { transform: "none" }],
        "boing",
        { delay: 160, fill: "backwards" },
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!closing) return;
    const dialog = ref.current;
    if (!dialog || RM()) return onClose();
    void anim(dialog, [{ opacity: 1 }, { opacity: 0 }], {
      duration: 160,
      fill: "forwards",
    }).then(onClose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);
  const kind = bookingKinds.find(
    (entry) => entry.value === booking.kind,
  )?.label;
  const route = ["flight", "train", "car"].includes(booking.kind);
  const detail =
    booking.detail && !/^https?:/i.test(booking.detail) ? booking.detail : "";
  // Vehicles lead with the number and name the carrier; the rest lead with their name.
  const kicker = [kind, route ? booking.title : detail]
    .filter(Boolean)
    .join(" · ");
  const heading = route ? detail : booking.title;
  const place = (name: string, airportCode: string) =>
    booking.kind === "flight"
      ? findAirportByCode(airportCode)?.code || airportCode || name
      : name || airportCode;
  const end = booking.endDay || booking.day;
  const nextDay = end > booking.day;
  const document = documents[0];
  return createPortal(
    <dialog
      ref={ref}
      className="bk-showl"
      aria-label={`${booking.title}を見せる`}
      inert={closing}
    >
      <div className="bk-show">
        <span className="bk-show-k">{kicker}</span>
        {heading && <h3>{heading}</h3>}
        <div className="bk-show-big">
          {route ? (
            <>
              {booking.kind === "flight" ? (
                place(booking.origin, booking.originCode)
              ) : (
                <span className="words">
                  {place(booking.origin, booking.originCode)}
                </span>
              )}{" "}
              →{" "}
              {booking.kind === "flight" ? (
                place(booking.destination, booking.destinationCode)
              ) : (
                <span className="words">
                  {place(booking.destination, booking.destinationCode)}
                </span>
              )}
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
          <div className="bk-show-code">
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
      <ThumbDock mode="context" target={() => ref.current} disabled={closing}>
        <ContextDock
          primary={
            <button type="button" onClick={() => setClosing(true)}>
              閉じる
            </button>
          }
        />
      </ThumbDock>
    </dialog>,
    window.document.body,
  );
}
