import { useEffect, useState } from 'react';
import type { ViewStyle } from 'react-native';
import { observeWebViewport, readWebViewport } from '@/utils/web-viewport';

export function useModalViewport(visible = true): ViewStyle | undefined {
  const [viewport, setViewport] = useState<ViewStyle>();
  useEffect(() => {
    if (!visible) return;
    return observeWebViewport(() => setViewport({ position: 'absolute', ...readWebViewport() }));
  }, [visible]);
  return viewport;
}
