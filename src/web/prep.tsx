import { poofAway } from "./remove-motion";
import { DatePicker } from "./date-picker";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Trash2 } from "lucide-react";
import { useAuth } from "@/auth/auth-provider";
import { useTravel } from "@/data/travel-provider";
import { assigneeName, memberAssignee } from "@/data/assignee";
import type {
  PackingItem,
  PackingKind,
  TravelTask,
  TripMember,
} from "@/data/types";
import { localDate } from "@/utils/dates";
import { AssigneeAvatar } from "./assignee-avatar";
import { anim, RM, spring } from "./cartoon";
import { useJellyScroll } from "./jelly-scroll";
import { dismissModal } from "./motion";
import { PageTop } from "./page-top";
import {
  CategoryIcon,
  categoryColorKey,
  defaultPackingCategory,
  isListedCategory,
  packingCategories,
  presentCategories,
} from "./packing-categories";
import { CheckIcon } from "./prep-pictures";
import { AddButton, ErrorText, Modal } from "./ui";

/* ---------- motion, as kondo-prep3.html plays it ---------- */

/** A spring back from `from` to rest: scale pops, the ring's boing. */
const boing = (el: Element | null | undefined, from: string) =>
  el ? spring(el, [{ transform: from }, { transform: "none" }], "boing") : 0;
/** The mock's own sink: lands from above, squashes (1.06 × .9), settles. */
const SINK = (from: number): Keyframe[] => [
  { transform: `translateY(${from}px) scale(.9,1.12)`, opacity: 0 },
  { transform: "translateY(0) scale(.92,1.1)", opacity: 1, offset: 0.42 },
  { transform: "translateY(0) scale(1.06,.9)", offset: 0.6 },
  { transform: "translateY(-2px) scale(.99,1.02)", offset: 0.8 },
  { transform: "none", opacity: 1 },
];
/** Opening a page: its rings, headings and lists sink in, 35 ms apart. */
function useSinkIn(page: React.RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const parts = page.current?.querySelectorAll<HTMLElement>(
      ".prep-ring, .prep-list, .prep-kind-heading",
    );
    parts?.forEach((el, i) =>
      anim(el, SINK(-20), {
        duration: 460,
        delay: i * 35,
        easing: "cubic-bezier(.4,0,.6,1)",
        fill: "backwards",
      }),
    );
  }, [page]);
}

/* ---------- the bubble over the dock (the mock's .bub) ---------- */

const BubbleContext = createContext<(anchor: Element, text: string) => void>(
  () => undefined,
);
function Bubble({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const show = useCallback((anchor: Element, text: string) => {
    const bubble = ref.current;
    if (!bubble) return;
    bubble.textContent = text;
    bubble.style.left = "0px";
    const width = bubble.offsetWidth;
    const box = anchor.getBoundingClientRect();
    bubble.style.left = `${Math.max(12, Math.min(innerWidth - 12 - width, box.left + box.width / 2 - width / 2))}px`;
    bubble.getAnimations?.().forEach((a) => a.cancel());
    if (RM()) {
      bubble.style.opacity = "1";
      setTimeout(() => (bubble.style.opacity = ""), 2600);
      return;
    }
    bubble.animate?.(
      [
        { opacity: 0, transform: "translateY(10px) scale(.6)" },
        { opacity: 1, transform: "none", offset: 0.12 },
        { opacity: 1, transform: "none", offset: 0.85 },
        { opacity: 0 },
      ],
      { duration: 2600, easing: "ease-out" },
    );
  }, []);
  return (
    <BubbleContext.Provider value={show}>
      {children}
      <div className="prep-bubble" ref={ref} role="status" aria-live="polite" />
    </BubbleContext.Provider>
  );
}
const useBubble = () => useContext(BubbleContext);

/* ---------- shared helpers ---------- */

const monthDay = (day: string) => `${+day.slice(5, 7)}/${+day.slice(8)}`;
const weekday = (day: string) =>
  "日月火水木金土"[new Date(`${day}T12:00:00`).getDay()];
const daysBetween = (from: string, to: string) =>
  Math.round(
    (new Date(`${to}T12:00:00`).getTime() -
      new Date(`${from}T12:00:00`).getTime()) /
      864e5,
  );

/** Me first, then everyone else in the trip's order. */
function useTravellers() {
  const travel = useTravel();
  const self = useAuth().user?.id;
  const members = [
    ...travel.members.filter((member) => member.id === self),
    ...travel.members.filter((member) => member.id !== self),
  ];
  const label = (member: TripMember) =>
    member.id === self ? "あなた" : member.name || member.email;
  return { travel, self, members, label };
}

/** The page's opening line (.top): 「旅の名前 · あとN日」 over the title, ＋ at the right. */
function PrepHeader({
  title,
  addLabel,
  onAdd,
}: {
  title: string;
  addLabel: string;
  onAdd?: () => void;
}) {
  const { selectedTrip } = useTravel();
  const left = selectedTrip
    ? daysBetween(localDate(), selectedTrip.startsOn)
    : 0;
  return (
    <>
      <PageTop
        tab={title === "やること" ? "tasks" : "packing"}
        sub={left > 0 ? `あと${left}日` : undefined}
        title={title}
      />
      {onAdd && <AddButton label={addLabel} onClick={onAdd} />}
    </>
  );
}

/** The mock's .ck: a 26 px rounded box; the tick shows when done. */
function Box() {
  return (
    <span className="prep-box" aria-hidden="true">
      <CheckIcon />
    </span>
  );
}

/** A sheet whose dock holds 「やめる」 and the primary action, as in the mock. */
function PrepSheet({
  title,
  primary,
  formId,
  onClose,
  onDelete,
  deleteLabel,
  add = false,
  extra,
  children,
}: {
  /** Opened by the ＋ (rises from the bottom); otherwise grows from the row. */
  add?: boolean;
  title: string;
  primary: string;
  formId: string;
  onClose: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
  /** A separate function on its own dock island (持つのをやめる). */
  extra?: ReactNode;
  children: ReactNode;
}) {
  // A floating panel like every other; dock: ‹ · [extra] · [保存 削除]
  // (Tsubasa 2026-10-07: 保存は左、削除は右、別機能は別の島).
  return (
    <Modal
      title={title}
      onClose={onClose}
      addPanel
      dockActions={{
        split: true,
        primary: (
          <button type="submit" className="prep-primary" form={formId}>
            <CheckIcon />
            {primary}
          </button>
        ),
        actions: onDelete ? (
          <button
            type="button"
            className="danger"
            aria-label={deleteLabel}
            onClick={onDelete}
          >
            <Trash2 size={20} />
          </button>
        ) : undefined,
        secondary: onDelete ? extra : undefined,
      }}
    >
      <div className="prep-sheet">{children}</div>
    </Modal>
  );
}

/* ---------- やること ---------- */

type Ring = {
  key: string;
  label: string;
  assignee: string;
  tasks: TravelTask[];
};
const UNASSIGNED = "unassigned";
/** Tasks still on a member who has left the trip. */
const FORMER = "former";
/** The who-picker's value for "leave it on the departed member". */
const KEEP = "keep";

function DueText({ task, today }: { task: TravelTask; today: string }) {
  if (!task.dueOn) return <>期限なし</>;
  if (!task.done && task.dueOn < today)
    return (
      <i className="prep-late">{daysBetween(task.dueOn, today)}日過ぎた</i>
    );
  return <>{monthDay(task.dueOn)}まで</>;
}

const byDue = (a: TravelTask, b: TravelTask) =>
  (a.dueOn || "9").localeCompare(b.dueOn || "9") ||
  a.title.localeCompare(b.title) ||
  a.id.localeCompare(b.id);

function ActivityRing({
  ring,
  selected,
  members,
  onSelect,
}: {
  ring: Ring;
  selected: boolean;
  members: TripMember[];
  onSelect: () => void;
}) {
  const done = ring.tasks.filter((task) => task.done).length;
  const total = ring.tasks.length;
  const fraction = total ? done / total : 0;
  const circumference = 2 * Math.PI * 40;
  const closed = fraction >= 1;
  return (
    <button
      type="button"
      className={`prep-ring${closed ? " is-closed" : ""}`}
      data-ring={ring.key}
      aria-pressed={selected}
      aria-label={`${ring.label}　あと${total - done}`}
      onClick={onSelect}
    >
      <span className="prep-ring-view">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle className="prep-ring-track" cx="50" cy="50" r="40" />
          <circle
            className="prep-ring-fill"
            cx="50"
            cy="50"
            r="40"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - fraction)}
          />
        </svg>
        {ring.key === UNASSIGNED || ring.key === FORMER ? (
          <span className="assignee-avatar" aria-hidden="true">
            ?
          </span>
        ) : (
          <AssigneeAvatar value={ring.assignee} members={members} />
        )}
      </span>
      <b>{ring.label}</b>
      <small>あと{total - done}</small>
    </button>
  );
}

/** Press and hold a row to change it (the row itself ticks, as in the mock). */
function useHold(onHold: () => void) {
  const timer = useRef(0);
  const held = useRef(false);
  const cancel = () => clearTimeout(timer.current);
  return {
    held,
    handlers: {
      onPointerDown: () => {
        held.current = false;
        cancel();
        timer.current = window.setTimeout(() => {
          held.current = true;
          onHold();
        }, 550);
      },
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      onContextMenu: (event: React.MouseEvent) => {
        event.preventDefault();
        cancel();
        if (!held.current) {
          held.current = true;
          onHold();
        }
      },
    },
  };
}

function TaskRow({
  task,
  today,
  tickable,
  canEdit,
  onToggle,
  onEdit,
}: {
  task: TravelTask;
  today: string;
  tickable: boolean;
  canEdit: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const hold = useHold(() => canEdit && onEdit());
  return (
    <div
      role="listitem"
      data-task={task.id}
      className={`prep-row${task.done ? " is-done" : ""}${tickable ? "" : " is-readonly"}`}
    >
      <button
        type="button"
        role="checkbox"
        className="prep-row-main"
        aria-checked={task.done}
        aria-disabled={!tickable}
        aria-label={
          tickable
            ? `${task.title}を${task.done ? "未完了" : "完了"}にする`
            : `${task.title}（${task.done ? "済み" : "まだ"}）`
        }
        data-haptic={tickable ? "" : undefined}
        {...hold.handlers}
        onClick={() => {
          if (hold.held.current) {
            hold.held.current = false;
            return;
          }
          if (tickable) onToggle();
        }}
      >
        <span>
          <b>{task.title}</b>
          <small>
            <DueText task={task} today={today} />
          </small>
        </span>
        <Box />
      </button>
      {canEdit && (
        <button
          type="button"
          className="prep-sr"
          aria-label={`${task.title}を編集`}
          onClick={onEdit}
        />
      )}
    </div>
  );
}

export function TasksScreen() {
  return (
    <Bubble>
      <Tasks />
    </Bubble>
  );
}

function Tasks() {
  const { travel, self, members, label } = useTravellers();
  const today = localDate();
  const memberKeys = new Set(
    members.map((member) => memberAssignee(member.id)),
  );
  const rings: Ring[] = members.map((member) => ({
    key: member.id,
    label: label(member),
    assignee: memberAssignee(member.id),
    tasks: travel.tasks.filter(
      (task) => task.assignee === memberAssignee(member.id),
    ),
  }));
  // A task may have nobody on it, or a member who has since left the trip.
  const loose = travel.tasks.filter((task) => !memberKeys.has(task.assignee));
  const former = loose.filter((task) => task.assignee.startsWith("member:"));
  const nobody = loose.filter((task) => !task.assignee.startsWith("member:"));
  if (former.length)
    rings.push({
      key: FORMER,
      label: "元メンバー",
      assignee: "",
      tasks: former,
    });
  if (nobody.length)
    rings.push({
      key: UNASSIGNED,
      label: "担当なし",
      assignee: "",
      tasks: nobody,
    });
  const [chosen, setChosen] = useState(self ?? "");
  const ring =
    rings.find((entry) => entry.key === chosen) ?? rings[0] ?? undefined;
  const [sheet, setSheet] = useState<{ task?: TravelTask } | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  const page = useRef<HTMLDivElement>(null);
  useSinkIn(page);
  useJellyScroll(page, ".prep-rings, .prep-heading, .prep-list");
  useLayoutEffect(() => {
    if (!fresh.length) return;
    const root = page.current;
    const row = root?.querySelector(
      fresh.map((id) => `[data-task="${id}"]`).join(","),
    );
    row?.scrollIntoView?.({ block: "center" });
    void boing(row, "scale(.85)");
    for (const key of new Set(
      travel.tasks
        .filter((task) => fresh.includes(task.id))
        .map((task) => task.assignee.slice(7)),
    ))
      void boing(
        root?.querySelector(`[data-ring="${key}"] .prep-ring-view`),
        "scale(.86)",
      );
    setFresh([]);
  }, [fresh, travel.tasks]);
  const mine = ring?.key === self;
  const tickable = (task: TravelTask) =>
    travel.canEdit &&
    (task.assignee === memberAssignee(self ?? "") ||
      !memberKeys.has(task.assignee));
  const toggle = (task: TravelTask) => {
    const { id, title, dueOn, assignee, done } = task;
    travel.updateTask(id, { title, dueOn, assignee, done: !done });
    void boing(
      page.current?.querySelector(`[data-ring="${ring?.key}"] .prep-ring-view`),
      "scale(1.12)",
    );
  };
  return (
    <div className="page prep-page" ref={page}>
      <PrepHeader
        title="やること"
        addLabel="やることを追加"
        onAdd={travel.canEdit ? () => setSheet({}) : undefined}
      />
      {!rings.length ? (
        <p className="prep-empty">
          メンバーが読み込まれると、ここにリングが並びます。
        </p>
      ) : (
        <>
          <div
            className="prep-rings"
            role="group"
            aria-label="メンバーのやること"
          >
            {rings.map((entry) => (
              <ActivityRing
                key={entry.key}
                ring={entry}
                selected={entry.key === ring?.key}
                members={travel.members}
                onSelect={() => setChosen(entry.key)}
              />
            ))}
          </div>
          {ring && (
            <>
              <div className="prep-heading prep-task-heading">
                <b>{mine ? "あなたのやること" : `${ring.label}のやること`}</b>
                <span>
                  {mine
                    ? "押すとリングが閉じていく"
                    : ring.key === UNASSIGNED || ring.key === FORMER
                      ? "誰でもチェックできる"
                      : "見るだけ（チェックは本人）"}
                </span>
              </div>
              <div
                className="prep-list"
                role="list"
                aria-label={`${ring.label}のやること`}
              >
                {[...ring.tasks].sort(byDue).map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    today={today}
                    tickable={tickable(task)}
                    canEdit={travel.canEdit}
                    onToggle={() => toggle(task)}
                    onEdit={() => setSheet({ task })}
                  />
                ))}
                {!ring.tasks.length && <p className="prep-none">ありません</p>}
              </div>
            </>
          )}
        </>
      )}
      {sheet && (
        <TaskSheet
          task={sheet.task}
          defaultWho={self ?? ""}
          onClose={() => setSheet(null)}
          onSaved={(ids, key) => {
            if (key) setChosen(key);
            setFresh(ids);
          }}
        />
      )}
    </div>
  );
}

function TaskSheet({
  task,
  defaultWho,
  onClose,
  onSaved,
}: {
  task?: TravelTask;
  defaultWho: string;
  onClose: () => void;
  /** The ring to show afterwards (empty: stay). */
  onSaved: (ids: string[], ring: string) => void;
}) {
  const { travel, members, label } = useTravellers();
  const formId = useId();
  const [title, setTitle] = useState(task?.title ?? "");
  const [due, setDue] = useState(task?.dueOn ?? "");
  // KEEP: the task stays on someone outside the list (a member who left).
  const current =
    task && members.find((m) => memberAssignee(m.id) === task.assignee);
  const kept = task?.assignee && !current ? task.assignee : "";
  const initialWho = task ? (current?.id ?? (kept ? KEEP : "")) : defaultWho;
  const [who, setWho] = useState(initialWho);
  const assigneeFor = (value: string) =>
    value === KEEP ? kept : value ? memberAssignee(value) : "";
  const ringFor = (value: string) =>
    value === "all"
      ? ""
      : value === KEEP
        ? kept.startsWith("member:")
          ? FORMER
          : UNASSIGNED
        : value || UNASSIGNED;
  const [error, setError] = useState("");
  const name = useRef<HTMLInputElement>(null);
  // One save per panel: a second submit while it closes (return key then the
  // dock button, or a double tap) must not add the same thing twice.
  const saved = useRef(false);
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (saved.current) return;
    const value = title.trim();
    if (!value) {
      setError("やることの名前を入れてください");
      if (name.current)
        void spring(name.current, [
          { transform: "translateX(-8px)" },
          { transform: "none" },
        ]);
      name.current?.focus();
      return;
    }
    saved.current = true;
    try {
      if (task) {
        travel.updateTask(task.id, {
          title: value,
          dueOn: due,
          assignee: assigneeFor(who),
          done: task.done,
        });
        dismissModal(() => {
          onClose();
          onSaved([task.id], ringFor(who));
        });
        return;
      }
      const people = who === "all" ? members.map((member) => member.id) : [who];
      const ids = people.map((person) =>
        travel.createTask({
          title: value,
          dueOn: due,
          assignee: assigneeFor(person),
          done: false,
        }),
      );
      dismissModal(() => {
        onClose();
        onSaved(ids, ringFor(who));
      });
    } catch (cause) {
      saved.current = false;
      setError(cause instanceof Error ? cause.message : "保存できませんでした");
    }
  };
  const remove = () => {
    if (!task || !confirm(`「${task.title}」を削除しますか？`)) return;
    onClose();
    void poofAway(
      travel.removeLater,
      "task",
      task.id,
      "やることを消しました",
      `[data-task="${task.id}"]`,
    );
  };
  return (
    <PrepSheet
      title={task ? "やることを編集" : "やることを追加"}
      add={!task}
      primary={task ? "保存" : "追加する"}
      formId={formId}
      onClose={onClose}
      onDelete={task ? remove : undefined}
      deleteLabel="やることを削除"
    >
      <form id={formId} onSubmit={save} noValidate>
        <input
          ref={name}
          className="prep-input"
          aria-label="やること"
          placeholder="やることを入力"
          maxLength={160}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setError("");
          }}
        />
        <ErrorText message={error} />
        <DatePicker
          label="期限"
          startLabel="期限"
          value={due}
          min={localDate()}
          none="期限なし"
          trip={travel.selectedTrip ?? undefined}
          onChange={(day) => setDue(day)}
        />
        <span className="prep-label" id={`${formId}-who`}>
          誰がやる
        </span>
        <div
          className="prep-whos"
          role="group"
          aria-labelledby={`${formId}-who`}
        >
          {members.map((member) => (
            <button
              type="button"
              key={member.id}
              aria-pressed={who === member.id}
              onClick={(event) => {
                setWho(member.id);
                void boing(event.currentTarget, "scale(.9)");
              }}
            >
              <AssigneeAvatar
                value={memberAssignee(member.id)}
                members={travel.members}
              />
              {label(member)}
            </button>
          ))}
          {kept && (
            <button
              type="button"
              aria-pressed={who === KEEP}
              onClick={(event) => {
                setWho(KEEP);
                void boing(event.currentTarget, "scale(.9)");
              }}
            >
              <AssigneeAvatar value={kept} members={travel.members} />
              {kept.startsWith("member:") ? "元メンバー" : kept}
            </button>
          )}
          <button
            type="button"
            className="prep-who-none"
            aria-pressed={who === ""}
            onClick={(event) => {
              setWho("");
              void boing(event.currentTarget, "scale(.9)");
            }}
          >
            担当なし
          </button>
          {!task && members.length > 1 && (
            <button
              type="button"
              className="prep-who-all"
              aria-pressed={who === "all"}
              onClick={(event) => {
                setWho("all");
                void boing(event.currentTarget, "scale(.9)");
              }}
            >
              みんな各自
            </button>
          )}
          {who === "all" && (
            <span className="prep-who-note">
              {members.length}人それぞれのリングに1つずつ入ります
            </span>
          )}
        </div>
      </form>
    </PrepSheet>
  );
}

/* ---------- 持ち物 ---------- */

/**
 * Three kinds (Tsubasa 2026-10-07): everyone brings their own, one person
 * carries it (picked when adding), or a private item only you see. The list
 * is split by kind, so rows carry no note; 自分だけ's heading says it is hidden.
 */
const kinds: Record<PackingKind, [string, string]> = {
  each: ["みんな各自", "全員の一覧に出る。チェックは自分の分だけ"],
  one: ["1人が持つ", "誰が持つかを選ぶ。全員の一覧に「○○が持つ」と出る"],
  mine: ["自分だけ", "あなたの一覧にだけ出る。ほかの人には見えない"],
};
const kindOf = (item: PackingItem): PackingKind => item.kind ?? "one";
const categoryOf = (item: PackingItem) =>
  item.category || defaultPackingCategory;
const ALL = "すべて";

const packingInput = (item: PackingItem) => ({
  name: item.name,
  category: item.category,
  quantity: item.quantity,
  packed: item.packed,
  assignee: item.assignee ?? "",
  shared: item.shared ?? false,
  kind: kindOf(item),
});

/** A 持ち物 row, as a やること row: tap anywhere to tick, hold to edit. */
function PackRow({
  item,
  sub,
  side,
  take,
  showCheck,
  tickable,
  onToggle,
  onEdit,
}: {
  item: PackingItem;
  sub: ReactNode;
  side: ReactNode;
  take: ReactNode;
  showCheck: boolean;
  tickable: boolean;
  onToggle: () => void;
  onEdit?: () => void;
}) {
  const hold = useHold(() => onEdit?.());
  const done = showCheck && item.packed;
  return (
    <div
      role="listitem"
      data-item={item.id}
      className={`prep-row prep-item${done ? " is-done" : ""}${tickable ? "" : " is-readonly"}`}
    >
      <button
        type="button"
        role={showCheck ? "checkbox" : undefined}
        className="prep-row-main"
        aria-checked={showCheck ? item.packed : undefined}
        aria-disabled={!tickable}
        aria-label={
          tickable
            ? `${item.name}を${item.packed ? "まだにする" : "入れた"}`
            : item.name
        }
        data-haptic={tickable ? "" : undefined}
        {...hold.handlers}
        onClick={() => {
          if (hold.held.current) {
            hold.held.current = false;
            return;
          }
          if (tickable) onToggle();
        }}
      >
        <span>
          <b>
            {item.name}
            {item.quantity > 1 && (
              <span className="prep-qty"> ×{item.quantity}</span>
            )}
          </b>
          {sub && <small className="prep-item-sub">{sub}</small>}
        </span>
        {side}
        {showCheck && <Box />}
      </button>
      {take}
      {onEdit && (
        <button
          type="button"
          className="prep-sr"
          aria-label={`${item.name}を編集`}
          onClick={onEdit}
        />
      )}
    </div>
  );
}

export function PackingScreen() {
  return (
    <Bubble>
      <Packing />
    </Bubble>
  );
}

function Packing() {
  const { travel, self, members, label } = useTravellers();
  const bubble = useBubble();
  const [sheet, setSheet] = useState<{ item?: PackingItem } | null>(null);
  const [fresh, setFresh] = useState("");
  // The category filter lasts for this visit only.
  const [filter, setFilter] = useState(ALL);
  const page = useRef<HTMLDivElement>(null);
  const me = memberAssignee(self ?? "");
  useSinkIn(page);
  useJellyScroll(page, ".prep-heading, .prep-list");
  useLayoutEffect(() => {
    if (!fresh) return;
    const row = page.current?.querySelector(`[data-item="${fresh}"]`);
    row?.scrollIntoView?.({ block: "center" });
    void boing(row, "scale(.85)");
    setFresh("");
  }, [fresh]);
  const others = members.filter((member) => member.id !== self);
  const row$ = (id: string) =>
    page.current?.querySelector(`[data-item="${id}"]`);
  // A 1つでいい item is held only by a current member; one nobody holds (or
  // whose carrier left the trip) is open to everyone, as is an old free-text carrier.
  const memberKeys = new Set(
    members.map((member) => memberAssignee(member.id)),
  );
  const heldByOther = (item: PackingItem) =>
    Boolean(item.assignee) &&
    item.assignee !== me &&
    memberKeys.has(item.assignee ?? "");
  const unclaimed = (item: PackingItem) =>
    !item.assignee ||
    (item.assignee.startsWith("member:") && !memberKeys.has(item.assignee));
  const tickable = (item: PackingItem) =>
    travel.canEdit && (kindOf(item) !== "one" || !heldByOther(item));
  // 1人が持つ: only its carrier has a box; nobody has one until it is
  // decided, except an old item already ticked (so it can be unticked).
  const showsCheck = (item: PackingItem) =>
    kindOf(item) !== "one" ||
    item.assignee === me ||
    (unclaimed(item) && item.packed);
  const toggle = (item: PackingItem) => {
    travel.updatePackingItem(item.id, {
      ...packingInput(item),
      packed: !item.packed,
    });
    if (!item.packed)
      requestAnimationFrame(() =>
        boing(row$(item.id)?.querySelector(".prep-box"), "scale(1.3)"),
      );
  };
  const take = (item: PackingItem) => {
    travel.updatePackingItem(item.id, {
      ...packingInput(item),
      assignee: me,
      shared: true,
    });
    requestAnimationFrame(() => {
      const row = row$(item.id);
      if (!row) return;
      void boing(row, "scale(.9)");
      bubble(
        row,
        others.length
          ? `${item.name}はあなたが持つ。${others.length}人にもそう出ます`
          : `${item.name}はあなたが持つ`,
      );
    });
  };
  const carrier = (item: PackingItem) =>
    item.assignee === me
      ? "あなた"
      : assigneeName(item.assignee ?? "", travel.members);
  const row = (item: PackingItem) => {
    const kind = kindOf(item);
    const canTick = tickable(item);
    const edit = travel.canEdit ? () => setSheet({ item }) : undefined;
    let sub: ReactNode = null;
    let side: ReactNode = null;
    if (kind === "each")
      side = (
        <span className="prep-others">
          {others.map((member) => {
            const packed = item.packedBy?.includes(member.id) ?? false;
            return (
              <span
                key={member.id}
                className={packed ? "is-on" : "is-off"}
                role="img"
                aria-label={`${label(member)}：${packed ? "入れた" : "まだ"}`}
              >
                <AssigneeAvatar
                  value={memberAssignee(member.id)}
                  members={travel.members}
                />
              </span>
            );
          })}
        </span>
      );
    else if (kind === "one") {
      sub = !unclaimed(item) ? (
        <>
          <AssigneeAvatar
            value={item.assignee ?? ""}
            members={travel.members}
          />
          {carrier(item)}が持つ
          {item.assignee !== me && item.packed ? " · 入れた" : ""}
        </>
      ) : (
        "まだ決めていない"
      );
      if (unclaimed(item) && travel.canEdit && self)
        side = (
          <button
            type="button"
            className="prep-take"
            data-haptic
            onClick={() => take(item)}
          >
            自分が持つ
          </button>
        );
    }
    const showCheck = showsCheck(item);
    return (
      <PackRow
        key={item.id}
        item={item}
        sub={sub}
        side={kind === "each" ? side : null}
        take={kind === "one" ? side : null}
        showCheck={showCheck}
        tickable={canTick}
        onToggle={() => toggle(item)}
        onEdit={edit}
      />
    );
  };
  const categories = presentCategories(travel.packingItems.map(categoryOf));
  const shown =
    categories.length > 1 && categories.includes(filter) ? filter : ALL;
  return (
    <div className="page prep-page" ref={page}>
      <PrepHeader
        title="持ち物"
        addLabel="持ち物を追加"
        onAdd={travel.canEdit ? () => setSheet({}) : undefined}
      />
      {categories.length > 1 && (
        <div
          className="prep-filters"
          role="group"
          aria-label="カテゴリで絞り込む"
        >
          {[ALL, ...categories].map((category) => (
            <button
              type="button"
              key={category}
              data-kind={
                category === ALL ? undefined : categoryColorKey(category)
              }
              aria-pressed={shown === category}
              onClick={() => setFilter(category)}
            >
              {category !== ALL && <CategoryIcon category={category} />}
              {category}
            </button>
          ))}
        </div>
      )}
      {(["each", "one", "mine"] as const).map((kind) => {
        // The list's own order (oldest first), so ticking never moves a row.
        const items = travel.packingItems.filter(
          (item) =>
            kindOf(item) === kind &&
            (shown === ALL || categoryOf(item) === shown),
        );
        if (shown !== ALL && !items.length) return null;
        return (
          <section key={kind} aria-label={kinds[kind][0]}>
            <div className="prep-heading prep-kind-heading">
              <b>
                {kinds[kind][0]}
                {kind === "mine" && <small>ほかの人には見えない</small>}
              </b>
              <span>
                {`${items.filter((item) => item.packed).length} / ${items.length}`}
              </span>
            </div>
            <div className="prep-list" role="list" data-kind={kind}>
              {items.map(row)}
              {!items.length && <p className="prep-none">ありません</p>}
            </div>
          </section>
        );
      })}
      {sheet && (
        <PackingSheet
          item={sheet.item}
          self={self}
          onClose={() => setSheet(null)}
          onSaved={setFresh}
        />
      )}
    </div>
  );
}

/**
 * 誰が持つ opens under 1人が持つ: the space grows on a soft spring and the
 * label and faces pop in one after another; it folds away when unpicked.
 */
function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  const [shown, setShown] = useState(open);
  const box = useRef<HTMLDivElement>(null);
  const entering = useRef(false);
  useLayoutEffect(() => {
    if (open && !shown) {
      entering.current = true;
      setShown(true);
      return;
    }
    if (open || !shown) return;
    const el = box.current;
    if (!el) return setShown(false);
    let live = true;
    el.style.overflow = "hidden";
    void anim(
      el,
      [
        { height: `${el.offsetHeight}px`, opacity: 1 },
        { height: "0px", opacity: 0 },
      ],
      { duration: 200, easing: "cubic-bezier(.5,0,.9,.4)", fill: "forwards" },
    ).then(() => live && setShown(false));
    return () => {
      live = false;
    };
  }, [open, shown]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!shown || !el || !entering.current) return;
    entering.current = false;
    el.style.overflow = "hidden";
    void spring(
      el,
      [{ height: "0px" }, { height: `${el.offsetHeight}px` }],
      "soft",
    ).then(() => {
      el.style.overflow = "";
    });
    el.querySelectorAll<HTMLElement>(".prep-label, [role=radio]").forEach(
      (part, index) =>
        void spring(
          part,
          [
            { opacity: 0, transform: "translateY(12px) scale(.6)" },
            { opacity: 1, transform: "none" },
          ],
          "boing",
          { delay: 60 + index * 55, fill: "backwards" },
        ),
    );
  }, [shown]);
  return shown ? (
    <div ref={box} className="prep-reveal">
      {children}
    </div>
  ) : null;
}

function PackingSheet({
  item,
  self,
  onClose,
  onSaved,
}: {
  item?: PackingItem;
  self?: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { travel, members, label } = useTravellers();
  const formId = useId();
  const [name, setName] = useState(item?.name ?? "");
  const [kind, setKind] = useState<PackingKind>(item ? kindOf(item) : "each");
  const me = memberAssignee(self ?? "");
  // Who carries a 1人が持つ item: a member, nobody yet (""), or KEEP for an
  // old carrier who is not a member (free text or someone who left).
  const before = item ? packingInput(item) : null;
  const holder = before?.kind === "mine" ? me : (before?.assignee ?? "");
  const current = members.find((m) => memberAssignee(m.id) === holder);
  const kept = holder && !current ? holder : "";
  const [who, setWho] = useState(
    item ? (current?.id ?? (kept ? KEEP : "")) : (self ?? ""),
  );
  const assignee =
    kind !== "one" ? "" : who === KEEP ? kept : who ? memberAssignee(who) : "";
  const [quantity, setQuantity] = useState(item?.quantity ?? 1);
  // Stored as is until the user picks; an old free-text category gets its own chip.
  const [category, setCategory] = useState(
    item?.category || defaultPackingCategory,
  );
  const legacy =
    item?.category && !isListedCategory(item.category) ? item.category : "";
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const saved = useRef(false);
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (saved.current) return;
    const value = name.trim();
    if (!value) {
      setError("名前を入れてください");
      if (input.current)
        void spring(input.current, [
          { transform: "translateX(-8px)" },
          { transform: "none" },
        ]);
      input.current?.focus();
      return;
    }
    saved.current = true;
    try {
      if (item && before) {
        // The tick stays while the same person carries it; a new carrier
        // starts unpacked, and みんな各自 keeps each member's own tick.
        const sameCarrier =
          kind === "one" && before.kind !== "each" && assignee === holder;
        travel.updatePackingItem(item.id, {
          ...before,
          name: value,
          category,
          quantity,
          kind,
          shared: kind === "one",
          assignee,
          packed:
            kind === "each"
              ? before.kind === "each"
                ? before.packed
                : Boolean(self && item.packedBy?.includes(self))
              : kind === "mine"
                ? before.kind === "each"
                  ? Boolean(self && item.packedBy?.includes(self))
                  : holder === me && before.packed
                : sameCarrier
                  ? before.packed
                  : false,
        });
        dismissModal(() => {
          onClose();
          onSaved(item.id);
        });
        return;
      }
      const id = travel.createPackingItem({
        name: value,
        category,
        quantity,
        packed: false,
        assignee,
        shared: kind === "one",
        kind,
      });
      dismissModal(() => {
        onClose();
        onSaved(id);
      });
    } catch (cause) {
      saved.current = false;
      setError(cause instanceof Error ? cause.message : "保存できませんでした");
    }
  };
  const remove = () => {
    if (!item || !confirm(`「${item.name}」を削除しますか？`)) return;
    onClose();
    void poofAway(
      travel.removeLater,
      "packing",
      item.id,
      "持ち物を消しました",
      `[data-item="${item.id}"]`,
    );
  };
  return (
    <PrepSheet
      title={item ? "持ち物を編集" : "持ち物を追加"}
      add={!item}
      primary={item ? "保存" : "追加する"}
      formId={formId}
      onClose={onClose}
      onDelete={item ? remove : undefined}
      deleteLabel="持ち物を削除"
    >
      <form id={formId} onSubmit={save} noValidate>
        <input
          ref={input}
          className="prep-input"
          aria-label="持ち物"
          placeholder="持ち物を入力"
          maxLength={120}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError("");
          }}
        />
        <ErrorText message={error} />
        <span className="prep-label" id={`${formId}-cat`}>
          カテゴリ
        </span>
        <div
          className="prep-cats"
          role="radiogroup"
          aria-labelledby={`${formId}-cat`}
        >
          {[
            ...packingCategories.map(([value]) => value),
            ...(legacy ? [legacy] : []),
          ].map((value) => (
            <button
              type="button"
              role="radio"
              key={value}
              data-kind={categoryColorKey(value)}
              className={value === legacy ? "is-legacy" : undefined}
              aria-checked={category === value}
              onClick={(event) => {
                setCategory(value);
                void spring(
                  event.currentTarget,
                  [{ transform: "scale(.96)" }, { transform: "none" }],
                  "squish",
                );
              }}
            >
              <CategoryIcon category={value} />
              {value}
            </button>
          ))}
        </div>
        <div className="prep-qty-field" role="group" aria-label="個数">
          <span className="prep-label">個数</span>
          <button
            type="button"
            aria-label="個数を減らす"
            disabled={quantity <= 1}
            onClick={() => setQuantity((n) => Math.max(1, n - 1))}
          >
            −
          </button>
          <output aria-live="polite">{quantity}</output>
          <button
            type="button"
            aria-label="個数を増やす"
            disabled={quantity >= 99}
            onClick={() => setQuantity((n) => Math.min(99, n + 1))}
          >
            ＋
          </button>
        </div>
        <div className="prep-kinds" role="radiogroup" aria-label="持ち物の種類">
          {(Object.keys(kinds) as PackingKind[]).map((value) => (
            <button
              type="button"
              role="radio"
              key={value}
              aria-checked={kind === value}
              onClick={(event) => {
                setKind(value);
                void spring(
                  event.currentTarget,
                  [{ transform: "scale(.96)" }, { transform: "none" }],
                  "squish",
                );
              }}
            >
              <i aria-hidden="true" />
              <b>{kinds[value][0]}</b>
              <small>{kinds[value][1]}</small>
            </button>
          ))}
        </div>
        <Reveal open={kind === "one"}>
          <>
            <span className="prep-label" id={`${formId}-who`}>
              誰が持つ
            </span>
            <div
              className="prep-whos"
              role="radiogroup"
              aria-labelledby={`${formId}-who`}
            >
              {members.map((member) => (
                <button
                  type="button"
                  role="radio"
                  key={member.id}
                  aria-checked={who === member.id}
                  onClick={(event) => {
                    setWho(member.id);
                    void boing(event.currentTarget, "scale(.9)");
                  }}
                >
                  <AssigneeAvatar
                    value={memberAssignee(member.id)}
                    members={travel.members}
                  />
                  {label(member)}
                </button>
              ))}
              {kept && (
                <button
                  type="button"
                  role="radio"
                  aria-checked={who === KEEP}
                  onClick={(event) => {
                    setWho(KEEP);
                    void boing(event.currentTarget, "scale(.9)");
                  }}
                >
                  <AssigneeAvatar value={kept} members={travel.members} />
                  {kept.startsWith("member:") ? "元メンバー" : kept}
                </button>
              )}
              <button
                type="button"
                role="radio"
                className="prep-who-none"
                aria-checked={who === ""}
                onClick={(event) => {
                  setWho("");
                  void boing(event.currentTarget, "scale(.9)");
                }}
              >
                まだ決めない
              </button>
            </div>
          </>
        </Reveal>
      </form>
    </PrepSheet>
  );
}
