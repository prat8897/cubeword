import puppeteer from 'puppeteer-core';
const [,, name='desk', w='1440', h='900', size='classic', mobile='0', date='2026-11-03'] = process.argv;
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--allow-file-access-from-files'] });
const p = await b.newPage();
await p.setViewport({ width: +w, height: +h, deviceScaleFactor: 1, isMobile: mobile === '1', hasTouch: mobile === '1' });
const logs = [];
p.on('console', m => logs.push(m.type() + ': ' + m.text()));
p.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
await p.goto(`file:///tmp/work/cubeword/dist/index.html?d=${date}&s=${size}`);
await p.evaluate(() => localStorage.setItem('cubeword:v1', JSON.stringify({ seenHelp: true })));
await p.reload();
const t0 = Date.now();
try { await p.waitForFunction('window.__cwReady === true', { timeout: 60000 }); } catch (e) { logs.push('TIMEOUT waiting for ready'); }
console.log('ready after', Date.now() - t0, 'ms');
await p.evaluate(() => __cw.scene.skipIntro());
await new Promise(r => setTimeout(r, 5000));
await p.screenshot({ path: `shots/${name}.png` });
console.log(logs.slice(0, 20).join('\n'));
await b.close();
