// 악보 인식(확장 11) 테스트 도우미: 시험 이미지를 만든다. 단계 테스트 앞에 함께 넘긴다
// (run.py tests/omr-lib.js tests/t65.js smoke.js).
// (가) 앱이 그린 악보: Sheet.draw로 그린 SVG를 canvas에 옮긴 것(정답을 정확히 앎)
// (나) 사진 흉내: (가)를 배경 위에 원근으로 놓고 그림자·잡음을 더한 것
window.OmrTest = (() => {
  const STYLE_PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'opacity', 'fill-opacity', 'stroke-opacity',
    'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'visibility'];

  // An SVG in the page → a standalone SVG string with the page's CSS written into each element.
  function standalone(svg) {
    const clone = svg.cloneNode(true);
    const from = [svg, ...svg.querySelectorAll('*')];
    const to = [clone, ...clone.querySelectorAll('*')];
    from.forEach((el, i) => {
      const style = getComputedStyle(el);
      const target = to[i];
      for (const prop of STYLE_PROPS) target.style.setProperty(prop, style.getPropertyValue(prop));
      // Printed music is black: the screen's grey staff lines and coloured marks are drawn black here.
      for (const prop of ['fill', 'stroke']) {
        const value = style.getPropertyValue(prop);
        if (value && value !== 'none' && !/rgba\([^)]*,\s*0\)/.test(value) && value !== 'transparent') target.style.setProperty(prop, '#000');
      }
      // Printed staff lines, barlines and ledger lines are a little heavier than the screen's hairlines.
      if (el.classList?.contains('sv-line') || el.classList?.contains('sv-bar') || el.classList?.contains('sv-ledger')) {
        target.style.setProperty('stroke-width', String(Math.max(1.4, parseFloat(style.getPropertyValue('stroke-width')) || 0)));
      }
      // Press areas and highlights are see-through on screen; leave them out of the picture.
      if (el.classList?.contains('sv-hit') || el.classList?.contains('sv-pick')) target.style.setProperty('visibility', 'hidden');
    });
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const box = svg.viewBox.baseVal;
    clone.setAttribute('width', box.width);
    clone.setAttribute('height', box.height);
    clone.removeAttribute('style');
    return new XMLSerializer().serializeToString(clone);
  }

  async function imageOf(svgText) {
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
    await img.decode();
    return img;
  }

  // (가): the score drawn by Sheet.draw (four measures to a row) on a white page.
  // → { canvas, scale, margin, rows: [{ top, height, width }] } (rows in canvas pixels)
  async function sheetCanvas(score, { scale = 1.25, margin = 0.07, gap = 18 } = {}) {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:-20000px;top:0;width:900px;';
    document.body.append(box);
    Sheet.draw(box, score, { numberFirst: true });
    const svgs = [...box.querySelectorAll('svg')];
    const images = [];
    for (const svg of svgs) {
      // The answer, in the drawing's units: the staff lines' heights and every barline's place and kind.
      const ys = [...svg.querySelectorAll('.sv-line')].map((l) => Number(l.getAttribute('y1')));
      const bars = [...svg.querySelectorAll('.sv-barline')].filter((g) => g.children.length).map((g) => {
        const xs = [...g.querySelectorAll('line, rect')].flatMap((el) => (el.tagName === 'line'
          ? [Number(el.getAttribute('x1'))]
          : [Number(el.getAttribute('x')), Number(el.getAttribute('x')) + Number(el.getAttribute('width'))]));
        return { x: (Math.min(...xs) + Math.max(...xs)) / 2, kind: g.dataset.kind, measure: Number(g.dataset.measure) };
      });
      images.push({ img: await imageOf(standalone(svg)), box: svg.viewBox.baseVal, staffTop: Math.min(...ys), staffBottom: Math.max(...ys), bars });
    }
    box.remove();
    const contentWidth = Math.max(...images.map((i) => i.box.width)) * scale;
    const contentHeight = images.reduce((sum, i) => sum + i.box.height * scale + gap, 0);
    const pad = Math.round(contentWidth * margin);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(contentWidth + pad * 2);
    canvas.height = Math.round(Math.max(contentHeight + pad * 2, canvas.width * 1.3));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let y = pad;
    const rows = [];
    for (const { img, box: b, staffTop, staffBottom, bars } of images) {
      const width = b.width * scale;
      const height = b.height * scale;
      ctx.drawImage(img, pad, y, width, height);
      rows.push({
        top: y, height, width, left: pad,
        staffTop: y + staffTop * scale, staffBottom: y + staffBottom * scale,
        bars: bars.map((bar) => ({ ...bar, x: pad + bar.x * scale })),
      });
      y += height + gap;
    }
    return { canvas, scale, margin: pad, rows };
  }

  // Seeded random numbers, so the same picture comes out every time.
  function random(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // (나): the page placed with perspective at the corners on a darker, noisy background, with an optional shadow
  // (shadow: how dark the darkest side gets, 0–1) and noise (± brightness). → canvas
  // bend: the paper's middle sags by this many page pixels (a curled page; 0 = flat).
  // fit: make the photo as big as the app reads one (long side OmrImage.MAX_SIDE), corners scaled with it.
  function paperPhoto(page, { width = 1600, height = 1200, corners, background = 92, shadow = 0, noise = 6, seed = 1, bend = 0, fit = false } = {}) {
    const k = fit ? OmrImage.MAX_SIDE / Math.max(width, height) : 1;
    const quad = (corners ?? [
      { x: 330, y: 130 }, { x: 1280, y: 170 }, { x: 1330, y: 1110 }, { x: 260, y: 1080 },
    ]).map((c) => ({ x: c.x * k, y: c.y * k }));
    width = Math.round(width * k);
    height = Math.round(height * k);
    const pw = page.width;
    const ph = page.height;
    const src = page.getContext('2d').getImageData(0, 0, pw, ph).data;
    const h = OmrImage.homography(quad, [{ x: 0, y: 0 }, { x: pw, y: 0 }, { x: pw, y: ph }, { x: 0, y: ph }]);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const out = ctx.createImageData(width, height);
    const rnd = random(seed);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = OmrImage.apply(h, x + 0.5, y + 0.5);
        if (bend) p.y -= bend * Math.sin((Math.PI * p.x) / pw);
        let v;
        if (p.x >= 0 && p.y >= 0 && p.x < pw - 1 && p.y < ph - 1) {
          const x0 = Math.floor(p.x);
          const y0 = Math.floor(p.y);
          const ax = p.x - x0;
          const ay = p.y - y0;
          const at = (xx, yy) => src[(yy * pw + xx) * 4];
          const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * ax;
          const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * ax;
          v = top + (bottom - top) * ay;
          v *= 0.93; // paper is a little grey in a photo
          if (shadow) v *= 1 - shadow * Math.max(0, Math.min(1, (x / width) * 0.7 + (y / height) * 0.6 - 0.1));
        } else {
          v = background + 20 * Math.sin(x / 90) * Math.cos(y / 70);
        }
        v += (rnd() * 2 - 1) * noise;
        const i = (y * width + x) * 4;
        out.data[i] = out.data[i + 1] = out.data[i + 2] = Math.max(0, Math.min(255, v));
        out.data[i + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
    canvas.corners = quad;
    return canvas;
  }

  function fileOf(canvas, name, type = 'image/png') {
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(new File([blob], name, { type })), type, 0.92));
  }

  // The y of the first long dark row in a band of columns of a black-and-white page (the top staff line there).
  function firstLine(page, x0, x1, from = 0) {
    const { width, bits } = page;
    for (let y = from; y < page.height; y++) {
      let ink = 0;
      for (let x = x0; x < x1; x++) ink += bits[y * width + x];
      if (ink > (x1 - x0) * 0.6) {
        // the middle of the line's thickness
        let end = y;
        while (end + 1 < page.height) {
          let next = 0;
          for (let x = x0; x < x1; x++) next += bits[(end + 1) * width + x];
          if (next <= (x1 - x0) * 0.6) break;
          end++;
        }
        return (y + end) / 2;
      }
    }
    return null;
  }

  // The top staff line's tilt in degrees, measured between a band on the left and one on the right.
  function staffTilt(page) {
    const w = page.width;
    const left = [Math.round(w * 0.14), Math.round(w * 0.24)];
    const right = [Math.round(w * 0.76), Math.round(w * 0.86)];
    const from = Math.round(page.height * 0.03); // past a sliver of background the corners may leave
    const yl = firstLine(page, ...left, from);
    const yr = firstLine(page, ...right, from);
    if (yl === null || yr === null) return { angle: Infinity, yl, yr };
    const dx = (right[0] + right[1]) / 2 - (left[0] + left[1]) / 2;
    return { angle: (Math.atan2(yr - yl, dx) * 180) / Math.PI, yl, yr, xl: (left[0] + left[1]) / 2, xr: (right[0] + right[1]) / 2 };
  }

  // Share of columns between x0 and x1 that have ink within ±tol rows of the line from (xl, yl) to (xr, yr).
  function lineCoverage(page, { xl, yl, xr, yr }, x0, x1, tol = 3) {
    let hit = 0;
    for (let x = x0; x < x1; x++) {
      const y = Math.round(yl + ((yr - yl) * (x - xl)) / (xr - xl));
      let found = false;
      for (let d = -tol; d <= tol && !found; d++) {
        const yy = y + d;
        if (yy >= 0 && yy < page.height && page.bits[yy * page.width + x]) found = true;
      }
      if (found) hit++;
    }
    return hit / (x1 - x0);
  }

  function inkShare(page, x0, y0, x1, y1) {
    let ink = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) ink += page.bits[y * page.width + x];
    return ink / ((x1 - x0) * (y1 - y0));
  }

  // Two staves joined into systems (a piano score): a line joins each system at its left and every barline runs through
  // both staves. A few filled heads with stems in each measure. → { canvas, systems, measuresPerSystem, staffTops }
  function grandStaff({ systems = 2, measures = 3, space = 18, width = 1100 } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.round(width * 1.3);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#000';
    const left = 90;
    const right = width - 80;
    const staffTops = [];
    for (let s = 0; s < systems; s++) {
      const top = 120 + s * space * 20;
      const tops = [top, top + space * 9];
      staffTops.push(tops);
      for (const t of tops) for (let l = 0; l < 5; l++) ctx.fillRect(left, Math.round(t + l * space), right - left, 2);
      const bottom = tops[1] + space * 4 + 2;
      ctx.fillRect(left, top, 3, bottom - top); // the system's line at its left
      for (let m = 1; m <= measures; m++) {
        const x = Math.round(left + ((right - left) * m) / measures);
        ctx.fillRect(x - 2, top, 2, bottom - top);
        // heads: two in each staff of the measure
        for (const [k, t] of tops.entries()) {
          for (let n = 0; n < 2; n++) {
            const hx = left + ((right - left) * (m - 1 + 0.35 + n * 0.3)) / measures;
            const hy = t + space * (1.5 + ((m + n + k) % 3));
            ctx.beginPath();
            ctx.ellipse(hx, hy, space * 0.62, space * 0.45, -0.35, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(hx + space * 0.5, hy - space * 3.3, 2, space * 3.3);
          }
        }
      }
    }
    return { canvas, systems, measuresPerSystem: measures, staffTops };
  }

  return { sheetCanvas, paperPhoto, grandStaff, fileOf, staffTilt, firstLine, lineCoverage, inkShare, random, standalone };
})();
