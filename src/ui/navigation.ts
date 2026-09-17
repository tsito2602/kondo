import type { Href } from 'expo-router';
import { useMemo } from 'react';

import { useUiEmitter } from './mediator';

export type UiRouteParams = Record<string, string | undefined>;

export function useUiNavigation() {
  const emit = useUiEmitter('Navigation');
  return useMemo(() => ({
    push: (href: Href) => emit<void>({ type: 'navigation.push', payload: [href] }),
    replace: (href: Href) => emit<void>({ type: 'navigation.replace', payload: [href] }),
    setParams: (params: UiRouteParams) => emit<void>({ type: 'navigation.setParams', payload: [params] }),
    backOrReplace: (fallback: Href = '/') => emit<void>({ type: 'navigation.backOrReplace', payload: [fallback] }),
  }), [emit]);
}
