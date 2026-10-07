import {
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTravel } from "@/data/travel-provider";
import { localDate } from "@/utils/dates";
import { distanceMeters, type LatLng, walkMinutes } from "@/data/geo";
import { itemDetails } from "@/data/itinerary";
import {
  dayTimeline,
  entryCoords,
  type Entry,
  timelineEntries,
} from "@/data/plan-timeline";
import {
  type Block,
  clockOf,
  type Bounds,
  daysBounds,
  freeStart,
  keySpan,
  lengthLabel,
  minutesOf,
  moveSpan,
  resizeEnd,
  resizeStart,
  type Span,
  typedEnd,
  walkFlags,
} from "@/data/time-picker";
import type { ItineraryItem } from "@/data/types";
import { CheckIcon } from "./booking-icons";
import { RM, spring } from "./cartoon";
import { haptic } from "./haptics";
import { dismissModal } from "./motion";
import { TimeField } from "./time-field";
import { Modal } from "./ui";

/** px per minute, as in the mock. */
const PXM = 1.15;
const PAD = 10;
const DAY = 1440;
/** Minutes from the timeline's first midnight. */
const y = (minutes: number) => minutes * PXM + PAD;
const POINT = 30;
const EDGE = 56;

const addDays = (day: string, days: number) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
const dayCount = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) /
      86400000,
  );
const dayLabel = (day: string) =>
  `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}（${new Intl.DateTimeFormat("ja-JP", { weekday: "short" }).format(new Date(`${day}T12:00:00`))}）`;
const md = (day: string) =>
  `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
const weekdayOf = (day: string) =>
  new Intl.DateTimeFormat("ja-JP", { weekday: "short" }).format(
    new Date(`${day}T12:00:00`),
  );
const hourLabel = (hour: number) => `${String(hour % 24).padStart(2, "0")}:00`;
/** The end's day beside its time: 翌 for the next day, else the date. */
export const endDayMark = (day: string, offset: number) =>
  offset <= 0
    ? ""
    : offset === 1
      ? "翌"
      : `${Number(addDays(day, offset).slice(5, 7))}/${Number(addDays(day, offset).slice(8, 10))}`;

/** The trip's days, first to last (with `day` added when it lies outside). */
export function tripDays(
  trip: { startsOn?: string; endsOn?: string } | null | undefined,
  day?: string,
) {
  const days: string[] = [];
  if (trip?.startsOn && trip.endsOn && trip.startsOn <= trip.endsOn)
    for (let at = trip.startsOn; at <= trip.endsOn; at = addDays(at, 1))
      days.push(at);
  if (day && !days.includes(day)) (days.push(day), days.sort());
  return days;
}

export type PickedTime = {
  /** The day the plan starts on (where the block was left). */
  day: string;
  /** "" = 未定 (no time). */
  time: string;
  endTime: string;
  /** Days from the start's day to the end's (1 = 翌). */
  endDayOffset: number;
};

/** An entry's end in minutes from its own day's midnight, when it has one. */
function entryEnd(entry: Entry, day: string) {
  if (entry.item) {
    const details = itemDetails(entry.item);
    const end = minutesOf(details.endTime);
    if (end === null) return null;
    const offset = details.endDay ? dayCount(entry.day, details.endDay) : 0;
    return end + offset * DAY;
  }
  const booking = entry.booking;
  if (
    booking &&
    entry.endpoint === "start" &&
    !["flight", "train", "hotel", "car"].includes(booking.kind) &&
    (booking.endDay || booking.day) === day
  )
    return minutesOf(booking.endTime);
  return null;
}

/**
 * Every other plan on the timeline's days as faint blocks (minutes from the
 * first day's midnight), with the walk from/to this plan.
 */
function useTrackBlocks(
  days: readonly string[],
  exclude: readonly string[],
  self: LatLng | null,
) {
  const travel = useTravel();
  return useMemo(() => {
    const entries = timelineEntries(travel.items, travel.bookings);
    return days.flatMap((day, index) =>
      dayTimeline(entries, day).flatMap((entry): Block[] => {
        const start = minutesOf(entry.time);
        if (start === null || exclude.includes(entry.key)) return [];
        const end = entryEnd(entry, day);
        const coords = self && entryCoords(entry, travel.places);
        return [
          {
            key: entry.key,
            title: entry.stage ? `${entry.title} ${entry.stage}` : entry.title,
            start: start + index * DAY,
            end: end !== null && end > start ? end + index * DAY : null,
            walk: coords ? walkMinutes(distanceMeters(self, coords)) : null,
          },
        ];
      }),
    );
  }, [travel.items, travel.bookings, travel.places, days, exclude, self]);
}

/**
 * Option C of kondo-time-pickers.html: the plan is an ink block on the trip's
 * timeline among its other plans. With `days`, the timeline runs through all
 * of them like a calendar's day columns laid end to end: dragging the block
 * picks the day and the time together, and the end can run into the next day.
 * Without, it is the one `day` (a hotel's check-in/out). Drag it to move start and end
 * together, or its top/bottom grip to change one end (5-minute steps, at least
 * 15 minutes). The walk to the neighbours turns red when it makes someone late.
 * The big 開始 → 終了 readout can also be typed into.
 */
export function TimelinePicker({
  title,
  day,
  days,
  time,
  endTime,
  endDayOffset = 0,
  point = false,
  pointLabel,
  exclude = [],
  self,
  allowClear = false,
  clearLabel = "時刻なし（未定）にする",
  onSave,
  onClose,
}: {
  title: string;
  day: string;
  /** The days the block may be dragged through (the trip's). */
  days?: readonly string[];
  time: string;
  endTime: string;
  endDayOffset?: number;
  /** One time only (a hotel's check-in/out plan, or an end that is days later). */
  point?: boolean;
  pointLabel?: string;
  /** Timeline keys that are this plan itself. */
  exclude?: readonly string[];
  /** Where this plan is, for the walks. */
  self?: LatLng | null;
  /** Offer 「時刻なし」 (未定). */
  allowClear?: boolean;
  clearLabel?: string;
  onSave: (value: PickedTime) => void;
  onClose: () => void;
}) {
  const excludeKey = exclude.join("|");
  const excluded = useMemo(() => excludeKey.split("|"), [excludeKey]);
  const daysKey = (days ?? []).join("|");
  const trackDays = useMemo(() => {
    const list = daysKey ? daysKey.split("|") : [];
    if (!list.includes(day)) (list.push(day), list.sort());
    return list;
  }, [daysKey, day]);
  const bounds: Bounds = daysBounds(trackDays.length);
  const first = trackDays[0];
  const dayAt = (minutes: number) =>
    addDays(first, Math.floor(Math.max(0, minutes) / DAY));
  const blocks = useTrackBlocks(trackDays, excluded, self ?? null);
  // The day at the top of the view, pinned in the stage's corner.
  const [viewDay, setViewDay] = useState(day);
  const multiDay = trackDays.length > 1;
  const [span, setSpan] = useState<Span>(() => {
    const base = trackDays.indexOf(day) * DAY;
    const own = blocks
      .filter((block) => block.start >= base && block.start < base + DAY)
      .map((block) => ({
        ...block,
        start: block.start - base,
        end: block.end === null ? null : block.end - base,
      }));
    const start = base + (minutesOf(time) ?? freeStart(own));
    const end = minutesOf(endTime);
    const at = end === null ? null : base + end + endDayOffset * DAY;
    return {
      start,
      end:
        !point && at !== null && at > start && at <= bounds.end
          ? at
          : start + 60,
    };
  });
  const shown: Span = point
    ? { start: span.start, end: span.start + POINT }
    : span;
  const startIndex = Math.floor(span.start / DAY);
  const startDay = dayAt(span.start);
  const endOffset = point ? 0 : Math.floor(span.end / DAY) - startIndex;
  const endMark = endDayMark(startDay, endOffset);
  // The walks are to the plans around it on its own day(s) only.
  const near = blocks.filter((block) => {
    const at = Math.floor(block.start / DAY);
    return at >= startIndex && at <= startIndex + Math.max(0, endOffset);
  });
  const flags = walkFlags(shown, near);

  const stage = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const me = useRef<HTMLDivElement>(null);
  const startOut = useRef<HTMLInputElement>(null);
  const endOut = useRef<HTMLInputElement>(null);
  const spanRef = useRef(span);
  spanRef.current = span;

  // Open on the plan, a third of the way down.
  useLayoutEffect(() => {
    const box = stage.current;
    if (box) {
      box.scrollTop = Math.max(0, y(span.start) - box.clientHeight * 0.3);
      setViewDay(dayAt((box.scrollTop + 24 - PAD) / PXM));
    }
  }, []);

  // The readout pops when a number changes.
  const popped = useRef({ start: span.start, end: span.end });
  useEffect(() => {
    const pop = (el: Element | null) =>
      el &&
      void spring(
        el,
        [{ transform: "scale(1.18,.86)" }, { transform: "none" }],
        "boing",
      );
    if (popped.current.start !== span.start) pop(startOut.current);
    if (popped.current.end !== span.end) pop(endOut.current);
    popped.current = { start: span.start, end: span.end };
  }, [span.start, span.end]);

  // Typed or keyed: the block springs from where it was to the new time.
  const jumpFrom = useRef<number | null>(null);
  const jump = (next: Span) => {
    if (next.start === span.start && next.end === span.end) return;
    jumpFrom.current = y(span.start);
    setSpan(next);
  };
  useLayoutEffect(() => {
    const from = jumpFrom.current;
    jumpFrom.current = null;
    const block = me.current;
    const box = stage.current;
    if (from === null || !block || !box) return;
    const to = y(span.start);
    void spring(
      block,
      [{ transform: `translateY(${from - to}px)` }, { transform: "none" }],
      "boing",
    );
    const height = block.offsetHeight;
    if (
      to < box.scrollTop + 8 ||
      to + height > box.scrollTop + box.clientHeight - 8
    ) {
      const top = Math.max(0, to - box.clientHeight * 0.3);
      if (box.scrollTo)
        box.scrollTo({ top, behavior: RM() ? "auto" : "smooth" });
      else box.scrollTop = top;
    }
  }, [span.start, span.end]);

  // ---- dragging (pointer/touch), with autoscroll near the stage's edges ----
  const drag = useRef<{
    mode: "move" | "start" | "end";
    grab: number;
    from: Span;
    y: number;
    frame: number;
  } | null>(null);
  const minuteAt = (clientY: number) =>
    (clientY - track.current!.getBoundingClientRect().top - PAD) / PXM;
  const follow = () => {
    const state = drag.current;
    if (!state) return;
    const at = minuteAt(state.y);
    const now = spanRef.current;
    const next =
      state.mode === "move"
        ? moveSpan(now, at - state.grab, undefined, bounds)
        : state.mode === "start"
          ? resizeStart(now, at, bounds)
          : resizeEnd(now, at, bounds);
    if (next.start !== now.start || next.end !== now.end) {
      spanRef.current = next;
      setSpan(next);
      haptic();
    }
  };
  const autoscroll = () => {
    const state = drag.current;
    const box = stage.current;
    if (!state || !box) return;
    const rect = box.getBoundingClientRect();
    const over =
      state.y < rect.top + EDGE
        ? state.y - (rect.top + EDGE)
        : state.y > rect.bottom - EDGE
          ? state.y - (rect.bottom - EDGE)
          : 0;
    if (over) {
      const before = box.scrollTop;
      box.scrollTop += Math.max(-14, Math.min(14, over / 3));
      if (box.scrollTop !== before) follow();
    }
    state.frame = requestAnimationFrame(autoscroll);
  };
  const press = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !track.current) return;
    const handle = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-h]",
    )?.dataset.h;
    const mode = point
      ? "move"
      : handle === "s"
        ? "start"
        : handle === "e"
          ? "end"
          : "move";
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = {
      mode,
      grab: minuteAt(event.clientY) - span.start,
      from: span,
      y: event.clientY,
      frame: 0,
    };
    drag.current.frame = requestAnimationFrame(autoscroll);
    me.current?.classList.add("is-held");
    // Press = squish.
    void spring(
      event.currentTarget,
      [{ transform: "scale(1.04,.94)" }, { transform: "none" }],
      "squish",
    );
  };
  const release = () => {
    const state = drag.current;
    if (!state) return;
    cancelAnimationFrame(state.frame);
    drag.current = null;
    me.current?.classList.remove("is-held");
    // Release = bounce.
    if (me.current)
      void spring(
        me.current,
        [{ transform: "scale(.96,1.06)" }, { transform: "none" }],
        "boing",
      );
  };
  useEffect(() => () => release(), []);

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = keySpan(
      span,
      event.key,
      { shift: event.shiftKey, alt: event.altKey && !point },
      bounds,
    );
    if (!next) return;
    event.preventDefault();
    jump(point ? { start: next.start, end: next.start + 60 } : next);
  };

  const save = (event: { currentTarget: Element }) => {
    const dialog = event.currentTarget.closest("dialog");
    onSave(
      point
        ? {
            day: startDay,
            time: clockOf(span.start),
            endTime: "",
            endDayOffset: 0,
          }
        : {
            day: startDay,
            time: clockOf(span.start),
            endTime: clockOf(span.end),
            endDayOffset: endOffset,
          },
    );
    dismissModal(onClose, dialog);
  };
  const clear = (event: { currentTarget: Element }) => {
    const dialog = event.currentTarget.closest("dialog");
    onSave({ day: startDay, time: "", endTime: "", endDayOffset: 0 });
    dismissModal(onClose, dialog);
  };

  const length = span.end - span.start;
  const hours = [];
  for (let hour = 0; hour <= bounds.end / 60; hour++) hours.push(hour);
  const range = `${clockOf(shown.start)}–${endMark}${clockOf(shown.end)}`;
  // A typed time stays on the block's day; the length is kept.
  const base = startIndex * DAY;
  return (
    <Modal
      title={`${title}の時刻`}
      addPanel
      onClose={onClose}
      dockActions={{
        primary: (
          <button type="button" className="tlp-save" onClick={save}>
            <CheckIcon size={20} />
            保存する
          </button>
        ),
      }}
    >
      <div className="tlp">
        <div className="tlp-h">
          <b>{title}</b>
          <span aria-live="polite">{dayLabel(startDay)}</span>
        </div>
        <div className="tlp-readout">
          <label>
            <small>{point ? (pointLabel ?? "時刻") : "開始"}</small>
            <TimeField
              ref={startOut}
              live={false}
              allowEmpty={false}
              aria-label={point ? (pointLabel ?? "時刻") : "開始"}
              value={clockOf(span.start)}
              onChange={(value) => {
                const at = base + minutesOf(value)!;
                jump(
                  point
                    ? { start: at, end: at + 60 }
                    : {
                        start: at,
                        end: Math.min(bounds.end, at + length),
                      },
                );
              }}
            />
          </label>
          {!point && (
            <>
              <em aria-hidden="true">→</em>
              <label>
                <small>終了</small>
                <span className="tlp-end">
                  {endMark && <i>{endMark}</i>}
                  <TimeField
                    ref={endOut}
                    live={false}
                    allowEmpty={false}
                    aria-label="終了"
                    value={clockOf(span.end)}
                    onChange={(value) => {
                      const next = typedEnd(
                        { start: span.start - base, end: span.end - base },
                        minutesOf(value)!,
                      );
                      if (!next) return false;
                      jump({ start: next.start + base, end: next.end + base });
                    }}
                  />
                </span>
              </label>
            </>
          )}
        </div>
        <p className="tlp-dur" aria-live="polite">
          {point ? "数字を押すと入力できます" : lengthLabel(length)}
        </p>
        <div
          className="tlp-stage"
          ref={stage}
          onScroll={
            multiDay
              ? (event) =>
                  setViewDay(
                    dayAt((event.currentTarget.scrollTop + 24 - PAD) / PXM),
                  )
              : undefined
          }
        >
          {multiDay && (
            <div className="tlp-viewday" aria-hidden="true">
              <span>{dayLabel(viewDay)}</span>
            </div>
          )}
          <div
            className="tlp-track"
            ref={track}
            style={{ height: y(bounds.end) + PAD }}
          >
            {hours.map((hour) => {
              // Each midnight is the next day's title, as in a calendar.
              const midnight = hour % 24 === 0;
              return (
                <div key={hour}>
                  <div
                    className={`tlp-hr${midnight ? " is-day" : ""}`}
                    style={{ top: y(hour * 60) }}
                  />
                  <span
                    className={`tlp-hl${midnight ? " is-day" : ""}`}
                    style={{ top: y(hour * 60) }}
                  >
                    {midnight ? (
                      <>
                        {md(addDays(first, hour / 24))}
                        <small>{weekdayOf(addDays(first, hour / 24))}</small>
                      </>
                    ) : (
                      hourLabel(hour)
                    )}
                  </span>
                </div>
              );
            })}
            {blocks.map((block) => (
              <div
                key={block.key}
                className={`tlp-ev${block.end === null ? " is-point" : ""}`}
                style={{
                  top: y(block.start),
                  height:
                    block.end === null
                      ? 24
                      : Math.max(24, (block.end - block.start) * PXM - 3),
                }}
              >
                {clockOf(block.start)} {block.title}
              </div>
            ))}
            {flags.before && (
              <div
                className={`tlp-walk${flags.before.late ? " is-bad" : ""}`}
                style={{
                  // Under a point block (no end), not across it.
                  top:
                    y(flags.before.at) +
                    (blocks.some(
                      (block) =>
                        block.end === null && block.start === flags.before!.at,
                    )
                      ? 26
                      : 2),
                }}
              >
                徒歩{flags.before.minutes}分
                {flags.before.late ? " · 間に合わない" : ""}
              </div>
            )}
            {flags.after && (
              <div
                className={`tlp-walk${flags.after.late ? " is-bad" : ""}`}
                style={{ top: y(flags.after.at) + 2 }}
              >
                徒歩{flags.after.minutes}分
                {flags.after.late ? ` · ${flags.after.late}分遅れる` : ""}
              </div>
            )}
            <div
              ref={me}
              className={`tlp-ev tlp-me${point ? " is-point" : ""}`}
              style={{
                top: y(shown.start),
                height: Math.max(26, (shown.end - shown.start) * PXM - 3),
              }}
              role="slider"
              tabIndex={0}
              aria-label={`${title}の時刻。上下の矢印で5分ずつ、Shiftで15分。${point ? "" : "Optionと矢印で終了を変えます。"}`}
              aria-valuemin={0}
              aria-valuemax={bounds.end}
              aria-valuenow={span.start}
              aria-valuetext={point ? clockOf(span.start) : range}
              onPointerDown={press}
              onPointerMove={(event) => {
                if (!drag.current) return;
                drag.current.y = event.clientY;
                follow();
              }}
              onPointerUp={release}
              onPointerCancel={release}
              onLostPointerCapture={release}
              onKeyDown={onKey}
            >
              {!point && (
                <>
                  <span className="tlp-hit is-t" data-h="s" />
                  <span className="tlp-grip is-t" aria-hidden="true" />
                </>
              )}
              <b>{title}</b>
              <span>{point ? clockOf(span.start) : range}</span>
              {!point && (
                <>
                  <span className="tlp-grip is-b" aria-hidden="true" />
                  <span className="tlp-hit is-b" data-h="e" />
                </>
              )}
            </div>
          </div>
        </div>
        {allowClear && (
          <button type="button" className="tlp-clear" onClick={clear}>
            {clearLabel}
          </button>
        )}
      </div>
    </Modal>
  );
}

/** A plan's own times as tappable text; opens the picker. */
export function TimeTap({
  label,
  onOpen,
  children,
}: {
  label: string;
  onOpen: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="time-tap"
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
    >
      {children}
    </button>
  );
}

export const TIME_TAP_HINT = "時刻をタップすると直せます";

/** The form's 時刻 button: 「08:30 – 09:30」 or 「未定」, opening the picker. */
export function TimeRangeButton({
  day,
  time,
  endTime,
  nextDay = false,
  endDayOffset,
  className = "",
  onOpen,
  label = "時刻",
}: {
  /** Shown before the times when the picker also picks the day. */
  day?: string;
  time: string;
  endTime?: string;
  nextDay?: boolean;
  endDayOffset?: number;
  className?: string;
  onOpen: () => void;
  label?: string;
}) {
  const mark =
    endDayOffset !== undefined
      ? endDayMark(day ?? "", endDayOffset)
      : nextDay
        ? "翌"
        : "";
  const when = time
    ? `${time}${endTime ? `から${mark}${endTime}` : ""}`
    : "未定";
  return (
    <button
      type="button"
      className={`tlp-trigger ${className}`}
      aria-label={`${label}：${day ? `${dayLabel(day)} ` : ""}${when}`}
      data-time-trigger=""
      onClick={onOpen}
    >
      {day && <span className="tlp-trigger-day">{dayLabel(day)}</span>}
      {time ? (
        <>
          <b>{time}</b>
          {endTime && (
            <>
              <em>–</em>
              <b>
                {mark && <small>{mark}</small>}
                {endTime}
              </b>
            </>
          )}
        </>
      ) : (
        <span className="tlp-trigger-empty">未定</span>
      )}
    </button>
  );
}

/** Saves a plan's own times straight away (予定の詳細, 場所の詳細). */
export function PlanTimePicker({
  item,
  onClose,
}: {
  item: ItineraryItem;
  onClose: () => void;
}) {
  const travel = useTravel();
  const details = itemDetails(item);
  const span = details.endDay ? dayCount(item.day, details.endDay) : 0;
  const stay = details.stay;
  const booking =
    stay && travel.bookings.find((entry) => entry.id === stay.bookingId);
  const self = useMemo(() => {
    const entry: Entry = booking
      ? {
          key: `booking-${booking.id}-${stay!.endpoint}`,
          day: item.day,
          time: item.time,
          title: booking.title,
          booking,
          endpoint: stay!.endpoint,
        }
      : {
          key: `item-${item.id}`,
          day: item.day,
          time: item.time,
          title: item.title,
          item,
        };
    return entryCoords(entry, travel.places);
  }, [item, booking, stay, travel.places]);
  // A stay's check-in/out is one time on its booking's day; any other plan
  // moves through the trip's days, its end with it.
  const point = Boolean(stay);
  const days = useMemo(
    () => (point ? undefined : tripDays(travel.selectedTrip, item.day)),
    [point, travel.selectedTrip, item.day],
  );
  return (
    <TimelinePicker
      title={booking ? booking.title : item.title}
      pointLabel={
        stay
          ? stay.endpoint === "start"
            ? "チェックイン"
            : "チェックアウト"
          : "開始"
      }
      day={item.day}
      days={days}
      time={item.time}
      endTime={details.endTime}
      endDayOffset={span}
      point={point}
      self={self}
      exclude={[
        `item-${item.id}`,
        ...(booking ? [`booking-${booking.id}-${stay!.endpoint}`] : []),
      ]}
      onSave={(picked) => {
        const endTime = point ? details.endTime : picked.endTime;
        const day = point ? item.day : picked.day;
        travel.updateItem(item.id, {
          day,
          time: picked.time,
          kind: item.kind,
          title: item.title,
          note: item.note,
          details: {
            ...details,
            endTime,
            endDay: point
              ? details.endDay
              : endTime
                ? addDays(day, picked.endDayOffset)
                : "",
          },
        });
      }}
      onClose={onClose}
    />
  );
}

export { addDays as shiftDay };

/**
 * 時刻の粒: a time chip that opens that day's timeline (the plans around it,
 * the readout typeable), next to the 日付の粒 that picks the day.
 */
export function TimeChip({
  label,
  title,
  day,
  time,
  bare = false,
  onChange,
}: {
  /** 出発, 到着, チェックイン… (the readout's name and the chip's). */
  label: string;
  /** The time only, when the row's own label already names the end. */
  bare?: boolean;
  /** The booking's name over the timeline. */
  title: string;
  day: string;
  time: string;
  onChange: (time: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="time-chip"
        aria-label={`${label}の時刻：${time || "未定"}`}
        data-time-trigger=""
        data-empty={!time || undefined}
        onClick={() => setOpen(true)}
      >
        {!bare && <small>{label}</small>}
        <b>{time || "未定"}</b>
      </button>
      {open && (
        <TimelinePicker
          title={title || label}
          day={day || localDate()}
          time={time}
          endTime=""
          point
          pointLabel={label}
          allowClear
          clearLabel="時刻なし（未定）にする"
          onSave={(picked) => onChange(picked.time)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
