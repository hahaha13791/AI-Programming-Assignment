(function () {
  // The photo screen (PRD #4-L-1, #4-L-2): the photos of one piece in order, each one's paper corners (found by
  // OmrImage, moved by dragging the handles or with the arrow keys) and its flat black-and-white preview.
  // Photos live only in memory and are dropped when the screen closes.

  const CORNER_NAMES = ['왼쪽 위', '오른쪽 위', '오른쪽 아래', '왼쪽 아래'];
  const STAGE_SIDE = 900; // the photo under the handles is drawn at most this big (the handles use photo pixels)
  const THUMB_HEIGHT = 56;
  const KEY_STEP = 0.005; // an arrow key moves a corner this share of the photo's side

  function create({ status, thumbs, left, right, remove, stage, preview, cornerNote, onChange = () => {} }) {
    let photos = []; // [{ name, canvas, corners, found, page, thumb }]
    let selected = -1;
    let queue = Promise.resolve();
    let run = 0; // a clear() makes reads still going on throw their results away
    let previewVersion = 0;

    const stageCanvas = document.createElement('canvas');
    stageCanvas.className = 'photos-stage-image';
    const outline = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    outline.classList.add('photos-outline');
    outline.setAttribute('preserveAspectRatio', 'none');
    outline.setAttribute('aria-hidden', 'true');
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('vector-effect', 'non-scaling-stroke');
    outline.append(polygon);
    const handles = CORNER_NAMES.map((name, i) => {
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'photos-handle';
      handle.dataset.corner = String(i);
      handle.setAttribute('aria-label', `${name} 모서리 (화살표 키로 옮기기)`);
      return handle;
    });
    stage.append(stageCanvas, outline, ...handles);

    function setStatus(text, isError = false) {
      status.textContent = text;
      status.classList.toggle('is-error', isError);
    }

    const current = () => photos[selected] ?? null;

    function makeThumb(canvas) {
      const scale = THUMB_HEIGHT / canvas.height;
      const thumb = OmrImage.canvasOf(canvas.width * scale, THUMB_HEIGHT);
      thumb.getContext('2d').drawImage(canvas, 0, 0, thumb.width, thumb.height);
      return thumb;
    }

    // Reads the files one after another and adds them at the end. Returns how many were added.
    function add(files) {
      const list = [...files];
      const mine = run;
      const job = queue.then(async () => {
        const errors = [];
        let added = 0;
        for (let i = 0; i < list.length; i++) {
          if (mine !== run) return 0;
          setStatus(`사진을 읽는 중이에요 (${i + 1}/${list.length})`);
          await new Promise((resolve) => setTimeout(resolve, 0)); // let the status show
          let photo;
          try {
            const { canvas, name } = await OmrImage.load(list[i]);
            const found = OmrImage.findCorners(canvas);
            const corners = found ?? OmrImage.frameCorners(canvas);
            photo = { name, canvas, corners, found: Boolean(found), page: null, thumb: makeThumb(canvas) };
            photo.page = OmrImage.flatten(canvas, corners);
          } catch (caught) {
            errors.push(caught instanceof OmrImage.ImageError ? caught.message : `열 수 없는 사진이에요: ${list[i].name}`);
            continue;
          }
          if (mine !== run) return 0;
          photos.push(photo);
          if (!added) selected = photos.length - 1;
          added++;
        }
        if (mine !== run) return 0;
        if (errors.length) setStatus(errors.join(' · '), true);
        else if (photos.length) setStatus(`사진 ${photos.length}장. 종이 모서리가 맞는지 보고, 틀리면 동그라미를 끌어 고쳐 주세요.`);
        else setStatus('사진을 넣어 주세요.');
        render();
        return added;
      });
      queue = job.catch(() => 0);
      return job;
    }

    function clear() {
      run++;
      photos = [];
      selected = -1;
      queue = Promise.resolve();
      setStatus('');
      render();
    }

    function select(index) {
      if (index < 0 || index >= photos.length) return;
      selected = index;
      render();
    }

    function move(step) {
      const to = selected + step;
      if (selected < 0 || to < 0 || to >= photos.length) return;
      [photos[selected], photos[to]] = [photos[to], photos[selected]];
      selected = to;
      render();
    }

    function removeSelected() {
      if (selected < 0) return;
      photos.splice(selected, 1);
      selected = Math.min(selected, photos.length - 1);
      if (!photos.length) setStatus('사진을 넣어 주세요.');
      render();
    }

    function renderThumbs() {
      thumbs.replaceChildren(...photos.map((photo, i) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'photos-thumb';
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', String(i === selected));
        button.setAttribute('aria-label', `${i + 1}쪽, ${photo.name}`);
        button.dataset.index = String(i);
        const number = document.createElement('span');
        number.className = 'photos-thumb-number';
        number.textContent = String(i + 1);
        button.append(photo.thumb, number);
        return button;
      }));
      thumbs.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }

    function renderStage() {
      const photo = current();
      stage.hidden = !photo;
      if (!photo) return;
      const scale = Math.min(1, STAGE_SIDE / Math.max(photo.canvas.width, photo.canvas.height));
      stageCanvas.width = Math.round(photo.canvas.width * scale);
      stageCanvas.height = Math.round(photo.canvas.height * scale);
      stageCanvas.getContext('2d').drawImage(photo.canvas, 0, 0, stageCanvas.width, stageCanvas.height);
      stage.style.aspectRatio = `${photo.canvas.width} / ${photo.canvas.height}`;
      // As wide as the screen allows while no taller than 60% of it (the handles use the box's own size).
      stage.style.width = `min(100%, calc(60vh * ${(photo.canvas.width / photo.canvas.height).toFixed(4)}))`;
      outline.setAttribute('viewBox', `0 0 ${photo.canvas.width} ${photo.canvas.height}`);
      placeHandles();
    }

    function placeHandles() {
      const photo = current();
      if (!photo) return;
      const { width, height } = photo.canvas;
      polygon.setAttribute('points', photo.corners.map((c) => `${c.x},${c.y}`).join(' '));
      photo.corners.forEach((c, i) => {
        handles[i].style.left = `${(c.x / width) * 100}%`;
        handles[i].style.top = `${(c.y / height) * 100}%`;
      });
    }

    function renderPreview() {
      const photo = current();
      preview.hidden = !photo;
      cornerNote.textContent = photo && !photo.found ? '종이 모서리를 찾지 못해 사진 귀퉁이에서 시작했어요.' : '';
      if (!photo) return;
      OmrImage.draw(photo.page, preview);
      preview.dataset.version = String(++previewVersion);
      preview.setAttribute('aria-label', `${selected + 1}쪽을 펴서 흑백으로 바꾼 미리 보기`);
    }

    function render() {
      renderThumbs();
      left.disabled = selected <= 0;
      right.disabled = selected < 0 || selected >= photos.length - 1;
      remove.disabled = selected < 0;
      renderStage();
      renderPreview();
      onChange();
    }

    // The flat page again after a corner moved.
    function reflatten() {
      const photo = current();
      if (!photo) return;
      photo.page = OmrImage.flatten(photo.canvas, photo.corners);
      renderPreview();
    }

    function setCorner(i, x, y) {
      const photo = current();
      if (!photo) return;
      photo.corners[i] = {
        x: Math.min(photo.canvas.width, Math.max(0, x)),
        y: Math.min(photo.canvas.height, Math.max(0, y)),
      };
      placeHandles();
    }

    // Dragging a handle (mouse, finger or pen); the preview is made again when it is let go.
    let drag = null;
    stage.addEventListener('pointerdown', (event) => {
      const handle = event.target.closest('.photos-handle');
      if (!handle || !current()) return;
      event.preventDefault();
      drag = { corner: Number(handle.dataset.corner), pointer: event.pointerId };
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        // a pointer the browser doesn't know (made by a script) can't be captured; moves still reach the stage
      }
      handle.focus({ preventScroll: true }); // focusing must not scroll the page under the finger
    });
    stage.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      const photo = current();
      const box = stage.getBoundingClientRect();
      setCorner(
        drag.corner,
        ((event.clientX - box.left) / box.width) * photo.canvas.width,
        ((event.clientY - box.top) / box.height) * photo.canvas.height,
      );
    });
    const endDrag = (event) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      drag = null;
      reflatten();
    };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener('keydown', (event) => {
      const handle = event.target.closest('.photos-handle');
      const photo = current();
      const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (!handle || !photo || !dirs[event.key]) return;
      event.preventDefault();
      const i = Number(handle.dataset.corner);
      const [dx, dy] = dirs[event.key];
      const c = photo.corners[i];
      setCorner(i, c.x + dx * photo.canvas.width * KEY_STEP, c.y + dy * photo.canvas.height * KEY_STEP);
      reflatten();
    });

    thumbs.addEventListener('click', (event) => {
      const thumb = event.target.closest('.photos-thumb');
      if (thumb) select(Number(thumb.dataset.index));
    });
    left.addEventListener('click', () => move(-1));
    right.addEventListener('click', () => move(1));
    remove.addEventListener('click', removeSelected);

    render();
    return {
      add, clear, select, move, setCorner, reflatten, removeSelected,
      get photos() { return photos; },
      get selected() { return selected; },
      get busy() { return queue; },
    };
  }

  window.PhotoImport = { create, CORNER_NAMES };
})();
