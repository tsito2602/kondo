import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { AuthGate } from '@/auth/auth-gate';
import { AuthProvider } from '@/auth/auth-provider';
import AppTabs from '@/components/app-tabs';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="dark" />
      <AuthProvider>
        <AuthGate>
          <AppTabs />
        </AuthGate>
      </AuthProvider>
    </ThemeProvider>
  );
}
