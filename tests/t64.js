// 64단계 — 확장 10 완성 기준 점검 (PRD #10 확장 10). Run with smoke.js.
{
  const ticker = setInterval(() => {}, 10); // file reads run off the page's thread (pitfalls.md)
  const writeTop = () => Math.round(T.$('staff-title').getBoundingClientRect().top);
  const choose = (id) => {
    T.$('score-select').value = id;
    T.$('score-select').dispatchEvent(new Event('change'));
  };
  const viewLabels = () => [...T.$('viewer-sheet').querySelectorAll('.sv-solfege')];
  const setSolfege = (value) => {
    T.$('btn-settings').click();
    const input = document.querySelector(`#settings input[name="solfege"][value="${value}"]`);
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    T.$('btn-settings').click();
  };

  T.test('64-1 네 모드·연습·편집기·불러오기 유지', async (T) => {
    const tops = [];
    for (const m of ['melody', 'harmony', 'rhythm', 'score']) {
      T.setMode(m);
      tops.push(writeTop());
      if (m === 'rhythm') {
        await T.listen();
        if (level === 'hard') T.setTime(current.time);
        T.enterRhythm(current.measures.flat());
      } else {
        await T.listen();
        T.enterNotes(current);
      }
      T.submit();
      T.check(T.resultText().includes('모두 정답'), `${m} 한 사이클`);
      T.next();
    }
    T.check(tops.every((t) => t === tops[0]), `받아 적기 위치가 같음 (${[...new Set(tops)]})`);
    T.$('btn-view-score').click();
    T.$('btn-edit-score').click();
    T.check(!T.$('editor').hidden && T.$('viewer').hidden, '보기에서 [편집] → 편집기');
    T.$('editor-cancel').click();
  });

  T.test('64-2 [보기]: 예시·불러온 악보의 계이름, ⚙로 바로 바뀜', async (T) => {
    T.setMode('score');
    const cases = [
      ['example-twinkle', '도 도 솔 솔 라 라 솔', 'movable'],
      ['example-fur-elise', '미 레# 미 레# 미 시 레 도', 'movable'],
      ['example-mountain-king', '라 시 도 레 미 도 미 레#', 'movable'],
    ];
    for (const [id, start] of cases) {
      choose(id);
      T.$('btn-view-score').click();
      const texts = viewLabels().map((l) => l.textContent);
      T.check(texts.slice(0, start.split(' ').length).join(' ') === start, `${id}: ${texts.slice(0, 8).join(' ')}`);
      T.$('viewer-close').click();
    }
    // 연습곡: 붙임줄 뒤 음 없음, 사장조로 조바뀜.
    choose('example-rhythm-etude');
    T.$('btn-view-score').click();
    const m = (i) => viewLabels().filter((l) => l.dataset.measure === String(i)).map((l) => l.textContent).join(' ');
    T.check(m(0) === '도 미 솔' && m(4) === '도 시 라 솔', `조바뀜·붙임줄 (${m(0)} / ${m(4)})`);
    setSolfege('fixed');
    T.check(m(4) === '솔 파# 미 레', `⚙ 고정도로 바로 바뀜 (${m(4)})`);
    setSolfege('movable');
    T.$('viewer-close').click();
    // 불러온 악보: 화음 세로, 꾸밈음 작게, 쉼표 없음.
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"><work><work-title>화음 보기</work-title></work>'
      + '<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">'
      + '<measure number="1"><attributes><divisions>2</divisions><key><fifths>-1</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>'
      + '<note><pitch><step>F</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>'
      + '<note><chord/><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>'
      + '<note><chord/><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>'
      + '<note><grace/><pitch><step>E</step><octave>5</octave></pitch><voice>1</voice><type>eighth</type></note>'
      + '<note><pitch><step>F</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>'
      + '<note><rest/><duration>2</duration><voice>1</voice><type>quarter</type></note>'
      + '<note><pitch><step>B</step><alter>-1</alter><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>'
      + '</measure></part></score-partwise>';
    T.$('btn-new-score').click();
    await importFile(new File([xml], 'chords.musicxml'));
    T.$('btn-import').click();
    T.$('btn-view-score').click();
    const chord = viewLabels().filter((l) => l.dataset.index === '0').map((l) => l.textContent).join(' ');
    const grace = viewLabels().find((l) => l.classList.contains('is-grace'));
    T.check(chord === '솔 미 도', `바장조 화음 F-A-C: 위에서 아래로 C=솔 A=미 F=도 (${chord})`);
    T.check(grace?.textContent === '시', `꾸밈음 E5 작게 (${grace?.textContent})`);
    T.check(viewLabels().map((l) => l.textContent).slice(-1)[0] === '파' && viewLabels().length === 6, '쉼표에는 없음, B♭은 파');
    T.$('viewer-close').click();
    T.deleteScore();
    choose('example-twinkle');
  });

  T.test('64-3 인쇄: 인쇄 창과 인쇄용 모양 (자동 부분)', async (T) => {
    T.setMode('score');
    T.$('btn-view-score').click();
    const real = window.print;
    let called = 0;
    window.print = () => { called++; };
    T.$('viewer-print').click();
    window.print = real;
    window.dispatchEvent(new Event('beforeprint'));
    const rows = T.$('viewer-sheet').querySelectorAll('.sheet-row').length;
    window.dispatchEvent(new Event('afterprint'));
    T.check(called === 1 && rows === 3, `[인쇄] → 인쇄 창, 쪽 너비로 한 줄 4마디 (${rows}줄)`);
    T.$('viewer-close').click();
  });

  T.test('64-4 결과의 정답 구간에 계이름·색, 연습 중에는 없음', async (T) => {
    T.setMode('score');
    choose('example-twinkle');
    T.check(!document.querySelector('#score-strip .sv-solfege, #score-input .sv-solfege'), '연습 중 계이름 없음');
    await T.listen();
    T.enterNotes(current.map((p, i) => (i === 0 ? { ...p, alter: 1 } : p)));
    T.submit();
    const labels = [...T.$('result-area').querySelectorAll('.answer-sheet .sv-solfege')];
    T.check(labels.length === current.length && labels[0].classList.contains('is-wrong') && labels.slice(1).every((l) => l.classList.contains('is-correct')),
      '결과: 계이름마다 정답/오답 색 (첫 음 오답)');
    T.next();
  });

  T.test('64-5 화면 폭', async (T) => {
    const top = writeTop();
    T.setMode('score');
    for (const id of ['example-twinkle', 'example-fur-elise', 'example-rhythm-etude']) {
      choose(id);
      T.$('btn-view-score').click();
      T.check(T.noHorizontalOverflow(), `${id}: 보기 화면 가로 넘침 없음`);
      T.$('viewer-close').click();
      T.check(writeTop() === top, `${id}: 닫으면 받아 적기 위치 그대로`);
    }
    const row = document.querySelector('.score-row').getBoundingClientRect();
    T.check(T.$('btn-view-score').getBoundingClientRect().right <= row.right + 0.5, '[보기]가 패널 첫 줄 안');
    localStorage.removeItem(Scores.STORAGE_KEY);
    localStorage.removeItem(Settings.SECTIONS_KEY);
    localStorage.removeItem(Settings.STORAGE_KEY);
    choose(scores.list()[0].id);
    T.setMode('melody');
    clearInterval(ticker);
  });
}
