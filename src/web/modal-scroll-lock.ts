import { guardModalKeyboardFocus } from "./modal-keyboard";

const locks = new WeakMap<Document, { count: number; restore: () => void }>();

/** Nested/replaced dialogs share one page lock and restore the original offset. */
export function lockModalPage(doc: Document = document) {
  let lock = locks.get(doc);
  if (!lock) {
    const view = doc.defaultView!;
    const body = doc.body,
      root = doc.documentElement;
    const x = view.scrollX,
      y = view.scrollY;
    const styles = [
      [
        body,
        ["overflow", "position", "top", "left", "right", "overscroll-behavior"],
      ],
      [root, ["overflow", "overscroll-behavior"]],
    ] as const;
    const restoreStyles = styles.flatMap(([element, keys]) =>
      keys.map((key) => {
        const value = element.style.getPropertyValue(key),
          priority = element.style.getPropertyPriority(key);
        return () =>
          value
            ? element.style.setProperty(key, value, priority)
            : element.style.removeProperty(key);
      }),
    );
    // overflow:hidden alone does not prevent iOS keyboard focus from panning.
    Object.assign(body.style, {
      overflow: "hidden",
      position: "fixed",
      top: `${-y}px`,
      left: "0px",
      right: "0px",
      overscrollBehavior: "none",
    });
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    const releaseKeyboard = guardModalKeyboardFocus(doc);
    lock = {
      count: 0,
      restore: () => {
        releaseKeyboard();
        restoreStyles.forEach((restore) => restore());
        if (view.scrollX !== x || view.scrollY !== y)
          view.scrollTo({ left: x, top: y, behavior: "instant" });
      },
    };
    locks.set(doc, lock);
  }
  lock.count++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--lock.count === 0) {
      lock.restore();
      locks.delete(doc);
    }
  };
}
