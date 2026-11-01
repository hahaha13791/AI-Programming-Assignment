// 70단계 — 실제 악보로 다듬기. 공유저작물 인쇄 악보(Mutopia 미리 보기)와 정답(MIDI)은 fixture로 먼저 붙인다:
//   python -I tools/omr_samples.py
//   run.py tests/samples/.cache/omr.fixture.js tests/omr-lib.js tests/t70.js smoke.js
{
  const ticker = setInterval(() => {}, 1); // image decoding runs off the page's thread (pitfalls.md)
  const samples = window.OMR_SAMPLES ?? [];
  const frac = (t) => {
    const [n, d] = t.split('/').map(Number);
    return n / d;
  };
  // A length in quarter notes → the drawn note type with dots (as in t68), or '?' when it isn't one.
  const SHORT = [[4, 'w'], [2, 'h'], [1, 'q'], [0.5, '8'], [0.25, '16'], [0.125, '32']];
  const tokenOf = (quarters) => {
    for (const [len, name] of SHORT) {
      if (Math.abs(quarters - len) < 1e-6) return name;
      if (Math.abs(quarters - len * 1.5) < 1e-6) return `${name}.`;
    }
    return '?';
  };
  const typeQuarters = { whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25, '32nd': 0.125, '64th': 0.0625 };
  const noteToken = (n) => tokenOf(typeQuarters[n.type] * (n.dots === 1 ? 1.5 : n.dots === 2 ? 1.75 : 1));
  // Edit distance of what was read against the start of the answer (the preview shows only the opening lines).
  // → share right over the part of the answer it lines up with.
  function prefixAccuracy(got, want) {
    let prev = Array.from({ length: want.length + 1 }, (_, j) => j);
    for (let i = 1; i <= got.length; i++) {
      const row = [i];
      for (let j = 1; j <= want.length; j++) {
        row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (got[i - 1] === want[j - 1] ? 0 : 1));
      }
      prev = row;
    }
    let best = 1;
    for (let j = Math.max(1, got.length - 5); j <= Math.min(want.length, got.length + 5); j++) {
      best = Math.min(best, prev[j] / j);
    }
    return 1 - best;
  }
  async function pageOf(sample) {
    const img = new Image();
    img.src = sample.kind === 'svg'
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sample.data.replace(/currentColor/g, '#000'))}`
      : `data:image/png;base64,${sample.data}`;
    await img.decode();
    // As big as a photo the app reads (long side about 2000px).
    const scale = 2000 / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((img.naturalWidth || img.width) * scale);
    canvas.height = Math.round((img.naturalHeight || img.height) * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return OmrImage.binarize(OmrImage.gray(canvas));
  }
  const results = [];
  const readAll = async () => {
    if (results.length) return results;
    for (const sample of samples) {
      const page = await pageOf(sample);
      const analysis = OmrSymbols.read(page, OmrStaff.analyse(page));
      const built = OmrBuild.score([analysis], { title: sample.title });
      results.push({ sample, analysis, built });
    }
    return results;
  };

  // The preview shows each movement's opening line on a staff of its own: staff i ↔ movement i.
  T.test('70-2 (다) 공유저작물 인쇄 악보: 음 단위 90% 이상', async (T) => {
    T.check(samples.length >= 3, `시험 악보 ${samples.length}곡 (tools/omr_samples.py로 fixture를 만듦)`);
    let right = 0;
    let total = 0;
    for (const { sample, analysis } of await readAll()) {
      let sp = 0;
      let sl = 0;
      let n = 0;
      analysis.measures.forEach((measures, i) => {
        const movement = sample.movements[i];
        if (!movement) return;
        const read = measures.flatMap((m) => m.notes.filter((x) => !x.rest));
        const p = prefixAccuracy(read.map((x) => Notation.midi(x.pitch)), movement.notes.map(([q]) => q));
        const l = prefixAccuracy(read.map(noteToken), movement.notes.map(([, , len]) => tokenOf(frac(len))));
        sp += p * read.length;
        sl += l * read.length;
        n += read.length;
      });
      const p = sp / n;
      const l = sl / n;
      right += ((p + l) / 2) * n;
      total += n;
      T.check(true, `${sample.title}: 음높이 ${(p * 100).toFixed(1)}%, 길이 ${(l * 100).toFixed(1)}% (${n}음, 보표 ${analysis.staves.length})`);
    }
    T.check(total && right / total >= 0.9, `(다) 전체 ${(100 * right / total).toFixed(2)}% (≥ 90%)`);
  });

  // Lines what was read (each note as pitch + length) up with the answer, then gives each read note's measure an
  // error for every note that differs, is extra, or is missing just before it.
  function errorsByMeasure(read, want, firstMeasure) {
    const n = read.length;
    const m = want.length;
    const d = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    // A note of no written length in the MIDI ('?': an ornament played out, a tuplet — not read in stage 1) may be
    // matched by anything or left out at no cost.
    const wild = (j) => want[j].endsWith('/?');
    const cost = (i, j) => (read[i].key === want[j] || wild(j) ? 0 : 1);
    const skip = (j) => (wild(j) ? 0 : 1);
    for (let j = 1; j <= m; j++) d[0][j] = d[0][j - 1] + skip(j - 1);
    for (let i = 1; i <= n; i++) {
      d[i][0] = i;
      for (let j = 1; j <= m; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + skip(j - 1), d[i - 1][j - 1] + cost(i - 1, j - 1));
      }
    }
    // The answer is longer than the preview: end where the cost is least.
    let j = 0;
    for (let k = 1; k <= m; k++) if (d[n][k] < d[n][j] || (d[n][k] === d[n][j] && Math.abs(k - n) < Math.abs(j - n))) j = k;
    // errors: measure → the sets of measures any of which may own each error (one, or two at a barline).
    const errors = new Map();
    // (Before the first note read, a missed note may belong to the staff's first measure, even an empty one.)
    const at = (i) => (i < 0 ? firstMeasure : read[Math.min(i, n - 1)].measure);
    const blame = (i, other = i) => {
      const owners = [...new Set([at(i), at(other)])];
      for (const measure of owners) {
        if (!errors.has(measure)) errors.set(measure, []);
        errors.get(measure).push(owners);
      }
    };
    let i = n;
    while (i > 0 && j > 0) {
      // (Of equal ways back: a match first, then a missed note, an extra one, a different one.)
      if (!cost(i - 1, j - 1) && d[i][j] === d[i - 1][j - 1]) {
        i--;
        j--;
      } else if (d[i][j] === d[i][j - 1] + skip(j - 1)) {
        // A note missed between read notes i - 1 and i: it belongs to either measure (at a barline, to either side).
        if (skip(j - 1)) blame(i, i - 1);
        j--;
      } else if (d[i][j] === d[i - 1][j] + 1) {
        blame(i - 1); // an extra note read
        i--;
      } else {
        blame(i - 1); // a different note
        i--;
        j--;
      }
    }
    while (i > 0) blame(--i);
    // Notes missed before the first one read: the staff's first measure's (or the next one's).
    if (n && want.slice(0, j).some((_, k) => skip(k))) blame(0, -1);
    return errors;
  }

  T.test('70-2 (다) 틀린 음이 든 마디는 모두 확인 필요', async (T) => {
    let missed = 0;
    let wrong = 0;
    let count = 0;
    const where = [];
    for (const { sample, analysis, built } of await readAll()) {
      const marked = new Set(built.checks);
      let index = 0;
      analysis.measures.forEach((measures, i) => {
        const movement = sample.movements[i];
        const read = [];
        measures.forEach((_, k) => {
          for (const x of built.score.measures[index + k].notes) {
            if (!x.rest) read.push({ key: `${Notation.midi(x.pitch)}/${noteToken(x)}`, measure: index + k });
          }
        });
        const want = (movement?.notes ?? []).map(([p, , l]) => `${p}/${tokenOf(frac(l))}`);
        const errors = read.length ? errorsByMeasure(read, want, index) : new Map();
        measures.forEach((_, k) => {
          count++;
          if (!errors.has(index + k)) return;
          wrong++;
          // Missed: an error here that no measure it may belong to is marked for.
          const unnoticed = errors.get(index + k).some((owners) => owners.every((o) => !marked.has(o)));
          if (!marked.has(index + k) && unnoticed) {
            missed++;
            where.push(`${sample.id} 보표${i + 1} ${k + 1}마디`);
          }
        });
        index += measures.length;
      });
    }
    T.check(missed === 0, `마디 ${count}개 중 틀린 마디 ${wrong}개, 확인 필요로 표시되지 않은 마디 ${missed}개 ${where.slice(0, 6).join(', ')}`);
    clearInterval(ticker);
  });
}
