// 58단계 — 심화 데이터, 소리 기준 채점, 결과. Run with smoke.js.
{
  const N = Notation;
  const parse = (music) => N.parseMeasures(music.replace(/n:/g, 'C5:')).map((m) => m.notes);
  const q = (time, music) => ({ time, measures: parse(music) });
  const all = () => ['easy', 'medium', 'hard'].flatMap((level) => RHYTHMS_ADVANCED[level].map((r) => ({ level, r })));
  const notesOf = (r) => r.measures.flat();

  T.test('58-2 심화 문제: 개수·길이·버튼', async (T) => {
    for (const level of ['easy', 'medium', 'hard']) {
      const pool = RHYTHMS_ADVANCED[level];
      T.check(pool.length >= 5, `${level}: ${pool.length}개 (5개 이상)`);
      const ok = pool.every((r) => r.measures.every((m) => N.cmp(N.filled(m), N.measureLength(r.time)) === 0));
      T.check(ok, `${level}: 모든 마디가 박자 길이와 같음`);
      const counts = pool.map((r) => r.measures.length);
      const long = (r) => r.time[1] === 8 && r.time[0] >= 9;
      T.check(level === 'hard'
        ? pool.every((r) => (long(r) ? r.measures.length <= 2 : r.measures.length >= 3 && r.measures.length <= 4))
        : counts.every((c) => c === 2), `${level}: 마디 수 (${counts})`);
      const times = pool.map((r) => Rhythm.timeText(r.time));
      T.check(times.every((t) => (level === 'hard' ? Rhythm.ADVANCED_TIME_SIGNATURES : level === 'medium'
        ? [[2, 4], [3, 4], [4, 4], [6, 8]] : Rhythm.TIME_SIGNATURES).some((x) => Rhythm.timeText(x) === t)), `${level}: 박자 (${[...new Set(times)]})`);
      if (level === 'easy') T.check(pool.every((r) => notesOf(r).every((n) => !n.tuplet && !n.tie)), '쉬움: 셋잇단·붙임줄 없음');
      // No dotted 16th, no 16th triplets, triplets only 3 in the time of 2.
      T.check(pool.every((r) => notesOf(r).every((n) => !(n.dots && n.type === '16th') && (!n.tuplet || (n.tuplet.actual === 3 && n.type !== '16th')))),
        `${level}: 점16분·16분 셋잇단 없음`);
    }
    // 모든 표기가 출제됨.
    const has = (test) => all().some(({ r }) => notesOf(r).some(test));
    const hasTime = (t) => all().some(({ r }) => Rhythm.sameTime(r.time, t));
    T.check(has((n) => n.type === '16th' && !n.rest) && has((n) => n.type === 'eighth' && n.dots === 1) && has((n) => n.type === 'eighth' && n.rest),
      '16분음표·점8분음표·8분쉼표 출제');
    T.check(has((n) => n.tuplet && n.type === 'eighth') && has((n) => n.tuplet && n.type === 'quarter') && has((n) => n.tie === 'start'),
      '8분 셋잇단·4분 셋잇단·붙임줄 출제');
    T.check(hasTime([6, 8]) && hasTime([9, 8]) && hasTime([12, 8]), '6/8·9/8·12/8 출제');
    const across = all().some(({ r }) => r.measures.some((m, i) => i > 0 && N.tieStops(m[0].tie)));
    T.check(across, '마디선을 넘는 붙임줄 출제');
    T.check(!RHYTHMS_ADVANCED.easy.some((r) => r.measures.length !== 2), '임시 샘플 없음(실제 문제로 바뀜)');
  });

  T.test('58-2 소리 기준 채점', async (T) => {
    T.setMode('rhythm');
    T.setRhythmKind('advanced');
    T.setLevel('medium');
    const grade = (answer, input, time = answer.time) => {
      current = answer;
      return gradeRhythm({ time, measures: input.measures }).marks;
    };
    for (const { r } of all()) {
      T.check(grade(r, r).every(Boolean), `정답 그대로 (${Rhythm.timeText(r.time)} ${r.measures.length}마디) → 모두 정답`);
    }
    const same = [
      ['4분 ↔ 8분⌒8분', q([2, 4], 'n:q n:q | n:h'), q([2, 4], 'n:8~ n:8 n:q | n:h')],
      ['6/8 점4분 ↔ 4분⌒8분', q([6, 8], 'n:q. n:q. | n:q. n:q.'), q([6, 8], 'n:q~ n:8 n:q. | n:q. n:q~ n:8')],
      ['마디선 넘는 붙임줄: 2분⌒ ↔ 4분⌒4분⌒', q([2, 4], 'n:h~ | n:q n:q'), q([2, 4], 'n:q~ n:q~ | n:q n:q')],
      ['쉼표 둘 ↔ 쉼표 하나', q([2, 4], 'n:q r:q | n:h'), q([2, 4], 'n:q r:8 r:8 | n:h')],
      ['셋잇단 안 4분 ↔ 8분⌒8분', q([2, 4], '3[ n:q n:8 ] n:q | n:h'), q([2, 4], '3[ n:8~ n:8 n:8 ] n:q | n:h')],
    ];
    for (const [name, answer, input] of same) T.check(grade(answer, input).every(Boolean), `같은 소리의 다른 표기 정답: ${name}`);
    const different = [
      ['4분 ↔ 8분 + 8분쉼표', q([2, 4], 'n:q n:q | n:h'), q([2, 4], 'n:8 r:8 n:q | n:h'), [false, true]],
      ['4분 ↔ 8분 8분(따로 침)', q([2, 4], 'n:q n:q | n:h'), q([2, 4], 'n:8 n:8 n:q | n:h'), [false, true]],
      ['붙임줄 있음 ↔ 없음(다음 마디 새로 침)', q([2, 4], 'n:h~ | n:q n:q'), q([2, 4], 'n:h | n:q n:q'), [true, false]],
      ['셋잇단 ↔ 8분 둘', q([2, 4], '3[ n:8 n:8 n:8 ] n:q | n:h'), q([2, 4], 'n:8 n:8 n:q | n:h'), [false, true]],
    ];
    for (const [name, answer, input, expected] of different) {
      const marks = grade(answer, input);
      T.check(JSON.stringify(marks) === JSON.stringify(expected), `다른 소리는 오답: ${name} (${marks})`);
    }
    // 어려움: 소리가 같아도 박자표가 다르면 모든 마디 오답.
    T.setLevel('hard');
    const six = q([6, 8], 'n:q. n:q. | n:q. n:q. | n:q. n:q.');
    current = six;
    const wrongTime = gradeRhythm({ time: [3, 4], measures: parse('n:q. n:q. | n:q. n:q. | n:q. n:q.') });
    T.check(wrongTime.timeCorrect === false && wrongTime.marks.every((m) => !m), '6/8 ↔ 3/4: 소리가 같아도 박자표 오답·모든 마디 오답');
    // 기본: 모든 문제 정답, 한 마디 바꾸면 그 마디만 오답 (지금까지와 같음).
    T.setRhythmKind('basic');
    let basicOk = true;
    for (const level of ['easy', 'medium', 'hard']) {
      for (const r of RHYTHMS[level]) {
        current = r;
        const right = gradeRhythm({ time: r.time, measures: r.measures }).marks;
        const changed = r.measures.map((m, i) => (i === 0 ? [...m].reverse().concat([]) : m));
        const differs = Rhythm.soundKey(changed[0]) !== Rhythm.soundKey(r.measures[0]);
        const marks = gradeRhythm({ time: r.time, measures: changed }).marks;
        basicOk &&= right.every(Boolean) && (!differs || (marks[0] === false && marks.slice(1).every(Boolean)));
      }
    }
    T.check(basicOk, '기본: 모든 문제 정답 그대로, 순서를 바꾼 마디만 오답');
    T.setLevel('easy');
  });

  T.test('58-2 앱에서 한 사이클: 다른 표기로 적어도 정답, 정답 보표는 표준 표기', async (T) => {
    T.setMode('rhythm');
    T.setRhythmKind('advanced');
    T.setLevel('medium');
    current = q([2, 4], 'n:q n:q~ | n:8 n:8 n:q');
    rhythm.reset({ advanced: true, toggles: Rhythm.LEVEL_TOGGLES.medium, time: current.time, measures: 2, times: Rhythm.ADVANCED_TIME_SIGNATURES });
    T.unlock();
    T.enterAdvanced(parse('n:8~ n:8 n:8~ n:8~ | n:8 n:8 n:q').flat());
    T.submit();
    T.check(T.resultText().includes('2마디 모두 정답'), `다른 표기로 적어도 모두 정답 (${T.resultText().slice(0, 30)})`);
    const answer = T.$('result-area').querySelector('svg.rhythm-staff');
    T.check(answer.querySelectorAll('.sv-note:not([data-rest])').length === 5, '정답 보표는 데이터의 표준 표기 그대로(음 5개)');
    T.next();
    T.setRhythmKind('basic');
    T.setMode('melody');
  });
}
