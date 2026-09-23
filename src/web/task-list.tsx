import { useLayoutEffect, useRef, useState } from "react";
import { Check, SquarePen } from "lucide-react";
import { reduceMotion } from "./motion";

type TaskRow = { id: string; title: string; meta: string; done: boolean };
/** Inspired by Rare UI's check → strike → reorder interaction; uses our own data and motion. */
export function TaskList({
  items,
  canEdit,
  onToggle,
  onEdit,
}: {
  items: TaskRow[];
  canEdit: boolean;
  onToggle: (id: string, done: boolean) => void;
  onEdit: (id: string) => void;
}) {
  const sorted = () =>
    [...items]
      .sort((a, b) => Number(a.done) - Number(b.done))
      .map((item) => item.id);
  const [order, setOrder] = useState(sorted);
  const list = useRef<HTMLDivElement>(null);
  const bounds = useRef(new Map<string, number>());
  const motions = useRef<Animation[]>([]);
  const signature = items.map((item) => `${item.id}:${item.done}`).join("|");
  const latest = useRef(items);
  latest.current = items;
  useLayoutEffect(() => {
    const timer = setTimeout(
      () => {
        setOrder(
          [...latest.current]
            .sort((a, b) => Number(a.done) - Number(b.done))
            .map((item) => item.id),
        );
      },
      reduceMotion() ? 0 : 240,
    );
    return () => clearTimeout(timer);
  }, [signature]);
  useLayoutEffect(() => {
    const rows = [
      ...(list.current?.querySelectorAll<HTMLElement>("[data-task-id]") ?? []),
    ];
    const next = new Map(
      rows.map((row) => [row.dataset.taskId!, row.offsetTop]),
    );
    motions.current.forEach((motion) => motion.cancel());
    motions.current = [];
    if (!reduceMotion())
      for (const row of rows) {
        const before = bounds.current.get(row.dataset.taskId!);
        const after = next.get(row.dataset.taskId!)!;
        if (before !== undefined && before !== after && row.animate)
          motions.current.push(
            row.animate(
              [
                { transform: `translateY(${before - after}px)` },
                { transform: "translateY(0)" },
              ],
              { duration: 320, easing: "cubic-bezier(.22,1,.36,1)" },
            ),
          );
      }
    bounds.current = next;
  }, [order, signature]);
  useLayoutEffect(
    () => () => motions.current.forEach((motion) => motion.cancel()),
    [],
  );
  const byId = new Map(items.map((item) => [item.id, item]));
  const visible = [
    ...order,
    ...items.filter((item) => !order.includes(item.id)).map((item) => item.id),
  ].flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  return (
    <div className="task-list" ref={list} role="list" aria-label="準備リスト">
      {visible.map((item) => (
        <div
          key={item.id}
          role="listitem"
          data-task-id={item.id}
          className={`task-row${item.done ? " is-done" : ""}`}
        >
          <button
            type="button"
            role="checkbox"
            aria-checked={item.done}
            aria-label={`${item.title}を${item.done ? "未完了" : "完了"}にする`}
            disabled={!canEdit}
            className="task-toggle"
            onClick={() => onToggle(item.id, !item.done)}
          >
            <span className="task-check" aria-hidden="true">
              <Check size={14} />
            </span>
            <span className="task-copy">
              <strong>
                <span>{item.title}</span>
              </strong>
              <small>{item.meta}</small>
            </span>
          </button>
          {canEdit && (
            <button
              type="button"
              className="task-edit"
              aria-label={`${item.title}の詳細を編集`}
              onClick={() => onEdit(item.id)}
            >
              <SquarePen size={18} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
