/** Recede the live page around the viewport, without moving fixed controls or scroll. */
export function menuDepth(reduced: boolean, timing: KeyframeAnimationOptions) {
  const layers = Array.from(
    document.querySelectorAll<HTMLElement>(
      "#root > header, #root > .demo-banner, #main-content, body > .thumb-dock-host .thumb-dock",
    ),
  );
  const restore: (() => void)[] = [];
  const animations: Animation[] = [];
  const main = document.getElementById("main-content");
  // A transformed ancestor becomes the containing block of fixed descendants.
  // Preserve their screen coordinates before scaling the reading layer.
  if (main) {
    const bounds = main.getBoundingClientRect();
    const fixed = Array.from(
      main.querySelectorAll<HTMLElement>(
        ".floating-add, .page-toolbar .add-action",
      ),
    )
      .filter(
        (control) => window.getComputedStyle(control).position === "fixed",
      )
      .map((control) => ({ control, bounds: control.getBoundingClientRect() }));
    const position = main.style.position;
    main.style.position = "relative";
    restore.push(() => {
      main.style.position = position;
    });
    for (const { control, bounds: box } of fixed) {
      const style = control.getAttribute("style");
      Object.assign(control.style, {
        position: "absolute",
        top: `${box.top - bounds.top}px`,
        left: `${box.left - bounds.left}px`,
        right: "auto",
        bottom: "auto",
        width: `${box.width}px`,
        height: `${box.height}px`,
      });
      restore.push(() => {
        if (style === null) control.removeAttribute("style");
        else control.setAttribute("style", style);
      });
    }
  }
  for (const layer of layers) {
    const bounds = layer.getBoundingClientRect();
    const origin = `${window.innerWidth / 2 - bounds.left}px ${window.innerHeight / 2 - bounds.top}px`;
    if (reduced || !layer.animate) {
      const filter = layer.style.filter;
      layer.style.filter = "blur(6px)";
      restore.push(() => {
        layer.style.filter = filter;
      });
    } else {
      animations.push(
        layer.animate(
          [
            { scale: "1", filter: "blur(0px)", transformOrigin: origin },
            { scale: ".94", filter: "blur(6px)", transformOrigin: origin },
          ],
          timing,
        ),
      );
    }
  }
  return {
    reverse(time: CSSNumberish | null) {
      for (const motion of animations) {
        motion.currentTime = time;
        motion.playbackRate = -1;
        motion.play();
      }
    },
    cancel() {
      animations.forEach((motion) => motion.cancel());
      restore.reverse().forEach((reset) => reset());
    },
  };
}
