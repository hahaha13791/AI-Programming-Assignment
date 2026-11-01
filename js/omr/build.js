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
    unsupported: '붙임줄·잇단음표·화음 등은 아직 읽지 못해요. 편집기에서 넣어 주세요',
    major: '장조·단조는 사진으로 알 수 없어 장조로 두었어요',
    noTime: '박자표를 찾지 못해 4/4로 두었어요',
    guessedTime: '읽지 못한 박자표는 마디에 든 음의 길이로 짐작했어요',
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
            unsupported: Boolean(m.unsupported), clef, staffStart: k === 0,
            key: k === 0 ? analysis.keys?.[staffIndex]?.fifths ?? 0 : null, time: m.time ?? null, timeUnread: Boolean(m.timeUnread),
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
    // A time signature further on that was there but couldn't be read: the time most of that staff's measures hold,
    // if they agree (else the time so far). (None at the start: 4/4 with a notice, PRD #4-L-3.)
    let guessed = false;
    const staffTime = (from, least = 2) => {
      const sums = [];
      for (let i = from + 1; i < measures.length && !measures[i].staffStart; i++) {
        if (i === measures.length - 1 || !measures[i].notes?.length) continue;
        const quarters = measures[i].notes.reduce((sum, n) => sum + N.toNumber(N.duration(n)) * 4, 0);
        sums.push(Math.round(quarters * 8) / 8);
      }
      const counts = new Map();
      for (const q of sums) counts.set(q, (counts.get(q) ?? 0) + 1);
      const [best, count] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [];
      if (!best || count < Math.max(least, sums.length * (least > 2 ? 0.6 : 0.5)) || ![2, 3, 4].includes(best)) return null;
      guessed = true;
      return { time: [best, 4] };
    };
    for (let i = 0; i < measures.length; i++) {
      const m = measures[i];
      // A staff (not the first) with no time signature read anywhere in it whose measures all agree on another time
      // than so far: a time signature there that wasn't seen (a new movement, say).
      let end = i + 1;
      while (end < measures.length && !measures[end].staffStart) end++;
      const unseen = i > 0 && m.staffStart && !m.time && !measures.slice(i, end).some((x) => x.time || x.timeUnread);
      if (i > 0 && m.staffStart && (m.timeUnread || unseen)) {
        const time = staffTime(i, 2);
        const current = measures.slice(0, i).reverse().find((x) => x.time)?.time?.time ?? DEFAULT_TIME;
        if (time && (m.timeUnread || `${time.time}` !== `${current}`)) {
          m.time = time;
          m.timeGuessed = true;
        }
      }
    }
    const firstTime = measures[0].time;
    let time = firstTime?.time ?? DEFAULT_TIME;
    let key = measures[0].key ?? 0;
    const checks = [];
    let clef = measures[0].clef;
    const built = measures.map((m, i) => {
      const measure = {};
      // A time signature further on changes the time from there; a staff starting with another key changes the key.
      if (i > 0 && m.time && `${m.time.time}` !== `${time}`) {
        time = m.time.time;
        measure.time = time;
        if (m.time.symbol) measure.timeSymbol = m.time.symbol;
      }
      if (i > 0 && m.staffStart && m.key !== null && m.key !== key) {
        key = m.key;
        measure.key = { fifths: key, mode: 'major' };
      }
      const length = N.measureLength(time);
      const read = m.notes ?? Editing.restsFor(length);
      const { notes, changed } = fit(read, length, { first: i === 0, last: i === measures.length - 1 });
      if (changed || m.doubtful || m.timeGuessed || (m.timeUnread && i > 0)) checks.push(i);
      measure.notes = notes;
      if (m.end === 'double' || m.end === 'final') measure.barline = m.end;
      // A staff starting with another clef changes it from that measure on.
      if (i > 0 && m.staffStart && m.clef !== clef) {
        measure.clef = m.clef;
        clef = m.clef;
      }
      return measure;
    });
    Object.assign(built[0], {
      time: firstTime?.time ?? DEFAULT_TIME, key: { fifths: measures[0].key ?? 0, mode: 'major' }, clef: measures[0].clef, tempo: TEMPO,
    });
    if (firstTime?.symbol) built[0].timeSymbol = firstTime.symbol;
    const pickup = N.cmp(N.filled(built[0].notes), N.measureLength(built[0].time)) < 0;
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
    const notices = [`제목은 파일 이름으로, 빠르기는 ♩= ${TEMPO}로 두었어요`, MESSAGES.major];
    if (!firstTime) {
      notices.push(MESSAGES.noTime);
      if (!checks.includes(0)) checks.unshift(0);
    } else if (guessed) {
      notices.push(MESSAGES.guessedTime);
    }
    if (measures.some((m) => m.unsupported)) notices.push(MESSAGES.unsupported);
    return { score: N.clean(result), checks, notices, origins };
  }

  // The first photo's file name without its extension, as long as a title may be.
  function titleOf(fileName) {
    return (fileName || '').replace(/\.[^.]+$/, '').trim().slice(0, N.MAX_TITLE) || '사진 악보';
  }

  window.OmrBuild = { OmrError, MESSAGES, TEMPO, recognize, stavesPerSystem, fit, collect, score, titleOf };
})();
