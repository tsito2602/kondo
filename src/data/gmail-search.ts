import type { GmailImportCandidate } from './types';

export type GmailReviewMessage = { sourceMessageId: string; subject: string; sender: string; reason: 'unparsed' | 'outside-trip' };
export type GmailSearchPage = {
  candidates: GmailImportCandidate[];
  reviewMessages: GmailReviewMessage[];
  nextPageToken: string | null;
  pendingIds: string[];
  scanned: number;
  retryAfterSeconds: number;
  nextRequestAfterMs: number;
  error?: string;
};
export type GmailSearchState = {
  status: 'idle' | 'running' | 'waiting' | 'stopping' | 'paused' | 'complete' | 'error';
  candidates: GmailImportCandidate[];
  reviewMessages: GmailReviewMessage[];
  query: string;
  scanned: number;
  retryAt: number;
  error: string;
};
type RequestPage = (input: { query: string; pageToken: string | null; pendingIds: string[] }, signal: AbortSignal) => Promise<GmailSearchPage>;

const initialState = (): GmailSearchState => ({ status: 'idle', candidates: [], reviewMessages: [], query: '', scanned: 0, retryAt: 0, error: '' });

// One controller per user/trip. Search sessions live only in memory; parsed server fields
// are cached separately so closing/reopening the sheet never starts from page one.
export class GmailSearch {
  state = initialState();
  private cursor: { pageToken: string | null; pendingIds: string[] } = { pageToken: null, pendingIds: [] };
  private generation = 0;
  private paused = false;
  private abort?: AbortController;
  private wake?: () => void;
  private listeners = new Set<() => void>();
  private nextRequestAt = 0;
  constructor(private requestPage: RequestPage) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.state;
  private update(patch: Partial<GmailSearchState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private wait(ms: number) {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(done, Math.max(0, ms));
      const self = this;
      function done() { clearTimeout(timer); self.wake = undefined; resolve(); }
      this.wake = done;
    });
  }
  pause = () => {
    if (!['running', 'waiting'].includes(this.state.status)) return;
    this.paused = true;
    this.update({ status: 'stopping' });
    this.wake?.();
  };
  dispose = () => { this.generation++; this.abort?.abort(); this.wake?.(); };
  markImported = (sourceMessageId: string) => {
    this.update({ candidates: this.state.candidates.map((candidate) => candidate.sourceMessageId === sourceMessageId
      ? { ...candidate, alreadyImported: true } : candidate),
    reviewMessages: this.state.reviewMessages.filter((message) => message.sourceMessageId !== sourceMessageId) });
  };
  start = async (query = this.state.query, restart = false) => {
    query = query.trim();
    if (!restart && query === this.state.query && ['running', 'waiting', 'stopping', 'complete'].includes(this.state.status)) return;
    this.dispose();
    const generation = this.generation;
    const abort = new AbortController(); this.abort = abort; this.paused = false;
    if (restart || query !== this.state.query) { this.cursor = { pageToken: null, pendingIds: [] }; this.state = initialState(); }
    this.update({ status: 'running', query, error: '' });
    let retries = 0;
    try {
      while (generation === this.generation) {
        if (this.nextRequestAt > Date.now()) await this.wait(this.nextRequestAt - Date.now());
        if (generation !== this.generation) return;
        if (this.paused) { this.update({ status: 'paused', retryAt: 0 }); return; }
        const page = await this.requestPage({ query, ...this.cursor }, abort.signal);
        if (generation !== this.generation) return;
        this.cursor = { pageToken: page.nextPageToken, pendingIds: page.pendingIds };
        const candidates = new Map(this.state.candidates.map((candidate) => [`${candidate.sourceMessageId}|${candidate.fingerprint}`, candidate]));
        for (const candidate of page.candidates) {
          const key = `${candidate.sourceMessageId}|${candidate.fingerprint}`;
          const current = candidates.get(key);
          candidates.set(key, current?.alreadyImported ? { ...candidate, alreadyImported: true } : candidate);
        }
        const review = new Map(this.state.reviewMessages.map((message) => [message.sourceMessageId, message]));
        page.reviewMessages.forEach((message) => review.set(message.sourceMessageId, message));
        this.update({ candidates: [...candidates.values()], reviewMessages: [...review.values()], scanned: this.state.scanned + page.scanned });
        this.nextRequestAt = Date.now() + page.nextRequestAfterMs;
        if (page.error) throw new Error(page.error);
        if (!page.pendingIds.length && !page.nextPageToken && !page.retryAfterSeconds) {
          this.update({ status: 'complete', retryAt: 0 }); return;
        }
        if (page.retryAfterSeconds) {
          retries = page.scanned ? 0 : retries + 1;
          if (retries > 10) throw new Error('Gmailへの接続が回復しませんでした。候補を残して停止しました。');
          // Honor Retry-After and use bounded exponential backoff for sustained failures.
          const seconds = Math.max(page.retryAfterSeconds, Math.min(60, 2 ** retries));
          this.nextRequestAt = Math.max(this.nextRequestAt, Date.now() + seconds * 1000);
          this.update({ status: 'waiting', retryAt: this.nextRequestAt });
        } else { retries = 0; this.update({ status: 'running', retryAt: 0 }); }
        if (this.paused) { this.update({ status: 'paused', retryAt: 0 }); return; }
      }
    } catch (cause) {
      if (generation !== this.generation) return;
      this.update({ status: 'error', retryAt: 0, error: cause instanceof Error ? cause.message : 'Gmailを読み込めませんでした。' });
    }
  };
}
