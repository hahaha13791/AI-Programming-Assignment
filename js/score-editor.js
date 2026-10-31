(function () {
  // The editor screen (PRD #4-H): the score drawn with the chosen note (cursor) marked, pressing a note or a chord
  // head to choose it, undo/redo, the tool tabs [음표 | 마디 | 기호] and the keyboard. The work on the score itself
  // is in editing.js.
  const N = Notation;
  const TYPE_NAMES = {
    whole: '온', half: '2분', quarter: '4분', eighth: '8분', '16th': '16분', '32nd': '32분', '64th': '64분',
  };
  const SIGNS = { 2: '𝄪', 1: '♯', 0: '', '-1': '♭', '-2': '𝄫' };

  const pitchName = (pitch) => `${pitch.step}${SIGNS[pitch.alter] ?? ''}${pitch.octave}`;

  // [음표] tools (PRD #4-H-2): lengths, entering at the cursor, and the input staff.
  const LENGTHS = [
    ['whole', '온'], ['half', '2분'], ['quarter', '4분'], ['eighth', '8분'], ['16th', '16분'], ['32nd', '32분'], ['64th', '64분'],
  ];
  const KEY_LENGTHS = { 1: '64th', 2: '32nd', 3: '16th', 4: 'eighth', 5: 'quarter', 6: 'half', 7: 'whole' }; // MuseScore's
  const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const PAD = { low: -6, high: 14, half: 7, edge: 8, width: 300, left: 44 }; // three ledger lines each way
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(name, attrs, text) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(text, attrs = {}) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ed-button';
    b.textContent = text;
    for (const [key, value] of Object.entries(attrs)) b.setAttribute(key, value);
    return b;
  }

  const diatonic = (pitch) => pitch.octave * 7 + STEPS.indexOf(pitch.step);

  // "3마디 2번째 · F♯4 4분음표" for the status line under the score.
  function describe(score, cursor) {
    const measure = N.resolve(score)[cursor.measure];
    const note = score.measures[cursor.measure].notes[cursor.note];
    const length = `${'점'.repeat(note.dots ?? 0)}${TYPE_NAMES[note.type]}${note.rest ? '쉼표' : '음표'}`;
    const where = `${measure.number}마디 ${cursor.note + 1}번째`;
    if (note.rest) return `${where} · ${length}`;
    const pitches = N.pitchesOf(note);
    const what = pitches.length > 1
      ? `화음 ${pitches.map((p, i) => (i === cursor.head ? `[${pitchName(p.pitch)}]` : pitchName(p.pitch))).join(' ')}`
      : pitchName(note.pitch);
    return `${where} · ${note.grace ? '꾸밈음 ' : ''}${what} ${length}`;
  }

  // elements: { title, view, status, undo, redo, tabs, tools: { notes, measure, signs } }. onChange: after any change.
  function create({ title, view, status, undo, redo, tabs, tools, onChange = () => {} }) {
    let state = null;
    const input = { type: 'quarter', dots: 0, toggle: null }; // the length to write, the ♯/♭/♮ toggle

    // ---- the [음표] panel ----
    const lengthRow = document.createElement('div');
    lengthRow.className = 'ed-row ed-lengths';
    lengthRow.setAttribute('role', 'radiogroup');
    lengthRow.setAttribute('aria-label', '음 길이');
    const lengthButtons = LENGTHS.map(([type, label]) => {
      const b = button(label, { role: 'radio', 'data-type': type, 'aria-label': `${label}음표` });
      b.addEventListener('click', () => chooseLength(type));
      return b;
    });
    lengthRow.append(...lengthButtons);
    const dotButton = button('점', { id: 'editor-dot', 'aria-pressed': 'false' });
    const restButton = button('쉼표', { id: 'editor-rest' });
    const applyButton = button('길이 바꾸기', { id: 'editor-apply-length' });
    const eraseButton = button('지우기', { id: 'editor-erase' });
    const actionRow = document.createElement('div');
    actionRow.className = 'ed-row';
    actionRow.append(dotButton, restButton, applyButton, eraseButton);
    const toggles = [[1, '♯', 'editor-sharp', '샵'], [-1, '♭', 'editor-flat', '플랫'], [0, '♮', 'editor-natural', '제자리표']].map(([value, text, id, name]) => {
      const b = button(`${text}\uFE0E`, { id, 'aria-pressed': 'false', 'aria-label': `${name} 붙여 넣기` });
      b.classList.add('btn-toggle');
      b.addEventListener('click', () => {
        input.toggle = input.toggle === value ? null : value;
        renderTools();
      });
      return [value, b];
    });
    const moves = [['반음↑︎', 'editor-up', () => state.semitone(1)], ['반음↓︎', 'editor-down', () => state.semitone(-1)],
      ['옥타브↑︎', 'editor-octave-up', () => state.octave(1)], ['옥타브↓︎', 'editor-octave-down', () => state.octave(-1)]].map(([text, id, act]) => {
      const b = button(text, { id });
      b.addEventListener('click', () => act() && render());
      return b;
    });
    const pitchRow = document.createElement('div');
    pitchRow.className = 'ed-row';
    pitchRow.append(...toggles.map(([, b]) => b), ...moves);
    const pad = document.createElement('div');
    pad.className = 'ed-pad';
    pad.id = 'editor-pad';
    tools.notes.append(lengthRow, actionRow, pitchRow, pad);

    function chooseLength(type) {
      input.type = type;
      input.dots = 0;
      renderTools();
    }

    dotButton.addEventListener('click', () => {
      input.dots = (input.dots + 1) % 3;
      renderTools();
    });
    restButton.addEventListener('click', () => write({ type: input.type, dots: input.dots, rest: true }));
    applyButton.addEventListener('click', () => state.setLength(input.type, input.dots) && render());
    eraseButton.addEventListener('click', () => state.erase() && render());

    // Writes at the cursor and sounds the pitch briefly.
    function write(note) {
      if (!state || !state.insert(note)) return false;
      if (note.pitch && typeof Sound !== 'undefined') {
        Sound.playEvents([{ start: 0, length: 0.35, midi: N.midi(note.pitch), peak: Playback.NOTE_PEAK, sustain: false }]);
      }
      render();
      return true;
    }

    // A pitch of this letter and octave at the cursor: the toggle's accidental, else as the page shows it.
    function pitchFor(step, octave) {
      const { measure, note } = state.cursor;
      const alter = input.toggle ?? state.alterAt(measure, note, step, octave);
      return { step, alter, octave };
    }

    // The input staff in the clef at the cursor, with the key signature; each line and space can be pressed.
    function renderPad() {
      const { measure } = state.cursor;
      const clef = state.clefAt();
      const key = N.resolve({ ...state.score, id: 'x', title: 'x' })[measure].key;
      const yOf = (pos) => PAD.edge + (PAD.high - pos) * PAD.half;
      const height = PAD.edge * 2 + (PAD.high - PAD.low) * PAD.half;
      const svg = svgEl('svg', { class: 'ed-pad-svg', viewBox: `0 0 ${PAD.width} ${height}`, role: 'group', 'aria-label': '음높이 넣기 오선', 'data-clef': clef });
      for (let p = PAD.low; p <= PAD.high; p += 2) {
        const ledger = p < 0 || p > 8;
        svg.append(svgEl('line', { x1: ledger ? PAD.left + 20 : 0, x2: PAD.width, y1: yOf(p), y2: yOf(p), class: ledger ? 'ed-pad-ledger' : 'staff-line' }));
      }
      Sheet.drawClef(svg, clef, 2, yOf, false);
      Sheet.keySigns(key, clef).forEach((sign, i) => {
        svg.append(svgEl('text', { x: 40 + i * 9, y: yOf(sign.pos) + 5, class: 'sv-accidental sv-key' }, SIGNS[sign.alter] || '♮'));
      });
      const bottom = Sheet.clefBottom(clef);
      for (let pos = PAD.low; pos <= PAD.high; pos++) {
        const d = pos + bottom;
        const step = STEPS[((d % 7) + 7) % 7];
        const octave = Math.floor(d / 7);
        const slot = svgEl('rect', {
          x: 0, y: yOf(pos) - PAD.half / 2, width: PAD.width, height: PAD.half, class: 'ed-slot',
          'data-pos': pos, 'data-step': step, 'data-octave': octave,
        });
        slot.addEventListener('click', () => {
          write({ type: input.type, dots: input.dots, pitch: pitchFor(step, octave) });
        });
        svg.append(slot);
      }
      pad.replaceChildren(svg);
    }

    function renderTools() {
      if (!state) return;
      for (const b of lengthButtons) {
        b.setAttribute('aria-checked', String(b.dataset.type === input.type));
        b.disabled = !state.fits(b.dataset.type, input.dots && b.dataset.type === input.type ? input.dots : 0);
      }
      dotButton.textContent = input.dots === 2 ? '겹점' : '점';
      dotButton.setAttribute('aria-pressed', String(input.dots > 0));
      for (const [value, b] of toggles) b.setAttribute('aria-pressed', String(input.toggle === value));
      const fitsNow = state.fits(input.type, input.dots);
      restButton.disabled = !fitsNow;
      pad.classList.toggle('is-disabled', !fitsNow);
      renderPad();
    }

    // The letter's pitch nearest the last pitch before the cursor (or the middle of the staff).
    function nearest(step) {
      const { measure, note } = state.cursor;
      let ref = null;
      for (let m = measure; m >= 0 && !ref; m--) {
        const notes = state.score.measures[m].notes;
        for (let i = (m === measure ? note - 1 : notes.length - 1); i >= 0 && !ref; i--) if (!notes[i].rest) ref = notes[i].pitch;
      }
      const target = ref ? diatonic(ref) : Sheet.clefBottom(state.clefAt()) + 4;
      const index = STEPS.indexOf(step);
      let best = null;
      for (let octave = 0; octave <= 9; octave++) {
        const d = octave * 7 + index;
        if (best === null || Math.abs(d - target) < Math.abs(best * 7 + index - target)) best = octave;
      }
      return pitchFor(step, best);
    }

    function render() {
      if (!state) return;
      const score = { ...state.score, id: 'edit', title: state.title || '새 악보' };
      Sheet.draw(view, score, { pick: true, cursor: state.cursor, numberFirst: true, label: `편집 중인 악보, ${score.title}` });
      status.textContent = describe(score, state.cursor);
      undo.disabled = !state.canUndo();
      redo.disabled = !state.canRedo();
      renderTools();
      // A row wider than the screen scrolls sideways: keep the chosen note in sight.
      const chosen = view.querySelector('.sv-note.is-cursor');
      const row = chosen?.closest('.sheet-row');
      if (row) {
        const at = chosen.getBoundingClientRect();
        const box = row.getBoundingClientRect();
        if (at.left < box.left || at.right > box.right) row.scrollLeft += at.left - box.left - box.width / 2;
      }
      onChange();
    }

    function open(score) {
      state = Editing.create(score);
      title.value = state.title;
      showTab('notes');
      render();
    }

    function close() {
      state = null;
      view.replaceChildren();
    }

    function showTab(name) {
      for (const tab of tabs.querySelectorAll('[role="tab"]')) tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
      for (const [key, panel] of Object.entries(tools)) panel.hidden = key !== name;
    }

    // A change through editing.js, then the drawing. Returns whether anything changed.
    function apply(mutate) {
      if (!state || !state.change(mutate)) return false;
      render();
      return true;
    }

    title.addEventListener('input', () => {
      if (!state) return;
      state.setTitle(title.value);
      onChange();
    });

    // A press on a note (or a chord's head) chooses it; a press on the space a note takes in its measure chooses it too.
    view.addEventListener('click', (event) => {
      if (!state) return;
      const target = event.target.closest('.sv-pick, .sv-note');
      if (!target) return;
      const measure = Number(target.closest('[data-measure]')?.dataset.measure);
      const note = Number(target.dataset.index);
      if (!Number.isInteger(measure) || !Number.isInteger(note)) return;
      const head = Number(event.target.closest('.sv-head')?.dataset.head ?? 0);
      state.select(measure, note, head);
      render();
    });

    undo.addEventListener('click', () => state?.undo() && render());
    redo.addEventListener('click', () => state?.redo() && render());
    tabs.addEventListener('click', (event) => {
      const tab = event.target.closest('[role="tab"]');
      if (tab) showTab(tab.dataset.tab);
    });

    // The keyboard (PRD #4-H-4). Returns true when the key was the editor's. Not while typing in a text box.
    function key(event) {
      if (!state) return false;
      const typing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
      if (typing) return false;
      const ctrl = event.ctrlKey || event.metaKey;
      let handled = true;
      const plain = !ctrl && !event.altKey;
      const letter = event.key.length === 1 ? event.key.toUpperCase() : '';
      if (plain && !event.shiftKey && STEPS.includes(letter)) {
        write({ type: input.type, dots: input.dots, pitch: nearest(letter) });
      } else if (plain && KEY_LENGTHS[event.key]) {
        chooseLength(KEY_LENGTHS[event.key]);
      } else if (plain && event.key === '.') {
        dotButton.click();
      } else if (plain && event.key === '0') {
        restButton.click();
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const dir = event.key === 'ArrowUp' ? 1 : -1;
        if (ctrl ? state.octave(dir) : state.semitone(dir)) render();
      } else if (plain && (event.key === 'Delete' || event.key === 'Backspace')) {
        if (state.erase()) render();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const step = event.key === 'ArrowLeft' ? -1 : 1;
        if (ctrl) state.moveMeasure(step);
        else state.move(step);
        render();
      } else if (ctrl && !event.shiftKey && (event.key === 'z' || event.key === 'Z')) {
        if (state.undo()) render();
      } else if (ctrl && (event.key === 'y' || event.key === 'Y' || (event.shiftKey && (event.key === 'z' || event.key === 'Z')))) {
        if (state.redo()) render();
      } else {
        handled = false;
      }
      if (handled) event.preventDefault();
      return handled;
    }

    return {
      open, close, apply, render, key, showTab, input,
      get state() { return state; },
      canSave: () => Boolean(state?.canSave()),
      result: () => state?.result() ?? null,
    };
  }

  window.ScoreEditor = { create, describe, pitchName };
})();
