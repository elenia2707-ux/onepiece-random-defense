# AGENTS.md — 코딩 에이전트 필수 규칙

이 프로젝트는 **운빨존많겜식 UI + 원랜디식 조합**을 결합한 모바일 랜덤 디펜스입니다.
상세 설계는 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)에 있습니다. **이 파일의 규칙이 문서와 충돌하면 이 파일이 우선합니다.** 규칙을 바꿔야 한다면 코드를 고치기 전에 사용자 승인을 받고, 이 파일과 설계 문서를 함께 수정하세요.

---

## 1. 기술 스택 (변경 금지)

- **Vite + TypeScript(`strict`, `noUncheckedIndexedAccess`) + 순수 Canvas 2D + Vanilla DOM/CSS**
- `package.json`의 `dependencies`는 **항상 비어 있어야** 합니다 (런타임 의존성 0).
- 허용 devDependencies: `vite`, `typescript`, `vite-plugin-pwa`, `vitest`. 이 밖의 패키지는 사용자 승인 없이 추가하지 마세요.
- 금지: Phaser, Pixi, Three, Babylon, React/Vue/Svelte, WebGL 렌더러, CSS 프레임워크, 상태관리 라이브러리.
- 배포 대상: **GitHub Pages 정적 호스팅 + PWA(홈 화면 추가)**. 서버 코드 금지.

## 2. 렌더링 구조

- 물리 캔버스는 **정확히 3장**입니다: `#bg-canvas`(정적), `#world-canvas`(매 프레임, 입력 받는 유일한 캔버스), `#overlay-canvas`(화면 FX). 캔버스를 더 만들지 마세요.
- 그리는 순서는 `RenderLayer` 열거형(GroundFx → Shadow → Monster → Unit → Projectile → AirFx → WorldUI)으로만 정합니다. 캔버스를 추가해서 순서를 해결하지 마세요.
- 캔버스 해상도는 반드시 `Math.min(window.devicePixelRatio || 1, 2, QUALITY_DPR_CAP[quality])`로 정합니다. **DPR 2 초과 금지.** 이 계산은 `render/CanvasStack.ts` 한 곳에만 둡니다.
- 모든 그리기 좌표는 **논리 해상도 720×1280** 기준입니다. 화면 픽셀 좌표로 그리지 마세요.
- 화면 흔들림은 `#shake-layer`의 CSS transform으로만 처리합니다.
- 금지: `shadowBlur`, `ctx.filter`, 매 프레임 `fillText`(글리프 아틀라스 사용), 파티클마다 `save()/restore()`, 레이어 안에서 `globalCompositeOperation`을 반복해서 바꾸는 것.

## 3. 시뮬레이션 (결정성 최우선)

- 로직은 **정수 틱 고정 스텝**입니다: `TICK_HZ = 30`, `TICK_DT = 1/30`(상수). `dt`를 배속으로 스케일하지 마세요.
- 배속 1x/2x/3x는 **실제 1초당 처리하는 틱 수**만 바꿉니다. 프레임당 최대 `MAX_TICKS_PER_FRAME = 12`틱이고, 넘치면 남은 시간을 버립니다.
- 모든 게임 시간(쿨다운, 지속시간, `hitDelay`, 웨이브, 투사체 도착)은 **정수 틱**으로 저장합니다. JSON의 초 단위 값은 로드할 때 `secToTicks()`로 변환합니다.
- 시뮬레이션 코드(`core/Simulation`, `world/`, `skills/`, `craft/`)에서 **금지**: `Math.random()`, `Date.now()`, `performance.now()`, 프레임 dt, DOM/캔버스 접근, `Map`/`Set` 순회 순서에 의존하는 판정.
- 난수는 `core/Rng.ts`의 시드 RNG만 쓰고, 틱 안에서만 소비합니다.
- 타깃이 여러 명이면 순서를 고정합니다 (경로 진행도 내림차순 → `entityId` 오름차순).
- 렌더러는 상태를 **읽기만** 하고, `prev → curr`를 `alpha`로 보간해서 그립니다.
- VFX 진행 시간 = `(currentTick + alpha - startTick) × TICK_DT`. 프레임 dt를 누적하지 마세요. 배속과 무관해야 하는 연출만 `timeBase: 'real'`을 씁니다.
- `visibilitychange`가 hidden이 되면 자동 일시정지하고 accumulator를 0으로 리셋합니다.

## 4. 로직 ↔ 연출 ↔ UI 경계

- **판정은 `SkillSystem`/`CraftSystem`, 연출은 `VfxSystem`이 담당합니다.** VFX가 게임 상태를 바꾸거나 판정 시점을 정하면 안 됩니다. VFX를 모두 꺼도 결과는 같아야 합니다.
- 판정 시점은 `castTick + hitDelayTicks` 하나뿐입니다. VFX는 같은 `startTick`을 받아 맞춥니다.
- UI(DOM)는 게임 객체를 직접 바꾸지 않습니다. **상태 변경 = `GameCommand`를 dispatch하는 것뿐**이고, 다음 틱 시작 시 틱 번호가 찍혀 적용됩니다.
- 게임 → UI는 `UISnapshot`으로만 전달합니다. 조합/인벤토리 diff는 같은 프레임에 즉시(priority) 보내고, 나머지는 최대 10Hz로 보냅니다.
- 시스템끼리는 `EventBus`로 통신합니다. 직접 참조는 `Game.ts` 조립 단계에서만 허용합니다.
- 커맨드는 실행 시점에 **항상 다시 검증**합니다(스냅샷은 낡았을 수 있음). 실패하면 `rejects`에 사유를 넣습니다.

## 5. 조합 시스템 (원랜디식 DAG)

- 등급 순서, 이름, 색은 `data/grades.json`에만 정의합니다: 흔함(1) → 안흔함(2) → 희귀(3) → 전설(4) → 초월(5) → 불멸(6). 코드에 등급 문자열이나 숫자를 하드코딩하지 마세요.
- 같은 유닛 N개 합성 방식은 쓰지 않습니다. 조합은 **`data/recipes.json`의 이종 재료 레시피**로만 합니다.
- 레시피 로드 시 검증(실패하면 테스트/빌드 실패):
  - R1 모든 id가 존재 · R2 **모든 재료 rank < 결과 rank** · R3 위상정렬로 사이클 없음 · R4 비리프 유닛은 리프까지 전개 가능 · R5 중복 레시피 금지
- 인벤토리(필드 + 대기석) 인덱싱은 **델타 기반**입니다. `unit:added`/`unit:removed`로 바뀐 `UnitId`에 대해서만 `byIngredient`/`byClosure` 역인덱스로 영향받는 레시피를 다시 평가합니다. 매 틱 전체 재계산 금지(테스트의 정답 비교용으로만 허용).
- 램프 상태: `ready` / `chainReady` / `partial` / `none`. 잠금 유닛은 재료 개수에서 뺍니다.
- 재료 선택 정책: 잠금 제외 → 대기석 우선 → 필드는 뒤쪽 칸부터. 결과 배치: 소모된 필드 칸 → 빈 필드 칸 → 대기석.
- 체인 조합은 같은 틱 안에서 원자적으로 실행합니다(중간에 실패하면 전체 롤백).
- 위습(`useWisp`)은 난수 없이 해당 등급 풀에서 선택합니다. `wispHints`는 위습을 보유했고 인벤토리가 바뀐 틱에만 다시 계산합니다.

## 6. iOS Safari / PWA 필수 방어

- 뷰포트 메타: `width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no`. `apple-touch-icon`(180) + `apple-mobile-web-app-*` 메타 태그를 꼭 넣습니다.
- 레이아웃: `#app`은 `height: 100vh; height: 100dvh;`이고 `padding: env(safe-area-inset-*)`를 적용합니다. 논리 화면은 항상 safe-area 안쪽에 맞춥니다.
- `#bg-canvas`, `#overlay-canvas`, `#ui-root`는 **`pointer-events: none` 강제**입니다. 클릭할 DOM 요소에만 `.interactive { pointer-events: auto }`를 붙입니다.
- `touch-action: none`, `overscroll-behavior: none`, `user-select: none`, `-webkit-touch-callout: none`, `gesturestart` preventDefault를 적용합니다.
- 리사이즈는 `ResizeObserver(#app)` + `visualViewport` resize + `orientationchange`를 rAF로 디바운스해서 처리합니다.
- 오디오는 첫 사용자 입력에서 `AudioContext.resume()`. 포맷은 `.m4a`. 이미지는 WebP 아틀라스입니다.
- 오프스크린 캔버스는 `SpriteCache`로만 만들고, 해제할 때 `width = height = 0`으로 만듭니다.

## 7. 데이터 주도

- 유닛, 등급, 레시피, 스킬, VFX, 웨이브, 위습 풀, 보드 설정은 `src/data/*.json`에 둡니다. 신규 유닛·스킬은 **데이터 추가만으로** 동작해야 합니다.
- 모든 JSON은 로드 시 타입 검증을 거칩니다. 데이터 검증 테스트는 `tests/data/`에 둡니다.

## 8. 빌드 · 배포

- 에셋 경로는 `import.meta.env.BASE_URL` 기준으로 씁니다. `/assets/...` 같은 절대 경로 하드코딩 금지 (Pages 하위 경로 `/<repo>/` 대응).
- `vite.config.ts`의 `base`는 `process.env.BASE_PATH ?? '/'`로 두고, 워크플로에서 주입합니다.
- 배포는 `.github/workflows/deploy.yml`(typecheck → test → build → upload-pages-artifact → deploy-pages)로만 합니다.

## 9. 작업 완료 기준 (Definition of Done)

모든 변경은 아래를 통과해야 완료입니다.

1. `npm run typecheck` 오류 0
2. `npm run test` 통과. 특히 다음 테스트가 깨지면 안 됩니다:
   - `tests/determinism.test.ts`: 같은 시드 + 커맨드 로그에서 **1x와 3x의 `hashState()`가 일치**
   - `tests/data/recipeGraph.test.ts`: R1~R5
   - `tests/craftIndex.test.ts`: 델타 인덱싱 결과 = 전체 재계산 결과
3. `npm run build` 성공, `dependencies` 비어 있음
4. 렌더/레이아웃/입력을 바꿨다면: 모바일 Safari 기준(노치·홈바·주소창)으로 잘림과 터치 가로챔이 없는지 확인하고, 확인 방법을 보고에 적습니다.

## 10. 작업 방식

- 새 시스템을 추가할 때는 `docs/ARCHITECTURE.md` §11의 폴더 구조를 따릅니다.
- 설계를 벗어나야 할 것 같으면 구현하기 전에 멈추고 사용자에게 묻습니다.
- 성능 예산: 파티클 1,500개, VFX 인스턴스 64개, 프레임 시간이 계속 20ms를 넘으면 품질 자동 하향.
