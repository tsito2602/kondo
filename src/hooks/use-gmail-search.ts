import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '@/auth/auth-provider';
import { GmailSearch, type GmailSearchPage } from '@/data/gmail-search';

export function useGmailSearch(tripId?: string, startsOn?: string, endsOn?: string) {
  const { request, user } = useAuth();
  const search = useMemo(() => new GmailSearch((input, signal) => {
    if (!user?.id || !tripId || !startsOn || !endsOn) return Promise.reject(new Error('旅行を選択してください'));
    return request<GmailSearchPage>(
      `/v1/trips/${tripId}/gmail/candidates`, { method: 'POST', body: JSON.stringify(input), signal },
    );
  }), [request, tripId, user?.id, startsOn, endsOn]); // Isolate all travel/account/date changes.
  useEffect(() => () => search.dispose(), [search]);
  const state = useSyncExternalStore(search.subscribe, search.getSnapshot, search.getSnapshot);
  return { search, ...state };
}
