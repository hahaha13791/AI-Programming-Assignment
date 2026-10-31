(function () {
  // The editor's work on a v2 score, without the screen (PRD #4-H): the score being edited, a cursor on one note
  // (and one head of a chord), and undo/redo. Every change goes through change(), which keeps it undoable.
  // The title is kept apart: it is typed in a text box (with its own undo) and isn't part of the history.
  const N = Notation;
  const HISTORY = 100;
  const DEFAULT = { time: [4, 4], key: { fifths: 0, mode: 'major' }, clef: 'treble', tempo: 120 };

  const copy = (value) => JSON.parse(JSON.stringify(value));

  // A new score: 4/4, C major, treble clef, ♩= 120, one measure of a whole rest (PRD #4-H-1).
  function blank() {
    return { pickup: false, measures: [{ ...copy(DEFAULT), notes: [{ type: 'whole', dots: 0, rest: true }] }] };
  }

  // score: a v2 score to edit, or null for a new one.
  function create(score) {
    let doc = score ? copy(score) : blank();
    let title = score ? score.title : '';
    const id = score ? score.id : null;
    delete doc.title;
    delete doc.id;
    let cursor = { measure: 0, note: 0, head: 0 };
    const past = [];
    const future = [];

    // The cursor kept on a note that exists.
    function clamp(c) {
      const measure = Math.max(0, Math.min(doc.measures.length - 1, c.measure));
      const notes = doc.measures[measure].notes;
      const note = Math.max(0, Math.min(notes.length - 1, c.note));
      const heads = N.pitchesOf(notes[note]).length || 1;
      const head = Math.max(0, Math.min(heads - 1, c.head ?? 0));
      return { measure, note, head };
    }

    const snapshot = () => JSON.stringify({ doc, cursor });
    function restore(text) {
      const state = JSON.parse(text);
      doc = state.doc;
      cursor = clamp(state.cursor);
    }

    // mutate(draft, cursor) changes a copy of the score and the cursor; returning false leaves everything as it was.
    function change(mutate) {
      const before = snapshot();
      const draft = copy(doc);
      const next = { ...cursor };
      if (mutate(draft, next) === false) return false;
      doc = draft;
      cursor = clamp(next);
      past.push(before);
      if (past.length > HISTORY) past.shift();
      future.length = 0;
      return true;
    }

    function undo() {
      if (!past.length) return false;
      future.push(snapshot());
      restore(past.pop());
      return true;
    }

    function redo() {
      if (!future.length) return false;
      past.push(snapshot());
      restore(future.pop());
      return true;
    }

    // Every note's place in order, for moving one step.
    const places = () => doc.measures.flatMap((m, measure) => m.notes.map((_, note) => ({ measure, note })));

    // One note back or on (step -1 / +1); stays at the first and the last.
    function move(step) {
      const all = places();
      const at = all.findIndex((p) => p.measure === cursor.measure && p.note === cursor.note);
      const next = all[Math.max(0, Math.min(all.length - 1, at + step))];
      cursor = clamp({ ...next, head: 0 });
    }

    // To the first note of the measure before or after.
    function moveMeasure(step) {
      cursor = clamp({ measure: cursor.measure + step, note: 0, head: 0 });
    }

    function select(measure, note, head = 0) {
      cursor = clamp({ measure, note, head });
    }

    // The score as it would be stored (its id is the app's business: the old one, or none for a new score).
    function result() {
      return N.clean({ ...copy(doc), id: id ?? 'new', title: title.trim() });
    }

    // A title, and at least one note that isn't a rest (the beats always add up, PRD #4-H-6).
    function canSave() {
      if (!title.trim()) return false;
      const score = { ...doc, id: 'new', title: title.trim() };
      return doc.measures.some((m) => m.notes.some((n) => !n.rest)) && N.isValid(score);
    }

    return {
      get score() { return doc; },
      get cursor() { return { ...cursor }; },
      get title() { return title; },
      get id() { return id; },
      setTitle(value) { title = String(value).slice(0, N.MAX_TITLE); },
      change, undo, redo,
      canUndo: () => past.length > 0,
      canRedo: () => future.length > 0,
      move, moveMeasure, select, result, canSave,
    };
  }

  window.Editing = { create, blank, HISTORY, DEFAULT };
})();
