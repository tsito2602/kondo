import { useEffect, useState } from 'react';
import type { ViewStyle } from 'react-native';
import { modalViewportBounds } from '@/utils/modal-viewport-insets.web';

// iOS can resize/pan the visual viewport for its keyboard without resizing the
// layout viewport used by React Native Web's Modal portal. Browser chrome and
// standalone safe areas can also make visualViewport slightly shorter, so only
// bind the modal to it when the difference is large enough to be a keyboard.
export function useModalViewport(visible = true): ViewStyle | undefined {
  const [viewport, setViewport] = useState<ViewStyle>();
  useEffect(() => {
    if (!visible) return;
    const visual = window.visualViewport;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bounds = modalViewportBounds(window.innerWidth, window.innerHeight, visual);
        setViewport(bounds ? { position: 'absolute', ...bounds } : undefined);
      });
    };
    update();
    visual?.addEventListener('resize', update);
    visual?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      visual?.removeEventListener('resize', update);
      visual?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [visible]);
  return viewport;
}
