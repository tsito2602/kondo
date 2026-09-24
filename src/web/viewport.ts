/** Rubber-band scrolling and browser chrome are not keyboard occlusion. */
export function dockKeyboardInset(
  layoutHeight: number,
  viewport: Pick<VisualViewport, "height" | "offsetTop" | "scale"> | null,
  focused: Element | null,
) {
  if (!viewport || Math.abs(viewport.scale - 1) > 0.01) return 0;
  const editable =
    focused instanceof HTMLElement &&
    (focused.isContentEditable ||
      (focused.matches("textarea, input") &&
        !focused.matches(
          ':disabled, [readonly], input[type="button"], input[type="submit"], input[type="reset"], input[type="checkbox"], input[type="radio"], input[type="range"], input[type="file"], input[type="color"], input[type="hidden"]',
        )));
  if (!editable || layoutHeight - viewport.height < 120) return 0;
  return Math.max(
    0,
    layoutHeight - viewport.height - Math.max(0, viewport.offsetTop),
  );
}

/** Reveal only inside the foreground panel; never pan the page behind it. */
export function revealModalField(focused: Element | null) {
  if (!(focused instanceof HTMLElement)) return;
  if (!focused.matches("input, textarea, select, [contenteditable='true']"))
    return;
  const panel = focused.closest<HTMLElement>(".modal-inner");
  const dialog = panel?.closest("dialog[open]:not(.closing)");
  if (!panel || !dialog || panel.closest("[inert]")) return;

  const bounds = panel.getBoundingClientRect();
  const header = panel.querySelector(".modal-header")?.getBoundingClientRect();
  const toolbar = focused.isContentEditable
    ? panel.querySelector(".note-toolbar")?.getBoundingClientRect()
    : undefined;
  const top =
    Math.max(
      bounds.top,
      header?.bottom ?? bounds.top,
      toolbar?.bottom ?? bounds.top,
    ) + 12;
  const bottom = bounds.bottom - 12;
  if (bottom <= top) return;
  let input = focused.getBoundingClientRect();
  // A rich note can be much taller than the viewport. Reveal its caret, not
  // the top of the whole document, when the software keyboard opens.
  const selection = window.getSelection();
  if (
    focused.isContentEditable &&
    selection?.focusNode &&
    focused.contains(selection.focusNode)
  ) {
    const caret = document.createRange();
    caret.setStart(selection.focusNode, selection.focusOffset);
    caret.collapse(true);
    const rect = caret.getBoundingClientRect();
    if (rect.height) input = rect;
  }
  // Include the label when it fits, but keep a tall textarea's top visible.
  const field = focused.closest(".field")?.getBoundingClientRect();
  const start =
    field && input.bottom - field.top <= bottom - top ? field.top : input.top;
  const end = Math.min(input.bottom, start + bottom - top);
  const delta = start < top ? start - top : end > bottom ? end - bottom : 0;
  if (delta) panel.scrollTop += delta;
}
