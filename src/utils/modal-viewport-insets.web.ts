/** Only subtract the part of the bottom safe area outside the visual viewport.
 * Focus alone does not mean a software keyboard is open (hardware keyboards,
 * a dismissed keyboard, or an underlying editor with a nested picker).
 */
export function modalBottomOcclusion(layoutHeight: number, visual: Pick<VisualViewport, 'height' | 'offsetTop' | 'scale'> | null) {
  if (!visual || Math.abs(visual.scale - 1) > .01) return 0;
  const gap = layoutHeight - visual.height - visual.offsetTop;
  return Number.isFinite(gap) ? Math.max(0, gap) : 0;
}

type ModalViewport = Pick<VisualViewport, 'height' | 'offsetTop' | 'offsetLeft' | 'width' | 'scale'>;
export type ModalViewportBounds = { top: number; left: number; width: number; height: number };

// Safari's browser chrome / standalone safe-area can make visualViewport a
// little shorter even with no keyboard. A software keyboard is materially
// larger; scale the cutoff down for short landscape viewports.
function keyboardOcclusionThreshold(layoutHeight: number) {
  return Math.min(160, Math.max(0, layoutHeight) * .2);
}

export function modalViewportBounds(layoutWidth: number, layoutHeight: number, visual: ModalViewport | null): ModalViewportBounds | null {
  if (!visual || modalBottomOcclusion(layoutHeight, visual) < keyboardOcclusionThreshold(layoutHeight)) return null;
  const { offsetTop: top, offsetLeft: left, width, height } = visual;
  if (![layoutWidth, top, left, width, height].every(Number.isFinite) || layoutWidth <= 0 || width <= 0 || height <= 0) return null;
  return { top, left, width, height };
}

/** Scoped to a mounted modal; never changes another modal's insets or focus. */
export function trackModalViewportInsets(root: HTMLElement) {
  const win = root.ownerDocument.defaultView;
  if (!win) return () => {};
  const visual = win.visualViewport;
  let frame = 0;
  const update = () => {
    frame = 0;
    root.style.setProperty('--modal-bottom-occlusion', `${modalBottomOcclusion(win.innerHeight, visual)}px`);
  };
  const schedule = () => { if (!frame) frame = win.requestAnimationFrame(update); };
  update();
  visual?.addEventListener('resize', schedule);
  visual?.addEventListener('scroll', schedule);
  win.addEventListener('resize', schedule);
  return () => {
    win.cancelAnimationFrame(frame);
    visual?.removeEventListener('resize', schedule);
    visual?.removeEventListener('scroll', schedule);
    win.removeEventListener('resize', schedule);
    root.style.removeProperty('--modal-bottom-occlusion');
  };
}
