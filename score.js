(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const { TYPES } = Rhythm;
  const { stepY, HALF_GAP } = Staff;

  // Geometry in viewBox units. Pitch heights come from the input staff (Staff.stepY): the staff lines run from
  // y 46 to 110, and a row's drawing stays between y 10 (an upward beam over G5) and 151 (a downward beam).
  const ROW_HEIGHT = 148;
  const TOP = 6;
  const MIDDLE_STEP = 6; // B4, the middle line: notes on it or above take stems down
  const STEM = 28;
  const BEAM = 4.5;
  const HEAD_RX = 6.5;
  const STEM_DX = 6;
  const CLEF_WIDTH = 44;
  const TIME_WIDTH = 22; // the time signature, first row only
  const STAFF_LEFT = 4;
  const RIGHT_PAD = 4;
  const MEASURE_PAD_LEFT = 8;
  const MEASURE_PAD_RIGHT = 6;
  // Smallest room a note takes: its head, then what sticks out left (accidental) or right (dot, flag).
  const MIN = { head: 13, whole: 17, rest: 12, accidental: 11, dot: 8, flag: 8, gap: 3 };

  // Four measures to a row when the box is this wide; narrower boxes use two. A row that can't hold its
  // measures without crowding takes fewer.
  const WIDE_MIN = 560;
  const narrowWindowQuery = window.matchMedia('(max-width: 680px)');
  const WIDTH = { wide: 720, narrow: 360 };

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

  // notes -> measures of notes. Notes never cross a barline (the editor and the stored-score check make sure).
  function splitMeasures(notes, time) {
    const measureLength = time * 2;
    const measures = [];
    let filled = 0;
    for (const note of notes) {
      (measures[Math.floor(filled / measureLength)] ||= []).push(note);
      filled += TYPES[note.type].length;
    }
    return measures;
  }

  // Standard accidentals: a sign only where a staff position changes from what it is in this measure so far
  // (C major: natural), and a natural sign when it goes back. Returns per note: 1 (♯), -1 (♭), 0 (♮) or null.
  function shownAccidentals(measure) {
    const state = {};
    return measure.map((note) => {
      if (TYPES[note.type].rest) return null;
      const before = state[note.step] ?? 0;
      state[note.step] = note.accidental;
      return note.accidental === before ? null : note.accidental;
    });
  }

  // Two eighths that start on a beat are beamed. Returns per note: 'start', 'end' or null.
  function beamRoles(measure) {
    let position = 0;
    return measure.map((note, i) => {
      const onBeat = position % 2 === 0;
      position += TYPES[note.type].length;
      if (note.type !== 'e') return null;
      if (onBeat && measure[i + 1]?.type === 'e') return 'start';
      if (!onBeat && measure[i - 1]?.type === 'e') return 'end'; // the eighth before started on the beat
      return null;
    });
  }

  // Stem direction per note: 1 = up, -1 = down, 0 = none. A beamed pair follows whichever note is further from
  // the middle line (down when two notes on opposite sides are equally far).
  function stemDirections(measure, roles) {
    const single = (note) => (note.step >= MIDDLE_STEP ? -1 : 1);
    return measure.map((note, i) => {
      if (TYPES[note.type].rest || note.type === 'w') return 0;
      const partner = roles[i] === 'start' ? measure[i + 1] : roles[i] === 'end' ? measure[i - 1] : null;
      if (!partner) return single(note);
      const distance = (n) => Math.abs(n.step - MIDDLE_STEP);
      if (distance(note) === distance(partner) && single(note) !== single(partner)) return -1;
      return single(distance(note) >= distance(partner) ? note : partner);
    });
  }

  // Everything needed to draw and space one measure.
  function measureInfo(measure) {
    const accidentals = shownAccidentals(measure);
    const roles = beamRoles(measure);
    const stems = stemDirections(measure, roles);
    const parts = measure.map((note, i) => {
      const type = TYPES[note.type];
      const left = accidentals[i] !== null && accidentals[i] !== undefined ? MIN.accidental : 0;
      const head = type.rest ? MIN.rest : note.type === 'w' ? MIN.whole : MIN.head;
      let right = note.type === 'h.' || note.type === 'q.' ? MIN.dot : 0;
      if (note.type === 'e' && !roles[i] && stems[i] === 1) right = Math.max(right, MIN.flag);
      return { left, head, right, min: left + head + right + MIN.gap };
    });
    const min = MEASURE_PAD_LEFT + MEASURE_PAD_RIGHT + parts.reduce((sum, part) => sum + part.min, 0);
    return { measure, accidentals, roles, stems, parts, min };
  }

  // Shares `total` out by weight, but never below each item's minimum (water-filling).
  function distribute(total, mins, weights) {
    const sizes = new Array(mins.length);
    let open = mins.map((_, i) => i);
    let left = total;
    for (;;) {
      const weight = open.reduce((sum, i) => sum + weights[i], 0);
      const unit = weight ? left / weight : 0;
      const clamped = open.filter((i) => weights[i] * unit < mins[i]);
      if (!clamped.length) {
        for (const i of open) sizes[i] = weights[i] * unit;
        return sizes;
      }
      for (const i of clamped) {
        sizes[i] = mins[i];
        left -= mins[i];
      }
      open = open.filter((i) => !clamped.includes(i));
      if (!open.length) return sizes;
    }
  }

  // Splits measures into rows: up to `perRow` each, fewer when their minimum widths don't fit.
  function layoutRows(infos, width, perRow) {
    const rows = [];
    let row = [];
    let used = 0;
    const room = () => width - STAFF_LEFT - RIGHT_PAD - CLEF_WIDTH - (rows.length === 0 ? TIME_WIDTH : 0);
    infos.forEach((info, index) => {
      if (row.length && (row.length === perRow || used + info.min > room())) {
        rows.push(row);
        row = [];
        used = 0;
      }
      row.push(index);
      used += info.min;
    });
    if (row.length) rows.push(row);
    return rows;
  }

  function drawFlag(parent, stemX, end, dir) {
    const s = dir; // the flag runs from the stem end back towards the head
    parent.append(svgEl('path', {
      d: `M${stemX} ${end} C${stemX + 1} ${end + 7 * s} ${stemX + 9} ${end + 9 * s} ${stemX + 7} ${end + 19 * s}`
        + ` C${stemX + 7} ${end + 12 * s} ${stemX + 3} ${end + 10 * s} ${stemX} ${end + 9 * s} Z`,
      class: 'sv-fill sv-flag',
    }));
  }

  // One note or rest. Returns where its stem ends (for beams), or null.
  function drawNote(parent, note, x, oy, { accidental, stem, flag, stemEnd }) {
    const group = svgEl('g', { class: 'sv-note', 'data-type': note.type });
    parent.append(group);
    if (TYPES[note.type].rest) {
      const y = oy + stepY(MIDDLE_STEP);
      group.append(svgEl('path', {
        d: `M${x - 1} ${y - 14} L${x + 4.5} ${y - 7.5} L${x - 0.5} ${y - 2} L${x + 4.5} ${y + 4.5}`
          + ` C${x - 3} ${y + 1} ${x - 3} ${y + 8} ${x + 1.5} ${y + 11}`,
        class: 'sv-rest',
      }));
      return null;
    }
    const y = oy + stepY(note.step);
    group.dataset.step = note.step;
    if (note.step === 0) group.append(svgEl('line', { x1: x - 10, x2: x + 10, y1: y, y2: y, class: 'sv-ledger' }));
    if (accidental !== null && accidental !== undefined) {
      const sign = accidental === 1 ? '♯︎' : accidental === -1 ? '♭︎' : '♮︎';
      group.append(svgEl('text', { x: x - HEAD_RX - 2, y: y + 6, class: 'sv-accidental', 'data-accidental': accidental }, sign));
    }
    if (note.type === 'w') {
      group.append(svgEl('ellipse', { cx: x, cy: y, rx: 7.5, ry: 5, class: 'sv-open sv-whole sv-head' }));
    } else {
      const open = note.type === 'h' || note.type === 'h.';
      group.append(svgEl('ellipse', {
        cx: x, cy: y, rx: HEAD_RX, ry: 4.6, transform: `rotate(-20 ${x} ${y})`,
        class: `${open ? 'sv-open' : 'sv-fill'} sv-head`,
      }));
    }
    if (note.type === 'h.' || note.type === 'q.') {
      // A note on a line puts its dot in the space above.
      const onLine = note.step % 2 === 0;
      group.append(svgEl('circle', { cx: x + 11, cy: onLine ? y - HALF_GAP : y, r: 2, class: 'sv-fill sv-dot' }));
    }
    if (!stem) return null;
    const stemX = x + stem * STEM_DX;
    const end = stemEnd ?? y - stem * STEM;
    group.dataset.stem = stem === 1 ? 'up' : 'down';
    group.append(svgEl('line', { x1: stemX, x2: stemX, y1: y - stem, y2: end, class: 'sv-stem' }));
    if (flag) drawFlag(group, stemX, end, stem);
    return { stemX, end };
  }

  function drawMeasure(parent, info, x0, width, oy, { mark, current }) {
    const group = svgEl('g', {
      class: `measure ${mark === true ? 'is-correct' : mark === false ? 'is-wrong' : ''}`.trim(),
      'data-measure': info.index,
    });
    parent.append(group);
    if (current) {
      group.append(svgEl('rect', {
        x: x0 + 2, y: oy + stepY(10) - 22, width: width - 4, height: stepY(2) - stepY(10) + 44, rx: 6, class: 'sv-current',
      }));
    }
    const inner = width - MEASURE_PAD_LEFT - MEASURE_PAD_RIGHT;
    const sizes = distribute(inner, info.parts.map((part) => part.min), info.measure.map((note) => TYPES[note.type].length));
    let x = x0 + MEASURE_PAD_LEFT;
    const heads = info.measure.map((note, i) => {
      const head = x + info.parts[i].left + info.parts[i].head / 2;
      x += sizes[i];
      return head;
    });

    info.measure.forEach((note, i) => {
      const role = info.roles[i];
      const stem = info.stems[i];
      let stemEnd;
      if (role) {
        // Both stems of a beamed pair reach a level beam past the further head.
        const j = role === 'start' ? i + 1 : i - 1;
        const ys = [note, info.measure[j]].map((n) => oy + stepY(n.step));
        stemEnd = stem === 1 ? Math.min(...ys) - STEM : Math.max(...ys) + STEM;
      }
      const drawn = drawNote(group, note, heads[i], oy, {
        accidental: info.accidentals[i], stem, flag: note.type === 'e' && !role, stemEnd,
      });
      if (role === 'start' && drawn) {
        const endX = heads[i + 1] + stem * STEM_DX;
        const top = stem === 1 ? drawn.end : drawn.end - BEAM;
        group.append(svgEl('rect', {
          x: drawn.stemX - 0.7, y: top, width: endX - drawn.stemX + 1.4, height: BEAM, class: 'sv-fill sv-beam',
        }));
      }
    });
  }

  // score: { time, notes }. options: { marks (per measure: true / false), current (measure index to highlight),
  // label }. The drawing follows the box's width: it is redrawn when the box crosses WIDE_MIN.
  function draw(container, score, options = {}) {
    container.__score = { score, options };
    if (!container.__scoreObserver) {
      let wide = isWide(container);
      container.__scoreObserver = new ResizeObserver(() => {
        if (!container.clientWidth || isWide(container) === wide || !container.__score) return;
        wide = isWide(container);
        requestAnimationFrame(() => render(container));
      });
      container.__scoreObserver.observe(container);
    }
    render(container);
  }

  function render(container) {
    const { score, options } = container.__score;
    const wide = isWide(container);
    const width = wide ? WIDTH.wide : WIDTH.narrow;
    const infos = splitMeasures(score.notes, score.time).map((measure, index) => ({ ...measureInfo(measure), index }));
    const rows = layoutRows(infos, width, wide ? 4 : 2);
    const perRow = wide ? 4 : 2;
    const svg = svgEl('svg', {
      class: 'score-view', role: 'img', viewBox: `0 ${TOP} ${width} ${Math.max(1, rows.length) * ROW_HEIGHT}`,
      'aria-label': options.label ?? `악보, ${score.time}/4박자 ${infos.length}마디`,
    });

    rows.forEach((row, r) => {
      const oy = r * ROW_HEIGHT;
      const start = STAFF_LEFT + CLEF_WIDTH + (r === 0 ? TIME_WIDTH : 0);
      const room = width - RIGHT_PAD - start;
      // A short last row keeps the measure width of a full row instead of stretching.
      const last = r === rows.length - 1;
      const target = last && row.length < perRow && rows.length > 1
        ? Math.max(room * row.length / perRow, row.reduce((sum, i) => sum + infos[i].min, 0))
        : room;
      const widths = distribute(target, row.map((i) => infos[i].min), row.map(() => 1));
      const end = start + target;
      const rowGroup = svgEl('g', { class: 'sv-row', 'data-row': r });
      svg.append(rowGroup);
      for (let line = 0; line < 5; line++) {
        const y = oy + stepY(2 + line * 2);
        rowGroup.append(svgEl('line', { x1: STAFF_LEFT, x2: end, y1: y, y2: y, class: 'sv-line' }));
      }
      rowGroup.append(svgEl('text', { x: STAFF_LEFT + 2, y: oy + stepY(2) + 2, class: 'staff-clef sv-clef' }, '\u{1D11E}'));
      if (r === 0) {
        const tx = STAFF_LEFT + CLEF_WIDTH + TIME_WIDTH / 2;
        rowGroup.append(svgEl('text', { x: tx, y: oy + stepY(6) - 2, class: 'sv-time' }, String(score.time)));
        rowGroup.append(svgEl('text', { x: tx, y: oy + stepY(2) - 2, class: 'sv-time' }, '4'));
      }
      let x = start;
      row.forEach((index, k) => {
        drawMeasure(rowGroup, infos[index], x, widths[k], oy, {
          mark: options.marks?.[index], current: options.current === index,
        });
        x += widths[k];
        const final = index === infos.length - 1;
        const top = oy + stepY(10);
        const bottom = oy + stepY(2);
        rowGroup.append(svgEl('line', { x1: x - (final ? 4 : 0), x2: x - (final ? 4 : 0), y1: top, y2: bottom, class: 'sv-bar' }));
        if (final) rowGroup.append(svgEl('rect', { x: x - 2.5, y: top, width: 3, height: bottom - top, class: 'sv-bar-end' }));
      });
    });
    container.replaceChildren(svg);
    return svg;
  }

  window.Score = { draw, splitMeasures, shownAccidentals, beamRoles, stemDirections };
})();
