// 27단계 — 새 악보 형식(v2)과 저장소. Run with smoke.js; the migration screen test is t27-v1.js (with its head script).
const N = Notation;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fracEq = (a, b) => N.cmp(a, b) === 0;

// A Storage stand-in for Scores.open(storage).
function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: (key) => { delete data[key]; },
  };
}

// The expansion 4 example as v1 stored it.
function v1Twinkle() {
  const line = (x, y, z, w) => [x, x, y, y, z, z, w].map((step, i) => ({ type: i === 6 ? 'h' : 'q', step, accidental: 0 }));
  const a = [...line(0, 4, 5, 4), ...line(3, 2, 1, 0)];
  const b = line(4, 3, 2, 1);
  return { id: 'example-twinkle', title: '반짝반짝 작은 별', time: 4, notes: [...a, ...b, ...b, ...a] };
}

// A v1 score using everything the expansion 4 editor writes: 3/4, dotted half/quarter, eighths, rest, ♯ and ♭.
const V1_RICH = {
  id: 'old-1', title: '옛 악보', time: 3,
  notes: [
    { type: 'q.', step: 0, accidental: 0 }, { type: 'e', step: 3, accidental: 1 }, { type: 'q', step: 6, accidental: -1 },
    { type: 'h.', step: 11, accidental: 0 },
    { type: 'r' }, { type: 'e', step: 4, accidental: 0 }, { type: 'e', step: 5, accidental: 0 }, { type: 'q', step: 7, accidental: 0 },
  ],
};

const BASE = { time: [4, 4], key: { fifths: 0, mode: 'major' }, clef: 'treble', tempo: 80 };
const score = (music, extra = {}) => N.build({ id: 't', title: '시험', ...BASE, music, ...extra });

T.test('27-2 길이 계산', async (T) => {
  const m68 = N.parseMeasures('C5:q D5:8 E5:8. F5:16 E5:8')[0];
  T.check(fracEq(N.filled(m68.notes), N.measureLength([6, 8])), '6/8: 4분+8분+점8분+16분+8분 = 6/8');
  const triplet = N.parseMeasures('3[ C5:8 D5:8 E5:8 ] F5:q')[0];
  T.check(fracEq(N.filled(triplet.notes), N.frac(1, 2)), '2/4: 셋잇단 8분 3개 + 4분 = 1/2 (오차 없음)');
  const mixed = N.parseMeasures('5:4[ C5:16 D5:16 E5:16 F5:16 G5:16 ] A5:8.. B5:32 3[ C6:q D6:q E6:q ]')[0];
  T.check(fracEq(N.filled(mixed.notes), N.frac(1, 1)), '5:4 잇단 16분 + 겹점 8분 + 32분 + 셋잇단 4분 = 4/4');
  T.check(fracEq(N.duration({ type: 'quarter', dots: 2 }), N.frac(7, 16)), '겹점 4분 = 7/16');
  T.check(N.isValid(score('3[ C5:8 D5:8 E5:8 ] F5:q', { time: [2, 4] })), '셋잇단이 든 2/4 악보는 올바름');
  T.check(!N.isValid(score('C5:8 D5:8 E5:8 F5:q', { time: [2, 4] })), '셋잇단 표시 없이 길이가 넘치면 올바르지 않음');
  T.check(!N.isValid(score('3[ C5:8 D5:8 F5:q', { time: [2, 4] })), '닫히지 않은 잇단음표는 올바르지 않음');
  T.check(!N.isValid(score('C5:h | D5:w')), '가운데 마디가 덜 차면 올바르지 않음');
});

T.test('27-2 붙임줄·못갖춘마디·바뀜', async (T) => {
  const s = N.build({
    id: 't', title: '시험', pickup: true, ...BASE, time: [3, 4],
    music: 'G4:q | C5:h. | D5:h E5:q~ | E5:h. | B3:h. | B3:q. C4:8 D4:q',
    changes: { 3: { key: { fifths: 2, mode: 'major' }, tempo: 120 }, 4: { clef: 'bass', time: [6, 8] } },
  });
  T.check(N.isValid(s), '못갖춘마디·마디를 넘는 붙임줄·곡 중간 조·빠르기·음자리표·박자 바뀜 악보가 올바름');
  const notes = s.measures.flatMap((m) => m.notes);
  T.check(notes[3].tie === 'start' && notes[4].tie === 'stop', '붙임줄 시작/끝이 마디를 넘어 짝지어짐');
  const r = N.resolve(s);
  T.check(r[0].number === 0 && r[1].number === 1, '못갖춘마디는 0마디, 다음이 1마디');
  T.check(r[3].key.fifths === 2 && r[3].tempo === 120 && r[2].key.fifths === 0, '조·빠르기 바뀜이 그 마디부터 적용');
  T.check(r[4].clef === 'bass' && eq(r[4].time, [6, 8]) && r[5].clef === 'bass', '음자리표·박자 바뀜이 이어짐');
  T.check(eq(N.clean(JSON.parse(JSON.stringify(s))), s), 'JSON으로 저장했다 읽어도 같음');
  T.check(!N.isValid({ ...s, pickup: false }), '못갖춘마디 표시가 없으면 짧은 첫 마디는 올바르지 않음');
  T.check(!N.isValid(score('C5:h~ D5:h')), '다른 음높이로 이어진 붙임줄은 올바르지 않음');
  T.check(!N.isValid(score('C5:w~')), '이어질 음이 없는 붙임줄은 올바르지 않음');
  T.check(N.isValid(N.build({ id: 't', title: '시험', pickup: true, ...BASE, music: 'G4:q | C5:w | C5:h.' })),
    '마지막 마디는 짧아도 됨 (못갖춘마디를 채우는 끝마디)');
});

T.test('27-2 음높이', async (T) => {
  const m = (step, alter, octave) => N.midi({ step, alter, octave });
  T.check(m('F', 2, 4) === 67 && m('G', 0, 4) === 67, 'F𝄪4 = G4 = 67');
  T.check(m('C', -1, 4) === 59 && m('B', 1, 3) === 60, 'C♭4 = 59, B♯3 = 60');
  T.check(m('E', -2, 4) === 62 && m('A', 0, 0) === 21 && m('C', 0, 8) === 108, 'E𝄫4 = 62, A0 = 21, C8 = 108');
});

T.test('27-2 v1 → v2', async (T) => {
  const twinkle = EXAMPLE_SCORES.find((s) => s.id === 'example-twinkle');
  T.check(eq(N.clean(N.fromLegacy(v1Twinkle())), twinkle), 'v1 반짝반짝 작은 별을 바꾸면 v2 예시와 같음');
  const rich = N.clean(N.fromLegacy(V1_RICH));
  T.check(N.isValid(rich), '임시표·쉼표·점음표가 든 v1 악보가 올바른 v2가 됨');
  T.check(eq(N.toLegacy(rich), V1_RICH), 'v2를 다시 v1로 바꾸면 처음과 같음 (음높이·길이·박자)');
  const midis = rich.measures.flatMap((mm) => mm.notes).filter((n) => !n.rest).map((n) => N.midi(n.pitch));
  const v1Midis = V1_RICH.notes.filter((n) => n.type !== 'r').map(Staff.noteToMidi);
  T.check(eq(midis, v1Midis), `음높이가 같음 (${midis.join(' ')})`);
  T.check(rich.measures.length === 3 && eq(rich.measures[0].time, [3, 4]), '3/4 3마디로 나뉨');
});

T.test('27-4 저장소: 첫 방문·v2', async (T) => {
  const empty = Scores.open(memoryStorage());
  const ids = empty.list().map((s) => s.id);
  T.check(eq(ids, EXAMPLE_SCORES.map((s) => s.id)), `빈 저장소 → 예시 ${ids.length}곡`);
  const kept = N.clean(N.fromLegacy(V1_RICH));
  const stored = memoryStorage({ [Scores.STORAGE_KEY]: JSON.stringify([kept]) });
  T.check(eq(Scores.open(stored).list(), [kept]), 'v2 저장소가 있으면 예시를 다시 넣지 않음');
  const none = memoryStorage({ [Scores.STORAGE_KEY]: '[]' });
  T.check(Scores.open(none).list().length === 0, '모두 지운 빈 목록이면 예시가 다시 생기지 않음');
});

T.test('27-4 저장소: v1 옮기기', async (T) => {
  const storage = memoryStorage({ [Scores.V1_KEY]: JSON.stringify([v1Twinkle(), V1_RICH]) });
  const first = Scores.open(storage);
  const ids = first.list().map((s) => s.id);
  const newExamples = EXAMPLE_SCORES.map((s) => s.id).filter((id) => id !== 'example-twinkle');
  T.check(eq(ids, ['example-twinkle', 'old-1', ...newExamples]), `v1 악보 2개 + 새 예시 ${newExamples.length}곡 (${ids.length}개)`);
  T.check(eq(first.get('old-1'), N.clean(N.fromLegacy(V1_RICH))), '옮긴 악보가 v2 형식');
  T.check(!(Scores.STORAGE_KEY in storage.data), '불러오는 동안에는 쓰지 않음');
  T.check(Scores.open(storage).list().length === ids.length, '저장 전에 다시 열어도 예시가 또 더해지지 않음');
  first.remove('example-greensleeves');
  const after = Scores.open(storage);
  T.check(after.list().length === ids.length - 1 && !after.get('example-greensleeves'), '저장 뒤에는 v2를 읽어, 지운 예시가 다시 생기지 않음');
  T.check(storage.data[Scores.V1_KEY] !== undefined, 'v1 값은 그대로 남음');
  const noTwinkle = Scores.open(memoryStorage({ [Scores.V1_KEY]: JSON.stringify([V1_RICH]) }));
  T.check(!noTwinkle.get('example-twinkle'), 'v1에서 지운 반짝반짝 작은 별은 다시 넣지 않음');
});

T.test('27-4 저장소: 깨진 값', async (T) => {
  const broken = { ...V1_RICH, id: 'old-2', notes: [{ type: 'q', step: 99, accidental: 0 }] };
  const v1 = Scores.open(memoryStorage({ [Scores.V1_KEY]: JSON.stringify([V1_RICH, broken]) }));
  T.check(v1.get('old-1') && !v1.get('old-2') && v1.notice() === '예전 악보 1개를 옮기지 못했어요.', `깨진 v1 악보만 빠지고 안내 ("${v1.notice()}")`);
  const good = N.clean(N.fromLegacy(V1_RICH));
  const bad = { ...good, id: 'x', measures: [{ ...good.measures[0], notes: [{ type: 'quarter', dots: 0, pitch: { step: 'H', alter: 0, octave: 4 } }] }] };
  const v2 = Scores.open(memoryStorage({ [Scores.STORAGE_KEY]: JSON.stringify([good, bad, 'junk']) }));
  T.check(v2.list().length === 1 && v2.notice() === '읽지 못한 악보 2개를 뺐어요.', `깨진 v2 악보만 빠지고 안내 ("${v2.notice()}")`);
  const unreadable = Scores.open(memoryStorage({ [Scores.STORAGE_KEY]: '{oops' }));
  T.check(unreadable.list().length === 0 && unreadable.notice() === '저장된 악보를 읽지 못했어요.', '읽을 수 없는 v2 값은 안내');
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const blocked = Scores.open(throwing);
  T.check(blocked.list().length === EXAMPLE_SCORES.length && blocked.persistent() === false, '접근이 막히면 예시로 메모리에서 동작');
  T.check(blocked.save(good).stored === false && blocked.get('old-1'), '막힌 저장소에도 메모리에는 저장됨');
  const memory = Scores.open(null);
  T.check(memory.notice() === '저장할 수 없는 환경이에요. 이번 방문 동안만 남아요.', '저장소가 없으면 안내');
});

T.test('27-4 예시 악보', async (T) => {
  T.check(EXAMPLE_SCORES.every(N.isValid), `예시 ${EXAMPLE_SCORES.length}곡 모두 검증 통과`);
  const get = (id) => EXAMPLE_SCORES.find((s) => s.id === id);
  const all = (s) => s.measures.flatMap((m) => m.notes);
  const elise = get('example-fur-elise');
  T.check(elise.pickup && eq(elise.measures[0].time, [3, 8]) && elise.measures[0].key.mode === 'minor'
    && all(elise).some((n) => n.type === '16th') && all(elise).some((n) => n.rest), '엘리제: 가단조·3/8·16분음표·쉼표·못갖춘마디');
  const green = get('example-greensleeves');
  T.check(green.pickup && eq(green.measures[0].time, [6, 8]) && green.measures[0].key.mode === 'minor'
    && all(green).some((n) => n.dots === 1 && n.type === 'eighth'), '그린슬리브스: 단조·6/8·점8분·못갖춘마디');
  const king = get('example-mountain-king');
  T.check(king.measures[0].clef === 'bass' && king.measures[0].key.fifths === 2 && king.measures[0].key.mode === 'minor'
    && all(king).some((n) => n.pitch && n.pitch.step === 'E' && n.pitch.alter === 1)
    && all(king).some((n) => n.pitch && n.pitch.step === 'C' && n.pitch.alter === 0), '산왕의 궁전: 낮은음자리표·나단조(♯2)·E♯·C♮');
  T.check(Notation.toLegacy(get('example-twinkle')) !== null, '반짝반짝 작은 별은 지금 편집기 범위');
  T.check(['example-fur-elise', 'example-greensleeves', 'example-mountain-king'].every((id) => Notation.legacyProblem(get(id))),
    '새 예시는 편집기 범위 밖');
});

T.test('27-6 반짝반짝 작은 별: 확장 4와 같음', async (T) => {
  T.setMode('score');
  T.check(scoreId === 'example-twinkle', '처음 고른 악보는 반짝반짝 작은 별');
  const old = Score.sections(v1Twinkle()).map((item) => ({ ...item, time: 4 }));
  // From TODO 31 sections are chosen on the strip; the default (first two measures) is expansion 4's first section.
  T.check(eq(section, old[0]), `기본 구간이 확장 4의 첫 구간과 같음 (${section.label})`);
  T.check(eq(Score.schedule(section.notes), Score.schedule(old[0].notes)), '재생 시각·음높이가 확장 4와 같음');
  T.check(await T.listen(), '재생 후 입력 풀림');
  T.enterNotes(current);
  T.submit();
  T.check(T.resultText().includes('모두 정답'), '한 사이클 정답');
  T.check(!T.$('btn-edit-score').disabled && T.$('score-notice').hidden, '편집 가능, 안내 없음');
});

T.test('27-6 편집기 범위 밖 예시', async (T) => {
  T.setMode('score');
  const head = () => document.querySelector('.panel-head').getBoundingClientRect().height;
  const before = head();
  for (const id of ['example-fur-elise', 'example-greensleeves', 'example-mountain-king']) {
    const select = T.$('score-select');
    select.value = id;
    select.dispatchEvent(new Event('change'));
    const button = T.$('btn-edit-score');
    T.check(!button.disabled && button.textContent === '삭제' && button.dataset.action === 'delete', `${id}: [편집] 자리가 [삭제]`);
    T.check(!T.$('score-notice').hidden && T.$('score-notice').textContent.includes('편집할 수 없어요'), `이유 안내: "${T.$('score-notice').textContent}"`);
    // From TODO 30 the question can be heard (first two measures), but input stays locked until TODO 33.
    T.check(T.$('staff-hint').textContent.includes('곧 그려져요') && current === null, '연습은 임시로 잠김');
    T.check(Math.abs(head() - before) < 0.5, `안내가 보여도 패널 머리 높이가 같음 (${head().toFixed(1)}px)`);
  }
  T.$('score-select').value = 'example-twinkle';
  T.$('score-select').dispatchEvent(new Event('change'));
  T.check(T.$('score-notice').hidden && T.$('btn-edit-score').textContent === '편집', '편집 가능한 악보로 돌아오면 안내가 사라지고 [편집]');
});

T.test('27-6 편집기: 만들기·다시 열기·편집·삭제', async (T) => {
  T.setMode('score');
  const count = scores.list().length;
  T.$('btn-new-score').click();
  T.$('editor-title').value = '새 시험 악보';
  T.$('editor-title').dispatchEvent(new Event('input'));
  document.querySelector('#editor-times [data-beats="3"]').click();
  document.querySelector('#editor-lengths [data-type="q"]').click();
  T.setAccidental(1, 'editor-sharp', 'editor-flat');
  T.clickStep(3, T.$('editor-pad'));
  T.setAccidental(0, 'editor-sharp', 'editor-flat');
  T.clickStep(4, T.$('editor-pad'));
  document.querySelector('#editor-lengths .is-rest').click();
  T.check(!T.$('editor-save').disabled, '3/4 한 마디(파# 솔 쉼표)를 채우면 저장 활성');
  T.$('editor-save').click();
  const saved = scores.list().find((s) => s.title === '새 시험 악보');
  const stored = JSON.parse(localStorage.getItem(Scores.STORAGE_KEY)).find((s) => s.title === '새 시험 악보');
  T.check(saved && scores.list().length === count + 1 && scoreId === saved.id, '저장되어 목록에 더해지고 선택됨');
  T.check(stored && N.isValid(stored) && eq(stored.measures[0].time, [3, 4]) && stored.measures[0].notes[0].pitch.step === 'F'
    && stored.measures[0].notes[0].pitch.alter === 1 && stored.measures[0].notes[2].rest, '저장값이 v2 형식 (3/4, F♯4, 쉼표)');
  T.check(Scores.open().get(saved.id) !== null, '다시 열어도 남아 있음');
  T.$('btn-edit-score').click();
  T.check(T.$('editor-title').value === '새 시험 악보', '편집기에 제목이 열림');
  T.$('editor-title').value = '고친 시험 악보';
  T.$('editor-title').dispatchEvent(new Event('input'));
  T.$('editor-save').click();
  T.check(scores.get(saved.id).title === '고친 시험 악보' && Scores.open().get(saved.id).title === '고친 시험 악보', '편집해 저장하면 바뀜');
  T.$('btn-edit-score').click();
  T.$('editor-delete').click();
  T.$('editor-delete').click();
  T.check(!scores.get(saved.id) && !Scores.open().get(saved.id), '두 번 눌러 삭제');
  // Leave the browser storage as the next width expects it (no list yet: examples).
  localStorage.removeItem(Scores.STORAGE_KEY);
});

T.test('27-6 새 예시도 지울 수 있음', async (T) => {
  T.setMode('score');
  const select = T.$('score-select');
  select.value = 'example-mountain-king';
  select.dispatchEvent(new Event('change'));
  const button = T.$('btn-edit-score');
  button.click();
  T.check(button.textContent === '정말 삭제' && button.getAttribute('aria-label') === '한 번 더 누르면 삭제'
    && scores.get('example-mountain-king'), '한 번 누르면 확인 문구("정말 삭제"), 아직 지워지지 않음');
  const row = button.parentElement;
  T.check(row.scrollWidth <= row.clientWidth + 1 && T.noHorizontalOverflow(), '확인 문구가 떠도 버튼 줄이 넘치지 않음');
  const selectWidth = select.getBoundingClientRect().width;
  T.check(selectWidth >= 88, `확인 문구가 떠도 악보 고르기 칸이 줄어들지 않음 (${Math.round(selectWidth)}px)`);
  T.check(T.$('editor').hidden, '편집기는 열리지 않음');
  button.click();
  T.check(!scores.get('example-mountain-king') && !Scores.open().get('example-mountain-king'), '두 번 눌러 삭제됨 (저장소 포함)');
  // Put it back for the tests that run after this one (the app's list lives on in this page).
  scores.save(EXAMPLE_SCORES.find((s) => s.id === 'example-mountain-king'));
  T.check(scoreId === 'example-twinkle' && T.$('score-select').value === 'example-twinkle', '지운 뒤 첫 악보로 돌아감');
  select.value = 'example-greensleeves';
  select.dispatchEvent(new Event('change'));
  button.click();
  await T.wait(3200);
  T.check(button.textContent === '삭제' && scores.get('example-greensleeves'), '3초가 지나면 확인 상태가 풀림');
  // Back to the first score, as the other tests (smoke.js) expect.
  select.value = 'example-twinkle';
  select.dispatchEvent(new Event('change'));
  localStorage.removeItem(Scores.STORAGE_KEY);
  T.setMode('melody');
});
