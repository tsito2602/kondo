import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { BookOpen } from "lucide-react";
import {
  findFlightConnections,
  flightConnectionCandidates,
  formatConnectionDuration,
} from "@/data/flight-connections";
import { mapUrl, referenceUrl } from "@/data/places";
import { useTravel } from "@/data/travel-provider";
import type { BookingDocument } from "@/data/types";
import { BookingCard, dayLabel, useClockNow } from "./booking-card";
import { ArrowIcon, ClipIcon, CopyIcon, PinIcon } from "./booking-icons";
import { japanTimes } from "./booking-schedule";
import { spring } from "./cartoon";
import { DocumentPreview } from "./document-preview";
import { BookingEditor } from "./editors";
import { lockModalPage } from "./modal-scroll-lock";
import { dismissModal } from "./motion";
import {
  copyText,
  DetailDockActions,
  DockFunction,
  Modal,
  useAction,
  useToast,
} from "./ui";

const DOC_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
];

/** A layer of its own (予約を追加's import sheet): a modal <dialog> so
    focus, Escape and the dock's top layer behave like a sheet. */
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
  const booking = travel.bookings.find((entry) => entry.id === id);
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
      if (confirm("この予約を削除しますか？"))
        dismissModal(() => {
          travel.deleteBooking(id);
          onClose();
        });
    });
  const press = (element: Element) =>
    spring(
      element,
      [{ transform: "scale(.9)" }, { transform: "none" }],
      "squish",
    );
  const seatLabel = booking.kind === "hotel" ? "部屋" : "メモ";
  const showInItinerary = () => {
    const trip = travel.selectedTrip?.id;
    dismissModal(() => {
      onClose();
      if (trip) navigate(`/trips/${trip}/itinerary?day=${booking.day}`);
    });
  };
  // しおりで見る is a function of its own: its own island in the dock.
  const itineraryButton = booking.day ? (
    <DockFunction
      label="しおりで見る"
      short="しおり"
      icon={<BookOpen aria-hidden="true" />}
      onClick={showInItinerary}
    />
  ) : undefined;

  return (
    <>
      <Modal
        title="予約の詳細"
        addPanel
        onClose={onClose}
        dockActions={{
          // Every detail panel's dock: ‹ closes, 編集 then 削除 at the right
          // edge, and しおりで見る on its own island left of them.
          actions: travel.canEdit ? (
            <DetailDockActions
              onEdit={() => setEditing(true)}
              deleteLabel="予約を削除"
              onDelete={remove}
            />
          ) : (
            itineraryButton
          ),
          secondary: travel.canEdit ? itineraryButton : undefined,
        }}
      >
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
                {/* On a phone the dock carries it (しおり island). */}
                <button
                  type="button"
                  className="bk-kv-dock-twin"
                  onClick={showInItinerary}
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
              {/* Wide screens have no dock: 編集 and 削除 stay in the panel. */}
              <div className="bk-acts detail-inline-action">
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
      </Modal>
      {editing && (
        <BookingEditor booking={booking} onClose={() => setEditing(false)} />
      )}
      {preview && (
        <DocumentPreview {...preview} onClose={() => setPreview(null)} />
      )}
    </>
  );
}
