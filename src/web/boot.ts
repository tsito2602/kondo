/** Hand off the original HTML splash without remounting/replaying its SVG. */
export function finishBootScreen() {
  const screen = document.getElementById("initial-boot");
  const root = document.getElementById("root");
  if (!screen) return;
  let cancelled = false;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const remove = () => {
    if (cancelled) return;
    screen.remove();
    root?.removeAttribute("inert");
  };
  const dismiss = async () => {
    // Finished animations may already have elapsed while the app was loading.
    // allSettled also releases the gate if a preference change cancels them.
    if (!motion.matches)
      await Promise.allSettled(
        Array.from(screen.getAnimations({ subtree: true }), (a) => a.finished),
      );
    if (cancelled) return;
    if (!motion.matches) {
      screen.classList.add("boot-leaving");
      await Promise.allSettled(screen.getAnimations().map((a) => a.finished));
    }
    remove();
  };
  void dismiss();
  return () => {
    cancelled = true;
    screen.classList.remove("boot-leaving");
  };
}
