import { Platform } from 'react-native';

export const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

export const lightPalette = {
  ink: '#182A36',
  ocean: '#496B80',
  paper: '#FAFCFD',
  canvas: '#EEF2F4',
  mist: '#E6ECEF',
  ash: '#C9D3D9',
  smoke: '#7E8C95',
  placeholder: '#7E8C95',
  slate: '#465A67',
  sky: '#D7E2E8',
  accent: '#6F8FA2',
  soft: '#E9EEF1',
  danger: '#B42318',
  onOcean: '#FAFCFD',
  glass: 'rgba(250,252,253,0.58)',
  glassStrong: 'rgba(250,252,253,0.76)',
  glassNative: 'rgba(250,252,253,0.88)',
  glassEdge: 'rgba(255,255,255,0.72)',
  glassAccent: 'rgba(73,107,128,0.86)',
  success: '#DFEBE4',
  successSurface: '#F4F8F6',
  warning: '#A06839',
} as const;

export type Palette = { [K in keyof typeof lightPalette]: string };
export const darkPalette: Palette = {
  ink: '#E9F0F4', ocean: '#A1BDCC', paper: '#18242D', canvas: '#10191F',
  mist: '#23333F', ash: '#3D505D', smoke: '#9AAEBB', placeholder: '#9AAEBB',
  slate: '#BECBD4', sky: '#2B4352', accent: '#8FAFBE', soft: '#20313C',
  danger: '#FFA69D', onOcean: '#14232D', glass: 'rgba(24,36,45,0.58)',
  glassStrong: 'rgba(24,36,45,0.76)', glassNative: 'rgba(24,36,45,0.90)',
  glassEdge: 'rgba(233,240,244,0.18)', glassAccent: 'rgba(111,143,162,0.82)',
  success: '#2B453B', successSurface: '#1B3028', warning: '#DFB184',
};

export const radii = {
  button: 8,
  card: 32,
  tag: 64,
  nav: 48,
} as const;
