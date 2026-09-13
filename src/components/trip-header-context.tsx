import { createContext, useContext } from 'react';
export const TripHeaderHeight = createContext(0);
export const useTripHeaderHeight = () => useContext(TripHeaderHeight);
