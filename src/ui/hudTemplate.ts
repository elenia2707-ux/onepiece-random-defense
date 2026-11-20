import type { GradeId } from '../data/types';
import { escapeHtml, ICON } from './uiShared';

export interface HudShellTemplateInput {
  readonly mutedInit: boolean;
  readonly totalSkins: number;
  readonly totalUnits: number;
  readonly devEnabled: boolean;
  readonly devWispTabs: readonly { readonly id: GradeId; readonly name: string }[];
}

export function buildHudShellMarkup(input: HudShellTemplateInput): string {
  const { mutedInit, totalSkins, totalUnits, devEnabled, devWispTabs } = input;
  const devWispBtnsHtml = devWispTabs
    .map(
      (t) =>
        `<button type="button" class="dev-chip-btn interactive" data-dev-action="wisp" data-wisp-grade="${escapeHtml(t.id)}">+1 ${escapeHtml(t.name)} 기연</button>`,
    )
    .join('');

  return `
      <header class="hud-bar" aria-label="무림 전황">
        <button id="hud-wave-box" type="button" class="wave-box interactive" title="출정 난이도 및 명숙록 보기">
          <span id="hud-wave-badge" class="wave-badge">제 01 장 · 초입</span>
          <span id="hud-wave-timer" class="wave-timer">00:28</span>
        </button>

        <div id="hud-monster-gauge" class="monster-gauge">
          <div class="monster-gauge-top">
            <span id="hud-monster-title" class="monster-gauge-title">침입 마물</span>
            <span id="hud-monster-count" class="monster-gauge-count">0 / 100</span>
          </div>
          <div class="monster-gauge-track">
            <div id="hud-monster-fill" class="monster-gauge-fill"></div>
          </div>
        </div>

        <div class="hud-controls">
          <button id="btn-relic" type="button" class="hud-btn relic-btn interactive" aria-label="무림 신물 기보고">
            ${ICON.chest}<span>기보</span>
            <span id="badge-relic" class="hud-mini-badge">0</span>
          </button>
          <button id="btn-speed" type="button" class="hud-btn interactive active" aria-label="배속">1x</button>
          <button id="btn-pause" type="button" class="hud-btn interactive" aria-label="일시정지">⏸</button>
          <button id="btn-mute" type="button" class="hud-btn mute-btn interactive${mutedInit ? ' muted' : ''}" aria-label="효과음 전환">${mutedInit ? '🔇' : '🔊'}</button>
          <button id="btn-vfx-mode" type="button" class="hud-btn vfx-btn interactive" title="절기 이펙트 밀도 전환 (화려함 / 가독성)" aria-label="이펙트 가독성 전환">✨</button>
          <button id="btn-help" type="button" class="hud-btn help-btn interactive" title="강호 입문 교범 보기" aria-label="강호 입문 교범">?</button>
          <button id="btn-dev" type="button" class="hud-btn dev-btn interactive" aria-label="개발자 메뉴"${devEnabled ? '' : ' hidden style="display:none"'}>DEV</button>
        </div>
      </header>

      <div id="boss-hud-bar" class="boss-hud-bar" aria-live="polite">
        <div class="boss-hud-avatar">
          <img id="boss-hud-img" alt="" />
        </div>
        <div class="boss-hud-main">
          <div class="boss-hud-top">
            <span id="boss-hud-tag" class="boss-hud-tag">영물 강림</span>
            <span id="boss-hud-name" class="boss-hud-name">영물 백호</span>
            <span id="boss-hud-hp" class="boss-hud-hp">0 / 0</span>
          </div>
          <div class="boss-hud-track">
            <div id="boss-hud-trail" class="boss-hud-trail"></div>
            <div id="boss-hud-fill" class="boss-hud-fill"></div>
          </div>
          <div id="boss-hud-shield-track" class="boss-hud-shield-track">
            <div id="boss-hud-shield-fill" class="boss-hud-shield-fill"></div>
          </div>
          <div id="boss-hud-hint" class="boss-hud-hint"></div>
        </div>
      </div>

      <nav id="tactical-strip" class="tactical-strip" aria-label="강호 전술 지휘">
        <button id="btn-bounty" type="button" class="tac-pill bounty interactive" title="강호 현상수배범 호출 (30초 내 처치 시 영단·은자 획득)">📜 수배 (2장~)</button>
        <button id="btn-bounty-elite" type="button" class="tac-pill bounty-elite interactive" style="display:none" title="은자 300 투자로 정예 수배범 호출 (보상 2배 + 일류 기연 1개)">🔥 정예수배</button>
        <button id="btn-mission" type="button" class="tac-pill mission interactive" title="강호 의뢰 · 밀명 계약 목록">📋 의뢰 0/10</button>
        <button id="btn-dps" type="button" class="tac-pill dps interactive" title="실시간 협객 딜량 순위표">⚔ 딜량표</button>
        <button id="btn-wardrobe" type="button" class="tac-pill wardrobe interactive" title="금수화장각 — 의복·검기 스킨 뽑기 및 비무대 테마">👘 화장각 1/${totalSkins}</button>
        <button id="btn-codex" type="button" class="tac-pill codex interactive" title="무림 명숙록 · 난이도 · 비경 시련">📖 명숙록 0/${totalUnits}</button>
      </nav>

      <aside id="dps-panel" class="dps-panel interactive" aria-label="실시간 협객 딜량표">
        <div class="dps-panel-head">
          <span class="dps-panel-title">⚔ 협객 딜량 순위</span>
          <span id="dps-total-val" class="dps-panel-total">총 0</span>
          <button id="btn-dps-close" type="button" class="dps-close-btn interactive" aria-label="닫기">✕</button>
        </div>
        <div id="dps-list" class="dps-list"></div>
      </aside>

      <aside id="dev-popover" class="dev-popover interactive" aria-label="개발자 도구"${devEnabled ? '' : ' hidden style="display:none"'}>
        <div id="dev-sim-meta" class="dev-popover-meta">30Hz · Tick 0</div>
        <div class="dev-popover-grid">
          <button type="button" class="dev-chip-btn interactive" data-dev-action="coin">+500 은자</button>
          <button type="button" class="dev-chip-btn interactive" data-dev-action="luck">+5 영단</button>
          ${devWispBtnsHtml}
          <button type="button" class="dev-chip-btn dev-span-2 interactive" data-dev-action="meta">+250 주화 · +2 열쇠 · +180 비단 (난이도 해금)</button>
        </div>
      </aside>

      <div id="toast-layer" class="toast-layer" aria-live="polite"></div>

      <div id="discard-drop-zone" class="discard-drop-zone" aria-hidden="true">
        <span id="discard-drop-text" class="discard-drop-text">🔥 연단 환원 · 여기에 놓아 버리기</span>
      </div>

      <button id="bench-badge" type="button" class="bench-badge interactive" title="문파 대기석 접기/펼치기 (접기 시 비무대 확대)">${ICON.pavilion}<span>대기석</span><b id="val-bench-count">0/12</b><span id="bench-fold-arrow" class="bench-fold-arrow">▾</span></button>
      <button id="btn-auto-arrange" type="button" class="auto-arrange-btn interactive" title="비무대 빈칸 자동출전 및 대기석 서열 정렬">⚡ 자동출전</button>
      <button id="btn-preserve-bench" type="button" class="preserve-bench-btn active interactive" title="자동출전 시 대기석 패시브(진법) 협객 1인 유지 토글">🏯 진법</button>
      <button id="btn-bulk-cleanup" type="button" class="bulk-cleanup-btn interactive" title="문파 대기석의 잠금 해제된 초급 협객 일괄 정리">🧹 잉여 <b id="val-surplus-count">0</b></button>

      <div id="synergy-bar" class="synergy-bar" aria-label="출전 문파 진법 공명">
        <button id="btn-syn-orthodox" type="button" class="syn-pill syn-orthodox interactive" data-syn="orthodox" title="정파 북두검진">정<b id="syn-val-orthodox">0</b></button>
        <button id="btn-syn-unorthodox" type="button" class="syn-pill syn-unorthodox interactive" data-syn="unorthodox" title="사파 만독혈진">사<b id="syn-val-unorthodox">0</b></button>
        <button id="btn-syn-demonic" type="button" class="syn-pill syn-demonic interactive" data-syn="demonic" title="마교 천마혈진">마<b id="syn-val-demonic">0</b></button>
        <button id="btn-syn-trinity" type="button" class="syn-pill syn-trinity interactive" data-syn="trinity" title="삼재귀원 삼재합진">삼재</button>
      </div>

      <section id="recommend-bar" class="recommend-bar interactive" aria-label="추천 합공식">
        <span id="rec-tag" class="recommend-tag">등선 추천</span>
        <div class="unit-portrait-box rec-portrait"><img id="rec-img" alt="" /></div>
        <div class="rec-meta">
          <div class="unit-title-row">
            <span id="rec-grade" class="grade-pill">이류</span>
            <span id="rec-name" class="unit-name-label">-</span>
          </div>
          <div id="rec-ings" class="rec-ings"></div>
        </div>
        <div class="rec-actions">
          <button id="btn-rec-craft-all" type="button" class="rec-all-btn interactive" title="가능한 상위 합공을 한 번에 모두 실행">⚡전부</button>
          <button id="btn-rec-cta" type="button" class="rec-cta interactive">합공보</button>
        </div>
      </section>

      <section id="unit-select-bar" class="unit-select-bar" aria-label="선택 협객">
        <div class="unit-select-left">
          <div class="unit-portrait-box">
            <img id="sel-unit-img" alt="" />
          </div>
          <div class="unit-meta-col">
            <div class="unit-title-row">
              <span id="sel-unit-grade" class="grade-pill">삼류</span>
              <span id="sel-unit-faction" class="grade-pill">정파</span>
              <span id="sel-unit-name" class="unit-name-label">화산 막내도사</span>
              <span id="sel-unit-stat" class="unit-stat-label">⚔ 27</span>
            </div>
            <div id="sel-unit-shortcuts" class="unit-recipe-shortcuts"></div>
          </div>
        </div>
        <div class="unit-select-actions">
          <button id="btn-unit-ascend" type="button" class="mini-3d-btn ascend-btn interactive">⚡ 등선</button>
          <button id="btn-unit-awaken" type="button" class="mini-3d-btn awaken-btn interactive">⭐ 각성</button>
          <button id="btn-unit-lock" type="button" class="mini-3d-btn interactive">잠금</button>
          <button id="btn-unit-sell" type="button" class="mini-3d-btn sell-btn interactive">🗑 버리기</button>
        </div>
      </section>

      <footer class="bottom-dock" aria-label="무림 지휘 독">
        <div class="currency-bar">
          <div class="currency-group">
            <span class="currency-pill coin" title="은자">${ICON.coin}<span id="val-coin">0</span></span>
            <span class="currency-pill luck" title="영단">${ICON.elixir}<span id="val-luck">0</span></span>
            <span class="currency-pill wisp" title="기연 비급">${ICON.wisp}<span id="val-wisp">0</span></span>
          </div>
          <button id="relic-buff-strip" type="button" class="relic-buff-strip interactive" title="무림 신물 기보고 열기"></button>
          <span id="val-occupancy" class="slot-occupancy">비무대 0/18</span>
        </div>

        <div class="action-row">
          <button id="btn-summon" type="button" class="action-btn btn-summon interactive">
            <span class="action-icon">${ICON.summon}</span>
            <span class="action-title">초출강호</span>
            <span class="action-cost">${ICON.coin}<span id="val-summon-cost">22</span></span>
          </button>

          <button id="btn-gamble" type="button" class="action-btn btn-gamble interactive">
            <span id="badge-gamble" class="lamp-badge">0</span>
            <span class="action-icon">${ICON.gourd}</span>
            <span class="action-title">영약 복용</span>
            <span class="action-cost">${ICON.elixir}<span>1~4</span></span>
          </button>

          <button id="btn-wisp" type="button" class="action-btn btn-wisp interactive">
            <span id="badge-wisp" class="lamp-badge">0</span>
            <span class="action-icon">${ICON.wisp}</span>
            <span class="action-title">기연</span>
            <span class="action-cost">비급 초빙</span>
          </button>

          <button id="btn-craft" type="button" class="action-btn btn-craft interactive">
            <span id="badge-craft" class="lamp-badge">0</span>
            <span class="action-icon">${ICON.swords}</span>
            <span class="action-title">합공·등선</span>
            <span id="val-craft-state" class="action-cost">합공보</span>
          </button>

          <button id="btn-upgrade" type="button" class="action-btn btn-upgrade interactive">
            <span class="action-icon">${ICON.qi}</span>
            <span class="action-title">내공 수련</span>
            <span id="val-upgrade-state" class="action-cost">Lv.0</span>
          </button>
        </div>
      </footer>

      <div id="sheet-backdrop" class="sheet-backdrop interactive" role="dialog" aria-modal="true">
        <div id="bottom-sheet" class="bottom-sheet">
          <div class="sheet-header">
            <div class="sheet-title-wrap">
              <div id="sheet-title" class="sheet-title">합공 · 등선</div>
              <div id="sheet-subtitle" class="sheet-subtitle"></div>
            </div>
            <button id="btn-sheet-close" type="button" class="sheet-close-btn interactive" aria-label="닫기">✕</button>
          </div>
          <div id="sheet-tabs" class="sheet-tabs"></div>
          <div id="sheet-body" class="sheet-body"></div>
        </div>
      </div>

      <button id="boon-peek-pill" type="button" class="boon-peek-pill interactive">
        ☯ 강호 기연 3택 1 선택 대기중 — 비급 펼치기
      </button>

      <div id="boon-modal" class="boon-modal interactive" role="dialog" aria-modal="true" aria-label="강호 기연 3택 1">
        <div class="boon-shell">
          <div class="boon-header">
            <div class="boon-kicker">☯ 영물 토벌 보상 · 강호 기연 전수</div>
            <div id="boon-title" class="boon-title">제 05 장 비전 비급 3택 1</div>
            <div class="boon-subtitle">이번 출정 내내 영구 발동·중첩되는 무림 비급 하나를 택하십시오</div>
          </div>
          <div id="boon-cards" class="boon-cards"></div>
          <div class="boon-footer">
            <button id="btn-boon-reroll" type="button" class="boon-reroll-btn interactive">🎲 비급 다시 뽑기 (150은자)</button>
            <button id="btn-boon-peek" type="button" class="boon-peek-btn interactive">👁 비무대 전황 살펴보기</button>
          </div>
        </div>
      </div>

      <div id="contract-modal" class="contract-modal interactive" role="dialog" aria-modal="true" aria-label="강호 밀명 3택 1">
        <div class="boon-shell contract-shell">
          <div class="boon-header">
            <div class="boon-kicker">📜 고위험 · 고보상 강호 밀명</div>
            <div id="contract-modal-title" class="boon-title">제 05 장 강호 밀명 3택 1</div>
            <div class="boon-subtitle">보증금을 예치하고 기한 내 달성하면 전액 환급 + 막대한 보상! 실패 시 보증금 몰수</div>
          </div>
          <div id="contract-modal-cards" class="boon-cards"></div>
          <div class="boon-footer">
            <button id="btn-contract-later" type="button" class="boon-peek-btn interactive">⏳ 나중에 선택 (의뢰 탭)</button>
            <button id="btn-contract-decline" type="button" class="boon-reroll-btn contract-decline-btn interactive">✕ 이번 밀명 거절</button>
          </div>
        </div>
      </div>

      <div id="gameover-modal" class="gameover-modal interactive" role="alertdialog" aria-modal="true">
        <div id="gameover-card" class="gameover-card">
          <div id="gameover-title" class="gameover-title">비무대 함락 · 출정 정산</div>
          <div id="gameover-sub" class="gameover-sub">제 01 장</div>
          <div id="gameover-loot" class="gameover-loot"></div>
          <div class="gameover-actions">
            <button id="btn-gameover-endless" type="button" class="card-cta-btn cta-crimson interactive">⚔ 무한 혈투 (31장~)</button>
            <button id="btn-gameover-inspect" type="button" class="card-cta-btn interactive">전장 확인</button>
            <button id="btn-gameover-relic" type="button" class="card-cta-btn cta-sky interactive">무림 신물</button>
            <button id="btn-gameover-restart" type="button" class="card-cta-btn cta-green interactive">재출정</button>
          </div>
        </div>
      </div>
    `;
}
