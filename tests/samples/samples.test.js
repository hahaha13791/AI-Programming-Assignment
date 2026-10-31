// 공개 MusicXML 예제(tests/samples/make_fixture.py로 만든 fixture)를 앱으로 읽는 확인. fixture를 먼저 붙여 돌린다.
const ticker = setInterval(() => {}, 10);
const bytesOf = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
T.test('공개 예제 18곡 읽기', async (T) => {
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
  clearInterval(ticker);
});
