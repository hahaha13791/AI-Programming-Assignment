# 거짓 FAIL을 만드는 함정

전에 실제로 겪은 문제들이다. FAIL이 나면 앱을 고치기 전에 아래부터 확인한다.

## 판정 방법
- **회전한 음표 타원의 bbox**: 음표 머리는 -20° 회전한 타원이라 `getBoundingClientRect()`가 실제보다 크게 나온다. 그래서 겹침 판정이 틀린다. 음표끼리의 겹침은 `cx` 간격(≥ 14.6 viewBox 단위)으로 판정한다.
- **SVG 좌표**: 클릭 위치는 `Staff.stepY(step)`(= 110 − (step − 2) × 8)를 `svg.getScreenCTM()`으로 화면 좌표로 바꿔 구한다. `T.clickStep`이 이미 이렇게 한다. 화면 픽셀을 직접 계산하지 않는다.
- **pointermove**: 미리보기(hover)는 `pointerType: 'mouse'`일 때만 그린다. 터치 이벤트로 보내면 아무 일도 일어나지 않는다.

## 화면 폭
- 헤드리스 창은 ~492px 아래로 줄어들지 않는다. 그래서 러너는 모든 폭을 iframe으로 돌린다. 창 크기를 바꾸려 하지 않는다.
- iframe에는 데스크톱 스크롤바(15px)가 생긴다. 러너는 480px 이하에서 `html { scrollbar-width: none }`을 넣어 휴대폰과 같게 만든다. 그보다 넓은 폭은 스크롤바가 있는 상태(데스크톱과 같음)로 잰다.
- 폭에 따라 배치가 바뀌는 기준점: `max-width: 360px`(tiny), `480px`(compact), 듣기 버튼 2열(680px). 리듬 보표와 악보의 줄 나눔은 화면 폭이 아니라 **보표 상자의 폭**을 기준으로 한다.

## 재생과 시간
- 재생이 끝나야 입력이 풀린다. 입력만 볼 때는 `T.unlock()`(= `staff.setLocked(false)`, `rhythm.setLocked(false)`)으로 기다림을 건너뛴다.
- `Date.now()`로 시간을 재는 반복은 가상 시간에서 예상과 다르게 움직일 수 있다. `T.waitFor`처럼 횟수로 기다린다.
- **파일 읽기·압축 풀기에서 "시간 초과"**: `Blob.arrayBuffer()`, `DecompressionStream` 같은 일은 페이지 밖 스레드에서 돈다. 그동안 대기 중인 타이머가 없으면 가상 시간이 러너의 결과 대기 시간(폭당 120초)까지 한 번에 건너뛰어 "결과가 오지 않음"이 된다. 테스트 파일 맨 위에서 `const ticker = setInterval(() => {}, 10)`을 돌리고 마지막 테스트 끝에서 `clearInterval(ticker)` 한다(tests/t35.js). 앱 버그가 아니다.
- **녹음 풀기(decodeAudioData)에서 "시간 초과"**: 오디오를 푸는 일도 페이지 밖 스레드에서 돈다. 이것은 ticker를 돌려도 Promise로 기다리면 끝나지 않았다. 콜백 형태(`decodeAudioData(data, ok, fail)`)로 부르고 `await new Promise((r) => setTimeout(r, 10))`를 되풀이하며 결과를 기다리면 풀린다(tests/t50.js `decodeAll`). 하나에 가상 시간 약 2초가 걸리므로 여러 개는 한꺼번에 시작해 함께 기다린다(하나씩이면 폭당 120초를 넘음). `OfflineAudioContext`를 쓴다.
- 소리 자체는 확인할 수 없다. `Sound.play`·`Sound.playEvents`가 받은 값(시각, 음높이)만 검사할 수 있다. 필요하면 테스트 안에서 함수를 감싸 인자를 기록한다.

## 상태
- 탭을 바꾸거나 난이도를 누르면 `newQuestion()`이 불려 `current`가 바뀐다. 정답을 넣기 직전에 `current`를 읽는다.
- `pick()`은 직전 문제를 피해서 고른다. 문제가 1개뿐인 풀에서만 같은 문제가 다시 나온다.
- 내 악보는 iframe끼리 같은 localStorage를 쓴다(같은 file:// 출처). 테스트에서 악보를 저장하거나 지웠다면 끝에 `localStorage.removeItem(Scores.STORAGE_KEY)`로 되돌린다. 그러지 않으면 다음 폭의 테스트가 영향을 받는다.

## 환경
- 로컬 서버로 확인할 때 브라우저가 예전 파일을 캐시에서 써서 `RHYTHMS is not defined`가 난 적이 있다. 앱 문제가 아니었다. 헤드리스 러너는 매번 빈 프로필을 쓰므로 이 문제가 없다.
- 결과가 비고 "끝나지 않음"이 뜨면: 테스트가 `await` 없이 끝나지 않는 대기에 빠졌거나, 가상 시간이 모자란 것이다. `--budget`을 늘리거나 `--widths`를 줄여 원인을 좁힌다.
