(function () {
  // The editor screen (PRD #4-H): the score drawn with the chosen note (cursor) marked, pressing a note or a chord
  // head to choose it, undo/redo, the tool tabs [음표 | 마디 | 기호] and the keyboard. The work on the score itself
  // is in editing.js.
  const N = Notation;
  const TYPE_NAMES = {
    whole: '온', half: '2분', quarter: '4분', eighth: '8분', '16th': '16분', '32nd': '32분', '64th': '64분',
  };
  const SIGNS = { 2: '𝄪', 1: '♯', 0: '', '-1': '♭', '-2': '𝄫' };

  const pitchName = (pitch) => `${pitch.step}${SIGNS[pitch.alter] ?? ''}${pitch.octave}`;

  // [음표] tools (PRD #4-H-2): lengths, entering at the cursor, and the input staff.
  const LENGTHS = [
    ['whole', '온'], ['half', '2분'], ['quarter', '4분'], ['eighth', '8분'], ['16th', '16분'], ['32nd', '32분'], ['64th', '64분'],
  ];
  const KEY_LENGTHS = { 1: '64th', 2: '32nd', 3: '16th', 4: 'eighth', 5: 'quarter', 6: 'half', 7: 'whole' }; // MuseScore's
  const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const PAD = { low: -6, high: 14, half: 7, edge: 8, width: 300, left: 44 }; // three ledger lines each way
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(name, attrs, text) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(text, attrs = {}) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ed-button';
    b.textContent = text;
    for (const [key, value] of Object.entries(attrs)) b.setAttribute(key, value);
    return b;
  }

  const diatonic = (pitch) => pitch.octave * 7 + STEPS.indexOf(pitch.step);

  // [마디] tools (PRD #4-H-3).
  const MAJOR = { '-7': 'C♭', '-6': 'G♭', '-5': 'D♭', '-4': 'A♭', '-3': 'E♭', '-2': 'B♭', '-1': 'F', 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F♯', 7: 'C♯' };
  const MINOR = { '-7': 'A♭', '-6': 'E♭', '-5': 'B♭', '-4': 'F', '-3': 'C', '-2': 'G', '-1': 'D', 0: 'A', 1: 'E', 2: 'B', 3: 'F♯', 4: 'C♯', 5: 'G♯', 6: 'D♯', 7: 'A♯' };
  const CLEF_LABELS = {
    treble: '높은음자리표', bass: '낮은음자리표', alto: '알토 음자리표', tenor: '테너 음자리표',
    'treble-8vb': '높은음자리표 8vb', 'treble-8va': '높은음자리표 8va', 'bass-8vb': '낮은음자리표 8vb', 'bass-8va': '낮은음자리표 8va',
  };

  function select(id, options, label) {
    const field = document.createElement('select');
    field.id = id;
    field.className = 'ed-select';
    field.setAttribute('aria-label', label);
    for (const [value, text] of options) {
      const option = document.createElement('option');
      option.value = String(value);
      option.textContent = text;
      field.append(option);
    }
    return field;
  }

  function field(label, ...children) {
    const row = document.createElement('div');
    row.className = 'ed-row ed-field';
    const name = document.createElement('span');
    name.className = 'ed-label';
    name.textContent = label;
    row.append(name, ...children);
    return row;
  }

  // "3마디 2번째 · F♯4 4분음표" for the status line under the score.
  function describe(score, cursor) {
    const measure = N.resolve(score)[cursor.measure];
    const note = score.measures[cursor.measure].notes[cursor.note];
    const length = `${'점'.repeat(note.dots ?? 0)}${TYPE_NAMES[note.type]}${note.rest ? '쉼표' : '음표'}`;
    const where = `${measure.number}마디 ${cursor.note + 1}번째`;
    if (note.rest) return `${where} · ${length}`;
    const pitches = N.pitchesOf(note);
    const what = pitches.length > 1
      ? `화음 ${pitches.map((p, i) => (i === cursor.head ? `[${pitchName(p.pitch)}]` : pitchName(p.pitch))).join(' ')}`
      : pitchName(note.pitch);
    return `${where} · ${note.grace ? '꾸밈음 ' : ''}${what} ${length}`;
  }

  // elements: { title, view, status, undo, redo, tabs, tools: { notes, measure, signs } }. onChange: after any change.
  // titleTaken(title): whether another score already has this title (it isn't saved then, PRD #4-H-1).
  function create({ title, titleNote, view, status, undo, redo, play, tabs, tools, speed = () => 1, titleTaken = () => false, onChange = () => {} }) {
    let state = null;
    let playTimer = null;

    // [듣기 | 멈춤] (PRD #4-H-5): from the cursor's measure to the end, as the practice screen plays it (no tonic).
    function stopPlaying() {
      clearTimeout(playTimer);
      playTimer = null;
      if (play.dataset.playing !== undefined) Sound.stop();
      delete play.dataset.playing;
      play.textContent = '듣기';
    }

    play.disabled = false;
    play.addEventListener('click', () => {
      if (!state) return;
      if (play.dataset.playing !== undefined) {
        stopPlaying();
        return;
      }
      const score = { ...state.score, id: 'edit', title: 'edit' };
      const { events, total } = Playback.schedule(score, { start: state.cursor.measure, end: score.measures.length - 1, tonic: false, speed: speed() });
      const length = Sound.playEvents(events, total);
      play.dataset.playing = '';
      play.textContent = '멈춤';
      playTimer = setTimeout(stopPlaying, length * 1000);
    });
    // The length to write, the ♯/♭/♮ toggle, and what a pitch does: write a note, add to the chord or a grace note.
    const input = { type: 'quarter', dots: 0, toggle: null, mode: 'note' };

    // ---- the [음표] panel ----
    const lengthRow = document.createElement('div');
    lengthRow.className = 'ed-row ed-lengths';
    lengthRow.setAttribute('role', 'radiogroup');
    lengthRow.setAttribute('aria-label', '음 길이');
    const lengthButtons = LENGTHS.map(([type, label]) => {
      const b = button(label, { role: 'radio', 'data-type': type, 'aria-label': `${label}음표` });
      b.addEventListener('click', () => chooseLength(type));
      return b;
    });
    lengthRow.append(...lengthButtons);
    const dotButton = button('점', { id: 'editor-dot', 'aria-pressed': 'false' });
    const restButton = button('쉼표', { id: 'editor-rest' });
    const applyButton = button('길이 바꾸기', { id: 'editor-apply-length' });
    const eraseButton = button('지우기', { id: 'editor-erase' });
    const tieButton = button('붙임줄', { id: 'editor-tie', 'aria-pressed': 'false' });
    const actionRow = document.createElement('div');
    actionRow.className = 'ed-row';
    actionRow.append(dotButton, restButton, applyButton, eraseButton, tieButton);
    // Tuplets: the usual ones, any n:m, and back to plain rests (PRD #4-H-3).
    const tupletRow = document.createElement('div');
    tupletRow.className = 'ed-row ed-tuplets';
    tupletRow.setAttribute('role', 'group');
    tupletRow.setAttribute('aria-label', '잇단음표');
    const tupletButtons = [3, 5, 6, 7].map((n) => {
      const b = button(`${n}잇단`, { 'data-tuplet': n });
      b.addEventListener('click', () => makeTuplet(n));
      return b;
    });
    const number = (id, value, label) => {
      const field = document.createElement('input');
      Object.assign(field, { type: 'number', id, min: 1, max: 15, value });
      field.className = 'ed-number';
      field.setAttribute('aria-label', label);
      return field;
    };
    const actualField = number('editor-tuplet-actual', 3, '잇단음표 음 개수');
    const normalField = number('editor-tuplet-normal', 2, '몇 개의 시간에');
    const customButton = button('만들기', { id: 'editor-tuplet-custom' });
    customButton.addEventListener('click', () => makeTuplet(Number(actualField.value), Number(normalField.value)));
    const untupletButton = button('잇단 풀기', { id: 'editor-untuplet' });
    untupletButton.addEventListener('click', () => {
      if (state.untuplet()) render();
    });
    const ratio = document.createElement('span');
    ratio.className = 'ed-ratio';
    ratio.append(actualField, ':', normalField, customButton);
    tupletRow.append(...tupletButtons, ratio, untupletButton);
    const toggles = [[1, '♯', 'editor-sharp', '샵'], [-1, '♭', 'editor-flat', '플랫'], [0, '♮', 'editor-natural', '제자리표']].map(([value, text, id, name]) => {
      const b = button(`${text}\uFE0E`, { id, 'aria-pressed': 'false', 'aria-label': `${name} 붙여 넣기` });
      b.classList.add('btn-toggle');
      b.addEventListener('click', () => {
        input.toggle = input.toggle === value ? null : value;
        renderTools();
      });
      return [value, b];
    });
    const moves = [['반음↑︎', 'editor-up', () => state.semitone(1)], ['반음↓︎', 'editor-down', () => state.semitone(-1)],
      ['옥타브↑︎', 'editor-octave-up', () => state.octave(1)], ['옥타브↓︎', 'editor-octave-down', () => state.octave(-1)]].map(([text, id, act]) => {
      const b = button(text, { id });
      b.addEventListener('click', () => act() && render());
      return b;
    });
    const pitchRow = document.createElement('div');
    pitchRow.className = 'ed-row';
    pitchRow.append(...toggles.map(([, b]) => b), ...moves);
    const pad = document.createElement('div');
    pad.className = 'ed-pad';
    pad.id = 'editor-pad';
    // Chords and grace notes: while one is on, a pitch adds to the cursor's chord or goes in as a grace note.
    const chordButton = button('화음 넣기', { id: 'editor-chord', 'aria-pressed': 'false' });
    const graceButton = button('꾸밈음 넣기', { id: 'editor-grace', 'aria-pressed': 'false' });
    const slashButton = button('사선', { id: 'editor-slash', 'aria-pressed': 'false', 'aria-label': '꾸밈음 사선' });
    const modeRow = document.createElement('div');
    modeRow.className = 'ed-row';
    modeRow.append(chordButton, graceButton, slashButton);
    chordButton.addEventListener('click', () => {
      input.mode = input.mode === 'chord' ? 'note' : 'chord';
      renderTools();
    });
    graceButton.addEventListener('click', () => {
      input.mode = input.mode === 'grace' ? 'note' : 'grace';
      renderTools();
    });
    slashButton.addEventListener('click', () => state.toggleSlash() && render());
    tools.notes.append(lengthRow, actionRow, modeRow, tupletRow, pitchRow, pad);

    // A message in the status line until the next change (why nothing happened).
    function flash(message) {
      status.textContent = message;
      status.classList.add('is-notice');
    }

    // Of the chosen length (8분 + 3잇단 = an eighth-note triplet, in the time of a quarter).
    function makeTuplet(actual, normal) {
      if (state.tuplet(actual, normal, input.type)) render();
      else flash('여기에는 그 잇단음표가 들어가지 않아요 (마디나 묶음 밖으로 넘치거나 세 겹이 됨).');
    }

    function toggleTie() {
      if (state.toggleTie()) render();
      else flash('다음 음에 같은 높이가 없어 붙임줄을 걸 수 없어요.');
    }
    tieButton.addEventListener('click', toggleTie);

    // ---- the [마디] panel ----
    const range = (from, to) => Array.from({ length: to - from + 1 }, (_, k) => from + k);
    const beatsField = select('editor-time-beats', range(1, 32).map((n) => [n, n]), '박자 분자');
    const typeField = select('editor-time-type', [1, 2, 4, 8, 16, 32].map((n) => [n, n]), '박자 분모');
    const symbolField = select('editor-time-symbol', [['', '숫자'], ['common', 'C'], ['cut', '¢']], '박자 기호');
    const timeButton = button('바꾸기', { id: 'editor-time-apply' });
    const keyField = select('editor-key', range(-7, 7).map((f) => [f, `${f > 0 ? `♯${f}` : f < 0 ? `♭${-f}` : '없음'} (${MAJOR[f]}장조·${MINOR[f]}단조)`]), '조표');
    const modeField = select('editor-mode', [['major', '장조'], ['minor', '단조']], '장조/단조');
    const keyButton = button('바꾸기', { id: 'editor-key-apply' });
    const clefField = select('editor-clef', N.CLEFS.map((c) => [c, CLEF_LABELS[c]]), '음자리표');
    const clefMeasure = button('마디 첫머리', { id: 'editor-clef-measure' });
    const clefNote = button('커서 음부터', { id: 'editor-clef-note' });
    const tempoField = document.createElement('input');
    Object.assign(tempoField, { type: 'number', id: 'editor-tempo', min: N.TEMPO_RANGE[0], max: N.TEMPO_RANGE[1] });
    tempoField.className = 'ed-number ed-wide';
    tempoField.setAttribute('aria-label', '빠르기 (4분음표 기준 1분에)');
    const tempoMeasure = button('마디 첫머리', { id: 'editor-tempo-measure' });
    const tempoNote = button('커서 음부터', { id: 'editor-tempo-note' });
    const pickupField = select('editor-pickup', [], '못갖춘마디 길이');
    const pickupButton = button('바꾸기', { id: 'editor-pickup-apply' });
    const lengthField = select('editor-measure-length', [], '이 마디 길이');
    const implicitField = document.createElement('input');
    Object.assign(implicitField, { type: 'checkbox', id: 'editor-implicit' });
    const implicitLabel = document.createElement('label');
    implicitLabel.className = 'ed-check';
    implicitLabel.append(implicitField, ' 번호 세지 않기');
    const lengthButton = button('바꾸기', { id: 'editor-measure-apply' });
    const insertButton = button('앞에 마디 넣기', { id: 'editor-insert-measure' });
    const deleteButton = button('마디 지우기', { id: 'editor-delete-measure' });
    const firstField = document.createElement('input');
    Object.assign(firstField, { type: 'number', id: 'editor-first-number', min: 0, max: 99999 });
    firstField.className = 'ed-number ed-wide';
    firstField.setAttribute('aria-label', '첫 마디 번호');
    const firstButton = button('바꾸기', { id: 'editor-first-apply' });
    tools.measure.append(
      field('박자', beatsField, '/', typeField, symbolField, timeButton),
      field('조표', keyField, modeField, keyButton),
      field('음자리표', clefField, clefMeasure, clefNote),
      field('빠르기 ♩=', tempoField, tempoMeasure, tempoNote),
      field('못갖춘마디', pickupField, pickupButton),
      field('이 마디 길이', lengthField, implicitLabel, lengthButton),
      field('마디', insertButton, deleteButton),
      field('첫 마디 번호', firstField, firstButton),
    );

    // Lengths in beats of the time at the cursor: [value "n/d" of a whole note, label].
    function beatChoices(time, none) {
      const [beats, beatType] = time;
      return [['', none], ...range(1, beats - 1).map((k) => [`${k}/${beatType}`, `${k}박`])];
    }
    const fraction = (value) => (value ? value.split('/').map(Number) : null);
    const reduce = (f) => (f ? N.frac(f[0], f[1]) : null);

    function measureTool(act, message) {
      const result = act();
      if (result === false) {
        flash(message);
        return;
      }
      render();
      if (typeof result === 'number' && result > 0) flash(`넘치는 음 ${result}개를 지웠어요. 되돌리기로 살릴 수 있어요.`);
    }

    timeButton.addEventListener('click', () => {
      let beats = Number(beatsField.value);
      let type = Number(typeField.value);
      const symbol = symbolField.value || undefined;
      if (symbol === 'common') [beats, type] = [4, 4];
      if (symbol === 'cut') [beats, type] = [2, 2];
      measureTool(() => state.setTime(beats, type, symbol), '박자가 이미 그렇거나 바꿀 수 없어요.');
    });
    keyButton.addEventListener('click', () => measureTool(() => state.setKey(Number(keyField.value), modeField.value), '조표가 이미 그래요.'));
    clefMeasure.addEventListener('click', () => measureTool(() => state.setClef(clefField.value, false), '음자리표가 이미 그래요.'));
    clefNote.addEventListener('click', () => measureTool(() => state.setClef(clefField.value, true), '음자리표가 이미 그래요.'));
    tempoMeasure.addEventListener('click', () => measureTool(() => state.setTempo(tempoField.value, false), `빠르기는 ${N.TEMPO_RANGE[0]}~${N.TEMPO_RANGE[1]}이에요.`));
    tempoNote.addEventListener('click', () => measureTool(() => state.setTempo(tempoField.value, true), `빠르기는 ${N.TEMPO_RANGE[0]}~${N.TEMPO_RANGE[1]}이에요.`));
    pickupButton.addEventListener('click', () => measureTool(() => state.setPickup(reduce(fraction(pickupField.value))), '첫 마디가 이미 그래요.'));
    lengthButton.addEventListener('click', () => measureTool(() => state.setMeasureLength(reduce(fraction(lengthField.value)), implicitField.checked), '첫 마디는 [못갖춘마디]로 정해요.'));
    insertButton.addEventListener('click', () => measureTool(() => state.insertMeasure(), '마디를 넣을 수 없어요.'));
    deleteButton.addEventListener('click', () => measureTool(() => state.deleteMeasure(), '마디가 하나뿐이라 지울 수 없어요.'));
    firstButton.addEventListener('click', () => measureTool(() => state.setFirstNumber(firstField.value), '0~99999로 적어 주세요.'));

    // The [마디] fields show what is in force at the cursor.
    function renderMeasureTools() {
      const score = { ...state.score, id: 'x', title: 'x' };
      const all = N.resolve(score);
      const m = all[state.cursor.measure];
      beatsField.value = String(m.time[0]);
      typeField.value = String(m.time[1]);
      symbolField.value = m.timeSymbol ?? '';
      keyField.value = String(m.key.fifths);
      modeField.value = m.key.mode;
      clefField.value = state.clefAt();
      let tempo = m.tempo;
      state.score.measures[state.cursor.measure].notes.slice(0, state.cursor.note + 1).forEach((n) => { if (n.tempo !== undefined) tempo = n.tempo; });
      tempoField.value = String(tempo);
      const first = all[0];
      pickupField.replaceChildren(...beatChoices(first.time, '없음 (온마디)').map(([v, t]) => Object.assign(document.createElement('option'), { value: v, textContent: t })));
      const firstLength = N.filled(state.score.measures[0].notes);
      pickupField.value = state.score.pickup ? `${firstLength[0] * (first.time[1] / firstLength[1])}/${first.time[1]}` : '';
      lengthField.replaceChildren(...beatChoices(m.time, '온마디').map(([v, t]) => Object.assign(document.createElement('option'), { value: v, textContent: t })));
      const own = N.filled(state.score.measures[state.cursor.measure].notes);
      const short = N.cmp(own, N.measureLength(m.time)) < 0;
      lengthField.value = short ? `${own[0] * (m.time[1] / own[1])}/${m.time[1]}` : '';
      if (lengthField.value === '' && short) lengthField.value = '';
      implicitField.checked = Boolean(state.score.measures[state.cursor.measure].implicit);
      const firstMeasure = state.cursor.measure === 0;
      lengthField.disabled = firstMeasure;
      implicitField.disabled = firstMeasure;
      lengthButton.disabled = firstMeasure;
      deleteButton.disabled = state.score.measures.length < 2;
      firstField.value = String(all[0].number);
    }

    // ---- the [기호] panel ----
    const repeatStart = button('|: 시작', { id: 'editor-repeat-start', 'aria-pressed': 'false', 'aria-label': '도돌이표 시작' });
    const repeatEnd = button(':| 끝', { id: 'editor-repeat-end', 'aria-pressed': 'false', 'aria-label': '도돌이표 끝' });
    const barlineField = select('editor-barline', [['', '보통'], ['double', '겹세로줄'], ['final', '끝세로줄']], '마디 끝 세로줄');
    const barlineButton = button('바꾸기', { id: 'editor-barline-apply' });
    const endingText = document.createElement('input');
    Object.assign(endingText, { type: 'text', id: 'editor-ending-text', value: '1.', maxLength: N.MAX_MARK });
    endingText.className = 'ed-number ed-text';
    endingText.setAttribute('aria-label', '괄호 번호');
    const endingCount = select('editor-ending-count', [1, 2, 3, 4].map((n) => [n, `${n}마디`]), '괄호 길이');
    const endingClosed = document.createElement('input');
    Object.assign(endingClosed, { type: 'checkbox', id: 'editor-ending-closed', checked: true });
    const closedLabel = document.createElement('label');
    closedLabel.className = 'ed-check';
    closedLabel.append(endingClosed, ' 닫힘');
    const endingButton = button('넣기', { id: 'editor-ending-apply' });
    const endingRemove = button('빼기', { id: 'editor-ending-remove' });
    const segnoButton = button('세뇨 𝄋', { id: 'editor-segno' });
    const codaButton = button('코다 𝄌', { id: 'editor-coda' });
    const wordsField = select('editor-words', ['D.C.', 'D.C. al Fine', 'D.C. al Coda', 'D.S.', 'D.S. al Fine', 'D.S. al Coda', 'Fine', 'To Coda', 'Coda'].map((w) => [w, w]), '글자 기호');
    const wordsCustom = document.createElement('input');
    Object.assign(wordsCustom, { type: 'text', id: 'editor-words-custom', maxLength: N.MAX_MARK, placeholder: '직접 쓰기' });
    wordsCustom.className = 'ed-number ed-text';
    wordsCustom.setAttribute('aria-label', '글자 기호 직접 쓰기');
    const wordsAt = select('editor-words-at', [['end', '마디 끝'], ['start', '첫머리']], '글자 자리');
    const wordsButton = button('넣기', { id: 'editor-words-apply' });
    const marksClear = button('이 마디 기호 지우기', { id: 'editor-marks-clear' });
    tools.signs.append(
      field('도돌이표', repeatStart, repeatEnd),
      field('마디 끝', barlineField, barlineButton),
      field('1·2번 괄호', endingText, endingCount, closedLabel, endingButton, endingRemove),
      field('표지', segnoButton, codaButton),
      field('글자', wordsField, wordsCustom, wordsAt, wordsButton),
      field('', marksClear),
    );
    repeatStart.addEventListener('click', () => measureTool(() => state.toggleRepeat('start'), '도돌이표를 바꿀 수 없어요.'));
    repeatEnd.addEventListener('click', () => measureTool(() => state.toggleRepeat('end'), '도돌이표를 바꿀 수 없어요.'));
    barlineButton.addEventListener('click', () => measureTool(() => state.setBarline(barlineField.value || null), '도돌이표 끝이 있는 마디는 세로줄을 따로 정하지 않아요.'));
    endingButton.addEventListener('click', () => measureTool(() => state.setEnding(Number(endingCount.value), endingText.value, endingClosed.checked), '괄호 번호를 적어 주세요.'));
    endingRemove.addEventListener('click', () => measureTool(() => state.removeEnding(), '이 마디에는 괄호가 없어요.'));
    segnoButton.addEventListener('click', () => measureTool(() => state.addMark('segno', null, 'start'), '이미 있어요.'));
    codaButton.addEventListener('click', () => measureTool(() => state.addMark('coda', null, 'start'), '이미 있어요.'));
    wordsButton.addEventListener('click', () => measureTool(() => state.addMark('text', wordsCustom.value.trim() || wordsField.value, wordsAt.value), '이미 있어요.'));
    marksClear.addEventListener('click', () => measureTool(() => state.clearMarks(), '이 마디에는 기호가 없어요.'));

    function renderSignTools() {
      const m = state.score.measures[state.cursor.measure];
      repeatStart.setAttribute('aria-pressed', String(Boolean(m.repeatStart)));
      repeatEnd.setAttribute('aria-pressed', String(Boolean(m.repeatEnd)));
      barlineField.value = m.barline ?? '';
      barlineField.disabled = Boolean(m.repeatEnd);
      barlineButton.disabled = Boolean(m.repeatEnd);
      endingRemove.disabled = !m.ending;
      marksClear.disabled = !m.marks;
    }

    function chooseLength(type) {
      input.type = type;
      input.dots = 0;
      renderTools();
    }

    dotButton.addEventListener('click', () => {
      input.dots = (input.dots + 1) % 3;
      renderTools();
    });
    restButton.addEventListener('click', () => write({ type: input.type, dots: input.dots, rest: true }));
    applyButton.addEventListener('click', () => state.setLength(input.type, input.dots) && render());
    eraseButton.addEventListener('click', () => state.erase() && render());

    // Writes at the cursor and sounds the pitch briefly.
    function write(note) {
      if (!state || !state.insert(note)) return false;
      if (note.pitch && typeof Sound !== 'undefined') {
        Sound.playEvents([{ start: 0, length: 0.35, midi: N.midi(note.pitch), peak: Playback.NOTE_PEAK, sustain: false }]);
      }
      render();
      return true;
    }

    // A pitch from the input staff or a letter key, by the mode: a note at the cursor, a pitch more in its chord, or a
    // grace note before it (of the chosen length: an eighth or shorter).
    function enterPitch(pitch, mode = input.mode) {
      if (mode === 'chord') {
        if (!state.toggleChordPitch(pitch)) {
          flash('화음의 마지막 음은 [지우기]로 지워요.');
          return;
        }
      } else if (mode === 'grace') {
        const type = ['whole', 'half', 'quarter'].includes(input.type) ? 'eighth' : input.type;
        if (!state.addGrace(pitch, type)) return;
      } else {
        write({ type: input.type, dots: input.dots, pitch });
        return;
      }
      if (typeof Sound !== 'undefined') Sound.playEvents([{ start: 0, length: 0.35, midi: N.midi(pitch), peak: Playback.NOTE_PEAK, sustain: false }]);
      render();
    }

    // A pitch of this letter and octave at the cursor: the toggle's accidental, else as the page shows it.
    function pitchFor(step, octave) {
      const { measure, note } = state.cursor;
      const alter = input.toggle ?? state.alterAt(measure, note, step, octave);
      return { step, alter, octave };
    }

    // The input staff in the clef at the cursor, with the key signature; each line and space can be pressed.
    function renderPad() {
      const { measure } = state.cursor;
      const clef = state.clefAt();
      const key = N.resolve({ ...state.score, id: 'x', title: 'x' })[measure].key;
      const yOf = (pos) => PAD.edge + (PAD.high - pos) * PAD.half;
      const height = PAD.edge * 2 + (PAD.high - PAD.low) * PAD.half;
      const svg = svgEl('svg', { class: 'ed-pad-svg', viewBox: `0 0 ${PAD.width} ${height}`, role: 'group', 'aria-label': '음높이 넣기 오선', 'data-clef': clef });
      for (let p = PAD.low; p <= PAD.high; p += 2) {
        const ledger = p < 0 || p > 8;
        svg.append(svgEl('line', { x1: ledger ? PAD.left + 20 : 0, x2: PAD.width, y1: yOf(p), y2: yOf(p), class: ledger ? 'ed-pad-ledger' : 'staff-line' }));
      }
      Sheet.drawClef(svg, clef, 2, yOf, false);
      Sheet.keySigns(key, clef).forEach((sign, i) => {
        svg.append(svgEl('text', { x: 40 + i * 9, y: yOf(sign.pos) + 5, class: 'sv-accidental sv-key' }, SIGNS[sign.alter] || '♮'));
      });
      const bottom = Sheet.clefBottom(clef);
      for (let pos = PAD.low; pos <= PAD.high; pos++) {
        const d = pos + bottom;
        const step = STEPS[((d % 7) + 7) % 7];
        const octave = Math.floor(d / 7);
        const slot = svgEl('rect', {
          x: 0, y: yOf(pos) - PAD.half / 2, width: PAD.width, height: PAD.half, class: 'ed-slot',
          'data-pos': pos, 'data-step': step, 'data-octave': octave,
        });
        slot.addEventListener('click', () => enterPitch(pitchFor(step, octave)));
        svg.append(slot);
      }
      pad.replaceChildren(svg);
    }

    function renderTools() {
      if (!state) return;
      for (const b of lengthButtons) {
        b.setAttribute('aria-checked', String(b.dataset.type === input.type));
        b.disabled = !state.fits(b.dataset.type, input.dots && b.dataset.type === input.type ? input.dots : 0);
      }
      dotButton.textContent = input.dots === 2 ? '겹점' : '점';
      dotButton.setAttribute('aria-pressed', String(input.dots > 0));
      for (const [value, b] of toggles) b.setAttribute('aria-pressed', String(input.toggle === value));
      const target = state.score.measures[state.cursor.measure].notes[state.cursor.note];
      tieButton.setAttribute('aria-pressed', String(state.isTied()));
      tieButton.disabled = Boolean(target.rest || target.grace);
      for (const b of tupletButtons) b.disabled = Boolean(target.grace || target.tuplet2);
      customButton.disabled = Boolean(target.grace || target.tuplet2);
      untupletButton.disabled = !target.tuplet;
      chordButton.setAttribute('aria-pressed', String(input.mode === 'chord'));
      graceButton.setAttribute('aria-pressed', String(input.mode === 'grace'));
      slashButton.setAttribute('aria-pressed', String(Boolean(target.slash)));
      slashButton.disabled = !target.grace;
      renderMeasureTools();
      renderSignTools();
      const fitsNow = state.fits(input.type, input.dots);
      restButton.disabled = !fitsNow;
      pad.classList.toggle('is-disabled', !fitsNow && input.mode === 'note'); // a chord or grace note takes no room
      renderPad();
    }

    // For Shift+letter: the letter's pitch just above the cursor note's chosen pitch (MuseScore adds chord notes upward).
    function nearestAbove(step) {
      const note = state.score.measures[state.cursor.measure].notes[state.cursor.note];
      if (note.rest) return nearest(step);
      const base = N.pitchesOf(note)[state.cursor.head]?.pitch ?? note.pitch;
      const index = STEPS.indexOf(step);
      let d = diatonic(base) + 1;
      while (((d % 7) + 7) % 7 !== index) d++;
      return pitchFor(step, Math.floor(d / 7));
    }

    // The letter's pitch nearest the last pitch before the cursor (or the middle of the staff).
    function nearest(step) {
      const { measure, note } = state.cursor;
      let ref = null;
      for (let m = measure; m >= 0 && !ref; m--) {
        const notes = state.score.measures[m].notes;
        for (let i = (m === measure ? note - 1 : notes.length - 1); i >= 0 && !ref; i--) if (!notes[i].rest) ref = notes[i].pitch;
      }
      const target = ref ? diatonic(ref) : Sheet.clefBottom(state.clefAt()) + 4;
      const index = STEPS.indexOf(step);
      let best = null;
      for (let octave = 0; octave <= 9; octave++) {
        const d = octave * 7 + index;
        if (best === null || Math.abs(d - target) < Math.abs(best * 7 + index - target)) best = octave;
      }
      return pitchFor(step, best);
    }

    function render() {
      if (!state) return;
      const score = { ...state.score, id: 'edit', title: state.title || '새 악보' };
      Sheet.draw(view, score, { pick: true, cursor: state.cursor, numberFirst: true, label: `편집 중인 악보, ${score.title}` });
      status.textContent = describe(score, state.cursor);
      status.classList.remove('is-notice');
      undo.disabled = !state.canUndo();
      redo.disabled = !state.canRedo();
      renderTools();
      // A row wider than the screen scrolls sideways: keep the chosen note in sight.
      const chosen = view.querySelector('.sv-note.is-cursor');
      const row = chosen?.closest('.sheet-row');
      if (row) {
        const at = chosen.getBoundingClientRect();
        const box = row.getBoundingClientRect();
        if (at.left < box.left || at.right > box.right) row.scrollLeft += at.left - box.left - box.width / 2;
      }
      onChange();
    }

    function open(score) {
      state = Editing.create(score);
      title.value = state.title;
      showTab('notes');
      render();
    }

    function close() {
      stopPlaying();
      state = null;
      view.replaceChildren();
    }

    function showTab(name) {
      for (const tab of tabs.querySelectorAll('[role="tab"]')) tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
      for (const [key, panel] of Object.entries(tools)) panel.hidden = key !== name;
    }

    // A change through editing.js, then the drawing. Returns whether anything changed.
    function apply(mutate) {
      if (!state || !state.change(mutate)) return false;
      render();
      return true;
    }

    // A title another score has: said under the title box (its place is kept, so nothing moves).
    function renderTitleNote() {
      const taken = Boolean(state && state.title.trim() && titleTaken(state.title));
      titleNote.textContent = taken ? '같은 제목의 악보가 있어요. 다른 제목을 적어 주세요.' : '';
      return taken;
    }

    title.addEventListener('input', () => {
      if (!state) return;
      state.setTitle(title.value);
      renderTitleNote();
      onChange();
    });

    // A press on a note (or a chord's head) chooses it; a press on the space a note takes in its measure chooses it too.
    view.addEventListener('click', (event) => {
      if (!state) return;
      const target = event.target.closest('.sv-pick, .sv-note');
      if (!target) return;
      const measure = Number(target.closest('[data-measure]')?.dataset.measure);
      const note = Number(target.dataset.index);
      if (!Number.isInteger(measure) || !Number.isInteger(note)) return;
      const head = Number(event.target.closest('.sv-head')?.dataset.head ?? 0);
      state.select(measure, note, head);
      render();
    });

    undo.addEventListener('click', () => state?.undo() && render());
    redo.addEventListener('click', () => state?.redo() && render());
    tabs.addEventListener('click', (event) => {
      const tab = event.target.closest('[role="tab"]');
      if (tab) showTab(tab.dataset.tab);
    });

    // The keyboard (PRD #4-H-4). Returns true when the key was the editor's. Not while typing in a text box.
    function key(event) {
      if (!state) return false;
      const typing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
      if (typing) return false;
      const ctrl = event.ctrlKey || event.metaKey;
      let handled = true;
      const plain = !ctrl && !event.altKey;
      const letter = event.key.length === 1 ? event.key.toUpperCase() : '';
      if (plain && !event.shiftKey && STEPS.includes(letter)) {
        enterPitch(nearest(letter));
      } else if (plain && event.shiftKey && STEPS.includes(letter)) {
        enterPitch(nearestAbove(letter), 'chord');
      } else if (plain && KEY_LENGTHS[event.key]) {
        chooseLength(KEY_LENGTHS[event.key]);
      } else if (!ctrl && event.altKey && ['3', '5', '6', '7'].includes(event.key)) {
        makeTuplet(Number(event.key)); // Alt+number: the browser keeps Ctrl+number for its tabs
      } else if (plain && event.key === '+') {
        toggleTie();
      } else if (plain && event.key === '.') {
        dotButton.click();
      } else if (plain && event.key === '0') {
        restButton.click();
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const dir = event.key === 'ArrowUp' ? 1 : -1;
        if (ctrl ? state.octave(dir) : state.semitone(dir)) render();
      } else if (plain && (event.key === 'Delete' || event.key === 'Backspace')) {
        if (state.erase()) render();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const step = event.key === 'ArrowLeft' ? -1 : 1;
        if (ctrl) state.moveMeasure(step);
        else state.move(step);
        render();
      } else if (ctrl && !event.shiftKey && (event.key === 'z' || event.key === 'Z')) {
        if (state.undo()) render();
      } else if (ctrl && (event.key === 'y' || event.key === 'Y' || (event.shiftKey && (event.key === 'z' || event.key === 'Z')))) {
        if (state.redo()) render();
      } else {
        handled = false;
      }
      if (handled) event.preventDefault();
      return handled;
    }

    return {
      open, close, apply, render, key, showTab, input, stopPlaying,
      get state() { return state; },
      canSave: () => Boolean(state?.canSave()) && !renderTitleNote(),
      result: () => state?.result() ?? null,
    };
  }

  window.ScoreEditor = { create, describe, pitchName };
})();
