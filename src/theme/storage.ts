import * as SecureStore from 'expo-secure-store';
import { THEME_KEY, type ThemePreference } from './preferences';
export const readTheme = () => SecureStore.getItemAsync(THEME_KEY);
export const writeTheme = (value: ThemePreference) => SecureStore.setItemAsync(THEME_KEY, value);
