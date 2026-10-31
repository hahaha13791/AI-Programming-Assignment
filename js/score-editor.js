(function () {
  // The editor screen (PRD #4-H): the score drawn with the chosen note (cursor) marked, pressing a note or a chord
  // head to choose it, undo/redo, the tool tabs [음표 | 마디 | 기호] and the keyboard. The work on the score itself
  // is in editing.js.
  const N = Notation;
  const TYPE_NAMES = {
    whole: '온', half: '2분', quarter: '4분', eighth: '8분', '16th': '16분', '32nd': '32분', '64th': '64분',
  };
  const SIGNS = { 2: '𝄪', 1: '♯', 0: '', '-1': '♭', '-2': '𝄫' };

  const pitchName = (pitch) => `${pitch.step}${SIGNS[pitch.alter] ?? ''}${pitch.octave}`;

  // "3마디 2번째 · F♯4 4분음표" for the status line under the score.
  function describe(score, cursor) {
    const measure = N.resolve(score)[cursor.measure];
    const note = score.measures[cursor.measure].notes[cursor.note];
    const length = `${'점'.repeat(note.dots ?? 0)}${TYPE_NAMES[note.type]}${note.rest ? '쉼표' : '음표'}`;
    const where = `${measure.number}마디 ${cursor.note + 1}번째`;
    if (note.rest) return `${where} · ${length}`;
    const pitches = N.pitchesOf(note);
    const what = pitches.length > 1
      ? `화음 ${pitches.map((p, i) => (i === cursor.head ? `[${pitchName(p.pitch)}]` : pitchName(p.pitch))).join(' ')}`
      : pitchName(note.pitch);
    return `${where} · ${note.grace ? '꾸밈음 ' : ''}${what} ${length}`;
  }

  // elements: { title, view, status, undo, redo, tabs, tools: { notes, measure, signs } }. onChange: after any change.
  function create({ title, view, status, undo, redo, tabs, tools, onChange = () => {} }) {
    let state = null;

    function render() {
      if (!state) return;
      const score = { ...state.score, id: 'edit', title: state.title || '새 악보' };
      Sheet.draw(view, score, { pick: true, cursor: state.cursor, numberFirst: true, label: `편집 중인 악보, ${score.title}` });
      status.textContent = describe(score, state.cursor);
      undo.disabled = !state.canUndo();
      redo.disabled = !state.canRedo();
      // A row wider than the screen scrolls sideways: keep the chosen note in sight.
      const chosen = view.querySelector('.sv-note.is-cursor');
      const row = chosen?.closest('.sheet-row');
      if (row) {
        const at = chosen.getBoundingClientRect();
        const box = row.getBoundingClientRect();
        if (at.left < box.left || at.right > box.right) row.scrollLeft += at.left - box.left - box.width / 2;
      }
      onChange();
    }

    function open(score) {
      state = Editing.create(score);
      title.value = state.title;
      showTab('notes');
      render();
    }

    function close() {
      state = null;
      view.replaceChildren();
    }

    function showTab(name) {
      for (const tab of tabs.querySelectorAll('[role="tab"]')) tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
      for (const [key, panel] of Object.entries(tools)) panel.hidden = key !== name;
    }

    // A change through editing.js, then the drawing. Returns whether anything changed.
    function apply(mutate) {
      if (!state || !state.change(mutate)) return false;
      render();
      return true;
    }

    title.addEventListener('input', () => {
      if (!state) return;
      state.setTitle(title.value);
      onChange();
    });

    // A press on a note (or a chord's head) chooses it; a press on the space a note takes in its measure chooses it too.
    view.addEventListener('click', (event) => {
      if (!state) return;
      const target = event.target.closest('.sv-pick, .sv-note');
      if (!target) return;
      const measure = Number(target.closest('[data-measure]')?.dataset.measure);
      const note = Number(target.dataset.index);
      if (!Number.isInteger(measure) || !Number.isInteger(note)) return;
      const head = Number(event.target.closest('.sv-head')?.dataset.head ?? 0);
      state.select(measure, note, head);
      render();
    });

    undo.addEventListener('click', () => state?.undo() && render());
    redo.addEventListener('click', () => state?.redo() && render());
    tabs.addEventListener('click', (event) => {
      const tab = event.target.closest('[role="tab"]');
      if (tab) showTab(tab.dataset.tab);
    });

    // The keyboard (PRD #4-H-4). Returns true when the key was the editor's. Not while typing in a text box.
    function key(event) {
      if (!state) return false;
      const typing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
      if (typing) return false;
      const ctrl = event.ctrlKey || event.metaKey;
      let handled = true;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const step = event.key === 'ArrowLeft' ? -1 : 1;
        if (ctrl) state.moveMeasure(step);
        else state.move(step);
        render();
      } else if (ctrl && !event.shiftKey && (event.key === 'z' || event.key === 'Z')) {
        if (state.undo()) render();
      } else if (ctrl && (event.key === 'y' || event.key === 'Y' || (event.shiftKey && (event.key === 'z' || event.key === 'Z')))) {
        if (state.redo()) render();
      } else {
        handled = false;
      }
      if (handled) event.preventDefault();
      return handled;
    }

    return {
      open, close, apply, render, key, showTab,
      get state() { return state; },
      canSave: () => Boolean(state?.canSave()),
      result: () => state?.result() ?? null,
    };
  }

  window.ScoreEditor = { create, describe, pitchName };
})();
