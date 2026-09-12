import { Redirect, Slot, useLocalSearchParams, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TripHeaderHeight } from '@/components/trip-header-context';
import { TripHero, TripHeroContext } from '@/components/trip-hero';
import { TripTopTabs } from '@/components/trip-top-tabs';
import { palette } from '@/constants/design';
import { useTravel } from '@/data/travel-provider';

export default function TripLayout() {
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(160);
  const pathname = usePathname();
  const { height: windowHeight } = useWindowDimensions();
  const [scrollY] = useState(() => new Animated.Value(0));
  const showHero = pathname.endsWith('/itinerary');
  const heroHeight = Math.max(headerHeight + insets.top + 220, Math.min(560, windowHeight * 0.64));
  useEffect(() => { scrollY.setValue(0); }, [pathname, scrollY]);
  const { tripId: rawTripId } = useLocalSearchParams<{ tripId: string | string[] }>();
  const tripId = Array.isArray(rawTripId) ? rawTripId[0] : rawTripId;
  const { ready, trips, selectedTrip, selectTrip } = useTravel();
  const tripExists = trips.some((trip) => trip.id === tripId);

  useEffect(() => {
    if (ready && tripExists && selectedTrip?.id !== tripId) selectTrip(tripId);
  }, [ready, selectTrip, selectedTrip?.id, tripExists, tripId]);

  if (!ready || (tripExists && selectedTrip?.id !== tripId)) {
    return <View style={styles.loading}><ActivityIndicator color={palette.ocean} /></View>;
  }
  if (!tripId || !tripExists) return <Redirect href="/" />;

  return (
    <View style={styles.safeArea}>
      {showHero && selectedTrip ? <TripHero trip={selectedTrip} height={heroHeight} scrollY={scrollY} /> : null}
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <TripHeroContext.Provider value={{ height: heroHeight - insets.top, scrollY }}>
          <TripHeaderHeight.Provider value={headerHeight}>
            <View style={{ position: 'absolute', top: insets.top, left: 0, right: 0, zIndex: 30 }} onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}><TripTopTabs tripId={tripId} /></View>
            <View key={pathname} testID="route-transition" style={{ flex: 1 }}><Slot /></View>
          </TripHeaderHeight.Provider>
        </TripHeroContext.Provider>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.canvas },
});
