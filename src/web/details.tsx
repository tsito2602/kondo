import { dismissModal } from "./motion";
import { Button } from "./obsidian/button";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Copy, FileText, Trash2, Download, Pencil } from "lucide-react";
import { useTravel } from "@/data/travel-provider";
import { bookingDurationLabel } from "@/data/booking-duration";
import { findAirportByCode } from "@/data/airports";
import {
  findFlightConnections,
  flightConnectionCandidates,
  formatConnectionDuration,
  localDateTimeToEpoch,
} from "@/data/flight-connections";
import {
  mapUrl,
  placeStatuses,
  reservationStatuses,
  referenceUrl,
} from "@/data/places";
import {
  itemDetails,
  itemCategory,
  durationMinutes,
  durationLabel,
  transportLabel,
} from "@/data/itinerary";
import type {
  Booking,
  BookingDocument,
  ItineraryItem,
  Place,
} from "@/data/types";
import { formatDate } from "@/utils/dates";
import {
  BookingEditor,
  ItemEditor,
  PlaceEditor,
  bookingKinds,
} from "./editors";
import { Modal, Field, MapLink, copyText, useAction, useToast } from "./ui";

export function BookingRoute({ booking }: { booking: Booking }) {
  const start = findAirportByCode(booking.originCode);
  const end = findAirportByCode(booking.destinationCode);
  return (
    <div className="booking-route">
      <div>
        <strong className={booking.originCode ? "route-code" : "route-label"}>
          {booking.originCode || booking.origin || "出発"}
        </strong>
        <span>{start?.name ?? booking.origin}</span>
      </div>
      <span aria-hidden="true">→</span>
      <div>
        <strong
          className={booking.destinationCode ? "route-code" : "route-label"}
        >
          {booking.destinationCode || booking.destination || "到着"}
        </strong>
        <span>{end?.name ?? booking.destination}</span>
      </div>
    </div>
  );
}
function FlightTime({
  day,
  time,
  code,
}: {
  day: string;
  time: string;
  code: string;
}) {
  const zone = findAirportByCode(code)?.timeZone;
  const epoch = zone ? localDateTimeToEpoch(day, time, zone) : null;
  const zoneName =
    epoch !== null && zone
      ? new Intl.DateTimeFormat("en", {
          timeZone: zone,
          timeZoneName: "shortOffset",
        })
          .formatToParts(epoch)
          .find((part) => part.type === "timeZoneName")?.value
      : "";
  return (
    <div>
      <strong>
        {formatDate(day)} {time}
      </strong>
      <p className="muted">現地時刻 {zoneName}</p>
      {epoch !== null && (
        <small>
          日本時間{" "}
          {new Intl.DateTimeFormat("ja-JP", {
            timeZone: "Asia/Tokyo",
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }).format(epoch)}{" "}
          JST
        </small>
      )}
    </div>
  );
}
export function BookingDetail({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const travel = useTravel();
  const notify = useToast();
  const { busy, run } = useAction();
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
  if (!booking) return null;
  if (preview)
    return (
      <Modal
        title={preview.file.filename}
        onClose={() => setPreview(null)}
        full
      >
        <div className="document-preview">
          {preview.file.contentType === "application/pdf" ? (
            <iframe title={preview.file.filename} src={preview.url} />
          ) : ["image/heic", "image/heif"].includes(
              preview.file.contentType,
            ) ? (
            <p>この画像は端末に保存して開けます。</p>
          ) : (
            <img alt={preview.file.filename} src={preview.url} />
          )}
          <a
            className="secondary"
            href={preview.url}
            download={preview.file.filename}
          >
            端末に保存
          </a>
        </div>
      </Modal>
    );
  if (editing)
    return (
      <BookingEditor booking={booking} onClose={() => setEditing(false)} />
    );
  const documents = travel.documentsByBooking[id] ?? [];
  const connection = findFlightConnections(travel.bookings).find(
    (entry) => entry.arrivalBookingId === id,
  );
  const candidates = flightConnectionCandidates(booking, travel.bookings).map(
    (entry) => entry.booking,
  );
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
        if (
          ![
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
            "image/heic",
            "image/heif",
          ].includes(type)
        )
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
  const download = (file: BookingDocument) =>
    void run(async () => {
      const bytes = await travel.downloadBookingDocument(id, file.id);
      const url = URL.createObjectURL(
        new Blob([bytes], { type: file.contentType }),
      );
      setPreview({ url, file });
    });
  return (
    <Modal
      title="予約詳細"
      onClose={onClose}
      full
      action={
        travel.canEdit && (
          <Button
            variant="ghost"
            className="text-button"
            onClick={() => setEditing(true)}
          >
            編集
          </Button>
        )
      }
    >
      <div className="detail-stack">
        <span className="badge">
          {bookingKinds.find((entry) => entry.value === booking.kind)?.label}
        </span>
        <h1>{booking.title}</h1>
        <p>{booking.detail}</p>
        {["flight", "train", "car"].includes(booking.kind) && (
          <BookingRoute booking={booking} />
        )}
        <div className="detail-grid">
          <section>
            <h3>{booking.kind === "hotel" ? "チェックイン" : "開始・出発"}</h3>
            {booking.kind === "flight" ? (
              <FlightTime
                day={booking.day}
                time={booking.time}
                code={booking.originCode}
              />
            ) : (
              <p>
                {formatDate(booking.day)} {booking.time}
              </p>
            )}
          </section>
          <section>
            <h3>
              {booking.kind === "hotel" ? "チェックアウト" : "終了・到着"}
            </h3>
            {booking.kind === "flight" ? (
              <FlightTime
                day={booking.endDay || booking.day}
                time={booking.endTime}
                code={booking.destinationCode}
              />
            ) : (
              <p>
                {formatDate(booking.endDay || booking.day)} {booking.endTime}
              </p>
            )}
          </section>
        </div>
        {bookingDurationLabel(booking) && (
          <p className="badge">{bookingDurationLabel(booking)}</p>
        )}
        {(booking.location || (booking.kind === "hotel" && booking.detail)) && (
          <section>
            <h3>場所</h3>
            <p>{booking.location || booking.detail}</p>
            <MapLink url={mapUrl(booking.location || booking.detail)} />
          </section>
        )}
        {booking.confirmationCode && (
          <section>
            <h3>予約番号</h3>
            <button
              className="copy-code"
              onClick={() =>
                void run(async () => {
                  await copyText(booking.confirmationCode);
                  notify("予約番号をコピーしました");
                })
              }
            >
              {booking.confirmationCode}
              <Copy size={17} />
            </button>
          </section>
        )}
        {booking.note && (
          <section>
            <h3>メモ</h3>
            <p className="pre-wrap">{booking.note}</p>
          </section>
        )}
        {booking.kind === "flight" && (
          <section>
            <h3>乗り継ぎ</h3>
            {connection ? (
              <p>
                {connection.airportName} ·{" "}
                {formatConnectionDuration(connection.durationMinutes)}
              </p>
            ) : (
              <p className="muted">設定された乗り継ぎはありません</p>
            )}
            {travel.canEdit && (
              <Field label="乗り継ぎの設定">
                <select
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
                        value === "auto" || value === "none" ? value : "manual",
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
              </Field>
            )}
          </section>
        )}
        <section
          className="documents"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (travel.canEdit) upload(event.dataTransfer.files);
          }}
        >
          <h3>予約書類</h3>
          {documents.map((file) => (
            <div className="document-row" key={file.id}>
              <FileText />
              <button
                className="grow text-button"
                disabled={busy}
                onClick={() => download(file)}
              >
                {file.filename}
                <small>{(file.size / 1024).toFixed(0)} KB</small>
              </button>
              <Download size={17} />
              {travel.canEdit && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  className="icon-button danger"
                  aria-label={`${file.filename}を削除`}
                  onClick={() => {
                    if (confirm("この書類を削除しますか？"))
                      travel.deleteBookingDocument(id, file.id);
                  }}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          ))}
          {!documents.length && (
            <p className="muted">PDFやチケットの画像をまとめて保存できます。</p>
          )}
          {travel.canEdit && (
            <label className={`secondary ${busy ? "disabled" : ""}`}>
              {busy ? "処理中…" : "書類を追加"}
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
          )}
        </section>
        {travel.canEdit && (
          <button
            className="danger subtle"
            onClick={() =>
              void run(() => {
                if (confirm("この予約を削除しますか？")) {
                  dismissModal(() => {
                    travel.deleteBooking(id);
                    onClose();
                  });
                }
              })
            }
          >
            <Trash2 />
            予約を削除
          </button>
        )}
      </div>
    </Modal>
  );
}
export function ItemDetail({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const travel = useTravel();
  const { run } = useAction();
  const [editing, setEditing] = useState(false);
  const item = travel.items.find((entry) => entry.id === id);
  const place = travel.places.find((entry) => entry.itineraryItemId === id);
  if (place) return <PlaceDetail id={place.id} onClose={onClose} />;
  if (!item) return null;
  if (editing)
    return <ItemEditor item={item} onClose={() => setEditing(false)} />;
  const details = itemDetails(item);
  return (
    <Modal
      title="予定詳細"
      onClose={onClose}
      full
      action={
        travel.canEdit && (
          <Button
            variant="ghost"
            className="text-button"
            onClick={() => setEditing(true)}
          >
            編集
          </Button>
        )
      }
    >
      <div className="detail-stack">
        <span className="badge">{itemCategory(item).label}</span>
        <h1>{item.title}</h1>
        <p>
          {formatDate(item.day)} {item.time}
          {details.endTime &&
            ` 〜 ${details.endDay && details.endDay !== item.day ? formatDate(details.endDay) : ""} ${details.endTime}`}
        </p>
        {details.category === "transport" && (
          <>
            <p>
              {transportLabel(details)} ·{" "}
              {durationLabel(durationMinutes(item.day, item.time, details))}
            </p>
            <p>
              {details.transport?.origin} → {details.transport?.destination}
            </p>
          </>
        )}
        {details.location && (
          <section>
            <h3>場所</h3>
            <p>{details.location}</p>
            <MapLink url={mapUrl(details.location)} />
          </section>
        )}
        {item.note && (
          <section>
            <h3>メモ</h3>
            <p className="pre-wrap">{item.note}</p>
          </section>
        )}
        {travel.canEdit && (
          <button
            className="danger subtle"
            onClick={() =>
              void run(() => {
                if (confirm("この予定を削除しますか？")) {
                  dismissModal(() => {
                    travel.deleteItem(id);
                    onClose();
                  });
                }
              })
            }
          >
            <Trash2 />
            予定を削除
          </button>
        )}
      </div>
    </Modal>
  );
}
export function PlaceDetail({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const travel = useTravel();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"view" | "edit" | "schedule">("view");
  const { run } = useAction();
  const place = travel.places.find((entry) => entry.id === id);
  if (!place) return null;
  const linked = travel.items.find(
    (entry) => entry.id === place.itineraryItemId,
  );
  if (mode === "edit")
    return <PlaceEditor place={place} onClose={() => setMode("view")} />;
  if (mode === "schedule")
    return (
      <ItemEditor item={linked} place={place} onClose={() => setMode("view")} />
    );
  return (
    <Modal
      title="場所の詳細"
      onClose={onClose}
      full
      action={
        travel.canEdit && (
          <Button
            variant="ghost"
            className="text-button"
            onClick={() => setMode("edit")}
          >
            編集
          </Button>
        )
      }
    >
      <div className="detail-stack">
        <div className="row">
          <span className={`badge status-${place.status}`}>
            {placeStatuses.find((entry) => entry.value === place.status)?.label}
          </span>
          <span className="badge">
            {
              reservationStatuses.find(
                (entry) => entry.value === place.reservationStatus,
              )?.label
            }
          </span>
        </div>
        <h1>{place.title}</h1>
        {place.location && <p>{place.location}</p>}
        <MapLink url={mapUrl(place.location, place.title)} />
        {place.openingHours && (
          <section>
            <h3>営業時間</h3>
            <p className="pre-wrap">{place.openingHours}</p>
          </section>
        )}
        {place.note && (
          <section>
            <h3>メモ</h3>
            <p className="pre-wrap">{place.note}</p>
          </section>
        )}
        {place.referenceLinks?.length ? (
          <section>
            <h3>参照リンク</h3>
            {place.referenceLinks.map((link, index) => {
              const url = referenceUrl(link.url);
              return (
                url && (
                  <a
                    key={index}
                    className="reference-link"
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {link.label || new URL(url).hostname}
                  </a>
                )
              );
            })}
          </section>
        ) : null}
        {linked ? (
          <>
            <Button
              variant="ghost"
              className="primary"
              onClick={() => {
                dismissModal(() => {
                  onClose();
                  navigate(
                    `/trips/${travel.selectedTrip!.id}/itinerary?day=${linked.day}&item=${linked.id}`,
                  );
                });
              }}
            >
              しおりを見る
            </Button>
            {travel.canEdit && (
              <Button
                variant="ghost"
                className="secondary"
                onClick={() => setMode("schedule")}
              >
                <Pencil />
                予定の日時を編集
              </Button>
            )}
          </>
        ) : (
          travel.canEdit && (
            <Button
              variant="ghost"
              className="primary"
              onClick={() => setMode("schedule")}
            >
              しおりへ追加
            </Button>
          )
        )}
        {travel.canEdit && (
          <button
            className="danger subtle"
            onClick={() =>
              void run(() => {
                if (confirm("この場所を削除しますか？")) {
                  dismissModal(() => {
                    travel.deletePlace(id);
                    onClose();
                  });
                }
              })
            }
          >
            <Trash2 />
            場所を削除
          </button>
        )}
      </div>
    </Modal>
  );
}
