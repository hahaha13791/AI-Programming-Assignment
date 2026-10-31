(function () {
  // The editor's work on a v2 score, without the screen (PRD #4-H): the score being edited, a cursor on one note
  // (and one head of a chord), and undo/redo. Every change goes through change(), which keeps it undoable.
  // The title is kept apart: it is typed in a text box (with its own undo) and isn't part of the history.
  const N = Notation;
  const HISTORY = 100;
  const DEFAULT = { time: [4, 4], key: { fifths: 0, mode: 'major' }, clef: 'treble', tempo: 120 };

  const copy = (value) => JSON.parse(JSON.stringify(value));

  // A new score: 4/4, C major, treble clef, ♩= 120, one measure of a whole rest (PRD #4-H-1).
  function blank() {
    return { pickup: false, measures: [{ ...copy(DEFAULT), notes: [{ type: 'whole', dots: 0, rest: true }] }] };
  }

  // ---- measure surgery (PRD #4-H-2): overwrite, fill with rests, keep tuplet groups whole ----
  const { add, sub, cmp, mul, frac, ZERO } = N;
  const PLAIN = ['whole', 'half', 'quarter', 'eighth', '16th', '32nd', '64th'];
  const LEVELS = ['tuplet', 'tuplet2'];

  // Rests making up `length` (written), longest first; null if 64th rests can't make it up.
  function restsFor(length) {
    const out = [];
    let left = length;
    for (const type of PLAIN) {
      const size = N.duration({ type, dots: 0 });
      while (cmp(left, size) >= 0) {
        out.push({ type, dots: 0, rest: true });
        left = sub(left, size);
      }
    }
    return cmp(left, ZERO) === 0 ? out : null;
  }

  // Which tuplet group (a number per group) each note is in at each level, from the start / stop marks.
  function groupIds(notes) {
    let next = 0;
    const ids = notes.map(() => ({}));
    for (const level of LEVELS) {
      let open = null;
      notes.forEach((note, i) => {
        if (note.grace || !note[level]) return;
        if (note[`${level}Start`] || open === null) open = ++next;
        ids[i][level] = open;
        if (note[`${level}Stop`]) open = null;
      });
    }
    return ids;
  }

  // Start / stop marks again from the group numbers (after notes came and went).
  function markGroups(notes, ids) {
    for (const level of LEVELS) {
      notes.forEach((note, i) => {
        delete note[`${level}Start`];
        delete note[`${level}Stop`];
        if (note.grace || !note[level]) {
          delete note[level];
          return;
        }
        const id = ids[i][level];
        const prev = notes.slice(0, i).reverse().find((n) => !n.grace);
        const prevIndex = prev ? notes.lastIndexOf(prev, i - 1) : -1;
        const nextIndex = notes.findIndex((n, k) => k > i && !n.grace);
        if (prevIndex < 0 || ids[prevIndex][level] !== id) note[`${level}Start`] = true;
        if (nextIndex < 0 || ids[nextIndex][level] !== id) note[`${level}Stop`] = true;
      });
    }
  }

  // How much a note's written length is scaled by its tuplets (2 in the time of 3: 2/3).
  function scaleOf(note) {
    let scale = frac(1);
    for (const level of LEVELS) if (note[level]) scale = mul(scale, frac(note[level].normal, note[level].actual));
    return scale;
  }

  // Writes `note` (a written type/dots with a pitch, or a rest) over the place of note `at` of `notes` (a measure),
  // MuseScore's way: a longer note covers what follows it, the rest of a note it partly covers becomes rests, a
  // shorter one leaves rests. Inside a tuplet the note joins that group and stays in it; from outside, a tuplet group
  // is covered whole or not at all. Grace notes before `at` stay; those before covered notes go.
  // Returns { notes, index (of the new note) } or null when it doesn't fit (past the measure or the group).
  function overwrite(notes, at, note) {
    const ids = groupIds(notes);
    const target = notes[at];
    // The scope: the innermost group the target is in, or the whole measure.
    const level = target.tuplet2 ? 'tuplet2' : target.tuplet ? 'tuplet' : null;
    const inScope = (i) => !level || ids[i][level] === ids[at][level];
    const placed = { ...note };
    for (const l of LEVELS) delete placed[l];
    if (target.tuplet) placed.tuplet = { ...target.tuplet };
    if (target.tuplet2) placed.tuplet2 = { ...target.tuplet2 };
    const atomLevel = level === 'tuplet2' ? null : level === 'tuplet' ? 'tuplet2' : 'tuplet';
    // Units in order: a note, or a whole group below the scope. Times run over the whole measure.
    const units = [];
    let time = ZERO;
    let graces = [];
    notes.forEach((n, i) => {
      if (n.grace) {
        graces.push(i);
        return;
      }
      const length = N.duration(n);
      const group = atomLevel && n[atomLevel] ? ids[i][atomLevel] : null;
      const last = units[units.length - 1];
      if (group !== null && last && last.group === group) {
        last.indices.push(...graces, i);
        last.end = add(last.end, length);
      } else {
        units.push({ indices: [i], graces, group, start: time, end: add(time, length), scope: inScope(i) });
      }
      graces = [];
      time = add(time, length);
    });
    const trailing = graces; // grace notes after the last note
    const first = units.findIndex((u) => u.indices.includes(at));
    const start = units[first].start;
    const scoped = units.filter((u) => u.scope);
    const scopeEnd = scoped[scoped.length - 1].end;
    const end = add(start, N.duration(placed));
    if (cmp(end, scopeEnd) > 0) return null;
    // Units covered: from the target's on, starting before the new note's end.
    let k = first;
    while (k < units.length && cmp(units[k].start, end) < 0) k++;
    const covered = units.slice(first, k);
    const lastEnd = covered[covered.length - 1].end;
    let leftover = [];
    if (cmp(lastEnd, end) > 0) {
      const written = mul(sub(lastEnd, end), frac(scaleOf(placed)[1], scaleOf(placed)[0]));
      const rests = restsFor(written);
      if (!rests) return null;
      leftover = rests.map((r) => {
        const rest = { ...r };
        if (placed.tuplet) rest.tuplet = { ...placed.tuplet };
        if (placed.tuplet2) rest.tuplet2 = { ...placed.tuplet2 };
        return rest;
      });
    }
    const out = [];
    const outIds = [];
    const keep = (i) => {
      out.push(notes[i]);
      outIds.push(ids[i]);
    };
    units.slice(0, first).forEach((u) => [...u.graces, ...u.indices].forEach(keep));
    units[first].graces.forEach(keep);
    const index = out.length;
    const context = { tuplet: ids[at].tuplet, tuplet2: ids[at].tuplet2 };
    out.push(placed);
    outIds.push({ ...context });
    for (const rest of leftover) {
      out.push(rest);
      outIds.push({ ...context });
    }
    units.slice(k).forEach((u) => [...u.graces, ...u.indices].forEach(keep));
    trailing.forEach(keep);
    markGroups(out, outIds);
    return { notes: out, index };
  }

  // The usual "in the time of" for a tuplet of this many notes: 3 in 2, 5·6·7 in 4 (PRD #4-H-3).
  const NORMAL = { 2: 3, 3: 2, 4: 3, 5: 4, 6: 4, 7: 4, 9: 8 };

  // A written note (type and dots) exactly this long, or null.
  function noteOfLength(length) {
    for (const type of PLAIN) {
      for (let dots = 0; dots <= 2; dots++) if (cmp(N.duration({ type, dots }), length) === 0) return { type, dots };
    }
    return null;
  }

  // From note `at`, the time of `normal` notes of `type` (the note's own written type by default) becomes a group
  // of `actual` rests of that type: a tuplet, or a tuplet inside the tuplet it's in. Returns { notes, index } or null
  // (no room, a third level, a length that can't be written).
  function makeTuplet(notes, at, actual, normal, type = notes[at].type) {
    const target = notes[at];
    if (target.grace || target.tuplet2) return null;
    const unit = { type, dots: 0 };
    const span = noteOfLength(mul(N.duration(unit), frac(normal)));
    if (!span) return null;
    const written = overwrite(notes, at, { ...span, rest: true });
    if (!written) return null;
    const out = written.notes;
    const placed = out[written.index];
    const level = placed.tuplet ? 'tuplet2' : 'tuplet';
    const members = Array.from({ length: actual }, (_, k) => {
      const rest = { ...unit, rest: true };
      if (placed.tuplet) rest.tuplet = { ...placed.tuplet };
      rest[level] = { actual, normal };
      if (k === 0) {
        rest[`${level}Start`] = true;
        if (placed.tupletStart) rest.tupletStart = true;
      }
      if (k === actual - 1) {
        rest[`${level}Stop`] = true;
        if (placed.tupletStop) rest.tupletStop = true;
      }
      return rest;
    });
    out.splice(written.index, 1, ...members);
    return { notes: out, index: written.index };
  }

  // The innermost tuplet group note `at` is in, back to plain rests of its length (in the group around it, if any).
  function removeTuplet(notes, at) {
    const target = notes[at];
    const level = target.tuplet2 ? 'tuplet2' : target.tuplet ? 'tuplet' : null;
    if (!level) return null;
    const ids = groupIds(notes);
    const id = ids[at][level];
    const members = notes.map((n, i) => i).filter((i) => !notes[i].grace && ids[i][level] === id);
    const first = members[0];
    const last = members[members.length - 1];
    const length = members.reduce((sum, i) => add(sum, N.duration(notes[i])), ZERO);
    // Written in the outer group (if the removed one was inside one).
    const outer = level === 'tuplet2' ? target.tuplet : null;
    const writtenLength = outer ? mul(length, frac(outer.actual, outer.normal)) : length;
    const rests = restsFor(writtenLength);
    if (!rests) return null;
    const outerId = outer ? ids[at].tuplet : undefined;
    const out = [];
    const outIds = [];
    notes.forEach((n, i) => {
      if (i < first || i > last) {
        out.push(n);
        outIds.push(ids[i]);
      } else if (i === first) {
        for (const r of rests) {
          out.push(outer ? { ...r, tuplet: { ...outer } } : r);
          outIds.push(outer ? { tuplet: outerId } : {});
        }
      }
    });
    markGroups(out, outIds);
    return { notes: out, index: first };
  }

  // A measure's notes as whole pieces in time: a note (with the grace notes before it) or a whole tuplet group.
  function unitsOf(notes) {
    const ids = groupIds(notes);
    const units = [];
    let time = ZERO;
    let graces = [];
    notes.forEach((n, i) => {
      if (n.grace) {
        graces.push(i);
        return;
      }
      const length = N.duration(n);
      const group = n.tuplet ? ids[i].tuplet : null;
      const last = units[units.length - 1];
      if (group !== null && last && last.group === group) {
        last.indices.push(...graces, i);
        last.end = add(last.end, length);
      } else {
        units.push({ indices: [...graces, i], group, start: time, end: add(time, length) });
      }
      graces = [];
      time = add(time, length);
    });
    return { units, trailing: graces };
  }

  // A measure's notes made exactly `length` long: rests added at the end, or the notes past it taken off (a tuplet
  // group whole) and the gap filled with rests. Returns { notes, removed (notes that weren't rests) } or null.
  function fitTo(notes, length) {
    const filled = N.filled(notes);
    const diff = cmp(filled, length);
    if (diff === 0) return { notes, removed: 0 };
    if (diff < 0) {
      const rests = restsFor(sub(length, filled));
      return rests ? { notes: [...notes, ...rests], removed: 0 } : null;
    }
    const { units } = unitsOf(notes);
    const kept = units.filter((u) => cmp(u.end, length) <= 0);
    const end = kept.length ? kept[kept.length - 1].end : ZERO;
    const rests = restsFor(sub(length, end));
    if (!rests) return null;
    const keep = new Set(kept.flatMap((u) => u.indices));
    const removed = notes.filter((n, i) => !keep.has(i) && !n.rest).length;
    return { notes: [...notes.filter((n, i) => keep.has(i)), ...rests], removed };
  }

  const ATTRS = ['time', 'timeSymbol', 'key', 'clef', 'tempo'];
  // Whether a score being edited holds together. Like Notation.isValid, but a score of rests only is fine while
  // editing (a new score starts so; saving still needs a note): a grace note on a measure of its own stands in.
  const STAND_IN = { notes: [{ type: 'eighth', dots: 0, grace: true, pitch: { step: 'C', alter: 0, octave: 4 } }] };
  const sound = (score) => N.isValid({ ...score, id: 'x', title: 'x', measures: [...score.measures, STAND_IN] });
  const resolved = (score) => N.resolve({ ...score, id: 'x', title: 'x' });

  // Ties kept only where both ends are still there, the same pitch in neighbouring notes (after any change).
  function fixTies(score) {
    const notes = score.measures.flatMap((m) => m.notes);
    const entries = (n) => (n && !n.rest ? [n, ...(n.chord ?? [])] : []);
    const has = (n, pitch, test) => entries(n).some((e) => test(e.tie) && N.midi(e.pitch) === N.midi(pitch));
    const next = notes.map((n, i) => entries(n).map((e) => {
      const starts = N.tieStarts(e.tie) && has(notes[i + 1], e.pitch, N.tieStops);
      const stops = N.tieStops(e.tie) && has(notes[i - 1], e.pitch, N.tieStarts);
      return starts && stops ? 'both' : starts ? 'start' : stops ? 'stop' : undefined;
    }));
    notes.forEach((n, i) => entries(n).forEach((e, h) => {
      if (next[i][h]) e.tie = next[i][h];
      else delete e.tie;
    }));
  }

  // The alteration a pitch of this letter and octave gets at note `at` of measure `measure`: an accidental written
  // earlier in the measure, else the key signature (PRD #4-H-2: as it would look on the page).
  function alterAt(score, measure, at, step, octave) {
    const key = N.resolve(score)[measure].key;
    let alter = Sheet.keyAlters(key)[step] ?? 0;
    score.measures[measure].notes.slice(0, at).forEach((note) => {
      for (const { pitch } of N.pitchesOf(note)) {
        if (pitch.step === step && pitch.octave === octave) alter = pitch.alter;
      }
    });
    return alter;
  }

  // The clef in force at a note (a change inside the measure counts from its note on).
  function clefAt(score, measure, at) {
    let clef = N.resolve(score)[measure].clef;
    score.measures[measure].notes.slice(0, at + 1).forEach((note) => {
      if (note.clef) clef = note.clef;
    });
    return clef;
  }

  // Trailing measures of nothing but rests, added by writing past the end, aren't kept (one measure at least).
  function trimmed(score) {
    const measures = [...score.measures];
    const bare = (m) => m.notes.every((n) => n.rest) && Object.keys(m).every((key) => key === 'notes');
    while (measures.length > 1 && bare(measures[measures.length - 1])) measures.pop();
    return { ...score, measures };
  }

  // score: a v2 score to edit, or null for a new one.
  function create(score) {
    let doc = score ? copy(score) : blank();
    let title = score ? score.title : '';
    const id = score ? score.id : null;
    delete doc.title;
    delete doc.id;
    let cursor = { measure: 0, note: 0, head: 0 };
    const past = [];
    const future = [];

    // The cursor kept on a note that exists.
    function clamp(c) {
      const measure = Math.max(0, Math.min(doc.measures.length - 1, c.measure));
      const notes = doc.measures[measure].notes;
      const note = Math.max(0, Math.min(notes.length - 1, c.note));
      const heads = N.pitchesOf(notes[note]).length || 1;
      const head = Math.max(0, Math.min(heads - 1, c.head ?? 0));
      return { measure, note, head };
    }

    const snapshot = () => JSON.stringify({ doc, cursor });
    function restore(text) {
      const state = JSON.parse(text);
      doc = state.doc;
      cursor = clamp(state.cursor);
    }

    // mutate(draft, cursor) changes a copy of the score and the cursor; returning false leaves everything as it was.
    function change(mutate) {
      const before = snapshot();
      const draft = copy(doc);
      const next = { ...cursor };
      if (mutate(draft, next) === false) return false;
      doc = draft;
      cursor = clamp(next);
      past.push(before);
      if (past.length > HISTORY) past.shift();
      future.length = 0;
      return true;
    }

    function undo() {
      if (!past.length) return false;
      future.push(snapshot());
      restore(past.pop());
      return true;
    }

    function redo() {
      if (!future.length) return false;
      past.push(snapshot());
      restore(future.pop());
      return true;
    }

    // Every note's place in order, for moving one step.
    const places = () => doc.measures.flatMap((m, measure) => m.notes.map((_, note) => ({ measure, note })));

    // One note back or on (step -1 / +1); stays at the first and the last.
    function move(step) {
      const all = places();
      const at = all.findIndex((p) => p.measure === cursor.measure && p.note === cursor.note);
      const next = all[Math.max(0, Math.min(all.length - 1, at + step))];
      cursor = clamp({ ...next, head: 0 });
    }

    // To the first note of the measure before or after.
    function moveMeasure(step) {
      cursor = clamp({ measure: cursor.measure + step, note: 0, head: 0 });
    }

    function select(measure, note, head = 0) {
      cursor = clamp({ measure, note, head });
    }

    const noteAt = (doc, c = cursor) => doc.measures[c.measure].notes[c.note];

    // The next place after note `index` of `measure`: the next note, the next measure's first, or a new measure of
    // rests in the same time after the last one (writing on at the end).
    function advance(draft, c, measure, index) {
      if (index + 1 < draft.measures[measure].notes.length) return Object.assign(c, { measure, note: index + 1, head: 0 });
      if (measure + 1 < draft.measures.length) return Object.assign(c, { measure: measure + 1, note: 0, head: 0 });
      const time = N.resolve({ ...draft, id: 'x', title: 'x' }).at(-1).time;
      draft.measures.push({ notes: restsFor(N.measureLength(time)) });
      return Object.assign(c, { measure: measure + 1, note: 0, head: 0 });
    }

    // Whether a note of this written length fits at the cursor (inside the measure, or the tuplet group it's in).
    function fits(type, dots = 0) {
      const target = noteAt(doc);
      if (target.grace) return true;
      return overwrite(doc.measures[cursor.measure].notes, cursor.note, { type, dots, rest: true }) !== null;
    }

    // Writes a note ({ type, dots, pitch } or { type, dots, rest: true }) at the cursor and moves on (PRD #4-H-2).
    // On a grace note, it takes the grace note's place as a grace note.
    function insert(note) {
      return change((draft, c) => {
        const notes = draft.measures[c.measure].notes;
        const target = notes[c.note];
        if (target.grace) {
          if (note.rest) return false;
          notes[c.note] = { type: note.type, dots: note.dots ?? 0, pitch: { ...note.pitch }, grace: true, ...(target.slash ? { slash: true } : {}) };
          fixTies(draft);
          advance(draft, c, c.measure, c.note);
          return true;
        }
        const written = overwrite(notes, c.note, note);
        if (!written) return false;
        draft.measures[c.measure].notes = written.notes;
        fixTies(draft);
        advance(draft, c, c.measure, written.index);
        return true;
      });
    }

    // The cursor note in another written length, keeping its pitches; the cursor stays on it.
    function setLength(type, dots = 0) {
      return change((draft, c) => {
        const notes = draft.measures[c.measure].notes;
        const target = notes[c.note];
        if (target.grace) {
          if (target.type === type && (target.dots ?? 0) === dots) return false;
          Object.assign(target, { type, dots });
          return true;
        }
        if (target.type === type && (target.dots ?? 0) === dots) return false;
        const { tuplet, tuplet2, tupletStart, tupletStop, tuplet2Start, tuplet2Stop, ...rest } = target;
        const written = overwrite(notes, c.note, { ...copy(rest), type, dots });
        if (!written) return false;
        draft.measures[c.measure].notes = written.notes;
        fixTies(draft);
        c.note = written.index;
        return true;
      });
    }

    // The cursor note becomes a rest of the same length (a grace note goes); then on to the next note.
    function erase() {
      return change((draft, c) => {
        const notes = draft.measures[c.measure].notes;
        const target = notes[c.note];
        if (target.grace) {
          notes.splice(c.note, 1);
          fixTies(draft);
          return true;
        }
        if (target.rest) return false;
        const rest = { type: target.type, dots: target.dots ?? 0, rest: true };
        for (const key of ['tuplet', 'tuplet2', 'tupletStart', 'tupletStop', 'tuplet2Start', 'tuplet2Stop', 'clef', 'tempo']) {
          if (target[key] !== undefined) rest[key] = target[key];
        }
        notes[c.note] = rest;
        fixTies(draft);
        return true;
      });
    }

    // The chosen pitch (the cursor head of a chord) a semitone up or down, as far as a double sharp / flat.
    function semitone(dir) {
      return change((draft, c) => {
        const entry = headEntry(draft, c);
        if (!entry) return false;
        const alter = entry.pitch.alter + dir;
        if (Math.abs(alter) > 2) return false;
        entry.pitch.alter = alter;
        fixTies(draft);
        return true;
      });
    }

    function octave(dir) {
      return change((draft, c) => {
        const entry = headEntry(draft, c);
        if (!entry) return false;
        const next = entry.pitch.octave + dir;
        if (next < 0 || next > 9) return false;
        entry.pitch.octave = next;
        fixTies(draft);
        return true;
      });
    }

    // The note or chord member under the cursor head: the object holding { pitch, tie }.
    function headEntry(draft, c) {
      const note = noteAt(draft, c);
      if (note.rest) return null;
      return c.head > 0 ? note.chord?.[c.head - 1] ?? null : note;
    }

    // Ties the cursor note to the next note: each of its pitches that the next note has too (a chord, pitch by
    // pitch); off again if they are tied. Returns false (nothing changes) when the next note has none of them.
    function toggleTie() {
      return change((draft, c) => {
        const flat = draft.measures.flatMap((m) => m.notes);
        const offset = draft.measures.slice(0, c.measure).reduce((sum, m) => sum + m.notes.length, 0) + c.note;
        const note = flat[offset];
        const next = flat[offset + 1];
        if (!note || note.rest || note.grace || !next || next.rest || next.grace) return false;
        const entries = (n) => [n, ...(n.chord ?? [])];
        const pairs = entries(note).map((e) => [e, entries(next).find((x) => N.midi(x.pitch) === N.midi(e.pitch))]).filter(([, x]) => x);
        if (!pairs.length) return false;
        const tied = pairs.some(([e]) => N.tieStarts(e.tie));
        for (const [e, x] of pairs) {
          if (tied) {
            e.tie = N.tieStops(e.tie) ? 'stop' : undefined;
            x.tie = N.tieStarts(x.tie) ? 'start' : undefined;
          } else {
            e.tie = N.tieStops(e.tie) ? 'both' : 'start';
            x.tie = N.tieStarts(x.tie) ? 'both' : 'stop';
          }
          if (!e.tie) delete e.tie;
          if (!x.tie) delete x.tie;
        }
        return true;
      });
    }

    // Whether the cursor note is tied on to the next.
    const isTied = () => N.pitchesOf(noteAt(doc)).some((p) => N.tieStarts(p.tie));

    // A tuplet of `actual` notes of `type` (by default the cursor note's) in the time of `normal` (by default the
    // usual one), from the cursor.
    function tuplet(actual, normal = NORMAL[actual], type) {
      if (!(actual >= 2 && actual <= 15 && normal >= 1 && normal <= 15) || actual === normal) return false;
      return change((draft, c) => {
        const made = makeTuplet(draft.measures[c.measure].notes, c.note, actual, normal ?? NORMAL[actual], type);
        if (!made) return false;
        draft.measures[c.measure].notes = made.notes;
        fixTies(draft);
        c.note = made.index;
        return true;
      });
    }

    function untuplet() {
      return change((draft, c) => {
        const made = removeTuplet(draft.measures[c.measure].notes, c.note);
        if (!made) return false;
        draft.measures[c.measure].notes = made.notes;
        fixTies(draft);
        c.note = made.index;
        return true;
      });
    }

    // ---- [마디] tools (PRD #4-H-3), from the cursor's measure ----

    // A new time from this measure until the next time change. Full measures in that run grow (rests) or shrink
    // (the notes past the end go); a short one (a pickup, a split measure) shrinks only if it's now too long.
    // Returns the number of notes taken off, or false if nothing changed or it can't be written.
    function setTime(beats, beatType, symbol) {
      let removed = 0;
      const done = change((draft, c) => {
        const before = resolved(draft);
        const from = c.measure;
        const old = before[from];
        if (String(old.time) === `${beats},${beatType}` && (old.timeSymbol ?? null) === (symbol ?? null)) return false;
        const newLength = N.measureLength([beats, beatType]);
        for (let i = from; i < draft.measures.length; i++) {
          if (i > from && draft.measures[i].time) break;
          const m = draft.measures[i];
          const full = cmp(N.filled(m.notes), N.measureLength(before[i].time)) >= 0;
          const target = full ? newLength : (cmp(N.filled(m.notes), newLength) > 0 ? newLength : null);
          if (target) {
            const fitted = fitTo(m.notes, target);
            if (!fitted) return false;
            m.notes = fitted.notes;
            removed += fitted.removed;
          }
        }
        draft.measures[from].time = [beats, beatType];
        if (symbol) draft.measures[from].timeSymbol = symbol;
        else delete draft.measures[from].timeSymbol;
        if (from === 0) draft.pickup = cmp(N.filled(draft.measures[0].notes), newLength) < 0;
        fixTies(draft);
        return sound(draft);
      });
      return done ? removed : false;
    }

    // An attribute that only says what is already in force is left out (except on the first measure).
    function tidy(draft, index, name) {
      if (index === 0) return;
      const before = resolved(draft)[index - 1];
      const inForce = name === 'clef' ? before.endClef : name === 'tempo' ? before.endTempo : before[name];
      if (JSON.stringify(draft.measures[index][name]) === JSON.stringify(inForce)) delete draft.measures[index][name];
    }

    function setKey(fifths, mode) {
      return change((draft, c) => {
        const now = resolved(draft)[c.measure].key;
        if (now.fifths === fifths && now.mode === mode) return false;
        draft.measures[c.measure].key = { fifths, mode };
        tidy(draft, c.measure, 'key');
        for (let i = c.measure + 1; i < draft.measures.length; i++) tidy(draft, i, 'key');
        return true;
      });
    }

    // A clef or a tempo at the measure's start, or (atNote) from the cursor note on.
    function setNoteAttr(name, value, atNote) {
      return change((draft, c) => {
        const m = draft.measures[c.measure];
        if (atNote && c.note > 0) {
          const note = m.notes[c.note];
          if (note[name] === value) return false;
          note[name] = value;
        } else {
          if (m[name] === value && (c.measure === 0 || m[name] !== undefined)) return false;
          m[name] = value;
          if (c.note === 0 && m.notes[0][name] !== undefined) delete m.notes[0][name];
          tidy(draft, c.measure, name);
        }
        return sound(draft);
      });
    }

    const setClef = (clef, atNote = false) => N.CLEFS.includes(clef) && setNoteAttr('clef', clef, atNote);
    const setTempo = (tempo, atNote = false) => {
      const value = Math.round(Number(tempo));
      return value >= N.TEMPO_RANGE[0] && value <= N.TEMPO_RANGE[1] && setNoteAttr('tempo', value, atNote);
    };

    // The first measure as a pickup of `length` (a fraction of a whole note), or a full measure (null).
    function setPickup(length) {
      return change((draft) => {
        const time = resolved(draft)[0].time;
        const full = N.measureLength(time);
        const target = length && cmp(length, full) < 0 ? length : full;
        const fitted = fitTo(draft.measures[0].notes, target);
        if (!fitted || cmp(N.filled(draft.measures[0].notes), target) === 0 && draft.pickup === (target !== full)) return false;
        draft.measures[0].notes = fitted.notes;
        draft.pickup = target !== full;
        fixTies(draft);
        return sound(draft);
      });
    }

    // The cursor's measure (not the first) made `length` long (null: its full time), counted in the numbering or not.
    function setMeasureLength(length, implicit = false) {
      return change((draft, c) => {
        if (c.measure === 0) return false;
        const m = draft.measures[c.measure];
        const full = N.measureLength(resolved(draft)[c.measure].time);
        const target = length && cmp(length, full) < 0 ? length : full;
        const fitted = fitTo(m.notes, target);
        if (!fitted) return false;
        m.notes = fitted.notes;
        if (implicit) m.implicit = true;
        else delete m.implicit;
        fixTies(draft);
        return sound(draft);
      });
    }

    // A measure of rests before the cursor's. Before the first, it takes over the first's settings; inside an ending
    // bracket, it joins the bracket.
    function insertMeasure() {
      return change((draft, c) => {
        const i = c.measure;
        const at = resolved(draft)[i];
        const fresh = { notes: restsFor(N.measureLength(at.time)) };
        const old = draft.measures[i];
        if (i === 0) {
          for (const name of ATTRS) {
            if (old[name] !== undefined) {
              fresh[name] = old[name];
              delete old[name];
            }
          }
          if (draft.pickup) {
            draft.pickup = false; // the old pickup is now inside the score
            old.implicit = true;
          }
        }
        const prev = draft.measures[i - 1];
        if (prev?.ending && !prev.ending.end && old.ending && !old.ending.start) fresh.ending = { text: old.ending.text };
        draft.measures.splice(i, 0, fresh);
        Object.assign(c, { note: 0, head: 0 });
        fixTies(draft);
        return sound(draft);
      });
    }

    // Takes the cursor's measure out. The settings that start there carry on in the next measure, and an ending
    // bracket keeps its start and end.
    function deleteMeasure() {
      return change((draft, c) => {
        if (draft.measures.length < 2) return false;
        const i = c.measure;
        const all = resolved(draft);
        const gone = draft.measures[i];
        const next = draft.measures[i + 1];
        if (next) {
          if (i === 0) {
            for (const name of ATTRS) if (next[name] === undefined && all[1][name] !== undefined) next[name] = all[1][name];
            if (!next.time) next.time = all[1].time;
            next.clef = next.clef ?? all[1].clef;
            next.tempo = next.tempo ?? all[1].tempo;
            next.key = next.key ?? all[1].key;
            delete next.implicit;
          } else {
            for (const name of ['time', 'timeSymbol', 'key', 'clef', 'tempo']) {
              if (gone[name] !== undefined && next[name] === undefined) next[name] = gone[name];
            }
          }
          if (gone.ending?.start && next.ending && !next.ending.start) next.ending.start = true;
        }
        const prev = draft.measures[i - 1];
        if (gone.ending?.end && prev?.ending && !prev.ending.end && !gone.ending.start) prev.ending.end = gone.ending.end;
        draft.measures.splice(i, 1);
        if (i === 0) draft.pickup = cmp(N.filled(draft.measures[0].notes), N.measureLength(resolved(draft)[0].time)) < 0;
        for (let k = 1; k < draft.measures.length; k++) for (const name of ['key', 'clef', 'tempo']) tidy(draft, k, name);
        Object.assign(c, { measure: Math.min(i, draft.measures.length - 1), note: 0, head: 0 });
        fixTies(draft);
        return sound(draft);
      });
    }

    function setFirstNumber(number) {
      return change((draft) => {
        const n = Math.round(Number(number));
        if (!(n >= 0 && n <= 99999)) return false;
        const usual = draft.pickup ? 0 : 1;
        if ((draft.firstNumber ?? usual) === n) return false;
        if (n === usual) delete draft.firstNumber;
        else draft.firstNumber = n;
        return true;
      });
    }

    // The score as it would be stored (its id is the app's business: the old one, or none for a new score).
    function result() {
      return N.clean({ ...trimmed(copy(doc)), id: id ?? 'new', title: title.trim() });
    }

    // A title, and at least one note that isn't a rest (the beats always add up, PRD #4-H-6).
    function canSave() {
      if (!title.trim()) return false;
      const score = { ...trimmed(doc), id: 'new', title: title.trim() };
      return doc.measures.some((m) => m.notes.some((n) => !n.rest)) && N.isValid(score);
    }

    return {
      get score() { return doc; },
      get cursor() { return { ...cursor }; },
      get title() { return title; },
      get id() { return id; },
      setTitle(value) { title = String(value).slice(0, N.MAX_TITLE); },
      change, undo, redo,
      canUndo: () => past.length > 0,
      canRedo: () => future.length > 0,
      move, moveMeasure, select, result, canSave,
      fits, insert, setLength, erase, semitone, octave, toggleTie, isTied, tuplet, untuplet,
      setTime, setKey, setClef, setTempo, setPickup, setMeasureLength, insertMeasure, deleteMeasure, setFirstNumber,
      alterAt: (measure, at, step, oct) => alterAt(doc, measure, at, step, oct),
      clefAt: (measure = cursor.measure, at = cursor.note) => clefAt(doc, measure, at),
    };
  }

  window.Editing = { create, blank, restsFor, overwrite, fixTies, makeTuplet, removeTuplet, NORMAL, HISTORY, DEFAULT };
})();
