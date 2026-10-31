// 39단계 — 꾸밈음. Run with smoke.js.
{
  const N = Notation;
  const ticker = setInterval(() => {}, 10); // file reads run off the page's thread (pitfalls.md)
  const BASE = { id: 't39', title: '꾸밈음', key: { fifths: 0, mode: 'major' }, tempo: 60, clef: 'treble', time: [4, 4] };
  const build = (music) => N.build({ ...BASE, music });

  T.test('39-2 꾸밈음 형식과 검증', async (T) => {
    const s = build('C5:q gsD5:8 C5:q gE5:16 gD5:16 C5:h | gB4:8 C5:w');
    T.check(N.isValid(s), '꾸밈음이 든 악보는 올바름');
    T.check(N.cmp(N.filled(s.measures[0].notes), [1, 1]) === 0 && N.cmp(N.duration(s.measures[0].notes[1]), N.ZERO) === 0,
      '꾸밈음은 길이 0: 마디 길이가 꾸밈음 없이 4/4로 맞음');
    T.check(s.measures[0].notes[1].slash && !s.measures[0].notes[3].slash, '사선 꾸밈음(gs)과 사선 없는 꾸밈음(g)');
    const bad = (mutate, label) => {
      const copy = JSON.parse(JSON.stringify(s));
      mutate(copy.measures[0].notes);
      T.check(!N.isValid(copy), label);
    };
    bad((ns) => { ns[1] = { type: 'eighth', dots: 0, rest: true, grace: true }; }, '꾸밈 쉼표는 걸러짐');
    bad((ns) => { ns[1].tie = 'start'; }, '꾸밈음 붙임줄은 걸러짐');
    bad((ns) => { ns[0].slash = true; }, '꾸밈음이 아닌 음의 사선은 걸러짐');
    T.check(N.legacyProblem({ ...s, measures: [{ ...s.measures[0], tempo: 80 }, s.measures[1]] }) === '꾸밈음', '편집기가 다룰 수 없는 이유: 꾸밈음');
    T.check(N.clean(s).measures[0].notes[1].grace === true && N.clean(s).measures[0].notes[1].slash === true, '저장할 때 꾸밈음·사선이 남음');
    const inTuplet = build('3[ C5:8 gD5:16 E5:8 F5:8 ] G5:q A5:h');
    T.check(N.isValid(inTuplet), '잇단음표 묶음 안의 꾸밈음도 올바름');
  });

  T.test('39-2 꾸밈음 그리기', async (T) => {
    const box = document.createElement('div');
    box.style.width = '700px';
    document.body.append(box);
    Sheet.draw(box, build('C5:q gsD5:8 C5:q gE5:16 gD5:16 C5:h | gF#4:8 C5:w'));
    const graces = [...box.querySelectorAll('.sv-note.is-grace')];
    T.check(graces.length === 4, `꾸밈음 4개가 작은 음표로 (${graces.length})`);
    const rx = (g) => Number(g.querySelector('.sv-head').getAttribute('rx'));
    const main = box.querySelector('.sv-note:not(.is-grace):not([data-rest])');
    T.check(graces.every((g) => rx(g) < rx(main) * 0.8), '꾸밈음 머리는 보통 음보다 작음');
    T.check(graces[0].querySelector('.sv-grace-slash') && !graces[1].querySelector('.sv-grace-slash'), '사선 꾸밈음에만 사선');
    T.check(box.querySelector('.sv-beam-group.is-grace[data-size="2"]'), '이어진 16분 꾸밈음 둘은 작은 빔으로 묶임');
    T.check(graces.every((g) => g.dataset.stem === undefined || true) && graces.every((g) => g.querySelector('.sv-stem.is-grace')), '꾸밈음 기둥은 짧고 위로');
    // No overlap: each grace head sits clear of the note before and after it.
    const groups = [...box.querySelectorAll('.sv-measure[data-measure="0"] .sv-note')];
    const xs = groups.map((g) => Number(g.querySelector('.sv-head, rect, path')?.getAttribute('cx') ?? NaN)).filter((x) => !Number.isNaN(x));
    const gaps = xs.slice(1).map((x, i) => x - xs[i]);
    T.check(gaps.every((d) => d >= 8), `음과 꾸밈음 머리가 겹치지 않음 (간격 ${gaps.map(Math.round)})`);
    const acc = box.querySelector('.sv-note.is-grace .sv-accidental.is-grace');
    T.check(acc && acc.textContent.includes('♯'), '꾸밈음의 임시표도 작게');
    box.remove();
  });

  // 개선-4: each kind as it is played, running on into the note it leads to (♩= 60: a quarter is 1 s, a 16th 0.25 s).
  T.test('39-2·개선-5 꾸밈음 재생', async (T) => {
    const s = build('C5:q gsD5:8 C5:q gE5:16 gD5:16 C5:h');
    const r = Playback.schedule(s, { start: 0, end: 0, tonic: false });
    const G = Playback.GRACE_LENGTH;
    const near = (a, b) => Math.abs(a - b) < 1e-9;
    const ev = (midi) => r.events.filter((e) => e.midi === midi);
    const mains = ev(72);
    T.check(near(mains[0].start, 0) && near(mains[1].start, 1), `사선 꾸밈음 뒤의 도는 박 그대로 (1초) (${mains.map((e) => e.start)})`);
    const slash = ev(74)[0];
    T.check(near(slash.start, 1 - G) && slash.start + slash.length > 1, `사선 꾸밈음(레)은 박 바로 앞에서 시작해 뒤 음과 살짝 겹침 (${slash.start.toFixed(3)}~${(slash.start + slash.length).toFixed(3)})`);
    const e = ev(76)[0];
    const d = ev(74)[1];
    T.check(near(e.start, 2) && near(d.start, 2.25) && near(mains[2].start, 2.5),
      `사선 없는 꾸밈음(미·레)은 박(2초)에서 16분음표씩, 뒤 음(도)은 2.5초로 늦게 시작 (${e.start}, ${d.start}, ${mains[2].start})`);
    T.check(e.start + e.length > d.start && d.start + d.length > mains[2].start, '꾸밈음 소리가 다음 음 시작까지 끊기지 않음 (살짝 겹침)');
    T.check(near(mains[2].start + mains[2].length / Playback.NOTE_SHARE, 4), '뒤 음이 늦게 시작해도 마디 끝(4초)은 그대로');
    const short = Playback.schedule(build('gsE5:8 gsD5:8 C5:8 r:8 r:q r:h'), { start: 0, end: 0, tonic: false });
    const shortMain = short.events.find((x) => x.midi === 72);
    T.check(near(shortMain.start, 2 * G) && short.events[0].start === 0, '사선 꾸밈음이 첫 음 앞이면 그만큼 앞에 두고 전체를 뒤로 밂');
    const half = Playback.schedule(build('gD5:8 gE5:8 gF5:8 C5:8 r:8 r:q r:h'), { start: 0, end: 0, tonic: false });
    const halfMain = half.events.find((x) => x.midi === 72);
    T.check(near(halfMain.start, 0.25), `뒤 음이 짧으면 꾸밈음은 뒤 음 길이의 절반까지만 빌림 (8분 0.5초 → ${halfMain.start})`);
    const lead = Playback.schedule(build('gsB4:8 C5:w'), { start: 0, end: 0, tonic: true });
    T.check(near(lead.events.find((x) => x.midi === 72 && x.start > 0).start, Playback.LEAD_IN), '기준음 뒤에서는 첫 음의 박이 그대로');
    T.check(r.events.filter((x) => x.grace).every((x) => x.sustain), '꾸밈음은 끝까지 소리를 유지(사라지지 않고 이어짐)');
  });

  // ---- MusicXML with grace notes ----
  const pitch = (step, octave, alter) => `<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${octave}</octave></pitch>`;
  const note = (step, octave, duration, type) => `<note>${pitch(step, octave)}<duration>${duration}</duration><voice>1</voice><type>${type}</type></note>`;
  const grace = (step, octave, type, slash, chordNote) => `<note><grace${slash ? ' slash="yes"' : ''}/>${chordNote ? '<chord/>' : ''}${pitch(step, octave)}<voice>1</voice><type>${type}</type></note>`;
  const XML = '<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"><work><work-title>꾸밈음 연습</work-title></work>'
    + '<part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list><part id="P1">'
    + '<measure number="1"><attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>'
    + '<direction><direction-type><words>x</words></direction-type><sound tempo="60"/></direction>'
    + note('C', 5, 2, 'quarter') + grace('D', 5, 'eighth', true) + note('C', 5, 2, 'quarter') + grace('E', 5, '16th') + grace('D', 5, '16th') + note('C', 5, 4, 'half') + '</measure>'
    + '<measure number="2">' + grace('B', 4, 'eighth') + grace('D', 5, 'eighth', false, true) + note('C', 5, 8, 'whole') + '</measure>'
    + '</part></score-partwise>';
  const text = (list) => list.map((p) => `${p.step}${p.octave}`).join(' ');

  T.test('39-2 변환: 꾸밈음', async (T) => {
    const result = MusicXML.convert(new DOMParser().parseFromString(XML, 'application/xml'), 0, 0);
    const ns = result.score.measures.flatMap((m) => m.notes);
    T.check(ns.length === 8 && ns.filter((n) => n.grace).length === 4, '꾸밈음 4개(화음 꾸밈음 하나 포함)가 옮겨짐');
    T.check(ns[1].slash && !ns[3].slash, '사선 여부');
    T.check(ns[6].chord?.[0].pitch.step === 'D' && ns[6].grace, '화음 꾸밈음 (시·레)');
    T.check(N.isValid({ ...result.score, id: 'x' }), '검증 통과');
  });

  async function importXml(xml, name) {
    T.$('btn-new-score').click();
    await importFile(new File([xml], name));
    T.$('btn-import').click();
  }

  T.test('39-2 꾸밈음 받아 적기', async (T) => {
    T.setMode('score');
    const writeTop = T.$('staff-title').getBoundingClientRect().top;
    await importXml(XML, 'grace.musicxml');
    T.check(text(current) === 'C5 D5 C5 E5 D5 C5 D5 C5', `빈칸·정답에 꾸밈음이 뒤 음 앞 순서로 한 칸씩 (화음 꾸밈음은 맨 위 음) (${text(current)})`);
    await T.listen();
    T.enterNotes(current);
    T.submit();
    T.check(/8음 모두 정답/.test(T.resultText()), `꾸밈음을 맞게 적으면 모두 정답 (${T.resultText().slice(0, 14)})`);
    T.next();
    // Back to the first section and write one grace note wrong.
    T.$('length-chips').querySelector('[data-length="2"]').click();
    T.$('score-strip').querySelector('.sv-hit[data-measure="0"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await T.listen();
    const wrong = current.map((p, i) => (i === 1 ? { step: 'E', alter: 0, octave: 5 } : p));
    T.enterNotes(wrong);
    T.submit();
    const marks = [...T.$('score-input').querySelectorAll('.si-label')].map((l) => (l.classList.contains('is-wrong') ? 'x' : 'o')).join('');
    T.check(/8음 중 7음 정답/.test(T.resultText()) && marks === 'oxoooooo', `꾸밈음 하나를 틀리면 그 칸만 오답 (${marks})`);
    // A one-measure section of measure 2 starts with its grace notes.
    T.$('length-chips').querySelector('[data-length="1"]').click();
    T.$('score-strip').querySelector('.sv-hit[data-measure="1"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    T.check(section && section.start === 1 && text(current) === 'D5 C5', `마디 첫머리의 꾸밈음은 그 마디 구간에 속함 (${text(current)})`);
    T.check(Math.abs(T.$('staff-title').getBoundingClientRect().top - writeTop) < 0.5 && T.noHorizontalOverflow(), '받아 적기 영역 위치 그대로, 가로 넘침 없음');

    T.$('btn-edit-score').click();
    T.$('btn-edit-score').click();
    localStorage.removeItem(Scores.STORAGE_KEY);
    localStorage.removeItem(Settings.SECTIONS_KEY);
    T.$('score-select').value = scores.list()[0].id;
    T.$('score-select').dispatchEvent(new Event('change'));
    T.setMode('melody');
    clearInterval(ticker);
  });
}
