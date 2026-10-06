import type { ReactNode } from "react";
import type { BookingKind } from "@/data/types";

// The 予約 mock's own glyphs (kondo-bookings.html <symbol>s), path for path.
export type BookingIcon = (props: {
  size?: number;
  strokeWidth?: number;
  className?: string;
}) => ReactNode;

const glyph =
  (paths: ReactNode): BookingIcon =>
  ({ size = 20, className }) => (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
const stroke = (width: number) => ({
  fill: "none",
  stroke: "currentColor",
  strokeWidth: width,
});

export const PlaneIcon = glyph(
  <path
    d="M21 15.5v-2l-8-5V3.8a1.5 1.5 0 0 0-3 0v4.7l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-5z"
    fill="currentColor"
  />,
);
export const BedIcon = glyph(
  <path
    d="M3 19V6M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6M7 12.5a1.8 1.8 0 1 0 0-.01"
    {...stroke(1.9)}
    strokeLinecap="round"
    strokeLinejoin="round"
  />,
);
export const TrainIcon = glyph(
  <>
    <rect x="5" y="3" width="14" height="14" rx="4" {...stroke(2)} />
    <path
      d="M5 10h14M9 21l2-4M15 21l-2-4"
      {...stroke(2)}
      strokeLinecap="round"
    />
    <circle cx="9" cy="13.5" r="1.2" fill="currentColor" />
    <circle cx="15" cy="13.5" r="1.2" fill="currentColor" />
  </>,
);
export const CarIcon = glyph(
  <>
    <path d="M4 16v-4l2-5h12l2 5v4z" {...stroke(2)} strokeLinejoin="round" />
    <circle cx="8" cy="17" r="2" fill="currentColor" />
    <circle cx="16" cy="17" r="2" fill="currentColor" />
  </>,
);
export const MealIcon = glyph(
  <path
    d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M17 21V3c-2.5 1-4 4-4 8h4"
    {...stroke(1.9)}
    strokeLinecap="round"
    strokeLinejoin="round"
  />,
);
export const TicketIcon = glyph(
  <>
    <path
      d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"
      {...stroke(1.9)}
      strokeLinejoin="round"
    />
    <path
      d="M14 7v10"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeDasharray="2 2"
    />
  </>,
);
export const OtherIcon = glyph(
  <>
    <circle cx="12" cy="12" r="7.5" {...stroke(1.9)} />
    <circle cx="12" cy="12" r="2.4" fill="currentColor" />
  </>,
);
export const ClipIcon = glyph(
  <path
    d="M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17.2a1.7 1.7 0 0 1-2.4-2.4L15 7"
    {...stroke(2)}
    strokeLinecap="round"
  />,
);
export const CheckIcon = glyph(
  <path
    d="M5 12.5l4.5 4.5L19 7.5"
    {...stroke(3)}
    strokeLinecap="round"
    strokeLinejoin="round"
  />,
);
export const ShowIcon = glyph(
  <>
    <rect x="6" y="2.5" width="12" height="19" rx="3" {...stroke(2)} />
    <path
      d="M10 18h4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </>,
);
export const CopyIcon = glyph(
  <>
    <rect x="8" y="8" width="12" height="12" rx="3" {...stroke(2)} />
    <path
      d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"
      {...stroke(2)}
    />
  </>,
);
export const PinIcon = glyph(
  <>
    <path d="M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11z" {...stroke(1.9)} />
    <circle cx="12" cy="10" r="2" fill="currentColor" />
  </>,
);
export const ArrowIcon = glyph(
  <path
    d="M5 12h13M13 6l6 6-6 6"
    {...stroke(2.4)}
    strokeLinecap="round"
    strokeLinejoin="round"
  />,
);
export const PlusIcon = glyph(
  <path d="M12 5v14M5 12h14" {...stroke(2.6)} strokeLinecap="round" />,
);

export const bookingIcons: Record<BookingKind, BookingIcon> = {
  flight: PlaneIcon,
  hotel: BedIcon,
  train: TrainIcon,
  car: CarIcon,
  restaurant: MealIcon,
  ticket: TicketIcon,
  other: OtherIcon,
};
