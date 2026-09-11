import type { GmailImportCandidate, parseGmailMessage } from './gmail-import';

export type GmailMessage = Parameters<typeof parseGmailMessage>[0];
export type GmailReviewMessage = { sourceMessageId: string; subject: string; sender: string; reason: 'unparsed' | 'outside-trip' };
export type GmailParsedMessage = { id: string; subject: string; sender: string; candidates: GmailImportCandidate[] };
export const GMAIL_PAGE_SIZE = 20;
export const GMAIL_INTERVAL_MS = 5000; // <= 4,860 units/minute, including list calls (6,000 user quota).

export function gmailSearchQuery(query: string) {
  // Explicit searches go directly to Gmail's index, including sender and booking references.
  // Do not constrain received dates: bookings often arrive months before travel.
  return query.trim() || '{予約 reservation booking itinerary e-ticket boarding hotel check-in train rail 新幹線 搭乗 宿泊}';
}

export class GmailReadError extends Error {
  retryAfterSeconds: number;
  constructor(message: string, status: number, retryAfter?: string | null) {
    super(message);
    const limited = status === 429 || /quota|rate.?limit|too many concurrent|userRateLimitExceeded/i.test(message);
    const transient = limited || status >= 500;
    const delay = Number(retryAfter) || (retryAfter ? (Date.parse(retryAfter) - Date.now()) / 1000 : 0);
    this.retryAfterSeconds = transient ? Math.max(limited ? 10 : 2, Number.isFinite(delay) ? delay : 0) : 0;
  }
}

export async function gmailJson<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(20000) });
  const result = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new GmailReadError(result.error?.message ?? 'Gmailを読み込めませんでした', response.status, response.headers.get('retry-after'));
  return result;
}

// Each multipart response is matched by Content-ID. Successful parts survive a rate limit
// in another part; only failed IDs are retried. Deleted messages count as processed.
export function parseGmailBatch(text: string, contentType: string, ids: string[]) {
  const boundary = /boundary="?([^";\r\n]+)"?/i.exec(contentType)?.[1];
  if (!boundary) throw new Error('Gmailの一括応答を読み取れませんでした');
  const messages: GmailMessage[] = [];
  const done = new Set<string>();
  let retryAfterSeconds = 0;
  let error = '';
  for (const raw of text.split(`--${boundary}`)) {
    const part = raw.replaceAll('\r\n', '\n');
    const httpStart = part.search(/HTTP\/1\.[01]\s+\d{3}/);
    if (httpStart < 0) continue;
    const index = Number(/Content-ID:\s*<?(?:response-)?message-(\d+)/i.exec(part.slice(0, httpStart))?.[1]);
    const id = ids[index];
    if (!id || done.has(id)) throw new Error('Gmailの応答とメールが一致しません');
    const status = Number(/HTTP\/1\.[01]\s+(\d{3})/.exec(part.slice(httpStart))?.[1]);
    if (status === 404) { done.add(id); continue; }
    const bodyStart = part.indexOf('\n\n', httpStart);
    if (bodyStart < 0) throw new Error('Gmailの一括応答を読み取れませんでした');
    const result = JSON.parse(part.slice(bodyStart + 2).trim()) as GmailMessage & { error?: { message?: string } };
    if (status >= 200 && status < 300) {
      if (result.id !== id) throw new Error('Gmailの応答とメールが一致しません');
      messages.push(result); done.add(id);
    } else {
      const failure = new GmailReadError(result.error?.message ?? 'メールを読み込めませんでした', status,
        /\nRetry-After:\s*([^\n]+)/i.exec(part)?.[1]);
      retryAfterSeconds = Math.max(retryAfterSeconds, failure.retryAfterSeconds);
      if (!failure.retryAfterSeconds) error = failure.message;
    }
  }
  const pendingIds = ids.filter((id) => !done.has(id));
  if (pendingIds.length && !retryAfterSeconds && !error) error = '一部のメールの応答がありません。続きから再試行してください。';
  return { messages, pendingIds, scanned: done.size, retryAfterSeconds, error };
}

export async function gmailMessageBatch(ids: string[], accessToken: string) {
  const boundary = `tabi_${crypto.randomUUID().replaceAll('-', '')}`;
  const body = ids.map((id, index) => [
    `--${boundary}`, 'Content-Type: application/http', `Content-ID: <message-${index}>`, '',
    `GET /gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full HTTP/1.1`, '',
  ].join('\r\n')).join('\r\n') + `\r\n--${boundary}--\r\n`;
  const response = await fetch('https://gmail.googleapis.com/batch/gmail/v1', {
    method: 'POST', headers: { authorization: `Bearer ${accessToken}`, 'content-type': `multipart/mixed; boundary=${boundary}` },
    body, signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  if (!response.ok) {
    let message = 'Gmailの一括読み込みに失敗しました';
    try { message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? message; } catch { /* Non-JSON gateway response. */ }
    throw new GmailReadError(message, response.status, response.headers.get('retry-after'));
  }
  return parseGmailBatch(text, response.headers.get('content-type') ?? '', ids);
}
