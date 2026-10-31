// 34단계 — 확장 5 완성 기준 점검 (PRD #10 확장 5). Run with smoke.js; 34-4's migration part is t27-v1.js.
const N34 = Notation;
const byId = (id) => EXAMPLE_SCORES.find((s) => s.id === id);
const memory34 = (initial = {}) => {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; } };
};
function choose34(id) {
  T.setMode('score');
  const select = T.$('score-select');
  select.value = id;
  select.dispatchEvent(new Event('change'));
}
const chip34 = (l) => document.querySelector(`#length-chips [data-length="${l}"]`);
const press34 = (i) => T.$('score-strip').querySelector(`.sv-hit[data-measure="${i}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
function forget34() {
  for (const s of scores.list()) Settings.setSection(s.id, null);
  localStorage.removeItem(Settings.SECTIONS_KEY);
}

T.test('34-1 예시 악보의 표기와 재생', async (T) => {
  const box = document.createElement('div');
  box.className = 'staff-area score-area';
  document.querySelector('.practice').append(box);
  const found = {};
  for (const score of EXAMPLE_SCORES) {
    Sheet.draw(box, score);
    const notes = score.measures.flatMap((m) => m.notes).length;
    T.check(box.querySelectorAll('.sv-note').length === notes, `${score.title}: 음표·쉼표 ${notes}개가 모두 그려짐`);
    const has = (sel) => box.querySelector(sel) !== null;
    if (has('.sv-key')) found.조표 = true;
    if (score.measures[0].key.mode === 'minor') found.단조 = true;
    if (has('.sv-time[data-time="6/8"]')) found.겹박자 = true;
    if (has('.sv-note[data-type="16th"]')) found['16분음표'] = true;
    if (has('.sv-tie')) found.붙임줄 = true;
    if (has('.sv-tuplet')) found.잇단음표 = true;
    if (score.pickup) found.못갖춘마디 = true;
    if (has('.sv-clef[data-clef="bass"]')) found.낮은음자리표 = true;
    if (has('.sv-ledger')) found.덧줄 = true;
    // Played in its key and tempo: the first sounding note lasts its written length at the score's tempo.
    const r = Playback.schedule(score, { start: 0, end: 0, tonic: false });
    const first = score.measures[0].notes.find((n) => !n.rest);
    const expected = N34.toNumber(N34.duration(first)) * 4 * 60 / score.measures[0].tempo * Playback.NOTE_SHARE;
    T.check(r.events[0].midi === N34.midi(first.pitch) && Math.abs(r.events[0].length - expected) < 1e-6 || Boolean(first.tie),
      `${score.title}: 원래 음높이·빠르기(♩=${score.measures[0].tempo})로 재생`);
  }
  const wanted = ['조표', '단조', '겹박자', '16분음표', '붙임줄', '잇단음표', '못갖춘마디', '낮은음자리표', '덧줄'];
  const missing = wanted.filter((w) => !found[w]);
  T.check(!missing.length, `예시 악보 전체에 기준의 표기가 모두 있음 ${missing.length ? `(없음: ${missing})` : ''}`);
  const etude = byId('example-rhythm-etude');
  T.check(N34.isValid(etude) && Playback.tonicOf(etude, 4, 5).midi % 12 === 7, '연습곡: 올바르고, 조 바뀐 5마디부터는 기준음이 사장조 도(G)');
  box.remove();
});

T.test('34-1 나중에 더한 예시는 한 번만', async (T) => {
  const oldList = JSON.stringify([byId('example-twinkle')]);
  const storage = memory34({ [Scores.STORAGE_KEY]: oldList });
  const first = Scores.open(storage);
  T.check(first.get('example-rhythm-etude') && !first.get('example-fur-elise'), '33단계까지 저장된 목록에도 연습곡이 한 번 더해짐 (지운 예시는 그대로 없음)');
  first.remove('example-rhythm-etude');
  const again = Scores.open(storage);
  T.check(!again.get('example-rhythm-etude') && JSON.parse(storage.data[Scores.EXAMPLES_KEY]).includes('example-rhythm-etude'),
    '연습곡을 지우면 다시 생기지 않음');
});

T.test('34-2 예시 악보 한 사이클 (붙임줄·셋잇단)', async (T) => {
  forget34();
  choose34('example-rhythm-etude');
  chip34(2).click();
  press34(0);
  T.check(section.label === '1~2마디' && current.length === 8, `1~2마디: 붙임줄 묶음을 한 음으로 8음 (${current.length})`);
  T.check(T.$('btn-tonic').textContent === '기준음(도) 듣기', '기준음(도)');
  T.check(await T.listen(), '구간 재생 후 입력 풀림');
  T.enterNotes(current);
  T.submit();
  T.check(T.resultText().includes('8음 모두 정답'), '정답');
  const sheet = T.$('result-area').querySelector('.answer-sheet');
  T.check(sheet.querySelector('.sv-tie') && sheet.querySelector('.sv-tuplet'), '정답 구간 악보에 붙임줄과 셋잇단');
  T.next();
  T.check(section.label === '3~4마디', `다음 구간 (${section.label})`);
  press34(4);
  T.check(section.label === '5~6마디' && T.$('score-input').querySelectorAll('.score-input-fixed .sv-key').length === 1,
    '조 바뀐 5마디부터: 받아 적기 오선에 조표 ♯1');
  forget34();
});

T.test('34-3 계이름·빠르기 설정', async (T) => {
  forget34();
  choose34('example-greensleeves');
  T.$('btn-settings').click();
  document.querySelector('#settings input[value="fixed"]').click();
  document.querySelector('#settings input[value="0.5"]').click();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  const calls = [];
  const original = Sound.playEvents;
  Sound.playEvents = (events, total) => { calls.push(total); return original(events, total); };
  T.check(await T.listen(), '재생 후 입력 풀림');
  Sound.playEvents = original;
  const half = Playback.schedule(byId('example-greensleeves'), { start: 0, end: 1, tonic: true, speed: 0.5 }).total;
  T.check(Math.abs(calls[0] - half) < 1e-6, '아주 느리게(50%)로 재생');
  T.enterNotes(current);
  const labels = [...scoreInput.scroller.querySelectorAll('.si-label')].map((l) => l.textContent);
  T.check(labels[0] === '라' && labels[1] === '도', `받아 적기 계이름이 고정도 (A4 라, C5 도: ${labels.slice(0, 2)})`);
  T.submit();
  const chips = [...T.$('result-area').querySelectorAll('.note-chip')].map((c) => c.textContent.replace('✓', '').trim());
  T.check(chips[0] === '라' && chips[1] === '도', '결과 계이름도 고정도');
  const saved = JSON.parse(localStorage.getItem(Settings.STORAGE_KEY));
  T.check(saved.solfege === 'fixed' && saved.speed === 0.5, '다시 열어도 기억되도록 저장됨');
  Settings.set('solfege', 'movable');
  Settings.set('speed', 1);
  scoreInput.setStyle('movable');
  localStorage.removeItem(Settings.STORAGE_KEY);
  forget34();
});

T.test('34-4 기존 악보·편집기·모드 유지', async (T) => {
  choose34('example-twinkle');
  T.$('btn-edit-score').click();
  T.check(!T.$('editor').hidden && T.$('editor-title').value === '반짝반짝 작은 별', '반짝반짝 작은 별은 편집기로 열림');
  T.$('editor-cancel').click();
  choose34('example-rhythm-etude');
  T.check(T.$('btn-edit-score').textContent === '삭제' && T.$('score-notice').textContent.includes('편집할 수 없어요'),
    '편집기 밖 악보는 이유 안내와 [삭제] (편집기는 확장 7)');
  choose34('example-twinkle');
  T.setMode('melody');
  T.check(await T.listen(), '멜로디 모드 재생');
  T.enterNotes(current);
  T.submit();
  T.check(T.resultText().includes('모두 정답'), '멜로디 모드 한 사이클');
});

T.test('34-5 배치', async (T) => {
  const tops = ['melody', 'harmony', 'rhythm', 'score'].map((m) => {
    T.setMode(m);
    T.check(T.noHorizontalOverflow(), `${m}: 가로 스크롤 없음`);
    return Math.round(T.$('staff-title').getBoundingClientRect().top);
  });
  T.check(tops.every((t) => t === tops[0]), `네 모드의 받아 적기 위치가 같음 (${tops})`);
  for (const score of EXAMPLE_SCORES) {
    choose34(score.id);
    chip34(4).click();
    press34(0);
    T.unlock();
    T.enterNotes(current);
    T.submit();
    T.check(T.noHorizontalOverflow() && Math.round(T.$('staff-title').getBoundingClientRect().top) === tops[0],
      `${score.title} 4마디 결과: 가로 스크롤 없음, 받아 적기 위치 그대로`);
  }
  forget34();
  choose34('example-twinkle');
  T.setMode('melody');
});
