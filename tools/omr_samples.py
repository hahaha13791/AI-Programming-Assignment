"""악보 인식(확장 11) 시험용: 공유저작물 인쇄 악보 이미지(Mutopia Project의 미리 보기)와 정답을 받아 fixture를 만든다.

Mutopia(https://www.mutopiaproject.org)는 LilyPond로 조판한 공유저작물(퍼블릭 도메인·CC) 악보 모음이다. 곡마다 첫 몇 줄의
미리 보기 이미지(SVG 또는 PNG)와 MIDI가 있다. 이미지는 실제 악보 글꼴(Emmentaler)로 그려져 있어, 앱이 그린 시험 이미지와
모양이 다르다(TODO 70단계 (다)). 정답은 MIDI에서 앱과 따로 계산한다.

받은 파일은 저장소에 넣지 않는다(tests/samples/.cache/는 .gitignore).
사용법 (프로젝트 루트에서):
  python -I tools/omr_samples.py
  python .claude/skills/ltw-test-runner/scripts/run.py tests/samples/.cache/omr.fixture.js tests/omr-lib.js tests/t70.js --widths 1000

fixture: window.OMR_SAMPLES = [{ id, title, clef, kind: 'svg'|'png', data (SVG 글 또는 PNG base64),
  movements: [{ time: [n, d], key: 조표(♯ +, ♭ -), notes: [[MIDI, 시작, 길이], ...] }] }]
  (미리 보기는 악장마다 첫 줄을 한 보표씩 보여 준다: 보표 i = 악장 i. 시작·길이는 4분음표 = 1인 분수 "n/d", 시작 순,
  함께 시작하는 음(겹음)은 가장 높은 음만 — 앱은 화음의 맨 위 음을 읽는다)
"""
import base64, io, json, pathlib, struct, sys, urllib.request, zipfile
from fractions import Fraction

sys.stdout.reconfigure(encoding='utf-8')
BASE = 'https://www.mutopiaproject.org/ftp/'
ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / 'tests' / 'samples' / '.cache' / 'omr'
CACHE.mkdir(parents=True, exist_ok=True)
OUT = ROOT / 'tests' / 'samples' / '.cache' / 'omr.fixture.js'

# (경로, 제목, 음자리표) — 한 줄 선율(독주) 곡, 1악장. 1차 범위(단선율, 높은음·낮은음자리표)에 맞는 곡.
# (C. P. E. 바흐 무반주 플루트 소나타는 미리 보기가 세 악장의 첫머리를 이어 붙인 작은 PNG라 1악장 MIDI와 맞지 않아 뺐다.)
PIECES = [
    ('BachJS/BWV1013/bwv1013/bwv1013', 'J. S. 바흐: 무반주 플루트 파르티타 BWV 1013', 'treble'),
    ('BachJS/BWV1007/bwv1007/bwv1007', 'J. S. 바흐: 무반주 첼로 모음곡 1번 BWV 1007', 'bass'),
    ('BachJS/BWV1009/cellosuite3/cellosuite3', 'J. S. 바흐: 무반주 첼로 모음곡 3번 BWV 1009', 'bass'),
    ('BachJS/BWV1010/bwv1010/bwv1010', 'J. S. 바흐: 무반주 첼로 모음곡 4번 BWV 1010', 'bass'),
]


def fetch(path):
    target = CACHE / path.replace('/', '_')
    if not target.exists():
        try:
            urllib.request.urlretrieve(BASE + path, target)
        except Exception:
            return None
    return target.read_bytes()


def var_len(data, i):
    value = 0
    while True:
        b = data[i]
        i += 1
        value = (value << 7) | (b & 0x7F)
        if not b & 0x80:
            return value, i


def read_midi(data):
    """Notes [(midi, start, length) in quarter notes], the first time signature and key signature."""
    assert data[:4] == b'MThd'
    _, _, ntracks, division = struct.unpack('>IHHH', data[4:14])
    i = 14
    notes, time, key = [], None, 0
    for _ in range(ntracks):
        assert data[i:i + 4] == b'MTrk'
        length = struct.unpack('>I', data[i + 4:i + 8])[0]
        j, end = i + 8, i + 8 + length
        tick, status, open_ = 0, 0, {}
        while j < end:
            delta, j = var_len(data, j)
            tick += delta
            if data[j] & 0x80:
                status = data[j]
                j += 1
            kind = status & 0xF0
            if status == 0xFF:
                meta = data[j]
                size, j = var_len(data, j + 1)
                body = data[j:j + size]
                if meta == 0x58 and time is None:
                    time = [body[0], 2 ** body[1]]
                if meta == 0x59 and tick == 0:
                    key = struct.unpack('b', body[:1])[0]
                j += size
            elif status in (0xF0, 0xF7):
                size, j = var_len(data, j)
                j += size
            elif kind in (0x80, 0x90):
                pitch, velocity = data[j], data[j + 1]
                j += 2
                if kind == 0x90 and velocity:
                    open_[pitch] = tick
                elif pitch in open_:
                    start = open_.pop(pitch)
                    notes.append((pitch, Fraction(start, division), Fraction(tick - start, division)))
            elif kind in (0xC0, 0xD0):
                j += 1
            else:
                j += 2
        i = end
    notes.sort(key=lambda n: (n[1], -n[0]))
    return notes, time or [4, 4], key


def movement_midis(path):
    """Every movement's MIDI, in order (a preview shows the opening line of each movement, one staff each)."""
    single = fetch(path + '.mid')
    if single:
        return [single]
    zipped = fetch(path + '-mids.zip')
    if not zipped:
        return []
    with zipfile.ZipFile(io.BytesIO(zipped)) as z:
        # LilyPond names them base.mid (1st movement), base-1.mid (2nd), base-2.mid … ; other arrangements (viola) are left out.
        base = path.split('/')[-1]
        order = {f'{base}.mid': 0, **{f'{base}-{k}.mid': k for k in range(1, 30)}}
        names = sorted((n for n in z.namelist() if n in order), key=order.get)
        return [z.read(n) for n in names]


def top_line(notes):
    """Of notes starting together (a double stop), the highest: the app reads a chord's top note."""
    out = []
    for note in notes:
        if out and out[-1][1] == note[1]:
            continue  # sorted highest first at each start
        out.append(note)
    return out


def text(f):
    return f'{f.numerator}/{f.denominator}'


samples = []
for path, title, clef in PIECES:
    svg = fetch(path + '-preview.svg')
    png = None if svg else fetch(path + '-preview.png')
    midis = movement_midis(path)
    if not (svg or png) or not midis:
        print('건너뜀:', path)
        continue
    movements = []
    for midi in midis:
        notes, time, key = read_midi(midi)
        movements.append({'time': time, 'key': key, 'notes': [[p, text(s), text(l)] for p, s, l in top_line(notes)]})
    samples.append({
        'id': path.split('/')[-1], 'title': title, 'clef': clef,
        'kind': 'svg' if svg else 'png',
        'data': svg.decode('utf-8') if svg else base64.b64encode(png).decode('ascii'),
        'movements': movements,
    })
    print(f'{title}: {"SVG" if svg else "PNG"}, 악장 {len(movements)}개, 조표 {[m["key"] for m in movements]}')

OUT.write_text('window.OMR_SAMPLES = ' + json.dumps(samples, ensure_ascii=False) + ';\n', encoding='utf-8')
print('→', OUT)
