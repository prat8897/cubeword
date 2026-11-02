// Cube-surface topology.
// Each face is an N x N grid. A "ring" is a closed loop of 4N cells running around the cube
// (like one layer of a Rubik's cube). Every cell lies on exactly two rings, so every cell can be
// crossed by two words. Words are runs of cells along a ring and may wrap across faces.

export const FACES = [
  { name: 'Front',  n: [0, 0, 1],  r: [1, 0, 0],  u: [0, 1, 0] },
  { name: 'Right',  n: [1, 0, 0],  r: [0, 0, -1], u: [0, 1, 0] },
  { name: 'Back',   n: [0, 0, -1], r: [-1, 0, 0], u: [0, 1, 0] },
  { name: 'Left',   n: [-1, 0, 0], r: [0, 0, 1],  u: [0, 1, 0] },
  { name: 'Top',    n: [0, 1, 0],  r: [1, 0, 0],  u: [0, 0, -1] },
  { name: 'Bottom', n: [0, -1, 0], r: [1, 0, 0],  u: [0, 0, 1] },
];

// ring families, named for how they look on the cube
export const FAMILIES = [
  { axis: 0, name: 'Hoops',  blurb: 'run over the top and down the front' },
  { axis: 1, name: 'Belts',  blurb: 'run around the sides' },
  { axis: 2, name: 'Frames', blurb: 'run around the top, right, bottom and left' },
];

const cache = new Map();

export function buildTopology(N) {
  if (cache.has(N)) return cache.get(N);
  const h = (N - 1) / 2;
  const cells = [];
  const keyMap = new Map();
  const key = (x, y, z) => `${Math.round(x * 2)},${Math.round(y * 2)},${Math.round(z * 2)}`;

  for (let f = 0; f < 6; f++) {
    const F = FACES[f];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const id = f * N * N + r * N + c;
        const pos = [0, 1, 2].map(
          (i) => F.n[i] * (N / 2) + F.r[i] * (c - h) + F.u[i] * (h - r)
        );
        cells.push({ id, face: f, r, c, pos });
        keyMap.set(key(pos[0], pos[1], pos[2]), id);
      }
    }
  }
  const ncell = cells.length;

  // antipodal partner of every cell
  const mirror = new Int32Array(ncell);
  for (const cell of cells) {
    mirror[cell.id] = keyMap.get(key(-cell.pos[0], -cell.pos[1], -cell.pos[2]));
  }

  // rings
  const angle = [
    (p) => Math.atan2(-p[1], p[2]), // axis x
    (p) => Math.atan2(p[0], p[2]),  // axis y
    (p) => Math.atan2(p[0], p[1]),  // axis z
  ];
  const rings = [];
  for (let axis = 0; axis < 3; axis++) {
    for (let layer = 0; layer < N; layer++) {
      const members = cells.filter((cell) => {
        const nAxis = FACES[cell.face].n.findIndex((v) => v !== 0);
        return nAxis !== axis && Math.round(cell.pos[axis] + h) === layer;
      });
      members.sort((a, b) => angle[axis](a.pos) - angle[axis](b.pos));
      rings.push({ id: rings.length, axis, layer, cells: members.map((m) => m.id) });
    }
  }
  const cellRings = Array.from({ length: ncell }, () => []);
  for (const ring of rings) {
    ring.cells.forEach((cid, idx) => cellRings[cid].push({ ring: ring.id, idx }));
  }
  for (const cr of cellRings) if (cr.length !== 2) throw new Error('topology: cell not on 2 rings');
  for (const ring of rings) if (ring.cells.length !== 4 * N) throw new Error('topology: bad ring length');

  const topo = { N, cells, ncell, mirror, rings, cellRings };
  cache.set(N, topo);
  return topo;
}
