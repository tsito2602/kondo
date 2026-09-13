import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import type { PlaceStatus } from '@/data/types';
import { useAppTheme } from '@/theme/theme-provider';

const icons: Record<PlaceStatus, ComponentProps<typeof SymbolView>['name']> = {
  want: { ios: 'heart.fill', android: 'favorite', web: 'favorite' },
  planned: { ios: 'calendar', android: 'event', web: 'event' },
  visited: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' },
  skipped: { ios: 'minus.circle', android: 'do_not_disturb_on', web: 'do_not_disturb_on' },
};

export function PlaceStatusIcon({ status, size = 18 }: { status: PlaceStatus; size?: number }) {
  const { palette, scheme } = useAppTheme();
  const colors: Record<PlaceStatus, string> = {
    want: scheme === 'dark' ? '#E8A6B4' : '#AE536D',
    planned: palette.ocean,
    visited: scheme === 'dark' ? '#8CC7A7' : '#38785A',
    skipped: palette.smoke,
  };
  return <SymbolView name={icons[status]} size={size} tintColor={colors[status]} />;
}
