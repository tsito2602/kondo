// Adapted from uchino's panel keyboard guard: prevent iOS native focus panning
// before revealing the editor inside the panel's own scroll container.
export function modalEditor(target: Element | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  if (!target.closest(".modal-inner") || target.closest("[inert]")) return null;
  const dialog = target.closest("dialog[open]:not(.closing)");
  if (
    !dialog ||
    dialog !== [...target.ownerDocument.querySelectorAll("dialog[open]")].at(-1)
  )
    return null;
  if (
    !target.matches("input, textarea, select, [contenteditable='true']") ||
    target.matches(
      ':disabled, [readonly], input[type="checkbox"], input[type="radio"], input[type="button"], input[type="submit"], input[type="reset"], input[type="range"], input[type="file"], input[type="color"], input[type="hidden"]',
    )
  )
    return null;
  return target;
}

export function guardModalKeyboardFocus(doc: Document): () => void {
  const view = doc.defaultView;
  if (!view) return () => {};
  const { userAgent, platform, maxTouchPoints } = view.navigator;
  if (
    !/iP(hone|ad|od)/.test(userAgent) &&
    !(platform === "MacIntel" && maxTouchPoints > 1)
  )
    return () => {};
  const editorFor = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return null;
    const editor = modalEditor(
      target.closest("label")?.control ??
        target.closest("input,textarea,[contenteditable='true']"),
    );
    // Do not intercept the browser's native date/time pickers.
    return editor &&
      !editor.matches(
        'select,input[type="date"],input[type="time"],input[type="datetime-local"],input[type="month"],input[type="week"]',
      )
      ? editor
      : null;
  };
  const shifted = new Map<
    HTMLElement,
    { frame: number; restore: () => void }
  >();
  const preventFocusPan = (editor: HTMLElement) => {
    if (shifted.has(editor)) return;
    const saved = ["transform", "transition"].map((key) => [
      key,
      editor.style.getPropertyValue(key),
      editor.style.getPropertyPriority(key),
    ]);
    const restore = () => {
      for (const [key, value, priority] of saved)
        if (value) editor.style.setProperty(key, value, priority);
        else editor.style.removeProperty(key);
      shifted.delete(editor);
    };
    // The control returns before paint. iOS does not center an offscreen input.
    editor.style.setProperty("transition", "none", "important");
    editor.style.setProperty("transform", "translateY(-10000px)", "important");
    shifted.set(editor, { restore, frame: requestAnimationFrame(restore) });
  };
  let tap: {
    id: number;
    x: number;
    y: number;
    time: number;
    editor: HTMLElement;
  } | null = null;
  const start = (event: TouchEvent) => {
    const editor = editorFor(event.target),
      touch = event.touches[0];
    tap =
      editor && event.touches.length === 1
        ? {
            id: touch.identifier,
            x: touch.clientX,
            y: touch.clientY,
            time: event.timeStamp,
            editor,
          }
        : null;
  };
  const move = (event: TouchEvent) => {
    if (!tap) return;
    const touch = Array.from(event.touches).find(
      (t) => t.identifier === tap!.id,
    );
    if (
      event.touches.length !== 1 ||
      !touch ||
      Math.hypot(touch.clientX - tap.x, touch.clientY - tap.y) > 10
    )
      tap = null;
  };
  const end = (event: TouchEvent) => {
    const current = tap;
    tap = null;
    if (
      !current ||
      event.touches.length ||
      event.timeStamp - current.time > 500 ||
      !event.cancelable ||
      event.defaultPrevented
    )
      return;
    const touch = Array.from(event.changedTouches).find(
      (t) => t.identifier === current.id,
    );
    if (
      !touch ||
      Math.hypot(touch.clientX - current.x, touch.clientY - current.y) > 10
    )
      return;
    const editor = editorFor(event.target);
    // Preserve native caret placement/selection when re-tapping the active field.
    if (!editor || editor !== current.editor || editor === doc.activeElement)
      return;
    event.preventDefault();
    preventFocusPan(editor);
    editor.focus({ preventScroll: true });
  };
  const cancel = () => {
    tap = null;
  };
  const focus = (event: FocusEvent) => {
    // Accessory-bar next/previous and hardware Tab do not fire touchend.
    const editor = editorFor(event.target);
    if (editor) preventFocusPan(editor);
  };
  const resetWindowScroll = () => {
    if (view.visualViewport && Math.abs(view.visualViewport.scale - 1) > 0.01)
      return;
    if (view.scrollX || view.scrollY)
      view.scrollTo({ left: 0, top: 0, behavior: "instant" });
  };
  resetWindowScroll();
  doc.addEventListener("touchstart", start, { capture: true, passive: true });
  doc.addEventListener("touchmove", move, { capture: true, passive: true });
  doc.addEventListener("touchend", end, { capture: true, passive: false });
  doc.addEventListener("touchcancel", cancel, true);
  doc.addEventListener("focus", focus, true);
  view.addEventListener("scroll", resetWindowScroll);
  return () => {
    doc.removeEventListener("touchstart", start, true);
    doc.removeEventListener("touchmove", move, true);
    doc.removeEventListener("touchend", end, true);
    doc.removeEventListener("touchcancel", cancel, true);
    doc.removeEventListener("focus", focus, true);
    view.removeEventListener("scroll", resetWindowScroll);
    for (const { frame, restore } of shifted.values()) {
      cancelAnimationFrame(frame);
      restore();
    }
  };
}
