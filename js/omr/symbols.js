(function () {
  // Symbols on a staff (PRD #4-L-3): the staff lines are taken out (where nothing crosses them), then the clef at the
  // staff's start and the note heads — filled and hollow — are found on each line and space, with ledger lines up
  // to three above and below. A head's pitch comes from its place and the clef. Sizes are measured in staff spaces,
  // so printed music of any size reads the same; heads anywhere from about 0.6 to 1.1 spaces tall are taken.

  const N = Notation;
  const STEPS = N.STEPS;
  const POS_MIN = -6; // three ledger lines below (staff positions: bottom line 0, top line 8)
  const POS_MAX = 14; // three above
  const CLEF_SPACES = 3.6; // a clef (and the gap after it) takes about this much room at the staff's start
  const LEDGERS = [-6, -4, -2, 10, 12, 14]; // ledger line positions, up to three below and above
  const STEM_MIN = 2.2; // a stem reaches at least this many spaces past its head's centre

  // The page with the staff lines (and ledger lines) taken out: a run of ink no thicker than a line, on a line, is
  // cleared — what crosses a line (a head, a stem) is thicker there and stays.
  function removeLines(page, staves) {
    const { width, height } = page;
    const bits = new Uint8Array(page.bits);
    const removed = new Uint8Array(bits.length); // what was taken out (to join a symbol cut by a line, components())
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
          if (bottom - top + 1 <= limit) {
            for (let yy = top; yy <= bottom; yy++) {
              bits[yy * width + x] = 0;
              removed[yy * width + x] = 1;
            }
          }
        }
      }
    }
    return { width, height, bits, removed };
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
  function stemmed(page, x, y, s, staff = null) {
    // Of the upright lines near the head on the stem's side, the longest that fits (an accidental's strokes are
    // short, and may come first).
    let best = null;
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
          const fits = side === 1 ? top <= y - s * STEM_MIN && bottom <= y + s * 4 : bottom >= y + s * STEM_MIN && top >= y - s * 4;
          // A line exactly from the top line to the bottom line is a barline, not a stem — unless this head sits right
          // at its end (a stem that happens to span the staff).
          const atEnd = side === 1 ? Math.abs(bottom - y) <= s * 0.3 : Math.abs(top - y) <= s * 0.3;
          const barline = staff && !atEnd && Math.abs(top - OmrStaff.lineY(staff, 0, sx)) <= s * 0.35
            && Math.abs(bottom - OmrStaff.lineY(staff, 4, sx)) <= s * 0.35;
          if (fits && !barline && (!best || bottom - top > best.bottom - best.top)) best = { x: sx, top, bottom };
          break;
        }
      }
    }
    return best;
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
  function filledAt(page, sums, x, y, s, staff) {
    if (!ink(page, x, y)) return 0;
    const core = fill(page, sums, x - s * 0.22, y - s * 0.13, x + s * 0.22, y + s * 0.13);
    if (core < 0.9) return 0;
    const h1 = run(page, x, y - s * 0.12, 1, 0, s * 2);
    const h2 = run(page, x, y + s * 0.12, 1, 0, s * 2);
    const h = Math.min(h1, h2);
    if (h < s * 0.45 || h > s * 1.75) return 0;
    const v = run(page, x, y, 0, 1, s * 2);
    if (v < s * 0.4 || v > s * 1.4) return 0;
    if (!stemmed(page, x, y, s, staff)) return 0; // a filled head always has a stem
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
    // Its top and bottom edges are a head's, not long beams with a gap between them.
    if (run(page, x, y - u, 1, 0, s * 2) > s * 1.6 || run(page, x, y + d, 1, 0, s * 2) > s * 1.6) return 0;
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
        let score = filledAt(page, sums, x, y, s, staff);
        let filled = true;
        if (!score) {
          // (A hollow ring loses to a filled head at the same place: gaps between beams can look like one.)
          score = hollowAt(page, x, y, s) * 0.9;
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
      head.stem = stemmed(page, head.x, posY(staff, head.pos, head.x), s, staff);
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

  // Pieces of ink (8-connected) on the page without staff lines: [{ x0, y0, x1, y1, count }]. bridge: a gap of up
  // to this many rows in a column that was a staff line taken out (page.removed) still joins the inks on either side,
  // so a stroke cut by a line stays whole.
  function components(page, bridge = 0) {
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
        if (bridge && page.removed) {
          for (const dir of [-1, 1]) {
            let yy = y + dir;
            let gap = 0;
            while (yy >= 0 && yy < height && !bits[yy * width + x] && page.removed[yy * width + x] && gap < bridge) {
              yy += dir;
              gap++;
            }
            if (!gap || yy < 0 || yy >= height) continue;
            const q = yy * width + x;
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
  function unreadIn(pieces, staff, x0, x1, heads, clean) {
    const s = staff.space;
    return pieces.some((p) => {
      const cx = (p.x0 + p.x1) / 2;
      const cy = (p.y0 + p.y1) / 2;
      if (cx < x0 || cx > x1 || cy < staff.top - s * 3 || cy > staff.bottom + s * 3) return false;
      const w = p.x1 - p.x0 + 1;
      const h = p.y1 - p.y0 + 1;
      if (w < s * 0.8 || h < s * 0.8 || p.count / (w * h) < 0.6) return false;
      if (clean && stacked(clean, staff, cx)) return false; // a time signature's number
      return !heads.some((head) => head.x >= p.x0 && head.x <= p.x1 && head.y >= p.y0 && head.y <= p.y1);
    });
  }

  // ---- lengths (PRD #4-L-3, 68단계) ----
  const TYPES_BY_LEVEL = ['quarter', 'eighth', '16th', '32nd'];

  // The ink runs down a column from a stem's far end toward its head: [length, ...] (each a beam or a flag, or a
  // few of them run together where a staff line filled the gap between them).
  function tipRuns(page, head, stem, s, dx) {
    const up = stem.top < head.y - s;
    const tip = up ? stem.top : stem.bottom;
    const toward = up ? 1 : -1;
    // Beams and flags sit near the stem's end: look there only, well clear of the head.
    const span = Math.max(0, Math.min(Math.abs(head.y - tip) - s * 1.0, s * 2.0));
    const out = Math.sign(dx);
    // From the stem's outer edge (a thick stem on a photo): its width at its middle.
    const midY = Math.round((stem.top + stem.bottom) / 2);
    let edge = stem.x;
    while (Math.abs(edge - stem.x) < s * 0.3 && ink(page, edge + out, midY)) edge += out;
    const x = Math.round(edge + out * (Math.abs(dx) - 0.15) * s) + out;
    const runs = [];
    const side = Math.max(2, Math.round(s * 0.15));
    let length = 0;
    // A beam or flag goes on outwards from the stem; a thin upright line going by (a barline, another stem) doesn't.
    const close = (d) => {
      let spread = false;
      for (let k = 0; k < length && !spread; k++) spread = ink(page, x + out * side, tip + toward * (d - 1 - k));
      if (spread) runs.push(length);
      length = 0;
    };
    for (let d = -Math.round(s * 0.15); d <= span; d++) {
      if (ink(page, x, tip + toward * d)) length++;
      else if (length) close(d);
    }
    if (length) close(span + 1);
    return runs;
  }

  // Just outside the stem on either side: only beams and flags that join this stem are there (a neighbour's partial
  // beam stops short of it).
  const SIDES = [-0.3, -0.2, 0.2, 0.3];

  // How many beams or flags join a stem (0: none). unit: one beam's thickness on this page.
  function levelsOf(page, head, stem, s, unit) {
    const gap = unit * 0.55;
    let best = 0;
    for (const dx of SIDES) {
      const count = tipRuns(page, head, stem, s, dx).filter((l) => l >= Math.max(2, unit * 0.5))
        .reduce((sum, l) => sum + Math.max(1, Math.round((l + gap) / (unit + gap))), 0);
      best = Math.max(best, count);
    }
    return Math.min(best, 3);
  }

  // One beam's thickness on the page: the thinner runs found at stem ends (a beam or a flag), or half a space.
  function beamUnit(page, heads, s) {
    const runs = [];
    for (const head of heads) {
      if (!head.stem) continue;
      for (const dx of SIDES) for (const l of tipRuns(page, head, head.stem, s, dx)) if (l >= 2 && l <= s * 0.8) runs.push(l);
    }
    if (runs.length < 3) return s * 0.45;
    runs.sort((a, b) => a - b);
    return Math.max(s * 0.2, runs[Math.floor(runs.length * 0.1)]);
  }

  // Dots after a head: small round pieces just to its right, in its space (a head on a line: the space above), with
  // no other head between.
  function dotsOf(pieces, head, s, heads) {
    const y = head.y - (head.pos % 2 === 0 ? s * 0.5 : 0);
    const next = Math.min(...heads.filter((h) => h.x > head.x + s * 0.3).map((h) => h.x));
    return pieces.filter((p) => {
      const w = p.x1 - p.x0 + 1;
      const h = p.y1 - p.y0 + 1;
      if (w < s * 0.12 || h < s * 0.12 || w > s * 0.6 || h > s * 0.6) return false;
      const cx = (p.x0 + p.x1) / 2;
      const cy = (p.y0 + p.y1) / 2;
      return cx > head.x + s * 0.55 && cx < Math.min(head.x + s * 1.9, next - s * 0.3) && Math.abs(cy - y) <= s * 0.35;
    }).length;
  }

  // A rest from its piece's shape, or null. (Whole and half rests: a block below the fourth line / on the middle
  // line; a quarter rest: tall and thin; eighth to 32nd: a slanted stem with one to three hooks.)
  function restOf(clean, p, staff) {
    const s = staff.space;
    const w = (p.x1 - p.x0 + 1) / s;
    const h = (p.y1 - p.y0 + 1) / s;
    const fillShare = p.count / ((p.x1 - p.x0 + 1) * (p.y1 - p.y0 + 1));
    const cx = (p.x0 + p.x1) / 2;
    const cy = (p.y0 + p.y1) / 2;
    const bottom = OmrStaff.lineY(staff, 4, cx);
    const pos = (bottom - cy) / (s / 2);
    if (pos < -1 || pos > 9) return null;
    if (h >= 0.2 && h <= 0.7 && w >= 0.5 && w <= 1.6 && fillShare >= 0.7) {
      // A whole rest hangs from the fourth line, a half rest sits on the middle line.
      if (Math.abs(p.y0 - posY(staff, 6, cx)) <= s * 0.3) return { type: 'whole' };
      if (Math.abs(p.y1 - posY(staff, 4, cx)) <= s * 0.3) return { type: 'half' };
      return null;
    }
    if (h < 0.8 || h > 3.5 || w < 0.3 || w > 1.3 || pos < 1 || pos > 7) return null;
    if (h / w >= 2.45) return { type: 'quarter' }; // tall and thin (hook rests are wider for their height)
    // A hook rest has round blobs on the left (a quarter rest is all thin strokes): rows of ink wider than a stroke,
    // a few of them in a row.
    let disc = 0;
    let wideRows = 0;
    for (let y = p.y0; y <= p.y1; y++) {
      let widest = 0;
      let width = 0;
      for (let x = p.x0; x <= p.x0 + (p.x1 - p.x0) * 0.5; x++) {
        width = ink(clean, x, y) ? width + 1 : 0;
        widest = Math.max(widest, width);
      }
      wideRows = widest >= s * 0.25 ? wideRows + 1 : 0;
      disc = Math.max(disc, wideRows);
    }
    if (disc < Math.max(3, s * 0.15)) return h / w >= 2.0 ? { type: 'quarter' } : null;
    // Wide all the way down (a blurred quarter rest's thick strokes) rather than a round blob, and tall: a quarter rest.
    if (disc >= s * 0.45 && h / w >= 2.0) return { type: 'quarter' };
    // Hooks: separate bits of ink down the left part of its upper two thirds.
    let hooks = 0;
    let inside = 0;
    const until = p.y0 + (p.y1 - p.y0) * 0.72;
    for (let y = p.y0; y <= until; y++) {
      let found = false;
      for (let x = p.x0; x <= p.x0 + (p.x1 - p.x0) * 0.45 && !found; x++) found = ink(clean, x, y);
      if (found) inside++;
      else {
        if (inside >= s * 0.12) hooks++;
        inside = 0;
      }
    }
    if (inside >= s * 0.12) hooks++;
    return hooks >= 1 && hooks <= 3 ? { type: TYPES_BY_LEVEL[hooks] } : null;
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
    const pieces = components(clean, Math.max(2, (analysis.size?.thick ?? 1) + 2));
    analysis.clefs = analysis.staves.map((staff) => findClef(page, clean, staff));
    analysis.staves.forEach((staff, i) => {
      const { sure } = analysis.clefs[i];
      const s = staff.space;
      const start = staff.left + s * CLEF_SPACES;
      // Heads on the whole staff first: a "barline" that is really the stem of one of them goes, and the measures
      // are split again without it.
      let all = findHeads(clean, sums, staff, start, staff.right);
      for (const head of all) head.y = posY(staff, head.pos, head.x);
      // A time signature (at a staff's start or where the time changes): stacked numbers aren't heads.
      all = all.filter((head) => !stacked(clean, staff, head.x));
      for (const head of all) if (!head.stem) head.stem = stemmed(clean, head.x, head.y, s, staff);
      const bars = analysis.barlines[i].filter((bar) => !all.some((head) => head.stem
        && head.stem.x >= bar.x0 - 2 && head.stem.x <= bar.x1 + 2));
      if (bars.length !== analysis.barlines[i].length) {
        analysis.barlines[i] = bars;
        analysis.measures[i] = OmrStaff.measuresOf(staff, bars);
      }
      analysis.measures[i].forEach((m, k) => {
        const from = k === 0 ? Math.max(m.x0, start) : m.x0 + s * 0.3;
        const heads = all.filter((head) => head.x >= from && head.x <= m.x1 - s * 0.3);
        let doubtful = (!sure && k === 0) || unreadIn(pieces, staff, from, m.x1, heads, clean);
        // Heads one above another (within a head's width) share a stem: a chord. The top one is kept.
        const singles = [];
        for (const head of heads) {
          const last = singles[singles.length - 1];
          if (last && Math.abs(head.x - last.x) < s * 0.7) {
            doubtful = true;
            if (head.pos > last.pos) singles[singles.length - 1] = head;
            continue;
          }
          singles.push(head);
        }
        m.heads = singles;
        m.doubtful = doubtful;
        m.unsupported = chordSeen(heads, singles);
        m.from = from;
      });
    });
    readLengths(clean, pieces, analysis);
    return analysis;
  }

  const chordSeen = (heads, singles) => heads.length !== singles.length;

  // One of a time signature's two numbers: a piece in one half of the staff with another like it right above or
  // below it in the other half.
  function digitPair(p, pieces, staff) {
    const s = staff.space;
    const size = (q) => q.y1 - q.y0 >= s * 0.9 && q.x1 - q.x0 >= s * 0.5;
    if (!size(p)) return false;
    const mid = (staff.top + staff.bottom) / 2;
    const upper = (q) => (q.y0 + q.y1) / 2 < mid;
    const cx = (q) => (q.x0 + q.x1) / 2;
    return pieces.some((q) => q !== p && size(q) && upper(q) !== upper(p) && Math.abs(cx(q) - cx(p)) < s * 0.5
      && q.y0 < staff.bottom + s && q.y1 > staff.top - s);
  }

  // Thin strokes running sideways (a tie, a slur, a bracket): ink no thicker than a fifth of a space, in pieces at
  // least a space wide and less than one tall. They are found apart from what they touch (a tie may touch a head).
  // → [{ x0, y0, x1, y1 }]
  function thinCurves(clean, s) {
    const { width, height, bits } = clean;
    const thin = new Uint8Array(bits.length);
    const limit = Math.max(3, Math.round(s * 0.2));
    for (let x = 0; x < width; x++) {
      let start = -1;
      for (let y = 0; y <= height; y++) {
        const on = y < height && bits[y * width + x];
        if (on && start < 0) start = y;
        if (!on && start >= 0) {
          if (y - start <= limit) for (let yy = start; yy < y; yy++) thin[yy * width + x] = 1;
          start = -1;
        }
      }
    }
    return components({ width, height, bits: thin })
      .filter((p) => {
        const w = p.x1 - p.x0 + 1;
        const h = p.y1 - p.y0 + 1;
        return w >= s * 0.35 && h >= 2 && h < s && h <= w * 0.45; // long and flat
      });
  }

  // ---- key signature, accidentals, time signature (PRD #4-L-3, 69단계) ----
  const ALTERS = { sharp: 1, flat: -1, natural: 0 };

  // An accidental's kind from its piece, by its upright strokes: a flat has one (on its left, with a bowl), a sharp
  // and a natural two — the natural's left one higher, the sharp's right one. → 'sharp' | 'flat' | 'natural' | null
  function accidentalOf(clean, p) {
    const w = p.x1 - p.x0 + 1;
    const h = p.y1 - p.y0 + 1;
    const groups = [];
    for (let x = p.x0; x <= p.x1; x++) {
      let best = null;
      let start = -1;
      for (let y = p.y0; y <= p.y1 + 1; y++) {
        const on = y <= p.y1 && ink(clean, x, y);
        if (on && start < 0) start = y;
        if (!on && start >= 0) {
          if (!best || y - start > best.bottom - best.top + 1) best = { top: start, bottom: y - 1 };
          start = -1;
        }
      }
      if (!best || best.bottom - best.top + 1 < h * 0.6) continue;
      const last = groups[groups.length - 1];
      if (last && x - last.x1 <= 1) {
        last.x1 = x;
        last.top = Math.min(last.top, best.top);
        last.bottom = Math.max(last.bottom, best.bottom);
      } else {
        groups.push({ x0: x, x1: x, top: best.top, bottom: best.bottom });
      }
    }
    if (groups.length === 1) return groups[0].x0 - p.x0 <= w * 0.4 ? 'flat' : null;
    if (groups.length >= 2) {
      const a = groups[0];
      const b = groups[groups.length - 1];
      // A natural's left stroke sits higher than its right one; a sharp's right stroke is the higher (or level).
      return (a.top + a.bottom) / 2 < (b.top + b.bottom) / 2 - h * 0.05 ? 'natural' : 'sharp';
    }
    return null;
  }

  // The key signature from its pieces (sharps or flats, one after another). → { fifths, sure }
  function keyOf(clean, header) {
    const kinds = [...header].map((p) => accidentalOf(clean, p));
    if (!kinds.length) return { fifths: 0, sure: true };
    const sharps = kinds.filter((k) => k === 'sharp').length;
    const flats = kinds.filter((k) => k === 'flat').length;
    const n = Math.min(7, kinds.length);
    if (sharps === kinds.length) return { fifths: n, sure: true };
    if (flats === kinds.length) return { fifths: -n, sure: true };
    return { fifths: sharps >= flats ? n : -n, sure: false };
  }

  // Shapes of the numbers 0–9 and C, drawn once in the browser (a bold serif, like printed time signatures), each
  // as a GRID_W × GRID_H grid of ink shares.
  const GRID_W = 10;
  const GRID_H = 14;
  let templates = null;
  function gridOf(bits, width, x0, y0, x1, y1) {
    const out = new Float32Array(GRID_W * GRID_H);
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        const ax = x0 + Math.floor((gx * w) / GRID_W);
        const bx = x0 + Math.max(Math.floor(((gx + 1) * w) / GRID_W), Math.floor((gx * w) / GRID_W) + 1) - 1;
        const ay = y0 + Math.floor((gy * h) / GRID_H);
        const by = y0 + Math.max(Math.floor(((gy + 1) * h) / GRID_H), Math.floor((gy * h) / GRID_H) + 1) - 1;
        let sum = 0;
        let n = 0;
        for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++, n++) sum += bits[y * width + x];
        out[gy * GRID_W + gx] = n ? sum / n : 0;
      }
    }
    return out;
  }
  function templateSet() {
    if (templates) return templates;
    templates = [];
    for (const char of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'C']) {
      const canvas = OmrImage.canvasOf(64, 80);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 64, 80);
      ctx.fillStyle = '#000';
      ctx.font = 'bold 56px Georgia, "Times New Roman", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(char, 32, 42);
      const g = OmrImage.gray(canvas);
      const bits = new Uint8Array(g.data.length);
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -1;
      let y1 = -1;
      for (let i = 0; i < bits.length; i++) {
        if (g.data[i] < 128) {
          bits[i] = 1;
          const x = i % g.width;
          const y = (i - x) / g.width;
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
      }
      if (x1 >= 0) templates.push({ char, grid: gridOf(bits, g.width, x0, y0, x1, y1), aspect: (x1 - x0 + 1) / (y1 - y0 + 1) });
    }
    return templates;
  }

  // The character a piece looks most like (of 0–9 and C, or of `allowed`), comparing ink grids and shape.
  function charOf(clean, p, allowed = null) {
    const grid = gridOf(clean.bits, clean.width, p.x0, p.y0, p.x1, p.y1);
    const aspect = (p.x1 - p.x0 + 1) / (p.y1 - p.y0 + 1);
    let best = null;
    for (const t of templateSet()) {
      if (allowed && !allowed.includes(t.char)) continue;
      let diff = 0;
      for (let i = 0; i < grid.length; i++) diff += Math.abs(grid[i] - t.grid[i]);
      diff = diff / grid.length + Math.abs(Math.log(aspect / t.aspect)) * 0.6;
      if (!best || diff < best.diff) best = { char: t.char, diff };
    }
    return best;
  }

  const TIMES = ['2/4', '3/4', '4/4', '6/8', '9/8', '12/8', '2/2', '3/8', '5/4', '6/4', '3/2', '2/8'];

  // The ink between x0 and x1, y0 and y1 cut at blank columns into characters: [{ x0, y0, x1, y1 }] (each with its
  // own top and bottom). Taking staff lines out may break a number into bits; this puts them back together.
  function charsIn(clean, x0, y0, x1, y1, s) {
    x0 = Math.max(0, Math.round(x0));
    x1 = Math.min(clean.width - 1, Math.round(x1));
    y0 = Math.max(0, Math.round(y0));
    y1 = Math.min(clean.height - 1, Math.round(y1));
    const used = [];
    for (let x = x0; x <= x1; x++) {
      let any = false;
      for (let y = y0; y <= y1 && !any; y++) any = ink(clean, x, y);
      used.push(any);
    }
    const out = [];
    let start = -1;
    let blank = 0;
    const gap = Math.max(2, Math.round(s * 0.1));
    const close = (end) => {
      if (end - start + 1 >= s * 0.3) {
        // Its top and bottom: rows with more than a stray pixel or two (a bit left of a staff line).
        let top = Infinity;
        let bottom = -1;
        const least = Math.max(2, (end - start + 1) * 0.15);
        for (let y = y0; y <= y1; y++) {
          let n = 0;
          for (let x = x0 + start; x <= x0 + end; x++) if (ink(clean, x, y)) n++;
          if (n >= least) {
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
        }
        if (bottom - top + 1 >= s * 0.6) out.push({ x0: x0 + start, x1: x0 + end, y0: top, y1: bottom });
      }
      start = -1;
    };
    used.forEach((on, i) => {
      if (on) {
        if (start < 0) start = i;
        blank = 0;
      } else if (start >= 0 && ++blank >= gap) close(i - blank);
    });
    if (start >= 0) close(used.length - 1 - blank);
    return out;
  }

  // A time signature whose numbers sit between x0 and x1 on the staff. → { time, symbol } or null
  function timeAt(clean, pieces, staff, x0, x1) {
    const s = staff.space;
    const cx = (x0 + x1) / 2;
    const top = OmrStaff.lineY(staff, 0, cx);
    const mid = OmrStaff.lineY(staff, 2, cx);
    const bottom = OmrStaff.lineY(staff, 4, cx);
    const number = (from, to, a = x0, b = x1) => {
      const chars = charsIn(clean, a, from, b, to, s);
      if (!chars.length) return null;
      const text = chars.map((c) => charOf(clean, c, '0123456789')?.char ?? '').join('');
      return /^\d+$/.test(text) ? Number(text) : null;
    };
    // The two numbers meet near the middle line: split them at the blank row nearest it.
    let split = mid;
    let parted = false;
    for (let d = 0; d <= s * 0.6; d++) {
      const rows = [mid - d, mid + d].map(Math.round);
      const blank = rows.find((y) => {
        for (let x = Math.round(x0); x <= Math.round(x1); x++) if (ink(clean, x, y)) return false;
        return true;
      });
      if (blank !== undefined) {
        split = blank;
        parted = true;
        break;
      }
    }
    // The two numbers stand one over the other: each is read only under (or over) the other's columns (a beam or note
    // close after them stays out).
    const upChars = charsIn(clean, x0, top - s * 0.4, x1, split, s);
    const loChars = charsIn(clean, x0, split, x1, bottom + s * 0.4, s);
    const span = (chars) => chars.length ? [chars[0].x0 - s * 0.3, chars[chars.length - 1].x1 + s * 0.3] : [x0, x1];
    const [ua, ub] = span(loChars);
    const [la, lb] = span(upChars);
    const upper = number(top - s * 0.4, split, Math.max(x0, ua), Math.min(x1, ub));
    const lower = number(split, bottom + s * 0.4, Math.max(x0, la), Math.min(x1, lb));
    if (upper && lower && TIMES.includes(`${upper}/${lower}`)) return { time: [upper, lower] };
    if (parted) return null; // two numbers, not read
    // C or ¢: one sign across the middle line (¢ with a line through it reaching past the staff).
    // (¢'s line through it runs on past the staff: those columns are left out before comparing with C.)
    const ax = Math.max(0, Math.round(x0));
    const bx = Math.min(clean.width - 1, Math.round(x1));
    const past = (x) => [top - s * 0.4, bottom + s * 0.4].some((y) => ink(clean, x, y) || ink(clean, x, y - 1) || ink(clean, x, y + 1));
    const lineCols = [];
    for (let x = ax; x <= bx; x++) if (past(x)) lineCols.push(x);
    const width = bx - ax + 1;
    const y0 = Math.max(0, Math.round(top - s * 0.4));
    const y1 = Math.min(clean.height - 1, Math.round(bottom + s * 0.4));
    const part = { width, height: y1 - y0 + 1, bits: new Uint8Array(width * (y1 - y0 + 1)) };
    for (let y = y0; y <= y1; y++) {
      for (let x = ax; x <= bx; x++) {
        if (!lineCols.includes(x) && ink(clean, x, y)) part.bits[(y - y0) * width + (x - ax)] = 1;
      }
    }
    let whole = charsIn(part, 0, 0, width - 1, part.height - 1, s);
    // (Taking ¢'s line out leaves its C in two: put them back as one sign.)
    if (lineCols.length && whole.length > 1) {
      whole = [whole.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1) }))];
    }
    const midY = mid - y0;
    if (whole.length === 1 && whole[0].y0 < midY - s * 0.5 && whole[0].y1 > midY + s * 0.5) {
      const read = charOf(part, whole[0], 'C0');
      if (read && read.char === 'C') return lineCols.length ? { time: [2, 2], symbol: 'cut' } : { time: [4, 4], symbol: 'common' };
    }
    return null;
  }

  // The staff whose middle is nearest a height.
  const nearestStaff = (staves, y) => staves.reduce((best, st) => (Math.abs((st.top + st.bottom) / 2 - y)
    < Math.abs((best.top + best.bottom) / 2 - y) ? st : best));

  // Lengths for every measure read above: notes from their heads, stems, beams, flags and dots; rests from the pieces
  // left over; ties and tuplet numbers marked as not read (PRD #4-L-4).
  function readLengths(clean, pieces, analysis) {
    analysis.keys = analysis.staves.map(() => ({ fifths: 0, sure: true }));
    const curves = analysis.staves.length ? thinCurves(clean, analysis.staves[0].space) : [];
    analysis.staves.forEach((staff, i) => {
      const s = staff.space;
      const { clef } = analysis.clefs[i];
      const heads = analysis.measures[i].flatMap((m) => m.heads);
      for (const head of heads) if (!head.stem) head.stem = stemmed(clean, head.x, head.y, s, staff);
      const unit = beamUnit(clean, heads.filter((h) => h.filled), s);
      analysis.measures[i].forEach((m, k) => {
        // A stemless hollow "head" with a narrow hole is no whole note (the gap between a rest's hooks, say).
        m.heads = m.heads.filter((head) => head.filled || head.stem
          || reach(clean, head.x, head.y, -1, 0, s) + reach(clean, head.x, head.y, 1, 0, s) >= s * 0.4);
        const items = m.heads.map((head) => {
          let type;
          if (!head.filled) type = head.stem ? 'half' : 'whole';
          else type = TYPES_BY_LEVEL[head.stem ? levelsOf(clean, head, head.stem, s, unit) : 0];
          const dots = dotsOf(pieces, head, s, m.heads);
          if (dots > 1) m.doubtful = true; // double dots aren't read (PRD #4-L, 5번)
          return { x: head.x, note: { type, dots: Math.min(dots, 1), pitch: pitchOf(head.pos, clef) } };
        });
        const firstHead = m.heads.length ? m.heads[0].x : m.x1;
        const accidentals = new Map(); // head → 'sharp' | 'flat' | 'natural'
        // The key signature: accidental-shaped pieces one after another right after the clef.
        const header = new Set();
        if (k === 0) {
          let edge = staff.left + s * (CLEF_SPACES + 2.0);
          // A sharp blurred into the clef on a photo: the part past the clef's end is looked at on its own.
          const clefEnd = staff.left + s * 2.95;
          // (It may have run into the time signature too: the part is cut into characters at blank columns.)
          const cut = (p) => {
            if (!(p.x0 < clefEnd && p.x1 > clefEnd + s * 0.3)) return [p];
            return charsIn(clean, Math.ceil(clefEnd), p.y0, p.x1, p.y1, s).map((c) => ({ ...c, count: 1, fromClef: true }));
          };
          const candidates = pieces.flatMap(cut)
            .filter((p) => p.x0 >= staff.left + s * 2.4 && (p.x0 + p.x1) / 2 < firstHead - s * 0.8
              && p.y1 > staff.top - s * 1.5 && p.y0 < staff.bottom + s * 1.5)
            .sort((a, b) => a.x0 - b.x0);
          for (const p of candidates) {
            const w = (p.x1 - p.x0 + 1) / s;
            const h = (p.y1 - p.y0 + 1) / s;
            if (stacked(clean, staff, (p.x0 + p.x1) / 2)) continue;
            const shaped = h >= 0.8 && h <= 3.2 && w >= 0.3 && w <= 1.1;
            if (p.fromClef && !shaped) continue; // what is left of the clef
            if (p.x0 > edge || !shaped) break;
            header.add(p);
            edge = p.x1 + s * 0.9;
          }
          analysis.keys[i] = keyOf(clean, header);
          if (!analysis.keys[i].sure) m.doubtful = true;
        }
        const key = analysis.keys[i];
        // A time signature at the start (after the key) or where the time changes (just after the barline).
        {
          // (The clef itself is about 2.9 spaces wide: a wide time signature may start inside CLEF_SPACES.)
          const from = k === 0 ? (header.size ? Math.max(...[...header].map((p) => p.x1)) : staff.left + s * 2.95) : m.x0 + Math.max(2, s * 0.1);
          const until = Math.min(m.x1, from + s * 2.4, firstHead - s * 0.3);
          let x0 = null;
          for (let x = Math.round(from); x <= until; x++) {
            if (stacked(clean, staff, x)) {
              x0 = x;
              break;
            }
          }
          if (x0 !== null) {
            const zone = [Math.max(from, x0 - s * 1.2), Math.min(firstHead - s * 0.6, x0 + s * 1.8)];
            const found = timeAt(clean, pieces, staff, zone[0], zone[1]);
            if (found) m.time = found;
            else m.timeUnread = true;
            m.timeZone = zone;
          }
        }
        // No heads inside the key signature.
        if (header.size) {
          m.heads = m.heads.filter((head) => ![...header].some((p) => head.x >= p.x0 && head.x <= p.x1 && head.y >= p.y0 && head.y <= p.y1));
          items.splice(0, items.length, ...items.filter((item) => m.heads.some((head) => head.x === item.x)));
        }
        // A time signature after the clef and key: nothing there is a rest.
        let headerEnd = header.size ? Math.max(...[...header].map((p) => p.x1)) : staff.left + s * CLEF_SPACES;
        if (k === 0) {
          for (let x = Math.round(headerEnd); x <= headerEnd + s * 1.8; x++) {
            if (stacked(clean, staff, x)) {
              headerEnd = Math.max(headerEnd, x + s * 0.7);
            }
          }
        }
        for (const p of pieces) {
          if (header.has(p)) continue;
          if (k === 0 && (p.x0 + p.x1) / 2 < Math.min(headerEnd, firstHead - s * 0.5)) continue;
          const cx = (p.x0 + p.x1) / 2;
          const cy = (p.y0 + p.y1) / 2;
          if (cx < m.from || cx > m.x1) continue;
          if (cy < staff.top - s * 3 || cy > staff.bottom + s * 3) continue; // another staff's
          if (m.heads.some((head) => head.x >= p.x0 - 1 && head.x <= p.x1 + 1 && head.y >= p.y0 - 1 && head.y <= p.y1 + 1)) continue;
          const w = p.x1 - p.x0 + 1;
          const h = p.y1 - p.y0 + 1;
          if (w <= s * 0.25) continue; // a barline or a stem on its own
          // A time signature's number: one of a pair, or a wide piece in one half with ink stacked on the other.
          const mid = (staff.top + staff.bottom) / 2;
          const oneHalf = p.y1 <= mid + s * 0.3 || p.y0 >= mid - s * 0.3;
          if (digitPair(p, pieces, staff) || (oneHalf && w >= s * 0.9 && stacked(clean, staff, cx))) continue;
          if (k === 0 && cx < firstHead && stacked(clean, staff, cx)) continue; // part of the time signature
          // An accidental: right up against a head's left side, at its height.
          const owner = m.heads.find((head) => {
            const left = head.x - run(clean, head.x, head.y, -1, 0, s) + 1;
            return p.x1 < head.x && p.x1 >= left - s * 0.15 && p.y0 < head.y && p.y1 > head.y;
          });
          if (owner) {
            const sign = accidentalOf(clean, p);
            if (sign) accidentals.set(owner, sign);
            else m.doubtful = true;
            continue;
          }
          const rest = restOf(clean, p, staff);
          if (rest) {
            items.push({ x: cx, note: { type: rest.type, dots: 0, rest: true } });
            continue;
          }
          // A little number above or below the staff (a tuplet): not read yet.
          const outside = p.y1 < staff.top - s * 0.2 || p.y0 > staff.bottom + s * 0.2;
          const inTime = m.timeZone && p.x1 >= m.timeZone[0] && p.x0 <= m.timeZone[1];
          if (outside && h >= s * 0.4 && h <= s * 1.1 && w <= s * 0.9 && !inTime && !(k === 0 && cx < m.from + s * 1.5)) m.unsupported = true;
        }
        // A thin curve (a tie or a slur, or a tuplet's bracket) over the measure — one going over a barline counts for
        // both sides.
        for (const c of curves) {
          // (A barline cuts a tie in two: one ending at this measure's start counts too.)
          if (c.x1 < m.x0 - s * 1.5 || c.x0 > m.x1) continue;
          if (nearestStaff(analysis.staves, (c.y0 + c.y1) / 2) !== staff) continue;
          if (c.y1 < staff.top - s * 4 || c.y0 > staff.bottom + s * 4) continue;
          if (m.timeZone && c.x1 >= m.timeZone[0] && c.x0 <= m.timeZone[1]) continue; // a stroke of the time signature
          // The thin top or bottom of a hollow head's ring is no tie.
          const cy = (c.y0 + c.y1) / 2;
          // (A tie touching a whole note's ring makes one wider piece with it: that stays a tie.)
          if (c.x1 - c.x0 + 1 <= s * 1.3 && heads.some((head) => head.x >= c.x0 && head.x <= c.x1 && Math.abs(head.y - cy) < s * 0.6)) continue;
          m.unsupported = true;
        }
        items.sort((a, b) => a.x - b.x);
        // Accidentals: the one just left of a head, carried to the end of the measure for that line or space; else
        // the key signature.
        const carried = new Map();
        const keyAlters = Sheet.keyAlters({ fifths: key.fifths, mode: 'major' });
        for (const item of items) {
          if (item.note.rest) continue;
          const head = m.heads.find((h) => h.x === item.x);
          const pitch = item.note.pitch;
          const place = `${pitch.step}${pitch.octave}`;
          const sign = head && accidentals.get(head);
          if (sign) carried.set(place, ALTERS[sign]);
          pitch.alter = carried.has(place) ? carried.get(place) : keyAlters[pitch.step] ?? 0;
        }
        m.notes = items.map((item) => item.note);
        if (m.unsupported) m.doubtful = true;
      });
    });
  }

  window.OmrSymbols = { accidentalOf, keyOf, charOf, timeAt, charsIn, stacked, POS_MIN, POS_MAX, CLEF_SPACES, removeLines, findHeads, findClef, pitchOf, posY, read, integral, components, restOf, digitPair, thinCurves };
})();
