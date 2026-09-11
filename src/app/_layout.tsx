import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthGate } from '@/auth/auth-gate';
import { AuthProvider } from '@/auth/auth-provider';
import AppTabs from '@/components/app-tabs';
import { TravelProvider } from '@/data/travel-provider';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="dark" />
      <AuthProvider>
        <AuthGate>
          <TravelProvider>
            <AppTabs />
          </TravelProvider>
        </AuthGate>
      </AuthProvider>
    </ThemeProvider>
    </GestureHandlerRootView>
  );
}
