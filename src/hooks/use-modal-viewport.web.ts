import { useEffect, useState } from 'react';
import type { ViewStyle } from 'react-native';

// iOS resizes/pans the visual viewport for its keyboard without resizing the
// layout viewport used by React Native Web's Modal portal.
export function useModalViewport(visible = true): ViewStyle | undefined {
  const [viewport, setViewport] = useState<ViewStyle>();
  useEffect(() => {
    if (!visible) return;
    const visual = window.visualViewport;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setViewport({
          position: 'absolute',
          top: visual?.offsetTop ?? 0,
          left: visual?.offsetLeft ?? 0,
          width: visual?.width ?? window.innerWidth,
          height: visual?.height ?? window.innerHeight,
        });
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
