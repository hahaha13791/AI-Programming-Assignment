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
};

// Until the rhythm data arrives (stage 19): 4/4, two measures. Note types as in Rhythm.TYPES.
const SAMPLE_RHYTHM = { time: [4, 4], measures: [['q', 'q', 'h'], ['h', 'q', 'q']] };

let mode = 'melody';
let chordType = 'triad'; // harmony mode: 'triad' or 'seventh'

function setHint(key) {
  const hints = MODES[mode].hints;
  const hardHint = mode === 'rhythm' && level === 'hard' ? hints[`${key}Hard`] : undefined;
  $('staff-hint').textContent = hardHint ?? hints[key] ?? HINTS[key];
}

function setMode(next) {
  mode = next;
  const info = MODES[mode];
  for (const tab of document.querySelectorAll('.mode-tab')) {
    tab.setAttribute('aria-selected', String(tab.dataset.mode === mode));
  }
  $('app').dataset.mode = mode;
  $('subtitle').textContent = info.subtitle;
  $('chord-types').hidden = mode !== 'harmony';
  updateLevelDescriptions();
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
let current = null; // the notes of the current question
let chord = null; // harmony mode: the current chord ({ notes, name, ... })
let submitted = false;
let unlockTimer = null;

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
    current = SAMPLE_RHYTHM;
    staff.reset(0);
    // Hard: the time signature and measure count are part of the answer, so neither is shown.
    const hard = level === 'hard';
    rhythm.reset({
      types: Rhythm.LEVEL_TYPES[level],
      time: hard ? null : current.time[0],
      measures: hard ? null : current.measures.length,
    });
  } else {
    current = pick(PATTERNS[level], current);
    staff.reset(current.length);
  }
  $('btn-question').disabled = false;
  setHint('ready');
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

// result: null (nothing submitted), or { marks } for melody, or { marks, answerMarks, missed } for harmony.
function renderResult(result) {
  const area = $('result-area');
  if (!result) {
    area.replaceChildren(element('p', 'placeholder', '제출하면 채점 결과가 여기에 표시됩니다.'));
    return;
  }

  if (result.pending) {
    area.replaceChildren(element('p', 'placeholder', '리듬 채점은 19단계에서 연결돼요.'), nextButton());
    return;
  }

  const { marks } = result;
  const correct = marks.filter(Boolean).length;
  const parts = [];
  const answerStaff = element('div', 'staff-area answer-staff');

  if (mode === 'harmony') {
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
    parts.push(element('h3', 'answer-title', '정답 멜로디'));
    Staff.draw(answerStaff, current, '정답 멜로디 오선');
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

$('btn-tonic').addEventListener('click', () => Sound.play([TONIC]));

function midis(notes) {
  return notes.map(Staff.noteToMidi);
}

// Chord notes low to high, the order the arpeggio plays them in.
function chordMidis() {
  return midis(current).sort((a, b) => a - b);
}

// What "문제 듣기" plays. Rhythm playback arrives in stage 18; until then it plays nothing and unlocks input.
function questionItems() {
  if (mode === 'rhythm') return [];
  const question = mode === 'harmony' ? [chordMidis()] : midis(current);
  return [TONIC, null, ...question];
}

$('btn-question').addEventListener('click', () => {
  const seconds = Sound.play(questionItems());
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

$('btn-replay').addEventListener('click', () => {
  if (mode === 'rhythm') return;
  Sound.play(mode === 'harmony' ? [chordMidis()] : midis(current));
});
$('btn-arpeggio').addEventListener('click', () => Sound.play(chordMidis()));

$('btn-submit').addEventListener('click', () => {
  if (mode === 'rhythm') {
    // Grading arrives in stage 19; until then submitting only closes the input.
    submitted = true;
    setHint('submitted');
    rhythm.setLocked(true);
    renderResult({ pending: true });
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

for (const tab of document.querySelectorAll('.mode-tab')) {
  tab.addEventListener('click', () => {
    if (tab.dataset.mode !== mode) setMode(tab.dataset.mode);
  });
}

newQuestion();
