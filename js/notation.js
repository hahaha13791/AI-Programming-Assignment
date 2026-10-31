(function () {
  // The score format (v2): an original score as written, in MusicXML's terms so an import can move it over
  // unchanged. Nothing here bends a score to fit the app.
  //
  // score   = { id, title, pickup (first measure shorter than its time), measures: [measure, ...],
//             firstNumber (optional: the first measure's printed number when it isn't the usual 1, or 0 for a pickup) }
  // measure = { notes: [note, ...], and only where they change (all of them in the first measure):
  //             time: [beats, beatType], key: { fifths: -7..7, mode: 'major'|'minor' }, clef: 'treble'|'bass',
  //             tempo: quarter notes per minute }
  // note    = { type: 'whole'|'half'|'quarter'|'eighth'|'16th'|'32nd', dots: 0..2,
  //             pitch: { step: 'C'..'B', alter: -2..2, octave }  — or rest: true,
  //             tie: 'start'|'stop'|'both' (optional), tuplet: { actual, normal } (optional; actual notes in the time
  //             of normal), tupletStart / tupletStop: true on a tuplet group's first / last note }
  // Lengths are fractions of a whole note, [numerator, denominator], so tuplets and dots add up exactly.

  const TYPES = { whole: 1, half: 2, quarter: 4, eighth: 8, '16th': 16, '32nd': 32 };
  const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const CLEFS = ['treble', 'bass'];
  const MODES = ['major', 'minor'];
  const BEAT_TYPES = [1, 2, 4, 8, 16, 32];
  // Titles from imported files can be long (the editor still takes 30 characters, Scores.MAX_TITLE).
  const MAX_TITLE = 100;
  const TEMPO_RANGE = [5, 1000];

  // ---- fractions ----
  function gcd(a, b) {
    return b ? gcd(b, a % b) : Math.abs(a);
  }
  function frac(n, d = 1) {
    const g = gcd(n, d) || 1;
    return d < 0 ? [-n / g, -d / g] : [n / g, d / g];
  }
  const add = (a, b) => frac(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
  const sub = (a, b) => frac(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
  const mul = (a, b) => frac(a[0] * b[0], a[1] * b[1]);
  const cmp = (a, b) => a[0] * b[1] - b[0] * a[1];
  const ZERO = [0, 1];
  const toNumber = (a) => a[0] / a[1];

  // ---- notes ----
  function duration(note) {
    let length = frac(1, TYPES[note.type]);
    if (note.dots) length = mul(length, frac(2 ** (note.dots + 1) - 1, 2 ** note.dots));
    if (note.tuplet) length = mul(length, frac(note.tuplet.normal, note.tuplet.actual));
    return length;
  }

  function midi(pitch) {
    return 12 * (pitch.octave + 1) + SEMITONES[pitch.step] + pitch.alter;
  }

  function measureLength(time) {
    return frac(time[0], time[1]);
  }

  function filled(notes) {
    return notes.reduce((sum, note) => add(sum, duration(note)), ZERO);
  }

  // Every measure with its time, key, clef and tempo filled in, and its number as printed (a pickup is 0).
  function resolve(score) {
    let attrs = {};
    return score.measures.map((measure, i) => {
      attrs = {
        time: measure.time ?? attrs.time,
        key: measure.key ?? attrs.key,
        clef: measure.clef ?? attrs.clef,
        tempo: measure.tempo ?? attrs.tempo,
      };
      return { ...attrs, notes: measure.notes, number: (score.firstNumber ?? (score.pickup ? 0 : 1)) + i };
    });
  }

  // ---- validation ----
  const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

  function validPitch(pitch) {
    return Boolean(pitch) && STEPS.includes(pitch.step) && isInt(pitch.alter, -2, 2) && isInt(pitch.octave, 0, 9);
  }

  function validNote(note) {
    if (!note || typeof note !== 'object' || !(note.type in TYPES)) return false;
    if (!isInt(note.dots ?? 0, 0, 2)) return false;
    if (note.rest === true) {
      if (note.pitch !== undefined || note.tie !== undefined) return false;
    } else if (!validPitch(note.pitch)) {
      return false;
    }
    if (note.tie !== undefined && !['start', 'stop', 'both'].includes(note.tie)) return false;
    if (note.tuplet !== undefined) {
      const { actual, normal } = note.tuplet || {};
      if (!isInt(actual, 2, 16) || !isInt(normal, 1, 16) || actual === normal) return false;
    } else if (note.tupletStart || note.tupletStop) {
      return false;
    }
    return true;
  }

  function validAttrs(measure, first) {
    const has = (key) => measure[key] !== undefined;
    if (first && !(has('time') && has('key') && has('clef') && has('tempo'))) return false;
    if (has('time')) {
      const [beats, beatType] = Array.isArray(measure.time) ? measure.time : [];
      if (!isInt(beats, 1, 32) || !BEAT_TYPES.includes(beatType)) return false;
    }
    if (has('key') && !(measure.key && isInt(measure.key.fifths, -7, 7) && MODES.includes(measure.key.mode))) return false;
    if (has('clef') && !CLEFS.includes(measure.clef)) return false;
    if (has('tempo') && !(typeof measure.tempo === 'number' && measure.tempo >= TEMPO_RANGE[0] && measure.tempo <= TEMPO_RANGE[1])) return false;
    return true;
  }

  // A tuplet group runs from tupletStart to tupletStop inside one measure, every note in it with the same ratio.
  function validTuplets(notes) {
    let open = null;
    for (const note of notes) {
      if (note.tuplet) {
        if (note.tupletStart) {
          if (open) return false;
          open = note.tuplet;
        }
        if (!open || open.actual !== note.tuplet.actual || open.normal !== note.tuplet.normal) return false;
        if (note.tupletStop) open = null;
      } else if (open) {
        return false;
      }
    }
    return !open;
  }

  // A tie joins a note to the very next note, which must have the same pitch and end the tie.
  function validTies(notes) {
    for (let i = 0; i < notes.length; i++) {
      const tie = notes[i].tie;
      const starts = tie === 'start' || tie === 'both';
      const stops = tie === 'stop' || tie === 'both';
      const previous = notes[i - 1];
      const previousStarts = previous && (previous.tie === 'start' || previous.tie === 'both');
      if (stops !== Boolean(previousStarts)) return false;
      if (stops && midi(previous.pitch) !== midi(notes[i].pitch)) return false;
      if (starts && i === notes.length - 1) return false;
    }
    return true;
  }

  // Whole measures, except a pickup (first) and the last, which may be shorter (the last often makes up the pickup).
  function isValid(score) {
    if (!score || typeof score !== 'object') return false;
    if (typeof score.id !== 'string' || !score.id) return false;
    if (typeof score.title !== 'string' || !score.title.trim() || score.title.length > MAX_TITLE) return false;
    if (typeof score.pickup !== 'boolean') return false;
    if (score.firstNumber !== undefined && !isInt(score.firstNumber, 0, 99999)) return false;
    if (!Array.isArray(score.measures) || !score.measures.length) return false;
    for (let i = 0; i < score.measures.length; i++) {
      const measure = score.measures[i];
      if (!measure || !Array.isArray(measure.notes) || !measure.notes.length) return false;
      if (!validAttrs(measure, i === 0) || !measure.notes.every(validNote) || !validTuplets(measure.notes)) return false;
    }
    const measures = resolve(score);
    const last = measures.length - 1;
    for (let i = 0; i <= last; i++) {
      const diff = cmp(filled(measures[i].notes), measureLength(measures[i].time));
      const short = (i === 0 && score.pickup) || i === last;
      if (diff > 0 || (diff < 0 && !short)) return false;
      if (i === 0 && score.pickup && diff === 0) return false;
    }
    const notes = measures.flatMap((measure) => measure.notes);
    return validTies(notes) && notes.some((note) => !note.rest);
  }

  // Only the known fields, so nothing extra is stored. Assumes a valid score.
  function clean(score) {
    const note = (n) => {
      const out = { type: n.type, dots: n.dots ?? 0 };
      if (n.rest) out.rest = true;
      else out.pitch = { step: n.pitch.step, alter: n.pitch.alter, octave: n.pitch.octave };
      if (n.tie) out.tie = n.tie;
      if (n.tuplet) out.tuplet = { actual: n.tuplet.actual, normal: n.tuplet.normal };
      if (n.tupletStart) out.tupletStart = true;
      if (n.tupletStop) out.tupletStop = true;
      return out;
    };
    const out = {
      id: score.id,
      title: score.title.trim().slice(0, MAX_TITLE),
      pickup: score.pickup,
    };
    if (score.firstNumber !== undefined) out.firstNumber = score.firstNumber;
    out.measures = score.measures.map((m) => {
      const measure = {};
      if (m.time) measure.time = [m.time[0], m.time[1]];
      if (m.key) measure.key = { fifths: m.key.fifths, mode: m.key.mode };
      if (m.clef) measure.clef = m.clef;
      if (m.tempo !== undefined) measure.tempo = m.tempo;
      measure.notes = m.notes.map(note);
      return measure;
    });
    return out;
  }

  // Measures start..end as a score of their own, for drawing a section: its first measure carries the clef, key,
  // time and tempo in force there, and the measures keep their numbers (firstNumber). Not for storing: a tie into or
  // out of the section is left as it is (drawn as half a tie).
  function excerpt(score, start, end) {
    const measures = resolve(score);
    const first = measures[start];
    return {
      id: score.id,
      title: score.title,
      pickup: score.pickup && start === 0,
      firstNumber: first.number,
      measures: score.measures.slice(start, end + 1).map((m, i) => (i === 0
        ? { time: first.time, key: first.key, clef: first.clef, tempo: first.tempo, notes: m.notes }
        : m)),
    };
  }

  // ---- the editor's (v1) format ----
  // v1 = { id, title, time (beats of x/4), notes: [{ type: Rhythm.TYPES key, step: 0 (C4) .. 11 (G5), accidental }] }.
  // Until the editor grows (expansion 7) it works on v1, so scores within its range are converted both ways.
  const LEGACY_TYPES = {
    w: { type: 'whole', dots: 0 },
    'h.': { type: 'half', dots: 1 },
    h: { type: 'half', dots: 0 },
    'q.': { type: 'quarter', dots: 1 },
    q: { type: 'quarter', dots: 0 },
    e: { type: 'eighth', dots: 0 },
    r: { type: 'quarter', dots: 0, rest: true },
  };
  const LEGACY_TEMPO = 80;
  const LEGACY_MAX_MEASURES = 12;
  const LEGACY_TOP_STEP = 11;

  function fromLegacy(legacy) {
    const eighths = legacy.time * 2;
    const measures = [];
    let count = 0;
    for (const note of legacy.notes) {
      const info = LEGACY_TYPES[note.type];
      const out = info.rest ? { type: info.type, dots: info.dots, rest: true } : {
        type: info.type,
        dots: info.dots,
        pitch: { step: STEPS[note.step % 7], alter: note.accidental, octave: 4 + Math.floor(note.step / 7) },
      };
      (measures[Math.floor(count / eighths)] ||= { notes: [] }).notes.push(out);
      count += Rhythm.TYPES[note.type].length;
    }
    measures[0] = { time: [legacy.time, 4], key: { fifths: 0, mode: 'major' }, clef: 'treble', tempo: LEGACY_TEMPO, notes: measures[0].notes };
    return { id: legacy.id, title: legacy.title, pickup: false, measures };
  }

  // Why the editor can't take this score, or null if it can. The first reason found, for the notice.
  function legacyProblem(score) {
    if (score.pickup) return '못갖춘마디';
    if (score.firstNumber !== undefined && score.firstNumber !== 1) return '마디 번호';
    if (score.measures.length > LEGACY_MAX_MEASURES) return `${LEGACY_MAX_MEASURES + 1}마디 이상`;
    const measures = resolve(score);
    const first = measures[0];
    for (const measure of measures) {
      if (measure.key.fifths !== 0 || measure.key.mode !== 'major') return '조표·단조';
      if (measure.clef !== 'treble') return '낮은음자리표';
      if (measure.time[1] !== 4 || ![2, 3, 4].includes(measure.time[0]) || measure.time[0] !== first.time[0]) {
        return '박자';
      }
      if (measure.tempo !== LEGACY_TEMPO) return '빠르기';
      if (cmp(filled(measure.notes), measureLength(measure.time)) !== 0) return '덜 찬 마디';
      for (const note of measure.notes) {
        if (note.tie) return '붙임줄';
        if (note.tuplet) return '잇단음표';
        if (!legacyType(note)) return '음표 길이';
        if (!note.rest) {
          if (Math.abs(note.pitch.alter) > 1) return '겹임시표';
          const step = legacyStep(note.pitch);
          if (step < 0 || step > LEGACY_TOP_STEP) return '음역';
        }
      }
    }
    return null;
  }

  function legacyType(note) {
    return Object.keys(LEGACY_TYPES).find((key) => {
      const info = LEGACY_TYPES[key];
      return info.type === note.type && info.dots === (note.dots ?? 0) && Boolean(info.rest) === Boolean(note.rest);
    });
  }

  function legacyStep(pitch) {
    return STEPS.indexOf(pitch.step) + 7 * (pitch.octave - 4);
  }

  function toLegacy(score) {
    if (!score || legacyProblem(score)) return null;
    const measures = resolve(score);
    const notes = measures.flatMap((measure) => measure.notes).map((note) => (note.rest
      ? { type: 'r' }
      : { type: legacyType(note), step: legacyStep(note.pitch), accidental: note.pitch.alter }));
    return { id: score.id, title: score.title, time: measures[0].time[0], notes };
  }

  // ---- compact text for scores written in code (examples, tests) ----
  // "E5:16 D#5:16 | A4:8 r:16 C4:16" — pitch (step, # / ## / b / bb, octave) or r, then the length:
  // w h q 8 16 32 with dots, and ~ to tie into the next note. "3[ C5:8 D5:8 E5:8 ]" is a triplet (n:2 by default;
  // "5:4[ ... ]" for others). Measures are separated by |.
  const LENGTHS = { w: 'whole', h: 'half', q: 'quarter', 8: 'eighth', 16: '16th', 32: '32nd' };

  function parseNote(token) {
    const match = token.match(/^(r|([A-G])(##|#|bb|b)?(\d)):(w|h|q|8|16|32)(\.{0,2})(~?)$/);
    if (!match) throw new Error(`Bad note: ${token}`);
    const [, , step, accidental, octave, length, dots, tie] = match;
    const note = { type: LENGTHS[length], dots: dots.length };
    if (step) note.pitch = { step, alter: { '##': 2, '#': 1, b: -1, bb: -2 }[accidental] ?? 0, octave: Number(octave) };
    else note.rest = true;
    if (tie) note.tie = 'start';
    return note;
  }

  function parseMeasures(text) {
    const measures = [];
    let previous = null;
    for (const part of text.split('|')) {
      const notes = [];
      let tuplet = null;
      for (const token of part.trim().split(/\s+/).filter(Boolean)) {
        const open = token.match(/^(\d+)(?::(\d+))?\[$/);
        if (open) {
          tuplet = { actual: Number(open[1]), normal: Number(open[2] ?? 2), first: true };
          continue;
        }
        if (token === ']') {
          notes[notes.length - 1].tupletStop = true;
          tuplet = null;
          continue;
        }
        const note = parseNote(token);
        if (previous && (previous.tie === 'start' || previous.tie === 'both')) note.tie = note.tie ? 'both' : 'stop';
        if (tuplet) {
          note.tuplet = { actual: tuplet.actual, normal: tuplet.normal };
          if (tuplet.first) note.tupletStart = true;
          tuplet.first = false;
        }
        notes.push(note);
        previous = note;
      }
      measures.push({ notes });
    }
    return measures;
  }

  // { id, title, pickup, time, key, clef, tempo, music } -> score. Mid-score changes: changes: { index: { key, ... } }.
  function build({ id, title, pickup = false, time, key, clef, tempo, music, changes = {} }) {
    const measures = parseMeasures(music).map((measure, i) => ({ ...(changes[i] || {}), ...measure }));
    measures[0] = { time, key, clef, tempo, notes: measures[0].notes };
    return clean({ id, title, pickup, measures });
  }

  window.Notation = {
    TYPES, STEPS, SEMITONES, MAX_TITLE, TEMPO_RANGE,
    frac, add, sub, mul, cmp, toNumber, ZERO,
    duration, midi, measureLength, filled, resolve,
    isValid, clean, excerpt,
    fromLegacy, toLegacy, legacyProblem,
    parseMeasures, build,
  };
})();
