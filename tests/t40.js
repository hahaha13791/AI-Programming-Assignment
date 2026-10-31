// 40단계 — 도돌이표와 기호. Run with smoke.js.
{
  const N = Notation;
  const ticker = setInterval(() => {}, 10); // file reads run off the page's thread (pitfalls.md)
  const BASE = { id: 't40', title: '도돌이표', key: { fifths: 0, mode: 'major' }, tempo: 60, clef: 'treble', time: [4, 4] };
  const build = (music, changes) => N.build({ ...BASE, music, changes });

  // ---- MusicXML: |: segno | | 1. :| 2. To Coda | D.S. al Coda || Coda |] ----
  const pitch = (step, octave) => `<pitch><step>${step}</step><octave>${octave}</octave></pitch>`;
  const whole = (step, octave) => `<note>${pitch(step, octave)}<duration>4</duration><voice>1</voice><type>whole</type></note>`;
  const words = (text, extra = '') => `<direction placement="above"><direction-type><words>${text}</words></direction-type>${extra}</direction>`;
  const sign = (name) => `<direction placement="above"><direction-type><${name}/></direction-type></direction>`;
  const left = (inner) => `<barline location="left">${inner}</barline>`;
  const right = (inner) => `<barline location="right">${inner}</barline>`;
  const ATTRS = '<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>';
  const part = (id, measures) => `<part id="${id}">${measures.map((m, i) => `<measure number="${i + 1}">${m}</measure>`).join('')}</part>`;
  const P1 = [
    left('<repeat direction="forward"/>') + ATTRS + '<direction><direction-type><segno/></direction-type><sound tempo="60" segno="s"/></direction>' + whole('C', 5),
    whole('D', 5),
    left('<ending number="1" type="start"/>') + whole('E', 5) + right('<bar-style>light-heavy</bar-style><ending number="1" type="stop"/><repeat direction="backward"/>'),
    left('<ending number="2" type="start"/>') + whole('F', 5)
      + '<direction placement="above"><direction-type><words>To Coda</words></direction-type><direction-type><coda/></direction-type><sound tocoda="c"/></direction>'
      + right('<ending number="2" type="discontinue"/>'),
    whole('G', 5) + words('D.S. al Coda', '<sound dalsegno="s"/>') + right('<bar-style>light-light</bar-style>'),
    sign('coda') + words('Coda') + whole('A', 5) + right('<bar-style>light-heavy</bar-style>'),
  ];
  // The second part repeats the segno (parts often do): it is taken once.
  const P2 = [ATTRS + sign('segno') + whole('C', 4), whole('D', 4), whole('E', 4), whole('F', 4), whole('G', 4), whole('A', 4)];
  const XML = '<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"><work><work-title>도돌이표 연습</work-title></work>'
    + '<part-list><score-part id="P1"><part-name>Flute</part-name></score-part><score-part id="P2"><part-name>Cello</part-name></score-part></part-list>'
    + part('P1', P1) + part('P2', P2) + '</score-partwise>';
  const doc = () => new DOMParser().parseFromString(XML, 'application/xml');
  const text = (list) => list.map((p) => `${p.step}${p.octave}`).join(' ');

  T.test('40-2 도돌이표 형식과 검증', async (T) => {
    const s = build('C5:w | D5:w | E5:w | F5:w', {
      0: { repeatStart: true, marks: [{ kind: 'segno', at: 'start' }] },
      1: { ending: { text: '1.', start: true, end: 'stop' }, repeatEnd: true },
      2: { ending: { text: '2.', start: true } },
      3: { ending: { text: '2.', end: 'open' }, barline: 'final', marks: [{ kind: 'text', text: 'D.S. al Fine', at: 'end' }] },
    });
    T.check(N.isValid(s), '도돌이표·괄호·기호가 든 악보는 올바름');
    T.check(s.measures[0].repeatStart && s.measures[1].repeatEnd && s.measures[3].ending.end === 'open' && s.measures[3].marks[0].text === 'D.S. al Fine',
      '저장할 때(clean) 도돌이표·괄호·기호가 남음');
    const bad = (mutate, label) => {
      const copy = JSON.parse(JSON.stringify(s));
      mutate(copy.measures);
      T.check(!N.isValid(copy), label);
    };
    bad((ms) => { delete ms[2].ending.start; }, '시작 없는 괄호는 걸러짐');
    bad((ms) => { delete ms[3].ending; }, '닫히지 않은 괄호는 걸러짐');
    bad((ms) => { ms[3].ending.text = '3.'; }, '괄호 중간에 번호가 바뀌면 걸러짐');
    bad((ms) => { ms[1].barline = 'double'; }, '도돌이 끝과 겹세로줄을 함께 적으면 걸러짐');
    bad((ms) => { ms[0].barline = 'dashed'; }, '모르는 세로줄은 걸러짐');
    bad((ms) => { ms[0].marks = [{ kind: 'fermata', at: 'start' }]; }, '모르는 기호는 걸러짐');
    bad((ms) => { ms[3].marks[0].text = 'x'.repeat(N.MAX_MARK + 1); }, '너무 긴 글자는 걸러짐');
    bad((ms) => { ms[0].repeatStart = 'yes'; }, '도돌이표 값이 true가 아니면 걸러짐');
    const plain = build('C5:w | D5:w', { 0: { repeatStart: true }, 1: { repeatEnd: true } });
    T.check(N.legacyProblem({ ...plain, measures: plain.measures.map((m, i) => (i ? m : { ...m, tempo: 80 })) }) === '도돌이표', '편집기가 다룰 수 없는 이유: 도돌이표');
    const ex = N.excerpt(s, 3, 3);
    T.check(ex.measures[0].ending?.end === 'open' && ex.measures[0].marks?.length === 1, '구간(정답 악보)에도 그 마디의 괄호·기호가 남음');
  });

  T.test('40-2 변환: 도돌이표·괄호·D.S. al Coda', async (T) => {
    const { score } = MusicXML.convert(doc(), 0, 0);
    const ms = score.measures;
    T.check(N.isValid({ ...score, id: 'x' }), '검증 통과');
    T.check(ms.length === 6 && N.resolve(score).map((m) => m.number).join(',') === '1,2,3,4,5,6', `마디 수·번호가 원본과 같음 (펼치지 않음) (${ms.length})`);
    T.check(text(ms.map((m) => m.notes[0].pitch)) === 'C5 D5 E5 F5 G5 A5', '마디 순서가 적힌 그대로');
    T.check(ms[0].repeatStart && !ms[0].repeatEnd, '1마디: 도돌이 시작');
    T.check(JSON.stringify(ms[0].marks) === '[{"kind":"segno","at":"start"}]', `1마디: 세뇨 하나 (여러 파트에 겹쳐 적힌 것은 하나로) (${JSON.stringify(ms[0].marks)})`);
    T.check(JSON.stringify(ms[2].ending) === '{"text":"1.","start":true,"end":"stop"}' && ms[2].repeatEnd && !ms[2].barline, `3마디: 1번 괄호(닫힘)와 도돌이 끝 (${JSON.stringify(ms[2].ending)})`);
    T.check(JSON.stringify(ms[3].ending) === '{"text":"2.","start":true,"end":"open"}', `4마디: 2번 괄호(열림) (${JSON.stringify(ms[3].ending)})`);
    T.check(ms[3].marks?.some((m) => m.kind === 'coda' && m.at === 'end') && ms[3].marks.some((m) => m.text === 'To Coda' && m.at === 'end'), '4마디: To Coda와 코다 기호는 마디 끝');
    T.check(ms[4].barline === 'double' && JSON.stringify(ms[4].marks) === '[{"kind":"text","text":"D.S. al Coda","at":"end"}]', `5마디: 겹세로줄, D.S. al Coda는 마디 끝 (${JSON.stringify(ms[4].marks)})`);
    T.check(ms[5].barline === 'final' && ms[5].marks?.[0].kind === 'coda' && ms[5].marks[1]?.text === 'Coda' && ms[5].marks.every((m) => m.at === 'start'), '6마디: 코다 기호와 Coda는 마디 첫머리, 끝세로줄');
    T.check(!ms[1].ending && !ms[1].marks && !ms[1].repeatStart && !ms[4].ending, '기호 없는 마디에는 아무것도 붙지 않음');
    // A jump only played (<sound>, no words) gets its usual words.
    const soundOnly = XML.replace(words('D.S. al Coda', '<sound dalsegno="s"/>'), '<sound dalsegno="s"/>');
    T.check(JSON.stringify(MusicXML.convert(new DOMParser().parseFromString(soundOnly, 'application/xml'), 0, 0).score.measures[4].marks) === '[{"kind":"text","text":"D.S.","at":"end"}]',
      '글자 없이 <sound dalsegno>만 있으면 D.S.로 적음');
    // An ending left open at the end of the score is closed there.
    const unclosed = XML.replace(right('<ending number="2" type="discontinue"/>'), '');
    const u = MusicXML.convert(new DOMParser().parseFromString(unclosed, 'application/xml'), 0, 0).score;
    T.check(N.isValid({ ...u, id: 'x' }) && u.measures[5].ending?.end === 'open', '끝까지 닫히지 않은 괄호는 마지막 마디에서 열린 채로 닫음');
  });

  // Where an element sits in its SVG's units.
  const box = (el) => el.getBBox();

  T.test('40-4 도돌이표 그리기', async (T) => {
    const { score } = MusicXML.convert(doc(), 0, 0);
    const div = document.createElement('div');
    div.style.width = '700px';
    document.body.append(div);
    Sheet.draw(div, score);
    const repeats = [...div.querySelectorAll('.sv-barline[data-kind="repeat"]')];
    T.check(repeats.length === 2 && repeats[0].dataset.side === 'start' && repeats[0].dataset.measure === '0' && repeats[1].dataset.side === 'end' && repeats[1].dataset.measure === '2',
      `도돌이 세로줄: 1마디 시작, 3마디 끝 (${repeats.map((r) => `${r.dataset.measure}${r.dataset.side}`)})`);
    T.check(repeats.every((r) => r.querySelectorAll('.sv-repeat-dot').length === 2 && r.querySelector('.sv-bar-end') && r.querySelector('.sv-bar')), '도돌이 세로줄은 굵은 줄·가는 줄·점 두 개');
    // The dots sit in the two spaces either side of the middle line, inside the staff, on the notes' side of the lines.
    const dotSide = (r) => {
      const thin = Number(r.querySelector('.sv-bar').getAttribute('x1'));
      const thick = Number(r.querySelector('.sv-bar-end').getAttribute('x'));
      const dot = Number(r.querySelector('.sv-repeat-dot').getAttribute('cx'));
      return r.dataset.side === 'start' ? thick < thin && thin < dot : dot < thin && thin < thick;
    };
    T.check(repeats.every(dotSide), '시작은 굵은 줄→가는 줄→점, 끝은 점→가는 줄→굵은 줄 순서');
    T.check(div.querySelector('.sv-barline[data-kind="double"][data-measure="4"]')?.querySelectorAll('.sv-bar').length === 2, '5마디 끝은 겹세로줄');
    T.check(div.querySelector('.sv-barline[data-kind="final"][data-measure="5"]'), '6마디 끝은 끝세로줄');
    const endings = [...div.querySelectorAll('.sv-ending')];
    T.check(endings.length === 2 && endings.map((e) => e.querySelector('.sv-ending-text')?.textContent).join(',') === '1.,2.', `1·2번 괄호와 번호 (${endings.length})`);
    const hooks = (e) => (e.querySelector('.sv-ending-line').getAttribute('d').match(/L/g) ?? []).length;
    T.check(hooks(endings[0]) === 3 && hooks(endings[1]) === 2, '1번 괄호는 양쪽 갈고리(닫힘), 2번 괄호는 시작 갈고리만(열림)');
    T.check(div.querySelectorAll('.sv-segno').length === 1 && div.querySelectorAll('.sv-coda').length === 2, '세뇨 하나, 코다 기호 둘');
    const texts = [...div.querySelectorAll('.sv-mark-text')].map((t) => t.textContent);
    T.check(['To Coda', 'D.S. al Coda', 'Coda'].every((t) => texts.includes(t)), `D.S. al Coda·To Coda·Coda 글자 (${texts})`);

    // Standard places: above the staff and every note of its row; the end marks right-aligned to the measure's end.
    let clear = true;
    for (const svg of div.querySelectorAll('.sheet-svg')) {
      const marks = [...svg.querySelectorAll('.sv-ending, .sv-marks')];
      if (!marks.length) continue;
      const staffTop = Math.min(...[...svg.querySelectorAll('.sv-line')].map((l) => Number(l.getAttribute('y1'))));
      const noteTop = Math.min(...[...svg.querySelectorAll('.sv-note')].map((n) => box(n).y));
      const numbers = [...svg.querySelectorAll('.sv-number')].map(box);
      for (const m of marks) {
        const b = box(m);
        if (b.y + b.height > Math.min(staffTop, noteTop) + 0.5) clear = false;
        if (numbers.some((n) => n.x < b.x + b.width && b.x < n.x + n.width && n.y < b.y + b.height && b.y < n.y + n.height)) clear = false;
      }
    }
    T.check(clear, '괄호·기호는 오선과 음표 위에, 마디 번호와 겹치지 않게');
    const dsText = [...div.querySelectorAll('.sv-mark-text')].find((t) => t.textContent === 'D.S. al Coda');
    const dsMeasure = div.querySelector('.sv-measure[data-measure="4"]');
    T.check(Math.abs(box(dsText).x + box(dsText).width - Number(dsMeasure.dataset.x1)) < 8, 'D.S. al Coda는 마디 끝에 맞춤');
    const segno = div.querySelector('.sv-segno');
    T.check(box(segno).x < Number(div.querySelector('.sv-measure[data-measure="0"]').dataset.x0) + 30, '세뇨는 마디 첫머리');

    // A bracket running on past a row break carries on with no hook or number on the next row.
    const run = build('C5:w | D5:w | E5:w | F5:w', { 1: { ending: { text: '1.', start: true } }, 2: { ending: { text: '1.', end: 'stop' } } });
    div.style.width = '360px';
    Sheet.draw(div, run);
    const rows = [...div.querySelectorAll('.sheet-svg')];
    const cont = rows[1]?.querySelector('.sv-ending[data-measure="2"]');
    T.check(rows.length === 2 && rows[0].querySelector('.sv-ending[data-measure="1"] .sv-ending-text') && cont && !cont.querySelector('.sv-ending-text')
      && /^M[\d.]+ ([\d.]+) L[\d.]+ \1 L/.test(cont.querySelector('.sv-ending-line').getAttribute('d')),
    '줄이 바뀌는 곳의 괄호는 다음 줄 첫머리부터 갈고리·번호 없이 이어짐');
    div.remove();

    // The strip keeps its height with the marks (the drawing is scaled into it).
    const strip = document.createElement('div');
    document.body.append(strip);
    const h1 = Sheet.strip(strip, score, { height: 80 }).style.height;
    const h2 = Sheet.strip(strip, build('C5:w | D5:w | E5:w | F5:w | G5:w | A5:w'), { height: 80 }).style.height;
    T.check(h1 === '80px' && h2 === '80px', `한 줄 띠 높이는 기호가 있어도 같음 (${h1}, ${h2})`);
    strip.remove();
  });

  T.test('40-4 재생은 적힌 순서', async (T) => {
    const { score } = MusicXML.convert(doc(), 0, 0);
    const r = Playback.schedule(score, { start: 0, end: 5, tonic: false });
    const order = r.events.map((e) => e.midi).join(',');
    T.check(order === '72,74,76,77,79,81', `도돌이표·D.S.를 따라가지 않고 적힌 순서대로 한 번씩 (${order})`);
    T.check(r.events.every((e, i) => i === 0 || e.start > r.events[i - 1].start), '시각이 앞으로만 감');
  });

  async function importXml(xml, name) {
    T.$('btn-new-score').click();
    await importFile(new File([xml], name));
    T.$('btn-import').click();
  }

  T.test('40-4 불러온 도돌이표 곡으로 연습', async (T) => {
    T.setMode('score');
    const writeTop = T.$('staff-title').getBoundingClientRect().top;
    await importXml(XML, 'repeat.musicxml');
    T.check(T.$('score-select').selectedOptions[0]?.textContent.includes('도돌이표 연습'), '불러온 악보가 선택됨');
    const stripSvg = T.$('score-strip').querySelector('svg');
    T.check(stripSvg.querySelectorAll('.sv-ending').length === 2 && stripSvg.querySelector('.sv-segno') && stripSvg.querySelectorAll('.sv-barline[data-kind="repeat"]').length === 2,
      '한 줄 띠에 괄호·세뇨·도돌이 세로줄');
    T.check(Math.abs(stripSvg.getBoundingClientRect().height - T.$('score-strip').clientHeight) < 1.5, '띠 그림이 띠 높이에 맞음');
    T.$('length-chips').querySelector('[data-length="2"]').click();
    T.$('score-strip').querySelector('.sv-hit[data-measure="2"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    T.check(section && section.start === 2 && text(current) === 'E5 F5', `3~4마디 구간은 적힌 그대로 (${text(current)})`);
    await T.listen();
    T.enterNotes(current);
    T.submit();
    T.check(/2음 모두 정답/.test(T.resultText()), `채점 (${T.resultText().slice(0, 14)})`);
    const answer = document.querySelector('.answer-sheet svg');
    T.check(answer && answer.querySelectorAll('.sv-ending').length === 2 && answer.querySelector('.sv-barline[data-kind="repeat"]'), '정답 악보에도 괄호·도돌이 세로줄');
    T.next();
    T.check(section && section.start === 4 && text(current) === 'G5 A5', `"다음 문제"는 도돌이표로 돌아가지 않고 다음 마디(5~6마디) (${section?.start}, ${text(current)})`);
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

// 개선-6·7: a measure of rests is one whole rest in its middle, in any time; widths follow what measures hold.
T.test('개선-7 마디 쉼표와 마디 폭', async (T) => {
  const N = Notation;
  const div = document.createElement('div');
  div.style.width = '700px';
  document.body.append(div);
  const score = (time, music, pickup = false) => N.build({ id: 'r', title: 'r', pickup, key: { fifths: 0, mode: 'major' }, tempo: 60, clef: 'treble', time, music });
  for (const [time, music] of [[[3, 4], 'C5:q D5:q E5:q | r:h. | r:q r:h | C5:h.'], [[6, 8], 'C5:q. D5:q. | r:q. r:q. | r:h. | C5:h.'], [[4, 4], 'C5:w | r:h r:h | r:w | C5:w']]) {
    Sheet.draw(div, score(time, music));
    const m = (i) => div.querySelector(`.sv-measure[data-measure="${i}"]`);
    const rests = [1, 2].map((i) => [...m(i).querySelectorAll('.sv-note[data-rest]')]);
    const whole = rests.every((r) => r.length === 1 && r[0].dataset.type === 'whole' && 'measureRest' in r[0].dataset);
    const centered = [1, 2].every((i) => {
      const b = m(i).querySelector('.sv-rest-block').getBBox();
      const mid = (Number(m(i).dataset.x0) + Number(m(i).dataset.x1)) / 2;
      return Math.abs(b.x + b.width / 2 - mid) < 6;
    });
    T.check(whole && centered, `${time.join('/')}: 쉼표만 있는 마디는 온쉼표 하나, 마디 가운데`);
  }
  Sheet.draw(div, score([4, 4], 'r:8 | r:h C5:h | 3[ r:8 r:8 r:8 ] r:q r:h | C5:w', true));
  const types = (i) => [...div.querySelectorAll(`.sv-measure[data-measure="${i}"] .sv-note`)].map((n) => n.dataset.type).join(',');
  T.check(types(0) === 'eighth' && types(1) === 'half,half' && types(2) === 'eighth,eighth,eighth,quarter,half',
    `못갖춘마디·음이 섞인 마디·잇단 쉼표 마디는 그대로 (${types(0)} / ${types(1)} / ${types(2)})`);
  Sheet.draw(div, score([4, 4], 'C5:q | C5:q D5:q E5:q F5:q | C5:w', true));
  const width = (i) => { const g = div.querySelector(`.sv-measure[data-measure="${i}"]`); return Number(g.dataset.x1) - Number(g.dataset.x0); };
  T.check(width(0) < width(1) * 0.6 && Math.abs(width(1) - width(2)) < width(1) * 0.3, `못갖춘마디는 좁게, 온마디끼리는 비슷하게 (${[0, 1, 2].map((i) => Math.round(width(i)))})`);
  div.remove();
});
