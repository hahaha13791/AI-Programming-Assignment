(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SOLFEGE = ['도', '레', '미', '파', '솔', '라', '시', '높은 도'];
  const STEP_SEMITONES = [0, 2, 4, 5, 7, 9, 11, 12];
  const LABEL_TO_STEP = Object.fromEntries(SOLFEGE.map((label, step) => [label.replace(' ', ''), step]));

  const LINE_GAP = 16;
  const HALF_GAP = LINE_GAP / 2;
  // step: 0 = C4 ... 7 = C5. The bottom staff line is E4 (step 2).
  const BOTTOM_LINE_Y = 110;
  const STAFF_LEFT = 8;
  const CLEF_WIDTH = 64;
  const NOTE_SPACING = 50;
  const MAX_NOTES = 8;
  const WIDTH = CLEF_WIDTH + NOTE_SPACING * MAX_NOTES + 16;
  const HEIGHT = 150;

  function stepY(step) {
    return BOTTOM_LINE_Y - (step - 2) * HALF_GAP;
  }

  function yToStep(y) {
    const step = Math.round((BOTTOM_LINE_Y - y) / HALF_GAP) + 2;
    return step >= 0 && step <= 7 ? step : null;
  }

  function noteLabel(note) {
    const mark = note.accidental === 1 ? '#' : note.accidental === -1 ? '♭' : '';
    return SOLFEGE[note.step] + mark;
  }

  function noteToMidi(note) {
    return 60 + STEP_SEMITONES[note.step] + note.accidental;
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

  function buildStaff(label) {
    const svg = svgEl('svg', { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'staff', role: 'img', 'aria-label': label });
    svg.append(svgEl('line', { x1: STAFF_LEFT, x2: WIDTH - STAFF_LEFT, y1: stepY(0), y2: stepY(0), class: 'staff-guide' }));
    for (let i = 0; i < 5; i++) {
      const y = BOTTOM_LINE_Y - i * LINE_GAP;
      svg.append(svgEl('line', { x1: STAFF_LEFT, x2: WIDTH - STAFF_LEFT, y1: y, y2: y, class: 'staff-line' }));
    }
    svg.append(svgEl('text', { x: STAFF_LEFT + 2, y: BOTTOM_LINE_Y + 2, class: 'staff-clef' }, '\u{1D11E}'));
    const notesLayer = svgEl('g', {});
    svg.append(notesLayer);
    return { svg, notesLayer };
  }

  function markClass(mark) {
    return mark === true ? 'is-correct' : mark === false ? 'is-wrong' : '';
  }

  function drawNote(layer, note, index, mark) {
    const x = CLEF_WIDTH + NOTE_SPACING * (index + 0.5);
    const y = stepY(note.step);
    const group = svgEl('g', { class: `note ${markClass(mark)}` });
    if (note.step === 0) {
      group.append(svgEl('line', { x1: x - 13, x2: x + 13, y1: y, y2: y, class: 'staff-line' }));
    }
    if (note.accidental !== 0) {
      group.append(svgEl('text', { x: x - 13, y: y + 6, class: 'staff-accidental' }, note.accidental === 1 ? '♯︎' : '♭︎'));
    }
    group.append(svgEl('ellipse', {
      cx: x, cy: y, rx: 7.5, ry: 5.5,
      transform: `rotate(-20 ${x} ${y})`,
      class: 'staff-note',
    }));
    layer.append(group);
  }

  function draw(container, notes, label) {
    const { svg, notesLayer } = buildStaff(label);
    notes.forEach((note, i) => drawNote(notesLayer, note, i));
    container.replaceChildren(svg);
  }

  function create({ container, preview, sharpButton, flatButton, undoButton, clearButton, onChange }) {
    let notes = [];
    let accidental = 0;
    let hoverStep = null;
    let capacity = MAX_NOTES;
    let locked = false;
    let marks = null;

    const { svg, notesLayer } = buildStaff('오선지. 줄이나 칸을 클릭해 음을 입력하세요.');
    const ghostLayer = svgEl('g', { class: 'staff-ghost' });
    svg.append(ghostLayer);
    container.replaceChildren(svg);

    function stepAt(event) {
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse());
      return yToStep(point.y);
    }

    function renderGhost() {
      ghostLayer.replaceChildren();
      if (locked || hoverStep === null || notes.length >= capacity) return;
      drawNote(ghostLayer, { step: hoverStep, accidental }, notes.length);
    }

    function renderPreview() {
      const slots = [];
      for (let i = 0; i < capacity; i++) {
        const slot = document.createElement('span');
        if (i < notes.length) {
          slot.className = `note-chip ${markClass(marks?.[i])}`;
          slot.textContent = noteLabel(notes[i]);
        } else {
          slot.className = 'note-slot';
          slot.setAttribute('aria-label', '빈칸');
        }
        slots.push(slot);
      }
      preview.replaceChildren(...slots);
    }

    function render() {
      notesLayer.replaceChildren();
      notes.forEach((note, i) => drawNote(notesLayer, note, i, marks?.[i]));
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
    }

    svg.addEventListener('click', (event) => {
      if (locked || notes.length >= capacity) return;
      const step = stepAt(event);
      if (step === null) return;
      notes.push({ step, accidental });
      render();
    });

    svg.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse') return;
      hoverStep = stepAt(event);
      renderGhost();
    });
    svg.addEventListener('pointerleave', () => {
      hoverStep = null;
      renderGhost();
    });

    sharpButton.addEventListener('click', () => setAccidental(1));
    flatButton.addEventListener('click', () => setAccidental(-1));
    undoButton.addEventListener('click', () => {
      notes.pop();
      render();
    });
    clearButton.addEventListener('click', () => {
      notes = [];
      render();
    });

    render();

    return {
      getNotes: () => notes.slice(),
      reset(newCapacity) {
        notes = [];
        marks = null;
        capacity = newCapacity;
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

  window.Staff = { create, draw, noteLabel, noteToMidi, parseNotes };
})();
