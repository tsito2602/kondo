import { Redirect, useLocalSearchParams } from 'expo-router';

export default function TripIndex() {
  const { tripId: rawTripId } = useLocalSearchParams<{ tripId: string | string[] }>();
  const tripId = Array.isArray(rawTripId) ? rawTripId[0] : rawTripId;
  return <Redirect href={{ pathname: '/trips/[tripId]/itinerary', params: { tripId } }} />;
}
