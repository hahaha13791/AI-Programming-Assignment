// 50단계 — 녹음 데이터 만들기. Run with smoke.js.
{
  const NAMES = ['piano', 'violin', 'flute', 'marimba', 'harp'];
  // Expected ranges (MIDI): piano C2~C7, violin G3~C7, flute C4~C7, marimba C3~C7 (it reaches lower), harp C2~C7.
  const RANGES = { piano: [36, 96], violin: [55, 96], flute: [60, 96], marimba: [48, 96], harp: [36, 96] };
  const ticker = setInterval(() => {}, 10); // decoding runs off the page's thread (pitfalls.md)
  // The data files sit next to the app's scripts (the runner points those at the project folder).
  const base = document.querySelector('script[src*="js/app.js"]').src.replace(/js\/app\.js.*$/, 'js/data/instruments/');

  function load(name) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${base}${name}.js`;
      script.onload = resolve;
      script.onerror = () => reject(new Error(name));
      document.head.append(script);
    });
  }

  function bytesOf(b64) {
    const text = atob(b64);
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    return bytes.buffer;
  }

  // decodeAudioData runs off the page's thread: under the runner's virtual time it only finishes while the test keeps
  // waking up (a promise alone never resolves). See pitfalls.md.
  // All at once (one at a time would take longer than the runner waits for a width).
  async function decodeAll(context, list) {
    const results = list.map(() => null);
    list.forEach((data, i) => context.decodeAudioData(data, (buffer) => { results[i] = buffer; }, () => { results[i] = false; }));
    for (let n = 0; results.includes(null) && n < 6000; n++) await new Promise((r) => setTimeout(r, 10));
    return results;
  }

  T.test('50-2 녹음 데이터', async (T) => {
    for (const name of NAMES) await load(name);
    T.check(NAMES.every((n) => window.INSTRUMENTS?.[n]?.samples?.length), `다섯 악기가 INSTRUMENTS에 등록됨 (${Object.keys(window.INSTRUMENTS ?? {})})`);
    const audio = new OfflineAudioContext(1, 44100, 44100);
    const all = NAMES.flatMap((n) => window.INSTRUMENTS[n].samples.map((sample) => ({ name: n, sample })));
    const buffers = await decodeAll(audio, all.map(({ sample }) => bytesOf(sample.data)));
    const decoded = new Map(all.map(({ sample }, i) => [sample, buffers[i]]));
    let total = 0;
    for (const name of NAMES) {
      const inst = window.INSTRUMENTS[name];
      const midis = inst.samples.map((s) => s.midi);
      const sorted = midis.every((m, i) => i === 0 || m > midis[i - 1]);
      const [low, high] = RANGES[name];
      // Every note in the range is at most 3.5 semitones from a recording (marimba has the widest gaps: 7).
      let far = 0;
      for (let m = low; m <= high; m++) far = Math.max(far, Math.min(...midis.map((s) => Math.abs(s - m))));
      T.check(sorted && midis[0] <= low && midis[midis.length - 1] >= high && far <= 3.5,
        `${inst.label}: 음역 ${midis[0]}~${midis[midis.length - 1]}이 ${low}~${high}을 덮고, 가장 먼 음도 녹음에서 ${far}반음 이내`);
      T.check(inst.samples.every((s) => Number.isInteger(s.tune) && Math.abs(s.tune) <= 40), `${inst.label}: 조율 보정은 ±40센트 이내`);
      T.check(inst.sustain === (name === 'violin' || name === 'flute') && inst.samples.every((s) => !inst.sustain || (s.loop && s.loop[1] > s.loop[0] + 0.5)),
        `${inst.label}: ${inst.sustain ? '지속 악기 — 되풀이 구간이 있음' : '감쇠 악기'}`);
      let ok = 0;
      let firstSound = 0;
      for (const sample of inst.samples) {
        const buffer = decoded.get(sample);
        if (!buffer) continue;
        const data = buffer.getChannelData(0);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v));
        const onset = data.findIndex((v) => Math.abs(v) > 0.05 * peak) / buffer.sampleRate;
        firstSound = Math.max(firstSound, onset);
        if (buffer.duration > 1.5 && peak > 0.05 && onset >= 0 && onset < 0.06) ok++;
      }
      T.check(ok === inst.samples.length, `${inst.label}: 녹음 ${ok}/${inst.samples.length}개가 풀리고 소리가 있음, 시작이 ${Math.round(firstSound * 1000)}ms 이내`);
      const size = inst.samples.reduce((sum, s) => sum + s.data.length, 0);
      total += size;
      T.check(size < 1024 * 1024, `${inst.label}: ${Math.round(size / 1024)}KB (1MB 이하)`);
    }
    T.check(total > 0, `합계 ${Math.round(total / 1024)}KB`);
    T.check(window.INSTRUMENTS.piano.credit.includes('CC BY 3.0') && NAMES.slice(1).every((n) => window.INSTRUMENTS[n].credit.includes('CC0')), '녹음마다 출처·이용 조건이 적혀 있음');
    clearInterval(ticker);
  });
}
