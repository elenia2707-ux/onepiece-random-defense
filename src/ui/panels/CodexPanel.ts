import {
  DIFFICULTY_CONFIGS,
  DIFFICULTY_ORDER,
  TRIAL_CONFIGS,
  TRIAL_ORDER,
} from '../../core/relicFormulas';
import type { UISnapshot } from '../../core/Simulation';
import type { RecipeGraph } from '../../craft/RecipeGraph';
import type { GameDataBundle, TrialId } from '../../data/types';
import { getCodexDiscoveryReward, type MetaProfile } from '../../platform/MetaStore';
import type { SpriteCache } from '../../render/SpriteCache';
import {
  buildUnitRoleBadgesHtml,
  type CodexFilterId,
  escapeHtml,
  FACTION_META,
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
};

const TRIAL_ACCENT: Readonly<Record<TrialId, string>> = {
  trial_venom_gale: '#15803d',
  trial_sword_tomb: '#0369a1',
  trial_crimson_iron: '#b91c1c',
  trial_chaos_trinity: '#7e22ce',
};

export function buildCodexPanelView(params: CodexPanelParams): CodexPanelResult {
  const { data, recipeGraph, sprites, snapshot, meta, codexFilter } = params;

  const subtitle = `등재 협객 ${meta.discoveredCount}/${data.units.length}인 · 비경 제패 ${meta.clearedTrialCount}/${TRIAL_ORDER.length} · 초회 등재 영구 보상`;

  const diffCards = DIFFICULTY_ORDER.map((diff) => {
    const cfg = DIFFICULTY_CONFIGS[diff];
    const unlocked = meta.unlockedDifficulties[diff];
    const cleared = meta.clearedDifficulties[diff];
    const active = snapshot.trialId === null && snapshot.difficulty === diff;

    const clearBadge = cleared
      ? '<span class="diff-clear-pill">🏆 30장 제패</span>'
      : `<span class="diff-bonus-pill">초회 +${cfg.firstClearGold}주화 · 열쇠+${cfg.firstClearKeys}</span>`;

    const btnLabel = active
      ? '출정 중 ✓'
      : unlocked
        ? snapshot.trialId !== null
          ? '일반 복귀'
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
    const clearBadge = cleared
      ? `<span class="diff-clear-pill">🏆 ${cfg.targetWave}장 제패</span>`
      : `<span class="diff-bonus-pill">초회 +${cfg.firstClearGold}주화 · 열쇠+${cfg.firstClearKeys} · 비단+${cfg.firstClearSilk}필</span>`;

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
                ${statusBadge}
              </div>
              <div class="card-sub">⚔${u.atk} · 사거리 ${u.range} · 절기 <b>[${escapeHtml(u.skill.name)}]</b>${tacticalNote}</div>
              <div class="codex-lineage">${escapeHtml(lowerLine)} · <span>${escapeHtml(upperLine)}</span></div>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

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
    <div class="sheet-section-label">⚔ 표준 출정 난이도 선택 (제 30 장 제패 시 상위 난이도 해금)</div>
    <div class="diff-list">${diffCards}</div>
    <div class="sheet-section-label">🌀 무림 비경 — 특수 규칙 엔드게임 시련 (${meta.clearedTrialCount}/${TRIAL_ORDER.length} 제패)</div>
    <div class="diff-list trial-list">${trialCards}</div>
    <div class="codex-header-bar">
      <span class="sheet-section-label">📖 무림 ${data.units.length}인 명숙록 (${meta.discoveredCount}/${data.units.length})</span>
      <div class="codex-filter-row">${filterHtml}</div>
    </div>
    ${unitCards}
  `;

  return { subtitle, bodyHtml };
}
