import { useState } from "react";
import { CalendarPanel } from "./date-picker";
import { TimeChip } from "./timeline-picker";
import { shortDate } from "./calendar/date-range";

export type MomentPatch = {
  date?: string;
  time?: string;
  endDate?: string;
  endTime?: string;
};

type End = { label: string; date: string; time: string };

/**
 * A ticket's 日時 (Tsubasa 2026-10-07): one row per end, its label over a
 * 日付の粒 「10/19（月）」 and a 時刻の粒 「22:20」. Used by both the booking
 * editor and 予約手入力 so the two read the same. A stay (hotel, car) picks
 * its two dates as one range; a flight's or train's ends are picked one by one.
 */
export function MomentRows({
  title,
  start,
  end,
  stay = false,
  span,
  trip,
  panelLabel,
  onChange,
}: {
  title: string;
  /** The range panel's title, e.g. 「宿泊の日」. */
  panelLabel?: string;
  start: End;
  end?: End;
  stay?: boolean;
  span?: "days" | "nights";
  trip?: { startsOn: string; endsOn: string };
  onChange: (patch: MomentPatch) => void;
}) {
  const [open, setOpen] = useState<"start" | "end" | null>(null);
  const row = (which: "start" | "end", entry: End) => (
    <div className="bk-fld bk-moment" key={which}>
      <small>{entry.label}</small>
      <span>
        <button
          type="button"
          className="bk-date"
          aria-label={`${entry.label}の日付`}
          aria-haspopup="dialog"
          data-date-value={entry.date}
          data-empty={!entry.date || undefined}
          onClick={() => setOpen(which)}
        >
          {entry.date ? shortDate(entry.date) : "日付を選ぶ"}
        </button>
        <TimeChip
          bare
          label={entry.label}
          title={title}
          day={entry.date || start.date}
          time={entry.time}
          onChange={(time) =>
            onChange(which === "start" ? { time } : { endTime: time })
          }
        />
      </span>
    </div>
  );
  const current = open === "end" && end ? end : start;
  return (
    <>
      {row("start", start)}
      {end && row("end", end)}
      {open && (
        <CalendarPanel
          label={stay ? (panelLabel ?? "日付") : `${current.label}の日`}
          range={stay}
          span={stay ? span : undefined}
          startLabel={stay ? start.label : current.label}
          endLabel={end?.label}
          phase={open}
          value={stay ? start.date : current.date}
          endValue={stay ? end?.date : undefined}
          trip={trip}
          onChange={(date, endDate) =>
            onChange(
              stay
                ? { date, endDate }
                : open === "start"
                  ? { date }
                  : { endDate: date },
            )
          }
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
