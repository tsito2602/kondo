import type { ReactNode } from "react";
import { useAuth } from "@/auth/auth-provider";
import { memberAssignee } from "@/data/assignee";
import { placeNumbers } from "@/data/place-numbers";
import { ordinaryPlans } from "@/data/itinerary";
import { useTravel } from "@/data/travel-provider";
import type { ItineraryItem, Place, TravelNote } from "@/data/types";
import { AssigneeAvatar } from "./assignee-avatar";
import { spring } from "./memo-motion";
import { reduceMotion } from "./motion";

/* Icons drawn for the メモ mock; lucide has no match for several of them. */
const icon = (children: ReactNode, fill = false) =>
  function Icon() {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill={fill ? "currentColor" : "none"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    );
  };
export const SearchIcon = icon(
  <>
    <circle cx="10.5" cy="10.5" r="6.5" strokeWidth="2.4" />
    <path d="M15.5 15.5L20 20" strokeWidth="2.4" />
  </>,
);
export const PlusIcon = icon(<path d="M12 5v14M5 12h14" strokeWidth="2.6" />);
export const CheckMark = icon(
  <path d="M5 12.5l4.5 4.5L19 7.5" strokeWidth="3.2" />,
);
export const AddCheckIcon = icon(
  <>
    <rect x="4" y="4" width="16" height="16" rx="5" strokeWidth="2.2" />
    <path d="M8.5 12l2.5 2.5 4.5-5" strokeWidth="2.2" />
  </>,
);
export const AddHeadingIcon = icon(
  <path d="M6 5v14M18 5v14M6 12h12" strokeWidth="2.4" />,
);
export const PinIcon = icon(
  <path d="M9 3h6l-1 6 4 4H6l4-4zM12 13v8" strokeWidth="2.2" />,
);
export function PinFilledIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 3h6l-1 6 4 4H6l4-4z" fill="currentColor" />
      <path d="M12 13v8" fill="none" />
    </svg>
  );
}
export const TrashIcon = icon(
  <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" strokeWidth="2.2" />,
);
export const ShowIcon = icon(
  <>
    <rect x="6" y="2.5" width="12" height="19" rx="3" strokeWidth="2" />
    <path d="M10 18h4" strokeWidth="2" />
  </>,
);
export const LinkPlaceIcon = icon(
  <>
    <path
      d="M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11z"
      strokeWidth="2.2"
    />
    <path d="M12 7.5v5M9.5 10h5" strokeWidth="2.2" />
  </>,
);

const WEEKDAYS = "日月火水木金土";
/** 10/21（水）: the day a linked plan happens. */
export function planDayLabel(day: string) {
  const [, month, date] = day.split("-").map(Number);
  const weekday = new Date(`${day}T00:00:00`).getDay();
  return `${month}/${date}（${WEEKDAYS[weekday]}）`;
}
/** When the note was last written, as the group would say it. */
export function noteDateLabel(updatedAt: number, now = Date.now()) {
  const then = new Date(updatedAt * 1000);
  if (now - then.getTime() < 60_000) return "たった今";
  const day = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((day(new Date(now)) - day(then)) / 86_400_000);
  if (days === 0) return "きょう";
  if (days === 1) return "きのう";
  const short = `${then.getMonth() + 1}/${then.getDate()}`;
  return then.getFullYear() === new Date(now).getFullYear()
    ? short
    : `${then.getFullYear()}/${short}`;
}

/** Last writer's face, name and date: tells the group whom to ask. */
export function NoteMeta({ note }: { note: TravelNote }) {
  const { members } = useTravel();
  const { user } = useAuth();
  const writer = note.updatedBy
    ? members.find((member) => member.id === note.updatedBy)
    : undefined;
  const name =
    note.updatedBy && note.updatedBy === user?.id
      ? "あなた"
      : writer?.name || writer?.email;
  return (
    <span className="memo-meta">
      {writer && (
        <AssigneeAvatar value={memberAssignee(writer.id)} members={members} />
      )}
      {name ? `${name} · ` : ""}
      {noteDateLabel(note.updatedAt)}
    </span>
  );
}

export type NotePlace = {
  place: Place;
  number: number;
  plan?: ItineraryItem;
};
/** Every place with its map number, scheduled ones first. */
export function useNotePlaces(): NotePlace[] {
  const travel = useTravel();
  const { places } = travel;
  // Hotel in/out records are not plans a note can point to.
  const items = ordinaryPlans(travel.items);
  const numbers = placeNumbers(places, items);
  return places
    .map((place) => ({
      place,
      number: numbers.get(place.id) ?? 0,
      plan: items.find((item) => item.id === place.itineraryItemId),
    }))
    .sort((a, b) => a.number - b.number);
}

/** The numbered pin is the same mark the map uses for this place. */
export function PlaceChip({ link }: { link: NotePlace }) {
  return (
    <span className="memo-chip">
      <span className="memo-chip-no">
        <span>{link.number}</span>
      </span>
      <em>
        {link.place.title}
        {link.plan ? ` · ${planDayLabel(link.plan.day)}` : ""}
      </em>
    </span>
  );
}

export function CheckBox({
  done,
  disabled,
  onToggle,
  label,
}: {
  done: boolean;
  disabled?: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`memo-cb${done ? " on" : ""}`}
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        const box = event.currentTarget;
        void spring(box, [{ transform: "scale(.7)" }, { transform: "none" }]);
        const mark = box.querySelector("svg");
        if (!done && !reduceMotion() && mark?.animate)
          mark.animate(
            [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }],
            { duration: 260, easing: "cubic-bezier(.3,1,.4,1)" },
          );
        onToggle();
      }}
    >
      <CheckMark />
    </button>
  );
}
