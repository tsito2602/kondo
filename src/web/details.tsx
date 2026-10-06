import { PlaceStatusLabel } from "./place-status";
import { DocumentPreview } from "./document-preview";
import { LinkedNotes } from "./linked-notes";
import { BookingSchedule, ItemSchedule } from "./booking-schedule";
import { BookingCard, useClockNow } from "./booking-card";
import { PlanTimePicker } from "./timeline-picker";
import { dismissModal } from "./motion";
import { Button } from "./obsidian/button";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  Copy,
  FileText,
  Trash2,
  Download,
  Plus,
  BookOpen,
  BookPlus,
  MapPin,
  Clock,
  Link as LinkIcon,
  Smartphone,
} from "lucide-react";
import { useTravel } from "@/data/travel-provider";
import { bookingDurationLabel } from "@/data/booking-duration";
import { ordinaryPlans } from "@/data/itinerary";
import { findAirportByCode } from "@/data/airports";
import {
  findFlightConnections,
  flightConnectionCandidates,
  formatConnectionDuration,
} from "@/data/flight-connections";
import { mapUrl, reservationStatuses, referenceUrl } from "@/data/places";
import type {
  Booking,
  BookingDocument,
  ItineraryItem,
  Place,
} from "@/data/types";
import {
  BookingEditor,
  ItemEditor,
  PlaceEditor,
  bookingKinds,
} from "./editors";
import {
  DetailDockActions,
  DockFunction,
  Modal,
  Field,
  MapLink,
  ExternalLink,
  copyText,
  useAction,
  useToast,
} from "./ui";

export function BookingRoute({ booking }: { booking: Booking }) {
  const start = findAirportByCode(booking.originCode);
  const end = findAirportByCode(booking.destinationCode);
  return (
    <div className="booking-route">
      <div>
        <strong className={booking.originCode ? "route-code" : "route-label"}>
          {booking.originCode ||
            booking.origin ||
            (booking.kind === "car" ? "受取" : "出発")}
        </strong>
        <span>{start?.name ?? booking.origin}</span>
      </div>
      <span aria-hidden="true">→</span>
      <div>
        <strong
          className={booking.destinationCode ? "route-code" : "route-label"}
        >
          {booking.destinationCode ||
            booking.destination ||
            (booking.kind === "car" ? "返却" : "到着")}
        </strong>
        <span>{end?.name ?? booking.destination}</span>
      </div>
    </div>
  );
}
export { BookingDetail } from "./booking-detail";
export function PlaceDetail({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const travel = useTravel();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"view" | "edit" | "schedule" | "time">(
    "view",
  );
  const { run } = useAction();
  const place = travel.places.find((entry) => entry.id === id);
  if (!place) return null;
  const linked = ordinaryPlans(travel.items).find(
    (entry) => entry.id === place.itineraryItemId,
  );
  const itineraryAction = linked ? (
    <button
      className="primary"
      onClick={() =>
        dismissModal(() => {
          onClose();
          navigate(
            `/trips/${travel.selectedTrip!.id}/itinerary?day=${linked.day}&item=${linked.id}`,
          );
        })
      }
    >
      <BookOpen size={18} aria-hidden="true" />
      しおりを見る
    </button>
  ) : travel.canEdit ? (
    <button className="primary" onClick={() => setMode("schedule")}>
      <Plus size={18} aria-hidden="true" />
      しおりへ追加
    </button>
  ) : null;
  // On a phone the dock carries it, on its own island (Tsubasa 2026-10-06).
  const itineraryDock = linked ? (
    <DockFunction
      label="しおりを見る"
      short="しおり"
      icon={<BookOpen aria-hidden="true" />}
      onClick={() =>
        dismissModal(() => {
          onClose();
          navigate(
            `/trips/${travel.selectedTrip!.id}/itinerary?day=${linked.day}&item=${linked.id}`,
          );
        })
      }
    />
  ) : travel.canEdit ? (
    <DockFunction
      label="しおりへ追加"
      short="追加"
      icon={<BookPlus aria-hidden="true" />}
      onClick={() => setMode("schedule")}
    />
  ) : undefined;
  const remove = () =>
    void run(() => {
      if (confirm("この場所を削除しますか？")) {
        dismissModal(() => {
          travel.deletePlace(id);
          onClose();
        });
      }
    });
  return (
    <>
      <Modal
        title="場所の詳細"
        addPanel
        dockActions={{
          // Every detail panel's dock: ‹ closes, 編集 then 削除 at the right
          // edge, and しおり on its own island left of them.
          actions: travel.canEdit ? (
            <DetailDockActions
              onEdit={() => setMode("edit")}
              deleteLabel="場所を削除"
              onDelete={remove}
            />
          ) : (
            itineraryDock
          ),
          secondary: travel.canEdit ? itineraryDock : undefined,
        }}
        onClose={onClose}
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
          <header className="detail-hero">
            <div className="detail-tags">
              <span className={`badge status-${place.status}`}>
                <PlaceStatusLabel status={place.status} />
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
          </header>
          {linked && (
            <div className="detail-primary detail-visit">
              <p className="detail-eyebrow">
                <BookOpen size={15} />
                しおりの予定
              </p>
              <ItemSchedule
                item={linked}
                onEditTime={travel.canEdit ? () => setMode("time") : undefined}
              />
            </div>
          )}
          <section className="detail-section">
            <h3>
              <MapPin size={16} />
              場所
            </h3>
            {place.location && !/^https?:\/\//i.test(place.location) && (
              <p>{place.location}</p>
            )}
            <MapLink url={mapUrl(place.location, place.title)} />
          </section>
          {place.openingHours && (
            <section className="detail-section">
              <h3>
                <Clock size={16} />
                営業時間
              </h3>
              <p className="pre-wrap">{place.openingHours}</p>
            </section>
          )}
          {place.note && (
            <section className="detail-section">
              <h3>メモ</h3>
              <p className="pre-wrap">{place.note}</p>
            </section>
          )}
          <LinkedNotes
            placeId={place.id}
            onOpen={(noteId) =>
              dismissModal(() => {
                onClose();
                navigate(
                  `/trips/${travel.selectedTrip!.id}/notes?note=${noteId}`,
                );
              })
            }
          />
          {place.referenceLinks?.length ? (
            <section className="detail-section">
              <h3>
                <LinkIcon size={16} />
                参照リンク
              </h3>
              {place.referenceLinks.map((link, index) => {
                const url = referenceUrl(link.url);
                return (
                  url && (
                    <ExternalLink
                      key={index}
                      url={url}
                      label={link.label || "サイトを開く"}
                    />
                  )
                );
              })}
            </section>
          ) : null}
          {itineraryAction && (
            <div className="detail-itinerary-action">{itineraryAction}</div>
          )}
          {travel.canEdit && (
            <button
              className="danger subtle detail-inline-action"
              onClick={remove}
            >
              <Trash2 />
              場所を削除
            </button>
          )}
        </div>
      </Modal>
      {mode === "edit" && (
        <PlaceEditor place={place} onClose={() => setMode("view")} />
      )}
      {mode === "time" && linked && (
        <PlanTimePicker item={linked} onClose={() => setMode("view")} />
      )}
      {mode === "schedule" && (
        <ItemEditor
          item={linked}
          place={place}
          onClose={() => setMode("view")}
        />
      )}
    </>
  );
}
