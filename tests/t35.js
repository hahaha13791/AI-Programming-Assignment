// 35단계 — 불러오기 창과 파일 읽기. Run with smoke.js.

// ---- test files ----
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';
const note35 = (step, octave, { voice = '1', staff, chord = false, grace = false } = {}) =>
  `<note>${grace ? '<grace/>' : ''}${chord ? '<chord/>' : ''}<pitch><step>${step}</step><octave>${octave}</octave></pitch>`
  + `${grace ? '' : '<duration>1</duration>'}<voice>${voice}</voice><type>quarter</type>${staff ? `<staff>${staff}</staff>` : ''}</note>`;
const rest35 = (voice = '1', staff) => `<note><rest/><duration>1</duration><voice>${voice}</voice>${staff ? `<staff>${staff}</staff>` : ''}</note>`;
const ATTRS = (staves = 1) => `<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>${staves > 1 ? `<staves>${staves}</staves>` : ''}<clef><sign>G</sign><line>2</line></clef></attributes>`;
const backup = (n) => `<backup><duration>${n}</duration></backup>`;

// One flute part, one voice.
const FLUTE = `${XML_HEAD}<score-partwise version="4.0"><work><work-title>시험 곡</work-title></work>
<part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list>
<part id="P1"><measure number="1">${ATTRS()}${note35('C', 5)}${note35('D', 5)}${note35('E', 5)}${note35('F', 5)}</measure></part></score-partwise>`;

// Piano (2 staves: upper voices 1 and 2, lower voice 5) and a drum part (unpitched). Upper voice 1: E5+G5 chord
// (counts once), F5, G5, grace A5 (counts), G5 = 5 notes.
const PIANO = `${XML_HEAD}<score-partwise version="4.0"><movement-title>피아노와 드럼</movement-title>
<part-list><score-part id="P1"><part-name>Piano</part-name></score-part><score-part id="P2"><part-name>Drums</part-name></score-part></part-list>
<part id="P1"><measure number="1">${ATTRS(2)}
${note35('E', 5, { staff: 1 })}${note35('G', 5, { staff: 1, chord: true })}${note35('F', 5, { staff: 1 })}${note35('G', 5, { staff: 1 })}${note35('A', 5, { staff: 1, grace: true })}${note35('G', 5, { staff: 1 })}
${backup(4)}${note35('C', 5, { voice: '2', staff: 1 })}${rest35('2', 1)}${note35('B', 4, { voice: '2', staff: 1 })}${rest35('2', 1)}
${backup(4)}${note35('C', 3, { voice: '5', staff: 2 })}${note35('G', 2, { voice: '5', staff: 2 })}${note35('C', 3, { voice: '5', staff: 2 })}${note35('G', 2, { voice: '5', staff: 2 })}
</measure></part>
<part id="P2"><measure number="1"><attributes><divisions>1</divisions><clef><sign>percussion</sign></clef></attributes>
<note><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched><duration>4</duration><voice>1</voice><type>whole</type></note></measure></part></score-partwise>`;

const TIMEWISE = `${XML_HEAD}<score-timewise version="4.0"><part-list><score-part id="P1"><part-name>A</part-name></score-part></part-list><measure number="1"><part id="P1"></part></measure></score-timewise>`;
const DRUMS_ONLY = PIANO.replace(/<part id="P1">[\s\S]*?<\/part>\n/, '').replace('<score-part id="P1"><part-name>Piano</part-name></score-part>', '');

const enc = (text) => new TextEncoder().encode(text);
function utf16le(text, bom = true) {
  const out = new Uint8Array((bom ? 2 : 0) + text.length * 2);
  let i = 0;
  if (bom) { out[0] = 0xff; out[1] = 0xfe; i = 2; }
  for (let k = 0; k < text.length; k++, i += 2) {
    out[i] = text.charCodeAt(k) & 0xff;
    out[i + 1] = text.charCodeAt(k) >> 8;
  }
  return out;
}

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

// A ZIP from [{ name, bytes, store }]: deflated unless store.
async function zip35(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = enc(file.name);
    const data = file.store ? file.bytes : await deflateRaw(file.bytes);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(8, file.store ? 0 : 8, true);
    local.setUint32(14, crc32(file.bytes), true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, file.bytes.length, true);
    local.setUint16(26, name.length, true);
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(10, file.store ? 0 : 8, true);
    central.setUint32(16, crc32(file.bytes), true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, file.bytes.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    locals.push(new Uint8Array(local.buffer), name, data);
    centrals.push(new Uint8Array(central.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...locals, ...centrals, new Uint8Array(end.buffer)]);
}

const CONTAINER = (path) => enc(`${XML_HEAD}<container><rootfiles><rootfile full-path="${path}" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>`);
const file35 = (parts, name) => new File(Array.isArray(parts) ? parts : [parts], name);

const summary = (state) => state && JSON.stringify({
  title: state.title,
  parts: state.parts.map((p) => ({ name: p.name, lines: p.lines.map((l) => `${l.label}:${l.count}`) })),
  skipped: state.skipped,
});

function storeSnapshot() {
  return `${localStorage.getItem(Scores.STORAGE_KEY)}|${scores.list().length}`;
}

// ---- tests ----
// Reading a Blob and (de)compressing run off the page's thread. While the page waits for them with no timer
// pending, headless virtual time jumps straight to the runner's frame timeout. A small ticking timer keeps virtual
// time moving in small steps (see references/pitfalls.md).
const ticker = setInterval(() => {}, 10);
T.test('35-2 [새 악보] 작은 창', async (T) => {
  T.setMode('score');
  const writeTop = T.$('staff-title').getBoundingClientRect().top;
  const button = T.$('btn-new-score');
  button.click();
  const box = T.$('new-score');
  T.check(!box.hidden && button.getAttribute('aria-expanded') === 'true', '[새 악보]를 누르면 작은 창이 열림');
  T.check(T.$('btn-make-score').offsetWidth > 0 && T.$('btn-import-file').offsetWidth > 0, '[직접 만들기] [파일 불러오기]가 보임');
  const rect = box.getBoundingClientRect();
  T.check(rect.left >= 0 && rect.right <= window.innerWidth + 0.5, `작은 창이 화면 안 (${Math.round(rect.left)}~${Math.round(rect.right)} / ${window.innerWidth})`);
  T.check(Math.abs(T.$('staff-title').getBoundingClientRect().top - writeTop) < 0.5, '창이 열려도 받아 적기 영역 위치 그대로');
  T.check(T.noHorizontalOverflow(), '가로 넘침 없음');

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  T.check(box.hidden && document.activeElement === button && button.getAttribute('aria-expanded') === 'false', 'Esc로 닫히고 [새 악보]로 초점이 돌아감');

  button.click();
  T.$('score-strip').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  T.check(box.hidden, '바깥을 누르면 닫힘');
  button.click();
  T.$('btn-settings').click();
  T.check(box.hidden && !T.$('settings').hidden, '⚙ 설정을 열면 작은 창은 닫힘');
  T.$('btn-settings').click();
  button.click();
  T.setMode('melody');
  T.check(box.hidden, '모드를 바꾸면 닫힘');
  T.setMode('score');

  T.$('btn-new-score').click();
  T.$('btn-make-score').click();
  T.check(box.hidden && !T.$('editor').hidden && T.$('editor-heading').textContent === '새 악보', '[직접 만들기]는 새 악보 편집 화면을 엶');
  T.check(T.$('btn-new-score').disabled, '편집 중에는 [새 악보]가 꺼짐');
  T.$('editor-cancel').click();
  T.check(T.$('editor').hidden && !T.$('btn-new-score').disabled, '취소하면 연습 화면으로');
});

T.test('35-4 파일 읽기와 파트·성부 목록', async (T) => {
  T.setMode('score');
  const before = storeSnapshot();
  T.$('btn-new-score').click();
  const flute = await importFile(file35(FLUTE, 'flute.musicxml'));
  T.check(summary(flute) === JSON.stringify({ title: '시험 곡', parts: [{ name: 'Flute', lines: ['성부 1:4'] }], skipped: [] }), `.musicxml 목록 (${summary(flute)})`);

  // The same score as UTF-16 (with and without a byte-order mark), .mxl with container.xml, and .mxl without one.
  const utf16 = await importFile(file35(utf16le(FLUTE.replace('UTF-8', 'UTF-16')), 'flute16.xml'));
  T.check(summary(utf16) === summary(flute), 'UTF-16(BOM) .xml도 같은 목록');
  const utf16NoBom = await importFile(file35(utf16le(FLUTE.replace('UTF-8', 'UTF-16'), false), 'flute16b.xml'));
  T.check(summary(utf16NoBom) === summary(flute), 'UTF-16(BOM 없음) .xml도 같은 목록');
  const mxl = await zip35([
    { name: 'mimetype', bytes: enc('application/vnd.recordare.musicxml'), store: true },
    { name: 'META-INF/container.xml', bytes: CONTAINER('score/flute.xml') },
    { name: 'score/flute.xml', bytes: enc(FLUTE) },
  ]);
  const fromMxl = await importFile(file35(mxl, 'flute.mxl'));
  T.check(summary(fromMxl) === summary(flute), `.mxl(압축, container.xml)도 같은 목록 (${summary(fromMxl)})`);
  const bare = await zip35([{ name: 'flute.musicxml', bytes: enc(FLUTE), store: true }]);
  T.check(summary(await importFile(file35(bare, 'bare.mxl'))) === summary(flute), 'container.xml 없는 .mxl(압축 안 함)도 읽음');

  // Through the real file input, as the browser's file picker would.
  const input = T.$('import-file');
  const transfer = new DataTransfer();
  transfer.items.add(file35(mxl, 'picked.mxl'));
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  T.check(await T.waitFor(() => importState && T.$('import-file-name').textContent === 'picked.mxl', 5000), '파일 선택 칸으로 고른 .mxl이 목록으로 뜸');
  T.check(input.value === '', '같은 파일을 다시 고를 수 있게 선택 칸을 비움');

  const piano = await importFile(file35(PIANO, 'piano.musicxml'));
  T.check(summary(piano) === JSON.stringify({
    title: '피아노와 드럼',
    parts: [{ name: 'Piano', lines: ['위 보표 · 성부 1:5', '위 보표 · 성부 2:2', '아래 보표:4'] }],
    skipped: ['Drums'],
  }), `피아노 2보표·2성부, 드럼은 빠짐 (${summary(piano)})`);
  const lineLabels = [...T.$('import-lines').querySelectorAll('label')].map((l) => l.textContent.trim());
  T.check(!T.$('import-lines').hidden && lineLabels.length === 3 && lineLabels[0] === '위 보표 · 성부 1 (음 5개)', `보표·성부 고르기가 보임 (${lineLabels})`);
  T.check(!T.$('import-skipped').hidden && T.$('import-skipped').textContent.includes('Drums'), '뺀 파트를 적음');
  T.check(T.$('import-parts').querySelectorAll('input').length === 1, '파트 목록에 Piano만');

  await importFile(file35(FLUTE, 'flute.musicxml'));
  T.check(T.$('import-lines').hidden && !T.$('import-parts').hidden, '성부가 하나뿐이면 보표·성부를 묻지 않음');
  T.check(T.$('btn-import').disabled && !T.$('import-pending').hidden, '36단계 전까지 [불러오기]는 잠김');

  // Two parts: changing the part changes the line list.
  const twoParts = PIANO.replace('<part-name>Drums</part-name>', '<part-name>Violin</part-name>')
    .replace(/<part id="P2">[\s\S]*<\/part>/, `<part id="P2"><measure number="1">${ATTRS()}${note35('A', 4)}${note35('B', 4)}${rest35()}${rest35()}</measure></part>`);
  await importFile(file35(twoParts, 'two.musicxml'));
  document.querySelector('#import-parts input[value="1"]').click();
  T.check(T.$('import-lines').hidden, '성부가 하나인 파트로 바꾸면 보표·성부 목록이 사라짐');
  document.querySelector('#import-parts input[value="0"]').click();
  T.check(!T.$('import-lines').hidden, '다시 피아노를 고르면 보표·성부 목록');

  // Files that can't be read: a reason, no error, nothing stored.
  const bad = [
    [file35('hello, not xml', 'note.txt'), MusicXML.MESSAGES.notXml],
    [file35('<html><body></body></html>', 'page.xml'), MusicXML.MESSAGES.notXml],
    [file35(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5]), 'broken.mxl'), '압축 파일'],
    [file35(await zip35([{ name: 'readme.txt', bytes: enc('x'), store: true }]), 'nothing.mxl'), MusicXML.MESSAGES.noScore],
    [file35(TIMEWISE, 'timewise.xml'), 'score-timewise'],
    [file35(DRUMS_ONLY, 'drums.musicxml'), MusicXML.MESSAGES.noPitched],
    [file35('', 'empty.musicxml'), MusicXML.MESSAGES.empty],
  ];
  for (const [file, expected] of bad) {
    const result = await importFile(file);
    const status = T.$('import-status');
    T.check(result === null && status.classList.contains('is-error') && status.textContent.includes(expected) && T.$('import-parts').hidden,
      `${file.name}: 이유 안내 (${status.textContent})`);
  }
  T.check(storeSnapshot() === before, '파일을 읽기만 하고 저장소는 바뀌지 않음');
  const rect = T.$('new-score').getBoundingClientRect();
  T.check(rect.left >= 0 && rect.right <= window.innerWidth + 0.5 && T.noHorizontalOverflow(), '목록이 뜬 창도 화면 안, 가로 넘침 없음');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
});

T.test('35-4 파트가 많은 파일', async (T) => {
  T.setMode('score');
  const many = Array.from({ length: 20 }, (_, i) => i + 1);
  const xml = `${XML_HEAD}<score-partwise><part-list>${many.map((i) => `<score-part id="P${i}"><part-name>아주 긴 악기 이름을 가진 파트 번호 ${i}</part-name></score-part>`).join('')}</part-list>`
    + `${many.map((i) => `<part id="P${i}"><measure number="1">${ATTRS()}${note35('C', 5)}${rest35()}${rest35()}${rest35()}</measure></part>`).join('')}</score-partwise>`;
  T.$('btn-new-score').click();
  const writeTop = T.$('staff-title').getBoundingClientRect().top;
  const state = await importFile(file35(xml, 'orchestra.musicxml'));
  T.check(state && state.parts.length === 20, '파트 20개');
  const box = T.$('new-score').getBoundingClientRect();
  const list = T.$('import-parts');
  T.check(list.scrollHeight > list.clientHeight && box.height < 420, `긴 파트 목록은 창 안에서 스크롤 (창 높이 ${Math.round(box.height)})`);
  T.check(Math.abs(T.$('staff-title').getBoundingClientRect().top - writeTop) < 0.5 && T.noHorizontalOverflow(), '받아 적기 영역 위치 그대로, 가로 넘침 없음');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  T.setMode('melody');
  clearInterval(ticker);
});
