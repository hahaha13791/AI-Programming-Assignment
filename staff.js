(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SOLFEGE = ['도', '레', '미', '파', '솔', '라', '시', '높은 도'];

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

  function svgEl(name, attrs, text) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text) node.textContent = text;
    return node;
  }

  function drawStaff(svg) {
    for (let i = 0; i < 5; i++) {
      const y = BOTTOM_LINE_Y - i * LINE_GAP;
      svg.append(svgEl('line', { x1: STAFF_LEFT, x2: WIDTH - STAFF_LEFT, y1: y, y2: y, class: 'staff-line' }));
    }
    svg.append(svgEl('text', { x: STAFF_LEFT + 2, y: BOTTOM_LINE_Y + 2, class: 'staff-clef' }, '\u{1D11E}'));
  }

  function drawNote(layer, note, index) {
    const x = CLEF_WIDTH + NOTE_SPACING * (index + 0.5);
    const y = stepY(note.step);
    if (note.step === 0) {
      layer.append(svgEl('line', { x1: x - 13, x2: x + 13, y1: y, y2: y, class: 'staff-line' }));
    }
    if (note.accidental !== 0) {
      layer.append(svgEl('text', { x: x - 13, y: y + 6, class: 'staff-accidental' }, note.accidental === 1 ? '♯︎' : '♭︎'));
    }
    layer.append(svgEl('ellipse', {
      cx: x, cy: y, rx: 7.5, ry: 5.5,
      transform: `rotate(-20 ${x} ${y})`,
      class: 'staff-note',
    }));
  }

  function create({ container, preview, sharpButton, flatButton, undoButton, clearButton }) {
    const notes = [];
    let accidental = 0;

    const svg = svgEl('svg', {
      viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
      class: 'staff',
      role: 'img',
      'aria-label': '오선지. 줄이나 칸을 클릭해 음을 입력하세요.',
    });
    drawStaff(svg);
    const notesLayer = svgEl('g', {});
    svg.append(notesLayer);
    container.replaceChildren(svg);

    function render() {
      notesLayer.replaceChildren();
      notes.forEach((note, i) => drawNote(notesLayer, note, i));

      if (notes.length === 0) {
        const hint = document.createElement('p');
        hint.className = 'placeholder';
        hint.textContent = '오선의 줄이나 칸을 클릭해 음을 입력하세요.';
        preview.replaceChildren(hint);
      } else {
        preview.replaceChildren(...notes.map((note) => {
          const chip = document.createElement('span');
          chip.className = 'note-chip';
          chip.textContent = noteLabel(note);
          return chip;
        }));
      }

      undoButton.disabled = notes.length === 0;
      clearButton.disabled = notes.length === 0;
    }

    function setAccidental(value) {
      accidental = accidental === value ? 0 : value;
      sharpButton.setAttribute('aria-pressed', String(accidental === 1));
      flatButton.setAttribute('aria-pressed', String(accidental === -1));
    }

    svg.addEventListener('click', (event) => {
      if (notes.length >= MAX_NOTES) return;
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse());
      const step = yToStep(point.y);
      if (step === null) return;
      notes.push({ step, accidental });
      render();
    });

    sharpButton.addEventListener('click', () => setAccidental(1));
    flatButton.addEventListener('click', () => setAccidental(-1));
    undoButton.addEventListener('click', () => {
      notes.pop();
      render();
    });
    clearButton.addEventListener('click', () => {
      notes.length = 0;
      render();
    });

    render();
  }

  window.Staff = { create, noteLabel };
})();
