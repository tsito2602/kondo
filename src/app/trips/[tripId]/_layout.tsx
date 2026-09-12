import { Redirect, Slot, useLocalSearchParams, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TripHeaderHeight } from '@/components/trip-header-context';
import { TripTopTabs } from '@/components/trip-top-tabs';
import { palette } from '@/constants/design';
import { useTravel } from '@/data/travel-provider';

export default function TripLayout() {
  const [headerHeight, setHeaderHeight] = useState(160);
  const pathname = usePathname();
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
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <TripHeaderHeight.Provider value={headerHeight}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30 }} onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}><TripTopTabs tripId={tripId} /></View>
        <View key={pathname} testID="route-transition" style={{ flex: 1 }}><Slot /></View>
      </TripHeaderHeight.Provider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.canvas },
});
