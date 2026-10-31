// 29단계 — 악보 보기: 리듬 표기 (sheet.js). Run with smoke.js.
const N29 = Notation;
const eq29 = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const BASE29 = { key: { fifths: 0, mode: 'major' }, clef: 'treble', tempo: 80 };
const build29 = (music, time = [4, 4], extra = {}) => N29.build({ id: 't29', title: '시험', ...BASE29, time, music, ...extra });

function box29() {
  const box = document.createElement('div');
  box.className = 'staff-area score-area';
  document.querySelector('.practice').append(box);
  return box;
}

const groupSizes = (box) => [...box.querySelectorAll('.sv-beam-group')].map((g) => Number(g.dataset.size));

T.test('29-2 꼬리·빔·쉼표 모양', async (T) => {
  const box = box29();
  Sheet.draw(box, build29('C5:8 r:8 D5:16 r:16 E5:32 r:32 r:16 r:q r:h | r:w'));
  const notes = [...box.querySelectorAll('.sv-note')];
  const flags = notes.filter((n) => !('rest' in n.dataset)).map((n) => n.querySelectorAll('.sv-flag').length);
  T.check(eq29(flags, [1, 2, 3]), `혼자인 8분·16분·32분음표 꼬리 1·2·3개 (${flags})`);
  const hooks = notes.filter((n) => 'rest' in n.dataset && ['eighth', '16th', '32nd'].includes(n.dataset.type))
    .map((n) => `${n.dataset.type}:${n.querySelectorAll('.sv-rest-hook').length}`);
  T.check(eq29(hooks, ['eighth:1', '16th:2', '32nd:3', '16th:2']), `8분·16분·32분쉼표 갈고리 1·2·3개 (${hooks})`);
  T.check(notes.find((n) => n.dataset.type === 'quarter' && 'rest' in n.dataset).querySelector('.sv-rest'), '4분쉼표 모양');
  const blocks = ['half', 'whole'].map((type) => notes.find((n) => n.dataset.type === type).querySelector('.sv-rest-block'));
  T.check(blocks.every(Boolean), '2분·온쉼표는 막대 모양');
  const [half, whole] = blocks.map((b) => b.getBBox());
  T.check(whole.y < half.y, '온쉼표는 넷째 줄에 매달리고 2분쉼표는 가운데 줄 위에 앉음 (온쉼표가 더 위)');
  Sheet.draw(box, build29('C5:16 D5:16 E5:16 F5:16 G5:32 F5:32 E5:32 D5:32 C5:16 B4:16 C5:8. D5:16 E5:8 F5:8 G5:q'));
  const levels = [...box.querySelectorAll('.sv-beam-group')].map((g) => Number(g.dataset.levels));
  T.check(eq29(levels, [2, 3, 2, 1]), `빔 줄 수: 16분 2줄, 32분 3줄, 점8분+16분 2줄, 8분 1줄 (${levels})`);
  const dotted = box.querySelectorAll('.sv-beam-group')[2];
  const stub = [...dotted.querySelectorAll('[data-level="2"]')];
  T.check(stub.length === 1 && stub[0].getBBox().width < 12, '점8분+16분은 16분 쪽에 짧은 둘째 빔');
  box.remove();
});

T.test('29-2 빔 묶음 단위', async (T) => {
  const box = box29();
  Sheet.draw(box, build29('C5:8 D5:8 E5:8 F5:8 G5:8 A5:8', [6, 8]));
  T.check(eq29(groupSizes(box), [3, 3]), `6/8 8분음표 6개 → 3개씩 (${groupSizes(box)})`);
  Sheet.draw(box, build29('C5:16 D5:16 E5:16 F5:16 G5:16 A5:16 B5:16 C6:16', [2, 4]));
  T.check(eq29(groupSizes(box), [4, 4]), `2/4 16분음표 8개 → 4개씩 (${groupSizes(box)})`);
  Sheet.draw(box, build29('C5:16 D5:16 E5:16 F5:16 G5:16 A5:16', [3, 8]));
  T.check(eq29(groupSizes(box), [6]), `3/8 16분음표 6개 → 한 묶음 (${groupSizes(box)})`);
  Sheet.draw(box, build29('C5:8 D5:8 E5:8 F5:8 G5:8 A5:8 B5:8 C6:8'));
  T.check(eq29(groupSizes(box), [2, 2, 2, 2]), `4/4 8분음표 8개 → 2개씩 (${groupSizes(box)})`);
  Sheet.draw(box, build29('C5:8 r:8 D5:8 E5:8', [2, 4]));
  T.check(eq29(groupSizes(box), [2]) && box.querySelectorAll('.sv-flag').length === 1, '쉼표가 끼면 묶지 않음 (첫 8분은 꼬리)');
  Sheet.draw(box, build29('C5:q D5:8 E5:8. F5:16 E5:8', [6, 8]));
  T.check(eq29(groupSizes(box), [3]) && box.querySelectorAll('.sv-flag').length === 1, '6/8 4분+8분은 묶지 않고, 점8분+16분+8분은 한 묶음');
  box.remove();
});

T.test('29-2 붙임줄', async (T) => {
  const box = box29();
  Sheet.draw(box, build29('C5:h~ C5:h | D5:w'));
  const ties = [...box.querySelectorAll('.sv-tie')];
  T.check(ties.length === 1 && ties[0].dataset.half === '', '같은 줄의 붙임줄은 한 번에');
  const heads = [...box.querySelectorAll('.sv-head')].slice(0, 2).map((h) => h.getBBox());
  const tie = ties[0].getBBox();
  T.check(tie.x >= heads[0].x && tie.x + tie.width <= heads[1].x + heads[1].width, '붙임줄이 두 음 머리 사이에 걸침');
  // Five measures: four to a wide row, so the tie from the fourth to the fifth breaks across rows (narrow: 2 to a row).
  Sheet.draw(box, build29('C5:w | C5:w | C5:w | E4:w~ | E4:w'));
  const halves = [...box.querySelectorAll('.sv-tie')].map((t) => t.dataset.half);
  const rows = box.querySelectorAll('.sheet-svg');
  const lastRow = rows[rows.length - 1];
  T.check(eq29(halves, ['start', 'end']) && lastRow.querySelector('.sv-tie[data-half="end"]'), `줄이 바뀌면 끝과 처음에 나눠 그림 (${halves})`);
  Sheet.draw(box, build29('G4:q~ G4:8 A4:8 B4:h'));
  const side = box.querySelector('.sv-tie').getBBox();
  const head = box.querySelector('.sv-head').getBBox();
  T.check(side.y > head.y, '기둥이 위인 음의 붙임줄은 아래쪽');
  box.remove();
});

T.test('29-2 잇단음표', async (T) => {
  const box = box29();
  Sheet.draw(box, build29('3[ C5:8 D5:8 E5:8 ] 3[ F4:q G4:q A4:q ] B4:q', [4, 4]));
  const tuplets = [...box.querySelectorAll('.sv-tuplet')];
  T.check(tuplets.length === 2 && tuplets.every((t) => t.querySelector('.sv-tuplet-number').textContent === '3'), '셋잇단 숫자 3이 두 묶음에');
  T.check(!tuplets[0].querySelector('.sv-tuplet-bracket') && tuplets[1].querySelector('.sv-tuplet-bracket'),
    '빔으로 묶인 8분 셋잇단은 숫자만, 4분 셋잇단은 괄호도');
  const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const parts = [...box.querySelectorAll('.sv-head, .sv-stem, .sv-beam')].map((el) => el.getBBox());
  const clear = tuplets.every((t) => !parts.some((p) => overlaps(t.querySelector('.sv-tuplet-number').getBBox(), p)));
  T.check(clear, '숫자가 음표 머리·기둥·빔과 겹치지 않음');
  Sheet.draw(box, build29('5:4[ C5:16 D5:16 E5:16 F5:16 G5:16 ] A5:q B5:h'));
  T.check(box.querySelector('.sv-tuplet-number').textContent === '5' && groupSizes(box)[0] === 5, '5:4 잇단음표는 숫자 5, 한 묶음');
  box.remove();
});

T.test('29-4 줄 나누기와 겹침', async (T) => {
  const box = box29();
  const elise = EXAMPLE_SCORES.find((s) => s.id === 'example-fur-elise');
  Sheet.draw(box, elise);
  const problems = [];
  for (const group of box.querySelectorAll('.sv-measure')) {
    const cx = [...group.querySelectorAll('.sv-note')].map((n) => {
      const el = n.querySelector('.sv-head') ?? n;
      const b = el.getBBox();
      return b.x + b.width / 2;
    });
    for (let i = 1; i < cx.length; i++) if (cx[i] - cx[i - 1] < 12) problems.push(`${group.dataset.number}마디 ${i}`);
  }
  T.check(!problems.length, `엘리제(16분음표 많은 3/8): 음표 머리 간격 12 이상 ${problems.slice(0, 4).join(', ')}`);
  const perRow = [...box.querySelectorAll('.sheet-svg')].map((svg) => svg.querySelectorAll('.sv-measure').length);
  T.check(perRow.every((n) => n <= (T.width >= 600 ? 4 : 2)), `한 줄 마디 수 (${perRow.join(',')})`);
  const wide = build29(Array.from({ length: 32 }, (_, i) => `${['C5', 'D5', 'E5', 'F5'][i % 4]}:32`).join(' ') + ' | C5:w');
  Sheet.draw(box, wide);
  const rows = [...box.querySelectorAll('.sheet-row')];
  const scrolls = rows.map((r) => r.scrollWidth > r.clientWidth + 1);
  T.check(T.width >= 600 || (scrolls[0] && !scrolls[1]), `휴대폰 폭에서 32분음표 32개 마디는 그 줄만 좌우 스크롤 (${scrolls})`);
  T.check(T.noHorizontalOverflow(), '페이지 전체에는 가로 스크롤 없음');
  box.remove();
});

// The examples drawn whole (the preview this checked until TODO 33 is gone; the drawing is the same).
T.test('29-4 예시 악보 전체', async (T) => {
  const preview = box29();
  for (const id of ['example-fur-elise', 'example-greensleeves', 'example-mountain-king']) {
    Sheet.draw(preview, EXAMPLE_SCORES.find((s) => s.id === id));
    const count = preview.querySelectorAll('.sv-note').length;
    const expected = EXAMPLE_SCORES.find((s) => s.id === id).measures.flatMap((m) => m.notes).length;
    T.check(count === expected, `${id}: 음표·쉼표 ${count}/${expected}개가 모두 그려짐`);
    T.check(T.noHorizontalOverflow() && [...preview.querySelectorAll('.sheet-row')].every((r) => r.scrollWidth <= r.clientWidth + 1),
      '페이지·줄 모두 가로 스크롤 없음');
  }
  preview.remove();
});
