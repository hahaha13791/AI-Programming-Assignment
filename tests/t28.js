// 28단계 — 악보 보기: 음높이 표기 (sheet.js). Run with smoke.js.
const N28 = Notation;
const eq28 = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const BASE28 = { time: [4, 4], key: { fifths: 0, mode: 'major' }, clef: 'treble', tempo: 80 };
const build28 = (music, extra = {}) => N28.build({ id: 't28', title: '시험', ...BASE28, music, ...extra });

// A box on the page to draw into (the same width the result/preview boxes have).
function sheetBox() {
  const box = document.createElement('div');
  box.className = 'staff-area score-area';
  document.querySelector('.practice').append(box);
  return box;
}

const TREBLE_SHARPS = [8, 5, 9, 6, 3, 7, 4];
const TREBLE_FLATS = [4, 7, 3, 6, 2, 5, 1];

T.test('28-2 조표 위치', async (T) => {
  const box = sheetBox();
  let ok = 0;
  const bad = [];
  for (const clef of ['treble', 'bass']) {
    for (let fifths = -7; fifths <= 7; fifths++) {
      Sheet.draw(box, build28('C4:w', { clef, key: { fifths, mode: 'major' } }));
      const pos = [...box.querySelectorAll('.sv-key')].map((el) => Number(el.dataset.pos));
      const alters = [...box.querySelectorAll('.sv-key')].map((el) => Number(el.dataset.alter));
      const table = (fifths > 0 ? TREBLE_SHARPS : TREBLE_FLATS).slice(0, Math.abs(fifths)).map((p) => p - (clef === 'bass' ? 2 : 0));
      if (eq28(pos, table) && alters.every((a) => a === Math.sign(fifths))) ok++;
      else bad.push(`${clef} ${fifths}: ${pos}`);
    }
  }
  T.check(ok === 30, `조표 15가지 × 높은음·낮은음자리표 = ${ok}/30 표준 위치 ${bad.join('; ')}`);
  box.remove();
});

T.test('28-2 덧줄과 잘림', async (T) => {
  const box = sheetBox();
  const ledgers = (music, clef = 'treble') => {
    Sheet.draw(box, build28(music, { clef }));
    return [...box.querySelectorAll('.sv-note')].map((n) => [...n.querySelectorAll('.sv-ledger')].map((l) => Number(l.dataset.pos)));
  };
  T.check(eq28(ledgers('C4:q B3:q A3:q E4:q'), [[-2], [-2], [-2, -4], []]), '높은음자리표 C4·B3·A3: 필요한 만큼만');
  T.check(eq28(ledgers('A5:q B5:q C6:q D6:q'), [[10], [10], [10, 12], [10, 12]]), '위쪽 A5~D6: 필요한 만큼만');
  T.check(eq28(ledgers('E2:q C2:q C4:q E4:q', 'bass'), [[-2], [-2, -4], [10], [10, 12]]), '낮은음자리표 E2·C2·C4·E4');
  Sheet.draw(box, build28('C2:q C8:q A0:q G7:q'));
  const svg = box.querySelector('svg');
  const height = svg.viewBox.baseVal.height;
  const inside = [...svg.querySelectorAll('.sv-head, .sv-stem')].every((el) => {
    const b = el.getBBox();
    return b.y >= -0.5 && b.y + b.height <= height + 0.5;
  });
  T.check(inside, `아주 높고 낮은 음(C2·C8·A0·G7)도 머리·기둥이 그림 밖으로 잘리지 않음 (높이 ${Math.round(height)})`);
  box.remove();
});

T.test('28-2 바뀜이 그 마디에', async (T) => {
  const box = sheetBox();
  const s = build28('C5:w | C5:w | C4:w | C4:w', {
    changes: { 1: { key: { fifths: -3, mode: 'minor' } }, 2: { clef: 'bass', time: [3, 4] }, 3: { key: { fifths: 2, mode: 'major' } } },
  });
  s.measures[2].notes = [{ type: 'half', dots: 1, pitch: { step: 'C', alter: 0, octave: 3 } }];
  s.measures[3].notes = [{ type: 'half', dots: 1, pitch: { step: 'C', alter: 0, octave: 3 } }];
  T.check(N28.isValid(s), '시험 악보가 올바름');
  Sheet.draw(box, s);
  const m = (i) => box.querySelector(`.sv-measure[data-measure="${i}"]`);
  T.check(m(1).querySelectorAll('.sv-key').length === 3 && !m(0).querySelector('.sv-key'), '1마디 뒤 조 바꿈(♭3)이 2마디에 그려짐');
  T.check(m(2).querySelector('.sv-clef[data-clef="bass"]') && m(2).querySelector('.sv-time[data-time="3/4"]'), '음자리표·박자 바뀜이 3마디에 그려짐');
  const signs = [...m(3).querySelectorAll('.sv-key')].map((el) => Number(el.dataset.alter));
  T.check(eq28(signs, [0, 1, 1]) || eq28(signs, [0, 0, 0, 1, 1]), `♭3 → ♯2 바뀜: 제자리표 뒤에 새 조표 (${signs})`);
  box.remove();
});

T.test('28-2 잠긴 새 예시의 악보 미리 보기 (28-1a)', async (T) => {
  T.setMode('score');
  const select = T.$('score-select');
  const top = () => T.$('staff-title').getBoundingClientRect().top;
  const before = top();
  for (const id of ['example-fur-elise', 'example-greensleeves', 'example-mountain-king']) {
    select.value = id;
    select.dispatchEvent(new Event('change'));
    const preview = T.$('score-preview');
    T.check(!preview.hidden && preview.querySelector('.sheet .sheet-svg') && T.$('staff-area').hidden, `${id}: 미리 보기가 보이고 입력 오선은 숨음`);
    T.check(Math.abs(top() - before) < 0.5, '받아 적기 영역 위치가 그대로');
    T.check(T.noHorizontalOverflow(), '페이지 가로 스크롤 없음');
  }
  select.value = 'example-twinkle';
  select.dispatchEvent(new Event('change'));
  T.check(T.$('score-preview').hidden && !T.$('staff-area').hidden, '연습할 수 있는 악보로 돌아오면 미리 보기가 사라지고 입력 오선이 보임');
  T.setMode('melody');
  T.check(T.$('score-preview').hidden && !T.$('staff-area').hidden, '다른 모드에서는 미리 보기가 없음');
});

T.test('28-4 조표 기준 임시표', async (T) => {
  const G = { fifths: 1, mode: 'major' };
  const p = (step, alter, octave = 4) => ({ type: 'quarter', dots: 0, pitch: { step, alter, octave } });
  T.check(eq28(Sheet.shownAccidentals([p('F', 1), p('F', 0), p('F', 0), p('F', 1)], G), [null, 0, null, 1]),
    '사장조: 파#은 표시 없음, 파는 ♮, 같은 마디 둘째 파는 없음, 다시 파#은 ♯');
  T.check(eq28(Sheet.shownAccidentals([p('F', 1, 5), p('F', 0, 4)], G), [null, 0]), '다른 옥타브의 파는 따로 판단 (♮)');
  T.check(eq28(Sheet.shownAccidentals([p('F', 2), p('F', 1), p('F', 2), p('B', -2), p('B', -1)], { fifths: 0, mode: 'major' }), [2, 1, 2, -2, -1]),
    '겹올림 → 올림 → 겹올림, 겹내림 → 내림 표기');
  T.check(eq28(Sheet.shownAccidentals([p('B', -1), p('B', 0)], { fifths: -2, mode: 'major' }), [null, 0]), '내림나장조: 시♭ 표시 없음, 시는 ♮');
  const tied = [{ ...p('F', 1), tie: 'stop' }, p('F', 1), p('F', 0)];
  T.check(eq28(Sheet.shownAccidentals(tied, { fifths: 0, mode: 'major' }), [null, 1, 0]),
    '붙임줄로 넘어온 파#은 표시 없음, 그 뒤 파#은 다시 ♯, 파는 ♮');
  const box = sheetBox();
  Sheet.draw(box, N28.build({ id: 't', title: 't', ...BASE28, key: G, music: 'F4:q F4:q G4:q F#4:q' }));
  const shown = [...box.querySelectorAll('.sv-note')].map((n) => n.querySelector('.sv-accidental')?.dataset.accidental ?? '-');
  T.check(eq28(shown, ['0', '-', '-', '1']), `그린 악보에도 같은 표시 (${shown})`);
  box.remove();
});

T.test('28-4 못갖춘마디와 마디 번호', async (T) => {
  const box = sheetBox();
  const elise = EXAMPLE_SCORES.find((s) => s.id === 'example-fur-elise');
  Sheet.draw(box, elise);
  const groups = [...box.querySelectorAll('.sv-measure')];
  T.check(groups[0].dataset.number === '0' && groups[1].dataset.number === '1', '못갖춘마디는 0, 다음이 1마디');
  const numbers = [...box.querySelectorAll('.sv-number')].map((el) => el.textContent);
  const rowStarts = [...box.querySelectorAll('.sheet-svg')].slice(1).map((svg) => svg.querySelector('.sv-measure').dataset.number);
  T.check(numbers.length && eq28(numbers, rowStarts), `둘째 줄부터 줄 첫머리에 마디 번호 (${numbers.join(', ')})`);
  const width = (g) => Number(g.dataset.x1) - Number(g.dataset.x0); // the notes' area, without clef/key/time
  T.check(width(groups[0]) < width(groups[1]), `못갖춘마디가 짧게 그려짐 (${Math.round(width(groups[0]))} < ${Math.round(width(groups[1]))})`);
  const last = groups[groups.length - 1];
  T.check(width(last) < width(groups[1]) * 1.5, `짧은 마지막 줄이 화면 폭으로 늘어나지 않음 (${Math.round(width(last))})`);
  box.remove();
});

T.test('28-4 겹치지 않음', async (T) => {
  const box = sheetBox();
  const keyTest = build28(Array(8).fill('C5:h E5:8 F#5:8 F5:q').join(' | '), {
    changes: { 1: { key: { fifths: 7, mode: 'major' } }, 3: { key: { fifths: -7, mode: 'major' }, clef: 'bass' }, 5: { time: [6, 8] } },
  });
  keyTest.measures[5].notes = N28.parseMeasures('C5:q. E5:8 F#5:8 F5:8')[0].notes;
  keyTest.measures[6].notes = N28.parseMeasures('C5:q. E5:8 F#5:8 F5:8')[0].notes;
  keyTest.measures[7].notes = N28.parseMeasures('C5:q. E5:8 F#5:8 F5:8')[0].notes;
  const scores = [...EXAMPLE_SCORES, keyTest];
  T.check(N28.isValid(keyTest), '조표 7개·바뀜이 든 시험 악보가 올바름');
  const problems = [];
  for (const score of scores) {
    Sheet.draw(box, score);
    for (const group of box.querySelectorAll('.sv-measure')) {
      const prefix = [...group.querySelectorAll('.sv-clef, .sv-key, .sv-time')].map((el) => el.getBBox());
      const prefixRight = prefix.length ? Math.max(...prefix.map((b) => b.x + b.width)) : -Infinity;
      const notes = [...group.querySelectorAll('.sv-note')];
      const lefts = notes.map((n) => {
        const parts = [...n.querySelectorAll('.sv-head, .sv-accidental, [class*="sv-rest"]')].map((el) => el.getBBox());
        return Math.min(...parts.map((b) => b.x));
      });
      if (lefts.length && lefts[0] < prefixRight - 0.5) problems.push(`${score.id} ${group.dataset.number}마디: 첫 음이 조표·박자표와 겹침`);
      const cx = notes.map((n) => n.querySelector('.sv-head, [class*="sv-rest"]')).map((el) => {
        const b = el.getBBox();
        return b.x + b.width / 2;
      });
      for (let i = 1; i < cx.length; i++) {
        if (cx[i] - cx[i - 1] < 12) problems.push(`${score.id} ${group.dataset.number}마디 ${i}번째 음: 간격 ${Math.round(cx[i] - cx[i - 1])}`);
      }
    }
    if (!T.noHorizontalOverflow()) problems.push(`${score.id}: 페이지 가로 스크롤`);
  }
  T.check(!problems.length, `예시 ${EXAMPLE_SCORES.length}곡 + 조표 시험 악보: 조표·박자표·음표가 겹치지 않음 ${problems.slice(0, 3).join('; ')}`);
  box.remove();
});
