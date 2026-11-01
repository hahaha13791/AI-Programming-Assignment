(function () {
  // From what was read on the photos to a v2 score (PRD #4-L-3, #4-L-4): the measures of the chosen staff, page by
  // page and top to bottom, each fitted to its time without bending what was read — missing time is filled with
  // rests, notes past the end are left out — and every measure that needed that, or held something not read surely,
  // is listed as "확인 필요". Reading runs in short pieces so the page stays responsive.

  const N = Notation;
  const TEMPO = 120; // like a new score in the editor (PRD #4-H-1)
  const DEFAULT_TIME = [4, 4];

  class OmrError extends Error {}

  const MESSAGES = {
    noStaff: '오선을 찾지 못했어요. 종이 모서리를 고치거나, 더 밝고 반듯하게 찍어 주세요.',
  };

  const pause = () => new Promise((resolve) => setTimeout(resolve, 0));

  // Reads every page (OmrStaff.analyse), one at a time with a pause between. onProgress(done, total) before each.
  // Returns the analyses, or null when cancelled() turns true.
  async function recognize(pages, { onProgress = () => {}, cancelled = () => false } = {}) {
    const out = [];
    for (let i = 0; i < pages.length; i++) {
      onProgress(i + 1, pages.length);
      await pause();
      if (cancelled()) return null;
      out.push(OmrSymbols.read(pages[i], OmrStaff.analyse(pages[i])));
      await pause();
      if (cancelled()) return null;
    }
    return out;
  }

  // The most staves any system has (more than one: the user picks which staff to read, PRD #4-L-3).
  const stavesPerSystem = (analyses) => Math.max(0, ...analyses.flatMap((a) => a.systems.map((s) => s.length)));

  // One measure's notes made to fill `length` exactly. first: the score's first measure (shorter = a pickup);
  // last: its last (may stay short). → { notes, changed }
  function fit(notes, length, { first = false, last = false } = {}) {
    const kept = [];
    let total = N.ZERO;
    let changed = false;
    for (const note of notes) {
      const next = N.add(total, N.duration(note));
      if (N.cmp(next, length) > 0) {
        changed = true; // past the end of the measure: left out
        break;
      }
      kept.push(note);
      total = next;
    }
    const missing = N.sub(length, total);
    if (N.cmp(missing, N.ZERO) > 0 && !(first && kept.length) && !(last && kept.length)) {
      const rests = Editing.restsFor(missing);
      if (rests) kept.push(...rests);
      else return { notes: Editing.restsFor(length), changed: true };
      if (notes.length) changed = true;
    }
    if (!kept.length) return { notes: Editing.restsFor(length), changed: true };
    return { notes: kept, changed };
  }

  // The chosen staff's measures in reading order: [{ page, staff, x0, x1, end, notes, doubtful }].
  // staffChoice: which staff of a system (0 = the top one); a system with fewer staves gives its lowest.
  function collect(analyses, staffChoice = 0) {
    const out = [];
    analyses.forEach((analysis, page) => {
      for (const system of analysis.systems) {
        const staffIndex = system[Math.min(staffChoice, system.length - 1)];
        const staff = analysis.staves[staffIndex];
        const clef = analysis.clefs?.[staffIndex]?.clef ?? 'treble';
        analysis.measures[staffIndex].forEach((m, k) => {
          out.push({
            page, staff, staffIndex, x0: m.x0, x1: m.x1, end: m.end, notes: m.notes ?? null, doubtful: Boolean(m.doubtful),
            clef, staffStart: k === 0,
          });
        });
      }
    });
    return out;
  }

  // What was read → { score, checks: [measure index], notices: [text], origins: [{ page, x0, x1, y0, y1 }] }.
  // Throws OmrError when no staff was found anywhere.
  function score(analyses, { staffChoice = 0, title = '' } = {}) {
    const measures = collect(analyses, staffChoice);
    if (!measures.length) throw new OmrError(MESSAGES.noStaff);
    const time = DEFAULT_TIME;
    const length = N.measureLength(time);
    const checks = [];
    let clef = measures[0].clef;
    const built = measures.map((m, i) => {
      // Until the symbols are read (67단계), a measure is a rest the length of its time.
      const read = m.notes ?? Editing.restsFor(length);
      const { notes, changed } = fit(read, length, { first: i === 0, last: i === measures.length - 1 });
      if (changed || m.doubtful) checks.push(i);
      const measure = { notes };
      if (m.end === 'double' || m.end === 'final') measure.barline = m.end;
      // A staff starting with another clef changes it from that measure on.
      if (i > 0 && m.staffStart && m.clef !== clef) {
        measure.clef = m.clef;
        clef = m.clef;
      }
      return measure;
    });
    Object.assign(built[0], { time, key: { fifths: 0, mode: 'major' }, clef: measures[0].clef, tempo: TEMPO });
    const pickup = N.cmp(N.filled(built[0].notes), length) < 0;
    const result = { title, pickup, measures: built };
    const origins = measures.map((m) => {
      const pad = m.staff.space * 2.5;
      return {
        page: m.page,
        x0: Math.max(0, m.x0 - m.staff.space),
        x1: m.x1 + m.staff.space,
        y0: Math.max(0, OmrStaff.lineY(m.staff, 0, (m.x0 + m.x1) / 2) - pad),
        y1: OmrStaff.lineY(m.staff, 4, (m.x0 + m.x1) / 2) + pad,
      };
    });
    const notices = [`제목은 파일 이름으로, 빠르기는 ♩= ${TEMPO}로 두었어요`];
    return { score: N.clean(result), checks, notices, origins };
  }

  // The first photo's file name without its extension, as long as a title may be.
  function titleOf(fileName) {
    return (fileName || '').replace(/\.[^.]+$/, '').trim().slice(0, N.MAX_TITLE) || '사진 악보';
  }

  window.OmrBuild = { OmrError, MESSAGES, TEMPO, recognize, stavesPerSystem, fit, collect, score, titleOf };
})();
