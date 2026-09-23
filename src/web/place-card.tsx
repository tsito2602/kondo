import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  MapPin,
  Plus,
} from "lucide-react";
import { Link } from "react-router";
import { placeStatuses, reservationStatuses } from "@/data/places";
import type { ItineraryItem, Place } from "@/data/types";
import { formatDate } from "@/utils/dates";

export function PlaceCard({
  place,
  linked,
  tripId,
  onOpen,
  onSchedule,
}: {
  place: Place;
  linked?: ItineraryItem;
  tripId: string;
  onOpen: () => void;
  onSchedule?: () => void;
}) {
  const address =
    place.location && !/^https?:\/\//i.test(place.location)
      ? place.location
      : "";
  return (
    <article className="place-card">
      <button
        className="place-card-main"
        aria-label={`${place.title}の詳細`}
        onClick={onOpen}
      >
        <span className="place-card-heading">
          <span className={`badge status-${place.status}`}>
            {placeStatuses.find((entry) => entry.value === place.status)?.label}
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </span>
        <h2>{place.title}</h2>
        {address && (
          <span className="place-card-location">
            <MapPin size={14} />
            <span>{address}</span>
          </span>
        )}
        {place.note && <span className="place-card-note">{place.note}</span>}
        {linked && (
          <span className="place-card-schedule">
            <CalendarDays size={14} />
            {formatDate(linked.day)} {linked.time}
          </span>
        )}
      </button>
      <div className="place-card-footer">
        <span className="place-card-reservation">
          {
            reservationStatuses.find(
              (entry) => entry.value === place.reservationStatus,
            )?.label
          }
        </span>
        {linked ? (
          <Link
            className="place-card-action"
            to={`/trips/${tripId}/itinerary?day=${linked.day}&item=${linked.id}`}
          >
            <BookOpen size={15} />
            しおりを見る
          </Link>
        ) : (
          onSchedule && (
            <button className="place-card-action" onClick={onSchedule}>
              <Plus size={15} />
              しおりへ追加
            </button>
          )
        )}
      </div>
    </article>
  );
}
