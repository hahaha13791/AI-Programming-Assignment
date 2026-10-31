// 47단계 — 도돌이표와 기호. Run with smoke.js.
{
  const N = Notation;
  const BASE = { id: 's', title: '시험', key: { fifths: 0, mode: 'major' }, tempo: 80, clef: 'treble', time: [4, 4] };
  const build = (music) => N.build({ ...BASE, music });
  const valid = (e) => N.isValid({ ...e.score, id: 'x', title: 'x' });
  const endings = (e) => e.score.measures.map((m) => (m.ending ? `${m.ending.start ? '[' : ''}${m.ending.text}${m.ending.end ? (m.ending.end === 'stop' ? ']' : ')') : ''}` : '-')).join(' ');

  T.test('47-2 기호 (editing.js)', async (T) => {
    const e = Editing.create(build('C4:w | D4:w | E4:w | F4:w | G4:w'));
    e.toggleRepeat('start');
    e.select(2, 0);
    e.toggleRepeat('end');
    e.select(1, 0);
    e.setEnding(2, '1.');
    e.select(3, 0);
    e.setEnding(1, '2.', false);
    e.setBarline('double');
    e.addMark('text', 'D.C. al Fine', 'end');
    e.select(0, 0);
    e.addMark('segno', null, 'start');
    T.check(valid(e) && endings(e) === '- [1. 1.] [2.) -' && e.score.measures[0].repeatStart && e.score.measures[2].repeatEnd && e.score.measures[3].barline === 'double',
      `|: 1. :| 2. || D.C. al Fine 모양이 검증을 통과 (${endings(e)})`);
    e.select(2, 0);
    T.check(!e.setBarline('final') && !e.score.measures[2].barline, '도돌이표 끝과 겹세로줄·끝세로줄을 함께 고를 수 없음');
    e.select(3, 0);
    T.check(!e.addMark('text', 'D.C. al Fine', 'end'), '같은 기호를 두 번 넣지 않음');

    // Measures in and out keep brackets whole.
    e.select(2, 0);
    e.insertMeasure();
    T.check(endings(e) === '- [1. 1. 1.] [2.) -' && valid(e), `괄호 안에 마디를 넣으면 괄호에 들어감 (${endings(e)})`);
    e.select(1, 0);
    e.deleteMeasure();
    T.check(endings(e) === '- [1. 1.] [2.) -' && valid(e), `괄호 첫 마디를 지우면 다음 마디가 시작을 이어받음 (${endings(e)})`);
    e.select(2, 0);
    e.deleteMeasure();
    T.check(endings(e) === '- [1.] [2.) -' && valid(e), `괄호 끝 마디를 지우면 앞 마디가 끝을 이어받음 (${endings(e)})`);
    e.select(1, 0);
    e.setEnding(3, '1.');
    T.check(endings(e) === '- [1. 1. 1.]' && valid(e), `겹치는 괄호를 넣으면 옛 괄호는 빠짐 (${endings(e)})`);
    e.select(2, 0);
    e.removeEnding();
    T.check(endings(e) === '- - - -', `[빼기]: 그 괄호 전체가 빠짐 (${endings(e)})`);
    T.check(valid(e), '검증 통과');
  });

  T.test('47-2 [기호] 탭과 연습 화면', async (T) => {
    T.setMode('score');
    T.$('btn-new-score').click();
    T.$('btn-make-score').click();
    const key = (k) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    key('7');
    for (const l of ['c', 'd', 'e', 'f']) key(l);
    T.$('editor-tab-signs').click();
    const at = (m) => {
      scoreEditor.state.select(m, 0);
      scoreEditor.render();
    };
    at(0);
    T.$('editor-repeat-start').click();
    T.check(T.$('editor-repeat-start').getAttribute('aria-pressed') === 'true', '[|: 시작] 켜짐');
    at(1);
    T.$('editor-ending-text').value = '1.';
    T.$('editor-ending-count').value = '1';
    T.$('editor-ending-apply').click();
    T.$('editor-repeat-end').click();
    at(2);
    T.$('editor-ending-text').value = '2.';
    T.$('editor-ending-closed').checked = false;
    T.$('editor-ending-apply').click();
    T.$('editor-barline').value = 'double';
    T.$('editor-barline-apply').click();
    at(3);
    T.$('editor-words').value = 'D.C. al Fine';
    T.$('editor-words-at').value = 'end';
    T.$('editor-words-apply').click();
    T.$('editor-barline').value = 'final';
    T.$('editor-barline-apply').click();
    at(0);
    T.$('editor-segno').click();
    const view = T.$('editor-view');
    T.check(view.querySelectorAll('.sv-barline[data-kind="repeat"]').length === 2 && view.querySelectorAll('.sv-ending').length === 2 && view.querySelector('.sv-segno')
      && [...view.querySelectorAll('.sv-mark-text')].some((t) => t.textContent === 'D.C. al Fine') && view.querySelector('.sv-barline[data-kind="double"]'),
    '편집 화면 악보에 도돌이표·괄호·세뇨·D.C. al Fine·겹세로줄');
    at(1);
    T.check(T.$('editor-barline').disabled, '도돌이표 끝이 있는 마디는 세로줄을 고를 수 없음');
    const inside = [...T.$('editor-tool-signs').querySelectorAll('button, select, input')].every((el) => el.getBoundingClientRect().right <= T.$('editor-tool-signs').getBoundingClientRect().right + 0.5);
    T.check(inside && T.noHorizontalOverflow(), '[기호] 도구가 화면을 넘치지 않음');
    T.$('editor-title').value = '기호 곡';
    T.$('editor-title').dispatchEvent(new Event('input'));
    T.$('editor-save').click();
    const saved = scores.get(scoreId);
    T.check(N.isValid(saved) && saved.measures[0].repeatStart && saved.measures[1].ending?.text === '1.' && saved.measures[2].ending?.end === 'open', '저장값이 검증을 통과');
    const strip = T.$('score-strip').querySelector('svg');
    T.check(strip.querySelectorAll('.sv-ending').length === 2 && strip.querySelector('.sv-segno') && strip.querySelectorAll('.sv-barline[data-kind="repeat"]').length === 2,
      '한 줄 띠에도 그려짐');
    T.deleteScore();
    localStorage.removeItem(Scores.STORAGE_KEY);
    localStorage.removeItem(Settings.SECTIONS_KEY);
    T.$('score-select').value = scores.list()[0].id;
    T.$('score-select').dispatchEvent(new Event('change'));
    T.setMode('melody');
  });
}
