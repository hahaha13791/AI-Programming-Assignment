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
  const SMALL_CLEF = CLEF_WIDTH * 0.7;
  const MEASURE_PAD_LEFT = 8;
  const MEASURE_PAD_RIGHT = 6;
  const HEAD_RX = 6.5;
  const STEM_DX = 6;
  const BEAM = 4.5; // beam thickness
  const BEAM_GAP = 7; // from one beam to the next
  const MIN = { head: 14, whole: 18, rest: 12, accidental: 12, dot: 7, flag: 8, gap: 3 };
  // Wide boxes take four measures to a row, narrow ones two; drawn in these viewBox widths.
  const WIDE_MIN = 560;
  const WIDTH = { wide: 720, narrow: 360 };

  // Each clef: the sounding pitch of its bottom line as a diatonic number (octave * 7 + step index), its shape and
  // where an octave sign goes, and how far its key signature sits from the treble one (in steps). Pitches are as they
  // sound, so an octave clef (a tenor voice's treble with an 8 below) draws them an octave from where they'd sit.
  const STEP_INDEX = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  const diatonic = (pitch) => pitch.octave * 7 + STEP_INDEX[pitch.step];
  const CLEF_INFO = {
    treble: { bottom: 4 * 7 + 2, shape: 'G', shift: 0 }, // E4
    'treble-8vb': { bottom: 3 * 7 + 2, shape: 'G', shift: 0, octave: -1 },
    'treble-8va': { bottom: 5 * 7 + 2, shape: 'G', shift: 0, octave: 1 },
    bass: { bottom: 2 * 7 + 4, shape: 'F', shift: -2 }, // G2
    'bass-8vb': { bottom: 1 * 7 + 4, shape: 'F', shift: -2, octave: -1 },
    'bass-8va': { bottom: 3 * 7 + 4, shape: 'F', shift: -2, octave: 1 },
    alto: { bottom: 3 * 7 + 3, shape: 'C', line: 4, shift: -1 }, // F3; C4 on the middle line
    tenor: { bottom: 3 * 7 + 1, shape: 'C', line: 6, shift: 1 }, // D3; C4 on the fourth line
  };
  const position = (pitch, clef) => diatonic(pitch) - CLEF_INFO[clef].bottom;

  // Key signatures: the order of sharps and flats and their treble-clef positions, moved for other clefs. The tenor
  // clef's sharps are the standard exception: F♯ and G♯ sit low instead of above the staff.
  const SHARPS = [['F', 8], ['C', 5], ['G', 9], ['D', 6], ['A', 3], ['E', 7], ['B', 4]];
  const FLATS = [['B', 4], ['E', 7], ['A', 3], ['D', 6], ['G', 2], ['C', 5], ['F', 1]];
  const TENOR_SHARPS = [2, 6, 3, 7, 4, 8, 5];
  const SIGNS = { 2: '\u{1D12A}', 1: '♯︎', 0: '♮︎', '-1': '♭︎', '-2': '\u{1D12B}' };
  const CLEF_GLYPH = { G: '\u{1D11E}', F: '\u{1D122}' };

  // The alteration the key gives each step (e.g. 2 sharps: F and C are +1).
  function keyAlters(key) {
    const alters = {};
    const list = key.fifths > 0 ? SHARPS : FLATS;
    for (let i = 0; i < Math.abs(key.fifths); i++) alters[list[i][0]] = key.fifths > 0 ? 1 : -1;
    return alters;
  }

  // Signs of a key signature: [{ alter, pos }]. `cancel`: the previous key, whose signs the new one drops get a ♮.
  function keySigns(key, clef, cancel) {
    const info = CLEF_INFO[clef];
    const where = (sharp, i) => (sharp && info.shape === 'C' && info.line === 6 ? TENOR_SHARPS[i] : (sharp ? SHARPS : FLATS)[i][1] + info.shift);
    const signs = [];
    if (cancel) {
      const keep = keyAlters(key);
      const oldList = cancel.fifths > 0 ? SHARPS : FLATS;
      for (let i = 0; i < Math.abs(cancel.fifths); i++) {
        if (keep[oldList[i][0]] !== (cancel.fifths > 0 ? 1 : -1)) signs.push({ alter: 0, pos: where(cancel.fifths > 0, i) });
      }
    }
    for (let i = 0; i < Math.abs(key.fifths); i++) signs.push({ alter: key.fifths > 0 ? 1 : -1, pos: where(key.fifths > 0, i) });
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

  const FLAGS = { eighth: 1, '16th': 2, '32nd': 3, '64th': 4 };
  const OPEN = { whole: true, half: true };

  function stemOf(note, pos) {
    if (note.rest || note.type === 'whole') return 0;
    return pos >= MIDDLE ? -1 : 1;
  }

  // Beam groups: notes with flags (no rests between) in the same beat, which is a quarter in simple time and a
  // dotted quarter in compound time (6/8, 9/8, 12/8, 3/8). A tuplet's notes are beamed together.
  // Returns arrays of note indices, two or more each.
  function beamGroups(notes, time) {
    const unit = time[1] === 8 && time[0] % 3 === 0 ? 3 / 8 : 1 / 4;
    const groups = [];
    let current = null;
    let start = 0;
    let tuplet = -1;
    notes.forEach((note, i) => {
      if (note.tupletStart) tuplet = i;
      const inTuplet = note.tuplet ? tuplet : -1;
      const beat = Math.floor(start / unit + 1e-9);
      start += N.toNumber(N.duration(note));
      const flagged = !note.rest && FLAGS[note.type];
      if (flagged && current && (current.beat === beat || (inTuplet >= 0 && current.tuplet === inTuplet))) {
        current.members.push(i);
      } else {
        if (current) groups.push(current.members);
        current = flagged ? { beat, tuplet: inTuplet, members: [i] } : null;
      }
    });
    if (current) groups.push(current.members);
    return groups.filter((members) => members.length > 1);
  }

  // Tuplet groups: [first, last, level] note indices; level 2 is a tuplet inside a tuplet.
  function tupletGroups(notes) {
    const groups = [];
    for (const [name, level] of [['tuplet', 1], ['tuplet2', 2]]) {
      let first = null;
      notes.forEach((note, i) => {
        if (note[`${name}Start`]) first = i;
        if (note[`${name}Stop`] && first !== null) {
          groups.push([first, i, level]);
          first = null;
        }
      });
    }
    return groups;
  }

  // Everything needed to space and draw one measure.
  function measureInfo(measure, index, prev) {
    const changes = {
      clef: !prev || prev.endClef !== measure.clef,
      key: !prev || prev.key.fifths !== measure.key.fifths || prev.key.mode !== measure.key.mode,
      time: !prev || prev.time[0] !== measure.time[0] || prev.time[1] !== measure.time[1] || prev.timeSymbol !== measure.timeSymbol,
    };
    const accidentals = shownAccidentals(measure.notes, measure.key);
    // A clef change inside the measure applies from its note on.
    let clef = measure.clef;
    const notes = measure.notes.map((note, i) => {
      const clefChange = note.clef && note.clef !== clef ? note.clef : null;
      if (clefChange) clef = clefChange;
      const pos = note.rest ? null : position(note.pitch, clef);
      const stem = stemOf(note, pos);
      // Where the stem ends, in steps: flags of short notes need a longer stem.
      const length = STEM + Math.max(0, (FLAGS[note.type] ?? 0) - 1);
      return { note, pos, stem, stemEnd: stem ? pos + stem * length : null, beam: null, accidental: accidentals[i], clefChange };
    });

    // A beam group takes one stem direction (from the note furthest from the middle line) and level stems
    // reaching past the furthest head.
    const beams = beamGroups(measure.notes, measure.time).map((members) => {
      const items = members.map((i) => notes[i]);
      const far = items.reduce((a, b) => (Math.abs(b.pos - MIDDLE) > Math.abs(a.pos - MIDDLE) ? b : a));
      const dir = far.pos >= MIDDLE ? -1 : 1;
      const levels = Math.max(...items.map((item) => FLAGS[item.note.type]));
      const reach = dir === 1 ? Math.max(...items.map((item) => item.pos)) : Math.min(...items.map((item) => item.pos));
      const end = reach + dir * (STEM + (levels - 1) * 1);
      items.forEach((item) => Object.assign(item, { stem: dir, stemEnd: end, beam: members }));
      return { members, dir, end, levels };
    });

    for (const item of notes) {
      const left = (item.accidental !== null ? MIN.accidental * (Math.abs(item.accidental) === 2 ? 1.2 : 1) : 0)
        + (item.clefChange ? SMALL_CLEF : 0);
      const head = item.note.rest ? MIN.rest : item.note.type === 'whole' ? MIN.whole : MIN.head;
      let right = (item.note.dots ?? 0) * MIN.dot;
      if (FLAGS[item.note.type] && !item.beam && item.stem === 1) right = Math.max(right, MIN.flag);
      item.parts = { left, head, right };
      item.min = left + head + right + MIN.gap;
    }
    const min = MEASURE_PAD_LEFT + MEASURE_PAD_RIGHT + notes.reduce((sum, n) => sum + n.min, 0);
    return { ...measure, index, changes, notes, beams, tuplets: tupletGroups(measure.notes), min, prevKey: prev?.key };
  }

  // Width of what goes before a measure's notes: a mid-row clef, key and time change.
  function prefixWidth(info, rowStart) {
    let width = 0;
    if (rowStart) {
      width += CLEF_WIDTH + keySigns(info.key, info.clef, info.changes.key ? info.prevKey : undefined).length * KEY_STEP;
    } else {
      if (info.changes.clef) width += SMALL_CLEF;
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
      for (const { pos, stemEnd } of info.notes) {
        if (pos === null) continue;
        up = Math.max(up, pos + 1, (stemEnd ?? pos) + 1);
        down = Math.min(down, pos - 1, (stemEnd ?? pos) - 1);
      }
    }
    // Tuplet numbers and ties sit a little beyond the stems or heads.
    const nested = row.some((info) => info.tuplets.some((t) => t[2] === 2));
    const extra = (row.some((info) => info.tuplets.length || info.notes.some((n) => n.note.tie)) ? 2 : 0) + (nested ? 2 : 0);
    return { up: up + extra, down: down - extra };
  }

  function drawSigns(parent, signs, x, yOf) {
    signs.forEach((sign, i) => {
      parent.append(svgEl('text', {
        x: x + i * KEY_STEP + KEY_STEP - 1, y: yOf(sign.pos) + 5, class: 'sv-accidental sv-key', 'data-alter': sign.alter, 'data-pos': sign.pos,
      }, SIGNS[sign.alter]));
    });
    return signs.length * KEY_STEP;
  }

  // A clef at x. G and F clefs are font glyphs (treble: the curl on the G line, position 2; bass: the dots around the
  // F line, position 6), with a small 8 below or above for an octave clef. The C clef (alto, tenor) is drawn: two bars
  // and two curves meeting on its C line. Small: a change inside a row. Returns the width it takes.
  function drawClef(parent, clef, x, yOf, small) {
    const info = CLEF_INFO[clef];
    const group = svgEl('g', { class: `sv-clef-group${small ? ' is-small' : ''}`, 'data-clef': clef });
    parent.append(group);
    const scale = small ? 0.72 : 1;
    if (info.shape === 'C') {
      const cy = yOf(info.line);
      const h = 4 * HALF * scale;
      const w = 22 * scale;
      group.append(svgEl('rect', { x, y: cy - h, width: 4.5 * scale, height: 2 * h, class: 'sv-fill sv-clef-c' }));
      group.append(svgEl('rect', { x: x + 6.5 * scale, y: cy - h, width: 1.6 * scale, height: 2 * h, class: 'sv-fill sv-clef-c' }));
      for (const dir of [-1, 1]) {
        const tip = cy + dir * h;
        group.append(svgEl('path', {
          d: `M${x + 8 * scale} ${cy} L${x + 11 * scale} ${cy + dir * 4 * scale}`
            + ` C${x + 14 * scale} ${cy + dir * 9 * scale} ${x + w} ${cy + dir * 6 * scale} ${x + w} ${cy + dir * (h * 0.55)}`
            + ` C${x + w} ${tip - dir * 2 * scale} ${x + 15 * scale} ${tip + dir * 1.5 * scale} ${x + 12 * scale} ${tip - dir * 4 * scale}`,
          class: 'sv-clef-c-curve',
        }));
        group.append(svgEl('circle', { cx: x + 13.5 * scale, cy: tip - dir * 5 * scale, r: 2.6 * scale, class: 'sv-fill sv-clef-c' }));
      }
    } else {
      const y = info.shape === 'G' ? yOf(0) + 2 : yOf(4) + 23;
      group.append(svgEl('text', { x, y, class: `staff-clef sv-clef${small ? ' is-small' : ''}`, 'data-clef': clef }, CLEF_GLYPH[info.shape]));
      if (info.octave) {
        // The 8 under (or over) the clef's middle, just clear of the staff.
        const y8 = info.octave < 0 ? yOf(info.shape === 'G' ? -4 : -1) + 4 : yOf(info.shape === 'G' ? 12 : 10) - 1;
        group.append(svgEl('text', { x: x + (small ? 9 : 13), y: y8, class: 'sv-clef-octave', 'data-octave': info.octave }, '8'));
      }
    }
    return small ? SMALL_CLEF : CLEF_WIDTH;
  }

  // A time signature as numbers, or C (common time) / ¢ (cut time) when the score writes it so.
  function drawTime(parent, time, x, yOf, symbol) {
    const cx = x + TIME_WIDTH / 2;
    if (symbol) {
      const group = svgEl('g', { class: 'sv-time-symbol', 'data-time': `${time[0]}/${time[1]}`, 'data-symbol': symbol });
      parent.append(group);
      group.append(svgEl('path', {
        d: `M${cx + 7} ${yOf(6) + 1} C${cx + 4} ${yOf(7.5)} ${cx - 8} ${yOf(7)} ${cx - 8} ${yOf(4)}`
          + ` C${cx - 8} ${yOf(1)} ${cx + 4} ${yOf(0.5)} ${cx + 7} ${yOf(2) - 1}`,
        class: 'sv-time-c',
      }));
      if (symbol === 'cut') group.append(svgEl('line', { x1: cx, x2: cx, y1: yOf(9), y2: yOf(-1), class: 'sv-stem sv-time-cut' }));
      return TIME_WIDTH;
    }
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
    if (note.type === 'quarter') {
      parent.append(svgEl('path', {
        d: `M${x - 1} ${y - 14} L${x + 4.5} ${y - 7.5} L${x - 0.5} ${y - 2} L${x + 4.5} ${y + 4.5}`
          + ` C${x - 3} ${y + 1} ${x - 3} ${y + 8} ${x + 1.5} ${y + 11}`,
        class: 'sv-rest',
      }));
      return;
    }
    // Eighth to 64th rests: a slanted stem with one to four hooks.
    const hooks = FLAGS[note.type];
    const top = y - 6 - (hooks - 1) * 4;
    const bottom = y + 9 + (hooks > 2 ? 4 : 0) + (hooks > 3 ? 4 : 0);
    parent.append(svgEl('line', { x1: x + 4 + (hooks - 1) * 1.5, y1: top, x2: x - 1, y2: bottom, class: 'sv-rest-stem' }));
    for (let k = 0; k < hooks; k++) {
      const hy = top + k * 8;
      const hx = x + 4 + (hooks - 1) * 1.5 - k * 2;
      parent.append(svgEl('circle', { cx: hx - 6, cy: hy + 1.5, r: 2.6, class: 'sv-fill sv-rest-hook' }));
      parent.append(svgEl('path', { d: `M${hx - 6} ${hy + 3} Q${hx - 2} ${hy + 4} ${hx} ${hy}`, class: 'sv-rest-curl' }));
    }
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
      for (let d = 0; d < (note.dots ?? 0); d++) {
        group.append(svgEl('circle', { cx: x + 10 + d * 6, cy: yOf(MIDDLE + 1), r: 2, class: 'sv-fill sv-dot' }));
      }
      return { x, y: yOf(MIDDLE), stem: 0 };
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
    if (!stem) return { x, y, stem: 0 };
    const stemX = x + stem * STEM_DX;
    const end = yOf(item.stemEnd);
    group.dataset.stem = stem === 1 ? 'up' : 'down';
    group.append(svgEl('line', { x1: stemX, x2: stemX, y1: y - stem, y2: end, class: 'sv-stem' }));
    if (FLAGS[note.type] && !item.beam) drawFlags(group, stemX, end, stem, FLAGS[note.type]);
    return { x, y, stem, stemX, end };
  }

  // Beams: one across the group, then for 16ths and 32nds a further beam between neighbours that both have it,
  // or a short stub on a lone one (pointing to the neighbour it belongs with).
  function drawBeams(parent, info, drawn) {
    for (const beam of info.beams) {
      const group = svgEl('g', { class: 'sv-beam-group', 'data-levels': beam.levels, 'data-size': beam.members.length });
      parent.append(group);
      const stems = beam.members.map((i) => drawn[i]);
      const level = (i) => FLAGS[info.notes[i].note.type];
      for (let L = 1; L <= beam.levels; L++) {
        const y = stems[0].end + beam.dir * (L - 1) * BEAM_GAP - (beam.dir === 1 ? 0 : BEAM);
        const rect = (x1, x2) => group.append(svgEl('rect', {
          x: Math.min(x1, x2) - 0.7, y, width: Math.abs(x2 - x1) + 1.4, height: BEAM, class: 'sv-fill sv-beam', 'data-level': L,
        }));
        if (L === 1) {
          rect(stems[0].stemX, stems[stems.length - 1].stemX);
          continue;
        }
        beam.members.forEach((m, k) => {
          if (level(m) < L) return;
          const next = beam.members[k + 1];
          const prev = beam.members[k - 1];
          if (next !== undefined && level(next) >= L) rect(stems[k].stemX, stems[k + 1].stemX);
          else if ((prev === undefined || level(prev) < L) && (next === undefined || level(next) < L)) {
            // A lone short note: a stub towards the following note, or back towards the previous one at the end.
            const toward = next !== undefined ? 1 : -1;
            rect(stems[k].stemX, stems[k].stemX + toward * 8);
          }
        });
      }
    }
  }

  // Tuplets: the number (3, 5, ...) on the stem side; a bracket too unless the group is exactly one beam group. A
  // group holding an inner tuplet sits one level further out than the inner one.
  function drawTuplets(parent, info, drawn, yOf) {
    for (const [first, last, level] of info.tuplets) {
      const items = drawn.slice(first, last + 1);
      const stems = items.filter((d) => d.stem);
      const above = !stems.length || stems.filter((d) => d.stem === 1).length * 2 >= stems.length;
      const ends = items.map((d) => (d.stem ? d.end : d.y));
      const holdsInner = level === 1 && info.tuplets.some(([f, l, lv]) => lv === 2 && f >= first && l <= last);
      const out = holdsInner ? 13 : 0;
      const y = above ? Math.min(...ends, yOf(TOP_LINE)) - 8 - out : Math.max(...ends, yOf(0)) + 14 + out;
      const x1 = items[0].x - 5;
      const x2 = items[items.length - 1].x + 5;
      const mid = (x1 + x2) / 2;
      const note = info.notes[first].note;
      const ratio = level === 2 ? note.tuplet2 : note.tuplet;
      const group = svgEl('g', { class: 'sv-tuplet', 'data-actual': ratio.actual, 'data-level': level });
      parent.append(group);
      group.append(svgEl('text', { x: mid, y: y + 4, class: 'sv-tuplet-number' }, String(ratio.actual)));
      const beamed = !holdsInner && info.beams.some((b) => b.members[0] === first && b.members[b.members.length - 1] === last);
      if (!beamed) {
        const hook = above ? 4 : -4;
        group.append(svgEl('path', {
          d: `M${x1} ${y + hook} L${x1} ${y} L${mid - 6} ${y} M${mid + 6} ${y} L${x2} ${y} L${x2} ${y + hook}`, class: 'sv-tuplet-bracket',
        }));
      }
    }
  }

  // A tie: a curve from one head to the next, on the side away from the stems. When the row breaks between them,
  // each row draws its half (to the row's end, or from the start of its first measure).
  function drawTie(parent, from, to, side) {
    const y = (from ?? to).y + side * 7;
    const x1 = from ? from.x + 5 : to.x - 22;
    const x2 = to ? to.x - 5 : from.x + 22;
    const bend = side * 7;
    parent.append(svgEl('path', {
      d: `M${x1} ${y} Q${(x1 + x2) / 2} ${y + bend * 1.6} ${x2} ${y} Q${(x1 + x2) / 2} ${y + bend * 1.2} ${x1} ${y} Z`,
      class: 'sv-fill sv-tie', 'data-half': from && to ? '' : from ? 'start' : 'end',
    }));
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
    if ((r > 0 || options.numberFirst) && first.numbered !== false) {
      svg.append(svgEl('text', { x: STAFF_LEFT, y: 10, class: 'sv-number' }, String(first.number)));
    }

    let x = STAFF_LEFT;
    const rowNotes = [];
    row.forEach((info, k) => {
      const group = svgEl('g', { class: 'sv-measure', 'data-measure': info.index, 'data-number': info.number });
      svg.append(group);
      const xStart = x;
      if (k === 0) {
        x += drawClef(group, info.clef, x + 2, yOf, false);
        // At a row start a key change shows its cancelling naturals too.
        x += drawSigns(group, keySigns(info.key, info.clef, info.changes.key ? info.prevKey : undefined), x, yOf);
      } else {
        if (info.changes.clef) x += drawClef(group, info.clef, x + 2, yOf, true);
        if (info.changes.key) x += drawSigns(group, keySigns(info.key, info.clef, info.prevKey), x, yOf) + 4;
      }
      if (info.changes.time) x += drawTime(group, info.time, x, yOf, info.timeSymbol);

      group.dataset.x0 = x;
      group.dataset.x1 = x + widths[k];
      const sizes = distribute(widths[k] - MEASURE_PAD_LEFT - MEASURE_PAD_RIGHT, info.notes.map((n) => n.min),
        info.notes.map((n) => N.toNumber(N.duration(n.note))));
      let nx = x + MEASURE_PAD_LEFT;
      const drawn = info.notes.map((item, i) => {
        if (item.clefChange) drawClef(group, item.clefChange, nx + 1, yOf, true);
        const result = drawNote(group, item, nx + item.parts.left + item.parts.head / 2, yOf);
        nx += sizes[i];
        return result;
      });
      drawBeams(group, info, drawn);
      drawTuplets(group, info, drawn, yOf);
      rowNotes.push(...drawn.map((d, i) => ({ ...d, note: info.notes[i].note, pos: info.notes[i].pos })));
      x += widths[k];
      if (options.numberAll && k > 0 && info.numbered !== false) {
        group.append(svgEl('text', { x: xStart + 2, y: 10, class: 'sv-number' }, String(info.number)));
      }
      // The strip: a highlight behind the chosen measures, and a press area over each whole measure.
      const chosen = options.selected && info.index >= options.selected.start && info.index <= options.selected.end;
      const pending = options.pending === info.index;
      if (chosen || pending) {
        svg.prepend(svgEl('rect', {
          x: xStart + 1, y: yOf(TOP_LINE) - 12, width: x - xStart - 2, height: yOf(0) - yOf(TOP_LINE) + 24, rx: 6,
          class: pending ? 'sv-pending' : 'sv-current', 'data-measure': info.index,
        }));
      }
      if (options.hit) {
        group.append(svgEl('rect', { x: xStart, y: 0, width: x - xStart, height, class: 'sv-hit', 'data-measure': info.index }));
      }
      const final = last && k === row.length - 1;
      svg.append(svgEl('line', { x1: x - (final ? 4 : 0), x2: x - (final ? 4 : 0), y1: yOf(TOP_LINE), y2: yOf(0), class: 'sv-bar' }));
      if (final) svg.append(svgEl('rect', { x: x - 2.5, y: yOf(TOP_LINE), width: 3, height: yOf(0) - yOf(TOP_LINE), class: 'sv-bar-end' }));
    });

    const ties = svgEl('g', { class: 'sv-ties' });
    svg.append(ties);
    const starts = (n) => n.tie === 'start' || n.tie === 'both';
    const stops = (n) => n.tie === 'stop' || n.tie === 'both';
    // side: +1 draws below the heads (y grows downwards), -1 above. Away from the stem.
    const sideOf = (d) => (d.stem ? d.stem : d.pos >= MIDDLE ? -1 : 1);
    rowNotes.forEach((d, i) => {
      if (i === 0 && stops(d.note)) drawTie(ties, null, d, sideOf(d));
      if (!starts(d.note)) return;
      const next = rowNotes[i + 1];
      drawTie(ties, d, next ?? null, sideOf(d));
    });
    return { svg, width: end + RIGHT_PAD, height };
  }

  // A score in one row that scrolls sideways (the box does), every measure numbered. For choosing measures
  // (options.hit: a press area over each, the selected ones highlighted, a pending start marked) and for the
  // answer section. Sized by a fixed height (px) or a scale (px per unit). Returns the SVG.
  // options: { height | scale, hit, selected: { start, end }, pending (index), label }
  function strip(container, score, options = {}) {
    const measures = N.resolve(score);
    const infos = measures.map((measure, i) => measureInfo(measure, i, i ? measures[i - 1] : null));
    const natural = STAFF_LEFT + RIGHT_PAD + infos.reduce((sum, info, k) => sum + info.min * 1.25 + prefixWidth(info, k === 0), 0);
    const { svg, width, height } = drawRow(infos, 0, natural, true, 0, {
      numberFirst: true, numberAll: true, hit: options.hit ?? true, selected: options.selected, pending: options.pending,
    });
    const scale = options.scale ?? (options.height ?? 80) / height;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.classList.add('sheet-strip');
    svg.style.width = `${Math.round(width * scale)}px`;
    svg.style.height = `${Math.round(height * scale)}px`;
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', options.label ?? `악보 띠, ${score.title}`);
    container.replaceChildren(svg);
    return svg;
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

  const clefBottom = (clef) => CLEF_INFO[clef].bottom;

  window.Sheet = { draw, strip, shownAccidentals, keySigns, keyAlters, position, drawClef, clefBottom, CLEF_WIDTH };
})();
