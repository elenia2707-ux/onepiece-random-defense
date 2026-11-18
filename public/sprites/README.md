# 커스텀 스프라이트 슬롯

이 폴더에 `{id}.png` 파일을 넣으면 SpriteCache가 기본 도트 픽셀아트 대신 해당 이미지를 자동으로 우선 사용합니다.

- 유닛: `src/data/units.json`의 `id` (예: `luffy.png`, `zoro_asura.png`)
- 몬스터: `marine_grunt.png`, `pirate_raider.png`, `sea_king.png`, `pacifista.png`
- 권장 규격: 투명 배경 PNG, 정사각형(256×256 이상), 캐릭터 발끝이 이미지 하단에 닿도록 배치
- 파일이 없으면 404 후 도트 아트가 그대로 유지됩니다(무해).
