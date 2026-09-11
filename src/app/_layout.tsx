import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { AuthGate } from '@/auth/auth-gate';
import { AuthProvider } from '@/auth/auth-provider';
import { TravelProvider } from '@/data/travel-provider';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="dark" />
      <AuthProvider>
        <AuthGate>
          <TravelProvider>
            <Stack screenOptions={{ contentStyle: { backgroundColor: '#EEF2F4' }, headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="trips/[tripId]" options={{ animation: 'slide_from_right' }} />
            </Stack>
          </TravelProvider>
        </AuthGate>
      </AuthProvider>
    </ThemeProvider>
  );
}
