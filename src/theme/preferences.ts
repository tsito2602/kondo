export type ThemePreference = 'system' | 'light' | 'dark';
export const THEME_KEY = 'tabi.theme';
export const normalizeThemePreference = (value: unknown): ThemePreference => value === 'light' || value === 'dark' ? value : 'system';
export const resolveTheme = (preference: ThemePreference, system: string | null | undefined): 'light' | 'dark' => preference === 'system' ? system === 'dark' ? 'dark' : 'light' : preference;
