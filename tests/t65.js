// 65단계 — 사진 넣기와 펴기. Run with omr-lib.js (first) and smoke.js.
{
  const ticker = setInterval(() => {}, 1); // image decoding runs off the page's thread (pitfalls.md)
  const writeTop = () => Math.round(T.$('staff-title').getBoundingClientRect().top);
  const photosShown = () => !T.$('photos').hidden && T.$('app').dataset.photos !== undefined;
  const practiceShown = () => [...document.querySelectorAll('.practice')].every((p) => getComputedStyle(p).display !== 'none');
  const names = () => photoImport.photos.map((p) => p.name).join(',');
  let twinkle = null; // (가) page, made once per width
  const page = async () => {
    if (!twinkle) twinkle = await OmrTest.sheetCanvas(scores.get('example-twinkle'));
    return twinkle;
  };
  const plain = (shade, w = 400, h = 300) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(0, 0, w, h);
    return c;
  };

  T.test('65-2 작은 창에 버튼 세 개, 받아 적기 위치 그대로', async (T) => {
    T.setMode('score');
    const top = writeTop();
    const level = Math.round(document.querySelector('.level-area').getBoundingClientRect().height);
    T.$('btn-new-score').click();
    const box = T.$('new-score').getBoundingClientRect();
    const buttons = ['btn-make-score', 'btn-import-file', 'btn-import-photo'].map((id) => T.$(id).getBoundingClientRect());
    T.check(buttons.every((b) => b.width > 0 && b.left >= box.left - 0.5 && b.right <= box.right + 0.5), '버튼 세 개가 창 안에');
    T.check(T.$('btn-import-photo').textContent === '사진 불러오기', '[사진 불러오기]');
    T.check(T.noHorizontalOverflow(), '가로로 넘치지 않음');
    T.check(Math.round(document.querySelector('.level-area').getBoundingClientRect().height) === level && writeTop() === top,
      '패널 높이·받아 적기 위치 그대로');
    T.check(T.$('photo-file').accept === 'image/*' && T.$('photo-file').multiple, '사진 여러 장 고르기(image/*)');
    T.$('btn-new-score').click();
  });

  T.test('65-2 여러 장: 고른 순서, ◀ ▶·빼기·더 넣기', async (T) => {
    T.setMode('score');
    const top = writeTop();
    const files = await Promise.all(['a.png', 'b.png', 'c.png'].map((n, i) => OmrTest.fileOf(plain(80 + i * 60), n)));
    const added = await importPhotos(files);
    T.check(added === 3 && photosShown() && !practiceShown(), `사진 화면이 연습 자리를 대신함 (${added}장)`);
    T.check(names() === 'a.png,b.png,c.png' && T.$('photos-thumbs').children.length === 3, `고른 순서 (${names()})`);
    T.check(photoImport.selected === 0 && T.$('photos-left').disabled && !T.$('photos-right').disabled, '첫 사진 선택, ◀ 꺼짐');
    T.$('photos-right').click();
    T.check(names() === 'b.png,a.png,c.png' && photoImport.selected === 1, `▶ (${names()})`);
    T.$('photos-thumbs').children[2].click();
    T.$('photos-left').click();
    T.check(names() === 'b.png,c.png,a.png' && photoImport.selected === 1, `◀ (${names()})`);
    T.$('photos-remove').click();
    T.check(names() === 'b.png,a.png' && T.$('photos-thumbs').children.length === 2, `빼기 (${names()})`);
    await importPhotos([await OmrTest.fileOf(plain(200), 'd.png')]);
    T.check(names() === 'b.png,a.png,d.png' && photoImport.selected === 2, `더 넣기는 끝에 (${names()})`);
    const thumbs = T.$('photos-thumbs');
    T.check(thumbs.scrollWidth <= thumbs.clientWidth + 1 || getComputedStyle(thumbs).overflowX === 'auto', '썸네일 줄은 좌우로 밀림');
    T.check(T.noHorizontalOverflow(), '가로로 넘치지 않음');
    T.$('photos-cancel').click();
    T.check(!photosShown() && practiceShown() && writeTop() === top && photoImport.photos.length === 0, '[취소]: 사진을 버리고 연습 화면');
  });

  T.test('65-2 자동 모서리: 원근 사진은 2% 안, 못 찾으면 귀퉁이', async (T) => {
    const { canvas } = await page();
    const cases = [
      { corners: [{ x: 330, y: 130 }, { x: 1280, y: 170 }, { x: 1330, y: 1110 }, { x: 260, y: 1080 }] },
      { corners: [{ x: 420, y: 90 }, { x: 1190, y: 60 }, { x: 1260, y: 1150 }, { x: 380, y: 1120 }], seed: 7 },
      { corners: [{ x: 200, y: 200 }, { x: 1400, y: 120 }, { x: 1450, y: 1000 }, { x: 160, y: 1100 }], seed: 3, width: 1600, height: 1200 },
    ];
    for (const [k, c] of cases.entries()) {
      const photo = OmrTest.paperPhoto(canvas, c);
      const found = OmrImage.findCorners(photo);
      const q = c.corners;
      const short = Math.min(Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y), Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y));
      const err = found ? Math.max(...found.map((p, i) => Math.hypot(p.x - q[i].x, p.y - q[i].y))) / short : Infinity;
      T.check(err <= 0.02, `시험 ${k + 1}: 모서리 오차 ${(err * 100).toFixed(2)}% (≤ 2%)`);
    }
    // 종이가 따로 보이지 않는 사진(한 가지 색)은 못 찾음 → 화면에서는 귀퉁이에서 시작.
    T.check(OmrImage.findCorners(plain(128)) === null, '한 가지 색: 못 찾음');
    T.setMode('score');
    await importPhotos([await OmrTest.fileOf(plain(128, 500, 400), 'flat.png')]);
    const p = photoImport.photos[0];
    const frame = p.corners.map((c) => `${Math.round(c.x)},${Math.round(c.y)}`).join(' ');
    T.check(!p.found && frame === '0,0 500,0 500,400 0,400', `귀퉁이에서 시작 (${frame})`);
    T.check(T.$('photos-corner-note').textContent.includes('찾지 못해'), '못 찾았다는 안내');
    T.$('photos-cancel').click();
  });

  T.test('65-2 손잡이 끌기(마우스·터치) → 모서리와 미리 보기', async (T) => {
    T.setMode('score');
    const { canvas } = await page();
    const photo = OmrTest.paperPhoto(canvas, { width: 1200, height: 900, corners: [{ x: 250, y: 100 }, { x: 960, y: 130 }, { x: 990, y: 830 }, { x: 200, y: 810 }] });
    await importPhotos([await OmrTest.fileOf(photo, 'drag.png')]);
    const stage = T.$('photos-stage');
    T.check(!stage.hidden && stage.querySelectorAll('.photos-handle').length === 4, '손잡이 네 개');
    const drag = (corner, toX, toY, pointerType, id) => {
      const handle = stage.querySelectorAll('.photos-handle')[corner];
      const h = handle.getBoundingClientRect();
      const box = stage.getBoundingClientRect();
      const base = { bubbles: true, pointerId: id, pointerType, isPrimary: true };
      handle.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientX: h.left + h.width / 2, clientY: h.top + h.height / 2 }));
      const at = { clientX: box.left + box.width * toX, clientY: box.top + box.height * toY };
      stage.dispatchEvent(new PointerEvent('pointermove', { ...base, ...at }));
      stage.dispatchEvent(new PointerEvent('pointerup', { ...base, ...at }));
    };
    const before = Number(T.$('photos-preview').dataset.version);
    drag(0, 0.1, 0.05, 'mouse', 11);
    let c = photoImport.photos[0].corners[0];
    T.check(Math.abs(c.x - 120) < 6 && Math.abs(c.y - 45) < 6, `마우스로 옮김 (${Math.round(c.x)}, ${Math.round(c.y)})`);
    const afterMouse = Number(T.$('photos-preview').dataset.version);
    T.check(afterMouse > before, '놓으면 미리 보기를 다시 그림');
    drag(2, 0.9, 0.95, 'touch', 12);
    c = photoImport.photos[0].corners[2];
    T.check(Math.abs(c.x - 1080) < 6 && Math.abs(c.y - 855) < 6, `손가락으로 옮김 (${Math.round(c.x)}, ${Math.round(c.y)})`);
    T.check(Number(T.$('photos-preview').dataset.version) > afterMouse, '터치 뒤에도 다시 그림');
    // 화살표 키로도.
    const handle = stage.querySelectorAll('.photos-handle')[1];
    const x0 = photoImport.photos[0].corners[1].x;
    handle.focus();
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    T.check(photoImport.photos[0].corners[1].x > x0, '화살표 키로 옮김');
    // 손잡이 자리가 모서리와 맞는가.
    const p1 = photoImport.photos[0].corners[1];
    const h1 = handle.getBoundingClientRect();
    const box = stage.getBoundingClientRect();
    T.check(Math.abs(h1.left + h1.width / 2 - (box.left + (p1.x / 1200) * box.width)) < 1.5, '손잡이가 모서리 자리에');
    T.check(T.noHorizontalOverflow(), '가로로 넘치지 않음');
    T.$('photos-cancel').click();
  });

  T.test('65-2 편 결과: 오선이 수평, 그림자에도 끊기지 않는 흑백', async (T) => {
    const { canvas } = await page();
    const photo = OmrTest.paperPhoto(canvas);
    const flat = OmrImage.flatten(photo, OmrImage.findCorners(photo));
    const tilt = OmrTest.staffTilt(flat);
    T.check(Math.abs(tilt.angle) <= 0.5, `오선 기울기 ${tilt.angle.toFixed(2)}° (≤ 0.5°)`);
    const shaded = OmrTest.paperPhoto(canvas, { shadow: 0.6, seed: 5 });
    // 아주 진한 그림자(가장 어두운 곳이 배경만큼)는 모서리를 손잡이로 고친다고 보고, 흑백 바꾸기만 본다.
    const page2 = OmrImage.flatten(shaded, shaded.corners);
    const t2 = OmrTest.staffTilt(page2);
    const w = page2.width;
    const cover = Number.isFinite(t2.angle) ? OmrTest.lineCoverage(page2, t2, Math.round(w * 0.12), Math.round(w * 0.88)) : 0;
    T.check(cover >= 0.95, `그림자 사진의 오선이 끊기지 않음 (${(cover * 100).toFixed(1)}%)`);
    const margin = OmrTest.inkShare(page2, Math.round(w * 0.01), Math.round(page2.height * 0.3), Math.round(w * 0.04), Math.round(page2.height * 0.95));
    const bottom = OmrTest.inkShare(page2, Math.round(w * 0.1), Math.round(page2.height * 0.9), Math.round(w * 0.9), Math.round(page2.height * 0.97));
    T.check(margin < 0.05 && bottom < 0.05, `그림자 진 빈 곳은 흰색 (여백 ${(margin * 100).toFixed(1)}%, 아래 ${(bottom * 100).toFixed(1)}%)`);
    // 화면의 미리 보기는 흑백.
    T.setMode('score');
    await importPhotos([await OmrTest.fileOf(shaded, 'shade.png')]);
    const data = T.$('photos-preview').getContext('2d').getImageData(0, 0, 50, 50).data;
    let bw = true;
    for (let i = 0; i < data.length; i += 4) if (data[i] !== 0 && data[i] !== 255) bw = false;
    T.check(!T.$('photos-preview').hidden && bw, '미리 보기가 흑백');
    T.$('photos-cancel').click();
  });

  T.test('65-2 깨진 파일·이미지 아닌 파일, 저장하지 않음', async (T) => {
    T.setMode('score');
    const keys = Object.keys(localStorage).sort().join(',');
    const count = scores.list().length;
    const broken = new File([new Uint8Array([0xff, 0xd8, 1, 2, 3])], 'broken.jpg', { type: 'image/jpeg' });
    const text = new File(['도레미'], 'notes.txt', { type: 'text/plain' });
    const good = await OmrTest.fileOf(OmrTest.paperPhoto((await page()).canvas, { width: 800, height: 600, corners: [{ x: 160, y: 60 }, { x: 640, y: 80 }, { x: 660, y: 560 }, { x: 130, y: 540 }] }), 'good.png');
    const added = await importPhotos([broken, good, text]);
    const status = T.$('photos-status');
    T.check(added === 1 && names() === 'good.png', `읽은 사진만 들어감 (${names()})`);
    T.check(status.classList.contains('is-error') && status.textContent.includes('broken.jpg') && status.textContent.includes('notes.txt'),
      `안내: ${status.textContent}`);
    T.check(scores.list().length === count, '악보가 저장되지 않음');
    const all = Object.keys(localStorage).map((k) => localStorage.getItem(k)).join('');
    T.check(Object.keys(localStorage).sort().join(',') === keys && !all.includes('data:image') && all.length < 200000,
      '사진이 localStorage에 없음');
    T.$('photos-cancel').click();
  });

  T.test('65-2 모드 탭·[편집]으로 떠나면 사진을 버림', async (T) => {
    T.setMode('score');
    const top = writeTop();
    await importPhotos([await OmrTest.fileOf(plain(150), 'x.png')]);
    T.check(photosShown(), '열림');
    T.setMode('melody');
    T.check(!photosShown() && practiceShown() && photoImport.photos.length === 0, '모드를 바꾸면 버림');
    T.setMode('score');
    T.check(writeTop() === top, '받아 적기 위치 그대로');
    await importPhotos([await OmrTest.fileOf(plain(150), 'y.png')]);
    T.$('btn-edit-score').click();
    T.check(!photosShown() && !T.$('editor').hidden && photoImport.photos.length === 0, '[편집]을 누르면 사진 화면이 닫힘');
    T.$('editor-cancel').click();
    T.check(practiceShown() && writeTop() === top, '연습 화면으로');
    // 연습 한 사이클이 그대로.
    await T.listen();
    T.enterNotes(current);
    T.submit();
    T.check(T.resultText().includes('모두 정답'), '사진 화면을 오간 뒤에도 연습 한 사이클');
    T.next();
    T.setMode('melody'); // smoke.js starts from the first screen's mode
    clearInterval(ticker);
  });
}
