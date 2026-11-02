// Block-pattern generator.
// Constraints: every ring must contain blocks, every run of white cells has length in [minRun, maxRun],
// the pattern is antipodally symmetric (180-degree point symmetry through the cube centre), and
// the resulting word graph is connected.

export function makePattern(topo, rng, opts = {}) {
  const { N, ncell, mirror, rings, cellRings } = topo;
  const minRun = opts.minRun ?? 3;
  const maxRun = opts.maxRun ?? 6;
  const L = 4 * N;
  const nr = rings.length;

  for (let attempt = 0; attempt < (opts.tries ?? 60); attempt++) {
    const blocked = new Uint8Array(ncell);
    const rb = Array.from({ length: nr }, () => []); // sorted block positions per ring

    const ringOK = (list) => {
      if (list.length === 0) return true;
      for (let k = 0; k < list.length; k++) {
        const nxt = list[(k + 1) % list.length];
        let gap = (nxt - list[k] + L) % L;
        if (list.length === 1) gap = L;
        if (gap - 1 < minRun) return false;
      }
      return true;
    };
    const withBlocks = (ringId, positions) => {
      const out = rb[ringId].slice();
      for (const p of positions) if (!out.includes(p)) out.push(p);
      out.sort((a, b) => a - b);
      return out;
    };
    const tryPlace = (cell) => {
      const m = mirror[cell];
      const group = cell === m ? [cell] : [cell, m];
      const perRing = new Map();
      for (const c of group) {
        if (blocked[c]) return false;
        for (const { ring, idx } of cellRings[c]) {
          if (!perRing.has(ring)) perRing.set(ring, []);
          perRing.get(ring).push(idx);
        }
      }
      const next = new Map();
      for (const [ring, pos] of perRing) {
        const list = withBlocks(ring, pos);
        if (!ringOK(list)) return false;
        next.set(ring, list);
      }
      for (const c of group) blocked[c] = 1;
      for (const [ring, list] of next) rb[ring] = list;
      return true;
    };
    const longestRun = (list) => {
      if (list.length === 0) return L;
      let best = 0;
      for (let k = 0; k < list.length; k++) {
        const nxt = list[(k + 1) % list.length];
        let gap = (nxt - list[k] + L) % L;
        if (list.length === 1) gap = L;
        best = Math.max(best, gap - 1);
      }
      return best;
    };

    let stuck = false;
    for (let guard = 0; guard < 400 && !stuck; guard++) {
      const bad = [];
      for (let r = 0; r < nr; r++) if (longestRun(rb[r]) > maxRun) bad.push(r);
      if (!bad.length) break;
      const ringId = bad[rng.int(bad.length)];
      const order = rng.shuffle(rings[ringId].cells.slice());
      let placed = false;
      for (const cell of order) {
        if (tryPlace(cell)) { placed = true; break; }
      }
      if (!placed) stuck = true;
    }
    if (stuck) continue;
    let ok = true;
    for (let r = 0; r < nr; r++) if (longestRun(rb[r]) > maxRun || !ringOK(rb[r])) ok = false;
    if (!ok) continue;

    // optional extra blocks for variety
    const extra = rng.int(Math.max(1, Math.floor(N * 0.8)));
    for (let e = 0; e < extra; e++) {
      const cell = rng.int(ncell);
      tryPlace(cell);
    }
    return blocked;
  }
  return null;
}

// Turn a pattern into slots (runs of white cells along rings, in forward ring direction).
export function buildSlots(topo, blocked) {
  const { rings, cellRings, ncell } = topo;
  const slots = [];
  for (const ring of rings) {
    const cs = ring.cells;
    const L = cs.length;
    let b0 = -1;
    for (let i = 0; i < L; i++) if (blocked[cs[i]]) { b0 = i; break; }
    if (b0 < 0) return null;
    let run = [];
    for (let j = 1; j <= L; j++) {
      const idx = (b0 + j) % L;
      const cell = cs[idx];
      if (blocked[cell]) {
        if (run.length >= 1) {
          if (run.length < 3) return null;
          slots.push({ id: slots.length, ring: ring.id, axis: ring.axis, layer: ring.layer, cells: run });
        }
        run = [];
      } else run.push(cell);
    }
  }
  // crossings
  const cellSlots = Array.from({ length: ncell }, () => []);
  slots.forEach((s) => s.cells.forEach((c, k) => cellSlots[c].push({ slot: s.id, k })));
  for (let c = 0; c < ncell; c++) {
    if (!blocked[c] && cellSlots[c].length !== 2) return null;
  }
  // connectivity of word graph
  const seen = new Uint8Array(slots.length);
  const stack = [0];
  seen[0] = 1;
  let count = 1;
  while (stack.length) {
    const s = stack.pop();
    for (const c of slots[s].cells) {
      for (const { slot } of cellSlots[c]) {
        if (!seen[slot]) { seen[slot] = 1; count++; stack.push(slot); }
      }
    }
  }
  if (count !== slots.length) return null;
  return { slots, cellSlots };
}
