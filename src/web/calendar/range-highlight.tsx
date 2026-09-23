import { useLayoutEffect, useRef, useState } from "react";
import { rangeRows, type DateRange } from "./date-range";

/** Production geometry: 32px weekdays, 46px rows and 36px round markers. */
export function RangeHighlight({
  days,
  range,
  markers,
  anchorDate,
  previewDate,
}: {
  days: (string | null)[];
  range: DateRange;
  markers: DateRange;
  anchorDate: string;
  previewDate: string;
}) {
  const anchor = days.indexOf(anchorDate);
  const anchorRow =
    anchor < 0
      ? range.startDate < (days.find(Boolean) ?? "")
        ? 0
        : 5
      : Math.floor(anchor / 7);
  return (
    <div className="calendar-highlights" aria-hidden="true">
      {rangeRows(days, range).map((segment, row) => {
        const origin =
          anchor < 0
            ? anchorRow === 0
              ? 0
              : 6
            : Math.max(0, Math.min(6, anchor - row * 7));
        const firstDate = segment ? days[row * 7 + segment.first] : null;
        const lastDate = segment ? days[row * 7 + segment.last] : null;
        const start = segment
          ? segment.first + (firstDate === range.startDate ? 0.5 : 0)
          : origin + 0.5;
        const end = segment
          ? segment.last + (lastDate === range.endDate ? 0.5 : 1)
          : start;
        return (
          <div
            key={row}
            className="calendar-range-band"
            style={{
              left: `${(start * 100) / 7}%`,
              width: `${(Math.max(0, end - start) * 100) / 7}%`,
              top: 32 + row * 46 + 5,
              opacity: end > start ? 1 : 0,
            }}
          />
        );
      })}
      <DateMarker index={days.indexOf(markers.startDate)} />
      <DateMarker
        index={
          markers.endDate !== markers.startDate
            ? days.indexOf(markers.endDate)
            : -1
        }
        origin={anchor}
      />
      <DateMarker
        index={days.indexOf(previewDate)}
        origin={days.indexOf(markers.endDate || markers.startDate)}
        preview
      />
    </div>
  );
}

function DateMarker({
  index,
  origin = -1,
  preview = false,
}: {
  index: number;
  origin?: number;
  preview?: boolean;
}) {
  const marker = useRef<HTMLDivElement>(null);
  const positioned = useRef(index >= 0);
  const [position, setPosition] = useState(index >= 0 ? index : 0);
  useLayoutEffect(() => {
    if (index < 0) return;
    if (!positioned.current) {
      // Place a new endpoint at its anchor without animating from an unrelated cell.
      if (marker.current) marker.current.style.transitionProperty = "opacity";
      setPosition(origin >= 0 ? origin : index);
      positioned.current = true;
      const frame = requestAnimationFrame(() => {
        marker.current?.getBoundingClientRect();
        if (marker.current) marker.current.style.transitionProperty = "";
        setPosition(index);
      });
      return () => {
        cancelAnimationFrame(frame);
        if (marker.current) marker.current.style.transitionProperty = "";
      };
    }
    setPosition(index);
  }, [index, origin]);
  return (
    <div
      ref={marker}
      className={`calendar-marker${preview ? " preview" : ""}`}
      style={{
        left: `calc(${(((position % 7) + 0.5) * 100) / 7}% - 18px)`,
        top: 32 + Math.floor(position / 7) * 46 + 5,
        opacity: index >= 0 ? 1 : 0,
      }}
    />
  );
}
