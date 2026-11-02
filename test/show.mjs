import fs from 'fs';
import { buildDict } from '../src/solver.js';
import { generatePuzzle } from '../src/generate.js';
const rows = JSON.parse(fs.readFileSync(new URL('../data/words.json', import.meta.url)));
const dicts = new Map();
const dict = (mf) => { if (!dicts.has(mf)) dicts.set(mf, buildDict(rows.filter(r => r[1] >= mf), 3, 7)); return dicts.get(mf); };
const p = generatePuzzle(process.argv[2] || '2026-11-03', process.argv[3] || 'classic', dict);
const N = p.N;
for (let f = 0; f < 6; f++) {
  console.log(p.faces[f].name);
  for (let r = 0; r < N; r++) console.log('  ' + p.cells.slice(f*N*N + r*N, f*N*N + r*N + N).map(c => c.blocked ? '#' : c.letter).join(' '));
}
const ax = ['Hoop','Belt','Frame'];
let plural = 0;
for (const s of p.slots) { if (s.clue.endsWith('(plural)')) plural++; }
console.log('plural clues', plural, '/', p.slots.length);
for (const s of p.slots.slice(0, 22)) console.log(String(s.num).padStart(2), ax[s.axis].padEnd(5), s.word.toUpperCase().padEnd(8), s.clue);
