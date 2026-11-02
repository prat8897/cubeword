import puppeteer from 'puppeteer-core';
const [,, tag='p', w='1440', h='900', size='classic', mobile='0'] = process.argv;
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage();
await p.setViewport({ width: +w, height: +h, deviceScaleFactor: 1, isMobile: mobile === '1', hasTouch: mobile === '1' });
const logs = [];
p.on('console', m => { if (m.type() !== 'warn') logs.push(m.type() + ': ' + m.text()); });
p.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
await p.goto(`file:///tmp/work/cubeword/dist/index.html?d=2026-11-03&s=${size}`);
await p.evaluate(() => localStorage.clear());
await p.evaluate(() => localStorage.setItem('cubeword:v1', JSON.stringify({ seenHelp: true })));
await p.reload();
await p.waitForFunction('window.__cwReady === true', { timeout: 90000 });
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const shot = async (n) => { await p.screenshot({ path: `shots/${tag}-${n}.png` }); };
await p.evaluate(() => __cw.scene.skipIntro());
await wait(1500);

// 1. type the first word
await p.evaluate(() => { const g = __cw.game; const s = g.activeSlot(); for (let i = 0; i < s.cells.length; i++) g.type(g.cell(g.sel).letter); });
await wait(1500); await p.evaluate(() => __cw.scene.snap()); await wait(1200);
await shot('1-typed');

// 2. jump to a clue on a far face, snap, screenshot
const info = await p.evaluate(() => {
  const g = __cw.game; const P = g.p;
  const far = P.slots.find(s => s.cells.every(c => P.cells[c].face === 5));
  const id = (far || P.slots[P.slots.length - 1]).id;
  g.selectSlot(id);
  return { id, faces: [...new Set(P.slots[id].cells.map(c => P.cells[c].face))] };
});
console.log('jumped to slot', JSON.stringify(info));
await wait(1200); await p.evaluate(() => __cw.scene.snap()); await wait(1500);
await shot('2-farface');

// 3. real pointer click on a specific tile
const click = await p.evaluate(() => {
  const g = __cw.game, sc = __cw.scene, P = g.p;
  const THREEv = sc.camera.position.clone();
  // find a visible white cell that is not selected
  const cands = P.cells.filter(c => !c.blocked && c.id !== g.sel);
  for (const c of cands) {
    const o = sc.cells[c.id];
    const v = THREEv.clone(); o.tile.getWorldPosition(v);
    const nrm = THREEv.clone().set(...P.faces[c.face].n).applyQuaternion(sc.q);
    if (nrm.z > 0.6) { v.project(sc.camera); const r = sc.canvas.getBoundingClientRect(); return { id: c.id, x: (v.x + 1) / 2 * r.width + r.left, y: (1 - v.y) / 2 * r.height + r.top }; }
  }
});
await p.mouse.click(click.x, click.y);
await wait(400);
const picked = await p.evaluate(() => __cw.game.sel);
console.log('clicked cell', click.id, '=> selected', picked, picked === click.id ? 'PICK OK' : 'PICK MISMATCH');
await wait(800);
await shot('3-clicked');

// 4. drag rotate
await p.mouse.move(500, 450); await p.mouse.down(); await p.mouse.move(640, 400, { steps: 6 }); await p.mouse.up();
await wait(1800);
await shot('4-dragged');

// 5. fill the whole puzzle and win
await p.evaluate(() => { const g = __cw.game; let n = 0; while (!g.solved && n++ < 2000) g.type(g.cell(g.sel).letter); });
await wait(1800);
await shot('5-celebrate');
await wait(2600);
await shot('6-win');
console.log('solved:', await p.evaluate(() => __cw.game.solved), 'stats:', await p.evaluate(() => JSON.stringify(__cw.store.stats)));
console.log(logs.slice(0, 20).join('\n') || 'no console errors');
await b.close();
