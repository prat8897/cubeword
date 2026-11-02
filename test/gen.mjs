import fs from 'fs';
import { buildDict } from '../src/solver.js';
import { generatePuzzle, SIZES } from '../src/generate.js';
const rows = JSON.parse(fs.readFileSync(new URL('../data/words.json', import.meta.url)));
const dicts = new Map();
const dict = (mf) => { if (!dicts.has(mf)) dicts.set(mf, buildDict(rows.filter(r => r[1] >= mf), 3, 7)); return dicts.get(mf); };
const size = process.argv[2] || 'classic';
const days = +process.argv[3] || 10;
let fails = 0, tot = 0, maxms = 0;
for (let d = 0; d < days; d++) {
  const date = new Date(Date.UTC(2026, 10, 3 + d)).toISOString().slice(0, 10);
  const t = Date.now();
  try {
    const p = generatePuzzle(date, size, dict);
    const ms = Date.now() - t; tot += ms; maxms = Math.max(maxms, ms);
    console.log(date, size, 'ok', ms + 'ms', JSON.stringify(p.stats), 'slots', p.slots.length);
  } catch (e) { fails++; console.log(date, size, 'FAIL', e.message, (Date.now() - t) + 'ms'); }
}
console.log('fails', fails, 'avg', Math.round(tot / Math.max(1, days - fails)), 'max', maxms);
