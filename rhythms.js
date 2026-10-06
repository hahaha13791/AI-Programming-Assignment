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

for (const level of Object.keys(RHYTHMS)) {
  RHYTHMS[level] = RHYTHMS[level].map(([time, text]) => ({
    time: time.split('/').map(Number),
    measures: text.split('|').map((measure) => measure.trim().split(/\s+/)),
  }));
}
