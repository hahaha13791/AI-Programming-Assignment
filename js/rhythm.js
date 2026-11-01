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

  // 심화 (PRD #4-J-3): five lengths, and buttons kept on that say what the next notes are.
  const LENGTHS = {
    w: { type: 'whole', name: '온음표', short: '온' },
    h: { type: 'half', name: '2분음표', short: '2분' },
    q: { type: 'quarter', name: '4분음표', short: '4분' },
    e: { type: 'eighth', name: '8분음표', short: '8분' },
    s: { type: '16th', name: '16분음표', short: '16분' },
  };
  const TOGGLES = {
    dot: '점',
    rest: '쉼표',
    tuplet: '셋잇단',
    tie: '붙임줄',
  };
  const LEVEL_TOGGLES = { easy: ['dot', 'rest'], medium: ['dot', 'rest', 'tuplet', 'tie'], hard: ['dot', 'rest', 'tuplet', 'tie'] };
  const TRIPLET = { actual: 3, normal: 2 };
  // A triplet group is two of its first note's length: eighth triplets fill a quarter, quarter triplets a half.
  const groupLength = (type) => N.frac(2, N.TYPES[type]);
  // 9/8 and 12/8 take two measures at most and a phone row each (PRD #4-J-4).
  const isLong = (time) => Boolean(time) && time[1] === 8 && time[0] >= 9;

  // How a measure sounds (PRD #4-J 채점 규칙): where each sound starts, where silence starts, and whether the measure
  // opens by carrying on a sound tied from the one before. Notes tied inside the measure are one sound; rests in a
  // row are one silence. Two measures sound the same when these are equal, however they are written
  // (4분음표 = 8분⌒8분, 6/8의 점4분 = 4분⌒8분). Returns a string to compare.
  function soundKey(measure = []) {
    const parts = [];
    let at = N.ZERO;
    for (const note of measure) {
      const state = note.rest ? 'rest' : N.tieStops(note.tie) ? 'cont' : 'on';
      const last = parts[parts.length - 1];
      const same = last && (state === 'rest' ? last.state === 'rest' : state === 'cont' && last.state !== 'rest');
      if (!same) parts.push({ at: `${at[0]}/${at[1]}`, state });
      at = N.add(at, N.duration(note));
    }
    return `${parts.map((p) => `${p.at}:${p.state}`).join(' ')} | ${at[0]}/${at[1]}`;
  }

  // What a note is for comparing as written: length, dot, rest, triplet, tie.
  const noteKey = (note) => [note.type, note.dots ?? 0, note.rest ? 'r' : '', note.tuplet ? note.tuplet.actual : '', note.tie ?? ''].join('/');
  const LEVEL_TYPES = {
    easy: ['w', 'h', 'q'],
    medium: ['w', 'h.', 'h', 'q', 'e', 'r'],
    hard: ['w', 'h.', 'h', 'q.', 'q', 'e', 'r'],
  };
  // Time signatures to choose from (hard): 기본, and 심화 (PRD #4-J-3).
  const TIME_SIGNATURES = [[2, 4], [3, 4], [4, 4]];
  const ADVANCED_TIME_SIGNATURES = [[2, 4], [3, 4], [4, 4], [6, 8], [9, 8], [12, 8]];
  const timeText = (time) => `${time[0]}/${time[1]}`;
  const sameTime = (a, b) => Boolean(a && b) && a[0] === b[0] && a[1] === b[1];
  const MAX_MEASURES = 4;
  const LONG_MEASURES = 2;

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
    for (let k = 0; flag && k < (type === 'e' ? 1 : type === 's' ? 2 : 0); k++) {
      const t = top + k * 7;
      group.append(svgEl('path', {
        d: `M${stemX} ${t} C${stemX + 1} ${t + 7} ${stemX + 9} ${t + 9} ${stemX + 7} ${t + 19}`
          + ` C${stemX + 7} ${t + 12} ${stemX + 3} ${t + 10} ${stemX} ${t + 9} Z`,
        class: 'rh-fill rh-flag',
      }));
    }
    parent.append(group);
    return group;
  }

  // model: { time ([beats, beatType], or null before it is chosen), measures: [[note, ...], ...],
  //          slots (measures to reserve room for), shown (measures to draw), current (measure being filled, or -1),
  //          marks (per measure: true / false, optional) }, wide: four measures to a row when there are more than two.
  function staffOf(model, wide, label) {
    return Sheet.rhythm({ ...model, perRow: !wide && isLong(model.time) ? 1 : undefined }, wide, { label });
  }

  function draw(container, rhythm, label, { marks } = {}) {
    const count = rhythm.measures.length;
    const svg = staffOf({ time: rhythm.time, measures: rhythm.measures, slots: count, shown: count, current: -1, marks }, isWide(container), label);
    container.replaceChildren(svg);
  }

  function iconFor(type) {
    const svg = svgEl('svg', { class: 'note-icon', viewBox: '0 0 30 40', 'aria-hidden': 'true' });
    const centred = type === 'w' || type === 'r';
    drawGlyph(svg, type, type === 'w' ? 15 : 11, centred ? 22 : 33);
    return svg;
  }

  // The 심화 buttons kept on: a dot, a quarter rest, a 3, a tie.
  function toggleIcon(name) {
    const svg = svgEl('svg', { class: 'note-icon', viewBox: '0 0 30 40', 'aria-hidden': 'true' });
    if (name === 'dot') svg.append(svgEl('circle', { cx: 15, cy: 22, r: 3.2, class: 'rh-fill' }));
    if (name === 'rest') drawGlyph(svg, 'r', 13, 22);
    if (name === 'tuplet') svg.append(svgEl('text', { x: 15, y: 30, class: 'rh-tuplet-icon' }, '3'));
    if (name === 'tie') svg.append(svgEl('path', { d: 'M4 18 Q15 32 26 18 Q15 27 4 18 Z', class: 'rh-fill' }));
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
    // 심화: which buttons kept on are offered, what they are set to (tie: the next note is tied to the last one),
    // the triplet group being written ({ base: its first note's type, left }), and the state before each note.
    let advanced = false;
    let toggles = [];
    let opts = { dot: false, rest: false, tuplet: false, tie: false };
    let group = null;
    let history = [];
    let toggleButtons = [];

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
    let timeButtonList = [];
    function makeTimeButtons(times) {
      timeButtonList = times.map((t) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'time-signature';
        button.setAttribute('role', 'radio');
        button.setAttribute('aria-checked', 'false');
        button.setAttribute('aria-label', `${timeText(t)}박자`);
        button.dataset.time = timeText(t);
        button.textContent = timeText(t);
        button.addEventListener('click', () => setTime(t));
        return button;
      });
      timeButtons.dataset.count = times.length; // six (심화) take their own row on a phone
      timeButtons.replaceChildren(label, ...timeButtonList);
    }

    let noteButtons = [];

    const maxMeasures = () => fixedMeasures ?? (isLong(time) ? LONG_MEASURES : MAX_MEASURES);
    const measureLength = () => N.measureLength(time);
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
    // The note a length button would add now.
    function make(code) {
      if (!advanced) return noteOf(code);
      const { type } = LENGTHS[code];
      const dots = opts.dot ? 1 : 0;
      const note = opts.rest ? { type, dots, rest: true } : { type, dots, pitch: { ...PITCH } };
      if (opts.tuplet) note.tuplet = { ...TRIPLET };
      return note;
    }
    // Whether a length button can add its note: it fits what is left of the measure (and of the triplet group);
    // a triplet group starts with an eighth or a quarter and fits the measure whole; a quarter-triplet group can also
    // hold eighths. No dotted 16th (it would need a 32nd), no 16th triplets (PRD 5: 확장 9 범위).
    function canAdd(code) {
      if (locked || !time || isFull()) return false;
      const note = make(code);
      const length = N.duration(note);
      if (N.cmp(length, remaining()) > 0) return false;
      if (!advanced) return true;
      if (note.dots && note.type === '16th') return false;
      if (!opts.tuplet) return true;
      if (group) return (note.type === group.base || (group.base === 'quarter' && note.type === 'eighth')) && N.cmp(length, group.left) <= 0;
      return (note.type === 'quarter' || note.type === 'eighth') && N.cmp(groupLength(note.type), remaining()) <= 0;
    }
    function canToggle(name) {
      if (locked || !time || isFull()) return false;
      if (name === 'tuplet') return !group; // a group can't be left half-written
      if (name === 'dot') return !opts.tuplet;
      if (name === 'rest') return !opts.tie; // a tie goes into a note
      const last = notes[notes.length - 1];
      return opts.tie || Boolean(last && !last.rest && !N.tieStarts(last.tie));
    }
    const snapshot = () => ({ notes: JSON.parse(JSON.stringify(notes)), opts: { ...opts }, group: group && { ...group } });
    function clearInput() {
      notes = [];
      opts = { dot: false, rest: false, tuplet: false, tie: false };
      group = null;
      history = [];
    }

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
      return Math.min(maxMeasures(), Math.floor(done() + 1e-9) + 1);
    }

    function progressText() {
      if (!time) return '박자표를 고르면 입력할 수 있어요.';
      if (marks) return `제출한 리듬 · ${Math.ceil(done() - 1e-9)}마디`;
      if (isFull()) return `${maxMeasures()}마디를 모두 채웠어요. 제출해 보세요.`;
      if (!fixedMeasures && notes.length && whole(done())) {
        return `${Math.round(done())}마디 완성 · 이어서 적거나 제출하세요.`;
      }
      return `${Math.floor(done() + 1e-9) + 1}마디 · ${leftText()}`;
    }

    // What is left: in a triplet group the notes still to come, in x/8 time eighths, otherwise quarter beats.
    function leftText() {
      if (group) {
        const count = N.toNumber(group.left) / N.toNumber(N.duration({ type: group.base, dots: 0, tuplet: TRIPLET }));
        return `셋잇단 ${Math.round(count * 100) / 100}개 더`;
      }
      if (time[1] === 8) {
        const eighths = N.toNumber(remaining()) * 8;
        return `남은 8분음표 ${Math.round(eighths * 100) / 100}개`;
      }
      return `남은 박 ${beatsText(remaining())}`;
    }

    // The measure being filled is highlighted while input is open.
    function currentMeasure() {
      if (locked || isFull()) return -1;
      return time ? Math.floor(done() + 1e-9) : 0;
    }

    function update() {
      if (container.clientWidth) wide = isWide(container); // on the page now: its own width, not the window's guess
      const svg = staffOf({
        time,
        measures: time ? splitMeasures(notes, measureLength()) : [],
        slots: maxMeasures(),
        shown: shownMeasures(),
        current: currentMeasure(),
        marks,
      }, wide, time ? `리듬 보표, ${timeText(time)}박자. ${progressText()}` : '리듬 보표. 박자표를 아직 고르지 않았어요.');
      container.replaceChildren(svg);

      for (const button of noteButtons) {
        button.disabled = !canAdd(button.dataset.type);
      }
      for (const button of toggleButtons) {
        const name = button.dataset.toggle;
        button.disabled = !canToggle(name);
        button.setAttribute('aria-pressed', String(opts[name]));
      }
      for (const button of timeButtonList) {
        button.disabled = locked;
        button.setAttribute('aria-checked', String(Boolean(time) && button.dataset.time === timeText(time)));
      }
      progress.textContent = progressText();
      undoButton.disabled = locked || notes.length === 0;
      clearButton.disabled = locked || notes.length === 0;
      onChange?.();
    }
    function add(code) {
      if (!canAdd(code)) return;
      history.push(snapshot());
      const note = make(code);
      if (advanced) {
        if (opts.tie && !note.rest) {
          const last = notes[notes.length - 1];
          last.tie = last.tie === 'stop' ? 'both' : 'start';
          note.tie = 'stop';
        }
        opts.tie = false;
        if (opts.tuplet) {
          if (!group) {
            group = { base: note.type, left: groupLength(note.type) };
            note.tupletStart = true;
          }
          group.left = N.sub(group.left, N.duration(note));
          if (N.cmp(group.left, N.ZERO) === 0) {
            note.tupletStop = true;
            group = null;
            opts.tuplet = false;
          }
        }
      }
      notes.push(note);
      update();
    }

    function toggle(name) {
      if (!canToggle(name)) return;
      opts[name] = !opts[name];
      if (name === 'tuplet' && opts.tuplet) opts.dot = false;
      if (name === 'tie' && opts.tie) opts.rest = false;
      update();
    }

    function setTime(next) {
      if (locked || !chooseTime || sameTime(next, time)) return;
      time = next;
      clearInput();
      update();
    }

    // Undo puts back everything as it was before the last note: the tie into it, its triplet group, the buttons.
    undoButton.addEventListener('click', () => {
      if (locked || !notes.length) return;
      if (advanced && history.length) {
        ({ notes, opts, group } = history.pop());
      } else {
        notes.pop();
      }
      update();
    });
    clearButton.addEventListener('click', () => {
      if (locked) return;
      clearInput();
      update();
    });

    return {
      // options: { types: 기본 note buttons to offer, or advanced: true with toggles (심화: the five lengths and those
      //            buttons kept on), time: [beats, beatType] (null: the user picks it from `times`),
      //            measures: count or null, times: time signatures to choose from (default 2/4·3/4·4/4) }
      reset(options) {
        clearInput();
        marks = null;
        advanced = Boolean(options.advanced);
        toggles = advanced ? options.toggles ?? [] : [];
        types = advanced ? Object.keys(LENGTHS) : options.types;
        time = options.time ?? null;
        chooseTime = time === null;
        fixedMeasures = options.measures ?? null;
        makeTimeButtons(options.times ?? TIME_SIGNATURES);
        timeButtons.hidden = !chooseTime;
        noteButtons = types.map((type) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'note-button';
          button.dataset.type = type;
          const info = advanced ? LENGTHS[type] : TYPES[type];
          button.setAttribute('aria-label', info.name);
          const text = document.createElement('span');
          text.className = 'note-button-label';
          text.textContent = info.short;
          button.append(iconFor(type), text);
          button.addEventListener('click', () => add(type));
          return button;
        });
        toggleButtons = toggles.map((name) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'note-button note-toggle';
          button.dataset.toggle = name;
          button.setAttribute('aria-pressed', 'false');
          button.setAttribute('aria-label', TOGGLES[name]);
          const text = document.createElement('span');
          text.className = 'note-button-label';
          text.textContent = TOGGLES[name];
          button.append(toggleIcon(name), text);
          button.addEventListener('click', () => toggle(name));
          return button;
        });
        const count = noteButtons.length + toggleButtons.length;
        buttons.style.setProperty('--cols', count);
        buttons.style.setProperty('--phone-cols', advanced ? 5 : Math.min(count, 4));
        buttons.replaceChildren(...noteButtons, ...toggleButtons);
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

  // Playback. Everything sounds at one pitch; clicks are short and higher.
  // A beat is a quarter in simple time and a dotted quarter in compound time (6/8, 9/8, 12/8).
  const BEAT = 60 / 80; // 기본, and 심화 쉬움·중간 in simple time: ♩ = 80
  const SLOW_BEAT = 60 / 60; // 심화: ♩. = 60 in compound time; 어려움 every beat (♩ = 60, ♩. = 60) (PRD #4-J-2)
  const TONE = 72; // C5
  const CLICK = 84; // C6
  const CLICK_HIGH = 96; // C7: the count-in's first beat (easy/medium)
  const CLICK_LENGTH = 0.08;
  const CLICK_PEAK = 0.3;
  const NOTE_PEAK = 0.3;
  const ACCENT_PEAK = 0.45; // a measure's first beat
  const NOTE_SHARE = 0.9; // a note sounds for this share of its written length

  const isCompound = (time) => time[1] === 8 && time[0] % 3 === 0 && time[0] >= 6;
  const beatUnit = (time) => (isCompound(time) ? N.frac(3, 8) : QUARTER);
  // Seconds per beat for a question: 기본 ♩ = 80; 심화 쉬움·중간 ♩ = 80 / ♩. = 60; 심화 어려움 one second for every
  // time signature, so the count-in doesn't tell simple from compound.
  function beatOf(time, { advanced = false, hard = false } = {}) {
    if (!advanced) return BEAT;
    if (hard) return SLOW_BEAT;
    return isCompound(time) ? SLOW_BEAT : BEAT;
  }

  // rhythm: { time: [beats, beatType], measures: [[note, ...], ...] }.
  // fixedCountIn: true = one measure of count-in in beats with a high first click (the time signature is given;
  // 6/8 counts 2, 9/8 3, 12/8 4); false = four identical clicks that only set the tempo (hard, where the time
  // signature is the question). beat: seconds per beat (beatOf).
  // Notes tied together sound once, for their whole length; triplets are exact thirds (the score format's lengths).
  // Returns { events (for Sound.playEvents), total (seconds, including trailing rests), start (when the rhythm begins) }.
  function schedule(rhythm, { fixedCountIn = true, beat = BEAT } = {}) {
    const compound = isCompound(rhythm.time);
    const beats = fixedCountIn ? (compound ? rhythm.time[0] / 3 : rhythm.time[0]) : 4;
    const events = [];
    for (let i = 0; i < beats; i++) {
      const high = fixedCountIn && i === 0;
      events.push({ kind: 'click', start: i * beat, length: CLICK_LENGTH, midi: high ? CLICK_HIGH : CLICK, peak: CLICK_PEAK });
    }
    const start = beats * beat;
    const whole = beat / N.toNumber(beatUnit(rhythm.time)); // seconds per whole note
    let time = start;
    let open = null; // the sounding note a tie carries on
    const written = new Map();
    for (const measure of rhythm.measures) {
      measure.forEach((note, i) => {
        const length = N.toNumber(N.duration(note)) * whole;
        if (note.rest) {
          open = null;
        } else {
          if (open && N.tieStops(note.tie)) {
            written.set(open, written.get(open) + length);
          } else {
            open = { kind: 'note', type: codeOf(note), start: time, length: 0, midi: TONE, peak: i === 0 ? ACCENT_PEAK : NOTE_PEAK, sustain: true };
            written.set(open, length);
            events.push(open);
          }
          if (!N.tieStarts(note.tie)) open = null;
        }
        time += length;
      });
    }
    for (const [event, length] of written) event.length = length * NOTE_SHARE;
    return { events, total: time, start };
  }

  window.Rhythm = {
    create, draw, schedule, beatOf, isCompound, iconFor, beatsText, noteOf, codeOf, noteKey, soundKey, timeText, sameTime,
    TYPES, LENGTHS, LEVEL_TYPES, LEVEL_TOGGLES, TIME_SIGNATURES, ADVANCED_TIME_SIGNATURES, lengthOf, splitMeasures,
  };
})();
