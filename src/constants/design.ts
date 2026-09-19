import { Platform } from 'react-native';

export const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

export const lightPalette = {
  ink: '#171717',
  ocean: '#1D4ED8',
  paper: '#FFFFFF',
  canvas: '#F7F7F7',
  mist: '#F0F0F0',
  ash: '#D4D4D4',
  smoke: '#737373',
  placeholder: '#737373',
  slate: '#525252',
  sky: '#E8E8E8',
  accent: '#2563EB',
  soft: '#F5F5F5',
  danger: '#B42318',
  onOcean: '#FFFFFF',
  glass: 'rgba(247,247,247,0.66)',
  glassNative: 'rgba(247,247,247,0.92)',
  success: '#DFEBE4',
  successSurface: '#F4F8F6',
  warning: '#A06839',
} as const;

export type Palette = { [K in keyof typeof lightPalette]: string };
export const darkPalette: Palette = {
  ink: '#F5F5F5', ocean: '#75ADFF', paper: '#171717', canvas: '#0A0A0A',
  mist: '#222222', ash: '#404040', smoke: '#A3A3A3', placeholder: '#A3A3A3',
  slate: '#D4D4D4', sky: '#262626', accent: '#75ADFF', soft: '#202020',
  danger: '#FFA69D', onOcean: '#0A0A0A', glass: 'rgba(10,10,10,0.72)',
  glassNative: 'rgba(10,10,10,0.94)', success: '#2B453B', successSurface: '#1B3028', warning: '#DFB184',
};

export const radii = {
  button: 8,
  card: 32,
  tag: 64,
  nav: 48,
} as const;
