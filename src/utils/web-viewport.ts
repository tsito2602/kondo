export function readWebViewport() {
  const visual = window.visualViewport;
  const height = Math.max(window.innerHeight, document.documentElement.clientHeight);
  // Use the visual viewport only for the keyboard or pinch zoom. Small Safari
  // toolbar/safe-area discrepancies must not leave a permanent strip below UI.
  const constrained = visual && (visual.scale !== 1 || height - visual.height > 120);
  return {
    top: constrained ? visual.offsetTop : 0,
    left: constrained ? visual.offsetLeft : 0,
    width: constrained ? visual.width : window.innerWidth,
    height: constrained ? visual.height : height,
  };
}

export function observeWebViewport(update: () => void) {
  const visual = window.visualViewport;
  let frame = 0;
  let settled = 0;
  const refresh = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
    // Safari can report the old size on the first keyboard-dismiss/restore frame.
    window.clearTimeout(settled);
    settled = window.setTimeout(update, 300);
  };
  refresh();
  visual?.addEventListener('resize', refresh);
  visual?.addEventListener('scroll', refresh);
  window.addEventListener('resize', refresh);
  window.addEventListener('pageshow', refresh);
  document.addEventListener('visibilitychange', refresh);
  return () => {
    cancelAnimationFrame(frame);
    window.clearTimeout(settled);
    visual?.removeEventListener('resize', refresh);
    visual?.removeEventListener('scroll', refresh);
    window.removeEventListener('resize', refresh);
    window.removeEventListener('pageshow', refresh);
    document.removeEventListener('visibilitychange', refresh);
  };
}
