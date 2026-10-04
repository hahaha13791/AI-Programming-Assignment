(function () {
  const NOTE_LENGTH = 0.7;
  const CHORD_LENGTH = 1.5;
  const NOTE_GAP = 0.15;
  const PEAK_GAIN = 0.3;
  // Peak of all chord notes added together; kept well under 1 so three voices never clip.
  const CHORD_PEAK_GAIN = 0.5;
  const ATTACK = 0.02;
  const FADE_OUT = 0.03;

  let ctx = null;
  let active = [];

  function midiToFrequency(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // Browsers only allow audio after a user gesture, so the context is created on the first click.
  function context() {
    if (!ctx) ctx = new AudioContext();
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

  function scheduleNote(audio, midi, start, length = NOTE_LENGTH, peak = PEAK_GAIN) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'triangle';
    osc.frequency.value = midiToFrequency(midi);

    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + ATTACK);
    gain.gain.exponentialRampToValueAtTime(0.001, start + length);

    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + length);

    const entry = { osc, gain };
    active.push(entry);
    osc.addEventListener('ended', () => {
      active = active.filter((e) => e !== entry);
    });
  }

  // Each item is a midi number, null (a rest), or an array of midis sounded together as a chord.
  // Returns the playback length in seconds.
  function play(items) {
    const audio = context();
    stop();
    const lead = 0.05;
    let time = audio.currentTime + lead;
    let end = time;
    for (const item of items) {
      if (Array.isArray(item)) {
        const peak = Math.min(PEAK_GAIN, CHORD_PEAK_GAIN / item.length);
        for (const midi of item) scheduleNote(audio, midi, time, CHORD_LENGTH, peak);
        end = time + CHORD_LENGTH;
      } else {
        if (item !== null) scheduleNote(audio, item, time);
        end = time + NOTE_LENGTH;
      }
      time = end + NOTE_GAP;
    }
    return end - audio.currentTime;
  }

  window.Sound = { play, stop };
})();
