// 30단계 — 재생: 원래 조·빠르기, 기준음 도/라, ⚙ 빠르기 설정. Run with smoke.js.
const N30 = Notation;
const near = (a, b) => Math.abs(a - b) < 1e-6;
const BASE30 = { key: { fifths: 0, mode: 'major' }, clef: 'treble' };
const build30 = (music, time = [4, 4], tempo = 60, extra = {}) =>
  N30.build({ id: 't30', title: '시험', ...BASE30, time, tempo, music, ...extra });
const starts30 = (r) => r.events.map((e) => +e.start.toFixed(4));
const LEAD = Playback.LEAD_IN;

// Records what Sound.playEvents was given, without sound.
function spyPlay() {
  const calls = [];
  const original = Sound.playEvents;
  Sound.playEvents = (events, total) => {
    calls.push({ events, total });
    return original(events, total);
  };
  return { calls, restore: () => { Sound.playEvents = original; } };
}

T.test('30-2 예약 시각과 음높이', async (T) => {
  const one = (score, opts = {}) => Playback.schedule(score, { start: 0, end: score.measures.length - 1, tonic: false, ...opts });
  let r = one(build30('C5:q. D5:8 E5:8 F5:8', [6, 8], 90));
  T.check(JSON.stringify(starts30(r)) === '[0,1,1.3333,1.6667]' && near(r.total, 2), `6/8 ♩=90: 점4분 1초, 8분 1/3초 (${starts30(r)})`);
  r = one(build30('3[ C5:8 D5:8 E5:8 ] F5:q', [2, 4], 60));
  T.check(JSON.stringify(starts30(r)) === '[0,0.3333,0.6667,1]', `셋잇단 8분은 1/3초씩 (${starts30(r)})`);
  r = one(build30('C5:h~ C5:q D5:q', [4, 4], 60));
  T.check(r.events.length === 2 && near(r.events[0].length, 3 * Playback.NOTE_SHARE) && near(r.events[1].start, 3),
    '붙임줄로 이은 음은 한 번, 이은 길이만큼 울림');
  r = one(build30('C5:w | C5:q C5:q C5:q C5:q', [4, 4], 60, { changes: { 1: { tempo: 120 } } }));
  T.check(JSON.stringify(starts30(r)) === '[0,4,4.5,5,5.5]' && near(r.total, 6), `곡 중간 빠르기 바뀜 (${starts30(r)})`);
  r = Playback.schedule(build30('r:q C5:q D5:h'), { start: 0, end: 0, tonic: true });
  T.check(near(r.events[1].start, LEAD + 1) && r.events.length === 3, '쉼표로 시작하면 그만큼 기다린 뒤 첫 음');
  const midis = r.events.slice(1).map((e) => e.midi);
  T.check(JSON.stringify(midis) === '[72,74]', `음높이 MIDI (${midis})`);
  const tieAcross = build30('C5:h G4:h~ | G4:h E4:h | F4:w');
  r = Playback.schedule(tieAcross, { start: 1, end: 1, tonic: false });
  T.check(r.events.length === 1 && r.events[0].midi === 64 && near(r.events[0].start, 2), '앞 구간에서 이어진 붙임줄 음은 소리 없이 기다림');
  r = Playback.schedule(tieAcross, { start: 0, end: 0, tonic: false });
  T.check(near(r.events[1].length, 4 * Playback.NOTE_SHARE) && near(r.total, 6), '구간 밖으로 이어지는 붙임줄 음은 끝까지 울림');
  const greens = EXAMPLE_SCORES.find((s) => s.id === 'example-greensleeves');
  r = Playback.schedule(greens, { start: 0, end: 1, tonic: false });
  T.check(near(r.events[0].length, (2 / 3) * 0.9 * 0.5) && r.events.length === 6, '그린슬리브스 못갖춘마디(8분, ♩=90) + 1마디');
});

T.test('30-2 기준음 도/라', async (T) => {
  const greens = EXAMPLE_SCORES.find((s) => s.id === 'example-greensleeves');
  const g = Playback.tonicOf(greens, 0, 1);
  T.check(g.label === '라' && g.midi % 12 === 9, `가단조 → 기준음 라(A) (${g.midi})`);
  const king = Playback.tonicOf(EXAMPLE_SCORES.find((s) => s.id === 'example-mountain-king'), 0, 1);
  T.check(king.label === '라' && king.midi % 12 === 11 && king.midi < 55, `나단조(낮은음자리표) → 라(B), 낮은 옥타브 (${king.midi})`);
  const twinkle = EXAMPLE_SCORES.find((s) => s.id === 'example-twinkle');
  T.check(Playback.tonicOf(twinkle, 0, 1).midi === 60 && Playback.tonicOf(twinkle, 0, 1).label === '도', '다장조 반짝반짝 → 도(C4)');
  const change = build30('C5:w | A4:w | B4:w', [4, 4], 60, { changes: { 1: { key: { fifths: -3, mode: 'minor' } }, 2: { key: { fifths: 2, mode: 'major' } } } });
  const t1 = Playback.tonicOf(change, 1, 1);
  const t2 = Playback.tonicOf(change, 2, 2);
  T.check(t1.label === '라' && t1.midi % 12 === 0 && t2.label === '도' && t2.midi % 12 === 2, `조 바꿈 뒤 구간은 새 조의 기준음 (다단조 C, 라장조 D)`);
  T.setMode('score');
  const select = T.$('score-select');
  select.value = 'example-greensleeves';
  select.dispatchEvent(new Event('change'));
  T.check(T.$('btn-tonic').textContent === '기준음(라) 듣기', '단조 곡이면 버튼이 "기준음(라) 듣기"');
  select.value = 'example-twinkle';
  select.dispatchEvent(new Event('change'));
  T.check(T.$('btn-tonic').textContent === '기준음(도) 듣기', '장조 곡이면 "기준음(도) 듣기"');
  T.setMode('melody');
  T.check(T.$('btn-tonic').textContent === '기준음(도) 듣기', '멜로디 모드는 그대로');
});

T.test('30-2 반짝반짝 작은 별은 확장 4와 같게', async (T) => {
  T.setMode('score');
  const spy = spyPlay();
  T.check(await T.listen(), '재생 후 입력 풀림');
  const old = Score.schedule(section.notes, { tonic: true });
  const got = spy.calls[0];
  spy.restore();
  const same = got && got.events.length === old.events.length && got.events.every((e, i) =>
    near(e.start, old.events[i].start) && near(e.length, old.events[i].length) && e.midi === old.events[i].midi);
  T.check(same && near(got.total, old.total), '원래 빠르기에서 확장 4의 재생 예약과 같음 (기준음 C4 포함)');
  T.setMode('melody');
});

T.test('30-2 잠긴 새 예시도 처음 2마디 듣기', async (T) => {
  T.setMode('score');
  const select = T.$('score-select');
  select.value = 'example-fur-elise';
  select.dispatchEvent(new Event('change'));
  T.check(!T.$('btn-question').disabled, '문제 듣기를 누를 수 있음');
  const spy = spyPlay();
  T.$('btn-question').click();
  spy.restore();
  const elise = EXAMPLE_SCORES.find((s) => s.id === 'example-fur-elise');
  const expected = Playback.schedule(elise, { start: 0, end: 1, tonic: true });
  T.check(spy.calls.length === 1 && spy.calls[0].events.length === expected.events.length, `못갖춘마디 + 1마디가 재생됨 (음 ${expected.events.length - 1}개 + 기준음)`);
  await T.wait(expected.total * 1000 + 200);
  T.check(staff && T.$('score-preview').hidden === false && current === null && T.$('staff-hint').textContent.includes('곧 그려져요'),
    '재생이 끝나도 입력은 열리지 않음 (33단계까지)');
  T.check(!T.$('btn-replay').disabled, '다시 듣기는 누를 수 있음');
  select.value = 'example-twinkle';
  select.dispatchEvent(new Event('change'));
  T.setMode('melody');
});

T.test('30-4 빠르기 설정', async (T) => {
  const s = build30('C5:q D5:q E5:h');
  const at = (speed) => Playback.schedule(s, { start: 0, end: 0, tonic: true, speed });
  T.check(near(at(0.75).total - LEAD, (at(1).total - LEAD) / 0.75) && near(at(0.5).events[2].start - LEAD, 2),
    '느리게(75%)는 1/0.75배, 아주 느리게(50%)는 2배 길이 (기준음 앞부분은 그대로)');
  T.setMode('score');
  T.check(!T.$('btn-settings').hidden, '내 악보에서 ⚙ 보임');
  T.$('btn-settings').click();
  const box = T.$('settings');
  T.check(!box.hidden && T.$('btn-settings').getAttribute('aria-expanded') === 'true', '⚙을 누르면 설정 창');
  T.check(document.activeElement?.name === 'speed' && document.activeElement.checked, '열면 고른 빠르기에 초점');
  const rect = box.getBoundingClientRect();
  T.check(rect.left >= 0 && rect.right <= document.documentElement.clientWidth, `설정 창이 화면 안에 (${Math.round(rect.left)}~${Math.round(rect.right)})`);
  const slow = box.querySelector('input[value="0.5"]');
  slow.click();
  T.check(Settings.get('speed') === 0.5 && JSON.parse(localStorage.getItem(Settings.STORAGE_KEY)).speed === 0.5, '아주 느리게를 고르면 저장됨');
  const spy = spyPlay();
  T.$('btn-question').click();
  spy.restore();
  const expected = Playback.schedule(scores.get(scoreId), { start: section.start, end: section.end, tonic: true, speed: 0.5 });
  T.check(spy.calls[0] && near(spy.calls[0].total, expected.total), '문제 듣기에 빠르기가 적용됨');
  Sound.stop();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  T.check(box.hidden && document.activeElement === T.$('btn-settings'), 'Esc로 닫히고 ⚙으로 초점이 돌아감');
  T.$('btn-settings').click();
  document.querySelector('h1').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  T.check(box.hidden, '바깥을 누르면 닫힘');
  T.setMode('melody');
  T.check(T.$('btn-settings').hidden, '다른 모드에서는 ⚙ 없음');
  T.setMode('score');
});

T.test('30-4 받아 적기 위치와 저장소 막힘', async (T) => {
  const tops = ['melody', 'harmony', 'rhythm', 'score'].map((m) => {
    T.setMode(m);
    return Math.round(T.$('staff-title').getBoundingClientRect().top * 10) / 10;
  });
  T.check(tops.every((top) => top === tops[0]), `⚙이 생겨도 네 모드의 받아 적기 위치가 같음 (${tops})`);
  // Settings when localStorage throws: load the module again with storage blocked.
  const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
  const saved = window.Settings;
  Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  const script = document.createElement('script');
  script.src = document.querySelector('script[src*="settings.js"]').src;
  await new Promise((resolve) => { script.onload = resolve; document.head.append(script); });
  const blocked = window.Settings;
  T.check(blocked !== saved && blocked.get('speed') === 1, '저장소가 막히면 기본값(원래 빠르기)');
  T.check(blocked.set('speed', 0.75) === false && blocked.get('speed') === 0.75, '막혀도 이번 방문에는 바꾼 값이 적용됨');
  if (descriptor) Object.defineProperty(window, 'localStorage', descriptor);
  else delete window.localStorage;
  window.Settings = saved;
  localStorage.removeItem(Settings.STORAGE_KEY);
  Settings.set('speed', 1);
  localStorage.removeItem(Settings.STORAGE_KEY);
  T.setMode('melody');
});
