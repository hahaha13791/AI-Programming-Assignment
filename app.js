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
    levels: { easy: '2마디', medium: '+ 8분·쉼표', hard: '+ 점4분' },
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
    },
  },
};

let mode = 'melody';
let chordType = 'triad'; // harmony mode: 'triad' or 'seventh'

function setHint(key) {
  const hints = MODES[mode].hints;
  const hardHint = mode === 'rhythm' && level === 'hard' ? hints[`${key}Hard`] : undefined;
  $('staff-hint').textContent = hardHint ?? hints[key] ?? HINTS[key];
}

function setMode(next) {
  // Leaving 내 악보 while editing works like 취소: the unsaved changes are dropped.
  if (editingId !== undefined) closeEditor();
  mode = next;
  const info = MODES[mode];
  for (const tab of document.querySelectorAll('.mode-tab')) {
    tab.setAttribute('aria-selected', String(tab.dataset.mode === mode));
  }
  $('app').dataset.mode = mode;
  $('subtitle').textContent = info.subtitle;
  $('chord-types').hidden = mode !== 'harmony';
  const score = mode === 'score';
  $('difficulty-title').textContent = score ? '악보' : '난이도';
  $('score-picker').hidden = !score;
  renderScoreNotice();
  if (score) renderScorePicker();
  else updateLevelDescriptions();
  $('btn-tonic').hidden = info.tonic === false;
  $('btn-arpeggio').hidden = !info.arpeggio;
  const rhythm = mode === 'rhythm';
  $('staff-area').hidden = rhythm;
  $('accidentals').hidden = rhythm;
  $('rhythm-area').hidden = !rhythm;
  $('rhythm-controls').hidden = !rhythm;
  $('note-preview').hidden = rhythm;
  $('rhythm-progress').hidden = !rhythm;
  newQuestion();
}

function updateLevelDescriptions() {
  const levels = mode === 'harmony' ? MODES.harmony.levels[chordType] : MODES[mode].levels;
  for (const option of document.querySelectorAll('.difficulty-option')) {
    option.querySelector('.difficulty-desc').textContent = levels[option.dataset.level];
  }
}

function setChordType(next) {
  chordType = next;
  for (const button of document.querySelectorAll('.chord-type')) {
    button.setAttribute('aria-checked', String(button.dataset.type === chordType));
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

function renderScoreNotice() {
  const notice = mode === 'score' ? scores.notice() : null;
  $('score-notice').hidden = !notice;
  $('score-notice').textContent = notice ?? '';
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
  $('btn-edit-score').disabled = !scoreId || editing;
  for (const chip of $('section-chips').children) chip.disabled = editing;
}

// The editor. editingId: undefined while closed, null for a new score, otherwise the id of the score being edited.
let editingId;
let deleteTimer = null;
const DELETE_LABEL = '삭제';
const DELETE_CONFIRM = '한 번 더 누르면 삭제';
const DELETE_WAIT = 3000;

const editor = Score.createEditor({
  titleInput: $('editor-title'),
  timeButtons: $('editor-times'),
  lengthButtons: $('editor-lengths'),
  pad: $('editor-pad'),
  sharpButton: $('editor-sharp'),
  flatButton: $('editor-flat'),
  undoButton: $('editor-undo'),
  clearButton: $('editor-clear'),
  progress: $('editor-progress'),
  view: $('editor-view'),
  maxMeasures: Scores.MAX_MEASURES,
  onChange: () => {
    $('editor-save').disabled = !editor.canSave();
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
  editor.open(id ? scores.get(id) : null);
  renderScorePicker();
}

function closeEditor() {
  editingId = undefined;
  resetDelete();
  $('editor').hidden = true;
  delete $('app').dataset.editing;
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

$('btn-new-score').addEventListener('click', () => openEditor(null));
$('btn-edit-score').addEventListener('click', () => {
  if (scoreId) openEditor(scoreId);
});
$('editor-cancel').addEventListener('click', backToPractice);
$('editor-save').addEventListener('click', () => {
  if (!editor.canSave()) return;
  const saved = scores.save({ ...editor.getScore(), id: editingId ?? undefined });
  if (!saved) return;
  scoreId = saved.id;
  sectionIndex = 0;
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
    sectionIndex = 0;
  }
  backToPractice();
});
$('editor').addEventListener('click', (event) => {
  if (!event.target.closest('#editor-delete')) resetDelete();
}, true);

// 내 악보 practice: the chosen score is split into sections, practised one at a time.
let sectionIndex = 0;
let section = null; // { start, end, notes (with rests), label }

function scoreSections() {
  const score = scoreId && scores.get(scoreId);
  return score ? Score.sections(score) : [];
}

// One chip per section; the chosen one is checked and scrolled into view (the row scrolls sideways).
function renderSectionChips(list) {
  const row = $('section-chips');
  const chips = list.map((item, i) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'section-chip';
    chip.setAttribute('role', 'radio');
    chip.setAttribute('aria-checked', String(i === sectionIndex));
    chip.textContent = item.label;
    chip.disabled = editingId !== undefined;
    chip.addEventListener('click', () => {
      sectionIndex = i;
      newQuestion();
    });
    return chip;
  });
  row.replaceChildren(...chips);
  const chosen = chips[sectionIndex];
  if (chosen && (chosen.offsetLeft < row.scrollLeft || chosen.offsetLeft + chosen.offsetWidth > row.scrollLeft + row.clientWidth)) {
    row.scrollLeft = chosen.offsetLeft - 8;
  }
}

const staff = Staff.create({
  container: $('staff-area'),
  preview: $('note-preview'),
  sharpButton: $('btn-sharp'),
  flatButton: $('btn-flat'),
  undoButton: $('btn-undo'),
  clearButton: $('btn-clear'),
  onChange: updateSubmit,
});

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
  $('btn-submit').disabled = mode === 'rhythm' ? !rhythm.canSubmit() : staff.getNotes().length !== current.length;
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
    current = pick(RHYTHMS[level], current);
    staff.reset(0);
    // Hard: the time signature and measure count are part of the answer, so neither is shown.
    const hard = level === 'hard';
    rhythm.reset({
      types: Rhythm.LEVEL_TYPES[level],
      time: hard ? null : current.time[0],
      measures: hard ? null : current.measures.length,
    });
  } else if (mode === 'score') {
    const list = scoreSections();
    if (sectionIndex >= list.length) sectionIndex = 0;
    section = list[sectionIndex] ?? null;
    // Only the pitches are written down; rests and lengths are heard, not entered.
    current = section ? section.notes.filter((note) => !Rhythm.TYPES[note.type].rest)
      .map(({ step, accidental }) => ({ step, accidental })) : null;
    staff.reset(current ? current.length : 0, { topStep: HARMONY_TOP_STEP });
    renderSectionChips(list);
  } else {
    current = pick(PATTERNS[level], current);
    staff.reset(current.length);
  }
  $('btn-question').disabled = !current;
  setHint(current ? 'ready' : scoreId ? 'noNotes' : 'empty');
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

function chipsOf(notes, marks) {
  const chips = element('div', 'note-preview answer-chips');
  chips.append(...notes.map((note, i) => {
    const mark = marks?.[i];
    const markClass = mark === true ? 'is-correct' : mark === 'missed' ? 'is-missed' : '';
    return element('span', `note-chip ${markClass}`.trim(), Staff.noteLabel(note));
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
      const answerTime = `${current.time[0]}/4`;
      parts.push(element('p', `time-result ${result.timeCorrect ? 'is-correct' : 'is-wrong'}`, result.timeCorrect
        ? `박자표 정답 (${answerTime})`
        : `박자표 오답 (정답 ${answerTime})`));
    }
    parts.push(element('h3', 'answer-title', '정답 리듬'));
    answerStaff.classList.add('rhythm-area');
    // Only the measures the user got right are coloured; the rest of the answer stays neutral.
    Rhythm.draw(answerStaff, current, `정답 리듬 보표, ${current.time[0]}/4박자 ${marks.length}마디`, {
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
    const what = mode === 'score' ? '구간' : '멜로디';
    parts.push(element('h3', 'answer-title', `정답 ${what}`));
    Staff.draw(answerStaff, current, `정답 ${what} 오선`);
    parts.push(answerStaff, chipsOf(current));
  }

  area.replaceChildren(...parts, nextButton());
}

function nextButton() {
  const next = element('button', 'btn btn-primary', '다음 문제');
  next.type = 'button';
  next.id = 'btn-next';
  next.addEventListener('click', newQuestion);
  return next;
}

// Melody: note by note in order. Enharmonic spellings count as the same pitch.
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
  const timeCorrect = input.time === current.time[0];
  const same = (a = [], b) => a.length === b.length && a.every((type, i) => type === b[i]);
  const marks = current.measures.map((measure, i) => timeCorrect && same(input.measures[i], measure));
  return {
    marks,
    inputMarks: input.measures.map((_, i) => marks[i] ?? false),
    extra: Math.max(0, input.measures.length - marks.length),
    timeCorrect: hard ? timeCorrect : undefined,
  };
}

$('btn-tonic').addEventListener('click', () => Sound.play([TONIC]));

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
  const { events, total } = Rhythm.schedule(current, { fixedCountIn: level !== 'hard' });
  return Sound.playEvents(events, total);
}

// 내 악보: the section in the score's rhythm, after the tonic and a pause when `tonic` is set.
// Returns the playback length in seconds.
function playSection(tonic) {
  const { events, total } = Score.schedule(section.notes, { tonic });
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

for (const button of document.querySelectorAll('.chord-type')) {
  button.addEventListener('click', () => {
    if (button.dataset.type !== chordType) setChordType(button.dataset.type);
  });
}

// The chip row has no visible scrollbar, so a vertical mouse wheel scrolls it sideways when it overflows.
$('section-chips').addEventListener('wheel', (event) => {
  const row = $('section-chips');
  if (row.scrollWidth <= row.clientWidth || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  row.scrollLeft += event.deltaY;
  event.preventDefault();
}, { passive: false });

$('score-select').addEventListener('change', (event) => {
  scoreId = event.target.value;
  sectionIndex = 0;
  newQuestion();
});

for (const tab of document.querySelectorAll('.mode-tab')) {
  tab.addEventListener('click', () => {
    if (tab.dataset.mode !== mode) setMode(tab.dataset.mode);
  });
}

newQuestion();
