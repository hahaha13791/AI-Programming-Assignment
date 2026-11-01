// 38단계 — 화음. Run with smoke.js.
{
  const N = Notation;
  const ticker = setInterval(() => {}, 10); // file reads run off the page's thread (pitfalls.md)
  const P = (name) => {
    const [, step, acc, octave] = name.match(/^([A-G])(##|#|bb|b)?(\d)$/);
    return { step, alter: { '##': 2, '#': 1, b: -1, bb: -2 }[acc] ?? 0, octave: Number(octave) };
  };
  // chord('q', 'C4 E4~ G4') — a note of that length with every pitch, ~ ties a pitch into the next note; first is written.
  const chord = (type, pitches, dots = 0) => {
    const list = pitches.split(' ').map((t) => ({ pitch: P(t.replace(/[~^]/g, '')), start: t.includes('~'), stop: t.includes('^') }));
    const tie = (x) => (x.start && x.stop ? 'both' : x.start ? 'start' : x.stop ? 'stop' : undefined);
    const note = { type: { q: 'quarter', h: 'half', w: 'whole' }[type] ?? type, dots, pitch: list[0].pitch };
    if (tie(list[0])) note.tie = tie(list[0]);
    if (list.length > 1) note.chord = list.slice(1).map((x) => (tie(x) ? { pitch: x.pitch, tie: tie(x) } : { pitch: x.pitch }));
    return note;
  };
  const score = (measures, extra = {}) => ({
    id: 't38', title: '화음', pickup: false,
    measures: measures.map((notes, i) => (i === 0 ? { time: [4, 4], key: { fifths: 0, mode: 'major' }, clef: 'treble', tempo: 60, notes } : { notes })),
    ...extra,
  });

  T.test('38-2 화음 형식과 검증', async (T) => {
    const ok = score([[chord('q', 'C4 E4 G4'), chord('q', 'D4 F4 A4 C5'), chord('h', 'E4 G4')]]);
    T.check(N.isValid(ok), '2·3·4음 화음 악보는 올바름');
    T.check(!N.isValid(score([[chord('w', 'C4 C4')]])), '같은 음이 두 번인 화음은 걸러짐');
    T.check(!N.isValid(score([[{ type: 'w', dots: 0, rest: true, chord: [{ pitch: P('C4') }] }]])), '쉼표에 붙은 화음은 걸러짐');
    const tied = score([[chord('h', 'C4 E4~ G4'), chord('h', 'D4 E4^ F4')]]);
    T.check(N.isValid(tied), '화음의 한 음만 붙임줄로 이어진 악보는 올바름');
    T.check(!N.isValid(score([[chord('h', 'C4 E4~ G4'), chord('h', 'D4 F4 A4')]])), '이어질 같은 음이 없는 붙임줄은 걸러짐');
    T.check(N.lineOf(tied.measures[0].notes[0], 'top').pitch.step === 'G' && N.lineOf(tied.measures[0].notes[0], 'bottom').pitch.step === 'C', '맨 위 음·맨 아래 음');
    T.check(N.hasChords(tied) && !N.hasChords(EXAMPLE_SCORES[0]), '화음이 든 악보인지');
    T.check(JSON.stringify(N.clean(tied).measures[0].notes[0].chord) === JSON.stringify([{ pitch: P('E4'), tie: 'start' }, { pitch: P('G4') }]), '저장할 때 화음의 음과 붙임줄이 남음');
  });

  T.test('38-2 화음 그리기', async (T) => {
    const box = document.createElement('div');
    box.style.width = '700px';
    document.body.append(box);
    Sheet.draw(box, score([[chord('q', 'C4 E4'), chord('q', 'C4 E4 G4'), chord('q', 'D4 F4 A4 C5'), chord('q', 'C5 D5')]]));
    const groups = [...box.querySelectorAll('.sv-note')];
    T.check(groups.map((g) => g.querySelectorAll('.sv-head').length).join() === '2,3,4,2', '2·3·4음 화음의 머리가 모두 그려짐');
    T.check(groups.every((g) => g.querySelectorAll('.sv-stem').length === 1), '화음마다 기둥 하나');
    const second = groups[3].querySelectorAll('.sv-head');
    const cx = [...second].map((h) => Number(h.getAttribute('cx')));
    T.check(Math.abs(cx[0] - cx[1]) >= 11, `2도 화음(도·레)은 머리를 기둥 반대편으로 비킴 (${cx})`);
    const stem = groups[1].querySelector('.sv-stem');
    const heads = [...groups[1].querySelectorAll('.sv-head')].map((h) => Number(h.getAttribute('cy')));
    T.check(Math.abs(Number(stem.getAttribute('y1')) - Math.max(...heads)) <= 2 && Number(stem.getAttribute('y2')) < Math.min(...heads),
      '기둥이 맨 아래 머리에서 맨 위 머리 너머까지 (위로)');
    // Accidentals: four in a chord close together stack in columns and don't touch.
    Sheet.draw(box, score([[chord('w', 'C#4 E#4 G#4 B#4')]]));
    const signs = [...box.querySelectorAll('.sv-note .sv-accidental')].map((t) => ({ pos: Number(t.dataset.pos), x: Number(t.getAttribute('x')) }));
    const clash = signs.some((a, i) => signs.some((b, j) => i < j && Math.abs(a.pos - b.pos) < 6 && Math.abs(a.x - b.x) < 9));
    T.check(signs.length === 4 && !clash, `화음 안 임시표 4개가 겹치지 않게 줄을 나눠 섬 (${signs.map((s) => `${s.pos}@${Math.round(s.x)}`)})`);
    // A tie on one pitch of a chord only.
    Sheet.draw(box, score([[chord('h', 'C4 E4~ G4'), chord('h', 'D4 E4^ F4')]]));
    T.check(box.querySelectorAll('.sv-tie').length === 1, '화음의 한 음에만 붙임줄 하나');
    box.remove();
  });

  T.test('38-2 화음 재생', async (T) => {
    const r = Playback.schedule(score([[chord('h', 'C4 E4~ G4'), chord('h', 'D4 E4^ F4')]]), { start: 0, end: 0, tonic: false });
    const list = r.events.map((e) => `${e.midi}@${e.start}+${(e.length / Playback.NOTE_SHARE).toFixed(1)}`).join(' ');
    T.check(list === '60@0+2.0 64@0+4.0 67@0+2.0 62@2+2.0 65@2+2.0', `이어진 음(미)만 길게 울림, 나머지는 다시 침 (${list})`);
    T.check(r.events.every((e) => Math.abs(e.peak - Playback.CHORD_PEAK / 3) < 1e-9), '세 음 화음은 음량을 나눔 (합이 화성 모드와 같은 0.5)');
    const four = Playback.schedule(score([[chord('w', 'C4 E4 G4 B4')]]), { start: 0, end: 0, tonic: false });
    T.check(four.events.length === 4 && four.events.every((e) => e.peak === Playback.CHORD_PEAK / 4), '네 음 화음');
    const twinkle = EXAMPLE_SCORES.find((s) => s.id === 'example-twinkle');
    const single = Playback.schedule(twinkle, { start: 0, end: 1, tonic: false });
    T.check(single.events.every((e) => e.peak === Playback.NOTE_PEAK) && single.events.length === 7, '단선율 재생은 그대로 (음량 0.3, 7음)');
  });

  // ---- MusicXML: a right hand with chords; the top note C5 tied over the barline while the bottom moves. ----
  const XN = (name, duration, type, { chordNote, tie } = {}) => {
    const p = P(name);
    return `<note>${chordNote ? '<chord/>' : ''}<pitch><step>${p.step}</step>${p.alter ? `<alter>${p.alter}</alter>` : ''}<octave>${p.octave}</octave></pitch>`
      + `<duration>${duration}</duration>${tie ? `<tie type="${tie}"/>` : ''}<voice>1</voice><type>${type}</type>${tie ? `<notations><tied type="${tie}"/></notations>` : ''}</note>`;
  };
  const xchord = (names, duration, type, ties = {}) => names.map((name, i) => XN(name, duration, type, { chordNote: i > 0, tie: ties[name] })).join('');
  const PIANO = '<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"><work><work-title>화음 연습</work-title></work>'
    + '<part-list><score-part id="P1"><part-name>Piano RH</part-name></score-part></part-list><part id="P1">'
    + '<measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>'
    + '<direction><direction-type><words>x</words></direction-type><sound tempo="60"/></direction>'
    + xchord(['C4', 'E4', 'G4'], 1, 'quarter') + xchord(['D4', 'F4', 'B4'], 1, 'quarter') + xchord(['E4', 'G4', 'C5'], 2, 'half', { C5: 'start' }) + '</measure>'
    + '<measure number="2">' + xchord(['F4', 'A4', 'C5'], 2, 'half', { C5: 'stop' }) + xchord(['E4', 'G4', 'C5'], 2, 'half') + '</measure>'
    + '</part></score-partwise>';

  async function importXml(xml, name) {
    T.$('btn-new-score').click();
    await importFile(new File([xml], name));
    T.$('btn-import').click();
  }
  const text = (list) => list.map((p) => `${p.step}${p.alter ? (p.alter > 0 ? '#' : 'b') : ''}${p.octave}`).join(' ');

  T.test('38-2 변환: 화음과 음마다 붙임줄', async (T) => {
    const result = MusicXML.convert(new DOMParser().parseFromString(PIANO, 'application/xml'), 0, 0);
    const notes = result.score.measures.flatMap((m) => m.notes);
    T.check(notes.length === 5 && notes.every((n) => n.chord?.length === 2), '<chord/> 음이 앞 음의 화음으로 들어감');
    T.check(notes[2].chord.find((c) => c.pitch.step === 'C').tie === 'start' && notes[3].chord.find((c) => c.pitch.step === 'C').tie === 'stop' && !notes[3].tie,
      '화음의 한 음(높은 도)만 마디를 넘어 이어짐');
  });

  T.test('38-4 화음 받아 적기: 맨 위 / 맨 아래', async (T) => {
    T.setMode('score');
    const writeTop = T.$('staff-title').getBoundingClientRect().top;
    T.$('btn-settings').click();
    T.check(T.$('settings-line').hidden, '화음이 없는 악보에서는 ⚙에 받아 적는 음 선택이 없음');
    T.$('btn-settings').click();
    await importXml(PIANO, 'piano-rh.musicxml');
    const id = scoreId;
    T.check(Notation.hasChords(scores.get(id)), '화음 악보를 불러옴');
    T.check(text(current) === 'G4 B4 C5 C5' && Settings.getLine(id) === 'top', `기본은 맨 위 음, 이어진 높은 도는 한 번 (${text(current)})`);
    const tonicTop = scoreTonic().midi;
    const rangeTop = scoreInput.range();
    await T.listen();
    T.enterNotes(current);
    T.submit();
    T.check(/4음 모두 정답/.test(T.resultText()), `맨 위 음으로 한 사이클 (${T.resultText().slice(0, 14)})`);
    T.check(T.$('result-area').querySelector('.sv-note[data-chord="3"]'), '정답 구간 악보는 화음 그대로');
    const written = [...T.$('result-area').querySelectorAll('.answer-sheet .sv-solfege:not(.is-other)')].map((c) => c.textContent).join('');
    T.check(written === '솔시도도', `결과의 받아 적은 음 계이름은 맨 위 음 (${written})`);

    T.$('btn-settings').click();
    const box = T.$('settings').getBoundingClientRect();
    T.check(!T.$('settings-line').hidden && document.querySelector('#settings input[name="line"][value="top"]').checked, '화음 악보에서는 ⚙에 [맨 위 음 | 맨 아래 음], 지금은 맨 위');
    T.check(box.left >= 0 && box.right <= window.innerWidth + 0.5 && T.noHorizontalOverflow(), `⚙ 창이 화면 안 (${Math.round(box.left)}~${Math.round(box.right)})`);
    T.check(Math.abs(T.$('staff-title').getBoundingClientRect().top - writeTop) < 0.5, '⚙ 창이 열려도 받아 적기 영역 위치 그대로');
    document.querySelector('#settings input[name="line"][value="bottom"]').click();
    T.$('btn-settings').click();
    T.check(text(current) === 'C4 D4 E4 F4 E4' && Settings.getLine(id) === 'bottom', `맨 아래 음: 다시 치는 베이스는 모두 (${text(current)})`);
    T.check(scoreTonic().midi < tonicTop, `기준음 옥타브가 아래 줄 음역으로 (${tonicTop} → ${scoreTonic().midi})`);
    T.check(scoreInput.range().low <= rangeTop.low, '입력 음역도 아래 줄로');
    await T.listen();
    T.enterNotes(current);
    T.submit();
    T.check(/5음 모두 정답/.test(T.resultText()), `맨 아래 음으로 한 사이클 (${T.resultText().slice(0, 14)})`);
    T.check(JSON.parse(localStorage.getItem(Settings.LINES_KEY))[id] === 'bottom', '악보별로 브라우저에 기억 (다시 열어도)');
    const other = scores.list()[0].id;
    T.check(Settings.getLine(other) === 'top', '다른 악보는 그대로 맨 위');

    T.deleteScore();
    localStorage.removeItem(Scores.STORAGE_KEY);
    localStorage.removeItem(Settings.LINES_KEY);
    T.$('score-select').value = scores.list()[0].id;
    T.$('score-select').dispatchEvent(new Event('change'));
    T.setMode('melody');
    clearInterval(ticker);
  });
}
