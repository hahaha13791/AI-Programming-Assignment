// 60단계 — 악보에 계이름 달기. Run with smoke.js.
{
  const N = Notation;
  const example = (id) => EXAMPLE_SCORES.find((s) => s.id === id);
  // Draws a score with solfège in a box of the page's width and returns the syllables in order (with their notes).
  function drawn(score, solfege = 'movable', width = Math.min(window.innerWidth - 20, 700)) {
    const box = document.createElement('div');
    box.style.width = `${width}px`;
    document.body.append(box);
    Sheet.draw(box, score, { solfege });
    const labels = [...box.querySelectorAll('.sv-solfege')];
    return { box, labels, texts: labels.map((l) => l.textContent) };
  }
  const build = (music, key = { fifths: 0, mode: 'major' }, extra = {}) => N.build({
    id: 'x', title: 'x', time: [4, 4], key, clef: 'treble', tempo: 80, music, ...extra,
  });

  T.test('60-2 다장조: 반짝반짝 작은 별', async (T) => {
    const { box, texts } = drawn(example('example-twinkle'));
    const first = '도 도 솔 솔 라 라 솔 파 파 미 미 레 레 도'.split(' ');
    T.check(texts.slice(0, 14).join(' ') === first.join(' '), `처음 4마디 (${texts.slice(0, 14).join(' ')})`);
    T.check(texts.length === 42, `음마다 하나 (${texts.length}개)`);
    box.remove();
  });

  T.test('60-2 이동도: 단조 라, 조표에서 벗어난 음, 조바뀜', async (T) => {
    const elise = drawn(example('example-fur-elise'));
    T.check(elise.texts.slice(0, 8).join(' ') === '미 레# 미 레# 미 시 레 도', `엘리제(가단조): ${elise.texts.slice(0, 8).join(' ')}`);
    T.check(elise.texts[8] === '라', '가단조 으뜸음 A = 라');
    elise.box.remove();
    const king = drawn(example('example-mountain-king'));
    T.check(king.texts.slice(0, 13).join(' ') === '라 시 도 레 미 도 미 레# 시 레# 레 시♭ 레',
      `산왕의 궁전(나단조·낮은음자리표): ${king.texts.slice(0, 13).join(' ')}`);
    king.box.remove();
    const etude = drawn(example('example-rhythm-etude'));
    // 1마디: C E G~G → 도 미 솔 (이어진 G는 없음). 5마디(사장조로 바뀜): G F# E D → 도 시 라 솔.
    const m = (i) => etude.labels.filter((l) => Number(l.dataset.measure) === i).map((l) => l.textContent).join(' ');
    T.check(m(0) === '도 미 솔', `연습곡 1마디(붙임줄 뒤 음 없음): ${m(0)}`);
    T.check(m(4) === '도 시 라 솔', `연습곡 5마디(사장조로 조바뀜): ${m(4)}`);
    etude.box.remove();
  });

  T.test('60-2 고정도·화음·꾸밈음·쉼표', async (T) => {
    const king = drawn(example('example-mountain-king'), 'fixed');
    T.check(king.texts.slice(0, 5).join(' ') === '시 도# 레 미 파#', `고정도: C가 도, 음의 임시표 (${king.texts.slice(0, 5).join(' ')})`);
    king.box.remove();
    const score = build('C4:q gD5:8 E5:q r:q G4:q');
    score.measures[0].notes[0].chord = [{ pitch: { step: 'E', alter: 0, octave: 4 } }, { pitch: { step: 'G', alter: 0, octave: 4 } }];
    const c = drawn(N.clean(score));
    const chord = c.labels.filter((l) => l.dataset.index === '0');
    T.check(chord.map((l) => l.textContent).join(' ') === '솔 미 도' && chord.every((l, k) => !k || Number(l.getAttribute('y')) > Number(chord[k - 1].getAttribute('y')))
      && new Set(chord.map((l) => l.getAttribute('x'))).size === 1, '화음: 위에서 아래로 세로 (솔 미 도)');
    const grace = c.labels.find((l) => l.dataset.index === '1');
    T.check(grace?.textContent === '레' && grace.classList.contains('is-grace')
      && parseFloat(getComputedStyle(grace).fontSize) < parseFloat(getComputedStyle(chord[0]).fontSize), '꾸밈음: 작은 글씨');
    T.check(!c.labels.some((l) => l.dataset.index === '3'), '쉼표에는 없음');
    c.box.remove();
    // ⚙ 설정을 바꾸면: 같은 악보를 다른 방식으로 그린 결과가 다름 (보기 화면은 61단계).
    T.check(drawn(example('example-mountain-king'), 'movable').texts[0] === '라', '방식에 따라 계이름이 바뀜');
    document.querySelectorAll('body > div:last-child').forEach((d) => d.querySelector('.sheet') && d.remove());
  });

  T.test('60-2 글자가 겹치지 않음', async (T) => {
    for (const id of ['example-fur-elise', 'example-greensleeves', 'example-rhythm-etude']) {
      const { box, labels } = drawn(example(id), 'movable', Math.min(window.innerWidth - 20, 700));
      // Same row and same line: their boxes don't overlap.
      const rects = labels.map((l) => ({ r: l.getBoundingClientRect(), row: l.closest('svg'), y: l.getAttribute('y') }));
      let overlaps = 0;
      for (let i = 1; i < rects.length; i++) {
        const a = rects[i - 1];
        const b = rects[i];
        if (a.row === b.row && a.y === b.y && b.r.left < a.r.right - 0.5) overlaps++;
      }
      T.check(overlaps === 0, `${example(id).title}: 이웃 계이름이 겹치지 않음`);
      box.remove();
    }
  });

  T.test('60-2 옵션이 없으면 지금 그림 그대로', async (T) => {
    const box = document.createElement('div');
    box.style.width = '700px';
    document.body.append(box);
    Sheet.draw(box, example('example-twinkle'));
    const plain = box.querySelector('.sheet-svg').getAttribute('viewBox');
    T.check(!box.querySelector('.sv-solfege'), '계이름 없음');
    Sheet.draw(box, example('example-twinkle'), { solfege: 'movable' });
    const withSolfege = box.querySelector('.sheet-svg').getAttribute('viewBox');
    T.check(Number(withSolfege.split(' ')[3]) > Number(plain.split(' ')[3]), '계이름을 켜면 줄 높이가 늘고, 끄면 원래 높이');
    box.remove();
    T.setMode('score');
    T.check(!T.$('score-strip').querySelector('.sv-solfege') && !T.$('score-input').querySelector('.sv-solfege'), '연습 중 악보 띠·받아 적기에는 계이름 없음');
    T.$('btn-edit-score').click();
    T.check(!T.$('editor').querySelector('.sv-solfege'), '편집기에는 계이름 없음');
    T.$('editor-cancel').click();
    T.setMode('melody');
  });
}
