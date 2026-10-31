// Smoke / regression test: one full cycle of every mode (listen → enter → submit → result → next).
// Also proves the runner itself works. Run it alongside a stage test as the regression part.

T.test('첫 화면', async (T) => {
  T.check(mode === 'melody', '멜로디 모드로 시작');
  T.check(T.$('btn-submit').disabled, '처음에는 제출 비활성');
  T.check(T.noHorizontalOverflow(), '가로 스크롤 없음');
});

T.test('멜로디 정답', async (T) => {
  T.setMode('melody');
  T.check(await T.listen(), '재생이 끝나면 입력이 풀림');
  T.enterNotes(current);
  T.check(staff.getNotes().length === current.length, `${current.length}음 입력됨`);
  T.check(!T.$('btn-submit').disabled, '다 적으면 제출 활성');
  T.submit();
  T.check(T.resultText().includes('모두 정답'), '정답 그대로 적으면 모두 정답');
  T.check(T.$('btn-next'), '다음 문제 버튼');
});

T.test('멜로디 오답', async (T) => {
  T.next();
  T.unlock();
  // Every note one step off (C4 → D4, others down one), so none can match even enharmonically.
  T.enterNotes(current.map((note) => ({ step: note.step === 0 ? 1 : note.step - 1, accidental: 0 })));
  T.submit();
  T.check(!T.resultText().includes('모두 정답'), '틀리게 적으면 모두 정답이 아님');
  T.check(document.querySelectorAll('#staff-area .is-wrong').length > 0, '틀린 음이 빨강(is-wrong)');
});

for (const type of ['triad', 'seventh']) {
  T.test(`화성 ${type}`, async (T) => {
    T.setMode('harmony');
    T.setChordType(type);
    T.setLevel('hard');
    T.check(await T.listen(), '재생 후 입력 풀림');
    T.enterNotes(current);
    T.submit();
    T.check(T.resultText().includes('모두 정답'), `정답 구성음 ${current.length}개 → 모두 정답`);
    T.check(T.$('result-area').querySelector('.chord-name')?.textContent === chord.name, `화음 이름 표시 (${chord.name})`);
    T.setLevel('easy');
  });
}

for (const lv of ['easy', 'hard']) {
  T.test(`리듬 ${lv}`, async (T) => {
    T.setMode('rhythm');
    T.setLevel(lv);
    T.check(await T.listen(), '카운트인·재생 후 입력 풀림');
    if (lv === 'hard') T.setTime(current.time[0]);
    T.enterRhythm(current.measures.flat());
    T.check(!T.$('btn-submit').disabled, '다 적으면 제출 활성');
    T.submit();
    T.check(T.resultText().includes('모두 정답'), `${current.measures.length}마디 → 모두 정답`);
    if (lv === 'hard') T.check(T.resultText().includes('박자표 정답'), '박자표 정답 표시');
    T.setLevel('easy');
  });
}

T.test('내 악보', async (T) => {
  T.setMode('score');
  T.check(T.$('score-select').options.length > 0, '예시 악보가 있음');
  const chips = T.$('section-chips').children.length;
  T.check(chips > 1, `구간 칩 ${chips}개`);
  T.check(await T.listen(), '재생 후 입력 풀림');
  T.enterNotes(current);
  T.submit();
  T.check(T.resultText().includes('모두 정답'), `구간 ${section.label} → 모두 정답`);
  const first = section.label;
  T.next();
  T.check(section.label !== first, `다음 문제는 다음 구간 (${section.label})`);
  T.check(T.noHorizontalOverflow(), '가로 스크롤 없음');
  T.setMode('melody');
});
