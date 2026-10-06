(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Lengths are in eighth notes. Every time signature is x/4, so a measure is beats * 2 eighths.
  const TYPES = {
    w: { length: 8, name: '온음표', short: '온' },
    'h.': { length: 6, name: '점2분음표', short: '점2분' },
    h: { length: 4, name: '2분음표', short: '2분' },
    'q.': { length: 3, name: '점4분음표', short: '점4분' },
    q: { length: 2, name: '4분음표', short: '4분' },
    e: { length: 1, name: '8분음표', short: '8분' },
    r: { length: 2, name: '4분쉼표', short: '4분쉼표', rest: true },
  };
  const LEVEL_TYPES = {
    easy: ['w', 'h', 'q'],
    medium: ['w', 'h.', 'h', 'q', 'e', 'r'],
    hard: ['w', 'h.', 'h', 'q.', 'q', 'e', 'r'],
  };
  const TIME_SIGNATURES = [2, 3, 4];
  const MAX_MEASURES = 4;

  // Geometry in viewBox units. Each row is a one-line staff; notes sit on the line with stems up.
  const ROW_HEIGHT = 64;
  const LINE_Y = 44;
  const TOP_PAD = 4;
  const HEADER = 34; // room for the time signature at the start of the first row
  const RIGHT_PAD = 6;
  const MEASURE_PAD_LEFT = 14;
  const MEASURE_PAD_RIGHT = 10;
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

  function lengthOf(types) {
    return types.reduce((sum, type) => sum + TYPES[type].length, 0);
  }

  // Splits a flat list of note types into measures of `measureLength` eighths. Input never crosses a
  // barline (buttons that don't fit are disabled), so a running total is enough.
  function splitMeasures(types, measureLength) {
    const measures = [];
    let filled = 0;
    for (const type of types) {
      const index = Math.floor(filled / measureLength);
      (measures[index] ||= []).push(type);
      filled += TYPES[type].length;
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

  // How the staff is laid out for `slots` measures: two per row in a narrow box, otherwise one row.
  function layout(slots, wide) {
    const width = wide ? 640 : 340;
    const perRow = !wide || slots <= 2 ? 2 : MAX_MEASURES;
    const rows = Math.ceil(slots / perRow);
    return {
      width,
      perRow,
      measureWidth: (width - HEADER - RIGHT_PAD) / perRow,
      height: TOP_PAD + rows * ROW_HEIGHT,
    };
  }

  // model: { time (beats per measure, or null before it is chosen), measures: [[type, ...], ...],
  //          slots (measures to reserve room for), shown (measures to draw), current (measure being filled, or -1),
  //          marks (per measure: true / false, optional) }, wide: see layout()
  function renderStaff(svg, model, wide) {
    const geo = layout(model.slots, wide);
    svg.setAttribute('viewBox', `0 0 ${geo.width} ${geo.height}`);
    svg.replaceChildren();
    const measureLength = model.time ? model.time * 2 : 0;

    for (let i = 0; i < model.shown; i++) {
      const row = Math.floor(i / geo.perRow);
      const col = i % geo.perRow;
      const x0 = HEADER + col * geo.measureWidth;
      const x1 = x0 + geo.measureWidth;
      const y = TOP_PAD + row * ROW_HEIGHT + LINE_Y;
      const mark = model.marks?.[i];
      const group = svgEl('g', {
        class: `measure ${mark === true ? 'is-correct' : mark === false ? 'is-wrong' : ''}`.trim(),
        'data-measure': i,
      });

      if (i === model.current) {
        group.append(svgEl('rect', { x: x0 + 2, y: y - 36, width: geo.measureWidth - 4, height: 50, rx: 6, class: 'rhythm-current' }));
      }
      // The line runs in from the left edge at the start of each row.
      group.append(svgEl('line', { x1: col === 0 ? 6 : x0, x2: x1, y1: y, y2: y, class: 'rhythm-line' }));
      group.append(svgEl('line', { x1, x2: x1, y1: y - 12, y2: y + 12, class: 'rhythm-bar' }));
      if (i === 0 && model.time) {
        group.append(svgEl('text', { x: HEADER / 2 + 2, y: y - 3, class: 'rhythm-time' }, String(model.time)));
        group.append(svgEl('text', { x: HEADER / 2 + 2, y: y + 17, class: 'rhythm-time' }, '4'));
      }

      const notes = model.measures[i] || [];
      const unit = measureLength ? (geo.measureWidth - MEASURE_PAD_LEFT - MEASURE_PAD_RIGHT) / measureLength : 0;
      let position = 0;
      notes.forEach((type, n) => {
        const x = x0 + MEASURE_PAD_LEFT + position * unit;
        // Two eighths that start on a beat are joined by a beam instead of flags.
        const beamStart = type === 'e' && position % 2 === 0 && notes[n + 1] === 'e';
        const beamEnd = type === 'e' && position % 2 === 1 && notes[n - 1] === 'e';
        drawGlyph(group, type, x, y, { flag: !beamStart && !beamEnd });
        if (beamStart) {
          const stemX = x + STEM_X;
          group.append(svgEl('rect', {
            x: stemX - 0.6, y: y - STEM_HEIGHT, width: unit + 1.2, height: 4.5, class: 'rh-fill rh-beam',
          }));
        }
        position += TYPES[type].length;
      });
      svg.append(group);
    }
  }

  function draw(container, rhythm, label, { marks } = {}) {
    const svg = svgEl('svg', { class: 'rhythm-staff', role: 'img', 'aria-label': label });
    const count = rhythm.measures.length;
    renderStaff(svg, { time: rhythm.time[0], measures: rhythm.measures, slots: count, shown: count, current: -1, marks }, isWide(container));
    container.replaceChildren(svg);
  }

  function iconFor(type) {
    const svg = svgEl('svg', { class: 'note-icon', viewBox: '0 0 30 40', 'aria-hidden': 'true' });
    const centred = type === 'w' || type === 'r';
    drawGlyph(svg, type, type === 'w' ? 15 : 11, centred ? 22 : 33);
    return svg;
  }

  function beatsText(eighths) {
    return eighths % 2 === 0 ? String(eighths / 2) : `${(eighths - 1) / 2}.5`;
  }

  function create({ container, buttons, timeButtons, progress, undoButton, clearButton, onChange }) {
    let notes = [];
    let types = [];
    let time = null;
    let chooseTime = false; // hard: the user picks the time signature
    let fixedMeasures = null; // easy/medium: the question's measure count, shown up front
    let locked = true;
    let marks = null;

    const svg = svgEl('svg', { class: 'rhythm-staff', role: 'img', 'aria-label': '리듬 보표' });
    container.replaceChildren(svg);
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
    const measureLength = () => (time ? time * 2 : 0);
    const filled = () => lengthOf(notes);
    const isFull = () => Boolean(time) && filled() === measureLength() * maxMeasures();
    const remaining = () => (!time || isFull() ? 0 : measureLength() - (filled() % measureLength()));

    function canSubmit() {
      if (!time || notes.length === 0) return false;
      return fixedMeasures ? isFull() : filled() % measureLength() === 0;
    }

    // Measures on screen: all of them for easy/medium; for hard, the finished ones plus the one being filled.
    function shownMeasures() {
      if (fixedMeasures) return fixedMeasures;
      if (!time) return 1;
      return Math.min(MAX_MEASURES, Math.floor(filled() / measureLength()) + 1);
    }

    function progressText() {
      if (!time) return '박자표를 고르면 입력할 수 있어요.';
      const done = filled() / measureLength();
      if (isFull()) return `${maxMeasures()}마디를 모두 채웠어요. 제출해 보세요.`;
      if (!fixedMeasures && notes.length && Number.isInteger(done)) {
        return `${done}마디 완성 · 이어서 적거나 제출하세요.`;
      }
      return `${Math.floor(done) + 1}마디 · 남은 박 ${beatsText(remaining())}`;
    }

    // The measure being filled is highlighted while input is open.
    function currentMeasure() {
      if (locked || isFull()) return -1;
      return time ? Math.floor(filled() / measureLength()) : 0;
    }

    function update() {
      renderStaff(svg, {
        time,
        measures: time ? splitMeasures(notes, measureLength()) : [],
        slots: maxMeasures(),
        shown: shownMeasures(),
        current: currentMeasure(),
        marks,
      }, wide);
      svg.setAttribute('aria-label', time
        ? `리듬 보표, ${time}/4박자. ${progressText()}`
        : '리듬 보표. 박자표를 아직 고르지 않았어요.');

      for (const button of noteButtons) {
        button.disabled = locked || !time || TYPES[button.dataset.type].length > remaining();
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
    function add(type) {
      if (locked || !time || TYPES[type].length > remaining()) return;
      notes.push(type);
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
      // { time, measures: [[type, ...], ...] } — the measures the user finished or started.
      getInput: () => ({ time, measures: time ? splitMeasures(notes, measureLength()) : [] }),
    };
  }

  window.Rhythm = { create, draw, TYPES, LEVEL_TYPES, lengthOf, splitMeasures };
})();
