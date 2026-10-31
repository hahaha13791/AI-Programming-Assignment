// 48단계 — 편집 중 듣기와 옛 편집기 정리. Run with smoke.js.
{
  const N = Notation;

  T.test('48-2 편집 중 [듣기]', async (T) => {
    T.setMode('score');
    T.$('score-select').value = 'example-twinkle';
    T.$('score-select').dispatchEvent(new Event('change'));
    T.$('btn-edit-score').click();
    const calls = [];
    const original = Sound.playEvents;
    let stops = 0;
    const originalStop = Sound.stop;
    Sound.playEvents = (events, total) => {
      calls.push({ events, total });
      return 0.5;
    };
    Sound.stop = () => {
      stops++;
    };
    try {
      scoreEditor.state.select(2, 0);
      scoreEditor.render();
      const play = T.$('editor-play');
      T.check(!play.disabled && play.textContent === '듣기', '[듣기]가 켜져 있음');
      play.click();
      const first = calls[0]?.events ?? [];
      const expected = N.resolve(scores.get('example-twinkle')).slice(2).flatMap((m) => m.notes).filter((n) => !n.rest).map((n) => N.midi(n.pitch));
      T.check(first.length === expected.length && first.every((e, i) => e.midi === expected[i]) && Math.abs(first[0].start) < 1e-9,
        `커서가 있는 3마디부터 끝까지, 기준음 없이 (${first.length}음)`);
      T.check(play.textContent === '멈춤', '재생 중에는 [멈춤]');
      play.click();
      T.check(play.textContent === '듣기' && stops >= 1, '[멈춤]으로 멈춤');
      Settings.set('speed', 0.5);
      play.click();
      T.check(Math.abs(calls[1].events[1].start - 1.5) < 1e-9, `⚙ 빠르기 설정(0.5배)을 따름 (둘째 음 ${calls[1].events[1].start}초)`);
      Settings.set('speed', 1);
      localStorage.removeItem(Settings.STORAGE_KEY);
      const before = stops;
      T.$('editor-cancel').click();
      T.check(stops > before && play.textContent === '듣기', '편집을 닫으면 멈춤');
      // Chords and grace notes play as on the practice screen.
      T.$('btn-new-score').click();
      T.$('btn-make-score').click();
      scoreEditor.apply((s) => {
        s.measures[0].notes = [
          { type: 'eighth', dots: 0, grace: true, slash: true, pitch: { step: 'D', alter: 0, octave: 5 } },
          { type: 'whole', dots: 0, pitch: { step: 'C', alter: 0, octave: 5 }, chord: [{ pitch: { step: 'E', alter: 0, octave: 5 } }] },
        ];
      });
      scoreEditor.state.select(0, 0);
      play.click();
      const score = { ...scoreEditor.state.score, id: 'x', title: 'x' };
      const same = Playback.schedule(score, { start: 0, end: 0, tonic: false, speed: 1 }).events;
      T.check(JSON.stringify(calls[2].events) === JSON.stringify(same) && calls[2].events.length === 3, '화음·꾸밈음도 연습 화면과 같은 예약 (꾸밈음 1 + 화음 2)');
      T.$('editor-cancel').click();
    } finally {
      Sound.playEvents = original;
      Sound.stop = originalStop;
    }
  });

  T.test('48-2 옛 편집기 정리', async (T) => {
    T.check(typeof Score === 'undefined' && !document.querySelector('script[src*="score.js"]'), '옛 v1 편집기(score.js)가 없음');
    T.check(Notation.toLegacy === undefined && Notation.legacyProblem === undefined && typeof Notation.fromLegacy === 'function',
      'toLegacy·legacyProblem은 없고, 예전 저장값 옮기기(fromLegacy)는 남음');
    T.setMode('score');
    for (const example of EXAMPLE_SCORES) {
      T.$('score-select').value = example.id;
      T.$('score-select').dispatchEvent(new Event('change'));
      const button = T.$('btn-edit-score');
      const ok = button.textContent === '편집' && !button.classList.contains('btn-danger') && T.$('score-notice').hidden;
      button.click();
      const opened = !T.$('editor').hidden;
      T.$('editor-cancel').click();
      T.check(ok && opened, `${example.title}: [편집]이 [삭제]로 바뀌지 않고 열림`);
    }
    T.$('score-select').value = 'example-twinkle';
    T.$('score-select').dispatchEvent(new Event('change'));
    T.check(T.noHorizontalOverflow(), '가로 넘침 없음');
    T.setMode('melody');
  });
}
