import fs from 'fs';
import { buildDict, solve } from '../src/solver.js';
import { makeRng } from '../src/rng.js';
import { buildTopology } from '../src/topology.js';
import { makePattern, buildSlots } from '../src/pattern.js';
const rows = JSON.parse(fs.readFileSync(process.env.WORDS || new URL('../data/words.json', import.meta.url)));
const MINF = +process.env.MINFREQ || 0;
const dict = buildDict(rows.filter(r => r[1] >= MINF), 3, 7);
const N = +process.argv[2] || 6, maxRun = N === 6 ? 7 : 6, budget = +process.argv[3] || 1200, restarts = +process.argv[4] || 1, maxTries = +process.argv[5] || 24, ptries = +process.argv[6] || 60, lcvK = +process.argv[7] || 6;
const topo = buildTopology(N);
let pat = 0, slot = 0, solveFail = 0, ok = 0, tp = 0, ts = 0, nodesOk = [];
const T = 400;
for (let a = 0; a < T; a++) {
  const rng = makeRng('diag|' + N + '|' + a);
  let t = Date.now();
  const bl = makePattern(topo, rng, { maxRun, tries: ptries }); tp += Date.now() - t;
  if (!bl) { pat++; continue; }
  const si = buildSlots(topo, bl); if (!si) { slot++; continue; }
  t = Date.now();
  let sol = null;
  for (let r = 0; r < restarts && !sol; r++) sol = solve(topo, si, dict, rng, { budget, maxTries, lcvK });
  ts += Date.now() - t;
  if (!sol) solveFail++; else { ok++; nodesOk.push(sol.nodes); }
}
console.log(`N=${N} budget=${budget} restarts=${restarts} maxTries=${maxTries} ptries=${ptries} lcvK=${lcvK}: patternNull=${pat} slotsNull=${slot} solveFail=${solveFail} ok=${ok} / ${T}; patMs=${tp} solveMs=${ts}; avg nodes on success=${Math.round(nodesOk.reduce((a,b)=>a+b,0)/Math.max(1,nodesOk.length))}`);
