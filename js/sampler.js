(function () {
  // Instrument recordings (PRD #4-I): js/data/instruments/<name>.js puts { samples: [{ midi, tune, data, loop }] } in
  // window.INSTRUMENTS. Each recording is decoded once per audio context; a note plays the nearest recording at the
  // speed that gives its pitch (outside the recordings' range too: the end one is stretched, like a MIDI instrument).
  const LOUDNESS = 2.4; // recordings are evened out at a lower level than the synthesized tone; this brings them level
  const RELEASE = 0.06; // a note ends with this fade (seconds)

  // Where the data files are: next to this script (the page may live somewhere else, as in the test runner).
  const BASE = (document.currentScript?.src ?? '').replace(/sampler\.js(\?.*)?$/, 'data/instruments/');

  const decoded = new Map(); // name -> { context, status: 'loading'|'ready'|'failed', buffers: Map(sample -> AudioBuffer) }
  const files = new Map(); // name -> 'fetching'|'loaded'|'failed' (the data script)
  let current = 'piano';

  // Reads an instrument's data file (once) by adding a <script> (file:// can't fetch). Calls done(ok) when settled.
  function load(name, done = () => {}) {
    if (window.INSTRUMENTS?.[name]) {
      files.set(name, 'loaded');
      done(true);
      return;
    }
    const known = files.get(name);
    if (known === 'failed') {
      done(false);
      return;
    }
    const waiting = load.waiting ?? (load.waiting = new Map());
    if (!waiting.has(name)) waiting.set(name, []);
    waiting.get(name).push(done);
    if (known === 'fetching') return;
    files.set(name, 'fetching');
    const script = document.createElement('script');
    script.src = `${BASE}${name}.js`;
    script.dataset.instrument = name;
    const settle = (ok) => {
      files.set(name, ok ? 'loaded' : 'failed');
      for (const callback of waiting.get(name) ?? []) callback(ok);
      waiting.delete(name);
    };
    script.addEventListener('load', () => settle(Boolean(window.INSTRUMENTS?.[name])));
    script.addEventListener('error', () => settle(false));
    document.head.append(script);
  }

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
    // Its file isn't read yet (or couldn't be): nothing to decode, and nothing kept, so it can be tried again.
    if (!instrument?.samples?.length) return { context, status: files.get(name) === 'failed' ? 'failed' : 'none', buffers: new Map() };
    const state = { context, status: 'loading', buffers: new Map() };
    decoded.set(name, state);
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

  // 'fetching' (the file), 'loading' (decoding), 'ready', 'failed' or 'none' (not asked for yet).
  const status = (name = current) => {
    if (files.get(name) === 'fetching') return 'fetching';
    if (files.get(name) === 'failed') return 'failed';
    return decoded.get(name)?.status ?? 'none';
  };
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
    load, prepare, status, ready, pick, play, setCurrent, BASE, LOUDNESS, RELEASE,
    get current() { return current; },
  };
})();
