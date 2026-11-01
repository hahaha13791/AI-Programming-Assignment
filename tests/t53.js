// 53단계 — 확장 8 완성 기준 점검 (PRD #10 확장 8). Run with smoke.js.
{
  const ticker = setInterval(() => {}, 10); // file reads and decoding run off the page's thread (pitfalls.md)
  const NAMES = ['piano', 'violin', 'flute', 'marimba', 'harp'];
  const MODES = ['melody', 'harmony', 'rhythm', 'score'];
  async function until(test, limit = 6000) {
    for (let n = 0; !test() && n < limit; n++) await new Promise((r) => setTimeout(r, 10));
    return test();
  }
  async function heard(act) {
    window.__soundLog = [];
    await act();
    const log = window.__soundLog;
    window.__soundLog = null;
    return log;
  }
  const radio = (name) => document.querySelector(`#settings input[name="instrument"][value="${name}"]`);
  const writeTop = () => Math.round(T.$('staff-title').getBoundingClientRect().top);
  // ⚙ → an instrument → wait until its recordings are ready and the preview scale has been scheduled.
  async function choose(name) {
    T.$('btn-settings').click();
    window.__soundLog = [];
    radio(name).checked = true;
    radio(name).dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => Sampler.ready(name) && window.__soundLog.length > 0);
    window.__soundLog = null;
    T.$('btn-settings').click();
    Sound.stop();
    return Sampler.ready(name);
  }
  // "문제 듣기" without waiting for it to end (virtual time is short): scheduled, stopped, input opened.
  function ask() {
    T.$('btn-question').click();
    Sound.stop();
    clearTimeout(unlockTimer);
    T.$('btn-replay').disabled = false;
    T.$('btn-arpeggio').disabled = false;
    T.unlock();
  }
  // The answer for the current question, entered as each mode takes it.
  function answer() {
    if (mode === 'rhythm') {
      if (level === 'hard') T.setTime(current.time[0]);
      T.enterRhythm(current.measures.flat());
    } else T.enterNotes(current);
  }
  const allOf = (log, name) => log.length > 0 && log.filter((e) => e.kind === 'sample').length > 0
    && log.every((e) => (e.kind === 'sample' && e.instrument === name) || (mode === 'rhythm' && e.kind === 'synth'));

  T.test('53-4 불러오는 동안·불러오지 못해도 연습이 멈추지 않음, 출처', async (T) => {
    T.setMode('melody');
    T.$('btn-settings').click();
    T.check(['Salamander', 'CC BY 3.0', 'VSCO', 'CC0'].every((w) => T.$('settings-credit').textContent.includes(w)), `⚙ 창에 녹음 출처 (${T.$('settings-credit').textContent})`);
    // Violin chosen: its file isn't read yet, so the tonic pressed at once is the synthesized tone.
    radio('violin').checked = true;
    radio('violin').dispatchEvent(new Event('change', { bubbles: true }));
    T.$('btn-settings').click();
    T.check(!Sampler.ready('violin'), '바이올린은 아직 불러오는 중');
    const early = await heard(async () => T.$('btn-tonic').click());
    T.check(early.length === 1 && early[0].kind === 'synth', '불러오는 동안 누른 기준음은 합성음으로');
    await T.listen();
    answer();
    T.submit();
    T.check(T.resultText().includes('모두 정답'), '불러오는 동안에도 한 사이클');
    T.next();
    T.check(await until(() => Sampler.ready('violin')), '그다음 바이올린 녹음이 풀림');
    Sound.stop();
    // A file that can't be read: the synthesized tone goes on, the cycle too.
    let failed = null;
    Sampler.load('no-such-instrument', (ok) => { failed = ok; });
    await until(() => failed !== null);
    Sampler.setCurrent('no-such-instrument');
    const log = await heard(() => T.listen());
    T.check(failed === false && log.length > 0 && log.every((e) => e.kind === 'synth'), '불러오지 못한 악기는 합성음으로');
    answer();
    T.submit();
    T.check(T.resultText().includes('모두 정답'), '불러오지 못해도 한 사이클');
    T.next();
    Sampler.setCurrent(Settings.get('instrument'));
  });

  T.test('53-2 네 모드 × 다섯 악기: 모든 소리가 고른 악기 녹음으로', async (T) => {
    const top = writeTop();
    for (let i = 0; i < MODES.length; i++) {
      T.setMode(MODES[i]);
      if (MODES[i] === 'harmony') T.setChordType(i % 2 ? 'seventh' : 'triad');
      for (const name of NAMES) {
        T.check(await choose(name), `${MODES[i]}: ${name} 녹음 준비`);
        const tonic = await heard(async () => T.$('btn-tonic').click());
        const question = await heard(async () => ask());
        const replay = await heard(async () => T.$('btn-replay').click());
        Sound.stop();
        T.check(allOf(tonic, name) && allOf(question, name) && allOf(replay, name),
          `${MODES[i]}·${name}: 기준음 ${tonic.length}·문제 ${question.length}·다시 듣기 ${replay.length}음이 ${name} 녹음`);
        if (MODES[i] === 'harmony') {
          const arp = await heard(async () => T.$('btn-arpeggio').click());
          Sound.stop();
          T.check(allOf(arp, name), `화성·${name}: 펼쳐 듣기도`);
        }
        answer();
        T.submit();
        T.check(T.resultText().includes('모두 정답'), `${MODES[i]}·${name}: 채점 그대로`);
        const after = await heard(async () => T.$('btn-replay').click());
        Sound.stop();
        T.check(allOf(after, name), `${MODES[i]}·${name}: 결과 화면에서 다시 듣기도`);
        T.next();
        T.check(writeTop() === top, `${MODES[i]}·${name}: 받아 적기 위치 그대로`);
      }
    }
    // 편집기: [듣기]와 음 넣을 때 소리.
    T.setMode('score');
    T.check(await choose('marimba'), '마림바로');
    T.$('btn-edit-score').click();
    const play = await heard(async () => T.$('editor-play').click());
    T.$('editor-play').click();
    const pad = await heard(async () => T.editorPad(4));
    T.check(allOf(play, 'marimba') && allOf(pad, 'marimba'), `편집기 [듣기] ${play.length}음·음 넣을 때 ${pad.length}음이 마림바`);
    T.$('editor-cancel').click();
    // 음역 밖은 가장 가까운 끝 녹음을 늘려서, 높이는 정확히.
    for (const name of NAMES) {
      const samples = window.INSTRUMENTS[name].samples;
      const lo = samples.reduce((a, s) => (s.midi < a.midi ? s : a));
      const hi = samples.reduce((a, s) => (s.midi > a.midi ? s : a));
      const ok = [[lo.midi - 5, lo], [hi.midi + 5, hi]].every(([m, s]) => {
        const p = Sampler.pick(name, m);
        return p.sample === s && Math.abs(p.rate - 2 ** ((m - s.midi - s.tune / 100) / 12)) < 1e-9;
      });
      T.check(ok, `${name}: 음역 밖(${lo.midi - 5}, ${hi.midi + 5})은 끝 녹음을 늘림`);
    }
    // 기억: 마지막 고른 악기가 저장되고, 페이지를 열 때 그 값으로 정해진다.
    T.check(JSON.parse(localStorage.getItem(Settings.STORAGE_KEY)).instrument === 'marimba' && Settings.get('instrument') === 'marimba' && Sampler.current === 'marimba',
      '고른 악기(마림바)를 브라우저에 기억');
  });

  T.test('53-1 네 모드 오가기, 기존 기능 유지', async (T) => {
    // 바이올린으로 바꾼 뒤에도 모드를 오가며 한 사이클씩, 예약표는 악기와 관계없이 그대로.
    await choose('violin');
    const tops = [];
    for (const m of [...MODES, 'harmony', 'melody']) {
      T.setMode(m);
      if (m === 'harmony') T.setChordType(chordType === 'triad' ? 'seventh' : 'triad');
      tops.push(writeTop());
      const log = await heard(() => T.listen());
      if (m === 'rhythm') {
        const plan = Rhythm.schedule(current, { fixedCountIn: true });
        T.check(log.length === plan.events.length && log.every((e, i) => Math.abs(e.start - log[0].start - plan.events[i].start) < 1e-6),
          '리듬: 예약 시각 그대로(카운트인 포함)');
      }
      if (m === 'score') {
        const plan = Playback.schedule(scores.get(scoreId), { start: section.start, end: section.end, tonic: true, speed: Settings.get('speed') });
        T.check(log.length === plan.events.length && log.every((e, i) => e.midi === plan.events[i].midi && Math.abs(e.start - log[0].start - plan.events[i].start) < 1e-6),
          '내 악보: 음높이·시각·빠르기 그대로');
      }
      answer();
      T.submit();
      T.check(T.resultText().includes('모두 정답'), `${m}${m === 'harmony' ? `(${chordType})` : ''}: 한 사이클`);
      T.next();
    }
    T.check(tops.every((t) => t === tops[0]), `모드를 바꿔도 받아 적기 위치 그대로 (${[...new Set(tops)]})`);
  });

  T.test('53-5 화면 폭: 넘치지 않음, ⚙ 창이 화면 안', async (T) => {
    for (const m of MODES) {
      T.setMode(m);
      T.$('btn-settings').click();
      const box = T.$('settings').getBoundingClientRect();
      T.check(box.left >= -0.5 && box.right <= window.innerWidth + 0.5 && T.noHorizontalOverflow(), `${m}: ⚙ 창이 화면 안, 가로 넘침 없음`);
      T.$('btn-settings').click();
    }
    radio('piano').checked = true;
    radio('piano').dispatchEvent(new Event('change', { bubbles: true }));
    Sound.stop();
    localStorage.removeItem(Settings.STORAGE_KEY);
    T.setMode('melody');
    clearInterval(ticker);
  });
}
