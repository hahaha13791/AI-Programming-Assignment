// 66단계 — 오선·세로줄 찾기와 편집기로 넘기기. Run with omr-lib.js (first) and smoke.js.
{
  const ticker = setInterval(() => {}, 1); // image decoding runs off the page's thread (pitfalls.md)
  const writeTop = () => Math.round(T.$('staff-title').getBoundingClientRect().top);
  const editing = () => !T.$('editor').hidden;
  let pages = null; // (가) pages, made once per width
  const twinkle = async () => {
    if (!pages) pages = await OmrTest.sheetCanvas(scores.get('example-twinkle'));
    return pages;
  };
  // A black-and-white page straight from a canvas (no photo).
  const pageOf = (canvas) => OmrImage.binarize(OmrImage.gray(canvas));
  const truthBars = (sheet) => sheet.rows.map((r) => r.bars.length);

  T.test('66-2 (가)·(나): 보표 수, 마디 수, 세로줄 자리', async (T) => {
    const sheet = await twinkle();
    const rows = sheet.rows.length;
    const plain = OmrStaff.analyse(pageOf(sheet.canvas));
    T.check(plain.staves.length === rows, `(가) 보표 ${plain.staves.length} / 정답 ${rows}`);
    const counts = plain.measures.map((m) => m.length);
    T.check(counts.join(',') === truthBars(sheet).join(','), `(가) 보표마다 마디 수 ${counts} / 정답 ${truthBars(sheet)}`);
    // 세로줄 자리: 줄 간격의 절반 안.
    let worst = 0;
    plain.barlines.forEach((bars, i) => bars.forEach((bar, j) => {
      worst = Math.max(worst, Math.abs(bar.x - sheet.rows[i].bars[j].x) / plain.size.space);
    }));
    T.check(worst <= 0.5, `(가) 세로줄 자리 오차 최대 ${worst.toFixed(2)}칸 (≤ 0.5)`);
    const kinds = plain.barlines.flat().map((b) => b.kind);
    T.check(kinds[kinds.length - 1] === 'final' && kinds.slice(0, -1).every((k) => k === 'single'), `세로줄 종류 (${kinds.join(' ')})`);
    // (나): 원근 + 휨 + 잡음, 자동 모서리로 편 것.
    const photo = OmrTest.paperPhoto(sheet.canvas, { bend: 6, seed: 9 });
    const flat = OmrImage.flatten(photo, OmrImage.findCorners(photo));
    const bent = OmrStaff.analyse(flat);
    T.check(bent.staves.length === rows, `(나) 보표 ${bent.staves.length} / 정답 ${rows}`);
    const bentCounts = bent.measures.map((m) => m.length);
    T.check(bentCounts.join(',') === truthBars(sheet).join(','), `(나) 마디 수 ${bentCounts}`);
    const sx = flat.width / sheet.canvas.width;
    let worst2 = 0;
    bent.barlines.forEach((bars, i) => bars.forEach((bar, j) => {
      const want = sheet.rows[i].bars[j]?.x * sx;
      worst2 = Math.max(worst2, Math.abs(bar.x - want) / bent.size.space);
    }));
    T.check(worst2 <= 0.5, `(나) 세로줄 자리 오차 최대 ${worst2.toFixed(2)}칸 (≤ 0.5)`);
  });

  T.test('66-2 여러 쪽 → 편집기, 저장·같은 제목', async (T) => {
    T.setMode('score');
    const sheet = await twinkle();
    const files = [await OmrTest.fileOf(sheet.canvas, '첫쪽.png'), await OmrTest.fileOf(sheet.canvas, '둘째쪽.png')];
    await importPhotos(files);
    T.check(!T.$('photos-recognize').disabled, '사진이 있으면 [인식]이 켜짐');
    const opened = await recognizePhotos();
    const total = truthBars(sheet).reduce((a, b) => a + b, 0) * 2;
    T.check(opened && editing() && !photosOpenCheck(), '인식 → 편집기');
    const state = scoreEditor.state;
    T.check(state.score.measures.length === total, `두 쪽을 이어 마디 ${state.score.measures.length} / 정답 ${total}`);
    T.check(T.$('editor-title').value === '첫쪽', `제목은 첫 사진 파일 이름 (${T.$('editor-title').value})`);
    T.check(T.$('editor-heading').textContent === '사진에서 읽은 악보' && T.$('editor-delete').hidden, '저장하지 않은 새 악보');
    T.check(state.score.measures[total - 1].barline === 'final', '끝세로줄');
    T.check(!T.$('editor-omr').hidden && T.$('editor-omr-notice').textContent.includes('파일 이름'), `알림: ${T.$('editor-omr-notice').textContent}`);
    // 음 하나를 넣으면 유효한 악보로 저장된다.
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }));
    const result = scoreEditor.result();
    T.check(Notation.isValid({ ...result, id: 'omr-test' }), '편집기의 악보가 Notation.isValid 통과');
    const before = scores.list().length;
    T.$('editor-title').value = '반짝반짝 작은 별';
    T.$('editor-title').dispatchEvent(new Event('input'));
    T.check(T.$('editor-save').disabled, '같은 제목이면 저장 막힘');
    T.$('editor-title').value = '사진 시험곡';
    T.$('editor-title').dispatchEvent(new Event('input'));
    T.$('editor-save').click();
    const saved = scores.list().find((s) => s.title === '사진 시험곡');
    T.check(scores.list().length === before + 1 && saved && saved.measures.length === total, '새 악보로 저장');
    T.check(!JSON.stringify(saved).includes('check') && !editing(), '저장한 악보에 확인 표시 정보 없음, 연습 화면으로');
    T.deleteScore();
  });

  const photosOpenCheck = () => !T.$('photos').hidden;

  T.test('66-2 대보표: 보표 고르기, 고른 보표만', async (T) => {
    T.setMode('score');
    const grand = OmrTest.grandStaff();
    const analysis = OmrStaff.analyse(pageOf(grand.canvas));
    T.check(analysis.staves.length === 4 && analysis.systems.length === 2 && analysis.systems.every((s) => s.length === 2),
      `보표 ${analysis.staves.length}, 단 ${analysis.systems.map((s) => s.length)}`);
    T.check(analysis.measures.every((m) => m.length === grand.measuresPerSystem), `보표마다 마디 ${analysis.measures.map((m) => m.length)}`);
    await importPhotos([await OmrTest.fileOf(grand.canvas, 'piano.png')]);
    const first = await recognizePhotos();
    T.check(!first && !T.$('photos-staves').hidden && T.$('photos-staves').querySelectorAll('input').length === 2, '보표 고르기 창');
    T.check(T.$('photos-status').textContent.includes('보표가 2개'), `안내: ${T.$('photos-status').textContent}`);
    T.$('photos-staves').querySelector('input[value="1"]').checked = true;
    T.check(await recognizePhotos() && editing(), '고르고 [인식] → 편집기');
    T.check(scoreEditor.state.score.measures.length === grand.systems * grand.measuresPerSystem, `고른 보표만: 마디 ${scoreEditor.state.score.measures.length}`);
    const lower = grand.staffTops[0][1];
    T.check(omrSession.origins[0].y0 > lower - 18 * 4 && omrSession.origins[0].y0 < lower, `원본 자리는 아래 보표 (${Math.round(omrSession.origins[0].y0)})`);
    T.$('editor-cancel').click();
  });

  T.test('66-2 원본 보기, 확인 필요 강조, [다음 확인]', async (T) => {
    T.setMode('score');
    const sheet = await twinkle();
    await importPhotos([await OmrTest.fileOf(sheet.canvas, 'a.png'), await OmrTest.fileOf(sheet.canvas, 'b.png')]);
    await recognizePhotos();
    const viewTop = Math.round(T.$('editor-view').getBoundingClientRect().top);
    T.check(T.$('editor-original').hidden, '원본 보기는 접힌 채 시작');
    T.$('editor-original-toggle').click();
    const canvas = T.$('editor-original-canvas');
    T.check(!T.$('editor-original').hidden && canvas.width > 50 && canvas.dataset.measure === '0', `펴면 커서 마디의 원본 (${canvas.width}×${canvas.height})`);
    const perPage = truthBars(sheet).reduce((a, b) => a + b, 0);
    scoreEditor.state.select(perPage + 1, 0, 0);
    scoreEditor.render();
    T.check(canvas.dataset.measure === String(perPage + 1) && canvas.dataset.page === '1', `커서를 옮기면 그 마디(둘째 쪽) (${canvas.dataset.measure}, ${canvas.dataset.page}쪽)`);
    T.check(T.noHorizontalOverflow(), '원본 보기를 펴도 가로로 넘치지 않음');
    T.$('editor-original-toggle').click();
    T.check(T.$('editor-original').hidden && Math.round(T.$('editor-view').getBoundingClientRect().top) === viewTop, '접으면 배치가 그대로');
    // 확인 필요 강조와 [다음 확인]
    omrSession.checks = [1, 5, 9];
    scoreEditor.state.select(0, 0, 0);
    scoreEditor.render();
    const boxes = [...T.$('editor-view').querySelectorAll('.sv-check')].map((r) => Number(r.dataset.measure));
    T.check(boxes.join(',') === '1,5,9', `확인 필요 마디 강조 (${boxes})`);
    T.check(T.$('editor-omr-checks').textContent === '확인 필요 2·6·10마디', T.$('editor-omr-checks').textContent);
    const visits = [];
    for (let i = 0; i < 4; i++) {
      T.$('editor-omr-next').click();
      visits.push(scoreEditor.state.cursor.measure);
    }
    T.check(visits.join(',') === '1,5,9,1', `[다음 확인] 차례로, 끝에서 처음으로 (${visits})`);
    T.$('editor-cancel').click();
    T.check(!editing() && T.$('editor-omr').hidden, '닫으면 인식 정보를 버림');
    // 직접 만든 새 악보에는 인식 칸이 없음.
    T.$('btn-new-score').click();
    T.$('btn-make-score').click();
    T.check(editing() && T.$('editor-omr').hidden && !T.$('editor-view').querySelector('.sv-check'), '직접 만들기에는 인식 칸 없음');
    T.$('editor-cancel').click();
  });

  T.test('66-2 박 맞추기(fit)와 확인 필요', async (T) => {
    const q = (step) => ({ type: 'quarter', dots: 0, pitch: { step, alter: 0, octave: 4 } });
    const len = Notation.measureLength([4, 4]);
    const over = OmrBuild.fit([q('C'), q('D'), q('E'), q('F'), q('G')], len);
    T.check(over.changed && over.notes.length === 4, '넘친 음은 빼고 확인 필요');
    const short = OmrBuild.fit([q('C'), q('D')], len);
    T.check(short.changed && short.notes.length === 3 && short.notes[2].rest && short.notes[2].type === 'half', '모자라면 쉼표로 채우고 확인 필요');
    const exact = OmrBuild.fit([q('C'), q('D'), q('E'), q('F')], len);
    T.check(!exact.changed && exact.notes.length === 4, '맞으면 그대로');
    const pickup = OmrBuild.fit([q('C')], len, { first: true });
    T.check(!pickup.changed && pickup.notes.length === 1, '첫 마디가 짧으면 못갖춘마디(그대로)');
    const last = OmrBuild.fit([q('C'), q('D')], len, { last: true });
    T.check(!last.changed && last.notes.length === 2, '마지막 마디는 짧아도 됨');
  });

  T.test('66-2 인식 중 진행 표시, [취소]', async (T) => {
    T.setMode('score');
    const sheet = await twinkle();
    await importPhotos([await OmrTest.fileOf(sheet.canvas, 'p1.png'), await OmrTest.fileOf(sheet.canvas, 'p2.png')]);
    const seen = [];
    const observer = new MutationObserver(() => seen.push(T.$('photos-status').textContent));
    observer.observe(T.$('photos-status'), { childList: true, characterData: true, subtree: true });
    const done = recognizePhotos();
    await T.wait(0);
    T.check(T.$('photos-recognize').disabled, '읽는 동안 [인식] 꺼짐');
    T.$('photos-cancel').click();
    const opened = await done;
    observer.disconnect();
    T.check(!opened && !editing() && !photosOpenCheck(), '[취소]하면 아무것도 열리지 않음');
    T.check(seen.some((t) => t.includes('읽는 중이에요 (1/2쪽)')), `진행 표시 (${seen.join(' | ')})`);
    // 끝까지 읽으면 쪽마다 진행이 바뀜.
    await importPhotos([await OmrTest.fileOf(sheet.canvas, 'p1.png'), await OmrTest.fileOf(sheet.canvas, 'p2.png')]);
    const seen2 = [];
    const ob2 = new MutationObserver(() => seen2.push(T.$('photos-status').textContent));
    ob2.observe(T.$('photos-status'), { childList: true, characterData: true, subtree: true });
    T.check(await recognizePhotos(), '끝까지 읽으면 편집기');
    ob2.disconnect();
    T.check(seen2.some((t) => t.includes('(2/2쪽)')), '둘째 쪽 진행도 보임');
    T.$('editor-cancel').click();
    // 오선이 없는 사진은 안내만.
    const blank = document.createElement('canvas');
    blank.width = 600;
    blank.height = 800;
    blank.getContext('2d').fillStyle = '#fff';
    blank.getContext('2d').fillRect(0, 0, 600, 800);
    await importPhotos([await OmrTest.fileOf(blank, 'blank.png')]);
    T.check(!(await recognizePhotos()) && T.$('photos-status').classList.contains('is-error') && T.$('photos-status').textContent.includes('오선을 찾지 못했어요'),
      `오선 없음: ${T.$('photos-status').textContent}`);
    T.$('photos-cancel').click();
  });

  T.test('66-2 폭마다 넘침 없음, 받아 적기 위치 그대로, 한 사이클', async (T) => {
    T.setMode('score');
    const top = writeTop();
    const sheet = await twinkle();
    await importPhotos([await OmrTest.fileOf(sheet.canvas, 'w.png')]);
    T.check(T.noHorizontalOverflow(), '사진 화면 넘침 없음');
    await recognizePhotos();
    T.$('editor-original-toggle').click();
    T.check(T.noHorizontalOverflow(), '편집 화면(원본 보기 펼침) 넘침 없음');
    T.$('editor-cancel').click();
    T.check(writeTop() === top, '받아 적기 위치 그대로');
    await T.listen();
    T.enterNotes(current);
    T.submit();
    T.check(T.resultText().includes('모두 정답'), '연습 한 사이클');
    T.next();
    T.setMode('melody');
    clearInterval(ticker);
  });
}
