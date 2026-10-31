// 37단계 — 형식 넓히기: 음자리표·길이·마디. Run with smoke.js.
{
  const N = Notation;
  const ticker = setInterval(() => {}, 10); // file reads run off the page's thread (pitfalls.md)
  const BASE = { id: 't37', title: '시험', key: { fifths: 0, mode: 'major' }, tempo: 60 };
  const build = (music, extra = {}) => N.build({ ...BASE, clef: 'treble', time: [4, 4], music, ...extra });
  const fracEq = (a, b) => N.cmp(a, b) === 0;
  const P = (step, octave, alter = 0) => ({ step, alter, octave });

  // ---- MusicXML test files ----
  const HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';
  const DIV = 48; // quarter 48: 64th 3, triplet 16th 8, nested triplet 16th 16/3 → use 144 below for nesting
  const pitchXml = (name) => {
    const [, step, acc, octave] = name.match(/^([A-G])(#|b)?(\d)$/);
    return `<pitch><step>${step}</step>${acc ? `<alter>${acc === '#' ? 1 : -1}</alter>` : ''}<octave>${octave}</octave></pitch>`;
  };
  const note = (name, duration, type, extra = '') => `<note>${name === 'r' ? '<rest/>' : pitchXml(name)}<duration>${duration}</duration><voice>1</voice><type>${type}</type>${extra}</note>`;
  const clefXml = (sign, line, octave) => `<clef><sign>${sign}</sign><line>${line}</line>${octave ? `<clef-octave-change>${octave}</clef-octave-change>` : ''}</clef>`;
  const attrs = (clef, { div = DIV, time = '<time><beats>4</beats><beat-type>4</beat-type></time>' } = {}) => `<attributes><divisions>${div}</divisions><key><fifths>0</fifths></key>${time}${clef}</attributes>`;
  const scoreXml = (measures, { title = '시험', numbers, implicit = [] } = {}) => `${HEAD}<score-partwise version="4.0"><work><work-title>${title}</work-title></work>`
    + '<part-list><score-part id="P1"><part-name>X</part-name></score-part></part-list><part id="P1">'
    + measures.map((m, i) => `<measure number="${numbers?.[i] ?? i + 1}"${implicit[i] ? ' implicit="yes"' : ''}>${m}</measure>`).join('')
    + '</part></score-partwise>';
  const docOf = (xml) => new DOMParser().parseFromString(xml, 'application/xml');
  const convert = (xml) => MusicXML.convert(docOf(xml), 0, 0, 't.musicxml');
  const tempo = (q) => `<direction><direction-type><words>x</words></direction-type><sound tempo="${q}"/></direction>`;

  T.test('37-2 새 필드의 검증', async (T) => {
    for (const clef of ['alto', 'tenor', 'treble-8vb', 'treble-8va', 'bass-8vb', 'bass-8va']) {
      T.check(N.isValid(build('C4:w', { clef })), `${clef} 음자리표 악보는 올바름`);
    }
    T.check(!N.isValid(build('C4:w', { clef: 'mezzo' })), '없는 음자리표는 걸러짐');
    T.check(N.isValid(build('C5:64 D5:64 E5:64 F5:64 G5:16 A5:8 B5:q C6:h')), '64분음표 마디는 올바름');
    const nested = build('3[ C5:8 3[ D5:16 E5:16 F5:16 ] G5:8 ] A5:q', { time: [2, 4] });
    T.check(N.isValid(nested), '셋잇단 안의 셋잇단 (2/4)은 올바름');
    const group = nested.measures[0].notes.slice(0, 5);
    T.check(fracEq(N.filled(group), N.frac(1, 4)) && fracEq(N.filled(nested.measures[0].notes), N.frac(1, 2)), '겹잇단 묶음 = 4분음표 하나, 마디 합 = 2/4 (분수로 정확)');
    T.check(fracEq(N.duration(group[1]), N.frac(1, 36)), `안쪽 16분 = 1/16 × 2/3 × 2/3 = 1/36 (${N.duration(group[1])})`);
    const crossing = JSON.parse(JSON.stringify(nested));
    delete crossing.measures[0].notes[3].tuplet2Stop; // the inner group runs on past the outer one's end
    crossing.measures[0].notes[4].tuplet2 = { actual: 3, normal: 2 };
    crossing.measures[0].notes[4].tuplet2Stop = true;
    T.check(!N.isValid(crossing), '바깥 묶음을 넘는 안쪽 잇단음표는 걸러짐');
    const orphan = JSON.parse(JSON.stringify(nested));
    delete orphan.measures[0].notes[1].tuplet;
    T.check(!N.isValid(orphan), '바깥 잇단음표 없는 안쪽 잇단음표는 걸러짐');
    const sym = build('C5:w');
    T.check(N.isValid({ ...sym, measures: [{ ...sym.measures[0], timeSymbol: 'common' }] }), 'C 박자 기호는 올바름');
    T.check(!N.isValid({ ...sym, measures: [...sym.measures, { notes: sym.measures[0].notes, timeSymbol: 'cut' }] }), '박자 없이 박자 기호만 있으면 걸러짐');
    const split = build('C5:w | D5:h | E5:h | F5:w');
    split.measures[2].implicit = true;
    T.check(N.isValid(split), '곡 중간의 짧은 마디(도돌이표로 나뉜 마디)는 올바름');
    const numbers = N.resolve(split).map((m) => `${m.number}${m.numbered ? '' : '*'}`).join(' ');
    T.check(numbers === '1 2 2* 3', `번호 없는 마디는 세지 않음 (${numbers})`);
    T.check(!N.isValid({ ...split, measures: split.measures.map((m, i) => (i === 2 ? { ...m, implicit: 'yes' } : m)) }), 'implicit 값이 true가 아니면 걸러짐');
    const midClef = build('C5:q C4:q D4:q E4:q | F4:w');
    midClef.measures[0].notes[1].clef = 'bass';
    midClef.measures[0].notes[2].tempo = 120;
    T.check(N.isValid(midClef), '마디 중간 음자리표·빠르기 바뀜은 올바름');
    const resolved = N.resolve(midClef);
    T.check(resolved[0].clef === 'treble' && resolved[0].endClef === 'bass' && resolved[1].clef === 'bass' && resolved[1].tempo === 120,
      '다음 마디는 바뀐 음자리표·빠르기로 시작');
    const split80 = N.build({ ...BASE, tempo: 80, clef: 'treble', time: [4, 4], music: 'C5:w | D5:w | E5:h' });
    split80.measures[2].implicit = true;
    T.check(N.legacyProblem(midClef) === '낮은음자리표' && N.legacyProblem(split80) === '번호 없는 마디' && N.legacyProblem(build('C4:w', { clef: 'alto' })) === '알토 음자리표',
      `편집기가 다룰 수 없는 이유 (${N.legacyProblem(midClef)} / ${N.legacyProblem(split80)})`);
    // Compatibility: the examples and what earlier stages stored still read the same.
    T.check(EXAMPLE_SCORES.every((s) => N.isValid(s)), '예시 악보가 모두 그대로 올바름');
    const greens = EXAMPLE_SCORES.find((s) => s.id === 'example-greensleeves');
    T.check(N.resolve(greens).slice(0, 3).map((m) => m.number).join() === '0,1,2' && N.resolve(greens)[0].numbered, '예시의 마디 번호(못갖춘마디 0부터)는 그대로');
    T.check(Scores.open().list().every((s) => N.isValid(s)), '저장소에서 읽은 악보가 모두 올바름');
  });

  T.test('37-2 변환: 새 표기를 옮김', async (T) => {
    const alto = convert(scoreXml([attrs(clefXml('C', 3)) + tempo(60) + note('C4', 192, 'whole')]));
    T.check(alto.score.measures[0].clef === 'alto' && N.midi(alto.score.measures[0].notes[0].pitch) === 60, '알토 음자리표 (C3)');
    const tenor = convert(scoreXml([attrs(clefXml('C', 4)) + tempo(60) + note('C4', 192, 'whole')]));
    T.check(tenor.score.measures[0].clef === 'tenor', '테너 음자리표 (C4)');
    const voice = convert(scoreXml([attrs(clefXml('G', 2, -1)) + tempo(60) + note('C4', 192, 'whole')]));
    T.check(voice.score.measures[0].clef === 'treble-8vb' && N.midi(voice.score.measures[0].notes[0].pitch) === 60, '테너 성부 음자리표(G2, 8vb), 음높이는 그대로(실음 C4)');
    const sixtyFourth = convert(scoreXml([attrs(clefXml('G', 2)) + tempo(60) + note('C5', 3, '64th') + note('D5', 3, '64th') + note('E5', 6, '32nd') + note('F5', 12, '16th') + note('G5', 24, 'eighth') + note('A5', 144, 'half', '<dot/>')]));
    T.check(sixtyFourth.score.measures[0].notes[0].type === '64th', '64분음표');
    const common = convert(scoreXml([attrs(clefXml('G', 2), { time: '<time symbol="common"><beats>4</beats><beat-type>4</beat-type></time>' }) + tempo(60) + note('C5', 192, 'whole')]));
    T.check(common.score.measures[0].timeSymbol === 'common', 'C 박자 기호');
    // Nested triplets (quarter 144: outer triplet 8th 48, inner triplet 16th 16).
    const tm = (a, n) => `<time-modification><actual-notes>${a}</actual-notes><normal-notes>${n}</normal-notes></time-modification>`;
    const br = (type, a, n) => `<tuplet type="${type}">${a ? `<tuplet-actual><tuplet-number>${a}</tuplet-number></tuplet-actual><tuplet-normal><tuplet-number>${n}</tuplet-number></tuplet-normal>` : ''}</tuplet>`;
    const nestedXml = scoreXml([attrs(clefXml('G', 2), { div: 144, time: '<time><beats>2</beats><beat-type>4</beat-type></time>' }) + tempo(60)
      + note('C5', 48, 'eighth', `${tm(3, 2)}<notations>${br('start', 3, 2)}</notations>`)
      + note('D5', 16, '16th', `${tm(9, 4)}<notations>${br('start', 3, 2)}</notations>`)
      + note('E5', 16, '16th', tm(9, 4))
      + note('F5', 16, '16th', `${tm(9, 4)}<notations>${br('stop')}</notations>`)
      + note('G5', 48, 'eighth', `${tm(3, 2)}<notations>${br('stop')}</notations>`)
      + note('A5', 144, 'quarter')]);
    const nested = convert(nestedXml);
    const ns = nested.score.measures[0].notes;
    T.check(ns[1].tuplet?.actual === 3 && ns[1].tuplet2?.actual === 3 && ns[1].tuplet2Start && ns[3].tuplet2Stop && ns[0].tupletStart && ns[4].tupletStop,
      '겹잇단음표: 바깥 3:2 안에 안쪽 3:2 (time-modification 9:4를 둘로 나눔)');
    const noRatio = convert(nestedXml.replace(/<tuplet-actual>.*?<\/tuplet-normal>/g, ''));
    T.check(JSON.stringify(noRatio.score) === JSON.stringify(nested.score), '괄호에 비율이 없어도 바깥 음표에서 비율을 찾음');
    // A measure split by a repeat (implicit second half), numbers as printed.
    const split = convert(scoreXml([attrs(clefXml('G', 2)) + tempo(60) + note('C5', 192, 'whole'), note('D5', 96, 'half'), note('E5', 96, 'half'), note('F5', 192, 'whole')],
      { numbers: [1, 2, 'X1', 3], implicit: [false, false, true, false] }));
    T.check(split.score.measures[2].implicit && N.resolve(split.score).map((m) => m.number).join() === '1,2,2,3', '도돌이표로 나뉜 마디: 둘째 절반은 번호를 세지 않음');
    const pickup = convert(scoreXml([attrs(clefXml('G', 2)) + tempo(60) + note('G4', 48, 'quarter'), note('C5', 192, 'whole')], { numbers: [1, 2], implicit: [true, false] }));
    T.check(pickup.score.pickup && N.resolve(pickup.score).map((m) => m.number).join() === '1,2', '번호 없는 못갖춘마디: 원본 번호(다음 마디 2)를 따름');
    // Clef and tempo changes inside a measure.
    const mid = convert(scoreXml([attrs(clefXml('G', 2)) + tempo(60) + note('C5', 48, 'quarter') + note('D5', 48, 'quarter')
      + `<attributes>${clefXml('F', 4)}</attributes>` + tempo(90) + note('C3', 48, 'quarter') + note('D3', 48, 'quarter'), note('E3', 192, 'whole')]));
    const m0 = mid.score.measures[0];
    T.check(m0.clef === 'treble' && m0.notes[2].clef === 'bass' && m0.notes[2].tempo === 90 && !mid.score.measures[1].clef,
      '마디 중간 음자리표·빠르기 바뀜은 그 음부터, 다음 마디는 낮은음자리표로 이어짐');
    const refuse = (xml, expected, label) => {
      let message = '';
      try { convert(xml); } catch (error) { message = error.message; }
      T.check(message.includes(expected), `${label}: "${message}"`);
    };
    refuse(scoreXml([attrs(clefXml('G', 2)) + note('C5', 96, 'half') + '<attributes><key><fifths>2</fifths></key></attributes>' + note('D5', 96, 'half')]), '마디 중간 조 바뀜', '마디 중간 조 바뀜은 담지 않음');
    refuse(scoreXml([attrs(clefXml('C', 1)) + note('C5', 192, 'whole')]), '음자리표 C1', '소프라노 음자리표(C1)는 담지 않음');
  });

  T.test('37-4 그리기: 음자리표·조표', async (T) => {
    T.check(Sheet.position(P('C', 4), 'alto') === 4 && Sheet.position(P('C', 4), 'tenor') === 6, '가운뎃 도: 알토는 가운데 줄, 테너는 넷째 줄');
    T.check(Sheet.position(P('C', 4), 'treble-8vb') === Sheet.position(P('C', 5), 'treble') && Sheet.position(P('C', 2), 'bass-8vb') === Sheet.position(P('C', 3), 'bass'),
      '옥타브 음자리표는 실음보다 한 옥타브 옮긴 자리에 그림');
    const pos = (fifths, clef) => Sheet.keySigns({ fifths, mode: 'major' }, clef).map((s) => s.pos).join(',');
    T.check(pos(7, 'alto') === '7,4,8,5,2,6,3' && pos(-7, 'alto') === '3,6,2,5,1,4,0', `알토 조표 ♯7·♭7 위치 표준 (${pos(7, 'alto')} / ${pos(-7, 'alto')})`);
    T.check(pos(7, 'tenor') === '2,6,3,7,4,8,5' && pos(-7, 'tenor') === '5,8,4,7,3,6,2', `테너 조표 ♯7(파·솔♯은 아래)·♭7 위치 표준 (${pos(7, 'tenor')} / ${pos(-7, 'tenor')})`);
    T.check(pos(3, 'treble-8vb') === pos(3, 'treble') && pos(-2, 'bass-8vb') === pos(-2, 'bass'), '옥타브 음자리표의 조표는 원래 음자리표와 같음');
    T.check([...Array(15)].every((_, k) => Sheet.keySigns({ fifths: k - 7, mode: 'major' }, 'alto').length === Math.abs(k - 7)), '조표 15가지 모두 그려짐(알토)');

    const box = document.createElement('div');
    box.style.width = '600px';
    document.body.append(box);
    Sheet.draw(box, build('C3:q C4:q E5:q C4:q', { clef: 'alto', key: { fifths: 2, mode: 'major' } }));
    T.check(box.querySelector('[data-clef="alto"] .sv-clef-c'), '알토 음자리표(C 모양)를 그림');
    const notes = [...box.querySelectorAll('.sv-note[data-pos]')].map((g) => Number(g.dataset.pos));
    T.check(notes.join() === '-3,4,13,4', `알토에서 음 위치 C3 -3 · C4 4 · E5 13 (${notes})`);
    const ledgers = (i) => box.querySelectorAll('.sv-note')[i].querySelectorAll('.sv-ledger').length;
    T.check(ledgers(0) === 1 && ledgers(1) === 0 && ledgers(2) === 2, `덧줄이 필요한 만큼 (${ledgers(0)}, ${ledgers(1)}, ${ledgers(2)})`);
    T.check([...box.querySelectorAll('.sv-key')].map((k) => k.dataset.pos).join() === '7,4', '알토 라장조 조표 ♯ 위치 7·4');
    Sheet.draw(box, build('C4:w', { clef: 'treble-8vb' }));
    const eight = box.querySelector('.sv-clef-octave');
    const bottom = Math.max(...[...box.querySelectorAll('.sv-line')].map((l) => Number(l.getAttribute('y1'))));
    T.check(eight && eight.textContent === '8' && Number(eight.getAttribute('y')) > bottom && box.querySelector('.sv-note').dataset.pos === '5',
      '테너 성부 음자리표: 아래에 8, 실음 C4는 셋째 칸');
    const midClef = build('C5:q C3:q D3:q E3:q | F3:w');
    midClef.measures[0].notes[1].clef = 'bass';
    Sheet.draw(box, midClef);
    const m0 = box.querySelector('.sv-measure[data-measure="0"]');
    T.check(m0.querySelector('.sv-clef-group.is-small[data-clef="bass"]') && [...m0.querySelectorAll('.sv-note')].map((g) => g.dataset.pos).join() === '5,3,4,5',
      '마디 중간 음자리표: 그 자리에 작은 낮은음자리표, 뒤 음은 낮은음자리표 위치');
    T.check(!box.querySelector('.sv-measure[data-measure="1"] .sv-clef-group'), '다음 마디에는 음자리표를 다시 그리지 않음(같은 줄)');
    const playback = Playback.schedule(midClef, { start: 0, end: 1, tonic: false });
    T.check(playback.events.map((e) => e.midi).join() === '72,48,50,52,53', '소리는 실음 그대로');
    box.remove();
  });

  T.test('37-4 그리기: 64분음표·겹잇단·짧은 마디·박자 기호', async (T) => {
    const box = document.createElement('div');
    box.style.width = '700px';
    document.body.append(box);
    Sheet.draw(box, build('C5:64 D5:64 E5:64 F5:64 G5:64 A5:64 B5:64 C6:64 r:64 G5:64 r:8 r:q r:h'));
    T.check(box.querySelector('.sv-beam-group[data-levels="4"]') && box.querySelectorAll('.sv-beam[data-level="4"]').length >= 1, '64분음표 빔 4개');
    T.check(box.querySelector('.sv-note[data-rest][data-type="64th"]').querySelectorAll('.sv-rest-hook').length === 4, '64분쉼표 갈고리 4개');
    T.check(box.querySelector('.sv-note[data-type="64th"]:not([data-rest]) .sv-flag') !== null || box.querySelectorAll('.sv-note[data-type="64th"]:not([data-rest])').length > 0, '혼자인 64분음표도 그려짐');
    Sheet.draw(box, build('G5:64 r:64 r:32 r:16 r:8 r:q r:h'));
    T.check(box.querySelector('.sv-note[data-type="64th"]:not([data-rest])').querySelectorAll('.sv-flag').length === 4, '혼자인 64분음표 꼬리 4개');
    Sheet.draw(box, build('3[ C5:8 3[ D5:16 E5:16 F5:16 ] G5:8 ] A5:q', { time: [2, 4] }));
    const outer = box.querySelector('.sv-tuplet[data-level="1"] .sv-tuplet-number');
    const inner = box.querySelector('.sv-tuplet[data-level="2"] .sv-tuplet-number');
    T.check(outer && inner && Math.abs(Number(outer.getAttribute('y')) - Number(inner.getAttribute('y'))) >= 10,
      '겹잇단: 바깥 3과 안쪽 3이 겹치지 않게 다른 높이에');
    T.check(box.querySelector('.sv-tuplet[data-level="1"] .sv-tuplet-bracket'), '바깥 묶음에는 괄호');
    const split = build('C5:w | D5:h | E5:h | F5:w | G5:w');
    split.measures[2].implicit = true;
    Sheet.draw(box, split, { numberFirst: true });
    const strip = document.createElement('div');
    document.body.append(strip);
    Sheet.strip(strip, split);
    const numbers = [...strip.querySelectorAll('.sv-number')].map((t) => t.textContent).join();
    T.check(numbers === '1,2,3,4', `띠에 번호 없는 마디의 번호를 그리지 않음 (${numbers})`);
    const widths = [...strip.querySelectorAll('.sv-hit')].map((r) => Number(r.getAttribute('width')));
    T.check(widths[1] < widths[0] && widths[2] < widths[0], '짧은 마디는 짧게 그림');
    strip.remove();
    const common = build('C5:w');
    common.measures[0].timeSymbol = 'common';
    Sheet.draw(box, common);
    T.check(box.querySelector('.sv-time-symbol[data-symbol="common"]') && !box.querySelector('.sv-time'), 'C 박자 기호를 숫자 대신 그림');
    const cut = N.build({ ...BASE, clef: 'treble', time: [2, 2], music: 'C5:w' });
    cut.measures[0].timeSymbol = 'cut';
    Sheet.draw(box, cut);
    T.check(box.querySelector('.sv-time-symbol[data-symbol="cut"] .sv-time-cut'), '¢ 박자 기호(세로줄)');
    box.remove();
  });

  T.test('37-4 마디 중간 빠르기 재생', async (T) => {
    const s = build('C5:q D5:q E5:q F5:q | G5:w');
    s.measures[0].notes[2].tempo = 120;
    const r = Playback.schedule(s, { start: 0, end: 1, tonic: false });
    const starts = r.events.map((e) => +e.start.toFixed(3)).join();
    T.check(starts === '0,1,2,2.5,3', `♩=60에서 셋째 음부터 ♩=120 (${starts})`);
  });

  // Imports through the box, then practises.
  async function importXml(xml, name) {
    T.$('btn-new-score').click();
    await importFile(new File([xml], name));
    T.$('btn-import').click();
  }

  T.test('37-4 받아 적기: 알토 음자리표와 긴 제목', async (T) => {
    T.setMode('score');
    const writeTop = T.$('staff-title').getBoundingClientRect().top;
    const long = '아주 긴 제목을 가진 비올라 연습곡 — 알토 음자리표와 조표가 들어 있는 원곡 그대로의 악보, 두 번째 줄까지 넘어갈 만큼 깁니다';
    await importXml(scoreXml([attrs(clefXml('C', 3)).replace('<fifths>0</fifths>', '<fifths>-1</fifths>') + tempo(80)
      + note('C4', 48, 'quarter') + note('D4', 48, 'quarter') + note('E4', 48, 'quarter') + note('B3', 48, 'quarter', '').replace('<step>B</step>', '<step>B</step><alter>-1</alter>'),
    note('A3', 96, 'half') + note('F4', 96, 'half')], { title: long }), 'viola.musicxml');
    const score = scores.get(scoreId);
    T.check(score.title === long.slice(0, 100) && Notation.resolve(score)[0].clef === 'alto', `알토 악보를 불러옴 (제목 ${score.title.length}자)`);
    T.check(T.$('score-input').querySelector('[data-clef="alto"] .sv-clef-c'), '받아 적기 오선도 알토 음자리표');
    T.check([...T.$('score-input').querySelectorAll('.sv-key')].map((k) => k.dataset.pos).join() === '3', '받아 적기 오선의 조표(♭ 하나) 위치 3');
    await T.listen();
    T.enterNotes(current);
    T.submit();
    T.check(/6음 모두 정답/.test(T.resultText()), `누른 자리의 음이 실음으로 채점 (${T.resultText().slice(0, 20)})`);
    T.check(T.$('result-area').querySelector('[data-clef="alto"]'), '정답 구간 악보도 알토 음자리표');
    const select = T.$('score-select').getBoundingClientRect();
    const panel = T.$('score-picker').getBoundingClientRect();
    T.check(select.right <= panel.right + 0.5 && T.noHorizontalOverflow(), '긴 제목이 패널을 넘치지 않음');
    T.check(Math.abs(T.$('staff-title').getBoundingClientRect().top - writeTop) < 0.5, '받아 적기 영역 위치 그대로');
    T.check(T.$('btn-edit-score').dataset.action === 'delete', '편집기 범위 밖(알토 음자리표)이면 [삭제]');
    T.$('btn-edit-score').click();
    T.$('btn-edit-score').click();
    localStorage.removeItem(Scores.STORAGE_KEY);
    T.$('score-select').value = scores.list()[0].id;
    T.$('score-select').dispatchEvent(new Event('change'));
    T.setMode('melody');
    clearInterval(ticker);
  });
}
