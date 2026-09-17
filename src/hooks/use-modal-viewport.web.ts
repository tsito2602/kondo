import { useEffect, useState } from 'react';
import type { ViewStyle } from 'react-native';
import { modalViewportBounds } from '@/utils/modal-viewport-insets.web';

function hasEditableFocus() {
  const active = document.activeElement;
  return active instanceof Element && active.matches('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
}

// React Native Web's Modal portal does not reliably inherit a full-height flex
// containing block on iOS Safari/PWA. Keep it explicitly on the layout viewport
// while the keyboard is closed. Only switch to visualViewport when an editable
// control is actually focused and the geometry is large enough to be a keyboard.
export function useModalViewport(visible = true): ViewStyle | undefined {
  const [viewport, setViewport] = useState<ViewStyle>();
  useEffect(() => {
    if (!visible) return;
    const visual = window.visualViewport;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const visualBounds = hasEditableFocus()
          ? modalViewportBounds(window.innerWidth, window.innerHeight, visual)
          : null;
        const bounds = visualBounds ?? {
          top: 0,
          left: 0,
          width: window.innerWidth,
          height: window.innerHeight,
        };
        setViewport({ position: 'absolute', ...bounds });
      });
    };
    update();
    visual?.addEventListener('resize', update);
    visual?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      cancelAnimationFrame(frame);
      visual?.removeEventListener('resize', update);
      visual?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, [visible]);
  return viewport;
}
