// Test helpers, injected after the app scripts into every width iframe.
// A test file registers cases with T.test(name, async (T) => { ... }) and checks with T.check(cond, message).
// The app's top-level bindings (mode, level, current, chord, section, staff, rhythm, ...) are readable directly.
(function () {
  const tests = [];
  const lines = [];
  let caseName = '';

  const $ = (id) => document.getElementById(id);

  function svgOf(container) {
    return container.querySelector('svg.staff') || container.querySelector('svg');
  }

  // Screen point of a staff step (0 = C4 ... 11 = G5) at the middle of the staff's viewBox.
  function stepPoint(step, container) {
    const svg = svgOf(container);
    const box = svg.viewBox.baseVal;
    return new DOMPoint(box.x + box.width / 2, Staff.stepY(step)).matrixTransform(svg.getScreenCTM());
  }

  const T = {
    $,
    width: window.innerWidth,

    test(name, fn) {
      tests.push({ name, fn });
    },

    check(cond, message) {
      lines.push(`${cond ? 'PASS' : 'FAIL'} ${caseName ? `${caseName} — ` : ''}${message}`);
      return Boolean(cond);
    },

    wait(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },

    // Polls by count, not Date.now(), so it behaves the same under --virtual-time-budget.
    async waitFor(cond, timeout = 30000, interval = 50) {
      for (let i = 0; i * interval < timeout; i++) {
        if (cond()) return true;
        await T.wait(interval);
      }
      return Boolean(cond());
    },

    setMode(name) {
      document.querySelector(`.mode-tab[data-mode="${name}"]`).click();
    },
    setLevel(name) {
      document.querySelector(`.difficulty-option[data-level="${name}"]`).click();
    },
    setChordType(name) {
      document.querySelector(`.chord-type[data-type="${name}"]`).click();
    },

    // "문제 듣기" and wait for playback to end and input to unlock (fast-forwarded by virtual time).
    async listen() {
      $('btn-question').click();
      return T.waitFor(() => !$('btn-replay').disabled, 60000);
    },

    // Skips the playback wait when a test only cares about input. Like the app, only the current mode's input
    // (they share the erase buttons, so an unlocked input of another mode would fight over them).
    unlock() {
      if (mode === 'rhythm') rhythm.setLocked(false);
      else if (mode === 'score' && typeof scoreInput !== 'undefined') scoreInput.setLocked(false);
      else staff.setLocked(false);
    },

    // Presses a line or space of the editor's input staff (position 0 = the bottom line).
    editorPad(pos) {
      $('editor-pad').querySelector(`.ed-slot[data-pos="${pos}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    },

    // Deletes the chosen 내 악보 score: [편집] → the editor's [삭제] twice (expansion 7: every score opens in the editor).
    deleteScore() {
      $('btn-edit-score').click();
      $('editor-delete').click();
      $('editor-delete').click();
    },

    clickStep(step, container = $('staff-area')) {
      const p = stepPoint(step, container);
      svgOf(container).dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: p.x, clientY: p.y }));
    },

    hoverStep(step, container = $('staff-area')) {
      const p = stepPoint(step, container);
      svgOf(container).dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true, pointerType: 'mouse', clientX: p.x, clientY: p.y,
      }));
    },

    // Puts the ♯/♭ toggles in the given state (1, -1, 0). The toggles stay on between notes.
    setAccidental(value, sharpId = 'btn-sharp', flatId = 'btn-flat') {
      const sharp = $(sharpId);
      const flat = $(flatId);
      const pressed = sharp.getAttribute('aria-pressed') === 'true' ? 1 : flat.getAttribute('aria-pressed') === 'true' ? -1 : 0;
      if (pressed === value) return;
      if (value === 1) sharp.click();
      else if (value === -1) flat.click();
      else (pressed === 1 ? sharp : flat).click();
    },

    // notes: [{ step, accidental }] — e.g. `current` to enter the right answer. In 내 악보, `current` is pitches
    // ({ step: 'F', alter, octave }), entered on the score input; ♯♯/♭♭ go in as their enharmonic neighbour.
    enterNotes(notes, container = $('staff-area')) {
      if (typeof mode !== 'undefined' && mode === 'score' && notes.length && typeof notes[0].step === 'string') {
        for (const pitch of notes) T.enterPitch(pitch);
        return;
      }
      for (const note of notes) {
        T.setAccidental(note.accidental || 0);
        T.clickStep(note.step, container);
      }
      T.setAccidental(0);
    },

    enterPitch(pitch) {
      const steps = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
      let p = pitch;
      if (Math.abs(p.alter) === 2) {
        const dir = Math.sign(p.alter);
        const index = steps.indexOf(p.step) + dir;
        const step = steps[(index + 7) % 7];
        const octave = p.octave + (index < 0 ? -1 : index > 6 ? 1 : 0);
        const alter = Notation.midi(p) - Notation.midi({ step, alter: 0, octave });
        p = { step, alter, octave };
      }
      const toggle = scoreInput.toggleFor(p);
      const set = (id, on) => {
        const button = $(id);
        if ((button.getAttribute('aria-pressed') === 'true') !== on) button.click();
      };
      set('score-sharp', toggle === 1);
      set('score-flat', toggle === -1);
      set('score-natural', toggle === 0);
      const point = scoreInput.pointFor(p);
      scoreInput.svg.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: point.x, clientY: point.y }));
      set('score-sharp', false);
      set('score-flat', false);
      set('score-natural', false);
    },

    // Rhythm mode: types like ['q', 'q', 'h'], entered with the note buttons.
    // Button codes ('q', 'h.', 'r' …) or notes of the score format (a question's current.measures.flat()).
    enterRhythm(items) {
      for (const item of items) {
        const type = typeof item === 'string' ? item : Rhythm.codeOf(item);
        document.querySelector(`#note-buttons .note-button[data-type="${type}"]`).click();
      }
    },
    // A time signature button: beats of x/4 (3), or [6, 8] / '6/8'.
    setTime(time) {
      const text = typeof time === 'number' ? `${time}/4` : Array.isArray(time) ? `${time[0]}/${time[1]}` : time;
      document.querySelector(`#time-signatures .time-signature[data-time="${text}"]`).click();
    },
    // 리듬 [기본 | 심화].
    setRhythmKind(kind) {
      document.querySelector(`#rhythm-kinds .chord-type[data-kind="${kind}"]`).click();
    },

    submit() {
      $('btn-submit').click();
    },
    next() {
      $('btn-next').click();
    },
    resultText() {
      return $('result-area').textContent;
    },

    noHorizontalOverflow() {
      return document.documentElement.scrollWidth <= document.documentElement.clientWidth;
    },
  };

  window.T = T;

  async function runAll() {
    for (const { name, fn } of tests) {
      caseName = name;
      try {
        await fn(T);
      } catch (error) {
        lines.push(`FAIL ${name} — 예외: ${error && error.stack ? error.stack.split('\n').slice(0, 2).join(' | ') : error}`);
      }
    }
    caseName = '';
    const errors = window.__errors || [];
    T.check(errors.length === 0, `콘솔 에러 없음${errors.length ? ` ${JSON.stringify(errors)}` : ''}`);

    const out = document.createElement('pre');
    out.id = 'test-out';
    out.hidden = true;
    out.textContent = lines.join('\n');
    document.body.append(out);
    window.__done = true;
    if (window.parent !== window) window.parent.postMessage({ ltw: true, width: window.innerWidth, lines }, '*');
  }

  window.addEventListener('load', () => setTimeout(runAll, 0));
})();
