import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/auth/auth-provider';

import { readOfflineFile, saveOfflineFile } from './offline-files';
import { createDemoCache, demoMembers, DEMO_REVISION } from './demo';
import { loadDemoDocument, saveDemoDocument } from './demo-documents';
import { loadTravelCache, saveTravelCache } from './cache';
import { connectionBetween, createsFlightConnectionCycle } from './flight-connections';
import { matchBookingPlace } from './booking-place';
import { Booking, BookingDocument, emptyTravelCache, ItineraryItem, PackingItem, PendingMutation, Place, PlaceInput, TravelCache, TravelTask, Trip, TripMember, TravelNote, NoteInput } from './types';

type TripInput = Pick<Trip, 'name' | 'destination' | 'startsOn' | 'endsOn' | 'coverImage'>;
type ItemInput = Pick<ItineraryItem, 'day' | 'time' | 'kind' | 'title' | 'note' | 'details'>;
type BookingInput = Pick<Booking, 'kind' | 'title' | 'detail' | 'location' | 'origin' | 'originCode' | 'destination' | 'destinationCode' | 'day' | 'time' | 'endDay' | 'endTime' | 'confirmationCode' | 'note' | 'durationMinutes' | 'placeId'>;
type PackingInput = Pick<PackingItem, 'name' | 'category' | 'quantity' | 'packed' | 'assignee' | 'shared' | 'kind'>;
/** みんな各自 keeps one tick per member; `packed` is always the viewer's own. */
const withOwnTick = (item: PackingItem, self: string | undefined): PackingItem => {
  if (item.kind !== 'each' || !self) return item;
  const others = (item.packedBy ?? []).filter((id) => id !== self);
  return { ...item, packedBy: item.packed ? [...others, self].sort() : others };
};
type TaskInput = Pick<TravelTask, 'title' | 'dueOn' | 'assignee' | 'done'>;
type BookingDocumentInput = { filename: string; contentType: string; size: number; bytes: ArrayBuffer };

type TravelContextValue = {
  ready: boolean;
  canEdit: boolean;
  syncing: boolean;
  error: string | null;
  trips: Trip[];
  selectedTrip: Trip | null;
  items: ItineraryItem[];
  bookings: Booking[];
  documentsByBooking: Record<string, BookingDocument[]>;
  packingItems: PackingItem[];
  tasks: TravelTask[];
  members: TripMember[];
  /** Members of every trip, for the trip list's companion icons. */
  membersOf: (tripId: string) => TripMember[];
  places: Place[];
  notes: TravelNote[];
  saveNote: (id: string, input: NoteInput, targetTripId?: string) => void;
  deleteNote: (id: string) => void;
  createPlace: (input: PlaceInput) => string;
  updatePlace: (id: string, input: PlaceInput) => void;
  deletePlace: (id: string, tripId?: string) => void;
  deleteTrip: (id: string) => Promise<void>;
  saveTripOffline: (onProgress: (done: number, total: number) => void) => Promise<number>;
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
  deleteBooking: (id: string, tripId?: string) => void;
  uploadBookingDocument: (bookingId: string, input: BookingDocumentInput) => Promise<BookingDocument>;
  deleteBookingDocument: (bookingId: string, documentId: string) => void;
  downloadBookingDocument: (bookingId: string, documentId: string) => Promise<ArrayBuffer>;
  createPackingItem: (input: PackingInput) => string;
  updatePackingItem: (id: string, input: PackingInput) => void;
  deletePackingItem: (id: string, tripId?: string) => void;
  createTask: (input: TaskInput) => string;
  updateTask: (id: string, input: TaskInput) => void;
  deleteTask: (id: string, tripId?: string) => void;
  createInvite: () => Promise<string>;
  acceptInvite: (token: string) => Promise<string>;
  /** Deletes after a few seconds: the thing leaves every list at once and the
      dock offers 「元に戻す」 until then (Tsubasa 2026-10-07: undo for every delete). */
  removeLater: (kind: RemovalKind, id: string, message: string) => void;
  removal: { message: string; key: string } | null;
  undoRemoval: () => void;
};
export type RemovalKind = 'booking' | 'task' | 'packing' | 'place' | 'trip';
export const REMOVAL_UNDO_MS = 5000;

const TravelContext = createContext<TravelContextValue | null>(null);

function assertTripEditable(cache: TravelCache, tripId: string | null) {
  if (cache.trips.find((trip) => trip.id === tripId)?.role === 'viewer') throw new Error('この旅行は閲覧のみです');
}

/** What the Worker's bookingFields accepts, so a backfilled place link is never a request it refuses. */
function patchableBooking(booking: Booking) {
  const clock = /^([01]\d|2[0-3]):[0-5]\d$|^$/;
  const within = (value: string | undefined, max: number) => (value ?? '').trim().length <= max;
  const minutes = booking.durationMinutes;
  return Boolean(booking.title?.trim()) && within(booking.title, 160) && within(booking.detail, booking.kind === 'hotel' ? 2000 : 500)
    && within(booking.origin, 160) && within(booking.destination, 160) && within(booking.originCode, 8) && within(booking.destinationCode, 8)
    && within(booking.confirmationCode, 120) && within(booking.note, 4000)
    && /^\d{4}-\d{2}-\d{2}$/.test(booking.day ?? '') && (!booking.endDay || /^\d{4}-\d{2}-\d{2}$/.test(booking.endDay))
    && (booking.kind === 'flight' || !booking.endDay || booking.endDay >= booking.day)
    && clock.test(booking.time ?? '') && clock.test(booking.endTime ?? '')
    && (minutes == null || (Number.isInteger(minutes) && minutes >= 1 && minutes <= 10080));
}

export function TravelProvider({ children }: PropsWithChildren) {
  const { request, requestRaw, isDemo, user } = useAuth();
  const [cache, setCache] = useState<TravelCache>(emptyTravelCache);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The server's own bookings and places have arrived once (not just the device's copy).
  const [synced, setSynced] = useState(false);
  const cacheRef = useRef(cache);
  const syncingRef = useRef<Promise<void> | null>(null);

  const commit = useCallback((update: (current: TravelCache) => TravelCache) => {
    // Queue ownership must not depend on when React renders a state update.
    const next = update(cacheRef.current);
    if (next === cacheRef.current) return;
    cacheRef.current = next;
    setCache(next);
    void saveTravelCache(next, isDemo ? 'demo' : user?.id).catch(() => setError('端末に保存できませんでした。空き容量を確認してください'));
  }, [isDemo, user?.id]);

  const sync = useCallback((): Promise<void> => {
    if (isDemo) return Promise.resolve();
    if (syncingRef.current) return syncingRef.current;
    const operation = Promise.resolve().then(async () => {
      setSyncing(true);
      let permissionNotice: string | null = null;
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
              const forbiddenTrip = mutation.path.match(/^\/v1\/trips\/([^/]+)(?:\/|$)/)?.[1];
              if (Number(status) === 403 && forbiddenTrip) {
                // Revoked edits must not block every other trip's queue or keep
                // optimistic data visible after access has changed.
                const prefix = `/v1/trips/${forbiddenTrip}`;
                commit((current) => ({ ...current, pending: current.pending.filter((entry) => entry.path !== prefix && !entry.path.startsWith(`${prefix}/`)) }));
                permissionNotice = '旅行の権限が変更されたため、未同期の編集を取り消しました';
                continue;
              }
              if (Number(status) === 400 && /\/tasks(?:\/[^/]+)?$/.test(mutation.path) && cause instanceof Error && cause.message === 'この旅行のメンバーから担当を選んでください') {
                // A member may leave while this device is offline. Keep the task
                // and its other edits, but retry without the revoked assignment.
                commit((current) => ({ ...current, pending: current.pending.map((entry) => entry.id === mutation.id ? { ...entry, body: { ...entry.body, assignee: '' } } : entry) }));
                permissionNotice = '担当メンバーが退出したため、担当を未指定にして保存しました';
                continue;
              }
              // A backfilled place link the server rejects is dropped quietly: it
              // must never hold up the queue (the booking just stays unlinked).
              if (!(mutation.backfill && [400, 404].includes(Number(status)))) {
                if (!mutation.path.endsWith('/connection') || ![400, 403, 404, 409].includes(Number(status))) throw cause;
                // Discard only a permanently rejected link, then reload the server's
                // choices. Network/auth failures keep their queued mutation for retry.
                const message = cause instanceof Error ? cause.message : '便を選び直してください';
                globalThis.alert?.(`乗り継ぎを保存できませんでした\n${message}`);
              }
            }
            commit((current) => ({ ...current, pending: current.pending.filter((item) => item.id !== mutation.id) }));
          }

          const { trips } = await request<{ trips: Trip[] }>('/v1/trips');
          const tripEntries = await Promise.all(
            trips.map(async (trip) => {
              const [itemResult, bookingResult, packingResult, taskResult, documentResult, placeResult, memberResult, noteResult] = await Promise.all([
                request<{ items: ItineraryItem[] }>(`/v1/trips/${trip.id}/items`),
                request<{ bookings: Booking[] }>(`/v1/trips/${trip.id}/bookings`),
                request<{ items: PackingItem[] }>(`/v1/trips/${trip.id}/packing`),
                request<{ tasks: TravelTask[] }>(`/v1/trips/${trip.id}/tasks`),
                request<{ documents: BookingDocument[] }>(`/v1/trips/${trip.id}/booking-documents`),
                request<{ places: Place[] }>(`/v1/trips/${trip.id}/places`),
                request<{ members: TripMember[] }>(`/v1/trips/${trip.id}/members`),
                request<{ notes: TravelNote[] }>(`/v1/trips/${trip.id}/notes`),
              ]);
              return [trip.id, itemResult.items, bookingResult.bookings, packingResult.items, taskResult.tasks, documentResult.documents, placeResult.places, memberResult.members, noteResult.notes] as const;
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
              placesByTrip: Object.fromEntries(tripEntries.map(([tripId, , , , , , places]) => [tripId, places ?? []])),
              membersByTrip: Object.fromEntries(tripEntries.map(([tripId, , , , , , , members]) => [tripId, members ?? []])),
              notesByTrip: Object.fromEntries(tripEntries.map(([tripId, , , , , , , , notes]) => [tripId, notes ?? []])),
              documentsByBooking,
            };
          });
        } while (cacheRef.current.pending.length);
        setSynced(true);
        setError(permissionNotice);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '同期できませんでした');
      } finally {
        syncingRef.current = null;
        setSyncing(false);
      }
    });
    syncingRef.current = operation;
    return operation;
  }, [commit, request, isDemo]);

  useEffect(() => {
    let active = true;
    setSynced(false);
    void loadTravelCache(isDemo ? 'demo' : user?.id).then((value) => {
      let stale = false;
      try { stale = isDemo && localStorage.getItem('kondo.demo-revision') !== DEMO_REVISION; } catch { /* storage blocked */ }
      const stored = isDemo && (!value.trips.length || stale) ? createDemoCache() : value;
      if (stale) { try { localStorage.setItem('kondo.demo-revision', DEMO_REVISION); } catch { /* storage blocked */ } if (value.trips.length) void saveTravelCache(stored, 'demo').catch(() => {}); }
      if (!active) return;
      cacheRef.current = stored;
      setCache(stored);
      setReady(true);
      void sync();
    }).catch(() => { if (active) { setError('端末の保存データを開けませんでした'); setReady(true); } });
    const onVisible = () => { if (globalThis.document?.visibilityState === 'visible') void sync(); };
    globalThis.document?.addEventListener('visibilitychange', onVisible);
    const onOnline = () => void sync();
    globalThis.addEventListener?.('online', onOnline);
    const timer = setInterval(() => void sync(), 30_000);
    return () => {
      active = false;
      globalThis.document?.removeEventListener('visibilitychange', onVisible);
      globalThis.removeEventListener?.('online', onOnline);
      clearInterval(timer);
    };
  }, [sync, isDemo, user?.id]);

  const enqueue = useCallback((mutation: Omit<PendingMutation, 'id'>) => {
    if (isDemo) return;
    commit((current) => ({
      ...current,
      pending: [...current.pending, { ...mutation, id: crypto.randomUUID() }],
    }));
    queueMicrotask(() => void sync());
  }, [commit, sync, isDemo]);

  const selectTrip = useCallback((id: string) => {
    commit((current) => ({ ...current, selectedTripId: id }));
  }, [commit]);

  const createTrip = useCallback((input: TripInput) => {
    const id = crypto.randomUUID();
    const trip: Trip = { id, ...input, role: 'owner', memberCount: 1 };
    commit((current) => ({
      ...current,
      trips: [...current.trips, trip],
      selectedTripId: id,
      itemsByTrip: { ...current.itemsByTrip, [id]: [] },
      bookingsByTrip: { ...current.bookingsByTrip, [id]: [] },
      packingByTrip: { ...current.packingByTrip, [id]: [] },
      tasksByTrip: { ...current.tasksByTrip, [id]: [] },
      placesByTrip: { ...current.placesByTrip, [id]: [] },
    }));
    enqueue({ method: 'POST', path: '/v1/trips', body: { id, ...input } });
    return id;
  }, [commit, enqueue]);

  const updateTrip = useCallback((id: string, input: TripInput) => {
    assertTripEditable(cacheRef.current, id);
    commit((current) => ({ ...current, trips: current.trips.map((trip) => trip.id === id ? { ...trip, ...input } : trip) }));
    enqueue({ method: 'PATCH', path: `/v1/trips/${id}`, body: input });
  }, [commit, enqueue]);

  const deleteTrip = useCallback(async (id: string) => {
    const trip = cacheRef.current.trips.find((entry) => entry.id === id);
    if (!trip || trip.role !== 'owner') throw new Error('旅行を削除できるのは作成者だけです');
    if (!isDemo) {
      await sync();
      if (cacheRef.current.pending.length) throw new Error('未同期の変更があります。オンラインで同期してから削除してください');
      await request(`/v1/trips/${id}`, { method: 'DELETE' });
    }
    commit((current) => {
      const withoutTrip = <T,>(values: Record<string, T>) => Object.fromEntries(Object.entries(values).filter(([key]) => key !== id));
      const bookingIds = new Set((current.bookingsByTrip[id] ?? []).map((booking) => booking.id));
      return { ...current, trips: current.trips.filter((entry) => entry.id !== id), selectedTripId: current.selectedTripId === id ? null : current.selectedTripId,
        itemsByTrip: withoutTrip(current.itemsByTrip), bookingsByTrip: withoutTrip(current.bookingsByTrip),
        packingByTrip: withoutTrip(current.packingByTrip), tasksByTrip: withoutTrip(current.tasksByTrip), placesByTrip: withoutTrip(current.placesByTrip), notesByTrip: withoutTrip(current.notesByTrip ?? {}),
        documentsByBooking: Object.fromEntries(Object.entries(current.documentsByBooking).filter(([key]) => !bookingIds.has(key))) };
    });
  }, [commit, isDemo, request, sync]);

  const saveNote = useCallback((id: string, input: NoteInput, targetTripId?: string) => {
    const tripId = targetTripId ?? cacheRef.current.selectedTripId;
    assertTripEditable(cacheRef.current, tripId);
    if (!tripId) throw new Error('旅行を選択してください');
    // Pin and place survive edits that only send text; the writer is whoever saved last.
    const previous = cacheRef.current.notesByTrip?.[tripId]?.find((entry) => entry.id === id);
    const note: TravelNote = { ...previous, id, ...input, updatedBy: user?.id ?? null, updatedAt: Math.floor(Date.now() / 1000) };
    commit((current) => ({ ...current, notesByTrip: { ...current.notesByTrip, [tripId]: [...(current.notesByTrip?.[tripId] ?? []).filter((entry) => entry.id !== id), note] } }));
    // Upsert keeps a replayed offline draft idempotent, including its first save.
    const { title, body, content, pinned, placeId } = note;
    enqueue({ method: 'POST', path: `/v1/trips/${tripId}/notes`, body: { id, title, body, content, pinned: Boolean(pinned), placeId: placeId ?? null } });
  }, [commit, enqueue, user?.id]);
  const deleteNote = useCallback((id: string) => {
    const tripId = cacheRef.current.selectedTripId;
    assertTripEditable(cacheRef.current, tripId);
    if (!tripId) return;
    commit((current) => ({ ...current, notesByTrip: { ...current.notesByTrip, [tripId]: (current.notesByTrip?.[tripId] ?? []).filter((entry) => entry.id !== id) } }));
    enqueue({ method: 'DELETE', path: `/v1/trips/${tripId}/notes/${id}` });
  }, [commit, enqueue]);

  const createPlace = useCallback((input: PlaceInput) => {
    const tripId = cacheRef.current.selectedTripId;
    assertTripEditable(cacheRef.current, tripId);
    if (!tripId) throw new Error('旅行を選択してください');
    const id = crypto.randomUUID();
    commit((current) => ({ ...current, placesByTrip: { ...current.placesByTrip, [tripId]: [...(current.placesByTrip[tripId] ?? []), { id, ...input }] } }));
    enqueue({ method: 'POST', path: `/v1/trips/${tripId}/places`, body: { id, ...input } });
    return id;
  }, [commit, enqueue]);
  const updatePlace = useCallback((id: string, input: PlaceInput) => {
    const tripId = cacheRef.current.selectedTripId;
    assertTripEditable(cacheRef.current, tripId);
    if (!tripId) return;
    commit((current) => ({ ...current, placesByTrip: { ...current.placesByTrip, [tripId]: (current.placesByTrip[tripId] ?? []).map((place) => place.id === id ? { ...place, ...input, ...(input.location !== place.location ? { lat: null, lng: null } : {}) } : place) } }));
    enqueue({ method: 'PATCH', path: `/v1/trips/${tripId}/places/${id}`, body: input });
  }, [commit, enqueue]);
  const deletePlace = useCallback((id: string, inTrip?: string) => {
    const tripId = inTrip ?? cacheRef.current.selectedTripId;
    assertTripEditable(cacheRef.current, tripId);
    if (!tripId) return;
    commit((current) => ({
      ...current,
      placesByTrip: { ...current.placesByTrip, [tripId]: (current.placesByTrip[tripId] ?? []).filter((place) => place.id !== id) },
      // The Worker clears the booking's link with the place (ON DELETE SET NULL); mirror it offline.
      bookingsByTrip: { ...current.bookingsByTrip, [tripId]: (current.bookingsByTrip[tripId] ?? []).map((booking) => booking.placeId === id ? { ...booking, placeId: null } : booking) },
    }));
    enqueue({ method: 'DELETE', path: `/v1/trips/${tripId}/places/${id}` });
  }, [commit, enqueue]);

  const createItem = useCallback((input: ItemInput) => {
    const tripId = cacheRef.current.selectedTripId;
    assertTripEditable(cacheRef.current, tripId);
    if (!tripId) throw new Error('旅行を選択してください');
    const id = crypto.randomUUID();
    const item: ItineraryItem = { id, ...input };
    commit((current) => ({ ...current, itemsByTrip: { ...current.itemsByTrip, [tripId]: [...(current.itemsByTrip[tripId] ?? []), item] } }));
    enqueue({ method: 'POST', path: `/v1/trips/${tripId}/items`, body: { id, ...input } });
    return id;
  }, [commit, enqueue]);

  const updateItem = useCallback((id: string, input: ItemInput) => {
    const tripId = cacheRef.current.selectedTripId;
    assertTripEditable(cacheRef.current, tripId);
    if (!tripId) return;
    commit((current) => ({ ...current, itemsByTrip: { ...current.itemsByTrip, [tripId]: (current.itemsByTrip[tripId] ?? []).map((item) => item.id === id ? { ...item, ...input } : item) } }));
    enqueue({ method: 'PATCH', path: `/v1/trips/${tripId}/items/${id}`, body: input });
  }, [commit, enqueue]);

  const deleteItem = useCallback((id: string) => {
    const tripId = cacheRef.current.selectedTripId;
    assertTripEditable(cacheRef.current, tripId);
    if (!tripId) return;
    commit((current) => ({ ...current, itemsByTrip: { ...current.itemsByTrip, [tripId]: (current.itemsByTrip[tripId] ?? []).filter((item) => item.id !== id) } }));
    enqueue({ method: 'DELETE', path: `/v1/trips/${tripId}/items/${id}` });
  }, [commit, enqueue]);

  const createBooking = useCallback((input: BookingInput) => {
    const tripId = cacheRef.current.selectedTripId;
    assertTripEditable(cacheRef.current, tripId);
    if (!tripId) throw new Error('旅行を選択してください');
    const id = crypto.randomUUID();
    // Imported and typed bookings link to the trip's place for their venue when one matches.
    if (input.placeId === undefined) input = { ...input, placeId: matchBookingPlace(input, cacheRef.current.placesByTrip[tripId] ?? [])?.id ?? null };
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
    assertTripEditable(cacheRef.current, tripId);
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

  // Bookings saved before venues were linked (or by older clients) have no
  // booking_places row; the create flow's matcher links each one, once per
  // session, through the same PATCH an edit sends. Only unlinked venue
  // bookings are looked at, and a linked one is never looked at again.
  const backfilledRef = useRef(new Set<string>());
  useEffect(() => {
    if (isDemo || !synced) return;
    const current = cacheRef.current;
    for (const trip of current.trips) {
      const places = current.placesByTrip[trip.id] ?? [];
      if (trip.role === 'viewer' || !places.length) continue;
      for (const booking of current.bookingsByTrip[trip.id] ?? []) {
        if (booking.placeId || ['flight', 'train', 'car'].includes(booking.kind) || backfilledRef.current.has(booking.id) || !patchableBooking(booking)) continue;
        const place = matchBookingPlace(booking, places);
        if (!place) continue;
        backfilledRef.current.add(booking.id);
        commit((latest) => ({ ...latest, bookingsByTrip: { ...latest.bookingsByTrip, [trip.id]: (latest.bookingsByTrip[trip.id] ?? []).map((entry) => entry.id === booking.id ? { ...entry, placeId: place.id } : entry) } }));
        // The stored 場所 is left out, so it stays exactly as it is.
        const { kind, title, detail, origin, originCode, destination, destinationCode, day, time, endDay, endTime, durationMinutes, confirmationCode, note } = booking;
        enqueue({ method: 'PATCH', path: `/v1/trips/${trip.id}/bookings/${booking.id}`, body: { kind, title, detail, origin, originCode, destination, destinationCode, day, time, endDay, endTime, durationMinutes, confirmationCode, note, placeId: place.id }, backfill: true });
      }
    }
  }, [cache.trips, cache.bookingsByTrip, cache.placesByTrip, synced, isDemo, commit, enqueue]);

  const setFlightConnection = useCallback((id: string, mode: NonNullable<Booking['connectionMode']>, nextFlightId?: string | null) => {
    const tripId = cacheRef.current.selectedTripId;
    assertTripEditable(cacheRef.current, tripId);
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
    assertTripEditable(cacheRef.current, tripId);
    if (!tripId) throw new Error('旅行を選択してください');
    if (isDemo) {
      const document: BookingDocument = { id: crypto.randomUUID(), bookingId, filename: input.filename, contentType: input.contentType, size: input.size, createdAt: Date.now() };
      await saveDemoDocument(document.id, input.bytes);
      commit((current) => ({ ...current, documentsByBooking: { ...current.documentsByBooking, [bookingId]: [...(current.documentsByBooking[bookingId] ?? []), document] } }));
      return document;
    }
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
  }, [commit, requestRaw, isDemo]);

  const deleteBookingDocument = useCallback((bookingId: string, documentId: string) => {
    const tripId = cacheRef.current.selectedTripId;
    assertTripEditable(cacheRef.current, tripId);
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
    if (isDemo) {
      return loadDemoDocument(documentId);
    }
    const scope = user?.id ?? 'unknown';
    const cached = await readOfflineFile(scope, documentId);
    if (cached) return cached;
    const response = await requestRaw(`/v1/trips/${tripId}/bookings/${bookingId}/documents/${documentId}`);
    const bytes = await response.arrayBuffer();
    await saveOfflineFile(scope, documentId, bytes);
    return bytes;
  }, [requestRaw, isDemo, user?.id]);

  const saveTripOffline = useCallback(async (onProgress: (done: number, total: number) => void) => {
    const tripId = cacheRef.current.selectedTripId;
    if (!tripId) throw new Error('旅行を選択してください');
    await sync();
    const snapshot = cacheRef.current;
    const scope = isDemo ? 'demo' : user?.id;
    await saveTravelCache(snapshot, scope);
    const documents = (snapshot.bookingsByTrip[tripId] ?? []).flatMap((booking) =>
      (snapshot.documentsByBooking[booking.id] ?? []).map((document) => ({ ...document, bookingId: booking.id })));
    for (const [index, document] of documents.entries()) {
      onProgress(index, documents.length);
      if (isDemo) await loadDemoDocument(document.id);
      else if (!(await readOfflineFile(scope ?? 'unknown', document.id))) {
        const response = await requestRaw(`/v1/trips/${tripId}/bookings/${document.bookingId}/documents/${document.id}`);
        await saveOfflineFile(scope ?? 'unknown', document.id, await response.arrayBuffer());
      }
    }
    onProgress(documents.length, documents.length);
    return documents.length;
  }, [isDemo, requestRaw, sync, user?.id]);

  const deleteBooking = useCallback((id: string, inTrip?: string) => {
    const tripId = inTrip ?? cacheRef.current.selectedTripId;
    assertTripEditable(cacheRef.current, tripId);
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
    assertTripEditable(cacheRef.current, tripId);
    if (!tripId) throw new Error('旅行を選択してください');
    const id = crypto.randomUUID();
    const item = withOwnTick({ id, ...input }, user?.id);
    commit((current) => ({
      ...current,
      packingByTrip: { ...current.packingByTrip, [tripId]: [...(current.packingByTrip[tripId] ?? []), item] },
    }));
    enqueue({ method: 'POST', path: `/v1/trips/${tripId}/packing`, body: { id, ...input } });
    return id;
  }, [commit, enqueue, user?.id]);

  const updatePackingItem = useCallback((id: string, input: PackingInput) => {
    const tripId = cacheRef.current.selectedTripId;
    assertTripEditable(cacheRef.current, tripId);
    if (!tripId) return;
    commit((current) => ({
      ...current,
      packingByTrip: {
        ...current.packingByTrip,
        [tripId]: (current.packingByTrip[tripId] ?? []).map((item) => item.id === id ? withOwnTick({ ...item, ...input }, user?.id) : item),
      },
    }));
    enqueue({ method: 'PATCH', path: `/v1/trips/${tripId}/packing/${id}`, body: input });
  }, [commit, enqueue, user?.id]);

  const deletePackingItem = useCallback((id: string, inTrip?: string) => {
    const tripId = inTrip ?? cacheRef.current.selectedTripId;
    assertTripEditable(cacheRef.current, tripId);
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
    assertTripEditable(cacheRef.current, tripId);
    if (!tripId) throw new Error('旅行を選択してください');
    const id = crypto.randomUUID();
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
    assertTripEditable(cacheRef.current, tripId);
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

  const deleteTask = useCallback((id: string, inTrip?: string) => {
    const tripId = inTrip ?? cacheRef.current.selectedTripId;
    assertTripEditable(cacheRef.current, tripId);
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

  const [removal, setRemoval] = useState<{ kind: RemovalKind; id: string; tripId: string | null; message: string } | null>(null);
  const removalRef = useRef(removal);
  const removalTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const commitRemoval = useCallback(() => {
    clearTimeout(removalTimer.current);
    const pending = removalRef.current;
    removalRef.current = null;
    setRemoval(null);
    if (!pending) return;
    const { kind, id, tripId } = pending;
    try {
      if (kind === 'trip') void deleteTrip(id).catch((cause) => setError(cause instanceof Error ? cause.message : '削除できませんでした'));
      else if (tripId) ({ booking: deleteBooking, task: deleteTask, packing: deletePackingItem, place: deletePlace })[kind](id, tripId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '削除できませんでした');
    }
  }, [deleteBooking, deletePackingItem, deletePlace, deleteTask, deleteTrip]);
  const commitRef = useRef(commitRemoval);
  commitRef.current = commitRemoval;
  useEffect(() => {
    const commitNow = () => commitRef.current();
    globalThis.window?.addEventListener('pagehide', commitNow);
    return () => { globalThis.window?.removeEventListener('pagehide', commitNow); commitNow(); };
  }, []);
  const removeLater = useCallback((kind: RemovalKind, id: string, message: string) => {
    commitRef.current();
    const tripId = cacheRef.current.selectedTripId;
    if (kind !== 'trip') assertTripEditable(cacheRef.current, tripId);
    const next = { kind, id, tripId, message };
    removalRef.current = next;
    setRemoval(next);
    removalTimer.current = setTimeout(() => commitRef.current(), REMOVAL_UNDO_MS);
  }, []);
  const undoRemoval = useCallback(() => {
    clearTimeout(removalTimer.current);
    removalRef.current = null;
    setRemoval(null);
  }, []);
  const gone = (kind: RemovalKind) => <T extends { id: string }>(entry: T) => !(removal?.kind === kind && removal.id === entry.id);
  const removalShown = useMemo(() => removal && { message: removal.message, key: `${removal.kind}:${removal.id}` }, [removal]);
  const trips = useMemo(() => cache.trips.filter((trip) => !(removal?.kind === 'trip' && removal.id === trip.id)), [cache.trips, removal]);
  const selectedTrip = trips.find((trip) => trip.id === cache.selectedTripId) ?? null;
  const items = [...(selectedTrip ? cache.itemsByTrip[selectedTrip.id] ?? [] : [])]
    .sort((a, b) => `${a.day} ${a.time} ${a.id}`.localeCompare(`${b.day} ${b.time} ${b.id}`));
  const bookings = (selectedTrip ? cache.bookingsByTrip[selectedTrip.id] ?? [] : []).filter(gone('booking'))
    .sort((a, b) => `${a.day} ${a.time} ${a.id}`.localeCompare(`${b.day} ${b.time} ${b.id}`));
  // Packing keeps the order things were added in (the server lists by rowid),
  // so ticking never moves a row (kondo-prep3).
  const packingItems = (selectedTrip ? cache.packingByTrip[selectedTrip.id] ?? [] : []).filter(gone('packing'));
  const tasks = (selectedTrip ? cache.tasksByTrip[selectedTrip.id] ?? [] : []).filter(gone('task'))
    .sort((a, b) => `${a.done ? 1 : 0} ${a.dueOn || '9999-12-31'} ${a.title} ${a.id}`.localeCompare(`${b.done ? 1 : 0} ${b.dueOn || '9999-12-31'} ${b.title} ${b.id}`));
  const membersOf = useCallback((tripId: string): TripMember[] => {
    const stored = cache.membersByTrip?.[tripId];
    const entries: TripMember[] = isDemo && !stored ? demoMembers.map((member) => ({ ...member })) : stored ?? [];
    return entries.map((member) => member.id === user?.id ? { ...member, name: user.name, avatarUrl: user.avatarUrl ?? member.avatarUrl } : member);
  }, [cache.membersByTrip, isDemo, user]);
  const members = useMemo<TripMember[]>(() => membersOf(cache.selectedTripId ?? ''), [membersOf, cache.selectedTripId]);
  const value = useMemo<TravelContextValue>(() => ({
    members,
    membersOf,
    ready,
    canEdit: Boolean(selectedTrip && selectedTrip.role !== 'viewer'),
    syncing,
    error,
    trips,
    selectedTrip,
    items,
    bookings,
    documentsByBooking: cache.documentsByBooking,
    packingItems,
    tasks,
    places: (selectedTrip ? cache.placesByTrip[selectedTrip.id] ?? [] : []).filter(gone('place')),
    notes: selectedTrip ? cache.notesByTrip?.[selectedTrip.id] ?? [] : [],
    saveNote, deleteNote,
    createPlace, updatePlace, deletePlace, deleteTrip, saveTripOffline,
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
    removeLater,
    removal: removalShown,
    undoRemoval,
  }), [removeLater, removalShown, undoRemoval, trips, removal, saveNote, deleteNote, cache.notesByTrip, members, membersOf, saveTripOffline, createPlace, updatePlace, deletePlace, deleteTrip, cache.placesByTrip, acceptInvite, bookings, cache.documentsByBooking, cache.pending.length, createBooking, createInvite, createItem, createPackingItem, createTask, createTrip, deleteBooking, deleteBookingDocument, deleteItem, deletePackingItem, deleteTask, downloadBookingDocument, error, items, packingItems, ready, selectTrip, selectedTrip, setFlightConnection, sync, syncing, tasks, updateBooking, updateItem, updatePackingItem, updateTask, updateTrip, uploadBookingDocument]);

  return <TravelContext.Provider value={value}>{children}</TravelContext.Provider>;
}

export function useTravel() {
  const value = useContext(TravelContext);
  if (!value) throw new Error('useTravel must be used inside TravelProvider');
  return value;
}
