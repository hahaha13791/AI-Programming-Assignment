// 54단계 — 리듬 그리기 통일: 한 줄 보표. Run with smoke.js.
{
  const N = Notation;
  // The lengths before this stage, in eighth notes (rhythm.js until 53단계).
  const OLD_EIGHTHS = { w: 8, 'h.': 6, h: 4, 'q.': 3, q: 2, e: 1, r: 2 };
  const writeTop = () => Math.round(T.$('staff-title').getBoundingClientRect().top);
  const staffSvg = () => T.$('rhythm-area').querySelector('svg.rhythm-staff');

  T.test('54-2 기본 문제를 v2 음표로 옮김', async (T) => {
    const counts = { easy: 8, medium: 10, hard: 11 };
    for (const level of ['easy', 'medium', 'hard']) {
      const pool = RHYTHMS[level];
      T.check(pool.length === counts[level], `${level}: 문제 ${pool.length}개 그대로`);
      const ok = pool.every((r) => r.measures.every((m) => {
        const codes = m.map(Rhythm.codeOf);
        const eighths = codes.reduce((sum, c) => sum + OLD_EIGHTHS[c], 0);
        return codes.every((c) => c && Rhythm.LEVEL_TYPES[level].includes(c)) && eighths === r.time[0] * 2
          && N.cmp(N.filled(m), N.measureLength(r.time)) === 0 && r.time[1] === 4;
      }));
      T.check(ok, `${level}: 모든 마디가 그 난이도의 버튼으로 적히고 길이가 박자와 같음 (옛 8분 단위 합과 분수 길이 모두)`);
    }
  });

  T.test('54-2 한 줄 보표의 표기', async (T) => {
    const box = document.createElement('div');
    box.style.width = '700px';
    document.body.append(box);
    const codes = ['w', '|', 'h.', 'q', '|', 'h', 'q.', 'e', '|', 'e', 'e', 'q', 'r', 'e', 'e'];
    const measures = codes.join(' ').split(' | ').map((m) => m.split(' ').map(Rhythm.noteOf));
    Rhythm.draw(box, { time: [4, 4], measures }, '시험 보표');
    const svg = box.querySelector('svg.rhythm-staff');
    T.check(svg && svg.querySelectorAll('.sv-line').length === svg.querySelectorAll(':scope > svg').length, '한 줄 보표(줄마다 선 하나), 오선 없음');
    T.check(!svg.querySelector('.sv-clef, .staff-clef') && !svg.querySelector('.sv-accidental'), '음자리표·조표 없음');
    const heads = [...svg.querySelectorAll('.sv-head')];
    const open = heads.filter((h) => h.classList.contains('sv-open')).length;
    T.check(open === 3 && heads.length === 11, `온·2분음표는 빈 머리 (빈 머리 ${open}, 머리 ${heads.length})`);
    T.check(new Set(heads.map((h) => h.getAttribute('cy'))).size === 1, '모든 음이 한 줄 위');
    T.check([...svg.querySelectorAll('.sv-note[data-stem]')].every((n) => n.dataset.stem === 'up'), '기둥은 모두 위');
    T.check(svg.querySelectorAll('.sv-dot').length === 2, '점2분·점4분의 점');
    T.check(svg.querySelectorAll('.sv-note[data-rest][data-type="quarter"]').length === 1, '4분쉼표');
    // 마디 3: 점4분 + 8분 → 혼자인 8분은 꼬리. 마디 4: 박마다 8분 둘씩 빔(2개), 4분쉼표 뒤 8분 둘도 빔.
    T.check(svg.querySelectorAll('.sv-beam-group').length === 2 && svg.querySelectorAll('.sv-flag').length === 1,
      `박 단위 8분음표 빔 ${svg.querySelectorAll('.sv-beam-group').length}개, 혼자인 8분음표 꼬리 ${svg.querySelectorAll('.sv-flag').length}개`);
    T.check(svg.querySelector('.sv-time-rhythm')?.textContent === '4', '박자표');
    box.remove();
  });

  T.test('54-2 입력 중 강조·진행 줄·채점 색·정답 보표', async (T) => {
    T.setMode('rhythm');
    T.setLevel('easy');
    await T.listen();
    T.check(staffSvg().querySelector('.sv-current[data-measure="0"]'), '입력 중인 1마디 강조');
    const first = current.measures[0];
    T.enterRhythm(first.slice(0, 1));
    // 첫 음이 온음표면 1마디가 이미 찼으므로 2마디의 남은 박.
    const full = Rhythm.codeOf(first[0]) === 'w' || first.length === 1;
    T.check(T.$('rhythm-progress').textContent.startsWith(full ? '2마디 · 남은 박' : '1마디 · 남은 박'), `진행 상황 줄 (${T.$('rhythm-progress').textContent})`);
    T.enterRhythm(first.slice(1));
    T.check(staffSvg().querySelector('.sv-current[data-measure="1"]'), '1마디를 채우면 2마디 강조');
    // 2마디는 틀리게: 정답과 다른 버튼 조합으로 채움.
    const second = current.measures[1].map(Rhythm.codeOf).join(' ');
    T.enterRhythm(current.time[0] === 2 ? (second === 'h' ? ['q', 'q'] : ['h']) : (second === 'w' ? ['h', 'h'] : ['w']));
    T.submit();
    T.check(staffSvg().querySelector('.sv-measure.is-correct[data-measure="0"]') && staffSvg().querySelector('.sv-measure.is-wrong[data-measure="1"]'),
      '제출 뒤 내 보표: 1마디 정답 색, 2마디 오답 색');
    const answer = T.$('result-area').querySelector('svg.rhythm-staff');
    T.check(answer && answer.querySelector('.sv-measure.is-correct[data-measure="0"]') && !answer.querySelector('.is-wrong'),
      '정답 리듬 보표: 맞힌 마디만 색');
    T.check(T.resultText().includes('2마디 중 1마디 정답'), '마디별 채점 그대로');
    T.next();
  });

  T.test('54-2 줄 나눔과 어려움의 높이 고정', async (T) => {
    T.setMode('rhythm');
    T.setLevel('hard');
    await T.listen();
    const wide = T.$('rhythm-area').clientWidth >= 560;
    const height = () => Math.round(T.$('rhythm-area').getBoundingClientRect().height);
    const resultTop = () => Math.round(T.$('result-title').getBoundingClientRect().top);
    const h0 = height();
    const r0 = resultTop();
    T.setTime(current.time[0]);
    T.enterRhythm(current.measures.flat());
    T.check(height() === h0 && resultTop() === r0, `어려움: 마디가 늘어도 보표 높이·아래 영역 그대로 (${h0}px)`);
    T.check(staffSvg().querySelectorAll(':scope > svg').length === (wide ? 1 : Math.ceil(current.measures.length / 2)),
      `${wide ? '넓은 폭: 한 줄' : '휴대폰 폭: 두 마디씩'} (${current.measures.length}마디)`);
    T.submit();
    T.check(T.resultText().includes('모두 정답'), '어려움 한 사이클');
    const answerBox = T.$('result-area').querySelector('.answer-staff');
    // Drawn before it is on the page, so by the window (as before this stage): two to a row up to 680px.
    const answerWide = !window.matchMedia('(max-width: 680px)').matches;
    const answerRows = answerBox.querySelectorAll('svg.rhythm-staff > svg').length;
    T.check(answerRows === (answerWide ? 1 : Math.ceil(current.measures.length / 2)), `정답 보표 줄 수 ${answerRows} (상자 ${answerBox.clientWidth}px)`);
    T.setLevel('easy');
  });

  T.test('54-2 위치·넘침·재생 시각', async (T) => {
    const tops = ['melody', 'harmony', 'rhythm', 'score'].map((m) => {
      T.setMode(m);
      return writeTop();
    });
    T.check(tops.every((t) => t === tops[0]), `네 모드의 받아 적기 위치가 같음 (${[...new Set(tops)]})`);
    T.setMode('rhythm');
    for (const level of ['easy', 'medium', 'hard']) {
      T.setLevel(level);
      T.check(T.noHorizontalOverflow(), `${level}: 가로 넘침 없음`);
    }
    // 예약 시각·길이가 옛 8분 단위 계산과 같음 (♩=80, 8분 = 0.375초, 소리는 길이의 90%).
    const EIGHTH = 60 / 80 / 2;
    let same = true;
    for (const level of ['easy', 'medium', 'hard']) {
      for (const r of RHYTHMS[level]) {
        for (const fixed of [true, false]) {
          const { events, total } = Rhythm.schedule(r, { fixedCountIn: fixed });
          let t = (fixed ? r.time[0] : 4) * 2 * EIGHTH;
          const expected = [];
          for (const m of r.measures) {
            m.forEach((note, i) => {
              const code = Rhythm.codeOf(note);
              if (code !== 'r') expected.push({ start: t, length: OLD_EIGHTHS[code] * EIGHTH * 0.9, accent: i === 0 });
              t += OLD_EIGHTHS[code] * EIGHTH;
            });
          }
          const notes = events.filter((e) => e.kind === 'note');
          same &&= notes.length === expected.length && Math.abs(total - t) < 1e-9
            && notes.every((e, i) => Math.abs(e.start - expected[i].start) < 1e-9 && Math.abs(e.length - expected[i].length) < 1e-9
              && (e.peak > 0.4) === expected[i].accent);
        }
      }
    }
    T.check(same, '모든 기본 문제의 예약 시각·길이·첫 박 강세가 그대로');
    T.setLevel('easy');
    T.setMode('melody');
  });
}
