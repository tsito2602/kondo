import { usePalette } from '@/theme/theme-provider';
export function useTheme() {
  const palette = usePalette();
  return { text: palette.ink, background: palette.canvas, backgroundElement: palette.paper, backgroundSelected: palette.sky, textSecondary: palette.slate };
}
