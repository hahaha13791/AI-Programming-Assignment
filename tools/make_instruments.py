"""Builds js/data/instruments/*.js from free instrument recordings (TODO 50, PRD #4-I).

    python -I tools/make_instruments.py            # all instruments
    python -I tools/make_instruments.py piano      # one

Needs ffmpeg (pip install imageio-ffmpeg) and numpy. Recordings are downloaded once into tools/.cache/
(not in the repository). For each instrument it takes one dynamic, measures each recording's real pitch (file
names don't always say the octave the way MIDI does), cuts the silence before the note, shortens it, evens out
the loudness, and writes mono mp3 as base64 into a plain script (file:// can't fetch files).

Sources:
- Piano: Salamander Grand Piano V3 by Alexander Holm, CC BY 3.0
  (https://github.com/sfzinstruments/SalamanderGrandPiano)
- Violin, flute, marimba, harp: VSCO 2 Community Edition by Versilian Studios, CC0
  (https://github.com/sgossner/VSCO-2-CE)
"""
import base64
import json
import pathlib
import subprocess
import sys
import urllib.parse
import urllib.request

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / 'tools' / '.cache'
OUT = ROOT / 'js' / 'data' / 'instruments'
RATE = 44100
NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
SALAMANDER = 'https://raw.githubusercontent.com/sfzinstruments/SalamanderGrandPiano/master/Samples/'
VSCO = 'https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/'


def ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def midi_of(name):
    """'D#4' -> 63 (C4 = 60)."""
    step = name[:-1]
    return 12 * (int(name[-1]) + 1) + NAMES.index(step)


def piano_files():
    notes = []
    for octave in range(2, 8):
        for step in ['C', 'D#', 'F#', 'A']:
            name = f'{step}{octave}'
            if midi_of(name) <= midi_of('C7'):
                notes.append((name, SALAMANDER + urllib.parse.quote(f'{name}v10.flac')))
    return notes


def vsco(folder, files):
    return [(note, VSCO + urllib.parse.quote(f'{folder}/{file}')) for note, file in files]


INSTRUMENTS = {
    'piano': {
        'label': '피아노', 'sustain': False, 'length': 2.6, 'files': piano_files(),
        'credit': 'Salamander Grand Piano V3 (Alexander Holm), CC BY 3.0',
    },
    'violin': {
        'label': '바이올린', 'sustain': True, 'length': 3.0,
        'files': vsco('Strings/Solo Violin/Arco Vib', [(n, f'LLVln_ArcoVib_{n}_p.wav') for n in
                                                       ['G3', 'A3', 'C4', 'E4', 'G4', 'A4', 'C5', 'E5', 'G5', 'A5', 'C6', 'E6', 'G6', 'A6', 'C7']]),
        'credit': 'VSCO 2 Community Edition (Versilian Studios), CC0',
    },
    'flute': {
        'label': '플루트', 'sustain': True, 'length': 3.0, 'offset': 12,  # its files name middle C 'C3'
        'files': vsco('Woodwinds/Flute/susvib', [(n, f'LDFlute_susvib_{n}_v1_1.wav') for n in
                                                 ['C3', 'E3', 'A3', 'C4', 'E4', 'A4', 'C5', 'E5', 'A5', 'C6']]),
        'credit': 'VSCO 2 Community Edition (Versilian Studios), CC0',
    },
    'marimba': {
        'label': '마림바', 'sustain': False, 'length': 2.0, 'offset': 12,  # its files name middle C 'C3'
        'files': vsco('Percussion/Marimba', [(n, f'Marimba_hit_Outrigger_{n}_loud_01.wav') for n in
                                             ['F1', 'C2', 'G2', 'B2', 'F3', 'C4', 'G4', 'B4', 'F5', 'C6']]),
        'credit': 'VSCO 2 Community Edition (Versilian Studios), CC0',
    },
    'harp': {
        'label': '하프', 'sustain': False, 'length': 2.4,
        'files': vsco('Strings/Harp', [(n, f'KSHarp_{n}_{d}.wav') for n, d in
                                       [('G1', 'mp'), ('B1', 'mf'), ('D2', 'mf'), ('F2', 'mf'), ('A2', 'mf'), ('C3', 'mf'),
                                        ('E3', 'mf'), ('G3', 'mf'), ('B3', 'mf'), ('D4', 'mf'), ('F4', 'mf'), ('A4', 'mf'),
                                        ('C5', 'mf'), ('E5', 'mf'), ('G5', 'mf'), ('B5', 'mf'), ('D6', 'mf'), ('F6', 'mf'),
                                        ('A6', 'mf'), ('D7', 'f')]]),
        'credit': 'VSCO 2 Community Edition (Versilian Studios), CC0',
    },
}


def download(url):
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / urllib.parse.unquote(url.split('/master/', 1)[1]).replace('/', '__')
    if not path.exists():
        with urllib.request.urlopen(url) as response:
            path.write_bytes(response.read())
    return path


def decode(path):
    raw = subprocess.run([ffmpeg(), '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(RATE), '-f', 'f32le', '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def fundamental(audio):
    """Frequency of the steady part (autocorrelation over 0.2 s from 0.15 s after the note starts)."""
    level = np.max(np.abs(audio))
    onset = int(np.argmax(np.abs(audio) > 0.02 * level))
    start = onset + int(0.15 * RATE)
    piece = audio[start:start + int(0.2 * RATE)].astype(np.float64)
    piece = piece - piece.mean()
    n = len(piece)
    spectrum = np.fft.rfft(piece, 2 * n)
    corr = np.fft.irfft(spectrum * np.conj(spectrum))[:n]
    lo, hi = int(RATE / 4500), int(RATE / 25)
    lag = lo + int(np.argmax(corr[lo:hi]))
    # Prefer the shortest lag nearly as strong (avoids picking an octave too low).
    best = corr[lag]
    for k in range(lo, lag):
        if corr[k] > 0.9 * best and corr[k] >= corr[k - 1] and corr[k] >= corr[k + 1]:
            lag = k
            break
    if 1 <= lag < n - 1:  # parabolic refinement
        a, b, c = corr[lag - 1], corr[lag], corr[lag + 1]
        denominator = a - 2 * b + c
        if denominator < 0:
            shift = 0.5 * (a - c) / denominator
            if abs(shift) <= 1:
                lag = lag + shift
    return RATE / lag


def prepare(audio, length, sustain):
    """Cut the silence before the note, shorten, fade, even out the loudness. Returns (audio, loop or None)."""
    level = np.max(np.abs(audio))
    # Bowed and blown notes swell slowly: start them where they are already clearly heard, so they sound on the beat.
    onset = int(np.argmax(np.abs(audio) > (0.12 if sustain else 0.02) * level))
    onset = max(0, onset - int(0.005 * RATE))
    audio = audio[onset:onset + int(length * RATE)].copy()
    fade = int(0.25 * RATE)
    audio[-fade:] *= np.linspace(1, 0, fade)
    rise = int((0.012 if sustain else 0.0015) * RATE)
    audio[:rise] *= np.linspace(0, 1, rise)
    # Loudness: the steady part (or the first half second) at the same RMS for every recording.
    body = audio[int(0.05 * RATE):int(0.6 * RATE)]
    rms = np.sqrt(np.mean(body ** 2)) or 1
    audio = audio * (0.18 / rms)
    peak = np.max(np.abs(audio))
    if peak > 0.95:
        audio *= 0.95 / peak
    loop = None
    if sustain:
        # A stretch of the held sound to repeat for long notes, between zero crossings going up.
        def crossing(at):
            i = int(at * RATE)
            while i < len(audio) - 1 and not (audio[i] <= 0 < audio[i + 1]):
                i += 1
            return i / RATE
        loop = [round(crossing(1.0), 5), round(crossing(length - 0.35), 5)]
    return audio.astype(np.float32), loop


def encode(audio):
    result = subprocess.run([ffmpeg(), '-v', 'error', '-f', 'f32le', '-ar', str(RATE), '-ac', '1', '-i', '-',
                             '-codec:a', 'libmp3lame', '-b:a', '64k', '-f', 'mp3', '-'],
                            input=audio.tobytes(), check=True, capture_output=True)
    return result.stdout


def build(name):
    spec = INSTRUMENTS[name]
    samples = []
    for note, url in spec['files']:
        audio = decode(download(url))
        # The note is the file's name (in MIDI octaves: some sets call middle C 'C3'). The measured pitch only
        # fine-tunes it, when it agrees (an octave either way, as low notes are hard to measure).
        midi = midi_of(note) + spec.get('offset', 0)
        freq = fundamental(audio)
        measured = 69 + 12 * np.log2(freq / 440) if freq > 0 else float('nan')
        off = ((measured - midi + 6) % 12) - 6 if np.isfinite(measured) else 99
        cents = round(float(off * 100)) if abs(off) <= 0.4 else 0
        if abs(off) > 0.4:
            print(f'  ? {name} {note}: pitch not measured reliably ({measured:.2f}), kept {midi} untuned')
        prepared, loop = prepare(audio, spec['length'], spec['sustain'])
        data = base64.b64encode(encode(prepared)).decode('ascii')
        sample = {'midi': int(midi), 'tune': int(cents), 'data': data}
        if loop:
            sample['loop'] = loop
        samples.append(sample)
        print(f'  {name} {note}: midi {midi} ({cents:+d} cents), {len(data) // 1024} KB')
    samples.sort(key=lambda s: s['midi'])
    record = {'name': name, 'label': spec['label'], 'sustain': spec['sustain'], 'credit': spec['credit'], 'samples': samples}
    OUT.mkdir(parents=True, exist_ok=True)
    text = ('// Generated by tools/make_instruments.py — do not edit. ' + spec['credit'] + '.\n'
            f'(window.INSTRUMENTS = window.INSTRUMENTS || {{}})[{json.dumps(name)}] = {json.dumps(record, ensure_ascii=False)};\n')
    path = OUT / f'{name}.js'
    path.write_text(text, encoding='utf-8')
    print(f'{name}: {len(samples)} recordings, midi {samples[0]["midi"]}~{samples[-1]["midi"]}, {path.stat().st_size // 1024} KB')


if __name__ == '__main__':
    for name in sys.argv[1:] or INSTRUMENTS:
        build(name)
