(function () {
  // Instrument recordings (PRD #4-I): js/data/instruments/<name>.js puts { samples: [{ midi, tune, data, loop }] } in
  // window.INSTRUMENTS. Each recording is decoded once per audio context; a note plays the nearest recording at the
  // speed that gives its pitch (outside the recordings' range too: the end one is stretched, like a MIDI instrument).
  const LOUDNESS = 2.4; // recordings are evened out at a lower level than the synthesized tone; this brings them level
  const RELEASE = 0.06; // a note ends with this fade (seconds)

  // Where the data files are: next to this script (the page may live somewhere else, as in the test runner).
  const BASE = (document.currentScript?.src ?? '').replace(/sampler\.js(\?.*)?$/, 'data/instruments/');

  const decoded = new Map(); // name -> { context, status: 'loading'|'ready'|'failed', buffers: Map(sample -> AudioBuffer) }
  let current = 'piano';

  function bytesOf(b64) {
    const text = atob(b64);
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    return bytes.buffer;
  }

  // Starts decoding an instrument's recordings for this audio context (once). Returns its state.
  function prepare(context, name = current) {
    const known = decoded.get(name);
    if (known && known.context === context) return known;
    const instrument = window.INSTRUMENTS?.[name];
    const state = { context, status: 'loading', buffers: new Map() };
    decoded.set(name, state);
    if (!instrument?.samples?.length) {
      state.status = 'failed';
      return state;
    }
    let left = instrument.samples.length;
    for (const sample of instrument.samples) {
      let data;
      try {
        data = bytesOf(sample.data);
      } catch (error) {
        state.status = 'failed';
        return state;
      }
      // The callback form (some browsers' promise form is missing; the test runner needs it too).
      context.decodeAudioData(data, (buffer) => {
        state.buffers.set(sample, buffer);
        left--;
        if (!left && state.status === 'loading') state.status = 'ready';
      }, () => {
        state.status = 'failed';
      });
    }
    return state;
  }

  const status = (name = current) => decoded.get(name)?.status ?? 'none';
  const ready = (name = current, context) => {
    const state = decoded.get(name);
    return Boolean(state && state.status === 'ready' && (!context || state.context === context));
  };

  // The recording a pitch is played from and the speed for it: the nearest recording (the lower one on a tie).
  function pick(name, midi) {
    const samples = window.INSTRUMENTS?.[name]?.samples;
    if (!samples?.length) return null;
    let best = samples[0];
    for (const sample of samples) if (Math.abs(sample.midi - midi) < Math.abs(best.midi - midi)) best = sample;
    const semitones = midi - best.midi - (best.tune ?? 0) / 100;
    return { sample: best, rate: 2 ** (semitones / 12) };
  }

  // Schedules a note from the recordings. Returns { source, gain } (to stop it), or null when they aren't ready.
  function play(context, midi, start, length, peak, name = current) {
    if (!ready(name, context)) return null;
    const instrument = window.INSTRUMENTS[name];
    const choice = pick(name, midi);
    const buffer = decoded.get(name).buffers.get(choice.sample);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = choice.rate;
    // Held instruments: a note longer than the recording repeats its steady part.
    if (instrument.sustain && choice.sample.loop) {
      const sounding = buffer.duration / choice.rate;
      if (length > sounding - 0.3) {
        source.loop = true;
        [source.loopStart, source.loopEnd] = choice.sample.loop;
      }
    }
    const gain = context.createGain();
    const level = peak * LOUDNESS;
    const release = Math.min(RELEASE, length / 3);
    gain.gain.setValueAtTime(level, start);
    gain.gain.setValueAtTime(level, start + Math.max(0, length - release));
    gain.gain.linearRampToValueAtTime(0, start + length);
    source.connect(gain).connect(context.destination);
    source.start(start);
    source.stop(start + length + 0.01);
    return { source, gain };
  }

  function setCurrent(name) {
    current = name;
  }

  window.Sampler = {
    prepare, status, ready, pick, play, setCurrent, BASE, LOUDNESS, RELEASE,
    get current() { return current; },
  };
})();
