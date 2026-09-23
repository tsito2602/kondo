import { useId, useRef, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { RangeHighlight } from "./calendar/range-highlight";
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
  onChange: (
    start: string,
    end: string,
    startTime: string,
    endTime: string,
  ) => void;
  showTime?: boolean;
  startTime?: string;
  endTime?: string;
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
          {props.showTime && props.startTime ? ` ${props.startTime}` : ""}
        </span>
        {props.range && (
          <>
            <span aria-hidden="true">—</span>
            <span>
              <small>{props.endLabel ?? "帰着日"}</small>
              {displayDate(props.endValue ?? "")}
              {props.showTime && props.endTime ? ` ${props.endTime}` : ""}
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
  showTime = false,
  startTime = "",
  endTime = "",
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
  const [anchorDate, setAnchorDate] = useState(value);
  const [timePhase, setTimePhase] = useState<"start" | "end">("start");
  const [times, setTimes] = useState({ startTime, endTime });
  const initial = value || endValue || min || localDate();
  const [month, setMonth] = useState(initial.slice(0, 7));
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
  const years = Array.from(
    { length: 201 },
    (_, index) => new Date().getFullYear() - 100 + index,
  );
  if (!years.includes(year)) years.push(year);
  years.sort((a, b) => a - b);
  const validTime = (time: string) =>
    !time || /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  const valid =
    validTime(times.startTime) &&
    validTime(times.endTime) &&
    ((!required && !draft.startDate && !draft.endDate) ||
      (allowed(draft.startDate) &&
        (!range ||
          (allowed(draft.endDate) && draft.endDate >= draft.startDate))));
  const changeMonth = (next: string) => {
    setMonth(next);
    setHover("");
  };
  const choose = (date: string) => {
    if (!allowed(date)) return;
    const next = range
      ? selectRangeDate(draft, phase, date)
      : { startDate: date, endDate: date };
    if (!range || !next.endDate) setAnchorDate(next.startDate);
    setDraft(next);
    setTimePhase(range && next.endDate ? "end" : "start");
    setPhase(next.endDate ? "start" : "end");
    setHover("");
  };
  const preview =
    range && phase === "end" && !draft.endDate && draft.startDate && hover
      ? selectRangeDate(draft, "end", hover)
      : draft;
  const confirm = () =>
    dismissModal(() => {
      onChange(draft.startDate, draft.endDate, times.startTime, times.endTime);
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
            aria-pressed={(showTime ? timePhase : phase) === "start"}
            onClick={() => {
              setPhase("start");
              setTimePhase("start");
            }}
          >
            <small>{range || showTime ? startLabel : "日付"}</small>
            <strong>
              {displayDate(draft.startDate)}
              {showTime && times.startTime ? ` ${times.startTime}` : ""}
            </strong>
          </button>
          {range && (
            <button
              type="button"
              aria-pressed={(showTime ? timePhase : phase) === "end"}
              onClick={() => {
                setPhase("end");
                setTimePhase("end");
              }}
            >
              <small>{endLabel}</small>
              <strong>
                {displayDate(draft.endDate)}
                {showTime && times.endTime ? ` ${times.endTime}` : ""}
              </strong>
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
          <select
            aria-label="年を選択"
            value={year}
            onChange={(event) =>
              changeMonth(
                `${event.target.value.padStart(4, "0")}-${month.slice(5)}`,
              )
            }
          >
            {years.map((option) => (
              <option key={option} value={option}>
                {option}年
              </option>
            ))}
          </select>
          <select
            aria-label="月を選択"
            value={monthIndex + 1}
            onChange={(event) =>
              changeMonth(
                `${month.slice(0, 4)}-${event.target.value.padStart(2, "0")}`,
              )
            }
          >
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index} value={index + 1}>
                {index + 1}月
              </option>
            ))}
          </select>
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
          <RangeHighlight
            days={days}
            range={
              range ? preview : { startDate: draft.startDate, endDate: "" }
            }
            markers={draft}
            anchorDate={anchorDate}
            previewDate={hover}
          />
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
                onPointerEnter={(event) => {
                  if (event.pointerType === "mouse") setHover(date);
                }}
                onPointerLeave={() => setHover("")}
                data-preview={date === hover}
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
            ? phase === "end" && draft.startDate
              ? `${endLabel}を選択。同じ日も選べます。`
              : draft.endDate
                ? "この期間でよければ「決定」を押してください。"
                : `${startLabel}を選択してください。`
            : "日付を選択してください。"}
        </p>
        {showTime && (
          <div className="calendar-time">
            <label>
              <span>
                {range
                  ? `${timePhase === "start" ? startLabel : endLabel}の時刻`
                  : "時刻"}
              </span>
              <input
                type="time"
                step={60}
                value={timePhase === "start" ? times.startTime : times.endTime}
                onChange={(event) =>
                  setTimes((current) => ({
                    ...current,
                    [timePhase === "start" ? "startTime" : "endTime"]:
                      event.target.value,
                  }))
                }
              />
            </label>
            {(timePhase === "start" ? times.startTime : times.endTime) && (
              <button
                type="button"
                aria-label="時刻をクリア"
                onClick={() =>
                  setTimes((current) => ({
                    ...current,
                    [timePhase === "start" ? "startTime" : "endTime"]: "",
                  }))
                }
              >
                ×
              </button>
            )}
          </div>
        )}
        <div className="calendar-actions">
          <button
            type="button"
            className="subtle"
            onClick={() => {
              setDraft({ startDate: "", endDate: "" });
              setPhase("start");
              setTimePhase("start");
              setTimes({ startTime: "", endTime: "" });
              setHover("");
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
