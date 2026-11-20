import {
  computeRelicSetStatuses,
  formatCompactNumber,
} from '../../core/relicFormulas';
import type { UISnapshot } from '../../core/Simulation';
import type { RecipeGraph } from '../../craft/RecipeGraph';
import { CONTRACTS_BY_ID } from '../../data/contracts';
import type { GameDataBundle, RecipeDef } from '../../data/types';
import type { MetaProfile } from '../../platform/MetaStore';
import type { SpriteCache } from '../../render/SpriteCache';
import { collectUnlockedCounts } from './CombatSheets';
import { buildDpsListHtml } from './RunModals';
import { escapeHtml, FACTION_META, getEquippedSkinDef } from '../uiShared';

export function buildDesktopLeftWingHtml(params: {
  readonly data: GameDataBundle;
  readonly sprites: SpriteCache;
  readonly snapshot: UISnapshot;
  readonly meta: MetaProfile;
}): string {
  const { data, sprites, snapshot, meta } = params;
  const dm = snapshot.damageMeter;
  const totalDmg = Math.max(1, dm.totalDamage);
  const fOrd = Math.round((dm.byFaction.orthodox / totalDmg) * 100);
  const fUno = Math.round((dm.byFaction.unorthodox / totalDmg) * 100);
  const fDem = Math.max(0, 100 - fOrd - fUno);

  const dpsHtml = buildDpsListHtml(data, sprites, snapshot, meta);

  // Active formations
  const syn = snapshot.synergy;
  const synBadges: string[] = [];
  if (syn.orthodoxTier > 0) {
    synBadges.push(
      `<span class="wing-chip chip-orthodox">☯ 북두검진 ${syn.orthodoxTier === 2 ? '극(6)' : '(3)'}</span>`,
    );
  }
  if (syn.unorthodoxTier > 0) {
    synBadges.push(
      `<span class="wing-chip chip-unorthodox">☠ 만독혈진 ${syn.unorthodoxTier === 2 ? '극(6)' : '(3)'}</span>`,
    );
  }
  if (syn.demonicTier > 0) {
    synBadges.push(
      `<span class="wing-chip chip-demonic">🩸 천마혈진 ${syn.demonicTier === 2 ? '극(6)' : '(3)'}</span>`,
    );
  }
  if (syn.trinityActive) {
    synBadges.push('<span class="wing-chip chip-trinity">✦ 삼재합진 활성</span>');
  }

  // Active Bench Passives
  const benchChipsHtml = snapshot.benchPassives.activeUnits
    .map(
      (bp) =>
        `<span class="wing-chip chip-bench" title="${escapeHtml(bp.name)}: ${escapeHtml(bp.desc)}">🏯 ${escapeHtml(bp.passiveName)}</span>`,
    )
    .join('');

  // Active Relic Set Resonances
  const sets = computeRelicSetStatuses(snapshot.relics).filter((s) => s.tier > 0);
  const setHtml = sets
    .map(
      (s) =>
        `<span class="wing-chip chip-set" style="border-color:${s.def.color}">✦ ${escapeHtml(s.def.name)} ${s.tier}단</span>`,
    )
    .join('');

  // Active Boons
  const boonEntries = Object.entries(snapshot.activeBoons).filter(([, lv]) => (lv ?? 0) > 0);
  const boonHtml = boonEntries
    .map(([id, lv]) => {
      const def = data.boonsById.get(id as keyof typeof snapshot.activeBoons);
      return `<span class="wing-chip chip-boon">📜 ${escapeHtml(def?.name ?? id)} Lv.${lv}</span>`;
    })
    .join('');

  const factionBarHtml =
    dm.totalDamage > 0
      ? `
        <div class="wing-faction-bar">
          <span style="width:${fOrd}%;background:${FACTION_META.orthodox.color}"></span>
          <span style="width:${fUno}%;background:${FACTION_META.unorthodox.color}"></span>
          <span style="width:${fDem}%;background:${FACTION_META.demonic.color}"></span>
        </div>
        <div class="wing-faction-legend">
          <span style="color:${FACTION_META.orthodox.color}">정파 ${fOrd}%</span>
          <span style="color:${FACTION_META.unorthodox.color}">사파 ${fUno}%</span>
          <span style="color:${FACTION_META.demonic.color}">마교 ${fDem}%</span>
        </div>
      `
      : '';

  const hasAnyChip =
    synBadges.length > 0 || benchChipsHtml.length > 0 || setHtml.length > 0 || boonHtml.length > 0;

  return `
    <section class="wing-card wing-dps-card">
      <div class="wing-head">
        <span class="wing-title">⚔ 실시간 딜량 순위</span>
        <span class="wing-meta">총 ${formatCompactNumber(dm.totalDamage)}</span>
      </div>
      ${factionBarHtml}
      <div class="wing-dps-scroll">${dpsHtml}</div>
    </section>

    <section class="wing-card wing-buff-card">
      <div class="wing-head">
        <span class="wing-title">☯ 진법 · 대기진 · 비급</span>
        <span class="wing-meta">비급 ${snapshot.totalBoonStacks} · 대기진 ${snapshot.benchPassives.activeUnits.length}</span>
      </div>
      <div class="wing-chip-wrap">
        ${synBadges.join('')}
        ${benchChipsHtml}
        ${setHtml}
        ${boonHtml}
        ${hasAnyChip ? '' : '<div class="wing-empty">협객 배치·대기석 진법 및 영물 토벌 시 활성 버프가 표시됩니다.</div>'}
      </div>
    </section>
  `;
}

export function buildDesktopRightWingHtml(params: {
  readonly data: GameDataBundle;
  readonly recipeGraph: RecipeGraph;
  readonly sprites: SpriteCache;
  readonly snapshot: UISnapshot;
  readonly meta: MetaProfile;
  readonly pinnedRecipeId: string | null;
  readonly recommendedRecipe: RecipeDef | null;
}): string {
  const { data, recipeGraph, sprites, snapshot, meta, pinnedRecipeId, recommendedRecipe } = params;
  const targetRec =
    (pinnedRecipeId ? recipeGraph.recipesById.get(pinnedRecipeId) : null) ?? recommendedRecipe;
  const totalReady = snapshot.craft.readyCount + snapshot.craft.chainReadyCount;

  let targetHtml = '<div class="wing-empty">협객을 소환하면 추천 합공식이 표시됩니다.</div>';
  if (targetRec) {
    const outU = data.unitsById.get(targetRec.output);
    const outG = outU ? data.gradesById.get(outU.grade) : undefined;
    const st = snapshot.craft.recipes[targetRec.id];
    const unlocked = collectUnlockedCounts(snapshot);
    if (outU && outG && st) {
      const imgUrl = sprites.unitPortraitUrl(outU, outG, getEquippedSkinDef(data, outU.id, meta));
      const isPinned = pinnedRecipeId === targetRec.id;
      const ingsHtml = targetRec.ingredients
        .map((ing) => {
          const iu = data.unitsById.get(ing.unit);
          const ig = iu ? data.gradesById.get(iu.grade) : undefined;
          if (!iu || !ig) return '';
          const have = Math.min(ing.n, unlocked.get(ing.unit) ?? 0);
          const ok = have >= ing.n;
          const iImg = sprites.unitPortraitUrl(iu, ig, getEquippedSkinDef(data, iu.id, meta));
          return `<span class="wing-ing ${ok ? 'ok' : 'miss'}"><img src="${iImg}" alt="" /><span>${escapeHtml(iu.name)}</span><b>${ok ? '✓' : `${have}/${ing.n}`}</b></span>`;
        })
        .join('');

      const canCraftNow = st.lamp === 'ready' || st.lamp === 'chainReady';
      targetHtml = `
        <div class="wing-target-box">
          <div class="wing-target-top">
            <div class="wing-target-avatar"><img src="${imgUrl}" alt="" /></div>
            <div class="wing-target-info">
              <span class="wing-target-badge" style="background:${outG.color}">${isPinned ? '📌 고정 · ' : ''}${escapeHtml(outG.name)}</span>
              <strong class="wing-target-name">${escapeHtml(outU.name)}</strong>
              <span class="wing-target-sub">⚔${outU.atk} · ${escapeHtml(outU.skill.name)}</span>
            </div>
          </div>
          <div class="wing-ing-list">${ingsHtml}</div>
          <div class="wing-target-actions">
            ${
              canCraftNow
                ? `<button type="button" class="wing-btn wing-btn-gold interactive" data-wing-action="craft" data-recipe-id="${targetRec.id}" data-chain="${st.lamp === 'chainReady' ? '1' : '0'}">${st.lamp === 'chainReady' ? '연쇄 등선!' : '즉시 합공!'}</button>`
                : `<button type="button" class="wing-btn wing-btn-dim interactive" data-wing-action="open-craft">합공보 열기 (${st.have}/${st.need})</button>`
            }
            ${
              totalReady > 0
                ? `<button type="button" class="wing-btn wing-btn-amber interactive" data-wing-action="craft-all">⚡ 전부 합공 (${totalReady})</button>`
                : ''
            }
          </div>
        </div>
      `;
    }
  }

  // Pending 3-choice contract or active contract tracker
  let contractWingHtml = '';
  if (snapshot.pendingContractOffer) {
    const opts = snapshot.pendingContractOffer.options
      .map((cid) => {
        const def = CONTRACTS_BY_ID.get(cid);
        if (!def) return '';
        return `
          <button type="button" class="wing-contract-pick interactive" data-wing-action="pick-contract" data-contract-id="${def.id}" title="${escapeHtml(def.desc)}">
            <b>📜 ${escapeHtml(def.name)}</b>
            <span>${escapeHtml(def.desc)}</span>
          </button>
        `;
      })
      .join('');
    contractWingHtml = `
      <div class="wing-contract-box">
        <div class="wing-contract-title">📜 밀명 3택 도착! (1개 수락)</div>
        ${opts}
      </div>
      <div class="wing-divider"></div>
    `;
  } else if (snapshot.contracts.length > 0) {
    contractWingHtml =
      snapshot.contracts
        .map((c) => {
          const pct = Math.min(100, Math.round((c.progress / Math.max(1, c.target)) * 100));
          const tag =
            c.status === 'completed'
              ? '<span class="wing-done-tag">완수</span>'
              : c.status === 'failed'
                ? '<span class="wing-prog-tag">만료</span>'
                : `<span class="wing-prog-tag">${c.progress}/${c.target}</span>`;
          return `
            <div class="wing-mission-row wing-contract-row${c.status === 'completed' ? ' is-done' : ''}">
              <div class="wing-mission-top">
                <span class="wing-mission-name">📜 ${escapeHtml(c.name)}</span>
                ${tag}
              </div>
              <div class="wing-bar"><span style="width:${pct}%"></span></div>
            </div>
          `;
        })
        .join('') + '<div class="wing-divider"></div>';
  }

  // Daily Martial Quests (claimable first)
  const dailyHtml = meta.dailyQuests
    .map((dq) => {
      const pct = Math.min(100, Math.round((dq.progress / Math.max(1, dq.def.target)) * 100));
      const claimBtn =
        dq.completed && !dq.claimed
          ? `<button type="button" class="wing-claim-btn interactive" data-wing-action="claim-daily" data-quest-id="${dq.def.id}">수령</button>`
          : dq.claimed
            ? '<span class="wing-done-tag">완료</span>'
            : `<span class="wing-prog-tag">${dq.progress}/${dq.def.target}</span>`;
      return `
        <div class="wing-mission-row${dq.completed && !dq.claimed ? ' is-claimable' : dq.claimed ? ' is-done' : ''}">
          <div class="wing-mission-top">
            <span class="wing-mission-name">📅 ${escapeHtml(dq.def.name)}</span>
            ${claimBtn}
          </div>
          <div class="wing-bar"><span style="width:${pct}%"></span></div>
        </div>
      `;
    })
    .join('');

  // In-run missions (incomplete first, up to 6 visible)
  const sortedMissions = [...snapshot.missions].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const ra = a.progress / Math.max(1, a.target);
    const rb = b.progress / Math.max(1, b.target);
    return rb - ra;
  });

  const missionHtml = sortedMissions
    .slice(0, 7)
    .map((m) => {
      const pct = Math.min(100, Math.round((m.progress / Math.max(1, m.target)) * 100));
      return `
        <div class="wing-mission-row${m.completed ? ' is-done' : ''}">
          <div class="wing-mission-top">
            <span class="wing-mission-name">${m.completed ? '✓ ' : ''}${escapeHtml(m.name)}</span>
            <span class="wing-prog-tag">${m.progress}/${m.target}</span>
          </div>
          <div class="wing-bar"><span style="width:${pct}%"></span></div>
        </div>
      `;
    })
    .join('');

  return `
    <section class="wing-card wing-target-card">
      <div class="wing-head">
        <span class="wing-title">📌 목표 합공 · 빠른 등선</span>
        <span class="wing-meta">가능 ${totalReady}</span>
      </div>
      ${targetHtml}
    </section>

    <section class="wing-card wing-mission-card">
      <div class="wing-head">
        <span class="wing-title">📋 밀명 · 일일 수련 · 의뢰</span>
        <span class="wing-meta">${snapshot.missionsCompletedCount}/${snapshot.missions.length}</span>
      </div>
      <div class="wing-mission-scroll">
        ${contractWingHtml}
        ${dailyHtml}
        <div class="wing-divider"></div>
        ${missionHtml}
      </div>
    </section>
  `;
}
