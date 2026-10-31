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

    // Skips the playback wait when a test only cares about input.
    unlock() {
      staff.setLocked(false);
      rhythm.setLocked(false);
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

    // notes: [{ step, accidental }] — e.g. `current` to enter the right answer.
    enterNotes(notes, container = $('staff-area')) {
      for (const note of notes) {
        T.setAccidental(note.accidental || 0);
        T.clickStep(note.step, container);
      }
      T.setAccidental(0);
    },

    // Rhythm mode: types like ['q', 'q', 'h'], entered with the note buttons.
    enterRhythm(types) {
      for (const type of types) document.querySelector(`#note-buttons .note-button[data-type="${type}"]`).click();
    },
    setTime(beats) {
      document.querySelector(`#time-signatures .time-signature[data-beats="${beats}"]`).click();
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
