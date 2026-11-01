(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const N = Notation;

  // The 기본 buttons. Notes are the score format's (v2) notes: { type, dots, pitch } or { type, dots, rest: true },
  // all at one pitch (the rhythm staff draws them on its line; playback uses TONE).
  const PITCH = { step: 'C', alter: 0, octave: 5 };
  const TYPES = {
    w: { type: 'whole', dots: 0, name: '온음표', short: '온' },
    'h.': { type: 'half', dots: 1, name: '점2분음표', short: '점2분' },
    h: { type: 'half', dots: 0, name: '2분음표', short: '2분' },
    'q.': { type: 'quarter', dots: 1, name: '점4분음표', short: '점4분' },
    q: { type: 'quarter', dots: 0, name: '4분음표', short: '4분' },
    e: { type: 'eighth', dots: 0, name: '8분음표', short: '8분' },
    r: { type: 'quarter', dots: 0, name: '4분쉼표', short: '4분쉼표', rest: true },
  };

  // A button code ('q.', 'r', ...) as a note, and back.
  function noteOf(code) {
    const { type, dots, rest } = TYPES[code];
    return rest ? { type, dots, rest: true } : { type, dots, pitch: { ...PITCH } };
  }
  function codeOf(note) {
    return Object.keys(TYPES).find((code) => {
      const t = TYPES[code];
      return t.type === note.type && t.dots === (note.dots ?? 0) && Boolean(t.rest) === Boolean(note.rest);
    });
  }
  const QUARTER = N.frac(1, 4);
  const LEVEL_TYPES = {
    easy: ['w', 'h', 'q'],
    medium: ['w', 'h.', 'h', 'q', 'e', 'r'],
    hard: ['w', 'h.', 'h', 'q.', 'q', 'e', 'r'],
  };
  const TIME_SIGNATURES = [2, 3, 4];
  const MAX_MEASURES = 4;

  // Button icons: a note on its own with its stem up.
  const STEM_X = 5.4;
  const STEM_HEIGHT = 28;

  // Four measures fit on one row only when the staff box is this wide; narrower boxes use two per row.
  const WIDE_MIN = 560;
  // A staff drawn before its box is on the page has no width yet; guess from the window instead.
  const narrowWindowQuery = window.matchMedia('(max-width: 680px)');

  function isWide(container) {
    const width = container.clientWidth;
    return width ? width >= WIDE_MIN : !narrowWindowQuery.matches;
  }

  function svgEl(name, attrs, text) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Total length of notes, a fraction of a whole note.
  const lengthOf = (notes) => N.filled(notes);
  const timeOf = (beats) => [beats, 4];

  // Splits a flat list of notes into measures of `measureLength` (a fraction). Input never crosses a barline
  // (lengths that don't fit are disabled), so a running total is enough.
  function splitMeasures(notes, measureLength) {
    const measures = [];
    let filled = N.ZERO;
    for (const note of notes) {
      const index = Math.floor(N.toNumber(filled) / N.toNumber(measureLength) + 1e-9);
      (measures[index] ||= []).push(note);
      filled = N.add(filled, N.duration(note));
    }
    return measures;
  }

  // One note or rest with its head (or the rest's centre) at (x, y). `flag`: draw a lone eighth's flag.
  function drawGlyph(parent, type, x, y, { flag = true } = {}) {
    const group = svgEl('g', { class: 'rhythm-glyph', 'data-type': type });
    if (type === 'r') {
      group.append(svgEl('path', {
        d: `M${x - 1} ${y - 14} L${x + 4.5} ${y - 7.5} L${x - 0.5} ${y - 2} L${x + 4.5} ${y + 4.5}`
          + ` C${x - 3} ${y + 1} ${x - 3} ${y + 8} ${x + 1.5} ${y + 11}`,
        class: 'rh-rest',
      }));
      parent.append(group);
      return group;
    }
    if (type === 'w') {
      group.append(svgEl('ellipse', { cx: x, cy: y, rx: 7.2, ry: 4.8, class: 'rh-open rh-whole' }));
      parent.append(group);
      return group;
    }
    const open = type === 'h' || type === 'h.';
    group.append(svgEl('ellipse', {
      cx: x, cy: y, rx: 6, ry: 4.4,
      transform: `rotate(-20 ${x} ${y})`,
      class: open ? 'rh-open' : 'rh-fill',
    }));
    const stemX = x + STEM_X;
    const top = y - STEM_HEIGHT;
    group.append(svgEl('line', { x1: stemX, x2: stemX, y1: y - 1, y2: top, class: 'rh-stem' }));
    if (type === 'h.' || type === 'q.') {
      group.append(svgEl('circle', { cx: x + 12, cy: y - 4, r: 2, class: 'rh-fill rh-dot' }));
    }
    if (type === 'e' && flag) {
      group.append(svgEl('path', {
        d: `M${stemX} ${top} C${stemX + 1} ${top + 7} ${stemX + 9} ${top + 9} ${stemX + 7} ${top + 19}`
          + ` C${stemX + 7} ${top + 12} ${stemX + 3} ${top + 10} ${stemX} ${top + 9} Z`,
        class: 'rh-fill rh-flag',
      }));
    }
    parent.append(group);
    return group;
  }

  // model: { time (beats per measure, or null before it is chosen), measures: [[note, ...], ...],
  //          slots (measures to reserve room for), shown (measures to draw), current (measure being filled, or -1),
  //          marks (per measure: true / false, optional) }, wide: four measures to a row when there are more than two.
  function staffOf(model, wide, label) {
    return Sheet.rhythm({ ...model, time: model.time ? timeOf(model.time) : null }, wide, { label });
  }

  function draw(container, rhythm, label, { marks } = {}) {
    const count = rhythm.measures.length;
    const svg = staffOf({ time: rhythm.time[0], measures: rhythm.measures, slots: count, shown: count, current: -1, marks }, isWide(container), label);
    container.replaceChildren(svg);
  }

  function iconFor(type) {
    const svg = svgEl('svg', { class: 'note-icon', viewBox: '0 0 30 40', 'aria-hidden': 'true' });
    const centred = type === 'w' || type === 'r';
    drawGlyph(svg, type, type === 'w' ? 15 : 11, centred ? 22 : 33);
    return svg;
  }

  // A length (fraction of a whole note) in quarter-note beats: "1", "1.5".
  function beatsText(length) {
    const beats = N.toNumber(length) * 4;
    return Number.isInteger(beats) ? String(beats) : String(Math.round(beats * 100) / 100);
  }

  function create({ container, buttons, timeButtons, progress, undoButton, clearButton, onChange }) {
    let notes = [];
    let types = [];
    let time = null;
    let chooseTime = false; // hard: the user picks the time signature
    let fixedMeasures = null; // easy/medium: the question's measure count, shown up front
    let locked = true;
    let marks = null;

    let wide = isWide(container);
    // Redrawing changes the box's height, so it waits a frame instead of running inside the observer callback.
    new ResizeObserver(() => {
      if (!container.clientWidth || isWide(container) === wide) return;
      wide = isWide(container);
      requestAnimationFrame(update);
    }).observe(container);

    const label = document.createElement('span');
    label.className = 'time-signature-label';
    label.textContent = '박자표';
    const timeButtonList = TIME_SIGNATURES.map((beats) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'time-signature';
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', 'false');
      button.setAttribute('aria-label', `${beats}/4박자`);
      button.dataset.beats = beats;
      button.textContent = `${beats}/4`;
      button.addEventListener('click', () => setTime(beats));
      return button;
    });
    timeButtons.replaceChildren(label, ...timeButtonList);

    let noteButtons = [];

    const maxMeasures = () => fixedMeasures ?? MAX_MEASURES;
    const measureLength = () => N.measureLength(timeOf(time));
    // Measures written so far, as a number (whole measures plus the part of the one being filled).
    const done = () => (time ? N.toNumber(lengthOf(notes)) / N.toNumber(measureLength()) : 0);
    const whole = (x) => Math.abs(x - Math.round(x)) < 1e-9;
    const isFull = () => Boolean(time) && whole(done()) && Math.round(done()) === maxMeasures();
    // What is left of the measure being filled (a fraction), zero when it can't take more.
    function remaining() {
      if (!time || isFull()) return N.ZERO;
      const before = N.mul(measureLength(), N.frac(Math.floor(done() + 1e-9))); // the finished measures
      return N.sub(measureLength(), N.sub(lengthOf(notes), before));
    }
    const fits = (code) => N.cmp(N.duration(noteOf(code)), remaining()) <= 0;

    function canSubmit() {
      if (!time || notes.length === 0) return false;
      return fixedMeasures ? isFull() : whole(done());
    }

    // Measures on screen: all of them for easy/medium; for hard, the finished ones plus the one being filled
    // (once graded, only the ones that were written).
    function shownMeasures() {
      if (fixedMeasures) return fixedMeasures;
      if (!time) return 1;
      if (marks) return Math.max(1, Math.ceil(done() - 1e-9));
      return Math.min(MAX_MEASURES, Math.floor(done() + 1e-9) + 1);
    }

    function progressText() {
      if (!time) return '박자표를 고르면 입력할 수 있어요.';
      if (marks) return `제출한 리듬 · ${Math.ceil(done() - 1e-9)}마디`;
      if (isFull()) return `${maxMeasures()}마디를 모두 채웠어요. 제출해 보세요.`;
      if (!fixedMeasures && notes.length && whole(done())) {
        return `${Math.round(done())}마디 완성 · 이어서 적거나 제출하세요.`;
      }
      return `${Math.floor(done() + 1e-9) + 1}마디 · 남은 박 ${beatsText(remaining())}`;
    }

    // The measure being filled is highlighted while input is open.
    function currentMeasure() {
      if (locked || isFull()) return -1;
      return time ? Math.floor(done() + 1e-9) : 0;
    }

    function update() {
      const svg = staffOf({
        time,
        measures: time ? splitMeasures(notes, measureLength()) : [],
        slots: maxMeasures(),
        shown: shownMeasures(),
        current: currentMeasure(),
        marks,
      }, wide, time ? `리듬 보표, ${time}/4박자. ${progressText()}` : '리듬 보표. 박자표를 아직 고르지 않았어요.');
      container.replaceChildren(svg);

      for (const button of noteButtons) {
        button.disabled = locked || !time || !fits(button.dataset.type);
      }
      for (const button of timeButtonList) {
        button.disabled = locked;
        button.setAttribute('aria-checked', String(Number(button.dataset.beats) === time));
      }
      progress.textContent = progressText();
      undoButton.disabled = locked || notes.length === 0;
      clearButton.disabled = locked || notes.length === 0;
      onChange?.();
    }
    function add(code) {
      if (locked || !time || !fits(code)) return;
      notes.push(noteOf(code));
      update();
    }

    function setTime(beats) {
      if (locked || !chooseTime || beats === time) return;
      time = beats;
      notes = [];
      update();
    }

    undoButton.addEventListener('click', () => {
      if (locked) return;
      notes.pop();
      update();
    });
    clearButton.addEventListener('click', () => {
      if (locked) return;
      notes = [];
      update();
    });

    return {
      // options: { types: note types to offer, time: beats per measure (null: the user picks it), measures: count or null }
      reset(options) {
        notes = [];
        marks = null;
        types = options.types;
        time = options.time ?? null;
        chooseTime = time === null;
        fixedMeasures = options.measures ?? null;
        timeButtons.hidden = !chooseTime;
        noteButtons = types.map((type) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'note-button';
          button.dataset.type = type;
          button.setAttribute('aria-label', TYPES[type].name);
          const text = document.createElement('span');
          text.className = 'note-button-label';
          text.textContent = TYPES[type].short;
          button.append(iconFor(type), text);
          button.addEventListener('click', () => add(type));
          return button;
        });
        buttons.style.setProperty('--cols', types.length);
        buttons.style.setProperty('--phone-cols', Math.min(types.length, 4));
        buttons.replaceChildren(...noteButtons);
        update();
      },
      setLocked(value) {
        locked = value;
        update();
      },
      setMarks(value) {
        marks = value;
        update();
      },
      canSubmit,
      // { time, measures: [[note, ...], ...] } — the measures the user finished or started.
      getInput: () => ({ time, measures: time ? splitMeasures(notes, measureLength()) : [] }),
    };
  }

  // Playback, ♩ = 80. Everything sounds at one pitch; clicks are short and higher.
  const BEAT = 60 / 80;
  const TONE = 72; // C5
  const CLICK = 84; // C6
  const CLICK_HIGH = 96; // C7: the count-in's first beat (easy/medium)
  const CLICK_LENGTH = 0.08;
  const CLICK_PEAK = 0.3;
  const NOTE_PEAK = 0.3;
  const ACCENT_PEAK = 0.45; // a measure's first beat
  const NOTE_SHARE = 0.9; // a note sounds for this share of its written length

  // rhythm: { time: [beats, 4], measures: [[note, ...], ...] }.
  // fixedCountIn: true = one measure of count-in with a high first click (the time signature is given);
  // false = four identical clicks that only set the tempo (hard, where the time signature is the question).
  // Returns { events (for Sound.playEvents), total (seconds, including trailing rests), start (when the rhythm begins) }.
  function schedule(rhythm, { fixedCountIn = true } = {}) {
    const beats = fixedCountIn ? rhythm.time[0] : 4;
    const events = [];
    for (let i = 0; i < beats; i++) {
      const high = fixedCountIn && i === 0;
      events.push({ kind: 'click', start: i * BEAT, length: CLICK_LENGTH, midi: high ? CLICK_HIGH : CLICK, peak: CLICK_PEAK });
    }
    const start = beats * BEAT;
    let time = start;
    for (const measure of rhythm.measures) {
      measure.forEach((note, i) => {
        const length = N.toNumber(N.duration(note)) / N.toNumber(QUARTER) * BEAT;
        if (!note.rest) {
          events.push({
            kind: 'note', type: codeOf(note), start: time, length: length * NOTE_SHARE, midi: TONE,
            peak: i === 0 ? ACCENT_PEAK : NOTE_PEAK, sustain: true,
          });
        }
        time += length;
      });
    }
    return { events, total: time, start };
  }

  window.Rhythm = { create, draw, schedule, iconFor, beatsText, noteOf, codeOf, TYPES, LEVEL_TYPES, lengthOf, splitMeasures };
})();
