import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { useUiNavigation } from '@/ui/navigation';

export default function TripIndex() {
  const navigation = useUiNavigation();
  const { tripId: rawTripId } = useLocalSearchParams<{ tripId: string | string[] }>();
  const tripId = Array.isArray(rawTripId) ? rawTripId[0] : rawTripId;
  useEffect(() => {
    if (tripId) navigation.replace({ pathname: '/trips/[tripId]/itinerary', params: { tripId } });
    else navigation.replace('/');
  }, [navigation, tripId]);
  return null;
}
