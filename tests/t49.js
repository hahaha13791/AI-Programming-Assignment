// 49단계 — 확장 7 완성 기준 점검 (PRD #10 확장 7). Run with smoke.js.
{
  const N = Notation;
  const ticker = setInterval(() => {}, 10); // file reads run off the page's thread (pitfalls.md)
  const key = (k, extra = {}) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...extra }));
  const at = (measure, note = 0, head = 0) => {
    scoreEditor.state.select(measure, note, head);
    scoreEditor.render();
  };
  const tab = (name) => T.$(`editor-tab-${name}`).click();
  const writeTop = () => T.$('staff-title').getBoundingClientRect().top;
  const clean = () => {
    localStorage.removeItem(Scores.STORAGE_KEY);
    localStorage.removeItem(Settings.SECTIONS_KEY);
    localStorage.removeItem(Settings.LINES_KEY);
    T.$('score-select').value = scores.list()[0].id;
    T.$('score-select').dispatchEvent(new Event('change'));
  };

  T.test('49-1 네 모드·예시 악보·불러오기·연습 유지', async (T) => {
    const tops = ['melody', 'harmony', 'rhythm', 'score'].map((m) => {
      T.setMode(m);
      return Math.round(writeTop());
    });
    T.check(tops.every((t) => t === tops[0]), `네 모드의 받아 적기 위치가 같음 (${tops})`);
    T.setMode('melody');
    await T.listen();
    T.enterNotes(current);
    T.submit();
    T.check(T.resultText().includes('모두 정답'), '멜로디 모드 한 사이클');
    T.setMode('score');
    T.$('score-select').value = 'example-fur-elise';
    T.$('score-select').dispatchEvent(new Event('change'));
    await T.listen();
    T.enterNotes(current);
    T.submit();
    T.check(T.resultText().includes('모두 정답'), '예시 악보(엘리제를 위하여) 한 사이클');
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"><work><work-title>불러온 곡</work-title></work>'
      + '<part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list><part id="P1">'
      + '<measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>'
      + ['C', 'D', 'E', 'F'].map((s) => `<note><pitch><step>${s}</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>`).join('')
      + '</measure></part></score-partwise>';
    T.$('btn-new-score').click();
    await importFile(new File([xml], 'import.musicxml'));
    T.$('btn-import').click();
    T.check(scores.get(scoreId)?.title === '불러온 곡', 'MusicXML 불러오기');
    await T.listen();
    T.enterNotes(current);
    T.submit();
    T.check(T.resultText().includes('모두 정답'), '불러온 악보 한 사이클');
    T.deleteScore();
    clean();
    T.setMode('melody');
  });

  T.test('49-2 새 악보에 모든 표기를 넣고 연습 화면에서', async (T) => {
    T.setMode('score');
    T.$('btn-new-score').click();
    T.$('btn-make-score').click();
    // 마디: D major, 3/4, ♩=100, a one-beat pickup.
    tab('measure');
    T.$('editor-key').value = '2';
    T.$('editor-key-apply').click();
    T.$('editor-time-beats').value = '3';
    T.$('editor-time-apply').click();
    T.$('editor-tempo').value = '100';
    T.$('editor-tempo-measure').click();
    T.$('editor-pickup').value = '1/4';
    T.$('editor-pickup-apply').click();
    tab('notes');
    // Measure 1 (the pickup): A4. Measure 2: dotted quarter, eighth, 16ths, 32nd, 64ths, a 16th rest.
    at(0, 0);
    for (const k of ['5', 'a', '.', 'd', '4', 'e', '3', 'f', 'g', '2', 'a', '1', 'b', 'b', '3', '0']) key(k);
    // Measure 3: a half tied to a quarter. Measure 4: a half and an eighth-note triplet.
    for (const k of ['6', 'c', '5', 'c']) key(k);
    at(2, 0);
    key('+');
    at(3, 0);
    for (const k of ['6', 'c', '4']) key(k);
    key('3', { altKey: true });
    for (const k of ['d', 'e', 'f']) key(k);
    // A chord and a grace note on the half of measure 3.
    at(2, 0);
    key('E', { shiftKey: true });
    key('G', { shiftKey: true });
    T.$('editor-grace').click();
    T.editorPad(7);
    T.$('editor-grace').click();
    // A bass clef and a new tempo from the triplet on.
    const tripletAt = scoreEditor.state.score.measures[3].notes.findIndex((n) => n.tuplet);
    tab('measure');
    at(3, tripletAt);
    T.$('editor-clef').value = 'bass';
    T.$('editor-clef-note').click();
    T.$('editor-tempo').value = '80';
    T.$('editor-tempo-note').click();
    // 기호: |: … 1. :| 2. ||, segno, D.S. al Fine.
    tab('signs');
    at(1);
    T.$('editor-repeat-start').click();
    T.$('editor-segno').click();
    at(2);
    T.$('editor-ending-text').value = '1.';
    T.$('editor-ending-count').value = '1';
    T.$('editor-ending-closed').checked = true;
    T.$('editor-ending-apply').click();
    T.$('editor-repeat-end').click();
    at(3);
    T.$('editor-ending-text').value = '2.';
    T.$('editor-ending-closed').checked = false;
    T.$('editor-ending-apply').click();
    T.$('editor-words').value = 'D.S. al Fine';
    T.$('editor-words-apply').click();
    T.$('editor-barline').value = 'final';
    T.$('editor-barline-apply').click();

    const s = scoreEditor.state.score;
    const all = s.measures.flatMap((m) => m.notes);
    const has = {
      조표: s.measures[0].key?.fifths === 2,
      박자: String(s.measures[0].time) === '3,4',
      빠르기: s.measures[0].tempo === 100,
      못갖춘마디: s.pickup,
      '모든 길이': ['quarter', 'eighth', '16th', '32nd', '64th', 'half'].every((t) => all.some((n) => n.type === t)),
      점: all.some((n) => n.dots === 1),
      쉼표: all.some((n) => n.rest),
      붙임줄: all.some((n) => n.tie === 'start'),
      잇단음표: all.some((n) => n.tuplet?.actual === 3),
      '마디 중간 음자리표·빠르기': s.measures[3].notes[tripletAt].clef === 'bass' && s.measures[3].notes[tripletAt].tempo === 80,
      화음: all.some((n) => n.chord?.length === 2),
      꾸밈음: all.some((n) => n.grace),
      도돌이표: s.measures[1].repeatStart && s.measures[2].repeatEnd,
      괄호: s.measures[2].ending?.text === '1.' && s.measures[3].ending?.text === '2.',
      기호: s.measures[1].marks?.some((m) => m.kind === 'segno') && s.measures[3].marks?.some((m) => m.text === 'D.S. al Fine'),
      끝세로줄: s.measures[3].barline === 'final',
    };
    const missing = Object.entries(has).filter(([, ok]) => !ok).map(([k]) => k);
    T.check(!missing.length, `편집기로 모든 표기를 넣음 (빠진 것: ${missing.join(', ') || '없음'})`);
    T.check(N.isValid({ ...s, id: 'x', title: 'x' }), '검증 통과');

    T.$('editor-title').value = '모든 표기';
    T.$('editor-title').dispatchEvent(new Event('input'));
    T.$('editor-save').click();
    const saved = scores.get(scoreId);
    T.check(saved?.title === '모든 표기' && N.isValid(saved) && Scores.open().get(saved.id), '저장, 다시 읽어도 남음');
    const strip = T.$('score-strip').querySelector('svg');
    const drawn = {
      조표: strip.querySelectorAll('.sv-key').length >= 2, 화음: strip.querySelector('.sv-note[data-chord="3"]'), 꾸밈음: strip.querySelector('.sv-note.is-grace'),
      셋잇단: strip.querySelector('.sv-tuplet'), 붙임줄: strip.querySelector('.sv-tie'), 도돌이표: strip.querySelectorAll('.sv-barline[data-kind="repeat"]').length === 2,
      괄호: strip.querySelectorAll('.sv-ending').length === 2, 세뇨: strip.querySelector('.sv-segno'), 낮은음자리표: strip.querySelector('.sv-clef-group[data-clef="bass"]'),
    };
    const notDrawn = Object.entries(drawn).filter(([, ok]) => !ok).map(([k]) => k);
    T.check(!notDrawn.length, `연습 화면 악보 띠에 그대로 그려짐 (빠진 것: ${notDrawn.join(', ') || '없음'})`);
    const events = Playback.schedule(saved, { start: 0, end: saved.measures.length - 1, tonic: false }).events;
    T.check(events.length > 15 && events.some((e) => e.grace) && events[0].midi === 69, `원래 조·빠르기로 재생 예약 (${events.length}개, 첫 음 A4)`);
    T.deleteScore();
    clean();
    T.setMode('melody');
  });

  T.test('49-3 예시·불러온 악보를 고쳐 저장하고 연습', async (T) => {
    T.setMode('score');
    T.$('score-select').value = 'example-twinkle';
    T.$('score-select').dispatchEvent(new Event('change'));
    T.$('btn-edit-score').click();
    at(4, 1); // measure 5's second note
    const before = scoreEditor.state.score.measures[4].notes.map((n) => N.duration(n));
    key('ArrowUp');
    T.$('editor-tool-notes').querySelector('[data-type="half"]').click();
    T.$('editor-apply-length').click();
    const after = scoreEditor.state.score.measures[4];
    T.check(N.cmp(N.filled(after.notes), N.frac(1)) === 0 && after.notes[1].type === 'half' && after.notes[1].pitch.alter === 1, '가운데 음을 골라 반음 올리고 2분음표로: 마디 박 유지');
    key('z', { ctrlKey: true });
    T.check(scoreEditor.state.score.measures[4].notes[1].type === 'quarter', '되돌리기');
    key('y', { ctrlKey: true });
    const play = T.$('editor-play');
    const original = Sound.playEvents;
    let played = null;
    Sound.playEvents = (events) => {
      played = events;
      return 0.1;
    };
    play.click();
    Sound.playEvents = original;
    play.click();
    T.check(played && played.length > 0, '[듣기]');
    T.$('editor-save').click();
    const saved = Scores.open().get('example-twinkle');
    T.check(saved.measures[4].notes[1].type === 'half' && saved.measures[4].notes[1].pitch.alter === 1, '저장 후 새로 읽은 저장소에 남음');
    T.$('length-chips').querySelector('[data-length="1"]').click();
    T.$('score-strip').querySelector('.sv-hit[data-measure="4"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await T.listen();
    T.enterNotes(current);
    T.submit();
    T.check(T.resultText().includes('모두 정답'), `고친 악보로 한 사이클 (${section?.label})`);
    clean();
    // An imported score with chords: change a chord's lower pitch.
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"><work><work-title>화음 곡</work-title></work>'
      + '<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">'
      + '<measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>2</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>'
      + '<note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>'
      + '<note><chord/><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>'
      + '<note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note></measure></part></score-partwise>';
    T.$('btn-new-score').click();
    await importFile(new File([xml], 'chord.musicxml'));
    T.$('btn-import').click();
    const id = scoreId;
    T.$('btn-edit-score').click();
    at(0, 0, 1);
    key('ArrowDown');
    T.$('editor-save').click();
    T.check(N.pitchesOf(Scores.open().get(id).measures[0].notes[0]).map((p) => `${p.pitch.step}${p.pitch.alter}`).join() === 'E0,C-1', '불러온 화음의 아래 음만 반음 내려 저장');
    await T.listen();
    T.enterNotes(current);
    T.submit();
    T.check(T.resultText().includes('모두 정답'), '그 악보로 한 사이클');
    T.deleteScore();
    clean();
    T.setMode('melody');
  });

  T.test('49-4 키보드만으로', async (T) => {
    T.setMode('score');
    T.$('btn-new-score').click();
    T.$('btn-make-score').click();
    for (const k of ['5', 'c', 'd', 'e', 'f', 'g', 'a', 'b', 'c']) key(k);
    key('ArrowLeft', { ctrlKey: true });
    key('ArrowLeft', { ctrlKey: true });
    key('ArrowRight');
    key('ArrowUp');
    key('ArrowUp', { ctrlKey: true });
    key('ArrowRight');
    key('Delete');
    const m = scoreEditor.state.score.measures[0].notes;
    T.check(m[1].pitch.alter === 1 && m[1].pitch.octave === 6 && m[2].rest, `넣기·이동·반음·옥타브·지우기 (${m.map((n) => (n.rest ? 'r' : `${n.pitch.step}${n.pitch.alter}/${n.pitch.octave}`)).join(' ')})`);
    key('z', { ctrlKey: true });
    T.check(!scoreEditor.state.score.measures[0].notes[2].rest, 'Ctrl+Z');
    T.$('editor-cancel').click();
    T.setMode('melody');
  });

  T.test('49-5 배치', async (T) => {
    T.setMode('score');
    const top = writeTop();
    T.$('btn-edit-score').click();
    const height = () => T.$('editor').getBoundingClientRect().height;
    const h0 = height();
    const hs = ['measure', 'signs', 'notes'].map((name) => {
      tab(name);
      const panel = T.$(`editor-tool-${name}`);
      const inside = [...panel.querySelectorAll('button, select, input')].every((el) => el.getBoundingClientRect().right <= panel.getBoundingClientRect().right + 0.5);
      T.check(inside, `[${name}] 도구가 넘치지 않음`);
      return height();
    });
    T.check(hs.every((h) => Math.abs(h - h0) < 0.5) && T.noHorizontalOverflow(), `도구 탭을 바꿔도 편집 화면 높이 그대로, 가로 넘침 없음 (${Math.round(h0)}px)`);
    T.$('editor-cancel').click();
    T.check(Math.abs(writeTop() - top) < 0.5, '편집을 닫으면 받아 적기 위치 그대로');
    const tops = ['melody', 'harmony', 'rhythm', 'score'].map((m) => {
      T.setMode(m);
      return Math.round(writeTop());
    });
    T.check(tops.every((t) => t === tops[0]), '모드를 바꿔도 받아 적기 위치가 움직이지 않음');
    T.setMode('melody');
    clearInterval(ticker);
  });
}
