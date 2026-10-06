// A floating panel (Modal addPanel, 予約を追加's sheet) whose content would
// have to scroll takes the whole height instead (Tsubasa 2026-10-06:
// 「スクロールしなきゃいけないのは全画面のフローティングパネルにして欲しい」):
// its top just below the status bar, its bottom still right above the dock,
// the same inset and corners. Short content keeps the compact panel. The CSS
// keys off `data-tall` on `host`; this decides it, again whenever the content
// changes size (a detail turning into its edit form, a field appearing).

const RM = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const px = (value: string) => parseFloat(value) || 0;

/** The panel's content height, as if nothing limited it. */
function natural(panel: HTMLElement) {
  const style = getComputedStyle(panel);
  let height =
    px(style.paddingTop) +
    px(style.paddingBottom) +
    px(style.borderTopWidth) +
    px(style.borderBottomWidth);
  for (const child of panel.children) {
    if (!(child instanceof HTMLElement)) continue;
    const s = getComputedStyle(child);
    if (
      s.display === "none" ||
      s.position === "absolute" ||
      s.position === "fixed"
    )
      continue;
    height += child.offsetHeight + px(s.marginTop) + px(s.marginBottom);
  }
  // Room added under the content for the software keyboard is not content:
  // the keyboard alone never turns a panel tall.
  const inset = parseFloat(
    document.documentElement.style.getPropertyValue("--panel-keyboard-inset"),
  );
  return height - (Number.isFinite(inset) ? inset : 0);
}

export function watchPanelFit(host: HTMLElement, panel: HTMLElement) {
  let frame = 0;
  let first = true;
  const fit = () => {
    frame = 0;
    if (!host.isConnected || !panel.offsetParent) return;
    const was = host.dataset.tall === "true";
    const before = panel.offsetHeight;
    // The compact panel's height: its content, or its cap when that is less.
    if (was) delete host.dataset.tall;
    const compact = panel.offsetHeight;
    const tall = natural(panel) > compact + 1;
    if (tall) host.dataset.tall = "true";
    if (tall === was || first) {
      first = false;
      return;
    }
    // Grow or shrink from where it was, as the panel's own move.
    const after = panel.offsetHeight;
    if (!RM() && panel.animate && Math.abs(after - before) > 1)
      panel.animate([{ height: `${before}px` }, { height: `${after}px` }], {
        duration: 320,
        easing: "cubic-bezier(.32, 0, .2, 1)",
      });
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(fit);
  };
  fit();
  const sizes =
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(schedule);
  const observe = () => {
    if (!sizes) return;
    sizes.disconnect();
    for (const child of panel.children) sizes.observe(child);
    for (const child of panel.querySelectorAll(":scope > .modal-body > *"))
      sizes.observe(child);
  };
  observe();
  const tree =
    typeof MutationObserver === "undefined"
      ? undefined
      : new MutationObserver(() => {
          observe();
          schedule();
        });
  tree?.observe(panel, { childList: true, subtree: true });
  window.addEventListener("resize", schedule);
  return () => {
    cancelAnimationFrame(frame);
    sizes?.disconnect();
    tree?.disconnect();
    window.removeEventListener("resize", schedule);
  };
}
