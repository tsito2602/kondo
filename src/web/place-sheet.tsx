import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { registeredGoogleMapsUrl, type Coordinates } from "@/data/places";
import { boing } from "./places-motion";

/** Only a saved Google Maps link, or else the pin itself, opens Google Maps. */
export function placeMapsHref(location: string, point: Coordinates | null) {
  return (
    registeredGoogleMapsUrl(location) ??
    (point
      ? `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`
      : null)
  );
}

export function PlaceSheet({
  title,
  tag,
  lines,
  mapsHref,
  onClose,
  onOpen,
  onSchedule,
}: {
  title: string;
  tag: ReactNode;
  lines: ReactNode[];
  mapsHref: string | null;
  onClose: () => void;
  onOpen: () => void;
  onSchedule?: () => void;
}) {
  const card = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (card.current)
      boing(card.current, [
        { transform: "translateY(40px) scale(.9)", opacity: 0 },
        { transform: "none", opacity: 1 },
      ]);
  }, []);
  return (
    <div
      ref={card}
      className="places-card"
      role="dialog"
      aria-label="場所の詳細"
      data-press-card
    >
      <div className="places-card-top">
        <div>
          {tag}
          <button
            className="places-card-title"
            onClick={onOpen}
            aria-label={`${title}の詳細`}
          >
            <h2>{title}</h2>
          </button>
          <div className="places-card-meta">
            {lines.map((line, index) => (
              <span key={index}>
                {index > 0 && <br />}
                {line}
              </span>
            ))}
          </div>
        </div>
        <button
          className="places-card-close"
          aria-label="閉じる"
          onClick={onClose}
        >
          <X size={16} strokeWidth={2.6} aria-hidden="true" />
        </button>
      </div>
      <div className="places-card-actions">
        {onSchedule && (
          <button className="is-secondary" onClick={onSchedule}>
            <Plus size={17} strokeWidth={2.4} aria-hidden="true" />
            予定に入れる
          </button>
        )}
        {mapsHref && (
          <a
            className="is-primary"
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z" />
              <path d="M9 4v14M15 6v14" />
            </svg>
            Googleマップで開く
          </a>
        )}
      </div>
    </div>
  );
}
