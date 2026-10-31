# 실제 Chrome 창으로 확인하기 (Claude in Chrome)

헤드리스로 확인할 수 없는 것(실제 마우스 동작, 화면 캡처, 눈으로 보는 배치)을 볼 때만 쓴다.

## 여는 방법
- `file://` 주소는 "파일 URL 액세스 허용"을 켜도 navigate가 거부된다. 프로젝트 루트에서 로컬 서버를 띄워 localhost로 연다.
  `python -m http.server 8765 --bind 127.0.0.1` → `http://127.0.0.1:8765/index.html`
- 확인이 끝나면 서버를 반드시 종료한다. `file://`로 동작하는지는 헤드리스 러너로 확인한다.
- 파일을 고친 뒤에는 캐시 때문에 예전 JS가 뜰 수 있다. 강력 새로고침을 하거나 주소에 `?v=2`를 붙인다.

## 휴대폰 폭
- 창이 최대화돼 있으면 `resize_window`가 듣지 않는다. 같은 탭에서 JS로 `<iframe src="index.html" style="width:375px;height:800px">`를 띄워 확인한다. 같은 출처라 `iframe.contentWindow`로 상태를 읽을 수 있다.
- iframe 문서에 `html{scrollbar-width:none}`을 넣은 뒤에 잰다. 넣지 않으면 데스크톱 스크롤바 15px 때문에 휴대폰보다 좁게 배치된다.

## 클릭과 캡처
- 스크린샷 좌표계(예: 1568폭)는 `innerWidth`(예: 1920)와 다르다. 클릭 좌표는 JS로 `getBoundingClientRect() × (스크린샷 폭 / innerWidth)`로 계산하거나, `find`로 얻은 ref로 클릭한다.
- 탭 전환이나 navigate 직후의 첫 클릭은 무시될 수 있다. 잠깐 기다린 뒤 다시 시도한다.
- 탭이 숨겨지면(hidden) 스크린샷이 시간 초과되고 rAF가 멈춘다. 측정은 `setTimeout`으로 돌려 `window` 변수에 쌓아 두고 나중에 읽는다.
- `javascript_tool`은 45초 제한이 있다. 긴 시나리오는 페이지 안에서 비동기로 돌리고 결과를 `window.__results`에 쌓은 뒤 나중에 읽는다.
- 앱 상태는 `javascript_tool`에서 `mode`, `current`, `chord`, `level` 같은 최상위 `let`으로 읽는다(`window.mode`로는 읽히지 않는다).
- 브라우저 확인창(alert/confirm)을 띄우는 동작은 하지 않는다. 앱의 삭제 버튼은 두 번 누르는 방식이라 확인창이 뜨지 않는다.
