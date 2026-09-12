import * as Crypto from 'expo-crypto';
import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Platform } from 'react-native';

import { useAuth } from '@/auth/auth-provider';

import { loadTravelCache, saveTravelCache } from './cache';
import { connectionBetween, createsFlightConnectionCycle } from './flight-connections';
import { Booking, BookingDocument, emptyTravelCache, ItineraryItem, PackingItem, PendingMutation, TravelCache, TravelTask, Trip } from './types';

type TripInput = Pick<Trip, 'name' | 'destination' | 'startsOn' | 'endsOn'>;
type ItemInput = Pick<ItineraryItem, 'day' | 'time' | 'kind' | 'title' | 'note'>;
type BookingInput = Pick<Booking, 'kind' | 'title' | 'detail' | 'origin' | 'originCode' | 'destination' | 'destinationCode' | 'day' | 'time' | 'endDay' | 'endTime' | 'confirmationCode' | 'note'>;
type PackingInput = Pick<PackingItem, 'name' | 'category' | 'quantity' | 'packed'>;
type TaskInput = Pick<TravelTask, 'title' | 'dueOn' | 'assignee' | 'done'>;
type BookingDocumentInput = { filename: string; contentType: string; size: number; bytes: ArrayBuffer };

type TravelContextValue = {
  ready: boolean;
  syncing: boolean;
  error: string | null;
  trips: Trip[];
  selectedTrip: Trip | null;
  items: ItineraryItem[];
  bookings: Booking[];
  documentsByBooking: Record<string, BookingDocument[]>;
  packingItems: PackingItem[];
  tasks: TravelTask[];
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
  setFlightConnection: (id: string, mode: NonNullable<Booking['connectionMode']>, nextFlightId?: string | null) => void;
  deleteBooking: (id: string) => void;
  uploadBookingDocument: (bookingId: string, input: BookingDocumentInput) => Promise<BookingDocument>;
  deleteBookingDocument: (bookingId: string, documentId: string) => void;
  downloadBookingDocument: (bookingId: string, documentId: string) => Promise<ArrayBuffer>;
  createPackingItem: (input: PackingInput) => string;
  updatePackingItem: (id: string, input: PackingInput) => void;
  deletePackingItem: (id: string) => void;
  createTask: (input: TaskInput) => string;
  updateTask: (id: string, input: TaskInput) => void;
  deleteTask: (id: string) => void;
  createInvite: () => Promise<string>;
  acceptInvite: (token: string) => Promise<string>;
};

const TravelContext = createContext<TravelContextValue | null>(null);

export function TravelProvider({ children }: PropsWithChildren) {
  const { request, requestRaw } = useAuth();
  const [cache, setCache] = useState<TravelCache>(emptyTravelCache);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef(cache);
  const syncingRef = useRef<Promise<void> | null>(null);

  const commit = useCallback((update: (current: TravelCache) => TravelCache) => {
    // Queue ownership must not depend on when React renders a state update.
    const next = update(cacheRef.current);
    if (next === cacheRef.current) return;
    cacheRef.current = next;
    setCache(next);
    void saveTravelCache(next);
  }, []);

  const sync = useCallback((): Promise<void> => {
    if (syncingRef.current) return syncingRef.current;
    const operation = Promise.resolve().then(async () => {
      setSyncing(true);
      try {
        do {
          while (cacheRef.current.pending.length) {
            const mutation = cacheRef.current.pending[0];
            try {
              await request(mutation.path, {
                method: mutation.method,
                ...(mutation.body ? { body: JSON.stringify(mutation.body) } : {}),
              });
            } catch (cause) {
              const status = cause instanceof Error && 'status' in cause ? cause.status : null;
              if (!mutation.path.endsWith('/connection') || ![400, 403, 404, 409].includes(Number(status))) throw cause;
              // Discard only a permanently rejected link, then reload the server's
              // choices. Network/auth failures keep their queued mutation for retry.
              const message = cause instanceof Error ? cause.message : '便を選び直してください';
              if (Platform.OS === 'web') globalThis.alert(`乗り継ぎを保存できませんでした\n${message}`);
              else Alert.alert('乗り継ぎを保存できませんでした', message);
            }
            commit((current) => ({ ...current, pending: current.pending.filter((item) => item.id !== mutation.id) }));
          }

          const { trips } = await request<{ trips: Trip[] }>('/v1/trips');
          const tripEntries = await Promise.all(
            trips.map(async (trip) => {
              const [itemResult, bookingResult, packingResult, taskResult, documentResult] = await Promise.all([
                request<{ items: ItineraryItem[] }>(`/v1/trips/${trip.id}/items`),
                request<{ bookings: Booking[] }>(`/v1/trips/${trip.id}/bookings`),
                request<{ items: PackingItem[] }>(`/v1/trips/${trip.id}/packing`),
                request<{ tasks: TravelTask[] }>(`/v1/trips/${trip.id}/tasks`),
                request<{ documents: BookingDocument[] }>(`/v1/trips/${trip.id}/booking-documents`),
              ]);
              return [trip.id, itemResult.items, bookingResult.bookings, packingResult.items, taskResult.tasks, documentResult.documents] as const;
            }),
          );
          commit((current) => {
            if (current.pending.length) return current;
            const selectedTripId = trips.some((trip) => trip.id === current.selectedTripId)
              ? current.selectedTripId
              : (trips[0]?.id ?? null);
            const documentsByBooking: Record<string, BookingDocument[]> = {};
            for (const [, , , , , documents] of tripEntries) {
              for (const document of documents) {
                documentsByBooking[document.bookingId] = [...(documentsByBooking[document.bookingId] ?? []), document];
              }
            }
            return {
              ...current,
              trips,
              selectedTripId,
              itemsByTrip: Object.fromEntries(tripEntries.map(([tripId, items]) => [tripId, items])),
              bookingsByTrip: Object.fromEntries(tripEntries.map(([tripId, , bookings]) => [tripId, bookings])),
              packingByTrip: Object.fromEntries(tripEntries.map(([tripId, , , packingItems]) => [tripId, packingItems])),
              tasksByTrip: Object.fromEntries(tripEntries.map(([tripId, , , , tasks]) => [tripId, tasks])),
              documentsByBooking,
            };
          });
        } while (cacheRef.current.pending.length);
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '同期できませんでした');
      } finally {
        syncingRef.current = null;
        setSyncing(false);
      }
    });
    syncingRef.current = operation;
    return operation;
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
      packingByTrip: { ...current.packingByTrip, [id]: [] },
      tasksByTrip: { ...current.tasksByTrip, [id]: [] },
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

  const setFlightConnection = useCallback((id: string, mode: NonNullable<Booking['connectionMode']>, nextFlightId?: string | null) => {
    const tripId = cacheRef.current.selectedTripId;
    if (!tripId) throw new Error('旅行を選択してください');
    const bookings = cacheRef.current.bookingsByTrip[tripId] ?? [];
    const arrival = bookings.find((booking) => booking.id === id && booking.kind === 'flight');
    if (!arrival) throw new Error('航空便が見つかりません');
    const target = mode === 'manual' ? nextFlightId ?? null : null;
    if (mode === 'manual') {
      const departure = bookings.find((booking) => booking.id === target);
      if (!departure || !connectionBetween(arrival, departure)) throw new Error('同じ空港から到着後に出発する便を選んでください');
      if (bookings.some((booking) => booking.id !== id && booking.connectionMode === 'manual' && booking.nextFlightId === target)) {
        throw new Error('この便は別の便の乗り継ぎ先です');
      }
      if (createsFlightConnectionCycle(bookings, id, departure.id)) {
        throw new Error('便が循環するため紐づけできません。日時を確認してください');
      }
    }
    commit((current) => ({ ...current, bookingsByTrip: {
      ...current.bookingsByTrip,
      [tripId]: (current.bookingsByTrip[tripId] ?? []).map((booking) => booking.id === id ? { ...booking, connectionMode: mode, nextFlightId: target } : booking),
    } }));
    enqueue({ method: 'PATCH', path: `/v1/trips/${tripId}/bookings/${id}/connection`, body: { mode, nextFlightId: target } });
  }, [commit, enqueue]);

  const uploadBookingDocument = useCallback(async (bookingId: string, input: BookingDocumentInput) => {
    const tripId = cacheRef.current.selectedTripId;
    if (!tripId) throw new Error('旅行を選択してください');
    const response = await requestRaw(`/v1/trips/${tripId}/bookings/${bookingId}/documents`, {
      method: 'POST',
      headers: {
        'content-type': input.contentType,
        'x-filename': encodeURIComponent(input.filename),
        'x-file-size': String(input.size),
      },
      body: input.bytes,
    });
    const { document } = await response.json() as { document: BookingDocument };
    commit((current) => ({
      ...current,
      documentsByBooking: {
        ...current.documentsByBooking,
        [bookingId]: [...(current.documentsByBooking[bookingId] ?? []), document],
      },
    }));
    return document;
  }, [commit, requestRaw]);

  const deleteBookingDocument = useCallback((bookingId: string, documentId: string) => {
    const tripId = cacheRef.current.selectedTripId;
    if (!tripId) return;
    commit((current) => ({
      ...current,
      documentsByBooking: {
        ...current.documentsByBooking,
        [bookingId]: (current.documentsByBooking[bookingId] ?? []).filter((document) => document.id !== documentId),
      },
    }));
    enqueue({ method: 'DELETE', path: `/v1/trips/${tripId}/bookings/${bookingId}/documents/${documentId}` });
  }, [commit, enqueue]);

  const downloadBookingDocument = useCallback(async (bookingId: string, documentId: string) => {
    const tripId = cacheRef.current.selectedTripId;
    if (!tripId) throw new Error('旅行を選択してください');
    const response = await requestRaw(`/v1/trips/${tripId}/bookings/${bookingId}/documents/${documentId}`);
    return response.arrayBuffer();
  }, [requestRaw]);

  const deleteBooking = useCallback((id: string) => {
    const tripId = cacheRef.current.selectedTripId;
    if (!tripId) return;
    commit((current) => ({
      ...current,
      bookingsByTrip: {
        ...current.bookingsByTrip,
        [tripId]: (current.bookingsByTrip[tripId] ?? []).filter((booking) => booking.id !== id)
          .map((booking) => booking.nextFlightId === id ? { ...booking, nextFlightId: null } : booking),
      },
      documentsByBooking: Object.fromEntries(Object.entries(current.documentsByBooking).filter(([bookingId]) => bookingId !== id)),
    }));
    enqueue({ method: 'DELETE', path: `/v1/trips/${tripId}/bookings/${id}` });
  }, [commit, enqueue]);

  const createPackingItem = useCallback((input: PackingInput) => {
    const tripId = cacheRef.current.selectedTripId;
    if (!tripId) throw new Error('旅行を選択してください');
    const id = Crypto.randomUUID();
    const item: PackingItem = { id, ...input };
    commit((current) => ({
      ...current,
      packingByTrip: { ...current.packingByTrip, [tripId]: [...(current.packingByTrip[tripId] ?? []), item] },
    }));
    enqueue({ method: 'POST', path: `/v1/trips/${tripId}/packing`, body: { id, ...input } });
    return id;
  }, [commit, enqueue]);

  const updatePackingItem = useCallback((id: string, input: PackingInput) => {
    const tripId = cacheRef.current.selectedTripId;
    if (!tripId) return;
    commit((current) => ({
      ...current,
      packingByTrip: {
        ...current.packingByTrip,
        [tripId]: (current.packingByTrip[tripId] ?? []).map((item) => item.id === id ? { ...item, ...input } : item),
      },
    }));
    enqueue({ method: 'PATCH', path: `/v1/trips/${tripId}/packing/${id}`, body: input });
  }, [commit, enqueue]);

  const deletePackingItem = useCallback((id: string) => {
    const tripId = cacheRef.current.selectedTripId;
    if (!tripId) return;
    commit((current) => ({
      ...current,
      packingByTrip: {
        ...current.packingByTrip,
        [tripId]: (current.packingByTrip[tripId] ?? []).filter((item) => item.id !== id),
      },
    }));
    enqueue({ method: 'DELETE', path: `/v1/trips/${tripId}/packing/${id}` });
  }, [commit, enqueue]);

  const createTask = useCallback((input: TaskInput) => {
    const tripId = cacheRef.current.selectedTripId;
    if (!tripId) throw new Error('旅行を選択してください');
    const id = Crypto.randomUUID();
    const task: TravelTask = { id, ...input };
    commit((current) => ({
      ...current,
      tasksByTrip: { ...current.tasksByTrip, [tripId]: [...(current.tasksByTrip[tripId] ?? []), task] },
    }));
    enqueue({ method: 'POST', path: `/v1/trips/${tripId}/tasks`, body: { id, ...input } });
    return id;
  }, [commit, enqueue]);

  const updateTask = useCallback((id: string, input: TaskInput) => {
    const tripId = cacheRef.current.selectedTripId;
    if (!tripId) return;
    commit((current) => ({
      ...current,
      tasksByTrip: {
        ...current.tasksByTrip,
        [tripId]: (current.tasksByTrip[tripId] ?? []).map((task) => task.id === id ? { ...task, ...input } : task),
      },
    }));
    enqueue({ method: 'PATCH', path: `/v1/trips/${tripId}/tasks/${id}`, body: input });
  }, [commit, enqueue]);

  const deleteTask = useCallback((id: string) => {
    const tripId = cacheRef.current.selectedTripId;
    if (!tripId) return;
    commit((current) => ({
      ...current,
      tasksByTrip: {
        ...current.tasksByTrip,
        [tripId]: (current.tasksByTrip[tripId] ?? []).filter((task) => task.id !== id),
      },
    }));
    enqueue({ method: 'DELETE', path: `/v1/trips/${tripId}/tasks/${id}` });
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
  const packingItems = [...(selectedTrip ? cache.packingByTrip[selectedTrip.id] ?? [] : [])]
    .sort((a, b) => `${a.packed ? 1 : 0} ${a.category} ${a.name} ${a.id}`.localeCompare(`${b.packed ? 1 : 0} ${b.category} ${b.name} ${b.id}`));
  const tasks = [...(selectedTrip ? cache.tasksByTrip[selectedTrip.id] ?? [] : [])]
    .sort((a, b) => `${a.done ? 1 : 0} ${a.dueOn || '9999-12-31'} ${a.title} ${a.id}`.localeCompare(`${b.done ? 1 : 0} ${b.dueOn || '9999-12-31'} ${b.title} ${b.id}`));
  const value = useMemo<TravelContextValue>(() => ({
    ready,
    syncing,
    error,
    trips: cache.trips,
    selectedTrip,
    items,
    bookings,
    documentsByBooking: cache.documentsByBooking,
    packingItems,
    tasks,
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
    setFlightConnection,
    deleteBooking,
    uploadBookingDocument,
    deleteBookingDocument,
    downloadBookingDocument,
    createPackingItem,
    updatePackingItem,
    deletePackingItem,
    createTask,
    updateTask,
    deleteTask,
    createInvite,
    acceptInvite,
  }), [acceptInvite, bookings, cache.documentsByBooking, cache.pending.length, cache.trips, createBooking, createInvite, createItem, createPackingItem, createTask, createTrip, deleteBooking, deleteBookingDocument, deleteItem, deletePackingItem, deleteTask, downloadBookingDocument, error, items, packingItems, ready, selectTrip, selectedTrip, setFlightConnection, sync, syncing, tasks, updateBooking, updateItem, updatePackingItem, updateTask, updateTrip, uploadBookingDocument]);

  return <TravelContext.Provider value={value}>{children}</TravelContext.Provider>;
}

export function useTravel() {
  const value = useContext(TravelContext);
  if (!value) throw new Error('useTravel must be used inside TravelProvider');
  return value;
}
