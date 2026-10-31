// 공개 MusicXML 예제(tests/samples/make_fixture.py로 만든 fixture)를 앱으로 읽는 확인. fixture를 먼저 붙여 돌린다.
// 기대값(목록, 울리는 음)은 make_fixture.py가 앱과 따로 계산한다.
const ticker = setInterval(() => {}, 10);
const bytesOf = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

T.test('35 공개 예제 18곡 읽기', async (T) => {
  T.setMode('score');
  const byBase = {};
  for (const s of window.SAMPLES) {
    const state = await importFile(new File([bytesOf(s.b64)], s.name));
    T.check(state !== null, `${s.name}: 읽음 ${state ? '' : T.$('import-status').textContent}`);
    if (!state) continue;
    const got = state.parts.map((p) => p.lines.map((l) => [l.staff, l.voice, l.count]));
    const base = s.name.replace(/\.(musicxml|mxl)$/, '');
    const sig = JSON.stringify({ got, skipped: state.skipped.length, title: state.title });
    if (s.exp) {
      T.check(JSON.stringify(got) === JSON.stringify(s.exp.parts) && state.skipped.length === s.exp.skipped,
        `${s.name}: 파트·성부·음 개수가 Python 집계와 같음 (${state.parts.map((p) => `${p.name}[${p.lines.map((l) => `${l.label}:${l.count}`).join(', ')}]`).join(' / ')}${state.skipped.length ? ` / 뺀 파트 ${state.skipped.length}` : ''}) — "${state.title}"`);
    }
    if (byBase[base]) T.check(byBase[base] === sig, `${base}: .musicxml과 .mxl 결과가 같음`);
    else byBase[base] = sig;
  }
});

// What a converted score sounds: [MIDI@start+length] for every pitch (chords too), tied pitches joined, from the
// start of the score, in order of start then pitch.
function soundsOf(score) {
  const N = Notation;
  const out = [];
  const waiting = {};
  let at = N.ZERO;
  for (const measure of N.resolve(score)) {
    for (const note of measure.notes) {
      const length = N.duration(note);
      for (const { pitch, tie } of N.pitchesOf(note)) {
        const midi = N.midi(pitch);
        let sound = N.tieStops(tie) ? waiting[midi] : null;
        if (sound) sound.length = N.add(sound.length, length);
        else out.push(sound = { midi, start: at, length });
        if (N.tieStarts(tie)) waiting[midi] = sound;
        else delete waiting[midi];
      }
      at = N.add(at, length);
    }
  }
  out.sort((a, b) => N.cmp(a.start, b.start) || a.midi - b.midi);
  return out.map((s) => `${s.midi}@${s.start[0]}/${s.start[1]}+${s.length[0]}/${s.length[1]}`);
}

T.test('36 공개 예제 성부 변환', async (T) => {
  const reasons = {};
  let converted = 0;
  let lines = 0;
  for (const s of window.SAMPLES.filter((x) => x.exp)) {
    const doc = new DOMParser().parseFromString(MusicXML.decode(bytesOf(s.b64)), 'application/xml');
    const state = MusicXML.candidates(doc, s.name);
    state.parts.forEach((part, p) => part.lines.forEach((line, l) => {
      lines++;
      const where = `${s.name} ${part.name} ${line.label}`;
      let result = null;
      try {
        result = MusicXML.convert(doc, p, l, s.name);
      } catch (error) {
        const known = error instanceof MusicXML.ImportError && /^(아직 담지 못해요|불러올 수 없어요)\(/.test(error.message);
        T.check(known, `${where}: 이유가 있는 거절 (${error.message})`);
        reasons[error.message] = (reasons[error.message] ?? 0) + 1;
        return;
      }
      converted++;
      const valid = Notation.isValid({ ...result.score, id: 'x' });
      const got = soundsOf(result.score);
      const expected = s.exp.sounds[p][l];
      const same = JSON.stringify(got) === JSON.stringify(expected);
      const firstDiff = got.findIndex((x, i) => x !== expected[i]);
      T.check(valid && same, `${where}: 검증 통과, 울리는 음 ${got.length}개가 Python 계산과 같음${same ? '' : ` (다른 곳 ${firstDiff}: ${got[firstDiff]} ≠ ${expected[firstDiff]}, 개수 ${got.length}/${expected.length})`}${result.notices.length ? ` · 알림: ${result.notices.join(' · ')}` : ''}`);
    }));
  }
  T.check(converted > 0, `불러온 성부 ${converted} / 전체 ${lines} · 거절 이유: ${Object.entries(reasons).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  T.setMode('melody');
  clearInterval(ticker);
});
