export type Trip = {
  id: string;
  name: string;
  destination: string;
  startsOn: string;
  endsOn: string;
  role: 'owner' | 'editor';
  memberCount: number;
  updatedAt?: number;
};

export type ItineraryItem = {
  id: string;
  day: string;
  time: string;
  kind: string;
  title: string;
  note: string;
  updatedBy?: string;
  updatedAt?: number;
};

export type PendingMutation = {
  id: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: Record<string, unknown>;
};

export type TravelCache = {
  version: 1;
  trips: Trip[];
  selectedTripId: string | null;
  itemsByTrip: Record<string, ItineraryItem[]>;
  pending: PendingMutation[];
};

export const emptyTravelCache = (): TravelCache => ({
  version: 1,
  trips: [],
  selectedTripId: null,
  itemsByTrip: {},
  pending: [],
});
