// 69단계 — 조표·임시표·박자표. Run with omr-lib.js (first) and smoke.js.
{
  const ticker = setInterval(() => {}, 1); // image decoding runs off the page's thread (pitfalls.md)
  const pageOf = (canvas) => OmrImage.binarize(OmrImage.gray(canvas));
  const read = (page) => OmrSymbols.read(page, OmrStaff.analyse(page));
  const build = (score) => Notation.build({ id: score.id ?? 't69', title: 't69', key: { fifths: 0, mode: 'major' }, clef: 'treble', tempo: 100, ...score });
  const name = (p) => `${p.step}${['bb', 'b', '', '#', '##'][p.alter + 2]}${p.octave}`;
  const heads = (score) => score.measures.flatMap((m) => m.notes.filter((n) => !n.rest).map((n) => name(n.pitch)));
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

  T.test('69-2 (가) 조표 ♯·♭ 0~7개', async (T) => {
    const wrong = [];
    for (let fifths = -7; fifths <= 7; fifths++) {
      const score = build({ time: [4, 4], key: { fifths, mode: 'major' }, music: 'G4:q A4:q B4:q C5:q | D5:w' });
      const analysis = read(pageOf((await OmrTest.sheetCanvas(score)).canvas));
      if (analysis.keys[0].fifths !== fifths) wrong.push(`${fifths}→${analysis.keys[0].fifths}`);
    }
    T.check(!wrong.length, `조표 15가지 (틀림: ${wrong.join(', ') || '없음'})`);
  });

  T.test('69-2 (가) 박자표 2/4·3/4·4/4·6/8·9/8·12/8·2/2·C·¢', async (T) => {
    const cases = [
      [[2, 4], 'C5:q D5:q | E5:h'], [[3, 4], 'C5:q D5:q E5:q | F5:h.'], [[4, 4], 'C5:q D5:q E5:q F5:q | G5:w'],
      [[6, 8], 'C5:q. D5:q. | E5:h.'], [[9, 8], 'C5:q. D5:q. E5:q. | F5:h. G5:q.'], [[12, 8], 'C5:q. D5:q. E5:q. F5:q. | G5:w.'],
      [[2, 2], 'C5:h D5:h | E5:w'], [[4, 4], 'C5:q D5:q E5:q F5:q | G5:w', 'common'], [[2, 2], 'C5:h D5:h | E5:w', 'cut'],
    ];
    const wrong = [];
    for (const [time, music, symbol] of cases) {
      const score = build({ time, music });
      if (symbol) score.measures[0].timeSymbol = symbol;
      const analysis = read(pageOf((await OmrTest.sheetCanvas(score)).canvas));
      const got = analysis.measures[0][0].time;
      const ok = got && `${got.time}` === `${time}` && (got.symbol ?? null) === (symbol ?? null);
      if (!ok) wrong.push(`${symbol ?? time.join('/')}→${got ? got.symbol ?? got.time.join('/') : '없음'}`);
    }
    T.check(!wrong.length, `박자표 9가지 (틀림: ${wrong.join(', ') || '없음'})`);
  });

  T.test('69-2 (가) 임시표: 붙은 음, 같은 마디 뒤 음(이어짐), 제자리표', async (T) => {
    // 다장조: F#4 F#4(표 없음) F4(♮) | Bb4 Bb4 B4(♮) C#5 / 사장조 곡: F5(조표로 F#) F5(♮) F#5(♯) F#5(이어짐) | C#5(♯) F4(♮) F#4(♯)
    // (보표 중간의 조 바뀜은 1차에서 읽지 않으므로(제외-37) 조표가 다른 곡을 따로 그린다)
    const score = build({ time: [4, 4], music: 'F#4:q F#4:q F4:q G4:q | Bb4:q Bb4:q B4:q C#5:q' });
    const g = build({ time: [4, 4], key: { fifths: 1, mode: 'major' }, music: 'F#5:q F5:q F#5:q F#5:q | C#5:q F4:q F#4:q G4:q' });
    const gAnalysis = read(pageOf((await OmrTest.sheetCanvas(g)).canvas));
    const gGot = gAnalysis.measures.flat().flatMap((m) => m.notes.filter((n) => !n.rest).map((n) => name(n.pitch)));
    T.check(gGot.join(' ') === heads(g).join(' '), `사장조 (${gGot.join(' ')})`);
    const sheet = await OmrTest.sheetCanvas(score);
    const analysis = read(pageOf(sheet.canvas));
    const got = analysis.measures.flat().flatMap((m) => m.notes.filter((n) => !n.rest).map((n) => name(n.pitch)));
    T.check(got.join(' ') === heads(score).join(' '), `음높이 (${got.join(' ')})`);
  });

  T.test('69-2 (나) 사진 흉내 음높이 95% 이상(조표·임시표 포함)', async (T) => {
    let right = 0;
    let total = 0;
    const ids = ['example-twinkle', 'example-fur-elise', 'example-greensleeves', 'example-mountain-king', 'example-rhythm-etude'];
    for (const [k, id] of ids.entries()) {
      const score = scores.get(id);
      const sheet = await OmrTest.sheetCanvas(score);
      const photo = OmrTest.paperPhoto(sheet.canvas, { bend: 5, seed: 60 + k, noise: 8, fit: true });
      const flat = OmrImage.flatten(photo, OmrImage.findCorners(photo) ?? photo.corners);
      // 읽은 음 그대로(박 맞추기 전)의 음높이 — 길이 판정은 68단계에서 따로 잰다.
      const analysis = read(flat);
      const got = analysis.measures.flat().flatMap((m) => m.notes.filter((n) => !n.rest).map((n) => name(n.pitch)));
      const want = heads(score);
      const acc = accuracy(got, want);
      right += acc * want.length;
      total += want.length;
      T.check(true, `${score.title}: ${(acc * 100).toFixed(1)}%`);
    }
    T.check(right / total >= 0.95, `(나) 전체 ${(100 * right / total).toFixed(2)}% (≥ 95%)`);
  });

  T.test('69-2 못갖춘마디, 마지막 짧은 마디, 박자 바꿈', async (T) => {
    const elise = scores.get('example-fur-elise');
    const built = OmrBuild.score([read(pageOf((await OmrTest.sheetCanvas(elise)).canvas))], { title: 'x' });
    const len = (m) => Notation.toNumber(Notation.filled(m.notes));
    T.check(built.score.pickup && len(built.score.measures[0]) === 2 / 16, `못갖춘마디 (${len(built.score.measures[0])})`);
    T.check(`${built.score.measures[0].time}` === '3,8', `박자 3/8 (${built.score.measures[0].time})`);
    const last = built.score.measures[built.score.measures.length - 1];
    T.check(len(last) < 3 / 8 && Notation.isValid({ ...built.score, id: 'x' }), `마지막 짧은 마디 (${len(last)})`);
    T.check(!built.checks.includes(0), `못갖춘마디는 확인 필요가 아님 (확인 필요 ${built.checks.map((m) => m + 1)})`);
    // 리듬 표기 연습곡: 4/4 → 3/4 → 6/8, 조 바뀜(다장조 → 사장조)
    const etude = scores.get('example-rhythm-etude');
    const e = OmrBuild.score([read(pageOf((await OmrTest.sheetCanvas(etude)).canvas))], { title: 'y' }).score;
    const times = e.measures.map((m) => (m.time ? m.time.join('/') : '')).join(',');
    T.check(times === '4/4,,,,,3/4,6/8,', `박자 바꿈 (${times})`);
    T.check(e.measures[4].key?.fifths === 1, `조 바뀜 5마디 (${JSON.stringify(e.measures[4].key)})`);
  });

  T.test('69-2 알림: 장조로 둠, 빠르기, 제목, 박자표 못 찾음', async (T) => {
    T.setMode('score');
    const sheet = await OmrTest.sheetCanvas(scores.get('example-twinkle'));
    await importPhotos([await OmrTest.fileOf(sheet.canvas, '별.png')]);
    await recognizePhotos();
    const notice = T.$('editor-omr-notice').textContent;
    T.check(notice.includes('장조로 두었어요') && notice.includes('♩= 120') && notice.includes('파일 이름'), `알림: ${notice}`);
    T.check(!notice.includes('박자표를 찾지 못해'), '박자표를 찾으면 그 알림은 없음');
    T.$('editor-cancel').click();
    // 박자표를 지운 사진
    const canvas = document.createElement('canvas');
    canvas.width = sheet.canvas.width;
    canvas.height = sheet.canvas.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(sheet.canvas, 0, 0);
    const analysis = read(pageOf(sheet.canvas));
    const staff = analysis.staves[0];
    ctx.fillStyle = '#fff';
    ctx.fillRect(staff.left + staff.space * 3.3, staff.top - 2, staff.space * 1.6, staff.bottom - staff.top + 4);
    ctx.fillStyle = '#000';
    for (let l = 0; l < 5; l++) ctx.fillRect(staff.left, Math.round(OmrStaff.lineY(staff, l, staff.left)) - 1, staff.space * 6, 2);
    const built = OmrBuild.score([read(pageOf(canvas))], { title: 'z' });
    T.check(built.notices.some((n) => n.includes('박자표를 찾지 못해 4/4로')) && `${built.score.measures[0].time}` === '4,4', `박자표 없음: ${built.notices.join(' / ')}`);
    T.check(built.checks.includes(0), '첫 마디 확인 필요');
    // 한 사이클
    await T.listen();
    T.enterNotes(current);
    T.submit();
    T.check(T.resultText().includes('모두 정답'), '연습 한 사이클');
    T.next();
    T.setMode('melody');
    clearInterval(ticker);
  });
}
