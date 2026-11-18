# 커스텀 스프라이트 슬롯 (36종 전수 수록)

이 폴더에는 30종의 무림 협객과 6종의 마물·영물 보스 전원의 전용 `192×192` 투명 배경 도트 PNG가 1:1로 수록되어 있으며, `SpriteCache`가 최우선 로드하여 `imageSmoothingEnabled = false` 칼도트로 렌더링합니다.

- 협객 유닛 (30종): `src/data/units.json`의 모든 `id` (`shaolin_novice.png` ~ `cheonma.png`)
- 웨이브 마물 / 영물 보스 (6종): `bandit_minion.png`, `jiangshi.png`, `blood_zealot.png`, `white_tiger.png`, `black_serpent.png`, `blood_patriarch.png`
- 권장 규격: 투명 배경 PNG 도트 시트, 정사각형(`192×192` 또는 `32×32` 정배율), 발끝이 하단(`y=188`)에 닿도록 배치
- 파일이 없을 경우에만 내장 `32×32` SD 도트 폴백이 사용됩니다.
