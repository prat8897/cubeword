import { makeRng } from './rng.js';
import { buildTopology, FACES } from './topology.js';
import { makePattern, buildSlots } from './pattern.js';
import { solve } from './solver.js';

// minFreq: word-frequency floor (zipf x 10) for the first, quality tier. patTries: block-pattern retries.
export const SIZES = {
  mini:    { N: 4, maxRun: 6, minFreq: 29, patTries: 60,  label: 'Mini',    blurb: '4 × 4 faces' },
  classic: { N: 5, maxRun: 6, minFreq: 29, patTries: 60,  label: 'Classic', blurb: '5 × 5 faces' },
  grand:   { N: 6, maxRun: 7, minFreq: 26, patTries: 300, label: 'Grand',   blurb: '6 × 6 faces' },
};

// Generate the puzzle for a given date string (YYYY-MM-DD) and size key. Pure function of its inputs.
// getDict(minFreq) returns a dictionary index restricted to words at or above that frequency.
// Tier 0 uses the quality vocabulary; tier 1 is a safety net with every word we have. Seeds include the
// tier and attempt number, and there is no wall-clock dependence, so the result is identical everywhere.
export function generatePuzzle(dateStr, sizeKey, getDict) {
  const cfg = SIZES[sizeKey];
  const topo = buildTopology(cfg.N);
  const t0 = Date.now();
  const tiers = [{ minFreq: cfg.minFreq, attempts: 800 }, { minFreq: 0, attempts: 2500 }];
  let total = 0;
  for (let ti = 0; ti < tiers.length; ti++) {
    const dict = getDict(tiers[ti].minFreq);
    for (let att = 0; att < tiers[ti].attempts; att++, total++) {
      const rng = makeRng(`cubeword|${dateStr}|${sizeKey}|${ti}|${att}`);
      const blocked = makePattern(topo, rng, { maxRun: cfg.maxRun, tries: cfg.patTries });
      if (!blocked) continue;
      const slotInfo = buildSlots(topo, blocked);
      if (!slotInfo) continue;
      const sol = solve(topo, slotInfo, dict, rng, { budget: 1200 });
      if (!sol) continue;
      return finalize(dateStr, sizeKey, topo, blocked, slotInfo, sol, total, Date.now() - t0);
    }
  }
  throw new Error('generator exhausted attempts for ' + dateStr + ' ' + sizeKey);
}

function finalize(dateStr, sizeKey, topo, blocked, slotInfo, sol, attempts, ms) {
  const { N, ncell, cells } = topo;
  const slots = slotInfo.slots.map((s, i) => ({
    id: i,
    axis: s.axis,
    layer: s.layer,
    cells: s.cells.slice(),
    word: sol.words[i],
    clue: sol.clues[i],
    num: 0,
  }));
  // numbering by start cell, reading order across faces
  const startAt = new Map();
  for (const s of slots) {
    const c = s.cells[0];
    if (!startAt.has(c)) startAt.set(c, []);
    startAt.get(c).push(s);
  }
  let n = 0;
  const numberAt = new Int32Array(ncell);
  for (let c = 0; c < ncell; c++) {
    if (startAt.has(c)) {
      n++;
      numberAt[c] = n;
      for (const s of startAt.get(c)) s.num = n;
    }
  }
  const outCells = cells.map((cell) => ({
    id: cell.id,
    face: cell.face,
    r: cell.r,
    c: cell.c,
    pos: cell.pos,
    blocked: !!blocked[cell.id],
    letter: blocked[cell.id] ? '' : String.fromCharCode(96 + sol.letters[cell.id]).toUpperCase(),
    num: numberAt[cell.id],
    slots: slotInfo.cellSlots[cell.id].map((x) => x.slot),
  }));
  return {
    date: dateStr,
    sizeKey,
    N,
    faces: FACES,
    cells: outCells,
    slots,
    stats: { attempts, nodes: sol.nodes, ms, blocks: outCells.filter((c) => c.blocked).length },
  };
}
