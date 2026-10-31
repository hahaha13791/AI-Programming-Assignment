// 32단계 — 받아 적기: 조표·넓은 음역·좌우 스크롤·계이름. Run with smoke.js.
const N32 = Notation;
const BASE32 = { time: [4, 4], key: { fifths: 0, mode: 'major' }, clef: 'treble', tempo: 80 };
const P = (step, alter, octave) => ({ step, alter, octave });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// A score input of its own (with its own buttons), to try keys and clefs that practice can't open until TODO 33.
function testInput() {
  const host = document.createElement('div');
  host.className = 'staff-area score-input-area';
  const buttons = ['sharp', 'flat', 'natural', 'undo', 'clear'].map((name) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.name = name;
    host.append(b);
    return b;
  });
  const area = document.createElement('div');
  host.prepend(area);
  document.querySelector('.practice').append(host);
  const [sharp, flat, natural, undo, clear] = buttons;
  const input = ScoreInput.create({ container: area, sharpButton: sharp, flatButton: flat, naturalButton: natural, undoButton: undo, clearButton: clear });
  input.setLocked(false);
  const pressAt = (pitch) => {
    const point = input.pointFor(pitch);
    input.svg.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: point.x, clientY: point.y }));
  };
  return { input, host, sharp, flat, natural, undo, clear, pressAt };
}

T.test('32-2 조표가 적용된 입력', async (T) => {
  const t = testInput();
  t.input.reset({ clef: 'treble', key: { fifths: 1, mode: 'major' }, range: [P('C', 0, 4), P('G', 0, 5)], capacity: 8 });
  t.input.setLocked(false);
  t.pressAt(P('F', 0, 4));
  t.natural.click();
  t.pressAt(P('F', 0, 4));
  t.natural.click();
  t.sharp.click();
  t.pressAt(P('C', 0, 5));
  t.sharp.click();
  t.flat.click();
  t.pressAt(P('B', 0, 4));
  T.check(same(t.input.getNotes(), [P('F', 1, 4), P('F', 0, 4), P('C', 1, 5), P('B', -1, 4)]),
    `사장조: 파 자리 → 파#, ♮ → 파, ♯ → 도#, ♭ → 시♭ (${t.input.getNotes().map((n) => n.step + n.alter).join(' ')})`);
  T.check(t.natural.getAttribute('aria-pressed') === 'false' && t.flat.getAttribute('aria-pressed') === 'true', '토글은 끌 때까지 켜져 있고 하나만 켜짐');
  t.flat.click();
  t.input.reset({ clef: 'treble', key: { fifths: -3, mode: 'minor' }, range: [P('C', 0, 4), P('G', 0, 5)], capacity: 4 });
  t.input.setLocked(false);
  t.pressAt(P('E', 0, 4));
  t.pressAt(P('A', 0, 4));
  t.pressAt(P('B', 0, 4));
  t.pressAt(P('F', 0, 4));
  T.check(same(t.input.getNotes(), [P('E', -1, 4), P('A', -1, 4), P('B', -1, 4), P('F', 0, 4)]), '다단조(♭3): 미·라·시 자리는 ♭, 파는 그대로');
  const keyPos = [...t.host.querySelectorAll('.score-input-fixed .sv-key')].map((k) => Number(k.dataset.pos));
  T.check(same(keyPos, [4, 7, 3]), `조표 ♭3이 고정 칸에 표준 위치로 (${keyPos})`);
  t.host.remove();
});

T.test('32-2 낮은음자리표', async (T) => {
  const t = testInput();
  t.input.reset({ clef: 'bass', key: { fifths: 2, mode: 'minor' }, range: [P('B', 0, 2), P('B', 0, 3)], capacity: 4 });
  t.input.setLocked(false);
  for (const p of [P('G', 0, 2), P('B', 0, 2), P('F', 1, 3), P('C', 0, 4)]) t.pressAt(p);
  const midis = t.input.getNotes().map(N32.midi);
  T.check(same(midis, [43, 47, 54, 61]), `낮은음자리표 나단조: 솔(G2)·시(B2)·파#(F#3)·도#(C#4) (${midis})`);
  const lines = [...t.host.querySelectorAll('.score-input-svg > line.staff-line')].map((l) => Number(l.getAttribute('y1')));
  const head = t.host.querySelector('.si-note[data-pos="0"] .note-head');
  T.check(head && Math.abs(Number(head.getAttribute('cy')) - Math.max(...lines)) < 0.5, 'G2가 맨 아랫줄에 그려짐');
  T.check(t.host.querySelector('.score-input-fixed [data-clef="bass"]'), '낮은음자리표가 보임');
  const ledgers = [...t.host.querySelectorAll('.si-note[data-pos="10"] .sv-ledger')].length;
  T.check(ledgers === 1, 'C4(위 덧줄 1개)에 덧줄');
  t.host.remove();
});

T.test('32-2 음역은 악보 단위', async (T) => {
  T.setMode('score');
  const select = T.$('score-select');
  select.value = 'example-twinkle';
  select.dispatchEvent(new Event('change'));
  const chip = (l) => document.querySelector(`#length-chips [data-length="${l}"]`);
  chip(2).click();
  const press = (i) => T.$('score-strip').querySelector(`.sv-hit[data-measure="${i}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  press(0);
  const first = JSON.stringify(scoreInput.range());
  press(4);
  const later = JSON.stringify(scoreInput.range());
  T.check(first === later, `1~2마디(C4~A4)와 5~6마디(D4~G4)의 입력 음역이 같음 (${first})`);
  const { low, high } = scoreInput.range();
  T.check(low <= -2 - 3 + 1 && high >= 10, '악보 음역(C4~A4) 위아래로 여유');
  const svg = scoreInput.svg;
  const ratio = svg.getBoundingClientRect().height / svg.viewBox.baseVal.height;
  T.check(scoreInput.step() * ratio >= 7, `줄/칸 한 단계 ${(scoreInput.step() * ratio).toFixed(1)}px (7 이상)`);
  T.check(T.$('staff-area').hidden && !T.$('score-input').hidden && !T.$('score-accidentals').hidden && T.$('accidentals').hidden,
    '내 악보는 새 받아 적기 오선과 ♯/♭/♮');
  T.setMode('melody');
  T.check(!T.$('staff-area').hidden && T.$('score-input').hidden && !T.$('accidentals').hidden && T.$('score-accidentals').hidden,
    '멜로디 모드는 원래 오선과 ♯/♭');
  localStorage.removeItem(Settings.SECTIONS_KEY);
  Settings.setSection('example-twinkle', null);
});

T.test('32-2 덧줄 많은 악보도 한 단계 7px 이상', async (T) => {
  const t = testInput();
  t.input.reset({ clef: 'treble', key: { fifths: 0, mode: 'major' }, range: [P('F', 0, 3), P('E', 0, 6)], capacity: 4 });
  const svg = t.input.svg;
  const ratio = svg.getBoundingClientRect().height / svg.viewBox.baseVal.height;
  T.check(t.input.step() * ratio >= 7, `F3~E6 악보: ${(t.input.step() * ratio).toFixed(1)}px`);
  T.check(T.noHorizontalOverflow(), '페이지 가로 스크롤 없음');
  t.host.remove();
});

T.test('32-4 긴 구간 좌우 스크롤', async (T) => {
  const long = N32.build({ id: 'long32', title: '긴 구간', ...BASE32, music: Array(6).fill('C4:q E4:q G4:q C5:q').join(' | ') });
  scores.save(long);
  renderScorePicker();
  T.setMode('score');
  const select = T.$('score-select');
  select.value = 'long32';
  select.dispatchEvent(new Event('change'));
  const chip = document.querySelector('#length-chips [data-length="custom"]');
  chip.click();
  const press = (i) => T.$('score-strip').querySelector(`.sv-hit[data-measure="${i}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  press(0);
  press(5);
  T.check(current.length === 24, `1~6마디: 음 ${current.length}개`);
  T.unlock();
  const sc = scoreInput.scroller;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const b = sc.getBoundingClientRect();
    return r.left >= b.left - 1 && r.right <= b.right + 1;
  };
  let allVisible = true;
  for (const p of current) {
    T.enterPitch(p);
    const next = sc.querySelector('.si-empty.is-next');
    if (next && !visible(next)) allVisible = false;
  }
  T.check(scoreInput.getNotes().length === 24 && !T.$('btn-submit').disabled, '끝까지 입력하면 제출 활성');
  T.check(allVisible, '음을 찍을 때마다 다음 빈칸이 화면 안에 보임');
  T.check(T.width >= 1000 || sc.scrollWidth > sc.clientWidth, '화면보다 길면 좌우로 스크롤됨');
  const heads = [...sc.querySelectorAll('.si-note:not(.is-ghost) .note-head')].map((h) => Number(h.getAttribute('cx')));
  const labels = [...sc.querySelectorAll('.si-label')].map((l) => Number(l.getAttribute('x')));
  T.check(same(heads, labels), '계이름 줄이 음표와 같은 자리(같은 스크롤)');
  T.$('btn-undo').click();
  T.$('btn-undo').click();
  const slot = sc.querySelector('.si-empty.is-next');
  T.check(slot && visible(slot), '지우면 그 자리로 돌아감');
  sc.scrollLeft = sc.scrollWidth;
  const point = scoreInput.pointFor(P('G', 0, 4));
  scoreInput.svg.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: point.x, clientY: point.y }));
  const ghost = sc.querySelector('.si-note.is-ghost');
  const ghostHead = ghost?.querySelector('.note-head');
  T.check(ghost && Number(ghost.dataset.pos) === 2 && Math.abs(Number(ghostHead.getAttribute('cx')) - heads[22]) < 0.5,
    `스크롤된 상태에서도 미리보기 음표가 다음 칸·가리킨 높이에 (pos ${ghost?.dataset.pos}, x ${ghostHead?.getAttribute('cx')} / ${heads[22]})`);
  scores.remove('long32');
  renderScorePicker();
  localStorage.removeItem(Settings.SECTIONS_KEY);
  select.value = 'example-twinkle';
  select.dispatchEvent(new Event('change'));
});

T.test('32-6 계이름', async (T) => {
  const L = ScoreInput.label;
  const G = { fifths: 1, mode: 'major' };
  const Am = { fifths: 0, mode: 'minor' };
  const Em = { fifths: 1, mode: 'minor' };
  T.check(L(P('G', 0, 4), G) === '도' && L(P('G', 0, 4), G, 'fixed') === '솔', '사장조 G: 이동도 도, 고정도 솔');
  T.check(L(P('A', 0, 4), Am) === '라' && L(P('A', 0, 4), Am, 'fixed') === '라', '가단조 A: 이동도 라, 고정도 라');
  T.check(L(P('E', 0, 4), Em) === '라' && L(P('E', 0, 4), Em, 'fixed') === '미', '마단조 E: 이동도 라, 고정도 미');
  T.check(L(P('F', 1, 4), G) === '시' && L(P('F', 0, 4), G) === '시♭' && L(P('F', 1, 4), G, 'fixed') === '파#', '사장조 F#: 시, F: 시♭ / 고정도 파#');
  T.check(L(P('G', 1, 4), Am) === '솔#' && L(P('F', 2, 4), Am) === '파𝄪' && L(P('B', -2, 4), { fifths: -2, mode: 'major' }) === '도♭',
    '변화음: 가단조 G# 솔#, F𝄪 파𝄪, 내림나장조 B𝄫(으뜸음을 반음 내림) 도♭');
  T.check(L(P('B', -2, 4), { fifths: 0, mode: 'major' }, 'fixed') === '시𝄫', '고정도 B𝄫 시𝄫');
});

T.test('32-6 설정과 화면', async (T) => {
  T.setMode('score');
  T.check(Settings.get('solfege') === 'movable', '기본은 이동도');
  T.unlock();
  T.enterNotes(current.slice(0, 2));
  const labels = () => [...scoreInput.scroller.querySelectorAll('.si-label')].map((l) => l.textContent).join(' ');
  T.check(labels() === '도 도', `받아 적기 계이름 줄 (${labels()})`);
  T.$('btn-settings').click();
  document.querySelector('#settings input[value="fixed"]').click();
  T.check(Settings.get('solfege') === 'fixed' && JSON.parse(localStorage.getItem(Settings.STORAGE_KEY)).solfege === 'fixed', '고정도를 고르면 저장됨');
  T.check(labels() === '도 도' && scoreInput.getNotes().length === 2, '다장조라 같음, 입력은 그대로 남음');
  document.querySelector('#settings input[value="movable"]').click();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  T.setMode('melody');
  T.unlock();
  T.enterNotes(current.slice(0, 1));
  const chip = T.$('note-preview').textContent;
  T.check(chip.includes(Staff.noteLabel(current[0])), '멜로디 모드 계이름은 그대로');
  localStorage.removeItem(Settings.STORAGE_KEY);
  newQuestion(); // leave the melody staff empty for the tests after this
});
