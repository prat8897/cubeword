// Pure game logic: selection, typing, navigation, checking, revealing, solved detection.
// No DOM, no three.js - so it can be tested in node.

export class Game {
  constructor(puzzle, saved) {
    this.p = puzzle;
    const n = puzzle.cells.length;
    this.letters = new Array(n).fill('');
    this.flag = new Uint8Array(n); // 0 none, 1 revealed, 2 marked wrong
    this.slotDone = new Uint8Array(puzzle.slots.length);
    this.hints = 0;
    this.checks = 0;
    this.elapsed = 0;
    this.solved = false;
    this.handlers = {};
    this.order = puzzle.slots
      .map((s, i) => i)
      .sort((a, b) => puzzle.slots[a].num - puzzle.slots[b].num || puzzle.slots[a].axis - puzzle.slots[b].axis);

    if (saved && saved.letters && saved.letters.length === n) {
      for (let i = 0; i < n; i++) {
        const ch = saved.letters[i];
        this.letters[i] = ch && ch !== '.' && !puzzle.cells[i].blocked ? ch : '';
      }
      if (saved.flags) for (let i = 0; i < n; i++) this.flag[i] = saved.flags.charCodeAt(i) - 48 === 1 ? 1 : 0;
      this.hints = saved.hints | 0;
      this.checks = saved.checks | 0;
      this.elapsed = saved.elapsed || 0;
    }
    for (let s = 0; s < puzzle.slots.length; s++) this.slotDone[s] = this.isSlotCorrect(s) ? 1 : 0;
    this.solved = this.computeSolved();

    const first = puzzle.slots[this.order[0]];
    this.slot = this.order[0];
    this.sel = first.cells.find((c) => !this.letters[c]) ?? first.cells[0];
  }

  on(evt, fn) {
    (this.handlers[evt] ||= []).push(fn);
    return this;
  }
  emit(evt, data) {
    for (const fn of this.handlers[evt] || []) fn(data);
  }

  cell(id) { return this.p.cells[id]; }
  slotOf(id) { return this.p.slots[id]; }
  activeSlot() { return this.p.slots[this.slot]; }
  crossSlotId() {
    const c = this.cell(this.sel);
    return c.slots.find((s) => s !== this.slot);
  }
  indexInSlot(slotId = this.slot, cellId = this.sel) {
    return this.p.slots[slotId].cells.indexOf(cellId);
  }

  isSlotCorrect(sid) {
    const s = this.p.slots[sid];
    for (let k = 0; k < s.cells.length; k++) {
      if (this.letters[s.cells[k]] !== s.word[k].toUpperCase()) return false;
    }
    return true;
  }
  computeSolved() {
    for (const c of this.p.cells) if (!c.blocked && this.letters[c.id] !== c.letter) return false;
    return true;
  }
  progress() {
    let filled = 0, total = 0;
    for (const c of this.p.cells) if (!c.blocked) { total++; if (this.letters[c.id]) filled++; }
    return { filled, total };
  }

  // ---------- selection ----------
  selectCell(id, opts = {}) {
    const c = this.cell(id);
    if (c.blocked) return;
    if (id === this.sel && !opts.noToggle) {
      this.toggleDirection();
      return;
    }
    const curAxis = this.activeSlot().axis;
    let slot = c.slots.find((s) => this.p.slots[s].axis === curAxis);
    if (slot === undefined) slot = c.slots[0];
    this.sel = id;
    this.slot = slot;
    this.emit('select', { cell: id, slot, pick: true });
  }
  toggleDirection() {
    const c = this.cell(this.sel);
    const other = c.slots.find((s) => s !== this.slot);
    if (other !== undefined) {
      this.slot = other;
      this.emit('select', { cell: this.sel, slot: this.slot, toggled: true });
    }
  }
  selectSlot(slotId, cellId) {
    const s = this.p.slots[slotId];
    this.slot = slotId;
    this.sel = cellId ?? s.cells.find((c) => !this.letters[c]) ?? s.cells[0];
    this.emit('select', { cell: this.sel, slot: slotId, byClue: true });
  }
  nextSlot(delta = 1) {
    const i = this.order.indexOf(this.slot);
    const n = this.order.length;
    this.selectSlot(this.order[(i + delta + n) % n]);
  }
  // arrow-key style movement along the active word
  step(delta) {
    const s = this.activeSlot();
    let i = this.indexInSlot() + delta;
    if (i >= 0 && i < s.cells.length) {
      this.sel = s.cells[i];
      this.emit('select', { cell: this.sel, slot: this.slot });
    } else {
      const k = this.order.indexOf(this.slot);
      const n = this.order.length;
      const ns = this.order[(k + (delta > 0 ? 1 : -1) + n) % n];
      const t = this.p.slots[ns];
      this.slot = ns;
      this.sel = delta > 0 ? t.cells[0] : t.cells[t.cells.length - 1];
      this.emit('select', { cell: this.sel, slot: ns, byClue: true });
    }
  }
  jumpToNextOpenWord() {
    const n = this.order.length;
    const k = this.order.indexOf(this.slot);
    for (let d = 1; d <= n; d++) {
      const sid = this.order[(k + d) % n];
      const s = this.p.slots[sid];
      const empty = s.cells.find((c) => !this.letters[c]);
      if (empty !== undefined && sid !== this.slot) {
        this.slot = sid;
        this.sel = empty;
        this.emit('select', { cell: this.sel, slot: sid, byClue: true });
        return true;
      }
    }
    return false;
  }

  // ---------- editing ----------
  setLetter(id, ch, byUser = true) {
    this.letters[id] = ch;
    if (this.flag[id] === 2) this.flag[id] = 0;
    this.emit('cell', { id, letter: ch });
    if (byUser) this.afterEdit(id);
  }
  afterEdit(id) {
    const c = this.cell(id);
    for (const sid of c.slots) {
      const ok = this.isSlotCorrect(sid);
      if (ok && !this.slotDone[sid]) {
        this.slotDone[sid] = 1;
        this.emit('wordComplete', { slot: sid });
      } else if (!ok) this.slotDone[sid] = 0;
    }
    if (!this.solved && this.computeSolved()) {
      this.solved = true;
      this.emit('solved', { last: id });
    }
  }
  type(ch) {
    if (this.solved) return;
    ch = ch.toUpperCase();
    if (!/^[A-Z]$/.test(ch)) return;
    const id = this.sel;
    if (this.flag[id] !== 1) this.setLetter(id, ch);
    this.emit('typed', { id, letter: ch });
    if (this.solved) return;
    const s = this.activeSlot();
    const i = s.cells.indexOf(id);
    if (i < s.cells.length - 1) {
      this.sel = s.cells[i + 1];
      this.emit('select', { cell: this.sel, slot: this.slot });
    } else {
      // end of the word: finish any gaps in this word first, then move on to the next open word
      const gap = s.cells.find((c) => !this.letters[c]);
      if (gap !== undefined) {
        this.sel = gap;
        this.emit('select', { cell: this.sel, slot: this.slot });
      } else this.jumpToNextOpenWord();
    }
  }
  backspace() {
    if (this.solved) return;
    const id = this.sel;
    if (this.letters[id] && this.flag[id] !== 1) {
      this.setLetter(id, '');
      return;
    }
    const s = this.activeSlot();
    const i = s.cells.indexOf(id);
    if (i > 0) {
      this.sel = s.cells[i - 1];
      this.emit('select', { cell: this.sel, slot: this.slot });
      if (this.flag[this.sel] !== 1) this.setLetter(this.sel, '');
    }
  }

  // ---------- assists ----------
  scopeCells(scope) {
    if (scope === 'cell') return [this.sel];
    if (scope === 'word') return this.activeSlot().cells.slice();
    return this.p.cells.filter((c) => !c.blocked).map((c) => c.id);
  }
  check(scope) {
    this.checks++;
    const wrong = [], right = [];
    for (const id of this.scopeCells(scope)) {
      const l = this.letters[id];
      if (!l) continue;
      if (l === this.cell(id).letter) right.push(id);
      else { wrong.push(id); this.flag[id] = 2; }
    }
    this.emit('check', { wrong, right });
    return { wrong, right };
  }
  reveal(scope) {
    this.hints++;
    const ids = this.scopeCells(scope).filter((id) => this.letters[id] !== this.cell(id).letter);
    for (const id of ids) {
      this.letters[id] = this.cell(id).letter;
      this.flag[id] = 1;
      this.emit('cell', { id, letter: this.letters[id], revealed: true });
    }
    for (const id of ids) this.afterEdit(id);
    this.emit('reveal', { ids });
    return ids;
  }
  clearWrongFlags() {
    for (let i = 0; i < this.flag.length; i++) if (this.flag[i] === 2) this.flag[i] = 0;
  }

  save() {
    return {
      letters: this.letters.map((l) => l || '.').join(''),
      flags: Array.from(this.flag).join(''),
      hints: this.hints,
      checks: this.checks,
      elapsed: Math.round(this.elapsed * 10) / 10,
      solved: this.solved,
    };
  }
}
