// Runs before the app: a browser that has only expansion 4's (v1) scores.
(function () {
  const line = (x, y, z, w) => [x, x, y, y, z, z, w].map((step, i) => ({ type: i === 6 ? 'h' : 'q', step, accidental: 0 }));
  const a = [...line(0, 4, 5, 4), ...line(3, 2, 1, 0)];
  const b = line(4, 3, 2, 1);
  const twinkle = { id: 'example-twinkle', title: '반짝반짝 작은 별', time: 4, notes: [...a, ...b, ...b, ...a] };
  const old = {
    id: 'old-1', title: '옛 악보', time: 3,
    notes: [
      { type: 'q.', step: 0, accidental: 0 }, { type: 'e', step: 3, accidental: 1 }, { type: 'q', step: 6, accidental: -1 },
      { type: 'h.', step: 11, accidental: 0 },
      { type: 'r' }, { type: 'e', step: 4, accidental: 0 }, { type: 'e', step: 5, accidental: 0 }, { type: 'q', step: 7, accidental: 0 },
    ],
  };
  localStorage.removeItem('ltw.scores.v2');
  localStorage.setItem('ltw.scores.v1', JSON.stringify([old, twinkle]));
})();
