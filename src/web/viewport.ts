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
