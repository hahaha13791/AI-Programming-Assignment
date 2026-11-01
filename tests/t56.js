// 56단계 — 심화 입력: 길이·점·쉼표·셋잇단·붙임줄. Run with smoke.js.
{
  const N = Notation;
  const btn = (code) => document.querySelector(`#note-buttons .note-button[data-type="${code}"]`);
  const tog = (name) => document.querySelector(`#note-buttons .note-toggle[data-toggle="${name}"]`);
  const pressed = (name) => tog(name).getAttribute('aria-pressed') === 'true';
  const press = (...codes) => codes.forEach((c) => (TOGGLE_NAMES.includes(c) ? tog(c) : btn(c)).click());
  const TOGGLE_NAMES = ['dot', 'rest', 'tuplet', 'tie'];
  const flat = () => rhythm.getInput().measures.flat();
  const lengths = () => flat().map((n) => N.duration(n));
  const eq = (a, b) => N.cmp(a, b) === 0;
  const svg = () => T.$('rhythm-area').querySelector('svg.rhythm-staff');
  const writeTop = () => Math.round(T.$('staff-title').getBoundingClientRect().top);
  // A question with the given time, opened for input (easy/medium: the time is given).
  function open(level, time, measures = 2) {
    T.setMode('rhythm');
    T.setRhythmKind('advanced');
    T.setLevel(level);
    if (time) {
      rhythm.reset({ advanced: true, toggles: Rhythm.LEVEL_TOGGLES[level], time, measures, times: Rhythm.ADVANCED_TIME_SIGNATURES });
    }
    T.unlock();
  }

  T.test('56-2 길이·점·쉼표', async (T) => {
    open('easy', [4, 4]);
    const codes = [...document.querySelectorAll('#note-buttons .note-button:not(.note-toggle)')].map((b) => b.dataset.type);
    const toggles = [...document.querySelectorAll('#note-buttons .note-toggle')].map((b) => b.dataset.toggle);
    T.check(codes.join(' ') === 'w h q e s' && toggles.join(' ') === 'dot rest', `쉬움: 길이 5개 + [점 | 쉼표] (${codes} / ${toggles})`);
    press('dot', 'e');
    T.check(pressed('dot') && btn('s').disabled, '[점]은 켜 둔 채 이어지고, 점16분은 없음(32분 필요)');
    press('dot', 's');
    T.check(eq(lengths()[0], N.frac(3, 16)) && eq(lengths()[1], N.frac(1, 16)) && flat()[0].dots === 1, '점8분 + 16분');
    press('rest', 'e', 'rest', 'e');
    T.check(flat()[2].rest && flat()[2].type === 'eighth' && !flat()[3].rest, '8분쉼표, 쉼표를 끄면 음표');
    T.check(T.$('rhythm-progress').textContent.includes('남은 박 2'), `남은 박 (${T.$('rhythm-progress').textContent})`);
    T.check(btn('w').disabled && !btn('h').disabled, '남은 길이에 안 들어가는 길이(온음표)는 꺼짐');
    press('h');
    T.check(T.$('rhythm-progress').textContent.startsWith('2마디') && !btn('w').disabled, '1마디가 차면 2마디');
    press('dot', 'h', 'dot', 'q');
    T.check(btn('q').disabled && btn('w').disabled && btn('s').disabled, '모두 차면 모든 길이 꺼짐');
    T.check(!T.$('btn-submit').disabled, '다 채우면 제출 가능');
    T.$('btn-clear').click();
    T.check(!flat().length && !pressed('dot'), '전체 지우기: 음과 켜 둔 버튼이 처음으로');
    open('medium', [6, 8]);
    T.check([...document.querySelectorAll('#note-buttons .note-toggle')].map((b) => b.dataset.toggle).join(' ') === 'dot rest tuplet tie',
      '중간: [점 | 쉼표 | 셋잇단 | 붙임줄]');
    press('dot', 'q');
    T.check(T.$('rhythm-progress').textContent.includes('남은 8분음표 3개'), `6/8은 남은 8분음표로 (${T.$('rhythm-progress').textContent})`);
  });

  T.test('56-2 셋잇단 묶음', async (T) => {
    open('medium', [2, 4], 3);
    press('tuplet');
    T.check(btn('h').disabled && btn('s').disabled && !btn('e').disabled && !btn('q').disabled && tog('dot').disabled, '셋잇단은 8분·4분으로 시작, 점 없음');
    press('e');
    T.check(tog('tuplet').disabled && pressed('tuplet') && btn('q').disabled, '묶음 중간에는 셋잇단을 끌 수 없고, 묶음에 안 들어가는 길이는 꺼짐');
    T.check(T.$('rhythm-progress').textContent.includes('셋잇단 2개 더'), `셋잇단 남은 개수 (${T.$('rhythm-progress').textContent})`);
    press('e', 'e');
    T.check(!pressed('tuplet') && !tog('tuplet').disabled, '묶음이 차면 셋잇단이 꺼짐');
    const f = flat();
    T.check(f.length === 3 && f[0].tupletStart && f[2].tupletStop && f.every((n) => n.tuplet?.actual === 3) && eq(N.filled(f), N.frac(1, 4)),
      '8분 셋잇단 3개 = 4분음표 한 박');
    press('e', 'e');
    press('tuplet', 'q', 'e');
    T.check(T.$('rhythm-progress').textContent.includes('셋잇단 1.5개 더'), `4분 셋잇단 묶음 안에 8분 (${T.$('rhythm-progress').textContent})`);
    press('rest', 'e', 'rest', 'q');
    const g = flat().slice(5);
    T.check(g.length === 4 && g[0].tupletStart && g[3].tupletStop && g[2].rest && eq(N.filled(g), N.frac(1, 2)) && !pressed('tuplet'),
      '2마디: 4분+8분+8분쉼표+4분 셋잇단 = 2분음표 길이');
    press('q');
    // A quarter-triplet group must fit what is left of the measure.
    press('tuplet');
    T.check(btn('q').disabled && !btn('e').disabled, '3마디 남은 한 박에 4분 셋잇단 묶음(2분 길이)은 안 들어감');
    T.check(svg().querySelectorAll('.sv-tuplet').length === 2 && svg().querySelector('.sv-tuplet-number')?.textContent === '3', '보표에 셋잇단 숫자');
    T.check(svg().querySelector('.sv-tuplet-bracket'), '빔이 아닌 묶음(쉼표 포함)은 괄호');
  });

  T.test('56-2 붙임줄', async (T) => {
    open('medium', [2, 4]);
    T.check(tog('tie').disabled, '음표가 없으면 붙임줄 꺼짐');
    press('h');
    press('tie');
    T.check(pressed('tie') && tog('rest').disabled, '붙임줄을 켜면 쉼표는 못 고름');
    press('q');
    const f = flat();
    T.check(f[0].tie === 'start' && f[1].tie === 'stop' && rhythm.getInput().measures.length === 2 && !pressed('tie'), '마디선을 넘어 이어짐, 넣으면 꺼짐');
    T.check(svg().querySelectorAll('.sv-tie').length >= 1, '보표에 붙임줄');
    press('tie', 'e', 'tie', 'e');
    T.check(flat()[2].tie === 'both' && flat()[3].tie === 'stop', '이어진 음을 다시 이음(both)');
    T.$('btn-clear').click();
    press('rest', 'q');
    T.check(tog('tie').disabled, '쉼표 뒤에는 붙임줄 없음');
  });

  T.test('56-2 지우기가 붙임줄·셋잇단 상태까지 되돌림', async (T) => {
    open('medium', [2, 4]);
    press('q', 'tie', 'e');
    T.$('btn-undo').click();
    T.check(flat().length === 1 && !flat()[0].tie && pressed('tie'), '붙임줄로 이은 음을 지우면 앞 음의 붙임줄도 풀리고 [붙임줄]은 켜진 상태로');
    press('tie');
    press('tuplet', 'e', 'e');
    T.$('btn-undo').click();
    T.check(flat().length === 2 && pressed('tuplet') && tog('tuplet').disabled && T.$('rhythm-progress').textContent.includes('셋잇단 2개 더'),
      '셋잇단 중간 음을 지우면 묶음 상태로 돌아감');
    T.$('btn-undo').click();
    T.check(flat().length === 1 && pressed('tuplet') && !tog('tuplet').disabled, '첫 음까지 지우면 묶음 시작 전');
    press('e', 'e', 'e');
    T.$('btn-undo').click();
    T.check(pressed('tuplet') && flat().length === 3 && !flat()[2].tupletStop, '묶음을 끝낸 음을 지우면 다시 묶음 중');
    T.$('btn-clear').click();
    T.check(!flat().length && !pressed('tuplet') && !tog('tuplet').disabled, '전체 지우기');
  });

  T.test('56-2 보표 그림: 16분 겹빔·겹박자 빔·쉼표', async (T) => {
    open('medium', [6, 8]);
    press('e', 'e', 'e', 's', 's', 's', 's', 'e');
    const beams = [...svg().querySelectorAll('.sv-beam-group')];
    T.check(beams.length === 2 && beams.map((b) => b.dataset.size).join(',') === '3,5', `6/8은 점4분음표 단위로 묶음 (${beams.map((b) => b.dataset.size)})`);
    T.check(svg().querySelector('.sv-beam[data-level="2"]'), '16분은 겹빔');
    open('hard', null);
    T.setTime([12, 8]);
    press('rest', 'w', 'h', 'e', 's');
    const rests = [...svg().querySelectorAll('.sv-note[data-rest]')].map((n) => n.dataset.type);
    T.check(rests.join(' ') === 'whole half eighth 16th', `온·2분·8분·16분쉼표 (${rests})`);
  });

  T.test('56-2 어려움 박자표와 9/8·12/8', async (T) => {
    open('hard', null);
    const height = () => Math.round(T.$('rhythm-area').getBoundingClientRect().height);
    const h0 = height();
    const narrow = T.$('rhythm-area').clientWidth < 560;
    for (const t of [[9, 8], [12, 8]]) {
      T.setTime(t);
      press(...(t[0] === 9 ? ['dot', 'h', 'q', 'h', 'q'] : ['dot', 'w', 'w']));
      T.check(T.$('rhythm-progress').textContent.startsWith('2마디를 모두 채웠어요'), `${t[0]}/8은 2마디까지 (${T.$('rhythm-progress').textContent})`);
      T.check(svg().querySelectorAll(':scope > svg').length === (narrow ? 2 : 1), `${t[0]}/8: ${narrow ? '휴대폰 폭 한 줄에 한 마디' : '넓은 폭 한 줄'}`);
      T.check(height() <= h0 + 1, `보표 높이가 두 줄을 넘지 않음 (${h0}→${height()})`);
      T.$('btn-clear').click();
    }
    T.setTime([4, 4]);
    press('w', 'w', 'w');
    T.check(T.$('rhythm-progress').textContent.startsWith('3마디 완성'), `4/4는 4마디까지 그대로 (${T.$('rhythm-progress').textContent})`);
  });

  T.test('56-2 임시 샘플을 정답으로 적기', async (T) => {
    T.setMode('rhythm');
    T.setRhythmKind('advanced');
    for (const level of ['easy', 'medium', 'hard']) {
      T.setLevel(level);
      for (const question of RHYTHMS_ADVANCED[level]) {
        current = question;
        rhythm.reset({ advanced: true, toggles: Rhythm.LEVEL_TOGGLES[level], time: level === 'hard' ? null : question.time,
          measures: level === 'hard' ? null : question.measures.length, times: Rhythm.ADVANCED_TIME_SIGNATURES });
        T.unlock();
        if (level === 'hard') T.setTime(question.time);
        T.enterAdvanced(question.measures.flat());
        const same = JSON.stringify(rhythm.getInput().measures.map((m) => m.map(Rhythm.noteKey))) === JSON.stringify(question.measures.map((m) => m.map(Rhythm.noteKey)));
        T.check(same && !T.$('btn-submit').disabled, `${level} ${Rhythm.timeText(question.time)}: 버튼으로 그대로 적힘`);
        T.submit();
        T.check(T.resultText().includes('모두 정답'), `${level} ${Rhythm.timeText(question.time)}: 모두 정답`);
        T.next();
      }
    }
  });

  T.test('56-2 화면 폭', async (T) => {
    const top = writeTop();
    for (const level of ['easy', 'medium', 'hard']) {
      open(level, null);
      const box = T.$('note-buttons').getBoundingClientRect();
      const inside = [...document.querySelectorAll('#note-buttons .note-button')].every((b) => {
        const r = b.getBoundingClientRect();
        return r.left >= box.left - 0.5 && r.right <= box.right + 0.5;
      });
      const rows = new Set([...document.querySelectorAll('#note-buttons .note-button')].map((b) => Math.round(b.getBoundingClientRect().top))).size;
      T.check(inside && T.noHorizontalOverflow(), `${level}: 버튼 ${document.querySelectorAll('#note-buttons .note-button').length}개가 넘치지 않음 (${rows}줄)`);
      T.check(window.innerWidth > 480 || rows === 2, `${level}: 휴대폰 폭에서 5열 두 줄`);
      T.check(writeTop() === top, `${level}: 받아 적기 위치 그대로`);
    }
    T.setRhythmKind('basic');
    T.setLevel('easy');
    T.setMode('melody');
  });
}
