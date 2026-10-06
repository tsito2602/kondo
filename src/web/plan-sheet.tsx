import { BookingDetail } from "./booking-detail";
import { type FormEvent, useId, useMemo, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { useNavigate } from "react-router";
import { useTravel } from "@/data/travel-provider";
import {
  coordsFromLink,
  distanceLabel,
  type LatLng,
  WALK_LIMIT_METERS,
} from "@/data/geo";
import {
  durationLabel,
  durationMinutes,
  emptyItineraryDetails,
  itemCategory,
  itemDetails,
  itineraryCategories,
  itineraryDetailsError,
  transportLabel,
  transportModes,
} from "@/data/itinerary";
import {
  dayTimeline,
  entryCoords,
  fromMinutes,
  nightsOf,
  planPlace,
  timelineEntries,
  toMinutes,
  walkBetween,
  type Entry,
} from "@/data/plan-timeline";
import {
  findFlightConnections,
  formatConnectionDuration,
} from "@/data/flight-connections";
import { mapUrl } from "@/data/places";
import type {
  Booking,
  ItineraryCategory,
  ItineraryDetails,
  ItineraryItem,
  TransportMode,
} from "@/data/types";
import { dismissModal } from "./motion";
import { LinkedNotes } from "./linked-notes";
import { ContextDock, ThumbDock } from "./thumb-dock";
import {
  DetailDockActions,
  DockFunction,
  ErrorText,
  FormBackButton,
  Modal,
  useAction,
} from "./ui";
import { categoryGlyph, Glyph, MapPin } from "./itinerary-icons";
import {
  bookingLabel,
  bookingPlaceName,
  JourneyLine,
  placeLabel,
} from "./itinerary-rows";
import { previewPlace, savePlanPlace } from "./plan-place";
import {
  PlanTimePicker,
  TIME_TAP_HINT,
  TimelinePicker,
  TimeRangeButton,
  TimeTap,
} from "./timeline-picker";

const weekday = (day: string) =>
  new Intl.DateTimeFormat("ja-JP", { weekday: "short" }).format(
    new Date(`${day}T12:00:00`),
  );
const md = (day: string) =>
  `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
/** 「10/20（火） · 2日目」 */
export const tripDayLabel = (day: string, days: string[]) =>
  `${md(day)}（${weekday(day)}）${days.includes(day) ? ` · ${days.indexOf(day) + 1}日目` : ""}`;

// ===== the plan's place on a small map: its pin among the day's dimmed pins =====
function MiniMap({
  focus,
  number,
  stay = false,
  others,
}: {
  focus: LatLng;
  number?: number;
  stay?: boolean;
  others: { coords: LatLng; number?: number }[];
}) {
  const points = [focus, ...others.map((other) => other.coords)];
  const scale = Math.cos((focus.lat * Math.PI) / 180);
  const xs = points.map((point) => point.lng * scale);
  const ys = points.map((point) => -point.lat);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  // Keep the map's aspect (about 3:1 at phone width) and leave room for the pins.
  const span = Math.max(maxX - minX, (maxY - minY) * 3, 0.004);
  const place = (point: LatLng) => {
    const x = point.lng * scale;
    const y = -point.lat;
    return {
      left: `${10 + (80 * (x - (minX + maxX) / 2 + span / 2)) / span}%`,
      top: `${30 + (60 * (y - (minY + maxY) / 2 + span / 6)) / (span / 3)}%`,
    };
  };
  return (
    <div className="ps-map" aria-hidden="true">
      <svg
        className="ps-map-streets"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <path d="M-5 40 Q40 30 105 48M30 -5 Q38 50 32 105M60 -5 Q70 60 100 105M-5 80 Q50 70 105 90" />
      </svg>
      {others.map((other, index) => (
        <span
          className="ps-map-pin is-dim"
          key={index}
          style={place(other.coords)}
        >
          <MapPin number={other.number} />
        </span>
      ))}
      <span className="ps-map-pin" style={place(focus)}>
        <MapPin number={number} stay={stay} />
      </span>
    </div>
  );
}

function NextPlan({
  item,
  entry,
  entries,
}: {
  item: ItineraryItem;
  entry: Entry;
  entries: Entry[];
}) {
  const travel = useTravel();
  const index = entries.findIndex((candidate) => candidate.key === entry.key);
  const next = index >= 0 ? entries[index + 1] : undefined;
  if (!next) return null;
  const walk = walkBetween(entry, next, travel.places);
  const late = walk?.late ?? 0;
  const arrive = next.time && late ? (toMinutes(next.time) ?? 0) + late : null;
  // Our own plans move: a plan, or the time we planned to go in or out of the hotel.
  const ownPlan = next.item ?? next.plan;
  const movable = Boolean(
    ownPlan && arrive !== null && arrive < 24 * 60 && travel.canEdit,
  );
  const shift = () => {
    const plan = ownPlan!;
    const details = itemDetails(plan);
    const end = toMinutes(details.endTime);
    const endDay = details.endDay || plan.day;
    const sameDay = end !== null && endDay === plan.day;
    const nextEnd = sameDay ? end + late : null;
    travel.updateItem(plan.id, {
      day: plan.day,
      time: fromMinutes(arrive!),
      kind: plan.kind,
      title: plan.title,
      note: plan.note,
      // Keep the plan's length; an end past midnight stays where it was.
      details:
        nextEnd !== null && nextEnd < 24 * 60
          ? { ...details, endTime: fromMinutes(nextEnd) }
          : details,
    });
  };
  return (
    <section className="ps-row">
      <h4>
        <Glyph name="walk" />
        次の予定
      </h4>
      <div className="ps-ln">
        {next.title}
        {next.time && <small>{next.time}</small>}
      </div>
      {walk && (
        <p className="ps-hint">
          {walk.meters <= WALK_LIMIT_METERS
            ? `徒歩 約${walk.minutes}分 · ${distanceLabel(walk.meters)}`
            : `${distanceLabel(walk.meters)} · 歩くと約${walk.minutes}分。乗り物も検討`}
        </p>
      )}
      {late > 0 && arrive !== null && (
        <div className="ps-warn" role="status">
          <Glyph name="clock" />
          <div>
            {itemDetails(item).endTime}に出ると、着くのは
            {fromMinutes(arrive % (24 * 60))}。<b>{late}分遅れます。</b>
            {movable && (
              <>
                <br />
                <button type="button" className="ps-act" onClick={shift}>
                  {next.title}を{fromMinutes(arrive)}にする
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function PlanView({
  item,
  days,
  numbers,
  onClose,
}: {
  item: ItineraryItem;
  days: string[];
  numbers: ReadonlyMap<string, number>;
  onClose: () => void;
}) {
  const travel = useTravel();
  const navigate = useNavigate();
  const details = itemDetails(item);
  const category = itemCategory(item);
  const minutes = durationMinutes(item.day, item.time, details);
  const entries = useMemo(
    () => dayTimeline(timelineEntries(travel.items, travel.bookings), item.day),
    [travel.items, travel.bookings, item.day],
  );
  const entry = entries.find(
    (candidate) => candidate.key === `item-${item.id}`,
  ) ?? {
    key: `item-${item.id}`,
    day: item.day,
    time: item.time,
    title: item.title,
    item,
  };
  const place = planPlace(item, travel.places);
  const label = placeLabel(item, travel.places, numbers);
  const coords = entryCoords(entry, travel.places);
  const others = entries.flatMap((other) => {
    if (other.key === entry.key || !other.item) return [];
    const point = entryCoords(other, travel.places);
    const otherPlace = planPlace(other.item, travel.places);
    const number = otherPlace && numbers.get(otherPlace.id);
    return point && number ? [{ coords: point, number }] : [];
  });
  const mapLink = place
    ? mapUrl(place.location, place.title)
    : mapUrl(details.location);
  const transport =
    details.category === "transport" ? details.transport : undefined;
  // The times themselves open the time picker (Tsubasa's 「B」).
  const [picking, setPicking] = useState(false);
  const tap = (text: string, label: string) =>
    travel.canEdit ? (
      <TimeTap label={label} onOpen={() => setPicking(true)}>
        {text}
      </TimeTap>
    ) : (
      text
    );
  return (
    <div className="plan-sheet">
      <div className="ps-dt">
        <div className="ps-kick">
          <Glyph name={categoryGlyph[category.value]} />
          {category.label}
        </div>
        <h3 className="ps-title">{item.title}</h3>
      </div>
      <div className="ps-row is-when">
        <div className="ps-when">
          <b>
            {tap(item.time || "未定", "開始の時刻を直す")}
            {details.endTime && (
              <>
                <em>–</em>
                {details.endDay && details.endDay !== item.day
                  ? `${md(details.endDay)} `
                  : ""}
                {tap(details.endTime, "終了の時刻を直す")}
              </>
            )}
          </b>
          {minutes !== undefined && details.category !== "transport" && (
            <span>{durationLabel(minutes)}</span>
          )}
        </div>
        <div className="ps-from">{tripDayLabel(item.day, days)}</div>
        {travel.canEdit && <p className="time-tap-hint">{TIME_TAP_HINT}</p>}
      </div>
      {picking && (
        <PlanTimePicker item={item} onClose={() => setPicking(false)} />
      )}
      {transport ? (
        <section className="ps-row">
          <h4>
            <Glyph name="move" />
            {transportLabel(details)}
          </h4>
          <div className="ps-ln">
            {transport.origin || "出発地"} → {transport.destination || "目的地"}
          </div>
          {minutes !== undefined && (
            <p className="ps-hint">所要 {durationLabel(minutes)}</p>
          )}
        </section>
      ) : (
        (label || mapLink) && (
          <section className="ps-row">
            <h4>
              <Glyph name="pin" />
              場所
            </h4>
            {label && (
              <div className="ps-ln">
                {label.number && <MapPin number={label.number} />}
                {label.name}
              </div>
            )}
            {coords && (
              <MiniMap focus={coords} number={label?.number} others={others} />
            )}
            {mapLink && (
              <a
                className="ps-act"
                href={mapLink}
                target="_blank"
                rel="noreferrer"
              >
                <Glyph name="ext" />
                地図で開く
              </a>
            )}
          </section>
        )
      )}
      <NextPlan item={item} entry={entry} entries={entries} />
      <section className="ps-row">
        <h4>
          <Glyph name="note" />
          メモ
        </h4>
        {item.note ? (
          <p className="ps-note">{item.note}</p>
        ) : (
          <p className="ps-hint">なし</p>
        )}
      </section>
      {place && (
        <LinkedNotes
          placeId={place.id}
          onOpen={(noteId) =>
            dismissModal(() => {
              onClose();
              navigate(
                `/trips/${travel.selectedTrip!.id}/notes?note=${noteId}`,
              );
            })
          }
        />
      )}
    </div>
  );
}

/** 「930」「9:30」「09:30」 → "09:30"; 「18」 → "18:00"; empty stays empty.
    Anything else is returned as typed so validation can say so. */
export function clockTime(value: string) {
  const text = value
    .trim()
    .replace(/[０-９：]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    );
  if (!text) return "";
  const match =
    text.match(/^(\d{1,2}):(\d{2})$/) ??
    text.match(/^(\d{1,2})(\d{2})$/) ??
    text.match(/^(\d{1,2})$/);
  if (!match) return value;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  if (hours > 23 || minutes > 59) return value;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** E1: every field of the plan, saved with 「保存」 or dropped with ✕ in the dock. */
function PlanEditForm({
  item,
  days,
  onDone,
}: {
  item: ItineraryItem;
  days: string[];
  onDone: () => void;
}) {
  const travel = useTravel();
  const formId = useId();
  const anchor = useRef<HTMLFormElement>(null);
  const initial = itemDetails(item);
  const place = planPlace(item, travel.places);
  const [category, setCategory] = useState<ItineraryCategory>(initial.category);
  const [title, setTitle] = useState(item.title);
  const [day, setDay] = useState(item.day);
  // kondo-detail types times as text (「--:--」); 930 or 9:30 reads as 09:30.
  const [typedTime, setTime] = useState(item.time);
  const [typedEndTime, setEndTime] = useState(initial.endTime);
  const time = typedTime;
  const endTime = typedEndTime;
  // An own place reads as its name; pasting another link replaces it.
  const shownLocation =
    initial.ownPlace && place ? place.title : initial.location;
  const [location, setLocation] = useState(shownLocation);
  const [note, setNote] = useState(item.note);
  const [transport, setTransport] = useState(
    initial.transport ?? {
      mode: "train" as TransportMode,
      origin: "",
      destination: "",
    },
  );
  const [error, setError] = useState("");
  const { busy, run } = useAction();
  // An overnight plan keeps how many days it spans when its start day moves.
  const [span, setSpan] = useState(
    initial.endDay && initial.endTime
      ? Math.round(
          (Date.parse(`${initial.endDay}T12:00:00Z`) -
            Date.parse(`${item.day}T12:00:00Z`)) /
            86400000,
        )
      : 0,
  );
  const [picking, setPicking] = useState(false);
  const endDay = endTime
    ? new Date(Date.parse(`${day}T12:00:00Z`) + span * 86400000)
        .toISOString()
        .slice(0, 10)
    : "";
  const resolved =
    category === "transport" || location === shownLocation
      ? null
      : previewPlace(
          location,
          title,
          travel,
          { day, time },
          initial.ownPlace ? place : undefined,
        );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const time = clockTime(typedTime);
    const endTime = clockTime(typedEndTime);
    const details: ItineraryDetails = {
      ...emptyItineraryDetails(category),
      ...(initial.stay ? { stay: initial.stay } : {}),
      endDay,
      endTime,
      ...(category === "transport"
        ? {
            transport: {
              ...transport,
              origin: transport.origin.trim(),
              destination: transport.destination.trim(),
            },
          }
        : {}),
    };
    const clock = /^\d{2}:\d{2}$/;
    const message = !title.trim()
      ? "なにをするか入れてください"
      : (time && !clock.test(time)) || (endTime && !clock.test(endTime))
        ? "時刻は 9:30 のように入れてください"
        : itineraryDetailsError(day, time, details);
    setError(message);
    if (message) return;
    void run(() => {
      if (category !== "transport" && location === shownLocation) {
        details.location = initial.location;
        if (initial.ownPlace) details.ownPlace = true;
      } else if (category !== "transport") {
        const saved = savePlanPlace(
          travel,
          { id: item.id, title },
          location,
          place,
          initial.ownPlace,
        );
        details.location = saved.location;
        if (saved.ownPlace) details.ownPlace = true;
      } else if (initial.ownPlace && place) travel.deletePlace(place.id);
      travel.updateItem(item.id, {
        day,
        time,
        kind: itineraryCategories.find((entry) => entry.value === category)!
          .label,
        title: title.trim(),
        note,
        details,
      });
      onDone();
    });
  };
  return (
    <form
      ref={anchor}
      id={formId}
      className="plan-sheet ps-form"
      onSubmit={submit}
    >
      <p className="ps-old-h">予定を編集</p>
      <div className="field">
        <span>カテゴリ</span>
        <div className="ps-chips" role="group" aria-label="カテゴリ">
          {itineraryCategories.map((entry) => (
            <button
              type="button"
              key={entry.value}
              aria-pressed={category === entry.value}
              onClick={() => setCategory(entry.value)}
            >
              <Glyph name={categoryGlyph[entry.value]} />
              {entry.label}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>タイトル</span>
        <input
          className="ps-inp"
          required
          maxLength={160}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <div className="field">
        <span>日時</span>
        <div className="ps-times">
          <TimeRangeButton
            className="ps-inp"
            day={day}
            time={clockTime(time)}
            endTime={clockTime(endTime)}
            endDayOffset={span}
            onOpen={() => setPicking(true)}
          />
        </div>
        {picking && (
          <TimelinePicker
            title={title.trim() || "予定"}
            day={day}
            days={days}
            time={clockTime(time)}
            endTime={clockTime(endTime)}
            endDayOffset={span}
            exclude={[`item-${item.id}`]}
            self={entryCoords(
              {
                key: `item-${item.id}`,
                day: item.day,
                time: item.time,
                title: item.title,
                item,
              },
              travel.places,
            )}
            allowClear
            onSave={(picked) => {
              setDay(picked.day);
              setTime(picked.time);
              setEndTime(picked.endTime);
              setSpan(picked.endTime ? picked.endDayOffset : 0);
            }}
            onClose={() => setPicking(false)}
          />
        )}
        <p className="ps-hint">
          日付と時刻は、タイムラインで予定を動かして決めます。時刻を空けると「未定」でその日の最後に入ります。
        </p>
      </div>
      {category === "transport" ? (
        <>
          <div className="field">
            <span>手段</span>
            <div className="ps-chips" role="group" aria-label="手段">
              {transportModes.map((mode) => (
                <button
                  type="button"
                  key={mode.value}
                  aria-pressed={transport.mode === mode.value}
                  onClick={() =>
                    setTransport({ ...transport, mode: mode.value })
                  }
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            <span>出発地</span>
            <input
              className="ps-inp"
              maxLength={160}
              value={transport.origin}
              onChange={(event) =>
                setTransport({ ...transport, origin: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>目的地</span>
            <input
              className="ps-inp"
              maxLength={160}
              value={transport.destination}
              onChange={(event) =>
                setTransport({ ...transport, destination: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>所要時間（分）</span>
            <input
              className="ps-inp"
              type="number"
              min={1}
              max={10080}
              value={transport.durationMinutes ?? ""}
              onChange={(event) =>
                setTransport({
                  ...transport,
                  durationMinutes: event.target.value
                    ? Number(event.target.value)
                    : undefined,
                })
              }
            />
          </label>
        </>
      ) : (
        <label className="field">
          <span>場所</span>
          <input
            className="ps-inp"
            maxLength={160}
            value={location}
            placeholder="場所かマップのリンク"
            autoComplete="off"
            onChange={(event) => setLocation(event.target.value)}
          />
          {resolved && (
            <span className="it-plres">
              <MapPin number={resolved.number} />
              {resolved.name}
              <small>地図の {resolved.number} として載ります</small>
            </span>
          )}
        </label>
      )}
      <label className="field">
        <span>メモ</span>
        <textarea
          className="ps-inp"
          rows={2}
          maxLength={4000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <ErrorText message={error} />
      <ThumbDock
        mode="edit"
        target={() => anchor.current?.closest("dialog") ?? null}
      >
        <ContextDock
          back={
            <FormBackButton
              onBack={onDone}
              label="やめる"
              icon={<Glyph name="close" className="ps-dock-glyph" />}
            />
          }
          primary={
            <button type="submit" form={formId} disabled={busy}>
              保存
            </button>
          }
        />
      </ThumbDock>
    </form>
  );
}

/** 予定の詳細: opens over the しおり; 「編集」 switches the same sheet to the form. */
export function PlanSheet({
  id,
  days,
  numbers,
  onClose,
  onDelete,
}: {
  id: string;
  days: string[];
  numbers: ReadonlyMap<string, number>;
  onClose: () => void;
  onDelete: (item: ItineraryItem) => void;
}) {
  const travel = useTravel();
  const [editing, setEditing] = useState(false);
  const item = travel.items.find((entry) => entry.id === id);
  if (!item) return null;
  return (
    <Modal
      title="予定の詳細"
      addPanel
      onClose={onClose}
      dockActions={{
        // Every detail panel's dock: ‹ closes, 編集 then 削除 at the right edge.
        actions: travel.canEdit ? (
          <DetailDockActions
            onEdit={() => setEditing(true)}
            deleteLabel="予定を削除"
            onDelete={() =>
              dismissModal(() => {
                onClose();
                onDelete(item);
              })
            }
          />
        ) : undefined,
      }}
    >
      {editing ? (
        <PlanEditForm
          item={item}
          days={days}
          onDone={() => setEditing(false)}
        />
      ) : (
        <PlanView item={item} days={days} numbers={numbers} onClose={onClose} />
      )}
    </Modal>
  );
}

// ===== bookings: read here, changed in the 予約 tab =====
/** Our own check-in or check-out time; the hotel's terms need no row of their own. */
function saveStayTime(
  travel: ReturnType<typeof useTravel>,
  booking: Booking,
  endpoint: "start" | "end",
  plan: ItineraryItem | undefined,
  time: string,
) {
  const terms = endpoint === "start" ? booking.time : booking.endTime;
  const day =
    endpoint === "start" ? booking.day : booking.endDay || booking.day;
  if (!time || time === terms) {
    if (plan) travel.deleteItem(plan.id);
    return;
  }
  const input = {
    day,
    time,
    kind: "その他",
    title: endpoint === "start" ? "チェックイン" : "チェックアウト",
    note: plan?.note ?? "",
    details: {
      ...emptyItineraryDetails("other"),
      stay: { bookingId: booking.id, endpoint },
    },
  };
  if (plan) travel.updateItem(plan.id, input);
  else travel.createItem(input);
}

/** The single-time picker for a stay's check-in or check-out. */
function StayTimePicker({
  booking,
  endpoint,
  time,
  onSave,
  onClose,
}: {
  booking: Booking;
  endpoint: "start" | "end";
  time: string;
  /** The picked time, or the hotel's terms when cleared. */
  onSave: (time: string) => void;
  onClose: () => void;
}) {
  const travel = useTravel();
  const terms = endpoint === "start" ? booking.time : booking.endTime;
  return (
    <TimelinePicker
      title={booking.title}
      day={endpoint === "start" ? booking.day : booking.endDay || booking.day}
      time={time}
      endTime=""
      point
      pointLabel={endpoint === "start" ? "チェックイン" : "チェックアウト"}
      exclude={[`booking-${booking.id}-${endpoint}`]}
      self={entryCoords(
        {
          key: `booking-${booking.id}-${endpoint}`,
          day: booking.day,
          time,
          title: booking.title,
          booking,
          endpoint,
        },
        travel.places,
      )}
      allowClear={Boolean(terms)}
      clearLabel="宿の条件の時刻に戻す"
      onSave={(picked) => onSave(picked.time || terms)}
      onClose={onClose}
    />
  );
}

function StayEditForm({
  booking,
  endpoint,
  plan,
  onDone,
}: {
  booking: Booking;
  endpoint: "start" | "end";
  plan?: ItineraryItem;
  onDone: () => void;
}) {
  const travel = useTravel();
  const formId = useId();
  const anchor = useRef<HTMLFormElement>(null);
  const terms = endpoint === "start" ? booking.time : booking.endTime;
  const [time, setTime] = useState(plan?.time ?? terms);
  const [picking, setPicking] = useState(false);
  const label = endpoint === "start" ? "チェックイン" : "チェックアウト";
  const submit = (event: FormEvent) => {
    event.preventDefault();
    saveStayTime(travel, booking, endpoint, plan, time);
    onDone();
  };
  return (
    <form
      ref={anchor}
      id={formId}
      className="plan-sheet ps-form"
      onSubmit={submit}
    >
      <p className="ps-old-h">{label}の時刻</p>
      <h3 className="ps-title">{booking.title}</h3>
      <div className="field">
        <span>{endpoint === "start" ? "入る時刻" : "出る時刻"}</span>
        <TimeRangeButton
          className="ps-inp"
          label={endpoint === "start" ? "入る時刻" : "出る時刻"}
          time={time}
          onOpen={() => setPicking(true)}
        />
      </div>
      {picking && (
        <StayTimePicker
          booking={booking}
          endpoint={endpoint}
          time={time}
          onSave={setTime}
          onClose={() => setPicking(false)}
        />
      )}
      {terms && (
        <p className="ps-hint">
          宿の条件は{endpoint === "start" ? `${terms}〜` : `〜${terms}`}
          です。予約の内容は予約タブで直します。
        </p>
      )}
      <ThumbDock
        mode="edit"
        target={() => anchor.current?.closest("dialog") ?? null}
      >
        <ContextDock
          back={
            <FormBackButton
              onBack={onDone}
              label="やめる"
              icon={<Glyph name="close" className="ps-dock-glyph" />}
            />
          }
          primary={
            <button type="submit" form={formId}>
              保存
            </button>
          }
        />
      </ThumbDock>
    </form>
  );
}

function BookingView({
  booking,
  endpoint,
  days,
  plan,
}: {
  booking: Booking;
  endpoint?: "start" | "end";
  days: string[];
  plan?: ItineraryItem;
}) {
  const travel = useTravel();
  const [picking, setPicking] = useState(false);
  const place = bookingPlaceName(booking);
  const link = mapUrl(
    booking.location || (booking.kind === "hotel" ? booking.detail : ""),
    place,
  );
  const coords =
    coordsFromLink(booking.location) ?? coordsFromLink(booking.detail);
  const kv = booking.confirmationCode && (
    <section className="ps-row">
      <dl className="ps-kv">
        <dt>予約番号</dt>
        <dd className="is-code">{booking.confirmationCode}</dd>
      </dl>
    </section>
  );
  const placeRow = (place || link) && (
    <section className="ps-row">
      <h4>
        <Glyph name="pin" />
        場所
      </h4>
      {place && (
        <div className="ps-ln">
          {booking.kind === "hotel" && <MapPin stay />}
          {place}
        </div>
      )}
      {coords && (
        <MiniMap focus={coords} stay={booking.kind === "hotel"} others={[]} />
      )}
      {link && (
        <a className="ps-act" href={link} target="_blank" rel="noreferrer">
          <Glyph name="ext" />
          地図で開く
        </a>
      )}
    </section>
  );
  const kick = (
    <div className="ps-kick">
      <Glyph
        name={
          booking.kind === "flight"
            ? "up"
            : booking.kind === "train"
              ? "move"
              : booking.kind === "hotel"
                ? "bed"
                : "ticket"
        }
      />
      {bookingLabel[booking.kind]}
    </div>
  );
  if (booking.kind === "flight" || booking.kind === "train") {
    const connection = findFlightConnections(travel.bookings).find(
      (entry) => entry.arrivalBookingId === booking.id,
    );
    const next =
      connection &&
      travel.bookings.find(
        (entry) => entry.id === connection.departureBookingId,
      );
    const end = booking.endDay || booking.day;
    return (
      <div className="plan-sheet">
        <div className="ps-dt">
          {kick}
          <h3 className="ps-title">{booking.title}</h3>
        </div>
        <div className="ps-row is-when">
          <div className="ps-from">
            {md(booking.day)}（{weekday(booking.day)}）
            {end !== booking.day && ` → ${md(end)}（${weekday(end)}）`}
          </div>
          <JourneyLine booking={booking} />
        </div>
        {kv}
        {connection && (
          <section className="ps-row">
            <h4>
              <Glyph name="clock" />
              乗り継ぎ
            </h4>
            <p className="ps-note">
              {connection.airportCode}で{" "}
              {formatConnectionDuration(connection.durationMinutes)}。
              {next && `次は ${next.title}（${next.time} 発）`}
            </p>
          </section>
        )}
      </div>
    );
  }
  if (booking.kind === "hotel") {
    const nights = nightsOf(booking);
    const own = endpoint && plan;
    const stayTime = own
      ? plan.time
      : (endpoint === "start" ? booking.time : booking.endTime) || "";
    return (
      <div className="plan-sheet">
        <div className="ps-dt">
          {kick}
          <h3 className="ps-title">{booking.title}</h3>
        </div>
        <div className="ps-row is-when">
          <div className="ps-when">
            <b>
              {nights}
              <small>泊</small>
            </b>
          </div>
          <div className="ps-from">
            {md(booking.day)}（{weekday(booking.day)}）{" "}
            {booking.time ? `${booking.time}〜` : ""} →{" "}
            {md(booking.endDay || booking.day)}（
            {weekday(booking.endDay || booking.day)}）{" "}
            {booking.endTime ? `〜${booking.endTime}` : ""}
          </div>
        </div>
        {endpoint && (
          <section className="ps-row">
            <h4>
              <Glyph name={endpoint === "start" ? "in" : "out"} />
              {endpoint === "start"
                ? "チェックインの予定"
                : "チェックアウトの予定"}
            </h4>
            <div className="ps-ln">
              {travel.canEdit ? (
                <TimeTap
                  label={`${endpoint === "start" ? "チェックイン" : "チェックアウト"}の時刻を直す`}
                  onOpen={() => setPicking(true)}
                >
                  {stayTime || "未定"}
                </TimeTap>
              ) : (
                stayTime || "未定"
              )}
              <small>{own ? "わたしたちの予定" : "宿の条件のまま"}</small>
            </div>
            {travel.canEdit && <p className="time-tap-hint">{TIME_TAP_HINT}</p>}
            {picking && (
              <StayTimePicker
                booking={booking}
                endpoint={endpoint}
                time={stayTime}
                onSave={(time) =>
                  saveStayTime(travel, booking, endpoint, plan, time)
                }
                onClose={() => setPicking(false)}
              />
            )}
          </section>
        )}
        {kv}
        {placeRow}
      </div>
    );
  }
  return (
    <div className="plan-sheet">
      <div className="ps-dt">
        {kick}
        <h3 className="ps-title">{booking.title}</h3>
      </div>
      <div className="ps-row is-when">
        <div className="ps-when">
          <b>
            {booking.time || "未定"}
            {booking.endTime && (
              <>
                <em>–</em>
                {booking.endTime}
              </>
            )}
          </b>
        </div>
        <div className="ps-from">{tripDayLabel(booking.day, days)}</div>
      </div>
      {kv}
      {placeRow}
    </div>
  );
}

/** A booking seen from the しおり: its own detail; a hotel's check-in/out row adds the stay time, with 「詳細を開く」 to the 予約 tab. */
export function BookingSheet({
  id,
  endpoint,
  days,
  onClose,
}: {
  id: string;
  endpoint?: "start" | "end";
  days: string[];
  onClose: () => void;
}) {
  const travel = useTravel();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const booking = travel.bookings.find((entry) => entry.id === id);
  if (!booking) return null;
  // A booking card opens the booking's own detail, as the 予約 tab does
  // (Tsubasa 2026-10-06: 「予約の詳細を直接表示でいいんじゃない？」). A hotel's
  // check-in/out row stays here: it carries the travellers' own time.
  if (!(booking.kind === "hotel" && endpoint))
    return <BookingDetail id={booking.id} onClose={onClose} inItinerary />;
  const plan =
    booking.kind === "hotel" && endpoint
      ? travel.items.find(
          (item) =>
            item.details?.stay?.bookingId === booking.id &&
            item.details.stay.endpoint === endpoint,
        )
      : undefined;
  const stayEditable =
    booking.kind === "hotel" && Boolean(endpoint) && travel.canEdit;
  const details = (
    <DockFunction
      label="予約タブで詳細を開く"
      short="詳細を開く"
      className="ps-dock-detail"
      icon={<FileText aria-hidden="true" className="ps-dock-glyph" />}
      onClick={() =>
        dismissModal(() => {
          onClose();
          navigate(
            `/trips/${travel.selectedTrip!.id}/bookings?booking=${booking.id}`,
          );
        })
      }
    />
  );
  return (
    <Modal
      title="予約の詳細"
      addPanel
      tall
      onClose={onClose}
      dockActions={{
        // 詳細を開く is a function of its own: its own island, left of 編集
        // (Tsubasa 2026-10-06: 「別機能は別の島にして」).
        actions: stayEditable ? (
          <DetailDockActions onEdit={() => setEditing(true)} />
        ) : (
          details
        ),
        secondary: stayEditable ? details : undefined,
      }}
    >
      {editing && endpoint ? (
        <StayEditForm
          booking={booking}
          endpoint={endpoint}
          plan={plan}
          onDone={() => setEditing(false)}
        />
      ) : (
        <BookingView
          booking={booking}
          endpoint={endpoint}
          days={days}
          plan={plan}
        />
      )}
    </Modal>
  );
}
