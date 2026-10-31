"""공개 MusicXML 예제(musicxml.com example set)를 받아 테스트용 fixture를 만든다.

악보 파일은 사용 조건이 명시되어 있지 않아 저장소에 넣지 않는다(tests/samples/.cache/는 .gitignore).
사용법 (프로젝트 루트에서):
  python -I tests/samples/make_fixture.py
  python .claude/skills/ltw-test-runner/scripts/run.py tests/samples/.cache/samples.fixture.js tests/samples/samples.test.js --widths 1000
각 .musicxml의 파트·보표·성부별 음 개수(화음은 한 번, 꾸밈음 포함)를 여기서 따로 세어 기대값으로 넣는다.
"""
import sys, zipfile, base64, json, urllib.request, pathlib, xml.etree.ElementTree as ET

URL = 'https://wpmedia.musicxml.com/wp-content/uploads/2021/06/xmlsamples.zip'
CACHE = pathlib.Path(__file__).resolve().parent / '.cache'
CACHE.mkdir(exist_ok=True)
src = CACHE / 'xmlsamples.zip'
if not src.exists():
    urllib.request.urlretrieve(URL, src)
out_js = CACHE / 'samples.fixture.js'
z = zipfile.ZipFile(src)
samples = []
for info in z.infolist():
    n = info.filename
    if n.startswith('__MACOSX') or not n.endswith(('.musicxml', '.mxl')):
        continue
    data = z.read(n)
    exp = None
    if n.endswith('.musicxml'):
        root = ET.fromstring(data)
        names = {sp.get('id'): (sp.findtext('part-name') or '').strip() for sp in root.iter('score-part')}
        parts, skipped = [], []
        for part in root.findall('part'):
            lines = {}
            for note in part.iter('note'):
                if note.find('pitch') is None or note.find('chord') is not None:
                    continue
                staff = int(note.findtext('staff') or 1)
                voice = note.findtext('voice') or '1'
                lines[(staff, voice)] = lines.get((staff, voice), 0) + 1
            if lines:
                parts.append(sorted([[s, v, c] for (s, v), c in lines.items()], key=lambda x: (x[0], int(x[1]) if x[1].isdigit() else 0, x[1])))
            else:
                skipped.append(part.get('id'))
        exp = {'parts': parts, 'skipped': len(skipped)}
    samples.append({'name': n, 'b64': base64.b64encode(data).decode(), 'exp': exp})
open(out_js, 'w', encoding='utf-8').write('window.SAMPLES = ' + json.dumps(samples) + ';\n')
print(len(samples), 'files')
