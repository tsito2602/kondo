import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  BatteryCharging,
  BookOpen,
  BookUser,
  Camera,
  Check,
  Coins,
  Droplets,
  FileText,
  Footprints,
  Glasses,
  Lock,
  Package,
  Pill,
  Plug,
  Plus,
  Shirt,
  Smartphone,
  Trash2,
  Umbrella,
  Wallet,
  type LucideIcon,
} from "lucide-react";
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
import { dismissModal, reduceMotion } from "./motion";
import { ErrorText, Modal, useToast } from "./ui";

/* ---------- motion: uchiwake's springs (squish k520/d20, boing k420/d14) ---------- */

const springs = { squish: { k: 520, d: 20 }, boing: { k: 420, d: 14 } };
type SpringName = keyof typeof springs;
const springCache = new Map<SpringName, { easing: string; ms: number }>();
function springTiming(name: SpringName) {
  const cached = springCache.get(name);
  if (cached) return cached;
  const { k, d } = springs[name];
  const values = [0];
  let x = 0,
    v = 0,
    t = 0;
  const dt = 1 / 120;
  while (t < 2) {
    v += (-k * (x - 1) - d * v) * dt;
    x += v * dt;
    t += dt;
    values.push(x);
    if (Math.abs(x - 1) < 0.0008 && Math.abs(v) < 0.01) break;
  }
  values[values.length - 1] = 1;
  const step = Math.max(1, Math.floor(values.length / 64));
  let linear = false;
  try {
    linear = CSS.supports("transition-timing-function", "linear(0, 1)");
  } catch {
    linear = false;
  }
  const timing = {
    easing: linear
      ? `linear(${values
          .filter(
            (_, index) => index % step === 0 || index === values.length - 1,
          )
          .map((value) => +value.toFixed(4))
          .join(",")})`
      : "cubic-bezier(.34,1.56,.64,1)",
    ms: Math.round(t * 1000),
  };
  springCache.set(name, timing);
  return timing;
}
function spring(
  element: Element | null | undefined,
  frames: Keyframe[],
  name: SpringName = "boing",
) {
  if (!element || reduceMotion() || typeof element.animate !== "function")
    return;
  const { easing, ms } = springTiming(name);
  element.animate(frames, { duration: ms, easing });
}
const pop = (element: Element | null | undefined, from = 0.85) =>
  spring(element, [{ transform: `scale(${from})` }, { transform: "none" }]);

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
  const today = localDate();
  const left = selectedTrip ? daysBetween(today, selectedTrip.startsOn) : 0;
  return (
    <div className="prep-top">
      <div>
        {left > 0 && <small>出発まであと{left}日</small>}
        <h2>{title}</h2>
      </div>
      {onAdd && (
        <button
          type="button"
          className="prep-plus"
          aria-label={addLabel}
          onClick={onAdd}
        >
          <Plus size={20} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function CheckBox({
  checked,
  label,
  disabled,
  onToggle,
}: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      className="prep-check"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-haptic
      onClick={(event) => {
        onToggle?.();
        pop(event.currentTarget.firstElementChild, checked ? 0.85 : 1.3);
      }}
    >
      <span className="prep-box" aria-hidden="true">
        <Check size={16} strokeWidth={3.2} />
      </span>
    </button>
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
  children,
}: {
  title: string;
  primary: string;
  formId: string;
  onClose: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
  children: ReactNode;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      dockActions={{
        backLabel: "やめる",
        primary: (
          <button type="submit" className="prep-primary" form={formId}>
            <Check size={18} aria-hidden="true" />
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
  drawn,
  onSelect,
}: {
  ring: Ring;
  selected: boolean;
  members: TripMember[];
  drawn: boolean;
  onSelect: () => void;
}) {
  const done = ring.tasks.filter((task) => task.done).length;
  const total = ring.tasks.length;
  const fraction = total ? done / total : 0;
  const circumference = 2 * Math.PI * 40;
  const closed = total > 0 && done === total;
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
            strokeDashoffset={
              drawn ? circumference * (1 - fraction) : circumference
            }
            opacity={fraction ? 1 : 0}
          />
        </svg>
        {ring.key === UNASSIGNED ? (
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

export function TasksScreen() {
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
  // Tasks from older versions may have nobody (or a departed member) on them.
  const loose = travel.tasks.filter((task) => !memberKeys.has(task.assignee));
  if (loose.length)
    rings.push({
      key: UNASSIGNED,
      label: "担当なし",
      assignee: "",
      tasks: loose,
    });
  const [chosen, setChosen] = useState(self ?? "");
  const ring =
    rings.find((entry) => entry.key === chosen) ?? rings[0] ?? undefined;
  const [sheet, setSheet] = useState<{ task?: TravelTask } | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  const [drawn, setDrawn] = useState(reduceMotion());
  const page = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  useLayoutEffect(() => {
    if (!fresh.length) return;
    const root = page.current;
    for (const id of fresh) {
      const row = root?.querySelector(`[data-task="${id}"]`);
      row?.scrollIntoView?.({ block: "center" });
      pop(row);
    }
    for (const key of new Set(
      travel.tasks
        .filter((task) => fresh.includes(task.id))
        .map((task) => task.assignee.slice(7)),
    ))
      pop(root?.querySelector(`[data-ring="${key}"] .prep-ring-view`), 0.86);
    setFresh([]);
  }, [fresh]);
  const mine = ring?.key === self;
  const tickable = (task: TravelTask) =>
    travel.canEdit &&
    (task.assignee === memberAssignee(self ?? "") ||
      !memberKeys.has(task.assignee));
  const toggle = (task: TravelTask) => {
    const { id, title, dueOn, assignee, done } = task;
    travel.updateTask(id, { title, dueOn, assignee, done: !done });
    pop(
      page.current?.querySelector(`[data-ring="${ring?.key}"] .prep-ring-view`),
      1.12,
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
                drawn={drawn}
                onSelect={() => setChosen(entry.key)}
              />
            ))}
          </div>
          {ring && (
            <>
              <div className="prep-heading">
                <b>
                  {mine
                    ? "あなたのやること"
                    : ring.key === UNASSIGNED
                      ? "担当なしのやること"
                      : `${ring.label}のやること`}
                </b>
                {travel.canEdit && ring.tasks.length > 0 && (
                  <span>
                    {mine
                      ? "押すとリングが閉じていく"
                      : ring.key === UNASSIGNED
                        ? "誰でもチェックできる"
                        : "見るだけ（チェックは本人）"}
                  </span>
                )}
              </div>
              <div
                className="prep-list"
                role="list"
                aria-label={`${ring.label}のやること`}
              >
                {[...ring.tasks].sort(byDue).map((task) => (
                  <div
                    key={task.id}
                    role="listitem"
                    data-task={task.id}
                    className={`prep-row${task.done ? " is-done" : ""}${tickable(task) ? "" : " is-readonly"}`}
                  >
                    <button
                      type="button"
                      className="prep-row-main"
                      disabled={!travel.canEdit}
                      aria-label={`${task.title}を直す`}
                      onClick={() => setSheet({ task })}
                    >
                      <b>{task.title}</b>
                      <small>
                        <DueText task={task} today={today} />
                      </small>
                    </button>
                    <CheckBox
                      checked={task.done}
                      disabled={!tickable(task)}
                      label={
                        tickable(task)
                          ? `${task.title}を${task.done ? "未完了" : "完了"}にする`
                          : `${task.title}（${task.done ? "済み" : "まだ"}）`
                      }
                      onToggle={() => toggle(task)}
                    />
                  </div>
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
          onSaved={(ids, who) => {
            if (who !== "all" && who) setChosen(who);
            setFresh(ids);
          }}
        />
      )}
    </div>
  );
}

function MonthCalendar({
  value,
  onChange,
}: {
  value: string;
  onChange: (day: string) => void;
}) {
  const { selectedTrip } = useTravel();
  const today = localDate();
  const [month, setMonth] = useState((value || today).slice(0, 7));
  const year = +month.slice(0, 4);
  const index = +month.slice(5) - 1;
  const first = new Date(year, index, 1).getDay();
  const count = new Date(year, index + 1, 0).getDate();
  const shift = (step: number) => {
    const date = new Date(year, index + step, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  };
  const prev = shift(-1);
  const start = selectedTrip?.startsOn ?? "";
  const end = selectedTrip?.endsOn ?? "";
  return (
    <div className="prep-cal">
      <div className="prep-cal-head">
        <button
          type="button"
          aria-label="前の月"
          disabled={prev < today.slice(0, 7)}
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
          onClick={() => setMonth(shift(1))}
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
          const trip = start && day >= start && day <= end;
          const note = day === start ? "出発" : day === today ? "今日" : "";
          return (
            <button
              type="button"
              key={day}
              data-day={day}
              className={[
                day === today ? "is-today" : "",
                trip ? "is-trip" : "",
                day === start ? "is-first" : "",
                day === end ? "is-last" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={day < today}
              aria-pressed={value === day}
              aria-label={`${+day.slice(5, 7)}月${offset + 1}日（${weekday(day)}）${note ? ` ${note}` : ""}${trip && !note ? " 旅行中" : ""}`}
              onClick={(event) => {
                onChange(day);
                pop(event.currentTarget, 0.9);
              }}
            >
              {offset + 1}
              {note && <small aria-hidden="true">{note}</small>}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="prep-cal-none"
        aria-pressed={!value}
        onClick={() => onChange("")}
      >
        期限なし
      </button>
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
  onSaved: (ids: string[], who: string) => void;
}) {
  const { travel, members, label } = useTravellers();
  const formId = useId();
  const [title, setTitle] = useState(task?.title ?? "");
  const [due, setDue] = useState(task?.dueOn ?? "");
  const initialWho = task
    ? task.assignee.startsWith("member:")
      ? task.assignee.slice(7)
      : ""
    : defaultWho;
  const [who, setWho] = useState(initialWho);
  const [error, setError] = useState("");
  const name = useRef<HTMLInputElement>(null);
  const save = (event: FormEvent) => {
    event.preventDefault();
    const value = title.trim();
    if (!value) {
      setError("やることの名前を入れてください");
      spring(name.current, [
        { transform: "translateX(-8px)" },
        { transform: "none" },
      ]);
      name.current?.focus();
      return;
    }
    try {
      if (task) {
        travel.updateTask(task.id, {
          title: value,
          dueOn: due,
          assignee: who ? memberAssignee(who) : task.assignee,
          done: task.done,
        });
        dismissModal(() => {
          onClose();
          onSaved([task.id], who);
        });
        return;
      }
      const people = who === "all" ? members.map((member) => member.id) : [who];
      const ids = people.map((person) =>
        travel.createTask({
          title: value,
          dueOn: due,
          assignee: person ? memberAssignee(person) : "",
          done: false,
        }),
      );
      dismissModal(() => {
        onClose();
        onSaved(ids, who);
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存できませんでした");
    }
  };
  const remove = () => {
    if (!task || !confirm(`「${task.title}」を削除しますか？`)) return;
    travel.deleteTask(task.id);
    dismissModal(onClose);
  };
  return (
    <PrepSheet
      title={task ? "やることを直す" : "やることを追加"}
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
          placeholder="やること（例：国際免許をとる）"
          maxLength={160}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setError("");
          }}
        />
        <ErrorText message={error} />
        <span className="prep-label">
          期限 · {due ? `${monthDay(due)}（${weekday(due)}）` : "期限なし"}
        </span>
        <MonthCalendar value={due} onChange={setDue} />
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
                pop(event.currentTarget, 0.9);
              }}
            >
              <AssigneeAvatar
                value={memberAssignee(member.id)}
                members={travel.members}
              />
              {label(member)}
            </button>
          ))}
          {!task && members.length > 1 && (
            <button
              type="button"
              className="prep-who-all"
              aria-pressed={who === "all"}
              onClick={(event) => {
                setWho("all");
                pop(event.currentTarget, 0.9);
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

const kinds: Record<PackingKind, [string, string]> = {
  each: ["みんな各自", "全員のリストに出る。チェックは自分の分だけ"],
  one: [
    "1つでいい",
    "誰かが「私が持つ」で取る。全員のリストに「○○が持つ」と出る",
  ],
  mine: ["自分だけ", "あなたのリストにだけ出る。ほかの人には見えない"],
};
const kindOf = (item: PackingItem): PackingKind => item.kind ?? "one";

/** What the thing is, read from its name or category; a plain bag otherwise. */
const pictures: [RegExp, LucideIcon][] = [
  [/パスポート|旅券/, BookUser],
  [/バッテリー|充電/, BatteryCharging],
  [/プラグ|変換|アダプタ/, Plug],
  [/薬/, Pill],
  [/カメラ/, Camera],
  [/服|着替え|シャツ|上着|ジャケット|下着|衣類/, Shirt],
  [/歯ブラシ|洗面|シャンプー|化粧/, Droplets],
  [/傘/, Umbrella],
  [/本|ガイド/, BookOpen],
  [/小銭|硬貨|コイン/, Coins],
  [/財布|現金|お金|カード/, Wallet],
  [/コンタクト|眼鏡|メガネ|サングラス/, Glasses],
  [/スマホ|携帯|eSIM|電子機器/i, Smartphone],
  [/靴/, Footprints],
  [/書類|チケット|免許|保険/, FileText],
];
function PackingPicture({ item }: { item: PackingItem }) {
  const Icon =
    pictures.find(([pattern]) => pattern.test(item.name))?.[1] ??
    pictures.find(([pattern]) => pattern.test(item.category))?.[1] ??
    Package;
  return <Icon size={28} strokeWidth={1.8} aria-hidden="true" />;
}

const packingInput = (item: PackingItem) => ({
  name: item.name,
  category: item.category,
  quantity: item.quantity,
  packed: item.packed,
  assignee: item.assignee ?? "",
  shared: item.shared ?? false,
  kind: kindOf(item),
});

export function PackingScreen() {
  const { travel, self, members, label } = useTravellers();
  const notify = useToast();
  const [sheet, setSheet] = useState<{ item?: PackingItem } | null>(null);
  const [fresh, setFresh] = useState("");
  const page = useRef<HTMLDivElement>(null);
  const me = memberAssignee(self ?? "");
  useLayoutEffect(() => {
    if (!fresh) return;
    const row = page.current?.querySelector(`[data-item="${fresh}"]`);
    row?.scrollIntoView?.({ block: "center" });
    pop(row);
    setFresh("");
  }, [fresh]);
  const others = members.filter((member) => member.id !== self);
  // Only the one who took a 1つでいい item ticks it; an old free-text carrier is anyone's.
  const tickable = (item: PackingItem) =>
    travel.canEdit &&
    (kindOf(item) !== "one" ||
      item.assignee === me ||
      Boolean(item.assignee && !item.assignee.startsWith("member:")));
  const toggle = (item: PackingItem) =>
    travel.updatePackingItem(item.id, {
      ...packingInput(item),
      packed: !item.packed,
    });
  const take = (item: PackingItem) => {
    travel.updatePackingItem(item.id, {
      ...packingInput(item),
      assignee: me,
      shared: true,
      packed: false,
    });
    requestAnimationFrame(() =>
      pop(page.current?.querySelector(`[data-item="${item.id}"]`), 0.9),
    );
    notify(
      others.length
        ? `${item.name}はあなたが持つ。${others.length}人にもそう出ます`
        : `${item.name}はあなたが持つ`,
    );
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
    let side: ReactNode = <span />;
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
      sub = item.assignee ? (
        <>
          <AssigneeAvatar value={item.assignee} members={travel.members} />
          {carrier(item)}が持つ
          {item.assignee !== me && item.packed ? " · 入れた" : ""}
        </>
      ) : (
        "まだ誰も持っていない"
      );
      if (!item.assignee && travel.canEdit && self)
        side = (
          <button
            type="button"
            className="prep-take"
            data-haptic
            onClick={() => take(item)}
          >
            私が持つ
          </button>
        );
    } else
      sub = (
        <>
          <Lock size={16} strokeWidth={2.2} aria-hidden="true" />
          ほかの人には見えない
        </>
      );
    const showCheck = kind !== "one" || canTick;
    return (
      <div
        key={item.id}
        role="listitem"
        data-item={item.id}
        className={`prep-item${showCheck && item.packed ? " is-done" : ""}`}
      >
        <button
          type="button"
          className="prep-item-picture"
          tabIndex={-1}
          aria-hidden="true"
          disabled={!edit}
          onClick={edit}
        >
          <PackingPicture item={item} />
        </button>
        <button
          type="button"
          className="prep-item-name"
          disabled={!edit}
          aria-label={edit ? `${item.name}を直す` : undefined}
          onClick={edit}
        >
          <b>{item.name}</b>
          {sub && <small>{sub}</small>}
        </button>
        {side}
        {showCheck ? (
          <CheckBox
            checked={item.packed}
            disabled={!canTick}
            label={`${item.name}を${item.packed ? "まだにする" : "入れた"}`}
            onToggle={() => toggle(item)}
          />
        ) : (
          <span />
        )}
      </div>
    );
  };
  return (
    <div className="page prep-page" ref={page}>
      <PrepHeader
        title="持ち物"
        addLabel="持ち物を追加"
        onAdd={travel.canEdit ? () => setSheet({}) : undefined}
      />
      {(["each", "one", "mine"] as const).map((kind) => {
        const items = travel.packingItems
          .filter((item) => kindOf(item) === kind)
          // Ticking must not move a row away from the finger.
          .sort(
            (a, b) =>
              a.name.localeCompare(b.name, "ja") || a.id.localeCompare(b.id),
          );
        const open = items.filter((item) => !item.assignee).length;
        return (
          <section key={kind} aria-label={kinds[kind][0]}>
            <div className="prep-heading">
              <b>{kinds[kind][0]}</b>
              <span>
                {kind === "one"
                  ? open
                    ? `まだ決まってない ${open}`
                    : items.length
                      ? "ぜんぶ決まった"
                      : ""
                  : `${items.filter((item) => item.packed).length} / ${items.length}`}
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
  const travel = useTravel();
  const formId = useId();
  const [name, setName] = useState(item?.name ?? "");
  const [kind, setKind] = useState<PackingKind>(item ? kindOf(item) : "each");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const save = (event: FormEvent) => {
    event.preventDefault();
    const value = name.trim();
    if (!value) {
      setError("名前を入れてください");
      spring(input.current, [
        { transform: "translateX(-8px)" },
        { transform: "none" },
      ]);
      input.current?.focus();
      return;
    }
    try {
      if (item) {
        const before = packingInput(item);
        const changed = before.kind !== kind;
        // A new kind starts fresh: nobody holds a 1つでいい item yet, and a
        // みんな各自 item keeps each member's own tick.
        travel.updatePackingItem(item.id, {
          ...before,
          name: value,
          kind,
          shared: kind === "one",
          assignee: changed ? "" : before.assignee,
          packed: !changed
            ? before.packed
            : kind === "each"
              ? Boolean(self && item.packedBy?.includes(self))
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
        category: "その他",
        quantity: 1,
        packed: false,
        assignee: "",
        shared: kind === "one",
        kind,
      });
      dismissModal(() => {
        onClose();
        onSaved(id);
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存できませんでした");
    }
  };
  const remove = () => {
    if (!item || !confirm(`「${item.name}」を削除しますか？`)) return;
    travel.deletePackingItem(item.id);
    dismissModal(onClose);
  };
  return (
    <PrepSheet
      title={item ? "持ち物を直す" : "持ち物を追加"}
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
          placeholder="名前（例：サングラス）"
          maxLength={120}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError("");
          }}
        />
        <ErrorText message={error} />
        <div className="prep-kinds" role="radiogroup" aria-label="持ち物の種類">
          {(Object.keys(kinds) as PackingKind[]).map((value) => (
            <button
              type="button"
              role="radio"
              key={value}
              aria-checked={kind === value}
              onClick={(event) => {
                setKind(value);
                spring(
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
      </form>
    </PrepSheet>
  );
}
