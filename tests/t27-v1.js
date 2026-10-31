// 27단계 — 확장 4(v1) 악보가 있는 브라우저로 열었을 때. Run with --head tests/t27-v1.head.js.

T.test('27-6 옮겨 온 악보로 연습', async (T) => {
  T.setMode('score');
  const ids = scores.list().map((s) => s.id);
  T.check(ids[0] === 'old-1' && ids[1] === 'example-twinkle', `v1 악보가 순서대로 옮겨짐 (${ids.join(', ')})`);
  T.check(['example-fur-elise', 'example-greensleeves', 'example-mountain-king'].every((id) => ids.includes(id)), '새 예시가 더해짐');
  T.check(scoreId === 'old-1' && T.$('score-notice').hidden, '첫 악보(옛 악보)가 선택되고 안내 없음');
  T.check(T.$('score-strip').querySelectorAll('.sv-hit').length === 3 && section.label === '1~2마디', '악보 띠에 3마디, 기본 구간 1~2마디');
  T.check(await T.listen(), '재생 후 입력 풀림');
  T.check(current.length === 4, `첫 구간(1~2마디) 음 ${current.length}개`);
  T.enterNotes(current);
  T.submit();
  T.check(T.resultText().includes('모두 정답'), '정답 그대로 적으면 모두 정답');
  T.check(T.$('result-area').textContent.includes('파#') && T.$('result-area').textContent.includes('시♭'), '정답 계이름에 임시표가 그대로 (파#, 시♭)');
});

T.test('27-6 옮겨 온 악보 편집·저장', async (T) => {
  T.setMode('score');
  T.$('btn-edit-score').click();
  T.check(!T.$('editor').hidden && T.$('editor-title').value === '옛 악보', '편집기가 옛 악보로 열림');
  T.check(document.querySelector('#editor-times [data-beats="3"]').getAttribute('aria-checked') === 'true', '박자 3/4');
  T.$('editor-save').click();
  const stored = JSON.parse(localStorage.getItem(Scores.STORAGE_KEY) || 'null');
  T.check(Array.isArray(stored) && stored.length === scores.list().length && stored.every(Notation.isValid), '저장하면 목록 전체가 v2로 쓰임');
  const old = stored.find((s) => s.id === 'old-1');
  T.check(old && JSON.stringify(Notation.toLegacy(old).notes) === JSON.stringify(JSON.parse(localStorage.getItem(Scores.V1_KEY))[0].notes),
    '편집기로 다시 저장해도 음은 그대로');
  T.check(localStorage.getItem(Scores.V1_KEY) !== null, 'v1 값은 지우지 않음');
});
