(function () {
  // Settings kept in this browser (내 악보: playback speed, later the solfège style). Reading or writing can fail
  // (privacy settings): the defaults are used then and nothing breaks.
  const STORAGE_KEY = 'ltw.settings.v1';
  const DEFAULTS = { speed: 1 };
  const ALLOWED = { speed: [1, 0.75, 0.5] };

  function readAll() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  let values = { ...DEFAULTS };
  const stored = readAll();
  for (const name of Object.keys(DEFAULTS)) {
    if (ALLOWED[name].includes(stored[name])) values[name] = stored[name];
  }

  function get(name) {
    return values[name];
  }

  // Returns whether it was kept in the browser (it applies for this visit either way).
  function set(name, value) {
    if (!ALLOWED[name] || !ALLOWED[name].includes(value)) return false;
    values = { ...values, [name]: value };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
      return true;
    } catch {
      return false;
    }
  }

  window.Settings = { get, set, STORAGE_KEY, DEFAULTS, ALLOWED };
})();
