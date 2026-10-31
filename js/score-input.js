(function () {
  // 내 악보 받아 적기: an input staff that follows the score — its clef and (at the section's start) key signature,
  // over the score's whole range. A press on a line or space adds that pitch with the key signature applied, unless
  // a ♯/♭/♮ toggle is on. The notes area scrolls sideways (the clef and key stay put) and follows the next empty
  // slot; the solfège row under it scrolls with it.
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const HALF = 8; // px per line/space step: at least 7 so each stays easy to press on a phone
  const TOP_LINE = 8;
  const MARGIN = 3; // steps of room above and below the score's range
  const PAD = 10; // px above the highest and below the lowest step
  const LABEL_HEIGHT = 30;
  const SLOT = 38; // px per note slot
  const SLOT_PAD = 10;
  const PREFIX_CLEF = 40;
  const KEY_STEP = 10;
  const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const STEP_INDEX = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  const BOTTOM = { treble: 4 * 7 + 2, bass: 2 * 7 + 4 }; // E4, G2 as diatonic numbers
  const CLEF_GLYPH = { treble: '\u{1D11E}', bass: '\u{1D122}' };
  const SIGNS = { 2: '\u{1D12A}', 1: '♯︎', 0: '♮︎', '-1': '♭︎', '-2': '\u{1D12B}' };
  const LABEL_SIGNS = { 2: '𝄪', 1: '#', '-1': '♭', '-2': '𝄫' };
  const SOLFEGE = ['도', '레', '미', '파', '솔', '라', '시'];

  const diatonic = (pitch) => pitch.octave * 7 + STEP_INDEX[pitch.step];
  const fromDiatonic = (d) => ({ step: STEPS[((d % 7) + 7) % 7], octave: Math.floor(d / 7) });

  function svgEl(name, attrs, text) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // The solfège name of a pitch. Movable do: the key's tonic is 도 in major and 라 in minor, and a sign shows a pitch
  // raised or lowered from the key. Fixed do: C is 도 and the sign is the pitch's own.
  function label(pitch, key, style = 'movable') {
    if (style === 'fixed') return SOLFEGE[STEP_INDEX[pitch.step]] + (LABEL_SIGNS[pitch.alter] ?? '');
    const alters = Sheet.keyAlters(key);
    // 도 is the major tonic of the key signature (C 0, G 4, D 1, ...: a fifth up is 4 steps). A minor key's tonic
    // is then 라 on its own: A minor (no signs) A = 라, E minor (one ♯) E = 라.
    const doIndex = (((key.fifths * 4) % 7) + 7) % 7;
    const degree = (STEP_INDEX[pitch.step] - doIndex + 7) % 7;
    const sign = LABEL_SIGNS[pitch.alter - (alters[pitch.step] ?? 0)] ?? '';
    return SOLFEGE[degree] + sign;
  }

  function create({ container, sharpButton, flatButton, naturalButton, undoButton, clearButton, onChange }) {
    let clef = 'treble';
    let key = { fifths: 0, mode: 'major' };
    let low = 0;
    let high = TOP_LINE; // positions (steps above the bottom line)
    let capacity = 0;
    let notes = [];
    let marks = null;
    let locked = true;
    let toggle = null; // 1, -1, 0 (♮) or null
    let style = 'movable';
    let hoverPos = null;

    const box = document.createElement('div');
    box.className = 'score-input';
    const fixed = svgEl('svg', { class: 'score-input-fixed', 'aria-hidden': 'true' });
    const scroller = document.createElement('div');
    scroller.className = 'score-input-scroll';
    const svg = svgEl('svg', { class: 'score-input-svg', role: 'img' });
    scroller.append(svg);
    box.append(fixed, scroller);
    container.replaceChildren(box);

    const yOf = (pos) => PAD + (high - pos) * HALF;
    const staffHeight = () => PAD * 2 + (high - low) * HALF;
    const slotX = (i) => SLOT_PAD + SLOT * (i + 0.5);
    const posOf = (pitch) => diatonic(pitch) - BOTTOM[clef];

    // What a press at this position enters: the key signature's pitch, or the toggle's accidental instead.
    function pitchAt(pos) {
      const base = fromDiatonic(pos + BOTTOM[clef]);
      const alter = toggle ?? (Sheet.keyAlters(key)[base.step] ?? 0);
      return { step: base.step, alter, octave: base.octave };
    }

    function posAtEvent(event) {
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse());
      const pos = Math.round((PAD - point.y) / HALF + high);
      return pos >= low && pos <= high ? pos : null;
    }

    function drawLines(target, width) {
      for (let p = 0; p <= TOP_LINE; p += 2) {
        target.append(svgEl('line', { x1: 0, x2: width, y1: yOf(p), y2: yOf(p), class: 'staff-line' }));
      }
    }

    function drawLedgers(target, x, pos) {
      for (let p = -2; p >= pos; p -= 2) target.append(svgEl('line', { x1: x - 11, x2: x + 11, y1: yOf(p), y2: yOf(p), class: 'staff-line sv-ledger' }));
      for (let p = TOP_LINE + 2; p <= pos; p += 2) target.append(svgEl('line', { x1: x - 11, x2: x + 11, y1: yOf(p), y2: yOf(p), class: 'staff-line sv-ledger' }));
    }

    function drawHead(target, x, pitch, className) {
      const pos = posOf(pitch);
      const y = yOf(pos);
      const group = svgEl('g', { class: `si-note ${className}`.trim(), 'data-pos': pos });
      target.append(group);
      drawLedgers(group, x, pos);
      const shown = pitch.alter !== (Sheet.keyAlters(key)[pitch.step] ?? 0);
      if (shown) group.append(svgEl('text', { x: x - 9, y: y + 5, class: 'staff-accidental sv-accidental' }, SIGNS[pitch.alter]));
      group.append(svgEl('ellipse', { cx: x, cy: y, rx: 6.5, ry: 4.6, transform: `rotate(-20 ${x} ${y})`, class: 'note-head' }));
      return group;
    }

    function renderFixed() {
      const height = staffHeight() + LABEL_HEIGHT;
      const signs = Math.abs(key.fifths);
      const width = PREFIX_CLEF + signs * KEY_STEP + 6;
      fixed.setAttribute('viewBox', `0 0 ${width} ${height}`);
      fixed.style.width = `${width}px`;
      fixed.style.height = `${height}px`;
      fixed.replaceChildren();
      drawLines(fixed, width);
      const clefY = clef === 'treble' ? yOf(0) + 2 : yOf(4) + 23;
      fixed.append(svgEl('text', { x: 2, y: clefY, class: 'staff-clef', 'data-clef': clef }, CLEF_GLYPH[clef]));
      Sheet.keySigns(key, clef).forEach((sign, i) => {
        fixed.append(svgEl('text', {
          x: PREFIX_CLEF + i * KEY_STEP + KEY_STEP - 1, y: yOf(sign.pos) + 5, class: 'sv-accidental sv-key', 'data-pos': sign.pos,
        }, SIGNS[sign.alter]));
      });
    }

    function render() {
      const height = staffHeight() + LABEL_HEIGHT;
      // At least as wide as its box, so the staff lines run to the edge even when the notes don't.
      const width = Math.max(SLOT_PAD * 2 + SLOT * Math.max(capacity, 1), scroller.clientWidth || 0);
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.style.width = `${width}px`;
      svg.style.height = `${height}px`;
      svg.classList.toggle('is-locked', locked);
      svg.replaceChildren();
      drawLines(svg, width);
      const labels = svgEl('g', { class: 'si-labels' });
      for (let i = 0; i < capacity; i++) {
        const x = slotX(i);
        const pitch = notes[i];
        if (pitch) drawHead(svg, x, pitch, markClass(marks?.[i]));
        const y = staffHeight() + 18;
        if (pitch) {
          labels.append(svgEl('text', { x, y, class: `si-label ${markClass(marks?.[i])}`.trim(), 'data-slot': i }, label(pitch, key, style)));
        } else {
          labels.append(svgEl('rect', { x: x - 14, y: y - 13, width: 28, height: 18, rx: 9, class: `si-empty${i === notes.length ? ' is-next' : ''}`, 'data-slot': i }));
        }
      }
      svg.append(labels);
      if (!locked && hoverPos !== null && notes.length < capacity) {
        drawHead(svg, slotX(notes.length), pitchAt(hoverPos), 'is-ghost');
      }
      if (undoButton) undoButton.disabled = locked || notes.length === 0;
      if (clearButton) clearButton.disabled = locked || notes.length === 0;
      svg.setAttribute('aria-label', `받아 적기 오선. ${notes.length}/${capacity}음 입력${notes.length ? `: ${notes.map((n) => label(n, key, style)).join(' ')}` : ''}`);
      onChange?.();
    }

    function markClass(mark) {
      return mark === true ? 'is-correct' : mark === false ? 'is-wrong' : '';
    }

    // Keeps the next empty slot (or, after erasing, the last note) in view.
    function follow() {
      const target = Math.min(notes.length, capacity - 1);
      const left = slotX(target) - SLOT;
      const right = slotX(target) + SLOT;
      if (left < scroller.scrollLeft) scroller.scrollLeft = Math.max(0, left);
      else if (right > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = right - scroller.clientWidth;
    }

    function setToggle(value) {
      toggle = toggle === value ? null : value;
      sharpButton.setAttribute('aria-pressed', String(toggle === 1));
      flatButton.setAttribute('aria-pressed', String(toggle === -1));
      naturalButton.setAttribute('aria-pressed', String(toggle === 0));
      render();
    }

    svg.addEventListener('click', (event) => {
      if (locked || notes.length >= capacity) return;
      const pos = posAtEvent(event);
      if (pos === null) return;
      notes.push(pitchAt(pos));
      render();
      follow();
    });
    svg.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse') return;
      const pos = posAtEvent(event);
      if (pos === hoverPos) return;
      hoverPos = pos;
      render();
    });
    svg.addEventListener('pointerleave', () => {
      hoverPos = null;
      render();
    });
    // A vertical mouse wheel scrolls the notes sideways when they overflow.
    scroller.addEventListener('wheel', (event) => {
      if (scroller.scrollWidth <= scroller.clientWidth || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      scroller.scrollLeft += event.deltaY;
      event.preventDefault();
    }, { passive: false });
    sharpButton.addEventListener('click', () => setToggle(1));
    flatButton.addEventListener('click', () => setToggle(-1));
    naturalButton.addEventListener('click', () => setToggle(0));
    undoButton?.addEventListener('click', () => {
      if (locked || !notes.length) return;
      notes.pop();
      render();
      follow();
    });
    clearButton?.addEventListener('click', () => {
      if (locked || !notes.length) return;
      notes = [];
      render();
      scroller.scrollLeft = 0;
    });

    return {
      // options: { clef, key, range: [lowest pitch, highest pitch] of the whole score, capacity }
      reset(options) {
        clef = options.clef;
        key = options.key;
        const [lo, hi] = options.range.map(posOf);
        low = Math.min(lo - MARGIN, -2);
        high = Math.max(hi + MARGIN, TOP_LINE + 2);
        capacity = options.capacity;
        notes = [];
        marks = null;
        hoverPos = null;
        renderFixed();
        render();
        scroller.scrollLeft = 0;
      },
      getNotes: () => notes.map((n) => ({ ...n })),
      setLocked(value) {
        locked = value;
        render();
      },
      setMarks(value) {
        marks = value;
        render();
      },
      setStyle(value) {
        style = value;
        render();
      },
      // For tests and the real-window check: where a pitch sits and which toggle enters it.
      pointFor(pitch, slot = notes.length) {
        return new DOMPoint(slotX(slot), yOf(posOf(pitch))).matrixTransform(svg.getScreenCTM());
      },
      toggleFor(pitch) {
        const keyAlter = Sheet.keyAlters(key)[pitch.step] ?? 0;
        return pitch.alter === keyAlter ? null : pitch.alter;
      },
      step: () => HALF,
      range: () => ({ low, high }),
      scroller,
      svg,
    };
  }

  window.ScoreInput = { create, label };
})();
