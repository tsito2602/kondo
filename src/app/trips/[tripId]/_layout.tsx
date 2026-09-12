import { Redirect, Slot, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TripTopTabs } from '@/components/trip-top-tabs';
import { palette } from '@/constants/design';
import { useTravel } from '@/data/travel-provider';

export default function TripLayout() {
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
      <TripTopTabs tripId={tripId} />
      <Slot />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.canvas },
});
