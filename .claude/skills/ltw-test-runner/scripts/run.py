"""Listen to the world 헤드리스 테스트 러너.

index.html을 임시 폴더로 복사해 css/js 경로를 절대 file:// 주소로 바꾸고, 에러 수집 코드와
lib.js + 테스트 파일을 주입한다. 바깥 harness.html이 화면 폭마다 iframe을 하나씩 띄워 테스트를 돌리고,
헤드리스 브라우저의 --dump-dom 출력에서 결과를 읽는다.

사용법:
  python run.py <테스트.js> [<테스트.js> ...] [--browser edge|chrome|<경로>] [--widths 320,375,1000]
                [--root <프로젝트 폴더>] [--budget <가상 ms>] [--head <먼저 실행할.js>]
종료 코드: 모두 PASS면 0, FAIL·시간 초과·결과 없음이면 1.
"""

import argparse
import html
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

BROWSERS = {
    'edge': r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    'chrome': r'C:\Program Files\Google\Chrome\Application\chrome.exe',
}
DEFAULT_WIDTHS = [320, 360, 375, 412, 480, 520, 600, 680, 768, 900, 1000]
FRAME_HEIGHT = 900
SCRIPTS = Path(__file__).resolve().parent

ERROR_COLLECTOR = """<script>
window.__errors = [];
addEventListener('error', (e) => __errors.push(String(e.message)));
addEventListener('unhandledrejection', (e) => __errors.push('rejection: ' + (e.reason && e.reason.message || e.reason)));
(function () {
  const original = console.error;
  console.error = (...args) => { __errors.push(args.map(String).join(' ')); original.apply(console, args); };
})();
// Phones use overlay scrollbars; without this the iframe's 15px desktop scrollbar makes 320px lay out as 305px.
if (innerWidth <= 480) {
  const style = document.createElement('style');
  style.textContent = 'html { scrollbar-width: none; }';
  document.head.append(style);
}
</script>"""

HARNESS = """<!doctype html>
<html><head><meta charset="utf-8"></head>
<body>
<pre id="test-out"></pre>
<script>
const widths = __WIDTHS__;
const out = [];
let index = 0, frame = null, width = 0, timer = null;
function next() {
  if (frame) frame.remove();
  if (index >= widths.length) {
    document.getElementById('test-out').textContent = out.join('\\n') + '\\nDONE';
    return;
  }
  width = widths[index++];
  frame = document.createElement('iframe');
  frame.style.cssText = `width:${width}px;height:__HEIGHT__px;border:0;display:block`;
  frame.src = 'app.html';
  document.body.append(frame);
  clearTimeout(timer);
  timer = setTimeout(() => { out.push(`## width ${width}`, `FAIL width ${width} — 시간 초과 (결과가 오지 않음)`); next(); }, __FRAME_TIMEOUT__);
}
addEventListener('message', (event) => {
  if (!event.data || !event.data.ltw) return;
  clearTimeout(timer);
  out.push(`## width ${width}`, ...event.data.lines);
  next();
});
next();
</script>
</body></html>
"""


def find_root(arg):
    if arg:
        return Path(arg).resolve()
    cwd = Path.cwd()
    if (cwd / 'index.html').exists():
        return cwd
    # .claude/skills/ltw-test-runner/scripts/run.py -> project root
    return SCRIPTS.parents[3]


def build(root, tests, widths, frame_timeout, heads=()):
    work = Path(tempfile.gettempdir()) / 'ltw-test-run'
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True)

    page = (root / 'index.html').read_text(encoding='utf-8')
    page = re.sub(r'(src|href)="((?:css|js)/[^"]+)"',
                  lambda m: f'{m.group(1)}="{(root / m.group(2)).as_uri()}"', page)
    # Head scripts run before any app script (e.g. to put old data in localStorage before the app reads it).
    head_tags = ''
    for i, head in enumerate(heads):
        name = f'head{i}_{Path(head).name}'
        shutil.copy(head, work / name)
        head_tags += f'\n<script src="{name}"></script>'
    page = page.replace('<head>', '<head>\n' + ERROR_COLLECTOR + head_tags, 1)

    shutil.copy(SCRIPTS / 'lib.js', work / 'lib.js')
    tags = ['<script src="lib.js"></script>']
    for i, test in enumerate(tests):
        name = f'test{i}_{Path(test).name}'
        shutil.copy(test, work / name)
        tags.append(f'<script src="{name}"></script>')
    page = page.replace('</body>', '\n'.join(tags) + '\n</body>', 1)
    (work / 'app.html').write_text(page, encoding='utf-8')

    harness = (HARNESS.replace('__WIDTHS__', str(widths))
               .replace('__HEIGHT__', str(FRAME_HEIGHT))
               .replace('__FRAME_TIMEOUT__', str(frame_timeout)))
    (work / 'harness.html').write_text(harness, encoding='utf-8')
    return work


def run(browser, work, budget):
    profile = work / 'profile'  # 빈 프로필: localStorage가 비어 예시 악보부터 시작하고, 열린 브라우저와 충돌하지 않는다
    cmd = [browser, '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
           f'--user-data-dir={profile}', '--autoplay-policy=no-user-gesture-required',
           '--allow-file-access-from-files', f'--window-size=1300,{FRAME_HEIGHT + 100}',
           f'--virtual-time-budget={budget}', '--dump-dom', (work / 'harness.html').as_uri()]
    result = subprocess.run(cmd, capture_output=True, timeout=1800)
    return result.stdout.decode('utf-8', errors='replace')


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser()
    parser.add_argument('tests', nargs='+')
    parser.add_argument('--browser', default=os.environ.get('BROWSER', 'edge'))
    parser.add_argument('--widths', default=','.join(map(str, DEFAULT_WIDTHS)))
    parser.add_argument('--root')
    parser.add_argument('--head', action='append', default=[], help='앱 스크립트보다 먼저 실행할 JS (여러 번 가능)')
    parser.add_argument('--budget', type=int, default=0, help='가상 시간 ms (기본: 폭 하나당 120초)')
    parser.add_argument('--verbose', action='store_true', help='PASS 줄도 모두 출력')
    args = parser.parse_args()

    root = find_root(args.root)
    browser = BROWSERS.get(args.browser, args.browser)
    widths = [int(w) for w in args.widths.split(',') if w.strip()]
    frame_timeout = 120000
    budget = args.budget or frame_timeout * len(widths) + 10000

    work = build(root, [Path(t).resolve() for t in args.tests], widths, frame_timeout, [Path(h).resolve() for h in args.head])
    dom = run(browser, work, budget)
    match = re.search(r'<pre id="test-out">(.*?)</pre>', dom, re.S)
    text = html.unescape(match.group(1)) if match else ''

    lines = text.splitlines()
    passed = sum(1 for line in lines if line.startswith('PASS'))
    failed = [line for line in lines if line.startswith('FAIL')]
    width = None
    for line in lines:
        if line.startswith('## '):
            width = line[3:]
        elif line != 'DONE' and (args.verbose or line.startswith('FAIL')):
            print(f'[{width}] {line}')

    done = 'DONE' in lines
    print(f'\n브라우저: {Path(browser).name} / 폭: {",".join(map(str, widths))}')
    print(f'PASS {passed} / FAIL {len(failed)}' + ('' if done else ' / 끝나지 않음(가상 시간 부족 또는 브라우저 오류)'))
    print(f'임시 폴더: {work}')
    sys.exit(0 if done and passed and not failed else 1)


if __name__ == '__main__':
    main()
