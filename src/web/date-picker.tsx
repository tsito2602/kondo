import { useId, useRef, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Modal } from "./ui";
import { dismissModal } from "./motion";
import { localDate, validDate } from "@/utils/dates";
import {
  calendarDate,
  displayDate,
  monthDays,
  selectRangeDate,
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
};

/** The same month calendar and start/end selection rules as the production app. */
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
        <span>
          <small>{props.range ? (props.startLabel ?? "出発日") : ""}</small>
          {displayDate(props.value)}
        </span>
        {props.range && (
          <>
            <span aria-hidden="true">—</span>
            <span>
              <small>{props.endLabel ?? "帰着日"}</small>
              {displayDate(props.endValue ?? "")}
            </span>
          </>
        )}
      </button>
      {open && <CalendarPanel {...props} onClose={() => setOpen(false)} />}
    </div>
  );
}

export function CalendarPanel({
  label,
  value,
  endValue = "",
  range = false,
  required = false,
  min,
  max,
  startLabel = "出発日",
  endLabel = "帰着日",
  allowedDates,
  onChange,
  onClose,
}: PickerProps & { onClose: () => void }) {
  const [draft, setDraft] = useState<DateRange>({
    startDate: value,
    endDate: range ? endValue : value,
  });
  const [phase, setPhase] = useState<"start" | "end">(
    range && value && !endValue ? "end" : "start",
  );
  const initial = value || min || localDate();
  const [month, setMonth] = useState(initial.slice(0, 7));
  const [yearText, setYearText] = useState(initial.slice(0, 4));
  const [hover, setHover] = useState("");
  const grid = useRef<HTMLDivElement>(null);
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5)) - 1;
  const days = monthDays(year, monthIndex);
  const allowed = (date: string) =>
    validDate(date) &&
    (!min || date >= min) &&
    (!max || date <= max) &&
    (!allowedDates || allowedDates.includes(date));
  const valid =
    (!required && !draft.startDate && !draft.endDate) ||
    (allowed(draft.startDate) &&
      (!range || (allowed(draft.endDate) && draft.endDate >= draft.startDate)));
  const changeMonth = (next: string) => {
    setMonth(next);
    setYearText(next.slice(0, 4));
    setHover("");
  };
  const applyYear = () => {
    if (
      /^\d{4}$/.test(yearText) &&
      Number(yearText) >= 1 &&
      Number(yearText) <= 9999
    )
      changeMonth(`${yearText}-${month.slice(5)}`);
    else setYearText(month.slice(0, 4));
  };
  const choose = (date: string) => {
    if (!allowed(date)) return;
    const next = range
      ? selectRangeDate(draft, phase, date)
      : { startDate: date, endDate: date };
    setDraft(next);
    setPhase(next.endDate ? "start" : "end");
    setHover("");
  };
  const preview =
    range && phase === "end" && hover
      ? selectRangeDate(draft, "end", hover)
      : draft;
  const confirm = () =>
    dismissModal(() => {
      onChange(draft.startDate, draft.endDate);
      onClose();
    });
  return (
    <Modal
      title={label}
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
      <div className="calendar-panel">
        <div className="calendar-summary">
          <button
            type="button"
            aria-pressed={phase === "start"}
            onClick={() => setPhase("start")}
          >
            <small>{range ? startLabel : "日付"}</small>
            <strong>{displayDate(draft.startDate)}</strong>
          </button>
          {range && (
            <button
              type="button"
              aria-pressed={phase === "end"}
              onClick={() => setPhase("end")}
            >
              <small>{endLabel}</small>
              <strong>{displayDate(draft.endDate)}</strong>
            </button>
          )}
        </div>
        <div className="calendar-month">
          <button
            type="button"
            className="icon-button"
            aria-label="前の月"
            disabled={month === "0001-01"}
            onClick={() =>
              changeMonth(calendarDate(year, monthIndex - 1, 1).slice(0, 7))
            }
          >
            <ChevronLeft />
          </button>
          <label>
            <input
              aria-label="年を入力"
              inputMode="numeric"
              maxLength={4}
              value={yearText}
              onChange={(event) => setYearText(event.target.value)}
              onBlur={applyYear}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyYear();
                }
              }}
            />
            年
          </label>
          <strong>{monthIndex + 1}月</strong>
          <button
            type="button"
            className="icon-button"
            aria-label="次の月"
            disabled={month === "9999-12"}
            onClick={() =>
              changeMonth(calendarDate(year, monthIndex + 1, 1).slice(0, 7))
            }
          >
            <ChevronRight />
          </button>
        </div>
        <div
          className="calendar-grid"
          ref={grid}
          aria-label={`${year}年${monthIndex + 1}月`}
        >
          {["日", "月", "火", "水", "木", "金", "土"].map((day) => (
            <span className="calendar-weekday" key={day}>
              {day}
            </span>
          ))}
          {days.map((date, index) =>
            date ? (
              <button
                type="button"
                key={date}
                data-date={date}
                aria-label={displayDate(date)}
                aria-pressed={
                  date === draft.startDate || date === draft.endDate
                }
                aria-current={date === localDate() ? "date" : undefined}
                disabled={!allowed(date)}
                data-in-range={Boolean(
                  preview.startDate &&
                  preview.endDate &&
                  date >= preview.startDate &&
                  date <= preview.endDate,
                )}
                onMouseEnter={() => setHover(date)}
                onMouseLeave={() => setHover("")}
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
                  if (next.slice(0, 7) !== month) changeMonth(next.slice(0, 7));
                  requestAnimationFrame(() =>
                    grid.current
                      ?.querySelector<HTMLButtonElement>(
                        `[data-date="${next}"]`,
                      )
                      ?.focus(),
                  );
                }}
              >
                <span>{Number(date.slice(8))}</span>
              </button>
            ) : (
              <span key={`blank-${index}`} />
            ),
          )}
        </div>
        <p className="muted small" aria-live="polite">
          {range
            ? phase === "end"
              ? `${endLabel}を選択してください。同じ日も選べます。`
              : `${startLabel}を選択してください。`
            : "日付を選び「決定」を押してください。"}
        </p>
        <div className="calendar-actions">
          <button
            type="button"
            className="subtle"
            onClick={() => {
              setDraft({ startDate: "", endDate: "" });
              setPhase("start");
            }}
          >
            クリア
          </button>
          <button
            type="button"
            className="primary calendar-confirm"
            disabled={!valid}
            onClick={confirm}
          >
            決定
          </button>
        </div>
      </div>
    </Modal>
  );
}
