import {
  computeRelicSetBonuses,
  getTrainingManualCostDiscountPct,
} from '../../core/relicFormulas';
import type { UISnapshot } from '../../core/Simulation';
import type { RecipeGraph } from '../../craft/RecipeGraph';
import type { GameDataBundle, GradeId, RecipeDef, UnitId, UpgradeGroupId } from '../../data/types';
import type { MetaProfile } from '../../platform/MetaStore';
import type { SpriteCache } from '../../render/SpriteCache';
import {
  BOON_RARITY_META,
  buildUnitRoleBadgesHtml,
  type CraftFactionFilterId,
  escapeHtml,
  FACTION_META,
  getEquippedSkinDef,
  ICON,
  renderBoonIconSvg,
} from '../uiShared';

const UPGRADE_REP_UNIT: Readonly<Record<UpgradeGroupId, UnitId>> = {
  orthodox: 'hwasan_master',
  unorthodox: 'tang_patriarch',
  demonic: 'cheonma',
};

export interface SheetViewResult {
  readonly subtitle: string;
  readonly tabsHtml: string | null;
  readonly bodyHtml: string;
}

export function collectUnlockedCounts(snapshot: UISnapshot): Map<UnitId, number> {
  const counts = new Map<UnitId, number>();
  for (let i = 0; i < snapshot.field.length; i++) {
    const s = snapshot.field[i];
    if (s && !s.locked) {
      counts.set(s.unitId, (counts.get(s.unitId) ?? 0) + 1);
    }
  }
  for (let i = 0; i < snapshot.bench.length; i++) {
    const s = snapshot.bench[i];
    if (s && !s.locked) {
      counts.set(s.unitId, (counts.get(s.unitId) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Recursively collects all direct and descendant ingredient UnitIds needed for a pinned recipe.
 */
function collectPinnedIngredientSet(
  recipeGraph: RecipeGraph,
  pinnedRecipeId: string | null,
): ReadonlySet<UnitId> {
  const needed = new Set<UnitId>();
  if (!pinnedRecipeId) return needed;
  const root = recipeGraph.recipesById.get(pinnedRecipeId);
  if (!root) return needed;

  const visitedUnits = new Set<UnitId>();
  const stack: UnitId[] = root.ingredients.map((i) => i.unit);
  while (stack.length > 0) {
    const uid = stack.pop()!;
    needed.add(uid);
    if (visitedUnits.has(uid)) continue;
    visitedUnits.add(uid);
    const subRecipes = recipeGraph.byOutput.get(uid) ?? [];
    for (let i = 0; i < subRecipes.length; i++) {
      const sr = subRecipes[i]!;
      for (let j = 0; j < sr.ingredients.length; j++) {
        stack.push(sr.ingredients[j]!.unit);
      }
    }
  }
  return needed;
}

export function buildRecipeCardHtml(
  data: GameDataBundle,
  sprites: SpriteCache,
  recipe: RecipeDef,
  snapshot: UISnapshot,
  unlocked: ReadonlyMap<UnitId, number>,
  meta: MetaProfile,
  pinnedRecipeId: string | null = null,
): string {
  const outUnit = data.unitsById.get(recipe.output);
  if (!outUnit) return '';
  const outGrade = data.gradesById.get(outUnit.grade);
  if (!outGrade) return '';

  const fMeta = FACTION_META[outUnit.faction];
  const st = snapshot.craft.recipes[recipe.id];
  const lamp = st?.lamp ?? 'none';
  const isPinned = pinnedRecipeId === recipe.id;
  const cardStateClass =
    (lamp === 'ready' ? ' card-ready' : lamp === 'chainReady' ? ' card-chain' : '') +
    (isPinned ? ' card-pinned' : '');

  const portraitUrl = sprites.unitPortraitUrl(
    outUnit,
    outGrade,
    getEquippedSkinDef(data, outUnit.id, meta),
  );
  const roleBadges = buildUnitRoleBadgesHtml(outUnit, true);

  const isTriple = recipe.ingredients.length === 1 && recipe.ingredients[0]!.n >= 3;
  let routeBadgeHtml = '<span class="route-pill canon">정통 합공</span>';
  if (outGrade.fx === 'rainbow') {
    routeBadgeHtml = '<span class="route-pill immortal">✦ 은거진선 비전</span>';
  } else if (isTriple) {
    routeBadgeHtml = '<span class="route-pill triple">×3 동문합일</span>';
  } else if (recipe.id.includes('_alt_')) {
    routeBadgeHtml = '<span class="route-pill alt">기연 별파식</span>';
  }

  const ingChips = recipe.ingredients
    .map((ing) => {
      const ingUnit = data.unitsById.get(ing.unit);
      if (!ingUnit) return '';
      const ingGrade = data.gradesById.get(ingUnit.grade);
      const ingImg = ingGrade
        ? sprites.unitPortraitUrl(ingUnit, ingGrade, getEquippedSkinDef(data, ingUnit.id, meta))
        : '';
      const owned = unlocked.get(ing.unit) ?? 0;
      const ok = owned >= ing.n;
      const labelText = ing.n > 1 ? `${ingUnit.name} ×${ing.n}` : ingUnit.name;
      const statusText = ok ? (ing.n > 1 ? `${ing.n}/${ing.n}` : '✓') : `${owned}/${ing.n}`;
      return `<span class="ing-chip ${ok ? 'ing-ok' : 'ing-miss'}"><img src="${ingImg}" alt="" /><span>${escapeHtml(labelText)}</span><b>${statusText}</b></span>`;
    })
    .join('');

  const fallbackNeed = recipe.ingredients.reduce((s, x) => s + x.n, 0);
  let ctaHtml = '';
  if (lamp === 'ready') {
    ctaHtml = `<button type="button" class="card-cta-btn interactive" data-sheet-action="craft" data-recipe-id="${recipe.id}" data-chain="0"><span>합공</span></button>`;
  } else if (lamp === 'chainReady') {
    ctaHtml = `<button type="button" class="card-cta-btn cta-sky interactive" data-sheet-action="craft" data-recipe-id="${recipe.id}" data-chain="1"><span>연쇄 등선</span></button>`;
  } else {
    ctaHtml = `<button type="button" class="card-cta-btn cta-disabled" disabled><span>${st?.have ?? 0}/${st?.need ?? fallbackNeed}</span></button>`;
  }

  const pinBtnHtml = `<button type="button" class="recipe-pin-btn${isPinned ? ' active' : ''} interactive" data-sheet-action="${isPinned ? 'unpin-recipe' : 'pin-recipe'}" data-recipe-id="${recipe.id}" title="${isPinned ? '목표 고정 해제' : '이 협객을 목표 합공으로 고정'}">${isPinned ? '📌 해제' : '📌 고정'}</button>`;

  return `
      <div class="sheet-card${cardStateClass}">
        <div class="card-left">
          <div class="card-avatar"><img src="${portraitUrl}" alt="" /></div>
          <div class="card-info">
            <div class="card-name-row">
              <span class="grade-pill" style="background:${outGrade.color}">${escapeHtml(outGrade.name)}</span>
              <span class="grade-pill" style="background:${fMeta.color}">${fMeta.label}</span>
              ${routeBadgeHtml}
              <span class="card-name">${escapeHtml(outUnit.name)}</span>
              ${roleBadges}
              <span class="card-sub">⚔${outUnit.atk} · ${escapeHtml(outUnit.skill.name)}</span>
            </div>
            <div class="ing-list">${ingChips}</div>
          </div>
        </div>
        <div class="recipe-cta-col">
          ${ctaHtml}
          ${pinBtnHtml}
        </div>
      </div>
    `;
}

export function buildCraftSheetView(params: {
  readonly data: GameDataBundle;
  readonly recipeGraph: RecipeGraph;
  readonly sprites: SpriteCache;
  readonly snapshot: UISnapshot;
  readonly meta: MetaProfile;
  readonly craftTabs: readonly { readonly id: 'all' | GradeId; readonly label: string }[];
  readonly activeTab: 'all' | GradeId;
  readonly pinnedRecipeId: string | null;
  readonly factionFilter: CraftFactionFilterId;
  readonly searchQuery: string;
}): SheetViewResult {
  const {
    data,
    recipeGraph,
    sprites,
    snapshot,
    meta,
    craftTabs,
    activeTab,
    pinnedRecipeId,
    factionFilter,
    searchQuery,
  } = params;
  const subtitle = `총 ${data.recipes.length}식 합공보 · 즉시 합공 ${snapshot.craft.readyCount} · 연쇄 등선 ${snapshot.craft.chainReadyCount}`;

  const tabsHtml = craftTabs
    .map((tab) => {
      const active = activeTab === tab.id ? ' active' : '';
      let hasReady = false;
      if (tab.id === 'all') {
        hasReady = snapshot.craft.readyCount + snapshot.craft.chainReadyCount > 0;
      } else {
        const gStat = snapshot.craft.byGrade[tab.id];
        hasReady = Boolean(gStat && gStat.ready + gStat.chainReady > 0);
      }
      const dot = hasReady ? '<span class="sheet-tab-dot"></span>' : '';
      return `<button type="button" class="sheet-tab-btn interactive${active}" data-tab-id="${tab.id}">${escapeHtml(tab.label)}${dot}</button>`;
    })
    .join('');

  const unlocked = collectUnlockedCounts(snapshot);
  const qNorm = searchQuery.trim().toLowerCase();

  const matchesFilter = (r: RecipeDef): boolean => {
    const outUnit = data.unitsById.get(r.output);
    if (!outUnit) return false;
    const st = snapshot.craft.recipes[r.id];
    if (factionFilter === 'ready') {
      if (!st || (st.lamp !== 'ready' && st.lamp !== 'chainReady')) return false;
    } else if (factionFilter !== 'all' && outUnit.faction !== factionFilter) {
      return false;
    }
    if (qNorm.length > 0) {
      const inName = outUnit.name.toLowerCase().includes(qNorm);
      const inSkill = outUnit.skill.name.toLowerCase().includes(qNorm);
      const inIng = r.ingredients.some((ing) =>
        (data.unitsById.get(ing.unit)?.name ?? '').toLowerCase().includes(qNorm),
      );
      if (!inName && !inSkill && !inIng) return false;
    }
    return true;
  };

  const allRecipes: RecipeDef[] = [];
  for (let i = 0; i < recipeGraph.topo.length; i++) {
    const r = recipeGraph.recipesById.get(recipeGraph.topo[i]!);
    if (r) allRecipes.push(r);
  }

  const toolbarHtml = `
    <div class="craft-filter-toolbar">
      <div class="craft-filter-pills">
        <button type="button" class="codex-filter-btn${factionFilter === 'all' ? ' active' : ''} interactive" data-sheet-action="craft-filter" data-filter="all">전체</button>
        <button type="button" class="codex-filter-btn${factionFilter === 'orthodox' ? ' active' : ''} interactive" data-sheet-action="craft-filter" data-filter="orthodox">정파</button>
        <button type="button" class="codex-filter-btn${factionFilter === 'unorthodox' ? ' active' : ''} interactive" data-sheet-action="craft-filter" data-filter="unorthodox">사파</button>
        <button type="button" class="codex-filter-btn${factionFilter === 'demonic' ? ' active' : ''} interactive" data-sheet-action="craft-filter" data-filter="demonic">마교</button>
        <button type="button" class="codex-filter-btn${factionFilter === 'ready' ? ' active' : ''} interactive" data-sheet-action="craft-filter" data-filter="ready">⚡가능만</button>
      </div>
      <div class="craft-search-wrap">
        <input
          id="craft-search-input"
          type="text"
          class="craft-search-input interactive"
          value="${escapeHtml(searchQuery)}"
          placeholder="협객·재료·절기 검색..."
          autocomplete="off"
          spellcheck="false"
        />
        ${searchQuery.length > 0 ? '<button type="button" class="craft-search-clear interactive" data-sheet-action="craft-search-clear" title="검색어 지우기">✕</button>' : ''}
      </div>
    </div>
  `;

  const parts: string[] = [toolbarHtml];

  // Always float pinned target recipe at the top
  const pinnedRec = pinnedRecipeId ? recipeGraph.recipesById.get(pinnedRecipeId) : undefined;
  if (pinnedRec) {
    parts.push('<div class="sheet-section-label pinned-label">📌 추적 중인 목표 합공 (추천바 · 기연 초빙 연동)</div>');
    parts.push(
      buildRecipeCardHtml(data, sprites, pinnedRec, snapshot, unlocked, meta, pinnedRecipeId),
    );
  }

  const filteredAll = allRecipes.filter((r) => r.id !== pinnedRecipeId && matchesFilter(r));

  const readyList = filteredAll
    .filter((r) => {
      const st = snapshot.craft.recipes[r.id];
      return st && (st.lamp === 'ready' || st.lamp === 'chainReady');
    })
    .sort((a, b) => {
      const rankA = data.gradesById.get(data.unitsById.get(a.output)?.grade ?? '')?.rank ?? 0;
      const rankB = data.gradesById.get(data.unitsById.get(b.output)?.grade ?? '')?.rank ?? 0;
      return rankB !== rankA ? rankB - rankA : a.priority - b.priority;
    });

  const readyIds = new Set(readyList.map((r) => r.id));

  const restRecipes = filteredAll.filter((r) => {
    const outUnit = data.unitsById.get(r.output);
    if (!outUnit) return false;
    if (activeTab === 'all') {
      return !readyIds.has(r.id);
    }
    return outUnit.grade === activeTab;
  });

  if (readyList.length > 0 && activeTab === 'all') {
    parts.push('<div class="sheet-section-label">⚡ 지금 합공 · 등선 가능</div>');
    for (let i = 0; i < readyList.length; i++) {
      parts.push(
        buildRecipeCardHtml(data, sprites, readyList[i]!, snapshot, unlocked, meta, pinnedRecipeId),
      );
    }
  }

  const sectionTitle =
    activeTab === 'all'
      ? `전체 무림 합공보 (${filteredAll.length}식 표시 / 총 ${data.recipes.length}식)`
      : `${craftTabs.find((t) => t.id === activeTab)?.label ?? ''} 경지 합공보 (${restRecipes.length}식)`;
  parts.push(`<div class="sheet-section-label">${escapeHtml(sectionTitle)}</div>`);

  if (restRecipes.length === 0 && readyList.length === 0) {
    parts.push(
      '<div class="boon-owned-empty">조건에 맞는 합공식이 없습니다. 필터나 검색어를 초기화해 보세요.</div>',
    );
  } else {
    for (let i = 0; i < restRecipes.length; i++) {
      parts.push(
        buildRecipeCardHtml(data, sprites, restRecipes[i]!, snapshot, unlocked, meta, pinnedRecipeId),
      );
    }
  }

  return { subtitle, tabsHtml, bodyHtml: parts.join('') };
}

export function buildWispSheetView(params: {
  readonly data: GameDataBundle;
  readonly recipeGraph: RecipeGraph;
  readonly sprites: SpriteCache;
  readonly snapshot: UISnapshot;
  readonly meta: MetaProfile;
  readonly wispTabs: readonly { readonly id: GradeId; readonly label: string }[];
  readonly activeTab: GradeId;
  readonly pinnedRecipeId: string | null;
}): SheetViewResult {
  const { data, recipeGraph, sprites, snapshot, meta, wispTabs, activeTab, pinnedRecipeId } = params;
  const totalWisps = Object.values(snapshot.wisps).reduce((s, n) => s + (n ?? 0), 0);
  const pinnedOutUnit = pinnedRecipeId
    ? data.unitsById.get(recipeGraph.recipesById.get(pinnedRecipeId)?.output ?? '')
    : undefined;
  const subtitle = pinnedOutUnit
    ? `비급 초빙권 ${totalWisps}장 · 📌 목표 [${pinnedOutUnit.name}] 재료 강조 중`
    : `비급 초빙권 ${totalWisps}장`;

  const tabsHtml = wispTabs
    .map((tab) => {
      const cnt = snapshot.wisps[tab.id] ?? 0;
      const active = activeTab === tab.id ? ' active' : '';
      const dot = cnt > 0 ? '<span class="sheet-tab-dot"></span>' : '';
      return `<button type="button" class="sheet-tab-btn interactive${active}" data-tab-id="${tab.id}">${escapeHtml(tab.label)} (${cnt})${dot}</button>`;
    })
    .join('');

  const gradeCount = snapshot.wisps[activeTab] ?? 0;
  const hasFreeSlot = snapshot.fieldOccupied + snapshot.benchOccupied < 30;
  const unlocked = collectUnlockedCounts(snapshot);
  const pinnedNeedSet = collectPinnedIngredientSet(recipeGraph, pinnedRecipeId);

  const pool = data.wispPools[activeTab] ?? [];
  const hints = snapshot.wispHints[activeTab];
  const hintMap = new Map<UnitId, { completes?: string; gain: number }>();
  if (hints) {
    for (let i = 0; i < hints.length; i++) {
      const h = hints[i]!;
      hintMap.set(h.unitId, h);
    }
  }

  const baseOrder: UnitId[] = hints ? hints.map((h) => h.unitId) : [...pool];
  // Prioritize pinned target ingredients first while preserving existing hint order
  const orderedUnitIds: UnitId[] = [...baseOrder].sort((a, b) => {
    const pinA = pinnedNeedSet.has(a) ? 1 : 0;
    const pinB = pinnedNeedSet.has(b) ? 1 : 0;
    return pinB - pinA;
  });

  const cardsHtml = orderedUnitIds
    .map((uid) => {
      const u = data.unitsById.get(uid);
      if (!u) return '';
      const g = data.gradesById.get(u.grade);
      if (!g) return '';
      const fMeta = FACTION_META[u.faction];
      const portrait = sprites.unitPortraitUrl(u, g, getEquippedSkinDef(data, u.id, meta));
      const owned = unlocked.get(uid) ?? 0;
      const hint = hintMap.get(uid);
      const isPinnedNeed = pinnedNeedSet.has(uid);
      const roleBadges = buildUnitRoleBadgesHtml(u);

      let hintBadge = `<span class="grade-pill" style="background:${fMeta.color}">${fMeta.label}</span>`;
      let recommendClass = '';
      if (isPinnedNeed) {
        hintBadge = `<span class="hint-pill pinned">📌 목표 재료</span>`;
        recommendClass = ' wisp-recommend wisp-pinned';
      } else if (hint?.completes) {
        const completedOut = recipeGraph.recipesById.get(hint.completes)?.output;
        const outName = completedOut
          ? (data.unitsById.get(completedOut)?.name ?? '상위 고수')
          : '상위 고수';
        hintBadge = `<span class="hint-pill">⚡ ${escapeHtml(outName)}</span>`;
        recommendClass = ' wisp-recommend';
      } else if (hint && hint.gain > 0) {
        hintBadge += ' <span class="hint-pill sub">인연 재료</span>';
      }

      const canSummon = gradeCount > 0 && hasFreeSlot;
      const btnLabel = !hasFreeSlot ? '가득참' : gradeCount > 0 ? '초빙' : '기연 0';

      return `
          <div class="wisp-card${recommendClass}">
            <div class="card-left">
              <div class="card-avatar"><img src="${portrait}" alt="" /></div>
              <div class="card-info">
                <div class="card-name-row">
                  <span class="card-name">${escapeHtml(u.name)}</span>
                  ${hintBadge}
                  ${roleBadges}
                </div>
                <div class="card-sub">보유 ${owned} · ⚔${u.atk}</div>
              </div>
            </div>
            <button
              type="button"
              class="card-cta-btn ${canSummon ? 'cta-sky interactive' : 'cta-disabled'}"
              data-sheet-action="wisp"
              data-grade="${activeTab}"
              data-unit-id="${u.id}"
              ${canSummon ? '' : 'disabled'}
            >
              <span>${btnLabel}</span>
              <span class="mini-price">${ICON.wisp}1</span>
            </button>
          </div>
        `;
    })
    .join('');

  return { subtitle, tabsHtml, bodyHtml: `<div class="wisp-grid">${cardsHtml}</div>` };
}

export function buildGambleSheetView(params: {
  readonly data: GameDataBundle;
  readonly sprites: SpriteCache;
  readonly snapshot: UISnapshot;
  readonly meta: MetaProfile;
}): SheetViewResult {
  const { data, sprites, snapshot, meta } = params;
  const furnaceBonus = snapshot.relicBonus.gambleBonusPct;
  const furnaceRefund = snapshot.relicBonus.gambleRefundPct;
  const subtitle =
    furnaceBonus > 0
      ? `보유 영단 ${snapshot.luckStone}개 · 만년단로 성공률 +${furnaceBonus}% / 실패 환급 ${furnaceRefund}%`
      : `보유 영단 ${snapshot.luckStone}개`;

  const res = snapshot.lastGambleResult;
  let bannerClass = 'gamble-result-box';
  let bannerText = '🧪 영약을 복용해 환골탈태의 경지에 도전하세요!';

  if (res) {
    const gName = data.gradesById.get(res.tier)?.name ?? res.tier;
    if (res.success && res.unitId) {
      const uName = data.unitsById.get(res.unitId)?.name ?? res.unitId;
      bannerClass = 'gamble-result-box win';
      bannerText = `✨ 환골탈태 대성공! [${gName}] ${uName}`;
    } else if (res.refundedLuck) {
      bannerClass = 'gamble-result-box win';
      bannerText = `🔥 주화입마! 만년단로가 영단 1개를 환급했습니다 (${gName})`;
    } else {
      bannerClass = 'gamble-result-box lose';
      bannerText = `🩸 주화입마! 기혈이 역류했습니다 (${gName})`;
    }
  }

  const hasFreeSlot = snapshot.fieldOccupied + snapshot.benchOccupied < 30;

  const rateCards = data.gambleRates
    .map((rate) => {
      const gradeDef = data.gradesById.get(rate.tier);
      const repUnit = data.units.find((u) => u.grade === rate.tier);
      const portrait =
        repUnit && gradeDef
          ? sprites.unitPortraitUrl(repUnit, gradeDef, getEquippedSkinDef(data, repUnit.id, meta))
          : '';

      const canRoll = snapshot.luckStone >= rate.costLuck && hasFreeSlot;
      const btnText = !hasFreeSlot
        ? '가득참'
        : snapshot.luckStone >= rate.costLuck
          ? '복용!'
          : '영단 부족';
      const effectivePct = Math.min(95, rate.chancePct + furnaceBonus);
      const pctLabel =
        furnaceBonus > 0
          ? `환골탈태 ${effectivePct}% (+${furnaceBonus}%)`
          : `환골탈태 ${rate.chancePct}%`;

      return `
          <div class="sheet-card">
            <div class="card-left">
              <div class="card-avatar"><img src="${portrait}" alt="" /></div>
              <div class="card-info">
                <div class="card-name-row">
                  <span class="grade-pill" style="background:${gradeDef?.color ?? '#16a34a'}">${escapeHtml(gradeDef?.name ?? rate.tier)}</span>
                  <span class="card-name">${escapeHtml(rate.label)}</span>
                </div>
                <div class="card-sub"><span class="rate-pct">${pctLabel}</span> · ${escapeHtml(rate.desc)}</div>
              </div>
            </div>
            <button
              type="button"
              class="card-cta-btn ${canRoll ? 'cta-green interactive' : 'cta-disabled'}"
              data-sheet-action="gamble"
              data-tier="${rate.tier}"
              ${canRoll ? '' : 'disabled'}
            >
              <span>${btnText}</span>
              <span class="mini-price">${ICON.elixir}${rate.costLuck}</span>
            </button>
          </div>
        `;
    })
    .join('');

  return {
    subtitle,
    tabsHtml: null,
    bodyHtml: `
      <div id="gamble-outcome-banner" class="${bannerClass}">${escapeHtml(bannerText)}</div>
      ${rateCards}
    `,
  };
}

export function buildUpgradeSheetView(params: {
  readonly data: GameDataBundle;
  readonly sprites: SpriteCache;
  readonly snapshot: UISnapshot;
  readonly meta: MetaProfile;
}): { readonly subtitle: string; readonly bodyHtml: string } {
  const { data, sprites, snapshot, meta } = params;
  const harmonyStacks = snapshot.activeBoons.b_trinity_harmony ?? 0;
  const manualDiscountPct = getTrainingManualCostDiscountPct(
    snapshot.relics.jade_training_manual ?? 0,
  );
  const setDiscountPct = computeRelicSetBonuses(snapshot.relics).upgradeDiscountPct;
  const totalDiscountPct = Math.min(60, harmonyStacks * 25 + manualDiscountPct + setDiscountPct);
  const discountNote = totalDiscountPct > 0 ? ` · 수련비 -${totalDiscountPct}%` : '';
  const subtitle = `보유 은자 ${snapshot.coin.toLocaleString('ko-KR')} · 정파 내공 / 사파 외공 / 마교 마공${discountNote}`;

  const calcStepCost = (baseCost: number, costStep: number, level: number): number => {
    const raw = baseCost + level * costStep;
    return totalDiscountPct > 0
      ? Math.max(1, Math.round((raw * (100 - totalDiscountPct)) / 100))
      : raw;
  };

  const cards = data.upgrades
    .map((up) => {
      const lv = snapshot.upgradeLv[up.id] ?? 0;
      const isMax = lv >= up.maxLevel;
      const cost = calcStepCost(up.baseCost, up.costStep, lv);
      const icon = up.currency === 'coin' ? ICON.coin : ICON.elixir;
      const wallet = up.currency === 'coin' ? snapshot.coin : snapshot.luckStone;
      const affordable = wallet >= cost;

      // Bulk x5 cost calculation (exact sum for 2..5 affordable levels, or full remaining batch preview)
      const remLevels = Math.max(0, up.maxLevel - lv);
      const maxBatch = Math.min(5, remLevels);
      let affordSteps = 0;
      let affordSum = 0;
      let fullBatchSum = 0;
      for (let s = 0; s < maxBatch; s++) {
        const sc = calcStepCost(up.baseCost, up.costStep, lv + s);
        fullBatchSum += sc;
        if (affordSum + sc <= wallet) {
          affordSum += sc;
          affordSteps = s + 1;
        }
      }
      const canBulk = !isMax && affordSteps >= 2;
      const bulkLabel = canBulk ? `×${affordSteps}` : `×${Math.max(2, maxBatch)}`;
      const bulkPrice = canBulk ? affordSum : fullBatchSum;

      const fMeta = FACTION_META[up.faction];
      const repUnit = data.unitsById.get(UPGRADE_REP_UNIT[up.id]);
      const repGrade = repUnit ? data.gradesById.get(repUnit.grade) : undefined;
      const portrait =
        repUnit && repGrade
          ? sprites.unitPortraitUrl(repUnit, repGrade, getEquippedSkinDef(data, repUnit.id, meta))
          : '';

      const curPct = lv * up.atkBonusPctPerLv;
      const nextPct = Math.min(up.maxLevel, lv + 1) * up.atkBonusPctPerLv;

      return `
          <div class="sheet-card">
            <div class="card-left">
              <div class="card-avatar"><img src="${portrait}" alt="" /></div>
              <div class="card-info">
                <div class="card-name-row">
                  <span class="grade-pill" style="background:${fMeta.color}">${fMeta.label} · Lv.${lv}</span>
                  <span class="card-name">${escapeHtml(up.name)}</span>
                </div>
                <div class="card-sub">
                  ${escapeHtml(up.desc)} · ${isMax ? `공격력 +${curPct}% (극의)` : `공격력 +${curPct}% → <b class="up-next">+${nextPct}%</b>`}
                </div>
              </div>
            </div>
            <div class="upgrade-cta-row">
              ${
                !isMax && maxBatch >= 2
                  ? `<button
                      type="button"
                      class="card-cta-btn upgrade-x5-btn ${canBulk ? 'cta-sky interactive' : 'cta-disabled'}"
                      data-sheet-action="upgrade5"
                      data-group="${up.id}"
                      ${canBulk ? '' : 'disabled'}
                    >
                      <span>${bulkLabel}</span>
                      <span class="mini-price">${icon}${bulkPrice}</span>
                    </button>`
                  : ''
              }
              <button
                type="button"
                class="card-cta-btn ${!isMax && affordable ? 'interactive' : 'cta-disabled'}"
                data-sheet-action="upgrade"
                data-group="${up.id}"
                ${!isMax && affordable ? '' : 'disabled'}
              >
                <span>${isMax ? '극의' : '수련'}</span>
                ${isMax ? '' : `<span class="mini-price">${icon}${cost}</span>`}
              </button>
            </div>
          </div>
        `;
    })
    .join('');

  let boonsHtml = '';
  if (snapshot.totalBoonStacks > 0) {
    const ownedRows = data.boons
      .filter((b) => (snapshot.activeBoons[b.id] ?? 0) > 0)
      .map((b) => {
        const stacks = snapshot.activeBoons[b.id] ?? 0;
        const rMeta = BOON_RARITY_META[b.rarity];
        return `
            <div class="sheet-card boon-owned-card rarity-${b.rarity}">
              <div class="card-left">
                <div class="boon-icon-frame compact rarity-${b.rarity}">
                  ${renderBoonIconSvg(b.iconKind)}
                </div>
                <div class="card-info">
                  <div class="card-name-row">
                    <span class="grade-pill" style="background:${rMeta.color}">${rMeta.label} · Lv.${stacks}/${b.maxStacks}</span>
                    <span class="boon-tag-pill">${escapeHtml(b.tag)}</span>
                    <span class="card-name">${escapeHtml(b.name)}</span>
                  </div>
                  <div class="card-sub">${escapeHtml(b.desc)}</div>
                </div>
              </div>
            </div>
          `;
      })
      .join('');

    boonsHtml = `
        <div class="boon-owned-header">☯ 이번 출정 전수받은 강호 기연 (${snapshot.totalBoonStacks}중 발동)</div>
        ${ownedRows}
      `;
  } else {
    boonsHtml = `
        <div class="boon-owned-empty">
          ☯ 제 05 · 10 · 15 · 20 · 25 장 영물 토벌 시 <b>『강호 기연 3택 1』</b> 비급을 전수받습니다.
        </div>
      `;
  }

  return { subtitle, bodyHtml: cards + boonsHtml };
}

export function buildMissionSheetView(
  data: GameDataBundle,
  snapshot: UISnapshot,
  meta: MetaProfile,
): SheetViewResult {
  const dailyDone = meta.dailyQuests.filter((q) => q.claimed).length;
  const claimableNote =
    meta.claimableDailyCount > 0 ? ` · 🎁 일일 보상 ${meta.claimableDailyCount}건 수령 가능!` : '';
  const subtitle = `출정 의뢰 ${snapshot.missionsCompletedCount}/${snapshot.missions.length} · 일일 과제 ${dailyDone}/3${claimableNote}`;

  const dailyCardsHtml = meta.dailyQuests
    .map((dq) => {
      const def = dq.def;
      const pct = Math.min(100, Math.round((dq.progress / Math.max(1, def.target)) * 100));
      const rewards: string[] = [];
      if (def.rewardGold > 0) {
        rewards.push(`<span class="mission-reward-pill gold">${ICON.goldCoin}+${def.rewardGold}</span>`);
      }
      if (def.rewardKeys > 0) {
        rewards.push(`<span class="mission-reward-pill key">${ICON.key}+${def.rewardKeys}</span>`);
      }
      if (def.rewardSilk > 0) {
        rewards.push(`<span class="mission-reward-pill silk">${ICON.silk}+${def.rewardSilk}필</span>`);
      }

      let rightCta = '';
      if (dq.claimed) {
        rightCta = '<span class="mission-stamp done">수령 완료 ✓</span>';
      } else if (dq.completed) {
        rightCta = `<button type="button" class="card-cta-btn cta-green interactive" data-sheet-action="claim-daily" data-quest-id="${def.id}"><span>보상 수령</span></button>`;
      } else {
        rightCta = `<span class="mission-stamp">${dq.progress.toLocaleString('ko-KR')} / ${def.target.toLocaleString('ko-KR')}</span>`;
      }

      return `
        <div class="sheet-card mission-card daily-quest-card${dq.claimed ? ' mission-done' : dq.completed ? ' daily-claimable' : ''}">
          <div class="mission-main">
            <div class="card-name-row">
              <span class="grade-pill daily-pill">일일</span>
              <span class="card-name">${escapeHtml(def.name)}</span>
              <div class="mission-rewards">${rewards.join('')}</div>
            </div>
            <div class="card-sub">${escapeHtml(def.desc)}</div>
            <div class="mission-prog-track">
              <div class="mission-prog-fill daily" style="width:${pct}%"></div>
            </div>
          </div>
          ${rightCta}
        </div>
      `;
    })
    .join('');

  const sorted = [...snapshot.missions].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const ratioA = a.target > 0 ? a.progress / a.target : 0;
    const ratioB = b.target > 0 ? b.progress / b.target : 0;
    return ratioB - ratioA;
  });

  const runMissionsHtml = sorted
    .map((m) => {
      const pct = Math.min(100, Math.round((m.progress / Math.max(1, m.target)) * 100));
      const rewards: string[] = [];
      if (m.rewardCoin > 0) {
        rewards.push(`<span class="mission-reward-pill coin">${ICON.coin}+${m.rewardCoin}</span>`);
      }
      if (m.rewardLuck > 0) {
        rewards.push(
          `<span class="mission-reward-pill luck">${ICON.elixir}+${m.rewardLuck}</span>`,
        );
      }
      if (m.rewardWispGrade) {
        const gName = data.gradesById.get(m.rewardWispGrade)?.name ?? m.rewardWispGrade;
        rewards.push(
          `<span class="mission-reward-pill wisp">${ICON.wisp}${escapeHtml(gName)} +1</span>`,
        );
      }

      const stamp = m.completed
        ? '<span class="mission-stamp done">달성 완료 ✓</span>'
        : `<span class="mission-stamp">${m.progress.toLocaleString('ko-KR')} / ${m.target.toLocaleString('ko-KR')}</span>`;

      return `
          <div class="sheet-card mission-card${m.completed ? ' mission-done' : ''}">
            <div class="mission-main">
              <div class="card-name-row">
                <span class="card-name">${escapeHtml(m.name)}</span>
                <div class="mission-rewards">${rewards.join('')}</div>
              </div>
              <div class="card-sub">${escapeHtml(m.desc)}</div>
              <div class="mission-prog-track">
                <div class="mission-prog-fill" style="width:${pct}%"></div>
              </div>
            </div>
            ${stamp}
          </div>
        `;
    })
    .join('');

  const bodyHtml = `
    <div class="sheet-section-label daily-section-label">📅 일일 강호 수련 과제 (${escapeHtml(meta.dailyDate)} · 영구 재화 지급 · 누적 완료 ${meta.totalDailyClaimed}회)</div>
    ${dailyCardsHtml}
    <div class="sheet-section-label">📜 이번 출정 강호 의뢰 (${snapshot.missionsCompletedCount}/${snapshot.missions.length} · 달성 시 즉시 자동 지급)</div>
    ${runMissionsHtml}
  `;

  return { subtitle, tabsHtml: null, bodyHtml };
}
