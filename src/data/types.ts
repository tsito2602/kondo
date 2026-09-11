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

export type PackingItem = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  packed: boolean;
  updatedBy?: string;
  updatedAt?: number;
};

export type TravelTask = {
  id: string;
  title: string;
  dueOn: string;
  assignee: string;
  done: boolean;
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
  packingByTrip: Record<string, PackingItem[]>;
  tasksByTrip: Record<string, TravelTask[]>;
  pending: PendingMutation[];
};

export const emptyTravelCache = (): TravelCache => ({
  version: 1,
  trips: [],
  selectedTripId: null,
  itemsByTrip: {},
  bookingsByTrip: {},
  packingByTrip: {},
  tasksByTrip: {},
  pending: [],
});

export const normalizeTravelCache = (value: TravelCache): TravelCache => ({
  ...value,
  tasksByTrip: Object.fromEntries(
    Object.entries(value.tasksByTrip ?? {}).map(([tripId, tasks]) => [
      tripId,
      tasks.map((task) => ({
        ...task,
        dueOn: task.dueOn ?? '',
        assignee: task.assignee ?? '',
        done: Boolean(task.done),
      })),
    ]),
  ),
  packingByTrip: Object.fromEntries(
    Object.entries(value.packingByTrip ?? {}).map(([tripId, items]) => [
      tripId,
      items.map((item) => ({
        ...item,
        category: item.category ?? 'その他',
        quantity: Math.max(1, item.quantity ?? 1),
        packed: Boolean(item.packed),
      })),
    ]),
  ),
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
