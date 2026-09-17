import { type PropsWithChildren, useMemo } from 'react';

import { useTravel as useTravelService } from '../data/travel-provider';
import { UiBoundary, type UiEvent, type UiEffects } from './mediator';

function args<T extends readonly unknown[]>(event: UiEvent): T {
  return (event.payload ?? []) as unknown as T;
}

export function TravelMediator({ children }: PropsWithChildren) {
  const travel = useTravelService();
  const effects = useMemo<UiEffects>(() => ({
    'travel.saveNote': (event) => travel.saveNote(...args<Parameters<typeof travel.saveNote>>(event)),
    'travel.deleteNote': (event) => travel.deleteNote(...args<Parameters<typeof travel.deleteNote>>(event)),
    'travel.createPlace': (event) => travel.createPlace(...args<Parameters<typeof travel.createPlace>>(event)),
    'travel.updatePlace': (event) => travel.updatePlace(...args<Parameters<typeof travel.updatePlace>>(event)),
    'travel.deletePlace': (event) => travel.deletePlace(...args<Parameters<typeof travel.deletePlace>>(event)),
    'travel.deleteTrip': (event) => travel.deleteTrip(...args<Parameters<typeof travel.deleteTrip>>(event)),
    'travel.saveTripOffline': (event) => travel.saveTripOffline(...args<Parameters<typeof travel.saveTripOffline>>(event)),
    'travel.selectTrip': (event) => travel.selectTrip(...args<Parameters<typeof travel.selectTrip>>(event)),
    'travel.sync': () => travel.sync(),
    'travel.createTrip': (event) => travel.createTrip(...args<Parameters<typeof travel.createTrip>>(event)),
    'travel.updateTrip': (event) => travel.updateTrip(...args<Parameters<typeof travel.updateTrip>>(event)),
    'travel.createItem': (event) => travel.createItem(...args<Parameters<typeof travel.createItem>>(event)),
    'travel.updateItem': (event) => travel.updateItem(...args<Parameters<typeof travel.updateItem>>(event)),
    'travel.deleteItem': (event) => travel.deleteItem(...args<Parameters<typeof travel.deleteItem>>(event)),
    'travel.createBooking': (event) => travel.createBooking(...args<Parameters<typeof travel.createBooking>>(event)),
    'travel.updateBooking': (event) => travel.updateBooking(...args<Parameters<typeof travel.updateBooking>>(event)),
    'travel.setFlightConnection': (event) => travel.setFlightConnection(...args<Parameters<typeof travel.setFlightConnection>>(event)),
    'travel.deleteBooking': (event) => travel.deleteBooking(...args<Parameters<typeof travel.deleteBooking>>(event)),
    'travel.uploadBookingDocument': (event) => travel.uploadBookingDocument(...args<Parameters<typeof travel.uploadBookingDocument>>(event)),
    'travel.deleteBookingDocument': (event) => travel.deleteBookingDocument(...args<Parameters<typeof travel.deleteBookingDocument>>(event)),
    'travel.downloadBookingDocument': (event) => travel.downloadBookingDocument(...args<Parameters<typeof travel.downloadBookingDocument>>(event)),
    'travel.createPackingItem': (event) => travel.createPackingItem(...args<Parameters<typeof travel.createPackingItem>>(event)),
    'travel.updatePackingItem': (event) => travel.updatePackingItem(...args<Parameters<typeof travel.updatePackingItem>>(event)),
    'travel.deletePackingItem': (event) => travel.deletePackingItem(...args<Parameters<typeof travel.deletePackingItem>>(event)),
    'travel.createTask': (event) => travel.createTask(...args<Parameters<typeof travel.createTask>>(event)),
    'travel.updateTask': (event) => travel.updateTask(...args<Parameters<typeof travel.updateTask>>(event)),
    'travel.deleteTask': (event) => travel.deleteTask(...args<Parameters<typeof travel.deleteTask>>(event)),
    'travel.createInvite': () => travel.createInvite(),
    'travel.acceptInvite': (event) => travel.acceptInvite(...args<Parameters<typeof travel.acceptInvite>>(event)),
  }), [travel]);
  return <UiBoundary name="Travel" effects={effects}>{children}</UiBoundary>;
}
