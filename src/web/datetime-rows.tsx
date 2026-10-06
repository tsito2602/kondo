// The plan form's date and time, Google Calendar style: one switch for
// 「時刻は未定」, then a start row and an end row, each a date on the left and
// a time on the right. Tapping a date or a time opens its calendar or time
// list right under the row; picking closes it. Changing the start keeps the
// plan's length, and the end list shows each choice's length.
import { useEffect, useRef, useState } from "react";
import { localDate } from "@/utils/dates";
import {
  endOptions,
  lengthLabel,
  startOptions,
  untimed,
  withDay,
  withEnd,
  withEndDay,
  withTime,
  type When,
} from "@/data/datetime-rows";
import { weekday } from "./booking-card";

type Open = "day" | "time" | "endDay" | "endTime" | null;

const dateText = (day: string) =>
  day
    ? `${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日${weekday(day)}`
    : "";

export function DateTimeRows({
  value,
  onChange,
  min,
  max,
  startLabel = "開始",
  endLabel = "終了",
}: {
  value: When;
  onChange: (next: When) => void;
  min?: string;
  max?: string;
  startLabel?: string;
  endLabel?: string;
}) {
  const [open, setOpen] = useState<Open>(null);
  const toggle = (which: Exclude<Open, null>) =>
    setOpen((current) => (current === which ? null : which));
  const pick = (next: When) => {
    onChange(next);
    setOpen(null);
  };
  const timed = Boolean(value.time);
  const endDay = value.endDay || value.day;
  const nextDay = timed && endDay > value.day;
  return (
    <div className="dtr" role="group" aria-label={`${startLabel}と${endLabel}`}>
      <div className="dtr-row">
        <span className="dtr-label">時刻は未定</span>
        <button
          type="button"
          role="switch"
          className="dtr-switch"
          aria-checked={!timed}
          aria-label="時刻は未定"
          onClick={() => {
            setOpen(null);
            onChange(timed ? untimed(value) : withTime(value, "10:00"));
          }}
        />
      </div>
      <div className="dtr-row">
        <button
          type="button"
          className="dtr-date"
          aria-expanded={open === "day"}
          aria-label={`${startLabel}日 ${dateText(value.day)}`}
          onClick={() => toggle("day")}
        >
          {dateText(value.day)}
        </button>
        {timed && (
          <button
            type="button"
            className="dtr-time"
            aria-expanded={open === "time"}
            aria-label={`${startLabel}時刻 ${value.time}`}
            onClick={() => toggle("time")}
          >
            {value.time}
          </button>
        )}
      </div>
      {open === "day" && (
        <MonthGrid
          value={value.day}
          min={min}
          max={max}
          onPick={(day) => pick(withDay(value, day))}
        />
      )}
      {open === "time" && (
        <TimeList
          options={startOptions(value.time).map((time) => ({
            key: time,
            time,
          }))}
          selected={value.time}
          onPick={(option) => pick(withTime(value, option.time))}
        />
      )}
      {timed && (
        <>
          <div className="dtr-row">
            <button
              type="button"
              className="dtr-date"
              aria-expanded={open === "endDay"}
              aria-label={`${endLabel}日 ${dateText(endDay)}`}
              onClick={() => toggle("endDay")}
            >
              {dateText(endDay)}
            </button>
            <button
              type="button"
              className="dtr-time"
              aria-expanded={open === "endTime"}
              aria-label={`${endLabel}時刻 ${nextDay ? "翌" : ""}${value.endTime}`}
              onClick={() => toggle("endTime")}
            >
              {value.endTime}
            </button>
          </div>
          {open === "endDay" && (
            <MonthGrid
              value={endDay}
              min={value.day}
              max={max && max > value.day ? shiftMax(max) : undefined}
              onPick={(day) => pick(withEndDay(value, day))}
            />
          )}
          {open === "endTime" && (
            <TimeList
              options={endOptions(value).map((option) => ({
                key: `${option.day} ${option.time}`,
                time: option.time,
                day: option.day,
                note: [
                  option.day > value.day && option.length !== undefined
                    ? "翌"
                    : "",
                  option.length !== undefined
                    ? `（${lengthLabel(option.length)}）`
                    : "",
                ],
              }))}
              selected={`${endDay} ${value.endTime}`}
              onPick={(option) =>
                pick(withEnd(value, option.day!, option.time))
              }
            />
          )}
        </>
      )}
    </div>
  );
}

/** A plan may end the morning after the trip's last day. */
const shiftMax = (max: string) => {
  const date = new Date(`${max}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

type TimeOption = { key: string; time: string; day?: string; note?: string[] };

function TimeList({
  options,
  selected,
  onPick,
}: {
  options: TimeOption[];
  selected: string;
  onPick: (option: TimeOption) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = list.current;
    const chosen = host?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (host && chosen)
      host.scrollTop =
        chosen.offsetTop - host.clientHeight / 2 + chosen.offsetHeight / 2;
  }, []);
  return (
    <div className="dtr-panel dtr-times" role="listbox" ref={list}>
      {options.map((option) => {
        const isSelected = option.key === selected;
        return (
          <button
            type="button"
            role="option"
            key={option.key}
            aria-selected={isSelected}
            onClick={() => onPick(option)}
          >
            {option.note?.[0] && <small>{option.note[0]}</small>}
            <b>{option.time}</b>
            {option.note?.[1] && <span>{option.note[1]}</span>}
          </button>
        );
      })}
    </div>
  );
}

function MonthGrid({
  value,
  min,
  max,
  onPick,
}: {
  value: string;
  min?: string;
  max?: string;
  onPick: (day: string) => void;
}) {
  const today = localDate();
  const [month, setMonth] = useState((value || min || today).slice(0, 7));
  const year = +month.slice(0, 4);
  const index = +month.slice(5) - 1;
  const first = new Date(year, index, 1).getDay();
  const count = new Date(year, index + 1, 0).getDate();
  const shift = (step: number) => {
    const date = new Date(year, index + step, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  };
  const prev = shift(-1);
  const next = shift(1);
  return (
    <div className="dtr-panel prep-cal">
      <div className="prep-cal-head">
        <button
          type="button"
          aria-label="前の月"
          disabled={Boolean(min) && prev < min!.slice(0, 7)}
          onClick={() => setMonth(prev)}
        >
          ‹
        </button>
        <b aria-live="polite">
          {year}年{index + 1}月
        </b>
        <button
          type="button"
          aria-label="次の月"
          disabled={Boolean(max) && next > max!.slice(0, 7)}
          onClick={() => setMonth(next)}
        >
          ›
        </button>
      </div>
      <div className="prep-cal-week" aria-hidden="true">
        {[..."日月火水木金土"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="prep-cal-grid">
        {Array.from({ length: first }, (_, cell) => (
          <span key={`blank-${cell}`} />
        ))}
        {Array.from({ length: count }, (_, offset) => {
          const day = `${month}-${String(offset + 1).padStart(2, "0")}`;
          const usable = (!min || day >= min) && (!max || day <= max);
          return (
            <button
              type="button"
              key={day}
              data-day={day}
              className={day === today ? "is-today" : ""}
              disabled={!usable}
              aria-pressed={value === day}
              aria-label={`${+day.slice(5, 7)}月${offset + 1}日${weekday(day)}`}
              onClick={() => onPick(day)}
            >
              {offset + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
