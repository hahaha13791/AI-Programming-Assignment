// 55단계 — [기본 | 심화] 고르기와 심화 화면. Run with smoke.js.
{
  const N = Notation;
  const writeTop = () => Math.round(T.$('staff-title').getBoundingClientRect().top);
  const desc = () => [...document.querySelectorAll('.difficulty-option .difficulty-desc')].map((d) => d.textContent);
  const kind = () => document.querySelector('#rhythm-kinds .chord-type[aria-checked="true"]')?.dataset.kind;

  T.test('55-2 [기본 | 심화]는 리듬 모드에서만', async (T) => {
    for (const m of ['melody', 'harmony', 'rhythm', 'score']) {
      T.setMode(m);
      T.check(T.$('rhythm-kinds').hidden === (m !== 'rhythm') && T.$('chord-types').hidden === (m !== 'harmony'),
        `${m}: ${m === 'rhythm' ? '[기본 | 심화]만' : m === 'harmony' ? '[3화음 | 7화음]만' : '종류 고르기 없음'}`);
    }
    T.setMode('rhythm');
    T.check(kind() === 'basic' && desc().join(',') === '2마디,+ 8분·쉼표,+ 점4분', '처음은 기본, 기본 난이도 설명');
  });

  T.test('55-2 심화로 바꾸면 심화 난이도와 새 문제', async (T) => {
    T.setMode('rhythm');
    T.setLevel('medium');
    const before = current;
    T.setRhythmKind('advanced');
    T.check(kind() === 'advanced' && desc().join(',') === '+ 16분·점8분,+ 셋잇단·붙임줄,+ 9/8·12/8', `심화 난이도 설명 (${desc()})`);
    T.check(!desc()[2].includes('마디'), '어려움 설명에 마디 수 없음');
    T.check(current !== before && RHYTHMS_ADVANCED.medium.includes(current), '심화 중간의 새 문제');
    T.check(T.$('time-signatures').hidden && T.$('rhythm-area').querySelector('.sv-time-rhythm'), '중간: 박자표가 주어짐(고르기 없음)');
    // Other modes and back: the kind is kept.
    T.setMode('harmony');
    T.setMode('rhythm');
    T.check(kind() === 'advanced' && RHYTHMS_ADVANCED[level].includes(current), '다른 모드에 다녀와도 심화 유지');
    T.setRhythmKind('basic');
    T.check(kind() === 'basic' && RHYTHMS[level].includes(current) && desc()[0] === '2마디', '기본으로 돌아가면 기본 문제');
    T.setRhythmKind('advanced');
  });

  T.test('55-2 임시 샘플과 박자표 6개', async (T) => {
    for (const level of ['easy', 'medium', 'hard']) {
      const pool = RHYTHMS_ADVANCED[level];
      T.check(pool.length >= 1 && pool.every((r) => r.measures.every((m) => N.cmp(N.filled(m), N.measureLength(r.time)) === 0)),
        `${level}: 임시 샘플 ${pool.length}개, 마디 길이가 박자와 같음`);
    }
    T.setMode('rhythm');
    T.setRhythmKind('advanced');
    T.setLevel('hard');
    const times = [...document.querySelectorAll('#time-signatures .time-signature')].map((b) => b.dataset.time);
    T.check(!T.$('time-signatures').hidden && times.join(' ') === '2/4 3/4 4/4 6/8 9/8 12/8', `심화 어려움: 박자표 6개 (${times.join(' ')})`);
    const box = T.$('time-signatures').getBoundingClientRect();
    const fits = [...document.querySelectorAll('#time-signatures .time-signature')].every((b) => {
      const r = b.getBoundingClientRect();
      return r.left >= box.left - 0.5 && r.right <= box.right + 0.5 && b.scrollWidth <= b.clientWidth + 1;
    });
    T.check(fits && T.noHorizontalOverflow(), '박자표 버튼 6개가 넘치지 않음');
    T.unlock();
    T.setTime([6, 8]);
    T.check(T.$('rhythm-area').querySelector('.sv-time-rhythm')?.textContent === '6', '6/8을 고르면 보표에 6/8');
    T.setRhythmKind('basic');
    T.check([...document.querySelectorAll('#time-signatures .time-signature')].map((b) => b.dataset.time).join(' ') === '2/4 3/4 4/4',
      '기본 어려움은 박자표 3개 그대로');
    T.setLevel('easy');
  });

  T.test('55-2 위치·320px 한 줄', async (T) => {
    T.setMode('rhythm');
    const head = document.querySelector('.panel-head');
    const items = [T.$('difficulty-title'), T.$('rhythm-kinds'), T.$('btn-settings')].map((e) => e.getBoundingClientRect());
    const oneLine = items.every((r) => Math.abs(r.top + r.height / 2 - (items[0].top + items[0].height / 2)) < 6);
    T.check(oneLine && items.every((r) => r.right <= head.getBoundingClientRect().right + 0.5), '난이도 제목·[기본 | 심화]·⚙가 한 줄');
    const panelHeights = ['harmony', 'rhythm'].map((m) => {
      T.setMode(m);
      return Math.round(head.closest('.panel').getBoundingClientRect().height);
    });
    T.check(panelHeights[0] === panelHeights[1], `패널 높이가 화성 모드와 같음 (${panelHeights})`);
    const tops = [];
    for (const m of ['melody', 'harmony', 'rhythm', 'score']) {
      T.setMode(m);
      tops.push(writeTop());
    }
    T.setMode('rhythm');
    for (const k of ['advanced', 'basic']) {
      T.setRhythmKind(k);
      for (const lv of ['easy', 'medium', 'hard']) {
        T.setLevel(lv);
        tops.push(writeTop());
        T.check(T.noHorizontalOverflow(), `${k} ${lv}: 가로 넘침 없음`);
      }
    }
    T.check(tops.every((t) => t === tops[0]), `받아 적기 위치가 모두 같음 (${[...new Set(tops)]})`);
    T.setLevel('easy');
    T.setMode('melody');
  });
}
