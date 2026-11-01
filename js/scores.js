(function () {
  // Scores the user keeps in this browser, in the v2 format (notation.js). Expansion 4 stored v1
  // ({ id, title, time, notes: [{ type, step, accidental }] }) under its own key; those are moved over on load.
  const STORAGE_KEY = 'ltw.scores.v2';
  const V1_KEY = 'ltw.scores.v1';
  // The examples a stored list has been offered, so one added later shows up once (and stays gone if deleted).
  // Written together with the list. A list stored before this key existed was offered the first four.
  const EXAMPLES_KEY = 'ltw.examples.v1';
  const FIRST_EXAMPLES = ['example-twinkle', 'example-fur-elise', 'example-greensleeves', 'example-mountain-king'];
  const MAX_MEASURES = 12; // the editor's limit until it grows (expansion 7); stored scores have none
  const MAX_TITLE = 30;
  const V1_TOP_STEP = 11; // G5
  const V1_TIMES = [2, 3, 4];

  const NOTICES = {
    unavailable: '저장할 수 없는 환경이에요. 이번 방문 동안만 남아요.',
    unreadable: '저장된 악보를 읽지 못했어요.',
    dropped: (count) => `읽지 못한 악보 ${count}개를 뺐어요.`,
    notMoved: (count) => `예전 악보 ${count}개를 옮기지 못했어요.`,
    saveFailed: '저장하지 못했어요. 이번 방문 동안만 남아요.',
  };

  function examples() {
    return window.EXAMPLE_SCORES.map(Notation.clean);
  }

  function cleanTitle(title) {
    return typeof title === 'string' ? title.trim().slice(0, MAX_TITLE) : '';
  }

  // A v1 score is moved over only if the expansion 4 editor could have written it: a known length, a pitch in
  // C4~G5 with a single accidental, no note across a barline, and whole measures, at most twelve.
  function isV1Valid(score) {
    if (!score || typeof score !== 'object') return false;
    if (typeof score.id !== 'string' || !score.id) return false;
    if (!cleanTitle(score.title) || score.title.length > MAX_TITLE) return false;
    if (!V1_TIMES.includes(score.time) || !Array.isArray(score.notes) || !score.notes.length) return false;
    const measure = score.time * 2;
    let filled = 0;
    for (const note of score.notes) {
      const type = note && Notation.LEGACY_TYPES[note.type];
      if (!type || typeof note.type !== 'string') return false;
      if (!type.rest) {
        if (!Number.isInteger(note.step) || note.step < 0 || note.step > V1_TOP_STEP) return false;
        if (![-1, 0, 1].includes(note.accidental)) return false;
      }
      const left = measure - (filled % measure);
      if (type.eighths > left) return false;
      filled += type.eighths;
    }
    return filled % measure === 0 && filled / measure <= MAX_MEASURES;
  }

  const isValid = Notation.isValid;
  const copy = (score) => Notation.clean(score);

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

    // Reads and parses a key: null when it isn't there, undefined when it can't be read as a list.
    function readList(key) {
      let value = null;
      try {
        value = storage.getItem(key);
      } catch {
        return undefined;
      }
      if (value === null) return null;
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : undefined;
      } catch {
        return undefined;
      }
    }

    // Valid, unique scores from a list; the rest are counted for the notice.
    function keep(list, valid, convert) {
      const ids = new Set();
      const kept = list.filter((score) => {
        if (!valid(score) || ids.has(score.id)) return false;
        ids.add(score.id);
        return true;
      }).map(convert);
      return { kept, dropped: list.length - kept.length };
    }

    if (raw === null) {
      const v1 = storage ? readList(V1_KEY) : null;
      if (v1 === null) {
        // First visit (no list yet): start with the examples. An empty list means the user deleted them.
        scores = examples();
      } else if (v1 === undefined) {
        scores = examples();
        notice = NOTICES.unreadable;
      } else {
        // Expansion 4's scores move over, and the examples it didn't have are added once (this list is then
        // saved as v2 on the next write; v1 is left as it was).
        const { kept, dropped } = keep(v1, isV1Valid, (score) => copy(Notation.fromLegacy({ ...score, title: cleanTitle(score.title) })));
        const ids = new Set(kept.map((score) => score.id));
        const added = examples().filter((score) => score.id !== 'example-twinkle' && !ids.has(score.id));
        scores = [...kept, ...added];
        if (dropped) notice = NOTICES.notMoved(dropped);
      }
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
        const { kept, dropped } = keep(parsed, isValid, copy);
        const offered = new Set((storage && readList(EXAMPLES_KEY)) || FIRST_EXAMPLES);
        const ids = new Set(kept.map((score) => score.id));
        scores = [...kept, ...examples().filter((score) => !offered.has(score.id) && !ids.has(score.id))];
        if (dropped) notice = NOTICES.dropped(dropped);
      }
    }

    function write() {
      if (!storage) return false;
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(scores));
        storage.setItem(EXAMPLES_KEY, JSON.stringify(window.EXAMPLE_SCORES.map((score) => score.id)));
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
        if (!score || typeof score !== 'object') return null;
        const candidate = { ...score, id: score.id || newId() };
        if (!isValid(candidate)) return null;
        const next = copy(candidate);
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

  window.Scores = { open, isValid, isV1Valid, examples, STORAGE_KEY, V1_KEY, EXAMPLES_KEY, MAX_MEASURES, MAX_TITLE };
})();
