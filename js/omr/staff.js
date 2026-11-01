(function () {
  // Staves and barlines on a flat black-and-white page (PRD #4-L-3). The page is OmrImage's { width, height, bits }
  // (1 = ink). A staff is five lines followed across the page in strips, so a slightly bent page still reads; its
  // lines' heights at any x come from lineY(). Systems are staves joined by a line at their left; barlines are thin
  // vertical lines from the top line to the bottom line with no note head on them.

  const STRIPS = 12;

  function mode(hist) {
    let best = 0;
    for (let i = 1; i < hist.length; i++) if (hist[i] > hist[best]) best = i;
    return best;
  }

  // Line thickness and the gap between lines, from the most common black and white runs down sample columns.
  // → { thick, gap, space (= gap + thick, one staff space) }, or null when the page has no lines to speak of.
  function measure(page) {
    const { width, height, bits } = page;
    const black = new Float64Array(64);
    const white = new Float64Array(Math.max(64, Math.ceil(height / 8)));
    const columns = 60;
    for (let c = 0; c < columns; c++) {
      const x = Math.round(width * (0.1 + (0.8 * c) / (columns - 1)));
      let run = 0;
      let ink = bits[x];
      let started = false; // the white run before the first ink doesn't count
      for (let y = 0; y <= height; y++) {
        const v = y < height ? bits[y * width + x] : -1;
        if (v === ink) {
          run++;
          continue;
        }
        if (ink === 1 && run < black.length) black[run]++;
        if (ink === 0 && started && v !== -1 && run < white.length) white[run]++;
        if (ink === 1) started = true;
        ink = v;
        run = 1;
      }
    }
    black[0] = 0;
    white[0] = 0;
    const thick = mode(black);
    const gap = mode(white);
    if (!thick || gap < 3) return null;
    return { thick, gap, space: gap + thick };
  }

  // Line centres in each strip: rows mostly ink across the strip, in runs no thicker than a staff line can be.
  function stripLines(page, size) {
    const { width, height, bits } = page;
    const stripWidth = width / STRIPS;
    const counts = Array.from({ length: STRIPS }, () => new Uint32Array(height));
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        if (bits[row + x]) counts[Math.min(STRIPS - 1, Math.floor(x / stripWidth))][y]++;
      }
    }
    const maxRun = size.thick * 2 + 3;
    return counts.map((count) => {
      const lines = [];
      let start = -1;
      for (let y = 0; y <= height; y++) {
        const on = y < height && count[y] > stripWidth * 0.5;
        if (on && start < 0) start = y;
        if (!on && start >= 0) {
          if (y - start <= maxRun) lines.push((start + y - 1) / 2);
          start = -1;
        }
      }
      return lines;
    });
  }

  // Five lines in a row, evenly spaced about one staff space apart.
  function fives(lines, space) {
    const out = [];
    for (let i = 0; i + 4 < lines.length; i++) {
      const group = [lines[i]];
      let j = i + 1;
      while (group.length < 5 && j < lines.length) {
        const d = lines[j] - group[group.length - 1];
        if (d >= space * 0.7 && d <= space * 1.3) group.push(lines[j]);
        else if (d > space * 1.3) break;
        j++;
      }
      if (group.length === 5) {
        out.push(group);
        i = lines.indexOf(group[4]);
      }
    }
    return out;
  }

  // The staves of a page: [{ lines: [[y0..y4] for each strip], top, bottom, left, right }], top to bottom.
  function findStaves(page, size = measure(page)) {
    if (!size) return [];
    const stripWidth = page.width / STRIPS;
    const perStrip = stripLines(page, size).map((lines) => fives(lines, size.space));
    // Join the strips' staves by their middle line's height.
    const clusters = [];
    perStrip.forEach((staves, k) => {
      for (const ys of staves) {
        const mid = ys[2];
        let near = null;
        for (const c of clusters) {
          const last = c.found[c.found.length - 1];
          if (Math.abs(last.ys[2] - mid) < size.space * 2 && last.k !== k) near = near ?? c;
        }
        if (near) near.found.push({ k, ys });
        else clusters.push({ found: [{ k, ys }] });
      }
    });
    const staves = clusters
      .filter((c) => c.found.length >= Math.max(3, Math.floor(STRIPS / 4)))
      .map((c) => {
        const lines = new Array(STRIPS).fill(null);
        for (const { k, ys } of c.found) if (!lines[k]) lines[k] = ys;
        // Strips without the staff (off its ends, or too full of notes): from the nearest strips that have it.
        for (let k = 0; k < STRIPS; k++) {
          if (lines[k]) continue;
          let a = k - 1;
          while (a >= 0 && !c.found.some((f) => f.k === a)) a--;
          let b = k + 1;
          while (b < STRIPS && !c.found.some((f) => f.k === b)) b++;
          const A = a >= 0 ? lines[a] ?? c.found.find((f) => f.k === a).ys : null;
          const B = b < STRIPS ? c.found.find((f) => f.k === b).ys : null;
          if (A && B) lines[k] = A.map((y, i) => y + ((B[i] - y) * (k - a)) / (b - a));
          else lines[k] = (A ?? B).slice();
        }
        return { lines, stripWidth, space: size.space, thick: size.thick };
      })
      .sort((p, q) => p.lines[STRIPS >> 1][2] - q.lines[STRIPS >> 1][2]);
    for (const staff of staves) extent(page, staff);
    return staves.filter((s) => s.right - s.left > size.space * 8);
  }

  // A staff line's height at x (line 0 = top … 4 = bottom), between the strips' centres.
  function lineY(staff, line, x) {
    const f = x / staff.stripWidth - 0.5;
    const k = Math.max(0, Math.min(STRIPS - 1, Math.floor(f)));
    const k2 = Math.min(STRIPS - 1, k + 1);
    const t = Math.max(0, Math.min(1, f - k));
    return staff.lines[k][line] + (staff.lines[k2][line] - staff.lines[k][line]) * (k2 === k ? 0 : t);
  }

  const inkAt = (page, x, y) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    return xi >= 0 && yi >= 0 && xi < page.width && yi < page.height && page.bits[yi * page.width + xi] === 1;
  };

  // Ink within ±r rows of y at column x.
  function inkNear(page, x, y, r) {
    for (let d = -r; d <= r; d++) if (inkAt(page, x, y + d)) return true;
    return false;
  }

  // Where the staff's lines run: the longest stretch of columns with ink on at least four of the five lines.
  function extent(page, staff) {
    const r = Math.max(1, staff.thick);
    let best = { left: 0, right: 0 };
    let start = -1;
    let lastOn = -1;
    const gapAllowed = staff.space * 1.5;
    for (let x = 0; x <= page.width; x++) {
      let on = false;
      if (x < page.width) {
        let n = 0;
        for (let line = 0; line < 5; line++) if (inkNear(page, x, lineY(staff, line, x), r)) n++;
        on = n >= 4;
      }
      if (on) {
        if (start < 0 || x - lastOn > gapAllowed) start = x;
        lastOn = x;
        if (lastOn - start > best.right - best.left) best = { left: start, right: lastOn };
      }
    }
    staff.left = best.left;
    staff.right = best.right;
    staff.top = lineY(staff, 0, (best.left + best.right) / 2);
    staff.bottom = lineY(staff, 4, (best.left + best.right) / 2);
  }

  // Systems: neighbouring staves joined by an unbroken vertical line near their left ends. → [[staff, ...], ...]
  function findSystems(page, staves) {
    const systems = [];
    let current = staves.length ? [staves[0]] : [];
    for (let i = 1; i < staves.length; i++) {
      const a = staves[i - 1];
      const b = staves[i];
      if (joined(page, a, b)) current.push(b);
      else {
        systems.push(current);
        current = [b];
      }
    }
    if (current.length) systems.push(current);
    return systems;
  }

  function joined(page, a, b) {
    const from = Math.round(Math.min(a.left, b.left) - a.space * 1.5);
    const to = Math.round(Math.max(a.left, b.left) + a.space * 1.5);
    for (let x = Math.max(0, from); x <= Math.min(page.width - 1, to); x++) {
      const y0 = lineY(a, 4, x);
      const y1 = lineY(b, 0, x);
      if (y1 - y0 < a.space) continue;
      let ink = 0;
      let rows = 0;
      for (let y = Math.round(y0); y <= Math.round(y1); y++) {
        rows++;
        if (inkAt(page, x, y) || inkAt(page, x - 1, y) || inkAt(page, x + 1, y)) ink++;
      }
      if (ink / rows > 0.95) return true;
    }
    return false;
  }

  // Barlines of one staff: [{ x0, x1, x, kind: 'single'|'double'|'final' }], left to right. joinedAbove / joinedBelow:
  // the staff shares its system with a staff there (a barline may run on through the space between them).
  function findBarlines(page, staff, { joinedAbove = false, joinedBelow = false } = {}) {
    const { space, thick } = staff;
    const columns = [];
    for (let x = Math.round(staff.left); x <= Math.round(staff.right); x++) {
      const y0 = lineY(staff, 0, x) - thick / 2;
      const y1 = lineY(staff, 4, x) + thick / 2;
      let ink = 0;
      let rows = 0;
      for (let y = Math.round(y0); y <= Math.round(y1); y++) {
        rows++;
        if (inkAt(page, x, y)) ink++;
      }
      columns.push(ink / rows >= 0.94);
    }
    // Runs of such columns.
    const runs = [];
    let start = -1;
    columns.forEach((on, i) => {
      if (on && start < 0) start = i;
      if ((!on || i === columns.length - 1) && start >= 0) {
        const end = on ? i : i - 1;
        runs.push({ x0: Math.round(staff.left) + start, x1: Math.round(staff.left) + end });
        start = -1;
      }
    });
    const lines = runs.filter((run) => {
      const w = run.x1 - run.x0 + 1;
      if (w > space * 0.8) return false;
      const x = (run.x0 + run.x1) / 2;
      if (x - staff.left < space * 0.6) return false; // a line at the very start is the system's, not a measure's
      // Nothing just above or below it (a stem goes on to its head or beam; a clef sticks out).
      const clear = (from, to) => {
        let ink = 0;
        let n = 0;
        for (let y = Math.round(from); y <= Math.round(to); y++) {
          for (let xx = run.x0; xx <= run.x1; xx++) {
            n++;
            if (inkAt(page, xx, y)) ink++;
          }
        }
        return !n || ink / n < 0.25;
      };
      const top = lineY(staff, 0, x);
      const bottom = lineY(staff, 4, x);
      const reach = Math.max(2, space * 0.6);
      if (!joinedAbove && !clear(top - thick - reach, top - thick - 1)) return false;
      if (!joinedBelow && !clear(bottom + thick + 1, bottom + thick + reach)) return false;
      // No note head on it: across each space the ink is no wider than the line.
      for (let s = 0; s < 4; s++) {
        const y = (lineY(staff, s, x) + lineY(staff, s + 1, x)) / 2;
        let left = run.x0;
        while (left > run.x0 - space && inkAt(page, left - 1, y)) left--;
        let right = run.x1;
        while (right < run.x1 + space && inkAt(page, right + 1, y)) right++;
        if (right - left + 1 > w + space * 0.45) return false;
      }
      return true;
    });
    // Two lines close together: a double barline, or thin + thick: the final barline. On a photo the two of a final
    // barline can blur into one: a single line much thicker than the usual one is taken as final too.
    const widths = lines.map((run) => run.x1 - run.x0 + 1).sort((a, b) => a - b);
    const usual = widths.length ? widths[Math.floor((widths.length - 1) / 2)] : 1;
    const out = [];
    for (const run of lines) {
      const last = out[out.length - 1];
      const w = run.x1 - run.x0 + 1;
      if (!(last && run.x0 - last.x1 < space * 0.9) && w >= Math.max(usual * 2.5, space * 0.25)) {
        out.push({ x0: run.x0, x1: run.x1, kind: 'final', widths: [w] });
        continue;
      }
      if (last && run.x0 - last.x1 < space * 0.9) {
        const lw = last.widths[0];
        last.kind = w >= lw * 1.8 ? 'final' : 'double';
        last.x1 = run.x1;
        last.widths.push(w);
      } else {
        out.push({ x0: run.x0, x1: run.x1, kind: 'single', widths: [w] });
      }
    }
    return out.map(({ x0, x1, kind }) => ({ x0, x1, x: (x0 + x1) / 2, kind }));
  }

  // The measures of one staff: the stretches between its barlines (the first from the staff's start, with its clef;
  // a stretch after the last barline only when there is room for music in it). → [{ x0, x1, end: barline kind|null }]
  function measuresOf(staff, barlines) {
    const out = [];
    let from = staff.left;
    for (const bar of barlines) {
      if (bar.x0 - from > staff.space) out.push({ x0: from, x1: bar.x0, end: bar.kind });
      from = bar.x1;
    }
    if (staff.right - from > staff.space * 3) out.push({ x0: from, x1: staff.right, end: null });
    return out;
  }

  // Everything above for one page. → { size, staves, systems: [[staffIndex, ...]], barlines: [[...] per staff] }
  function analyse(page) {
    const size = measure(page);
    const staves = size ? findStaves(page, size) : [];
    const systems = findSystems(page, staves);
    const barlines = staves.map((staff) => {
      const system = systems.find((s) => s.includes(staff));
      const at = system.indexOf(staff);
      return findBarlines(page, staff, { joinedAbove: at > 0, joinedBelow: at < system.length - 1 });
    });
    return {
      size, staves, barlines,
      systems: systems.map((s) => s.map((staff) => staves.indexOf(staff))),
      measures: staves.map((staff, i) => measuresOf(staff, barlines[i])),
    };
  }

  window.OmrStaff = { STRIPS, measure, findStaves, lineY, findSystems, findBarlines, measuresOf, analyse };
})();
