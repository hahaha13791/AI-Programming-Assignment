const TONIC = 60;
// Placeholder until the quiz patterns are added: 도 미 솔 높은 도
const SAMPLE_MELODY = [60, 64, 67, 72];

Staff.create({
  container: document.getElementById('staff-area'),
  preview: document.getElementById('note-preview'),
  sharpButton: document.getElementById('btn-sharp'),
  flatButton: document.getElementById('btn-flat'),
  undoButton: document.getElementById('btn-undo'),
  clearButton: document.getElementById('btn-clear'),
});

document.getElementById('btn-tonic').addEventListener('click', () => Sound.play([TONIC]));
document.getElementById('btn-melody').addEventListener('click', () => Sound.play(SAMPLE_MELODY));
document.getElementById('btn-replay').addEventListener('click', () => Sound.play(SAMPLE_MELODY));
