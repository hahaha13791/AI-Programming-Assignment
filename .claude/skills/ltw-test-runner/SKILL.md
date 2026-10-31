---
name: ltw-test-runner
description: Listen to the world 청음 앱을 헤드리스 Edge·Chrome으로 320~1000px 여러 화면 폭에서 자동 테스트합니다. TODO 단계의 [테스트] 항목 검증, 테스트 작성·실행, 회귀 테스트, 화면 폭별 배치 점검, "테스트 돌려 줘"를 요청할 때 사용합니다. 소리 청취 확인이나 사람이 실제 기기로 하는 확인은 대신하지 않습니다.
---

# Listen to the world 자동 테스트

`index.html`을 임시 폴더로 복사해 `file://`로 열고, 화면 폭마다 iframe을 하나씩 띄워 테스트를 돌린다.
가상 시간(`--virtual-time-budget`)으로 재생 대기를 빨리 감기 때문에 11개 폭 전체도 수 초면 끝난다.
설치할 것은 없다(Python 3, Edge 또는 Chrome만 있으면 된다).

## 실행

프로젝트 루트(`index.html`이 있는 폴더)에서 실행한다.

```bash
python .claude/skills/ltw-test-runner/scripts/run.py tests/t27.js .claude/skills/ltw-test-runner/scripts/smoke.js
python .claude/skills/ltw-test-runner/scripts/run.py tests/t27.js --browser chrome
python .claude/skills/ltw-test-runner/scripts/run.py tests/t27.js --widths 375,1000 --verbose   # 빠른 확인
```

- 기본 폭: 320, 360, 375, 412, 480, 520, 600, 680, 768, 900, 1000 (11개). 480px 이하에서는 스크롤바를 숨겨 휴대폰과 같은 폭으로 배치한다.
- 출력: FAIL 줄만 `[width N]`을 붙여 보여 주고, 마지막에 `PASS n / FAIL m`을 보여 준다. 모두 PASS일 때만 종료 코드가 0이다. `--verbose`를 주면 PASS 줄도 보인다.
- 빈 브라우저 프로필로 열고, 폭마다 페이지를 열 때 localStorage를 비운다(iframe끼리 저장소를 함께 쓰므로). 내 악보는 예시 악보부터 시작한다. 테스트에서 저장소를 바꿨다면 끝에 `localStorage.removeItem(Scores.STORAGE_KEY)`로 되돌리고, 고른 악보도 첫 악보로 돌려놓는다(뒤에 도는 smoke.js가 영향을 받는다).
- `--head <파일.js>`: 앱 스크립트보다 먼저 실행할 스크립트. 예전 저장값(v1)이 있는 브라우저처럼, 앱이 열리기 전 상태를 만들 때 쓴다(예: `--head tests/t27-v1.head.js tests/t27-v1.js`). 폭마다 iframe이 새로 열릴 때 다시 실행된다.

## 단계 테스트를 쓰는 순서

1. TODO의 [테스트] 항목을 하나씩 `T.check`로 옮긴다. check 메시지에는 항목 번호나 내용을 적는다.
2. 파일은 `tests/tNN.js`(NN = 단계 번호)로 저장소에 둔다. 다음 세션에서도 다시 돌릴 수 있어야 한다.
3. 단계 테스트와 `scripts/smoke.js`(4개 모드를 한 사이클씩 도는 회귀 테스트)를 **항상 함께** 돌린다.
4. Edge 11개 폭으로 돌리고 Chrome 11개 폭으로도 돌린다. 둘 다 FAIL 0이어야 완료다.
5. FAIL이 나면 앱부터 고치지 말고, 먼저 테스트 데이터와 기대값이 맞는지 확인한다. 예전에 "정확히 8음"이라던 시험 악보가 실제로는 9음이어서 거짓 실패가 난 적이 있다.

테스트 파일 모양:

```js
T.test('27-2 파일 선택 후 악보 목록에 추가', async (T) => {
  T.setMode('score');
  T.check(T.$('score-select').options.length === 1, '처음에는 예시 악보 1개');
  // ...
});
```

## T 도우미 (scripts/lib.js)

| 도우미 | 하는 일 |
| --- | --- |
| `T.test(name, fn)` / `T.check(cond, msg)` | 테스트 등록 / PASS·FAIL 한 줄 기록. 예외가 나면 그 테스트는 FAIL로 기록되고 다음 테스트로 넘어간다 |
| `T.setMode('melody'·'harmony'·'rhythm'·'score')`, `T.setLevel`, `T.setChordType('triad'·'seventh')` | 탭과 버튼을 실제로 클릭한다 |
| `await T.listen()` | "문제 듣기"를 누르고 재생이 끝나 입력이 풀릴 때까지 기다린다 |
| `T.unlock()` | 재생 없이 입력만 푼다(입력 동작만 볼 때) |
| `T.enterNotes(notes, container?)` | `[{step, accidental}]`를 ♯/♭ 토글과 오선 클릭으로 입력한다. `current`를 넘기면 정답이 입력된다 |
| `T.clickStep(step, container?)`, `T.hoverStep` | step(0 = C4 … 11 = G5) 위치를 클릭하거나 마우스를 올린다. 편집기 입력판은 `T.$('editor-pad')`를 넘긴다 |
| `T.enterRhythm(['q','e','e','h'])`, `T.setTime(3)` | 리듬 음표 버튼과 박자표 버튼을 누른다 |
| `T.submit()`, `T.next()`, `T.resultText()` | 제출, 다음 문제, 결과 영역 텍스트 |
| `T.wait(ms)`, `await T.waitFor(cond, timeout)` | 기다리기. 가상 시간에서도 똑같이 동작한다 |
| `T.noHorizontalOverflow()` | 가로 스크롤이 생기지 않았는지 |

앱의 최상위 변수와 객체는 테스트에서 바로 읽을 수 있다.
- 상태: `mode`, `level`, `chordType`, `current`, `chord`, `section`, `submitted`, `scoreId`
- 앱 객체: `staff`, `rhythm`, `editor`, `scores`
- 모듈: `Staff`, `Rhythm`, `Score`, `Scores`, `Sound`
- 데이터: `PATTERNS`, `CHORDS`, `RHYTHMS`

콘솔 에러는 테스트마다 자동으로 검사된다("콘솔 에러 없음" 항목).

## TODO에 남기는 근거 형식

```
— 27단계 자동 테스트 48개 항목(+ smoke 30개), 320~1000px 11개 폭 × Edge·Chrome(file://) 모두 통과 (2026-11-02)
```

자동화하지 못한 항목(🔈 청취, Edge 실제 창, 더블클릭, 실제 휴대폰)은 통과로 적지 말고 "사용자 확인 필요"로 남긴다.

## 추가 자료

- FAIL이 났는데 앱 동작은 맞아 보이거나, 위치·겹침 판정이 이상하면 `references/pitfalls.md`를 읽는다.
- 헤드리스가 아니라 실제 Chrome 창(Claude in Chrome)으로 확인해야 하면 `references/real-chrome.md`를 읽는다.
