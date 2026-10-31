// 44단계 — 붙임줄과 잇단음표. Run with smoke.js.
{
  const N = Notation;
  const BASE = { id: 's', title: '시험', key: { fifths: 0, mode: 'major' }, tempo: 60, clef: 'treble', time: [4, 4] };
  const build = (music) => N.build({ ...BASE, music });
  const txt = (notes) => notes.map((n) => `${n.rest ? 'r' : `${n.pitch.step}${n.pitch.octave}`}:${n.type}${n.tuplet ? `/${n.tuplet.actual}` : ''}${n.tuplet2 ? `//${n.tuplet2.actual}` : ''}${n.tie ? `~${n.tie}` : ''}`).join(' ');
  const valid = (e) => N.isValid({ ...e.score, id: 'x', title: 'x' });
  const length = (notes) => notes.reduce((sum, n) => N.add(sum, N.duration(n)), N.ZERO);

  T.test('44-2 붙임줄과 잇단음표 (editing.js)', async (T) => {
    // A tie over the barline, played as one note.
    const e = Editing.create(build('C4:h E4:h | E4:w'));
    e.select(0, 1);
    T.check(e.toggleTie() && e.isTied() && valid(e) && e.score.measures[1].notes[0].tie === 'stop', '마디를 넘는 붙임줄이 걸림');
    const events = Playback.schedule({ ...e.score, id: 'x', title: 'x' }, { start: 0, end: 1, tonic: false }).events;
    T.check(events.length === 2 && events[1].midi === 64 && events[1].length > 2, `재생에서 한 음으로 이어짐 (미 ${events[1].length.toFixed(2)}초)`);
    T.check(e.toggleTie() && !e.isTied() && !e.score.measures[1].notes[0].tie && valid(e), '다시 누르면 풀림');
    e.select(0, 0);
    const before = JSON.stringify(e.score);
    T.check(!e.toggleTie() && JSON.stringify(e.score) === before, '다음 음에 같은 높이가 없으면 바뀌지 않음');
    const chord = Editing.create(build('C4:h E4:h | E4:w'));
    chord.change((s) => { s.measures[0].notes[1].chord = [{ pitch: { step: 'G', alter: 0, octave: 4 } }]; s.measures[1].notes[0].chord = [{ pitch: { step: 'G', alter: 0, octave: 4 } }]; });
    chord.select(0, 1);
    chord.toggleTie();
    const m = chord.score.measures;
    T.check(m[0].notes[1].tie === 'start' && m[0].notes[1].chord[0].tie === 'start' && m[1].notes[0].chord[0].tie === 'stop' && valid(chord), '화음은 음마다 붙임줄');

    // Tuplets.
    const t = Editing.create(build('C4:8 D4:8 E4:q F4:h'));
    T.check(t.tuplet(3) && txt(t.score.measures[0].notes) === 'r:eighth/3 r:eighth/3 r:eighth/3 E4:quarter F4:half' && valid(t),
      `8분음표 자리에 셋잇단: 8분 셋잇단 묶음(안은 쉼표), 4분 자리를 차지 (${txt(t.score.measures[0].notes)})`);
    t.insert({ type: 'eighth', dots: 0, pitch: { step: 'G', alter: 0, octave: 4 } });
    T.check(t.score.measures[0].notes[0].tuplet?.actual === 3 && t.cursor.note === 1, '묶음 안에 음을 넣으면 셋잇단 음, 커서는 묶음의 다음 자리');
    T.check(t.tuplet(3) && valid(t) && t.score.measures[0].notes.filter((n) => n.tuplet2).length === 3, `묶음 안에서 다시 셋잇단 → 겹잇단 (${txt(t.score.measures[0].notes)})`);
    T.check(!t.tuplet(3), '세 겹은 만들 수 없음');
    const box = document.createElement('div');
    box.style.width = '700px';
    document.body.append(box);
    Sheet.draw(box, { ...t.score, id: 'x', title: 'x' });
    T.check(box.querySelector('.sv-tuplet[data-level="1"]') && box.querySelector('.sv-tuplet[data-level="2"]'), '그리기: 괄호가 단계별로');
    box.remove();
    t.select(0, 0);
    t.setLength('quarter');
    const group = t.score.measures[0].notes.filter((n) => n.tuplet && !n.tuplet2);
    T.check(valid(t) && N.cmp(length(t.score.measures[0].notes.filter((n) => n.tuplet)), N.frac(1, 4)) === 0, `묶음 안의 음을 길게 바꿔도 묶음 길이(4분)는 그대로 (${txt(t.score.measures[0].notes)})`);
    T.check(group.length >= 1, '바뀐 음은 묶음 안에 남음');
    t.select(0, 0);
    T.check(t.untuplet() && txt(t.score.measures[0].notes).startsWith('r:quarter E4:quarter') && valid(t), `잇단 풀기: 그 자리가 쉼표로 (${txt(t.score.measures[0].notes)})`);

    // No room.
    const end = Editing.create(build('C4:h D4:q E4:q'));
    end.select(0, 2);
    T.check(!end.tuplet(3, 2) || false, '마디 끝을 넘는 잇단음표 묶음(4분 셋잇단 = 2분 자리)은 만들 수 없음');
    T.check(end.tuplet(5, 4) === false && end.select(0, 0) === undefined && end.tuplet(5, 4) === false, '4분음표 다섯 잇단(온음표 자리)도 2분 자리에는 안 됨');
    const custom = Editing.create(build('C4:16 D4:16 E4:16 F4:16 G4:q A4:h'));
    T.check(custom.tuplet(5, 4) && txt(custom.score.measures[0].notes).startsWith('r:16th/5 r:16th/5 r:16th/5 r:16th/5 r:16th/5 G4') && valid(custom), '16분음표 다섯 잇단(5:4)');
  });

  const key = (k, extra = {}) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...extra }));

  T.test('44-2 편집 화면의 붙임줄·잇단음표', async (T) => {
    T.setMode('score');
    T.$('btn-new-score').click();
    T.$('btn-make-score').click();
    key('6');
    key('c');
    key('c');
    key('ArrowLeft');
    key('ArrowLeft');
    T.$('editor-tie').click();
    const notes = () => scoreEditor.state.score.measures[0].notes;
    T.check(notes()[0].tie === 'start' && T.$('editor-tie').getAttribute('aria-pressed') === 'true' && T.$('editor-view').querySelector('.sv-tie'), '[붙임줄]: 걸리고 그려짐');
    key('+');
    T.check(!notes()[0].tie && T.$('editor-tie').getAttribute('aria-pressed') === 'false', '+: 다시 풀림');
    key('ArrowRight');
    key('d');
    key('ArrowLeft');
    key('ArrowLeft');
    T.$('editor-tie').click();
    T.check(T.$('editor-status').classList.contains('is-notice') && T.$('editor-status').textContent.includes('같은 높이'), `같은 높이가 없으면 안내 (${T.$('editor-status').textContent})`);
    key('4');
    key('3', { altKey: true });
    T.check(notes()[0].tuplet?.actual === 3 && notes().filter((n) => n.tuplet).length === 3, `Alt+3: 셋잇단 (${txt(notes())})`);
    T.check(T.$('editor-view').querySelector('.sv-tuplet[data-actual="3"]'), '악보에 셋잇단 괄호');
    for (const letter of ['e', 'f', 'g']) key(letter);
    T.check(txt(notes()).startsWith('E5:eighth/3 F5:eighth/3 G5:eighth/3'), `셋잇단 안에 미·파·솔 (${txt(notes())})`);
    key('ArrowLeft');
    T.$('editor-untuplet').click();
    T.check(!notes().some((n) => n.tuplet), '[잇단 풀기]');
    T.$('editor-tuplet-actual').value = '5';
    T.$('editor-tuplet-normal').value = '4';
    key('3');
    T.$('editor-tuplet-custom').click();
    T.check(notes().filter((n) => n.tuplet?.actual === 5 && n.tuplet.normal === 4).length === 5, `직접 5:4 (${txt(notes())})`);
    const row = document.querySelector('.ed-tuplets');
    const outside = [...row.querySelectorAll('button, input')].filter((el) => el.getBoundingClientRect().right > T.$('editor-tool-notes').getBoundingClientRect().right + 0.5);
    T.check(!outside.length && T.noHorizontalOverflow(), '잇단음표 줄이 넘치지 않음');
    T.$('editor-cancel').click();
    T.setMode('melody');
  });
}
