// 43단계 — 음 넣기와 고치기. Run with smoke.js.
{
  const N = Notation;
  const BASE = { id: 's', title: '시험', key: { fifths: 0, mode: 'major' }, tempo: 80, clef: 'treble', time: [4, 4] };
  const build = (music, extra = {}) => N.build({ ...BASE, ...extra, music });
  const txt = (notes) => notes.map((n) => `${n.rest ? 'r' : `${n.pitch.step}${['bb', 'b', '', '#', 'x'][n.pitch.alter + 2]}${n.pitch.octave}`}:${n.type}${'.'.repeat(n.dots ?? 0)}${n.tuplet ? `/${n.tuplet.actual}` : ''}`).join(' ');
  const valid = (e) => N.isValid({ ...e.score, id: 'x', title: 'x' });
  const p = (step, octave = 4, alter = 0) => ({ step, alter, octave });

  T.test('43-2 덮어쓰기·쉼표 채우기 (editing.js)', async (T) => {
    const e = Editing.create(build('C4:q D4:q E4:q F4:q | G4:w'));
    e.setLength('half');
    T.check(txt(e.score.measures[0].notes) === 'C4:half E4:quarter F4:quarter' && txt(e.score.measures[1].notes) === 'G4:whole' && valid(e),
      `4분음표를 2분음표로: 뒤 4분음표를 덮음, 다른 마디는 그대로 (${txt(e.score.measures[0].notes)})`);
    e.setLength('quarter');
    T.check(txt(e.score.measures[0].notes) === 'C4:quarter r:quarter E4:quarter F4:quarter' && valid(e), `2분음표를 4분음표로: 4분쉼표가 생김 (${txt(e.score.measures[0].notes)})`);

    // Partly covering a dotted note and a triplet group: the rest of the time is rests, the beats add up.
    const d = Editing.create(build('C4:q. D4:8 E4:h | 3[ C5:8 D5:8 E5:8 ] r:q r:h'));
    d.insert({ type: 'quarter', dots: 0, pitch: p('A') });
    T.check(txt(d.score.measures[0].notes) === 'A4:quarter r:eighth D4:eighth E4:half' && valid(d), `점4분음표 자리에 4분음표: 남은 8분은 쉼표 (${txt(d.score.measures[0].notes)})`);
    d.select(1, 0);
    d.insert({ type: 'eighth', dots: 0, pitch: p('B') });
    T.check(txt(d.score.measures[1].notes) === 'B4:eighth/3 D5:eighth/3 E5:eighth/3 r:quarter r:half' && valid(d),
      `셋잇단 안에서는 그 묶음의 음으로 (${txt(d.score.measures[1].notes)})`);
    d.select(1, 0);
    d.setLength('quarter');
    T.check(txt(d.score.measures[1].notes) === 'B4:quarter/3 E5:eighth/3 r:quarter r:half' && valid(d), `셋잇단 안에서 길게: 묶음 안의 뒤 음을 덮음 (${txt(d.score.measures[1].notes)})`);
    T.check(!d.fits('half'), '셋잇단 묶음보다 긴 길이는 고를 수 없음');
    d.select(0, 3);
    T.check(d.fits('half') && !d.fits('whole') && !d.fits('half', 1), '마디 끝을 넘는 길이는 고를 수 없음 (2분 O, 온·점2분 X)');
    const before = JSON.stringify(d.score);
    T.check(!d.insert({ type: 'whole', dots: 0, pitch: p('C') }) && JSON.stringify(d.score) === before, '넘치는 길이를 넣으려 하면 아무것도 바뀌지 않음');
    const g = Editing.create(build('r:q 3[ C5:8 D5:8 E5:8 ] r:h'));
    g.insert({ type: 'half', dots: 0, pitch: p('G') });
    T.check(txt(g.score.measures[0].notes) === 'G4:half r:half' && valid(g), `밖에서 셋잇단 묶음을 덮으면 묶음째 지움 (4분쉼표 + 셋잇단 = 2분음표 자리) (${txt(g.score.measures[0].notes)})`);

    // Writing on at the end makes a new measure in the same time.
    const w = Editing.create(build('C4:q D4:q E4:q', { time: [3, 4] }));
    w.select(0, 2);
    w.insert({ type: 'quarter', dots: 0, pitch: p('F') });
    T.check(w.score.measures.length === 2 && txt(w.score.measures[1].notes) === 'r:half r:quarter' && w.cursor.measure === 1 && w.cursor.note === 0,
      `마지막 마디 끝에서 넣으면 같은 박자(3/4)의 새 마디, 커서는 그 첫 자리 (${txt(w.score.measures[1].notes)})`);
    w.insert({ type: 'half', dots: 0, pitch: p('G') });
    T.check(w.result().measures.length === 2, '저장할 때 끝의 쉼표뿐인 마디는 빼지 않음 (음이 있으면 남김)');
    const trail = Editing.create(build('C4:q D4:q E4:q', { time: [3, 4] }));
    trail.select(0, 2);
    trail.insert({ type: 'quarter', dots: 0, pitch: p('F') });
    T.check(trail.score.measures.length === 2 && trail.result().measures.length === 1, '끝에 저절로 생긴 쉼표뿐인 마디는 저장하지 않음');

    // Erase, semitones, octaves.
    const x = Editing.create(build('C4:q D4:q E4:h'));
    x.erase();
    T.check(txt(x.score.measures[0].notes).startsWith('r:quarter D4') && valid(x), '지우기: 같은 길이의 쉼표');
    x.select(0, 1);
    const ups = [1, 1, 1].map(() => x.semitone(1));
    T.check(ups.join() === 'true,true,false' && x.score.measures[0].notes[1].pitch.alter === 2, '반음↑: ♮→♯→𝄪, 그 이상은 안 됨');
    x.select(0, 2);
    const downs = [1, 1, 1].map(() => x.semitone(-1));
    T.check(downs.join() === 'true,true,false' && x.score.measures[0].notes[2].pitch.alter === -2, '반음↓: ♮→♭→𝄫, 그 이상은 안 됨');
    x.octave(1);
    T.check(x.score.measures[0].notes[2].pitch.octave === 5, '옥타브↑');

    // A tie whose other end goes is dropped.
    const t = Editing.create(build('C4:h~ C4:h | D4:w'));
    t.select(0, 1);
    t.insert({ type: 'half', dots: 0, pitch: p('E') });
    T.check(!t.score.measures[0].notes[0].tie && valid(t), '붙임줄의 한쪽 음을 바꾸면 그 붙임줄은 빠짐');
  });

  const pad = (pos) => T.editorPad(pos);
  const length = (type) => document.querySelector(`#editor-tool-notes [data-type="${type}"]`).click();
  const key = (k, extra = {}, target = document.body) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...extra }));
  const notesOf = () => txt(scoreEditor.state.score.measures.flatMap((m) => m.notes));

  T.test('43-4 편집 화면에서 음 넣기', async (T) => {
    T.setMode('score');
    const writeTop = T.$('staff-title').getBoundingClientRect().top;
    T.$('btn-new-score').click();
    T.$('btn-make-score').click();
    T.check(T.$('editor-pad').querySelector('svg[data-clef="treble"]') && T.$('editor-pad').querySelectorAll('.ed-slot').length === 21, '입력 오선: 높은음자리표, 덧줄 3개씩 위아래 (21자리)');
    length('quarter');
    pad(-2);
    pad(0);
    pad(2);
    T.check(notesOf() === 'C4:quarter E4:quarter G4:quarter r:quarter' && scoreEditor.state.cursor.note === 3, `4분음표 도·미·솔 (${notesOf()})`);
    T.check(T.$('editor-view').querySelector('.sv-note.is-cursor[data-rest]'), '커서가 다음 자리(쉼표)로');
    T.check(document.querySelector('#editor-tool-notes [data-type="half"]').disabled && !document.querySelector('#editor-tool-notes [data-type="quarter"]').disabled,
      '마디 끝을 넘는 길이 버튼(2분)은 꺼짐');
    T.$('editor-dot').click();
    T.check(T.$('editor-rest').disabled && T.$('editor-pad').classList.contains('is-disabled'), '점4분음표는 들어가지 않아 넣기가 꺼짐');
    T.$('editor-dot').click();
    T.$('editor-dot').click();
    T.$('editor-rest').click();
    T.check(scoreEditor.state.score.measures.length === 2 && scoreEditor.state.cursor.measure === 1, '마지막 자리에 쉼표를 넣으면 새 마디로');

    // Key signature and accidentals earlier in the measure.
    scoreEditor.apply((s) => { s.measures[1].key = { fifths: 1, mode: 'major' }; });
    pad(1);
    T.check(scoreEditor.state.score.measures[1].notes[0].pitch.alter === 1, '사장조에서 파 자리를 누르면 파#');
    T.$('editor-natural').click();
    pad(1);
    T.$('editor-natural').click();
    pad(1);
    const m2 = scoreEditor.state.score.measures[1].notes;
    T.check(m2[1].pitch.alter === 0 && m2[2].pitch.alter === 0, `같은 마디에서 ♮를 붙인 다음의 파는 그대로 파(♮) (${txt(m2.slice(0, 3))})`);
    key('ArrowLeft');
    key('ArrowUp');
    T.check(scoreEditor.state.score.measures[1].notes[2].pitch.alter === 1, '←로 셋째 파에 가서 ↑: 반음 올라 파#');

    // Other clefs.
    scoreEditor.apply((s) => {
      s.measures.push({ clef: 'bass', notes: [{ type: 'whole', dots: 0, rest: true }] }, { clef: 'alto', notes: [{ type: 'whole', dots: 0, rest: true }] });
    });
    scoreEditor.state.select(2, 0);
    scoreEditor.render();
    length('whole');
    T.check(T.$('editor-pad').querySelector('svg[data-clef="bass"]'), '낮은음자리표 마디에서는 입력 오선도 낮은음자리표');
    pad(0);
    T.check(N.midi(scoreEditor.state.score.measures[2].notes[0].pitch) === N.midi(p('G', 2)), '낮은음자리표 맨 아래 줄 = G2');
    T.check(T.$('editor-pad').querySelector('svg[data-clef="alto"]'), '알토 음자리표 마디에서는 알토 음자리표');
    pad(4);
    T.check(N.midi(scoreEditor.state.score.measures[3].notes[0].pitch) === 60, '알토 음자리표 가운데 줄 = C4');
    T.$('editor-cancel').click();

    // The keyboard: the same score as with the buttons.
    T.$('btn-new-score').click();
    T.$('btn-make-score').click();
    key('5');
    for (const letter of ['c', 'd', 'e', 'f']) key(letter);
    const typed = notesOf();
    T.check(typed === 'C5:quarter D5:quarter E5:quarter F5:quarter r:whole', `키보드 5(4분) + C D E F: 첫 음은 오선 가운데(B4)에서 가장 가까운 C5, 다음 음은 앞 음에서 가까운 옥타브 (${typed})`);
    key('ArrowLeft');
    key('ArrowLeft');
    key('6');
    key('g');
    T.check(notesOf().startsWith('C5:quarter D5:quarter G5:half'), `← 두 번, 6(2분) + G: 앞 음(D5)에서 가까운 G5가 뒤 음을 덮음 (${notesOf()})`);
    key('ArrowLeft');
    key('ArrowUp', { ctrlKey: true });
    T.check(scoreEditor.state.score.measures[0].notes[2].pitch.octave === 6, 'Ctrl+↑: 옥타브');
    key('Delete');
    T.check(scoreEditor.state.score.measures[0].notes[2].rest, 'Delete: 쉼표로');
    key('z', { ctrlKey: true });
    T.check(!scoreEditor.state.score.measures[0].notes[2].rest, 'Ctrl+Z: 되돌림');
    const beforeTitle = notesOf();
    T.$('editor-title').focus();
    key('c', {}, T.$('editor-title'));
    key('3', {}, T.$('editor-title'));
    T.check(notesOf() === beforeTitle && scoreEditor.input.type === 'half', '제목 입력 중에는 단축키가 안 먹음');
    T.$('editor-title').blur();

    // Room on a phone.
    const tools = T.$('editor-tool-notes');
    const small = [...tools.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().height < 32 || b.getBoundingClientRect().width < 30);
    const outside = [...tools.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().right > tools.getBoundingClientRect().right + 0.5);
    T.check(!small.length && !outside.length && T.noHorizontalOverflow(), `길이 버튼·도구가 넘치지 않고 누를 만한 크기 (작은 것 ${small.length}, 넘친 것 ${outside.length})`);
    const padBox = T.$('editor-pad').getBoundingClientRect();
    T.check(padBox.width > 200 && padBox.right <= tools.getBoundingClientRect().right + 0.5, `입력 오선이 화면 안 (${Math.round(padBox.width)}px)`);

    // Save → practice.
    T.$('editor-title').value = '키보드 악보';
    T.$('editor-title').dispatchEvent(new Event('input'));
    T.$('editor-save').click();
    const saved = scores.get(scoreId);
    T.check(saved.title === '키보드 악보' && saved.measures.length === 1 && N.isValid(saved), '저장 → 연습 화면, 그 악보 (끝에 저절로 생긴 빈 마디는 빠짐)');
    T.check(Math.abs(T.$('staff-title').getBoundingClientRect().top - writeTop) < 0.5 && T.noHorizontalOverflow(), '편집을 닫은 뒤 받아 적기 영역 위치 그대로');
    T.deleteScore();
    localStorage.removeItem(Scores.STORAGE_KEY);
    localStorage.removeItem(Settings.SECTIONS_KEY);
    T.$('score-select').value = scores.list()[0].id;
    T.$('score-select').dispatchEvent(new Event('change'));
    T.setMode('melody');
  });
}
