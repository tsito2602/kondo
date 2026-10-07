import { useId, useLayoutEffect, useRef, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Modal } from "./ui";
import { dismissModal } from "./motion";
import { localDate, validDate } from "@/utils/dates";
import {
  calendarDate,
  monthDays,
  rangeRows,
  selectRangeDate,
  shortDate,
  type DateRange,
} from "./calendar/date-range";

type PickerProps = {
  label: string;
  value: string;
  endValue?: string;
  onChange: (start: string, end: string) => void;
  range?: boolean;
  required?: boolean;
  min?: string;
  max?: string;
  startLabel?: string;
  endLabel?: string;
  allowedDates?: string[];
  /** What sits between the two ends: 「5日間」 (a trip) or 「3泊」 (a stay). */
  span?: "days" | "nights";
  /** The trip's own days, marked with a small dot. */
  trip?: { startsOn: string; endsOn: string };
  /** Which end the first tap sets (a stay's チェックアウト row opens on it). */
  phase?: "start" | "end";
  /** A one-day pick that may be left empty, e.g. 「期限なし」. */
  none?: string;
};

/** The trigger: the field's label over 「10/19（月）」 (— 「10/23（金）」). */
export function DatePicker(props: PickerProps) {
  const [open, setOpen] = useState(false);
  const labelId = useId();
  return (
    <div className="field date-field">
      <span id={labelId}>{props.label}</span>
      <button
        type="button"
        className="date-trigger"
        aria-labelledby={labelId}
        aria-haspopup="dialog"
        aria-required={props.required}
        data-date-value={props.value}
        data-date-end={props.endValue}
        onClick={() => setOpen(true)}
      >
        <CalendarDays size={20} aria-hidden="true" />
        <span className="date-trigger-value">
          {props.range && <small>{props.startLabel ?? "出発"}</small>}
          <span>
            {props.none && !props.value ? props.none : shortDate(props.value)}
          </span>
        </span>
        {props.range && (
          <>
            <span aria-hidden="true">—</span>
            <span className="date-trigger-value">
              <small>{props.endLabel ?? "帰着"}</small>
              <span>{shortDate(props.endValue ?? "")}</span>
            </span>
          </>
        )}
      </button>
      {open && <CalendarPanel {...props} onClose={() => setOpen(false)} />}
    </div>
  );
}

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const SPRING = "cubic-bezier(.34,1.56,.64,1)";
const reduced = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * kondo's one 日付の粒 (kondo-datepanel.html, Tsubasa 2026-10-07): the floating
 * panel with the two ends as pills, a big month with ‹ › that slides, an ink
 * circle that pops on the picked day, a band that stretches like jelly, and
 * today marked by a short line under its number.
 */
export function CalendarPanel({
  label,
  value,
  endValue = "",
  range = false,
  required = false,
  min,
  max,
  startLabel = range ? "出発" : "日付",
  endLabel = "帰着",
  allowedDates,
  span,
  trip,
  none,
  phase: firstPhase,
  onChange,
  onClose,
}: PickerProps & { onClose: () => void }) {
  const [draft, setDraft] = useState<DateRange>({
    startDate: value,
    endDate: range ? endValue : value,
  });
  // Which end the next tap sets. Once both are set, the next tap starts over.
  const [phase, setPhase] = useState<"start" | "end">(
    firstPhase ?? (range && value && !endValue ? "end" : "start"),
  );
  const today = localDate();
  const initial =
    value ||
    endValue ||
    min ||
    (trip && trip.startsOn > today ? trip.startsOn : today);
  const [month, setMonth] = useState(initial.slice(0, 7));
  const grid = useRef<HTMLDivElement>(null);
  const motion = useRef<{ slide?: number; pop?: string; band?: boolean }>({});
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5)) - 1;
  // Only the weeks the month takes (no empty sixth row under it).
  const all = monthDays(year, monthIndex);
  const weeks = Math.ceil(
    (all.filter(Boolean).length + all.indexOf(all.find(Boolean) ?? null)) / 7,
  );
  const days = all.slice(0, weeks * 7);
  const allowed = (date: string) =>
    validDate(date) &&
    (!min || date >= min) &&
    (!max || date <= max) &&
    (!allowedDates || allowedDates.includes(date));
  const valid =
    (!required && !draft.startDate && !draft.endDate) ||
    (allowed(draft.startDate) &&
      (!range || (allowed(draft.endDate) && draft.endDate >= draft.startDate)));
  const changeMonth = (step: number) => {
    motion.current.slide = step;
    setMonth(calendarDate(year, monthIndex + step, 1).slice(0, 7));
  };
  const choose = (date: string) => {
    if (!allowed(date)) return;
    const next = range
      ? selectRangeDate(draft, phase, date)
      : { startDate: date, endDate: date };
    motion.current.pop = date;
    motion.current.band = Boolean(range && next.endDate);
    setDraft(next);
    setPhase(range && !next.endDate ? "end" : "start");
  };
  useLayoutEffect(() => {
    const { slide, pop, band } = motion.current;
    motion.current = {};
    const node = grid.current;
    if (!node || reduced() || typeof node.animate !== "function") return;
    if (slide)
      node.animate(
        [
          { transform: `translateX(${slide * 40}%)`, opacity: 0 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 380, easing: SPRING },
      );
    if (pop)
      node
        .querySelector(`[data-date="${pop}"] .dp-n`)
        ?.animate(
          [
            { transform: "scale(.3)" },
            { transform: "scale(1.18)", offset: 0.55 },
            { transform: "scale(.95)", offset: 0.8 },
            { transform: "none" },
          ],
          { duration: 460, easing: "ease-out" },
        );
    if (band)
      node.querySelectorAll(".dp-band").forEach((el, index) =>
        el.animate(
          [
            { transform: "scaleX(.1)" },
            { transform: "scaleX(1.04)", offset: 0.7 },
            { transform: "scaleX(1)" },
          ],
          {
            duration: 520,
            delay: index * 70,
            easing: "cubic-bezier(.3,.9,.4,1)",
            fill: "backwards",
          },
        ),
      );
  });
  const confirm = () =>
    dismissModal(() => {
      onChange(draft.startDate, draft.endDate);
      onClose();
    });
  const count =
    range && draft.startDate && draft.endDate
      ? Math.round(
          (Date.parse(draft.endDate) - Date.parse(draft.startDate)) / 864e5,
        )
      : null;
  const between =
    count === null || !span
      ? ""
      : span === "nights"
        ? `${count}泊`
        : `${count + 1}日間`;
  const end = (which: "start" | "end") => {
    const date = which === "start" ? draft.startDate : draft.endDate;
    return (
      <button
        type="button"
        className="dp-end"
        aria-pressed={range ? phase === which : true}
        data-empty={!date || undefined}
        onClick={() => setPhase(which)}
      >
        <small>{which === "start" ? startLabel : endLabel}</small>
        <b>{date ? shortDate(date) : (none ?? "選んで")}</b>
      </button>
    );
  };
  return (
    <Modal
      title={label}
      addPanel
      onClose={onClose}
      dockActions={{
        primary: (
          <button disabled={!valid} onClick={confirm}>
            <Check size={18} />
            決定
          </button>
        ),
      }}
    >
      <div className="dp">
        <div className="dp-ends">
          {end("start")}
          {range && (
            <>
              <span className="dp-between">{between}</span>
              {end("end")}
            </>
          )}
        </div>
        <div className="dp-month">
          <b aria-live="polite">
            {year}
            <span>年</span>
            {monthIndex + 1}
            <span>月</span>
          </b>
          <button
            type="button"
            className="dp-round"
            aria-label="前の月"
            disabled={month === "0001-01"}
            onClick={() => changeMonth(-1)}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            className="dp-round"
            aria-label="次の月"
            disabled={month === "9999-12"}
            onClick={() => changeMonth(1)}
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="dp-week" aria-hidden="true">
          {WEEK.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="dp-clip">
          <div
            className="dp-grid"
            ref={grid}
            role="group"
            aria-label={`${year}年${monthIndex + 1}月`}
          >
            {range &&
              rangeRows(days, draft).map((row, index) =>
                row && row.last > row.first ? (
                  <span
                    key={index}
                    className="dp-band"
                    style={{
                      top: `calc(${index} * var(--dp-row))`,
                      left: `calc(${((row.first + 0.5) * 100) / 7}% - 20px)`,
                      width: `calc(${((row.last - row.first) * 100) / 7}% + 40px)`,
                    }}
                  />
                ) : null,
              )}
            {days.map((date, index) => {
              if (!date) return <span key={`blank-${index}`} />;
              const picked = date === draft.startDate || date === draft.endDate;
              const inTrip =
                trip && date >= trip.startsOn && date <= trip.endsOn;
              return (
                <button
                  type="button"
                  key={date}
                  className="dp-day"
                  data-date={date}
                  aria-label={shortDate(date)}
                  aria-pressed={picked}
                  aria-current={date === today ? "date" : undefined}
                  data-trip={inTrip || undefined}
                  disabled={!allowed(date)}
                  onClick={() => choose(date)}
                  onKeyDown={(event) => {
                    const offset = (
                      {
                        ArrowLeft: -1,
                        ArrowRight: 1,
                        ArrowUp: -7,
                        ArrowDown: 7,
                      } as Record<string, number>
                    )[event.key];
                    if (!offset) return;
                    event.preventDefault();
                    const next = calendarDate(
                      year,
                      monthIndex,
                      Number(date.slice(8)) + offset,
                    );
                    if (!allowed(next)) return;
                    if (next.slice(0, 7) !== month) setMonth(next.slice(0, 7));
                    requestAnimationFrame(() =>
                      grid.current
                        ?.querySelector<HTMLButtonElement>(
                          `[data-date="${next}"]`,
                        )
                        ?.focus(),
                    );
                  }}
                >
                  <span className="dp-n">{Number(date.slice(8))}</span>
                </button>
              );
            })}
          </div>
        </div>
        {none && (
          <button
            type="button"
            className="dp-none"
            aria-pressed={!draft.startDate}
            onClick={() => setDraft({ startDate: "", endDate: "" })}
          >
            {none}
          </button>
        )}
      </div>
    </Modal>
  );
}
