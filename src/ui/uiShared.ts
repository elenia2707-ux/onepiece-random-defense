import type {
  BoonIconKind,
  BoonRarity,
  FactionId,
  GameDataBundle,
  HeroSkinDef,
  RelicId,
  SkinRarity,
  SkinUnlockCond,
  UnitDef,
  UnitId,
} from '../data/types';
import type { MetaProfile, SkinPullItem } from '../platform/MetaStore';
import { getUnitCombatProfile } from '../render/weaponProfiles';

export type CodexFilterId = 'all' | FactionId;
export type WardrobeSubTab = 'hero' | 'court';

export interface RelicNoticeView {
  readonly text: string;
  readonly isWin: boolean;
  readonly seq: number;
  readonly relicId?: RelicId;
  readonly prevLevel?: number;
  readonly newLevel?: number;
  readonly isNew?: boolean;
}

export interface SkinPullView {
  readonly items: readonly SkinPullItem[];
  readonly totalSilkRefund: number;
  readonly seq: number;
}

export const FACTION_META: Readonly<
  Record<FactionId, { readonly label: string; readonly color: string }>
> = {
  orthodox: { label: '정파', color: '#0284c7' },
  unorthodox: { label: '사파', color: '#15803d' },
  demonic: { label: '마교', color: '#be123c' },
};

export const BOON_RARITY_META: Readonly<
  Record<BoonRarity, { readonly label: string; readonly badge: string; readonly color: string }>
> = {
  rare: { label: '현급 기연', badge: '현급', color: '#0284c7' },
  epic: { label: '지급 비전', badge: '지급', color: '#9333ea' },
  mythic: { label: '천급 신공', badge: '천급', color: '#e11d48' },
};

export const SKIN_RARITY_META: Readonly<
  Record<SkinRarity, { readonly label: string; readonly color: string; readonly rank: number }>
> = {
  achievement: { label: '한정업적', color: '#7c3aed', rank: 4 },
  mythic: { label: '신화', color: '#e11d48', rank: 3 },
  legendary: { label: '전설', color: '#d97706', rank: 2 },
  rare: { label: '명품', color: '#0284c7', rank: 1 },
};

export const UNLOCK_COND_LABEL: Readonly<Record<SkinUnlockCond, string>> = {
  any_clear: '제 30 장 천하통일 제패 시 영구 해금',
  hell_clear: '아수라 혈겁 난이도 제 30 장 제패 시 영구 해금',
  wave_35: '무한 혈투 제 35 장 도달 시 영구 해금',
};

/** Inline Oriental Wuxia SVG game icons (thick #1a1224 ink outline + bright cel fill). */
const SVG_OPEN = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">';
const INK = '#1a1224';

export const ICON = {
  coin: `${SVG_OPEN}<circle cx="12" cy="12" r="9.5" fill="#ffd23f" stroke="${INK}" stroke-width="2.4"/><circle cx="12" cy="12" r="6.8" fill="none" stroke="#d97706" stroke-width="1.5"/><rect x="8.8" y="8.8" width="6.4" height="6.4" rx="1" fill="${INK}"/><path d="M7.5 7.2l1.8-1.2" stroke="#fffbeb" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  goldCoin: `${SVG_OPEN}<polygon points="8.2,2.5 15.8,2.5 21.5,8.2 21.5,15.8 15.8,21.5 8.2,21.5 2.5,15.8 2.5,8.2" fill="#fde047" stroke="${INK}" stroke-width="2.3" stroke-linejoin="round"/><polygon points="9.2,5.2 14.8,5.2 18.8,9.2 18.8,14.8 14.8,18.8 9.2,18.8 5.2,14.8 5.2,9.2" fill="#f59e0b" stroke="#b45309" stroke-width="1.2"/><circle cx="12" cy="12" r="3.4" fill="#e11d48" stroke="${INK}" stroke-width="1.8"/><circle cx="11" cy="11" r="1.1" fill="#fef08a"/></svg>`,
  key: `${SVG_OPEN}<circle cx="8" cy="9" r="5.2" fill="#fde047" stroke="${INK}" stroke-width="2.3"/><circle cx="8" cy="9" r="2" fill="${INK}"/><path d="M12.2 12l8.3 6.5M16.5 15.4l-2.2 2.8M19.5 17.7l-2.3 2.9" stroke="${INK}" stroke-width="4.4" stroke-linecap="round"/><path d="M12.2 12l8.3 6.5M16.5 15.4l-2.2 2.8M19.5 17.7l-2.3 2.9" stroke="#facc15" stroke-width="2.1" stroke-linecap="round"/><path d="M4.2 13.2l-1.7 4.2" stroke="#ef4444" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  silk: `${SVG_OPEN}<rect x="3.5" y="6" width="17" height="12" rx="4" fill="#c084fc" stroke="${INK}" stroke-width="2.3"/><ellipse cx="7.5" cy="12" rx="2.7" ry="5.5" fill="#f3e8ff" stroke="${INK}" stroke-width="1.8"/><path d="M13 6v12" stroke="#facc15" stroke-width="2.8"/><path d="M11 12h4" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/></svg>`,
  robe: `${SVG_OPEN}<path d="M8 4l4 3.5L16 4l4.5 3.5-2.5 4.2-2-1.2V20H8v-9.5L6 11.7 3.5 7.5 8 4z" fill="#f43f5e" stroke="${INK}" stroke-width="2.3" stroke-linejoin="round"/><path d="M9.5 5.2L12 10l2.5-4.8" fill="none" stroke="#fef08a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="8" y="12.2" width="8" height="2.4" fill="#facc15" stroke="${INK}" stroke-width="1.5"/></svg>`,
  chest: `${SVG_OPEN}<rect x="3" y="8.5" width="18" height="12" rx="2.5" fill="#b45309" stroke="${INK}" stroke-width="2.3"/><path d="M3 9.5C3 6.5 6 5 12 5s9 1.5 9 4.5H3z" fill="#ef4444" stroke="${INK}" stroke-width="2.3" stroke-linejoin="round"/><rect x="3" y="10.5" width="18" height="2.6" fill="#facc15" stroke="${INK}" stroke-width="1.6"/><rect x="10" y="9.5" width="4" height="5" rx="1" fill="#fef08a" stroke="${INK}" stroke-width="1.8"/></svg>`,
  elixir: `${SVG_OPEN}<circle cx="12" cy="12.5" r="8.8" fill="#f43f5e" stroke="${INK}" stroke-width="2.4"/><path d="M6.5 14.5a7 7 0 0 0 11.2 1.2" fill="none" stroke="#9f1239" stroke-width="2.2" stroke-linecap="round"/><circle cx="9.4" cy="9.2" r="2.6" fill="#fef08a"/><circle cx="16.5" cy="6" r="2" fill="#4ade80" stroke="${INK}" stroke-width="1.6"/></svg>`,
  wisp: `${SVG_OPEN}<path d="M6 4.5h11a2.5 2.5 0 0 1 2.5 2.5v10a2.5 2.5 0 0 1-2.5 2.5H6a2.5 2.5 0 0 1-2.5-2.5V7A2.5 2.5 0 0 1 6 4.5z" fill="#5eead4" stroke="${INK}" stroke-width="2.4"/><rect x="4" y="3.5" width="3.6" height="17" rx="1.6" fill="#facc15" stroke="${INK}" stroke-width="2"/><path d="M11 9h5M11 13h5M13.5 7v10" stroke="#0f766e" stroke-width="2" stroke-linecap="round"/></svg>`,
  summon: `${SVG_OPEN}<path d="M3 14.5L12 6l9 8.5H3z" fill="#fde047" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M6.5 14.5c1.5 3 3.5 4.5 5.5 4.5s4-1.5 5.5-4.5" fill="#fef3c7" stroke="${INK}" stroke-width="2.2"/><path d="M7.5 11.5h9" stroke="#dc2626" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  gourd: `${SVG_OPEN}<path d="M10.2 3h3.6v2.5h-3.6z" fill="#b45309" stroke="${INK}" stroke-width="2"/><circle cx="12" cy="8.5" r="4" fill="#4ade80" stroke="${INK}" stroke-width="2.3"/><circle cx="12" cy="16" r="5.8" fill="#22c55e" stroke="${INK}" stroke-width="2.4"/><path d="M8.2 11.6h7.6" stroke="#dc2626" stroke-width="2.6" stroke-linecap="round"/><circle cx="9.8" cy="14.5" r="1.5" fill="#dcfce7"/></svg>`,
  swords: `${SVG_OPEN}<g stroke-linecap="round"><g stroke="${INK}" stroke-width="5.2"><path d="M4 4l11 11M20 4L9 15M14 18l4-4M6 14l4 4M17.5 17.5l2.5 2.5M6.5 17.5L4 20"/></g><g stroke="#f8fafc" stroke-width="2.4"><path d="M4 4l11 11M20 4L9 15"/></g><g stroke="#facc15" stroke-width="2.4"><path d="M14 18l4-4M6 14l4 4M17.5 17.5l2.5 2.5M6.5 17.5L4 20"/></g></g></svg>`,
  qi: `${SVG_OPEN}<path d="M12 2.2c3.8 4.4 6.8 7.5 6.8 11.8a6.8 6.8 0 0 1-13.6 0c0-2.8 1.5-5 3.2-6.6.3 1.7 1.1 2.8 2.2 3.1C10.2 7.8 10.8 5 12 2.2z" fill="#fb923c" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M12 10.5c1.9 2.1 3.2 3.5 3.2 5.2a3.2 3.2 0 0 1-6.4 0c0-1.6 1.2-3.1 3.2-5.2z" fill="#fef08a"/></svg>`,
  pavilion: `${SVG_OPEN}<path d="M2.5 11.5L12 4l9.5 7.5H2.5z" fill="#ef4444" stroke="${INK}" stroke-width="2.3" stroke-linejoin="round"/><rect x="5.5" y="11.5" width="13" height="8" rx="1.5" fill="#fef3c7" stroke="${INK}" stroke-width="2.2"/><path d="M9.5 19.5v-5h5v5" fill="#991b1b" stroke="${INK}" stroke-width="1.8"/></svg>`,
} as const;

export function renderBoonIconSvg(kind: BoonIconKind): string {
  const S = '<svg class="boon-svg" viewBox="0 0 32 32" aria-hidden="true">';
  switch (kind) {
    case 'vault':
      return `${S}<rect x="4" y="9" width="24" height="17" rx="4" fill="#d97706" stroke="${INK}" stroke-width="2.6"/><path d="M4 13h24" stroke="${INK}" stroke-width="2.4"/><circle cx="16" cy="18" r="5" fill="#fde047" stroke="${INK}" stroke-width="2.2"/><rect x="14.2" y="16.2" width="3.6" height="3.6" fill="${INK}"/><path d="M9 6h14l3 3H6l3-3z" fill="#fbbf24" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/></svg>`;
    case 'wealth_sword':
      return `${S}<circle cx="16" cy="16" r="11" fill="#fde047" stroke="${INK}" stroke-width="2.5"/><rect x="12.5" y="12.5" width="7" height="7" fill="${INK}"/><path d="M6 26L26 6M20 5l7 0 0 7" stroke="${INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 26L26 6M20 5l7 0 0 7" stroke="#fb7185" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case 'orthodox':
      return `${S}<circle cx="16" cy="16" r="11.5" fill="#38bdf8" stroke="${INK}" stroke-width="2.6"/><path d="M16 4.5a5.75 5.75 0 0 1 0 11.5 5.75 5.75 0 0 0 0 11.5 11.5 11.5 0 0 1 0-23z" fill="#e0f2fe"/><circle cx="16" cy="10.2" r="2.1" fill="#0284c7"/><circle cx="16" cy="21.8" r="2.1" fill="#f8fafc"/><path d="M16 2v28" stroke="${INK}" stroke-width="2" stroke-dasharray="2 3"/></svg>`;
    case 'pillage':
      return `${S}<path d="M6 24L23 7l3 3-11 15-9-1z" fill="#4ade80" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/><circle cx="22" cy="22" r="5.5" fill="#fde047" stroke="${INK}" stroke-width="2.2"/><rect x="20.4" y="20.4" width="3.2" height="3.2" fill="${INK}"/></svg>`;
    case 'demonic':
      return `${S}<path d="M16 3c5 5.5 9 9.5 9 15a9 9 0 0 1-18 0c0-4 2.2-7.2 4.6-9.6.5 2.4 1.6 3.8 3.2 4.2C13.6 9.5 14.4 6.5 16 3z" fill="#e11d48" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/><path d="M16 14c2.5 2.8 4.2 4.6 4.2 7a4.2 4.2 0 0 1-8.4 0c0-2.1 1.6-4.1 4.2-7z" fill="#fde08a"/></svg>`;
    case 'shatter':
      return `${S}<polygon points="16,3 27,8 25,20 16,29 7,20 5,8" fill="#c084fc" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/><path d="M18 5l-5 10h6l-5 11" fill="none" stroke="#fef08a" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case 'formation':
      return `${S}<polygon points="16,3 27,9.5 27,22.5 16,29 5,22.5 5,9.5" fill="#14b8a6" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/><polygon points="16,8 22.5,12 22.5,20 16,24 9.5,20 9.5,12" fill="#99f6e4" stroke="${INK}" stroke-width="2"/><circle cx="16" cy="16" r="3" fill="#fde047" stroke="${INK}" stroke-width="1.8"/></svg>`;
    case 'acupoint':
      return `${S}<circle cx="16" cy="16" r="10.5" fill="#1e293b" stroke="${INK}" stroke-width="2.6"/><circle cx="16" cy="16" r="5.5" fill="#f43f5e" stroke="#fde047" stroke-width="2"/><path d="M16 2v7M16 23v7M2 16h7M23 16h7" stroke="#5eead4" stroke-width="2.6" stroke-linecap="round"/></svg>`;
    case 'furnace':
      return `${S}<ellipse cx="16" cy="19" rx="10" ry="8" fill="#ea580c" stroke="${INK}" stroke-width="2.6"/><rect x="10" y="7" width="12" height="5" rx="2" fill="#facc15" stroke="${INK}" stroke-width="2.3"/><circle cx="16" cy="18" r="3.5" fill="#fef08a"/><path d="M10 26l-2 4M22 26l2 4" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/></svg>`;
    case 'reinforce':
      return `${S}<rect x="7" y="5" width="18" height="22" rx="3" fill="#5eead4" stroke="${INK}" stroke-width="2.6"/><rect x="4" y="4" width="4.5" height="24" rx="2" fill="#fde047" stroke="${INK}" stroke-width="2.2"/><path d="M13 11h8M13 16h8M13 21h5" stroke="#0f766e" stroke-width="2.4" stroke-linecap="round"/></svg>`;
    case 'bounty':
      return `${S}<rect x="6" y="4" width="20" height="24" rx="3" fill="#fef3c7" stroke="${INK}" stroke-width="2.6"/><circle cx="16" cy="14" r="5" fill="#fb7185" stroke="${INK}" stroke-width="2.2"/><path d="M13 14h6M16 11v6" stroke="#fffbeb" stroke-width="2" stroke-linecap="round"/><path d="M10 23h12" stroke="#b91c1c" stroke-width="2.6" stroke-linecap="round"/></svg>`;
    case 'trinity':
      return `${S}<polygon points="16,3 28,25 4,25" fill="#fde047" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/><circle cx="16" cy="11" r="3.2" fill="#38bdf8" stroke="${INK}" stroke-width="1.8"/><circle cx="11" cy="21" r="3.2" fill="#4ade80" stroke="${INK}" stroke-width="1.8"/><circle cx="21" cy="21" r="3.2" fill="#f43f5e" stroke="${INK}" stroke-width="1.8"/></svg>`;
  }
}

export function getEquippedSkinDef(
  data: GameDataBundle,
  unitId: UnitId,
  meta: MetaProfile,
): HeroSkinDef | null {
  const skinId = meta.equippedHeroSkins[unitId];
  if (!skinId) return null;
  return data.heroSkinsById.get(skinId) ?? null;
}

export function hasUnownedGachaSkin(data: GameDataBundle, meta: MetaProfile): boolean {
  for (let i = 0; i < data.heroSkins.length; i++) {
    const s = data.heroSkins[i]!;
    if (s.rarity !== 'achievement' && !s.unlockCond && !meta.ownedSkins[s.id]) {
      return true;
    }
  }
  for (let i = 0; i < data.courtSkins.length; i++) {
    const c = data.courtSkins[i]!;
    if (
      c.id !== 'court_bamboo_dawn' &&
      c.rarity !== 'achievement' &&
      !c.unlockCond &&
      !meta.ownedSkins[c.id]
    ) {
      return true;
    }
  }
  return false;
}

export function buildUnitRoleBadgesHtml(u: UnitDef, includeWeapon = false): string {
  const chips: string[] = [];
  if (includeWeapon) {
    const wp = getUnitCombatProfile(u.id);
    chips.push(
      `<span class="role-chip weapon" title="전용 병장기 및 공격 모션: ${escapeHtml(wp.weaponLabel)}">🗡${escapeHtml(wp.weaponLabel)}</span>`,
    );
  }
  if (u.passiveTrait) {
    chips.push(
      `<span class="role-chip passive" title="${escapeHtml(u.passiveTrait.name)}: ${escapeHtml(u.passiveTrait.desc)}">✦${escapeHtml(u.passiveTrait.name)}</span>`,
    );
  }
  if (u.supportAura) {
    const spdPart = u.supportAura.speedPct > 0 ? `·속+${u.supportAura.speedPct}%` : '';
    chips.push(
      `<span class="role-chip totem" title="${escapeHtml(u.supportAura.name)}: 비무대 십자 인접 아군 공격력 +${u.supportAura.atkPct}%${spdPart}">✦고무 +${u.supportAura.atkPct}%</span>`,
    );
  }
  if ((u.armorShred ?? 0) > 0) {
    chips.push(
      `<span class="role-chip shred" title="타격 시 마물 호신강기 -${u.armorShred} 파쇄 (중첩)">💥파갑 ${u.armorShred}</span>`,
    );
  }
  return chips.join('');
}

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
