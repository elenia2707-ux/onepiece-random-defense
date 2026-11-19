import {
  DIFFICULTY_CONFIGS,
  formatCompactNumber,
  TITLES_BY_ID,
  TRIAL_CONFIGS,
} from '../../core/relicFormulas';
import type { BoonOfferSnapshot, UISnapshot } from '../../core/Simulation';
import type { BoonDef, CourtSkinId, GameDataBundle } from '../../data/types';
import type { MetaProfile, SettlementRecord } from '../../platform/MetaStore';
import type { SpriteCache } from '../../render/SpriteCache';
import {
  BOON_RARITY_META,
  escapeHtml,
  FACTION_META,
  getEquippedSkinDef,
  ICON,
  renderBoonIconSvg,
} from '../uiShared';

export function buildBoonCardsHtml(
  data: GameDataBundle,
  snapshot: UISnapshot,
  offer: BoonOfferSnapshot,
): string {
  return offer.options
    .map((boonId) => {
      const def: BoonDef | undefined = data.boonsById.get(boonId);
      if (!def) return '';
      const rMeta = BOON_RARITY_META[def.rarity];
      const curStacks = snapshot.activeBoons[boonId] ?? 0;
      const nextStacks = Math.min(def.maxStacks, curStacks + 1);
      const stackBadge =
        curStacks <= 0
          ? '<span class="boon-stack-pill is-new">신규 전수</span>'
          : `<span class="boon-stack-pill is-up">Lv.${curStacks} → Lv.${nextStacks}</span>`;

      return `
          <button
            type="button"
            class="boon-card rarity-${def.rarity} interactive"
            data-boon-id="${def.id}"
          >
            <div class="boon-card-left">
              <div class="boon-icon-frame rarity-${def.rarity}">
                ${renderBoonIconSvg(def.iconKind)}
              </div>
            </div>
            <div class="boon-card-body">
              <div class="boon-card-top">
                <span class="boon-rarity-pill" style="background:${rMeta.color}">${rMeta.label}</span>
                <span class="boon-tag-pill">${escapeHtml(def.tag)}</span>
                ${stackBadge}
              </div>
              <div class="boon-card-name">${escapeHtml(def.name)}</div>
              <div class="boon-card-desc">${escapeHtml(def.desc)}</div>
            </div>
            <div class="boon-card-cta">
              <span>전수</span>
            </div>
          </button>
        `;
    })
    .join('');
}

export function buildDpsListHtml(
  data: GameDataBundle,
  sprites: SpriteCache,
  snapshot: UISnapshot,
  meta: MetaProfile,
): string {
  const dm = snapshot.damageMeter;
  if (dm.entries.length === 0) {
    return '<div class="dps-empty">전투 개시 후 협객별 누적 피해량이 집계됩니다.</div>';
  }

  return dm.entries
    .map((entry, idx) => {
      const u = data.unitsById.get(entry.unitId);
      const g = u ? data.gradesById.get(u.grade) : undefined;
      const imgUrl =
        u && g ? sprites.unitPortraitUrl(u, g, getEquippedSkinDef(data, u.id, meta)) : '';
      const fColor = FACTION_META[entry.faction].color;
      return `
          <div class="dps-row">
            <span class="dps-rank">${idx + 1}</span>
            <div class="dps-avatar"><img src="${imgUrl}" alt="" /></div>
            <div class="dps-main">
              <div class="dps-meta-line">
                <span class="dps-name">${escapeHtml(entry.name)}</span>
                <span class="dps-val">${formatCompactNumber(entry.damage)} <b>(${entry.sharePct.toFixed(1)}%)</b></span>
              </div>
              <div class="dps-bar-track">
                <div class="dps-bar-fill" style="width:${Math.max(3, entry.sharePct).toFixed(1)}%;background:${fColor}"></div>
              </div>
            </div>
          </div>
        `;
    })
    .join('');
}

export function buildSettlementLootHtml(
  data: GameDataBundle,
  snapshot: UISnapshot,
  rec: SettlementRecord,
): string {
  const diffCfg = DIFFICULTY_CONFIGS[snapshot.difficulty];
  const trialCfg = snapshot.trialId ? TRIAL_CONFIGS[snapshot.trialId] : null;
  const multBadge = trialCfg
    ? ` <span class="settlement-mult-badge">${escapeHtml(trialCfg.badge)} ${trialCfg.rewardMult}x</span>`
    : diffCfg.rewardMult > 1
      ? ` <span class="settlement-mult-badge">${escapeHtml(diffCfg.badge)}</span>`
      : '';

  let firstClearBanner = '';
  if (rec.firstClearBonusGold > 0) {
    const silkPart =
      rec.firstClearBonusSilk > 0 ? ` · 운금비단 +${rec.firstClearBonusSilk}필` : '';
    const nextDiffName = rec.unlockedNextDifficulty
      ? ` · [${DIFFICULTY_CONFIGS[rec.unlockedNextDifficulty].name}] 해금!`
      : '';
    const clearKind = rec.trialId ? '초회 비경 제패' : '초회 천하통일';
    firstClearBanner = `
          <div class="first-clear-banner">
            🎉 ${clearKind} 보너스 포함! (+${rec.firstClearBonusGold} 주화 · 열쇠 +${rec.firstClearBonusKeys}${silkPart}${escapeHtml(nextDiffName)})
          </div>
        `;
  }

  let titleUnlockBanner = '';
  if (rec.unlockedTitleIds.length > 0) {
    const names = rec.unlockedTitleIds.map((id) => TITLES_BY_ID.get(id)?.name ?? id);
    const bonusParts: string[] = [];
    if (rec.titleBonusGold > 0) bonusParts.push(`주화 +${rec.titleBonusGold}`);
    if (rec.titleBonusKeys > 0) bonusParts.push(`열쇠 +${rec.titleBonusKeys}`);
    if (rec.titleBonusSilk > 0) bonusParts.push(`비단 +${rec.titleBonusSilk}필`);
    const bonusTxt = bonusParts.length > 0 ? ` (${bonusParts.join(' · ')})` : '';
    titleUnlockBanner = `
          <div class="first-clear-banner title-unlock-banner">
            🏅 강호 칭호 영구 해금! [${escapeHtml(names.join(', '))}]${escapeHtml(bonusTxt)}
          </div>
        `;
  }

  let skinUnlockBanner = '';
  if (rec.unlockedSkinIds.length > 0) {
    const names = rec.unlockedSkinIds.map(
      (id) =>
        data.heroSkinsById.get(id)?.name ?? data.courtSkinsById.get(id as CourtSkinId)?.name ?? id,
    );
    skinUnlockBanner = `
          <div class="first-clear-banner skin-unlock-banner">
            👘 한정 전설 외형 영구 해금! [${escapeHtml(names.join(', '))}]
          </div>
        `;
  }

  const totalSilkGain = rec.firstClearBonusSilk + rec.titleBonusSilk;
  const silkLootHtml =
    totalSilkGain > 0
      ? `
          <div class="settlement-loot-item">
            ${ICON.silk}
            <div class="settlement-loot-meta">
              <span class="settlement-loot-gain">+${totalSilkGain}필 운금비단</span>
              <span class="settlement-loot-total">보유 ${rec.totalSilk}필</span>
            </div>
          </div>
        `
      : '';

  const displayGoldGain = rec.goldEarned + rec.titleBonusGold;
  const displayKeysGain = rec.keysEarned + rec.titleBonusKeys;

  return `
        <div class="settlement-loot-title">출정 정산 영구 보상${multBadge}</div>
        ${firstClearBanner}
        ${titleUnlockBanner}
        ${skinUnlockBanner}
        <div class="settlement-loot-row">
          <div class="settlement-loot-item">
            ${ICON.goldCoin}
            <div class="settlement-loot-meta">
              <span class="settlement-loot-gain">+${displayGoldGain.toLocaleString('ko-KR')} 천하주화</span>
              <span class="settlement-loot-total">보유 ${rec.totalGold.toLocaleString('ko-KR')}</span>
            </div>
          </div>
          <div class="settlement-loot-item">
            ${ICON.key}
            <div class="settlement-loot-meta">
              <span class="settlement-loot-gain">+${displayKeysGain} 기보함 열쇠</span>
              <span class="settlement-loot-total">보유 ${rec.totalKeys}개</span>
            </div>
          </div>
          ${silkLootHtml}
        </div>
      `;
}
