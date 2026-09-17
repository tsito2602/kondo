import { useMemo } from 'react';

import { AppThemeProvider, useAppTheme as useThemeService, useThemedStyles } from '../../theme/theme-provider';
import { useUiEmitterOptional } from '../mediator';

export { AppThemeProvider, useThemedStyles };

export function useAppTheme() {
  const service = useThemeService();
  const emit = useUiEmitterOptional();
  const setPreference = useMemo(() => emit
    ? (preference: Parameters<typeof service.setPreference>[0]) => emit<void>({ type: 'theme.setPreference', payload: [preference] })
    : null, [emit]);
  return useMemo(() => setPreference ? ({ ...service, setPreference } satisfies typeof service) : service, [service, setPreference]);
}

export function usePalette() {
  return useAppTheme().palette;
}
