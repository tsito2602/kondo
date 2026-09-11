type BookingKind = 'flight' | 'hotel' | 'train';

export type GmailImportCandidate = {
  sourceMessageId: string;
  kind: BookingKind;
  title: string;
  detail: string;
  origin: string;
  originCode: string;
  destination: string;
  destinationCode: string;
  day: string;
  time: string;
  endDay: string;
  endTime: string;
  confirmationCode: string;
  note: string;
  confidence: 'high' | 'medium';
  sender: string;
  subject: string;
  fingerprint: string;
  duplicateBookingId?: string;
  alreadyImported?: boolean;
};

type GmailHeader = { name?: string; value?: string };
type GmailPart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
};
type GmailMessage = {
  id?: string;
  payload?: GmailPart & { headers?: GmailHeader[] };
};

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

const entityMap: Record<string, string> = {
  amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
};

function decodeBase64Url(value: string) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function collectBodies(part?: GmailPart): { html: string[]; text: string[] } {
  const bodies = { html: [] as string[], text: [] as string[] };
  const visit = (current?: GmailPart) => {
    if (!current) return;
    if (current.body?.data) {
      const decoded = decodeBase64Url(current.body.data);
      if (current.mimeType === 'text/html') bodies.html.push(decoded);
      if (current.mimeType === 'text/plain') bodies.text.push(decoded);
    }
    current.parts?.forEach(visit);
  };
  visit(part);
  return bodies;
}

function decodeEntities(value: string) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const hex = entity[1]?.toLowerCase() === 'x';
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return entityMap[entity.toLowerCase()] ?? match;
  });
}

function htmlToText(html: string) {
  return decodeEntities(html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>|<\/div>|<\/tr>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[\t\r ]+/g, ' ')
    .replace(/ *\n+ */g, '\n')
    .trim();
}

function header(headers: GmailHeader[] | undefined, name: string) {
  return headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function objects(value: JsonValue): JsonObject[] {
  if (Array.isArray(value)) return value.flatMap(objects);
  if (!value || typeof value !== 'object') return [];
  return [value, ...Object.values(value).flatMap(objects)];
}

function schemaTypes(value: JsonObject) {
  const type = value['@type'];
  return (Array.isArray(type) ? type : [type]).filter((item): item is string => typeof item === 'string');
}

function objectValue(value: JsonValue | undefined): JsonObject | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function stringValue(...values: JsonValue[]) {
  return values.find((value): value is string => typeof value === 'string') ?? '';
}

function property(value: JsonObject | undefined, ...names: string[]) {
  if (!value) return '';
  return stringValue(...names.map((name) => value[name]));
}

function place(value: JsonValue | undefined) {
  if (typeof value === 'string') return { name: value, code: '' };
  const item = objectValue(value);
  return {
    name: property(item, 'name'),
    code: property(item, 'iataCode', 'stationCode'),
  };
}

function localDateTime(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(value);
  return match ? { day: `${match[1]}-${match[2]}-${match[3]}`, time: match[4] ? `${match[4]}:${match[5]}` : '' } : null;
}

function normalize(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

export function candidateFingerprint(candidate: Pick<GmailImportCandidate, 'kind' | 'day' | 'time' | 'title' | 'confirmationCode' | 'originCode' | 'destinationCode'>) {
  return [candidate.kind, candidate.day, candidate.time, candidate.confirmationCode, candidate.originCode, candidate.destinationCode, candidate.title]
    .map(normalize)
    .join('|');
}

function schemaCandidate(messageId: string, value: JsonObject, subject: string, sender: string): GmailImportCandidate | null {
  const types = schemaTypes(value);
  if (property(value, 'reservationStatus').toLowerCase().includes('cancel')) return null;
  const reservationFor = objectValue(value.reservationFor) ?? objectValue(value.underName);
  const confirmationCode = property(value, 'reservationNumber', 'confirmationNumber', 'bookingReference');
  let candidate: Omit<GmailImportCandidate, 'fingerprint'> | null = null;

  if (types.includes('FlightReservation')) {
    const flight = reservationFor ?? value;
    const departure = localDateTime(property(flight, 'departureTime'));
    const arrival = localDateTime(property(flight, 'arrivalTime'));
    const origin = place(flight.departureAirport ?? flight.departureStation);
    const destination = place(flight.arrivalAirport ?? flight.arrivalStation);
    if (!departure) return null;
    const airline = objectValue(flight.airline);
    const flightNumber = property(flight, 'flightNumber');
    const airlineName = property(airline, 'name', 'iataCode');
    candidate = {
      sourceMessageId: messageId, kind: 'flight',
      title: [airlineName, flightNumber].filter(Boolean).join(' ') || subject,
      detail: property(flight, 'name'), origin: origin.name, originCode: origin.code,
      destination: destination.name, destinationCode: destination.code,
      day: departure.day, time: departure.time, endDay: arrival?.day ?? departure.day,
      endTime: arrival?.time ?? '', confirmationCode, note: '', confidence: 'high', sender, subject,
    };
  } else if (types.includes('TrainReservation')) {
    const trip = reservationFor ?? value;
    const departure = localDateTime(property(trip, 'departureTime'));
    const arrival = localDateTime(property(trip, 'arrivalTime'));
    const origin = place(trip.departureStation);
    const destination = place(trip.arrivalStation);
    if (!departure) return null;
    const operator = objectValue(trip.provider);
    const trainNumber = property(trip, 'trainNumber', 'trainName');
    candidate = {
      sourceMessageId: messageId, kind: 'train',
      title: [property(operator, 'name'), trainNumber].filter(Boolean).join(' ') || subject,
      detail: property(trip, 'name'), origin: origin.name, originCode: origin.code,
      destination: destination.name, destinationCode: destination.code,
      day: departure.day, time: departure.time, endDay: arrival?.day ?? departure.day,
      endTime: arrival?.time ?? '', confirmationCode, note: '', confidence: 'high', sender, subject,
    };
  } else if (types.includes('LodgingReservation')) {
    const lodging = reservationFor ?? value;
    const checkin = localDateTime(property(value, 'checkinTime', 'checkInTime'));
    const checkout = localDateTime(property(value, 'checkoutTime', 'checkOutTime'));
    if (!checkin) return null;
    const addressValue = lodging.address;
    const address = typeof addressValue === 'string' ? addressValue : property(objectValue(addressValue), 'streetAddress');
    candidate = {
      sourceMessageId: messageId, kind: 'hotel', title: property(lodging, 'name') || subject,
      detail: address, origin: '', originCode: '', destination: '', destinationCode: '',
      day: checkin.day, time: checkin.time || '15:00', endDay: checkout?.day ?? checkin.day,
      endTime: checkout?.time || '11:00', confirmationCode, note: '', confidence: 'high', sender, subject,
    };
  }
  if (!candidate) return null;
  return { ...candidate, fingerprint: candidateFingerprint(candidate) };
}

function parseJsonLd(html: string) {
  const values: JsonValue[] = [];
  const pattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      values.push(JSON.parse(decodeEntities(match[1]).trim()) as JsonValue);
    } catch {
      // Invalid structured data is common in forwarded or quoted email; use text fallback.
    }
  }
  return values.flatMap(objects);
}

function dateTimes(text: string) {
  const results: { day: string; time: string }[] = [];
  const patterns = [
    /(20\d{2})[年\/.\-](\d{1,2})[月\/.\-](\d{1,2})日?(?:\([^)]*\))?\s*(\d{1,2}):([0-5]\d)/g,
    /(20\d{2})-(\d{2})-(\d{2})[T ](\d{2}):([0-5]\d)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      results.push({
        day: `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`,
        time: `${match[4].padStart(2, '0')}:${match[5]}`,
      });
    }
  }
  return results.filter((entry, index) => results.findIndex((other) => other.day === entry.day && other.time === entry.time) === index);
}

function fallbackCandidate(messageId: string, subject: string, sender: string, text: string): GmailImportCandidate | null {
  const searchable = `${subject}\n${text}`;
  const times = dateTimes(searchable);
  if (!times.length) return null;
  const confirmation = /(?:予約番号|確認番号|booking(?: reference)?|confirmation(?: number)?|reservation(?: number)?)\s*[:：#]?\s*([A-Z0-9-]{5,20})/i.exec(searchable)?.[1] ?? '';
  const flight = /(?:航空券|搭乗|フライト|flight|boarding|airline)/i.test(searchable);
  const train = /(?:新幹線|特急|列車|鉄道|乗車|train|rail)/i.test(searchable);
  const hotel = /(?:ホテル|宿泊|チェックイン|check[ -]?in|hotel|lodging)/i.test(searchable);
  if (![flight, train, hotel].some(Boolean)) return null;

  const route = /\b([A-Z]{3})\s*(?:→|➝|->|－|-|to)\s*([A-Z]{3})\b/i.exec(searchable)
    ?? /([\p{L}\p{N}ヶケー]{2,20}(?:駅|空港))\s*(?:→|➝|->|－|—|-|から|to)\s*([\p{L}\p{N}ヶケー]{2,20}(?:駅|空港))/iu.exec(searchable);
  const kind: BookingKind = flight ? 'flight' : train ? 'train' : 'hotel';
  const serviceNumber = kind === 'flight'
    ? /\b([A-Z0-9]{2})\s?(\d{2,4}[A-Z]?)\b/.exec(searchable)?.slice(1).join(' ')
    : /((?:のぞみ|ひかり|こだま|はやぶさ|かがやき|特急)?\s*\d{1,4}号)/.exec(searchable)?.[1];
  const title = serviceNumber?.trim() || subject.replace(/^(?:re|fw|fwd)\s*:\s*/i, '').slice(0, 160);
  const origin = route?.[1] ?? '';
  const destination = route?.[2] ?? '';
  const codes = route && /^[A-Z]{3}$/i.test(origin) && /^[A-Z]{3}$/i.test(destination);
  const start = times[0];
  const end = times.find((entry, index) => index > 0 && `${entry.day} ${entry.time}` >= `${start.day} ${start.time}`) ?? start;
  const base = {
    sourceMessageId: messageId, kind, title, detail: '',
    origin: codes ? '' : origin, originCode: codes ? origin.toUpperCase() : '',
    destination: codes ? '' : destination, destinationCode: codes ? destination.toUpperCase() : '',
    day: start.day, time: start.time,
    endDay: kind === 'hotel' && times[1] ? times[1].day : end.day,
    endTime: kind === 'hotel' && times[1] ? times[1].time : end.time,
    confirmationCode: confirmation, note: '', confidence: 'medium' as const, sender, subject,
  };
  return { ...base, fingerprint: candidateFingerprint(base) };
}

export function parseGmailMessage(message: GmailMessage) {
  if (!message.id) return [];
  const headers = message.payload?.headers;
  const subject = header(headers, 'subject');
  const sender = header(headers, 'from');
  const bodies = collectBodies(message.payload);
  const structured = bodies.html.flatMap(parseJsonLd)
    .map((value) => schemaCandidate(message.id!, value, subject, sender))
    .filter((candidate): candidate is GmailImportCandidate => Boolean(candidate));
  const uniqueStructured = structured.filter((candidate, index) => structured.findIndex((item) => item.fingerprint === candidate.fingerprint) === index);
  if (uniqueStructured.length) return uniqueStructured;
  const plainText = [...bodies.text, ...bodies.html.map(htmlToText)].join('\n');
  const fallback = fallbackCandidate(message.id, subject, sender, plainText);
  return fallback ? [fallback] : [];
}

export function isCandidateNearTrip(candidate: GmailImportCandidate, startsOn: string, endsOn: string) {
  const start = new Date(`${startsOn}T00:00:00Z`);
  const end = new Date(`${endsOn}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 30);
  end.setUTCDate(end.getUTCDate() + 30);
  return candidate.day >= start.toISOString().slice(0, 10) && candidate.day <= end.toISOString().slice(0, 10);
}
