// 36단계 — 기본 변환과 저장. Run with smoke.js.
// Reading files runs off the page's thread; a ticking timer keeps headless virtual time moving (pitfalls.md).
const ticker36 = setInterval(() => {}, 10);

const HEAD36 = '<?xml version="1.0" encoding="UTF-8"?>\n';
const DIV = 12; // quarter 12, eighth 6, triplet eighth 4, dotted quarter 18, half 24, whole 48
const TYPE_OF = { 48: 'whole', 36: 'half', 24: 'half', 18: 'quarter', 12: 'quarter', 6: 'eighth', 3: '16th' };
const DOTTED = new Set([36, 18]);
// n('C5', 12) · n('F#5', 24) · n('Eb3', 6) · n('r', 12) — options: tie ('start'|'stop'), tuplet ('start'|'stop'|true),
// voice, staff, chord, grace.
function n(name, duration, o = {}) {
  const type = o.tuplet ? 'eighth' : TYPE_OF[duration];
  const dot = !o.tuplet && DOTTED.has(duration) ? '<dot/>' : '';
  let pitch = '<rest/>';
  if (name !== 'r') {
    const [, step, acc, octave] = name.match(/^([A-G])(#|b)?(\d)$/);
    const alter = acc === '#' ? '<alter>1</alter>' : acc === 'b' ? '<alter>-1</alter>' : '';
    pitch = `<pitch><step>${step}</step>${alter}<octave>${octave}</octave></pitch>`;
  }
  const tie = o.tie ? `<tie type="${o.tie}"/>` : '';
  const tm = o.tuplet ? '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>' : '';
  const notations = [o.tie ? `<tied type="${o.tie}"/>` : '', typeof o.tuplet === 'string' ? `<tuplet type="${o.tuplet}"/>` : ''].join('');
  return `<note>${o.grace ? '<grace/>' : ''}${o.chord ? '<chord/>' : ''}${pitch}${o.grace ? '' : `<duration>${duration}</duration>`}${tie}`
    + `<voice>${o.voice ?? 1}</voice><type>${type}</type>${dot}${tm}${o.staff ? `<staff>${o.staff}</staff>` : ''}`
    + `${notations ? `<notations>${notations}</notations>` : ''}</note>`;
}
const attrs = ({ key, mode, time, clef, staves, transpose } = {}) => `<attributes><divisions>${DIV}</divisions>`
  + `${key !== undefined ? `<key><fifths>${key}</fifths>${mode ? `<mode>${mode}</mode>` : ''}</key>` : ''}`
  + `${time ? `<time><beats>${time[0]}</beats><beat-type>${time[1]}</beat-type></time>` : ''}`
  + `${staves ? `<staves>${staves}</staves>` : ''}${clef ?? ''}${transpose ?? ''}</attributes>`;
const G_CLEF = (number) => `<clef${number ? ` number="${number}"` : ''}><sign>G</sign><line>2</line></clef>`;
const F_CLEF = (number) => `<clef${number ? ` number="${number}"` : ''}><sign>F</sign><line>4</line></clef>`;
const tempoDir = (q) => `<direction><direction-type><words>Allegro</words></direction-type><sound tempo="${q}"/></direction>`;
const metronome = (unit, perMinute, dot = false) => `<direction><direction-type><metronome><beat-unit>${unit}</beat-unit>${dot ? '<beat-unit-dot/>' : ''}<per-minute>${perMinute}</per-minute></metronome></direction-type></direction>`;
const back = (d) => `<backup><duration>${d}</duration></backup>`;
const fwd = (d, voice, staff) => `<forward><duration>${d}</duration><voice>${voice}</voice><staff>${staff}</staff></forward>`;
const score36 = (parts, { title = '<work><work-title>시험 곡</work-title></work>', extra = '' } = {}) => `${HEAD36}<score-partwise version="4.0">${title}${extra}`
  + `<part-list>${parts.map((p, i) => `<score-part id="P${i + 1}"><part-name>${p.name}</part-name></score-part>`).join('')}</part-list>`
  + `${parts.map((p, i) => `<part id="P${i + 1}">${p.measures.map((m, k) => `<measure number="${p.numbers?.[k] ?? k + 1}"${p.implicit?.[k] ? ' implicit="yes"' : ''}>${m}</measure>`).join('')}</part>`).join('')}</score-partwise>`;
const doc36 = (xml) => new DOMParser().parseFromString(xml, 'application/xml');
const json = (score) => JSON.stringify(Notation.clean({ ...score, id: 'import' }));

// A: pickup, key/time/clef/tempo changes, dots, tie over a barline, triplet, rests and a measure rest.
const BASIC = score36([{
  name: 'Melody',
  numbers: [0, 1, 2, 3, 4, 5],
  implicit: [true],
  measures: [
    attrs({ key: 0, mode: 'major', time: [4, 4], clef: G_CLEF() }) + tempoDir(100) + n('G4', 12),
    n('C5', 18) + n('D5', 6) + n('E5', 24, { tie: 'start' }),
    n('E5', 12, { tie: 'stop' }) + n('F5', 4, { tuplet: 'start' }) + n('G5', 4, { tuplet: true }) + n('A5', 4, { tuplet: 'stop' }) + n('r', 12) + n('B4', 12),
    attrs({ key: 1, time: [3, 4] }) + tempoDir(80) + n('F#5', 24) + n('r', 12),
    '<note><rest measure="yes"/><duration>36</duration><voice>1</voice></note>',
    attrs({ key: -3, mode: 'minor', time: [6, 8], clef: F_CLEF() }) + metronome('quarter', 60, true) + n('C3', 18) + n('Eb3', 6) + n('D3', 6) + n('C3', 6),
  ],
}]);
const BASIC_EXPECTED = Notation.build({
  id: 'import', title: '시험 곡', pickup: true, time: [4, 4], key: { fifths: 0, mode: 'major' }, clef: 'treble', tempo: 100,
  music: 'G4:q | C5:q. D5:8 E5:h~ | E5:q 3[ F5:8 G5:8 A5:8 ] r:q B4:q | F#5:h r:q | r:h. | C3:q. Eb3:8 D3:8 C3:8',
  changes: {
    3: { time: [3, 4], key: { fifths: 1, mode: 'major' }, tempo: 80 },
    5: { time: [6, 8], key: { fifths: -3, mode: 'minor' }, clef: 'bass', tempo: 90 },
  },
});

// B: a B♭ clarinet written in D major, no tempo.
const CLARINET = score36([{
  name: 'Clarinet in B♭',
  measures: [
    attrs({ key: 2, time: [4, 4], clef: G_CLEF(), transpose: '<transpose><diatonic>-1</diatonic><chromatic>-2</chromatic></transpose>' })
      + n('D5', 12) + n('E5', 12) + n('F#5', 12) + n('G5', 12),
    n('C#5', 24) + n('D5', 24),
  ],
}], { title: '<movement-title>클라리넷</movement-title>' });

// C: piano, upper voices 1 and 2 (voice 2 enters halfway, then is absent), lower voice 5 in the bass clef.
const PIANO36 = score36([{
  name: 'Piano',
  measures: [
    attrs({ key: 0, time: [4, 4], staves: 2, clef: G_CLEF(1) + F_CLEF(2) }) + tempoDir(72)
      + n('C5', 24, { staff: 1 }) + n('D5', 24, { staff: 1 }) + back(48)
      + fwd(24, 2, 1) + n('A4', 24, { voice: 2, staff: 1 }) + back(48)
      + n('C3', 48, { voice: 5, staff: 2 }),
    n('E5', 48, { staff: 1 }) + back(48) + n('G2', 24, { voice: 5, staff: 2 }) + n('r', 24, { voice: 5, staff: 2 }),
  ],
}]);

// D: an editor-range score (C major, 4/4, ♩= 80, quarters, two measures).
const SIMPLE = score36([{
  name: 'Flute',
  measures: [
    attrs({ key: 0, time: [4, 4], clef: G_CLEF() }) + tempoDir(80) + n('C5', 12) + n('D5', 12) + n('E5', 12) + n('F5', 12),
    n('G5', 24) + n('E5', 24),
  ],
}], { title: '<work><work-title>편집기 범위</work-title></work>' });

const lineIndex = (state, partIndex, label) => state.parts[partIndex].lines.findIndex((l) => l.label === label);

T.test('36-2 변환 결과', async (T) => {
  const basic = MusicXML.convert(doc36(BASIC), 0, 0, 'basic.musicxml');
  T.check(json(basic.score) === json(BASIC_EXPECTED), `못갖춘마디·조/박자/음자리표/빠르기 바뀜·점·붙임줄·셋잇단·마디 쉼표 (${json(basic.score)})`);
  T.check(Notation.isValid({ ...basic.score, id: 'x' }), '검증 통과');
  T.check(basic.score.firstNumber === undefined && Notation.resolve(basic.score).map((m) => m.number).join() === '0,1,2,3,4,5', '마디 번호가 원본(0부터)과 같음');
  T.check(basic.notices.length === 0, `바꾼 것이 없으면 알림 없음 (${basic.notices})`);
  T.check(Notation.resolve(basic.score)[5].tempo === 90, '점4분 = 60 메트로놈 → ♩= 90');

  const clarinet = MusicXML.convert(doc36(CLARINET), 0, 0, 'cl.musicxml');
  const pitches = clarinet.score.measures.flatMap((m) => m.notes).map((x) => `${x.pitch.step}${x.pitch.alter}${x.pitch.octave}`);
  T.check(pitches.join(' ') === 'C05 D05 E05 F05 B04 C05', `B♭ 클라리넷 적힌 음 D E F# G C# D → 실음 C D E F B C (${pitches})`);
  T.check(JSON.stringify(clarinet.score.measures[0].key) === '{"fifths":0,"mode":"major"}', '조표도 라장조 → 다장조(실음)');
  T.check(clarinet.score.measures[0].tempo === 120 && clarinet.notices.some((x) => x.includes('120')), '빠르기 표시가 없으면 ♩= 120, 알림');
  T.check(clarinet.notices.includes('실음으로 옮겼어요'), '실음 알림');
  T.check(clarinet.score.title === '클라리넷', 'work-title이 없으면 movement-title');
  const bass = MusicXML.convert(doc36(CLARINET.replace('<chromatic>-2</chromatic>', '<chromatic>-2</chromatic><octave-change>-1</octave-change>')), 0, 0);
  T.check(bass.score.measures[0].notes[0].pitch.octave === 4 && bass.score.measures[0].notes[0].pitch.step === 'C', '옥타브 차이(octave-change)도 실음으로');
  const concert = MusicXML.convert(doc36(CLARINET.replace('<score-partwise version="4.0">', '<score-partwise version="4.0"><defaults><concert-score/></defaults>')), 0, 0);
  T.check(concert.score.measures[0].notes[0].pitch.step === 'D' && !concert.notices.includes('실음으로 옮겼어요'), '이미 실음 총보(concert-score)면 옮기지 않음');

  const pianoDoc = doc36(PIANO36);
  const state = MusicXML.candidates(pianoDoc);
  const upper2 = MusicXML.convert(pianoDoc, 0, lineIndex(state, 0, '위 보표 · 성부 2'));
  const lower = MusicXML.convert(pianoDoc, 0, lineIndex(state, 0, '아래 보표'));
  const upper1 = MusicXML.convert(pianoDoc, 0, lineIndex(state, 0, '위 보표 · 성부 1'));
  const text = (r) => r.score.measures.map((m) => m.notes.map((x) => (x.rest ? `r:${x.type}` : `${x.pitch.step}${x.pitch.octave}:${x.type}`)).join(' ')).join(' | ');
  T.check(text(upper2) === 'r:half A4:half | r:whole', `성부 2: 앞 절반 <forward>는 쉼표, 없는 마디는 온쉼표 (${text(upper2)})`);
  T.check(text(lower) === 'C3:whole | G2:half r:half' && lower.score.measures[0].clef === 'bass', `아래 보표: 낮은음자리표(clef number=2) (${text(lower)})`);
  T.check(text(upper1) === 'C5:half D5:half | E5:whole' && upper1.score.measures[0].clef === 'treble', `위 보표 성부 1 (${text(upper1)})`);
  T.check([upper1, upper2, lower].every((r) => r.score.measures.every((m) => Notation.cmp(Notation.filled(m.notes), [1, 1]) === 0)), '모든 마디의 박이 4/4로 맞음');
  T.check(upper1.score.measures[0].tempo === 72, '빠르기 72');

  // What can't be held at all is refused with the reason (37단계 표기는 t37; 38~40단계의 화음·꾸밈음·도돌이표는 이제 담음).
  const refuse = (xml, expected, label) => {
    let message = '';
    try {
      MusicXML.convert(doc36(xml), 0, 0);
    } catch (error) {
      message = error.message;
    }
    T.check(message.includes(expected), `${label}: "${message}"`);
  };
  const one = (body, a = attrs({ key: 0, time: [4, 4], clef: G_CLEF() })) => score36([{ name: 'X', measures: [a + body] }]);
  refuse(one(n('C5', 24) + '<barline location="middle"><repeat direction="backward"/></barline>' + n('D5', 24)), '마디 중간 도돌이표', '마디 중간 도돌이표 (40단계부터 도돌이표는 담음)');
  refuse(one(n('C5', 48), attrs({ key: 0, time: [4, 4], clef: G_CLEF() }).replace('<beats>4</beats>', '<beats>3+2</beats>')), '혼합 박자', '혼합 박자');
  refuse(one(n('C5', 48) + n('D5', 12)), '긴 마디', '박자보다 긴 마디');
});

// Imports through the box: open it, read the file, pick a line, press 불러오기.
async function importThroughBox(xml, name, pick = {}) {
  T.$('btn-new-score').click();
  const state = await importFile(new File([xml], name));
  if (pick.part !== undefined) document.querySelector(`#import-parts input[value="${pick.part}"]`).click();
  if (pick.line !== undefined) document.querySelector(`#import-lines input[value="${pick.line}"]`).click();
  T.$('btn-import').click();
  return state;
}

T.test('36-4 불러오기와 연습 한 사이클', async (T) => {
  T.setMode('score');
  const before = scores.list().length;
  const writeTop = T.$('staff-title').getBoundingClientRect().top;
  const panelHeight = T.$('score-picker').closest('.panel').getBoundingClientRect().height;
  await importThroughBox(BASIC, 'basic.musicxml');
  const saved = scores.get(scoreId);
  T.check(T.$('new-score').hidden && scores.list().length === before + 1 && saved.title === '시험 곡', '[불러오기] → 창이 닫히고 새 악보로 저장');
  T.check(T.$('score-select').value === scoreId && section && section.start === 0 && section.end === 1, `그 악보가 선택되고 처음 2마디부터 (${section?.label})`);
  T.check(T.$('btn-edit-score').dataset.action === 'edit', '불러온 악보도 [편집] (확장 7부터 모든 악보가 편집기로 열림)');

  await T.listen();
  T.enterNotes(current);
  T.submit();
  T.check(/4음 모두 정답/.test(T.resultText()), `구간을 받아 적고 채점 (${T.resultText().slice(0, 40)})`);
  const first = section.label;
  T.next();
  T.check(section && section.label !== first, `다음 구간 (${section?.label})`);

  // A fresh read of the store, as after a reload.
  T.check(Scores.open().list().some((s) => s.id === scoreId && s.title === '시험 곡'), '새로 읽어도(새로고침) 불러온 악보가 남아 있음');
  const id = scoreId;
  T.deleteScore();
  T.check(!scores.get(id) && !Scores.open().list().some((s) => s.id === id), '[삭제] 두 번으로 지워짐');

  // Notices sit in the panel's fixed notice place.
  await importThroughBox(CLARINET, 'cl.musicxml');
  const notice = T.$('score-notice');
  T.check(!notice.hidden && notice.textContent.includes('실음으로 옮겼어요') && notice.textContent.includes('120'), `알림 한 줄 (${notice.textContent})`);
  const panel = T.$('score-picker').closest('.panel').getBoundingClientRect().height;
  T.check(Math.abs(panel - panelHeight) < 0.5 && Math.abs(T.$('staff-title').getBoundingClientRect().top - writeTop) < 0.5,
    `알림이 있어도 패널 높이(${Math.round(panel)})와 받아 적기 위치 그대로`);
  T.check(T.noHorizontalOverflow(), '가로 넘침 없음');
  T.$('score-select').value = scores.list()[0].id;
  T.$('score-select').dispatchEvent(new Event('change'));
  T.check(notice.hidden || !notice.textContent.includes('실음'), '다른 악보를 고르면 불러오기 알림은 사라짐');

  // Editor-range files open in the editor (expansion 5 rule).
  await importThroughBox(SIMPLE, 'simple.musicxml');
  T.check(T.$('btn-edit-score').dataset.action === 'edit', '다장조·4분음표·♩= 80·12마디 이하는 [편집]');
  T.$('btn-edit-score').click();
  T.check(!T.$('editor').hidden && scoreEditor.state.score.measures.flatMap((m) => m.notes).filter((n) => !n.rest).length === 6, '편집기가 열리고 음 6개');
  T.$('editor-cancel').click();

  // Piano: pick the lower staff.
  const state = await importThroughBox(PIANO36, 'piano.musicxml', { line: lineIndex(MusicXML.candidates(doc36(PIANO36)), 0, '아래 보표') });
  T.check(state && Notation.resolve(scores.get(scoreId))[0].clef === 'bass', '고른 보표·성부(아래 보표)가 저장됨');

  // A line that can't be brought in yet: the reason in the box, nothing stored.
  const count = scores.list().length;
  // (38~40단계부터 화음·꾸밈음·도돌이표는 담으므로, 담지 못하는 예는 박자보다 긴 마디로 바꿈.)
  await importThroughBox(score36([{ name: 'X', measures: [attrs({ key: 0, time: [4, 4], clef: G_CLEF() }) + n('C5', 48) + n('D5', 12)] }]), 'long.musicxml');
  T.check(!T.$('new-score').hidden && T.$('import-status').textContent.includes('긴 마디') && T.$('import-status').classList.contains('is-error') && scores.list().length === count,
    `담지 못하는 표기는 창에 이유 (${T.$('import-status').textContent}), 저장 없음`);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
});

T.test('36-4 저장할 수 없는 환경', async (T) => {
  T.setMode('score');
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function () { throw new Error('quota'); };
  try {
    await importThroughBox(SIMPLE, 'simple.musicxml');
    T.check(T.$('score-notice').textContent.includes('저장하지 못했어요'), `저장 실패 안내 (${T.$('score-notice').textContent})`);
    T.check(scores.get(scoreId)?.title === '편집기 범위' && section && section.answer.length === 6, '이번 방문 동안은 연습할 수 있음');
  } finally {
    Storage.prototype.setItem = original;
  }
  // Back to how the other tests expect the store.
  localStorage.removeItem(Scores.STORAGE_KEY);
  for (const s of scores.list()) if (!s.id.startsWith('example-')) scores.remove(s.id);
  localStorage.removeItem(Scores.STORAGE_KEY);
  T.$('score-select').value = scores.list()[0].id;
  T.$('score-select').dispatchEvent(new Event('change'));
  T.setMode('melody');
  clearInterval(ticker36);
});
