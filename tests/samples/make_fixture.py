"""공개 MusicXML 예제(musicxml.com example set)를 받아 테스트용 fixture를 만든다.

악보 파일은 사용 조건이 명시되어 있지 않아 저장소에 넣지 않는다(tests/samples/.cache/는 .gitignore).
사용법 (프로젝트 루트에서):
  python -I tests/samples/make_fixture.py
  python .claude/skills/ltw-test-runner/scripts/run.py tests/samples/.cache/samples.fixture.js tests/samples/samples.test.js --widths 1000

기대값은 앱 코드와 따로 여기서 계산한다.
- lines: 파트·보표·성부별 음 개수(화음은 한 번, 꾸밈음 포함) — 35단계 목록 확인
- sounds: 성부마다 실제로 울리는 음 [실음 MIDI, 시작, 길이] (시작·길이는 온음표 기준 분수 "n/d", 붙임줄로 이은 음은
  음높이마다 하나로 합침, 화음의 음도 모두, 시작·음높이 순) — 36·38단계 변환 확인. 앱이 불러올 수 있는 성부만 비교한다.
"""
import base64, json, pathlib, urllib.request, zipfile
import xml.etree.ElementTree as ET
from fractions import Fraction

URL = 'https://wpmedia.musicxml.com/wp-content/uploads/2021/06/xmlsamples.zip'
CACHE = pathlib.Path(__file__).resolve().parent / '.cache'
CACHE.mkdir(exist_ok=True)
SRC = CACHE / 'xmlsamples.zip'
if not SRC.exists():
    urllib.request.urlretrieve(URL, SRC)
OUT = CACHE / 'samples.fixture.js'
SEMI = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def line_key(item):
    staff, voice = item
    return (staff, int(voice) if voice.isdigit() else 0, voice)


def frac_text(f):
    return f'{f.numerator}/{f.denominator}'


def analyse(root):
    concert = root.find('.//concert-score') is not None
    parts, skipped = [], 0
    for part in root.findall('part'):
        counts = {}
        for note in part.iter('note'):
            if note.find('pitch') is None or note.find('chord') is not None:
                continue
            key = (int(note.findtext('staff') or 1), note.findtext('voice') or '1')
            counts[key] = counts.get(key, 0) + 1
        if not counts:
            skipped += 1
            continue
        keys = sorted(counts, key=line_key)
        # Walk the part once: every line's notes with absolute start and length.
        divisions, beats, beat_type, chromatic = 1, 4, 4, 0
        offset = Fraction(0)
        events = {k: [] for k in keys}
        for measure in part.findall('measure'):
            cursor = previous = length = Fraction(0)
            head_key = None
            for el in measure:
                if el.tag == 'attributes':
                    if el.findtext('divisions'):
                        divisions = int(el.findtext('divisions'))
                    time = el.find('time')
                    if time is not None and time.findtext('beats'):
                        beats, beat_type = int(time.findtext('beats')), int(time.findtext('beat-type'))
                    t = el.find('transpose')
                    if t is not None and not concert:
                        chromatic = int(t.findtext('chromatic') or 0) + 12 * int(t.findtext('octave-change') or 0)
                elif el.tag == 'note':
                    grace = el.find('grace') is not None
                    chord = el.find('chord') is not None
                    dur = Fraction(0) if grace else Fraction(int(el.findtext('duration') or 0), 4 * divisions)
                    start = previous if chord else cursor
                    if not chord:
                        previous = cursor
                        cursor += dur
                    # A chord's other notes belong to their head's line, even on the other staff.
                    key = head_key if chord else (int(el.findtext('staff') or 1), el.findtext('voice') or '1')
                    if not chord:
                        head_key = key
                    if key in events and not grace:
                        pitch = el.find('pitch')
                        midi = None
                        if pitch is not None:
                            midi = 12 * (int(pitch.findtext('octave')) + 1) + SEMI[pitch.findtext('step')] \
                                + int(float(pitch.findtext('alter') or 0)) + chromatic
                        ties = [t.get('type') for t in el.findall('tie')] or [t.get('type') for t in el.findall('notations/tied')]
                        events[key].append([midi, offset + start, dur, 'start' in ties, 'stop' in ties])
                elif el.tag == 'backup':
                    cursor = max(Fraction(0), cursor - Fraction(int(el.findtext('duration')), 4 * divisions))
                elif el.tag == 'forward':
                    cursor += Fraction(int(el.findtext('duration')), 4 * divisions)
                length = max(length, cursor)
            offset += length if length > 0 else Fraction(beats, beat_type)
        sounds = []
        for k in keys:
            # Each pitch on its own: a tie joins it to the same pitch starting right where it ends.
            out, waiting = [], {}  # waiting: midi -> the sound its tie carries on
            for midi, start, dur, tie_start, tie_stop in sorted((e for e in events[k] if e[0] is not None), key=lambda e: (e[1], e[0])):
                held = waiting.pop(midi, None)
                if tie_stop and held is not None and held[1] + held[2] == start:
                    held[2] += dur
                    sound = held
                else:
                    sound = [midi, start, dur]
                    out.append(sound)
                if tie_start:
                    waiting[midi] = sound
            out.sort(key=lambda x: (x[1], x[0]))
            sounds.append([f'{m}@{frac_text(s)}+{frac_text(d)}' for m, s, d in out])
        parts.append({'lines': [[s, v, counts[(s, v)]] for s, v in keys], 'sounds': sounds})
    return {'parts': [p['lines'] for p in parts], 'sounds': [p['sounds'] for p in parts], 'skipped': skipped}


samples = []
with zipfile.ZipFile(SRC) as z:
    for info in z.infolist():
        name = info.filename
        if name.startswith('__MACOSX') or not name.endswith(('.musicxml', '.mxl')):
            continue
        data = z.read(name)
        exp = analyse(ET.fromstring(data)) if name.endswith('.musicxml') else None
        samples.append({'name': name, 'b64': base64.b64encode(data).decode(), 'exp': exp})
OUT.write_text('window.SAMPLES = ' + json.dumps(samples) + ';\n', encoding='utf-8')
print(len(samples), 'files')
