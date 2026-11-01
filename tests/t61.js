// 61단계 — [보기] 화면. Run with smoke.js.
{
  const ticker = setInterval(() => {}, 10); // file reads run off the page's thread (pitfalls.md)
  const writeTop = () => Math.round(T.$('staff-title').getBoundingClientRect().top);
  const choose = (id) => {
    T.$('score-select').value = id;
    T.$('score-select').dispatchEvent(new Event('change'));
  };
  const viewing = () => !T.$('viewer').hidden && T.$('app').dataset.viewing !== undefined;
  const practiceShown = () => [...document.querySelectorAll('.practice')].every((p) => getComputedStyle(p).display !== 'none');
  const labels = () => [...T.$('viewer-sheet').querySelectorAll('.sv-solfege')].map((l) => l.textContent);
  const setSolfege = (value) => {
    T.$('btn-settings').click();
    const input = document.querySelector(`#settings input[name="solfege"][value="${value}"]`);
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    T.$('btn-settings').click();
  };

  T.test('61-2 [보기]는 내 악보에서만, 악보 전체를 계이름과 함께', async (T) => {
    for (const m of ['melody', 'harmony', 'rhythm']) {
      T.setMode(m);
      T.check(T.$('btn-view-score').offsetParent === null, `${m}: [보기] 안 보임`);
    }
    T.setMode('score');
    choose('example-twinkle');
    T.$('btn-view-score').click();
    T.check(viewing() && !practiceShown(), '보기 화면이 연습 자리를 대신함');
    T.check(T.$('viewer-title').textContent === '반짝반짝 작은 별', '제목');
    const measures = new Set([...T.$('viewer-sheet').querySelectorAll('.sv-measure')].map((g) => g.dataset.measure));
    T.check(measures.size === 12, `모든 마디 (${measures.size})`);
    T.check(labels().slice(0, 7).join(' ') === '도 도 솔 솔 라 라 솔' && labels().length === 42, `음표 아래 계이름 (${labels().length}개)`);
    T.check(T.noHorizontalOverflow(), '가로로 넘치지 않음');
    // 불러온 악보도.
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"><work><work-title>보기 시험곡</work-title></work>'
      + '<part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list><part id="P1">'
      + '<measure number="1"><attributes><divisions>1</divisions><key><fifths>2</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>'
      + ['D', 'E', 'F', 'G'].map((s) => `<note><pitch><step>${s}</step>${s === 'F' ? '<alter>1</alter>' : ''}<octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>`).join('')
      + '</measure></part></score-partwise>';
    T.$('btn-new-score').click();
    T.check(!viewing(), '[새 악보]를 누르면 닫힘');
    await importFile(new File([xml], 'view.musicxml'));
    T.$('btn-import').click();
    T.$('btn-view-score').click();
    T.check(viewing() && labels().join(' ') === '도 레 미 파', `불러온 악보(라장조, 이동도): ${labels().join(' ')}`);
    T.deleteScore();
    choose('example-twinkle');
  });

  T.test('61-2 닫기: [닫기]·모드·다른 악보·[편집]', async (T) => {
    T.setMode('score');
    const top = writeTop();
    const open = () => {
      T.$('btn-view-score').click();
      return viewing();
    };
    T.check(open(), '열림');
    T.$('viewer-close').click();
    T.check(!viewing() && practiceShown() && writeTop() === top, '[닫기]: 연습 화면이 그대로');
    open();
    T.$('btn-view-score').click();
    T.check(!viewing(), '[보기]를 다시 누르면 닫힘');
    open();
    T.setMode('melody');
    T.check(!viewing() && practiceShown(), '모드를 바꾸면 닫힘');
    T.setMode('score');
    open();
    choose('example-fur-elise');
    T.check(!viewing(), '다른 악보를 고르면 닫힘');
    T.check(open() && T.$('viewer-title').textContent.startsWith('엘리제'), '고른 악보로 다시 열 수 있음');
    T.$('btn-edit-score').click();
    T.check(!viewing() && !T.$('editor').hidden, '[편집]을 누르면 보기는 닫히고 편집기');
    T.$('editor-cancel').click();
    T.check(practiceShown() && writeTop() === top, '편집기를 닫으면 연습 화면');
    choose('example-twinkle');
    // 연습 한 사이클이 그대로.
    await T.listen();
    T.enterNotes(current);
    T.submit();
    T.check(T.resultText().includes('모두 정답'), '보기를 오간 뒤에도 연습 한 사이클');
    T.next();
  });

  T.test('61-2 보기 중 ⚙ 계이름 바꾸기', async (T) => {
    T.setMode('score');
    choose('example-mountain-king');
    T.$('btn-view-score').click();
    T.check(labels()[0] === '라' && T.$('viewer-note').textContent.includes('이동도'), '이동도: 라');
    setSolfege('fixed');
    T.check(labels()[0] === '시' && labels()[1] === '도#' && T.$('viewer-note').textContent.includes('고정도'), '고정도로 바꾸면 바로: 시 도#');
    setSolfege('movable');
    T.check(labels()[0] === '라', '다시 이동도');
    T.$('viewer-close').click();
    choose('example-twinkle');
  });

  T.test('61-2 악보가 없으면 [보기] 꺼짐', async (T) => {
    T.setMode('score');
    T.check(!T.$('btn-view-score').disabled, '음이 있는 악보: 켜짐');
    // 쉼표만 있는 악보는 저장 형식에서 막혀 생기지 않음 (확장 5): 음이 없는 악보 = 악보가 없을 때.
    const restOnly = Notation.build({ id: 'x', title: '쉼표만', time: [4, 4], key: { fifths: 0, mode: 'major' }, clef: 'treble', tempo: 80, music: 'r:w' });
    T.check(scores.save({ ...restOnly, id: undefined }) === null, '쉼표만 있는 악보는 저장되지 않음');
    const backup = scores.list().map((s) => scores.get(s.id));
    for (const s of backup) scores.remove(s.id);
    scoreId = null;
    renderScorePicker();
    T.check(T.$('btn-view-score').disabled, '악보가 없으면 [보기] 꺼짐');
    T.$('btn-view-score').click();
    T.check(T.$('viewer').hidden, '눌러도 열리지 않음');
    for (const s of backup) scores.save(s);
    scoreId = backup[0].id;
    renderScorePicker();
    choose('example-twinkle');
  });

  T.test('61-2 화면 폭: 패널 첫 줄 한 줄, 넘침 없음', async (T) => {
    T.setMode('score');
    const row = document.querySelector('.score-row');
    const items = [T.$('score-select'), T.$('btn-new-score'), T.$('btn-edit-score'), T.$('btn-view-score')].map((e) => e.getBoundingClientRect());
    T.check(items.every((r) => Math.abs(r.top - items[0].top) < 2) && items.every((r) => r.right <= row.getBoundingClientRect().right + 0.5),
      `[고르기 | 새 악보 | 편집 | 보기]가 한 줄 (고르기 상자 ${Math.round(items[0].width)}px)`);
    T.check(items[0].width >= 80, '고르기 상자가 너무 좁지 않음(80px 이상)');
    const tops = ['melody', 'harmony', 'rhythm', 'score'].map((m) => {
      T.setMode(m);
      return writeTop();
    });
    T.check(tops.every((t) => t === tops[0]), `받아 적기 위치 그대로 (${[...new Set(tops)]})`);
    for (const id of ['example-fur-elise', 'example-rhythm-etude', 'example-mountain-king']) {
      choose(id);
      T.$('btn-view-score').click();
      T.check(viewing() && T.noHorizontalOverflow(), `${id}: 보기 화면이 가로로 넘치지 않음`);
      T.$('viewer-close').click();
    }
    localStorage.removeItem(Scores.STORAGE_KEY);
    localStorage.removeItem(Settings.SECTIONS_KEY);
    choose(scores.list()[0].id);
    T.setMode('melody');
    clearInterval(ticker);
  });
}
