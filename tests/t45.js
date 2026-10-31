// 45단계 — 마디 설정. Run with smoke.js.
{
  const N = Notation;
  const BASE = { id: 's', title: '시험', key: { fifths: 0, mode: 'major' }, tempo: 80, clef: 'treble', time: [4, 4] };
  const build = (music) => N.build({ ...BASE, music });
  const txt = (notes) => notes.map((n) => `${n.rest ? 'r' : `${n.pitch.step}${n.pitch.octave}`}:${n.type}${'.'.repeat(n.dots ?? 0)}`).join(' ');
  const valid = (e) => N.isValid({ ...e.score, id: 'x', title: 'x' });
  const midis = (e) => e.score.measures.flatMap((m) => m.notes).filter((n) => !n.rest).map((n) => N.midi(n.pitch)).join(',');
  const resolved = (e) => N.resolve({ ...e.score, id: 'x', title: 'x' });

  T.test('45-2 마디 설정 (editing.js)', async (T) => {
    const music = 'C4:q D4:q E4:q F4:q | G4:h A4:h | B4:w';
    const e = Editing.create(build(music));
    const removed = e.setTime(3, 4);
    T.check(removed === 3 && e.score.measures.every((m) => N.cmp(N.filled(m.notes), N.frac(3, 4)) === 0) && valid(e),
      `4/4 → 3/4: 마디마다 넘치는 끝 음이 지워지고 개수(${removed})를 알려 줌 (${e.score.measures.map((m) => txt(m.notes)).join(' | ')})`);
    e.undo();
    T.check(txt(e.score.measures[0].notes) === 'C4:quarter D4:quarter E4:quarter F4:quarter' && midis(e) === '60,62,64,65,67,69,71', '되돌리기로 되살아남');
    const w = Editing.create(N.build({ ...BASE, time: [3, 4], music: 'C4:q D4:q E4:q | F4:h. ' }));
    T.check(w.setTime(4, 4) === 0 && txt(w.score.measures[0].notes) === 'C4:quarter D4:quarter E4:quarter r:quarter' && valid(w), '3/4 → 4/4: 쉼표로 채워짐');
    w.select(1, 0);
    T.check(w.setTime(2, 2, 'cut') === 0 && w.score.measures[1].timeSymbol === 'cut' && resolved(w)[0].time.join() === '4,4' && valid(w), '둘째 마디부터 ¢(2/2, 4/4와 같은 길이라 지울 음 없음): 그 마디부터만 바뀜');

    // Key and clef change the drawing only.
    const k = Editing.create(build(music));
    const before = midis(k);
    k.select(1, 0);
    k.setKey(1, 'major');
    k.setClef('bass');
    T.check(midis(k) === before && resolved(k)[1].key.fifths === 1 && resolved(k)[1].clef === 'bass' && resolved(k)[0].clef === 'treble' && valid(k),
      '조표·음자리표를 바꿔도 음높이(MIDI) 그대로, 그 마디부터');
    k.select(0, 2);
    k.setClef('alto', true);
    k.setTempo(120, true);
    T.check(k.score.measures[0].notes[2].clef === 'alto' && k.score.measures[0].notes[2].tempo === 120 && valid(k), '마디 중간 음자리표·빠르기는 그 음부터');
    const events = Playback.schedule({ ...k.score, id: 'x', title: 'x' }, { start: 0, end: 0, tonic: false }).events;
    T.check(Math.abs(events[1].start - 0.75) < 1e-9 && Math.abs(events[3].start - events[2].start - 0.5) < 1e-9, '바꾼 빠르기로 재생 (♩=80 → 셋째 음부터 ♩=120)');
    k.select(1, 0);
    k.setTempo(100);
    T.check(resolved(k)[1].tempo === 100 && !k.setTempo(2000), '마디 빠르기, 범위 밖은 안 됨');

    // Pickup, short measures, numbers.
    const p = Editing.create(build(music));
    T.check(p.setPickup(N.frac(1, 4)) && p.score.pickup && txt(p.score.measures[0].notes) === 'C4:quarter' && valid(p), '못갖춘마디(1박)');
    T.check(resolved(p).map((m) => m.number).join() === '0,1,2', `못갖춘마디는 0번, 다음 마디가 1번 (${resolved(p).map((m) => m.number)})`);
    p.select(2, 0);
    p.setMeasureLength(N.frac(2, 4), true);
    T.check(p.score.measures[2].implicit && resolved(p)[2].numbered === false && valid(p), '짧은 마디(2박), 번호 세지 않기');
    p.setFirstNumber(5);
    T.check(resolved(p)[0].number === 5 && resolved(p)[1].number === 6, '첫 마디 번호 5');
    T.check(!p.setFirstNumber(-1), '음수 번호는 안 됨');
    p.select(1, 0);
    p.insertMeasure();
    T.check(p.score.measures.length === 4 && txt(p.score.measures[1].notes) === 'r:whole' && valid(p), '앞에 마디 넣기: 쉼표 한 마디');
    p.select(0, 0);
    p.insertMeasure();
    T.check(!p.score.pickup && p.score.measures[0].time && p.score.measures[1].implicit && valid(p), '첫 마디 앞에 넣으면 설정이 새 첫 마디로, 옛 못갖춘마디는 번호 없는 짧은 마디로');
    p.deleteMeasure();
    T.check(p.score.measures[0].time && p.score.pickup && valid(p), '첫 마디를 지우면 다음 마디가 설정을 이어받음');
    const fresh = Editing.create(null);
    T.check(fresh.setTime(3, 4) === 0 && txt(fresh.score.measures[0].notes) === 'r:half r:quarter' && fresh.setKey(-2, 'minor') && fresh.setClef('bass'),
      '쉼표뿐인 새 악보에서도 박자·조표·음자리표를 바꿀 수 있음 (43~44단계에서 빠졌던 경우)');
    const one = Editing.create(build('C4:w'));
    T.check(!one.deleteMeasure(), '마디가 하나면 지울 수 없음');
  });

  T.test('45-2 [마디] 탭과 연습 화면', async (T) => {
    T.setMode('score');
    const writeTop = T.$('staff-title').getBoundingClientRect().top;
    T.$('btn-new-score').click();
    T.$('btn-make-score').click();
    const key = (k) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    key('5');
    for (const l of ['c', 'd', 'e', 'f', 'g', 'a', 'b', 'c']) key(l);
    T.$('editor-tab-measure').click();
    T.check(T.$('editor-time-beats').value === '4' && T.$('editor-key').value === '0' && T.$('editor-clef').value === 'treble' && T.$('editor-tempo').value === '120',
      '[마디] 탭이 커서 자리의 박자·조표·음자리표·빠르기를 보여 줌');
    scoreEditor.state.select(0, 0);
    scoreEditor.render();
    T.$('editor-key').value = '1';
    T.$('editor-key-apply').click();
    T.$('editor-time-beats').value = '3';
    T.$('editor-time-apply').click();
    T.check(T.$('editor-status').textContent.includes('2개를 지웠어요') && scoreEditor.state.score.measures[0].key.fifths === 1, `사장조 3/4로: 지운 음 개수 안내 (${T.$('editor-status').textContent})`);
    T.check(T.$('editor-view').querySelectorAll('.sv-key').length >= 1 && T.$('editor-view').querySelector('.sv-time'), '악보에 조표·박자가 그려짐');
    scoreEditor.state.select(1, 1);
    scoreEditor.render();
    T.$('editor-clef').value = 'bass';
    T.$('editor-clef-note').click();
    T.check(scoreEditor.state.score.measures[1].notes[1].clef === 'bass' && T.$('editor-view').querySelector('.sv-measure[data-measure="1"] .sv-clef-group, .sv-measure[data-measure="1"] text'),
      '커서 음부터 낮은음자리표');
    T.$('editor-tab-notes').click();
    T.check(T.$('editor-pad').querySelector('svg[data-clef="bass"]'), '입력 오선도 낮은음자리표');
    T.$('editor-tab-measure').click();
    scoreEditor.state.select(0, 0);
    scoreEditor.render();
    T.$('editor-pickup').value = '1/4';
    T.$('editor-pickup-apply').click();
    T.check(scoreEditor.state.score.pickup && N.cmp(N.filled(scoreEditor.state.score.measures[0].notes), N.frac(1, 4)) === 0, '못갖춘마디 1박');
    T.$('editor-tempo').value = '90';
    T.$('editor-tempo-measure').click();
    const tabsOk = T.noHorizontalOverflow() && [...T.$('editor-tool-measure').querySelectorAll('button, select, input')].every((el) => el.getBoundingClientRect().right <= T.$('editor-tool-measure').getBoundingClientRect().right + 0.5);
    T.check(tabsOk, '[마디] 도구가 화면을 넘치지 않음');
    T.$('editor-title').value = '마디 설정 곡';
    T.$('editor-title').dispatchEvent(new Event('input'));
    T.$('editor-save').click();
    const saved = scores.get(scoreId);
    const m = N.resolve(saved);
    T.check(saved.pickup && m[0].number === 0 && m[0].tempo === 90 && m[0].key.fifths === 1 && m[1].time.join() === '3,4', '저장한 악보: 못갖춘마디·♩=90·사장조·3/4');
    T.check(T.$('score-strip').querySelector('.sv-hit[data-measure="0"]') && section && section.start === 0, '연습 화면의 마디·구간');
    T.check(Math.abs(T.$('staff-title').getBoundingClientRect().top - writeTop) < 0.5 && T.noHorizontalOverflow(), '받아 적기 영역 위치 그대로');
    await T.listen();
    T.enterNotes(current);
    T.submit();
    T.check(T.resultText().includes('모두 정답'), `그 악보로 한 사이클 (${T.resultText().slice(0, 14)})`);
    T.deleteScore();
    localStorage.removeItem(Scores.STORAGE_KEY);
    localStorage.removeItem(Settings.SECTIONS_KEY);
    T.$('score-select').value = scores.list()[0].id;
    T.$('score-select').dispatchEvent(new Event('change'));
    T.setMode('melody');
  });
}
