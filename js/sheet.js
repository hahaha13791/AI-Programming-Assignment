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
  const RHYTHM_LEFT = 6; // the rhythm staff's line starts a little in from the left
  // The rhythm staff's rows are all the same height (steps above and below the line) so its box never jumps.
  const RHYTHM_UP = 10; // stems (7), a second beam, a tuplet number above
  const RHYTHM_DOWN = 3; // the time signature's lower number, ties below the heads
  const RHYTHM_PAD_TOP = 2;
  const SMALL_CLEF = CLEF_WIDTH * 0.7;
  const MEASURE_PAD_LEFT = 8;
  const MEASURE_PAD_RIGHT = 6;
  const HEAD_RX = 6.5;
  const STEM_DX = 6;
  const BEAM = 4.5; // beam thickness
  const BEAM_GAP = 7; // from one beam to the next
  const MIN = { head: 14, whole: 18, rest: 12, accidental: 12, dot: 7, flag: 8, gap: 3 };
  // Repeat signs: room for a repeat barline (thick, thin, dots), the bands above the staff for marks (segno, coda,
  // D.C. …) and for ending brackets, in steps, and the bracket's hook.
  const REPEAT_W = 12;
  const MARK_BAND = 3;
  const ENDING_BAND = 3;
  const ENDING_HOOK = 14;
  const MARK_CHAR = 6.5; // about the width of a mark's letter
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

  // Standard accidentals within a measure: a sign only where a pitch differs from what its line/space already
  // means (the key signature, or an earlier accidental on the same line/space in this measure). A pitch tied over
  // from the previous measure gets none. Returns per note, per pitch (N.pitchesOf order): an alter to show, or null.
  function headAccidentals(notes, key) {
    const fromKey = keyAlters(key);
    const state = {};
    return notes.map((note, i) => N.pitchesOf(note).map(({ pitch, tie }) => {
      const name = `${pitch.step}${pitch.octave}`;
      const expected = state[name] ?? fromKey[pitch.step] ?? 0;
      // A pitch tied over the barline shows nothing, and its accidental doesn't carry on to later notes.
      if (i === 0 && N.tieStops(tie)) return null;
      state[name] = pitch.alter;
      return pitch.alter === expected ? null : pitch.alter;
    }));
  }

  // The written pitch's accidental per note (null for none or a rest).
  function shownAccidentals(notes, key) {
    return headAccidentals(notes, key).map((list) => list[0] ?? null);
  }

  function svgEl(name, attrs, text) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const FLAGS = { eighth: 1, '16th': 2, '32nd': 3, '64th': 4 };
  const OPEN = { whole: true, half: true };

  // The head furthest from the middle line decides the stem: on or above the middle line, down; below, up.
  const farHead = (top, bottom) => (top - MIDDLE >= MIDDLE - bottom ? top : bottom);
  function stemOf(note, top, bottom) {
    if (note.rest || note.type === 'whole') return 0;
    return farHead(top, bottom) >= MIDDLE ? -1 : 1;
  }

  const HEAD_W = 2 * HEAD_RX - 1; // a head set to the other side of the stem (a second in a chord)
  // Grace notes are drawn at this size, with these widths.
  const GRACE_SCALE = 0.65;
  const GRACE_STEM = 5; // steps
  const GRACE = { head: 10, accidental: 8, flag: 6, gap: 2 };

  // A chord's heads, low to high, with the side each goes (a second puts one head on the other side of the stem:
  // the upper one to the right with the stem up, the lower one to the left with it down), and the column of each
  // accidental counted out from the heads (signs closer than a sixth apart take another column).
  function layoutHeads(heads, stem) {
    const up = stem !== -1;
    const order = up ? heads : [...heads].reverse();
    order.forEach((head, k) => {
      const prev = order[k - 1];
      head.offset = prev && !prev.offset && Math.abs(head.pos - prev.pos) === 1 ? (up ? 1 : -1) : 0;
    });
    const columns = [];
    for (const head of [...heads].reverse().filter((h) => h.accidental !== null)) {
      let col = columns.findIndex((list) => list.every((pos) => Math.abs(pos - head.pos) >= 6));
      if (col < 0) {
        col = columns.length;
        columns.push([]);
      }
      columns[col].push(head.pos);
      head.column = col;
    }
    return columns.length;
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
      if (note.grace) return; // grace notes are beamed among themselves (graceBeams)
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

  // Grace notes in a row with flags share a small beam: arrays of note indices, two or more each.
  function graceGroups(notes) {
    const groups = [];
    let current = [];
    notes.forEach((note, i) => {
      if (note.grace && FLAGS[note.type]) {
        current.push(i);
        return;
      }
      if (current.length > 1) groups.push(current);
      current = [];
    });
    if (current.length > 1) groups.push(current);
    return groups;
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

  // A measure of nothing but rests, filling its time: drawn as one whole rest in its middle, in any time (the usual
  // measure rest). Not a short measure, nor one with a tuplet or a clef change in it.
  function isMeasureRest(measure, length) {
    return measure.notes.every((n) => n.rest && !n.tuplet && !n.clef)
      && N.cmp(length, N.measureLength(measure.time)) === 0;
  }

  // Everything needed to space and draw one measure.
  // exact: every rest as written (the editor, where each can be chosen), no measure rest.
  // rhythm: the one-line rhythm staff (every note on the line, stems up, no clef or key, rests as written).
  function measureInfo(measure, index, prev, exact = false, rhythm = false) {
    const length = N.filled(measure.notes); // what it holds, for its share of the row
    const measureRest = !exact && !rhythm && isMeasureRest(measure, length);
    if (measureRest) measure = { ...measure, notes: [{ type: 'whole', dots: 0, rest: true }] };
    const changes = rhythm ? {
      clef: false, key: false, time: !measure.hideTime && (!prev || prev.time[0] !== measure.time[0] || prev.time[1] !== measure.time[1]),
    } : {
      clef: !prev || prev.endClef !== measure.clef,
      key: !prev || prev.key.fifths !== measure.key.fifths || prev.key.mode !== measure.key.mode,
      time: !prev || prev.time[0] !== measure.time[0] || prev.time[1] !== measure.time[1] || prev.timeSymbol !== measure.timeSymbol,
    };
    const accidentals = headAccidentals(measure.notes, measure.key);
    // A clef change inside the measure applies from its note on.
    let clef = measure.clef;
    const notes = measure.notes.map((note, i) => {
      const clefChange = note.clef && note.clef !== clef ? note.clef : null;
      if (clefChange) clef = clefChange;
      if (note.rest) return { note, pos: null, top: null, bottom: null, heads: [], stem: 0, stemEnd: null, beam: null, accidental: null, clefChange };
      const heads = N.pitchesOf(note).map(({ pitch, tie }, h) => ({
        pitch, tie, pos: rhythm ? MIDDLE : position(pitch, clef), accidental: rhythm ? null : accidentals[i][h], written: h === 0, index: h,
      })).sort((a, b) => a.pos - b.pos);
      const top = heads[heads.length - 1].pos;
      const bottom = heads[0].pos;
      // Grace notes: small, stems always up, short.
      if (note.grace) {
        const written = heads.find((h) => h.written);
        return {
          note, heads, top, bottom, pos: written.pos, stem: 1, stemEnd: top + GRACE_STEM + Math.max(0, (FLAGS[note.type] ?? 0) - 1) * 0.7,
          beam: null, accidental: written.accidental, clefChange, grace: true,
        };
      }
      const stem = rhythm ? (note.type === 'whole' ? 0 : 1) : stemOf(note, top, bottom);
      // Where the stem ends, in steps: flags of short notes need a longer stem.
      const length = STEM + Math.max(0, (FLAGS[note.type] ?? 0) - 1);
      const written = heads.find((h) => h.written);
      return {
        note, heads, top, bottom, pos: written.pos, stem, stemEnd: stem === 1 ? top + length : stem === -1 ? bottom - length : null,
        beam: null, accidental: written.accidental, clefChange,
      };
    });

    // A beam group takes one stem direction (from the head furthest from the middle line) and level stems
    // reaching past the furthest head.
    const beams = beamGroups(measure.notes, measure.time).map((members) => {
      const items = members.map((i) => notes[i]);
      const distance = (item) => Math.abs(farHead(item.top, item.bottom) - MIDDLE);
      const far = items.reduce((a, b) => (distance(b) > distance(a) ? b : a));
      const dir = rhythm || farHead(far.top, far.bottom) < MIDDLE ? 1 : -1;
      const levels = Math.max(...items.map((item) => FLAGS[item.note.type]));
      const reach = dir === 1 ? Math.max(...items.map((item) => item.top)) : Math.min(...items.map((item) => item.bottom));
      const end = reach + dir * (STEM + (levels - 1) * 1);
      items.forEach((item) => Object.assign(item, { stem: dir, stemEnd: end, beam: members }));
      return { members, dir, end, levels };
    });

    // Grace beams: one level stem end for the group.
    const graceBeams = graceGroups(measure.notes).map((members) => {
      const items = members.map((i) => notes[i]);
      const levels = Math.max(...items.map((item) => FLAGS[item.note.type]));
      const end = Math.max(...items.map((item) => item.top)) + GRACE_STEM + (levels - 1) * 0.7;
      items.forEach((item, k) => Object.assign(item, { stemEnd: end, beam: members, beamFirst: k === 0 }));
      return { members, dir: 1, end, levels, grace: true };
    });

    for (const item of notes) {
      const columns = layoutHeads(item.heads, item.stem);
      if (item.grace) {
        const rightHead = item.heads.some((h) => h.offset === 1);
        const left = columns * GRACE.accidental + (item.clefChange ? SMALL_CLEF : 0);
        const right = (FLAGS[item.note.type] && !item.beam ? GRACE.flag : 0) + (rightHead ? GRACE.head : 0);
        item.parts = { left, head: GRACE.head, right };
        item.min = left + GRACE.head + right + GRACE.gap;
        continue;
      }
      const doubles = item.heads.some((h) => h.accidental !== null && Math.abs(h.accidental) === 2);
      const leftHead = item.heads.some((h) => h.offset === -1);
      const rightHead = item.heads.some((h) => h.offset === 1);
      const left = columns * MIN.accidental * (doubles ? 1.2 : 1) + (leftHead ? HEAD_W : 0) + (item.clefChange ? SMALL_CLEF : 0);
      const head = item.note.rest ? MIN.rest : item.note.type === 'whole' ? MIN.whole : MIN.head;
      let right = (item.note.dots ?? 0) * MIN.dot + (rightHead ? HEAD_W : 0);
      if (FLAGS[item.note.type] && !item.beam && item.stem === 1) right = Math.max(right, MIN.flag + (rightHead ? HEAD_W : 0));
      item.parts = { left, head, right };
      item.min = left + head + right + MIN.gap;
    }
    const leftExtra = measure.repeatStart ? REPEAT_W : 0;
    const rightExtra = measure.repeatEnd ? REPEAT_W : measure.barline ? 4 : 0;
    let min = MEASURE_PAD_LEFT + MEASURE_PAD_RIGHT + leftExtra + rightExtra + notes.reduce((sum, n) => sum + n.min, 0);
    // Marks are written above the measure and kept within it.
    if (measure.marks) min = Math.max(min, 6 + measure.marks.reduce((sum, mark) => sum + markWidth(mark), 0));
    return {
      ...measure, index, changes, notes, beams, graceBeams, tuplets: tupletGroups(measure.notes), min, prevKey: prev?.key,
      leftExtra, rightExtra, length, measureRest, rhythm,
    };
  }

  // Width of what goes before a measure's notes: a mid-row clef, key and time change.
  function prefixWidth(info, rowStart) {
    let width = 0;
    if (info.rhythm) {
      if (rowStart) width += RHYTHM_LEFT;
    } else if (rowStart) {
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
    if (row[0]?.rhythm) return { up: MIDDLE + RHYTHM_UP, down: MIDDLE - RHYTHM_DOWN, noteUp: MIDDLE + RHYTHM_UP };
    let up = TOP_LINE + 2;
    let down = -2;
    for (const info of row) {
      for (const { top, bottom, stemEnd } of info.notes) {
        if (top === null) continue;
        up = Math.max(up, top + 1, (stemEnd ?? top) + 1);
        down = Math.min(down, bottom - 1, (stemEnd ?? bottom) - 1);
      }
    }
    // Tuplet numbers and ties sit a little beyond the stems or heads.
    const nested = row.some((info) => info.tuplets.some((t) => t[2] === 2));
    const tied = (n) => n.heads.some((h) => h.tie);
    const extra = (row.some((info) => info.tuplets.length || info.notes.some(tied)) ? 2 : 0) + (nested ? 2 : 0);
    // Above them, a band for marks and one for ending brackets, when the row has any.
    const marks = row.some((info) => info.marks);
    const endings = row.some((info) => info.ending);
    const noteUp = up + extra;
    return { up: noteUp + (marks ? MARK_BAND : 0) + (endings ? ENDING_BAND : 0), down: down - extra, noteUp };
  }

  // ---- repeat signs ----
  function markWidth(mark) {
    return mark.kind === 'text' ? mark.text.length * MARK_CHAR + 4 : 18;
  }

  // Barlines of measure k: a repeat start at its beginning (after any clef, key or time change: x0), and at its end
  // (x) a repeat end, a final or double barline or a plain one. A plain barline before a repeat start is left out,
  // and back-to-back repeats share the thick line.
  function drawBarlines(svg, row, k, xStart, x0, x, final, yOf) {
    const info = row[k];
    const top = info.rhythm ? yOf(MIDDLE + 1.5) : yOf(TOP_LINE);
    const bottom = info.rhythm ? yOf(MIDDLE - 1.5) : yOf(0);
    if (info.rhythm) final = false;
    const group = (side) => {
      const g = svgEl('g', { class: 'sv-barline', 'data-measure': info.index, 'data-side': side });
      svg.append(g);
      return g;
    };
    const thin = (g, at) => g.append(svgEl('line', { x1: at, x2: at, y1: top, y2: bottom, class: 'sv-bar' }));
    const thick = (g, at) => g.append(svgEl('rect', { x: at - 1.5, y: top, width: 3, height: bottom - top, class: 'sv-bar-end' }));
    const dots = (g, at) => {
      for (const pos of [3, 5]) g.append(svgEl('circle', { cx: at, cy: yOf(pos), r: 1.9, class: 'sv-fill sv-repeat-dot' }));
    };
    if (info.repeatStart) {
      const g = group('start');
      g.dataset.kind = 'repeat';
      const shared = k > 0 && x0 === xStart && row[k - 1].repeatEnd;
      if (!shared) thick(g, x0 + 1.5);
      thin(g, x0 + (shared ? 2 : 5.5));
      dots(g, x0 + (shared ? 6 : 9.5));
    }
    const next = row[k + 1];
    const nextOpens = next && next.repeatStart && prefixWidth(next, false) === 0;
    const g = group('end');
    if (info.repeatEnd) {
      g.dataset.kind = 'repeat';
      dots(g, x - 9.5);
      thin(g, x - 5.5);
      thick(g, x - 1.5);
    } else if (final || info.barline === 'final') {
      g.dataset.kind = 'final';
      thin(g, x - 4);
      thick(g, x - 1);
    } else if (info.barline === 'double') {
      g.dataset.kind = 'double';
      thin(g, x - 3.5);
      thin(g, x);
    } else if (!nextOpens) {
      g.dataset.kind = 'plain';
      thin(g, x);
    }
  }

  // An ending bracket over the measure (left..right), with its hook and text on its first measure and a closing hook
  // on its last. One running on to the next row starts again there with no hook.
  function drawEnding(svg, info, left, right, y) {
    const { text, start, end } = info.ending;
    const x1 = left + (start ? 3 : 0);
    const x2 = right - (end === 'stop' ? 4 : 0);
    let d = start ? `M${x1} ${y + ENDING_HOOK} L${x1} ${y}` : `M${x1} ${y}`;
    d += ` L${x2} ${y}`;
    if (end === 'stop') d += ` L${x2} ${y + ENDING_HOOK}`;
    const g = svgEl('g', { class: 'sv-ending', 'data-measure': info.index, 'data-text': text });
    g.append(svgEl('path', { d, class: 'sv-ending-line' }));
    if (start) g.append(svgEl('text', { x: x1 + 4, y: y + 12, class: 'sv-ending-text' }, text));
    svg.append(g);
  }

  // Segno, coda and words above the measure: those at its start from the left, those at its end from the right.
  function drawMarks(svg, info, left, right, base) {
    const g = svgEl('g', { class: 'sv-marks', 'data-measure': info.index });
    let sx = left + 3;
    for (const mark of info.marks.filter((m) => m.at === 'start')) {
      drawMark(g, mark, sx, base, 'start');
      sx += markWidth(mark);
    }
    let ex = right - 3;
    for (const mark of info.marks.filter((m) => m.at === 'end').reverse()) {
      drawMark(g, mark, ex, base, 'end');
      ex -= markWidth(mark);
    }
    svg.append(g);
  }

  function drawMark(g, mark, x, base, side) {
    if (mark.kind === 'text') {
      g.append(svgEl('text', { x, y: base, class: 'sv-mark-text', 'text-anchor': side, 'data-kind': 'text' }, mark.text));
      return;
    }
    const cx = side === 'end' ? x - 8 : x + 8;
    const cy = base - 6;
    const sign = svgEl('g', { class: `sv-sign sv-${mark.kind}`, 'data-kind': mark.kind });
    if (mark.kind === 'coda') {
      sign.append(svgEl('ellipse', { cx, cy, rx: 4.5, ry: 5.5, class: 'sv-sign-line' }));
      sign.append(svgEl('path', { d: `M${cx - 8} ${cy} L${cx + 8} ${cy} M${cx} ${cy - 8} L${cx} ${cy + 8}`, class: 'sv-sign-line' }));
    } else {
      sign.append(svgEl('path', {
        d: `M${cx + 3.5} ${cy - 4.5} C${cx + 2} ${cy - 8} ${cx - 5} ${cy - 7} ${cx - 3.5} ${cy - 2.5} `
          + `C${cx - 2.5} ${cy} ${cx + 3.5} ${cy} ${cx + 3.5} ${cy + 3} C${cx + 4.5} ${cy + 7} ${cx - 2} ${cy + 8} ${cx - 3.5} ${cy + 4.5}`,
        class: 'sv-sign-line',
      }));
      sign.append(svgEl('path', { d: `M${cx - 6} ${cy + 7} L${cx + 6} ${cy - 7}`, class: 'sv-sign-line' }));
      for (const [dx, dy] of [[-5, 2], [5, -2]]) sign.append(svgEl('circle', { cx: cx + dx, cy: cy + dy, r: 1.3, class: 'sv-fill' }));
    }
    g.append(sign);
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

  // The rhythm staff's time signature: smaller, its numbers above and below the one line.
  function drawRhythmTime(parent, time, x, yOf) {
    const cx = x + TIME_WIDTH / 2;
    const y = yOf(MIDDLE);
    parent.append(svgEl('text', { x: cx, y: y - 3, class: 'sv-time sv-time-rhythm', 'data-time': `${time[0]}/${time[1]}` }, String(time[0])));
    parent.append(svgEl('text', { x: cx, y: y + 17, class: 'sv-time sv-time-rhythm' }, String(time[1])));
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

  function drawRest(parent, note, x, yOf, oneLine = false) {
    if (note.type === 'whole' || note.type === 'half') {
      // Whole rests hang below the fourth line (the rhythm staff: below its line), half rests sit on the middle line.
      const y = note.type === 'whole' ? yOf(oneLine ? MIDDLE : 6) : yOf(4) - 5;
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

  // A grace note: small heads on their staff positions, a short stem up, small flags (a slash across the stem and
  // flag for an acciaccatura), small accidentals.
  function drawGrace(group, item, x, yOf) {
    const { note } = item;
    group.classList.add('is-grace');
    group.dataset.grace = note.slash ? 'slash' : '';
    const rx = HEAD_RX * GRACE_SCALE;
    const headW = 2 * rx - 0.5;
    drawLedgers(group, x, item.top, yOf, 7);
    if (item.bottom !== item.top) drawLedgers(group, x, item.bottom, yOf, 7);
    const heads = item.heads.map((head) => {
      const hx = x + head.offset * headW;
      const hy = yOf(head.pos);
      const midi = N.midi(head.pitch);
      if (head.accidental !== null) {
        group.append(svgEl('text', {
          x: x - rx - 1.5 - head.column * GRACE.accidental, y: hy + 3.5, class: 'sv-accidental is-grace', 'data-accidental': head.accidental, 'data-pos': head.pos,
        }, SIGNS[head.accidental]));
      }
      group.append(svgEl('ellipse', {
        cx: hx, cy: hy, rx, ry: 4.6 * GRACE_SCALE, transform: `rotate(-20 ${hx} ${hy})`,
        class: `${OPEN[note.type] ? 'sv-open' : 'sv-fill'} sv-head`, 'data-pos': head.pos, 'data-midi': midi,
      }));
      return { x: hx, y: hy, pos: head.pos, midi, tie: undefined };
    });
    const y = yOf(item.pos);
    const stemX = x + STEM_DX * GRACE_SCALE;
    const end = yOf(item.stemEnd);
    if (note.type !== 'whole') {
      group.append(svgEl('line', { x1: stemX, x2: stemX, y1: yOf(item.bottom) - 1, y2: end, class: 'sv-stem is-grace' }));
      if (FLAGS[note.type] && !item.beam) {
        const flags = svgEl('g', { transform: `translate(${stemX} ${end}) scale(${GRACE_SCALE}) translate(${-stemX} ${-end})` });
        group.append(flags);
        drawFlags(flags, stemX, end, 1, FLAGS[note.type]);
      }
      // A slash crosses the stem of a lone grace note, or the first stem of a beamed group.
      if (note.slash && (!item.beam || item.beamFirst)) {
        group.append(svgEl('line', { x1: stemX - 5, y1: end + 13, x2: stemX + 7, y2: end + 4, class: 'sv-stem sv-grace-slash' }));
      }
    }
    return { x, y, stem: 1, stemX, end, heads, grace: true };
  }

  function drawNote(parent, item, x, yOf, oneLine = false) {
    const { note, pos, stem, accidental } = item;
    const group = svgEl('g', { class: 'sv-note', 'data-type': note.type });
    parent.append(group);
    if (item.grace) {
      group.dataset.pos = pos;
      group.dataset.midi = N.midi(note.pitch);
      return drawGrace(group, item, x, yOf);
    }
    if (note.rest) {
      group.dataset.rest = '';
      drawRest(group, note, x, yOf, oneLine);
      for (let d = 0; d < (note.dots ?? 0); d++) {
        group.append(svgEl('circle', { cx: x + 10 + d * 6, cy: yOf(MIDDLE + 1), r: 2, class: 'sv-fill sv-dot' }));
      }
      return { x, y: yOf(MIDDLE), stem: 0 };
    }
    // Every head of the note (one, or a chord's), the written pitch's position on the group for a single note.
    const { heads } = item;
    const y = yOf(pos);
    group.dataset.pos = pos;
    group.dataset.midi = N.midi(note.pitch);
    if (heads.length > 1) group.dataset.chord = heads.length;
    const half = note.type === 'whole' ? 12 : 10;
    const leftHead = heads.some((h) => h.offset === -1);
    const rightHead = heads.some((h) => h.offset === 1);
    // Ledger lines reach the furthest heads, wider when a head sits beside the stem on that side.
    drawLedgers(group, x + (rightHead ? HEAD_W / 2 : leftHead ? -HEAD_W / 2 : 0), item.top, yOf, half + (leftHead || rightHead ? HEAD_W / 2 : 0));
    if (item.bottom !== item.top) drawLedgers(group, x + (rightHead ? HEAD_W / 2 : leftHead ? -HEAD_W / 2 : 0), item.bottom, yOf, half + (leftHead || rightHead ? HEAD_W / 2 : 0));
    const drawnHeads = heads.map((head) => {
      const hx = x + head.offset * HEAD_W;
      const hy = yOf(head.pos);
      const midi = N.midi(head.pitch);
      if (head.accidental !== null) {
        const ax = x - HEAD_RX - 2 - (leftHead ? HEAD_W : 0) - head.column * MIN.accidental;
        group.append(svgEl('text', {
          x: ax, y: hy + 5, class: 'sv-accidental', 'data-accidental': head.accidental, 'data-pos': head.pos, 'data-column': head.column,
        }, SIGNS[head.accidental]));
      }
      if (note.type === 'whole') {
        group.append(svgEl('ellipse', { cx: hx, cy: hy, rx: 7.5, ry: 5, class: 'sv-open sv-whole sv-head', 'data-pos': head.pos, 'data-midi': midi, 'data-head': head.index }));
      } else {
        group.append(svgEl('ellipse', {
          cx: hx, cy: hy, rx: HEAD_RX, ry: 4.6, transform: `rotate(-20 ${hx} ${hy})`,
          class: `${OPEN[note.type] ? 'sv-open' : 'sv-fill'} sv-head`, 'data-pos': head.pos, 'data-midi': midi, 'data-head': head.index,
        }));
      }
      for (let d = 0; d < (note.dots ?? 0); d++) {
        // A head on a line puts its dots in the space above.
        const onLine = head.pos % 2 === 0;
        group.append(svgEl('circle', { cx: x + 11 + (rightHead ? HEAD_W : 0) + d * 6, cy: onLine ? hy - HALF : hy, r: 2, class: 'sv-fill sv-dot' }));
      }
      return { x: hx, y: hy, pos: head.pos, midi, tie: head.tie };
    });
    if (!stem) return { x, y, stem: 0, heads: drawnHeads };
    const stemX = x + stem * STEM_DX;
    const end = yOf(item.stemEnd);
    const from = yOf(stem === 1 ? item.bottom : item.top);
    group.dataset.stem = stem === 1 ? 'up' : 'down';
    group.append(svgEl('line', { x1: stemX, x2: stemX, y1: from - stem, y2: end, class: 'sv-stem' }));
    if (FLAGS[note.type] && !item.beam) drawFlags(group, stemX, end, stem, FLAGS[note.type]);
    return { x, y, stem, stemX, end, heads: drawnHeads };
  }

  // Beams: one across the group, then for 16ths and 32nds a further beam between neighbours that both have it,
  // or a short stub on a lone one (pointing to the neighbour it belongs with).
  function drawBeams(parent, info, drawn) {
    for (const beam of [...info.beams, ...info.graceBeams]) {
      const thick = beam.grace ? BEAM * GRACE_SCALE : BEAM;
      const gap = beam.grace ? BEAM_GAP * GRACE_SCALE : BEAM_GAP;
      const group = svgEl('g', { class: `sv-beam-group${beam.grace ? ' is-grace' : ''}`, 'data-levels': beam.levels, 'data-size': beam.members.length });
      parent.append(group);
      const stems = beam.members.map((i) => drawn[i]);
      const level = (i) => FLAGS[info.notes[i].note.type];
      for (let L = 1; L <= beam.levels; L++) {
        const y = stems[0].end + beam.dir * (L - 1) * gap - (beam.dir === 1 ? 0 : thick);
        const rect = (x1, x2) => group.append(svgEl('rect', {
          x: Math.min(x1, x2) - 0.7, y, width: Math.abs(x2 - x1) + 1.4, height: thick, class: 'sv-fill sv-beam', 'data-level': L,
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
            rect(stems[k].stemX, stems[k].stemX + toward * (beam.grace ? 5 : 8));
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
    const { up, down, noteUp } = rowExtent(row);
    const rhythm = Boolean(row[0]?.rhythm);
    const padTop = rhythm ? RHYTHM_PAD_TOP : ROW_PAD_TOP;
    const height = padTop + (up - down) * HALF + ROW_PAD_BOTTOM;
    const yOf = (pos) => padTop + (up - pos) * HALF;
    const svg = svgEl('svg', { class: 'sheet-svg', viewBox: `0 0 ${width} ${height}`, 'data-row': r });
    const first = row[0];

    // Prefixes first, then the measures share what is left.
    const prefixes = row.map((info, k) => prefixWidth(info, k === 0));
    const mins = row.map((info) => info.min);
    let room = width - STAFF_LEFT - RIGHT_PAD - prefixes.reduce((a, b) => a + b, 0);
    // A short last row keeps the measure width of a full row instead of stretching.
    if (short) room *= short;
    // By what each measure holds, so a pickup or a short last measure is drawn shorter.
    // The rhythm staff: by the time signature, so a measure being written (or still empty) keeps its full width.
    const widths = distribute(Math.max(room, mins.reduce((a, b) => a + b, 0)), mins,
      row.map((info) => N.toNumber(rhythm ? N.measureLength(info.time) : info.length)));
    const end = STAFF_LEFT + prefixes.reduce((a, b) => a + b, 0) + widths.reduce((a, b) => a + b, 0);

    if (rhythm) {
      svg.append(svgEl('line', { x1: STAFF_LEFT, x2: end, y1: yOf(MIDDLE), y2: yOf(MIDDLE), class: 'sv-line' }));
    } else {
      for (let line = 0; line <= TOP_LINE; line += 2) {
        svg.append(svgEl('line', { x1: STAFF_LEFT, x2: end, y1: yOf(line), y2: yOf(line), class: 'sv-line' }));
      }
    }
    if (!rhythm && (r > 0 || options.numberFirst) && first.numbered !== false) {
      svg.append(svgEl('text', { x: STAFF_LEFT, y: 10, class: 'sv-number' }, String(first.number)));
    }

    let x = STAFF_LEFT;
    const rowNotes = [];
    row.forEach((info, k) => {
      const group = svgEl('g', { class: 'sv-measure', 'data-measure': info.index, 'data-number': info.number });
      svg.append(group);
      const xStart = x;
      const mark = options.marks?.[info.index];
      if (mark === true || mark === false) group.classList.add(mark ? 'is-correct' : 'is-wrong');
      if (rhythm) {
        if (k === 0) x += RHYTHM_LEFT;
      } else if (k === 0) {
        x += drawClef(group, info.clef, x + 2, yOf, false);
        // At a row start a key change shows its cancelling naturals too.
        x += drawSigns(group, keySigns(info.key, info.clef, info.changes.key ? info.prevKey : undefined), x, yOf);
      } else {
        if (info.changes.clef) x += drawClef(group, info.clef, x + 2, yOf, true);
        if (info.changes.key) x += drawSigns(group, keySigns(info.key, info.clef, info.prevKey), x, yOf) + 4;
      }
      if (info.changes.time) x += rhythm ? drawRhythmTime(group, info.time, x, yOf) : drawTime(group, info.time, x, yOf, info.timeSymbol);

      group.dataset.x0 = x;
      group.dataset.x1 = x + widths[k];
      const x0 = x;
      // The rhythm staff spaces notes by length over the whole measure: what isn't written yet stays empty.
      const spare = rhythm ? N.toNumber(N.sub(N.measureLength(info.time), info.length)) : 0;
      const sizes = distribute(widths[k] - MEASURE_PAD_LEFT - MEASURE_PAD_RIGHT - info.leftExtra - info.rightExtra,
        [...info.notes.map((n) => n.min), ...(spare > 0 ? [0] : [])],
        [...info.notes.map((n) => N.toNumber(N.duration(n.note))), ...(spare > 0 ? [spare] : [])]);
      let nx = x + MEASURE_PAD_LEFT + info.leftExtra;
      const middle = (x + MEASURE_PAD_LEFT + info.leftExtra + x + widths[k] - MEASURE_PAD_RIGHT - info.rightExtra) / 2;
      const drawn = info.notes.map((item, i) => {
        if (item.clefChange) drawClef(group, item.clefChange, nx + 1, yOf, true);
        // The editor: a press area over the note's share of the measure (behind it, so a head can be pressed itself).
        if (options.pick) {
          group.prepend(svgEl('rect', { x: nx, y: 0, width: sizes[i], height, class: 'sv-pick', 'data-measure': info.index, 'data-index': i }));
        }
        const result = drawNote(group, item, info.measureRest ? middle : nx + item.parts.left + item.parts.head / 2, yOf, rhythm);
        const noteGroup = group.lastElementChild;
        noteGroup.dataset.index = i;
        if (info.measureRest) noteGroup.dataset.measureRest = '';
        const cursor = options.cursor;
        if (cursor && cursor.measure === info.index && cursor.note === i) {
          noteGroup.classList.add('is-cursor');
          noteGroup.querySelector(`.sv-head[data-head="${cursor.head ?? 0}"]`)?.classList.add('is-cursor-head');
        }
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
      if (rhythm && options.current === info.index) {
        svg.prepend(svgEl('rect', {
          x: xStart + 2, y: yOf(MIDDLE + 4.5), width: x - xStart - 4, height: 6.25 * HALF, rx: 6, class: 'sv-current', 'data-measure': info.index,
        }));
      } else if (chosen || pending) {
        svg.prepend(svgEl('rect', {
          x: xStart + 1, y: yOf(TOP_LINE) - 12, width: x - xStart - 2, height: yOf(0) - yOf(TOP_LINE) + 24, rx: 6,
          class: pending ? 'sv-pending' : 'sv-current', 'data-measure': info.index,
        }));
      }
      if (options.hit) {
        group.append(svgEl('rect', { x: xStart, y: 0, width: x - xStart, height, class: 'sv-hit', 'data-measure': info.index }));
      }
      drawBarlines(svg, row, k, xStart, x0, x, last && k === row.length - 1, yOf);
      // A bracket or marks at a row start begin after the clef and key.
      const left = k === 0 ? x0 : xStart;
      if (info.ending) drawEnding(svg, info, left, x, ROW_PAD_TOP + 4);
      if (info.marks) drawMarks(svg, info, left, x, yOf(noteUp) - 6);
    });

    const ties = svgEl('g', { class: 'sv-ties' });
    svg.append(ties);
    // A tie per tied pitch, to the same pitch in the next note. side: +1 draws below the heads (y grows downwards),
    // -1 above: away from the stem for a single note; in a chord, the upper heads' ties curve up and the lower down.
    const sideOf = (d, head) => {
      if (d.heads.length > 1) {
        const mid = (d.heads[0].pos + d.heads[d.heads.length - 1].pos) / 2;
        return head.pos > mid || (head.pos === mid && d.stem !== -1) ? -1 : 1;
      }
      return d.stem ? d.stem : head.pos >= MIDDLE ? -1 : 1;
    };
    rowNotes.forEach((d, i) => {
      for (const head of d.heads ?? []) {
        if (i === 0 && N.tieStops(head.tie)) drawTie(ties, null, head, sideOf(d, head));
        if (!N.tieStarts(head.tie)) continue;
        const next = rowNotes[i + 1]?.heads?.find((h) => h.midi === head.midi && N.tieStops(h.tie));
        drawTie(ties, head, next ?? null, sideOf(d, head));
      }
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

  // score: a v2 score. options: { label, numberFirst (show the number on the first row too), pick (the editor: press
  // areas over the notes, every rest as written), cursor: { measure, note, head } (the editor's chosen note) }.
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
    const infos = measures.map((measure, i) => measureInfo(measure, i, i ? measures[i - 1] : null, Boolean(options.pick)));
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

  // The one-line rhythm staff (리듬 모드), drawn as one SVG that scales with its box. Room is kept for `slots`
  // measures (rows not drawn yet stay empty, so the box doesn't grow while writing); `shown` measures are drawn.
  // model: { time: [beats, beatType] | null (not chosen yet: no time signature), measures: [[note, ...], ...],
  //          slots, shown, current (measure being written, or -1), marks (per measure: true / false / undefined) }
  // wide: up to four measures to a row instead of two. Returns the SVG (class rhythm-staff).
  function rhythm(model, wide, options = {}) {
    const width = wide ? WIDTH.wide : WIDTH.narrow;
    const perRow = !wide || model.slots <= 2 ? 2 : 4;
    const time = model.time ?? [4, 4];
    const infos = [];
    for (let i = 0; i < model.shown; i++) {
      const measure = { time, key: { fifths: 0, mode: 'major' }, clef: 'treble', hideTime: !model.time, notes: model.measures[i] ?? [] };
      infos.push(measureInfo(measure, i, i ? infos[i - 1] : null, true, true));
    }
    const rows = [];
    for (let i = 0; i < infos.length; i += perRow) rows.push(infos.slice(i, i + perRow));
    const reserved = Math.max(rows.length, Math.ceil(model.slots / perRow));
    const rowHeight = RHYTHM_PAD_TOP + (RHYTHM_UP + RHYTHM_DOWN) * HALF + ROW_PAD_BOTTOM;
    const svg = svgEl('svg', { class: 'rhythm-staff sheet-rhythm', role: 'img', viewBox: `0 0 ${width} ${reserved * rowHeight}` });
    if (options.label) svg.setAttribute('aria-label', options.label);
    rows.forEach((row, r) => {
      const short = row.length < perRow ? row.length / perRow : 0;
      const drawn = drawRow(row, r, width, false, short, { marks: model.marks, current: model.current });
      drawn.svg.setAttribute('x', 0);
      drawn.svg.setAttribute('y', r * rowHeight);
      drawn.svg.setAttribute('width', width);
      drawn.svg.setAttribute('height', drawn.height);
      svg.append(drawn.svg);
    });
    return svg;
  }

  const clefBottom = (clef) => CLEF_INFO[clef].bottom;

  window.Sheet = { draw, strip, rhythm, shownAccidentals, keySigns, keyAlters, position, drawClef, clefBottom, CLEF_WIDTH };
})();
