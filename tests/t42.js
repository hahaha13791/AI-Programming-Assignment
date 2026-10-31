// 42단계 — 편집 화면 뼈대와 커서. Run with smoke.js.
{
  const N = Notation;
  const q = (step, octave = 4, extra = {}) => ({ type: 'quarter', dots: 0, pitch: { step, alter: 0, octave }, ...extra });
  const where = (e) => `${e.cursor.measure}:${e.cursor.note}`;

  T.test('42-2 커서·되돌리기·저장 조건 (editing.js)', async (T) => {
    const e = Editing.create(N.build({ id: 's', title: '두 마디', key: { fifths: 0, mode: 'major' }, tempo: 80, clef: 'treble', time: [4, 4], music: 'C4:q D4:q E4:h | F4:w' }));
    T.check(where(e) === '0:0', '처음 커서는 첫 음');
    e.move(1);
    e.move(1);
    const inMeasure = where(e);
    e.move(1);
    T.check(inMeasure === '0:2' && where(e) === '1:0', `음 → 다음 음 → 다음 마디 첫 음 (${inMeasure} → ${where(e)})`);
    e.move(1);
    T.check(where(e) === '1:0', '끝에서 멈춤');
    e.moveMeasure(-1);
    e.move(-1);
    T.check(where(e) === '0:0', 'Ctrl+←(마디)와 ←, 처음에서 멈춤');

    // Undo / redo in order.
    const pitchOf = () => e.score.measures[0].notes[0].pitch.step;
    e.change((s) => { s.measures[0].notes[0].pitch.step = 'G'; });
    e.change((s) => { s.measures[0].notes[0].pitch.step = 'A'; });
    T.check(pitchOf() === 'A' && e.canUndo() && !e.canRedo(), '바꾸면 되돌릴 수 있음');
    e.undo();
    T.check(pitchOf() === 'G', '되돌리기 한 번 → 바로 앞');
    e.undo();
    T.check(pitchOf() === 'C' && !e.canUndo() && e.canRedo(), '되돌리기 두 번 → 처음, 더 없음');
    e.redo();
    e.redo();
    T.check(pitchOf() === 'A' && !e.canRedo(), '다시 하기 두 번 → 마지막');
    e.undo();
    e.change((s) => { s.measures[0].notes[0].pitch.step = 'B'; });
    T.check(!e.canRedo(), '되돌린 뒤 새로 바꾸면 다시 하기가 사라짐');
    T.check(e.change(() => false) === false && pitchOf() === 'B', '바꾸지 않은 동작은 기록에 남지 않음');
    for (let k = 0; k < Editing.HISTORY + 20; k++) e.change((s) => { s.measures[0].notes[0].pitch.octave = 3 + (k % 3); });
    let undone = 0;
    while (e.undo()) undone++;
    T.check(undone === Editing.HISTORY, `기록은 ${Editing.HISTORY}번까지, 오래된 것부터 버림 (${undone})`);

    // A new score.
    const blank = Editing.create(null);
    const m = blank.score.measures[0];
    T.check(String(m.time) === '4,4' && m.key.fifths === 0 && m.clef === 'treble' && m.tempo === 120 && m.notes.length === 1 && m.notes[0].rest && m.notes[0].type === 'whole',
      '새 악보: 4/4·다장조·높은음자리표·♩=120·온쉼표 한 마디');
    blank.setTitle('제목');
    T.check(!blank.canSave(), '새 악보는 쉼표뿐이라 저장할 수 없음');
    blank.change((s) => { s.measures[0].notes = [{ type: 'whole', dots: 0, pitch: { step: 'C', alter: 0, octave: 5 } }]; });
    T.check(blank.canSave(), '음이 하나 있으면 저장할 수 있음');
    blank.setTitle('   ');
    T.check(!blank.canSave(), '제목이 공백뿐이면 저장할 수 없음');
    blank.setTitle('x'.repeat(150));
    T.check(blank.title.length === N.MAX_TITLE, `제목은 ${N.MAX_TITLE}자까지`);
  });

  // ---- the screen ----
  const XML = '<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"><work><work-title>편집기 시험</work-title></work>'
    + '<part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list><part id="P1">'
    + '<measure number="1"><barline location="left"><repeat direction="forward"/></barline><attributes><divisions>2</divisions><key><fifths>1</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>'
    + '<note><grace slash="yes"/><pitch><step>A</step><octave>4</octave></pitch><voice>1</voice><type>eighth</type></note>'
    + '<note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>half</type></note>'
    + '<note><chord/><pitch><step>B</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>half</type></note>'
    + '<note><pitch><step>D</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>half</type></note>'
    + '<barline location="right"><repeat direction="backward"/></barline></measure>'
    + '<measure number="2"><note><pitch><step>G</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><type>whole</type></note></measure>'
    + '</part></score-partwise>';
  const pick = (measure, index) => T.$('editor-view').querySelector(`.sv-measure[data-measure="${measure}"] .sv-note[data-index="${index}"]`);

  T.test('42-4 편집 화면', async (T) => {
    T.setMode('score');
    const writeTop = T.$('staff-title').getBoundingClientRect().top;
    T.$('btn-new-score').click();
    await importFile(new File([XML], 'edit.musicxml'));
    T.$('btn-import').click();
    const id = scoreId;
    const before = JSON.stringify(scores.get(id));
    T.check(T.$('btn-edit-score').dataset.action === 'edit' && !T.$('btn-edit-score').disabled && T.$('btn-edit-score').textContent === '편집', '불러온 악보(화음·꾸밈음·도돌이표)도 [편집]');

    T.$('btn-edit-score').click();
    const view = T.$('editor-view');
    T.check(!T.$('editor').hidden && T.$('editor-title').value === '편집기 시험', '편집 화면이 그 악보로 열림');
    T.check(view.querySelector('.sv-note.is-grace') && view.querySelector('.sv-note[data-chord="2"]') && view.querySelectorAll('.sv-barline[data-kind="repeat"]').length === 2
      && view.querySelectorAll('.sv-key').length === 1, '원곡 그대로 그려짐 (꾸밈음·화음·도돌이표·조표)');
    T.check(view.querySelector('.sv-note.is-cursor')?.dataset.index === '0' && T.$('editor-status').textContent.startsWith('1마디 1번째'), `처음 커서는 첫 음 (${T.$('editor-status').textContent})`);

    // Pressing a note, a chord's upper head, and the space a note takes.
    pick(0, 2).querySelector('.sv-head').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    T.check(pick(0, 2).classList.contains('is-cursor') && scoreEditor.state.cursor.note === 2, '음을 누르면 그 음이 커서');
    const upper = pick(0, 1).querySelector('.sv-head[data-head="1"]');
    upper.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    T.check(scoreEditor.state.cursor.head === 1 && pick(0, 1).querySelector('.sv-head.is-cursor-head[data-head="1"]') && T.$('editor-status').textContent.includes('[B4]'),
      `화음의 위 음머리를 누르면 그 음까지 고름 (${T.$('editor-status').textContent})`);
    view.querySelector('.sv-pick[data-measure="1"][data-index="0"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    T.check(scoreEditor.state.cursor.measure === 1 && pick(1, 0).classList.contains('is-cursor'), '음 자리(빈 곳)를 눌러도 그 음이 커서');

    // Keyboard: ← → and Ctrl+←, not while typing the title.
    const key = (k, extra = {}, target = document.body) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...extra }));
    key('ArrowLeft');
    T.check(scoreEditor.state.cursor.measure === 0 && scoreEditor.state.cursor.note === 2, '←: 앞 음');
    key('ArrowLeft', { ctrlKey: true });
    T.check(scoreEditor.state.cursor.measure === 0 && scoreEditor.state.cursor.note === 0, 'Ctrl+←: 마디 첫 음');
    key('ArrowRight', {}, T.$('editor-title'));
    T.check(scoreEditor.state.cursor.note === 0, '제목 입력칸에서는 화살표가 커서를 옮기지 않음');

    // Undo / redo buttons.
    T.check(T.$('editor-undo').disabled && T.$('editor-redo').disabled, '처음에는 되돌릴 것이 없음');
    scoreEditor.apply((s) => { s.measures[1].notes[0].pitch.step = 'A'; });
    T.check(!T.$('editor-undo').disabled, '바꾸면 [되돌리기]가 켜짐');
    key('z', { ctrlKey: true });
    T.check(scoreEditor.state.score.measures[1].notes[0].pitch.step === 'G' && !T.$('editor-redo').disabled, 'Ctrl+Z로 되돌림');
    T.$('editor-redo').click();
    T.check(scoreEditor.state.score.measures[1].notes[0].pitch.step === 'A', '[다시 하기]');
    T.$('editor-undo').click();

    // Tabs keep the height.
    const height = () => T.$('editor').getBoundingClientRect().height;
    const h0 = height();
    const heights = ['measure', 'signs', 'notes'].map((tab) => {
      T.$(`editor-tab-${tab}`).click();
      return height();
    });
    T.check(heights.every((h) => Math.abs(h - h0) < 0.5) && !T.$('editor-tool-notes').hidden && T.$('editor-tool-signs').hidden,
      `도구 탭을 바꿔도 편집 화면 높이 그대로 (${[h0, ...heights].map(Math.round)})`);
    T.check(T.noHorizontalOverflow(), '편집 화면 가로 넘침 없음');

    // Save unchanged: the same stored score. Then the title.
    T.$('editor-save').click();
    T.check(T.$('editor').hidden && JSON.stringify(scores.get(id)) === before && scoreId === id, '고치지 않고 저장하면 저장값이 같고 그 악보가 선택됨');
    T.$('btn-edit-score').click();
    T.$('editor-title').value = '고친 제목';
    T.$('editor-title').dispatchEvent(new Event('input'));
    T.$('editor-cancel').click();
    T.check(scores.get(id).title === '편집기 시험', '취소하면 바뀌지 않음');
    T.$('btn-edit-score').click();
    T.$('editor-title').value = '고친 제목';
    T.$('editor-title').dispatchEvent(new Event('input'));
    T.$('editor-save').click();
    T.check(scores.get(id).title === '고친 제목' && Scores.open().get(id).title === '고친 제목' && T.$('score-select').selectedOptions[0].textContent.includes('고친 제목'),
      '제목을 고쳐 저장하면 연습 화면으로 돌아와 그 악보가 선택됨');
    T.check(Math.abs(T.$('staff-title').getBoundingClientRect().top - writeTop) < 0.5 && T.noHorizontalOverflow(), '편집을 닫은 뒤 받아 적기 영역 위치 그대로');

    // Every example opens; a new score.
    for (const example of EXAMPLE_SCORES) {
      T.$('score-select').value = example.id;
      T.$('score-select').dispatchEvent(new Event('change'));
      T.$('btn-edit-score').click();
      const ok = !T.$('editor').hidden && T.$('editor-title').value === example.title && T.$('editor-view').querySelector('.sv-note.is-cursor');
      T.$('editor-cancel').click();
      T.check(ok, `예시 "${example.title}"도 편집 화면으로 열림`);
    }
    T.$('btn-new-score').click();
    T.$('btn-make-score').click();
    T.check(!T.$('editor').hidden && T.$('editor-title').value === '' && T.$('editor-save').disabled && T.$('editor-delete').hidden
      && T.$('editor-view').querySelector('.sv-note[data-rest][data-type="whole"].is-cursor'), '새 악보: 온쉼표 한 마디, 저장 꺼짐, [삭제] 없음');
    T.$('editor-cancel').click();

    T.$('score-select').value = id;
    T.$('score-select').dispatchEvent(new Event('change'));
    T.deleteScore();
    T.check(!scores.get(id), '편집 화면의 [삭제] 두 번으로 지움');
    localStorage.removeItem(Scores.STORAGE_KEY);
    localStorage.removeItem(Settings.SECTIONS_KEY);
    T.$('score-select').value = scores.list()[0].id;
    T.$('score-select').dispatchEvent(new Event('change'));
    T.setMode('melody');
  });
}

// 개선-8·9: no saving under another score's title.
T.test('개선-9 같은 제목으로는 저장하지 않음', async (T) => {
  T.setMode('score');
  const typeTitle = (text) => {
    T.$('editor-title').value = text;
    T.$('editor-title').dispatchEvent(new Event('input'));
  };
  const note = () => T.$('editor-title-note').textContent;
  const toolsTop = () => T.$('editor-tabs').getBoundingClientRect().top;
  T.$('btn-new-score').click();
  T.$('btn-make-score').click();
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
  typeTitle('새 곡');
  const top = toolsTop();
  T.check(!T.$('editor-save').disabled && note() === '', '겹치지 않는 제목은 저장할 수 있음');
  for (const taken of ['반짝반짝 작은 별', '  반짝반짝   작은 별 ', '엘리제를 위하여 (베토벤)'.toUpperCase()]) {
    typeTitle(taken);
    T.check(T.$('editor-save').disabled && note().includes('같은 제목'), `"${taken}": 예시와 같은 제목이면 [저장]이 꺼지고 안내 (공백·대소문자 무시)`);
  }
  T.check(Math.abs(toolsTop() - top) < 0.5 && T.noHorizontalOverflow(), '안내가 떠도 도구 칸 위치가 그대로, 가로 넘침 없음');
  T.$('editor-save').click();
  T.check(!T.$('editor').hidden, '꺼진 [저장]을 눌러도 저장되지 않음');
  typeTitle('반짝반짝 작은 별 2');
  T.check(!T.$('editor-save').disabled && note() === '', '제목을 바꾸면 안내가 사라짐');
  T.$('editor-save').click();
  const id = scoreId;
  T.check(T.$('editor').hidden && scores.get(id)?.title === '반짝반짝 작은 별 2', '저장됨');
  // Its own title is no clash.
  T.$('score-select').value = 'example-twinkle';
  T.$('score-select').dispatchEvent(new Event('change'));
  T.$('btn-edit-score').click();
  T.check(!T.$('editor-save').disabled && note() === '', '이미 있는 악보는 자기 제목 그대로 저장할 수 있음');
  typeTitle('반짝반짝 작은 별 2');
  T.check(T.$('editor-save').disabled, '다른 악보(방금 만든 것)의 제목으로 바꾸면 안 됨');
  typeTitle('반짝반짝 작은 별');
  T.$('editor-save').click();
  T.check(T.$('editor').hidden, '원래 제목으로 저장');
  T.$('score-select').value = id;
  T.$('score-select').dispatchEvent(new Event('change'));
  T.deleteScore();
  localStorage.removeItem(Scores.STORAGE_KEY);
  localStorage.removeItem(Settings.SECTIONS_KEY);
  T.$('score-select').value = scores.list()[0].id;
  T.$('score-select').dispatchEvent(new Event('change'));
  T.setMode('melody');
});
