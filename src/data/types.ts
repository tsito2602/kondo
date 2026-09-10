export type Trip = {
  id: string;
  name: string;
  destination: string;
  startsOn: string;
  endsOn: string;
  role: 'owner' | 'editor';
  memberCount: number;
  updatedAt?: number;
};

export type ItineraryItem = {
  id: string;
  day: string;
  time: string;
  kind: string;
  title: string;
  note: string;
  updatedBy?: string;
  updatedAt?: number;
};

export type BookingKind = 'flight' | 'hotel' | 'train' | 'car' | 'restaurant' | 'ticket' | 'other';

export type Booking = {
  id: string;
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
  updatedBy?: string;
  updatedAt?: number;
};

export type PendingMutation = {
  id: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: Record<string, unknown>;
};

export type TravelCache = {
  version: 1;
  trips: Trip[];
  selectedTripId: string | null;
  itemsByTrip: Record<string, ItineraryItem[]>;
  bookingsByTrip: Record<string, Booking[]>;
  pending: PendingMutation[];
};

export const emptyTravelCache = (): TravelCache => ({
  version: 1,
  trips: [],
  selectedTripId: null,
  itemsByTrip: {},
  bookingsByTrip: {},
  pending: [],
});

export const normalizeTravelCache = (value: TravelCache): TravelCache => ({
  ...value,
  bookingsByTrip: Object.fromEntries(
    Object.entries(value.bookingsByTrip ?? {}).map(([tripId, bookings]) => [
      tripId,
      bookings.map((booking) => ({
        ...booking,
        origin: booking.origin ?? '',
        originCode: booking.originCode ?? '',
        destination: booking.destination ?? '',
        destinationCode: booking.destinationCode ?? '',
        endDay: booking.endDay ?? booking.day,
        endTime: booking.endTime ?? '',
      })),
    ]),
  ),
});
