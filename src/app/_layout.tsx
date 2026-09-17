import { Platform } from 'react-native';
import { TripTransitions } from '@/components/trip-transitions';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { AppThemeProvider, useAppTheme } from '@/theme/theme-provider';
import '@/global.css';
import '@/motion.css';
import { WebWorkspace } from '@/components/web-workspace';
import { ToastHost, ToastProvider } from '@/components/toast';
import { PwaSetup } from '@/components/pwa';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthGate } from '@/auth/auth-gate';
import { AuthProvider, useAuth } from '@/auth/auth-provider';
import { TravelProvider } from '@/data/travel-provider';
import { ConfirmDeletionBridge } from '@/utils/confirm-deletion';
import { AppMediator } from '@/ui/app-mediator';
import { UiBoundary } from '@/ui/mediator';
import { TravelMediator } from '@/ui/travel-mediator';

export default function RootLayout() {
  return <AppThemeProvider><AppFrame /></AppThemeProvider>;
}

function AppFrame() {
  const { scheme, palette } = useAppTheme();
  const navigationTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider value={{ ...navigationTheme, colors: { ...navigationTheme.colors, background: palette.canvas, card: palette.paper, text: palette.ink, border: palette.ash, primary: palette.ocean } }}>
      <ToastProvider><AuthProvider><AppMediator><UiBoundary name="RootView">
        <ConfirmDeletionBridge />
        <PwaSetup />
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <AuthGate>
          <TravelRoot />
        </AuthGate>
        <ToastHost />
      </UiBoundary></AppMediator></AuthProvider></ToastProvider>
    </ThemeProvider>
  );
}

function TravelRoot() {
  const { isDemo, user } = useAuth();
  return <TravelProvider key={isDemo ? 'demo' : user?.id}><TravelMediator><UiBoundary name="Router"><RoutedViews /></UiBoundary></TravelMediator></TravelProvider>;
}

function RoutedViews() {
  const reduced = useReducedMotion();
  const { palette } = useAppTheme();
  const pathname = usePathname();
  return <UiBoundary name={`Screen:${pathname}`}>
    <TripTransitions /><WebWorkspace><Stack screenOptions={{ contentStyle: { backgroundColor: palette.canvas }, headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="trips/[tripId]" options={{ animation: Platform.OS === 'web' || reduced ? 'none' : 'slide_from_right' }} />
    </Stack></WebWorkspace>
  </UiBoundary>;
}
