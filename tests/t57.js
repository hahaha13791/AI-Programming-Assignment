// 57단계 — 심화 재생: 카운트인·빠르기·셋잇단·붙임줄. Run with smoke.js.
{
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const rhythmOf = (time, music) => ({
    time, measures: Notation.parseMeasures(music.replace(/n:/g, 'C5:')).map((m) => m.notes),
  });
  const clicks = (plan) => plan.events.filter((e) => e.kind === 'click');
  const notes = (plan) => plan.events.filter((e) => e.kind === 'note');
  const gaps = (list) => list.slice(1).map((e, i) => e.start - list[i].start);
  async function heard(act) {
    window.__soundLog = [];
    await act();
    const log = window.__soundLog;
    window.__soundLog = null;
    return log;
  }

  T.test('57-2 카운트인: 박 단위, 겹박자는 점4분음표 박', async (T) => {
    const cases = [
      [[2, 4], 'n:h', 2, 0.75], [[3, 4], 'n:h.', 3, 0.75], [[4, 4], 'n:w', 4, 0.75],
      [[6, 8], 'n:q. n:q.', 2, 1], [[9, 8], 'n:h. n:q.', 3, 1], [[12, 8], 'n:h. n:h.', 4, 1],
    ];
    for (const [time, music, count, beat] of cases) {
      const r = rhythmOf(time, music);
      const plan = Rhythm.schedule(r, { fixedCountIn: true, beat: Rhythm.beatOf(time, { advanced: true }) });
      const c = clicks(plan);
      T.check(c.length === count && gaps(c).every((g) => near(g, beat)) && c[0].midi > c[1].midi && c.slice(1).every((e) => e.midi === c[1].midi)
        && near(plan.start, count * beat), `${Rhythm.timeText(time)}: 카운트인 ${c.length}번, ${beat}초 간격, 첫 박 높음`);
    }
    T.check(Rhythm.beatOf([6, 8], { advanced: true }) === 1 && Rhythm.beatOf([3, 4], { advanced: true }) === 0.75,
      '심화 쉬움·중간: ♩=80, ♩.=60');
  });

  T.test('57-2 어려움: 강세 없는 4번, 단순·겹박자 모두 1초', async (T) => {
    for (const time of Rhythm.ADVANCED_TIME_SIGNATURES) {
      const beat = Rhythm.beatOf(time, { advanced: true, hard: true });
      const plan = Rhythm.schedule(rhythmOf(time, time[1] === 8 ? Array(time[0] / 3).fill('n:q.').join(' ') : Array(time[0]).fill('n:q').join(' ')),
        { fixedCountIn: false, beat });
      const c = clicks(plan);
      T.check(beat === 1 && c.length === 4 && gaps(c).every((g) => near(g, 1)) && c.every((e) => e.midi === c[0].midi),
        `${Rhythm.timeText(time)}: 4번, 1초 간격, 강세 없음`);
    }
    T.check(Rhythm.beatOf([4, 4], { hard: true }) === 0.75, '기본 어려움은 그대로 ♩=80');
  });

  T.test('57-2 셋잇단·붙임줄·16분의 시각과 길이', async (T) => {
    // 2/4, ♩ = 80: 셋잇단 8분 3개 = 한 박(0.75초)을 3등분.
    const a = notes(Rhythm.schedule(rhythmOf([2, 4], '3[ n:8 n:8 n:8 ] n:q'), { beat: 0.75 }));
    T.check(a.length === 4 && near(a[1].start - a[0].start, 0.25) && near(a[2].start - a[1].start, 0.25) && near(a[3].start - a[0].start, 0.75)
      && near(a[0].length, 0.25 * 0.9), '8분 셋잇단: 0.25초씩 3등분');
    const b = notes(Rhythm.schedule(rhythmOf([3, 4], '3[ n:q n:q n:q ] n:q'), { beat: 0.75 }));
    T.check(near(b[1].start - b[0].start, 0.5) && near(b[3].start - b[0].start, 1.5), '4분 셋잇단: 2박(1.5초)을 3등분');
    // 붙임줄: 마디선을 넘는 붙임줄은 한 번만, 이은 길이로.
    const c = notes(Rhythm.schedule(rhythmOf([2, 4], 'n:q n:q~ | n:8 n:8 n:q'), { beat: 0.75 }));
    T.check(c.length === 4 && near(c[1].length, (0.75 + 0.375) * 0.9) && near(c[2].start - c[1].start, 0.75 + 0.375),
      '마디선을 넘는 붙임줄: 한 번, 4분+8분 길이');
    T.check(c[1].peak < 0.4 && c[2].peak < 0.4, '이어진 음은 다음 마디 첫 박 강세가 없음(새로 치지 않음), 그다음 음도 강세 없음');
    const d = notes(Rhythm.schedule(rhythmOf([6, 8], 'n:q.~ n:8~ n:8~ n:8 | n:q. n:q.'), { beat: 1 }));
    T.check(d.length === 3 && near(d[0].length, 2 * 0.9) && d[1].peak > 0.4, '이어진 셋 이상(both)도 한 번, 다음 마디 첫 음은 강세');
    // 6/8, ♩. = 60: 8분 = 1/3초, 16분 = 1/6초.
    const e = notes(Rhythm.schedule(rhythmOf([6, 8], 'n:8 n:16 n:16 n:8 n:q.'), { beat: 1 }));
    T.check(near(e[1].start - e[0].start, 1 / 3) && near(e[2].start - e[1].start, 1 / 6) && near(e[4].start - e[0].start, 1), '6/8: 8분 1/3초, 16분 1/6초, 둘째 박이 1초');
    // 쉼표는 소리 없이 시간만.
    const f = Rhythm.schedule(rhythmOf([2, 4], 'n:8 r:8 n:q'), { beat: 0.75 });
    T.check(notes(f).length === 2 && near(notes(f)[1].start - notes(f)[0].start, 0.75), '8분쉼표 자리는 비움');
  });

  T.test('57-2 앱에서: 심화 문제 듣기의 빠르기', async (T) => {
    T.setMode('rhythm');
    T.setRhythmKind('advanced');
    for (const level of ['easy', 'medium', 'hard']) {
      T.setLevel(level);
      for (const q of RHYTHMS_ADVANCED[level]) {
        current = q;
        const log = await heard(async () => T.$('btn-question').click());
        Sound.stop();
        const c = log.filter((e) => e.midi !== 72); // clicks are higher than the rhythm's one pitch (C5)
        const beat = level === 'hard' || Rhythm.isCompound(q.time) ? 1 : 0.75;
        const expected = Rhythm.schedule(q, { fixedCountIn: level !== 'hard', beat });
        T.check(c.length === clicks(expected).length && gaps(c).every((g) => Math.abs(g - beat) < 1e-6)
          && log.length === expected.events.length,
        `${level} ${Rhythm.timeText(q.time)}: 카운트인 ${c.length}번 ${beat}초, 음 ${log.length - c.length}개`);
      }
    }
    T.setRhythmKind('basic');
    T.setLevel('easy');
    const basic = await heard(async () => T.$('btn-question').click());
    Sound.stop();
    const bc = basic.filter((e) => e.midi !== 72);
    T.check(gaps(bc).every((g) => Math.abs(g - 0.75) < 1e-6), '기본은 ♩=80 그대로');
    T.setMode('melody');
  });
}
