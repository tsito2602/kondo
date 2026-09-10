import * as Crypto from 'expo-crypto';
import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/auth/auth-provider';

import { loadTravelCache, saveTravelCache } from './cache';
import { Booking, emptyTravelCache, ItineraryItem, PendingMutation, TravelCache, Trip } from './types';

type TripInput = Pick<Trip, 'name' | 'destination' | 'startsOn' | 'endsOn'>;
type ItemInput = Pick<ItineraryItem, 'day' | 'time' | 'kind' | 'title' | 'note'>;
type BookingInput = Pick<Booking, 'kind' | 'title' | 'detail' | 'origin' | 'originCode' | 'destination' | 'destinationCode' | 'day' | 'time' | 'endDay' | 'endTime' | 'confirmationCode' | 'note'>;

type TravelContextValue = {
  ready: boolean;
  syncing: boolean;
  error: string | null;
  trips: Trip[];
  selectedTrip: Trip | null;
  items: ItineraryItem[];
  bookings: Booking[];
  pendingCount: number;
  selectTrip: (id: string) => void;
  sync: () => Promise<void>;
  createTrip: (input: TripInput) => string;
  updateTrip: (id: string, input: TripInput) => void;
  createItem: (input: ItemInput) => string;
  updateItem: (id: string, input: ItemInput) => void;
  deleteItem: (id: string) => void;
  createBooking: (input: BookingInput) => string;
  updateBooking: (id: string, input: BookingInput) => void;
  deleteBooking: (id: string) => void;
  createInvite: () => Promise<string>;
  acceptInvite: (token: string) => Promise<string>;
};

const TravelContext = createContext<TravelContextValue | null>(null);

export function TravelProvider({ children }: PropsWithChildren) {
  const { request } = useAuth();
  const [cache, setCache] = useState<TravelCache>(emptyTravelCache);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef(cache);
  const syncingRef = useRef(false);

  const commit = useCallback((update: (current: TravelCache) => TravelCache) => {
    setCache((current) => {
      const next = update(current);
      cacheRef.current = next;
      void saveTravelCache(next);
      return next;
    });
  }, []);

  const sync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      while (cacheRef.current.pending.length) {
        const mutation = cacheRef.current.pending[0];
        await request(mutation.path, {
          method: mutation.method,
          ...(mutation.body ? { body: JSON.stringify(mutation.body) } : {}),
        });
        commit((current) => ({ ...current, pending: current.pending.filter((item) => item.id !== mutation.id) }));
      }

      const { trips } = await request<{ trips: Trip[] }>('/v1/trips');
      const tripEntries = await Promise.all(
        trips.map(async (trip) => {
          const [itemResult, bookingResult] = await Promise.all([
            request<{ items: ItineraryItem[] }>(`/v1/trips/${trip.id}/items`),
            request<{ bookings: Booking[] }>(`/v1/trips/${trip.id}/bookings`),
          ]);
          return [trip.id, itemResult.items, bookingResult.bookings] as const;
        }),
      );
      commit((current) => {
        if (current.pending.length) return current;
        const selectedTripId = trips.some((trip) => trip.id === current.selectedTripId)
          ? current.selectedTripId
          : (trips[0]?.id ?? null);
        return {
          ...current,
          trips,
          selectedTripId,
          itemsByTrip: Object.fromEntries(tripEntries.map(([tripId, items]) => [tripId, items])),
          bookingsByTrip: Object.fromEntries(tripEntries.map(([tripId, , bookings]) => [tripId, bookings])),
        };
      });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '同期できませんでした');
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [commit, request]);

  useEffect(() => {
    let active = true;
    void loadTravelCache().then((stored) => {
      if (!active) return;
      cacheRef.current = stored;
      setCache(stored);
      setReady(true);
      void sync();
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync();
    });
    const timer = setInterval(() => void sync(), 30_000);
    return () => {
      active = false;
      appState.remove();
      clearInterval(timer);
    };
  }, [sync]);

  const enqueue = useCallback((mutation: Omit<PendingMutation, 'id'>) => {
    commit((current) => ({
      ...current,
      pending: [...current.pending, { ...mutation, id: Crypto.randomUUID() }],
    }));
    queueMicrotask(() => void sync());
  }, [commit, sync]);

  const selectTrip = useCallback((id: string) => {
    commit((current) => ({ ...current, selectedTripId: id }));
  }, [commit]);

  const createTrip = useCallback((input: TripInput) => {
    const id = Crypto.randomUUID();
    const trip: Trip = { id, ...input, role: 'owner', memberCount: 1 };
    commit((current) => ({
      ...current,
      trips: [...current.trips, trip],
      selectedTripId: id,
      itemsByTrip: { ...current.itemsByTrip, [id]: [] },
      bookingsByTrip: { ...current.bookingsByTrip, [id]: [] },
    }));
    enqueue({ method: 'POST', path: '/v1/trips', body: { id, ...input } });
    return id;
  }, [commit, enqueue]);

  const updateTrip = useCallback((id: string, input: TripInput) => {
    commit((current) => ({ ...current, trips: current.trips.map((trip) => trip.id === id ? { ...trip, ...input } : trip) }));
    enqueue({ method: 'PATCH', path: `/v1/trips/${id}`, body: input });
  }, [commit, enqueue]);

  const createItem = useCallback((input: ItemInput) => {
    const tripId = cacheRef.current.selectedTripId;
    if (!tripId) throw new Error('旅行を選択してください');
    const id = Crypto.randomUUID();
    const item: ItineraryItem = { id, ...input };
    commit((current) => ({ ...current, itemsByTrip: { ...current.itemsByTrip, [tripId]: [...(current.itemsByTrip[tripId] ?? []), item] } }));
    enqueue({ method: 'POST', path: `/v1/trips/${tripId}/items`, body: { id, ...input } });
    return id;
  }, [commit, enqueue]);

  const updateItem = useCallback((id: string, input: ItemInput) => {
    const tripId = cacheRef.current.selectedTripId;
    if (!tripId) return;
    commit((current) => ({ ...current, itemsByTrip: { ...current.itemsByTrip, [tripId]: (current.itemsByTrip[tripId] ?? []).map((item) => item.id === id ? { ...item, ...input } : item) } }));
    enqueue({ method: 'PATCH', path: `/v1/trips/${tripId}/items/${id}`, body: input });
  }, [commit, enqueue]);

  const deleteItem = useCallback((id: string) => {
    const tripId = cacheRef.current.selectedTripId;
    if (!tripId) return;
    commit((current) => ({ ...current, itemsByTrip: { ...current.itemsByTrip, [tripId]: (current.itemsByTrip[tripId] ?? []).filter((item) => item.id !== id) } }));
    enqueue({ method: 'DELETE', path: `/v1/trips/${tripId}/items/${id}` });
  }, [commit, enqueue]);

  const createBooking = useCallback((input: BookingInput) => {
    const tripId = cacheRef.current.selectedTripId;
    if (!tripId) throw new Error('旅行を選択してください');
    const id = Crypto.randomUUID();
    const booking: Booking = { id, ...input };
    commit((current) => ({
      ...current,
      bookingsByTrip: { ...current.bookingsByTrip, [tripId]: [...(current.bookingsByTrip[tripId] ?? []), booking] },
    }));
    enqueue({ method: 'POST', path: `/v1/trips/${tripId}/bookings`, body: { id, ...input } });
    return id;
  }, [commit, enqueue]);

  const updateBooking = useCallback((id: string, input: BookingInput) => {
    const tripId = cacheRef.current.selectedTripId;
    if (!tripId) return;
    commit((current) => ({
      ...current,
      bookingsByTrip: {
        ...current.bookingsByTrip,
        [tripId]: (current.bookingsByTrip[tripId] ?? []).map((booking) => booking.id === id ? { ...booking, ...input } : booking),
      },
    }));
    enqueue({ method: 'PATCH', path: `/v1/trips/${tripId}/bookings/${id}`, body: input });
  }, [commit, enqueue]);

  const deleteBooking = useCallback((id: string) => {
    const tripId = cacheRef.current.selectedTripId;
    if (!tripId) return;
    commit((current) => ({
      ...current,
      bookingsByTrip: {
        ...current.bookingsByTrip,
        [tripId]: (current.bookingsByTrip[tripId] ?? []).filter((booking) => booking.id !== id),
      },
    }));
    enqueue({ method: 'DELETE', path: `/v1/trips/${tripId}/bookings/${id}` });
  }, [commit, enqueue]);

  const createInvite = useCallback(async () => {
    const tripId = cacheRef.current.selectedTripId;
    if (!tripId) throw new Error('旅行を選択してください');
    const result = await request<{ invite: { url: string } }>(`/v1/trips/${tripId}/invites`, { method: 'POST' });
    return result.invite.url;
  }, [request]);

  const acceptInvite = useCallback(async (token: string) => {
    const result = await request<{ tripId: string }>(`/v1/invites/${encodeURIComponent(token)}/accept`, { method: 'POST' });
    await sync();
    selectTrip(result.tripId);
    return result.tripId;
  }, [request, selectTrip, sync]);

  const selectedTrip = cache.trips.find((trip) => trip.id === cache.selectedTripId) ?? null;
  const items = [...(selectedTrip ? cache.itemsByTrip[selectedTrip.id] ?? [] : [])]
    .sort((a, b) => `${a.day} ${a.time} ${a.id}`.localeCompare(`${b.day} ${b.time} ${b.id}`));
  const bookings = [...(selectedTrip ? cache.bookingsByTrip[selectedTrip.id] ?? [] : [])]
    .sort((a, b) => `${a.day} ${a.time} ${a.id}`.localeCompare(`${b.day} ${b.time} ${b.id}`));
  const value = useMemo<TravelContextValue>(() => ({
    ready,
    syncing,
    error,
    trips: cache.trips,
    selectedTrip,
    items,
    bookings,
    pendingCount: cache.pending.length,
    selectTrip,
    sync,
    createTrip,
    updateTrip,
    createItem,
    updateItem,
    deleteItem,
    createBooking,
    updateBooking,
    deleteBooking,
    createInvite,
    acceptInvite,
  }), [acceptInvite, bookings, cache.pending.length, cache.trips, createBooking, createInvite, createItem, createTrip, deleteBooking, deleteItem, error, items, ready, selectTrip, selectedTrip, sync, syncing, updateBooking, updateItem, updateTrip]);

  return <TravelContext.Provider value={value}>{children}</TravelContext.Provider>;
}

export function useTravel() {
  const value = useContext(TravelContext);
  if (!value) throw new Error('useTravel must be used inside TravelProvider');
  return value;
}
