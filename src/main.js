import { CubeScene } from './scene.js';
import { Game } from './game.js';
import { Sfx } from './audio.js';
import { paletteFor } from './palette.js';
import { SIZES, generatePuzzle } from './generate.js';
import { buildDict } from './solver.js';
import { FAMILIES } from './topology.js';
import WORDS from '../data/words.json';

const dictCache = new Map();
const getDict = (minFreq) => {
  if (!dictCache.has(minFreq)) dictCache.set(minFreq, buildDict(WORDS.filter((r) => r[1] >= minFreq), 3, 7));
  return dictCache.get(minFreq);
};

if (typeof document === 'undefined') {
  // ---- running inside the generator Web Worker ----
  self.onmessage = (e) => {
    const { id, date, size } = e.data;
    try {
      self.postMessage({ id, puzzle: generatePuzzle(date, size, getDict) });
    } catch (err) {
      self.postMessage({ id, error: String(err && err.message ? err.message : err) });
    }
  };
} else {
  startApp();
}

function startApp() {
  const $ = (s, r = document) => r.querySelector(s);
  const EPOCH = '2026-11-03';
  const pad = (n) => String(n).padStart(2, '0');
  const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const todayStr = () => fmtDate(new Date());
  const dayNumber = (s) => { const a = parseDate(s), b = parseDate(EPOCH); return Math.round((a - b) / 864e5) + 1; };
  const prettyDate = (s) => parseDate(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const fmtTime = (sec) => { sec = Math.max(0, Math.round(sec)); const m = Math.floor(sec / 60), s = sec % 60; return m >= 60 ? `${Math.floor(m / 60)}:${pad(m % 60)}:${pad(s)}` : `${m}:${pad(s)}`; };
  const clampDate = (s) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return todayStr(); const t = todayStr(); if (s > t) return t; if (s < EPOCH) return EPOCH; return s; };

  const SUPPORT_URL = 'https://buymeacoffee.com/prat8897';
  const ICON = {
    cup: '<svg viewBox="0 0 24 24"><path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3v2M11 3v2M14 3v2"/></svg>',
    help: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.8"/><circle cx="12" cy="17" r=".5" fill="currentColor"/></svg>',
    stats: '<svg viewBox="0 0 24 24"><path d="M5 20V11M12 20V4M19 20v-7"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>',
    bulb: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.7.6 1 1.3 1 2.1h5c0-.8.3-1.5 1-2.1A6 6 0 0 0 12 3z"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/></svg>',
    left: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    right: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M21 5H9l-6 7 6 7h12z"/><path d="M13 9.5l5 5M18 9.5l-5 5"/></svg>',
    swap: '<svg viewBox="0 0 24 24"><path d="M6 8h12l-3-3M18 16H6l3 3"/></svg>',
  };

  // ---------- storage ----------
  const KEY = 'cubeword:v1';
  let store = {
    settings: { sound: true, ambient: false, quality: 'auto', kbd: 'auto', motion: 'auto' },
    progress: {}, stats: { days: {}, solved: {} }, lastSize: 'classic', seenHelp: false,
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      store = { ...store, ...s, settings: { ...store.settings, ...(s.settings || {}) }, stats: { days: {}, solved: {}, ...(s.stats || {}) } };
    }
  } catch (e) { /* storage unavailable: play without persistence */ }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* ignore */ } };

  // ---------- fatal ----------
  const fatal = (title, msg) => {
    const f = $('#fatal');
    f.innerHTML = `<h2>${title}</h2><p>${msg}</p>`;
    f.hidden = false;
    $('#loader').classList.add('hide');
  };

  // ---------- chrome icons ----------
  $('#btnClues').innerHTML = ICON.list;
  $('#btnAssist').innerHTML = ICON.bulb;
  $('#btnStats').innerHTML = ICON.stats;
  $('#btnSupport').innerHTML = ICON.cup;
  $('#btnHelp').innerHTML = ICON.help;
  $('#btnSettings').innerHTML = ICON.gear;
  $('#prevClue').innerHTML = ICON.left;
  $('#nextClue').innerHTML = ICON.right;

  // ---------- audio ----------
  const sfx = new Sfx();
  sfx.enabled = store.settings.sound;
  let audioPrimed = false;
  const primeAudio = () => {
    if (audioPrimed) return;
    audioPrimed = true;
    sfx.unlocked = true;
    if (store.settings.sound || store.settings.ambient) sfx.ensure();
    if (store.settings.ambient) sfx.setAmbient(true);
  };

  // ---------- state ----------
  let scene = null;
  let cur = null;           // { date, size, puzzle, game }
  let started = false;
  let loadToken = 0;
  let modalOpen = false;
  let saveTimer = 0;
  const cache = new Map();

  // ---------- worker ----------
  let worker = null;
  const pending = new Map();
  let nextId = 1;
  try {
    const src = document.getElementById('app').textContent;
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    worker.onmessage = (e) => {
      const { id, puzzle, error } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      error ? p.reject(new Error(error)) : p.resolve(puzzle);
    };
    worker.onerror = (e) => {
      console.warn('generator worker failed, falling back to main thread', e && e.message);
      worker = null;
      for (const [, p] of pending) setTimeout(() => { try { p.resolve(generatePuzzle(p.date, p.size, getDict)); } catch (err) { p.reject(err); } }, 0);
      pending.clear();
    };
  } catch (e) { worker = null; }

  function requestPuzzle(date, size) {
    const key = `${date}|${size}`;
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    return new Promise((resolve, reject) => {
      const done = (p) => { cache.set(key, p); resolve(p); };
      if (worker) {
        const id = nextId++;
        pending.set(id, { resolve: done, reject, date, size });
        worker.postMessage({ id, date, size });
      } else {
        setTimeout(() => { try { done(generatePuzzle(date, size, getDict)); } catch (e) { reject(e); } }, 30);
      }
    });
  }

  // ---------- toast ----------
  let toastT = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ---------- size switch ----------
  const seg = $('#sizeSwitch');
  Object.entries(SIZES).forEach(([key, cfg]) => {
    const b = document.createElement('button');
    b.dataset.size = key;
    b.setAttribute('role', 'tab');
    b.innerHTML = `${cfg.label}<small>${cfg.blurb}</small>`;
    b.addEventListener('click', () => { primeAudio(); if (cur && cur.size !== key) switchTo(cur.date, key); });
    seg.appendChild(b);
  });
  function updateSeg() {
    const btns = [...seg.querySelectorAll('button')];
    btns.forEach((b) => b.classList.toggle('on', cur && b.dataset.size === cur.size));
    const on = btns.find((b) => b.classList.contains('on'));
    const thumb = $('.thumb', seg);
    if (on) {
      thumb.style.width = on.offsetWidth + 'px';
      thumb.style.transform = `translateX(${on.offsetLeft - 4}px)`;
    }
  }

  // ---------- panel (clue list) ----------
  function buildPanel() {
    const root = $('#clueLists');
    root.innerHTML = '';
    for (const fam of FAMILIES) {
      const slots = cur.puzzle.slots.filter((s) => s.axis === fam.axis).sort((a, b) => a.num - b.num);
      const sec = document.createElement('div');
      sec.className = `fam f${fam.axis}`;
      sec.innerHTML = `<div class="famhead"><i></i>${fam.name}<em>${fam.blurb}</em></div>`;
      const ol = document.createElement('ol');
      for (const s of slots) {
        const li = document.createElement('li');
        li.dataset.slot = s.id;
        li.innerHTML = `<span class="n">${s.num}</span><span class="t"></span><span class="l">${s.cells.length}</span>`;
        li.querySelector('.t').textContent = s.clue;
        li.addEventListener('click', () => {
          primeAudio(); markStarted();
          cur.game.selectSlot(s.id);
          if (matchMedia('(max-width: 899px)').matches) $('#panel').classList.remove('open');
        });
        ol.appendChild(li);
      }
      sec.appendChild(ol);
      root.appendChild(sec);
    }
  }
  function updatePanel() {
    const g = cur.game;
    const cross = g.crossSlotId();
    root_li().forEach((li) => {
      const id = +li.dataset.slot;
      li.classList.toggle('active', id === g.slot);
      li.classList.toggle('cross', id === cross);
      li.classList.toggle('done', !!g.slotDone[id]);
    });
    const act = $(`#clueLists li[data-slot="${g.slot}"]`);
    if (act && innerWidth >= 900) act.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const { filled, total } = g.progress();
    $('#progText').textContent = `${filled}/${total}`;
    $('#progBar').style.width = `${(filled / total) * 100}%`;
  }
  const root_li = () => [...document.querySelectorAll('#clueLists li')];

  // ---------- clue bar ----------
  function updateClueBar() {
    const g = cur.game;
    const s = g.activeSlot();
    const fam = FAMILIES[s.axis];
    const chip = $('#clueChip');
    chip.textContent = fam.name;
    chip.className = `chip f${s.axis}`;
    $('#clueNum').textContent = s.num;
    const have = s.cells.filter((c) => g.letters[c]).length;
    $('#clueDir').textContent = `${have}/${s.cells.length}`;
    const t = $('#clueText');
    t.textContent = s.clue;
    const len = document.createElement('span');
    len.className = 'len';
    len.textContent = `(${s.cells.length})`;
    t.appendChild(len);
  }

  // ---------- selection sync ----------
  function syncSelection(byClue = false) {
    if (!cur) return;
    const g = cur.game;
    const slot = g.activeSlot();
    const idx = g.indexInSlot();
    const crossId = g.crossSlotId();
    const last = slot.cells.length - 1;
    scene.setHighlight({
      sel: g.sel,
      word: slot.cells,
      cross: crossId !== undefined ? g.slotOf(crossId).cells.filter((c) => c !== g.sel) : [],
      dir: { from: idx < last ? slot.cells[idx] : slot.cells[idx - 1], to: idx < last ? slot.cells[idx + 1] : slot.cells[idx] },
    });
    scene.focusCells(slot.cells, g.sel, { strict: byClue });
    updateClueBar();
    updatePanel();
  }

  // ---------- timer ----------
  function markStarted() {
    if (!started && cur && !cur.game.solved) { started = true; $('#timer').classList.remove('paused'); }
  }
  let lastTick = performance.now();
  setInterval(() => {
    const now = performance.now();
    const dt = (now - lastTick) / 1000;
    lastTick = now;
    if (cur && started && !cur.game.solved && !document.hidden && !modalOpen) {
      cur.game.elapsed += Math.min(dt, 1);
    }
    if (cur) $('#timer').textContent = fmtTime(cur.game.elapsed);
  }, 250);
  const scheduleSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveProgress, 500); };
  function saveProgress() {
    if (!cur) return;
    store.progress[`${cur.date}|${cur.size}`] = cur.game.save();
    // keep storage tidy: remember only the most recent 120 puzzles
    const keys = Object.keys(store.progress);
    if (keys.length > 120) keys.sort().slice(0, keys.length - 120).forEach((k) => delete store.progress[k]);
    persist();
  }
  setInterval(saveProgress, 8000);
  addEventListener('pagehide', saveProgress);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveProgress(); });

  // ---------- game wiring ----------
  function bindGame(g) {
    g.on('select', (e) => { syncSelection(!!e.byClue); if (e.pick || e.byClue || e.toggled) sfx.select(); });
    g.on('cell', (e) => {
      scene.setLetter(e.id, e.letter, { pop: !e.revealed, kind: g.flag[e.id] === 1 ? 1 : 0 });
      updateClueBar(); updatePanel(); scheduleSave();
    });
    g.on('typed', (e) => { sfx.key(e.letter.charCodeAt(0) - 65); if (navigator.vibrate) try { navigator.vibrate(6); } catch (err) { /* ignore */ } });
    g.on('wordComplete', (e) => {
      const s = g.slotOf(e.slot);
      scene.flashCells(s.cells, FAMILY_COLORS[s.axis], 0.9);
      sfx.wordDone();
      updatePanel();
    });
    g.on('check', ({ wrong, right }) => {
      for (const id of wrong) scene.setKind(id, 2);
      scene.flashCells(wrong, '#ff4d6a', 1);
      scene.flashCells(right, '#6dffb0', 0.8);
      if (wrong.length) { sfx.wrong(); toast(`${wrong.length} ${wrong.length === 1 ? 'letter is' : 'letters are'} wrong`); }
      else if (right.length) { sfx.checkOk(); toast('All correct so far'); }
      else toast('Nothing to check yet');
      scheduleSave();
    });
    g.on('reveal', ({ ids }) => {
      scene.flashCells(ids, cur ? scene.palette.accent : '#fff', 1);
      sfx.reveal();
      updateClueBar(); updatePanel(); scheduleSave();
    });
    g.on('solved', ({ last }) => onSolved(last));
  }
  const FAMILY_COLORS = ['#ff8f7d', '#70d4ff', '#8df2b4'];

  function onSolved(last) {
    saveProgress();
    const key = `${cur.date}|${cur.size}`;
    store.stats.solved[key] = { secs: Math.round(cur.game.elapsed), hints: cur.game.hints };
    if (cur.date === todayStr()) store.stats.days[cur.date] = true;
    persist();
    scene.celebrate(last);
    sfx.win();
    sfx.whoosh();
    setTimeout(() => openWin(), 2100);
  }

  // ---------- loading puzzles ----------
  async function switchTo(date, size) {
    const token = ++loadToken;
    date = clampDate(date);
    const key = `${date}|${size}`;
    if (cur && cur.game) saveProgress();
    sfx.whoosh();
    const loaderTimer = setTimeout(() => { if (token === loadToken) { $('#loader').classList.remove('hide'); } }, 450);
    try {
      const [puzzle] = await Promise.all([requestPuzzle(date, size), scene.clearPuzzle()]);
      if (token !== loadToken) return;
      const game = new Game(puzzle, store.progress[key]);
      cur = { date, size, puzzle, game };
      started = false;
      scene.setPalette(paletteFor(date));
      applyPaletteCss(scene.palette);
      bindGame(game);
      buildPanel();
      await scene.loadPuzzle(puzzle, game.letters, game.flag);
      if (token !== loadToken) return;
      store.lastSize = size;
      persist();
      $('#dateLabel').textContent = `${dayNumber(date) > 0 ? '#' + dayNumber(date) + ' · ' : ''}${prettyDate(date)}${date === todayStr() ? ' · Today' : ''}`;
      $('#timer').textContent = fmtTime(game.elapsed);
      $('#timer').classList.add('paused');
      updateSeg();
      layout();
      syncSelection(true);
      scene.focusCells(game.activeSlot().cells, game.sel, { force: true });
      history.replaceState(null, '', `?d=${date}&s=${size}`);
      if (game.solved) toast('Already solved — replay or try another size');
    } catch (err) {
      console.error(err);
      toast('Could not build this puzzle');
    } finally {
      clearTimeout(loaderTimer);
      if (token === loadToken) $('#loader').classList.add('hide');
    }
  }

  function applyPaletteCss(p) {
    const r = document.documentElement.style;
    r.setProperty('--accent', p.accent);
    r.setProperty('--accent2', p.accent2);
    document.querySelector('meta[name="theme-color"]').content = p.bg[0];
  }

  // ---------- layout ----------
  function layout() {
    if (!scene) return;
    const topB = $('#top').getBoundingClientRect().bottom + 8;
    const bTop = $('#bottom').getBoundingClientRect().top;
    const bottom = Math.max(0, innerHeight - bTop + 6);
    const wide = innerWidth >= 900;
    const right = wide ? $('#panel').getBoundingClientRect().width + 24 : 0;
    scene.setInsets({ left: 0, right, top: topB, bottom });
    updateSeg();
  }
  addEventListener('resize', () => { layout(); });

  // ---------- on-screen keyboard ----------
  const kbd = $('#kbd');
  const rows = ['QWERTYUIOP', 'ASDFGHJKL', '+ZXCVBNM-'];
  rows.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'krow';
    for (const ch of r) {
      const b = document.createElement('button');
      b.className = 'kbtn';
      b.tabIndex = -1;
      if (ch === '+') { b.classList.add('wide'); b.innerHTML = ICON.swap; b.setAttribute('aria-label', 'Switch word'); b.dataset.k = 'swap'; }
      else if (ch === '-') { b.classList.add('wide'); b.innerHTML = ICON.back; b.setAttribute('aria-label', 'Backspace'); b.dataset.k = 'back'; }
      else { b.textContent = ch; b.dataset.k = ch; }
      row.appendChild(b);
    }
    kbd.appendChild(row);
  });
  kbd.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.kbtn');
    if (!b || !cur) return;
    e.preventDefault();
    primeAudio(); markStarted();
    b.classList.add('press');
    setTimeout(() => b.classList.remove('press'), 90);
    const k = b.dataset.k;
    if (k === 'swap') cur.game.toggleDirection();
    else if (k === 'back') { cur.game.backspace(); sfx.erase(); }
    else cur.game.type(k);
  });
  function applyKeyboardSetting() {
    const m = store.settings.kbd;
    const on = m === 'on' || (m === 'auto' && matchMedia('(pointer: coarse)').matches);
    kbd.classList.toggle('on', on);
    requestAnimationFrame(layout);
  }

  // ---------- physical keyboard ----------
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (modalOpen) { closeModal(); e.preventDefault(); }
      $('#assistMenu').hidden = true;
      $('#panel').classList.remove('open');
      return;
    }
    if (modalOpen || !cur || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    primeAudio();
    const g = cur.game;
    if (/^[a-zA-Z]$/.test(e.key)) { markStarted(); g.type(e.key); e.preventDefault(); }
    else if (e.key === 'Backspace' || e.key === 'Delete') { markStarted(); g.backspace(); sfx.erase(); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { g.step(1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { g.step(-1); e.preventDefault(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'Enter') { g.toggleDirection(); e.preventDefault(); }
    else if (e.key === 'Tab') { g.nextSlot(e.shiftKey ? -1 : 1); e.preventDefault(); }
  });

  // ---------- buttons ----------
  $('#prevClue').addEventListener('click', () => { primeAudio(); markStarted(); cur.game.nextSlot(-1); });
  $('#nextClue').addEventListener('click', () => { primeAudio(); markStarted(); cur.game.nextSlot(1); });
  $('#btnClues').addEventListener('click', () => { $('#panel').classList.toggle('open'); });
  $('#btnClosePanel').addEventListener('click', () => $('#panel').classList.remove('open'));
  $('#btnHelp').addEventListener('click', () => openHelp());
  $('#btnStats').addEventListener('click', () => openStats());
  $('#btnSettings').addEventListener('click', () => openSettings());
  $('#btnAssist').addEventListener('click', (e) => { e.stopPropagation(); toggleAssist(); });
  document.addEventListener('pointerdown', (e) => {
    const m = $('#assistMenu');
    if (!m.hidden && !e.target.closest('#assistMenu') && !e.target.closest('#btnAssist')) m.hidden = true;
  });

  function toggleAssist() {
    const m = $('#assistMenu');
    if (!m.hidden) { m.hidden = true; return; }
    m.innerHTML = `
      <h6>Check</h6>
      <button data-a="check:cell">Check letter</button>
      <button data-a="check:word">Check word</button>
      <button data-a="check:all">Check puzzle</button>
      <h6>Reveal</h6>
      <button data-a="reveal:cell">Reveal letter</button>
      <button data-a="reveal:word">Reveal word</button>
      <button data-a="reveal:all">Reveal puzzle<span>gives up</span></button>`;
    m.hidden = false;
    m.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const [kind, scope] = b.dataset.a.split(':');
      m.hidden = true;
      primeAudio(); markStarted();
      if (!cur || cur.game.solved) return;
      if (kind === 'reveal' && scope === 'all' && !confirm('Reveal the whole puzzle? This ends the run.')) return;
      cur.game[kind](scope);
    }));
  }

  // ---------- modals ----------
  function openModal(html, { cls = '', onMount } = {}) {
    closeModal(true);
    const root = $('#modalRoot');
    const bd = document.createElement('div');
    bd.className = 'backdrop';
    bd.innerHTML = `<div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div>`;
    bd.addEventListener('pointerdown', (e) => { if (e.target === bd) closeModal(); });
    root.appendChild(bd);
    modalOpen = true;
    $('#assistMenu').hidden = true;
    const x = bd.querySelector('[data-close]');
    if (x) x.addEventListener('click', () => closeModal());
    bd.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', () => closeModal()));
    onMount && onMount(bd);
  }
  function closeModal(silent) {
    const root = $('#modalRoot');
    root.innerHTML = '';
    modalOpen = false;
    void silent;
  }
  const xBtn = '<button class="ib sm x" data-close aria-label="Close">✕</button>';

  function openHelp() {
    openModal(`${xBtn}
      <h2>How to play</h2>
      <div class="sub">A fresh crossword, folded onto a cube.</div>
      <ol class="steps">
        <li><div><b>Words wrap around the cube.</b> They run in loops over edges and across faces, so a word can start on one side and finish on another.</div></li>
        <li><div><b>Every tile sits in two words.</b> Tap a tile to select it, tap again to switch to the crossing word. The glowing arrow shows which way the word reads.</div></li>
        <li><div><b>Type to fill.</b> The cube turns itself to keep your word in view. Drag to look around, pinch or scroll to zoom.</div></li>
        <li><div><b>Same puzzle for everyone, every day.</b> Pick Mini, Classic or Grand. Finished puzzles join your streak.</div></li>
      </ol>
      <div class="btnrow"><button class="btn primary" data-close>Start solving</button></div>`);
  }

  function computeStreak() {
    let n = 0;
    const d = new Date();
    if (!store.stats.days[fmtDate(d)]) d.setDate(d.getDate() - 1);
    while (store.stats.days[fmtDate(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function openStats() {
    const solvedKeys = Object.keys(store.stats.solved);
    const best = (size) => {
      const t = solvedKeys.filter((k) => k.endsWith('|' + size) && store.stats.solved[k].hints === 0).map((k) => store.stats.solved[k].secs);
      return t.length ? fmtTime(Math.min(...t)) : '–';
    };
    const clean = solvedKeys.filter((k) => store.stats.solved[k].hints === 0).length;
    const today = todayStr();
    let days = '';
    const d = new Date();
    for (let i = 0; i < 14; i++) {
      const s = fmtDate(d);
      if (s < EPOCH) break;
      const solved = solvedKeys.some((k) => k.startsWith(s));
      days += `<button class="day ${solved ? 'solved' : ''} ${cur && cur.date === s ? 'cur' : ''}" data-d="${s}" title="${s}"><span>${d.toLocaleDateString(undefined, { weekday: 'narrow' })}<b>${d.getDate()}</b></span></button>`;
      d.setDate(d.getDate() - 1);
    }
    openModal(`${xBtn}
      <h2>Stats</h2>
      <div class="sub">Your cube-solving record, stored on this device.</div>
      <div class="statgrid">
        <div class="stat"><b>${computeStreak()}</b><span>Streak</span></div>
        <div class="stat"><b>${solvedKeys.length}</b><span>Solved</span></div>
        <div class="stat"><b>${clean}</b><span>No assists</span></div>
        <div class="stat"><b>${best(cur ? cur.size : 'classic')}</b><span>Best ${cur ? SIZES[cur.size].label : ''}</span></div>
      </div>
      <h4>Archive · last two weeks</h4>
      <div class="days">${days}</div>
      <div class="datepick"><input type="date" id="pickDate" min="${EPOCH}" max="${today}" value="${cur ? cur.date : today}"><button class="btn" id="goDate">Play</button></div>`, {
      onMount: (bd) => {
        bd.querySelectorAll('.day').forEach((b) => b.addEventListener('click', () => { closeModal(); switchTo(b.dataset.d, cur.size); }));
        bd.querySelector('#goDate').addEventListener('click', () => { const v = bd.querySelector('#pickDate').value; if (v) { closeModal(); switchTo(v, cur.size); } });
      },
    });
  }

  function openSettings() {
    const s = store.settings;
    openModal(`${xBtn}
      <h2>Settings</h2>
      <div class="sub">Tune the feel of the cube.</div>
      <div class="row"><div>Sound effects<small>Soft notes as you type and solve</small></div><input class="sw" type="checkbox" id="setSound" ${s.sound ? 'checked' : ''}></div>
      <div class="row"><div>Ambient pad<small>A slow generative drone</small></div><input class="sw" type="checkbox" id="setAmbient" ${s.ambient ? 'checked' : ''}></div>
      <div class="row"><div>Visual effects<small>Glow and bloom. Lower this if it feels slow.</small></div>
        <select class="sel" id="setQuality"><option value="auto">Auto</option><option value="high">High</option><option value="low">Low</option></select></div>
      <div class="row"><div>On-screen keyboard<small>Handy on touch screens</small></div>
        <select class="sel" id="setKbd"><option value="auto">Auto</option><option value="on">Always</option><option value="off">Never</option></select></div>
      <div class="row"><div>Motion<small>Idle sway and cube drift</small></div>
        <select class="sel" id="setMotion"><option value="auto">System</option><option value="full">Full</option><option value="reduced">Reduced</option></select></div>
      <div class="btnrow"><button class="btn" id="openStats2">Stats &amp; archive</button><button class="btn" id="openHelp2">How to play</button></div>
      <div class="btnrow"><a class="btn support" href="${SUPPORT_URL}" target="_blank" rel="noopener">☕ Support CubeWord</a></div>
      <p class="fine">Clues are adapted from Princeton WordNet. Word frequencies from the wordfreq project (CC BY-SA 4.0). three.js renders the cube.</p>`, {
      onMount: (bd) => {
        bd.querySelector('#setQuality').value = s.quality;
        bd.querySelector('#setKbd').value = s.kbd;
        bd.querySelector('#setMotion').value = s.motion;
        bd.querySelector('#setSound').addEventListener('change', (e) => { s.sound = e.target.checked; sfx.enabled = s.sound; if (s.sound) { sfx.ensure(); sfx.select(); } persist(); });
        bd.querySelector('#setAmbient').addEventListener('change', (e) => { s.ambient = e.target.checked; sfx.setAmbient(s.ambient); persist(); });
        bd.querySelector('#setQuality').addEventListener('change', (e) => { s.quality = e.target.value; applyQuality(); persist(); });
        bd.querySelector('#setKbd').addEventListener('change', (e) => { s.kbd = e.target.value; applyKeyboardSetting(); persist(); });
        bd.querySelector('#setMotion').addEventListener('change', (e) => { s.motion = e.target.value; applyMotion(); persist(); });
        bd.querySelector('#openStats2').addEventListener('click', openStats);
        bd.querySelector('#openHelp2').addEventListener('click', openHelp);
      },
    });
  }
  function applyQuality() {
    const q = store.settings.quality;
    scene._degraded = q !== 'auto';
    scene.setQuality(q === 'low' ? 'low' : 'high');
  }
  function applyMotion() {
    const m = store.settings.motion;
    scene.reduced = m === 'reduced' || (m === 'auto' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function shareText() {
    const g = cur.game;
    const n = dayNumber(cur.date);
    const url = location.origin + location.pathname;
    return [
      `🧊 CubeWord ${n > 0 ? '#' + n : cur.date} · ${SIZES[cur.size].label}`,
      `⏱ ${fmtTime(g.elapsed)}   💡 ${g.hints}   🔎 ${g.checks}`,
      `${cur.puzzle.slots.length} words · ${cur.puzzle.cells.filter((c) => !c.blocked).length} tiles`,
      url,
    ].join('\n');
  }
  function openWin() {
    if (!cur) return;
    const g = cur.game;
    const sizes = Object.keys(SIZES);
    const nextSize = sizes.find((k) => !store.stats.solved[`${cur.date}|${k}`]) || null;
    openModal(`${xBtn}
      <h2>Solved</h2>
      <div class="sub">${g.hints ? 'Finished with a little help.' : 'Clean solve. Beautiful.'}</div>
      <div class="statgrid">
        <div class="stat"><b>${fmtTime(g.elapsed)}</b><span>Time</span></div>
        <div class="stat"><b>${g.hints}</b><span>Reveals</span></div>
        <div class="stat"><b>${computeStreak()}</b><span>Day streak</span></div>
      </div>
      <pre id="shareTxt">${shareText()}</pre>
      <div class="btnrow">
        <button class="btn primary" id="doShare">Share result</button>
        <a class="btn support" href="${SUPPORT_URL}" target="_blank" rel="noopener">☕ Buy me a coffee</a>
        ${nextSize ? `<button class="btn" id="doNext">Try ${SIZES[nextSize].label}</button>` : '<button class="btn" data-close>Admire the cube</button>'}
      </div>`, {
      cls: 'win',
      onMount: (bd) => {
        bd.querySelector('#doShare').addEventListener('click', async () => {
          const text = shareText();
          try {
            if (navigator.share) await navigator.share({ text });
            else { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); }
          } catch (e) {
            try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); } catch (e2) { toast('Select the text to copy it'); }
          }
        });
        const nx = bd.querySelector('#doNext');
        if (nx) nx.addEventListener('click', () => { closeModal(); switchTo(cur.date, nextSize); });
      },
    });
  }

  // ---------- boot ----------
  try {
    scene = new CubeScene($('#gl'), {
      onPick: (id) => {
        if (!cur || modalOpen) return;
        primeAudio(); markStarted();
        $('#assistMenu').hidden = true;
        cur.game.selectCell(id);
      },
      onInteract: () => { primeAudio(); },
      onDegrade: () => { toast('Switched to light effects for smoother play'); },
    });
  } catch (err) {
    console.error(err);
    fatal('WebGL is unavailable', 'CubeWord draws a real 3D cube, so it needs WebGL. Try a recent version of Chrome, Edge, Firefox or Safari, and make sure hardware acceleration is on.');
    return;
  }
  window.__cw = { scene, get game() { return cur && cur.game; }, get cur() { return cur; }, switchTo, store };
  applyMotion();
  if (store.settings.quality !== 'auto') applyQuality();
  applyKeyboardSetting();

  const params = new URLSearchParams(location.search);
  const startDate = clampDate(params.get('d') || todayStr());
  const startSize = SIZES[params.get('s')] ? params.get('s') : (SIZES[store.lastSize] ? store.lastSize : 'classic');
  switchTo(startDate, startSize).then(() => {
    window.__cwReady = true;
    if (!store.seenHelp) { store.seenHelp = true; persist(); setTimeout(openHelp, 1400); }
  });

  // new day while the tab stays open
  setInterval(() => {
    if (cur && cur.date !== todayStr() && !modalOpen && cur.date === fmtDate(new Date(Date.now() - 864e5 * 0)) ) return;
  }, 60000);
}
