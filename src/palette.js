import { hashSeed } from './rng.js';

// Each day gets its own colour world, chosen from the date hash.
export const PALETTES = [
  { name: 'Aurora',   bg: ['#040d18', '#0a2c3b', '#2a1a5e'], accent: '#7cf5d4', accent2: '#b693ff' },
  { name: 'Ember',    bg: ['#120606', '#3a0f10', '#7a2c14'], accent: '#ffb86b', accent2: '#ff6b81' },
  { name: 'Lagoon',   bg: ['#02101a', '#06364a', '#0b6a77'], accent: '#6be3ff', accent2: '#7affc7' },
  { name: 'Orchid',   bg: ['#0e061a', '#2a0f4a', '#6b1f7a'], accent: '#ff8ee6', accent2: '#8ea2ff' },
  { name: 'Citrine',  bg: ['#120f08', '#2f2a10', '#5a4a12'], accent: '#ffd96b', accent2: '#9be37a' },
  { name: 'Glacier',  bg: ['#050e18', '#13304d', '#3a5f8f'], accent: '#9fd8ff', accent2: '#d4c2ff' },
  { name: 'Rosewood', bg: ['#10061a', '#34102c', '#6a1b3f'], accent: '#ff9fb8', accent2: '#ffcf8a' },
  { name: 'Jade',     bg: ['#031210', '#0b3a2c', '#116b4a'], accent: '#7dffb2', accent2: '#f0e68a' },
];

export function paletteFor(dateStr) {
  const h = hashSeed('palette|' + dateStr)[0];
  return PALETTES[h % PALETTES.length];
}
