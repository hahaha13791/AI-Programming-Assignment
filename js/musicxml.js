(function () {
  // MusicXML files (.musicxml / .xml, or compressed .mxl) read in the browser: the file's bytes → an XML document
  // → the parts and, inside each part, the lines (a staff and voice) that can be practised. Expansion 6: one line
  // is moved over to the v2 score format unchanged (TODO 36).

  class ImportError extends Error {}

  const MESSAGES = {
    empty: '빈 파일이에요.',
    notXml: 'MusicXML 파일이 아니에요.',
    noScore: '압축 파일 안에 악보(MusicXML)가 없어요.',
    timewise: 'score-timewise 형식이라 불러올 수 없어요. 악보 프로그램에서 MusicXML로 다시 내보내 주세요.',
    noPitched: '음높이가 있는 파트가 없어요.',
  };

  // Text from bytes: a byte-order mark first (UTF-8, UTF-16 LE/BE), then UTF-16 without one ("<" followed by a zero
  // byte), then the encoding the XML declaration names, else UTF-8.
  function decode(bytes) {
    const [a, b, c] = bytes;
    let label = 'utf-8';
    let skip = 0;
    if (a === 0xef && b === 0xbb && c === 0xbf) skip = 3;
    else if (a === 0xff && b === 0xfe) [label, skip] = ['utf-16le', 2];
    else if (a === 0xfe && b === 0xff) [label, skip] = ['utf-16be', 2];
    else if (a === 0x3c && b === 0x00) label = 'utf-16le';
    else if (a === 0x00 && b === 0x3c) label = 'utf-16be';
    else {
      const head = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
      const declared = head.match(/^<\?xml[^>]*encoding\s*=\s*["']([A-Za-z0-9._-]+)["']/);
      if (declared) label = declared[1].toLowerCase();
    }
    try {
      return new TextDecoder(label).decode(bytes.subarray(skip));
    } catch {
      return new TextDecoder('utf-8').decode(bytes.subarray(skip));
    }
  }

  function parseXml(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new ImportError(MESSAGES.notXml);
    const root = doc.documentElement.nodeName;
    if (root === 'score-timewise') throw new ImportError(MESSAGES.timewise);
    if (root !== 'score-partwise') throw new ImportError(MESSAGES.notXml);
    return doc;
  }

  // The score inside an .mxl: the rootfile META-INF/container.xml names, else the first MusicXML-looking file.
  async function scoreInZip(bytes) {
    const list = Unzip.entries(bytes).filter((entry) => !entry.name.endsWith('/'));
    let path = null;
    const container = list.find((entry) => entry.name === 'META-INF/container.xml');
    if (container) {
      const xml = new DOMParser().parseFromString(decode(await Unzip.extract(bytes, container)), 'application/xml');
      const roots = [...xml.getElementsByTagName('rootfile')];
      const root = roots.find((r) => !r.getAttribute('media-type') || r.getAttribute('media-type').includes('musicxml')) ?? roots[0];
      path = root?.getAttribute('full-path') ?? null;
    }
    const entry = list.find((e) => e.name === path)
      ?? list.find((e) => !e.name.startsWith('META-INF/') && /\.(musicxml|xml)$/i.test(e.name));
    if (!entry) throw new ImportError(MESSAGES.noScore);
    return Unzip.extract(bytes, entry);
  }

  // A File (or Blob with a name) → { doc, fileName }. Throws ImportError with a message to show.
  async function read(file) {
    let bytes = new Uint8Array(await file.arrayBuffer());
    if (!bytes.length) throw new ImportError(MESSAGES.empty);
    if (Unzip.isZip(bytes)) {
      try {
        bytes = await scoreInZip(bytes);
      } catch (error) {
        if (error instanceof Unzip.ZipError) throw new ImportError(`${error.message}.`);
        throw error;
      }
    }
    return { doc: parseXml(decode(bytes)), fileName: file.name || '' };
  }

  const childText = (element, name) => {
    for (const child of element.children) if (child.nodeName === name) return child.textContent.trim();
    return null;
  };
  const hasChild = (element, name) => [...element.children].some((child) => child.nodeName === name);

  function titleOf(doc, fileName) {
    const work = doc.querySelector('score-partwise > work > work-title')?.textContent.trim();
    const movement = doc.querySelector('score-partwise > movement-title')?.textContent.trim();
    return work || movement || fileName.replace(/\.[^.]+$/, '').trim() || '불러온 악보';
  }

  // The parts that have pitched notes, each with its lines: { title, parts: [{ id, name, lines: [{ staff, voice,
  // label, count }] }], skipped: [names of parts without pitched notes (percussion)] }. count: notes and chords
  // (a chord counts once), grace notes included.
  function candidates(doc, fileName = '') {
    const names = {};
    [...doc.querySelectorAll('part-list > score-part')].forEach((scorePart, i) => {
      const name = childText(scorePart, 'part-name') || childText(scorePart, 'part-abbreviation');
      names[scorePart.getAttribute('id')] = name || `파트 ${i + 1}`;
    });
    const parts = [];
    const skipped = [];
    [...doc.querySelectorAll('score-partwise > part')].forEach((part, i) => {
      const id = part.getAttribute('id');
      const name = names[id] ?? `파트 ${i + 1}`;
      const lines = new Map();
      let staves = 1;
      for (const staffCount of part.querySelectorAll('attributes > staves')) staves = Math.max(staves, Number(staffCount.textContent) || 1);
      for (const note of part.getElementsByTagName('note')) {
        if (!hasChild(note, 'pitch') || hasChild(note, 'chord')) continue;
        const staff = Number(childText(note, 'staff')) || 1;
        const voice = childText(note, 'voice') || '1';
        const key = `${staff}/${voice}`;
        if (!lines.has(key)) lines.set(key, { staff, voice, count: 0 });
        lines.get(key).count++;
      }
      if (!lines.size) {
        skipped.push(name);
        return;
      }
      const sorted = [...lines.values()].sort((a, b) => a.staff - b.staff || Number(a.voice) - Number(b.voice) || a.voice.localeCompare(b.voice));
      for (const line of sorted) {
        const inStaff = sorted.filter((other) => other.staff === line.staff);
        const label = [];
        if (staves > 1 || new Set(sorted.map((l) => l.staff)).size > 1) {
          label.push(staves === 2 ? (line.staff === 1 ? '위 보표' : '아래 보표') : `보표 ${line.staff}`);
        }
        if (inStaff.length > 1) label.push(`성부 ${inStaff.indexOf(line) + 1}`);
        line.label = label.join(' · ') || '성부 1';
      }
      parts.push({ id, name, lines: sorted });
    });
    if (!parts.length) throw new ImportError(MESSAGES.noPitched);
    return { title: titleOf(doc, fileName), parts, skipped };
  }

  // ---- one line → a v2 score (PRD #4-G-3) ----
  // Nothing is bent to fit: what the format can't hold is refused with the reason.
  const N = Notation;
  const ZERO = N.ZERO;
  const never = (what) => new ImportError(`불러올 수 없어요(${what}).`);
  const NOTE_TYPES = ['whole', 'half', 'quarter', 'eighth', '16th', '32nd', '64th'];
  const OTHER_TYPES = {
    '128th': '128분음표', '256th': '256분음표', '512th': '512분음표', '1024th': '1024분음표',
    breve: '겹온음표', long: '롱가', maxima: '맥시마',
  };
  const DEFAULT_TEMPO = 120; // MusicXML's default when a score gives none
  const maxOf = (a, b) => (N.cmp(a, b) >= 0 ? a : b);
  const childrenOf = (element, name) => [...element.children].filter((c) => c.nodeName === name);
  const childOf = (element, name) => childrenOf(element, name)[0] ?? null;

  // a / b as a fraction, for MusicXML numbers that may have decimals.
  function ratio(a, b) {
    const scale = Number.isInteger(a) && Number.isInteger(b) ? 1 : 1e6;
    return N.frac(Math.round(a * scale), Math.round(b * scale));
  }

  // A part measure by measure: each child with its start (a fraction of a whole note from the measure's start),
  // and the measure's length as written (where its furthest voice ends).
  function walkPart(part) {
    let divisions = 1;
    return childrenOf(part, 'measure').map((measure) => {
      let cursor = ZERO;
      let previous = ZERO; // where the last non-chord note started
      let length = ZERO;
      const items = [];
      const lengthOf = (element) => ratio(Number(childText(element, 'duration')) || 0, 4 * divisions);
      for (const element of measure.children) {
        switch (element.nodeName) {
          case 'attributes': {
            const value = Number(childText(element, 'divisions'));
            if (value > 0) divisions = value;
            items.push({ element, kind: 'attributes', start: cursor });
            break;
          }
          case 'note': {
            const grace = hasChild(element, 'grace');
            const chord = hasChild(element, 'chord');
            const duration = grace ? ZERO : lengthOf(element);
            const start = chord ? previous : cursor;
            items.push({ element, kind: 'note', start, duration, grace, chord });
            if (!chord) {
              previous = cursor;
              cursor = N.add(cursor, duration);
            }
            break;
          }
          case 'backup':
            cursor = N.sub(cursor, lengthOf(element));
            if (N.cmp(cursor, ZERO) < 0) cursor = ZERO;
            break;
          case 'forward':
            cursor = N.add(cursor, lengthOf(element));
            break;
          case 'direction': {
            const offset = Number(childText(element, 'offset')) || 0;
            items.push({ element, kind: 'direction', start: N.add(cursor, ratio(offset, 4 * divisions)) });
            break;
          }
          case 'sound':
          case 'barline':
            items.push({ element, kind: element.nodeName, start: cursor });
            break;
          default:
        }
        length = maxOf(length, cursor);
      }
      return { items, length, number: measure.getAttribute('number') ?? '', implicit: measure.getAttribute('implicit') === 'yes' };
    });
  }

  // Repeat marks written as words, and those that go at a measure's end (the rest go at its start).
  const REPEAT_WORDS = /\b(D\.\s?C\.?|D\.\s?S\.?|DC|DS|Da\s+Capo|Dal\s+Segno|Fine|Coda|Segno)\b/i;
  const END_WORDS = /^(D\.\s?C|D\.\s?S|DC|DS|Da\s+Capo|Dal\s+Segno|Fine|To\s+Coda)/i;
  // A jump only played (<sound>), with no words for it: the usual words.
  const SOUND_WORDS = { dacapo: 'D.C.', dalsegno: 'D.S.', fine: 'Fine', tocoda: 'To Coda' };
  const DOUBLE_BARS = ['light-light', 'heavy-heavy', 'heavy-light'];

  // A measure's segno, coda and D.C./D.S./Fine/To Coda marks, from its directions and sounds:
  // [{ kind: 'segno'|'coda'|'text', text, at: 'start'|'end' }].
  function marksOf(items) {
    const marks = [];
    for (const item of items) {
      if (item.kind !== 'direction' && item.kind !== 'sound') continue;
      const signs = [];
      const words = [];
      if (item.kind === 'direction') {
        for (const type of childrenOf(item.element, 'direction-type')) {
          for (const child of type.children) {
            if (child.nodeName === 'segno' || child.nodeName === 'coda') signs.push(child.nodeName);
            else if (child.nodeName === 'words') words.push(child.textContent);
          }
        }
      }
      let text = words.join(' ').replace(/\s+/g, ' ').trim();
      if (!REPEAT_WORDS.test(text)) text = '';
      const sound = item.kind === 'sound' ? item.element : childOf(item.element, 'sound');
      if (!text && sound) text = Object.entries(SOUND_WORDS).find(([name]) => sound.hasAttribute(name))?.[1] ?? '';
      const at = text && END_WORDS.test(text) ? 'end' : 'start';
      for (const kind of signs) marks.push({ kind, at });
      if (text) marks.push({ kind: 'text', text: text.slice(0, N.MAX_MARK), at });
    }
    return marks;
  }

  // Quarter notes per minute from a direction or sound: <sound tempo>, else a plain <metronome> (a dotted beat
  // unit converted: ♩. = 60 → 90). null if it gives none.
  function tempoOf(element) {
    const sound = element.nodeName === 'sound' ? element : element.querySelector('sound');
    const fromSound = Number(sound?.getAttribute('tempo'));
    if (fromSound > 0) return fromSound;
    const metronome = element.nodeName === 'direction' ? element.querySelector('direction-type > metronome') : null;
    if (!metronome) return null;
    const units = childrenOf(metronome, 'beat-unit');
    const perMinute = Number(childText(metronome, 'per-minute'));
    if (units.length !== 1 || !(perMinute > 0)) return null;
    const type = units[0].textContent.trim();
    if (!NOTE_TYPES.includes(type)) return null;
    return perMinute * N.toNumber(N.duration({ type, dots: childrenOf(metronome, 'beat-unit-dot').length })) * 4;
  }

  // The score's tempo at the start of each measure, from every part's directions (one written at a measure's very end
  // starts the next measure), and the changes inside each measure: { starts: [tempo or undefined],
  // inside: [[{ offset, tempo }, ...] per measure] }.
  function tempoMap(walked, count) {
    const changes = [];
    for (const measures of walked) {
      measures.forEach((m, i) => {
        for (const item of m.items) {
          if (item.kind !== 'direction' && item.kind !== 'sound') continue;
          const tempo = tempoOf(item.element);
          if (tempo === null) continue;
          const atEnd = N.cmp(m.length, ZERO) > 0 && N.cmp(item.start, m.length) >= 0;
          changes.push(atEnd ? { index: i + 1, offset: ZERO, tempo } : { index: i, offset: item.start, tempo });
        }
      });
    }
    const starts = new Array(count).fill(undefined);
    const inside = Array.from({ length: count }, () => []);
    let current;
    for (let i = 0; i < count; i++) {
      const here = changes.filter((c) => c.index === i).sort((a, b) => N.cmp(a.offset, b.offset));
      const atStart = here.find((c) => N.cmp(c.offset, ZERO) === 0);
      if (atStart) starts[i] = atStart.tempo;
      current = starts[i] ?? current;
      for (const change of here) {
        if (N.cmp(change.offset, ZERO) <= 0 || change.tempo === current) continue;
        // Parts often repeat the same mark: one change per position.
        if (inside[i].some((c) => N.cmp(c.offset, change.offset) === 0)) continue;
        inside[i].push({ offset: change.offset, tempo: change.tempo });
        current = change.tempo;
      }
    }
    return { starts, inside };
  }

  // A pitch moved by an interval of diatonic steps and semitones (a transposing part to concert pitch).
  function transpose(pitch, interval) {
    if (!interval) return pitch;
    const index = N.STEPS.indexOf(pitch.step) + 7 * pitch.octave + interval.diatonic;
    const step = N.STEPS[((index % 7) + 7) % 7];
    const octave = Math.floor(index / 7);
    const alter = N.midi(pitch) + interval.chromatic - N.midi({ step, alter: 0, octave });
    if (Math.abs(alter) > 2) throw never('실음으로 옮기면 세 겹 임시표가 되는 음');
    return { step, alter, octave };
  }

  // Key signatures by their major tonic: C 0, G 1, … F -1. A signature moves with its tonic.
  const MAJOR_FIFTHS = { C: 0, D: 2, E: 4, F: -1, G: 1, A: 3, B: 5 };
  function transposeKey(key, interval) {
    if (!interval) return key;
    const step = N.STEPS[(((key.fifths * 4) % 7) + 7) % 7];
    const tonic = { step, alter: (key.fifths - MAJOR_FIFTHS[step]) / 7, octave: 4 };
    const moved = transpose(tonic, interval);
    const fifths = MAJOR_FIFTHS[moved.step] + 7 * moved.alter;
    if (fifths < -7 || fifths > 7) throw never('실음 조표가 ♯·♭ 7개를 넘음');
    return { fifths, mode: key.mode };
  }

  const MODES = { major: 'major', ionian: 'major', minor: 'minor', aeolian: 'minor', none: 'major' };

  function keyOf(element, notices) {
    if (hasChild(element, 'key-step')) throw never('특수한 조표');
    const fifths = Number(childText(element, 'fifths'));
    if (!Number.isInteger(fifths) || fifths < -7 || fifths > 7) throw never('조표');
    const name = (childText(element, 'mode') || 'major').toLowerCase();
    if (!MODES[name]) notices.add('선법(도리아 등)은 장조로 보았어요');
    return { fifths, mode: MODES[name] ?? 'major' };
  }

  // { time: [beats, beatType], symbol: 'common'|'cut' when written as C or ¢ }.
  function timeOf(element) {
    if (hasChild(element, 'senza-misura')) throw never('무박자');
    const beats = childrenOf(element, 'beats');
    const types = childrenOf(element, 'beat-type');
    if (beats.length !== 1 || types.length !== 1 || /\D/.test(beats[0].textContent.trim())) throw never('혼합 박자');
    const time = [Number(beats[0].textContent), Number(types[0].textContent)];
    if (!(time[0] >= 1 && time[0] <= 32) || ![1, 2, 4, 8, 16, 32].includes(time[1])) throw never(`박자 ${time.join('/')}`);
    const written = element.getAttribute('symbol');
    const symbol = written === 'common' && String(time) === '4,4' ? 'common' : written === 'cut' && String(time) === '2,2' ? 'cut' : undefined;
    return { time, symbol };
  }

  const CLEF_OF = { G2: 'treble', 'G2-1': 'treble-8vb', 'G2+1': 'treble-8va', F4: 'bass', 'F4-1': 'bass-8vb', 'F4+1': 'bass-8va', C3: 'alto', C4: 'tenor' };

  function clefOf(element) {
    const sign = (childText(element, 'sign') || '').toUpperCase();
    const line = Number(childText(element, 'line')) || ({ G: 2, F: 4, C: 3 })[sign];
    const octave = Number(childText(element, 'clef-octave-change')) || 0;
    if (sign === 'TAB') throw never('TAB 보표');
    if (sign === 'PERCUSSION' || sign === 'NONE') throw never('음높이 없는 보표');
    const name = `${sign}${line}${octave ? (octave > 0 ? `+${octave}` : octave) : ''}`;
    if (!CLEF_OF[name]) throw never(`음자리표 ${name}`);
    return CLEF_OF[name];
  }

  // Rests that fill a gap (a voice silent for a while, a measure rest), largest first.
  const REST_SIZES = NOTE_TYPES.flatMap((type) => [1, 0].map((dots) => ({ type, dots, length: N.duration({ type, dots }) })))
    .sort((a, b) => N.cmp(b.length, a.length));
  function restsFor(length) {
    const rests = [];
    let left = length;
    while (N.cmp(left, ZERO) > 0) {
      const size = REST_SIZES.find((r) => N.cmp(r.length, left) <= 0);
      if (!size) throw never('쉼표로 채울 수 없는 빈 자리');
      rests.push({ type: size.type, dots: size.dots, rest: true });
      left = N.sub(left, size.length);
    }
    return rests;
  }

  // A pitched MusicXML note's pitch (to concert pitch) and its file tie marks.
  function pitchOf(element, interval) {
    const pitch = childOf(element, 'pitch');
    const alter = Number(childText(pitch, 'alter') || 0);
    if (!Number.isInteger(alter) || Math.abs(alter) > 2) throw never('미분음');
    const ties = childrenOf(element, 'tie').map((tie) => tie.getAttribute('type'));
    const marks = ties.length ? ties : [...element.querySelectorAll('notations > tied')].map((tie) => tie.getAttribute('type'));
    return {
      pitch: transpose({ step: childText(pitch, 'step'), alter, octave: Number(childText(pitch, 'octave')) }, interval),
      tieStart: marks.includes('start'),
      tieStop: marks.includes('stop'),
    };
  }

  // A grace note (and its chord): its written type (an eighth if the file gives none), a slash if it has one. It takes
  // no time; a tie from it to the note it leads to is a written detail, not kept.
  function graceOf(element, mark, type, dots, interval, chordElements) {
    if (hasChild(element, 'rest')) throw never('쉼표 꾸밈음');
    const written = type || 'eighth';
    if (OTHER_TYPES[written]) throw never(OTHER_TYPES[written]);
    if (!NOTE_TYPES.includes(written) || dots > 2) throw never(`음표 길이 ${written}`);
    const note = { type: written, dots, grace: true, pitch: pitchOf(element, interval).pitch };
    if (mark.getAttribute('slash') === 'yes') note.slash = true;
    if (chordElements.length) {
      note.chord = chordElements.map((member) => ({ pitch: pitchOf(member, interval).pitch }));
      const midis = [note, ...note.chord].map((p) => N.midi(p.pitch));
      if (new Set(midis).size !== midis.length) throw never('같은 음이 겹친 화음');
    }
    return note;
  }

  // One MusicXML note of the chosen line (and the notes of its chord) → a v2 note, with its file tie and tuplet
  // marks kept for the passes after.
  function noteOf(element, length, interval, chordElements = []) {
    if (hasChild(element, 'cue')) throw never('작은 음표(cue)');
    if (hasChild(element, 'unpitched')) throw never('음높이 없는 음');
    let type = childText(element, 'type');
    let dots = childrenOf(element, 'dot').length;
    const graceMark = childOf(element, 'grace');
    if (graceMark) return graceOf(element, graceMark, type, dots, interval, chordElements);
    const modification = childOf(element, 'time-modification');
    const actual = modification ? Number(childText(modification, 'actual-notes')) : 0;
    const normal = modification ? Number(childText(modification, 'normal-notes')) : 0;
    const tuplet = actual && normal && actual !== normal ? { actual, normal } : null;
    if (type && OTHER_TYPES[type]) throw never(OTHER_TYPES[type]);
    if (!type) {
      // No written type: the type and dots whose length matches.
      const found = REST_SIZES.find((size) => N.cmp(tuplet ? N.mul(size.length, N.frac(normal, actual)) : size.length, length) === 0);
      if (!found) throw never('길이를 알 수 없는 음');
      ({ type, dots } = found);
    }
    if (!NOTE_TYPES.includes(type)) throw never(`음표 길이 ${type}`);
    if (dots > 2) throw never('점 세 개');
    const note = { type, dots };
    if (tuplet) note.tuplet = tuplet;
    if (N.cmp(N.duration(note), length) !== 0) throw never('음 길이가 표기와 맞지 않음');
    if (tuplet) note.whole = tuplet;
    if (hasChild(element, 'rest')) {
      note.rest = true;
      if (chordElements.length) throw never('쉼표에 붙은 화음');
    } else {
      Object.assign(note, pitchOf(element, interval));
      if (chordElements.length) {
        note.chord = chordElements.map((member) => {
          if (hasChild(member, 'rest') || hasChild(member, 'unpitched')) throw never('화음 안의 쉼표');
          if ((childText(member, 'type') || type) !== type || childrenOf(member, 'dot').length !== dots) throw never('길이가 다른 화음 음');
          return pitchOf(member, interval);
        });
        const midis = [note, ...note.chord].map((p) => N.midi(p.pitch));
        if (new Set(midis).size !== midis.length) throw never('같은 음이 겹친 화음');
      }
    }
    // The file's tuplet brackets on this note, each with its own ratio when the file gives it (needed for a tuplet
    // inside a tuplet, where the note's time-modification is the two ratios multiplied).
    const brackets = [...element.querySelectorAll('notations > tuplet')];
    const bracketRatio = (b) => {
      const a = Number(b.querySelector('tuplet-actual > tuplet-number')?.textContent);
      const n = Number(b.querySelector('tuplet-normal > tuplet-number')?.textContent);
      return a > 0 && n > 0 ? { actual: a, normal: n } : null;
    };
    note.bracketStarts = brackets.filter((b) => b.getAttribute('type') === 'start').map(bracketRatio);
    note.bracketStops = brackets.filter((b) => b.getAttribute('type') === 'stop').length;
    return note;
  }

  // ratio a / ratio b, as a tuplet ratio in lowest terms (the inner of two nested tuplets).
  function divideRatio(a, b) {
    const [actual, normal] = N.frac(a.actual * b.normal, a.normal * b.actual);
    return { actual, normal };
  }

  // Tuplet groups in a measure. A note's time-modification is the whole ratio it is played at; the file's brackets say
  // where groups start and stop and how deep they nest (two levels at most). Without brackets, runs of notes with the
  // same ratio are grouped, each closed when it adds up to `actual` notes of its first note's kind.
  function markTuplets(all) {
    // Grace notes take no time and belong to no tuplet: groups are made of the other notes.
    const notes = all.filter((note) => !note.grace);
    if (notes.some((note) => note.bracketStarts?.length)) {
      markNestedTuplets(notes);
      return;
    }
    let open = null;
    let sum = ZERO;
    let unit = null;
    notes.forEach((note, i) => {
      if (!note.tuplet) {
        if (open) throw never('잇단음표 묶음');
        return;
      }
      if (open && (open.actual !== note.tuplet.actual || open.normal !== note.tuplet.normal)) {
        open = null; // a new run with another ratio
      }
      if (!open) {
        open = note.tuplet;
        note.tupletStart = true;
        sum = ZERO;
        unit = N.duration({ type: note.type, dots: note.dots });
      }
      sum = N.add(sum, N.duration({ type: note.type, dots: note.dots }));
      const full = N.cmp(sum, N.mul(unit, N.frac(open.actual))) >= 0;
      const next = notes[i + 1];
      if (full || !next?.tuplet || next.tuplet.actual !== open.actual || next.tuplet.normal !== open.normal) {
        note.tupletStop = true;
        open = null;
      }
    });
  }

  // Groups from the file's brackets: [{ first, last, depth, ratio }], then each note's level-1 (and level-2) ratio. An
  // outer group's ratio is its bracket's own, else the ratio of its notes outside the inner group; the inner one is
  // what is left of the note's whole ratio.
  function markNestedTuplets(notes) {
    const open = [];
    const groups = [];
    notes.forEach((note, i) => {
      for (const ratioOfBracket of note.bracketStarts ?? []) {
        open.push({ first: i, depth: open.length + 1, ratio: ratioOfBracket });
        if (open.length > 2) throw never('세 겹 잇단음표');
      }
      if (note.tuplet && !open.length) throw never('괄호 밖 잇단음표');
      if (!note.tuplet && open.length) throw never('잇단음표 묶음');
      note.depth = open.length;
      for (let k = 0; k < (note.bracketStops ?? 0); k++) {
        const group = open.pop();
        if (!group) throw never('잇단음표 묶음');
        groups.push({ ...group, last: i });
      }
    });
    if (open.length) throw never('마디를 넘는 잇단음표');
    const outerOf = (inner) => groups.find((g) => g.depth === 1 && g.first <= inner.first && g.last >= inner.last);
    for (const group of groups.filter((g) => g.depth === 1)) {
      const members = notes.slice(group.first, group.last + 1);
      if (!group.ratio) {
        const plain = members.find((note) => note.depth === 1);
        group.ratio = plain ? plain.tuplet : null;
      }
      if (!group.ratio) throw never('잇단음표 비율');
      members.forEach((note, k) => {
        Object.assign(note, { tuplet: note.depth === 1 ? note.tuplet : group.ratio });
        if (k === 0) note.tupletStart = true;
        if (k === members.length - 1) note.tupletStop = true;
      });
    }
    for (const group of groups.filter((g) => g.depth === 2)) {
      const outer = outerOf(group);
      if (!outer) throw never('잇단음표 묶음');
      const members = notes.slice(group.first, group.last + 1);
      members.forEach((note, k) => {
        // The whole ratio was kept in tuplet2 for now (see below); the inner one is what the outer one leaves.
        note.tuplet2 = divideRatio(note.whole, outer.ratio);
        if (note.tuplet2.actual === note.tuplet2.normal) throw never('잇단음표 비율');
        if (k === 0) note.tuplet2Start = true;
        if (k === members.length - 1) note.tuplet2Stop = true;
      });
    }
  }

  // Keeps a tie only where the next note of the line ends it on the same pitch (in a chord, pitch by pitch).
  // Returns how many were dropped.
  function pairTies(notes) {
    let dropped = 0;
    const entries = (note) => (note && !note.rest ? [note, ...(note.chord ?? [])] : []);
    notes.forEach((note, i) => {
      for (const entry of entries(note)) {
        const find = (other, mark) => entries(other).some((x) => x[mark] && N.midi(x.pitch) === N.midi(entry.pitch));
        const starts = entry.tieStart && find(notes[i + 1], 'tieStop');
        const stops = entry.tieStop && find(notes[i - 1], 'tieStart');
        if (entry.tieStart && !starts) dropped++;
        entry.tie = starts && stops ? 'both' : starts ? 'start' : stops ? 'stop' : undefined;
      }
    });
    for (const note of notes) {
      if (note.tie === undefined) delete note.tie;
      if (note.chord) {
        note.chord = note.chord.map(({ pitch, tie }) => (tie ? { pitch, tie } : { pitch }));
      }
    }
    return dropped;
  }

  // An element for the chosen staff: no number (every staff) or that staff's number.
  const forStaff = (element, staff) => !element.hasAttribute('number') || Number(element.getAttribute('number')) === staff;

  // The chosen line of a part → { score (v2, id 'import'), notices: [one-line notes for the user] }.
  function convert(doc, partIndex, lineIndex, fileName = '') {
    const listed = candidates(doc, fileName);
    const info = listed.parts[partIndex];
    const line = info?.lines[lineIndex];
    if (!line) throw new ImportError('고른 선율을 찾지 못했어요.');
    const allParts = childrenOf(doc.documentElement, 'part');
    const walked = allParts.map(walkPart);
    const measures = walked[allParts.findIndex((p) => p.getAttribute('id') === info.id)];
    if (!measures.length) throw new ImportError('마디가 없어요.');
    const { starts: tempos, inside: tempoInside } = tempoMap(walked, measures.length);
    const concert = Boolean(doc.querySelector('concert-score'));
    const notices = new Set();
    let time = null;
    let key = null;
    let writtenKey = { fifths: 0, mode: 'major' };
    let endClef = null; // the clef in force at the end of the measure before
    let timeSymbol;
    let interval = null;
    let tempo = null;
    let pending = {}; // changes written at a measure's end, for the next measure
    let pickup = false;
    let ending = null; // the text of the ending bracket open now
    const out = [];

    measures.forEach((m, i) => {
      const attrs = pending;
      pending = {};
      const events = [];
      const inside = tempoInside[i].map((c) => ({ start: c.offset, tempo: c.tempo })); // changes inside: clef, tempo
      let inLine = false; // whether the last chord head was in the chosen line
      for (const item of m.items) {
        if (item.kind === 'note') {
          // A chord's other notes belong to their head's line, even written on the other staff (a cross-staff chord).
          if (item.chord) {
            if (!inLine) continue;
            const head = events[events.length - 1];
            if (!head || N.cmp(head.start, item.start) !== 0) throw never('화음 머리 없는 화음 음');
            head.chordElements.push(item.element);
            continue;
          }
          const staff = Number(childText(item.element, 'staff')) || 1;
          const voice = childText(item.element, 'voice') || '1';
          inLine = staff === line.staff && voice === line.voice;
          if (!inLine) continue;
          events.push({ ...item, chordElements: [] });
          continue;
        }
        if (item.kind !== 'attributes') continue;
        const atStart = N.cmp(item.start, ZERO) === 0;
        const atEnd = !atStart && N.cmp(item.start, m.length) >= 0;
        const target = atEnd ? pending : attrs;
        // A clef may change inside a measure (from the next note on). A key, time or transposition change there is
        // practically never written, and isn't held.
        const change = (name, value, same) => {
          if (atStart || atEnd || same) target[name] = value;
          else if (name === 'clef') inside.push({ start: item.start, clef: value });
          else throw never({ writtenKey: '마디 중간 조 바뀜', time: '마디 중간 박자 바뀜', interval: '마디 중간 이조 바뀜' }[name]);
        };
        for (const t of childrenOf(item.element, 'transpose')) {
          if (concert || !forStaff(t, line.staff)) continue;
          const octaves = Number(childText(t, 'octave-change')) || 0;
          const diatonic = (Number(childText(t, 'diatonic')) || 0) + 7 * octaves;
          const chromatic = (Number(childText(t, 'chromatic')) || 0) + 12 * octaves;
          const next = diatonic || chromatic ? { diatonic, chromatic } : null;
          change('interval', next, JSON.stringify(next) === JSON.stringify(interval));
        }
        for (const k of childrenOf(item.element, 'key')) {
          if (forStaff(k, line.staff)) change('writtenKey', keyOf(k, notices), false);
        }
        for (const t of childrenOf(item.element, 'time')) {
          if (!forStaff(t, line.staff)) continue;
          const value = timeOf(t);
          change('time', value, String(value.time) === String(time) && value.symbol === timeSymbol);
        }
        for (const c of childrenOf(item.element, 'clef')) {
          if (!forStaff(c, line.staff)) continue;
          const value = clefOf(c);
          change('clef', value, false);
        }
      }
      if ('interval' in attrs) interval = attrs.interval;
      if (attrs.writtenKey) writtenKey = attrs.writtenKey;
      if (interval) notices.add('실음으로 옮겼어요');
      const measure = {};
      const nextTime = attrs.time ?? (time ? { time, symbol: timeSymbol } : { time: [4, 4] });
      const nextKey = transposeKey(writtenKey, interval);
      const nextClef = attrs.clef ?? endClef ?? 'treble';
      if (String(nextTime.time) !== String(time) || nextTime.symbol !== timeSymbol) {
        measure.time = time = nextTime.time;
        timeSymbol = nextTime.symbol;
        if (timeSymbol) measure.timeSymbol = timeSymbol;
      }
      if (JSON.stringify(nextKey) !== JSON.stringify(key)) measure.key = key = nextKey;
      if (nextClef !== endClef) measure.clef = nextClef;
      endClef = nextClef;
      if (i === 0 && tempos[0] === undefined) notices.add(`빠르기 표시가 없어 ♩=${DEFAULT_TEMPO}`);
      const nextTempo = tempos[i] ?? tempo ?? DEFAULT_TEMPO;
      if (nextTempo !== tempo) measure.tempo = tempo = nextTempo;
      if (m.implicit && i > 0) measure.implicit = true;

      // Repeat signs as written: barlines and endings of this part, marks from every part (parts often repeat them).
      const previous = out[out.length - 1];
      const endings = [];
      for (const item of m.items) {
        if (item.kind !== 'barline') continue;
        const location = item.element.getAttribute('location') || 'right';
        const style = childText(item.element, 'bar-style');
        const repeat = childOf(item.element, 'repeat')?.getAttribute('direction');
        if (location === 'middle') {
          if (repeat) throw never('마디 중간 도돌이표');
          continue;
        }
        if (location === 'left') {
          if (repeat === 'forward') measure.repeatStart = true;
          else if (DOUBLE_BARS.includes(style) && previous && !previous.repeatEnd) previous.barline = 'double';
        } else if (repeat === 'backward') {
          measure.repeatEnd = true;
          delete measure.barline;
        } else if (!measure.repeatEnd && DOUBLE_BARS.includes(style)) measure.barline = 'double';
        else if (!measure.repeatEnd && style === 'light-heavy') measure.barline = 'final';
        for (const e of childrenOf(item.element, 'ending')) {
          const number = (e.getAttribute('number') ?? '').trim();
          const text = (e.textContent.replace(/\s+/g, ' ').trim() || (number ? `${number}.` : '')).slice(0, N.MAX_MARK);
          endings.push({ type: e.getAttribute('type'), text });
        }
      }
      for (const e of endings.filter((x) => x.type === 'start' && x.text)) {
        if (ending && previous?.ending && !previous.ending.end) previous.ending.end = 'open';
        ending = e.text;
        measure.ending = { text: ending, start: true };
      }
      if (!measure.ending && ending) measure.ending = { text: ending };
      const stop = endings.find((x) => x.type === 'stop' || x.type === 'discontinue');
      if (stop && measure.ending) {
        measure.ending.end = stop.type === 'stop' ? 'stop' : 'open';
        ending = null;
      }
      const marks = [];
      const seen = new Set();
      for (const part of walked) {
        for (const mark of marksOf(part[i]?.items ?? [])) {
          const key = `${mark.kind}|${mark.text}|${mark.at}`;
          if (!seen.has(key)) marks.push(mark);
          seen.add(key);
        }
      }
      if (marks.length) measure.marks = marks;

      // The measure's length: as written (its furthest voice), or a whole measure when it is empty.
      const full = N.measureLength(time);
      const length = N.cmp(m.length, ZERO) > 0 ? m.length : full;
      const longer = N.cmp(length, full);
      if (longer > 0) throw never('박자보다 긴 마디');
      if (longer < 0 && i === 0) pickup = true;

      const notes = [];
      const starts = []; // where each note starts in the measure
      let cursor = ZERO;
      const fill = (gap) => {
        for (const rest of restsFor(gap)) {
          starts.push(cursor);
          notes.push(rest);
          cursor = N.add(cursor, N.duration(rest));
        }
      };
      for (const event of events) {
        const gap = N.cmp(event.start, cursor);
        if (gap < 0) throw never('한 성부 안에서 겹치는 음');
        if (gap > 0) fill(N.sub(event.start, cursor));
        starts.push(event.start);
        const rest = childOf(event.element, 'rest');
        // A measure rest: marked as one, or a rest filling the whole measure with no type or the whole-rest type
        // (older files write a whole rest for a full measure in any time).
        const type = childText(event.element, 'type');
        const wholeMeasure = rest && (rest.getAttribute('measure') === 'yes'
          || ((!type || type === 'whole') && N.cmp(event.start, ZERO) === 0 && N.cmp(event.duration, length) === 0));
        if (wholeMeasure) {
          starts.pop();
          fill(event.duration);
        } else {
          notes.push(noteOf(event.element, event.duration, interval, event.chordElements));
          cursor = N.add(event.start, event.duration);
        }
      }
      if (N.cmp(cursor, length) > 0) throw never('박자보다 긴 마디');
      if (N.cmp(cursor, length) < 0) fill(N.sub(length, cursor));
      markTuplets(notes);

      // Changes inside the measure go on the first note at or after them; one after the last note starts the next
      // measure instead.
      inside.sort((a, b) => N.cmp(a.start, b.start));
      for (const change of inside) {
        const k = starts.findIndex((start) => N.cmp(start, change.start) >= 0);
        if (k < 0) {
          if (change.clef) pending.clef = change.clef;
          continue;
        }
        if (change.clef) notes[k].clef = change.clef;
        if (change.tempo !== undefined) notes[k].tempo = change.tempo;
      }
      for (const note of notes) {
        if (note.clef) endClef = note.clef;
        if (note.tempo !== undefined) tempo = note.tempo;
      }
      measure.notes = notes;
      out.push(measure);
    });

    const last = out[out.length - 1];
    if (ending && last.ending && !last.ending.end) last.ending.end = 'open';
    const dropped = pairTies(out.flatMap((m) => m.notes));
    if (dropped) notices.add(`이어질 음이 없는 붙임줄 ${dropped}개는 뺐어요`);
    for (const m of out) m.notes = m.notes.map(({ tieStart, tieStop, bracketStarts, bracketStops, whole, depth, ...note }) => note);

    // Measure numbers as printed. Implicit measures (after the first) aren't counted; the counted ones must run on.
    // An implicit pickup takes the number before the first counted measure.
    const counted = measures.filter((m, i) => !(m.implicit && i > 0)).map((m) => Number(m.number));
    const pickupImplicit = measures[0].implicit && counted.length > 1;
    const first = pickupImplicit ? counted[1] - 1 : counted[0];
    const run = counted.every((n, k) => (k === 0 && pickupImplicit) || n === first + k);
    if (!Number.isInteger(first) || first < 0 || !run) throw never('마디 번호가 이어지지 않음');
    const score = { id: 'import', title: listed.title.slice(0, N.MAX_TITLE), pickup, measures: out };
    if (first !== (pickup ? 0 : 1)) score.firstNumber = first;
    if (!N.isValid(score)) throw new ImportError('악보를 옮기지 못했어요.');
    return { score: N.clean(score), notices: [...notices] };
  }

  window.MusicXML = { read, decode, candidates, convert, ImportError, MESSAGES };
})();
