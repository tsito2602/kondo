import { DayStrip } from "./day-strip";
import { PlaceCard } from "./place-card";
import { TaskList } from "./task-list";
import { CalendarPanel } from "./date-picker";
import { TripCover } from "./trip-cover";
import { useItineraryScroll } from "./itinerary-scroll";
import { dismissModal, reduceMotion } from "./motion";
import { ThumbAction } from "./thumb-dock";
import { Button } from "./obsidian/button";
import { Input } from "./obsidian/input";
import { Textarea } from "./obsidian/textarea";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import {
  BookOpen,
  Plus,
  Check,
  MapPin,
  Plane,
  Pin,
  Search,
  Trash2,
  CircleCheck,
  Route as RouteIcon,
  Clock,
  ListChecks,
  Hotel,
  TrainFront,
  Car,
  Utensils,
  Ticket,
  ChevronRight,
  CalendarDays,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./obsidian/tabs";
import { Badge } from "./obsidian/badge";
import { useTravel } from "@/data/travel-provider";
import { addDays, formatDate } from "@/utils/dates";
import {
  durationLabel,
  durationMinutes,
  itemDetails,
  itemCategory,
  orderItineraryEntries,
  transportLabel,
} from "@/data/itinerary";
import {
  findFlightConnections,
  formatConnectionDuration,
} from "@/data/flight-connections";
import { placeStatuses } from "@/data/places";
import {
  matchesPreparationFilter,
  preparationFilterOptions,
} from "@/data/preparation-filter";
import { assigneeName } from "@/data/assignee";
import type {
  Booking,
  Place,
  ItineraryItem,
  PackingItem,
  TravelTask,
  TravelNote,
} from "@/data/types";
import { AddButton, Empty, Modal, ThumbTools, Field, useAction } from "./ui";
import {
  BookingEditor,
  ItemEditor,
  PlaceEditor,
  PreparationEditor,
  bookingKinds,
} from "./editors";
import {
  BookingDetail,
  BookingRoute,
  ItemDetail,
  PlaceDetail,
} from "./details";

type Entry = {
  key: string;
  day: string;
  time: string;
  title: string;
  item?: ItineraryItem;
  booking?: Booking;
  stage?: string;
};
const stages = {
  flight: ["出発", "到着"],
  hotel: ["チェックイン", "チェックアウト"],
  train: ["乗車", "到着"],
  car: ["受取", "返却"],
  restaurant: ["予約", "終了"],
  ticket: ["利用", "終了"],
  other: ["予約", "終了"],
};
const bookingIcons = {
  flight: Plane,
  hotel: Hotel,
  train: TrainFront,
  car: Car,
  restaurant: Utensils,
  ticket: Ticket,
  other: BookOpen,
};
export function timelineEntries(
  items: ItineraryItem[],
  bookings: Booking[],
): Entry[] {
  return orderItineraryEntries([
    ...items.map((item) => ({
      key: `item-${item.id}`,
      day: item.day,
      time: item.time,
      title: item.title,
      item,
    })),
    ...bookings.flatMap((booking) => {
      const entries: Entry[] = [
        {
          key: `booking-${booking.id}-start`,
          day: booking.day,
          time: booking.time,
          title: booking.title,
          booking,
          stage: stages[booking.kind][0],
        },
      ];
      if (
        booking.endDay &&
        (booking.endDay !== booking.day ||
          (booking.endTime && booking.endTime !== booking.time))
      )
        entries.push({
          key: `booking-${booking.id}-end`,
          day: booking.endDay,
          time: booking.endTime,
          title: booking.title,
          booking,
          stage: stages[booking.kind][1],
        });
      return entries;
    }),
  ]);
}
export function ItineraryScreen() {
  const travel = useTravel();
  const [params] = useSearchParams();
  const [adding, setAdding] = useState<string | null>(null);
  const [datePicker, setDatePicker] = useState(false);
  const [detail, setDetail] = useState<{
    type: "item" | "booking";
    id: string;
  } | null>(null);
  const entries = useMemo(
    () => timelineEntries(travel.items, travel.bookings),
    [travel.items, travel.bookings],
  );
  const days = useMemo(() => {
    const values = new Set(entries.map((entry) => entry.day));
    const trip = travel.selectedTrip!;
    for (
      let day = trip.startsOn, count = 0;
      day <= trip.endsOn && count < 1096;
      day = addDays(day, 1), count++
    )
      values.add(day);
    return [...values].sort();
  }, [entries, travel.selectedTrip]);
  const { selectedDay, selectDay } = useItineraryScroll(
    days,
    params.get("day") ?? travel.selectedTrip!.startsOn,
  );
  useEffect(() => {
    const day = params.get("day");
    if (!day) return;
    const timer = setTimeout(() => selectDay(day, "instant"), 50);
    return () => clearTimeout(timer);
  }, [params, selectDay]);
  const connections = findFlightConnections(travel.bookings);
  return (
    <>
      <ThumbAction>
        <button
          className="thumb-control"
          onClick={() => setDatePicker(true)}
          aria-label="日付を選ぶ"
        >
          <CalendarDays size={18} />
          {selectedDay.slice(5).replace("-", "/")}
        </button>
      </ThumbAction>
      {datePicker && (
        <CalendarPanel
          label="日付を選ぶ"
          required
          value={selectedDay}
          allowedDates={days}
          min={days[0]}
          max={days.at(-1)}
          onChange={(day) =>
            requestAnimationFrame(() =>
              selectDay(day, reduceMotion() ? "instant" : "smooth"),
            )
          }
          onClose={() => setDatePicker(false)}
        />
      )}
      {travel.selectedTrip!.coverImage && (
        <section className="itinerary-cover" aria-label="旅行のカバー">
          <TripCover
            id={travel.selectedTrip!.id}
            src={travel.selectedTrip!.coverImage}
          />
          <div className="itinerary-cover-caption">
            <span>{travel.selectedTrip!.destination}</span>
            <h2>{travel.selectedTrip!.name}</h2>
          </div>
        </section>
      )}
      <DayStrip days={days} selectedDay={selectedDay} onSelect={selectDay} />
      <div className="page timeline">
        {days.map((day, index) => (
          <section className="day-section" id={`day-${day}`} key={day}>
            <div className="day-heading">
              <span className="eyebrow">
                DAY {String(index + 1).padStart(2, "0")}
              </span>
              <h2>{formatDate(day)}</h2>
            </div>
            {!entries.some((entry) => entry.day === day) && (
              <button
                className="timeline-entry timeline-empty"
                disabled={!travel.canEdit}
                aria-label={
                  travel.canEdit ? `${formatDate(day)}に予定を追加` : undefined
                }
                onClick={() => setAdding(day)}
              >
                <div data-press-card>
                  <p>まだ予定はありません</p>
                  {travel.canEdit && (
                    <span className="empty-add">
                      <Plus size={16} />
                      予定を追加
                    </span>
                  )}
                </div>
              </button>
            )}
            {entries
              .filter((entry) => entry.day === day)
              .map((entry) => {
                const BookingIcon = entry.booking
                  ? bookingIcons[entry.booking.kind]
                  : BookOpen;
                const transport =
                  entry.item &&
                  itemDetails(entry.item).category === "transport";
                const connection =
                  entry.booking &&
                  entry.stage === "到着" &&
                  connections.find(
                    (connection) =>
                      connection.arrivalBookingId === entry.booking!.id,
                  );
                return (
                  <div key={entry.key}>
                    <button
                      id={entry.item ? `item-${entry.item.id}` : undefined}
                      className={`timeline-entry ${transport ? "transport-entry" : ""} ${params.get("item") === entry.item?.id ? "highlight" : ""}`}
                      onClick={() =>
                        setDetail({
                          type: entry.item ? "item" : "booking",
                          id: (entry.item ?? entry.booking)!.id,
                        })
                      }
                    >
                      <time>{entry.time || "未定"}</time>
                      <span className="timeline-marker">
                        {transport ? (
                          <RouteIcon size={17} />
                        ) : entry.booking ? (
                          <BookingIcon size={17} />
                        ) : (
                          <span />
                        )}
                      </span>
                      <div data-press-card>
                        <small>
                          {entry.item
                            ? transport
                              ? `${transportLabel(itemDetails(entry.item))} ${durationLabel(durationMinutes(entry.item.day, entry.item.time, itemDetails(entry.item)))}`
                              : itemCategory(entry.item).label
                            : entry.stage}
                        </small>
                        <h3>{entry.title}</h3>
                        {entry.booking && (
                          <p className="muted">
                            {entry.booking.originCode || entry.booking.origin}
                            {entry.booking.destinationCode ||
                            entry.booking.destination
                              ? " → "
                              : ""}
                            {entry.booking.destinationCode ||
                              entry.booking.destination}
                          </p>
                        )}
                      </div>
                    </button>
                    {connection && (
                      <button
                        className="connection-strip"
                        onClick={() =>
                          setDetail({ type: "booking", id: entry.booking!.id })
                        }
                      >
                        <Clock size={14} />
                        {connection.airportCode} 乗り継ぎ{" "}
                        {formatConnectionDuration(connection.durationMinutes)}
                      </button>
                    )}
                  </div>
                );
              })}
          </section>
        ))}
      </div>
      {travel.canEdit && (
        <AddButton
          floating
          label="予定を追加"
          onClick={() => setAdding(selectedDay)}
        />
      )}
      {adding && <ItemEditor day={adding} onClose={() => setAdding(null)} />}
      {detail?.type === "item" && (
        <ItemDetail id={detail.id} onClose={() => setDetail(null)} />
      )}
      {detail?.type === "booking" && (
        <BookingDetail id={detail.id} onClose={() => setDetail(null)} />
      )}
    </>
  );
}
export function BookingsScreen() {
  const { bookings, canEdit } = useTravel();
  const [id, setId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  return (
    <div className="page bookings-page">
      <div className="page-toolbar">
        <div>
          <h2>予約</h2>
          <span className="muted">{bookings.length}件</span>
        </div>
        {canEdit && (
          <AddButton label="予約を追加" onClick={() => setAdding(true)} />
        )}
      </div>
      {!bookings.length ? (
        <Empty>
          <BookOpen />
          <h2>予約はまだありません</h2>
          <p>航空券やホテルの予約を追加できます。</p>
        </Empty>
      ) : (
        <div className="booking-grid">
          {[...bookings]
            .sort(
              (a, b) =>
                a.day.localeCompare(b.day) || a.time.localeCompare(b.time),
            )
            .map((booking) => (
              <button
                className="booking-ticket"
                data-press-card
                key={booking.id}
                onClick={() => setId(booking.id)}
              >
                <div className="ticket-main">
                  <div className="row between">
                    <Badge variant="secondary" className="booking-kind">
                      {
                        bookingKinds.find(
                          (entry) => entry.value === booking.kind,
                        )?.label
                      }
                    </Badge>
                    <span className="muted">{formatDate(booking.day)}</span>
                  </div>
                  <h2>{booking.title}</h2>
                  {booking.detail && <p className="clamp">{booking.detail}</p>}
                  {["flight", "train", "car"].includes(booking.kind) ? (
                    <BookingRoute booking={booking} />
                  ) : (
                    booking.location && (
                      <p className="muted clamp ticket-location">
                        <MapPin size={12} />
                        {booking.location}
                      </p>
                    )
                  )}
                </div>
                <div className="ticket-stub">
                  <strong>{booking.time || "時刻未定"}</strong>
                  <span className="confirmation-code">
                    {booking.confirmationCode}
                  </span>
                  <span className="ticket-open">
                    <ChevronRight size={18} />
                  </span>
                </div>
              </button>
            ))}
        </div>
      )}
      {adding && <BookingEditor onClose={() => setAdding(false)} />}
      {id && <BookingDetail id={id} onClose={() => setId(null)} />}
    </div>
  );
}
export function PlacesScreen() {
  const travel = useTravel();
  const [id, setId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [scheduling, setScheduling] = useState<Place | null>(null);
  const [filter, setFilter] = useState("all");
  const places = travel.places.filter(
    (place) => filter === "all" || place.status === filter,
  );
  return (
    <div className="page places-page">
      <ThumbTools title="場所の絞り込み" label="絞り込み">
        <div className="menu-list">
          {[{ value: "all", label: "すべて" }, ...placeStatuses].map(
            (entry) => (
              <button
                key={entry.value}
                aria-pressed={filter === entry.value}
                onClick={() => setFilter(entry.value)}
              >
                {entry.label}
                {filter === entry.value && <CircleCheck size={18} />}
              </button>
            ),
          )}
        </div>
      </ThumbTools>
      <div className="page-toolbar">
        <div>
          <h2>行きたい場所</h2>
          <span className="muted">{travel.places.length}件</span>
        </div>
        {travel.canEdit && (
          <AddButton label="場所を追加" onClick={() => setAdding(true)} />
        )}
      </div>
      <div className="filter-strip" aria-label="訪問ステータス">
        {[{ value: "all", label: "すべて" }, ...placeStatuses].map((entry) => (
          <button
            key={entry.value}
            className={filter === entry.value ? "selected" : ""}
            aria-pressed={filter === entry.value}
            onClick={() => setFilter(entry.value)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {!places.length ? (
        <Empty>
          <MapPin />
          <h2>
            {travel.places.length
              ? "該当する場所はありません"
              : "場所はまだありません"}
          </h2>
          <p>
            {travel.places.length
              ? "絞り込みを変更してください。"
              : "訪れたい場所を追加できます。"}
          </p>
        </Empty>
      ) : (
        <div className="place-grid">
          {places.map((place) => (
            <PlaceCard
              key={place.id}
              place={place}
              linked={travel.items.find(
                (item) => item.id === place.itineraryItemId,
              )}
              tripId={travel.selectedTrip!.id}
              onOpen={() => setId(place.id)}
              onSchedule={
                travel.canEdit ? () => setScheduling(place) : undefined
              }
            />
          ))}
        </div>
      )}
      {scheduling && (
        <ItemEditor place={scheduling} onClose={() => setScheduling(null)} />
      )}
      {adding && <PlaceEditor onClose={() => setAdding(false)} />}
      {id && <PlaceDetail id={id} onClose={() => setId(null)} />}
    </div>
  );
}
export function PackingScreen() {
  const travel = useTravel();
  const [tab, setTab] = useState<"task" | "packing">("task");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<{
    item?: TravelTask | PackingItem;
    type: "task" | "packing";
  } | null>(null);
  const { run } = useAction();
  const all = tab === "task" ? travel.tasks : travel.packingItems;
  const options = preparationFilterOptions(
    travel.members,
    all,
    tab === "packing",
  );
  const selected = options.find((option) => option.key === filter)?.filter ?? {
    kind: "all" as const,
  };
  const items = all.filter((item) => matchesPreparationFilter(item, selected));
  const complete = (item: TravelTask | PackingItem) =>
    "done" in item ? item.done : item.packed;
  const done = items.filter(complete).length;
  return (
    <Tabs
      className="page preparation-page"
      value={tab}
      onValueChange={(value) => {
        setTab(value as "task" | "packing");
        setFilter("all");
      }}
    >
      <ThumbTools title="準備の表示" label="表示">
        <div className="form">
          <div className="segmented">
            {(["task", "packing"] as const).map((value) => (
              <button
                key={value}
                aria-pressed={tab === value}
                className={tab === value ? "selected" : ""}
                onClick={() => {
                  setTab(value);
                  setFilter("all");
                }}
              >
                {value === "task" ? "やること" : "持ち物"}
              </button>
            ))}
          </div>
          <Field label="担当者">
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              {options.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </ThumbTools>
      <div className="page-toolbar">
        <div>
          <h2>準備</h2>
        </div>
        {travel.canEdit && (
          <AddButton
            label={tab === "task" ? "やることを追加" : "持ち物を追加"}
            onClick={() => setEditing({ type: tab })}
          />
        )}
      </div>
      <TabsList
        className="segmented"
        data-active-tab={tab}
        aria-label="旅の準備"
      >
        <TabsTrigger value="task" aria-label="やること">
          やること<span className="tab-count">{travel.tasks.length}</span>
        </TabsTrigger>
        <TabsTrigger value="packing" aria-label="持ち物">
          持ち物<span className="tab-count">{travel.packingItems.length}</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent
        key={tab}
        value={tab}
        data-motion-direction={tab === "packing" ? "forward" : "back"}
      >
        <div className="preparation-summary">
          <div>
            <h2>{tab === "task" ? "完了したやること" : "準備できた持ち物"}</h2>
            <p className="muted">
              {done} / {items.length} {tab === "task" ? "完了" : "準備済み"}
            </p>
          </div>
          <strong>
            {items.length ? Math.round((done / items.length) * 100) : 0}
            <small>%</small>
          </strong>
        </div>
        <progress
          max={items.length || 1}
          value={done}
          aria-label="準備の完了率"
        />
        <div className="filter-strip" aria-label="担当者">
          {options.map((option) => (
            <button
              key={option.key}
              className={filter === option.key ? "selected" : ""}
              aria-pressed={filter === option.key}
              onClick={() => setFilter(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {!items.length ? (
          <Empty>
            <ListChecks />
            <p>{tab === "task" ? "やること" : "持ち物"}を追加しましょう。</p>
          </Empty>
        ) : (
          <TaskList
            key={tab + filter}
            canEdit={travel.canEdit}
            items={items.map((item) => ({
              id: item.id,
              title: "title" in item ? item.title : item.name,
              done: complete(item),
              meta: `${"quantity" in item ? `${item.category} · ${item.quantity}個${item.shared ? " · 共用" : ""}` : item.dueOn ? `${formatDate(item.dueOn)}まで` : "期限なし"} · ${assigneeName(item.assignee ?? "", travel.members)}`,
            }))}
            onToggle={(id, checked) => {
              const item = items.find((item) => item.id === id)!;
              void run(() =>
                "done" in item
                  ? travel.updateTask(id, { ...item, done: checked })
                  : travel.updatePackingItem(id, { ...item, packed: checked }),
              );
            }}
            onEdit={(id) =>
              setEditing({
                item: items.find((item) => item.id === id),
                type: tab,
              })
            }
          />
        )}
        {editing && (
          <PreparationEditor
            type={editing.type}
            item={editing.item}
            onClose={() => setEditing(null)}
          />
        )}
      </TabsContent>
    </Tabs>
  );
}
export function NotesScreen() {
  const travel = useTravel();
  const [search, setSearch] = useState("");
  const [note, setNote] = useState<TravelNote | null>(null);
  const notes = travel.notes
    .filter((note) => note.body.toLowerCase().includes(search.toLowerCase()))
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
    );
  return (
    <div className="page notes-page">
      <ThumbTools title="メモを検索" label="検索">
        <Field label="検索キーワード">
          <Input
            placeholder="メモを検索"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Field>
        <p className="muted">{notes.length}件のメモ</p>
      </ThumbTools>
      <div className="page-toolbar">
        <div>
          <h2>メモ</h2>
          <span className="muted">{travel.notes.length}件</span>
        </div>
        {travel.canEdit && (
          <AddButton
            label="メモを書く"
            onClick={() =>
              setNote({
                id: crypto.randomUUID(),
                body: "",
                pinned: false,
                updatedAt: Date.now() / 1000,
              })
            }
          />
        )}
      </div>
      <label className="search">
        <Search />
        <Input
          aria-label="メモを検索"
          placeholder="メモを検索"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {!notes.length ? (
        <Empty>
          <FileNoteIcon />
          <h2>
            {search ? "該当するメモはありません" : "メモはまだありません"}
          </h2>
          <p>
            {search
              ? "別のキーワードで検索してください。"
              : "メモやチェックリストを残せます。"}
          </p>
        </Empty>
      ) : (
        <div className="note-list">
          {notes.map((note) => (
            <button
              className="note-card"
              data-press-card
              key={note.id}
              onClick={() => setNote(note)}
            >
              <div className="row between">
                <h2>{note.body.trim().split("\n")[0] || "新規メモ"}</h2>
                {note.pinned && <Pin size={17} />}
              </div>
              <p className="clamp muted">
                {note.body.trim().split("\n").slice(1).join(" ") || "本文なし"}
              </p>
              <small>
                {new Date(note.updatedAt * 1000).toLocaleDateString("ja-JP")}
              </small>
            </button>
          ))}
        </div>
      )}
      {note && <NoteEditor initial={note} onClose={() => setNote(null)} />}
    </div>
  );
}
function FileNoteIcon() {
  return <BookOpen />;
}
function NoteEditor({
  initial,
  onClose,
}: {
  initial: TravelNote;
  onClose: () => void;
}) {
  const { saveNote, deleteNote, canEdit, selectedTrip } = useTravel();
  const [draft, setDraft] = useState(initial);
  const input = useRef<HTMLTextAreaElement>(null);
  const latest = useRef(draft);
  const dirty = useRef(false);
  const save = useRef(saveNote);
  save.current = saveNote;
  const tripId = useRef(selectedTrip!.id);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    if (dirty.current && canEdit) {
      save.current(
        initial.id,
        { body: latest.current.body, pinned: latest.current.pinned },
        tripId.current,
      );
      dirty.current = false;
    }
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    const persist = () => flushRef.current();
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", persist);
    return () => {
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", persist);
      persist();
    };
  }, []);
  const change = (next: TravelNote) => {
    latest.current = next;
    dirty.current = true;
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), 500);
  };
  return (
    <Modal
      title="メモ"
      dockActions={{
        primary: canEdit && (
          <button
            onClick={() =>
              dismissModal(() => {
                flush();
                onClose();
              })
            }
          >
            <Check size={18} aria-hidden="true" />
            保存する
          </button>
        ),
      }}
      onClose={() => {
        flush();
        onClose();
      }}
      full
      action={
        <Button
          variant="ghost"
          className="text-button"
          onClick={() => {
            dismissModal(() => {
              flush();
              onClose();
            });
          }}
        >
          完了
        </Button>
      }
    >
      <div className="note-toolbar">
        {canEdit && (
          <>
            <button
              className={`icon-button ${draft.pinned ? "selected" : ""}`}
              aria-label="ピン留め"
              aria-pressed={draft.pinned}
              onClick={() => change({ ...draft, pinned: !draft.pinned })}
            >
              <Pin />
            </button>
            <Button
              variant="ghost"
              className="secondary"
              onClick={() => {
                const position =
                  input.current?.selectionStart ?? draft.body.length;
                const body = `${draft.body.slice(0, position)}${position && draft.body[position - 1] !== "\n" ? "\n" : ""}- [ ] ${draft.body.slice(position)}`;
                change({ ...draft, body });
                input.current?.focus();
              }}
            >
              <ListChecks />
              チェックリスト
            </Button>
            <Button
              variant="ghost"
              className="icon-button danger"
              aria-label="メモを削除"
              onClick={() => {
                if (confirm("このメモを削除しますか？")) {
                  dismissModal(() => {
                    dirty.current = false;
                    deleteNote(initial.id);
                    onClose();
                  });
                }
              }}
            >
              <Trash2 />
            </Button>
          </>
        )}
      </div>
      {draft.body.split("\n").some((line) => /^- \[[ x]\]/i.test(line)) && (
        <div className="note-checklist">
          {draft.body.split("\n").map(
            (line, i) =>
              /^- \[[ x]\]/i.test(line) && (
                <label key={i} className="check-line">
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={/^- \[x\]/i.test(line)}
                    onChange={(event) =>
                      change({
                        ...draft,
                        body: draft.body
                          .split("\n")
                          .map((value, n) =>
                            n === i
                              ? value.replace(
                                  /^- \[[ x]\]/i,
                                  `- [${event.target.checked ? "x" : " "}]`,
                                )
                              : value,
                          )
                          .join("\n"),
                      })
                    }
                  />
                  {line.slice(6)}
                </label>
              ),
          )}
        </div>
      )}
      <Textarea
        ref={input}
        readOnly={!canEdit}
        className="note-editor"
        maxLength={50000}
        aria-label="メモ本文"
        placeholder="思いついたことを、自由に。"
        value={draft.body}
        onChange={(event) => change({ ...draft, body: event.target.value })}
      />
      <p className="muted small">変更は自動で保存されます。</p>
    </Modal>
  );
}
