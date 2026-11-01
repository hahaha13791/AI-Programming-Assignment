// 68단계 — 길이: 기둥·꼬리·빔·점·쉼표. Run with omr-lib.js (first) and smoke.js.
{
  const ticker = setInterval(() => {}, 1); // image decoding runs off the page's thread (pitfalls.md)
  const pageOf = (canvas) => OmrImage.binarize(OmrImage.gray(canvas));
  const SHORT = { whole: 'w', half: 'h', quarter: 'q', eighth: '8', '16th': '16', '32nd': '32', '64th': '64' };
  const token = (n) => `${n.rest ? 'r' : ''}${SHORT[n.type]}${'.'.repeat(n.dots ?? 0)}`;
  // Every written note and rest, as its drawn length (a tuplet's notes are drawn as their type).
  const truth = (score) => score.measures.flatMap((m) => m.notes.filter((n) => !n.grace).map(token));
  const readAll = (page) => {
    const analysis = OmrSymbols.read(page, OmrStaff.analyse(page));
    return { analysis, tokens: analysis.measures.flat().flatMap((m) => m.notes.map(token)) };
  };
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
  // Every length (온~32분, 점, 쉼표) in plain measures.
  const lengths = Notation.build({
    id: 't68-lengths', title: '길이 모음', time: [4, 4], key: { fifths: 0, mode: 'major' }, clef: 'treble', tempo: 100,
    music: 'C5:w | B4:h. r:q | A4:q r:q G4:8 F4:8 E4:8 D4:8 | C5:8 r:8 B4:16 A4:16 G4:16 F4:16 E4:q. D4:8'
      + ' | G4:32 A4:32 B4:32 C5:32 D5:8 r:16 E5:16 F5:8. G5:16 r:h | A4:h r:h | r:w | B4:8. C5:16 D5:q r:8 E5:8 r:32 F5:32 G5:16 A5:8',
  });
  const scoresFor = () => [
    ...['example-twinkle', 'example-fur-elise', 'example-greensleeves', 'example-mountain-king', 'example-rhythm-etude'].map((id) => scores.get(id)),
    lengths,
  ];
  let sheets = null;
  const allSheets = async () => {
    if (!sheets) {
      sheets = [];
      for (const score of scoresFor()) sheets.push({ score, sheet: await OmrTest.sheetCanvas(score) });
    }
    return sheets;
  };

  T.test('68-2 (가) 음표·쉼표의 길이(점 포함) 99% 이상', async (T) => {
    let right = 0;
    let total = 0;
    for (const { score, sheet } of await allSheets()) {
      const want = truth(score);
      const { tokens } = readAll(pageOf(sheet.canvas));
      const acc = accuracy(tokens, want);
      right += acc * want.length;
      total += want.length;
      T.check(acc >= 0.95, `${score.title}: ${(acc * 100).toFixed(1)}% (${tokens.length}/${want.length})`);
    }
    T.check(right / total >= 0.99, `(가) 전체 ${(100 * right / total).toFixed(2)}% (≥ 99%)`);
  });

  T.test('68-2 (나) 사진 흉내 95% 이상', async (T) => {
    let right = 0;
    let total = 0;
    for (const [k, { score, sheet }] of (await allSheets()).entries()) {
      const photo = OmrTest.paperPhoto(sheet.canvas, { bend: 5, seed: 40 + k, noise: 8, fit: true });
      const flat = OmrImage.flatten(photo, OmrImage.findCorners(photo) ?? photo.corners);
      const want = truth(score);
      const { tokens } = readAll(flat);
      const acc = accuracy(tokens, want);
      right += acc * want.length;
      total += want.length;
      T.check(true, `${score.title}: ${(acc * 100).toFixed(1)}%`);
    }
    T.check(right / total >= 0.95, `(나) 전체 ${(100 * right / total).toFixed(2)}% (≥ 95%)`);
  });

  T.test('68-2 음 하나를 지우면 그 마디만 확인 필요, 쉼표로 채움', async (T) => {
    const { sheet, score } = (await allSheets())[0]; // 반짝반짝: 둘째 마디(A4 A4 G4:h)의 첫 음을 지움
    const canvas = document.createElement('canvas');
    canvas.width = sheet.canvas.width;
    canvas.height = sheet.canvas.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(sheet.canvas, 0, 0);
    const page = pageOf(canvas);
    const before = OmrSymbols.read(page, OmrStaff.analyse(page));
    const head = before.measures[0][1].heads[0];
    const space = before.staves[0].space;
    ctx.fillStyle = '#fff';
    ctx.fillRect(head.x - space * 0.5, head.y - space * 4, space * 1.1, space * 4.6); // the head and its stem (not the barline before it)
    const pages = [pageOf(canvas)];
    const analyses = [OmrSymbols.read(pages[0], OmrStaff.analyse(pages[0]))];
    const built = OmrBuild.score(analyses, { title: '지운 음' });
    T.check(built.checks.join(',') === '1', `확인 필요 마디: ${built.checks.map((m) => m + 1)}`);
    const m2 = built.score.measures[1].notes.map(token).join(' ');
    T.check(m2 === 'q h rq', `앞에서부터 넣고 쉼표로 채움 (${m2})`);
    T.check(built.score.measures[0].notes.map(token).join(' ') === 'q q q q', '다른 마디는 그대로');
    T.check(Notation.isValid({ ...built.score, id: 'x' }) && !built.score.pickup, '유효한 악보');
    void score;
  });

  T.test('68-2 붙임줄·셋잇단이 든 마디는 확인 필요와 알림', async (T) => {
    // 붙임줄(마디 안·마디 넘어)과 셋잇단이 있는 곡. (예시 '리듬 표기 연습곡'의 첫 붙임줄은 앱이 음을 바짝 붙여 그려 5px뿐이라
    // 인쇄 악보와 달라서, 보통 간격으로 그린 곡으로 본다.)
    const score = Notation.build({
      id: 't68-ties', title: '붙임줄 시험', time: [4, 4], key: { fifths: 0, mode: 'major' }, clef: 'treble', tempo: 100,
      music: 'C5:h~ C5:q D5:q | E5:q 3[ F5:8 G5:8 A5:8 ] B4:h | C5:w~ | C5:h G4:h | A4:q B4:q C5:h',
    });
    const page = pageOf((await OmrTest.sheetCanvas(score)).canvas);
    const built = OmrBuild.score([OmrSymbols.read(page, OmrStaff.analyse(page))], { title: '붙임줄' });
    const marked = new Set(built.checks);
    const want = score.measures.map((m, i) => (m.notes.some((n) => n.tie || n.tuplet) ? i : -1)).filter((i) => i >= 0);
    T.check(want.every((i) => marked.has(i)), `붙임줄·셋잇단 마디 ${want.map((i) => i + 1)} 모두 확인 필요 (표시 ${built.checks.map((m) => m + 1)})`);
    T.check(!marked.has(4), '붙임줄·셋잇단이 없는 마지막 마디는 그대로');
    T.check(built.notices.some((n) => n.includes('붙임줄·잇단음표·화음 등은 아직 읽지 못해요')), `알림: ${built.notices.join(' / ')}`);
    // 그런 것이 없는 곡은 알림 없음.
    const twinkle = (await allSheets())[0].sheet;
    const tp = pageOf(twinkle.canvas);
    const plain = OmrBuild.score([OmrSymbols.read(tp, OmrStaff.analyse(tp))], { title: '별' });
    T.check(!plain.notices.some((n) => n.includes('읽지 못해요')) && plain.checks.length === 0, `반짝반짝: 확인 필요 ${plain.checks.length}개, 알림 ${plain.notices.length}개`);
  });

  T.test('68-2 편집기에서 리듬까지, 한 사이클', async (T) => {
    T.setMode('score');
    const { sheet, score } = (await allSheets())[2]; // 그린슬리브스 6/8 — 박자는 69단계에서 읽으므로 길이 순서만 봄
    await importPhotos([await OmrTest.fileOf(sheet.canvas, 'green.png')]);
    T.check(await recognizePhotos(), '편집기로');
    T.check(scoreEditor.state.score.measures.length === score.measures.length, `마디 수 ${scoreEditor.state.score.measures.length}`);
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
