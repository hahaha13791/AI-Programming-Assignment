// 31단계 — 악보 패널: 한 줄 악보 띠와 구간 고르기. Run with smoke.js.
const N31 = Notation;
const BASE31 = { time: [4, 4], key: { fifths: 0, mode: 'major' }, clef: 'treble', tempo: 80 };

function chooseScore(id) {
  const select = T.$('score-select');
  select.value = id;
  select.dispatchEvent(new Event('change'));
}
const chip = (length) => document.querySelector(`#length-chips [data-length="${length}"]`);
const pressMeasure = (i) => T.$('score-strip').querySelector(`.sv-hit[data-measure="${i}"]`)
  .dispatchEvent(new MouseEvent('click', { bubbles: true }));
const highlighted = () => [...T.$('score-strip').querySelectorAll('.sv-current')].map((r) => Number(r.dataset.measure)).sort((a, b) => a - b);
// "다음 문제" appears after a submission: answer the section, then press it.
function answerAndNext() {
  T.unlock();
  T.enterNotes(current);
  T.submit();
  T.next();
}
const forget = () => {
  for (const s of scores.list()) Settings.setSection(s.id, null);
  localStorage.removeItem(Settings.SECTIONS_KEY);
};

T.test('31-2 패널 높이와 받아 적기 위치', async (T) => {
  forget();
  const long = N31.build({ id: 'long31', title: '긴 시험 악보', ...BASE31, music: Array(40).fill('C5:q D5:q E5:q F5:q').join(' | ') });
  scores.save(long);
  renderScorePicker();
  const modes = ['melody', 'harmony', 'rhythm', 'score'];
  const tops = modes.map((m) => {
    T.setMode(m);
    return Math.round(T.$('staff-title').getBoundingClientRect().top);
  });
  T.check(tops.every((t) => t === tops[0]), `네 모드의 받아 적기 위치가 같음 (${tops})`);
  T.setMode('score');
  const panel = () => Math.round(document.querySelector('.level-area').getBoundingClientRect().height);
  const heights = ['example-greensleeves', 'example-twinkle', 'long31', 'example-mountain-king'].map((id) => {
    chooseScore(id);
    return panel();
  });
  T.check(heights.every((h) => h === heights[0]), `곡 길이(4~40마디)와 관계없이 패널 높이가 같음 (${heights})`);
  chooseScore('long31');
  const strip = T.$('score-strip');
  T.check(strip.querySelectorAll('.sv-hit').length === 40 && strip.scrollWidth > strip.clientWidth, '40마디가 한 줄 띠에 모두 있고 좌우로 넘침');
  const svg = strip.querySelector('svg');
  T.check(Math.abs(svg.getBoundingClientRect().height - strip.clientHeight) < 1, '띠 그림이 스크롤바를 빼고 남은 높이에 맞음');
  strip.scrollLeft = 0;
  strip.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
  T.check(strip.scrollLeft > 0, '마우스 휠(세로)로 띠가 좌우로 넘어감');
  T.check(T.noHorizontalOverflow(), '페이지 전체에는 가로 스크롤 없음');
  const numbers = [...svg.querySelectorAll('.sv-number')].map((n) => n.textContent);
  T.check(numbers.length === 40 && numbers[0] === '1' && numbers[39] === '40', '모든 마디에 번호');
  scores.remove('long31');
  renderScorePicker();
  chooseScore('example-twinkle');
});

T.test('31-4 길이 칩과 마디 누르기', async (T) => {
  forget();
  T.setMode('score');
  chooseScore('example-twinkle');
  T.check(chip(2).getAttribute('aria-checked') === 'true' && section.label === '1~2마디' && JSON.stringify(highlighted()) === '[0,1]',
    '기본은 첫 마디부터 2마디, 띠에 강조');
  let stopped = 0;
  const stop = Sound.stop;
  Sound.stop = () => { stopped++; stop(); };
  T.$('btn-question').click();
  chip(1).click();
  pressMeasure(4);
  T.check(section.label === '5마디' && JSON.stringify(highlighted()) === '[4]', `1마디 칩 + 5마디 누르기 → 5마디 (${section.label})`);
  T.check(stopped > 0 && T.$('btn-replay').disabled, '재생 중이면 멈추고 새 문제가 됨');
  Sound.stop = stop;
  chip(4).click();
  T.check(section && section.label === '5~8마디' && current.length === 14, '4마디로 늘리면 5~8마디 (14음, 32단계부터 개수 제한 없음)');
  T.check(JSON.stringify(highlighted()) === '[4,5,6,7]', '5~8마디가 강조');
  chip(2).click();
  pressMeasure(10);
  T.check(section.label === '11~12마디', `2마디 칩 + 11마디 → 11~12마디 (${section.label})`);
  pressMeasure(11);
  T.check(section.label === '12마디', '끝에서는 남은 마디까지만');
});

T.test('31-4 직접 고르기', async (T) => {
  forget();
  T.setMode('score');
  chooseScore('example-twinkle');
  chip('custom').click();
  pressMeasure(2);
  T.check(T.$('score-strip').querySelector('.sv-pending[data-measure="2"]') && T.$('strip-hint').textContent.includes('끝 마디'),
    '직접: 첫 누르기는 시작 표시와 안내');
  pressMeasure(1);
  T.check(section?.label === '2~3마디' && JSON.stringify(highlighted()) === '[1,2]', `끝 마디를 앞에 눌러도 두 마디 사이가 구간 (${section?.label})`);
  T.check(!T.$('strip-hint').textContent, '안내가 사라짐');
  answerAndNext();
  T.check(section?.label === '4~5마디', `다음 문제는 같은 길이로 바로 뒤 (${section?.label})`);
});

T.test('31-4 다음 구간·쉼표만 있는 구간', async (T) => {
  forget();
  T.setMode('score');
  const tied = N31.build({ id: 'tied31', title: '붙임줄 시험', ...BASE31, music: 'C5:w | E5:h E5:h~ | E5:h F5:h' });
  T.check(N31.isValid(tied) && soundingCount(tied, 1, 2) === 3 && soundingCount(tied, 2, 2) === 1,
    '붙임줄 묶음은 한 음으로, 앞에서 이어진 음은 그 구간에 넣지 않음');
  // Quarter rests only, so the expansion 4 editor range (practisable before TODO 33).
  const rests = N31.build({ id: 'rests31', title: '쉼표 시험', ...BASE31,
    music: 'C5:w | r:q r:q r:q r:q | r:q r:q r:q r:q | D5:w | E5:h E5:h | F5:h F5:h' });
  T.check(N31.isValid(rests) && !N31.legacyProblem(rests), '쉼표 시험 악보가 올바르고 지금 연습할 수 있음');
  scores.save(rests);
  renderScorePicker();
  chooseScore('rests31');
  chip(1).click();
  pressMeasure(0);
  answerAndNext();
  T.check(section && section.label === '4마디', `쉼표만 있는 2·3마디는 건너뜀 (${section?.label})`);
  pressMeasure(1);
  T.check(section === null && T.$('staff-hint').textContent.includes('음이 없어요'), '쉼표만 있는 마디를 직접 누르면 안내');
  chip(2).click();
  pressMeasure(4);
  answerAndNext();
  T.check(section.label === '1~2마디', `마지막 구간 다음은 처음 (${section.label})`);
  scores.remove('rests31');
  renderScorePicker();
  chooseScore('example-twinkle');
});

T.test('31-4 악보마다 기억', async (T) => {
  forget();
  T.setMode('score');
  chooseScore('example-twinkle');
  chip(1).click();
  pressMeasure(6);
  chooseScore('example-greensleeves');
  T.check(chip(2).getAttribute('aria-checked') === 'true' && JSON.stringify(highlighted()) === '[0,1]', '다른 악보는 그 악보의 기본 구간');
  chip(4).click();
  pressMeasure(2);
  chooseScore('example-twinkle');
  T.check(section.label === '7마디' && chip(1).getAttribute('aria-checked') === 'true', '돌아오면 마지막 구간·길이 그대로');
  const stored = JSON.parse(localStorage.getItem(Settings.SECTIONS_KEY));
  T.check(stored['example-twinkle'].start === 6 && stored['example-greensleeves'].length === 4, '브라우저에 저장되어 다시 열어도 남음');
  T.$('btn-question').click();
  const range = playRange();
  T.check(range.start === 6 && range.end === 6, '문제 듣기는 고른 구간');
  Sound.stop();
  chooseScore('example-greensleeves');
  const g = playRange();
  T.check(g.start === 2 && g.end === 5 && T.$('btn-question').disabled === false, '연습이 잠긴 악보도 고른 구간을 들을 수 있음');
  forget();
  chooseScore('example-twinkle');
  T.setMode('melody');
});
