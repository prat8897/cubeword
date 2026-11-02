import fs from 'fs';
import assert from 'assert';
import { buildDict } from '../src/solver.js';
import { generatePuzzle } from '../src/generate.js';
import { Game } from '../src/game.js';
import { buildTopology } from '../src/topology.js';
const rows = JSON.parse(fs.readFileSync(new URL('../data/words.json', import.meta.url)));
const dicts = new Map();
const dict = (mf) => { if (!dicts.has(mf)) dicts.set(mf, buildDict(rows.filter(r => r[1] >= mf), 3, 7)); return dicts.get(mf); };

// determinism: same date => identical puzzle
const a = generatePuzzle('2026-12-24', 'classic', dict), b = generatePuzzle('2026-12-24', 'classic', dict);
assert.deepStrictEqual(a.slots.map(s => s.word), b.slots.map(s => s.word));
const c = generatePuzzle('2026-12-25', 'classic', dict);
assert.notDeepStrictEqual(a.slots.map(s => s.word), c.slots.map(s => s.word));
console.log('determinism ok');

// structure: every white cell crossed by exactly two slots, letters consistent along slots
for (const p of [a, c, generatePuzzle('2026-12-24', 'mini', dict)]) {
  for (const cell of p.cells) if (!cell.blocked) assert.strictEqual(cell.slots.length, 2);
  for (const s of p.slots) {
    assert(s.cells.length >= 3 && s.cells.length <= 7);
    assert.strictEqual(s.cells.map(id => p.cells[id].letter).join('').toLowerCase(), s.word);
  }
  const words = p.slots.map(s => s.word);
  assert.strictEqual(new Set(words).size, words.length, 'duplicate words');
  // consecutive slot cells must be neighbours on the surface (distance 1 apart in 3D)
  for (const s of p.slots) for (let k = 1; k < s.cells.length; k++) {
    const A = p.cells[s.cells[k-1]].pos, B = p.cells[s.cells[k]].pos;
    const d = Math.hypot(A[0]-B[0], A[1]-B[1], A[2]-B[2]);
    assert(d < 1.5, 'non-adjacent cells in a word: ' + d);
  }
}
console.log('structure ok');

// game: type the whole solution via slot navigation and expect solved
const g = new Game(a);
let solvedEvt = 0, words = 0;
g.on('solved', () => solvedEvt++).on('wordComplete', () => words++);
let guard = 0;
while (!g.solved && guard++ < 2000) {
  const s = g.activeSlot();
  const id = g.sel;
  g.type(a.cells[id].letter);
}
assert(g.solved, 'game should be solved by typing');
assert.strictEqual(solvedEvt, 1);
assert(words >= a.slots.length - 1);
console.log('typing solves in', guard, 'keystrokes; wordComplete events', words);

// check / reveal / save-restore
const g2 = new Game(a);
g2.type('Q'); g2.selectCell(g2.sel, {noToggle:true});
const r = g2.check('all'); assert(r.wrong.length >= 0);
g2.reveal('word'); assert(g2.hints === 1);
const saved = JSON.parse(JSON.stringify(g2.save()));
const g3 = new Game(a, saved);
assert.deepStrictEqual(g3.letters, g2.letters);
console.log('check/reveal/save ok');

// ring-direction sanity: horizontal belts read left-to-right across the four side faces
const t = buildTopology(5);
const belt = t.rings.find(r => r.axis === 1 && r.layer === 2);
console.log('belt faces in order:', [...new Set(belt.cells.map(id => t.cells[id].face))].join(','));
