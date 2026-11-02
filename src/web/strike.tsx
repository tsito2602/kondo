import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

type Line = { left: number; top: number; width: number };

/**
 * A row name with the rounded strike drawn through every line it wraps onto.
 * One absolutely placed ::after on an inline element only spans the first
 * fragment, so each wrapped line gets its own segment, measured from the text.
 * The segments are drawn one after another at an even pace (.32 s in all).
 */
export function StrikeName({ children }: { children: ReactNode }) {
  const nameRef = useRef<HTMLElement>(null);
  const [lines, setLines] = useState<Line[]>([]);

  useLayoutEffect(() => {
    const name = nameRef.current;
    const box = name?.parentElement;
    if (!name || !box) return;
    const measure = () => {
      const frame = box.getBoundingClientRect();
      // Panels and the jelly scroll can scale an ancestor, and not always
      // evenly; work in layout px on each axis.
      const sx = box.offsetWidth ? frame.width / box.offsetWidth : 1;
      const sy = box.offsetHeight ? frame.height / box.offsetHeight : 1;
      if (!sx || !sy) return;
      const range = document.createRange();
      range.selectNodeContents(name);
      const rows: {
        top: number;
        bottom: number;
        left: number;
        right: number;
      }[] = [];
      for (const r of Array.from(range.getClientRects())) {
        if (r.width < 1) continue;
        const mid = (r.top + r.bottom) / 2;
        const row = rows.find((o) => mid > o.top && mid < o.bottom);
        if (row) {
          row.left = Math.min(row.left, r.left);
          row.right = Math.max(row.right, r.right);
          row.top = Math.min(row.top, r.top);
          row.bottom = Math.max(row.bottom, r.bottom);
        } else {
          rows.push({
            top: r.top,
            bottom: r.bottom,
            left: r.left,
            right: r.right,
          });
        }
      }
      rows.sort((a, b) => a.top - b.top);
      const next = rows.map((o) => ({
        left: Math.round(((o.left - frame.left) / sx) * 10) / 10,
        top:
          Math.round(
            ((o.top + (o.bottom - o.top) * 0.52 - frame.top) / sy) * 10,
          ) / 10,
        width: Math.round(((o.right - o.left) / sx) * 10) / 10,
      }));
      setLines((prev) =>
        prev.length === next.length &&
        prev.every(
          (p, i) =>
            p.left === next[i].left &&
            p.top === next[i].top &&
            p.width === next[i].width,
        )
          ? prev
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(name);
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) measure();
    });
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [children]);

  const total = lines.reduce((sum, l) => sum + l.width, 0) || 1;
  let before = 0;
  return (
    <>
      <b ref={nameRef}>{children}</b>
      {lines.map((line, i) => {
        const share = line.width / total;
        const style = {
          left: line.left - 2,
          top: line.top,
          width: line.width + 4,
          "--strike-dur": `${(0.32 * share).toFixed(3)}s`,
          "--strike-delay": `${(0.32 * before).toFixed(3)}s`,
          "--strike-ease": lines.length > 1 ? "linear" : "ease",
          "--strike-back": `${Math.max(0, 0.32 * (1 - before - share)).toFixed(3)}s`,
        } as CSSProperties;
        before += share;
        return (
          <i key={i} className="prep-strike" aria-hidden="true" style={style} />
        );
      })}
    </>
  );
}
