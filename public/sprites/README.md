# 커스텀 스프라이트 슬롯

이 폴더에 `{id}.png` 파일을 넣으면 SpriteCache가 기본 도트 픽셀아트 대신 해당 이미지를 자동으로 우선 사용합니다.

- 협객 유닛: `src/data/units.json`의 `id` (예: `hwasan_novice.png`, `sword_saint.png`, `cheonma.png`)
- 웨이브 마물/보스: `bandit_minion.png`, `jiangshi.png`, `blood_zealot.png`, `white_tiger.png`, `black_serpent.png`, `blood_patriarch.png`
- 권장 규격: 투명 배경 PNG 도트 시트, 정사각형(128×128 또는 32×32 정배율), 발끝이 하단에 닿도록 배치 (`imageSmoothingEnabled = false` 칼도트 렌더링)
- 파일이 없으면 404 후 내장 32×32 SD 도트 아트가 그대로 유지됩니다(무해).
