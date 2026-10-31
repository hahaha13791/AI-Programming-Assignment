// 33단계 — 채점과 결과. Run with smoke.js.
const N33 = Notation;
const BASE33 = { time: [4, 4], key: { fifths: 0, mode: 'major' }, clef: 'treble', tempo: 80 };
const P33 = (step, alter, octave) => ({ step, alter, octave });

function useScore(score) {
  scores.save(score);
  renderScorePicker();
  T.setMode('score');
  const select = T.$('score-select');
  select.value = score.id;
  select.dispatchEvent(new Event('change'));
}
function dropScore(id) {
  scores.remove(id);
  renderScorePicker();
  for (const s of scores.list()) Settings.setSection(s.id, null);
  localStorage.removeItem(Settings.SECTIONS_KEY);
  const select = T.$('score-select');
  select.value = 'example-twinkle';
  select.dispatchEvent(new Event('change'));
}
const chip33 = (l) => document.querySelector(`#length-chips [data-length="${l}"]`);
const press33 = (i) => T.$('score-strip').querySelector(`.sv-hit[data-measure="${i}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true }));

T.test('33-2 이명동음·붙임줄·오답 표시', async (T) => {
  const s = N33.build({ id: 't33', title: '채점 시험', ...BASE33, music: 'F##4:q B#3:q E4:h~ | E4:q Cb5:q Ebb4:h' });
  T.check(N33.isValid(s), '겹올림·겹내림·붙임줄이 든 시험 악보가 올바름');
  useScore(s);
  chip33('custom').click();
  press33(0);
  press33(1);
  T.check(current.length === 5, `붙임줄 묶음은 한 음: 빈칸 ${current.length}개 (F𝄪 B♯ E C♭ E𝄫)`);
  T.unlock();
  const entered = [P33('G', 0, 4), P33('C', 0, 4), P33('E', 0, 4), P33('B', 0, 4), P33('D', 0, 4)];
  for (const p of entered) T.enterPitch(p);
  T.check(!T.$('btn-submit').disabled, '빈칸을 다 채우면 제출 활성');
  T.submit();
  T.check(T.resultText().includes('5음 모두 정답'), `F𝄪에 G, B♯3에 C4, C♭5에 B4, E𝄫에 D를 적어도 정답 (${T.$('result-area').querySelector('.score').textContent})`);
  T.next();
  T.unlock();
  const wrong = [P33('G', 0, 4), P33('C', 0, 5), P33('E', 0, 4), P33('B', 0, 4), P33('E', 0, 4)];
  for (const p of wrong) T.enterPitch(p);
  T.submit();
  const red = [...scoreInput.svg.querySelectorAll('.si-note.is-wrong')].length;
  const green = [...scoreInput.svg.querySelectorAll('.si-note.is-correct')].length;
  T.check(T.resultText().includes('5음 중 3음 정답') && red === 2 && green === 3, `옥타브가 다른 C5와 E는 오답: 빨강 ${red}, 초록 ${green}`);
  const redLabels = [...scoreInput.svg.querySelectorAll('.si-label.is-wrong')].map((l) => l.textContent);
  T.check(redLabels.length === 2, `틀린 음의 계이름도 빨강 (${redLabels})`);
  dropScore('t33');
});

T.test('33-4 정답 구간 악보', async (T) => {
  const king = EXAMPLE_SCORES.find((s) => s.id === 'example-mountain-king');
  T.setMode('score');
  const select = T.$('score-select');
  select.value = king.id;
  select.dispatchEvent(new Event('change'));
  chip33(2).click();
  press33(1);
  T.check(section.label === '2~3마디', `곡 중간 구간 (${section.label})`);
  T.unlock();
  T.enterNotes(current);
  T.submit();
  T.check(T.resultText().includes('모두 정답'), '정답');
  const sheet = T.$('result-area').querySelector('.answer-sheet svg');
  T.check(sheet && sheet.querySelector('.sv-clef[data-clef="bass"]') && sheet.querySelectorAll('.sv-key').length === 2
    && sheet.querySelector('.sv-time[data-time="4/4"]'), '정답 악보 첫머리에 낮은음자리표·조표 ♯2·박자표');
  const numbers = [...sheet.querySelectorAll('.sv-measure')].map((g) => g.dataset.number);
  T.check(JSON.stringify(numbers) === '["2","3"]', `원래 마디 번호 (${numbers})`);
  // The same measures drawn in the full score: the same notes and accidentals.
  const box = document.createElement('div');
  document.querySelector('.practice').append(box);
  Sheet.draw(box, king);
  const marksOf = (root, n) => [...root.querySelectorAll(`.sv-measure[data-number="${n}"] .sv-note`)]
    .map((g) => `${g.dataset.midi}:${g.querySelector('.sv-accidental')?.dataset.accidental ?? '-'}`).join(' ');
  T.check(marksOf(sheet, 2) === marksOf(box, 2) && marksOf(sheet, 3) === marksOf(box, 3), '악보 보기와 같은 음·임시표');
  box.remove();
  const chips = [...T.$('result-area').querySelectorAll('.answer-chips .note-chip')].map((c) => c.textContent.replace('✓', '').trim());
  T.check(chips[0] === '레#' && chips[4] === '시♭', `정답 계이름은 설정 방식(이동도): E♯ 레#, C♮ 시♭ (${chips.slice(0, 5)})`);
  Settings.set('solfege', 'fixed');
  T.next();
  T.unlock();
  T.enterNotes(current);
  T.submit();
  const fixedChips = [...T.$('result-area').querySelectorAll('.answer-chips .note-chip')].map((c) => c.textContent.replace('✓', '').trim());
  T.check(section.label === '4마디' && fixedChips[0] === '라', `고정도로 바꾸면 결과도 고정도 (4마디 첫 음 A3: 이동도 솔 → 고정도 ${fixedChips[0]})`);
  Settings.set('solfege', 'movable');
  localStorage.removeItem(Settings.STORAGE_KEY);
  for (const s of scores.list()) Settings.setSection(s.id, null);
  localStorage.removeItem(Settings.SECTIONS_KEY);
});

T.test('33-4 긴 구간 결과', async (T) => {
  const long = N33.build({ id: 'long33', title: '긴 결과', ...BASE33, music: Array(8).fill('C4:8 D4:8 E4:8 F4:8 G4:8 A4:8 B4:8 C5:8').join(' | ') });
  useScore(long);
  chip33('custom').click();
  press33(0);
  press33(7);
  T.check(current.length === 64, `8마디 64음 구간 (${current.length})`);
  T.unlock();
  T.enterNotes(current);
  T.submit();
  const sheet = T.$('result-area').querySelector('.answer-sheet');
  const chips = T.$('result-area').querySelector('.answer-chips.is-scroll');
  T.check(T.resultText().includes('64음 모두 정답'), '64음 정답');
  T.check(T.noHorizontalOverflow(), '페이지 전체에는 가로 스크롤 없음');
  T.check(sheet.scrollWidth > sheet.clientWidth && chips.scrollWidth > chips.clientWidth, '정답 악보와 계이름 줄은 좌우로 스크롤');
  dropScore('long33');
});

T.test('33-4 예시 악보와 편집기 악보 한 사이클', async (T) => {
  T.setMode('score');
  const select = T.$('score-select');
  for (const id of EXAMPLE_SCORES.map((s) => s.id)) {
    select.value = id;
    select.dispatchEvent(new Event('change'));
    T.check(await T.listen(), `${id}: 재생 후 입력 풀림`);
    T.enterNotes(current);
    T.submit();
    T.check(T.resultText().includes('모두 정답') && T.$('result-area').querySelector('.answer-sheet svg'), `${id}: 정답과 정답 구간 악보 (${section.label})`);
    const first = section.label;
    T.next();
    T.check(section && section.label !== first, `${id}: 다음 구간 (${section?.label})`);
  }
  // A score made in the editor.
  T.$('btn-new-score').click();
  T.$('editor-title').value = '편집기 악보';
  T.$('editor-title').dispatchEvent(new Event('input'));
  document.querySelector('#editor-lengths [data-type="h"]').click();
  T.clickStep(4, T.$('editor-pad'));
  T.setAccidental(-1, 'editor-sharp', 'editor-flat');
  T.clickStep(6, T.$('editor-pad'));
  T.setAccidental(0, 'editor-sharp', 'editor-flat');
  T.$('editor-save').click();
  T.check(scores.get(scoreId)?.title === '편집기 악보', '편집기로 만든 악보가 선택됨');
  T.check(await T.listen(), '재생 후 입력 풀림');
  T.enterNotes(current);
  T.submit();
  T.check(T.resultText().includes('2음 모두 정답') && current[1].step === 'B' && current[1].alter === -1, '솔·시♭ 한 사이클');
  scores.remove(scoreId);
  for (const s of scores.list()) Settings.setSection(s.id, null);
  localStorage.removeItem(Settings.SECTIONS_KEY);
  localStorage.removeItem(Scores.STORAGE_KEY);
  renderScorePicker();
  select.value = 'example-twinkle';
  select.dispatchEvent(new Event('change'));
  T.setMode('melody');
});
