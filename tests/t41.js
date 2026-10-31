// 41단계 — 확장 6 완성 기준 점검 (PRD #10 확장 6). Run with smoke.js.
{
  const N = Notation;
  const ticker = setInterval(() => {}, 10); // file reads run off the page's thread (pitfalls.md)

  // ---- a small .mxl maker (as in t35) ----
  const enc = (text) => new TextEncoder().encode(text);
  function crc32(bytes) {
    let crc = -1;
    for (const byte of bytes) {
      crc ^= byte;
      for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ -1) >>> 0;
  }
  async function deflateRaw(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function zip(files) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const file of files) {
      const name = enc(file.name);
      const data = await deflateRaw(file.bytes);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(8, 8, true);
      local.setUint32(14, crc32(file.bytes), true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, file.bytes.length, true);
      local.setUint16(26, name.length, true);
      const central = new DataView(new ArrayBuffer(46));
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true);
      central.setUint16(6, 20, true);
      central.setUint16(10, 8, true);
      central.setUint32(16, crc32(file.bytes), true);
      central.setUint32(20, data.length, true);
      central.setUint32(24, file.bytes.length, true);
      central.setUint16(28, name.length, true);
      central.setUint32(42, offset, true);
      locals.push(new Uint8Array(local.buffer), name, data);
      centrals.push(new Uint8Array(central.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const size = centrals.reduce((sum, part) => sum + part.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, size, true);
    end.setUint32(16, offset, true);
    return new Blob([...locals, ...centrals, new Uint8Array(end.buffer)]);
  }
  const HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';
  const mxl = async (xml, path = 'score.musicxml') => zip([
    { name: 'META-INF/container.xml', bytes: enc(`${HEAD}<container><rootfiles><rootfile full-path="${path}"/></rootfiles></container>`) },
    { name: path, bytes: enc(xml) },
  ]);

  // ---- one file with everything: a B♭ clarinet (sounds a major 2nd lower) written in the alto clef, ♩=90,
  // a slashed grace note, a chord, a triplet, |: 1. :| 2. ||, D.C. al Fine ----
  const p = (step, octave, alter) => `<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${octave}</octave></pitch>`;
  const note = (step, octave, duration, type, extra = '') => `<note>${p(step, octave)}<duration>${duration}</duration><voice>1</voice><type>${type}</type>${extra}</note>`;
  const chordNote = (step, octave, duration, type) => `<note><chord/>${p(step, octave)}<duration>${duration}</duration><voice>1</voice><type>${type}</type></note>`;
  const trip = (step, octave, mark) => note(step, octave, 2, 'eighth', `<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>${mark ? `<notations><tuplet type="${mark}"/></notations>` : ''}`);
  const ALL = `${HEAD}<score-partwise version="4.0"><work><work-title>완성 기준 곡</work-title></work>`
    + '<part-list><score-part id="P1"><part-name>Clarinet in B♭</part-name></score-part></part-list><part id="P1">'
    + '<measure number="1"><barline location="left"><repeat direction="forward"/></barline>'
    + '<attributes><divisions>6</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>C</sign><line>3</line></clef>'
    + '<transpose><diatonic>-1</diatonic><chromatic>-2</chromatic></transpose></attributes>'
    + '<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>90</per-minute></metronome></direction-type><sound tempo="90"/></direction>'
    + `<note><grace slash="yes"/>${p('D', 4)}<voice>1</voice><type>eighth</type></note>`
    + note('C', 4, 6, 'quarter') + chordNote('E', 4, 6, 'quarter')
    + trip('D', 4, 'start') + trip('E', 4) + trip('F', 4, 'stop')
    + note('G', 4, 12, 'half') + '</measure>'
    + '<measure number="2"><barline location="left"><ending number="1" type="start"/></barline>' + note('A', 4, 24, 'whole')
    + '<barline location="right"><bar-style>light-heavy</bar-style><ending number="1" type="stop"/><repeat direction="backward"/></barline></measure>'
    + '<measure number="3"><barline location="left"><ending number="2" type="start"/></barline>' + note('B', 4, 24, 'whole')
    + '<barline location="right"><bar-style>light-light</bar-style><ending number="2" type="stop"/></barline></measure>'
    + '<measure number="4"><direction placement="above"><direction-type><words>D.C. al Fine</words></direction-type><sound dacapo="yes"/></direction>'
    + note('C', 5, 24, 'whole') + '<barline location="right"><bar-style>light-heavy</bar-style></barline></measure>'
    + '</part></score-partwise>';
  // Concert pitch (a major 2nd lower): the grace C4, B♭3 + D4, C4 D4 E♭4, F4 | G4 | A4 | B♭4.
  const TOP = 'C4 D4 C4 D4 Eb4 F4 G4 A4 Bb4';
  const BOTTOM = 'C4 Bb3 C4 D4 Eb4 F4 G4 A4 Bb4';
  const name = (pitch) => `${pitch.step}${pitch.alter === -1 ? 'b' : pitch.alter === 1 ? '#' : ''}${pitch.octave}`;
  const text = (list) => list.map(name).join(' ');
  const MIXED = ALL.replace('<beats>4</beats>', '<beats>3+1</beats>');
  const LONG = (count) => `${HEAD}<score-partwise version="4.0"><work><work-title>긴 곡</work-title></work>`
    + '<part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list><part id="P1">'
    + Array.from({ length: count }, (_, i) => `<measure number="${i + 1}">${i ? '' : '<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>'}`
      + ['C', 'D', 'E', 'F'].map((s, k) => note(i % 2 ? 'G' : s, 5, 1, 'quarter', k === 0 && i % 7 === 3 ? '' : '')).join('') + '</measure>').join('')
    + '</part></score-partwise>';

  async function importBox(file, press = true) {
    T.$('btn-new-score').click();
    await importFile(file);
    if (press) T.$('btn-import').click();
  }
  const writeTopOf = () => T.$('staff-title').getBoundingClientRect().top;
  const clean = () => {
    localStorage.removeItem(Scores.STORAGE_KEY);
    localStorage.removeItem(Settings.SECTIONS_KEY);
    localStorage.removeItem(Settings.LINES_KEY);
  };

  T.test('41-1 네 모드·예시 악보·편집기 유지', async (T) => {
    const tops = ['melody', 'harmony', 'rhythm', 'score'].map((m) => {
      T.setMode(m);
      return Math.round(writeTopOf());
    });
    T.check(tops.every((t) => t === tops[0]), `네 모드의 받아 적기 위치가 같음 (${tops})`);
    T.setMode('melody');
    T.check(await T.listen(), '멜로디 모드 재생');
    T.enterNotes(current);
    T.submit();
    T.check(T.resultText().includes('모두 정답'), '멜로디 모드 한 사이클');
    T.setMode('score');
    T.$('score-select').value = 'example-twinkle';
    T.$('score-select').dispatchEvent(new Event('change'));
    await T.listen();
    T.enterNotes(current);
    T.submit();
    T.check(T.resultText().includes('모두 정답'), '예시 악보(반짝반짝 작은 별) 한 사이클');
    T.$('btn-new-score').click();
    T.check(!T.$('new-score').hidden, '[새 악보] → 작은 창');
    T.$('btn-make-score').click();
    T.check(!T.$('editor').hidden && T.$('new-score').hidden, '[직접 만들기] → 편집기');
    T.$('editor-cancel').click();
    T.$('btn-edit-score').click();
    T.check(!T.$('editor').hidden && T.$('editor-title').value === '반짝반짝 작은 별', '예시 악보는 편집기로 열림');
    T.$('editor-cancel').click();
    T.setMode('melody');
  });

  T.test('41-2·41-3·41-4 .mxl 불러오기, 표기·재생, 한 사이클, 알림·저장·삭제', async (T) => {
    T.setMode('score');
    const writeTop = writeTopOf();
    const before = scores.list().length;
    await importBox(new File([await mxl(ALL)], '완성기준.mxl'));
    const id = scoreId;
    const score = scores.get(id);
    T.check(T.$('new-score').hidden && scores.list().length === before + 1 && score.title === '완성 기준 곡', '.mxl을 불러와 저장, 그 악보가 선택됨');

    // 41-2: as written, at concert pitch and its own tempo.
    const m0 = N.resolve(score)[0];
    T.check(m0.clef === 'alto' && m0.key.fifths === -2 && m0.tempo === 90, `알토 음자리표, 실음 조표(♭2), ♩=90 (${m0.clef}, ${m0.key.fifths}, ${m0.tempo})`);
    const all = score.measures.flatMap((m) => m.notes);
    T.check(all[0].grace && all[0].slash && all[1].chord?.length === 1 && all[2].tuplet?.actual === 3, '꾸밈음(사선)·화음·셋잇단음표를 담음');
    T.check(score.measures[0].repeatStart && score.measures[1].repeatEnd && score.measures[1].ending?.text === '1.' && score.measures[2].ending?.text === '2.'
      && score.measures[2].barline === 'double' && score.measures[3].marks?.[0].text === 'D.C. al Fine' && score.measures[3].barline === 'final', '도돌이표·1·2번 괄호·겹세로줄·D.C. al Fine·끝세로줄을 담음');
    const strip = T.$('score-strip').querySelector('svg');
    const drawn = {
      'C 음자리표': strip.querySelector('.sv-clef-c'),
      '조표 ♭2개': strip.querySelectorAll('.sv-key').length === 2,
      화음: strip.querySelector('.sv-note[data-chord="2"]'),
      꾸밈음: strip.querySelector('.sv-note.is-grace .sv-grace-slash'),
      셋잇단: strip.querySelector('.sv-tuplet[data-actual="3"]'),
      도돌이표: strip.querySelectorAll('.sv-barline[data-kind="repeat"]').length === 2,
      괄호: strip.querySelectorAll('.sv-ending').length === 2,
      'D.C. al Fine': [...strip.querySelectorAll('.sv-mark-text')].some((t) => t.textContent === 'D.C. al Fine'),
    };
    const missing = Object.entries(drawn).filter(([, ok]) => !ok).map(([k]) => k);
    T.check(!missing.length, `악보 띠에 원곡 표기 그대로 (빠진 것: ${missing.join(', ') || '없음'})`);
    const events = Playback.schedule(score, { start: 0, end: 3, tonic: false }).events;
    const mains = events.filter((e) => !e.grace);
    const quarter = 60 / 90;
    const t0 = mains[0].start; // after the slashed grace note before the first beat
    T.check(mains.some((e) => e.midi === 58) && mains.some((e) => e.midi === 70) && events[0].grace && events[0].midi === 60,
      '실음으로 재생 (꾸밈음 C4, 화음 아래 B♭3 = 58, 끝 B♭4 = 70)');
    const starts = [60, 62, 63].map((midi) => mains.find((e) => e.midi === midi && e.start > t0 + 0.1).start - t0);
    const want = [quarter, quarter * 4 / 3, quarter * 5 / 3];
    T.check(starts.every((x, k) => Math.abs(x - want[k]) < 1e-6), `원래 빠르기(♩=90)와 셋잇단 박 (${starts.map((x) => x.toFixed(3))})`);
    T.check(events.length === mains.length + 1 && Math.abs(mains[mains.length - 1].start - t0 - quarter * 12) < 1e-6, `적힌 순서대로 4마디(D.C.로 돌아가지 않음), 마지막 음 ${(quarter * 12).toFixed(2)}초`);

    // 41-4: what was changed.
    T.check(T.$('score-notice').textContent.includes('실음'), `바꾼 것 알림 (${T.$('score-notice').textContent})`);

    // 41-3: a cycle with the top line, then the bottom line chosen in ⚙.
    T.$('length-chips').querySelector('[data-length="4"]').click();
    T.$('score-strip').querySelector('.sv-hit[data-measure="0"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    T.check(section?.start === 0 && text(current) === TOP, `구간 1~4마디, 받아 적을 음은 화음 맨 위 (${text(current)})`);
    T.check(await T.listen(), '기준음 → 구간 재생');
    T.enterNotes(current);
    T.submit();
    T.check(/9음 모두 정답/.test(T.resultText()) && document.querySelector('.answer-sheet svg .sv-ending'), `음별 채점과 정답 구간 악보 (${T.resultText().slice(0, 14)})`);
    T.$('btn-settings').click();
    document.querySelector('#settings input[name="line"][value="bottom"]').click();
    T.$('btn-settings').click();
    T.check(text(current) === BOTTOM, `⚙에서 맨 아래 음으로 바꾸면 화음의 아래 음 (${text(current)})`);
    await T.listen();
    const wrong = current.map((x, i) => (i === 1 ? { step: 'C', alter: 0, octave: 4 } : x));
    T.enterNotes(wrong);
    T.submit();
    T.check(/9음 중 8음 정답/.test(T.resultText()), `한 음을 틀리면 그 음만 오답 (${T.resultText().slice(0, 14)})`);
    T.next();
    T.check(section && current.length === 9, `[다음] → 다음 구간 (${section?.label})`);
    T.check(Math.abs(writeTopOf() - writeTop) < 0.5 && T.noHorizontalOverflow(), '받아 적기 영역 위치 그대로, 가로 넘침 없음');

    // 41-4: kept after reopening, the reason for what can't be brought in, and deleting.
    const reopened = Scores.open();
    T.check(JSON.stringify(reopened.get(id)) === JSON.stringify(score) && Settings.getLine(id) === 'bottom', '다시 열어도(새로 읽은 저장소) 악보와 ⚙ 선택이 남음');
    const count = scores.list().length;
    await importBox(new File([MIXED], 'mixed.musicxml'));
    T.check(!T.$('new-score').hidden && T.$('import-status').textContent.includes('혼합 박자') && T.$('import-status').classList.contains('is-error') && scores.list().length === count,
      `불러오지 못한 이유를 창에 (${T.$('import-status').textContent})`);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    T.check(T.$('btn-edit-score').dataset.action === 'edit', '불러온 악보도 [편집] (확장 7부터 모든 악보가 편집기로 열림)');
    T.deleteScore();
    T.check(!scores.get(id) && !Scores.open().get(id) && scores.list().length === count - 1, '삭제하면 저장소에서도 사라짐');
    clean();
    T.$('score-select').value = scores.list()[0].id;
    T.$('score-select').dispatchEvent(new Event('change'));
    T.setMode('melody');
  });

  T.test('41-5 긴 곡·배치', async (T) => {
    T.setMode('score');
    const writeTop = writeTopOf();
    T.$('btn-new-score').click();
    const box = T.$('new-score').getBoundingClientRect();
    T.check(box.left >= -0.5 && box.right <= window.innerWidth + 0.5 && T.noHorizontalOverflow(), `불러오기 창이 화면 안 (${Math.round(box.left)}~${Math.round(box.right)})`);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await importBox(new File([LONG(240)], 'long.musicxml'));
    const id = scoreId;
    T.check(scores.get(id)?.measures.length === 240 && Scores.open().get(id)?.measures.length === 240, '240마디 곡을 불러와 저장');
    const strip = T.$('score-strip');
    T.check(strip.querySelectorAll('.sv-measure').length === 240 && Math.abs(strip.querySelector('svg').getBoundingClientRect().height - strip.clientHeight) < 1.5,
      '한 줄 띠에 240마디, 띠 높이 그대로');
    strip.scrollLeft = strip.scrollWidth;
    strip.querySelector('.sv-hit[data-measure="239"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    T.check(section && section.end === 239, `끝 마디도 고를 수 있음 (${section?.label})`);
    await T.listen();
    T.enterNotes(current);
    T.submit();
    T.check(T.resultText().includes('모두 정답'), '긴 곡 끝 구간 한 사이클');
    T.check(Math.abs(writeTopOf() - writeTop) < 0.5 && T.noHorizontalOverflow(), '받아 적기 영역 위치 그대로, 가로 넘침 없음');
    clean();
    T.$('score-select').value = scores.list()[0].id;
    T.$('score-select').dispatchEvent(new Event('change'));
    T.setMode('melody');
    clearInterval(ticker);
  });
}
