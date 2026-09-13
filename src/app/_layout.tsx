import '@/global.css';
import { WebWorkspace } from '@/components/web-workspace';
import { ToastProvider } from '@/components/toast';
import { PwaSetup } from '@/components/pwa';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthGate } from '@/auth/auth-gate';
import { AuthProvider, useAuth } from '@/auth/auth-provider';
import { TravelProvider } from '@/data/travel-provider';

export default function RootLayout() {
  return (
    <ThemeProvider value={DefaultTheme}>
      <PwaSetup />
      <StatusBar style="dark" />
      <ToastProvider><AuthProvider>
        <AuthGate>
          <TravelRoot />
        </AuthGate>
      </AuthProvider></ToastProvider>
    </ThemeProvider>
  );
}

function TravelRoot() {
  const { isDemo, user } = useAuth();
  return <TravelProvider key={isDemo ? 'demo' : user?.id}>
            <WebWorkspace><Stack screenOptions={{ contentStyle: { backgroundColor: '#EEF2F4' }, headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="trips/[tripId]" options={{ animation: 'slide_from_right' }} />
            </Stack></WebWorkspace>
          </TravelProvider>;
}
