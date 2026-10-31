(function () {
  // Playing part of a v2 score as written: its key and pitches, its rhythm and its tempo (and tempo changes).
  // Tied notes sound once for their whole length; tuplets take their real length; rests are silent. Every note
  // has the same volume (pitch practice, so no downbeat accent).
  const N = Notation;
  const NOTE_SHARE = 0.9; // a note sounds for this share of its length
  const NOTE_PEAK = 0.3;
  const CHORD_PEAK = 0.5; // a chord's notes share this, so many at once don't distort (as in harmony mode)
  // Grace notes run on into the note they lead to (legato), the way each kind is played:
  // - with a slash (acciaccatura): crushed in just before the beat, each this long (at speed 1); the note keeps its
  //   beat.
  // - without a slash but written short (a 16th or shorter): crushed in the same way, but on the beat; the note
  //   starts that much later.
  // - without a slash and written as an eighth or longer (appoggiatura): on the beat, each taking its written length
  //   (at most half the note between them) from the note, which starts that much later.
  // Each sounds until a little into the next one.
  const GRACE_LENGTH = 0.05;
  const GRACE_OVERLAP = 0.03;
  const LONG_GRACE = ['whole', 'half', 'quarter', 'eighth'];
  const TONIC_LENGTH = 0.7;
  // The tonic, then a pause as long as melody mode's: tonic 0.7s + gap 0.15s + a silent beat 0.7s + gap 0.15s.
  const LEAD_IN = 1.7;


  // The reference note for measures start..end: the tonic of the key where they start — "도" in major, "라" in
  // minor (movable do) — in the octave nearest the middle of their range (in a chord, of the line written down).
  function tonicOf(score, start, end, line = 'top') {
    const measures = N.resolve(score);
    const key = measures[start].key;
    const minor = key.mode === 'minor';
    const pc = (((key.fifths * 7 + (minor ? 9 : 0)) % 12) + 12) % 12;
    const pitches = measures.slice(start, end + 1).flatMap((m) => m.notes).filter((n) => !n.rest).map((n) => N.midi(N.lineOf(n, line).pitch));
    const middle = pitches.length ? (Math.min(...pitches) + Math.max(...pitches)) / 2 : 60;
    return { midi: pc + 12 * Math.round((middle - pc) / 12), label: minor ? '라' : '도' };
  }

  // Seconds a note lasts at its measure's tempo (quarter notes per minute) and the chosen speed.
  function seconds(note, tempo, speed) {
    return N.toNumber(N.duration(note)) * 4 * (60 / tempo) / speed;
  }

  // measures start..end (indices, inclusive). tonic: the reference note and a pause first. speed: 1, 0.75, 0.5.
  // A note tied into the range from before it is silent (it belongs to the earlier section); a note tied out of
  // the range sounds for its whole tied length. Returns { events (for Sound.playEvents), total (seconds) }.
  function schedule(score, { start, end, tonic = true, speed = 1, line = 'top' }) {
    const measures = N.resolve(score);
    // Each note with the tempo in force at it (a change inside a measure applies from its note on).
    const all = measures.flatMap((measure, m) => {
      let tempo = measure.tempo;
      return measure.notes.map((note) => {
        tempo = note.tempo ?? tempo;
        return { note, tempo, m };
      });
    });
    const events = tonic ? [{ start: 0, length: TONIC_LENGTH, midi: tonicOf(score, start, end, line).midi, peak: NOTE_PEAK, sustain: false }] : [];
    let time = tonic ? LEAD_IN : 0;
    let total = time;
    // Grace notes waiting for the note they lead to. Returns how much later that note starts (appoggiaturas).
    let graces = [];
    const placeGraces = (item) => {
      if (!graces.length) return 0;
      const onBeat = item && graces.some((grace) => !grace.slash);
      const long = onBeat && graces.some((grace) => !grace.slash && LONG_GRACE.includes(grace.type));
      let slot = GRACE_LENGTH / speed;
      let first = onBeat ? time : time - graces.length * slot;
      if (long) {
        const written = seconds({ type: graces[0].type, dots: graces[0].dots }, item.tempo, speed);
        slot = Math.min(written, seconds(item.note, item.tempo, speed) / 2 / graces.length);
      }
      graces.forEach((grace, n) => {
        for (const pitch of grace.pitches) {
          events.push({
            start: first + n * slot, length: slot + GRACE_OVERLAP, midi: N.midi(pitch.pitch),
            peak: Math.min(NOTE_PEAK, CHORD_PEAK / grace.pitches.length), sustain: true, grace: true,
          });
        }
      });
      const count = graces.length;
      graces = [];
      return onBeat ? slot * count : 0;
    };
    all.forEach((item, k) => {
      if (item.m < start || item.m > end) return;
      if (item.note.grace) {
        graces.push({ pitches: N.pitchesOf(item.note), slash: Boolean(item.note.slash), type: item.note.type, dots: item.note.dots ?? 0 });
        return;
      }
      const delay = placeGraces(item);
      const length = seconds(item.note, item.tempo, speed);
      // Each pitch of a chord sounds on its own: a tied one goes on through the notes its tie reaches.
      const pitches = N.pitchesOf(item.note);
      const peak = Math.min(NOTE_PEAK, CHORD_PEAK / pitches.length);
      for (const pitch of pitches) {
        if (N.tieStops(pitch.tie)) continue;
        const midi = N.midi(pitch.pitch);
        let sounding = length;
        let tie = pitch.tie;
        for (let j = k; N.tieStarts(tie) && all[j + 1]; j++) {
          const next = N.pitchesOf(all[j + 1].note).find((p) => N.tieStops(p.tie) && N.midi(p.pitch) === midi);
          if (!next) break;
          sounding += seconds(all[j + 1].note, all[j + 1].tempo, speed);
          tie = next.tie;
        }
        events.push({ start: time + delay, length: (sounding - delay) * NOTE_SHARE, midi, peak, sustain: true });
        total = Math.max(total, time + sounding);
      }
      time += length;
      total = Math.max(total, time);
    });
    placeGraces(null); // grace notes at the very end lead to nothing after them: they sound before the end
    // Grace notes before the first note may start before 0: everything moves later by that much.
    const early = Math.min(0, ...events.map((e) => e.start));
    if (early < 0) {
      for (const event of events) event.start -= early;
      total -= early;
    }
    events.sort((a, b) => a.start - b.start);
    return { events, total };
  }

  window.Playback = { schedule, tonicOf, LEAD_IN, NOTE_SHARE, NOTE_PEAK, CHORD_PEAK, GRACE_LENGTH };
})();
