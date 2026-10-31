// 46단계 — 화음과 꾸밈음. Run with smoke.js.
{
  const N = Notation;
  const BASE = { id: 's', title: '시험', key: { fifths: 0, mode: 'major' }, tempo: 80, clef: 'treble', time: [4, 4] };
  const build = (music) => N.build({ ...BASE, music });
  const P = (step, octave = 4, alter = 0) => ({ step, alter, octave });
  const valid = (e) => N.isValid({ ...e.score, id: 'x', title: 'x' });
  const heads = (note) => N.pitchesOf(note).map((p) => `${p.pitch.step}${['bb', 'b', '', '#', 'x'][p.pitch.alter + 2]}${p.pitch.octave}${p.tie ? '~' : ''}`).join('+');
  const txt = (notes) => notes.map((n) => `${n.grace ? `g${n.slash ? 's' : ''}` : ''}${n.rest ? 'r' : heads(n)}:${n.type}`).join(' ');

  T.test('46-2 화음·꾸밈음 (editing.js)', async (T) => {
    const e = Editing.create(build('C4:h~ C4:h | C4:w'));
    e.toggleChordPitch(P('E'));
    e.toggleChordPitch(P('G'));
    T.check(heads(e.score.measures[0].notes[0]) === 'C4~+E4+G4' && e.cursor.head === 2 && valid(e), '도 위에 미·솔을 더하면 3음 화음, 커서는 더한 음');
    e.toggleChordPitch(P('E'));
    T.check(heads(e.score.measures[0].notes[0]) === 'C4~+G4' && valid(e), '다시 미를 누르면 빠짐');
    e.toggleChordPitch(P('G'));
    e.toggleChordPitch(P('G', 4));
    T.check(N.pitchesOf(e.score.measures[0].notes[0]).filter((p) => N.midi(p.pitch) === 67).length === 1, '같은 음은 겹치지 않음');
    T.check(!Editing.create(build('C4:w')).toggleChordPitch(P('C')), '하나 남은 음은 화음 빼기로 지우지 않음');

    // A chord head on its own: semitone, ties per pitch.
    const c = Editing.create(build('C4:h C4:h'));
    c.toggleChordPitch(P('E'));
    c.select(0, 1);
    c.toggleChordPitch(P('E'));
    c.select(0, 0);
    c.toggleTie();
    T.check(heads(c.score.measures[0].notes[0]) === 'C4~+E4~' && valid(c), '화음은 음마다 붙임줄');
    c.select(0, 0, 1);
    c.semitone(1);
    T.check(heads(c.score.measures[0].notes[0]) === 'C4~+E#4' && heads(c.score.measures[0].notes[1]) === 'C4~+E4' && valid(c),
      `화음 음머리를 골라 반음을 올리면 그 음만 바뀌고, 그 음의 붙임줄만 빠짐 (${txt(c.score.measures[0].notes)})`);
    c.select(0, 0, 1);
    c.erase();
    T.check(heads(c.score.measures[0].notes[0]) === 'C4~' && !c.score.measures[0].notes[0].rest && valid(c), '화음에서 [지우기]는 고른 음만 지움');

    // Grace notes.
    const g = Editing.create(build('C4:q D4:q E4:h'));
    g.select(0, 1);
    g.addGrace(P('E'), 'eighth', true);
    g.addGrace(P('F'), '16th');
    const notes = g.score.measures[0].notes;
    T.check(txt(notes) === 'C4:quarter gsE4:eighth gF4:16th D4:quarter E4:half' && g.cursor.note === 3, `꾸밈음은 커서 음 앞에 넣은 순서대로, 커서는 원래 음 (${txt(notes)})`);
    T.check(N.cmp(N.filled(notes), N.frac(1)) === 0 && valid(g), '꾸밈음을 넣어도 마디 박은 그대로');
    g.select(0, 2);
    g.toggleSlash();
    T.check(g.score.measures[0].notes[2].slash && valid(g), '사선 토글');
    const cleaned = g.result();
    T.check(cleaned.measures[0].notes[1].grace && cleaned.measures[0].notes[1].slash && cleaned.measures[0].notes[2].slash, '저장값에 꾸밈음·사선이 남음');
    g.erase();
    T.check(txt(g.score.measures[0].notes) === 'C4:quarter gsE4:eighth D4:quarter E4:half' && valid(g), '꾸밈음 지우기');
  });

  const key = (k, extra = {}) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...extra }));

  T.test('46-2 편집 화면의 화음·꾸밈음과 연습', async (T) => {
    T.setMode('score');
    T.$('btn-new-score').click();
    T.$('btn-make-score').click();
    key('6');
    key('c');
    key('d');
    const notes = () => scoreEditor.state.score.measures[0].notes;
    scoreEditor.state.select(0, 0);
    scoreEditor.render();
    T.$('editor-chord').click();
    T.editorPad(0); // E4
    T.editorPad(2); // G4
    T.check(heads(notes()[0]) === 'C5+E4+G4' && T.$('editor-view').querySelector('.sv-note[data-chord="3"]'), `[화음 넣기] + 오선: 3음 화음, 그려짐 (${heads(notes()[0])})`);
    T.editorPad(0);
    T.check(heads(notes()[0]) === 'C5+G4', '같은 자리를 다시 누르면 빠짐');
    T.$('editor-chord').click();
    key('ArrowRight');
    key('F', { shiftKey: true });
    T.check(heads(notes()[1]) === 'D5+F5', `Shift+F: 위쪽으로 화음 음 더하기 (${heads(notes()[1])})`);
    // Grace notes.
    T.$('editor-grace').click();
    key('5');
    key('4');
    T.editorPad(7); // E5 (eighth, as chosen)
    T.$('editor-grace').click();
    T.check(notes()[1].grace && notes()[1].type === 'eighth' && notes()[2].chord && T.$('editor-view').querySelector('.sv-note.is-grace'), `[꾸밈음 넣기]: D 앞에 작은 음표 (${txt(notes())})`);
    scoreEditor.state.select(0, 1);
    scoreEditor.render();
    T.$('editor-slash').click();
    T.check(notes()[1].slash && T.$('editor-view').querySelector('.sv-grace-slash'), '[사선]');
    T.$('editor-title').value = '화음 꾸밈음';
    T.$('editor-title').dispatchEvent(new Event('input'));
    T.$('editor-save').click();
    const saved = scores.get(scoreId);
    T.check(N.isValid(saved) && saved.measures[0].notes[0].chord && saved.measures[0].notes[1].grace, '저장: 화음·꾸밈음');
    T.check(!T.$('settings-line').hidden || (T.$('btn-settings').click(), !T.$('settings-line').hidden), '화음이 든 악보는 ⚙에 맨 위/맨 아래 음 선택');
    if (!T.$('settings').hidden) T.$('btn-settings').click();
    T.$('btn-settings').click();
    document.querySelector('#settings input[name="line"][value="bottom"]').click();
    T.$('btn-settings').click();
    const names = (list) => list.map((p) => `${p.step}${p.octave}`).join(' ');
    T.check(names(current) === 'G4 E5 D5', `맨 아래 음으로 받아 적기: 솔(화음 아래)·꾸밈음 미·레 (${names(current)})`);
    await T.listen();
    T.enterNotes(current);
    T.submit();
    T.check(T.resultText().includes('모두 정답'), '한 사이클');
    T.deleteScore();
    localStorage.removeItem(Scores.STORAGE_KEY);
    localStorage.removeItem(Settings.SECTIONS_KEY);
    localStorage.removeItem(Settings.LINES_KEY);
    T.$('score-select').value = scores.list()[0].id;
    T.$('score-select').dispatchEvent(new Event('change'));
    T.setMode('melody');
  });
}
