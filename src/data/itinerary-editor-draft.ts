import { createContext, useContext } from 'react';

import { useTravel } from '@/data/travel-provider';

export type TravelValue = ReturnType<typeof useTravel>;
export type ItineraryDraftControl = {
  dirty: boolean;
  saving: boolean;
  error: string;
  commit: () => boolean;
  discard: () => void;
};
export type ItineraryTravelValue = TravelValue & { itineraryDraft?: ItineraryDraftControl };

export const ItineraryTravelContext = createContext<ItineraryTravelValue | null>(null);

export function useItineraryTravel(): ItineraryTravelValue {
  const root = useTravel();
  return useContext(ItineraryTravelContext) ?? root;
}
