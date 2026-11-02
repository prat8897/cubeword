// Constraint solver that fills the slots with dictionary words.
// MRV slot choice, frequency-weighted randomised value order refined by a least-constraining-value
// probe, forward checking through bitset intersection, node-budgeted so it is fully deterministic
// (no wall-clock dependence).

function popcount(x) {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}

export function buildDict(rows, minLen = 3, maxLen = 7) {
  const byLen = new Map();
  for (const [word, freq, clue] of rows) {
    const L = word.length;
    if (L < minLen || L > maxLen) continue;
    if (!byLen.has(L)) byLen.set(L, { L, words: [], clues: [], weight: [] });
    const d = byLen.get(L);
    d.words.push(word);
    d.clues.push(clue);
    d.weight.push(Math.exp((freq / 10 - 3.4) * 1.15));
  }
  for (const d of byLen.values()) {
    const n = d.words.length;
    const W = (n + 31) >>> 5;
    d.W = W;
    d.bits = Array.from({ length: d.L }, () => Array.from({ length: 26 }, () => new Uint32Array(W)));
    d.all = new Uint32Array(W);
    for (let i = 0; i < n; i++) {
      d.all[i >>> 5] |= 1 << (i & 31);
      const w = d.words[i];
      for (let p = 0; p < d.L; p++) d.bits[p][w.charCodeAt(p) - 97][i >>> 5] |= 1 << (i & 31);
    }
  }
  return byLen;
}

export function solve(topo, slotInfo, dict, rng, opts = {}) {
  const budget = opts.budget ?? 3000;
  const lcvK = opts.lcvK ?? 6;
  const maxTries = opts.maxTries ?? 24;
  const { slots, cellSlots } = slotInfo;
  const ns = slots.length;
  const letters = new Int8Array(topo.ncell);
  const assigned = new Uint8Array(ns);
  const cnt = new Int32Array(ns);
  const chosen = new Int32Array(ns).fill(-1);
  const used = new Map();
  for (const d of dict.values()) used.set(d.L, new Uint32Array(d.W));
  const tmp = new Uint32Array(Math.max(...[...dict.values()].map((d) => d.W)));

  for (const s of slots) if (!dict.has(s.cells.length)) return null;

  function computeInto(si) {
    const s = slots[si];
    const d = dict.get(s.cells.length);
    const u = used.get(d.L);
    const W = d.W;
    for (let i = 0; i < W; i++) tmp[i] = d.all[i] & ~u[i];
    for (let k = 0; k < d.L; k++) {
      const ch = letters[s.cells[k]];
      if (ch) {
        const b = d.bits[k][ch - 1];
        for (let i = 0; i < W; i++) tmp[i] &= b[i];
      }
    }
    return d;
  }
  function count(si) {
    const d = computeInto(si);
    let c = 0;
    for (let i = 0; i < d.W; i++) c += popcount(tmp[i]);
    return c;
  }
  function candidates(si) {
    const d = computeInto(si);
    const out = [];
    for (let i = 0; i < d.W; i++) {
      let x = tmp[i];
      while (x) {
        const low = x & -x;
        out.push((i << 5) + (31 - Math.clz32(low)));
        x ^= low;
      }
    }
    return out;
  }

  for (let i = 0; i < ns; i++) cnt[i] = count(i);

  let nodes = 0;
  let aborted = false;

  function assign(si, wi) {
    const s = slots[si];
    const d = dict.get(s.cells.length);
    const word = d.words[wi];
    const changed = [];
    for (let k = 0; k < s.cells.length; k++) {
      const c = s.cells[k];
      if (!letters[c]) { letters[c] = word.charCodeAt(k) - 96; changed.push(c); }
    }
    assigned[si] = 1;
    chosen[si] = wi;
    used.get(d.L)[wi >>> 5] |= 1 << (wi & 31);
    const saved = [];
    let ok = true;
    const seenSlots = new Set();
    for (const c of changed) {
      for (const { slot } of cellSlots[c]) {
        if (assigned[slot] || seenSlots.has(slot)) continue;
        seenSlots.add(slot);
        saved.push([slot, cnt[slot]]);
        cnt[slot] = count(slot);
        if (cnt[slot] === 0) ok = false;
      }
    }
    const undo = () => {
      for (const [slot, v] of saved) cnt[slot] = v;
      for (const c of changed) letters[c] = 0;
      assigned[si] = 0;
      chosen[si] = -1;
      used.get(d.L)[wi >>> 5] &= ~(1 << (wi & 31));
    };
    if (!ok) { undo(); return null; }
    return undo;
  }

  function dfs() {
    let best = -1, bc = 1e9, ties = 0;
    for (let s = 0; s < ns; s++) {
      if (assigned[s]) continue;
      const c = cnt[s];
      if (c === 0) return false;
      if (c < bc) { bc = c; best = s; ties = 1; }
      else if (c === bc) { ties++; if (rng() * ties < 1) best = s; }
    }
    if (best < 0) return true;
    if (++nodes > budget) { aborted = true; return false; }

    const d = dict.get(slots[best].cells.length);
    const cand = candidates(best);
    if (!cand.length) return false;
    const keyed = cand.map((i) => ({ i, k: -Math.log(rng() + 1e-9) / d.weight[i] }));
    keyed.sort((a, b) => a.k - b.k);
    const head = keyed.slice(0, lcvK);
    if (head.length > 1) {
      for (const h of head) {
        const undo = assign(best, h.i);
        if (!undo) { h.score = -1e9; continue; }
        let sc = 0;
        const seenS = new Set();
        for (const c of slots[best].cells) {
          for (const { slot } of cellSlots[c]) {
            if (slot !== best && !assigned[slot] && !seenS.has(slot)) {
              seenS.add(slot);
              sc += Math.log(1 + cnt[slot]);
            }
          }
        }
        h.score = sc + rng() * 0.6;
        undo();
      }
      head.sort((a, b) => b.score - a.score);
    }
    const order = head.map((h) => h.i).concat(keyed.slice(lcvK).map((h) => h.i));
    let tries = 0;
    for (const wi of order) {
      if (tries++ >= maxTries) break;
      const undo = assign(best, wi);
      if (!undo) continue;
      if (dfs()) return true;
      undo();
      if (aborted) return false;
    }
    return false;
  }

  const ok = dfs();
  if (!ok) return null;

  // final validation: no duplicate words, every slot spells a dictionary word
  const seen = new Set();
  const words = [];
  const clues = [];
  for (let si = 0; si < ns; si++) {
    const s = slots[si];
    const d = dict.get(s.cells.length);
    let w = '';
    for (const c of s.cells) w += String.fromCharCode(96 + letters[c]);
    const wi = d.words.indexOf(w);
    if (wi < 0 || seen.has(w)) return null;
    seen.add(w);
    words.push(w);
    clues.push(d.clues[wi]);
  }
  return { letters, words, clues, nodes };
}
