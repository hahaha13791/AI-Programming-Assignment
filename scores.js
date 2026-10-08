(function () {
  // Scores the user writes, kept in this browser. A score: { id, title, time (beats per x/4 measure),
  // notes: [{ type, step, accidental }, ...] } where a rest is { type: 'r' } with no pitch.
  const STORAGE_KEY = 'ltw.scores.v1';
  const MAX_MEASURES = 12;
  const MAX_TITLE = 30;
  const TOP_STEP = 11; // G5
  const TIMES = [2, 3, 4];

  const NOTICES = {
    unavailable: '저장할 수 없는 환경이에요. 이번 방문 동안만 남아요.',
    unreadable: '저장된 악보를 읽지 못했어요.',
    dropped: (count) => `읽지 못한 악보 ${count}개를 뺐어요.`,
    saveFailed: '저장하지 못했어요. 이번 방문 동안만 남아요.',
  };

  // "도도솔솔 라라솔 ..." with a length per note -> notes. Every note here is natural (C major).
  function phrase(steps, types) {
    return steps.map((step, i) => ({ type: types[i], step, accidental: 0 }));
  }

  // Twinkle, Twinkle, Little Star (public domain), 4/4, 12 measures: A A' B B A A'.
  // Each line is two measures, "x x y y | z z w(half)".
  function example() {
    const line = (x, y, z, w) => phrase([x, x, y, y, z, z, w], ['q', 'q', 'q', 'q', 'q', 'q', 'h']);
    const a = [...line(0, 4, 5, 4), ...line(3, 2, 1, 0)];
    const b = line(4, 3, 2, 1);
    return { id: 'example-twinkle', title: '반짝반짝 작은 별', time: 4, notes: [...a, ...b, ...b, ...a] };
  }

  function cleanTitle(title) {
    return typeof title === 'string' ? title.trim().slice(0, MAX_TITLE) : '';
  }

  // A stored score is used only if every note is one the editor could have written: a known length,
  // a pitch in C4~G5 with a single accidental, no note across a barline, and whole measures, at most twelve.
  function isValid(score) {
    if (!score || typeof score !== 'object') return false;
    if (typeof score.id !== 'string' || !score.id) return false;
    if (!cleanTitle(score.title) || score.title.length > MAX_TITLE) return false;
    if (!TIMES.includes(score.time) || !Array.isArray(score.notes) || !score.notes.length) return false;
    const measure = score.time * 2;
    let filled = 0;
    for (const note of score.notes) {
      const type = note && Rhythm.TYPES[note.type];
      if (!type || typeof note.type !== 'string') return false;
      if (!type.rest) {
        if (!Number.isInteger(note.step) || note.step < 0 || note.step > TOP_STEP) return false;
        if (![-1, 0, 1].includes(note.accidental)) return false;
      }
      const left = measure - (filled % measure);
      if (type.length > left) return false;
      filled += type.length;
    }
    return filled % measure === 0 && filled / measure <= MAX_MEASURES;
  }

  // Only the fields a score has, so nothing extra is written back.
  function copy(score) {
    return {
      id: score.id,
      title: cleanTitle(score.title),
      time: score.time,
      notes: score.notes.map((note) => (Rhythm.TYPES[note.type].rest
        ? { type: note.type }
        : { type: note.type, step: note.step, accidental: note.accidental })),
    };
  }

  // localStorage can be missing or throw on access (privacy settings, a sandboxed page).
  function defaultStorage() {
    try {
      const storage = window.localStorage;
      const probe = `${STORAGE_KEY}.probe`;
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      return storage;
    } catch {
      return null;
    }
  }

  // storage: a Storage-like object (getItem/setItem), null for none, or omitted for localStorage.
  // Nothing is written while loading, so an unreadable value stays put until the user saves or deletes.
  function open(storage = defaultStorage()) {
    let scores = [];
    let notice = storage ? null : NOTICES.unavailable;
    let raw = null;
    if (storage) {
      try {
        raw = storage.getItem(STORAGE_KEY);
      } catch {
        storage = null;
        notice = NOTICES.unavailable;
      }
    }

    if (raw === null) {
      // First visit (no list yet): start with the example. An empty list means the user deleted it.
      scores = [example()];
    } else {
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
      if (!Array.isArray(parsed)) {
        notice = NOTICES.unreadable;
      } else {
        const ids = new Set();
        scores = parsed.filter((score) => {
          if (!isValid(score) || ids.has(score.id)) return false;
          ids.add(score.id);
          return true;
        }).map(copy);
        if (scores.length < parsed.length) notice = NOTICES.dropped(parsed.length - scores.length);
      }
    }

    function write() {
      if (!storage) return false;
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(scores));
        // The whole list is now stored, so an earlier failure or dropped score no longer needs a notice.
        notice = null;
        return true;
      } catch {
        notice = NOTICES.saveFailed;
        return false;
      }
    }

    return {
      list: () => scores.map(copy),
      get: (id) => {
        const score = scores.find((item) => item.id === id);
        return score ? copy(score) : null;
      },
      // Adds a new score (no id) or replaces the one with the same id. Returns { id, stored } or null if invalid.
      // stored: false when it is kept only in memory.
      save(score) {
        const next = copy({ ...score, id: score.id || newId() });
        if (!isValid(next)) return null;
        const index = scores.findIndex((item) => item.id === next.id);
        if (index === -1) scores.push(next);
        else scores[index] = next;
        return { id: next.id, stored: write() };
      },
      remove(id) {
        scores = scores.filter((item) => item.id !== id);
        return write();
      },
      notice: () => notice,
      persistent: () => Boolean(storage),
    };
  }

  function newId() {
    return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  }

  window.Scores = { open, isValid, example, STORAGE_KEY, MAX_MEASURES, MAX_TITLE };
})();
