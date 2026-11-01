const TONIC = 60;
const HARMONY_TOP_STEP = 11; // G5
const $ = (id) => document.getElementById(id);

const HINTS = {
  ready: "먼저 '문제 듣기'로 기준음과 멜로디를 끝까지 들어 보세요.",
  listening: '듣는 중이에요. 재생이 끝나면 입력할 수 있어요.',
  input: '들은 음을 오선에 순서대로 찍어 보세요. 다시 들어도 괜찮아요.',
  submitted: "채점 완료! 아래에서 정답을 확인하고 '다음 문제'로 넘어가세요.",
};

const MODES = {
  melody: {
    subtitle: '기준음을 듣고, 멜로디를 오선에 받아 적어 보세요.',
    levels: { easy: '3~4음', medium: '5~6음', hard: '7~8음' },
    arpeggio: false,
    hints: {},
  },
  harmony: {
    subtitle: '기준음을 듣고, 화음을 오선에 받아 적어 보세요.',
    levels: {
      triad: { easy: '장·단 3화음', medium: '장·단·감·증', hard: '+ 자리바꿈' },
      seventh: { easy: '속7·장7', medium: '다섯 종류', hard: '+ 자리바꿈' },
    },
    arpeggio: true,
    hints: {
      ready: "먼저 '문제 듣기'로 기준음과 화음을 끝까지 들어 보세요.",
      input: '들은 구성음을 오선 한 자리에 쌓아 보세요. 다시 누르면 지워져요.',
    },
  },
  rhythm: {
    subtitle: '박자를 듣고, 리듬을 음표 버튼으로 받아 적어 보세요.',
    // Hard doesn't show its measure count, which would give the time signature away.
    levels: {
      basic: { easy: '2마디', medium: '+ 8분·쉼표', hard: '+ 점4분' },
      advanced: { easy: '+ 16분·점8분', medium: '+ 셋잇단·붙임줄', hard: '+ 9/8·12/8' },
    },
    tonic: false,
    arpeggio: false,
    hints: {
      ready: "먼저 '문제 듣기'로 카운트인과 리듬을 끝까지 들어 보세요.",
      input: '들은 리듬을 음표 버튼으로 순서대로 적어 보세요. 다시 들어도 괜찮아요.',
      inputHard: '박자표를 고른 뒤, 들은 리듬을 음표 버튼으로 적어 보세요.',
    },
  },
  score: {
    subtitle: '기준음을 듣고, 내 악보를 오선에 받아 적어 보세요.',
    arpeggio: false,
    hints: {
      ready: "먼저 '문제 듣기'로 기준음과 구간을 끝까지 들어 보세요.",
      input: '들은 음을 오선에 순서대로 찍어 보세요. 리듬은 적지 않아요.',
      empty: "저장된 악보가 없어요. '새 악보'로 만들어 보세요.",
      noNotes: "이 악보에는 음이 없어요. '편집'에서 음을 넣어 보세요.",
      restOnly: '이 구간에는 음이 없어요. 다른 마디를 골라 보세요.',
    },
  },
};

let mode = 'melody';
let chordType = 'triad'; // harmony mode: 'triad' or 'seventh'
let rhythmKind = 'basic'; // rhythm mode: 'basic' (기본) or 'advanced' (심화)

function setHint(key) {
  const hints = MODES[mode].hints;
  const hardHint = mode === 'rhythm' && level === 'hard' ? hints[`${key}Hard`] : undefined;
  $('staff-hint').textContent = hardHint ?? hints[key] ?? HINTS[key];
}

function setMode(next) {
  // Leaving 내 악보 while editing works like 취소: the unsaved changes are dropped. The 보기 screen closes too.
  if (editingId !== undefined) closeEditor();
  closeViewer();
  mode = next;
  const info = MODES[mode];
  for (const tab of document.querySelectorAll('.mode-tab')) {
    tab.setAttribute('aria-selected', String(tab.dataset.mode === mode));
  }
  $('app').dataset.mode = mode;
  $('subtitle').textContent = info.subtitle;
  $('chord-types').hidden = mode !== 'harmony';
  $('rhythm-kinds').hidden = mode !== 'rhythm';
  const score = mode === 'score';
  $('difficulty-title').textContent = score ? '악보' : '난이도';
  $('score-picker').hidden = !score;
  $('btn-settings').hidden = false; // every mode: the instrument (PRD #4-I-1)
  closeSettings();
  closeNewScore();
  renderScoreNotice();
  if (score) renderScorePicker();
  else updateLevelDescriptions();
  $('btn-tonic').hidden = info.tonic === false;
  $('btn-arpeggio').hidden = !info.arpeggio;
  const rhythm = mode === 'rhythm';
  $('staff-area').hidden = rhythm || score;
  $('accidentals').hidden = rhythm || score;
  $('score-accidentals').hidden = !score;
  if (!score) $('score-input').hidden = true;
  $('rhythm-area').hidden = !rhythm;
  $('rhythm-controls').hidden = !rhythm;
  $('note-preview').hidden = rhythm || score;
  $('rhythm-progress').hidden = !rhythm;
  newQuestion();
}

function updateLevelDescriptions() {
  const levels = mode === 'harmony' ? MODES.harmony.levels[chordType]
    : mode === 'rhythm' ? MODES.rhythm.levels[rhythmKind] : MODES[mode].levels;
  for (const option of document.querySelectorAll('.difficulty-option')) {
    option.querySelector('.difficulty-desc').textContent = levels[option.dataset.level];
  }
}

function setChordType(next) {
  chordType = next;
  for (const button of document.querySelectorAll('#chord-types .chord-type')) {
    button.setAttribute('aria-checked', String(button.dataset.type === chordType));
  }
  updateLevelDescriptions();
  newQuestion();
}

// 리듬 [기본 | 심화] (PRD #4-J-1): like the chord types, kept while moving between modes.
function setRhythmKind(next) {
  rhythmKind = next;
  for (const button of document.querySelectorAll('#rhythm-kinds .chord-type')) {
    button.setAttribute('aria-checked', String(button.dataset.kind === rhythmKind));
  }
  updateLevelDescriptions();
  newQuestion();
}

let level = 'easy';
let current = null; // the notes of the current question; rhythm mode: { time, measures }
let chord = null; // harmony mode: the current chord ({ notes, name, ... })
let submitted = false;
let unlockTimer = null;

// 내 악보: scores saved in this browser, and the one being practised.
const scores = Scores.open();
let scoreId = scores.list()[0]?.id ?? null;

// The storage notice comes first; otherwise what the last import changed. (Every score opens in the editor from
// expansion 7, PRD #4-H.)
function renderScoreNotice() {
  const notice = mode === 'score' ? scores.notice() ?? importNotice : null;
  $('score-notice').hidden = !notice;
  $('score-notice').textContent = notice ?? '';
  $('score-notice').title = notice ?? '';
}

function renderScorePicker() {
  const list = scores.list();
  const select = $('score-select');
  select.replaceChildren(...list.map((score) => {
    const option = document.createElement('option');
    option.value = score.id;
    option.textContent = score.title;
    return option;
  }));
  if (scoreId) select.value = scoreId;
  // While the editor is open the score can't be switched under it.
  const editing = editingId !== undefined;
  select.disabled = !list.length || editing;
  $('btn-new-score').disabled = editing;
  updateEditButton();
  for (const chip of $('length-chips').querySelectorAll('button')) chip.disabled = editing;
  $('score-strip').classList.toggle('is-disabled', editing);
}

// The editor. editingId: undefined while closed, null for a new score, otherwise the id of the score being edited.
let editingId;
let deleteTimer = null;
const DELETE_LABEL = '삭제';
const DELETE_CONFIRM = '한 번 더 누르면 삭제';
const DELETE_WAIT = 3000;

// Titles compare without the spaces around and between words or the case of letters (PRD #4-H-1).
const titleKey = (text) => text.trim().replace(/\s+/g, ' ').toLowerCase();
const titleTaken = (title, exceptId = null) => scores.list().some((score) => score.id !== exceptId && titleKey(score.title) === titleKey(title));

// A title no other score has: as it is, or with the smallest free " (n)" after it (an import, PRD #4-G-3).
function freeTitle(title) {
  if (!titleTaken(title)) return title;
  for (let n = 1; ; n++) {
    const suffix = ` (${n})`;
    const candidate = title.trim().slice(0, Notation.MAX_TITLE - suffix.length) + suffix;
    if (!titleTaken(candidate)) return candidate;
  }
}

const scoreEditor = ScoreEditor.create({
  title: $('editor-title'),
  titleNote: $('editor-title-note'),
  titleTaken: (title) => titleTaken(title, editingId),
  view: $('editor-view'),
  status: $('editor-status'),
  undo: $('editor-undo'),
  redo: $('editor-redo'),
  play: $('editor-play'),
  speed: () => Settings.get('speed'),
  tabs: $('editor-tabs'),
  tools: { notes: $('editor-tool-notes'), measure: $('editor-tool-measure'), signs: $('editor-tool-signs') },
  onChange: () => {
    $('editor-save').disabled = !scoreEditor.canSave();
  },
});

function openEditor(id) {
  Sound.stop();
  clearTimeout(unlockTimer);
  editingId = id;
  resetDelete();
  $('editor-heading').textContent = id ? '악보 편집' : '새 악보';
  $('editor-delete').hidden = !id;
  $('editor').hidden = false;
  $('app').dataset.editing = '';
  scoreEditor.open(id ? scores.get(id) : null);
  renderScorePicker();
}

function closeEditor() {
  editingId = undefined;
  scoreEditor.close();
  resetDelete();
  $('editor').hidden = true;
  delete $('app').dataset.editing;
}

// 보기 (PRD #4-K): the chosen score whole, with solfège under the notes (⚙ 이동도/고정도), in place of practice.
let viewingId;
const hasNotes = (score) => Boolean(score?.measures.some((m) => m.notes.some((n) => !n.rest)));

function openViewer(id) {
  const score = scores.get(id);
  if (!hasNotes(score)) return;
  Sound.stop();
  clearTimeout(unlockTimer);
  closeNewScore();
  viewingId = id;
  $('viewer').hidden = false;
  $('app').dataset.viewing = '';
  renderViewer();
}

function closeViewer() {
  if (viewingId === undefined) return;
  viewingId = undefined;
  $('viewer').hidden = true;
  $('viewer-sheet').replaceChildren();
  delete $('app').dataset.viewing;
}

function renderViewer() {
  if (viewingId === undefined) return;
  const score = scores.get(viewingId);
  const style = Settings.get('solfege');
  $('viewer-title').textContent = score.title;
  $('viewer-note').textContent = `계이름: ${style === 'fixed' ? '고정도' : '이동도'} (⚙에서 바꿀 수 있어요)`;
  Sheet.draw($('viewer-sheet'), score, {
    solfege: style, numberFirst: true, label: `악보 보기, ${score.title}. 음표 아래에 계이름`,
  });
}

// Back to practice on the chosen score, with whatever the store has to say (a failed write).
function backToPractice() {
  closeEditor();
  renderScoreNotice();
  renderScorePicker();
  newQuestion();
}

function resetDelete() {
  clearTimeout(deleteTimer);
  $('editor-delete').classList.remove('is-confirm');
  $('editor-delete').textContent = DELETE_LABEL;
}

// [새 악보]: a small box like ⚙'s — 직접 만들기 (the editor) or 파일 불러오기 (MusicXML, PRD #4-G). Outside presses
// and Esc close it.
let importState = null; // the file read last: { title, parts, skipped, doc, fileName }, or null
let importNotice = null; // what the last import changed or left out, shown until another score is chosen
let importRun = 0; // the newest file read wins if two overlap

function openNewScore() {
  closeSettings();
  $('import').hidden = true;
  $('new-score').hidden = false;
  $('btn-new-score').setAttribute('aria-expanded', 'true');
  $('btn-make-score').focus();
}

function closeNewScore(returnFocus = false) {
  if ($('new-score').hidden) return;
  $('new-score').hidden = true;
  $('btn-new-score').setAttribute('aria-expanded', 'false');
  if (returnFocus) $('btn-new-score').focus();
}

function radio(name, value, text, checked) {
  const label = document.createElement('label');
  const input = document.createElement('input');
  Object.assign(input, { type: 'radio', name, value, checked });
  label.append(input, ` ${text}`);
  return label;
}

function chosenImportPart() {
  const input = document.querySelector('#import-parts input:checked');
  return importState && input ? importState.parts[Number(input.value)] : null;
}

// The staves and voices of the chosen part, asked only when there is more than one (PRD #4-G-2).
function renderImportLines() {
  const part = chosenImportPart();
  const box = $('import-lines');
  box.querySelectorAll('label').forEach((label) => label.remove());
  box.hidden = !part || part.lines.length < 2;
  if (box.hidden) return;
  part.lines.forEach((line, i) => box.append(radio('import-line', String(i), `${line.label} (음 ${line.count}개)`, i === 0)));
}

function renderImport(fileName, status, isError = false) {
  $('import').hidden = false;
  $('import-file-name').textContent = fileName;
  $('import-status').textContent = status;
  $('import-status').classList.toggle('is-error', isError);
  const parts = $('import-parts');
  parts.querySelectorAll('label').forEach((label) => label.remove());
  parts.hidden = !importState;
  if (importState) {
    importState.parts.forEach((part, i) => parts.append(radio('import-part', String(i), part.name, i === 0)));
  }
  renderImportLines();
  const skipped = importState?.skipped ?? [];
  $('import-skipped').hidden = !skipped.length;
  $('import-skipped').textContent = skipped.length ? `음높이가 없는 파트 ${skipped.length}개(${skipped.join(', ')})는 뺐어요.` : '';
  $('btn-import').disabled = !importState;
}

function chosenImportLine() {
  const part = chosenImportPart();
  if (!part) return null;
  const input = document.querySelector('#import-lines input:checked');
  return { partIndex: importState.parts.indexOf(part), lineIndex: input ? Number(input.value) : 0 };
}

// Moves the chosen line over unchanged, stores it and practises it from its first measures (PRD #4-G-2, #4-G-3).
// Returns the saved score's id, or null with the reason shown in the box.
function importChosen() {
  const choice = chosenImportLine();
  if (!choice) return null;
  let result;
  try {
    result = MusicXML.convert(importState.doc, choice.partIndex, choice.lineIndex, importState.fileName);
  } catch (caught) {
    const message = caught instanceof MusicXML.ImportError ? caught.message : '악보를 옮기지 못했어요.';
    $('import-status').textContent = message;
    $('import-status').classList.add('is-error');
    return null;
  }
  const title = freeTitle(result.score.title);
  if (title !== result.score.title) result.notices.push(`같은 제목이 있어 '${title}'로 저장했어요`);
  const saved = scores.save({ ...result.score, title, id: undefined });
  if (!saved) {
    $('import-status').textContent = '악보를 옮기지 못했어요.';
    $('import-status').classList.add('is-error');
    return null;
  }
  scoreId = saved.id;
  Settings.setSection(saved.id, null);
  importNotice = result.notices.length ? result.notices.join(' · ') : null;
  closeNewScore();
  backToPractice();
  return saved.id;
}

// Reads a MusicXML file and lists its parts (PRD #4-G-1, #4-G-2). Nothing is stored. Returns the list or null.
async function importFile(file) {
  const run = ++importRun;
  importState = null;
  renderImport(file.name, '읽는 중이에요…');
  let state = null;
  let error = null;
  try {
    const { doc, fileName } = await MusicXML.read(file);
    state = { ...MusicXML.candidates(doc, fileName), doc, fileName };
  } catch (caught) {
    error = caught instanceof MusicXML.ImportError ? caught.message : MusicXML.MESSAGES.notXml;
  }
  if (run !== importRun) return null;
  importState = state;
  if (state) renderImport(file.name, '연습할 선율을 골라 주세요.');
  else renderImport(file.name, error, true);
  return state;
}

$('btn-new-score').addEventListener('click', () => {
  closeViewer();
  if ($('new-score').hidden) openNewScore();
  else closeNewScore();
});
$('btn-make-score').addEventListener('click', () => {
  closeNewScore();
  openEditor(null);
});
$('btn-import-file').addEventListener('click', () => $('import-file').click());
$('btn-import-other').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (file) importFile(file);
});
$('import-parts').addEventListener('change', renderImportLines);
$('btn-import').addEventListener('click', importChosen);
// Every score opens in the editor (expansion 7); deleting is the editor's [삭제].
function updateEditButton() {
  const button = $('btn-edit-score');
  button.dataset.action = 'edit';
  button.disabled = !scoreId || editingId !== undefined;
  $('btn-view-score').disabled = editingId !== undefined || !hasNotes(scoreId && scores.get(scoreId));
}

$('btn-edit-score').addEventListener('click', () => {
  closeViewer();
  if (scoreId) openEditor(scoreId);
});
$('btn-view-score').addEventListener('click', () => {
  if (viewingId === scoreId) closeViewer();
  else if (scoreId) openViewer(scoreId);
});
$('viewer-close').addEventListener('click', closeViewer);
$('editor-cancel').addEventListener('click', backToPractice);
$('editor-save').addEventListener('click', () => {
  if (!scoreEditor.canSave()) return;
  const saved = scores.save({ ...scoreEditor.result(), id: editingId ?? undefined });
  if (!saved) return;
  scoreId = saved.id;
  // A saved score is split again from its first measure (its old section may no longer exist).
  Settings.setSection(saved.id, null);
  backToPractice();
});
// Deleting takes a second press (no browser dialog). Any other press in the editor, or a few seconds, undoes the first.
$('editor-delete').addEventListener('click', () => {
  const button = $('editor-delete');
  if (!button.classList.contains('is-confirm')) {
    button.classList.add('is-confirm');
    button.textContent = DELETE_CONFIRM;
    deleteTimer = setTimeout(resetDelete, DELETE_WAIT);
    return;
  }
  scores.remove(editingId);
  if (scoreId === editingId) {
    scoreId = scores.list()[0]?.id ?? null;
    importNotice = null;
  }
  backToPractice();
});
$('editor').addEventListener('click', (event) => {
  if (!event.target.closest('#editor-delete')) resetDelete();
}, true);

// 내 악보 practice: one section of the chosen score at a time. The user picks a length (1, 2, 4 measures or 직접)
// and presses a measure on the strip; 다음 문제 moves on by the same length. Each score remembers its section.
let scoreReason = null; // why there's nothing to practise (a hint key), or null
let section = null; // the section being practised: { start, end, notes (v1, with rests), label, time }
let pendingStart = null; // 직접: the first measure pressed, waiting for the second

function chosenScore() {
  return scoreId ? scores.get(scoreId) : null;
}

// The chosen section of the score: { start, end, length }, from memory or the default (first two measures).
function selection(score = chosenScore()) {
  if (!score) return null;
  const last = score.measures.length - 1;
  const saved = Settings.getSection(score.id);
  const length = saved?.length ?? 2;
  const start = Math.min(Math.max(saved?.start ?? 0, 0), last);
  const end = length === 'custom' ? Math.min(Math.max(saved.end ?? start, start), last) : Math.min(start + length - 1, last);
  return { start, end, length };
}

function select(start, length, end) {
  Settings.setSection(scoreId, { start, length, end });
}

// The line written down in a chord (⚙, per score): 'top' or 'bottom'.
function chosenLine(score = chosenScore()) {
  return score ? Settings.getLine(score.id) : 'top';
}

// The pitches to write down in measures start..end: each note's pitch in the chosen line of its chord, once per
// attack (a pitch tied over from before belongs to where it started).
function linePitches(score, start, end, line = chosenLine(score)) {
  return score.measures.slice(start, end + 1).flatMap((m) => m.notes)
    .map((note) => Notation.lineOf(note, line))
    .filter((entry) => entry && !Notation.tieStops(entry.tie))
    .map((entry) => ({ ...entry.pitch }));
}

// Sounding notes in measures start..end (a note tied over from before belongs to the earlier section).
function soundingCount(score, start, end) {
  return linePitches(score, start, end).length;
}

// The next section of the same length after this one, skipping rest-only ones; after the last comes the first.
function nextSelection() {
  const score = chosenScore();
  const sel = selection(score);
  if (!score || !sel) return;
  const size = sel.end - sel.start + 1;
  const count = score.measures.length;
  let start = sel.end + 1;
  for (let tries = 0; tries < count; tries++) {
    if (start >= count) start = 0;
    const end = Math.min(start + size - 1, count - 1);
    if (soundingCount(score, start, end)) {
      select(start, sel.length, sel.length === 'custom' ? end : undefined);
      return;
    }
    start = end + 1;
  }
}

function measureLabel(score, start, end) {
  const numbers = Notation.resolve(score).map((m) => m.number);
  // An implicit measure shares the number before it, so a section of it and its neighbour can show one number.
  return numbers[end] > numbers[start] ? `${numbers[start]}~${numbers[end]}마디` : `${numbers[start]}마디`;
}

// The section to practise, if the score can be practised (until TODO 33: within the expansion 4 range) and the
// section has notes (until TODO 32: at most eight). Otherwise null and the reason for the hint.
function practiceSection() {
  const score = chosenScore();
  const sel = selection(score);
  if (!score || !sel) return { section: null, reason: scoreId ? 'noNotes' : 'empty' };
  const measures = Notation.resolve(score);
  // The pitches to write down: every sounding note once (a tied note once, where it starts), in a chord the line
  // chosen in ⚙. The input staff's range comes from that line over the whole score.
  const line = chosenLine(score);
  const answer = linePitches(score, sel.start, sel.end, line);
  if (!answer.length) return { section: null, reason: 'restOnly' };
  const all = score.measures.flatMap((m) => m.notes).filter((note) => !note.rest).map((note) => Notation.lineOf(note, line).pitch);
  const byPitch = (a, b) => Notation.midi(a) - Notation.midi(b);
  const sorted = [...all].sort(byPitch);
  return {
    section: {
      start: sel.start, end: sel.end, answer, label: measureLabel(score, sel.start, sel.end),
      clef: measures[sel.start].clef, key: measures[sel.start].key, range: [sorted[0], sorted[sorted.length - 1]],
      sheet: Notation.excerpt(score, sel.start, sel.end),
    },
  };
}

// The length chips and the strip, with the chosen measures highlighted and scrolled into view.
function renderStrip() {
  const score = chosenScore();
  const sel = selection(score);
  for (const chip of $('length-chips').querySelectorAll('[data-length]')) {
    const value = chip.dataset.length === 'custom' ? 'custom' : Number(chip.dataset.length);
    chip.setAttribute('aria-checked', String(Boolean(sel) && value === sel.length));
  }
  $('strip-hint').textContent = pendingStart !== null ? '끝 마디를 누르세요' : '';
  const box = $('score-strip');
  if (!score) {
    box.replaceChildren();
    return;
  }
  const scroll = box.scrollLeft;
  const draw = () => Sheet.strip(box, score, {
    height: box.clientHeight || 80, selected: sel, pending: pendingStart ?? undefined,
    label: `악보 띠, ${score.title}. 마디를 눌러 연습할 구간을 고르세요. 지금 ${measureLabel(score, sel.start, sel.end)}`,
  });
  let svg = draw();
  // A scrollbar takes some height once the strip is wider than the box: fit the drawing into what is left.
  if (box.clientHeight && Math.abs(svg.getBoundingClientRect().height - box.clientHeight) > 0.5) svg = draw();
  box.scrollLeft = scroll;
  const marks = [...svg.querySelectorAll('.sv-current, .sv-pending')];
  if (marks.length) {
    const boxRect = box.getBoundingClientRect();
    const left = Math.min(...marks.map((m) => m.getBoundingClientRect().left)) - boxRect.left;
    const right = Math.max(...marks.map((m) => m.getBoundingClientRect().right)) - boxRect.left;
    if (left < 0 || right > box.clientWidth) box.scrollLeft += left - 12;
  }
}

$('length-chips').addEventListener('click', (event) => {
  const chip = event.target.closest('[data-length]');
  if (!chip || chip.disabled || !scoreId) return;
  const sel = selection();
  pendingStart = null;
  if (chip.dataset.length === 'custom') select(sel.start, 'custom', sel.end);
  else select(sel.start, Number(chip.dataset.length));
  newQuestion();
});

// A press on a measure: with a length chosen it starts the section there; with 직접 the first press marks the start
// and the second the end (either way round).
$('score-strip').addEventListener('click', (event) => {
  const hit = event.target.closest('.sv-hit');
  if (!hit || editingId !== undefined || !scoreId) return;
  const index = Number(hit.dataset.measure);
  const sel = selection();
  if (sel.length !== 'custom') {
    select(index, sel.length);
  } else if (pendingStart === null) {
    pendingStart = index;
    renderStrip();
    return;
  } else {
    select(Math.min(pendingStart, index), 'custom', Math.max(pendingStart, index));
    pendingStart = null;
  }
  newQuestion();
});

const staff = Staff.create({
  container: $('staff-area'),
  preview: $('note-preview'),
  sharpButton: $('btn-sharp'),
  flatButton: $('btn-flat'),
  undoButton: $('btn-undo'),
  clearButton: $('btn-clear'),
  onChange: updateSubmit,
});

const scoreInput = ScoreInput.create({
  container: $('score-input'),
  sharpButton: $('score-sharp'),
  flatButton: $('score-flat'),
  naturalButton: $('score-natural'),
  undoButton: $('btn-undo'),
  clearButton: $('btn-clear'),
  onChange: updateSubmit,
});
scoreInput.setStyle(Settings.get('solfege'));

const rhythm = Rhythm.create({
  container: $('rhythm-area'),
  buttons: $('note-buttons'),
  timeButtons: $('time-signatures'),
  progress: $('rhythm-progress'),
  undoButton: $('btn-undo'),
  clearButton: $('btn-clear'),
  onChange: updateSubmit,
});

function updateSubmit() {
  if (!current || submitted) {
    $('btn-submit').disabled = true;
    return;
  }
  const entered = mode === 'score' ? scoreInput.getNotes() : staff.getNotes();
  $('btn-submit').disabled = mode === 'rhythm' ? !rhythm.canSubmit() : entered.length !== current.length;
}

// A random item from the pool, never the same as the previous question.
function pick(pool, previous) {
  const candidates = pool.filter((item) => item !== previous);
  if (!candidates.length) return pool[0];
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function newQuestion() {
  Sound.stop();
  clearTimeout(unlockTimer);
  submitted = false;
  rhythm.setLocked(true);
  staff.setLocked(true);
  $('btn-replay').disabled = true;
  $('btn-arpeggio').disabled = true;
  renderResult(null);

  if (mode === 'harmony') {
    chord = pick(CHORDS[chordType][level], chord);
    current = chord.notes;
    staff.reset(current.length, { chord: true, topStep: HARMONY_TOP_STEP });
  } else if (mode === 'rhythm') {
    const advanced = rhythmKind === 'advanced';
    current = pick((advanced ? RHYTHMS_ADVANCED : RHYTHMS)[level], current);
    staff.reset(0);
    // Hard: the time signature and measure count are part of the answer, so neither is shown.
    const hard = level === 'hard';
    rhythm.reset({
      types: Rhythm.LEVEL_TYPES[level],
      advanced,
      toggles: Rhythm.LEVEL_TOGGLES[level],
      time: hard ? null : current.time,
      measures: hard ? null : current.measures.length,
      times: advanced ? Rhythm.ADVANCED_TIME_SIGNATURES : Rhythm.TIME_SIGNATURES,
    });
  } else if (mode === 'score') {
    const practice = practiceSection();
    section = practice.section;
    scoreReason = practice.reason ?? null;
    // Only the pitches are written down; rests and lengths are heard, not entered.
    current = section ? section.answer : null;
    staff.reset(0);
    scoreInput.setLocked(true);
    if (section) scoreInput.reset({ clef: section.clef, key: section.key, range: section.range, capacity: current.length });
    $('score-input').hidden = !section;
    renderStrip();
    renderScoreNotice();
    updateEditButton();
  } else {
    current = pick(PATTERNS[level], current);
    staff.reset(current.length);
  }
  $('btn-question').disabled = !current;
  $('btn-tonic').textContent = `기준음(${mode === 'score' ? scoreTonic().label : '도'}) 듣기`;
  setHint(current ? 'ready' : mode === 'score' ? scoreReason : 'empty');
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

// 내 악보 names its pitches in the chosen solfège style, from the section's key.
function scoreLabel(pitch) {
  return ScoreInput.label(pitch, section.key, Settings.get('solfege'));
}

// The answer section is drawn at this many px per unit (the score view's size on a phone).
const ANSWER_SCALE = 0.85;

function chipsOf(notes, marks, name = Staff.noteLabel) {
  const chips = element('div', 'note-preview answer-chips');
  chips.append(...notes.map((note, i) => {
    const mark = marks?.[i];
    const markClass = mark === true ? 'is-correct' : mark === 'missed' ? 'is-missed' : '';
    return element('span', `note-chip ${markClass}`.trim(), name(note));
  }));
  return chips;
}

// result: null (nothing submitted), or { marks } for melody, or { marks, answerMarks, missed } for harmony,
// or { marks (per answer measure), extra (measures written beyond the answer), timeCorrect (hard only) } for rhythm.
function renderResult(result) {
  const area = $('result-area');
  if (!result) {
    area.replaceChildren(element('p', 'placeholder', '제출하면 채점 결과가 여기에 표시됩니다.'));
    return;
  }

  const { marks } = result;
  const correct = marks.filter(Boolean).length;
  const parts = [];
  const answerStaff = element('div', 'staff-area answer-staff');

  if (mode === 'rhythm') {
    parts.push(element('p', 'score', correct === marks.length && !result.extra
      ? `${marks.length}마디 모두 정답이에요!`
      : `${marks.length}마디 중 ${correct}마디 정답`));
    if (result.extra) {
      parts.push(element('p', 'extra-measures', `정답은 ${marks.length}마디예요. 넘치게 적은 ${result.extra}마디는 오답이에요.`));
    }
    if (result.timeCorrect !== undefined) {
      const answerTime = Rhythm.timeText(current.time);
      parts.push(element('p', `time-result ${result.timeCorrect ? 'is-correct' : 'is-wrong'}`, result.timeCorrect
        ? `박자표 정답 (${answerTime})`
        : `박자표 오답 (정답 ${answerTime})`));
    }
    parts.push(element('h3', 'answer-title', '정답 리듬'));
    answerStaff.classList.add('rhythm-area');
    // Only the measures the user got right are coloured; the rest of the answer stays neutral.
    Rhythm.draw(answerStaff, current, `정답 리듬 보표, ${Rhythm.timeText(current.time)}박자 ${marks.length}마디`, {
      marks: marks.map((mark) => mark || undefined),
    });
    parts.push(answerStaff);
  } else if (mode === 'harmony') {
    parts.push(element('p', 'score', correct === marks.length
      ? `구성음 ${marks.length}개 모두 정답이에요!`
      : `구성음 ${marks.length}개 중 ${correct}개 정답`));
    if (result.missed.length) {
      parts.push(element('p', 'missed-notes', `빠뜨린 음: ${result.missed.map(Staff.noteLabel).join(', ')}`));
    }
    parts.push(element('h3', 'answer-title', '정답 화음'));
    parts.push(element('p', 'chord-name', chord.name));
    Staff.draw(answerStaff, current, `정답 화음 오선. ${chord.name}`, { chord: true, marks: result.answerMarks });
    parts.push(answerStaff, chipsOf(current, result.answerMarks));
  } else {
    parts.push(element('p', 'score', correct === marks.length
      ? `${marks.length}음 모두 정답이에요!`
      : `${marks.length}음 중 ${correct}음 정답`));
    if (mode === 'score') {
      // The section as written (clef, key and time where it starts, its rhythm and measure numbers): the notes
      // were heard in it. One row that scrolls sideways when long, like the solfège under it.
      parts.push(element('h3', 'answer-title', `정답 구간 (${section.label})`));
      answerStaff.classList.add('answer-sheet');
      parts.push(answerStaff);
      const chips = chipsOf(current, marks.map((mark) => mark || undefined), scoreLabel);
      chips.classList.add('is-scroll');
      parts.push(chips);
      area.replaceChildren(...parts, nextButton());
      Sheet.strip(answerStaff, section.sheet, {
        scale: ANSWER_SCALE, hit: false,
        label: `정답 구간 악보, ${section.label}. ${current.map(scoreLabel).join(' ')}`,
      });
      return;
    } else {
      parts.push(element('h3', 'answer-title', '정답 멜로디'));
      Staff.draw(answerStaff, current, '정답 멜로디 오선');
      parts.push(answerStaff, chipsOf(current));
    }
  }

  area.replaceChildren(...parts, nextButton());
}

function nextButton() {
  const next = element('button', 'btn btn-primary', '다음 문제');
  next.type = 'button';
  next.id = 'btn-next';
  next.addEventListener('click', () => {
    // 내 악보 goes through the score section by section, back to the first after the last.
    if (mode === 'score') nextSelection();
    newQuestion();
  });
  return next;
}

// Melody: note by note in order. Enharmonic spellings count as the same pitch.
// 내 악보: note by note in order, by sounding pitch (enharmonic spellings count as the same).
function gradeScore(input) {
  return { marks: current.map((pitch, i) => Boolean(input[i]) && Notation.midi(pitch) === Notation.midi(input[i])) };
}

function gradeMelody(input) {
  return { marks: current.map((note, i) => Staff.noteToMidi(note) === Staff.noteToMidi(input[i])) };
}

// Harmony: order doesn't matter, but the octave does. Enharmonic spellings count as the same pitch.
function gradeHarmony(input) {
  const answer = new Set(midis(current));
  const entered = new Set(midis(input));
  const answerMarks = current.map((note) => entered.has(Staff.noteToMidi(note)) || 'missed');
  return {
    marks: input.map((note) => answer.has(Staff.noteToMidi(note))),
    answerMarks,
    missed: current.filter((note, i) => answerMarks[i] === 'missed'),
  };
}

// Rhythm: measure by measure; a measure is right only if its notes and rests match in length and order.
// Hard: a wrong time signature makes every measure wrong. The score is out of the answer's measure count;
// measures the user wrote beyond it are marked wrong on their staff.
function gradeRhythm(input) {
  const hard = level === 'hard';
  const timeCorrect = Rhythm.sameTime(input.time, current.time);
  // By sound (PRD #4-J): the same sound written another way is right; the time signature still has to match.
  const same = (a, b) => Boolean(a) && Rhythm.soundKey(a) === Rhythm.soundKey(b);
  const marks = current.measures.map((measure, i) => timeCorrect && same(input.measures[i], measure));
  return {
    marks,
    inputMarks: input.measures.map((_, i) => marks[i] ?? false),
    extra: Math.max(0, input.measures.length - marks.length),
    timeCorrect: hard ? timeCorrect : undefined,
  };
}

// 내 악보: the reference note is the tonic of the section's key ("도" in major, "라" in minor).
function scoreTonic() {
  const score = scoreId && scores.get(scoreId);
  const range = playRange();
  return score && range ? Playback.tonicOf(score, range.start, range.end, chosenLine(score)) : { midi: TONIC, label: '도' };
}

$('btn-tonic').addEventListener('click', () => Sound.play([mode === 'score' ? scoreTonic().midi : TONIC]));

function midis(notes) {
  return notes.map(Staff.noteToMidi);
}

// Chord notes low to high, the order the arpeggio plays them in.
function chordMidis() {
  return midis(current).sort((a, b) => a - b);
}

// Rhythm: count-in, then the rhythm. Hard's count-in doesn't give the time signature away.
// Returns the playback length in seconds.
function playRhythm() {
  const hard = level === 'hard';
  const beat = Rhythm.beatOf(current.time, { advanced: rhythmKind === 'advanced', hard });
  const { events, total } = Rhythm.schedule(current, { fixedCountIn: !hard, beat });
  return Sound.playEvents(events, total);
}

// The measures 내 악보 plays: the chosen section.
function playRange() {
  const sel = selection();
  return sel && soundingCount(chosenScore(), sel.start, sel.end) ? { start: sel.start, end: sel.end } : null;
}

// 내 악보: the section as written (key, rhythm, tempo) at the chosen speed, after the tonic and a pause when
// `tonic` is set. Returns the playback length in seconds.
function playSection(tonic) {
  const range = playRange();
  const { events, total } = Playback.schedule(scores.get(scoreId), { ...range, tonic, speed: Settings.get('speed'), line: chosenLine() });
  return Sound.playEvents(events, total);
}

// "문제 듣기": tonic, a pause, then the question (melody/harmony), or count-in and rhythm.
function playQuestion() {
  if (mode === 'rhythm') return playRhythm();
  if (mode === 'score') return playSection(true);
  const question = mode === 'harmony' ? [chordMidis()] : midis(current);
  return Sound.play([TONIC, null, ...question]);
}

$('btn-question').addEventListener('click', () => {
  const seconds = playQuestion();
  if (!$('btn-replay').disabled) return;
  setHint('listening');
  clearTimeout(unlockTimer);
  unlockTimer = setTimeout(() => {
    $('btn-replay').disabled = false;
    $('btn-arpeggio').disabled = false;
    setHint('input');
    if (mode === 'rhythm') rhythm.setLocked(false);
    else if (mode === 'score') scoreInput.setLocked(false);
    else staff.setLocked(false);
  }, seconds * 1000);
});

// "다시 듣기": the question again without the tonic; rhythm keeps its count-in.
$('btn-replay').addEventListener('click', () => {
  if (mode === 'rhythm') playRhythm();
  else if (mode === 'score') playSection(false);
  else Sound.play(mode === 'harmony' ? [chordMidis()] : midis(current));
});
$('btn-arpeggio').addEventListener('click', () => Sound.play(chordMidis()));

$('btn-submit').addEventListener('click', () => {
  if (mode === 'rhythm') {
    const result = gradeRhythm(rhythm.getInput());
    submitted = true;
    setHint('submitted');
    rhythm.setLocked(true);
    rhythm.setMarks(result.inputMarks);
    renderResult(result);
    updateSubmit();
    return;
  }
  if (mode === 'score') {
    const result = gradeScore(scoreInput.getNotes());
    submitted = true;
    setHint('submitted');
    scoreInput.setLocked(true);
    scoreInput.setMarks(result.marks);
    renderResult(result);
    updateSubmit();
    return;
  }
  const input = staff.getNotes();
  const result = mode === 'harmony' ? gradeHarmony(input) : gradeMelody(input);
  submitted = true;
  setHint('submitted');
  staff.setLocked(true);
  staff.setMarks(result.marks);
  renderResult(result);
  updateSubmit();
});

for (const option of document.querySelectorAll('.difficulty-option')) {
  option.addEventListener('click', () => {
    level = option.dataset.level;
    for (const other of document.querySelectorAll('.difficulty-option')) {
      other.setAttribute('aria-checked', String(other === option));
    }
    newQuestion();
  });
}

for (const button of document.querySelectorAll('#rhythm-kinds .chord-type')) {
  button.addEventListener('click', () => {
    if (button.dataset.kind !== rhythmKind) setRhythmKind(button.dataset.kind);
  });
}
for (const button of document.querySelectorAll('#chord-types .chord-type')) {
  button.addEventListener('click', () => {
    if (button.dataset.type !== chordType) setChordType(button.dataset.type);
  });
}

// A vertical mouse wheel scrolls the strip sideways when it overflows.
$('score-strip').addEventListener('wheel', (event) => {
  const row = $('score-strip');
  if (row.scrollWidth <= row.clientWidth || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  row.scrollLeft += event.deltaY;
  event.preventDefault();
}, { passive: false });

$('score-select').addEventListener('change', (event) => {
  closeViewer();
  scoreId = event.target.value;
  importNotice = null;
  renderScoreNotice();
  pendingStart = null;
  newQuestion();
});

// ⚙ 설정: a small box under the button, not a browser dialog. Outside presses and Esc close it. The instrument is
// for every mode; speed, solfège and the chord line are 내 악보's.

// What the instrument row says: its file or recordings on the way, couldn't be read, or how out-of-range notes sound.
function instrumentStatusText(name = Settings.get('instrument')) {
  const status = Sampler.status(name);
  if (status === 'fetching' || status === 'loading') return '녹음을 불러오는 중이에요… 그동안은 합성음으로 들려줘요.';
  if (status === 'failed') return '녹음을 불러오지 못했어요. 합성음으로 들려줘요.';
  return '악기 음역 밖의 음은 녹음을 늘려서 내요.';
}

function renderInstrumentStatus() {
  $('settings-instrument-status').textContent = instrumentStatusText();
}

// Reads and decodes an instrument, then calls done(ready) (waiting on decoding with short timers).
function readyInstrument(name, done) {
  setTimeout(renderInstrumentStatus); // its file is on the way now (unless it was read before)
  Sampler.load(name, (ok) => {
    renderInstrumentStatus();
    if (!ok) {
      done(false);
      return;
    }
    Sampler.prepare(Sound.context(), name);
    renderInstrumentStatus();
    let tries = 0;
    const check = () => {
      const status = Sampler.status(name);
      if (status === 'ready' || status === 'failed' || ++tries > 400) {
        renderInstrumentStatus();
        done(status === 'ready');
        return;
      }
      setTimeout(check, 25);
    };
    check();
  });
}

// A short scale up from middle C, to hear the instrument just chosen.
function previewInstrument() {
  const steps = [60, 62, 64, 65, 67, 69, 71, 72];
  Sound.playEvents(steps.map((midi, i) => ({ start: i * 0.28, length: i === steps.length - 1 ? 0.8 : 0.3, midi, peak: Playback.NOTE_PEAK, sustain: true })));
}

function chooseInstrument(name) {
  Settings.set('instrument', name);
  Sampler.setCurrent(name);
  readyInstrument(name, () => {
    if (Settings.get('instrument') === name) previewInstrument(); // the synthesized tone if it couldn't be read
  });
  renderInstrumentStatus();
}

function openSettings() {
  closeNewScore();
  const score = mode === 'score';
  for (const input of document.querySelectorAll('#settings input[name="instrument"]')) {
    input.checked = input.value === Settings.get('instrument');
  }
  renderInstrumentStatus();
  $('settings-speed').hidden = !score;
  $('settings-solfege').hidden = !score;
  for (const input of document.querySelectorAll('#settings input[name="speed"]')) {
    input.checked = Number(input.value) === Settings.get('speed');
  }
  for (const input of document.querySelectorAll('#settings input[name="solfege"]')) {
    input.checked = input.value === Settings.get('solfege');
  }
  // Only a score with chords has a line to choose.
  const chosen = score ? chosenScore() : null;
  $('settings-line').hidden = !chosen || !Notation.hasChords(chosen);
  for (const input of document.querySelectorAll('#settings input[name="line"]')) {
    input.checked = input.value === chosenLine(chosen);
  }
  $('settings').hidden = false;
  $('btn-settings').setAttribute('aria-expanded', 'true');
  document.querySelector('#settings input:checked')?.focus();
}

function closeSettings(returnFocus = false) {
  if ($('settings').hidden) return;
  $('settings').hidden = true;
  $('btn-settings').setAttribute('aria-expanded', 'false');
  if (returnFocus) $('btn-settings').focus();
}

$('btn-settings').addEventListener('click', () => {
  if ($('settings').hidden) openSettings();
  else closeSettings();
});
$('settings').addEventListener('change', (event) => {
  if (event.target.name === 'instrument') chooseInstrument(event.target.value);
  if (event.target.name === 'speed') Settings.set('speed', Number(event.target.value));
  if (event.target.name === 'solfege') {
    Settings.set('solfege', event.target.value);
    scoreInput.setStyle(event.target.value);
    renderViewer();
  }
  // Another line is another answer: the section starts over.
  if (event.target.name === 'line' && scoreId) {
    Settings.setLine(scoreId, event.target.value);
    newQuestion();
  }
});
document.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('#settings, #btn-settings')) closeSettings();
  if (!event.target.closest('#new-score, #btn-new-score')) closeNewScore();
});
document.addEventListener('keydown', (event) => {
  if (editingId !== undefined && scoreEditor.key(event)) return;
  if (event.key === 'Escape') {
    closeSettings(true);
    closeNewScore(true);
  }
});

for (const tab of document.querySelectorAll('.mode-tab')) {
  tab.addEventListener('click', () => {
    if (tab.dataset.mode !== mode) setMode(tab.dataset.mode);
  });
}

// The instrument chosen last time: its recordings are read now (they decode with the first sound).
Sampler.setCurrent(Settings.get('instrument'));
Sampler.load(Settings.get('instrument'));

newQuestion();
