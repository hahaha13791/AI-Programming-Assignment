// 빠르기 ♩= 80. [박자표, 마디들]. 마디는 '|'로 나눈다.
// 음표: w 온 / h. 점2분 / h 2분 / q. 점4분 / q 4분 / e 8분 / r 4분쉼표 (Rhythm.TYPES)
window.RHYTHMS = {
  // 2마디, 2/4·4/4, 온·2분·4분음표
  easy: [
    ['4/4', 'q q h | h q q'],
    ['4/4', 'h h | w'],
    ['4/4', 'q q q q | w'],
    ['4/4', 'h q q | h h'],
    ['4/4', 'q q h | w'],
    ['4/4', 'w | q q h'],
    ['2/4', 'q q | h'],
    ['2/4', 'h | q q'],
  ],
  // 2마디, 2/4·3/4·4/4, + 8분음표(한 박에 둘)·점2분음표·4분쉼표
  medium: [
    ['4/4', 'q e e q q | h. r'],
    ['4/4', 'e e e e h | q r h'],
    ['4/4', 'h. q | e e q h'],
    ['4/4', 'q q r q | e e e e h'],
    ['3/4', 'q q q | h.'],
    ['3/4', 'e e q q | h r'],
    ['3/4', 'q r q | e e e e q'],
    ['3/4', 'h q | e e h'],
    ['2/4', 'e e q | q r'],
    ['2/4', 'q e e | h'],
  ],
  // 3~4마디, 2/4·3/4·4/4, + 점4분음표
  hard: [
    ['4/4', 'q. e q q | h q r | e e e e h'],
    ['4/4', 'h. q | q. e h | q r h'],
    ['4/4', 'q q q. e | h h | e e q q. e | w'],
    ['4/4', 'q. e q. e | h q q | e e e e q q | w'],
    ['3/4', 'q. e q | h q | h.'],
    ['3/4', 'h q | e e q. e | h r'],
    ['3/4', 'q q q | q. e q | e e e e q | h.'],
    ['3/4', 'h. | q. e q | q r q | h q'],
    ['2/4', 'q e e | q. e | h'],
    ['2/4', 'q. e | q q | e e q | h'],
    ['2/4', 'q q | q. e | e e e e | h'],
  ],
};

// 리듬 심화 (PRD #4-J): written as the score format's text (Notation.parseMeasures), n = the one pitch;
// ~ ties into the next note, 3[ ... ] is a triplet. Every question can be written with its level's buttons.
window.RHYTHMS_ADVANCED = {
  // 2마디, 2/4·3/4·4/4, 기본의 표기 + 16분음표·점8분음표·8분쉼표 (셋잇단·붙임줄 없음)
  easy: [
    ['4/4', 'n:8. n:16 n:q n:16 n:16 n:8 n:q | n:h r:8 n:8 n:q'],
    ['2/4', 'n:16 n:16 n:16 n:16 n:q | n:8. n:16 n:q'],
    ['3/4', 'n:q n:8 n:16 n:16 n:q | n:8. n:16 n:h'],
    ['4/4', 'r:8 n:8 n:q n:8. n:16 n:8 n:8 | n:16 n:16 n:8 n:q n:h'],
    ['3/4', 'n:8 n:8 r:8 n:8 n:q | n:16 n:8. n:q r:q'],
    ['2/4', 'n:q. n:8 | n:16 n:8 n:16 n:q'],
  ],
  // 2마디, + 셋잇단음표(8분·4분)·붙임줄·6/8
  medium: [
    ['6/8', 'n:q n:8 n:8. n:16 n:8 | n:q.~ n:q.'],
    ['2/4', '3[ n:8 n:8 n:8 ] n:q~ | n:8 n:8 n:q'],
    ['4/4', 'n:q 3[ n:8 n:8 n:8 ] n:h | 3[ n:q n:q n:q ] n:h'],
    ['6/8', 'n:8 n:8 n:8 n:q. | n:8. n:16 n:8 n:q r:8'],
    ['3/4', 'n:h n:q~ | n:q 3[ n:8 n:8 n:8 ] n:q'],
    ['6/8', 'n:q. n:8 n:8 n:8~ | n:8 n:8 n:8 n:q.'],
  ],
  // 3~4마디(9/8·12/8은 2마디), + 9/8·12/8, 박자표도 고름
  hard: [
    ['12/8', 'n:q. n:q n:8 n:8 n:8 n:8 n:8 n:8 n:8 | n:h. n:h.'],
    ['9/8', 'n:q. n:8 n:16 n:16 n:8 n:q n:8 | n:h.~ n:q.'],
    ['3/4', 'n:8. n:16 n:q 3[ n:8 n:8 n:8 ] | n:h n:8 n:8~ | n:q r:8 n:8 n:16 n:16 n:8 | n:h.'],
    ['2/4', 'n:16 n:16 n:8 n:q | 3[ n:8 r:8 n:8 ] n:q | n:8. n:16 n:8 n:8~ | n:h'],
    ['6/8', 'n:q. n:8 n:16 n:16 n:8 | n:8 n:q n:q. | n:q. r:q.'],
    ['4/4', '3[ n:q n:q n:q ] n:8. n:16 n:q | r:q n:8 n:8 n:h~ | n:w'],
    ['12/8', 'n:8 n:8 n:8 n:q. n:q n:8 n:8 r:8 n:8 | n:w.'],
  ],
};
for (const level of Object.keys(RHYTHMS_ADVANCED)) {
  RHYTHMS_ADVANCED[level] = RHYTHMS_ADVANCED[level].map(([time, text]) => ({
    time: time.split('/').map(Number),
    measures: Notation.parseMeasures(text.replace(/n:/g, 'C5:')).map((measure) => measure.notes),
  }));
}

for (const level of Object.keys(RHYTHMS)) {
  RHYTHMS[level] = RHYTHMS[level].map(([time, text]) => ({
    time: time.split('/').map(Number),
    // Each code is a note of the score format (v2), all at one pitch.
    measures: text.split('|').map((measure) => measure.trim().split(/\s+/).map(Rhythm.noteOf)),
  }));
}
