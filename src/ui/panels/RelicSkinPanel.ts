import {
  DIFFICULTY_CONFIGS,
  formatRelicStatSummary,
  getAbacusSummonDiscount,
  getArmorGauntletShred,
  getCritBladeChanceBps,
  getSkillJadeDamagePct,
  getSlayerBannerBossPct,
  getSwiftBootsSpeedPct,
  getVaultInterestCap,
  getVaultInterestPct,
  RELIC_CATEGORY_MAP,
  RELIC_STANDARD_CAP,
  TRIAL_CONFIGS,
} from '../../core/relicFormulas';
import type { UISnapshot } from '../../core/Simulation';
import type { CourtSkinId, GameDataBundle } from '../../data/types';
import {
  computeSettlementReward,
  getRelicUpgradeGoldCost,
  type MetaProfile,
  RELIC_CHEST_GOLD_COST,
  type SettlementRecord,
  SKIN_MULTI5_GOLD_COST,
  SKIN_SINGLE_GOLD_COST,
} from '../../platform/MetaStore';
import type { SpriteCache } from '../../render/SpriteCache';
import {
  escapeHtml,
  FACTION_META,
  ICON,
  type RelicFilterId,
  type RelicNoticeView,
  SKIN_RARITY_META,
  type SkinPullView,
  UNLOCK_COND_LABEL,
  type WardrobeSubTab,
} from '../uiShared';

export interface RelicPanelParams {
  readonly data: GameDataBundle;
  readonly sprites: SpriteCache;
  readonly snapshot: UISnapshot;
  readonly meta: MetaProfile;
  readonly settledRec: SettlementRecord | null;
  readonly lastRelicNotice: RelicNoticeView | null;
  readonly relicFilter: RelicFilterId;
  readonly backupInputDraft: string;
  readonly confirmArmed: boolean;
}

export interface RelicPanelResult {
  readonly subtitle: string;
  readonly bodyHtml: string;
}

export function buildRelicPanelView(params: RelicPanelParams): RelicPanelResult {
  const {
    data,
    sprites,
    snapshot,
    meta,
    settledRec,
    lastRelicNotice,
    relicFilter,
    backupInputDraft,
    confirmArmed,
  } = params;

  const ownedCount = data.relics.filter((d) => (meta.relics[d.id] ?? 0) > 0).length;
  const transcendedCount = data.relics.filter((d) => (meta.relics[d.id] ?? 0) > RELIC_STANDARD_CAP).length;
  const allMaxed = data.relics.every((d) => (meta.relics[d.id] ?? 0) >= d.maxLevel);
  const bestWaveStr = String(meta.bestWave).padStart(2, '0');
  const transSuffix = transcendedCount > 0 ? ` · 초월 ${transcendedCount}` : '';
  const subtitle = `해금 ${ownedCount}/${data.relics.length}${transSuffix} · 최고 제 ${bestWaveStr} 장 · 영구 계승`;

  const canDrawKey = !allMaxed && meta.keys >= 1;
  const bulkKeyCount = Math.min(10, meta.keys);
  const canDrawBulkKey = !allMaxed && meta.keys >= 2;
  const canDrawGold = !allMaxed && meta.gold >= RELIC_CHEST_GOLD_COST;
  const canDrawGold5 = !allMaxed && meta.gold >= RELIC_CHEST_GOLD_COST * 5;

  let noticeHtml = '';
  if (lastRelicNotice?.batchItems && lastRelicNotice.batchItems.length > 0) {
    const itemsHtml = lastRelicNotice.batchItems
      .map((entry) => {
        const rDef = data.relicsById.get(entry.relicId);
        const rPortrait = sprites.relicPortraitUrl(entry.relicId, entry.newLevel);
        const deltaTxt = entry.isNew
          ? `NEW Lv.${entry.newLevel}`
          : `Lv.${entry.prevLevel}→${entry.newLevel}`;
        const cls =
          entry.newLevel >= (rDef?.maxLevel ?? 15)
            ? ' batch-mythic'
            : entry.newLevel > RELIC_STANDARD_CAP
              ? ' batch-transcend'
              : entry.isNew
                ? ' batch-new'
                : '';
        return `
          <div class="relic-batch-chip${cls}">
            <img src="${rPortrait}" alt="${escapeHtml(rDef?.name ?? '')}" />
            <div class="relic-batch-chip-meta">
              <span class="relic-batch-chip-name">${escapeHtml(rDef?.name ?? entry.relicId)}</span>
              <span class="relic-batch-chip-lv">${deltaTxt}${entry.pulls > 1 ? ` (×${entry.pulls})` : ''}</span>
            </div>
          </div>
        `;
      })
      .join('');
    noticeHtml = `
      <div id="relic-notice-banner" class="relic-batch-showcase">
        <div class="relic-batch-head">${escapeHtml(lastRelicNotice.text)}</div>
        <div class="relic-batch-grid">${itemsHtml}</div>
      </div>
    `;
  } else if (lastRelicNotice?.relicId) {
    const n = lastRelicNotice;
    const rDef = data.relicsById.get(n.relicId!);
    const rLv = n.newLevel ?? 1;
    const rPrev = n.prevLevel ?? 0;
    const rPortrait = sprites.relicPortraitUrl(n.relicId!, rLv);
    const maxLv = rDef?.maxLevel ?? 15;
    const badgeLabel = n.isNew
      ? '✨ NEW 신물 해금'
      : rLv >= maxLv
        ? '👑 태극신화 달성!'
        : rLv > RELIC_STANDARD_CAP
          ? `🌌 초월 제련 Lv.${rPrev} → Lv.${rLv}`
          : `⬆️ 제련 승급 Lv.${rPrev} → Lv.${rLv}`;
    const tierCls =
      rLv >= maxLv
        ? ' tier-mythic'
        : rLv > RELIC_STANDARD_CAP
          ? ' tier-transcend'
          : rLv >= 5
            ? ' tier-master'
            : '';
    noticeHtml = `
      <div id="relic-notice-banner" class="relic-pull-showcase${tierCls}">
        <div class="relic-pull-avatar">
          <img src="${rPortrait}" alt="${escapeHtml(rDef?.name ?? '')}" />
        </div>
        <div class="relic-pull-meta">
          <div class="relic-pull-badges">
            <span class="relic-pull-state">${badgeLabel}</span>
            ${rDef ? `<span class="grade-pill relic-tag-pill">${escapeHtml(rDef.tag)}</span>` : ''}
          </div>
          <div class="relic-pull-title">${escapeHtml(rDef?.name ?? n.text)}</div>
          <div class="relic-pull-stat">${escapeHtml(formatRelicStatSummary(n.relicId!, rLv))}</div>
        </div>
      </div>
    `;
  } else {
    const noticeText = lastRelicNotice
      ? lastRelicNotice.text
      : '🏺 기보함을 개봉해 무림 12대 신물을 해금하고 Lv.15 초월 신화 경지까지 제련하세요!';
    const noticeClass = lastRelicNotice ? 'relic-notice-banner win' : 'relic-notice-banner';
    noticeHtml = `<div id="relic-notice-banner" class="${noticeClass}">${escapeHtml(noticeText)}</div>`;
  }

  const econCount = data.relics.filter((d) => RELIC_CATEGORY_MAP[d.id] === 'economy').length;
  const combatCount = data.relics.filter((d) => RELIC_CATEGORY_MAP[d.id] === 'combat').length;
  const filteredRelics =
    relicFilter === 'all'
      ? data.relics
      : data.relics.filter((d) => RELIC_CATEGORY_MAP[d.id] === relicFilter);

  const filterBarHtml = `
    <div class="codex-filter-row relic-filter-row">
      <button type="button" class="codex-filter-btn${relicFilter === 'all' ? ' active' : ''} interactive" data-sheet-action="relic-filter" data-filter="all">전체 (${data.relics.length})</button>
      <button type="button" class="codex-filter-btn${relicFilter === 'economy' ? ' active' : ''} interactive" data-sheet-action="relic-filter" data-filter="economy">경제·기연 (${econCount})</button>
      <button type="button" class="codex-filter-btn${relicFilter === 'combat' ? ' active' : ''} interactive" data-sheet-action="relic-filter" data-filter="combat">전투·토벌 (${combatCount})</button>
    </div>
  `;

  const cardsHtml = filteredRelics
    .map((def) => {
      const lv = meta.relics[def.id] ?? 0;
      const isOwned = lv > 0;
      const isTranscend = lv > RELIC_STANDARD_CAP && lv < def.maxLevel;
      const isMax = lv >= def.maxLevel;
      const cost = getRelicUpgradeGoldCost(def, lv);
      const affordable = !isMax && meta.gold >= cost;

      let liveBadgeHtml = '';
      if (def.id === 'golden_vault' && isOwned) {
        const pct = getVaultInterestPct(lv);
        const cap = getVaultInterestCap(lv);
        const est = Math.min(cap, Math.floor((snapshot.coin * pct) / 100));
        liveBadgeHtml = `<span class="relic-live-chip">예상 이자 +${est} 은자</span>`;
      } else if (def.id === 'million_sword_seal' && isOwned) {
        const curPct = (snapshot.relicBonus.wealthAtkBps / 100).toFixed(1);
        liveBadgeHtml = `<span class="relic-live-chip">현재 공증 +${curPct}%</span>`;
      } else if (def.id === 'bandit_dagger' && snapshot.relicBonus.pilferedCoinTotal > 0) {
        liveBadgeHtml = `<span class="relic-live-chip">강탈 +${snapshot.relicBonus.pilferedCoinTotal} 은자</span>`;
      } else if (def.id === 'wind_swift_boots' && isOwned) {
        liveBadgeHtml = `<span class="relic-live-chip">공속 +${getSwiftBootsSpeedPct(lv)}%</span>`;
      } else if (def.id === 'crimson_crit_blade' && isOwned) {
        liveBadgeHtml = `<span class="relic-live-chip">회심 +${(getCritBladeChanceBps(lv) / 100).toFixed(1)}%</span>`;
      } else if (def.id === 'armor_break_gauntlet' && isOwned) {
        liveBadgeHtml = `<span class="relic-live-chip">파갑 +${getArmorGauntletShred(lv)}</span>`;
      } else if (def.id === 'celestial_skill_jade' && isOwned) {
        liveBadgeHtml = `<span class="relic-live-chip">절기 +${getSkillJadeDamagePct(lv)}%</span>`;
      } else if (def.id === 'demon_slayer_banner' && isOwned) {
        liveBadgeHtml = `<span class="relic-live-chip">보스 +${getSlayerBannerBossPct(lv)}%</span>`;
      } else if (def.id === 'merchant_abacus' && isOwned) {
        liveBadgeHtml = `<span class="relic-live-chip">소환 -${getAbacusSummonDiscount(lv)} 은자</span>`;
      }

      let statLine = '';
      if (!isOwned) {
        statLine = `<span class="relic-lore">${escapeHtml(def.desc)}</span> · 해금(Lv.1): <b class="up-next">${escapeHtml(formatRelicStatSummary(def.id, 1))}</b>`;
      } else if (isMax) {
        statLine = `<b>${escapeHtml(formatRelicStatSummary(def.id, lv))}</b> <span class="relic-max-note">(태극신화 Lv.${def.maxLevel} 달성)</span>`;
      } else {
        const nextPrefix = lv >= RELIC_STANDARD_CAP ? `초월 Lv.${lv + 1}` : `Lv.${lv + 1}`;
        statLine = `${escapeHtml(formatRelicStatSummary(def.id, lv))} → <b class="up-next">${nextPrefix}: ${escapeHtml(formatRelicStatSummary(def.id, lv + 1))}</b>`;
      }

      const lvBadgeBg = isMax
        ? '#9333ea'
        : isTranscend
          ? '#7c3aed'
          : lv >= RELIC_STANDARD_CAP
            ? '#dc2626'
            : lv >= 5
              ? '#b45309'
              : isOwned
                ? '#d97706'
                : '#334155';
      const lvBadgeTxt = isMax
        ? `신화 Lv.${lv}`
        : isTranscend
          ? `초월 Lv.${lv}/${def.maxLevel}`
          : isOwned
            ? `Lv.${lv}/${def.maxLevel}`
            : '봉인됨';
      const ctaLabel = isMax
        ? '신화'
        : lv >= RELIC_STANDARD_CAP
          ? '초월 제련'
          : isOwned
            ? '제련'
            : '지정 해금';
      const cardTierCls = isMax
        ? ' relic-owned relic-mythic'
        : isTranscend
          ? ' relic-owned relic-transcend'
          : lv >= 5
            ? ' relic-owned relic-master'
            : isOwned
              ? ' relic-owned'
              : ' relic-locked';
      const portraitUrl = sprites.relicPortraitUrl(def.id, lv);
      const pipsHtml = Array.from({ length: def.maxLevel }, (_, idx) => {
        const filled = idx < lv;
        const isOverPip = idx >= RELIC_STANDARD_CAP;
        const pipCls = !filled
          ? isOverPip
            ? ' over-empty'
            : ''
          : isMax
            ? ' max'
            : isOverPip
              ? ' trans'
              : lv >= 5
                ? ' high'
                : ' on';
        return `<span class="relic-lv-pip${pipCls}"></span>`;
      }).join('');

      return `
        <div class="sheet-card relic-card${cardTierCls}">
          <div class="card-left">
            <div class="card-avatar relic-avatar">
              <img src="${portraitUrl}" alt="${escapeHtml(def.name)}" />
            </div>
            <div class="card-info">
              <div class="card-name-row">
                <span class="grade-pill" style="background:${lvBadgeBg}">${lvBadgeTxt}</span>
                <span class="grade-pill relic-tag-pill">${escapeHtml(def.tag)}</span>
                <span class="card-name">${escapeHtml(def.name)}</span>
                ${liveBadgeHtml}
              </div>
              <div class="card-sub">${statLine}</div>
              <div class="relic-lv-track" aria-hidden="true">${pipsHtml}</div>
            </div>
          </div>
          <button
            type="button"
            class="card-cta-btn ${affordable ? (lv >= RELIC_STANDARD_CAP ? 'cta-violet interactive' : isOwned ? 'interactive' : 'cta-sky interactive') : 'cta-disabled'}"
            data-sheet-action="relic-upgrade"
            data-relic-id="${def.id}"
            ${affordable ? '' : 'disabled'}
          >
            <span>${ctaLabel}</span>
            ${isMax ? '' : `<span class="mini-price">${ICON.goldCoin}${cost}</span>`}
          </button>
        </div>
      `;
    })
    .join('');

  const diffCfg = DIFFICULTY_CONFIGS[snapshot.difficulty];
  const trialCfg = snapshot.trialId ? TRIAL_CONFIGS[snapshot.trialId] : null;
  const modeBadge = trialCfg ? `${trialCfg.badge} ${trialCfg.rewardMult}x` : diffCfg.badge;
  const preview = computeSettlementReward({
    wave: snapshot.wave,
    monstersSlain: snapshot.monstersSlain,
    bossesSlain: snapshot.bossesSlain,
    bountiesSlain: snapshot.bounty.bountiesSlain,
    difficulty: snapshot.difficulty,
    trialId: snapshot.trialId,
    victory: snapshot.victoryAchieved,
  });
  const canEarlySettle = !snapshot.gameOver && !snapshot.victoryHold && snapshot.wave >= 2;
  const targetWaveStr = String(snapshot.clearTargetWave).padStart(2, '0');

  let settleFooterHtml = '';
  if (snapshot.victoryHold) {
    settleFooterHtml = `
      <div class="settlement-preview-bar victory-bar">
        <div class="settlement-preview-info">
          <span class="settlement-preview-title">🏆 제 ${targetWaveStr} 장 ${trialCfg ? '비경 제패' : '천하통일'} 정산 완료!</span>
          <span class="settlement-preview-sub">신물을 제련한 뒤 즉시 ${snapshot.clearTargetWave + 1}장 무한 혈투에 돌입하거나 금의환향할 수 있습니다!</span>
        </div>
        <div class="relic-draw-btns">
          <button type="button" class="card-cta-btn cta-crimson interactive" data-sheet-action="enter-endless">
            <span>⚔ 무한 혈투</span>
          </button>
          <button type="button" class="card-cta-btn cta-green interactive" data-sheet-action="restart-run">
            <span>새 출정</span>
          </button>
        </div>
      </div>
    `;
  } else if (snapshot.gameOver) {
    settleFooterHtml = `
      <div class="settlement-preview-bar">
        <div class="settlement-preview-info">
          <span class="settlement-preview-title">이번 출정 정산 완료!</span>
          <span class="settlement-preview-sub">획득 보상: 천하주화 +${settledRec?.goldEarned ?? preview.goldEarned} · 열쇠 +${settledRec?.keysEarned ?? preview.keysEarned}</span>
        </div>
        <button type="button" class="card-cta-btn cta-green interactive" data-sheet-action="restart-run">
          <span>재출정</span>
        </button>
      </div>
    `;
  } else {
    settleFooterHtml = `
      <div class="settlement-preview-bar">
        <div class="settlement-preview-info">
          <span class="settlement-preview-title">현재 출정 정산 예상 (제 ${String(snapshot.wave).padStart(2, '0')} 장 · ${modeBadge})</span>
          <span class="settlement-preview-sub">회군 시 영구 보상: 천하주화 +${preview.goldEarned.toLocaleString('ko-KR')} · 기보함 열쇠 +${preview.keysEarned}개</span>
        </div>
        <button
          type="button"
          class="card-cta-btn ${canEarlySettle ? 'cta-green interactive' : 'cta-disabled'}"
          data-sheet-action="settle-run"
          ${canEarlySettle ? '' : 'disabled'}
        >
          <span>${canEarlySettle ? '회군 정산' : '2장부터'}</span>
        </button>
      </div>
    `;
  }

  const abandonBtnHtml =
    !snapshot.gameOver && !snapshot.victoryHold
      ? `
        <button
          type="button"
          class="card-cta-btn ${confirmArmed ? 'cta-crimson' : ''} interactive"
          data-sheet-action="abandon-restart"
        >
          <span>${confirmArmed ? '⚠ 한 번 더 터치' : '🔄 처음부터'}</span>
        </button>
      `
      : '';

  const backupPanelHtml = `
    <div class="backup-save-panel">
      <div class="backup-save-top">
        <div class="settlement-preview-info">
          <span class="settlement-preview-title">💾 자동 이어하기 작동 중 · 영구 세이브 백업</span>
          <span class="settlement-preview-sub">브라우저를 닫거나 새로고침해도 현재 출정 장수가 자동 복원됩니다. 기기 변경 시 백업 코드로 영구 재화·신물·스킨·명숙록을 계승하세요.</span>
        </div>
        <div class="relic-draw-btns">
          ${abandonBtnHtml}
          <button type="button" class="card-cta-btn cta-sky interactive" data-sheet-action="backup-export">
            <span>📋 백업 복사</span>
          </button>
        </div>
      </div>
      <div class="backup-code-row">
        <input
          id="backup-code-input"
          type="text"
          class="backup-code-input interactive"
          value="${escapeHtml(backupInputDraft)}"
          placeholder="MRD1-... 백업 코드를 붙여넣고 [코드 복원]을 누르세요"
          spellcheck="false"
          autocomplete="off"
        />
        <button type="button" class="card-cta-btn cta-green interactive" data-sheet-action="backup-import">
          <span>📥 코드 복원</span>
        </button>
      </div>
    </div>
  `;

  const bodyHtml = `
    <div class="relic-gacha-panel">
      <div class="relic-wallet-row">
        <div class="relic-wallet-pills">
          <span class="relic-wallet-pill">${ICON.goldCoin}<span>천하주화</span><b>${meta.gold.toLocaleString('ko-KR')}</b></span>
          <span class="relic-wallet-pill key">${ICON.key}<span>기보함 열쇠</span><b>${meta.keys}</b></span>
        </div>
        <div class="relic-draw-btns relic-draw-grid">
          <button
            type="button"
            class="card-cta-btn cta-green ${canDrawKey ? 'interactive' : 'cta-disabled'}"
            data-sheet-action="relic-draw"
            data-pay="key"
            data-count="1"
            ${canDrawKey ? '' : 'disabled'}
          >
            <span>열쇠 ×1</span>
            <span class="mini-price">${ICON.key}1</span>
          </button>
          <button
            type="button"
            class="card-cta-btn cta-violet ${canDrawBulkKey ? 'interactive' : 'cta-disabled'}"
            data-sheet-action="relic-draw"
            data-pay="key"
            data-count="${Math.max(2, bulkKeyCount)}"
            ${canDrawBulkKey ? '' : 'disabled'}
          >
            <span>일괄 ×${canDrawBulkKey ? bulkKeyCount : 10}</span>
            <span class="mini-price">${ICON.key}${canDrawBulkKey ? bulkKeyCount : '2~10'}</span>
          </button>
          <button
            type="button"
            class="card-cta-btn ${canDrawGold ? 'interactive' : 'cta-disabled'}"
            data-sheet-action="relic-draw"
            data-pay="gold"
            data-count="1"
            ${canDrawGold ? '' : 'disabled'}
          >
            <span>주화 ×1</span>
            <span class="mini-price">${ICON.goldCoin}${RELIC_CHEST_GOLD_COST}</span>
          </button>
          <button
            type="button"
            class="card-cta-btn cta-sky ${canDrawGold5 ? 'interactive' : 'cta-disabled'}"
            data-sheet-action="relic-draw"
            data-pay="gold"
            data-count="5"
            ${canDrawGold5 ? '' : 'disabled'}
          >
            <span>주화 ×5</span>
            <span class="mini-price">${ICON.goldCoin}${RELIC_CHEST_GOLD_COST * 5}</span>
          </button>
        </div>
      </div>
      ${noticeHtml}
    </div>
    ${filterBarHtml}
    ${cardsHtml}
    ${settleFooterHtml}
    ${backupPanelHtml}
  `;

  return { subtitle, bodyHtml };
}

export interface WardrobePanelParams {
  readonly data: GameDataBundle;
  readonly sprites: SpriteCache;
  readonly meta: MetaProfile;
  readonly subTab: WardrobeSubTab;
  readonly lastSkinPull: SkinPullView | null;
}

export interface WardrobePanelResult {
  readonly subtitle: string;
  readonly bodyHtml: string;
}

export function buildWardrobePanelView(params: WardrobePanelParams): WardrobePanelResult {
  const { data, sprites, meta, subTab, lastSkinPull } = params;
  const totalSkins = data.heroSkins.length + data.courtSkins.length;
  const ownedHeroCount = data.heroSkins.filter((s) => Boolean(meta.ownedSkins[s.id])).length;
  const ownedCourtCount = data.courtSkins.filter((c) => Boolean(meta.ownedSkins[c.id])).length;

  const subtitle = `수집 ${meta.ownedSkinCount}/${totalSkins}종 · 의복·검기·절기 이펙트 영구 변모 (전투 능력치 변동 없음)`;

  const canDrawKey1 = meta.keys >= 1;
  const canDrawGold1 = meta.gold >= SKIN_SINGLE_GOLD_COST;
  const canDrawGold5 = meta.gold >= SKIN_MULTI5_GOLD_COST;

  let showcaseHtml = '';
  if (lastSkinPull) {
    const pullCards = lastSkinPull.items
      .map((item) => {
        const rMeta = SKIN_RARITY_META[item.rarity];
        let imgUrl = '';
        let subName = '비무대 테마';
        if (item.kind === 'hero') {
          const skinDef = data.heroSkinsById.get(item.skinId);
          const u = item.unitId ? data.unitsById.get(item.unitId) : undefined;
          const g = u ? data.gradesById.get(u.grade) : undefined;
          if (u && g && skinDef) {
            imgUrl = sprites.unitPortraitUrl(u, g, skinDef);
            subName = u.name;
          }
        } else {
          const courtDef = data.courtSkinsById.get(item.skinId as CourtSkinId);
          if (courtDef) {
            imgUrl = sprites.courtPreviewUrl(courtDef);
          }
        }

        const tagHtml = item.isNew
          ? '<span class="pull-tag new">✨ NEW</span>'
          : `<span class="pull-tag refund">+${item.silkRefund}필</span>`;

        return `
          <div class="skin-pull-card rarity-${item.rarity}">
            <span class="skin-rarity-pill" style="background:${rMeta.color}">${rMeta.label}</span>
            <div class="skin-pull-avatar"><img src="${imgUrl}" alt="${escapeHtml(item.name)}" /></div>
            <div class="skin-pull-name">${escapeHtml(item.name)}</div>
            <div class="skin-pull-target">${escapeHtml(subName)}</div>
            ${tagHtml}
          </div>
        `;
      })
      .join('');

    const multiClass = lastSkinPull.items.length > 1 ? ' multi-5' : ' single-1';
    const refundNote =
      lastSkinPull.totalSilkRefund > 0
        ? `<div class="skin-pull-summary">🧶 중복 의복 환급 합계: <b>운금비단 +${lastSkinPull.totalSilkRefund}필</b> (보유 ${meta.silk}필)</div>`
        : '';
    showcaseHtml = `
      <div id="skin-pull-showcase" class="skin-pull-showcase${multiClass}">
        <div class="skin-pull-grid">${pullCards}</div>
        ${refundNote}
      </div>
    `;
  }

  let listHtml = '';
  if (subTab === 'hero') {
    const sortedHeroSkins = [...data.heroSkins].sort((a, b) => {
      const eqA = meta.equippedHeroSkins[a.unitId] === a.id ? 1 : 0;
      const eqB = meta.equippedHeroSkins[b.unitId] === b.id ? 1 : 0;
      if (eqA !== eqB) return eqB - eqA;
      const ownA = meta.ownedSkins[a.id] ? 1 : 0;
      const ownB = meta.ownedSkins[b.id] ? 1 : 0;
      if (ownA !== ownB) return ownB - ownA;
      return SKIN_RARITY_META[b.rarity].rank - SKIN_RARITY_META[a.rarity].rank;
    });

    listHtml = sortedHeroSkins
      .map((skin) => {
        const u = data.unitsById.get(skin.unitId);
        const g = u ? data.gradesById.get(u.grade) : undefined;
        if (!u || !g) return '';
        const rMeta = SKIN_RARITY_META[skin.rarity];
        const fMeta = FACTION_META[u.faction];
        const isOwned = Boolean(meta.ownedSkins[skin.id]);
        const isEquipped = meta.equippedHeroSkins[skin.unitId] === skin.id;
        const portrait = sprites.unitPortraitUrl(u, g, skin);

        const condText =
          !isOwned && skin.unlockCond
            ? ` · <b class="skin-cond-note">🏆 ${escapeHtml(UNLOCK_COND_LABEL[skin.unlockCond])}</b>`
            : '';

        let ctaHtml = '';
        if (isEquipped) {
          ctaHtml = `
            <button type="button" class="card-cta-btn cta-green interactive" data-sheet-action="skin-equip-hero" data-unit-id="${skin.unitId}" data-skin-id="">
              <span>장착중 ✓</span>
              <span class="mini-price">해제</span>
            </button>
          `;
        } else if (isOwned) {
          ctaHtml = `
            <button type="button" class="card-cta-btn cta-sky interactive" data-sheet-action="skin-equip-hero" data-unit-id="${skin.unitId}" data-skin-id="${skin.id}">
              <span>의복 장착</span>
            </button>
          `;
        } else if (skin.unlockCond) {
          ctaHtml = `
            <button type="button" class="card-cta-btn cta-disabled" disabled>
              <span>업적 전용</span>
            </button>
          `;
        } else {
          const canCraft = meta.silk >= skin.silkCost;
          ctaHtml = `
            <button
              type="button"
              class="card-cta-btn ${canCraft ? 'interactive' : 'cta-disabled'}"
              data-sheet-action="skin-craft"
              data-skin-id="${skin.id}"
              ${canCraft ? '' : 'disabled'}
            >
              <span>확정 재단</span>
              <span class="mini-price">${ICON.silk}${skin.silkCost}필</span>
            </button>
          `;
        }

        return `
          <div class="sheet-card skin-card${isEquipped ? ' skin-equipped' : isOwned ? ' skin-owned' : ' skin-locked'}">
            <div class="card-left">
              <div class="card-avatar skin-avatar"><img src="${portrait}" alt="${escapeHtml(skin.name)}" /></div>
              <div class="card-info">
                <div class="card-name-row">
                  <span class="grade-pill" style="background:${rMeta.color}">${rMeta.label}</span>
                  <span class="grade-pill" style="background:${fMeta.color}">${escapeHtml(u.name)}</span>
                  <span class="card-name">${escapeHtml(skin.name)}</span>
                  <span class="skin-swatches" title="검기·절기 색상">
                    <i style="background:${skin.primaryColor}"></i>
                    <i style="background:${skin.secondaryColor}"></i>
                  </span>
                </div>
                <div class="card-sub">${escapeHtml(skin.desc)}${condText}</div>
              </div>
            </div>
            ${ctaHtml}
          </div>
        `;
      })
      .join('');
  } else {
    listHtml = data.courtSkins
      .map((court) => {
        const rMeta = SKIN_RARITY_META[court.rarity];
        const isOwned = Boolean(meta.ownedSkins[court.id]);
        const isEquipped = meta.equippedCourtSkin === court.id;
        const previewUrl = sprites.courtPreviewUrl(court);
        const condText =
          !isOwned && court.unlockCond
            ? ` · <b class="skin-cond-note">🏆 ${escapeHtml(UNLOCK_COND_LABEL[court.unlockCond])}</b>`
            : '';

        let ctaHtml = '';
        if (isEquipped) {
          ctaHtml = `
            <button type="button" class="card-cta-btn cta-green cta-disabled" disabled>
              <span>적용중 ✓</span>
            </button>
          `;
        } else if (isOwned) {
          ctaHtml = `
            <button type="button" class="card-cta-btn cta-sky interactive" data-sheet-action="skin-equip-court" data-court-id="${court.id}">
              <span>테마 적용</span>
            </button>
          `;
        } else if (court.unlockCond) {
          ctaHtml = `
            <button type="button" class="card-cta-btn cta-disabled" disabled>
              <span>업적 전용</span>
            </button>
          `;
        } else {
          const canCraft = meta.silk >= court.silkCost;
          ctaHtml = `
            <button
              type="button"
              class="card-cta-btn ${canCraft ? 'interactive' : 'cta-disabled'}"
              data-sheet-action="skin-craft"
              data-skin-id="${court.id}"
              ${canCraft ? '' : 'disabled'}
            >
              <span>확정 재단</span>
              <span class="mini-price">${ICON.silk}${court.silkCost}필</span>
            </button>
          `;
        }

        return `
          <div class="sheet-card skin-card${isEquipped ? ' skin-equipped' : isOwned ? ' skin-owned' : ' skin-locked'}">
            <div class="card-left">
              <div class="card-avatar court-avatar"><img src="${previewUrl}" alt="${escapeHtml(court.name)}" /></div>
              <div class="card-info">
                <div class="card-name-row">
                  <span class="grade-pill" style="background:${rMeta.color}">${rMeta.label}</span>
                  <span class="card-name">${escapeHtml(court.name)}</span>
                  <span class="skin-swatches" title="등불·꽃잎 분위기 색상">
                    <i style="background:${court.lanternColor}"></i>
                    <i style="background:${court.petalPrimary}"></i>
                  </span>
                </div>
                <div class="card-sub">${escapeHtml(court.desc)}${condText}</div>
              </div>
            </div>
            ${ctaHtml}
          </div>
        `;
      })
      .join('');
  }

  const bodyHtml = `
    <div class="wardrobe-gacha-panel">
      <div class="relic-wallet-row">
        <div class="relic-wallet-pills">
          <span class="relic-wallet-pill">${ICON.goldCoin}<span>천하주화</span><b>${meta.gold.toLocaleString('ko-KR')}</b></span>
          <span class="relic-wallet-pill key">${ICON.key}<span>열쇠</span><b>${meta.keys}</b></span>
          <span class="relic-wallet-pill silk">${ICON.silk}<span>운금비단</span><b>${meta.silk}필</b></span>
        </div>
        <div class="relic-draw-btns">
          <button
            type="button"
            class="card-cta-btn cta-green ${canDrawKey1 ? 'interactive' : 'cta-disabled'}"
            data-sheet-action="skin-draw"
            data-count="1"
            data-pay="key"
            ${canDrawKey1 ? '' : 'disabled'}
          >
            <span>열쇠 초빙</span>
            <span class="mini-price">${ICON.key}1</span>
          </button>
          <button
            type="button"
            class="card-cta-btn ${canDrawGold1 ? 'interactive' : 'cta-disabled'}"
            data-sheet-action="skin-draw"
            data-count="1"
            data-pay="gold"
            ${canDrawGold1 ? '' : 'disabled'}
          >
            <span>1회 초빙</span>
            <span class="mini-price">${ICON.goldCoin}${SKIN_SINGLE_GOLD_COST}</span>
          </button>
          <button
            type="button"
            class="card-cta-btn cta-crimson ${canDrawGold5 ? 'interactive' : 'cta-disabled'}"
            data-sheet-action="skin-draw"
            data-count="5"
            data-pay="gold"
            ${canDrawGold5 ? '' : 'disabled'}
          >
            <span>5연속 (10%↓)</span>
            <span class="mini-price">${ICON.goldCoin}${SKIN_MULTI5_GOLD_COST}</span>
          </button>
        </div>
      </div>
      <div class="wardrobe-rate-note">
        ✨ 확률: <b>신화 15%</b> · <b>전설 35%</b> · <b>명품 50%</b> ｜ 중복 당첨 시 운금비단 자동 환급 (+15/+30/+50필)
      </div>
      ${showcaseHtml}
    </div>

    <div class="wardrobe-subtabs">
      <button
        type="button"
        class="wardrobe-subtab-btn interactive${subTab === 'hero' ? ' active' : ''}"
        data-sheet-action="wardrobe-subtab"
        data-subtab="hero"
      >
        👘 협객 전설 의복 (${ownedHeroCount}/${data.heroSkins.length})
      </button>
      <button
        type="button"
        class="wardrobe-subtab-btn interactive${subTab === 'court' ? ' active' : ''}"
        data-sheet-action="wardrobe-subtab"
        data-subtab="court"
      >
        🏯 비무대 테마 (${ownedCourtCount}/${data.courtSkins.length})
      </button>
    </div>
    ${listHtml}
  `;

  return { subtitle, bodyHtml };
}
