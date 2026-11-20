import type { UnitId } from '../data/types';

/**
 * 10 distinct Wuxia martial weapon archetypes verified 1:1 against `public/sprites/*.png`:
 * - `sword`: 정통 장검·중검 (화산 매화검, 무당 태극검, 남궁 뇌전검, 하오문 발도검, 무림맹주 황룡검, 천마신검)
 * - `dual_sword`: 쌍검·쌍단검 X자 교차 베기 (흑풍대원, 개방 장로, 검마)
 * - `flying_sword`: 어검술 다중 비검 출격 (검성, 태상검선)
 * - `saber`: 묵직한 패도·대도·중도끼 참격 (녹림산적, 혈도수, 혈도살수, 녹림왕, 혈마, 혈해수라왕)
 * - `spear_staff`: 장창·타구봉·목봉 찌르기 & 회전격 (소림 동자승 목봉, 개방 거지 타구봉, 백골마병 백골창)
 * - `palm_fist`: 정권·장풍·혈조 타격 (소림 무승 금강권, 마교 호법 흑염권, 광마 혈조)
 * - `fan`: 사천당가 접선/만독철선 부채 펼치기 & 부챗살 독침 탄막 (만천화우 당문주)
 * - `dagger_hidden`: 쌍독비수·암기 투척 (사천당문 암기수)
 * - `staff_gourd`: 독호리병 기울이기 & 약왕 독지팡이 살포 (독수약왕)
 * - `sorcery_qi`: 해골장 혈마구 & 양수 마염화구 영창 (마교 장로, 염마)
 */
export type WeaponMotionStyle =
  | 'sword'
  | 'dual_sword'
  | 'flying_sword'
  | 'saber'
  | 'spear_staff'
  | 'palm_fist'
  | 'fan'
  | 'dagger_hidden'
  | 'staff_gourd'
  | 'sorcery_qi';

export type SectVisualId =
  | 'hwasan'
  | 'mudang'
  | 'shaolin'
  | 'namgung'
  | 'gaebang'
  | 'tang_poison'
  | 'sapa_blade'
  | 'haomun'
  | 'mad_demon'
  | 'magyo_sword'
  | 'magyo_flame'
  | 'magyo_bone';

export interface UnitCombatProfile {
  readonly style: WeaponMotionStyle;
  readonly sect: SectVisualId;
  readonly weaponLabel: string;
  readonly primary: string;
  readonly secondary: string;
  readonly dualWield?: boolean;
  readonly heavyBlade?: boolean;
}

export const DEFAULT_COMBAT_PROFILE: UnitCombatProfile = {
  style: 'sword',
  sect: 'hwasan',
  weaponLabel: '화산 장검',
  primary: '#fb7185',
  secondary: '#ffe4e6',
};

/**
 * Single-source-of-truth combat & weapon profiles for all 32 Murim heroes.
 * Matched 1:1 to each unit's pixel-art weapon in `public/sprites/{id}.png`.
 */
export const UNIT_COMBAT_PROFILES: Readonly<Record<string, UnitCombatProfile>> = {
  // 구파일방 · 정파 (화산파 매화검 & 어검술)
  hwasan_novice: {
    style: 'sword',
    sect: 'hwasan',
    weaponLabel: '화산 장검',
    primary: '#fb7185',
    secondary: '#ffe4e6',
  },
  plum_swordsman: {
    style: 'sword',
    sect: 'hwasan',
    weaponLabel: '매화 쾌검',
    primary: '#f43f5e',
    secondary: '#fda4af',
  },
  plum_elder: {
    style: 'sword',
    sect: 'hwasan',
    weaponLabel: '홍매 중검',
    primary: '#e11d48',
    secondary: '#fbcfe8',
    heavyBlade: true,
  },
  hwasan_master: {
    style: 'sword',
    sect: 'hwasan',
    weaponLabel: '자하 신검',
    primary: '#c026d3',
    secondary: '#f9a8d4',
    heavyBlade: true,
  },
  sword_saint: {
    style: 'flying_sword',
    sect: 'hwasan',
    weaponLabel: '어검 육선검',
    primary: '#38bdf8',
    secondary: '#f472b6',
  },
  sword_immortal: {
    style: 'flying_sword',
    sect: 'namgung',
    weaponLabel: '만검귀종 비검',
    primary: '#38bdf8',
    secondary: '#fde047',
  },

  // 구파일방 · 정파 (무당파 태극검)
  mudang_disciple: {
    style: 'sword',
    sect: 'mudang',
    weaponLabel: '태극 청검',
    primary: '#06b6d4',
    secondary: '#e0f2fe',
  },
  mudang_master: {
    style: 'sword',
    sect: 'mudang',
    weaponLabel: '태극 진기검',
    primary: '#0284c7',
    secondary: '#bae6fd',
  },

  // 구파일방 · 정파 (소림사 목봉 & 금강나한권)
  shaolin_novice: {
    style: 'spear_staff',
    sect: 'shaolin',
    weaponLabel: '소림 목봉',
    primary: '#f59e0b',
    secondary: '#fef08a',
  },
  shaolin_monk: {
    style: 'palm_fist',
    sect: 'shaolin',
    weaponLabel: '금강 나한권',
    primary: '#fbbf24',
    secondary: '#fffbeb',
  },

  // 구파일방 · 정파 (남궁세가 뇌전중검 & 무림맹주 황룡대검)
  namgung_thunder: {
    style: 'sword',
    sect: 'namgung',
    weaponLabel: '뇌전 중검',
    primary: '#0284c7',
    secondary: '#fde047',
    heavyBlade: true,
  },
  murim_lord: {
    style: 'sword',
    sect: 'namgung',
    weaponLabel: '황룡 패왕검',
    primary: '#eab308',
    secondary: '#7dd3fc',
    heavyBlade: true,
  },

  // 구파일방 · 정파 (개방 청죽 타구봉 & 청옥 쌍단검)
  gaebang_beggar: {
    style: 'spear_staff',
    sect: 'gaebang',
    weaponLabel: '청죽 타구봉',
    primary: '#16a34a',
    secondary: '#bbf7d0',
  },
  gaebang_elder: {
    style: 'dual_sword',
    sect: 'gaebang',
    weaponLabel: '청옥 쌍단검',
    primary: '#10b981',
    secondary: '#fde047',
    dualWield: true,
  },

  // 사파 (사천당가 쌍독비수 · 독수약왕 독호리병 · 당문주 만독철선 부채!)
  tang_assassin: {
    style: 'dagger_hidden',
    sect: 'tang_poison',
    weaponLabel: '쌍독비수·암기',
    primary: '#22c55e',
    secondary: '#a855f7',
    dualWield: true,
  },
  poison_healer: {
    style: 'staff_gourd',
    sect: 'tang_poison',
    weaponLabel: '독호리병·약장',
    primary: '#4ade80',
    secondary: '#c084fc',
  },
  tang_patriarch: {
    style: 'fan',
    sect: 'tang_poison',
    weaponLabel: '만독철선(부채)',
    primary: '#22c55e',
    secondary: '#c084fc',
    dualWield: true,
  },

  // 사파 (녹림·하오문·혈도문·광마·혈해수라왕)
  nokrim_bandit: {
    style: 'saber',
    sect: 'sapa_blade',
    weaponLabel: '산적 중도끼',
    primary: '#ea580c',
    secondary: '#fed7aa',
    heavyBlade: true,
  },
  nokrim_chief: {
    style: 'saber',
    sect: 'sapa_blade',
    weaponLabel: '패왕 쌍대도',
    primary: '#dc2626',
    secondary: '#fde047',
    dualWield: true,
    heavyBlade: true,
  },
  haomun_ronin: {
    style: 'sword',
    sect: 'haomun',
    weaponLabel: '발도 협객검',
    primary: '#94a3b8',
    secondary: '#f8fafc',
  },
  blood_blade: {
    style: 'saber',
    sect: 'sapa_blade',
    weaponLabel: '거대 혈도',
    primary: '#e11d48',
    secondary: '#fecdd3',
    heavyBlade: true,
  },
  blood_demon: {
    style: 'saber',
    sect: 'sapa_blade',
    weaponLabel: '혈해 마도',
    primary: '#be123c',
    secondary: '#fda4af',
    heavyBlade: true,
  },
  mad_demon: {
    style: 'palm_fist',
    sect: 'mad_demon',
    weaponLabel: '광마 혈조',
    primary: '#e11d48',
    secondary: '#fde047',
  },
  asura_emperor: {
    style: 'saber',
    sect: 'sapa_blade',
    weaponLabel: '적혈만독 쌍도',
    primary: '#e11d48',
    secondary: '#4ade80',
    dualWield: true,
    heavyBlade: true,
  },

  // 천마신교 · 마교 (흑살도 · 백골장창 · 흑풍쌍도 · 흑염권 · 혈마구 · 마쌍검 · 마염화구 · 천마신검)
  cult_initiate: {
    style: 'saber',
    sect: 'magyo_sword',
    weaponLabel: '흑살 만도',
    primary: '#be123c',
    secondary: '#fda4af',
  },
  bone_fiend: {
    style: 'spear_staff',
    sect: 'magyo_bone',
    weaponLabel: '귀화 백골창',
    primary: '#a855f7',
    secondary: '#f43f5e',
  },
  black_wind: {
    style: 'dual_sword',
    sect: 'magyo_sword',
    weaponLabel: '흑풍 쌍도',
    primary: '#e11d48',
    secondary: '#cbd5e1',
    dualWield: true,
  },
  cult_protector: {
    style: 'palm_fist',
    sect: 'magyo_flame',
    weaponLabel: '흑염 철권',
    primary: '#db2777',
    secondary: '#a855f7',
  },
  cult_elder: {
    style: 'sorcery_qi',
    sect: 'magyo_flame',
    weaponLabel: '백골장·혈마구',
    primary: '#dc2626',
    secondary: '#c084fc',
  },
  sword_demon: {
    style: 'dual_sword',
    sect: 'magyo_sword',
    weaponLabel: '흑철 마쌍검',
    primary: '#9f1239',
    secondary: '#f43f5e',
    dualWield: true,
  },
  flame_demon: {
    style: 'sorcery_qi',
    sect: 'magyo_flame',
    weaponLabel: '양수 마염화구',
    primary: '#ea580c',
    secondary: '#a855f7',
    dualWield: true,
  },
  cheonma: {
    style: 'sword',
    sect: 'magyo_sword',
    weaponLabel: '천마 흑뢰신검',
    primary: '#e11d48',
    secondary: '#fde047',
    heavyBlade: true,
  },
  thousand_venom_lord: {
    style: 'fan',
    sect: 'tang_poison',
    weaponLabel: '만독천화선(부채)',
    primary: '#10b981',
    secondary: '#a855f7',
    dualWield: true,
  },
  thunder_emperor: {
    style: 'dual_sword',
    sect: 'namgung',
    weaponLabel: '구천 뇌제쌍검',
    primary: '#38bdf8',
    secondary: '#fde047',
    dualWield: true,
    heavyBlade: true,
  },
  hell_flame_sovereign: {
    style: 'sorcery_qi',
    sect: 'magyo_flame',
    weaponLabel: '구천마염주',
    primary: '#f97316',
    secondary: '#e11d48',
    dualWield: true,
  },
  tang_elder: {
    style: 'dagger_hidden',
    sect: 'tang_poison',
    weaponLabel: '비전 폭우침통',
    primary: '#4ade80',
    secondary: '#eab308',
    dualWield: true,
  },
  blood_bishop: {
    style: 'spear_staff',
    sect: 'magyo_bone',
    weaponLabel: '혈광 언월극',
    primary: '#e11d48',
    secondary: '#fde047',
    heavyBlade: true,
  },
  poison_dragon: {
    style: 'dagger_hidden',
    sect: 'tang_poison',
    weaponLabel: '만독 혈사편',
    primary: '#22c55e',
    secondary: '#c084fc',
    dualWield: true,
  },
  heavenly_demon_heir: {
    style: 'sword',
    sect: 'magyo_sword',
    weaponLabel: '소천마 흑뢰도',
    primary: '#a855f7',
    secondary: '#fb7185',
    heavyBlade: true,
  },
  blood_acolyte: {
    style: 'dagger_hidden',
    sect: 'magyo_sword',
    weaponLabel: '혈영 암침',
    primary: '#be123c',
    secondary: '#c084fc',
    dualWield: true,
  },
  nether_blade_queen: {
    style: 'sorcery_qi',
    sect: 'magyo_flame',
    weaponLabel: '명혼 마륜·염주',
    primary: '#9333ea',
    secondary: '#fb7185',
    dualWield: true,
  },
  ice_palace_empress: {
    style: 'fan',
    sect: 'mudang',
    weaponLabel: '북해 빙련선(부채)',
    primary: '#38bdf8',
    secondary: '#e0f2fe',
    dualWield: true,
  },
  blood_shadow_sovereign: {
    style: 'dual_sword',
    sect: 'sapa_blade',
    weaponLabel: '혈영 귀왕쌍도',
    primary: '#e11d48',
    secondary: '#fda4af',
    dualWield: true,
    heavyBlade: true,
  },
  wuji_grandmaster: {
    style: 'sword',
    sect: 'mudang',
    weaponLabel: '태극 무극신검',
    primary: '#2dd4bf',
    secondary: '#fde047',
    heavyBlade: true,
  },
  primordial_sword_god: {
    style: 'flying_sword',
    sect: 'namgung',
    weaponLabel: '개벽 만검신조',
    primary: '#fde047',
    secondary: '#38bdf8',
    heavyBlade: true,
  },
  chaos_poison_emperor: {
    style: 'fan',
    sect: 'tang_poison',
    weaponLabel: '혼원 만독성하선',
    primary: '#4ade80',
    secondary: '#c084fc',
    dualWield: true,
  },
  void_heavenly_demon: {
    style: 'sword',
    sect: 'magyo_sword',
    weaponLabel: '무극 일식마검',
    primary: '#f43f5e',
    secondary: '#fde047',
    heavyBlade: true,
  },
};

export function getUnitCombatProfile(unitId: UnitId): UnitCombatProfile {
  return UNIT_COMBAT_PROFILES[unitId] ?? DEFAULT_COMBAT_PROFILE;
}
