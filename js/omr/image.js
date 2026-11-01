(function () {
  // Photos of printed music, read in the browser (PRD #4-L-1, #4-L-2): the file → a canvas no bigger than MAX_SIDE
  // → the paper's four corners → the paper made flat (a perspective warp) → even brightness → black and white.
  // Nothing here leaves the page; only <canvas> pixels and plain arrays.

  class ImageError extends Error {}

  const MAX_SIDE = 2000; // a photo is shrunk so its long side is about this (enough for staff lines a few px thick)
  const FIND_SIDE = 640; // the paper's edge is looked for on a copy this small

  function canvasOf(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    return canvas;
  }

  async function decode(file) {
    if (typeof createImageBitmap === 'function') {
      try {
        return await createImageBitmap(file);
      } catch {
        // fall through to <img>, which some formats need
      }
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // A photo file → { canvas, name }, its long side at most MAX_SIDE. Throws ImageError when the browser can't open it.
  async function load(file) {
    let picture;
    try {
      picture = await decode(file);
    } catch {
      throw new ImageError(`열 수 없는 사진이에요: ${file.name}`);
    }
    const width = picture.width || picture.naturalWidth;
    const height = picture.height || picture.naturalHeight;
    if (!width || !height) throw new ImageError(`열 수 없는 사진이에요: ${file.name}`);
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    const canvas = canvasOf(width * scale, height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(picture, 0, 0, canvas.width, canvas.height);
    picture.close?.();
    return { canvas, name: file.name };
  }

  // { width, height, data: Uint8Array of brightness 0–255 } from a canvas (or a part of it scaled to width × height).
  function gray(canvas, width = canvas.width, height = canvas.height) {
    let source = canvas;
    if (width !== canvas.width || height !== canvas.height) {
      source = canvasOf(width, height);
      source.getContext('2d').drawImage(canvas, 0, 0, source.width, source.height);
    }
    const { data } = source.getContext('2d').getImageData(0, 0, source.width, source.height);
    const out = new Uint8Array(source.width * source.height);
    for (let i = 0, j = 0; i < out.length; i++, j += 4) {
      out[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
    }
    return { width: source.width, height: source.height, data: out };
  }

  // Otsu's threshold: the brightness that best splits the pixels into a dark and a bright group.
  function otsu(data) {
    const hist = new Float64Array(256);
    for (const v of data) hist[v]++;
    const total = data.length;
    let sum = 0;
    for (let v = 0; v < 256; v++) sum += v * hist[v];
    let below = 0;
    let belowSum = 0;
    let best = 0;
    let threshold = 128;
    for (let v = 0; v < 256; v++) {
      below += hist[v];
      if (!below) continue;
      const above = total - below;
      if (!above) break;
      belowSum += v * hist[v];
      const m0 = belowSum / below;
      const m1 = (sum - belowSum) / above;
      const between = below * above * (m0 - m1) ** 2;
      if (between > best) {
        best = between;
        threshold = v;
      }
    }
    return threshold;
  }

  // The paper's corners in the canvas's pixels, [top-left, top-right, bottom-right, bottom-left], or null when no
  // paper stands out from its background (the caller then starts from the photo's own corners).
  function findCorners(canvas) {
    const scale = Math.min(1, FIND_SIDE / Math.max(canvas.width, canvas.height));
    const g = gray(canvas, Math.round(canvas.width * scale), Math.round(canvas.height * scale));
    const { width, height, data } = g;
    // A little blur so the printed music doesn't cut the paper into pieces.
    const soft = boxBlur(g, 1);
    const threshold = otsu(soft);
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of soft) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (hi - lo < 40) return null; // one flat colour: nothing to find
    const bright = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) bright[i] = soft[i] > threshold ? 1 : 0;
    // The biggest bright patch (4-connected) is the paper.
    const label = new Int32Array(data.length);
    let best = { size: 0, id: 0 };
    let id = 0;
    const stack = [];
    for (let start = 0; start < data.length; start++) {
      if (!bright[start] || label[start]) continue;
      id++;
      let size = 0;
      label[start] = id;
      stack.push(start);
      while (stack.length) {
        const p = stack.pop();
        size++;
        const x = p % width;
        const y = (p - x) / width;
        if (x > 0 && bright[p - 1] && !label[p - 1]) { label[p - 1] = id; stack.push(p - 1); }
        if (x < width - 1 && bright[p + 1] && !label[p + 1]) { label[p + 1] = id; stack.push(p + 1); }
        if (y > 0 && bright[p - width] && !label[p - width]) { label[p - width] = id; stack.push(p - width); }
        if (y < height - 1 && bright[p + width] && !label[p + width]) { label[p + width] = id; stack.push(p + width); }
      }
      if (size > best.size) best = { size, id };
    }
    if (best.size < data.length * 0.15) return null;
    // Its corners: the points farthest along the four diagonals.
    let tl = null, tr = null, br = null, bl = null;
    let tlv = Infinity, trv = -Infinity, brv = -Infinity, blv = Infinity;
    for (let p = 0; p < data.length; p++) {
      if (label[p] !== best.id) continue;
      const x = p % width;
      const y = (p - x) / width;
      if (x + y < tlv) { tlv = x + y; tl = [x, y]; }
      if (x + y > brv) { brv = x + y; br = [x + 1, y + 1]; }
      if (x - y > trv) { trv = x - y; tr = [x + 1, y]; }
      if (x - y < blv) { blv = x - y; bl = [x, y + 1]; }
    }
    const corners = [tl, tr, br, bl].map(([x, y]) => ({
      x: Math.min(canvas.width, Math.max(0, x / scale)),
      y: Math.min(canvas.height, Math.max(0, y / scale)),
    }));
    if (area(corners) < canvas.width * canvas.height * 0.1) return null;
    return corners;
  }

  // The photo's own corners (where moving the handles starts when no paper was found).
  function frameCorners(canvas) {
    return [{ x: 0, y: 0 }, { x: canvas.width, y: 0 }, { x: canvas.width, y: canvas.height }, { x: 0, y: canvas.height }];
  }

  function area(points) {
    let sum = 0;
    points.forEach((p, i) => {
      const q = points[(i + 1) % points.length];
      sum += p.x * q.y - q.x * p.y;
    });
    return Math.abs(sum) / 2;
  }

  // A box blur of radius r (brightness array, same size), with an integral image.
  function boxBlur({ width, height, data }, r) {
    const sums = integral({ width, height, data });
    const out = new Uint8Array(data.length);
    for (let y = 0; y < height; y++) {
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(height, y + r + 1);
      for (let x = 0; x < width; x++) {
        const x0 = Math.max(0, x - r);
        const x1 = Math.min(width, x + r + 1);
        out[y * width + x] = rectSum(sums, width, x0, y0, x1, y1) / ((x1 - x0) * (y1 - y0));
      }
    }
    return out;
  }

  // Integral image: (width + 1) × (height + 1) running sums, so any rectangle's sum takes four reads.
  function integral({ width, height, data }) {
    const stride = width + 1;
    const sums = new Float64Array(stride * (height + 1));
    for (let y = 0; y < height; y++) {
      let row = 0;
      for (let x = 0; x < width; x++) {
        row += data[y * width + x];
        sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + row;
      }
    }
    return sums;
  }

  function rectSum(sums, width, x0, y0, x1, y1) {
    const stride = width + 1;
    return sums[y1 * stride + x1] - sums[y0 * stride + x1] - sums[y1 * stride + x0] + sums[y0 * stride + x0];
  }

  // The 3 × 3 perspective map (as 8 numbers, the last one 1) taking from[i] to to[i] for four points.
  function homography(from, to) {
    const a = [];
    const b = [];
    for (let i = 0; i < 4; i++) {
      const { x, y } = from[i];
      const { x: u, y: v } = to[i];
      a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
      b.push(u);
      a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
      b.push(v);
    }
    return solve(a, b);
  }

  function solve(a, b) {
    const n = b.length;
    const m = a.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < n; col++) {
      let pivot = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
      [m[col], m[pivot]] = [m[pivot], m[col]];
      const p = m[col][col];
      if (Math.abs(p) < 1e-12) throw new ImageError('모서리 네 점으로 사각형을 만들 수 없어요.');
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = m[r][col] / p;
        if (!f) continue;
        for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
      }
    }
    return m.map((row, i) => row[n] / row[i]);
  }

  function apply(h, x, y) {
    const w = h[6] * x + h[7] * y + 1;
    return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w };
  }

  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

  // The size of the flat page for these corners: the longer of each pair of opposite sides, at most MAX_SIDE.
  function flatSize(corners) {
    const [tl, tr, br, bl] = corners;
    let width = Math.max(dist(tl, tr), dist(bl, br));
    let height = Math.max(dist(tl, bl), dist(tr, br));
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
    return { width, height };
  }

  // The paper inside the corners made into an upright rectangle: brightness { width, height, data }, sampled
  // bilinearly from the photo's brightness. Points outside the photo count as white.
  function warp(source, corners) {
    const { width, height } = flatSize(corners);
    const h = homography(
      [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }],
      corners,
    );
    const { width: sw, height: sh, data: sd } = source;
    const out = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = apply(h, x + 0.5, y + 0.5);
        const fx = p.x - 0.5;
        const fy = p.y - 0.5;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        if (x0 < 0 || y0 < 0 || x0 >= sw - 1 || y0 >= sh - 1) {
          out[y * width + x] = 255;
          continue;
        }
        const ax = fx - x0;
        const ay = fy - y0;
        const i = y0 * sw + x0;
        const top = sd[i] + (sd[i + 1] - sd[i]) * ax;
        const bottom = sd[i + sw] + (sd[i + sw + 1] - sd[i + sw]) * ax;
        out[y * width + x] = top + (bottom - top) * ay;
      }
    }
    return { width, height, data: out };
  }

  // Black and white with an adaptive threshold (Bradley): a pixel is ink when it is clearly darker than the average
  // around it, so a shadow or a dim corner of the page doesn't turn black. → { width, height, bits } (1 = ink).
  function binarize({ width, height, data }) {
    const sums = integral({ width, height, data });
    const r = Math.max(8, Math.round(Math.max(width, height) / 32));
    const bits = new Uint8Array(width * height);
    const T = 0.15;
    for (let y = 0; y < height; y++) {
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(height, y + r + 1);
      for (let x = 0; x < width; x++) {
        const x0 = Math.max(0, x - r);
        const x1 = Math.min(width, x + r + 1);
        const count = (x1 - x0) * (y1 - y0);
        const i = y * width + x;
        if (data[i] * count < rectSum(sums, width, x0, y0, x1, y1) * (1 - T)) bits[i] = 1;
      }
    }
    return { width, height, bits };
  }

  // A photo with its corners → the flat black-and-white page.
  function flatten(canvas, corners) {
    return binarize(warp(gray(canvas), corners));
  }

  // The black-and-white page drawn on a canvas (for the preview and the original view).
  function draw(page, canvas = canvasOf(page.width, page.height)) {
    canvas.width = page.width;
    canvas.height = page.height;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(page.width, page.height);
    const { data } = image;
    for (let i = 0, j = 0; i < page.bits.length; i++, j += 4) {
      const v = page.bits[i] ? 0 : 255;
      data[j] = data[j + 1] = data[j + 2] = v;
      data[j + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  window.OmrImage = {
    ImageError, MAX_SIDE, load, gray, otsu, findCorners, frameCorners, homography, apply, warp, binarize, flatten, draw,
    canvasOf, flatSize,
  };
})();
