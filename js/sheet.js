(function () {
  // Draws a v2 score (notation.js) as written: clefs, key signatures, time signatures, ledger lines and
  // standard accidentals. Each row is its own SVG in its own box, so a row too wide for the screen scrolls
  // sideways on its own (the page never does).
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const N = Notation;

  // Geometry in viewBox units. Staff positions count line/space steps up from the bottom line (0); the top line is 8.
  const HALF = 8; // one step
  const STEM = 7; // steps
  const TOP_LINE = 8;
  const MIDDLE = 4; // the middle line: notes on it or above take stems down
  const ROW_PAD_TOP = 14; // room for the measure number
  const ROW_PAD_BOTTOM = 6;
  const STAFF_LEFT = 2;
  const RIGHT_PAD = 4;
  const CLEF_WIDTH = 46;
  const KEY_STEP = 10; // one sharp/flat of a key signature
  const TIME_WIDTH = 24;
  const MEASURE_PAD_LEFT = 8;
  const MEASURE_PAD_RIGHT = 6;
  const HEAD_RX = 6.5;
  const STEM_DX = 6;
  const MIN = { head: 14, whole: 18, rest: 12, accidental: 12, dot: 7, flag: 8, gap: 3 };
  // Wide boxes take four measures to a row, narrow ones two; drawn in these viewBox widths.
  const WIDE_MIN = 560;
  const WIDTH = { wide: 720, narrow: 360 };

  // Bottom-line pitch of each clef, as a diatonic number (octave * 7 + step index).
  const STEP_INDEX = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  const diatonic = (pitch) => pitch.octave * 7 + STEP_INDEX[pitch.step];
  const BOTTOM = { treble: 4 * 7 + 2, bass: 2 * 7 + 4 }; // E4, G2
  const position = (pitch, clef) => diatonic(pitch) - BOTTOM[clef];

  // Key signatures: the order of sharps and flats and their treble-clef positions (bass is two steps lower).
  const SHARPS = [['F', 8], ['C', 5], ['G', 9], ['D', 6], ['A', 3], ['E', 7], ['B', 4]];
  const FLATS = [['B', 4], ['E', 7], ['A', 3], ['D', 6], ['G', 2], ['C', 5], ['F', 1]];
  const CLEF_SHIFT = { treble: 0, bass: -2 };
  const SIGNS = { 2: '\u{1D12A}', 1: '♯︎', 0: '♮︎', '-1': '♭︎', '-2': '\u{1D12B}' };
  const CLEF_GLYPH = { treble: '\u{1D11E}', bass: '\u{1D122}' };

  // The alteration the key gives each step (e.g. 2 sharps: F and C are +1).
  function keyAlters(key) {
    const alters = {};
    const list = key.fifths > 0 ? SHARPS : FLATS;
    for (let i = 0; i < Math.abs(key.fifths); i++) alters[list[i][0]] = key.fifths > 0 ? 1 : -1;
    return alters;
  }

  // Signs of a key signature: [{ alter, pos }]. `cancel`: the previous key, whose signs the new one drops get a ♮.
  function keySigns(key, clef, cancel) {
    const shift = CLEF_SHIFT[clef];
    const signs = [];
    if (cancel) {
      const keep = keyAlters(key);
      const oldList = cancel.fifths > 0 ? SHARPS : FLATS;
      for (let i = 0; i < Math.abs(cancel.fifths); i++) {
        const [step, pos] = oldList[i];
        if (keep[step] !== (cancel.fifths > 0 ? 1 : -1)) signs.push({ alter: 0, pos: pos + shift });
      }
    }
    const list = key.fifths > 0 ? SHARPS : FLATS;
    for (let i = 0; i < Math.abs(key.fifths); i++) signs.push({ alter: key.fifths > 0 ? 1 : -1, pos: list[i][1] + shift });
    return signs;
  }

  // Standard accidentals within a measure: a sign only where a note differs from what its line/space already
  // means (the key signature, or an earlier accidental on the same line/space in this measure). A note tied over
  // from the previous measure gets none. Returns per note: an alter to show, or null.
  function shownAccidentals(notes, key) {
    const fromKey = keyAlters(key);
    const state = {};
    return notes.map((note, i) => {
      if (note.rest) return null;
      const name = `${note.pitch.step}${note.pitch.octave}`;
      const expected = state[name] ?? fromKey[note.pitch.step] ?? 0;
      // A note tied over the barline shows nothing, and its accidental doesn't carry on to later notes.
      const tiedOver = i === 0 && (note.tie === 'stop' || note.tie === 'both');
      if (tiedOver) return null;
      state[name] = note.pitch.alter;
      return note.pitch.alter === expected ? null : note.pitch.alter;
    });
  }

  function svgEl(name, attrs, text) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const FLAGS = { eighth: 1, '16th': 2, '32nd': 3 };
  const OPEN = { whole: true, half: true };

  function stemOf(note, pos) {
    if (note.rest || note.type === 'whole') return 0;
    return pos >= MIDDLE ? -1 : 1;
  }

  // Everything needed to space and draw one measure.
  function measureInfo(measure, index, prev) {
    const changes = {
      clef: !prev || prev.clef !== measure.clef,
      key: !prev || prev.key.fifths !== measure.key.fifths || prev.key.mode !== measure.key.mode,
      time: !prev || prev.time[0] !== measure.time[0] || prev.time[1] !== measure.time[1],
    };
    const accidentals = shownAccidentals(measure.notes, measure.key);
    const notes = measure.notes.map((note, i) => {
      const pos = note.rest ? null : position(note.pitch, measure.clef);
      const stem = stemOf(note, pos);
      const left = accidentals[i] !== null ? MIN.accidental * (Math.abs(accidentals[i]) === 2 ? 1.2 : 1) : 0;
      const head = note.rest ? MIN.rest : note.type === 'whole' ? MIN.whole : MIN.head;
      let right = (note.dots ?? 0) * MIN.dot;
      if (FLAGS[note.type] && stem === 1) right = Math.max(right, MIN.flag);
      return { note, pos, stem, accidental: accidentals[i], parts: { left, head, right }, min: left + head + right + MIN.gap };
    });
    const min = MEASURE_PAD_LEFT + MEASURE_PAD_RIGHT + notes.reduce((sum, n) => sum + n.min, 0);
    return { ...measure, index, changes, notes, min, prevKey: prev?.key };
  }

  // Width of what goes before a measure's notes: a mid-row clef, key and time change.
  function prefixWidth(info, rowStart) {
    let width = 0;
    if (rowStart) {
      width += CLEF_WIDTH + keySigns(info.key, info.clef, info.changes.key ? info.prevKey : undefined).length * KEY_STEP;
    } else {
      if (info.changes.clef) width += CLEF_WIDTH * 0.7;
      if (info.changes.key) width += keySigns(info.key, info.clef, info.prevKey).length * KEY_STEP + 4;
    }
    if (info.changes.time) width += TIME_WIDTH;
    return width;
  }

  // Shares `total` out by weight, but never below each item's minimum.
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

  // Rows of up to `perRow` measures, fewer when they don't fit. A measure wider than a row gets a row to itself.
  function layoutRows(infos, width, perRow) {
    const rows = [];
    let row = [];
    let used = 0;
    const room = width - STAFF_LEFT - RIGHT_PAD;
    infos.forEach((info) => {
      const need = (start) => info.min + prefixWidth(info, start);
      if (row.length && (row.length === perRow || used + need(false) > room)) {
        rows.push(row);
        row = [];
        used = 0;
      }
      used += need(!row.length);
      row.push(info);
    });
    if (row.length) rows.push(row);
    return rows;
  }

  // How far the row's drawing reaches above the top line and below the bottom line, in steps.
  function rowExtent(row) {
    let up = TOP_LINE + 2;
    let down = -2;
    for (const info of row) {
      for (const { pos, stem } of info.notes) {
        if (pos === null) continue;
        up = Math.max(up, pos + (stem === 1 ? STEM : 1) + 1);
        down = Math.min(down, pos - (stem === -1 ? STEM : 1) - 1);
      }
    }
    return { up, down };
  }

  function drawSigns(parent, signs, x, yOf) {
    signs.forEach((sign, i) => {
      parent.append(svgEl('text', {
        x: x + i * KEY_STEP + KEY_STEP - 1, y: yOf(sign.pos) + 5, class: 'sv-accidental sv-key', 'data-alter': sign.alter, 'data-pos': sign.pos,
      }, SIGNS[sign.alter]));
    });
    return signs.length * KEY_STEP;
  }

  function drawClef(parent, clef, x, yOf, small) {
    // Treble: the curl sits on the G line (position 2); bass: the dots straddle the F line (position 6).
    const y = clef === 'treble' ? yOf(0) + 2 : yOf(4) + 23;
    parent.append(svgEl('text', {
      x, y, class: `staff-clef sv-clef${small ? ' is-small' : ''}`, 'data-clef': clef,
    }, CLEF_GLYPH[clef]));
    return small ? CLEF_WIDTH * 0.7 : CLEF_WIDTH;
  }

  function drawTime(parent, time, x, yOf) {
    const cx = x + TIME_WIDTH / 2;
    parent.append(svgEl('text', { x: cx, y: yOf(4) - 2, class: 'sv-time', 'data-time': `${time[0]}/${time[1]}` }, String(time[0])));
    parent.append(svgEl('text', { x: cx, y: yOf(0) - 2, class: 'sv-time' }, String(time[1])));
    return TIME_WIDTH;
  }

  function drawLedgers(parent, x, pos, yOf, half) {
    const lines = [];
    for (let p = -2; p >= pos; p -= 2) lines.push(p);
    for (let p = TOP_LINE + 2; p <= pos; p += 2) lines.push(p);
    for (const p of lines) {
      parent.append(svgEl('line', { x1: x - half, x2: x + half, y1: yOf(p), y2: yOf(p), class: 'sv-ledger', 'data-pos': p }));
    }
  }

  function drawRest(parent, note, x, yOf) {
    if (note.type === 'whole' || note.type === 'half') {
      // Whole rests hang below the fourth line, half rests sit on the middle line.
      const y = note.type === 'whole' ? yOf(6) : yOf(4) - 5;
      parent.append(svgEl('rect', { x: x - 6, y, width: 12, height: 5, class: 'sv-fill sv-rest-block' }));
      return;
    }
    const y = yOf(MIDDLE);
    parent.append(svgEl('path', {
      d: `M${x - 1} ${y - 14} L${x + 4.5} ${y - 7.5} L${x - 0.5} ${y - 2} L${x + 4.5} ${y + 4.5}`
        + ` C${x - 3} ${y + 1} ${x - 3} ${y + 8} ${x + 1.5} ${y + 11}`,
      class: 'sv-rest',
    }));
  }

  function drawFlags(parent, stemX, end, dir, count) {
    for (let k = 0; k < count; k++) {
      const e = end + k * 7 * dir;
      parent.append(svgEl('path', {
        d: `M${stemX} ${e} C${stemX + 1} ${e + 7 * dir} ${stemX + 9} ${e + 9 * dir} ${stemX + 7} ${e + 19 * dir}`
          + ` C${stemX + 7} ${e + 12 * dir} ${stemX + 3} ${e + 10 * dir} ${stemX} ${e + 9 * dir} Z`,
        class: 'sv-fill sv-flag',
      }));
    }
  }

  function drawNote(parent, item, x, yOf) {
    const { note, pos, stem, accidental } = item;
    const group = svgEl('g', { class: 'sv-note', 'data-type': note.type });
    parent.append(group);
    if (note.rest) {
      group.dataset.rest = '';
      drawRest(group, note, x, yOf);
      return;
    }
    const y = yOf(pos);
    group.dataset.pos = pos;
    group.dataset.midi = N.midi(note.pitch);
    drawLedgers(group, x, pos, yOf, note.type === 'whole' ? 12 : 10);
    if (accidental !== null) {
      group.append(svgEl('text', {
        x: x - HEAD_RX - 2, y: y + 5, class: 'sv-accidental', 'data-accidental': accidental,
      }, SIGNS[accidental]));
    }
    if (note.type === 'whole') {
      group.append(svgEl('ellipse', { cx: x, cy: y, rx: 7.5, ry: 5, class: 'sv-open sv-whole sv-head' }));
    } else {
      group.append(svgEl('ellipse', {
        cx: x, cy: y, rx: HEAD_RX, ry: 4.6, transform: `rotate(-20 ${x} ${y})`,
        class: `${OPEN[note.type] ? 'sv-open' : 'sv-fill'} sv-head`,
      }));
    }
    for (let d = 0; d < (note.dots ?? 0); d++) {
      // A note on a line puts its dots in the space above.
      const onLine = pos % 2 === 0;
      group.append(svgEl('circle', { cx: x + 11 + d * 6, cy: onLine ? y - HALF : y, r: 2, class: 'sv-fill sv-dot' }));
    }
    if (!stem) return;
    const stemX = x + stem * STEM_DX;
    const end = y - stem * STEM * HALF;
    group.dataset.stem = stem === 1 ? 'up' : 'down';
    group.append(svgEl('line', { x1: stemX, x2: stemX, y1: y - stem, y2: end, class: 'sv-stem' }));
    if (FLAGS[note.type]) drawFlags(group, stemX, end, stem, FLAGS[note.type]);
  }

  function drawRow(row, r, width, last, short, options) {
    const { up, down } = rowExtent(row);
    const height = ROW_PAD_TOP + (up - down) * HALF + ROW_PAD_BOTTOM;
    const yOf = (pos) => ROW_PAD_TOP + (up - pos) * HALF;
    const svg = svgEl('svg', { class: 'sheet-svg', viewBox: `0 0 ${width} ${height}`, 'data-row': r });
    const first = row[0];

    // Prefixes first, then the measures share what is left.
    const prefixes = row.map((info, k) => prefixWidth(info, k === 0));
    const mins = row.map((info) => info.min);
    let room = width - STAFF_LEFT - RIGHT_PAD - prefixes.reduce((a, b) => a + b, 0);
    // A short last row keeps the measure width of a full row instead of stretching.
    if (short) room *= short;
    // By what each measure holds, so a pickup or a short last measure is drawn shorter.
    const widths = distribute(Math.max(room, mins.reduce((a, b) => a + b, 0)), mins, row.map((info) => N.toNumber(N.filled(info.notes))));
    const end = STAFF_LEFT + prefixes.reduce((a, b) => a + b, 0) + widths.reduce((a, b) => a + b, 0);

    for (let line = 0; line <= TOP_LINE; line += 2) {
      svg.append(svgEl('line', { x1: STAFF_LEFT, x2: end, y1: yOf(line), y2: yOf(line), class: 'sv-line' }));
    }
    if (r > 0 || options.numberFirst) {
      svg.append(svgEl('text', { x: STAFF_LEFT, y: 10, class: 'sv-number' }, String(first.number)));
    }

    let x = STAFF_LEFT;
    row.forEach((info, k) => {
      const group = svgEl('g', { class: 'sv-measure', 'data-measure': info.index, 'data-number': info.number });
      svg.append(group);
      if (k === 0) {
        x += drawClef(group, info.clef, x + 2, yOf, false);
        // At a row start a key change shows its cancelling naturals too.
        x += drawSigns(group, keySigns(info.key, info.clef, info.changes.key ? info.prevKey : undefined), x, yOf);
      } else {
        if (info.changes.clef) x += drawClef(group, info.clef, x + 2, yOf, true);
        if (info.changes.key) x += drawSigns(group, keySigns(info.key, info.clef, info.prevKey), x, yOf) + 4;
      }
      if (info.changes.time) x += drawTime(group, info.time, x, yOf);

      group.dataset.x0 = x;
      group.dataset.x1 = x + widths[k];
      const sizes = distribute(widths[k] - MEASURE_PAD_LEFT - MEASURE_PAD_RIGHT, info.notes.map((n) => n.min),
        info.notes.map((n) => N.toNumber(N.duration(n.note))));
      let nx = x + MEASURE_PAD_LEFT;
      info.notes.forEach((item, i) => {
        drawNote(group, item, nx + item.parts.left + item.parts.head / 2, yOf);
        nx += sizes[i];
      });
      x += widths[k];
      const final = last && k === row.length - 1;
      svg.append(svgEl('line', { x1: x - (final ? 4 : 0), x2: x - (final ? 4 : 0), y1: yOf(TOP_LINE), y2: yOf(0), class: 'sv-bar' }));
      if (final) svg.append(svgEl('rect', { x: x - 2.5, y: yOf(TOP_LINE), width: 3, height: yOf(0) - yOf(TOP_LINE), class: 'sv-bar-end' }));
    });
    return { svg, width: end + RIGHT_PAD, height };
  }

  function isWide(container) {
    return (container.clientWidth || 0) >= WIDE_MIN;
  }

  // score: a v2 score. options: { label, numberFirst (show the number on the first row too) }.
  // Redrawn when the box crosses the wide/narrow width.
  function draw(container, score, options = {}) {
    container.__sheet = { score, options };
    if (!container.__sheetObserver) {
      let wide = isWide(container);
      container.__sheetObserver = new ResizeObserver(() => {
        if (!container.clientWidth || isWide(container) === wide || !container.__sheet) return;
        wide = isWide(container);
        requestAnimationFrame(() => render(container));
      });
      container.__sheetObserver.observe(container);
    }
    render(container);
  }

  function render(container) {
    const { score, options } = container.__sheet;
    const wide = isWide(container);
    const width = wide ? WIDTH.wide : WIDTH.narrow;
    const measures = N.resolve(score);
    const infos = measures.map((measure, i) => measureInfo(measure, i, i ? measures[i - 1] : null));
    const rows = layoutRows(infos, width, wide ? 4 : 2);
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    sheet.setAttribute('role', 'img');
    sheet.setAttribute('aria-label', options.label ?? `악보, ${score.title}`);
    // One viewBox unit is this many pixels, the same for every row (the box's content width over the drawing width).
    const style = getComputedStyle(container);
    const inner = container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const scale = (inner > 0 ? inner : width) / width;
    rows.forEach((row, r) => {
      const last = r === rows.length - 1;
      const perRow = wide ? 4 : 2;
      const short = last && rows.length > 1 && row.length < perRow ? row.length / perRow : 0;
      const { svg, width: rowWidth, height } = drawRow(row, r, width, last, short, options);
      svg.setAttribute('viewBox', `0 0 ${rowWidth} ${height}`);
      svg.style.width = `${Math.floor(rowWidth * scale)}px`;
      svg.style.height = `${height * scale}px`;
      const box = document.createElement('div');
      box.className = 'sheet-row';
      box.append(svg);
      sheet.append(box);
    });
    container.replaceChildren(sheet);
    return sheet;
  }

  window.Sheet = { draw, shownAccidentals, keySigns, keyAlters, position };
})();
