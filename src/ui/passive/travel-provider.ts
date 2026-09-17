import { useMemo } from 'react';

import { TravelProvider, useTravel as useTravelService } from '../../data/travel-provider';
import { type UiDispatch, useUiEmitterOptional } from '../mediator';

export { TravelProvider };

function command<TArgs extends unknown[], TResult>(emit: UiDispatch, type: string) {
  return (...args: TArgs): TResult => emit<TResult>({ type, payload: args });
}

export function useTravel() {
  const service = useTravelService();
  const emit = useUiEmitterOptional();
  const commands = useMemo(() => {
    if (!emit) return null;
    return {
      saveNote: command<Parameters<typeof service.saveNote>, ReturnType<typeof service.saveNote>>(emit, 'travel.saveNote'),
      deleteNote: command<Parameters<typeof service.deleteNote>, ReturnType<typeof service.deleteNote>>(emit, 'travel.deleteNote'),
      createPlace: command<Parameters<typeof service.createPlace>, ReturnType<typeof service.createPlace>>(emit, 'travel.createPlace'),
      updatePlace: command<Parameters<typeof service.updatePlace>, ReturnType<typeof service.updatePlace>>(emit, 'travel.updatePlace'),
      deletePlace: command<Parameters<typeof service.deletePlace>, ReturnType<typeof service.deletePlace>>(emit, 'travel.deletePlace'),
      deleteTrip: command<Parameters<typeof service.deleteTrip>, ReturnType<typeof service.deleteTrip>>(emit, 'travel.deleteTrip'),
      saveTripOffline: command<Parameters<typeof service.saveTripOffline>, ReturnType<typeof service.saveTripOffline>>(emit, 'travel.saveTripOffline'),
      selectTrip: command<Parameters<typeof service.selectTrip>, ReturnType<typeof service.selectTrip>>(emit, 'travel.selectTrip'),
      sync: command<Parameters<typeof service.sync>, ReturnType<typeof service.sync>>(emit, 'travel.sync'),
      createTrip: command<Parameters<typeof service.createTrip>, ReturnType<typeof service.createTrip>>(emit, 'travel.createTrip'),
      updateTrip: command<Parameters<typeof service.updateTrip>, ReturnType<typeof service.updateTrip>>(emit, 'travel.updateTrip'),
      createItem: command<Parameters<typeof service.createItem>, ReturnType<typeof service.createItem>>(emit, 'travel.createItem'),
      updateItem: command<Parameters<typeof service.updateItem>, ReturnType<typeof service.updateItem>>(emit, 'travel.updateItem'),
      deleteItem: command<Parameters<typeof service.deleteItem>, ReturnType<typeof service.deleteItem>>(emit, 'travel.deleteItem'),
      createBooking: command<Parameters<typeof service.createBooking>, ReturnType<typeof service.createBooking>>(emit, 'travel.createBooking'),
      updateBooking: command<Parameters<typeof service.updateBooking>, ReturnType<typeof service.updateBooking>>(emit, 'travel.updateBooking'),
      setFlightConnection: command<Parameters<typeof service.setFlightConnection>, ReturnType<typeof service.setFlightConnection>>(emit, 'travel.setFlightConnection'),
      deleteBooking: command<Parameters<typeof service.deleteBooking>, ReturnType<typeof service.deleteBooking>>(emit, 'travel.deleteBooking'),
      uploadBookingDocument: command<Parameters<typeof service.uploadBookingDocument>, ReturnType<typeof service.uploadBookingDocument>>(emit, 'travel.uploadBookingDocument'),
      deleteBookingDocument: command<Parameters<typeof service.deleteBookingDocument>, ReturnType<typeof service.deleteBookingDocument>>(emit, 'travel.deleteBookingDocument'),
      downloadBookingDocument: command<Parameters<typeof service.downloadBookingDocument>, ReturnType<typeof service.downloadBookingDocument>>(emit, 'travel.downloadBookingDocument'),
      createPackingItem: command<Parameters<typeof service.createPackingItem>, ReturnType<typeof service.createPackingItem>>(emit, 'travel.createPackingItem'),
      updatePackingItem: command<Parameters<typeof service.updatePackingItem>, ReturnType<typeof service.updatePackingItem>>(emit, 'travel.updatePackingItem'),
      deletePackingItem: command<Parameters<typeof service.deletePackingItem>, ReturnType<typeof service.deletePackingItem>>(emit, 'travel.deletePackingItem'),
      createTask: command<Parameters<typeof service.createTask>, ReturnType<typeof service.createTask>>(emit, 'travel.createTask'),
      updateTask: command<Parameters<typeof service.updateTask>, ReturnType<typeof service.updateTask>>(emit, 'travel.updateTask'),
      deleteTask: command<Parameters<typeof service.deleteTask>, ReturnType<typeof service.deleteTask>>(emit, 'travel.deleteTask'),
      createInvite: command<Parameters<typeof service.createInvite>, ReturnType<typeof service.createInvite>>(emit, 'travel.createInvite'),
      acceptInvite: command<Parameters<typeof service.acceptInvite>, ReturnType<typeof service.acceptInvite>>(emit, 'travel.acceptInvite'),
    };
  }, [emit]);
  return useMemo(() => commands ? ({ ...service, ...commands } satisfies typeof service) : service, [commands, service]);
}
