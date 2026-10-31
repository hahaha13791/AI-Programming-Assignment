// 51단계 — 피아노로 소리 내기. Run with smoke.js.
{
  const ticker = setInterval(() => {}, 10); // decoding runs off the page's thread (pitfalls.md)
  const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
  // decodeAudioData only finishes while the test keeps waking up (pitfalls.md).
  async function untilReady(name = 'piano') {
    for (let n = 0; !Sampler.ready(name) && Sampler.status(name) !== 'failed' && n < 6000; n++) await new Promise((r) => setTimeout(r, 10));
    return Sampler.ready(name);
  }
  // Plays something and returns what was scheduled, relative to the first note.
  async function heard(act) {
    window.__soundLog = [];
    await act();
    const log = window.__soundLog;
    window.__soundLog = null;
    return log;
  }

  T.test('51-2 녹음 고르기와 높이 비율', async (T) => {
    const piano = window.INSTRUMENTS.piano;
    const c4 = piano.samples.find((s) => s.midi === 60);
    const p60 = Sampler.pick('piano', 60);
    T.check(p60.sample === c4 && near(p60.rate, 2 ** (-c4.tune / 1200)), `C4는 C4 녹음, 비율 ${p60.rate.toFixed(4)} (조율 ${c4.tune}센트 보정)`);
    const p61 = Sampler.pick('piano', 61);
    T.check(p61.sample === c4 && near(p61.rate, 2 ** ((1 - c4.tune / 100) / 12)), 'C#4는 가장 가까운 C4 녹음을 반음 올림');
    const p62 = Sampler.pick('piano', 62);
    T.check(p62.sample.midi === 63, 'D4는 더 가까운 D#4 녹음을 반음 내림');
    const low = Sampler.pick('piano', 24);
    const high = Sampler.pick('piano', 105);
    T.check(low.sample.midi === 36 && near(low.rate, 0.5) && high.sample.midi === 96 && high.rate > 1.6, '음역 밖(C1·A7)은 끝 녹음(C2·C7)을 늘림');
    T.check(Sampler.pick('nothing', 60) === null, '없는 악기는 고르지 않음');
  });

  T.test('51-2 네 모드의 소리가 피아노 녹음으로, 시각은 그대로', async (T) => {
    Sound.context();
    T.check(await untilReady(), `피아노 녹음이 풀림 (${Sampler.status()})`);
    // 멜로디: 기준음 → 쉼 → 멜로디, 음 사이 0.85초.
    T.setMode('melody');
    const melody = await heard(() => T.listen());
    const midis = [60, ...current.map(Staff.noteToMidi)];
    T.check(melody.length === midis.length && melody.every((e, i) => e.kind === 'sample' && e.instrument === 'piano' && e.midi === midis[i]),
      `멜로디 모드: 기준음과 멜로디가 피아노 녹음으로 (${melody.map((e) => e.kind).join(',')})`);
    const gaps = melody.slice(1).map((e, i) => e.start - melody[i].start);
    T.check(near(gaps[0], 0.85 * 2, 1e-3) && gaps.slice(1).every((g) => near(g, 0.85, 1e-3)), `음 사이 간격이 그대로 (${gaps.map((g) => g.toFixed(2))})`);
    // 화성: 화음은 한꺼번에.
    T.setMode('harmony');
    const harmony = await heard(() => T.listen());
    const chord = harmony.filter((e) => near(e.start, harmony[harmony.length - 1].start));
    T.check(harmony.every((e) => e.kind === 'sample') && chord.length >= 3, `화성 모드: 화음 ${chord.length}음이 함께, 피아노 녹음`);
    // 리듬: 카운트인은 클릭(합성음), 리듬 음은 피아노.
    T.setMode('rhythm');
    const rhythm = await heard(() => T.listen());
    const expected = Rhythm.schedule(current, { fixedCountIn: true });
    const clicks = rhythm.filter((e) => e.kind === 'synth');
    const notes = rhythm.filter((e) => e.kind === 'sample');
    T.check(clicks.length > 0 && clicks.length === expected.events.filter((e) => e.kind === 'click').length && notes.length === expected.events.filter((e) => e.kind === 'note').length,
      `리듬 모드: 카운트인 클릭 ${clicks.length}개는 합성음, 리듬 음 ${notes.length}개는 피아노`);
    const t0 = rhythm[0].start;
    T.check(rhythm.every((e, i) => near(e.start - t0, expected.events[i].start, 1e-6) && near(e.length, expected.events[i].length, 1e-6)), '리듬 예약 시각·길이가 그대로');
    // 내 악보: Playback 예약 그대로.
    T.setMode('score');
    const score = await heard(() => T.listen());
    const plan = Playback.schedule(scores.get(scoreId), { start: section.start, end: section.end, tonic: true, speed: Settings.get('speed') });
    T.check(score.length === plan.events.length && score.every((e, i) => e.kind === 'sample' && e.midi === plan.events[i].midi
      && near(e.start - score[0].start, plan.events[i].start) && near(e.length, plan.events[i].length)), `내 악보: 예약표와 같은 시각·음높이·길이, 피아노 녹음 (${score.length}음)`);
    // 편집기 듣기와 음 넣을 때.
    T.$('btn-edit-score').click();
    const editor = await heard(async () => T.$('editor-play').click());
    T.$('editor-play').click();
    T.check(editor.length > 0 && editor.every((e) => e.kind === 'sample'), '편집기 [듣기]도 피아노 녹음');
    T.$('editor-cancel').click();
    T.setMode('melody');
  });

  T.test('51-2 녹음이 없을 때는 합성음', async (T) => {
    Sampler.setCurrent('nothing'); // an instrument with no recordings
    T.setMode('melody');
    const log = await heard(() => T.listen());
    T.check(log.length > 0 && log.every((e) => e.kind === 'synth'), '녹음이 없으면 지금의 합성음으로 (연습은 그대로)');
    T.enterNotes(current);
    T.submit();
    T.check(T.resultText().includes('모두 정답'), '그래도 한 사이클');
    T.next();
    Sampler.setCurrent('piano');
    Sound.stop();
    T.check(true, '멈추기에서 오류 없음');
    clearInterval(ticker);
  });
}
