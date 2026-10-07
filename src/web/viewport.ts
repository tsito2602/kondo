import { modalEditor } from "./modal-keyboard";

/** Rubber-band scrolling and browser chrome are not keyboard occlusion. */
export function keyboardInset(
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
  // Native viewport panning is not a change in keyboard height. Subtracting
  // offsetTop here could remove the scroll space while a low field is focused.
  return Math.max(0, layoutHeight - viewport.height);
}

/** Reveal only inside the foreground panel; never pan the page behind it. */
export function revealModalField(focused: Element | null) {
  focused = modalEditor(focused);
  if (!(focused instanceof HTMLElement)) return;
  const panel = focused.closest<HTMLElement>(".modal-inner, .bk-sheet");
  const dialog = panel?.closest("dialog[open]:not(.closing)");
  if (!panel || !dialog || panel.closest("[inert]")) return;

  const bounds = panel.getBoundingClientRect();
  const header = panel.querySelector(".modal-header")?.getBoundingClientRect();
  const top =
    Math.max(
      bounds.top,
      header?.bottom ?? bounds.top,
      window.visualViewport?.offsetTop ?? 0,
    ) + 12;
  const dock = dialog.querySelector<HTMLElement>(
    ".thumb-dock-host:not([hidden])",
  );
  const dockBounds = dock?.getBoundingClientRect();
  const inset = keyboardInset(
    window.innerHeight,
    window.visualViewport,
    focused,
  );
  const bottom =
    Math.min(
      bounds.bottom,
      inset > 0
        ? (window.visualViewport?.height ?? window.innerHeight) +
            Math.max(0, window.visualViewport?.offsetTop ?? 0)
        : bounds.bottom,
      dockBounds && dockBounds.height > 0 ? dockBounds.top - 16 : bounds.bottom,
    ) - 12;
  if (bottom <= top) return;
  const input = focused.getBoundingClientRect();
  // Include the label when it fits, but keep a tall textarea's top visible.
  const field = focused.closest(".field")?.getBoundingClientRect();
  const start =
    field && input.bottom - field.top <= bottom - top ? field.top : input.top;
  const end = Math.min(input.bottom, start + bottom - top);
  const delta = start < top ? start - top : end > bottom ? end - bottom : 0;
  if (delta) panel.scrollTop += delta;
}
