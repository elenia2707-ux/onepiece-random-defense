import {
  CODEX_MILESTONES,
  computeHeroProficiencyInfo,
  DIFFICULTY_CONFIGS,
  DIFFICULTY_ORDER,
  formatCompactNumber,
  HERO_PROFICIENCY_MAX_RANK,
  TITLE_DEFS,
  TRIAL_CONFIGS,
  TRIAL_ORDER,
} from '../../core/relicFormulas';
import type { UISnapshot } from '../../core/Simulation';
import type { RecipeGraph } from '../../craft/RecipeGraph';
import { COMBO_SKILLS } from '../../data/comboSkills';
import {
  BOSS_RUSH_TARGET_STAGE,
  ENDLESS_MILESTONES,
  getDailyChallengeSpec,
} from '../../data/specialModes';
import type { GameDataBundle, TrialId } from '../../data/types';
import {
  computeTitleProgress,
  getCodexDiscoveryReward,
  type MetaProfile,
} from '../../platform/MetaStore';
import type { SpriteCache } from '../../render/SpriteCache';
import {
  buildUnitRoleBadgesHtml,
  type CodexFilterId,
  escapeHtml,
  FACTION_META,
  formatTicksDuration,
  getEquippedSkinDef,
} from '../uiShared';

export interface CodexPanelParams {
  readonly data: GameDataBundle;
  readonly recipeGraph: RecipeGraph;
  readonly sprites: SpriteCache;
  readonly snapshot: UISnapshot;
  readonly meta: MetaProfile;
  readonly codexFilter: CodexFilterId;
}

export interface CodexPanelResult {
  readonly subtitle: string;
  readonly bodyHtml: string;
}

const DIFF_ACCENT: Readonly<Record<string, string>> = {
  normal: '#0f766e',
  hard: '#d97706',
  hell: '#be123c',
  abyss: '#7e22ce',
};

const TRIAL_ACCENT: Readonly<Record<TrialId, string>> = {
  trial_venom_gale: '#15803d',
  trial_sword_tomb: '#0369a1',
  trial_crimson_iron: '#b91c1c',
  trial_chaos_trinity: '#7e22ce',
  trial_gale_blitz: '#0284c7',
  trial_abyss_sanctum: '#581c87',
};

export function buildCodexPanelView(params: CodexPanelParams): CodexPanelResult {
  const { data, recipeGraph, sprites, snapshot, meta, codexFilter } = params;

  const subtitle = `등재 협객 ${meta.discoveredCount}/${data.units.length}인 · 칭호 ${meta.unlockedTitleCount}/${TITLE_DEFS.length} · 비경 제패 ${meta.clearedTrialCount}/${TRIAL_ORDER.length}`;

  const diffCards = DIFFICULTY_ORDER.map((diff) => {
    const cfg = DIFFICULTY_CONFIGS[diff];
    const unlocked = meta.unlockedDifficulties[diff];
    const cleared = meta.clearedDifficulties[diff];
    const active =
      snapshot.runMode === 'standard' && snapshot.trialId === null && snapshot.difficulty === diff;
    const bestDiffWave = meta.difficultyBestWave[diff] ?? 0;

    const clearBadge = cleared
      ? '<span class="diff-clear-pill">🏆 30장 제패</span>'
      : `<span class="diff-bonus-pill">초회 +${cfg.firstClearGold}주화 · 열쇠+${cfg.firstClearKeys}</span>`;

    const bestWaveBadge =
      bestDiffWave > 0
        ? `<span class="diff-best-pill">최고 제 ${String(bestDiffWave).padStart(2, '0')}장</span>`
        : '';

    const btnLabel = active
      ? '출정 중 ✓'
      : unlocked
        ? snapshot.trialId !== null || snapshot.runMode !== 'standard'
          ? '표준 복귀'
          : '출정 전환'
        : '🔒 미해금';
    const btnClass = active
      ? 'card-cta-btn cta-green interactive'
      : unlocked
        ? 'card-cta-btn interactive'
        : 'card-cta-btn cta-disabled';

    return `
      <div class="diff-card${active ? ' diff-active' : ''}${!unlocked ? ' diff-locked' : ''}">
        <div class="diff-info">
          <div class="card-name-row">
            <span class="grade-pill" style="background:${DIFF_ACCENT[diff] ?? '#0f766e'}">${escapeHtml(cfg.badge)}</span>
            <span class="card-name">${escapeHtml(cfg.name)}</span>
            ${clearBadge}
            ${bestWaveBadge}
          </div>
          <div class="card-sub">${escapeHtml(cfg.desc)}</div>
        </div>
        <button
          type="button"
          class="${btnClass}"
          data-sheet-action="select-difficulty"
          data-difficulty="${diff}"
          ${unlocked ? '' : 'disabled'}
        >
          <span>${btnLabel}</span>
        </button>
      </div>
    `;
  }).join('');

  const trialCards = TRIAL_ORDER.map((tid) => {
    const cfg = TRIAL_CONFIGS[tid];
    const cleared = Boolean(meta.clearedTrials[tid]);
    const active = snapshot.trialId === tid;
    const rec = meta.trialRecords[tid];
    const clearBadge = cleared
      ? `<span class="diff-clear-pill">🏆 ${cfg.targetWave}장 제패</span>`
      : `<span class="diff-bonus-pill">초회 +${cfg.firstClearGold}주화 · 열쇠+${cfg.firstClearKeys} · 비단+${cfg.firstClearSilk}필</span>`;

    const recordParts: string[] = [];
    if (rec && (rec.clears > 0 || rec.bestWave > 0)) {
      recordParts.push(`제패 ${rec.clears}회`);
      recordParts.push(`최고 제 ${String(rec.bestWave).padStart(2, '0')}장`);
      if (rec.bestTicks !== null) {
        recordParts.push(`최단 ${formatTicksDuration(rec.bestTicks)}`);
      }
    }
    const recordLineHtml =
      recordParts.length > 0
        ? `<div class="trial-record-line">📜 전적: ${escapeHtml(recordParts.join(' · '))}</div>`
        : '';

    const btnClass = active
      ? 'card-cta-btn cta-green interactive'
      : 'card-cta-btn cta-crimson interactive';
    const btnLabel = active ? '출정 중 · 해제' : '비경 출정';
    const targetTrialAttr = active ? '' : tid;

    return `
      <div class="diff-card trial-card${active ? ' diff-active trial-active' : ''}">
        <div class="diff-info">
          <div class="card-name-row">
            <span class="grade-pill" style="background:${TRIAL_ACCENT[tid]}">${escapeHtml(cfg.badge)} · ${cfg.rewardMult}x</span>
            <span class="card-name">${escapeHtml(cfg.name)}</span>
            <span class="trial-rule-tag">${escapeHtml(cfg.ruleTag)}</span>
            ${clearBadge}
          </div>
          <div class="card-sub">${escapeHtml(cfg.desc)}</div>
          ${recordLineHtml}
        </div>
        <button
          type="button"
          class="${btnClass}"
          data-sheet-action="select-trial"
          data-trial-id="${targetTrialAttr}"
        >
          <span>${btnLabel}</span>
        </button>
      </div>
    `;
  }).join('');

  const titleCards = TITLE_DEFS.map((t) => {
    const unlocked = Boolean(meta.unlockedTitles[t.id]);
    const equipped = meta.equippedTitle === t.id;
    const prog = computeTitleProgress(meta, t);
    const pct = Math.min(100, Math.round((prog.current / Math.max(1, prog.target)) * 100));

    const rewardParts: string[] = [];
    if (t.rewardGold > 0) rewardParts.push(`주화 +${t.rewardGold}`);
    if (t.rewardKeys > 0) rewardParts.push(`열쇠 +${t.rewardKeys}`);
    if (t.rewardSilk > 0) rewardParts.push(`비단 +${t.rewardSilk}필`);
    const rewardLabel = rewardParts.length > 0 ? rewardParts.join(' · ') : '명예 칭호';

    const btnClass = equipped
      ? 'card-cta-btn cta-green interactive'
      : unlocked
        ? 'card-cta-btn cta-sky interactive'
        : 'card-cta-btn cta-disabled';
    const btnLabel = equipped ? '장착 중 ✓' : unlocked ? '칭호 장착' : `${prog.current}/${prog.target}`;

    return `
      <div class="title-card${unlocked ? ' unlocked' : ''}${equipped ? ' equipped' : ''}">
        <div class="title-info">
          <div class="card-name-row">
            <span class="grade-pill" style="background:${t.color}">${escapeHtml(t.badge)}</span>
            <span class="card-name">${escapeHtml(t.name)}</span>
            <span class="title-reward-pill${unlocked ? ' claimed' : ''}">${unlocked ? '✓ ' : ''}${escapeHtml(rewardLabel)}</span>
          </div>
          <div class="card-sub">${escapeHtml(t.desc)}</div>
          <div class="title-prog-row">
            <div class="title-prog-track"><div class="title-prog-fill" style="width:${pct}%;background:${t.color}"></div></div>
            <span class="title-prog-txt">${prog.current}/${prog.target}</span>
          </div>
        </div>
        <button
          type="button"
          class="${btnClass}"
          data-sheet-action="equip-title"
          data-title-id="${equipped ? '' : t.id}"
          ${unlocked ? '' : 'disabled'}
        >
          <span>${btnLabel}</span>
        </button>
      </div>
    `;
  }).join('');

  const orthodoxTotal = data.units.filter((u) => u.faction === 'orthodox').length;
  const unorthodoxTotal = data.units.filter((u) => u.faction === 'unorthodox').length;
  const demonicTotal = data.units.filter((u) => u.faction === 'demonic').length;

  const filters: readonly { readonly id: CodexFilterId; readonly label: string }[] = [
    { id: 'all', label: `전체 (${data.units.length})` },
    { id: 'orthodox', label: `정파 (${orthodoxTotal})` },
    { id: 'unorthodox', label: `사파 (${unorthodoxTotal})` },
    { id: 'demonic', label: `마교 (${demonicTotal})` },
  ];
  const filterHtml = filters
    .map(
      (f) =>
        `<button type="button" class="codex-filter-btn interactive${codexFilter === f.id ? ' active' : ''}" data-sheet-action="codex-filter" data-filter="${f.id}">${f.label}</button>`,
    )
    .join('');

  const filteredUnits = data.units
    .filter((u) => codexFilter === 'all' || u.faction === codexFilter)
    .sort((a, b) => {
      const rA = data.gradesById.get(a.grade)?.rank ?? 0;
      const rB = data.gradesById.get(b.grade)?.rank ?? 0;
      if (rA !== rB) return rB - rA;
      if (a.faction !== b.faction) return a.faction.localeCompare(b.faction);
      return b.atk - a.atk;
    });

  const unitCards = filteredUnits
    .map((u) => {
      const g = data.gradesById.get(u.grade);
      if (!g) return '';
      const fMeta = FACTION_META[u.faction];
      const discovered = Boolean(meta.discoveredUnits[u.id]);
      const discReward = getCodexDiscoveryReward(g);
      const portrait = sprites.unitPortraitUrl(u, g, getEquippedSkinDef(data, u.id, meta));
      const roleBadges = buildUnitRoleBadgesHtml(u, true);

      const lowerRecs = recipeGraph.byOutput.get(u.id) ?? [];
      let lowerLine = '획득처: 초출강호(일반 소환) · 기연 초빙';
      if (lowerRecs.length > 0) {
        const formulaStrings = lowerRecs.map((rec) =>
          rec.ingredients
            .map((ing) => {
              const ingName = data.unitsById.get(ing.unit)?.name ?? ing.unit;
              return ing.n > 1 ? `${ingName}×${ing.n}` : ingName;
            })
            .join(' + '),
        );
        lowerLine =
          lowerRecs.length > 1
            ? `조합식(${lowerRecs.length}종): ${formulaStrings.join('  ｜  ')}`
            : `하위 조합: ${formulaStrings[0]!}`;
      } else if (!u.leaf) {
        lowerLine = '획득처: 영약 복용 · 기연 초빙';
      }

      const upperRecs = recipeGraph.byIngredient.get(u.id) ?? [];
      const upperNames = Array.from(
        new Set(
          upperRecs
            .map((r) => data.unitsById.get(r.output)?.name)
            .filter((n): n is string => Boolean(n)),
        ),
      );
      const upperLine =
        upperNames.length > 0
          ? `상위 등선: ${upperNames.join(' / ')}`
          : '상위 등선: ★ 최종 지존 경지';

      const statusBadge = discovered
        ? '<span class="codex-disc-badge ok">등재 완료 ✓</span>'
        : `<span class="codex-disc-badge locked">미등재 · 초회 +${discReward.gold}주화${discReward.keys > 0 ? ` · 열쇠+${discReward.keys}` : ''}</span>`;

      const extraTactical: string[] = [];
      if (u.passiveTrait) {
        extraTactical.push(`고유특성 [${u.passiveTrait.name}] ${u.passiveTrait.desc}`);
      }
      if (u.supportAura) {
        const spd = u.supportAura.speedPct > 0 ? `·속+${u.supportAura.speedPct}%` : '';
        extraTactical.push(`인접고무 [${u.supportAura.name}] 공+${u.supportAura.atkPct}%${spd}`);
      }
      if ((u.armorShred ?? 0) > 0) {
        extraTactical.push(`호신강기 파쇄 -${u.armorShred}`);
      }
      const tacticalNote =
        extraTactical.length > 0 ? ` · <b>${escapeHtml(extraTactical.join(' / '))}</b>` : '';

      const profEntry = meta.heroProficiency[u.id] ?? { xp: 0, runs: 0, mvpCount: 0 };
      const profInfo = computeHeroProficiencyInfo(profEntry.xp);
      const profPct = profInfo.isMaxRank
        ? 100
        : Math.min(100, Math.max(0, Math.round((profInfo.currentTierXp / profInfo.nextTierXp) * 100)));
      const profBadgeHtml =
        profInfo.rank > 0
          ? `<span class="codex-prof-badge" style="background:${profInfo.color}">🥋 ${escapeHtml(profInfo.rankName)} Lv.${profInfo.rank} (공+${profInfo.atkBonusPct}%)</span>`
          : '';
      const mvpPart = profEntry.mvpCount > 0 ? ` · 👑MVP ${profEntry.mvpCount}회` : '';
      const profBarHtml =
        profEntry.xp > 0 || discovered
          ? `
              <div class="codex-prof-row">
                <div class="codex-prof-track">
                  <div class="codex-prof-fill" style="width:${profPct}%;background:${profInfo.color}"></div>
                </div>
                <span class="codex-prof-meta">${profInfo.isMaxRank ? `무신 극의 (${HERO_PROFICIENCY_MAX_RANK}단·공+15%)` : `숙련 ${profInfo.currentTierXp}/${profInfo.nextTierXp} XP (다음: 공+${(profInfo.rank + 1) * 3}%)`}${profEntry.runs > 0 ? ` · 출전 ${profEntry.runs}회${mvpPart}` : ''}</span>
              </div>
            `
          : '';

      return `
        <div class="sheet-card codex-card${discovered ? ' codex-discovered' : ' codex-undiscovered'}">
          <div class="card-left">
            <div class="card-avatar"><img src="${portrait}" alt="${escapeHtml(u.name)}" /></div>
            <div class="card-info">
              <div class="card-name-row">
                <span class="grade-pill" style="background:${g.color}">${escapeHtml(g.name)}</span>
                <span class="grade-pill" style="background:${fMeta.color}">${fMeta.label}</span>
                <span class="card-name">${escapeHtml(u.name)}</span>
                ${roleBadges}
                ${profBadgeHtml}
                ${statusBadge}
              </div>
              <div class="card-sub">⚔${u.atk} · 사거리 ${u.range} · 절기 <b>[${escapeHtml(u.skill.name)}]</b>${tacticalNote}</div>
              <div class="codex-lineage">${escapeHtml(lowerLine)} · <span>${escapeHtml(upperLine)}</span></div>
              ${profBarHtml}
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  const dailySpec = getDailyChallengeSpec(meta.dailyDate);
  const dailyRec = meta.dailyChallengeToday;
  const dailyActive = snapshot.runMode === 'daily_challenge';
  const dailyBestLine = dailyRec
    ? `오늘 최고: ${dailyRec.bestScore.toLocaleString('ko-KR')}점 (제 ${String(dailyRec.bestWave).padStart(2, '0')}장${dailyRec.cleared ? ' · 제패 ✓' : ''}) · 보상 티어 ${dailyRec.rewardTierClaimed}/2`
    : '오늘 첫 도전 시 10장 돌파·20장 제패 영구 보상 획득!';
  const dailyBtnLabel = dailyActive ? '출정 중 ✓' : '오늘의 비무 출정';
  const dailyBtnClass = dailyActive ? 'card-cta-btn cta-green interactive' : 'card-cta-btn cta-gold interactive';

  const brRec = meta.bossRushRecord;
  const brActive = snapshot.runMode === 'boss_rush';
  const brBestParts: string[] = [];
  if (brRec.bestStage > 0 || brRec.clears > 0) {
    brBestParts.push(`제패 ${brRec.clears}회`);
    brBestParts.push(`최고 제${brRec.bestStage}관문`);
    if (brRec.bestTicks !== null) {
      brBestParts.push(`최단 ${formatTicksDuration(brRec.bestTicks)}`);
    }
  }
  const brRecordLine =
    brBestParts.length > 0
      ? `📜 전적: ${brBestParts.join(' · ')}`
      : `초회 10관문 제패 시 +350주화 · 열쇠+3 · 비단+50필`;
  const brBtnLabel = brActive ? '출정 중 ✓' : '보스 러시 출정';
  const brBtnClass = brActive ? 'card-cta-btn cta-green interactive' : 'card-cta-btn cta-crimson interactive';

  const specialModesHtml = `
    <div class="special-mode-grid">
      <div class="diff-card special-mode-card daily-mode-card${dailyActive ? ' diff-active' : ''}">
        <div class="diff-info">
          <div class="card-name-row">
            <span class="grade-pill" style="background:#0284c7">📅 ${escapeHtml(dailySpec.dateKey)}</span>
            <span class="card-name">오늘의 강호 비무</span>
            <span class="trial-rule-tag">${escapeHtml(dailySpec.rule.badge)}</span>
            <span class="diff-best-pill">시드 ${escapeHtml(dailySpec.seedCode)}</span>
            ${meta.dailyChallengeStreak > 0 ? `<span class="diff-clear-pill">🔥 ${meta.dailyChallengeStreak}일 연속</span>` : ''}
          </div>
          <div class="card-sub"><b>[${escapeHtml(dailySpec.rule.name)}]</b> ${escapeHtml(dailySpec.rule.desc)} (제 ${dailySpec.targetWave} 장 목표)</div>
          <div class="trial-record-line">${escapeHtml(dailyBestLine)}</div>
        </div>
        <button
          type="button"
          class="${dailyBtnClass}"
          data-sheet-action="select-run-mode"
          data-run-mode="daily_challenge"
        >
          <span>${dailyBtnLabel}</span>
        </button>
      </div>
      <div class="diff-card special-mode-card boss-rush-card${brActive ? ' diff-active' : ''}">
        <div class="diff-info">
          <div class="card-name-row">
            <span class="grade-pill" style="background:#be123c">⚔ ${BOSS_RUSH_TARGET_STAGE}연전</span>
            <span class="card-name">보스 러시</span>
            <span class="trial-rule-tag">초기 420은자·6영단·기연6</span>
            ${brRec.clears > 0 ? '<span class="diff-clear-pill">🏆 10관문 제패</span>' : '<span class="diff-bonus-pill">초회 +350주화·비단+50</span>'}
          </div>
          <div class="card-sub">잡졸 없이 영물 보스 ${BOSS_RUSH_TARGET_STAGE}연전! 매 관문 대형 보상 + 홀수 관문 기연 3택 · 클리어 후 무한 관문 도전 가능</div>
          <div class="trial-record-line">${escapeHtml(brRecordLine)}</div>
        </div>
        <button
          type="button"
          class="${brBtnClass}"
          data-sheet-action="select-run-mode"
          data-run-mode="boss_rush"
        >
          <span>${brBtnLabel}</span>
        </button>
      </div>
    </div>
  `;

  const clearedEndlessSet = new Set(meta.endlessMilestonesCleared);
  const endlessMilestoneChipsHtml = ENDLESS_MILESTONES.map((ms) => {
    const done = clearedEndlessSet.has(ms.wave);
    return `
      <div class="endless-ms-chip${done ? ' done' : ''}">
        <div class="endless-ms-top">
          <span class="endless-ms-wave">${ms.wave}장</span>
          <span class="endless-ms-status">${done ? '✓ 달성' : '미달성'}</span>
        </div>
        <div class="endless-ms-reward">+${ms.rewardGold}주화 · 🔑${ms.rewardKeys} · 🧵${ms.rewardSilk}</div>
      </div>
    `;
  }).join('');

  const hofRowsHtml =
    meta.hallOfFame.length > 0
      ? meta.hallOfFame
          .slice(0, 8)
          .map((entry, idx) => {
            const modeLabel =
              entry.runMode === 'daily_challenge'
                ? '📅 일일'
                : entry.runMode === 'boss_rush'
                  ? '⚔ 러시'
                  : entry.trialId
                    ? `🌀 ${TRIAL_CONFIGS[entry.trialId]?.badge ?? '비경'}`
                    : DIFFICULTY_CONFIGS[entry.difficulty]?.badge.split(' ')[0] ?? entry.difficulty;
            const waveTxt =
              entry.runMode === 'boss_rush'
                ? `제${entry.wave}관문`
                : `제 ${String(entry.wave).padStart(2, '0')}장`;
            const heroTxt = entry.topHeroName ? ` · MVP ${entry.topHeroName}` : '';
            const dmgTxt = entry.totalDamage > 0 ? ` · ${formatCompactNumber(entry.totalDamage)}` : '';
            return `
              <div class="hof-row">
                <span class="hof-rank">#${idx + 1}</span>
                <span class="hof-mode">${escapeHtml(modeLabel)}</span>
                <span class="hof-main"><b>${waveTxt}</b>${entry.victory ? ' 🏆' : ''}${escapeHtml(heroTxt)}${dmgTxt}</span>
                <span class="hof-date">${escapeHtml(entry.dateKey.slice(5))}</span>
              </div>
            `;
          })
          .join('')
      : '<div class="hof-empty">아직 등재된 전설 기록이 없습니다. 5장 이상 돌파하거나 무한 40장+에 도전해 보세요!</div>';

  const activeComboIds = new Set(snapshot.activeCombos.map((c) => c.id));
  const comboCardsHtml = COMBO_SKILLS.map((c) => {
    const u0 = data.unitsById.get(c.requiredUnits[0])?.name ?? c.requiredUnits[0];
    const u1 = data.unitsById.get(c.requiredUnits[1])?.name ?? c.requiredUnits[1];
    const isActive = activeComboIds.has(c.id);
    const cdSec = Math.round(c.cooldownTicks / 30);
    return `
      <div class="combo-card${isActive ? ' active' : ''}" style="border-left:4px solid ${c.color}">
        <div class="card-name-row">
          <span class="grade-pill" style="background:${c.color}">${escapeHtml(c.tierLabel)}</span>
          <span class="card-name">${escapeHtml(c.name)}</span>
          <span class="diff-best-pill">${escapeHtml(u0)} + ${escapeHtml(u1)}</span>
          ${isActive ? '<span class="diff-clear-pill">⚡ 발동 중</span>' : `<span class="trial-rule-tag">${cdSec}초</span>`}
        </div>
        <div class="card-sub">${escapeHtml(c.desc)}</div>
      </div>
    `;
  }).join('');

  const claimedCodexSet = new Set(meta.claimedCodexMilestones);
  const codexMilestoneHtml = CODEX_MILESTONES.map((ms) => {
    const claimed = claimedCodexSet.has(ms.target);
    const reached = meta.discoveredCount >= ms.target;
    const rewardParts = [`+${ms.rewardGold}주화`, `🔑+${ms.rewardKeys}`];
    if (ms.rewardSilk > 0) rewardParts.push(`🧵+${ms.rewardSilk}`);
    rewardParts.push(`⚔공+${ms.atkBonusPct}%`);
    const btnHtml = claimed
      ? '<span class="codex-ms-done">✓ 수령완료</span>'
      : reached
        ? `<button type="button" class="card-cta-btn cta-gold interactive codex-ms-claim-btn" data-sheet-action="claim-codex-milestone" data-codex-target="${ms.target}"><span>보상 수령</span></button>`
        : `<span class="codex-ms-prog">${meta.discoveredCount}/${ms.target}</span>`;
    return `
      <div class="codex-ms-card${claimed ? ' claimed' : reached ? ' ready' : ''}">
        <div class="codex-ms-head">
          <strong>${escapeHtml(ms.name)}</strong>
          ${btnHtml}
        </div>
        <div class="codex-ms-rewards">${escapeHtml(rewardParts.join(' · '))}</div>
      </div>
    `;
  }).join('');

  const bodyHtml = `
    <div class="codex-guide-banner">
      <div class="settlement-preview-info">
        <span class="settlement-preview-title">📜 강호 입문 교범 · 핵심 전술 요약</span>
        <span class="settlement-preview-sub">초출강호 → 합공(정통·×3 동문합일) → 기연·영약·내공 → 영물 패턴 파훼 4단계 가이드를 다시 볼 수 있습니다.</span>
      </div>
      <button type="button" class="card-cta-btn cta-sky interactive" data-sheet-action="replay-tutorial">
        <span>❔ 입문 교범</span>
      </button>
    </div>
    <div class="sheet-section-label">🌟 특수 출정 모드 — 매일의 시련 &amp; 보스 러시</div>
    ${specialModesHtml}
    <div class="sheet-section-label">🏛 무한 40장+ 마일스톤 (${meta.endlessMilestonesCleared.length}/${ENDLESS_MILESTONES.length}) &amp; 강호 명예의 전당</div>
    <div class="endless-hall-box">
      <div class="endless-milestone-grid">${endlessMilestoneChipsHtml}</div>
      <div class="hof-list">${hofRowsHtml}</div>
    </div>
    <div class="sheet-section-label">⚡ 문파 연환절기 (합체기 · 비무대 동시 배치 시 자동 발동 ${snapshot.activeCombos.length}/${COMBO_SKILLS.length})</div>
    <div class="combo-encyclopedia-grid">${comboCardsHtml}</div>
    <div class="sheet-section-label">⚔ 표준 출정 난이도 선택 (제 30 장 제패 시 상위 난이도 해금)</div>
    <div class="diff-list">${diffCards}</div>
    <div class="sheet-section-label">🌀 무림 비경 — 특수 규칙 엔드게임 시련 (${meta.clearedTrialCount}/${TRIAL_ORDER.length} 제패)</div>
    <div class="diff-list trial-list">${trialCards}</div>
    <div class="sheet-section-label">🏅 강호 칭호 · 업적 보상 사다리 (${meta.unlockedTitleCount}/${TITLE_DEFS.length} 해금)</div>
    <div class="title-ladder-list">${titleCards}</div>
    <div class="codex-header-bar">
      <span class="sheet-section-label">📖 무림 ${data.units.length}인 명숙록 (${meta.discoveredCount}/${data.units.length}${meta.masteredHeroCount > 0 ? ` · 숙련 ${meta.masteredHeroCount}인` : ''}${meta.codexAtkBonusPct > 0 ? ` · 수집공+${meta.codexAtkBonusPct}%` : ''})</span>
      <div class="codex-filter-row">${filterHtml}</div>
    </div>
    <div class="codex-milestone-strip">${codexMilestoneHtml}</div>
    ${unitCards}
  `;

  return { subtitle, bodyHtml };
}
