const TONIC = 60;
const $ = (id) => document.getElementById(id);

let level = 'easy';
let current = null;
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

function updateSubmit() {
  $('btn-submit').disabled = !current || submitted || staff.getNotes().length !== current.length;
}

function pickPattern() {
  const pool = PATTERNS[level];
  const candidates = pool.filter((pattern) => pattern !== current);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function newQuestion() {
  Sound.stop();
  clearTimeout(unlockTimer);
  current = pickPattern();
  submitted = false;
  staff.reset(current.length);
  staff.setLocked(true);
  $('btn-replay').disabled = true;
  $('staff-hint').hidden = false;
  renderResult(null);
}

function renderResult(marks) {
  const area = $('result-area');
  if (!marks) {
    const placeholder = document.createElement('p');
    placeholder.className = 'placeholder';
    placeholder.textContent = '제출하면 채점 결과가 여기에 표시됩니다.';
    area.replaceChildren(placeholder);
    return;
  }

  const correct = marks.filter(Boolean).length;
  const score = document.createElement('p');
  score.className = 'score';
  score.textContent = correct === marks.length
    ? `${marks.length}음 모두 정답이에요!`
    : `${marks.length}음 중 ${correct}음 정답`;

  const answerTitle = document.createElement('h3');
  answerTitle.className = 'answer-title';
  answerTitle.textContent = '정답 멜로디';

  const answerStaff = document.createElement('div');
  answerStaff.className = 'staff-area answer-staff';
  Staff.draw(answerStaff, current, '정답 멜로디 오선');

  const answerChips = document.createElement('div');
  answerChips.className = 'note-preview answer-chips';
  answerChips.append(...current.map((note) => {
    const chip = document.createElement('span');
    chip.className = 'note-chip';
    chip.textContent = Staff.noteLabel(note);
    return chip;
  }));

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'btn btn-primary';
  next.id = 'btn-next';
  next.textContent = '다음 문제';
  next.addEventListener('click', newQuestion);

  area.replaceChildren(score, answerTitle, answerStaff, answerChips, next);
}

$('btn-tonic').addEventListener('click', () => Sound.play([TONIC]));

$('btn-question').addEventListener('click', () => {
  const seconds = Sound.play([TONIC, null, ...current.map(Staff.noteToMidi)]);
  if (!$('btn-replay').disabled) return;
  clearTimeout(unlockTimer);
  unlockTimer = setTimeout(() => {
    $('btn-replay').disabled = false;
    $('staff-hint').hidden = true;
    if (!submitted) staff.setLocked(false);
  }, seconds * 1000);
});

$('btn-replay').addEventListener('click', () => Sound.play(current.map(Staff.noteToMidi)));

$('btn-submit').addEventListener('click', () => {
  const input = staff.getNotes();
  const marks = current.map((note, i) => Staff.noteToMidi(note) === Staff.noteToMidi(input[i]));
  submitted = true;
  staff.setLocked(true);
  staff.setMarks(marks);
  renderResult(marks);
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

newQuestion();
