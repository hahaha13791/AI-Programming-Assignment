(function () {
  // Symbols on a staff (PRD #4-L-3): the staff lines are taken out (where nothing crosses them), then the clef at the
  // staff's start and the note heads — filled and hollow — are found on each line and space, with ledger lines up
  // to three above and below. A head's pitch comes from its place and the clef. Sizes are measured in staff spaces,
  // so printed music of any size reads the same; heads anywhere from about 0.6 to 1.1 spaces tall are taken.

  const N = Notation;
  const STEPS = N.STEPS;
  const POS_MIN = -6; // three ledger lines below (staff positions: bottom line 0, top line 8)
  const POS_MAX = 14; // three above
  const CLEF_SPACES = 3.2; // a clef (and the gap after it) takes about this much room at the staff's start
  const LEDGERS = [-6, -4, -2, 10, 12, 14]; // ledger line positions, up to three below and above
  const STEM_MIN = 2.2; // a stem reaches at least this many spaces past its head's centre

  // The page with the staff lines (and ledger lines) taken out: a run of ink no thicker than a line, on a line, is
  // cleared — what crosses a line (a head, a stem) is thicker there and stays.
  function removeLines(page, staves) {
    const { width, height } = page;
    const bits = new Uint8Array(page.bits);
    for (const staff of staves) {
      const limit = staff.thick + 2;
      for (let x = Math.max(0, Math.floor(staff.left) - 2); x <= Math.min(width - 1, Math.ceil(staff.right) + 2); x++) {
        const heights = [0, 1, 2, 3, 4].map((line) => OmrStaff.lineY(staff, line, x));
        for (const pos of LEDGERS) heights.push(posY(staff, pos, x));
        for (const at of heights) {
          const yc = Math.round(at);
          let y = -1;
          for (const d of [0, -1, 1, -2, 2]) {
            const yy = yc + d;
            if (yy >= 0 && yy < height && bits[yy * width + x]) {
              y = yy;
              break;
            }
          }
          if (y < 0) continue;
          let top = y;
          while (top > 0 && bits[(top - 1) * width + x]) top--;
          let bottom = y;
          while (bottom < height - 1 && bits[(bottom + 1) * width + x]) bottom++;
          if (bottom - top + 1 <= limit) for (let yy = top; yy <= bottom; yy++) bits[yy * width + x] = 0;
        }
      }
    }
    return { width, height, bits };
  }

  function integral(page) {
    const { width, height, bits } = page;
    const stride = width + 1;
    const sums = new Uint32Array(stride * (height + 1));
    for (let y = 0; y < height; y++) {
      let row = 0;
      for (let x = 0; x < width; x++) {
        row += bits[y * width + x];
        sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + row;
      }
    }
    return sums;
  }

  // Share of ink in the box x0..x1 × y0..y1 (inclusive, clipped to the page).
  function fill(page, sums, x0, y0, x1, y1) {
    const stride = page.width + 1;
    x0 = Math.max(0, Math.round(x0));
    y0 = Math.max(0, Math.round(y0));
    x1 = Math.min(page.width - 1, Math.round(x1));
    y1 = Math.min(page.height - 1, Math.round(y1));
    if (x1 < x0 || y1 < y0) return 0;
    const s = sums[(y1 + 1) * stride + x1 + 1] - sums[y0 * stride + x1 + 1] - sums[(y1 + 1) * stride + x0] + sums[y0 * stride + x0];
    return s / ((x1 - x0 + 1) * (y1 - y0 + 1));
  }

  const ink = (page, x, y) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    return xi >= 0 && yi >= 0 && xi < page.width && yi < page.height && page.bits[yi * page.width + xi] === 1;
  };

  // The length of the ink run through (x, y), horizontally or vertically (0 when (x, y) is blank).
  function run(page, x, y, dx, dy, max) {
    if (!ink(page, x, y)) return 0;
    let a = 0;
    while (a < max && ink(page, x - dx * (a + 1), y - dy * (a + 1))) a++;
    let b = 0;
    while (b < max && ink(page, x + dx * (b + 1), y + dy * (b + 1))) b++;
    return a + b + 1;
  }

  // Blank distance from (x, y) to the first ink in a direction (Infinity past max).
  function reach(page, x, y, dx, dy, max) {
    for (let d = 1; d <= max; d++) if (ink(page, x + dx * d, y + dy * d)) return d;
    return Infinity;
  }

  // A staff position's height at x: between the lines, or on from them by the line spacing.
  function posY(staff, pos, x) {
    const bottom = OmrStaff.lineY(staff, 4, x);
    const top = OmrStaff.lineY(staff, 0, x);
    return bottom + ((top - bottom) * pos) / 8;
  }

  // The stem of a head at (x, y): a vertical line on its right going up, or on its left going down, reaching
  // STEM_MIN spaces from the head's centre and not on past the head the other way (a sharp's strokes run both ways,
  // a flat's goes up on the left). → { x, top, bottom } or null.
  function stemmed(page, x, y, s) {
    for (const side of [1, -1]) {
      for (let dx = Math.round(s * 0.15); dx <= Math.round(s * 0.9); dx++) {
        const sx = x + side * dx;
        for (let dy = -Math.round(s * 0.35); dy <= Math.round(s * 0.35); dy++) {
          if (!ink(page, sx, y + dy)) continue;
          let up = 0;
          while (up < s * 6 && ink(page, sx, y + dy - up - 1)) up++;
          let down = 0;
          while (down < s * 6 && ink(page, sx, y + dy + down + 1)) down++;
          const top = y + dy - up;
          const bottom = y + dy + down;
          // (It may go on past the head as far as a chord's other heads.)
          if (side === 1 && top <= y - s * STEM_MIN && bottom <= y + s * 4) return { x: sx, top, bottom };
          if (side === -1 && bottom >= y + s * STEM_MIN && top >= y - s * 4) return { x: sx, top, bottom };
          break;
        }
      }
    }
    return null;
  }

  // Wide ink both in the staff's upper and lower halves at x: a time signature's two numbers, not a head. (A row
  // counts when it has ink across a good part of the head's width, so a stem going by doesn't.)
  function stacked(page, staff, x) {
    const s = staff.space;
    const share = (from, to) => {
      let hit = 0;
      let rows = 0;
      for (let pos = from; pos <= to; pos += 0.25) {
        rows++;
        const y = posY(staff, pos, x);
        let count = 0;
        for (let dx = -Math.round(s * 0.5); dx <= Math.round(s * 0.5); dx++) if (ink(page, x + dx, y)) count++;
        if (count >= Math.max(3, s * 0.3)) hit++;
      }
      return hit / rows;
    };
    return share(4.5, 7.5) > 0.35 && share(0.5, 3.5) > 0.35;
  }

  // A filled head centred near (x, y)? → its score (0 = no).
  function filledAt(page, sums, x, y, s) {
    if (!ink(page, x, y)) return 0;
    const core = fill(page, sums, x - s * 0.22, y - s * 0.13, x + s * 0.22, y + s * 0.13);
    if (core < 0.9) return 0;
    const h1 = run(page, x, y - s * 0.12, 1, 0, s * 2);
    const h2 = run(page, x, y + s * 0.12, 1, 0, s * 2);
    const h = Math.min(h1, h2);
    if (h < s * 0.45 || h > s * 1.75) return 0;
    const v = run(page, x, y, 0, 1, s * 2);
    if (v < s * 0.4 || v > s * 1.4) return 0;
    if (!stemmed(page, x, y, s)) return 0; // a filled head always has a stem
    // How full a head-sized box around it is: a head beats the thick end of a flag.
    return (core + fill(page, sums, x - s * 0.35, y - s * 0.22, x + s * 0.35, y + s * 0.22)) / 2;
  }

  // A hollow head (half or whole note) around (x, y)? → its score (0 = no): blank inside, closed by a thin ring.
  function hollowAt(page, x, y, s) {
    if (ink(page, x, y)) return 0;
    const l = reach(page, x, y, -1, 0, s * 0.8);
    const r = reach(page, x, y, 1, 0, s * 0.8);
    const u = reach(page, x, y, 0, -1, s * 0.6);
    const d = reach(page, x, y, 0, 1, s * 0.6);
    if (![l, r, u, d].every(Number.isFinite)) return 0;
    const inner = l + r;
    const tall = u + d;
    if (inner < s * 0.25 || inner > s * 1.3 || tall < s * 0.1 || tall > s * 0.95) return 0;
    if (Math.abs(l - r) > Math.max(2, s * 0.25) || Math.abs(u - d) > Math.max(2, s * 0.2)) return 0;
    // The ring all round, thin, and the whole thing no wider than a head.
    let hits = 0;
    const steps = 16;
    for (let k = 0; k < steps; k++) {
      const a = (2 * Math.PI * k) / steps;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const limit = Math.hypot((inner / 2 + s * 0.25) * dx, (tall / 2 + s * 0.25) * dy);
      if (reach(page, x, y, dx, dy, Math.max(2, limit)) !== Infinity) hits++;
    }
    if (hits < steps - 2) return 0; // a ledger line touching it may leave a gap or two
    // No wider than a head (measured on the left: a tie may touch a head's right side).
    const outerLeft = l + run(page, x - l, y, -1, 0, s) - 1;
    if (outerLeft > s * 0.95) return 0;
    return hits / steps;
  }

  // The heads on a staff between x0 and x1: [{ x, pos, filled, score }] left to right.
  function findHeads(page, sums, staff, x0, x1) {
    const s = staff.space;
    const found = [];
    for (let pos = POS_MIN; pos <= POS_MAX; pos++) {
      let best = null;
      const flush = () => {
        if (best) found.push(best);
        best = null;
      };
      let lastX = -Infinity;
      for (let x = Math.round(x0); x <= Math.round(x1); x++) {
        const y = posY(staff, pos, x);
        let score = filledAt(page, sums, x, y, s);
        let filled = true;
        if (!score) {
          score = hollowAt(page, x, y, s);
          filled = false;
        }
        if (!score) continue;
        if (best && x - lastX > s * 0.4) flush();
        if (!best || score > best.score) best = { x, pos, filled, score };
        lastX = x;
      }
      flush();
    }
    // One head may show on two neighbouring positions: keep the better (a filled head sits best on its own step).
    found.sort((a, b) => b.score - a.score);
    const kept = [];
    for (const head of found) {
      const clash = kept.some((k) => Math.abs(k.x - head.x) < s * 0.55 && Math.abs(k.pos - head.pos) <= 1);
      if (!clash) kept.push(head);
    }
    // A stem has its heads at one end: a "head" at the far end of a better head's stem is a flag or a beam's corner.
    for (const head of kept) {
      if (!head.filled) continue;
      head.stem = stemmed(page, head.x, posY(staff, head.pos, head.x), s);
    }
    const stemOf = (h) => h.stem;
    const out = kept.filter((head) => {
      if (!head.stem) return true;
      return !kept.some((other) => other !== head && other.stem && other.score > head.score
        && Math.abs(stemOf(other).x - stemOf(head).x) <= 2
        && Math.abs(other.pos - head.pos) >= 4);
    });
    return out.sort((a, b) => a.x - b.x || b.pos - a.pos);
  }

  // The clef at a staff's start: a treble clef reaches well above and below the staff; a bass clef stays in its upper
  // part. → { clef, sure }
  function findClef(page, clean, staff) {
    const s = staff.space;
    const x0 = Math.max(0, Math.round(staff.left));
    const x1 = Math.min(page.width - 1, Math.round(staff.left + s * (CLEF_SPACES - 0.3)));
    // How far the clef reaches past the staff: ink joined to the staff within the clef's columns (on the page with
    // its lines, which hold a clef's pieces together; a measure number above stands apart).
    const w = x1 - x0 + 1;
    const yMin = Math.max(0, Math.round(staff.top - s * 4));
    const yMax = Math.min(page.height - 1, Math.round(staff.bottom + s * 4));
    const seen = new Uint8Array(w * (yMax - yMin + 1));
    const stack = [];
    for (let x = x0; x <= x1; x++) {
      for (let y = Math.round(OmrStaff.lineY(staff, 0, x)); y <= Math.round(OmrStaff.lineY(staff, 4, x)); y++) {
        if (ink(page, x, y)) {
          seen[(y - yMin) * w + (x - x0)] = 1;
          stack.push(x, y);
        }
      }
    }
    let y0 = staff.top;
    let y1 = staff.bottom;
    while (stack.length) {
      const y = stack.pop();
      const x = stack.pop();
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < x0 || xx > x1 || yy < yMin || yy > yMax) continue;
          const k = (yy - yMin) * w + (xx - x0);
          if (seen[k] || !ink(page, xx, yy)) continue;
          seen[k] = 1;
          stack.push(xx, yy);
        }
      }
    }
    const above = (staff.top - y0) / s;
    const below = (y1 - staff.bottom) / s;
    let mass = 0;
    let upper = 0;
    for (let x = x0; x <= x1; x++) {
      const top = OmrStaff.lineY(staff, 0, x);
      const bottom = OmrStaff.lineY(staff, 4, x);
      for (let yy = Math.round(top); yy <= Math.round(bottom); yy++) {
        if (!ink(clean, x, yy)) continue;
        mass++;
        if (yy < (top + bottom) / 2) upper++;
      }
    }
    // A treble clef hangs well below the staff; a bass clef stays on it, mostly in its upper half.
    const measured = { above, below, upper: mass ? upper / mass : 0 };
    const top = measured.upper;
    if (below >= 0.6) return { clef: 'treble', sure: below >= 0.9 && top < 0.55, ...measured };
    if (above < 1.3 && top >= 0.55) return { clef: 'bass', sure: below < 0.4, ...measured };
    return { clef: 'treble', sure: false, ...measured };
  }

  // Pieces of ink (8-connected) on the page without staff lines: [{ x0, y0, x1, y1, count }].
  function components(page) {
    const { width, height, bits } = page;
    const label = new Int32Array(width * height);
    const out = [];
    const stack = [];
    for (let start = 0; start < bits.length; start++) {
      if (!bits[start] || label[start]) continue;
      const id = out.length + 1;
      const box = { x0: Infinity, y0: Infinity, x1: -1, y1: -1, count: 0 };
      label[start] = id;
      stack.push(start);
      while (stack.length) {
        const p = stack.pop();
        const x = p % width;
        const y = (p - x) / width;
        box.count++;
        if (x < box.x0) box.x0 = x;
        if (x > box.x1) box.x1 = x;
        if (y < box.y0) box.y0 = y;
        if (y > box.y1) box.y1 = y;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= width) continue;
            const q = yy * width + xx;
            if (bits[q] && !label[q]) {
              label[q] = id;
              stack.push(q);
            }
          }
        }
      }
      out.push(box);
    }
    return out;
  }

  // A solid piece at least a space wide and tall with no head in it: something not read (a smudge, a symbol the
  // reading doesn't know).
  function unreadIn(pieces, staff, x0, x1, heads) {
    const s = staff.space;
    return pieces.some((p) => {
      const cx = (p.x0 + p.x1) / 2;
      const cy = (p.y0 + p.y1) / 2;
      if (cx < x0 || cx > x1 || cy < staff.top - s * 3 || cy > staff.bottom + s * 3) return false;
      const w = p.x1 - p.x0 + 1;
      const h = p.y1 - p.y0 + 1;
      if (w < s * 0.8 || h < s * 0.8 || p.count / (w * h) < 0.6) return false;
      return !heads.some((head) => head.x >= p.x0 && head.x <= p.x1 && head.y >= p.y0 && head.y <= p.y1);
    });
  }

  // A head's pitch from its place and the clef (no accidental yet).
  function pitchOf(pos, clef) {
    const d = Sheet.clefBottom(clef) + pos;
    return { step: STEPS[((d % 7) + 7) % 7], alter: 0, octave: Math.floor(d / 7) };
  }

  // Reads the heads of every measure of every staff on one analysed page (OmrStaff.analyse) into the analysis:
  // analysis.clefs[staff] = { clef, sure }, and each measure gets notes (quarter notes for now, PRD #4-L-3 — lengths
  // are read in 68단계) and doubtful (a head not read surely, or two heads on one stem: a chord).
  function read(page, analysis) {
    const clean = removeLines(page, analysis.staves);
    const sums = integral(clean);
    const pieces = components(clean);
    analysis.clefs = analysis.staves.map((staff) => findClef(page, clean, staff));
    analysis.staves.forEach((staff, i) => {
      const { clef, sure } = analysis.clefs[i];
      const start = staff.left + staff.space * CLEF_SPACES;
      analysis.measures[i].forEach((m, k) => {
        const from = k === 0 ? Math.max(m.x0, start) : m.x0 + staff.space * 0.3;
        let heads = findHeads(clean, sums, staff, from, m.x1 - staff.space * 0.3);
        for (const head of heads) head.y = posY(staff, head.pos, head.x);
        // A time signature (at a staff's start or where the time changes): stacked numbers aren't heads.
        heads = heads.filter((head) => !stacked(clean, staff, head.x));
        let doubtful = (!sure && k === 0) || unreadIn(pieces, staff, from, m.x1, heads);
        // Heads one above another (within a head's width) share a stem: a chord. The top one is kept.
        const singles = [];
        for (const head of heads) {
          const last = singles[singles.length - 1];
          if (last && Math.abs(head.x - last.x) < staff.space * 0.7) {
            doubtful = true;
            if (head.pos > last.pos) singles[singles.length - 1] = head;
            continue;
          }
          singles.push(head);
        }
        m.heads = singles;
        m.notes = singles.map((head) => ({ type: 'quarter', dots: 0, pitch: pitchOf(head.pos, clef) }));
        m.doubtful = doubtful;
      });
    });
    return analysis;
  }

  window.OmrSymbols = { POS_MIN, POS_MAX, CLEF_SPACES, removeLines, findHeads, findClef, pitchOf, posY, read, integral, components };
})();
