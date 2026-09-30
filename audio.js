(function () {
  const NOTE_LENGTH = 0.7;
  const NOTE_GAP = 0.15;
  const PEAK_GAIN = 0.3;
  const ATTACK = 0.02;
  const FADE_OUT = 0.03;

  let ctx = null;
  let active = [];

  function midiToFrequency(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // Browsers only allow audio after a user gesture, so the context is created on the first click.
  function context() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function stop() {
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const { osc, gain } of active) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + FADE_OUT);
      osc.stop(now + FADE_OUT);
    }
    active = [];
  }

  function scheduleNote(audio, midi, start) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'triangle';
    osc.frequency.value = midiToFrequency(midi);

    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(PEAK_GAIN, start + ATTACK);
    gain.gain.exponentialRampToValueAtTime(0.001, start + NOTE_LENGTH);

    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + NOTE_LENGTH);

    const entry = { osc, gain };
    active.push(entry);
    osc.addEventListener('ended', () => {
      active = active.filter((e) => e !== entry);
    });
  }

  function play(midis) {
    const audio = context();
    stop();
    const start = audio.currentTime + 0.05;
    midis.forEach((midi, i) => scheduleNote(audio, midi, start + i * (NOTE_LENGTH + NOTE_GAP)));
  }

  window.Sound = { play, stop };
})();
