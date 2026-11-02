import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
const logs = [];
p.on('console', m => { if (m.type() !== 'warn') logs.push(m.type() + ': ' + m.text()); });
p.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
await p.goto('file:///tmp/work/cubeword/dist/index.html?d=2026-11-04&s=mini');
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.waitForFunction('window.__cwReady === true', { timeout: 90000 });
const wait = (ms) => new Promise(r => setTimeout(r, ms));
console.log('workers in page:', p.workers().length);
await wait(2200);   // first-visit help should auto-open
console.log('help auto-open:', await p.evaluate(() => !!document.querySelector('.modal h2') && document.querySelector('.modal h2').textContent));
await p.screenshot({ path: 'shots/ui-help.png' });
await p.keyboard.press('Escape');
await p.evaluate(() => __cw.scene.skipIntro());

// physical keyboard typing through real key events
await p.keyboard.type('zz');
const typed = await p.evaluate(() => __cw.game.letters.filter(Boolean).join(''));
console.log('typed via keyboard:', typed);
await p.keyboard.press('Backspace');
await p.keyboard.press('Tab');
console.log('tab -> slot', await p.evaluate(() => __cw.game.slot));
await p.keyboard.press('Space');
console.log('space toggles to slot', await p.evaluate(() => __cw.game.slot));

// assist menu
await p.click('#btnAssist'); await wait(400);
await p.screenshot({ path: 'shots/ui-assist.png' });
await p.evaluate(() => document.querySelector('#assistMenu button[data-a="check:all"]').click()); await wait(300);
console.log('toast:', await p.evaluate(() => document.querySelector('#toast').textContent));
await p.click('#btnAssist'); await wait(200);
await p.evaluate(() => document.querySelector('#assistMenu button[data-a="reveal:word"]').click()); await wait(300);
console.log('hints after reveal word:', await p.evaluate(() => __cw.game.hints));

// persistence across reload
await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await p.evaluate(() => { window.dispatchEvent(new Event('pagehide')); });
const before = await p.evaluate(() => __cw.game.letters.join('|'));
await p.reload();
await p.waitForFunction('window.__cwReady === true', { timeout: 90000 });
const after = await p.evaluate(() => __cw.game.letters.join('|'));
console.log('progress restored after reload:', before === after, '| letters:', after.replace(/\|/g, '').length);

// settings + stats modals
await p.evaluate(() => __cw.scene.skipIntro());
await p.click('#btnSettings'); await wait(700);
await p.screenshot({ path: 'shots/ui-settings.png' });
await p.keyboard.press('Escape');
await p.click('#btnStats'); await wait(700);
await p.screenshot({ path: 'shots/ui-stats.png' });
// size switch via UI
await p.keyboard.press('Escape');
await p.click('#sizeSwitch button[data-size="classic"]');
await p.waitForFunction('window.__cw.cur && window.__cw.cur.size === "classic"', { timeout: 60000 });
console.log('switched size ->', await p.evaluate(() => __cw.cur.size + ' slots=' + __cw.cur.puzzle.slots.length));
await wait(1500);
console.log(logs.slice(0, 20).join('\n') || 'no console errors');
await b.close();
