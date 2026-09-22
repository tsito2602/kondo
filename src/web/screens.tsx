import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import {
  BookOpen,
  MapPin,
  Plane,
  Pin,
  Search,
  Trash2,
  CircleCheck,
  Route as RouteIcon,
  Clock,
  ListChecks,
} from "lucide-react";
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
import { placeStatuses, reservationStatuses } from "@/data/places";
import {
  matchesPreparationFilter,
  preparationFilterOptions,
} from "@/data/preparation-filter";
import { assigneeName } from "@/data/assignee";
import type {
  Booking,
  ItineraryItem,
  PackingItem,
  TravelTask,
  TravelNote,
} from "@/data/types";
import { AddButton, Empty, Modal, useAction } from "./ui";
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
  const [selectedDay, setSelectedDay] = useState(
    params.get("day") ?? travel.selectedTrip!.startsOn,
  );
  const [adding, setAdding] = useState(false);
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
  useEffect(() => {
    const day = params.get("day");
    if (day) {
      setSelectedDay(day);
      setTimeout(
        () =>
          document
            .getElementById(`day-${day}`)
            ?.scrollIntoView({ block: "start" }),
        50,
      );
    }
  }, [params]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (changes) => {
        const entry = changes
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];
        if (entry) setSelectedDay(entry.target.id.replace("day-", ""));
      },
      { rootMargin: "-210px 0px -55% 0px", threshold: 0 },
    );
    days.forEach((day) => {
      const node = document.getElementById(`day-${day}`);
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, [days]);
  useEffect(() => {
    document
      .getElementById(`date-tab-${selectedDay}`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedDay]);
  const connections = findFlightConnections(travel.bookings);
  return (
    <>
      <nav className="date-strip" aria-label="旅の日付">
        {days.map((day, index) => (
          <button
            id={`date-tab-${day}`}
            key={day}
            aria-current={selectedDay === day ? "date" : undefined}
            onClick={() => {
              setSelectedDay(day);
              document.getElementById(`day-${day}`)?.scrollIntoView({
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "instant"
                  : "smooth",
                block: "start",
              });
            }}
          >
            <small>DAY {index + 1}</small>
            <span>{day.slice(5).replace("-", "/")}</span>
          </button>
        ))}
      </nav>
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
              <p className="day-empty">まだ予定はありません</p>
            )}
            {entries
              .filter((entry) => entry.day === day)
              .map((entry) => {
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
                          <Plane size={17} />
                        ) : (
                          <span />
                        )}
                      </span>
                      <div>
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
        <AddButton label="予定を追加" onClick={() => setAdding(true)} />
      )}
      {adding && (
        <ItemEditor day={selectedDay} onClose={() => setAdding(false)} />
      )}
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
    <div className="page">
      <div className="section-heading">
        <h2>旅の予約</h2>
        <span className="muted">{bookings.length}件</span>
      </div>
      {!bookings.length ? (
        <Empty>
          <BookOpen />
          <h2>予約をひとつに。</h2>
          <p>航空券やホテル、チケットをまとめておきましょう。</p>
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
                key={booking.id}
                onClick={() => setId(booking.id)}
              >
                <div className="ticket-main">
                  <div className="row between">
                    <span className="eyebrow">
                      {
                        bookingKinds.find(
                          (entry) => entry.value === booking.kind,
                        )?.label
                      }
                    </span>
                    <span className="muted">{formatDate(booking.day)}</span>
                  </div>
                  <h2>{booking.title}</h2>
                  <p>{booking.detail}</p>
                  {["flight", "train", "car"].includes(booking.kind) ? (
                    <BookingRoute booking={booking} />
                  ) : (
                    <p className="muted">{booking.location}</p>
                  )}
                </div>
                <div className="ticket-stub">
                  <span>{booking.time || "時刻未定"}</span>
                  <span>{booking.confirmationCode || "予約詳細"}</span>
                </div>
              </button>
            ))}
        </div>
      )}
      {canEdit && (
        <AddButton label="予約を追加" onClick={() => setAdding(true)} />
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
  const [filter, setFilter] = useState("all");
  const places = travel.places.filter(
    (place) => filter === "all" || place.status === filter,
  );
  return (
    <div className="page">
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
          <h2>次の楽しみを見つけよう。</h2>
          <p>訪れたい場所をここに集めておけます。</p>
        </Empty>
      ) : (
        <div className="place-grid">
          {places.map((place) => (
            <button
              className="place-card"
              key={place.id}
              onClick={() => setId(place.id)}
            >
              <div className="row between">
                <span className={`place-icon status-${place.status}`}>
                  {place.status === "visited" ? <CircleCheck /> : <MapPin />}
                </span>
                <span className={`badge status-${place.status}`}>
                  {
                    placeStatuses.find((entry) => entry.value === place.status)
                      ?.label
                  }
                </span>
              </div>
              <h2>{place.title}</h2>
              <p className="clamp muted">{place.note || place.location}</p>
              <div className="row between">
                <small>
                  {
                    reservationStatuses.find(
                      (entry) => entry.value === place.reservationStatus,
                    )?.label
                  }
                </small>
                <span className="text-link">
                  {travel.items.some(
                    (item) => item.id === place.itineraryItemId,
                  )
                    ? "しおりを見る"
                    : "しおりへ"}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
      {travel.canEdit && (
        <AddButton label="場所を追加" onClick={() => setAdding(true)} />
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
    <div className="page">
      <div className="segmented" role="tablist" aria-label="旅の準備">
        <button
          role="tab"
          aria-selected={tab === "task"}
          onClick={() => {
            setTab("task");
            setFilter("all");
          }}
        >
          やること
        </button>
        <button
          role="tab"
          aria-selected={tab === "packing"}
          onClick={() => {
            setTab("packing");
            setFilter("all");
          }}
        >
          持ち物
        </button>
      </div>
      <div className="preparation-summary">
        <div>
          <h2>
            {tab === "task"
              ? "出発までに、ひとつずつ。"
              : "忘れもののない旅へ。"}
          </h2>
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
        <div className="check-list">
          {items.map((item) => (
            <div
              className={`check-row ${complete(item) ? "completed" : ""}`}
              key={item.id}
            >
              <input
                type="checkbox"
                disabled={!travel.canEdit}
                checked={complete(item)}
                aria-label={`${"title" in item ? item.title : item.name}を${complete(item) ? "未完了" : "完了"}にする`}
                onChange={(event) =>
                  void run(() =>
                    "done" in item
                      ? travel.updateTask(item.id, {
                          ...item,
                          done: event.target.checked,
                        })
                      : travel.updatePackingItem(item.id, {
                          ...item,
                          packed: event.target.checked,
                        }),
                  )
                }
              />
              <button
                className="check-content"
                onClick={() =>
                  travel.canEdit && setEditing({ item, type: tab })
                }
              >
                <strong>{"title" in item ? item.title : item.name}</strong>
                <span>
                  {"quantity" in item
                    ? `${item.category} · ${item.quantity}個${item.shared ? " · 共用" : ""}`
                    : item.dueOn
                      ? `${formatDate(item.dueOn)}まで`
                      : "期限なし"}{" "}
                  · {assigneeName(item.assignee ?? "", travel.members)}
                </span>
              </button>
              {travel.canEdit && (
                <button
                  className="icon-button danger"
                  aria-label={`${"title" in item ? item.title : item.name}を削除`}
                  onClick={() =>
                    void run(() => {
                      if (confirm("削除しますか？")) {
                        if ("done" in item) travel.deleteTask(item.id);
                        else travel.deletePackingItem(item.id);
                      }
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {travel.canEdit && (
        <AddButton
          label={tab === "task" ? "やることを追加" : "持ち物を追加"}
          onClick={() => setEditing({ type: tab })}
        />
      )}
      {editing && (
        <PreparationEditor
          type={editing.type}
          item={editing.item}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
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
    <div className="page">
      <label className="search">
        <Search />
        <input
          aria-label="メモを検索"
          placeholder="メモを検索"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {!notes.length ? (
        <Empty>
          <FileNoteIcon />
          <h2>旅のメモ</h2>
          <p>思いついたことを、自由に。</p>
        </Empty>
      ) : (
        <div className="note-list">
          {notes.map((note) => (
            <button
              className="note-card"
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
      onClose={() => {
        flush();
        onClose();
      }}
      full
      action={
        <button
          className="text-button"
          onClick={() => {
            flush();
            onClose();
          }}
        >
          完了
        </button>
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
            <button
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
            </button>
            <button
              className="icon-button danger"
              aria-label="メモを削除"
              onClick={() => {
                if (confirm("このメモを削除しますか？")) {
                  dirty.current = false;
                  deleteNote(initial.id);
                  onClose();
                }
              }}
            >
              <Trash2 />
            </button>
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
      <textarea
        ref={input}
        autoFocus={canEdit}
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
