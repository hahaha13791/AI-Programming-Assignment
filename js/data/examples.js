// 내 악보 example scores: public-domain melodies written as published (v2 format, see notation.js).
// The opening measures only. The new examples were written from memory and are checked by the user (TODO 29, 30).
window.EXAMPLE_SCORES = [
  // Twinkle, Twinkle, Little Star — C major, 4/4, 12 measures: A A' B B A A'.
  Notation.build({
    id: 'example-twinkle',
    title: '반짝반짝 작은 별',
    time: [4, 4], key: { fifths: 0, mode: 'major' }, clef: 'treble', tempo: 80,
    music: `C4:q C4:q G4:q G4:q | A4:q A4:q G4:h | F4:q F4:q E4:q E4:q | D4:q D4:q C4:h
      | G4:q G4:q F4:q F4:q | E4:q E4:q D4:h | G4:q G4:q F4:q F4:q | E4:q E4:q D4:h
      | C4:q C4:q G4:q G4:q | A4:q A4:q G4:h | F4:q F4:q E4:q E4:q | D4:q D4:q C4:h`,
  }),
  // Für Elise (Beethoven) — A minor, 3/8, sixteenths, a two-sixteenth pickup; the last measure makes up the pickup.
  Notation.build({
    id: 'example-fur-elise',
    title: '엘리제를 위하여 (베토벤)',
    pickup: true,
    time: [3, 8], key: { fifths: 0, mode: 'minor' }, clef: 'treble', tempo: 60,
    music: `E5:16 D#5:16
      | E5:16 D#5:16 E5:16 B4:16 D5:16 C5:16 | A4:8 r:16 C4:16 E4:16 A4:16 | B4:8 r:16 E4:16 G#4:16 B4:16
      | C5:8 r:16 E4:16 E5:16 D#5:16 | E5:16 D#5:16 E5:16 B4:16 D5:16 C5:16 | A4:8 r:16 C4:16 E4:16 A4:16
      | B4:8 r:16 E4:16 C5:16 B4:16 | A4:8 r:8`,
  }),
  // Greensleeves (English folk song) — A minor, 6/8 (♩. = 60), dotted rhythms, an eighth pickup.
  Notation.build({
    id: 'example-greensleeves',
    title: '그린슬리브스 (영국 민요)',
    pickup: true,
    time: [6, 8], key: { fifths: 0, mode: 'minor' }, clef: 'treble', tempo: 90,
    music: `A4:8
      | C5:q D5:8 E5:8. F5:16 E5:8 | D5:q B4:8 G4:8. A4:16 B4:8 | C5:q A4:8 A4:8. G#4:16 A4:8
      | B4:q G#4:8 E4:q A4:8 | C5:q D5:8 E5:8. F5:16 E5:8 | D5:q B4:8 G4:8. A4:16 B4:8
      | C5:8. B4:16 A4:8 G#4:8. F#4:16 G#4:8 | A4:q. A4:q`,
  }),
  // In the Hall of the Mountain King (Grieg, Peer Gynt) — B minor, bass clef (cellos and bassoons), 4/4.
  Notation.build({
    id: 'example-mountain-king',
    title: '산왕의 궁전에서 (그리그)',
    time: [4, 4], key: { fifths: 2, mode: 'minor' }, clef: 'bass', tempo: 100,
    music: `B2:8 C#3:8 D3:8 E3:8 F#3:8 D3:8 F#3:q | E#3:8 C#3:8 E#3:q E3:8 C3:8 E3:q
      | B2:8 C#3:8 D3:8 E3:8 F#3:8 D3:8 F#3:8 B3:8 | A3:8 F#3:8 D3:8 F#3:8 A3:h`,
  }),
  // Not a real song: a short study made for this app, to show (and practise) ties — within a measure and across
  // a barline — triplets of eighths and quarters, and a change of key (C to G major) and time (4/4, 3/4, 6/8).
  Notation.build({
    id: 'example-rhythm-etude',
    title: '리듬 표기 연습곡 (이 앱용)',
    time: [4, 4], key: { fifths: 0, mode: 'major' }, clef: 'treble', tempo: 90,
    music: `C5:q E5:8 G5:8~ G5:h | 3[ F5:8 E5:8 D5:8 ] C5:q~ C5:q B4:q | A4:q. B4:8 C5:h~ | C5:q 3[ D5:q E5:q F5:q ] G5:q
      | G5:q F#5:8 E5:8 D5:h | E5:8 F#5:8 G5:q~ G5:8 r:8 | D5:8 C5:8 B4:8 A4:q.~ | A4:q. G4:q.`,
    changes: { 4: { key: { fifths: 1, mode: 'major' } }, 5: { time: [3, 4] }, 6: { time: [6, 8] } },
  }),
];
