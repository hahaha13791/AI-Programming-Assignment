(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SOLFEGE = ['도', '레', '미', '파', '솔', '라', '시', '높은 도', '높은 레', '높은 미', '높은 파', '높은 솔'];
  const STEP_SEMITONES = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19];
  const LABEL_TO_STEP = Object.fromEntries(SOLFEGE.map((label, step) => [label.replace(' ', ''), step]));

  const LINE_GAP = 16;
  const HALF_GAP = LINE_GAP / 2;
  // step: 0 = C4 ... 7 = C5 ... 11 = G5. The bottom staff line is E4 (step 2).
  const BOTTOM_LINE_Y = 110;
  const STAFF_LEFT = 8;
  const MAX_NOTES = 8;
  const MELODY_TOP_STEP = 7;
  const HEIGHT = 150;

  // Chord drawing: a notehead a second above its neighbour moves to the right of the stem side,
  // and accidentals that would collide move further left into their own column.
  const SECOND_SHIFT = 15;
  const ACCIDENTAL_COLUMN = 10;
  const ACCIDENTAL_CLEARANCE = 5;

  // On narrow screens the notes sit closer together so the staff can be drawn taller,
  // which makes each line/space a bigger touch target. Very small phones (~320px) tighten it once more
  // to keep a line/space step at 7px or more.
  const compactQuery = window.matchMedia('(max-width: 480px)');
  const tinyQuery = window.matchMedia('(max-width: 360px)');

  function layout() {
    if (tinyQuery.matches) return { clefWidth: 46, noteSpacing: 30, width: 46 + 30 * MAX_NOTES + 4 };
    const compact = compactQuery.matches;
    const clefWidth = compact ? 52 : 64;
    const noteSpacing = compact ? 32 : 50;
    return { clefWidth, noteSpacing, width: clefWidth + noteSpacing * MAX_NOTES + (compact ? 4 : 16) };
  }

  function stepY(step) {
    return BOTTOM_LINE_Y - (step - 2) * HALF_GAP;
  }

  function yToStep(y, topStep) {
    const step = Math.round((BOTTOM_LINE_Y - y) / HALF_GAP) + 2;
    return step >= 0 && step <= topStep ? step : null;
  }

  function slotX(geo, index) {
    return geo.clefWidth + geo.noteSpacing * (index + 0.5);
  }

  function chordX(geo) {
    return geo.clefWidth + geo.noteSpacing * (MAX_NOTES / 2);
  }

  function noteLabel(note) {
    const mark = note.accidental === 1 ? '#' : note.accidental === -1 ? '♭' : '';
    return SOLFEGE[note.step] + mark;
  }

  function noteToMidi(note) {
    return 60 + STEP_SEMITONES[note.step] + note.accidental;
  }

  // Low to high by staff position; the order chord notes are listed and drawn in.
  function byPitch(a, b) {
    return a.step - b.step;
  }

  // "도 레 미 파# 시♭ 높은도" -> [{ step, accidental }, ...]
  function parseNotes(text) {
    return text.trim().split(/\s+/).map((token) => {
      const [, name, mark] = token.match(/^(.+?)([#♭]?)$/);
      const step = LABEL_TO_STEP[name];
      if (step === undefined) throw new Error(`Unknown note: ${token}`);
      return { step, accidental: mark === '#' ? 1 : mark === '♭' ? -1 : 0 };
    });
  }

  function svgEl(name, attrs, text) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text) node.textContent = text;
    return node;
  }

  function drawBackground(svg, layer, geo) {
    svg.setAttribute('viewBox', `0 0 ${geo.width} ${HEIGHT}`);
    const right = geo.width - STAFF_LEFT;
    layer.replaceChildren(svgEl('line', { x1: STAFF_LEFT, x2: right, y1: stepY(0), y2: stepY(0), class: 'staff-guide' }));
    for (let i = 0; i < 5; i++) {
      const y = BOTTOM_LINE_Y - i * LINE_GAP;
      layer.append(svgEl('line', { x1: STAFF_LEFT, x2: right, y1: y, y2: y, class: 'staff-line' }));
    }
    layer.append(svgEl('text', { x: STAFF_LEFT + 2, y: BOTTOM_LINE_Y + 2, class: 'staff-clef' }, '\u{1D11E}'));
  }

  function buildStaff(label, geo) {
    const svg = svgEl('svg', { class: 'staff', role: 'img', 'aria-label': label });
    const background = svgEl('g', { class: 'staff-background' });
    const notesLayer = svgEl('g', { class: 'staff-notes' });
    svg.append(background, notesLayer);
    drawBackground(svg, background, geo);
    return { svg, background, notesLayer };
  }

  // true: correct, false: wrong, 'missed': an answer note the user didn't enter.
  function markClass(mark) {
    return mark === true ? 'is-correct' : mark === false ? 'is-wrong' : mark === 'missed' ? 'is-missed' : '';
  }

  // Where each note of a chord goes: { shift, accidentalX } relative to the chord column, in the given order.
  function chordPlacement(notes) {
    const sorted = notes.map((note, i) => ({ note, i })).sort((a, b) => byPitch(a.note, b.note));
    const placement = [];
    let previous = null;
    for (const entry of sorted) {
      const shifted = previous !== null && !previous.shifted && entry.note.step - previous.note.step === 1;
      placement[entry.i] = { shift: shifted ? SECOND_SHIFT : 0, accidentalX: 0 };
      previous = { note: entry.note, shifted };
    }

    // Accidentals from the top down, each in the first column clear of the ones already placed.
    const columns = [];
    for (const { note, i } of sorted.reverse()) {
      if (note.accidental === 0) continue;
      let column = 0;
      while ((columns[column] || []).some((step) => Math.abs(step - note.step) < ACCIDENTAL_CLEARANCE)) column++;
      (columns[column] ||= []).push(note.step);
      placement[i].accidentalX = -column * ACCIDENTAL_COLUMN;
    }
    return placement;
  }

  function drawNote(layer, x, note, { mark, accidentalX = 0, className = '' } = {}) {
    const y = stepY(note.step);
    const group = svgEl('g', { class: `note ${markClass(mark)} ${className}`.trim() });
    if (note.step === 0) {
      group.append(svgEl('line', { x1: x - 13, x2: x + 13, y1: y, y2: y, class: 'staff-line' }));
    }
    if (note.accidental !== 0) {
      group.append(svgEl('text', { x: x - 13 + accidentalX, y: y + 6, class: 'staff-accidental' }, note.accidental === 1 ? '♯︎' : '♭︎'));
    }
    group.append(svgEl('ellipse', {
      cx: x, cy: y, rx: 7.5, ry: 5.5,
      transform: `rotate(-20 ${x} ${y})`,
      class: 'staff-note',
    }));
    layer.append(group);
  }

  // Draws notes as a chord in one column. `only` limits drawing to one index (used for the hover preview).
  function drawChord(layer, geo, notes, { marks, only, className } = {}) {
    const placement = chordPlacement(notes);
    const base = chordX(geo);
    notes.forEach((note, i) => {
      if (only !== undefined && i !== only) return;
      const { shift, accidentalX } = placement[i];
      // The accidental stays left of the unshifted notehead even when the head moves right.
      drawNote(layer, base + shift, note, { mark: marks?.[i], accidentalX: accidentalX - shift, className });
    });
  }

  function draw(container, notes, label, { chord = false, marks } = {}) {
    const geo = layout();
    const { svg, notesLayer } = buildStaff(label, geo);
    if (chord) {
      drawChord(notesLayer, geo, notes, { marks });
    } else {
      notes.forEach((note, i) => drawNote(notesLayer, slotX(geo, i), note, { mark: marks?.[i] }));
    }
    container.replaceChildren(svg);
  }

  function create({ container, preview, sharpButton, flatButton, undoButton, clearButton, onChange }) {
    let notes = [];
    let accidental = 0;
    let hoverStep = null;
    let capacity = MAX_NOTES;
    let chord = false;
    let topStep = MELODY_TOP_STEP;
    let locked = false;
    let marks = null;

    let geo = layout();
    const { svg, background, notesLayer } = buildStaff('오선지. 줄이나 칸을 클릭해 음을 입력하세요.', geo);
    const ghostLayer = svgEl('g', { class: 'staff-ghost' });
    svg.append(ghostLayer);
    container.replaceChildren(svg);

    for (const query of [compactQuery, tinyQuery]) {
      query.addEventListener('change', () => {
        geo = layout();
        drawBackground(svg, background, geo);
        render();
      });
    }

    function stepAt(event) {
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse());
      return yToStep(point.y, topStep);
    }

    function indexAtStep(step) {
      return notes.findIndex((note) => note.step === step);
    }

    // In chord mode a note under the pointer will be removed on click, so it is marked instead of previewed.
    function removableIndex() {
      return chord && !locked && hoverStep !== null ? indexAtStep(hoverStep) : -1;
    }

    function renderNotes() {
      notesLayer.replaceChildren();
      if (chord) {
        drawChord(notesLayer, geo, notes, { marks });
        const removable = removableIndex();
        if (removable !== -1) notesLayer.children[removable].classList.add('is-removing');
      } else {
        notes.forEach((note, i) => drawNote(notesLayer, slotX(geo, i), note, { mark: marks?.[i] }));
      }
    }

    function renderGhost() {
      ghostLayer.replaceChildren();
      if (locked || hoverStep === null || notes.length >= capacity) return;
      const ghost = { step: hoverStep, accidental };
      if (!chord) {
        drawNote(ghostLayer, slotX(geo, notes.length), ghost);
      } else if (indexAtStep(hoverStep) === -1) {
        drawChord(ghostLayer, geo, [...notes, ghost], { only: notes.length });
      }
    }

    function renderHover() {
      if (chord) renderNotes();
      renderGhost();
    }

    function renderPreview() {
      const order = notes.map((note, i) => i);
      if (chord) order.sort((a, b) => byPitch(notes[a], notes[b]));
      const slots = [];
      for (let i = 0; i < capacity; i++) {
        const slot = document.createElement('span');
        if (i < notes.length) {
          slot.className = `note-chip ${markClass(marks?.[order[i]])}`;
          slot.textContent = noteLabel(notes[order[i]]);
        } else {
          slot.className = 'note-slot';
          slot.setAttribute('aria-label', '빈칸');
        }
        slots.push(slot);
      }
      preview.replaceChildren(...slots);
    }

    function render() {
      renderNotes();
      renderGhost();
      renderPreview();
      svg.classList.toggle('is-locked', locked);
      undoButton.disabled = locked || notes.length === 0;
      clearButton.disabled = locked || notes.length === 0;
      onChange?.();
    }

    function setAccidental(value) {
      accidental = accidental === value ? 0 : value;
      sharpButton.setAttribute('aria-pressed', String(accidental === 1));
      flatButton.setAttribute('aria-pressed', String(accidental === -1));
      renderGhost();
    }

    svg.addEventListener('click', (event) => {
      if (locked) return;
      const step = stepAt(event);
      if (step === null) return;
      const existing = chord ? indexAtStep(step) : -1;
      if (existing !== -1) {
        notes.splice(existing, 1);
      } else if (notes.length < capacity) {
        notes.push({ step, accidental });
      } else {
        return;
      }
      render();
    });

    svg.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse') return;
      const step = stepAt(event);
      if (step === hoverStep) return;
      hoverStep = step;
      renderHover();
    });
    svg.addEventListener('pointerleave', () => {
      hoverStep = null;
      renderHover();
    });

    sharpButton.addEventListener('click', () => setAccidental(1));
    flatButton.addEventListener('click', () => setAccidental(-1));
    undoButton.addEventListener('click', () => {
      if (locked) return;
      notes.pop();
      render();
    });
    clearButton.addEventListener('click', () => {
      if (locked) return;
      notes = [];
      render();
    });

    render();

    return {
      getNotes: () => notes.slice(),
      // options.chord: stack notes in one column (harmony mode); options.topStep: highest enterable step.
      reset(newCapacity, options = {}) {
        notes = [];
        marks = null;
        capacity = newCapacity;
        chord = Boolean(options.chord);
        topStep = options.topStep ?? MELODY_TOP_STEP;
        render();
      },
      setLocked(value) {
        locked = value;
        render();
      },
      setMarks(value) {
        marks = value;
        render();
      },
    };
  }

  window.Staff = { create, draw, noteLabel, noteToMidi, parseNotes, stepY, HALF_GAP };
})();
