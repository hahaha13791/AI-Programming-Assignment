// 59단계 — 확장 9 완성 기준 점검 (PRD #10 확장 9). Run with smoke.js.
{
  const N = Notation;
  const writeTop = () => Math.round(T.$('staff-title').getBoundingClientRect().top);
  const parse = (music) => N.parseMeasures(music.replace(/n:/g, 'C5:')).map((m) => m.notes);

  // One full question: listen → (hard: time) → enter the answer → submit → result → next.
  async function cycle(T, label) {
    T.check(await T.listen(), `${label}: 카운트인·재생 뒤 입력이 열림`);
    if (level === 'hard') T.setTime(current.time);
    if (rhythmKind === 'advanced') T.enterAdvanced(current.measures.flat());
    else T.enterRhythm(current.measures.flat());
    T.check(!T.$('btn-submit').disabled, `${label}: 다 적으면 제출 가능`);
    T.submit();
    T.check(T.resultText().includes('모두 정답') && T.$('result-area').querySelector('svg.rhythm-staff'), `${label}: 마디별 채점 + 정답 리듬 보표`);
    if (level === 'hard') T.check(T.resultText().includes(`박자표 정답 (${Rhythm.timeText(current.time)})`), `${label}: 박자표 정답`);
    const before = current;
    T.next();
    T.check(current && current !== before, `${label}: 다음 문제`);
  }

  T.test('59-1 모드 탭과 [기본 | 심화]를 오가도 기존 기능 유지', async (T) => {
    const tops = [];
    for (const m of ['melody', 'harmony', 'rhythm', 'score']) {
      T.setMode(m);
      tops.push(writeTop());
    }
    T.setMode('melody');
    await T.listen();
    T.enterNotes(current);
    T.submit();
    T.check(T.resultText().includes('모두 정답'), '멜로디 한 사이클');
    T.setMode('rhythm');
    T.setRhythmKind('advanced');
    T.setMode('harmony');
    await T.listen();
    T.enterNotes(current);
    T.submit();
    T.check(T.resultText().includes('모두 정답'), '심화를 고른 뒤 화성 한 사이클');
    T.setMode('rhythm');
    T.check(rhythmKind === 'advanced', '리듬으로 돌아오면 심화 그대로');
    T.setRhythmKind('basic');
    for (const lv of ['easy', 'medium', 'hard']) {
      T.setLevel(lv);
      tops.push(writeTop());
      await cycle(T, `기본 ${lv}`);
    }
    T.setMode('score');
    await T.listen();
    T.enterNotes(current);
    T.submit();
    T.check(T.resultText().includes('모두 정답'), '내 악보 한 사이클');
    T.check(tops.every((t) => t === tops[0]), `받아 적기 위치가 모두 같음 (${[...new Set(tops)]})`);
  });

  T.test('59-2 심화 한 사이클 (쉬움·중간·어려움)', async (T) => {
    T.setMode('rhythm');
    T.setRhythmKind('advanced');
    for (const lv of ['easy', 'medium', 'hard']) {
      T.setLevel(lv);
      await cycle(T, `심화 ${lv}`);
    }
    // 어려움: 박자표 6개 중 겹박자 문제를 골라 한 사이클.
    T.setLevel('hard');
    current = RHYTHMS_ADVANCED.hard.find((r) => Rhythm.sameTime(r.time, [12, 8]));
    rhythm.reset({ advanced: true, toggles: Rhythm.LEVEL_TOGGLES.hard, time: null, measures: null, times: Rhythm.ADVANCED_TIME_SIGNATURES });
    T.unlock();
    T.check(document.querySelectorAll('#time-signatures .time-signature').length === 6, '어려움: 박자표 6개');
    T.setTime([12, 8]);
    T.enterAdvanced(current.measures.flat());
    T.submit();
    T.check(T.resultText().includes('모두 정답') && T.resultText().includes('박자표 정답 (12/8)'), '12/8 문제: 박자표·마디 모두 정답');
    T.next();
  });

  T.test('59-3 심화 문제 수와 표기', async (T) => {
    const all = ['easy', 'medium', 'hard'].flatMap((lv) => RHYTHMS_ADVANCED[lv]);
    T.check(['easy', 'medium', 'hard'].every((lv) => RHYTHMS_ADVANCED[lv].length >= 5), `난이도별 5개 이상 (${['easy', 'medium', 'hard'].map((lv) => RHYTHMS_ADVANCED[lv].length)})`);
    const has = (test) => all.some((r) => r.measures.flat().some(test));
    const hasTime = (t) => all.some((r) => Rhythm.sameTime(r.time, t));
    const items = {
      '16분음표': has((n) => n.type === '16th'), '점8분음표': has((n) => n.type === 'eighth' && n.dots === 1),
      '8분쉼표': has((n) => n.type === 'eighth' && n.rest), '셋잇단음표': has((n) => n.tuplet), '붙임줄': has((n) => n.tie),
      '6/8': hasTime([6, 8]), '9/8': hasTime([9, 8]), '12/8': hasTime([12, 8]),
    };
    T.check(Object.values(items).every(Boolean), `모두 출제: ${Object.entries(items).filter(([, v]) => v).map(([k]) => k).join('·')}`);
  });

  T.test('59-4 같은 소리 다른 표기 정답, 정확한 길이로 재생', async (T) => {
    T.setMode('rhythm');
    T.setRhythmKind('advanced');
    T.setLevel('medium');
    current = { time: [6, 8], measures: parse('n:q. n:q.~ | n:8 n:8 n:8 n:q.') };
    rhythm.reset({ advanced: true, toggles: Rhythm.LEVEL_TOGGLES.medium, time: current.time, measures: 2, times: Rhythm.ADVANCED_TIME_SIGNATURES });
    T.unlock();
    T.enterAdvanced(parse('n:q~ n:8 n:q~ n:8~ | n:8 n:8 n:8 n:q~ n:8').flat());
    T.submit();
    T.check(T.resultText().includes('2마디 모두 정답'), '6/8: 점4분 ↔ 4분⌒8분, 마디선 넘는 붙임줄 — 다른 표기로 적어도 정답');
    T.next();
    // 재생: 셋잇단은 3등분, 붙임줄은 한 번, 겹박자는 점4분음표 박.
    const plan = Rhythm.schedule({ time: [6, 8], measures: parse('3[ n:8 n:8 n:8 ] n:8 n:q.~ | n:q. n:q.') }, { beat: 1 });
    const notes = plan.events.filter((e) => e.kind === 'note');
    const clicks = plan.events.filter((e) => e.kind === 'click');
    T.check(clicks.length === 2 && Math.abs(notes[1].start - notes[0].start - 2 / 9) < 1e-9 && notes.length === 6
      && Math.abs(notes[4].length - 2 * 0.9) < 1e-9, '6/8(♩.=60): 카운트인 2번, 8분 셋잇단 3등분, 마디선 넘는 붙임줄은 한 번(2초)');
  });

  T.test('59-5 화면 폭: 넘침 없음, 위치 그대로', async (T) => {
    const top = writeTop();
    for (const k of ['basic', 'advanced']) {
      T.setMode('rhythm');
      T.setRhythmKind(k);
      for (const lv of ['easy', 'medium', 'hard']) {
        T.setLevel(lv);
        T.check(T.noHorizontalOverflow() && writeTop() === top, `${k} ${lv}: 가로 넘침 없음, 받아 적기 위치 그대로`);
      }
    }
    for (const m of ['melody', 'harmony', 'score', 'rhythm']) {
      T.setMode(m);
      T.check(writeTop() === top, `${m}: 받아 적기 위치 그대로`);
    }
    T.setRhythmKind('basic');
    T.setLevel('easy');
    T.setMode('melody');
  });
}
