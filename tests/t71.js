// 71단계 — 확장 11 완성 기준 점검. Run with omr-lib.js (first) and smoke.js.
{
  const ticker = setInterval(() => {}, 1); // image decoding runs off the page's thread (pitfalls.md)
  const writeTop = () => Math.round(T.$('staff-title').getBoundingClientRect().top);
  const editing = () => !T.$('editor').hidden;
  const photosOpen = () => !T.$('photos').hidden;
  const SHORT = { whole: 'w', half: 'h', quarter: 'q', eighth: '8', '16th': '16', '32nd': '32', '64th': '64' };
  const name = (p) => `${p.step}${['bb', 'b', '', '#', '##'][p.alter + 2]}${p.octave}`;
  // A note as pitch + drawn length (a rest as its length): right only when both are.
  const token = (n) => `${n.rest ? 'r' : name(n.pitch)}/${SHORT[n.type]}${'.'.repeat(n.dots ?? 0)}`;
  const truth = (score) => score.measures.flatMap((m) => m.notes.filter((n) => !n.grace).map(token));
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
  const IDS = ['example-twinkle', 'example-fur-elise', 'example-greensleeves', 'example-mountain-king', 'example-rhythm-etude'];
  let sheets = null;
  const allSheets = async () => {
    if (!sheets) {
      sheets = [];
      for (const id of IDS) sheets.push({ score: scores.get(id), sheet: await OmrTest.sheetCanvas(scores.get(id)) });
    }
    return sheets;
  };
  const photoOf = (sheet, k) => OmrTest.paperPhoto(sheet.canvas, { bend: 5, seed: 80 + k, noise: 8, fit: true });

  T.test('71-1 사진 화면을 연 채 모드를 바꾸면 닫히고 그 모드로 (모드마다 한 사이클은 smoke)', async (T) => {
    T.setMode('score');
    const { sheet } = (await allSheets())[0];
    await importPhotos([await OmrTest.fileOf(sheet.canvas, 'a.png')]);
    T.check(photosOpen(), '사진 정리 화면');
    for (const mode of ['melody', 'harmony', 'rhythm']) {
      T.setMode(mode);
      T.check(!photosOpen() && T.$('app').dataset.mode === mode, `${mode}로 바꾸면 사진 화면이 닫힘`);
    }
    T.setMode('score');
    T.check(!photosOpen() && !editing(), '내 악보로 돌아오면 연습 화면');
  });

  T.test('71-2 사진 여러 장 → 모서리 → 인식 → 원본·확인 필요 → 고치기 → 저장 → 연습', async (T) => {
    T.setMode('score');
    const { score, sheet } = (await allSheets())[0];
    const photos = [photoOf(sheet, 0), photoOf(sheet, 1)];
    await importPhotos([await OmrTest.fileOf(photos[0], '사진1.jpg', 'image/jpeg'), await OmrTest.fileOf(photos[1], '사진2.jpg', 'image/jpeg')]);
    T.check(photosOpen(), '사진 두 장이 정리 화면에');
    T.check(!T.$('photos-recognize').disabled, '[인식] 켜짐');
    T.check(await recognizePhotos() && editing(), '인식 → 편집기');
    const state = scoreEditor.state;
    T.check(state.score.measures.length === score.measures.length * 2, `두 장을 이어 마디 ${state.score.measures.length} / ${score.measures.length * 2}`);
    T.$('editor-original-toggle').click();
    const canvas = T.$('editor-original-canvas');
    T.check(!T.$('editor-original').hidden && canvas.width > 50, '원본 보기');
    const checks = omrSession.checks.length;
    if (checks) {
      T.$('editor-omr-next').click();
      T.check(omrSession.checks.map(String).includes(canvas.dataset.measure), `[다음 확인]으로 확인 필요 마디로 (${canvas.dataset.measure})`);
    }
    T.check(true, `확인 필요 ${checks}마디`);
    // 고치기: 커서 자리에 음 하나를 넣는다.
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
    T.check(Notation.isValid({ ...scoreEditor.result(), id: 'omr-t71' }), '고친 악보가 유효');
    T.$('editor-title').value = '사진 완성 기준';
    T.$('editor-title').dispatchEvent(new Event('input'));
    T.$('editor-save').click();
    const saved = scores.list().find((s) => s.title === '사진 완성 기준');
    T.check(saved && !editing(), '저장 → 연습 화면');
    T.check(await T.listen(), '그 악보로 듣기');
    T.enterNotes(current);
    T.submit();
    T.check(T.resultText().includes('모두 정답'), '그 악보로 연습 한 사이클');
    T.next();
    T.deleteScore();
  });

  T.test('71-3 (가) 99%·(나) 95% (음높이와 길이 모두), 틀린 마디는 모두 확인 필요', async (T) => {
    const read = (page) => OmrSymbols.read(page, OmrStaff.analyse(page));
    let ra = 0;
    let rb = 0;
    let total = 0;
    const missed = [];
    for (const [k, { score, sheet }] of (await allSheets()).entries()) {
      const want = truth(score);
      const plain = read(OmrImage.binarize(OmrImage.gray(sheet.canvas)));
      const a = accuracy(plain.measures.flat().flatMap((m) => m.notes.map(token)), want);
      const photo = photoOf(sheet, k);
      const bent = read(OmrImage.flatten(photo, OmrImage.findCorners(photo) ?? photo.corners));
      const b = accuracy(bent.measures.flat().flatMap((m) => m.notes.map(token)), want);
      ra += a * want.length;
      rb += b * want.length;
      total += want.length;
      T.check(true, `${score.title}: (가) ${(a * 100).toFixed(1)}%, (나) ${(b * 100).toFixed(1)}%`);
      // 틀린 음(음높이·길이)이 든 마디, 박이 맞지 않는 마디는 모두 확인 필요여야 한다.
      const key = (n) => `${n.rest ? 'r' : Notation.midi(n.pitch)}/${SHORT[n.type]}${'.'.repeat(n.dots ?? 0)}`;
      for (const [kind, analysis] of [['가', plain], ['나', bent]]) {
        const built = OmrBuild.score([analysis], { title: 'x' });
        built.score.measures.forEach((m, i) => {
          const got = m.notes.filter((n) => !n.grace).map(key).join(' ');
          const want = (score.measures[i]?.notes ?? []).filter((n) => !n.grace).map(key).join(' ');
          if (got !== want && !built.checks.includes(i)) missed.push(`${score.title}(${kind}) ${i + 1}마디`);
        });
      }
    }
    T.check(ra / total >= 0.99, `(가) 전체 ${(100 * ra / total).toFixed(2)}% (≥ 99%)`);
    T.check(rb / total >= 0.95, `(나) 전체 ${(100 * rb / total).toFixed(2)}% (≥ 95%)`);
    T.check(!missed.length, `틀렸는데 확인 필요가 아닌 마디: ${missed.slice(0, 6).join(', ') || '없음'}`);
  });

  T.test('71-4 사진은 바깥으로 보내지거나 저장되지 않음', async (T) => {
    T.setMode('score');
    const sent = [];
    const origFetch = window.fetch;
    const origOpen = XMLHttpRequest.prototype.open;
    const origBeacon = navigator.sendBeacon;
    window.fetch = (...a) => { sent.push(`fetch ${a[0]}`); return origFetch.apply(window, a); };
    XMLHttpRequest.prototype.open = function (...a) { sent.push(`xhr ${a[1]}`); return origOpen.apply(this, a); };
    navigator.sendBeacon = (...a) => { sent.push(`beacon ${a[0]}`); return false; };
    const resources = () => performance.getEntriesByType('resource').filter((e) => !/^(file|data|blob):/.test(e.name)).length;
    const before = resources();
    const storeBefore = JSON.stringify({ ...localStorage });
    const { sheet } = (await allSheets())[1];
    await importPhotos([await OmrTest.fileOf(photoOf(sheet, 5), '밖.jpg', 'image/jpeg')]);
    await recognizePhotos();
    T.$('editor-original-toggle').click();
    T.$('editor-title').value = '바깥 시험';
    T.$('editor-title').dispatchEvent(new Event('input'));
    T.$('editor-save').click();
    window.fetch = origFetch;
    XMLHttpRequest.prototype.open = origOpen;
    navigator.sendBeacon = origBeacon;
    T.check(!sent.length && resources() === before, `네트워크 요청 없음 (${sent.join(', ') || '0'})`);
    const store = JSON.stringify({ ...localStorage });
    T.check(!/data:image|blob:|[A-Za-z0-9+/]{200,}/.test(store), 'localStorage에 사진(이미지 데이터) 없음');
    const saved = scores.list().find((s) => s.title === '바깥 시험');
    const was = JSON.parse(storeBefore);
    const changed = Object.keys(localStorage).filter((k) => was[k] !== localStorage[k]);
    T.check(saved && changed.every((k) => /^ltw\.(scores|examples|sections)\./.test(k)), `바뀐 저장 키는 악보 쪽뿐 (${changed.join(', ')})`);
    T.check(!/origin|photo|page/.test(Object.keys(saved).join(',')), `저장한 악보에 사진·원본 자리 없음 (${Object.keys(saved)})`);
    T.deleteScore();
  });

  T.test('71-5 폭마다 넘침 없음, 진행 표시, 받아 적기 위치 그대로', async (T) => {
    T.setMode('score');
    const top = writeTop();
    const { sheet } = (await allSheets())[2];
    await importPhotos([await OmrTest.fileOf(photoOf(sheet, 7), 'p1.jpg', 'image/jpeg'), await OmrTest.fileOf(sheet.canvas, 'p2.png')]);
    T.check(T.noHorizontalOverflow(), '사진 정리 화면 넘침 없음');
    const seen = [];
    const observer = new MutationObserver(() => seen.push(T.$('photos-status').textContent));
    observer.observe(T.$('photos-status'), { childList: true, characterData: true, subtree: true });
    let ticks = 0;
    const tick = setInterval(() => ticks++, 0);
    T.check(await recognizePhotos(), '인식');
    clearInterval(tick);
    observer.disconnect();
    T.check(seen.some((t) => t.includes('(1/2쪽)')) && seen.some((t) => t.includes('(2/2쪽)')), `인식 중 진행 표시 갱신 (${seen.join(' | ')})`);
    T.check(ticks >= 2, `인식 중에도 다른 일이 돌아감(화면이 멈추지 않음, 타이머 ${ticks}번)`);
    T.$('editor-original-toggle').click();
    T.check(T.noHorizontalOverflow(), '편집기·원본 보기 넘침 없음');
    T.$('editor-cancel').click();
    T.check(writeTop() === top, '받아 적기 위치 그대로');
    for (const mode of ['melody', 'harmony', 'rhythm', 'score']) {
      T.setMode(mode);
      T.check(writeTop() === top, `${mode}: 받아 적기 위치 그대로`);
    }
    T.setMode('melody');
    clearInterval(ticker);
  });
}
