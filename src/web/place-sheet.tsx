import type { ReactNode } from "react";
import { FileText, Plus } from "lucide-react";
import { registeredGoogleMapsUrl, type Coordinates } from "@/data/places";
import { DockFunction, Modal } from "./ui";

/** Only a saved Google Maps link, or else the pin itself, opens Google Maps. */
export function placeMapsHref(location: string, point: Coordinates | null) {
  return (
    registeredGoogleMapsUrl(location) ??
    (point
      ? `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`
      : null)
  );
}

/** A place picked on the map, in the same floating panel as every other
    detail (Tsubasa 2026-10-06: 「場所カードはフローティングパネルにして」):
    its name heads the panel, 詳細を開く rides the dock on its own island. */
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
  return (
    <Modal
      title={title}
      addPanel
      onClose={onClose}
      dockActions={{
        actions: (
          <DockFunction
            label={`${title}の詳細を開く`}
            short="詳細を開く"
            icon={<FileText aria-hidden="true" />}
            onClick={onOpen}
          />
        ),
      }}
    >
      <div className="places-card">
        {tag}
        <div className="places-card-meta">
          {lines.map((line, index) => (
            <span key={index}>
              {index > 0 && <br />}
              {line}
            </span>
          ))}
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
    </Modal>
  );
}
