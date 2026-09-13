import { useAppTheme } from '@/theme/theme-provider';
export function useColorScheme() { return useAppTheme().scheme; }
