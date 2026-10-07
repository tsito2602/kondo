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
  TaskKind,
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

/** A spring back from `from` to rest: the boing of a pop. */
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
/** Opening a page: its headings and lists sink in, 35 ms apart. */
function useSinkIn(page: React.RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const parts = page.current?.querySelectorAll<HTMLElement>(
      ".prep-list, .prep-kind-heading",
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

/** The who-picker's value for "leave it on the departed member". */
const KEEP = "keep";

/**
 * Two kinds, laid out as 持ち物's (Tsubasa 2026-10-07: the rings sat out of
 * sight while ticking lower rows, so the page now matches 持ち物).
 */
const taskKinds: Record<TaskKind, [string, string]> = {
  each: ["全員がやる", "全員の一覧に出る。チェックは自分の分だけ"],
  one: ["1人がやる", "誰がやるかを選ぶ。全員の一覧に「○○がやる」と出る"],
};
const taskKindOf = (task: TravelTask): TaskKind => task.kind ?? "one";
const taskInput = (task: TravelTask) => ({
  title: task.title,
  dueOn: task.dueOn,
  assignee: task.assignee,
  done: task.done,
  kind: taskKindOf(task),
});

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

/**
 * 全員が持つ / 全員がやる: the other members and whether each has done it, a
 * tick on the face (Tsubasa 2026-10-07). Past three people the faces would
 * crowd the name, so it shows who has done it, stacked, and how many of all.
 */
function OthersDone({
  others,
  doneBy,
  word,
}: {
  others: TripMember[];
  doneBy: string[];
  word: string;
}) {
  const { travel, label } = useTravellers();
  const face = (member: TripMember, done: boolean) => (
    <span
      key={member.id}
      className={done ? "is-on" : "is-off"}
      role="img"
      aria-label={`${label(member)}：${done ? word : "まだ"}`}
    >
      <AssigneeAvatar
        value={memberAssignee(member.id)}
        members={travel.members}
      />
    </span>
  );
  if (others.length <= 3)
    return (
      <span className="prep-others">
        {others.map((member) => face(member, doneBy.includes(member.id)))}
      </span>
    );
  const done = others.filter((member) => doneBy.includes(member.id));
  return (
    <span
      className="prep-others is-many"
      role="img"
      aria-label={`ほかの${others.length}人のうち${done.length}人が${word}`}
    >
      <span className="prep-others-stack" aria-hidden="true">
        {done.slice(0, 3).map((member) => face(member, true))}
      </span>
      <span className="prep-others-count" aria-hidden="true">
        {done.length}/{others.length}
      </span>
    </span>
  );
}

/** A row's box: the only part that ticks (the name opens the editor). */
function Check({
  label,
  checked,
  tickable,
  onToggle,
}: {
  label: string;
  checked: boolean;
  tickable: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      className="prep-check"
      aria-checked={checked}
      aria-disabled={!tickable}
      aria-label={label}
      data-haptic={tickable ? "" : undefined}
      onClick={() => tickable && onToggle()}
    >
      <Box />
    </button>
  );
}

/** Tap the name to edit, the box to tick (Tsubasa 2026-10-07: 長押しは
    画面からわからない), as a 持ち物 row. */
function TaskRow({
  task,
  sub,
  side,
  take,
  showCheck,
  tickable,
  canEdit,
  onToggle,
  onEdit,
}: {
  task: TravelTask;
  sub: ReactNode;
  side: ReactNode;
  take: ReactNode;
  showCheck: boolean;
  tickable: boolean;
  canEdit: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const done = showCheck && task.done;
  return (
    <div
      role="listitem"
      data-task={task.id}
      className={`prep-row prep-item${done ? " is-done" : ""}${tickable ? "" : " is-readonly"}`}
    >
      <button
        type="button"
        className="prep-row-main"
        aria-label={`${task.title}を編集`}
        disabled={!canEdit}
        onClick={onEdit}
      >
        <span>
          <b>{task.title}</b>
          <small className="prep-item-sub">{sub}</small>
        </span>
        {side}
      </button>
      {take}
      {showCheck && (
        <Check
          label={
            tickable
              ? `${task.title}を${task.done ? "未完了" : "完了"}にする`
              : `${task.title}（${task.done ? "済み" : "まだ"}）`
          }
          checked={task.done}
          tickable={tickable}
          onToggle={onToggle}
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
  const bubble = useBubble();
  const today = localDate();
  const me = memberAssignee(self ?? "");
  const memberKeys = new Set(
    members.map((member) => memberAssignee(member.id)),
  );
  const others = members.filter((member) => member.id !== self);
  const [sheet, setSheet] = useState<{ task?: TravelTask } | null>(null);
  const [fresh, setFresh] = useState("");
  const page = useRef<HTMLDivElement>(null);
  useSinkIn(page);
  useJellyScroll(page, ".prep-heading, .prep-list");
  const row$ = (id: string) =>
    page.current?.querySelector(`[data-task="${id}"]`);
  useLayoutEffect(() => {
    if (!fresh) return;
    const row = page.current?.querySelector(`[data-task="${fresh}"]`);
    row?.scrollIntoView?.({ block: "center" });
    void boing(row, "scale(.85)");
    setFresh("");
  }, [fresh]);
  // A 1人がやる task nobody has (or whose member left) is anyone's to take on.
  const open = (task: TravelTask) => !memberKeys.has(task.assignee);
  const tickable = (task: TravelTask) =>
    travel.canEdit &&
    (taskKindOf(task) === "each" || task.assignee === me || open(task));
  // As 1人が持つ: only the doer has a box; nobody has one until it is
  // decided, except an old task already ticked (so it can be unticked).
  const showsCheck = (task: TravelTask) =>
    taskKindOf(task) === "each" ||
    task.assignee === me ||
    (open(task) && task.done);
  const toggle = (task: TravelTask) => {
    travel.updateTask(task.id, { ...taskInput(task), done: !task.done });
    if (!task.done)
      requestAnimationFrame(() =>
        boing(row$(task.id)?.querySelector(".prep-box"), "scale(1.3)"),
      );
  };
  const takeOn = (task: TravelTask) => {
    travel.updateTask(task.id, { ...taskInput(task), assignee: me });
    requestAnimationFrame(() => {
      const row = row$(task.id);
      if (!row) return;
      void boing(row, "scale(.9)");
      bubble(
        row,
        others.length
          ? `${task.title}はあなたがやる。${others.length}人にもそう出ます`
          : `${task.title}はあなたがやる`,
      );
    });
  };
  const doer = (task: TravelTask) =>
    task.assignee === me
      ? "あなた"
      : assigneeName(task.assignee, travel.members);
  const row = (task: TravelTask) => {
    const kind = taskKindOf(task);
    let sub: ReactNode = <DueText task={task} today={today} />;
    let side: ReactNode = null;
    let take: ReactNode = null;
    if (kind === "each")
      side = (
        <OthersDone others={others} doneBy={task.doneBy ?? []} word="済み" />
      );
    else if (open(task)) {
      sub = (
        <>
          まだ決めていない · <DueText task={task} today={today} />
        </>
      );
      if (!task.done && travel.canEdit && self)
        take = (
          <button
            type="button"
            className="prep-take"
            data-haptic
            onClick={() => takeOn(task)}
          >
            自分がやる
          </button>
        );
    } else
      sub = (
        <>
          <AssigneeAvatar value={task.assignee} members={travel.members} />
          {doer(task)}がやる ·{" "}
          {task.assignee !== me && task.done ? (
            "済み"
          ) : (
            <DueText task={task} today={today} />
          )}
        </>
      );
    return (
      <TaskRow
        key={task.id}
        task={task}
        sub={sub}
        side={side}
        take={take}
        showCheck={showsCheck(task)}
        tickable={tickable(task)}
        canEdit={travel.canEdit}
        onToggle={() => toggle(task)}
        onEdit={() => setSheet({ task })}
      />
    );
  };
  return (
    <div className="page prep-page" ref={page}>
      <PrepHeader
        title="やること"
        addLabel="やることを追加"
        onAdd={travel.canEdit ? () => setSheet({}) : undefined}
      />
      {(["each", "one"] as const).map((kind) => {
        const tasks = travel.tasks
          .filter((task) => taskKindOf(task) === kind)
          .sort(byDue);
        return (
          <section key={kind} aria-label={taskKinds[kind][0]}>
            <div className="prep-heading prep-kind-heading">
              <b>{taskKinds[kind][0]}</b>
              <span>
                {`${tasks.filter((task) => task.done).length} / ${tasks.length}`}
              </span>
            </div>
            <div className="prep-list" role="list" data-kind={kind}>
              {tasks.map(row)}
              {!tasks.length && <p className="prep-none">ありません</p>}
            </div>
          </section>
        );
      })}
      {sheet && (
        <TaskSheet
          task={sheet.task}
          self={self}
          onClose={() => setSheet(null)}
          onSaved={setFresh}
        />
      )}
    </div>
  );
}

function TaskSheet({
  task,
  self,
  onClose,
  onSaved,
}: {
  task?: TravelTask;
  self?: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { travel, members } = useTravellers();
  const formId = useId();
  const me = memberAssignee(self ?? "");
  const [title, setTitle] = useState(task?.title ?? "");
  const [due, setDue] = useState(task?.dueOn ?? "");
  // Most tasks are one person's: a new one starts as yours.
  const [kind, setKind] = useState<TaskKind>(task ? taskKindOf(task) : "one");
  // KEEP: the task stays on someone outside the list (a member who left).
  const current =
    task && members.find((m) => memberAssignee(m.id) === task.assignee);
  const kept = task?.assignee && !current ? task.assignee : "";
  const [who, setWho] = useState(
    task ? (current?.id ?? (kept ? KEEP : "")) : (self ?? ""),
  );
  const assignee =
    kind !== "one" ? "" : who === KEEP ? kept : who ? memberAssignee(who) : "";
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
        // Your own tick carries over between the kinds; a new doer starts
        // undone, and 全員がやる keeps each member's own tick.
        const before = taskKindOf(task);
        const done =
          kind === "each"
            ? before === "each"
              ? task.done
              : task.assignee === me && task.done
            : before === "each"
              ? assignee === me && task.done
              : assignee === task.assignee && task.done;
        travel.updateTask(task.id, {
          title: value,
          dueOn: due,
          assignee,
          done,
          kind,
        });
        dismissModal(() => {
          onClose();
          onSaved(task.id);
        });
        return;
      }
      const id = travel.createTask({
        title: value,
        dueOn: due,
        assignee,
        done: false,
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
        <div
          className="prep-kinds"
          role="radiogroup"
          aria-label="やることの種類"
        >
          {(Object.keys(taskKinds) as TaskKind[]).map((value) => (
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
              <b>{taskKinds[value][0]}</b>
              <small>{taskKinds[value][1]}</small>
            </button>
          ))}
        </div>
        <Reveal open={kind === "one"}>
          <WhoPicker
            id={`${formId}-who`}
            label="誰がやる"
            who={who}
            kept={kept}
            onPick={setWho}
          />
        </Reveal>
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
  each: ["全員が持つ", "全員の一覧に出る。チェックは自分の分だけ"],
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

/** A 持ち物 row, as a やること row: the name edits, the box ticks. */
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
  const done = showCheck && item.packed;
  return (
    <div
      role="listitem"
      data-item={item.id}
      className={`prep-row prep-item${done ? " is-done" : ""}${tickable ? "" : " is-readonly"}`}
    >
      <button
        type="button"
        className="prep-row-main"
        aria-label={`${item.name}を編集`}
        disabled={!onEdit}
        onClick={onEdit}
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
      </button>
      {take}
      {showCheck && (
        <Check
          label={
            tickable
              ? `${item.name}を${item.packed ? "まだにする" : "入れた"}`
              : item.name
          }
          checked={item.packed}
          tickable={tickable}
          onToggle={onToggle}
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
        <OthersDone
          others={others}
          doneBy={item.packedBy ?? []}
          word="入れた"
        />
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
const CLIP_ROWS = "inset(0 -40px)";

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
    el.style.clipPath = CLIP_ROWS;
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
    // Clip only top and bottom: the chips overshoot as they pop, and
    // overflow: hidden cut the first one's left edge (Tsubasa 2026-10-07).
    el.style.clipPath = CLIP_ROWS;
    void spring(
      el,
      [{ height: "0px" }, { height: `${el.offsetHeight}px` }],
      "soft",
    ).then(() => {
      el.style.clipPath = "";
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

/** 誰が持つ / 誰がやる: the members, an old carrier kept as is, or nobody yet. */
function WhoPicker({
  id,
  label: heading,
  who,
  kept,
  onPick,
}: {
  id: string;
  label: string;
  who: string;
  kept: string;
  onPick: (who: string) => void;
}) {
  const { travel, members, label } = useTravellers();
  const chip = (value: string, children: ReactNode, className?: string) => (
    <button
      type="button"
      role="radio"
      key={value || "none"}
      className={className}
      aria-checked={who === value}
      onClick={(event) => {
        onPick(value);
        void boing(event.currentTarget, "scale(.9)");
      }}
    >
      {children}
    </button>
  );
  return (
    <>
      <span className="prep-label" id={id}>
        {heading}
      </span>
      <div className="prep-whos" role="radiogroup" aria-labelledby={id}>
        {members.map((member) =>
          chip(
            member.id,
            <>
              <AssigneeAvatar
                value={memberAssignee(member.id)}
                members={travel.members}
              />
              {label(member)}
            </>,
          ),
        )}
        {kept &&
          chip(
            KEEP,
            <>
              <AssigneeAvatar value={kept} members={travel.members} />
              {kept.startsWith("member:") ? "元メンバー" : kept}
            </>,
          )}
        {chip("", "まだ決めない", "prep-who-none")}
      </div>
    </>
  );
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
  const { travel, members } = useTravellers();
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
          <WhoPicker
            id={`${formId}-who`}
            label="誰が持つ"
            who={who}
            kept={kept}
            onPick={setWho}
          />
        </Reveal>
      </form>
    </PrepSheet>
  );
}
