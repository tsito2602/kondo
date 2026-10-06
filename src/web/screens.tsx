import { SegmentSelection } from "./segment-selection";
import { PlaceStatusLabel } from "./place-status";
import { BookingTicketContent } from "./booking-ticket";
import { PlaceCard } from "./place-card";
import { TaskList } from "./task-list";
import { Input } from "./obsidian/input";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  BookOpen,
  MapPin,
  Plane,
  Search,
  CircleCheck,
  ListChecks,
  Hotel,
  TrainFront,
  Car,
  Utensils,
  Ticket,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./obsidian/tabs";
import { useTravel } from "@/data/travel-provider";
import { ordinaryPlans } from "@/data/itinerary";
import { formatDate } from "@/utils/dates";
import { placeStatuses } from "@/data/places";
import {
  matchesPreparationFilter,
  preparationFilterOptions,
} from "@/data/preparation-filter";
import { AssigneeAvatar } from "./assignee-avatar";
import type { Place, PackingItem, TravelTask, TravelNote } from "@/data/types";
import { AddButton, Empty, ThumbTools, Field, useAction } from "./ui";
import {
  BookingEditor,
  ItemEditor,
  PlaceEditor,
  PreparationEditor,
  bookingKinds,
} from "./editors";
import { BookingDetail, PlaceDetail } from "./details";

export { ItineraryScreen } from "./itinerary-screen";
export { timelineEntries, type Entry } from "@/data/plan-timeline";
const bookingIcons = {
  flight: Plane,
  hotel: Hotel,
  train: TrainFront,
  car: Car,
  restaurant: Utensils,
  ticket: Ticket,
  other: BookOpen,
};
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
            .map((booking) => {
              const BookingIcon = bookingIcons[booking.kind];
              return (
                <button
                  className="booking-ticket"
                  data-press-card
                  key={booking.id}
                  onClick={() => setId(booking.id)}
                >
                  <div className="ticket-main">
                    <BookingTicketContent booking={booking} />
                  </div>
                  <div className="ticket-stub">
                    <BookingIcon
                      size={24}
                      strokeWidth={1.5}
                      role="img"
                      aria-label={
                        bookingKinds.find(
                          (entry) => entry.value === booking.kind,
                        )?.label
                      }
                    />
                  </div>
                </button>
              );
            })}
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
                <PlaceStatusLabel
                  status={entry.value as Place["status"] | "all"}
                />
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
            <PlaceStatusLabel status={entry.value as Place["status"] | "all"} />
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
              linked={ordinaryPlans(travel.items).find(
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
          <div className="segmented preparation-tabs has-selection">
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
            <SegmentSelection index={tab === "task" ? 0 : 1} />
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
        className="segmented preparation-tabs has-selection"
        data-active-tab={tab}
        aria-label="旅の準備"
      >
        <TabsTrigger value="task" aria-label="やること">
          やること<span className="tab-count">{travel.tasks.length}</span>
        </TabsTrigger>
        <TabsTrigger value="packing" aria-label="持ち物">
          持ち物<span className="tab-count">{travel.packingItems.length}</span>
        </TabsTrigger>
        <SegmentSelection index={tab === "task" ? 0 : 1} />
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
              {option.filter.kind === "assignee" && option.filter.value ? (
                <AssigneeAvatar
                  value={option.filter.value}
                  members={travel.members}
                />
              ) : (
                option.label
              )}
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
              meta: (
                <span className="preparation-meta">
                  <span>
                    {"quantity" in item
                      ? `${item.category} · ${item.quantity}個`
                      : item.dueOn
                        ? `${formatDate(item.dueOn)}まで`
                        : "期限なし"}
                  </span>
                  {"quantity" in item && (item.shared || !item.assignee) && (
                    <span>共用</span>
                  )}
                  {item.assignee ? (
                    <AssigneeAvatar
                      value={item.assignee}
                      members={travel.members}
                    />
                  ) : !("quantity" in item) ? (
                    <span>未指定</span>
                  ) : null}
                </span>
              ),
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
const loadNoteEditor = () =>
  import("./note-editor").then((module) => ({ default: module.NoteEditor }));
const NoteEditor = lazy(loadNoteEditor);
export function NotesScreen() {
  const travel = useTravel();
  const [search, setSearch] = useState("");
  const [note, setNote] = useState<TravelNote | null>(null);
  useEffect(() => {
    void loadNoteEditor().catch(() => undefined);
  }, []);
  const notes = travel.notes
    .filter((note) =>
      `${note.title ?? ""}\n${note.body}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
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
                title: "",
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
                <h2>{note.title?.trim() || "無題のメモ"}</h2>
              </div>
              <p className="clamp muted">
                {note.body
                  .trim()
                  .replace(/^- \[([ x])\] /gim, (_, checked) =>
                    checked.toLowerCase() === "x" ? "☑ " : "☐ ",
                  )
                  .replace(/^- /gm, "• ") || "本文なし"}
              </p>
              <small>
                {new Date(note.updatedAt * 1000).toLocaleDateString("ja-JP")}
              </small>
            </button>
          ))}
        </div>
      )}
      {note && (
        <Suspense fallback={<p role="status">メモを開いています…</p>}>
          <NoteEditor initial={note} onClose={() => setNote(null)} />
        </Suspense>
      )}
    </div>
  );
}
function FileNoteIcon() {
  return <BookOpen />;
}
