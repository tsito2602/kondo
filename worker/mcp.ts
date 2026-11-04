/// <reference types="@cloudflare/workers-types" />
/**
 * kondo's MCP server for AI agents such as Muse (streamable HTTP, JSON
 * responses only, no sessions). An agent key stands for one member: every
 * tool goes through the same /v1 routes the app uses, so validation, trip
 * membership and 閲覧のみ apply unchanged. Deleting is left out on purpose:
 * an agent adds and edits, a person deletes in the app.
 */

export type ApiCall = (method: string, path: string, body?: unknown) => Promise<{ status: number; data: any }>;

/** A body sent as raw bytes with its own headers (a booking document), not as JSON. */
export class RawBody {
  constructor(readonly bytes: Uint8Array<ArrayBuffer>, readonly headers: Record<string, string>) {}
}

const DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif'];
/** Inline base64 is for small files; larger ones go through upload_booking_document's URL. */
const INLINE_LIMIT = 8 * 1024 * 1024;

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS = `kondo is a shared travel planner (旅のしおり). Data is in Japanese; reply to the user in Japanese.
Start with list_trips, then get_trip to read everything in one trip (plans, bookings, places, packing, tasks, notes, members).
Dates are YYYY-MM-DD, times HH:MM (24h) or "" for no time. To edit, pass the id and only the fields to change; the rest is kept.
Assignees are "member:<userId>" with ids from get_trip's members. Booking files (PDF e-tickets, receipts) can be attached with attach_booking_document or upload_booking_document.
Nothing can be deleted through this server; ask the user to delete in the app.`;

type Tool = { name: string; description: string; inputSchema: Record<string, unknown>; write: boolean; run: (api: ApiCall, args: Record<string, any>) => Promise<unknown> };

class ToolError extends Error {}

const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'string', description, ...extra });
const tripId = str('Trip id from list_trips');
const date = (description: string) => str(description, { pattern: '^\\d{4}-\\d{2}-\\d{2}$' });
const time = (description: string) => str(description, { pattern: '^(([01]\\d|2[0-3]):[0-5]\\d)?$' });
const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });

const PLAN_CATEGORIES: Record<string, string> = { sightseeing: '観光', meal: '食事', transport: '移動', shopping: '買い物', other: 'その他' };
const TRANSPORT_MODES = ['walk', 'train', 'bus', 'car', 'taxi', 'flight', 'boat', 'other'];
const PACKING_CATEGORIES = ['書類・お金', '衣類', '洗面・コスメ', '薬', '電子機器', 'その他'];
const RESERVATION = ['not_needed', 'needed', 'confirmed', 'unavailable'];

async function ok(api: ApiCall, method: string, path: string, body?: unknown) {
  const { status, data } = await api(method, path, body);
  if (status >= 400) throw new ToolError(typeof data?.error === 'string' ? data.error : `HTTP ${status}`);
  return data;
}

/** Only the given keys of an object, skipping undefined. */
function pick(source: Record<string, any>, keys: string[]) {
  return Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
}

async function findIn(api: ApiCall, trip: string, collection: string, key: string, id: string) {
  const data = await ok(api, 'GET', `/trips/${trip}/${collection}`);
  const found = (data[key] as any[]).find((row) => row.id === id);
  if (!found) throw new ToolError(`${id} が見つかりません`);
  return found;
}

const tripPath = (id: unknown) => {
  if (typeof id !== 'string' || !/^[A-Za-z0-9-]{1,100}$/.test(id)) throw new ToolError('tripId を確認してください');
  return id;
};

export const tools: Tool[] = [
  {
    name: 'list_trips',
    description: 'List the trips this account belongs to (id, name, destination, dates, your role).',
    inputSchema: object({}),
    write: false,
    run: async (api) => {
      const { trips } = await ok(api, 'GET', '/trips');
      return { trips: trips.map(({ coverImage, ...trip }: any) => trip) };
    },
  },
  {
    name: 'get_trip',
    description: 'Read one whole trip: its plans (しおり), bookings (予約), places (行きたい場所), packing list (持ち物), tasks (やること), notes (メモ) and members.',
    inputSchema: object({ tripId }, ['tripId']),
    write: false,
    run: async (api, args) => {
      const id = tripPath(args.tripId);
      const { trips } = await ok(api, 'GET', '/trips');
      const trip = trips.find((row: any) => row.id === id);
      if (!trip) throw new ToolError('旅行が見つかりません');
      const get = (path: string) => ok(api, 'GET', `/trips/${id}/${path}`);
      const [members, items, bookings, places, packing, tasks, notes, me, documents] = await Promise.all([
        get('members'), get('items'), get('bookings'), get('places'), get('packing'), get('tasks'), get('notes'), ok(api, 'GET', '/me'), get('booking-documents'),
      ]);
      const { coverImage, ...summary } = trip;
      return {
        trip: summary,
        you: me.user.id,
        members: members.members.map(({ id, name, role }: any) => ({ id, name, role })),
        plans: items.items,
        bookings: bookings.bookings.map((booking: any) => ({
          ...booking,
          documents: documents.documents.filter((document: any) => document.bookingId === booking.id).map(({ id, filename, contentType, size }: any) => ({ id, filename, contentType, size })),
        })),
        places: places.places,
        packing: packing.items,
        tasks: tasks.tasks,
        notes: notes.notes.map(({ content, ...note }: any) => note),
      };
    },
  },
  {
    name: 'create_trip',
    description: 'Create a new trip. You become its owner.',
    inputSchema: object({ name: str('Trip name'), destination: str('Where to'), startsOn: date('First day'), endsOn: date('Last day') }, ['name', 'startsOn', 'endsOn']),
    write: true,
    run: async (api, args) => (await ok(api, 'POST', '/trips', { destination: '', ...pick(args, ['name', 'destination', 'startsOn', 'endsOn']) })).trip,
  },
  {
    name: 'update_trip',
    description: "Change a trip's name, destination or dates.",
    inputSchema: object({ tripId, name: str('Trip name'), destination: str('Where to'), startsOn: date('First day'), endsOn: date('Last day') }, ['tripId']),
    write: true,
    run: async (api, args) => {
      const id = tripPath(args.tripId);
      const { trips } = await ok(api, 'GET', '/trips');
      const trip = trips.find((row: any) => row.id === id);
      if (!trip) throw new ToolError('旅行が見つかりません');
      const merged = { ...pick(trip, ['name', 'destination', 'startsOn', 'endsOn']), ...pick(args, ['name', 'destination', 'startsOn', 'endsOn']) };
      const { coverImage, ...saved } = (await ok(api, 'PATCH', `/trips/${id}`, merged)).trip;
      return saved;
    },
  },
  {
    name: 'save_plan',
    description: 'Add a plan to the itinerary (しおり), or edit one when planId is given.',
    inputSchema: object({
      tripId,
      planId: str('Existing plan id to edit; omit to add'),
      day: date('Day of the plan'),
      time: time('Start time, "" for none'),
      title: str('Plan name'),
      note: str('Free text'),
      category: str('Category', { enum: Object.keys(PLAN_CATEGORIES) }),
      location: str('Where'),
      endDay: date('End day (set with endTime), "" for none'),
      endTime: time('End time (set with endDay), "" for none'),
      transport: object({ mode: str('How', { enum: TRANSPORT_MODES }), origin: str('From'), destination: str('To'), durationMinutes: { type: 'integer', minimum: 1, maximum: 10080 } }, ['mode']),
    }, ['tripId']),
    write: true,
    run: async (api, args) => {
      const id = tripPath(args.tripId);
      const existing = args.planId ? await findIn(api, id, 'items', 'items', args.planId) : null;
      if (!existing && (!args.day || !args.title)) throw new ToolError('新しい予定には day と title が必要です');
      const top = { time: '', note: '', ...pick(existing ?? {}, ['day', 'time', 'title', 'note']), ...pick(args, ['day', 'time', 'title', 'note']) };
      const previous = existing?.details ?? { category: Object.entries(PLAN_CATEGORIES).find(([, label]) => label === existing?.kind)?.[0] ?? 'other', location: '', endDay: '', endTime: '' };
      const details: Record<string, any> = { ...previous, ...pick(args, ['category', 'location', 'endDay', 'endTime']) };
      if (details.category === 'transport') {
        if (args.transport || !details.transport) details.transport = { origin: '', destination: '', ...(details.transport ?? {}), ...(args.transport ?? { mode: 'other' }) };
      } else delete details.transport;
      const body = { ...top, kind: PLAN_CATEGORIES[details.category] ?? 'その他', details };
      const data = existing ? await ok(api, 'PATCH', `/trips/${id}/items/${existing.id}`, body) : await ok(api, 'POST', `/trips/${id}/items`, body);
      return data.item;
    },
  },
  {
    name: 'save_booking',
    description: 'Add a booking (予約: flight, hotel, train, car, restaurant, ticket, other), or edit one when bookingId is given. Flights use origin/destination with IATA codes.',
    inputSchema: object({
      tripId,
      bookingId: str('Existing booking id to edit; omit to add'),
      kind: str('Kind', { enum: ['flight', 'hotel', 'train', 'car', 'restaurant', 'ticket', 'other'] }),
      title: str('Name, e.g. airline + flight number or hotel name'),
      detail: str('Short detail (hotel: address)'),
      location: str('Google Maps link or other map URL'),
      origin: str('From (flight/train)'),
      originCode: str('From airport IATA code'),
      destination: str('To (flight/train)'),
      destinationCode: str('To airport IATA code'),
      day: date('Start day (check-in, departure)'),
      time: time('Start time, "" for none'),
      endDay: date('End day (check-out, arrival)'),
      endTime: time('End time, "" for none'),
      confirmationCode: str('予約番号'),
      note: str('Free text'),
      placeId: { type: ['string', 'null'], description: 'Link to a place of this trip, null to unlink' },
    }, ['tripId']),
    write: true,
    run: async (api, args) => {
      const id = tripPath(args.tripId);
      const fields = ['kind', 'title', 'detail', 'location', 'origin', 'originCode', 'destination', 'destinationCode', 'day', 'time', 'endDay', 'endTime', 'confirmationCode', 'note', 'placeId'];
      const existing = args.bookingId ? await findIn(api, id, 'bookings', 'bookings', args.bookingId) : null;
      if (!existing && (!args.kind || !args.title || !args.day)) throw new ToolError('新しい予約には kind、title、day が必要です');
      // An omitted location keeps the stored one (a hotel's falls back to its address).
      const body = { detail: '', origin: '', originCode: '', destination: '', destinationCode: '', time: '', endTime: '', confirmationCode: '', note: '', ...pick(existing ?? {}, [...fields.filter((key) => key !== 'location'), 'durationMinutes']), ...pick(args, fields) };
      const data = existing ? await ok(api, 'PATCH', `/trips/${id}/bookings/${existing.id}`, body) : await ok(api, 'POST', `/trips/${id}/bookings`, body);
      return data.booking;
    },
  },
  {
    name: 'attach_booking_document',
    description: 'Attach a file (PDF or image: e-ticket, itinerary receipt, booking confirmation) to a booking, given as base64. Up to 8 MB; for larger files, or when the file is on disk, use upload_booking_document instead.',
    inputSchema: object({
      tripId,
      bookingId: str('Booking id from get_trip'),
      filename: str('File name shown in the app, e.g. "eticket.pdf"'),
      contentType: str('File type', { enum: DOCUMENT_TYPES }),
      dataBase64: str('The file, base64-encoded'),
    }, ['tripId', 'bookingId', 'filename', 'contentType', 'dataBase64']),
    write: true,
    run: async (api, args) => {
      const id = tripPath(args.tripId);
      if (typeof args.bookingId !== 'string' || !/^[A-Za-z0-9-]{1,100}$/.test(args.bookingId)) throw new ToolError('bookingId を確認してください');
      if (typeof args.dataBase64 !== 'string' || args.dataBase64.length > Math.ceil(INLINE_LIMIT / 3) * 4 + 4) throw new ToolError('8MBを超えるファイルは upload_booking_document を使ってください');
      let bytes: Uint8Array<ArrayBuffer>;
      try {
        const raw = atob(args.dataBase64.replace(/^data:[^,]*,/, '').replace(/\s+/g, ''));
        bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
      } catch {
        throw new ToolError('dataBase64 を読めませんでした');
      }
      const data = await ok(api, 'POST', `/trips/${id}/bookings/${args.bookingId}/documents`, new RawBody(bytes, {
        'content-type': String(args.contentType),
        'x-filename': encodeURIComponent(String(args.filename ?? '')),
        'x-file-size': String(bytes.byteLength),
      }));
      return data.document;
    },
  },
  {
    name: 'upload_booking_document',
    description: 'Get a one-time URL (valid 10 minutes) to attach a file to a booking by sending the raw bytes with HTTP PUT, e.g. curl -X PUT --data-binary @eticket.pdf "<uploadUrl>". Up to 20 MB, PDF or image. No Authorization header is needed for the PUT.',
    inputSchema: object({
      tripId,
      bookingId: str('Booking id from get_trip'),
      filename: str('File name shown in the app, e.g. "eticket.pdf"'),
      contentType: str('File type', { enum: DOCUMENT_TYPES }),
    }, ['tripId', 'bookingId', 'filename', 'contentType']),
    write: true,
    run: async (api, args) => {
      const id = tripPath(args.tripId);
      if (typeof args.bookingId !== 'string' || !/^[A-Za-z0-9-]{1,100}$/.test(args.bookingId)) throw new ToolError('bookingId を確認してください');
      return ok(api, 'POST', `/trips/${id}/bookings/${args.bookingId}/document-uploads`, { filename: args.filename, contentType: args.contentType });
    },
  },
  {
    name: 'save_place',
    description: 'Add a place to 行きたい場所, or edit one when placeId is given. A Google Maps link as location puts it on the map.',
    inputSchema: object({
      tripId,
      placeId: str('Existing place id to edit; omit to add'),
      title: str('Place name'),
      location: str('Google Maps link or address'),
      note: str('Free text'),
      openingHours: str('Opening hours as text'),
      reservationStatus: str('予約: not_needed=予約いらない, needed=要予約, confirmed=予約した, unavailable=予約できない', { enum: RESERVATION }),
      referenceLinks: { type: 'array', maxItems: 20, items: object({ label: str('Label'), url: str('https URL') }, ['url']) },
      planId: { type: ['string', 'null'], description: 'Link to a plan of this trip, null to unlink' },
    }, ['tripId']),
    write: true,
    run: async (api, args) => {
      const id = tripPath(args.tripId);
      const existing = args.placeId ? await findIn(api, id, 'places', 'places', args.placeId) : null;
      if (!existing && !args.title) throw new ToolError('新しい場所には title が必要です');
      const body: Record<string, any> = { note: '', openingHours: '', location: '', reservationStatus: 'not_needed', ...pick(existing ?? {}, ['title', 'note', 'openingHours', 'location', 'reservationStatus', 'referenceLinks']), ...pick(args, ['title', 'note', 'openingHours', 'location', 'reservationStatus']) };
      if (body.reservationStatus === 'requested') body.reservationStatus = 'confirmed';
      if (args.referenceLinks) body.referenceLinks = args.referenceLinks.map((link: any) => ({ label: link.label ?? '', url: link.url }));
      if (args.planId !== undefined) body.itineraryItemId = args.planId;
      const data = existing ? await ok(api, 'PATCH', `/trips/${id}/places/${existing.id}`, body) : await ok(api, 'POST', `/trips/${id}/places`, body);
      return data.place;
    },
  },
  {
    name: 'save_packing_item',
    description: 'Add an item to 持ち物, or edit / tick one when itemId is given. kind: each=全員が持つ (everyone packs their own), one=1人が持つ (assignee carries it), mine=自分だけ (only you see it).',
    inputSchema: object({
      tripId,
      itemId: str('Existing item id to edit; omit to add'),
      name: str('Item name'),
      category: str('Category', { enum: PACKING_CATEGORIES }),
      quantity: { type: 'integer', minimum: 1, maximum: 99 },
      kind: str('Who packs it', { enum: ['each', 'one', 'mine'] }),
      assignee: str('For kind one: "member:<userId>", "" for undecided'),
      packed: { type: 'boolean', description: 'Packed. For each it is your own tick' },
    }, ['tripId']),
    write: true,
    run: async (api, args) => {
      const id = tripPath(args.tripId);
      const existing = args.itemId ? await findIn(api, id, 'packing', 'items', args.itemId) : null;
      if (!existing && !args.name) throw new ToolError('新しい持ち物には name が必要です');
      const body = { category: 'その他', quantity: 1, packed: false, kind: 'one', ...pick(existing ?? {}, ['name', 'category', 'quantity', 'packed', 'kind', 'assignee', 'shared']), ...pick(args, ['name', 'category', 'quantity', 'kind', 'assignee', 'packed']) };
      const data = existing ? await ok(api, 'PATCH', `/trips/${id}/packing/${existing.id}`, body) : await ok(api, 'POST', `/trips/${id}/packing`, body);
      return data.item;
    },
  },
  {
    name: 'save_task',
    description: 'Add a task to やること, or edit / tick one when taskId is given. kind: each=全員がやる (everyone ticks their own), one=1人がやる (assignee does it).',
    inputSchema: object({
      tripId,
      taskId: str('Existing task id to edit; omit to add'),
      title: str('Task'),
      dueOn: date('Due date, "" for none'),
      kind: str('Who does it', { enum: ['each', 'one'] }),
      assignee: str('For kind one: "member:<userId>", "" for undecided'),
      done: { type: 'boolean', description: 'Done. For each it is your own tick' },
    }, ['tripId']),
    write: true,
    run: async (api, args) => {
      const id = tripPath(args.tripId);
      const existing = args.taskId ? await findIn(api, id, 'tasks', 'tasks', args.taskId) : null;
      if (!existing && !args.title) throw new ToolError('新しいやることには title が必要です');
      const me = existing ? null : (await ok(api, 'GET', '/me')).user.id;
      const body = { dueOn: '', done: false, ...(me ? { kind: 'one', assignee: `member:${me}` } : {}), ...pick(existing ?? {}, ['title', 'dueOn', 'kind', 'assignee', 'done']), ...pick(args, ['title', 'dueOn', 'kind', 'assignee', 'done']) };
      const data = existing ? await ok(api, 'PATCH', `/trips/${id}/tasks/${existing.id}`, body) : await ok(api, 'POST', `/trips/${id}/tasks`, body);
      return data.task;
    },
  },
  {
    name: 'save_note',
    description: 'Add a note to メモ, or edit one when noteId is given. body is plain text; changing the body of a formatted note replaces its formatting with plain text.',
    inputSchema: object({
      tripId,
      noteId: str('Existing note id to edit; omit to add'),
      title: str('Title'),
      body: str('Text'),
      pinned: { type: 'boolean' },
      placeId: { type: ['string', 'null'], description: 'Link to a place of this trip, null to unlink' },
    }, ['tripId']),
    write: true,
    run: async (api, args) => {
      const id = tripPath(args.tripId);
      const existing = args.noteId ? await findIn(api, id, 'notes', 'notes', args.noteId) : null;
      if (!existing && typeof args.body !== 'string') throw new ToolError('新しいメモには body が必要です');
      const body: Record<string, any> = { id: existing?.id ?? crypto.randomUUID(), ...pick(args, ['title', 'pinned', 'placeId']) };
      if (typeof args.body === 'string') body.body = args.body;
      else {
        body.body = existing.body;
        body.content = existing.content;
      }
      await ok(api, 'POST', `/trips/${id}/notes`, body);
      const saved = await findIn(api, id, 'notes', 'notes', body.id);
      const { content, ...note } = saved;
      return note;
    },
  },
];

type RpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any };

const rpcError = (id: RpcRequest['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

async function answer(message: RpcRequest, api: ApiCall, canWrite: boolean) {
  const { id, method, params } = message;
  if (method === 'initialize') {
    const asked = params?.protocolVersion;
    return { jsonrpc: '2.0', id, result: {
      protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
      capabilities: { tools: {} },
      serverInfo: { name: 'kondo', version: '2.0.0' },
      instructions: canWrite ? INSTRUCTIONS : `${INSTRUCTIONS}\nThis key can only read.`,
    } };
  }
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: tools.filter((tool) => canWrite || !tool.write).map(({ name, description, inputSchema, write }) => ({
      name, description, inputSchema, annotations: { readOnlyHint: !write, destructiveHint: false, idempotentHint: !write, openWorldHint: false },
    })) } };
  }
  if (method === 'tools/call') {
    const tool = tools.find((entry) => entry.name === params?.name);
    if (!tool) return rpcError(id, -32602, `Unknown tool: ${params?.name}`);
    if (tool.write && !canWrite) return { jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: 'このキーは読むだけです。書き込みにはkondoの設定で「書き込みもできる」キーを作ってください。' }] } };
    const args = params?.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments) ? params.arguments : {};
    try {
      const result = await tool.run(api, args);
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result } };
    } catch (cause) {
      if (!(cause instanceof ToolError)) throw cause;
      return { jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: cause.message }] } };
    }
  }
  return rpcError(id, -32601, `Method not found: ${method}`);
}

/** One POST to /v1/mcp: a JSON-RPC message (or a batch) in, JSON out. */
export async function handleMcp(request: Request, api: ApiCall, canWrite: boolean): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  const payload = await request.json().catch(() => undefined);
  if (payload === undefined) return Response.json(rpcError(null, -32700, 'Parse error'), { status: 400 });
  const messages: RpcRequest[] = Array.isArray(payload) ? payload : [payload];
  const replies = [];
  for (const message of messages) {
    if (!message || typeof message !== 'object' || typeof message.method !== 'string') {
      if (message && typeof message === 'object' && ('result' in message || 'error' in message)) continue;
      replies.push(rpcError(message?.id, -32600, 'Invalid Request'));
      continue;
    }
    // Notifications (no id) get no reply.
    if (message.id === undefined || message.id === null) continue;
    replies.push(await answer(message, api, canWrite));
  }
  if (!replies.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(payload) ? replies : replies[0]);
}
