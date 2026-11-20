import {
  computeRelicSetStatuses,
  CULTIVATION_MILESTONE_REALMS,
  DIFFICULTY_CONFIGS,
  formatRelicStatSummary,
  formatSoulAffixSlot,
  getAbacusSummonDiscount,
  getArmorGauntletShred,
  getBlessedEffectiveRelicLevel,
  getCritBladeChanceBps,
  getLuckPouchSellCoinPct,
  getMasteryUpgradeCost,
  getRangeMirrorRangeBonus,
  getRelicChaosUpgradeCost,
  getSkillJadeDamagePct,
  getSlayerBannerBossPct,
  getSoulRerollCost,
  getSwiftBootsSpeedPct,
  getTrainingManualCostDiscountPct,
  getTrigramMirrorAtkBps,
  getVaultInterestCap,
  getVaultInterestPct,
  MASTERY_DEFS,
  MASTERY_MAX_LEVEL,
  MAX_BLESSED_RELICS,
  MERIDIAN_DEFS,
  MERIDIAN_MAX_LEVEL,
  REINCARNATION_DAO_BONUS_PER_STACK,
  REINCARNATION_REWARD,
  RELIC_CATEGORY_MAP,
  RELIC_CHAOS_SET_TIER4_LV,
  RELIC_ENGRAVE_ATK_PCT_EACH,
  RELIC_ENGRAVE_GOLD_COST,
  RELIC_ENGRAVE_SILK_COST,
  RELIC_ENGRAVE_SKILL_PCT_EACH,
  RELIC_MAX_LEVEL,
  RELIC_STANDARD_CAP,
  SOUL_RARITY_META,
  SOUL_SLOT_COUNT,
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
  const transcendedCount = data.relics.filter(
    (d) => (meta.relics[d.id] ?? 0) > RELIC_STANDARD_CAP,
  ).length;
  const chaosCount = data.relics.filter((d) => (meta.relics[d.id] ?? 0) > d.maxLevel).length;
  const allBaseMaxed = data.relics.every((d) => (meta.relics[d.id] ?? 0) >= d.maxLevel);
  const allChaosMaxed = data.relics.every((d) => (meta.relics[d.id] ?? 0) >= RELIC_MAX_LEVEL);
  const bestWaveStr = String(meta.bestWave).padStart(2, '0');
  const transSuffix =
    chaosCount > 0
      ? ` · 혼원초월 ${chaosCount}`
      : transcendedCount > 0
        ? ` · 초월 ${transcendedCount}`
        : '';
  const subtitle = `해금 ${ownedCount}/${data.relics.length}${transSuffix} · 최고 제 ${bestWaveStr} 장 · 영구 계승`;

  // Keys and Gold are NEVER locked out after Lv.15: draws automatically open Chaos Transcendence Chest!
  const canDrawKey = meta.keys >= 1;
  const bulkKeyCount = Math.min(10, meta.keys);
  const canDrawBulkKey = meta.keys >= 2;
  const canDrawGold = meta.gold >= RELIC_CHEST_GOLD_COST;
  const canDrawGold5 = meta.gold >= RELIC_CHEST_GOLD_COST * 5;

  const chaosChestBannerHtml = allBaseMaxed
    ? `
      <div class="chaos-chest-banner${allChaosMaxed ? ' max-essence' : ''}">
        <span class="chaos-chest-tag">${allChaosMaxed ? '✦ 영혼 세공 정수함' : '🌌 태고 초월 기보함 가동'}</span>
        <span class="chaos-chest-desc">${
          allChaosMaxed
            ? '전 신물 Lv.30 태고불멸 완성! 기보함 개봉 시마다 [🧵비단 +25필 · 🪙주화 +60] 영혼 세공 정수로 즉시 환원됩니다.'
            : '전 신물 Lv.15 신화 달성! 남는 열쇠·주화 개봉 시 [🔮초월 파편 +3 · 🧵비단 +5필] 확정 획득 (🌟본명 신물 파편 확률 2.5배!)'
        }</span>
      </div>
    `
    : '';

  let noticeHtml = '';
  if (lastRelicNotice?.batchItems && lastRelicNotice.batchItems.length > 0) {
    const itemsHtml = lastRelicNotice.batchItems
      .map((entry) => {
        const rDef = data.relicsById.get(entry.relicId);
        const rPortrait = sprites.relicPortraitUrl(entry.relicId, entry.newLevel);
        const hasShardDrop = (entry.shardsGranted ?? 0) > 0;
        const hasEssenceDrop =
          !hasShardDrop && ((entry.silkGranted ?? 0) > 0 || (entry.goldRefunded ?? 0) > 0);
        const deltaTxt = hasShardDrop
          ? `🔮파편 +${entry.shardsGranted}${entry.silkGranted ? ` · 🧵+${entry.silkGranted}` : ''}`
          : hasEssenceDrop
            ? `🧵+${entry.silkGranted ?? 0} · 🪙+${entry.goldRefunded ?? 0}`
            : entry.isNew
              ? `NEW Lv.${entry.newLevel}`
              : `Lv.${entry.prevLevel}→${entry.newLevel}`;
        const cls =
          hasShardDrop || entry.newLevel >= (rDef?.maxLevel ?? 15)
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
              <span class="relic-batch-chip-lv">${deltaTxt}${!hasShardDrop && !hasEssenceDrop && entry.pulls > 1 ? ` (×${entry.pulls})` : ''}</span>
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
    const shardDrop = n.shardsGranted ?? 0;
    const essenceDrop = shardDrop <= 0 && ((n.silkGranted ?? 0) > 0 || (n.goldRefunded ?? 0) > 0);
    const badgeLabel =
      shardDrop > 0
        ? `🔮 초월 파편 +${shardDrop} · 🧵비단 +${n.silkGranted ?? 0}필`
        : essenceDrop
          ? `✦ 영혼 정수 🧵+${n.silkGranted ?? 0}필 · 🪙+${n.goldRefunded ?? 0}`
          : n.isNew
            ? '✨ NEW 신물 해금'
            : rLv > maxLv
              ? `🌌 혼원초월 Lv.${rPrev} → Lv.${rLv}`
              : rLv >= maxLv
                ? '👑 태극신화 달성!'
                : rLv > RELIC_STANDARD_CAP
                  ? `🌌 초월 제련 Lv.${rPrev} → Lv.${rLv}`
                  : `⬆️ 제련 승급 Lv.${rPrev} → Lv.${rLv}`;
    const tierCls =
      shardDrop > 0 || rLv >= maxLv
        ? ' tier-mythic'
        : rLv > RELIC_STANDARD_CAP
          ? ' tier-transcend'
          : rLv >= 5
            ? ' tier-master'
            : '';
    const curShards = meta.relicShards[n.relicId!] ?? 0;
    const subStatLine =
      shardDrop > 0
        ? `보유 파편 ${curShards}개 · ${formatRelicStatSummary(n.relicId!, rLv)}`
        : formatRelicStatSummary(n.relicId!, rLv);
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
          <div class="relic-pull-stat">${escapeHtml(subStatLine)}</div>
        </div>
      </div>
    `;
  } else {
    const noticeText = lastRelicNotice
      ? lastRelicNotice.text
      : allBaseMaxed
        ? '🌌 태고 초월 기보함이 열렸습니다! 기보함 열쇠로 초월 파편과 비단을 모아 Lv.30 혼원초월과 3슬롯 영혼 세공을 완성하세요!'
        : '🏺 기보함을 개봉해 무림 16대 신물을 해금하고 Lv.15 태극신화 · Lv.30 혼원초월 경지까지 제련하세요!';
    const noticeClass = lastRelicNotice ? 'relic-notice-banner win' : 'relic-notice-banner';
    noticeHtml = `<div id="relic-notice-banner" class="${noticeClass}">${escapeHtml(noticeText)}</div>`;
  }

  const blessedSlotsHtml = Array.from({ length: MAX_BLESSED_RELICS }, (_, idx) => {
    const rid = meta.blessedRelics[idx];
    if (!rid) {
      return `
        <div class="blessed-slot empty">
          <span class="blessed-slot-empty-ico">🌟</span>
          <div class="blessed-slot-meta">
            <strong>본명 공명석 #${idx + 1} 비어있음</strong>
            <span>아래 신물 카드의 [🌟본명] 버튼으로 지정</span>
          </div>
        </div>
      `;
    }
    const rDef = data.relicsById.get(rid);
    const rawLv = meta.relics[rid] ?? 1;
    const effLv = getBlessedEffectiveRelicLevel(rawLv, true);
    const portrait = sprites.relicPortraitUrl(rid, rawLv);
    return `
      <div class="blessed-slot active">
        <img class="blessed-slot-img" src="${portrait}" alt="${escapeHtml(rDef?.name ?? rid)}" />
        <div class="blessed-slot-meta">
          <strong>${escapeHtml(rDef?.name ?? rid)}</strong>
          <span>Lv.${rawLv} → <b>✦유효 Lv.${effLv} (1.5x)</b></span>
        </div>
        <button
          type="button"
          class="blessed-unequip-btn interactive"
          data-sheet-action="relic-bless-toggle"
          data-relic-id="${rid}"
          title="본명 호법신물 장착 해제"
        >해제</button>
      </div>
    `;
  }).join('');

  const blessedAltarHtml = `
    <div class="blessed-relic-strip">
      <div class="relic-set-head">
        <span>🌟 본명 호법신물 3슬롯 공명대 (${meta.blessedRelics.length}/${MAX_BLESSED_RELICS})</span>
        <span class="relic-set-hint">장착 신물 능력치 유효 레벨 1.5배 증폭 (최대 Lv.45) · 초월 파편 픽업 확률 2.5배!</span>
      </div>
      <div class="blessed-slot-grid">${blessedSlotsHtml}</div>
    </div>
  `;

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
      const isBlessed = isOwned && meta.blessedRelics.includes(def.id);
      const effLv = getBlessedEffectiveRelicLevel(lv, isBlessed);
      const isTranscend = lv > RELIC_STANDARD_CAP && lv < def.maxLevel;
      const isBaseMax = lv >= def.maxLevel;
      const isChaos = lv > def.maxLevel;
      const isChaosMax = lv >= RELIC_MAX_LEVEL;
      const cost = getRelicUpgradeGoldCost(def, lv);
      const affordable = !isBaseMax && meta.gold >= cost;

      const curShards = meta.relicShards[def.id] ?? 0;
      const chaosCost = getRelicChaosUpgradeCost(Math.max(def.maxLevel, lv));
      const canTranscendChaos =
        isBaseMax && !isChaosMax && curShards >= chaosCost.shards && meta.gold >= chaosCost.gold;

      let liveBadgeHtml = '';
      if (def.id === 'golden_vault' && isOwned) {
        const pct = getVaultInterestPct(effLv);
        const cap = getVaultInterestCap(effLv);
        const est = Math.min(cap, Math.floor((snapshot.coin * pct) / 100));
        liveBadgeHtml = `<span class="relic-live-chip">예상 이자 +${est} 은자</span>`;
      } else if (def.id === 'million_sword_seal' && isOwned) {
        const curPct = (snapshot.relicBonus.wealthAtkBps / 100).toFixed(1);
        liveBadgeHtml = `<span class="relic-live-chip">현재 공증 +${curPct}%</span>`;
      } else if (def.id === 'bandit_dagger' && snapshot.relicBonus.pilferedCoinTotal > 0) {
        liveBadgeHtml = `<span class="relic-live-chip">강탈 +${snapshot.relicBonus.pilferedCoinTotal} 은자</span>`;
      } else if (def.id === 'wind_swift_boots' && isOwned) {
        liveBadgeHtml = `<span class="relic-live-chip">공속 +${getSwiftBootsSpeedPct(effLv)}%</span>`;
      } else if (def.id === 'crimson_crit_blade' && isOwned) {
        liveBadgeHtml = `<span class="relic-live-chip">회심 +${(getCritBladeChanceBps(effLv) / 100).toFixed(1)}%</span>`;
      } else if (def.id === 'armor_break_gauntlet' && isOwned) {
        liveBadgeHtml = `<span class="relic-live-chip">파갑 +${getArmorGauntletShred(effLv)}</span>`;
      } else if (def.id === 'celestial_skill_jade' && isOwned) {
        liveBadgeHtml = `<span class="relic-live-chip">절기 +${getSkillJadeDamagePct(effLv)}%</span>`;
      } else if (def.id === 'demon_slayer_banner' && isOwned) {
        liveBadgeHtml = `<span class="relic-live-chip">보스 +${getSlayerBannerBossPct(effLv)}%</span>`;
      } else if (def.id === 'merchant_abacus' && isOwned) {
        liveBadgeHtml = `<span class="relic-live-chip">소환 -${getAbacusSummonDiscount(effLv)} 은자</span>`;
      } else if (def.id === 'jade_training_manual' && isOwned) {
        liveBadgeHtml = `<span class="relic-live-chip">수련 -${getTrainingManualCostDiscountPct(effLv)}%</span>`;
      } else if (def.id === 'phoenix_luck_pouch' && isOwned) {
        liveBadgeHtml = `<span class="relic-live-chip">방출 +${getLuckPouchSellCoinPct(effLv)}%</span>`;
      } else if (def.id === 'dragon_range_mirror' && isOwned) {
        liveBadgeHtml = `<span class="relic-live-chip">사거리 +${getRangeMirrorRangeBonus(effLv)}</span>`;
      } else if (def.id === 'eight_trigram_mirror' && isOwned) {
        liveBadgeHtml = `<span class="relic-live-chip">공증 +${(getTrigramMirrorAtkBps(effLv) / 100).toFixed(1)}%</span>`;
      }

      let statLine = '';
      if (!isOwned) {
        statLine = `<span class="relic-lore">${escapeHtml(def.desc)}</span> · 해금(Lv.1): <b class="up-next">${escapeHtml(formatRelicStatSummary(def.id, 1))}</b>`;
      } else if (isChaosMax) {
        statLine = `<b>${escapeHtml(formatRelicStatSummary(def.id, effLv))}</b> <span class="relic-max-note">(태고불멸 Lv.${RELIC_MAX_LEVEL}${isBlessed ? ` · 본명 유효 Lv.${effLv}` : ''} 완성!)</span>`;
      } else if (isBaseMax) {
        const nextEffLv = getBlessedEffectiveRelicLevel(lv + 1, isBlessed);
        statLine = `<b>${escapeHtml(formatRelicStatSummary(def.id, effLv))}</b> → <b class="up-next">혼원 Lv.${lv + 1}${isBlessed ? `(유효${nextEffLv})` : ''}: ${escapeHtml(formatRelicStatSummary(def.id, nextEffLv))}</b>`;
      } else {
        const nextEffLv = getBlessedEffectiveRelicLevel(lv + 1, isBlessed);
        const nextPrefix = lv >= RELIC_STANDARD_CAP ? `초월 Lv.${lv + 1}` : `Lv.${lv + 1}`;
        statLine = `${escapeHtml(formatRelicStatSummary(def.id, effLv))} → <b class="up-next">${nextPrefix}: ${escapeHtml(formatRelicStatSummary(def.id, nextEffLv))}</b>`;
      }

      const lvBadgeBg = isChaosMax
        ? '#be185d'
        : isChaos
          ? '#c026d3'
          : isBaseMax
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
      const lvBadgeTxt = isChaosMax
        ? `태고불멸 Lv.${lv}`
        : isChaos
          ? `혼원 Lv.${lv}/${RELIC_MAX_LEVEL}`
          : isBaseMax
            ? `신화 Lv.${lv}`
            : isTranscend
              ? `초월 Lv.${lv}/${def.maxLevel}`
              : isOwned
                ? `Lv.${lv}/${def.maxLevel}`
                : '봉인됨';
      const ctaLabel =
        lv >= RELIC_STANDARD_CAP ? '초월 제련' : isOwned ? '제련' : '지정 해금';
      const cardTierCls = isChaos
        ? ' relic-owned relic-mythic relic-chaos'
        : isBaseMax
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
        const chaosFilled = isBaseMax && idx < lv - def.maxLevel;
        const filled = idx < Math.min(lv, def.maxLevel);
        const isOverPip = idx >= RELIC_STANDARD_CAP;
        const pipCls = chaosFilled
          ? ' chaos'
          : !filled
            ? isOverPip
              ? ' over-empty'
              : ''
            : isBaseMax
              ? ' max'
              : isOverPip
                ? ' trans'
                : lv >= 5
                  ? ' high'
                  : ' on';
        return `<span class="relic-lv-pip${pipCls}"></span>`;
      }).join('');

      const isEngraved = Boolean(meta.engravedRelics[def.id]);
      const canEngrave =
        isBaseMax &&
        !isEngraved &&
        meta.gold >= RELIC_ENGRAVE_GOLD_COST &&
        meta.silk >= RELIC_ENGRAVE_SILK_COST;
      const engraveBadgeHtml = isEngraved
        ? `<span class="relic-engrave-badge">★ 신화각인 (공+${RELIC_ENGRAVE_ATK_PCT_EACH}%·절기+${RELIC_ENGRAVE_SKILL_PCT_EACH}%)</span>`
        : '';
      const blessedBadgeHtml = isBlessed
        ? `<span class="blessed-eff-pill">🌟본명 1.5x (유효 Lv.${effLv})</span>`
        : '';
      const shardBadgeHtml =
        (isBaseMax && !isChaosMax) || curShards > 0
          ? `<span class="relic-shard-pill${curShards >= chaosCost.shards && !isChaosMax ? ' ready' : ''}">🔮파편 ${curShards}${!isChaosMax ? `/${chaosCost.shards}` : ''}</span>`
          : '';

      const blessBtnHtml = isOwned
        ? `
          <button
            type="button"
            class="relic-bless-btn${isBlessed ? ' active' : ''} interactive"
            data-sheet-action="relic-bless-toggle"
            data-relic-id="${def.id}"
            title="본명 호법신물 장착/해제 (능력치 레벨 1.5배 증폭 + 초월 파편 픽업 2.5배)"
          >
            ${isBlessed ? '🌟 본명 중' : '☆ 본명 지정'}
          </button>
        `
        : '';

      let primaryActionHtml = '';
      if (!isBaseMax) {
        primaryActionHtml = `
          <button
            type="button"
            class="card-cta-btn ${affordable ? (lv >= RELIC_STANDARD_CAP ? 'cta-violet interactive' : isOwned ? 'interactive' : 'cta-sky interactive') : 'cta-disabled'}"
            data-sheet-action="relic-upgrade"
            data-relic-id="${def.id}"
            ${affordable ? '' : 'disabled'}
          >
            <span>${ctaLabel}</span>
            <span class="mini-price">${ICON.goldCoin}${cost}</span>
          </button>
        `;
      } else {
        const engraveBtnPart = !isEngraved
          ? `
            <button
              type="button"
              class="card-cta-btn ${canEngrave ? 'cta-gold interactive' : 'cta-disabled'}"
              data-sheet-action="relic-engrave"
              data-relic-id="${def.id}"
              title="Lv.15 신물 신화 각인 개방: 영구 공격력 +${RELIC_ENGRAVE_ATK_PCT_EACH}% · 절기 피해 +${RELIC_ENGRAVE_SKILL_PCT_EACH}% + 삼재 영혼 세공 3슬롯 해금!"
              ${canEngrave ? '' : 'disabled'}
            >
              <span>✦ 신화 각인</span>
              <span class="mini-price">${ICON.goldCoin}${RELIC_ENGRAVE_GOLD_COST}·${ICON.silk}${RELIC_ENGRAVE_SILK_COST}</span>
            </button>
          `
          : '';
        const transcendBtnPart = isChaosMax
          ? `
            <button type="button" class="card-cta-btn cta-gold cta-disabled" disabled>
              <span>👑 태고완성</span>
            </button>
          `
          : `
            <button
              type="button"
              class="card-cta-btn ${canTranscendChaos ? 'cta-violet interactive' : 'cta-disabled'}"
              data-sheet-action="relic-transcend"
              data-relic-id="${def.id}"
              title="초월 파편 제련: 혼원초월 Lv.${lv + 1}/${RELIC_MAX_LEVEL} 승급"
              ${canTranscendChaos ? '' : 'disabled'}
            >
              <span>🔮 혼원초월</span>
              <span class="mini-price">🔮${chaosCost.shards}·${ICON.goldCoin}${chaosCost.gold}</span>
            </button>
          `;
        primaryActionHtml = `${engraveBtnPart}${transcendBtnPart}`;
      }

      let soulForgeHtml = '';
      if (isEngraved) {
        const soulSlots = meta.relicSoulSlots[def.id];
        const lockedCnt = soulSlots ? soulSlots.filter((s) => s.locked).length : 0;
        const soulCost = getSoulRerollCost(Math.min(SOUL_SLOT_COUNT - 1, lockedCnt));
        const canReroll =
          lockedCnt < SOUL_SLOT_COUNT &&
          meta.gold >= soulCost.gold &&
          meta.silk >= soulCost.silk;

        const slotsChipsHtml =
          soulSlots && soulSlots.length === SOUL_SLOT_COUNT
            ? soulSlots
                .map((slot, sIdx) => {
                  const rMeta = SOUL_RARITY_META[slot.rarity];
                  return `
                    <button
                      type="button"
                      class="soul-slot-chip${slot.locked ? ' locked' : ''} interactive"
                      style="--soul-color:${rMeta.color}"
                      data-sheet-action="relic-soul-lock"
                      data-relic-id="${def.id}"
                      data-slot-index="${sIdx}"
                      title="터치하여 슬롯 잠금/해제 (최대 2줄 잠금 가능)"
                    >
                      <span class="soul-rarity-tag" style="background:${rMeta.color}">${escapeHtml(rMeta.badge)}</span>
                      <span class="soul-stat-txt">${escapeHtml(formatSoulAffixSlot(slot))}</span>
                      <span class="soul-lock-ico">${slot.locked ? '🔒' : '🔓'}</span>
                    </button>
                  `;
                })
                .join('')
            : `<span class="soul-unrolled-hint">⚒️ 삼재 영혼 3슬롯 미감정 — 초회 감정 시 B ~ ✦태고(SSS) 영구 부옵션 3줄 개방!</span>`;

        soulForgeHtml = `
          <div class="relic-soul-box">
            <div class="relic-soul-slots">${slotsChipsHtml}</div>
            <button
              type="button"
              class="soul-reroll-btn ${canReroll ? 'interactive' : 'disabled'}"
              data-sheet-action="relic-soul-reroll"
              data-relic-id="${def.id}"
              ${canReroll ? '' : 'disabled'}
            >
              <span>⚒️ ${soulSlots ? (lockedCnt > 0 ? `잠금(${lockedCnt}) 연마` : '영혼 재연마') : '초회 감정'}</span>
              <span class="mini-price">${ICON.goldCoin}${soulCost.gold}·${ICON.silk}${soulCost.silk}</span>
            </button>
          </div>
        `;
      }

      return `
        <div class="sheet-card relic-card${cardTierCls}${isEngraved ? ' relic-engraved' : ''}${isBlessed ? ' relic-blessed' : ''}">
          <div class="relic-card-main">
            <div class="card-left">
              <div class="card-avatar relic-avatar">
                <img src="${portraitUrl}" alt="${escapeHtml(def.name)}" />
              </div>
              <div class="card-info">
                <div class="card-name-row">
                  <span class="grade-pill" style="background:${lvBadgeBg}">${lvBadgeTxt}</span>
                  <span class="grade-pill relic-tag-pill">${escapeHtml(def.tag)}</span>
                  <span class="card-name">${escapeHtml(def.name)}</span>
                  ${blessedBadgeHtml}
                  ${shardBadgeHtml}
                  ${engraveBadgeHtml}
                  ${liveBadgeHtml}
                </div>
                <div class="card-sub">${statLine}</div>
                <div class="relic-lv-track" aria-hidden="true">${pipsHtml}</div>
              </div>
            </div>
            <div class="relic-card-actions">
              ${blessBtnHtml}
              ${primaryActionHtml}
            </div>
          </div>
          ${soulForgeHtml}
        </div>
      `;
    })
    .join('');

  const diffCfg = DIFFICULTY_CONFIGS[snapshot.difficulty];
  const trialCfg = snapshot.trialId ? TRIAL_CONFIGS[snapshot.trialId] : null;
  const modeBadge = trialCfg
    ? `${trialCfg.badge} ${trialCfg.rewardMult}x`
    : snapshot.ascensionLevel > 0
      ? `🏯 등선 ${snapshot.ascensionLevel}중천`
      : diffCfg.badge;
  const preview = computeSettlementReward({
    wave: snapshot.wave,
    monstersSlain: snapshot.monstersSlain,
    bossesSlain: snapshot.bossesSlain,
    bountiesSlain: snapshot.bounty.bountiesSlain,
    difficulty: snapshot.difficulty,
    trialId: snapshot.trialId,
    ascensionLevel: snapshot.ascensionLevel,
    victory: snapshot.victoryAchieved,
  });
  const canEarlySettle = !snapshot.gameOver && !snapshot.victoryHold && snapshot.wave >= 2;
  const targetWaveStr = String(snapshot.clearTargetWave).padStart(2, '0');

  let settleFooterHtml = '';
  if (snapshot.victoryHold) {
    settleFooterHtml = `
      <div class="settlement-preview-bar victory-bar">
        <div class="settlement-preview-info">
          <span class="settlement-preview-title">🏆 제 ${targetWaveStr} 장 ${trialCfg ? '비경 제패' : snapshot.ascensionLevel > 0 ? `등선 ${snapshot.ascensionLevel}중천 제패` : '천하통일'} 정산 완료!</span>
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
          <span class="settlement-preview-sub">획득 보상: 천하주화 +${settledRec?.goldEarned ?? preview.goldEarned} · 열쇠 +${settledRec?.keysEarned ?? preview.keysEarned}${settledRec?.shardsEarned ? ` · 🔮파편 +${settledRec.shardsEarned}` : ''}</span>
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

  const setStatuses = computeRelicSetStatuses(meta.relics);
  const activeSetsCount = setStatuses.filter((s) => s.tier >= 1).length;
  const setCardsHtml = setStatuses
    .map((st) => {
      const def = st.def;
      const tierBadge =
        st.tier === 5
          ? `태고창세 Lv.${RELIC_MAX_LEVEL} 👑`
          : st.tier === 4
            ? `혼원초월 Lv.${RELIC_CHAOS_SET_TIER4_LV}+ ✦`
            : st.tier === 3
              ? '태극신화 Lv.15 ★'
              : st.tier === 2
                ? '절정공명 Lv.10+'
                : st.tier === 1
                  ? '세트해금 4/4'
                  : `수집 ${st.ownedCount}/4`;
      const tierCls =
        st.tier >= 4
          ? ' set-t3 set-chaos'
          : st.tier === 3
            ? ' set-t3'
            : st.tier === 2
              ? ' set-t2'
              : st.tier === 1
                ? ' set-t1'
                : ' set-t0';
      const activeDesc =
        st.tier === 5
          ? def.tier5Desc
          : st.tier === 4
            ? def.tier4Desc
            : st.tier === 3
              ? def.tier3Desc
              : st.tier === 2
                ? def.tier2Desc
                : st.tier === 1
                  ? def.tier1Desc
                  : `4종 해금 시: ${def.tier1Desc}`;
      const nextHint =
        st.tier === 1
          ? `다음(전원 Lv.10): ${def.tier2Desc}`
          : st.tier === 2
            ? `다음(전원 Lv.15): ${def.tier3Desc}`
            : st.tier === 3
              ? `초월(전원 Lv.${RELIC_CHAOS_SET_TIER4_LV}): ${def.tier4Desc}`
              : st.tier === 4
                ? `창세(전원 Lv.${RELIC_MAX_LEVEL}): ${def.tier5Desc}`
                : st.tier === 5
                  ? '👑 태고창세 최고 공명 완성!'
                  : '';
      const membersHtml = def.members
        .map((rid) => {
          const lv = meta.relics[rid] ?? 0;
          const rDef = data.relicsById.get(rid);
          const cls =
            lv >= RELIC_CHAOS_SET_TIER4_LV
              ? ' m-t3 m-chaos'
              : lv >= 15
                ? ' m-t3'
                : lv >= 10
                  ? ' m-t2'
                  : lv > 0
                    ? ' m-t1'
                    : ' m-t0';
          return `<span class="relic-set-member${cls}" title="${escapeHtml(rDef?.name ?? rid)} Lv.${lv}"><img src="${sprites.relicPortraitUrl(rid, lv)}" alt="" /><b>${lv > 0 ? lv : '·'}</b></span>`;
        })
        .join('');

      return `
        <div class="relic-set-card${tierCls}">
          <div class="relic-set-top">
            <span class="relic-set-badge" style="background:${def.color}">${escapeHtml(def.badge)}</span>
            <span class="relic-set-name">${escapeHtml(def.name)}</span>
            <span class="relic-set-tier">${tierBadge}</span>
          </div>
          <div class="relic-set-members">${membersHtml}</div>
          <div class="relic-set-desc">${escapeHtml(activeDesc)}</div>
          ${nextHint ? `<div class="relic-set-next">${escapeHtml(nextHint)}</div>` : ''}
        </div>
      `;
    })
    .join('');

  const relicSetSectionHtml = `
    <div class="relic-set-section">
      <div class="relic-set-head">
        <span>☯ 4대 신물 세트 공명 (${activeSetsCount}/4 발동)</span>
        <span class="relic-set-hint">해금 · Lv.10 · Lv.15(신화) · Lv.${RELIC_CHAOS_SET_TIER4_LV}(혼원) · Lv.${RELIC_MAX_LEVEL}(창세) 5단계</span>
      </div>
      <div class="relic-set-grid">${setCardsHtml}</div>
    </div>
  `;

  const masteryCardsHtml = MASTERY_DEFS.map((m) => {
    const lv = meta.masteryLevels[m.id] ?? 0;
    const isMaxM = lv >= MASTERY_MAX_LEVEL;
    const cost = getMasteryUpgradeCost(lv);
    const canAfford = !isMaxM && meta.gold >= cost.gold && meta.silk >= cost.silk;
    const priceTxt =
      cost.silk > 0
        ? `${ICON.goldCoin}${cost.gold} · ${ICON.silk}${cost.silk}`
        : `${ICON.goldCoin}${cost.gold}`;
    return `
      <div class="mastery-card${lv > 0 ? ' active' : ''}">
        <div class="mastery-card-top">
          <span class="grade-pill" style="background:${m.color}">${escapeHtml(m.badge)}</span>
          <strong class="mastery-name">${escapeHtml(m.name)}</strong>
          <span class="mastery-lv">Lv.${lv}/${MASTERY_MAX_LEVEL}</span>
        </div>
        <div class="mastery-desc">${escapeHtml(m.descPerLv)}</div>
        <button
          type="button"
          class="card-cta-btn mastery-btn ${canAfford ? 'cta-gold interactive' : 'cta-disabled'}"
          data-sheet-action="mastery-upgrade"
          data-mastery-id="${m.id}"
          ${canAfford ? '' : 'disabled'}
        >
          <span>${isMaxM ? '극의 달성 ✓' : '경지 수련'}</span>
          ${isMaxM ? '' : `<span class="mini-price">${priceTxt}</span>`}
        </button>
      </div>
    `;
  }).join('');

  const eb = meta.endgameBonuses;
  const endgameSummaryParts: string[] = [];
  if (eb.atkPct > 0) endgameSummaryParts.push(`공+${eb.atkPct}%`);
  if (eb.skillDamagePct > 0) endgameSummaryParts.push(`절기+${eb.skillDamagePct}%`);
  if ((eb.speedPct ?? 0) > 0) endgameSummaryParts.push(`공속+${eb.speedPct}%`);
  if (eb.startCoin > 0) endgameSummaryParts.push(`시작+${eb.startCoin}은자·처치+${eb.killCoinPct}%`);
  if (eb.critChanceBps > 0)
    endgameSummaryParts.push(`치명+${(eb.critChanceBps / 100).toFixed(1)}%`);
  if ((eb.critMultBonus ?? 0) > 0)
    endgameSummaryParts.push(`회심배율+${Math.round((eb.critMultBonus ?? 0) * 100)}%p`);
  if ((eb.armorShred ?? 0) > 0) endgameSummaryParts.push(`파갑+${eb.armorShred}`);
  if (eb.bossDamagePct > 0) endgameSummaryParts.push(`보스+${eb.bossDamagePct}%`);
  if ((eb.gambleBonusPct ?? 0) > 0) endgameSummaryParts.push(`영약+${eb.gambleBonusPct}%`);
  const endgameSummaryTxt =
    endgameSummaryParts.length > 0
      ? endgameSummaryParts.join(' · ')
      : '기경팔맥 · 영혼 세공 · 선천 도과 · 경지 단련으로 영구 능력치를 확장하세요';

  const cult = meta.cultivation;
  const cultFillPct = cult.isMaxLevel
    ? 100
    : Math.min(
        100,
        Math.max(0, Math.round((cult.currentLevelXp / Math.max(1, cult.nextLevelXp)) * 100)),
      );
  const cycleTier = eb.meridianCycleTier ?? 0;
  const cycleBadgeHtml =
    cycleTier === 2
      ? '<span class="meridian-cycle-badge max">✦ 대주천 완성 (공+12%·절기+10%·은자+40)</span>'
      : cycleTier === 1
        ? '<span class="meridian-cycle-badge open">☯ 소주천 개통 (공+4%·은자+15)</span>'
        : '<span class="meridian-cycle-hint">8맥 모두 Lv.1 개통 시 소주천 · 전원 Lv.5 시 대주천 발동!</span>';

  const rc = meta.reincarnationCount;
  const daoBonus = REINCARNATION_DAO_BONUS_PER_STACK;
  const reincarnationBannerHtml =
    rc > 0 || cult.isMaxLevel
      ? `
        <div class="reincarnate-banner${cult.isMaxLevel ? ' ready' : ''}">
          <div class="reincarnate-info">
            <span class="reincarnate-badge">${rc > 0 ? `☯ 제 ${rc} 차 전생 · 선천 도과` : '☯ 무극태상 도달 · 전생 개방!'}</span>
            <span class="reincarnate-desc">${
              rc > 0
                ? `누적 선천 도과: 공+${rc * daoBonus.atkPct}% · 절기+${rc * daoBonus.skillDamagePct}% · 보스+${rc * daoBonus.bossDamagePct}% · 시작은자+${rc * daoBonus.startCoin} · 선천진기+${rc * daoBonus.innateMeridianPoints}혈`
                : `전생 시 내공 경지 보상을 다시 수령하며 영구 [선천 도과](공+${daoBonus.atkPct}%·절기+${daoBonus.skillDamagePct}%·보스+${daoBonus.bossDamagePct}%·진기+${daoBonus.innateMeridianPoints}혈)가 무한 중첩됩니다!`
            }</span>
          </div>
          ${
            cult.isMaxLevel
              ? `
                <button
                  type="button"
                  class="reincarnate-cta-btn interactive"
                  data-sheet-action="cultivation-reincarnate"
                >
                  <span>☯ 무극 전생 돌파</span>
                  <span class="mini-price">+🪙${REINCARNATION_REWARD.gold}·🔑${REINCARNATION_REWARD.keys}·🔮${REINCARNATION_REWARD.shards}</span>
                </button>
              `
              : ''
          }
        </div>
      `
      : '';

  const claimedRealmSet = new Set(meta.claimedRealmMilestones);
  const realmMilestoneHtml = CULTIVATION_MILESTONE_REALMS.map((rm) => {
    const claimed = claimedRealmSet.has(rm.minLevel);
    const reached = cult.level >= rm.minLevel;
    const btnHtml = claimed
      ? '<span class="codex-ms-done">✓ 등극완료</span>'
      : reached
        ? `<button type="button" class="card-cta-btn cta-gold interactive codex-ms-claim-btn" data-sheet-action="claim-realm-milestone" data-realm-level="${rm.minLevel}"><span>돌파 수령</span></button>`
        : `<span class="codex-ms-prog">Lv.${cult.level}/${rm.minLevel}</span>`;
    return `
      <div class="codex-ms-card realm-ms-card${claimed ? ' claimed' : reached ? ' ready' : ''}">
        <div class="codex-ms-head">
          <strong style="color:${rm.color}">${escapeHtml(rm.badge)} (Lv.${rm.minLevel})</strong>
          ${btnHtml}
        </div>
        <div class="codex-ms-rewards">+${rm.rewardGold}주화 · 🔑+${rm.rewardKeys} · 🧵+${rm.rewardSilk}필</div>
      </div>
    `;
  }).join('');

  const meridianCardsHtml = MERIDIAN_DEFS.map((m) => {
    const lv = meta.meridianLevels[m.id] ?? 0;
    const isMaxMer = lv >= MERIDIAN_MAX_LEVEL;
    const canTap = !isMaxMer && meta.unspentMeridianPoints >= 1;
    const pips = Array.from({ length: MERIDIAN_MAX_LEVEL }, (_, i) => {
      const lit = i < lv;
      return `<span class="meridian-pip${lit ? (isMaxMer ? ' max' : ' lit') : ''}" style="${lit ? `background:${m.color}` : ''}"></span>`;
    }).join('');
    return `
      <div class="meridian-card${lv > 0 ? ' active' : ''}${isMaxMer ? ' maxed' : ''}">
        <div class="mastery-card-top">
          <span class="grade-pill" style="background:${m.color}">${escapeHtml(m.badge)}</span>
          <strong class="mastery-name">${escapeHtml(m.name)}</strong>
          <span class="mastery-lv">Lv.${lv}/${MERIDIAN_MAX_LEVEL}</span>
        </div>
        <div class="meridian-acupoint-line">
          <span>${escapeHtml(m.acupointTitle)}</span>
          <span class="meridian-pips" aria-hidden="true">${pips}</span>
        </div>
        <div class="mastery-desc">${escapeHtml(isMaxMer ? m.maxSummary : m.descPerLv)}</div>
        <button
          type="button"
          class="card-cta-btn mastery-btn ${canTap ? 'cta-sky interactive' : 'cta-disabled'}"
          data-sheet-action="meridian-upgrade"
          data-meridian-id="${m.id}"
          ${canTap ? '' : 'disabled'}
        >
          <span>${isMaxMer ? '타통 극의 ✓' : '⚡ 혈도 타통 (진기 1)'}</span>
        </button>
      </div>
    `;
  }).join('');

  const resetMeridianBtnHtml =
    meta.spentMeridianPoints > 0
      ? `<button type="button" class="meridian-reset-btn interactive" data-sheet-action="meridian-reset">♻ 연세골수 (${meta.spentMeridianPoints}혈 반환)</button>`
      : '';

  const meridianSectionHtml = `
    <div class="meridian-panel">
      <div class="meridian-realm-banner">
        <div class="meridian-realm-top">
          <div class="meridian-realm-title-wrap">
            <span class="grade-pill" style="background:${cult.realmColor}">☯ 단전 Lv.${cult.level}${rc > 0 ? ` · ${rc}전생` : ''}</span>
            <strong class="meridian-realm-name">${escapeHtml(cult.realmName)}</strong>
            <span class="meridian-qi-pill${meta.unspentMeridianPoints > 0 ? ' has-pts' : ''}">🔥 미사용 진기 ${meta.unspentMeridianPoints}혈</span>
          </div>
          ${resetMeridianBtnHtml}
        </div>
        <div class="meridian-xp-row">
          <div class="meridian-xp-track">
            <div class="meridian-xp-fill" style="width:${cultFillPct}%;background:linear-gradient(90deg, ${cult.realmColor}, #fde047)"></div>
          </div>
          <span class="meridian-xp-txt">${cult.isMaxLevel ? '무극 완성 (MAX · 전생 가능!)' : `내공 ${cult.currentLevelXp}/${cult.nextLevelXp} XP (승급 시 진기+1혈 · Lv.41 무극 전생)`}</span>
        </div>
        <div class="meridian-cycle-row">${cycleBadgeHtml}</div>
        ${reincarnationBannerHtml}
      </div>
      <div class="codex-milestone-strip realm-milestone-strip">${realmMilestoneHtml}</div>
      <div class="mastery-grid meridian-grid">${meridianCardsHtml}</div>
    </div>
  `;

  const masterySectionHtml = `
    <div class="mastery-panel">
      <div class="relic-set-head">
        <span>🏔 강호 경지 단련 &amp; 영혼 각인 (${meta.engravedCount}/${data.relics.length})</span>
        <span class="relic-set-hint">${escapeHtml(endgameSummaryTxt)}</span>
      </div>
      <div class="mastery-grid">${masteryCardsHtml}</div>
    </div>
  `;

  const bodyHtml = `
    <div class="relic-gacha-panel">
      <div class="relic-wallet-row">
        <div class="relic-wallet-pills">
          <span class="relic-wallet-pill">${ICON.goldCoin}<span>천하주화</span><b>${meta.gold.toLocaleString('ko-KR')}</b></span>
          <span class="relic-wallet-pill key">${ICON.key}<span>열쇠</span><b>${meta.keys}</b></span>
          <span class="relic-wallet-pill silk">${ICON.silk}<span>비단</span><b>${meta.silk}필</b></span>
          <span class="relic-wallet-pill shard">🔮<span>초월파편</span><b>${meta.totalRelicShards}</b></span>
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
            <span>${allBaseMaxed ? '파편 ×1' : '열쇠 ×1'}</span>
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
      ${chaosChestBannerHtml}
      ${noticeHtml}
    </div>
    ${blessedAltarHtml}
    ${meridianSectionHtml}
    ${relicSetSectionHtml}
    ${masterySectionHtml}
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

  const subtitle = `수집 ${meta.ownedSkinCount}/${totalSkins}종 · 협객 의복은 외형·이펙트 변모 · 전술 비무대 3종은 특수 전장 규칙 적용`;

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

        const arenaRuleBadge = court.arenaRuleLabel
          ? `<span class="arena-rule-tag">${escapeHtml(court.arenaRuleLabel)}</span>`
          : '';
        const arenaRuleSub = court.arenaRuleDesc
          ? `<div class="arena-rule-desc">⚡ 전장 규칙: ${escapeHtml(court.arenaRuleDesc)}</div>`
          : '';

        return `
          <div class="sheet-card skin-card${isEquipped ? ' skin-equipped' : isOwned ? ' skin-owned' : ' skin-locked'}${court.arenaRule ? ' court-tactical' : ''}">
            <div class="card-left">
              <div class="card-avatar court-avatar"><img src="${previewUrl}" alt="${escapeHtml(court.name)}" /></div>
              <div class="card-info">
                <div class="card-name-row">
                  <span class="grade-pill" style="background:${rMeta.color}">${rMeta.label}</span>
                  <span class="card-name">${escapeHtml(court.name)}</span>
                  ${arenaRuleBadge}
                  <span class="skin-swatches" title="등불·꽃잎 분위기 색상">
                    <i style="background:${court.lanternColor}"></i>
                    <i style="background:${court.petalPrimary}"></i>
                  </span>
                </div>
                <div class="card-sub">${escapeHtml(court.desc)}${condText}</div>
                ${arenaRuleSub}
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
