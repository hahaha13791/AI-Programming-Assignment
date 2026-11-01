// 63단계 — 결과의 정답 구간에 계이름. Run with smoke.js.
{
  const ticker = setInterval(() => {}, 10); // file reads run off the page's thread (pitfalls.md)
  const choose = (id) => {
    T.$('score-select').value = id;
    T.$('score-select').dispatchEvent(new Event('change'));
  };
  const labels = (sel = '') => [...T.$('result-area').querySelectorAll(`.answer-sheet .sv-solfege${sel}`)];
  // Writes the answer with the pitches at `wrong` moved up a semitone.
  function enterWith(wrong = []) {
    T.enterNotes(current.map((p, i) => (wrong.includes(i) ? { ...p, alter: p.alter + (p.alter >= 1 ? -1 : 1) } : p)));
  }

  T.test('63-2 정답 구간 악보에 계이름, 정답/오답 색', async (T) => {
    T.setMode('score');
    choose('example-twinkle');
    await T.listen();
    enterWith([1, 4]);
    T.submit();
    const all = labels();
    T.check(all.length === current.length && all.map((l) => l.textContent).join(' ') === '도 도 솔 솔 라 라 솔', `받아 적은 음마다 계이름 (${all.map((l) => l.textContent)})`);
    const marks = all.map((l) => (l.classList.contains('is-correct') ? 'o' : l.classList.contains('is-wrong') ? 'x' : '?')).join('');
    T.check(marks === 'oxooxoo', `맞힌 음은 정답 색, 틀린 음은 오답 색 (${marks})`);
    T.check(getComputedStyle(all[1]).fill !== getComputedStyle(all[0]).fill, '두 색이 다름');
    T.check(!T.$('result-area').querySelector('.answer-chips'), '계이름 칩 줄은 없어짐');
    T.check(T.resultText().includes('7음 중 5음 정답'), '채점 그대로');
    T.next();
    // 고정도
    Settings.set('solfege', 'fixed');
    choose('example-mountain-king');
    await T.listen();
    enterWith();
    T.submit();
    T.check(labels().slice(0, 2).map((l) => l.textContent).join(' ') === '시 도#', `고정도로 바꾸면 결과도 (${labels().slice(0, 2).map((l) => l.textContent)})`);
    Settings.set('solfege', 'movable');
    localStorage.removeItem(Settings.STORAGE_KEY);
    T.next();
  });

  T.test('63-2 화음은 고른 줄만 색, 꾸밈음도', async (T) => {
    T.setMode('score');
    // 화음 + 꾸밈음이 있는 악보 (불러오기와 같은 형식).
    const score = Notation.build({ id: 'chord63', title: '화음 결과', time: [4, 4], key: { fifths: 0, mode: 'major' }, clef: 'treble', tempo: 80,
      music: 'C5:q gB4:8 D5:q E5:q F5:q' });
    score.measures[0].notes[0].chord = [{ pitch: { step: 'E', alter: 0, octave: 4 } }, { pitch: { step: 'G', alter: 0, octave: 4 } }];
    const saved = scores.save(Notation.clean({ ...score, id: undefined }));
    renderScorePicker();
    choose(saved.id);
    await T.listen();
    T.check(current.length === 5, `받아 적기는 맨 위 줄 5음(꾸밈음 포함) (${current.length})`);
    enterWith([1]);
    T.submit();
    const first = labels().filter((l) => l.dataset.measure === '0' && l.dataset.index === '0');
    T.check(first.map((l) => l.textContent).join(' ') === '도 솔 미' && first[0].classList.contains('is-correct')
      && first.slice(1).every((l) => l.classList.contains('is-other')), '화음: 맨 위(받아 적은 음)만 정답 색, 나머지는 회색');
    const grace = labels().find((l) => l.classList.contains('is-grace'));
    T.check(grace?.textContent === '시' && grace.classList.contains('is-wrong'), '꾸밈음도 채점 대상이면 색 (틀리게 적음 → 오답 색)');
    T.next();
    // 맨 아래 줄을 고르면 아래 음이 색.
    Settings.setLine(saved.id, 'bottom');
    choose(saved.id);
    await T.listen();
    enterWith();
    T.submit();
    const low = labels().filter((l) => l.dataset.measure === '0' && l.dataset.index === '0');
    T.check(low[2].classList.contains('is-correct') && low.slice(0, 2).every((l) => l.classList.contains('is-other')), '⚙ 맨 아래: 가장 낮은 음(미)만 색');
    scores.remove(saved.id);
    localStorage.removeItem(Settings.LINES_KEY);
    renderScorePicker();
    choose('example-twinkle');
  });

  T.test('63-2 연습 중에는 계이름 없음, 긴 구간 스크롤', async (T) => {
    T.setMode('score');
    choose('example-fur-elise');
    T.check(!T.$('score-strip').querySelector('.sv-solfege') && !T.$('score-input').querySelector('.sv-solfege'), '연습 중 악보 띠·받아 적기에는 계이름 없음');
    T.check(!T.$('result-area').querySelector('.sv-solfege'), '제출 전 결과 자리에도 없음');
    const long = Notation.build({ id: 'long63', title: '긴 결과 63', time: [4, 4], key: { fifths: 0, mode: 'major' }, clef: 'treble', tempo: 80,
      music: Array(8).fill('C4:16 D4:16 E4:16 F4:16 G4:16 A4:16 B4:16 C5:16 C5:16 B4:16 A4:16 G4:16 F4:16 E4:16 D4:16 C4:16').join(' | ') });
    const saved = scores.save(Notation.clean({ ...long, id: undefined }));
    renderScorePicker();
    choose(saved.id);
    T.$('length-chips').querySelector('[data-length="4"]').click();
    await T.listen();
    enterWith();
    T.submit();
    const sheet = T.$('result-area').querySelector('.answer-sheet');
    T.check(sheet.scrollWidth > sheet.clientWidth && T.noHorizontalOverflow(), '긴 구간은 정답 악보가 좌우로 스크롤, 페이지는 넘치지 않음');
    T.check(labels().length === current.length && labels().every((l) => l.classList.contains('is-correct')), `음마다 계이름 (${labels().length})`);
    T.next();
    scores.remove(saved.id);
    localStorage.removeItem(Settings.SECTIONS_KEY);
    renderScorePicker();
    choose('example-twinkle');
  });

  T.test('63-2 멜로디·화성 결과는 그대로', async (T) => {
    T.setMode('melody');
    await T.listen();
    T.enterNotes(current);
    T.submit();
    T.check(T.$('result-area').querySelector('.answer-chips .note-chip') && !T.$('result-area').querySelector('.sv-solfege'), '멜로디: 계이름 칩 그대로');
    T.next();
    T.setMode('harmony');
    await T.listen();
    T.enterNotes(current);
    T.submit();
    T.check(T.$('result-area').querySelector('.answer-chips .note-chip'), '화성: 계이름 칩 그대로');
    T.next();
    T.setMode('melody');
    clearInterval(ticker);
  });
}
