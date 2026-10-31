# 녹음 출처 (확장 8, 실제 악기 소리)

앱의 악기 소리(`js/data/instruments/*.js`)는 아래 공개 녹음을 `tools/make_instruments.py`로 다듬어(한 가지 세기, 앞의 빈 소리 자르기, 길이 줄이기, 소리 크기 맞추기, mono mp3 64kbps) 담은 것이다. 원본 녹음 파일은 저장소에 넣지 않는다(`tools/.cache/`).

| 악기 | 녹음 | 만든 이 | 이용 조건 |
|---|---|---|---|
| 피아노 | Salamander Grand Piano V3 (Yamaha C5 그랜드, 세기 v10) | Alexander Holm | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) — 출처 표기 필요. 원본: <https://github.com/sfzinstruments/SalamanderGrandPiano> |
| 바이올린 (Solo Violin, Arco Vib, p) · 플루트 (susvib) · 마림바 (Outrigger, loud) · 하프 (KSHarp, mf) | VSCO 2 Community Edition | Versilian Studios | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) — 출처 표기 의무 없음. 원본: <https://github.com/sgossner/VSCO-2-CE> |

바꾼 점: 위 녹음을 잘라 내고 소리 크기를 맞췄으며, 앱에서는 가장 가까운 녹음의 높이를 바꿔(재생 속도) 사이 음을 낸다.
