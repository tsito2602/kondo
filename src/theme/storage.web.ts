import { THEME_KEY, type ThemePreference } from './preferences';
export const readTheme = async () => localStorage.getItem(THEME_KEY);
export const writeTheme = async (value: ThemePreference) => localStorage.setItem(THEME_KEY, value);
