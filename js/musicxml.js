(function () {
  // MusicXML files (.musicxml / .xml, or compressed .mxl) read in the browser: the file's bytes → an XML document
  // → the parts and, inside each part, the lines (a staff and voice) that can be practised. Expansion 6: one line
  // is moved over to the v2 score format unchanged (TODO 36).

  class ImportError extends Error {}

  const MESSAGES = {
    empty: '빈 파일이에요.',
    notXml: 'MusicXML 파일이 아니에요.',
    noScore: '압축 파일 안에 악보(MusicXML)가 없어요.',
    timewise: 'score-timewise 형식이라 불러올 수 없어요. 악보 프로그램에서 MusicXML로 다시 내보내 주세요.',
    noPitched: '음높이가 있는 파트가 없어요.',
  };

  // Text from bytes: a byte-order mark first (UTF-8, UTF-16 LE/BE), then UTF-16 without one ("<" followed by a zero
  // byte), then the encoding the XML declaration names, else UTF-8.
  function decode(bytes) {
    const [a, b, c] = bytes;
    let label = 'utf-8';
    let skip = 0;
    if (a === 0xef && b === 0xbb && c === 0xbf) skip = 3;
    else if (a === 0xff && b === 0xfe) [label, skip] = ['utf-16le', 2];
    else if (a === 0xfe && b === 0xff) [label, skip] = ['utf-16be', 2];
    else if (a === 0x3c && b === 0x00) label = 'utf-16le';
    else if (a === 0x00 && b === 0x3c) label = 'utf-16be';
    else {
      const head = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
      const declared = head.match(/^<\?xml[^>]*encoding\s*=\s*["']([A-Za-z0-9._-]+)["']/);
      if (declared) label = declared[1].toLowerCase();
    }
    try {
      return new TextDecoder(label).decode(bytes.subarray(skip));
    } catch {
      return new TextDecoder('utf-8').decode(bytes.subarray(skip));
    }
  }

  function parseXml(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new ImportError(MESSAGES.notXml);
    const root = doc.documentElement.nodeName;
    if (root === 'score-timewise') throw new ImportError(MESSAGES.timewise);
    if (root !== 'score-partwise') throw new ImportError(MESSAGES.notXml);
    return doc;
  }

  // The score inside an .mxl: the rootfile META-INF/container.xml names, else the first MusicXML-looking file.
  async function scoreInZip(bytes) {
    const list = Unzip.entries(bytes).filter((entry) => !entry.name.endsWith('/'));
    let path = null;
    const container = list.find((entry) => entry.name === 'META-INF/container.xml');
    if (container) {
      const xml = new DOMParser().parseFromString(decode(await Unzip.extract(bytes, container)), 'application/xml');
      const roots = [...xml.getElementsByTagName('rootfile')];
      const root = roots.find((r) => !r.getAttribute('media-type') || r.getAttribute('media-type').includes('musicxml')) ?? roots[0];
      path = root?.getAttribute('full-path') ?? null;
    }
    const entry = list.find((e) => e.name === path)
      ?? list.find((e) => !e.name.startsWith('META-INF/') && /\.(musicxml|xml)$/i.test(e.name));
    if (!entry) throw new ImportError(MESSAGES.noScore);
    return Unzip.extract(bytes, entry);
  }

  // A File (or Blob with a name) → { doc, fileName }. Throws ImportError with a message to show.
  async function read(file) {
    let bytes = new Uint8Array(await file.arrayBuffer());
    if (!bytes.length) throw new ImportError(MESSAGES.empty);
    if (Unzip.isZip(bytes)) {
      try {
        bytes = await scoreInZip(bytes);
      } catch (error) {
        if (error instanceof Unzip.ZipError) throw new ImportError(`${error.message}.`);
        throw error;
      }
    }
    return { doc: parseXml(decode(bytes)), fileName: file.name || '' };
  }

  const childText = (element, name) => {
    for (const child of element.children) if (child.nodeName === name) return child.textContent.trim();
    return null;
  };
  const hasChild = (element, name) => [...element.children].some((child) => child.nodeName === name);

  function titleOf(doc, fileName) {
    const work = doc.querySelector('score-partwise > work > work-title')?.textContent.trim();
    const movement = doc.querySelector('score-partwise > movement-title')?.textContent.trim();
    return work || movement || fileName.replace(/\.[^.]+$/, '').trim() || '불러온 악보';
  }

  // The parts that have pitched notes, each with its lines: { title, parts: [{ id, name, lines: [{ staff, voice,
  // label, count }] }], skipped: [names of parts without pitched notes (percussion)] }. count: notes and chords
  // (a chord counts once), grace notes included.
  function candidates(doc, fileName = '') {
    const names = {};
    [...doc.querySelectorAll('part-list > score-part')].forEach((scorePart, i) => {
      const name = childText(scorePart, 'part-name') || childText(scorePart, 'part-abbreviation');
      names[scorePart.getAttribute('id')] = name || `파트 ${i + 1}`;
    });
    const parts = [];
    const skipped = [];
    [...doc.querySelectorAll('score-partwise > part')].forEach((part, i) => {
      const id = part.getAttribute('id');
      const name = names[id] ?? `파트 ${i + 1}`;
      const lines = new Map();
      let staves = 1;
      for (const staffCount of part.querySelectorAll('attributes > staves')) staves = Math.max(staves, Number(staffCount.textContent) || 1);
      for (const note of part.getElementsByTagName('note')) {
        if (!hasChild(note, 'pitch') || hasChild(note, 'chord')) continue;
        const staff = Number(childText(note, 'staff')) || 1;
        const voice = childText(note, 'voice') || '1';
        const key = `${staff}/${voice}`;
        if (!lines.has(key)) lines.set(key, { staff, voice, count: 0 });
        lines.get(key).count++;
      }
      if (!lines.size) {
        skipped.push(name);
        return;
      }
      const sorted = [...lines.values()].sort((a, b) => a.staff - b.staff || Number(a.voice) - Number(b.voice) || a.voice.localeCompare(b.voice));
      for (const line of sorted) {
        const inStaff = sorted.filter((other) => other.staff === line.staff);
        const label = [];
        if (staves > 1 || new Set(sorted.map((l) => l.staff)).size > 1) {
          label.push(staves === 2 ? (line.staff === 1 ? '위 보표' : '아래 보표') : `보표 ${line.staff}`);
        }
        if (inStaff.length > 1) label.push(`성부 ${inStaff.indexOf(line) + 1}`);
        line.label = label.join(' · ') || '성부 1';
      }
      parts.push({ id, name, lines: sorted });
    });
    if (!parts.length) throw new ImportError(MESSAGES.noPitched);
    return { title: titleOf(doc, fileName), parts, skipped };
  }

  window.MusicXML = { read, decode, candidates, ImportError, MESSAGES };
})();
