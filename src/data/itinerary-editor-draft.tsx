import * as Crypto from 'expo-crypto';
import { createContext, type PropsWithChildren, useCallback, useContext, useMemo, useRef, useState } from 'react';

import { useTravel } from './travel-provider';
import type { ItineraryItem, Place } from './types';

type TravelValue = ReturnType<typeof useTravel>;
type ItemInput = Parameters<TravelValue['createItem']>[0];
type PlaceInput = Parameters<TravelValue['updatePlace']>[1];

export type ItineraryDraftControl = {
  dirty: boolean;
  saving: boolean;
  error: string;
  commit: () => boolean;
  discard: () => void;
};

type ItineraryTravelValue = TravelValue & { itineraryDraft?: ItineraryDraftControl };

const ItineraryTravelContext = createContext<ItineraryTravelValue | null>(null);
const clone = <Value,>(value: Value): Value => JSON.parse(JSON.stringify(value)) as Value;

function itemInput(item: ItineraryItem): ItemInput {
  return {
    day: item.day,
    time: item.time,
    kind: item.kind,
    title: item.title,
    note: item.note,
    details: item.details ? clone(item.details) : undefined,
  };
}

function placeInput(place: Place): PlaceInput {
  return {
    title: place.title,
    note: place.note,
    openingHours: place.openingHours,
    reservationStatus: place.reservationStatus,
    location: place.location,
    referenceLinks: place.referenceLinks ? clone(place.referenceLinks) : undefined,
    itineraryItemId: place.itineraryItemId ?? null,
    status: place.status,
  };
}

function comparable(items: ItineraryItem[], places: Place[]) {
  return JSON.stringify([
    items.map((item) => [item.id, itemInput(item)] as const).sort(([left], [right]) => left.localeCompare(right)),
    places.map((place) => [place.id, placeInput(place)] as const).sort(([left], [right]) => left.localeCompare(right)),
  ]);
}

function remapEntryKey(value: string | null | undefined, ids: Map<string, string>) {
  if (!value?.startsWith('item-')) return value;
  const id = value.slice(5);
  return ids.has(id) ? `item-${ids.get(id)}` : value;
}

function remapItem(item: ItineraryItem, ids: Map<string, string>): ItineraryItem {
  if (!item.details) return item;
  const details = clone(item.details);
  if (details.placement) {
    details.placement = {
      ...details.placement,
      beforeKey: remapEntryKey(details.placement.beforeKey, ids) ?? null,
      afterKey: remapEntryKey(details.placement.afterKey, ids) ?? null,
    };
  }
  if (details.transport?.afterKey) {
    details.transport = { ...details.transport, afterKey: remapEntryKey(details.transport.afterKey, ids) ?? undefined };
  }
  return { ...item, details };
}

function provisionalInput(item: ItineraryItem): ItemInput {
  const input = itemInput(item);
  if (!input.details) return input;
  return {
    ...input,
    details: {
      ...input.details,
      placement: null,
      ...(input.details.transport ? { transport: { ...input.details.transport, afterKey: undefined } } : {}),
    },
  };
}

export function useItineraryTravel(): ItineraryTravelValue {
  const root = useTravel();
  return useContext(ItineraryTravelContext) ?? root;
}

export function ItineraryDraftProvider({ children }: PropsWithChildren) {
  const root = useTravel();
  const [tripId] = useState(() => root.selectedTrip?.id ?? '');
  const [baseItems] = useState(() => clone(root.items));
  const [basePlaces] = useState(() => clone(root.places));
  const [baseSignature] = useState(() => comparable(root.items, root.places));
  const [items, setItems] = useState(() => clone(root.items));
  const [places, setPlaces] = useState(() => clone(root.places));
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState('');
  const dirty = comparable(items, places) !== baseSignature;

  const createItem = useCallback((input: ItemInput) => {
    const id = `draft-${Crypto.randomUUID()}`;
    setItems((current) => [...current, { id, ...clone(input) }]);
    setError('');
    return id;
  }, []);

  const updateItem = useCallback((id: string, input: ItemInput) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...clone(input) } : item));
    setError('');
  }, []);

  const deleteItem = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    setError('');
  }, []);

  const updatePlace = useCallback((id: string, input: PlaceInput) => {
    setPlaces((current) => current.map((place) => place.id === id ? { ...place, ...clone(input) } : place));
    setError('');
  }, []);

  const discard = useCallback(() => {
    setItems(clone(baseItems));
    setPlaces(clone(basePlaces));
    setError('');
  }, [baseItems, basePlaces]);

  const commit = useCallback(() => {
    if (savingRef.current) return false;
    if (!root.canEdit || root.selectedTrip?.id !== tripId) {
      setError('旅行または編集権限が変更されました。閉じて開き直してください。');
      return false;
    }
    if (comparable(root.items, root.places) !== baseSignature) {
      setError('しおりが別の端末で更新されました。変更を失わないため、閉じて開き直してください。');
      return false;
    }

    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const baseById = new Map(baseItems.map((item) => [item.id, item]));
      const draftById = new Map(items.map((item) => [item.id, item]));
      const ids = new Map<string, string>();

      for (const item of items) {
        if (baseById.has(item.id)) continue;
        ids.set(item.id, root.createItem(provisionalInput(item)));
      }

      for (const item of items) {
        const targetId = ids.get(item.id) ?? item.id;
        const finalInput = itemInput(remapItem(item, ids));
        const original = baseById.get(item.id);
        if (!original || JSON.stringify(finalInput) !== JSON.stringify(itemInput(original))) {
          root.updateItem(targetId, finalInput);
        }
      }

      for (const item of baseItems) {
        if (!draftById.has(item.id)) root.deleteItem(item.id);
      }

      const basePlacesById = new Map(basePlaces.map((place) => [place.id, place]));
      for (const place of places) {
        const mapped = {
          ...place,
          itineraryItemId: place.itineraryItemId ? ids.get(place.itineraryItemId) ?? place.itineraryItemId : place.itineraryItemId,
        };
        const input = placeInput(mapped);
        const original = basePlacesById.get(place.id);
        if (original && JSON.stringify(input) !== JSON.stringify(placeInput(original))) root.updatePlace(place.id, input);
      }
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'しおりを保存できませんでした。');
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [baseItems, basePlaces, baseSignature, items, places, root, tripId]);

  const itineraryDraft = useMemo<ItineraryDraftControl>(() => ({ dirty, saving, error, commit, discard }), [commit, dirty, discard, error, saving]);
  const value = useMemo<ItineraryTravelValue>(() => ({
    ...root,
    items,
    places,
    createItem,
    updateItem,
    deleteItem,
    updatePlace,
    itineraryDraft,
  }), [createItem, deleteItem, itineraryDraft, items, places, root, updateItem, updatePlace]);

  return <ItineraryTravelContext.Provider value={value}>{children}</ItineraryTravelContext.Provider>;
}
