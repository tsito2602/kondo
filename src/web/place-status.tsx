import {
  CalendarCheck,
  CircleCheck,
  CirclePause,
  Heart,
  ListFilter,
} from "lucide-react";
import { placeStatuses } from "@/data/places";
import type { PlaceStatus } from "@/data/types";

const icons = {
  want: Heart,
  planned: CalendarCheck,
  visited: CircleCheck,
  skipped: CirclePause,
  all: ListFilter,
};
export function PlaceStatusLabel({ status }: { status: PlaceStatus | "all" }) {
  const Icon = icons[status];
  return (
    <span className="place-status-label">
      <Icon size={14} aria-hidden="true" />
      {status === "all"
        ? "すべて"
        : placeStatuses.find((entry) => entry.value === status)?.label}
    </span>
  );
}
