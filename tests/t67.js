// 67단계 — 음자리표와 음표 머리: 음높이. Run with omr-lib.js (first) and smoke.js.
{
  const ticker = setInterval(() => {}, 1); // image decoding runs off the page's thread (pitfalls.md)
  const pageOf = (canvas) => OmrImage.binarize(OmrImage.gray(canvas));
  const name = (p) => `${p.step}${p.octave}`;
  // Every written head of a score, in order (step and octave; accidentals are read in 69단계).
  const truth = (score) => score.measures.flatMap((m) => m.notes.filter((n) => !n.rest).map((n) => name(n.pitch)));
  const readAll = (page) => {
    const analysis = OmrSymbols.read(page, OmrStaff.analyse(page));
    return { analysis, heads: analysis.measures.flat().flatMap((m) => m.notes.map((n) => name(n.pitch))) };
  };
  // Share of heads right: 1 − edit distance / number of heads.
  function accuracy(got, want) {
    const d = Array.from({ length: got.length + 1 }, (_, i) => [i, ...new Array(want.length).fill(0)]);
    for (let j = 1; j <= want.length; j++) d[0][j] = j;
    for (let i = 1; i <= got.length; i++) {
      for (let j = 1; j <= want.length; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (got[i - 1] === want[j - 1] ? 0 : 1));
      }
    }
    return 1 - d[got.length][want.length] / want.length;
  }
  const ledgerTreble = Notation.build({
    id: 't67-ledger-treble', title: '덧줄 높은음', time: [4, 4], key: { fifths: 0, mode: 'major' }, clef: 'treble', tempo: 100,
    music: 'F3:q A3:q C4:q E4:q | A5:q C6:q E6:q G4:q | B3:h D6:h | D4:q F5:q B5:q G3:q',
  });
  const ledgerBass = Notation.build({
    id: 't67-ledger-bass', title: '덧줄 낮은음', time: [4, 4], key: { fifths: 0, mode: 'major' }, clef: 'bass', tempo: 100,
    music: 'A1:q C2:q E2:q G2:q | C4:q E4:q G4:q B3:q | D2:w | F3:q A2:q B1:q F4:q',
  });
  const scoresFor = () => [
    ...['example-twinkle', 'example-fur-elise', 'example-greensleeves', 'example-mountain-king', 'example-rhythm-etude'].map((id) => scores.get(id)),
    ledgerTreble, ledgerBass,
  ];
  let sheets = null;
  const allSheets = async () => {
    if (!sheets) {
      sheets = [];
      for (const score of scoresFor()) sheets.push({ score, sheet: await OmrTest.sheetCanvas(score) });
    }
    return sheets;
  };

  T.test('67-2 (가) 음표 머리의 음높이 99% 이상', async (T) => {
    let right = 0;
    let total = 0;
    for (const { score, sheet } of await allSheets()) {
      const want = truth(score);
      const { heads } = readAll(pageOf(sheet.canvas));
      const acc = accuracy(heads, want);
      right += acc * want.length;
      total += want.length;
      T.check(acc >= 0.97, `${score.title}: ${(acc * 100).toFixed(1)}% (${heads.length}/${want.length})`);
    }
    T.check(right / total >= 0.99, `(가) 전체 ${(100 * right / total).toFixed(2)}% (≥ 99%)`);
  });

  T.test('67-2 (나) 사진 흉내 95% 이상', async (T) => {
    let right = 0;
    let total = 0;
    for (const [k, { score, sheet }] of (await allSheets()).entries()) {
      const photo = OmrTest.paperPhoto(sheet.canvas, { bend: 5, seed: 20 + k, noise: 8 });
      const flat = OmrImage.flatten(photo, OmrImage.findCorners(photo) ?? photo.corners);
      const want = truth(score);
      const { heads } = readAll(flat);
      const acc = accuracy(heads, want);
      right += acc * want.length;
      total += want.length;
      T.check(true, `${score.title}: ${(acc * 100).toFixed(1)}%`);
    }
    T.check(right / total >= 0.95, `(나) 전체 ${(100 * right / total).toFixed(2)}% (≥ 95%)`);
  });

  T.test('67-2 음자리표가 보표마다 맞음', async (T) => {
    for (const { score, sheet } of await allSheets()) {
      const { analysis } = readAll(pageOf(sheet.canvas));
      const want = score.measures[0].clef;
      const got = analysis.clefs.map((c) => c.clef);
      T.check(got.length === sheet.rows.length && got.every((c) => c === want) && analysis.clefs.every((c) => c.sure),
        `${score.title}: ${got.join(',')} (정답 ${want}) ${JSON.stringify(analysis.clefs.map((c) => [c.above, c.below, c.upper].map((v) => +v.toFixed(2))))}`);
    }
  });

  T.test('67-2 화음·읽지 못한 덩어리가 있는 마디는 확인 필요', async (T) => {
    // 화음: 셋째 마디 첫 음에 위 음을 더함.
    const chordScore = JSON.parse(JSON.stringify(scores.get('example-twinkle')));
    chordScore.measures[2].notes[0].chord = [{ pitch: { step: 'A', alter: 0, octave: 4 } }];
    const chordSheet = await OmrTest.sheetCanvas(chordScore);
    const chord = readAll(pageOf(chordSheet.canvas)).analysis;
    const m3 = chord.measures[0][2];
    T.check(m3.doubtful && name(m3.notes[0].pitch) === 'A4' && m3.notes.length === 4, `화음 마디: 확인 필요, 위 음 하나 (${m3.notes.map((n) => name(n.pitch))})`);
    T.check(!chord.measures[0][0].doubtful && !chord.measures[0][1].doubtful, '다른 마디는 그대로');
    // 덩어리: 둘째 마디 아래에 검은 얼룩.
    const { canvas, rows } = (await allSheets())[0].sheet;
    const smudged = document.createElement('canvas');
    smudged.width = canvas.width;
    smudged.height = canvas.height;
    const ctx = smudged.getContext('2d');
    ctx.drawImage(canvas, 0, 0);
    const space = (rows[0].staffBottom - rows[0].staffTop) / 4;
    const x = (rows[0].bars[0].x + rows[0].bars[1].x) / 2;
    ctx.fillStyle = '#000';
    ctx.fillRect(x - space * 0.8, rows[0].staffBottom + space * 1.2, space * 1.6, space * 1.2);
    const smudge = readAll(pageOf(smudged)).analysis;
    T.check(smudge.measures[0][1].doubtful, '얼룩 있는 마디: 확인 필요');
    T.check(smudge.measures[0].filter((m) => m.doubtful).length === 1, '얼룩 없는 마디는 그대로');
  });

  T.test('67-2 인식 결과가 편집기에, 한 사이클', async (T) => {
    T.setMode('score');
    const { sheet, score } = (await allSheets())[3]; // 산왕의 궁전(낮은음자리표)
    await importPhotos([await OmrTest.fileOf(sheet.canvas, 'mountain.png')]);
    T.check(await recognizePhotos(), '편집기로');
    const got = scoreEditor.state.score;
    T.check(got.measures[0].clef === 'bass', `음자리표: ${got.measures[0].clef}`);
    // 길이는 68단계에서 읽으므로 지금은 마디마다 4분음표로 채운 앞 4음까지만 들어감: 그 음들이 정답의 앞 음과 같은가.
    const got4 = got.measures.flatMap((m) => m.notes.filter((n) => !n.rest).map((n) => name(n.pitch)));
    const want4 = score.measures.flatMap((m) => m.notes.filter((n) => !n.rest).slice(0, 4).map((n) => name(n.pitch)));
    T.check(accuracy(got4, want4) >= 0.97, `음높이 (${got4.slice(0, 8).join(' ')} …)`);
    T.$('editor-cancel').click();
    await T.listen();
    T.enterNotes(current);
    T.submit();
    T.check(T.resultText().includes('모두 정답'), '연습 한 사이클');
    T.next();
    T.setMode('melody');
    clearInterval(ticker);
  });
}
