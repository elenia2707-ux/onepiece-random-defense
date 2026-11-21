import type { DifficultyId, FactionId, GradeId, MonsterKind, SpiritTileSpec, WaveDef } from './types';

export type RunModeId = 'standard' | 'daily_challenge' | 'boss_rush' | 'chronicle';

export type DailyRuleId =
  | 'daily_demonic_surge'
  | 'daily_orthodox_honor'
  | 'daily_unorthodox_ambush'
  | 'daily_ascetic_vow'
  | 'daily_gale_blood'
  | 'daily_bench_mastery'
  | 'daily_elixir_feast';

export interface DailyRuleModifiers {
  readonly factionAtkMult?: Readonly<Partial<Record<FactionId, number>>>;
  readonly factionSpeedMult?: Readonly<Partial<Record<FactionId, number>>>;
  readonly orthodoxCritMultBonus?: number;
  readonly monsterHpMult?: number;
  readonly bossHpMult?: number;
  readonly monsterSpeedMult?: number;
  readonly bonusBossArmor?: number;
  readonly killCoinPctBonus?: number;
  readonly startCoinBonus?: number;
  readonly startLuckBonus?: number;
  readonly interestPctBonus?: number;
  readonly interestCapBonus?: number;
  readonly disableBoonReroll?: boolean;
  readonly benchPassiveMult?: number;
  readonly gambleBonusPct?: number;
  readonly bossKillBonusLuck?: number;
}

export interface DailyRuleDef {
  readonly id: DailyRuleId;
  readonly name: string;
  readonly badge: string;
  readonly desc: string;
  readonly modifiers: DailyRuleModifiers;
}

export interface DailyChallengeSpec {
  readonly dateKey: string;
  readonly seed: number;
  readonly seedCode: string;
  readonly targetWave: number;
  readonly rule: DailyRuleDef;
}

export const DAILY_CHALLENGE_TARGET_WAVE = 20;

export const DAILY_RULES: readonly DailyRuleDef[] = [
  {
    id: 'daily_demonic_surge',
    name: '천마 강림일',
    badge: '마교 강화',
    desc: '마교 공격력 +35% · 정파 공격력 -18% · 영물 보스 체력 +15%',
    modifiers: {
      factionAtkMult: { demonic: 1.35, orthodox: 0.82 },
      bossHpMult: 1.15,
    },
  },
  {
    id: 'daily_orthodox_honor',
    name: '정파 대무회',
    badge: '정파 극치명',
    desc: '정파 치명피해 +0.55x · 사파 공속 -15% · 보스 격파 시 영단 +3',
    modifiers: {
      orthodoxCritMultBonus: 0.55,
      factionSpeedMult: { unorthodox: 0.85 },
      bossKillBonusLuck: 3,
    },
  },
  {
    id: 'daily_unorthodox_ambush',
    name: '사파 야습일',
    badge: '사파 속공',
    desc: '사파 공격속도 +30% · 처치 은자 +25% · 마교 공격력 -15%',
    modifiers: {
      factionSpeedMult: { unorthodox: 1.3 },
      factionAtkMult: { demonic: 0.85 },
      killCoinPctBonus: 25,
    },
  },
  {
    id: 'daily_ascetic_vow',
    name: '청빈의 도',
    badge: '리롤 금지',
    desc: '기연 다시 뽑기 금지 · 매 장 복리 이자 +5%p · 이자 상한 +150은자',
    modifiers: {
      disableBoonReroll: true,
      interestPctBonus: 5,
      interestCapBonus: 150,
    },
  },
  {
    id: 'daily_gale_blood',
    name: '질풍혈전',
    badge: '고속 돌파',
    desc: '마물 이동속도 +18% · 시작 은자 +80 · 모든 처치 은자 +35%',
    modifiers: {
      monsterSpeedMult: 1.18,
      startCoinBonus: 80,
      killCoinPctBonus: 35,
    },
  },
  {
    id: 'daily_bench_mastery',
    name: '대기진법의 달인',
    badge: '대기진 2배',
    desc: '대기석 진법 패시브 효과 2배 증폭 · 영물 보스 호신강기 +18',
    modifiers: {
      benchPassiveMult: 2,
      bonusBossArmor: 18,
    },
  },
  {
    id: 'daily_elixir_feast',
    name: '신선 영약제',
    badge: '영약 대길',
    desc: '영약 성공률 +15%p · 시작 영단 +5 · 마물 체력 +20%',
    modifiers: {
      gambleBonusPct: 15,
      startLuckBonus: 5,
      monsterHpMult: 1.2,
    },
  },
];

function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0 || 0x20261119;
}

export function getDailyChallengeSpec(dateKey: string): DailyChallengeSpec {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : '2026-11-19';
  const seed = fnv1a32(`murim-daily-seed:${safeDate}`);
  const ruleIdx = fnv1a32(`murim-daily-rule:${safeDate}`) % DAILY_RULES.length;
  const rule = DAILY_RULES[ruleIdx]!;
  const seedCode = `#${seed.toString(36).toUpperCase().slice(0, 6).padStart(6, '0')}`;
  return {
    dateKey: safeDate,
    seed,
    seedCode,
    targetWave: DAILY_CHALLENGE_TARGET_WAVE,
    rule,
  };
}

export function computeDailyChallengeScore(
  wave: number,
  bossesSlain: number,
  victory: boolean,
  elapsedTicks: number,
): number {
  const base = Math.max(0, wave) * 1000 + Math.max(0, bossesSlain) * 350;
  const speedBonus = victory ? Math.max(0, 6000 - Math.floor(Math.max(0, elapsedTicks) / 5)) : 0;
  return base + speedBonus;
}

export interface BossRushStageDef {
  readonly stage: number;
  readonly bossName: string;
  readonly monsterKind: MonsterKind;
  readonly monsterHp: number;
  readonly armorBonus: number;
  readonly durationSec: number;
  readonly rewardCoin: number;
  readonly rewardLuck: number;
  readonly rewardWispGrade: GradeId;
  readonly offersBoon: boolean;
}

export const BOSS_RUSH_STAGES: readonly BossRushStageDef[] = [
  {
    stage: 1,
    bossName: '제1관문 · 호산 백호 선봉',
    monsterKind: 'white_tiger',
    monsterHp: 9500,
    armorBonus: 8,
    durationSec: 45,
    rewardCoin: 220,
    rewardLuck: 3,
    rewardWispGrade: 'uncommon',
    offersBoon: true,
  },
  {
    stage: 2,
    bossName: '제2관문 · 만년 독사왕',
    monsterKind: 'black_serpent',
    monsterHp: 21000,
    armorBonus: 16,
    durationSec: 48,
    rewardCoin: 260,
    rewardLuck: 3,
    rewardWispGrade: 'uncommon',
    offersBoon: false,
  },
  {
    stage: 3,
    bossName: '제3관문 · 혈교 대호법',
    monsterKind: 'blood_patriarch',
    monsterHp: 46000,
    armorBonus: 24,
    durationSec: 50,
    rewardCoin: 310,
    rewardLuck: 3,
    rewardWispGrade: 'rare',
    offersBoon: true,
  },
  {
    stage: 4,
    bossName: '제4관문 · 창궁신수 청룡',
    monsterKind: 'azure_dragon',
    monsterHp: 98000,
    armorBonus: 32,
    durationSec: 52,
    rewardCoin: 360,
    rewardLuck: 4,
    rewardWispGrade: 'rare',
    offersBoon: false,
  },
  {
    stage: 5,
    bossName: '제5관문 · 남명신수 주작',
    monsterKind: 'vermilion_bird',
    monsterHp: 210000,
    armorBonus: 42,
    durationSec: 55,
    rewardCoin: 420,
    rewardLuck: 4,
    rewardWispGrade: 'rare',
    offersBoon: true,
  },
  {
    stage: 6,
    bossName: '제6관문 · 혈옥 대마두',
    monsterKind: 'blood_patriarch',
    monsterHp: 430000,
    armorBonus: 52,
    durationSec: 55,
    rewardCoin: 480,
    rewardLuck: 4,
    rewardWispGrade: 'rare',
    offersBoon: false,
  },
  {
    stage: 7,
    bossName: '제7관문 · 태고 백호황',
    monsterKind: 'white_tiger',
    monsterHp: 850000,
    armorBonus: 62,
    durationSec: 58,
    rewardCoin: 560,
    rewardLuck: 5,
    rewardWispGrade: 'rare',
    offersBoon: true,
  },
  {
    stage: 8,
    bossName: '제8관문 · 뇌제창궁 청룡신왕',
    monsterKind: 'azure_dragon',
    monsterHp: 1650000,
    armorBonus: 72,
    durationSec: 60,
    rewardCoin: 650,
    rewardLuck: 5,
    rewardWispGrade: 'rare',
    offersBoon: false,
  },
  {
    stage: 9,
    bossName: '제9관문 · 적염열반 주작신왕',
    monsterKind: 'vermilion_bird',
    monsterHp: 3100000,
    armorBonus: 84,
    durationSec: 62,
    rewardCoin: 750,
    rewardLuck: 6,
    rewardWispGrade: 'rare',
    offersBoon: true,
  },
  {
    stage: 10,
    bossName: '최종관문 · 천마신군 극(極)',
    monsterKind: 'blood_patriarch',
    monsterHp: 5800000,
    armorBonus: 96,
    durationSec: 70,
    rewardCoin: 1000,
    rewardLuck: 8,
    rewardWispGrade: 'rare',
    offersBoon: false,
  },
];

export const BOSS_RUSH_TARGET_STAGE = BOSS_RUSH_STAGES.length;

export function resolveBossRushWaveDef(stage: number): WaveDef {
  const clamped = Math.max(1, Math.floor(stage));
  if (clamped <= BOSS_RUSH_STAGES.length) {
    const def = BOSS_RUSH_STAGES[clamped - 1]!;
    return {
      wave: clamped,
      durationTicks: def.durationSec * 30,
      spawnCount: 1,
      spawnIntervalTicks: 60,
      monsterHp: def.monsterHp,
      monsterSpeedPerTick: clamped >= 7 ? 2.15 : 1.95,
      monsterRadius: 24,
      rewardCoin: def.rewardCoin,
      monsterKind: def.monsterKind,
      isBoss: true,
      bossName: def.bossName,
      rewardWispGrade: def.rewardWispGrade,
    };
  }
  // Endless Boss Rush (stage 11+)
  const extra = clamped - BOSS_RUSH_STAGES.length;
  const last = BOSS_RUSH_STAGES[BOSS_RUSH_STAGES.length - 1]!;
  const kinds: readonly MonsterKind[] = [
    'white_tiger',
    'black_serpent',
    'azure_dragon',
    'vermilion_bird',
    'blood_patriarch',
  ];
  return {
    wave: clamped,
    durationTicks: 65 * 30,
    spawnCount: 1,
    spawnIntervalTicks: 60,
    monsterHp: Math.round(last.monsterHp * Math.pow(1.65, extra)),
    monsterSpeedPerTick: 2.25,
    monsterRadius: 25,
    rewardCoin: 900 + extra * 120,
    monsterKind: kinds[(clamped - 1) % kinds.length]!,
    isBoss: true,
    bossName: `무한 보스 러시 제 ${clamped} 관문`,
    rewardWispGrade: 'rare',
  };
}

export interface EndlessMilestoneDef {
  readonly wave: number;
  readonly label: string;
  readonly rewardGold: number;
  readonly rewardKeys: number;
  readonly rewardSilk: number;
  readonly inRunCoin: number;
  readonly inRunLuck: number;
}

export const ENDLESS_MILESTONES: readonly EndlessMilestoneDef[] = [
  { wave: 40, label: '무한 40장 · 강호 전설', rewardGold: 200, rewardKeys: 1, rewardSilk: 20, inRunCoin: 350, inRunLuck: 4 },
  { wave: 50, label: '무한 50장 · 절세 패왕', rewardGold: 350, rewardKeys: 2, rewardSilk: 35, inRunCoin: 450, inRunLuck: 5 },
  { wave: 60, label: '무한 60장 · 천하무적', rewardGold: 500, rewardKeys: 3, rewardSilk: 50, inRunCoin: 600, inRunLuck: 6 },
  { wave: 70, label: '무한 70장 · 무림지존', rewardGold: 700, rewardKeys: 4, rewardSilk: 70, inRunCoin: 750, inRunLuck: 7 },
  { wave: 80, label: '무한 80장 · 등선경', rewardGold: 1000, rewardKeys: 5, rewardSilk: 100, inRunCoin: 950, inRunLuck: 8 },
  { wave: 100, label: '무한 100장 · 태극신화', rewardGold: 1800, rewardKeys: 8, rewardSilk: 180, inRunCoin: 1500, inRunLuck: 12 },
];

export const ENDLESS_MILESTONES_BY_WAVE: ReadonlyMap<number, EndlessMilestoneDef> = new Map(
  ENDLESS_MILESTONES.map((m) => [m.wave, m]),
);

// ─────────────────────────────────────────────────────────────────────────────
// v4.1 — 스토리 캠페인 모드 『강호 전기 (5장 시나리오 비전록)』
// ─────────────────────────────────────────────────────────────────────────────

export type ChronicleId =
  | 'chr_hwasan_sword_tomb'
  | 'chr_tang_river_ambush'
  | 'chr_shaolin_four_beasts'
  | 'chr_demon_citadel_siege'
  | 'chr_primordial_genesis';

export interface ChronicleBossEntry {
  readonly monsterKind: MonsterKind;
  readonly bossName: string;
  readonly twinKind?: MonsterKind;
  readonly twinName?: string;
  readonly rewardWispGrade?: GradeId;
}

export interface ChronicleModifiers {
  readonly hpMult: number;
  readonly bossHpMult: number;
  readonly bossCooldownMult: number;
  readonly orthodoxAtkPct?: number;
  readonly unorthodoxShred?: number;
  readonly unorthodoxSpeedPct?: number;
  readonly ccDurationPct?: number;
  readonly demonicSkillPct?: number;
  readonly trinityAtkPct?: number;
}

export interface ChronicleChapterDef {
  readonly id: ChronicleId;
  readonly chapterNo: number;
  readonly name: string;
  readonly subtitle: string;
  readonly badge: string;
  readonly tag: string;
  readonly color: string;
  readonly desc: string;
  readonly storyText: string;
  readonly targetWave: number;
  readonly baseDifficulty: DifficultyId;
  readonly startCoin: number;
  readonly startLuck: number;
  readonly startWisps: Readonly<Partial<Record<GradeId, number>>>;
  readonly fixedSpiritTiles?: readonly SpiritTileSpec[];
  readonly primordialFromStart?: boolean;
  readonly mutantEveryNWaves?: number;
  readonly bossSchedule: Readonly<Record<number, ChronicleBossEntry>>;
  readonly modifiers: ChronicleModifiers;
  readonly firstClearGold: number;
  readonly firstClearKeys: number;
  readonly firstClearSilk: number;
  readonly firstClearShards: number;
  readonly repeatClearGold: number;
  readonly repeatClearShards: number;
}

export const CHRONICLE_CHAPTERS: readonly ChronicleChapterDef[] = [
  {
    id: 'chr_hwasan_sword_tomb',
    chapterNo: 1,
    name: '제1전 · 화산매화 · 검총수호전',
    subtitle: '화산 검총을 노리는 사대 영물의 선봉을 막아내라',
    badge: '15장 · 정파특화',
    tag: '정파 공+22% · 중앙 영맥 고정',
    color: '#38bdf8',
    desc: '시작 은자 200 · 영단 3 · 정파 외공 +22% · 중앙 영맥(화양·청풍) 고정 · 5·10·15장 보스전',
    storyText: '매화검기가 흩날리는 화산 검총. 백호·현무·청룡이 봉인을 깨고 들이닥치기 전 검진을 완성하라!',
    targetWave: 15,
    baseDifficulty: 'hard',
    startCoin: 200,
    startLuck: 3,
    startWisps: { common: 2 },
    fixedSpiritTiles: [
      { fieldIndex: 7, kind: 'solar' },
      { fieldIndex: 10, kind: 'wind' },
    ],
    bossSchedule: {
      5: { monsterKind: 'white_tiger', bossName: '검총 침입자 · 호산 백호', rewardWispGrade: 'uncommon' },
      10: { monsterKind: 'black_serpent', bossName: '검총 파수꾼 · 흑현무 독사왕', rewardWispGrade: 'rare' },
      15: { monsterKind: 'azure_dragon', bossName: '최종결전 · 창궁신수 청룡', rewardWispGrade: 'rare' },
    },
    modifiers: {
      hpMult: 0.92,
      bossHpMult: 0.95,
      bossCooldownMult: 1.0,
      orthodoxAtkPct: 22,
    },
    firstClearGold: 450,
    firstClearKeys: 3,
    firstClearSilk: 50,
    firstClearShards: 4,
    repeatClearGold: 130,
    repeatClearShards: 1,
  },
  {
    id: 'chr_tang_river_ambush',
    chapterNo: 2,
    name: '제2전 · 사천만독 · 장강혈투',
    subtitle: '장강 수로에 매복한 변종 마물 떼를 독과 속공으로 분쇄하라',
    badge: '18장 · 사파특화',
    tag: '사파 파갑+14·공속+18% · 3장마다 변종',
    color: '#10b981',
    desc: '시작 은자 220 · 영단 4 · 사파 파갑+14·공속+18% · 매 3장 변종 마물 습격 · 6·12·18장 보스전',
    storyText: '안개 자욱한 장강 협곡. 당문 독진과 흑도 야습대가 협력해 매 3장마다 몰려오는 변종 마물을 격퇴하라!',
    targetWave: 18,
    baseDifficulty: 'hard',
    startCoin: 220,
    startLuck: 4,
    startWisps: { common: 1, uncommon: 1 },
    mutantEveryNWaves: 3,
    bossSchedule: {
      6: { monsterKind: 'white_tiger', bossName: '장강 선봉 · 강호 백호왕', rewardWispGrade: 'uncommon' },
      12: { monsterKind: 'black_serpent', bossName: '장강 수괴 · 만독 현무사왕', rewardWispGrade: 'rare' },
      18: { monsterKind: 'vermilion_bird', bossName: '최종결전 · 남명적염 주작', rewardWispGrade: 'rare' },
    },
    modifiers: {
      hpMult: 1.0,
      bossHpMult: 1.02,
      bossCooldownMult: 0.96,
      unorthodoxShred: 14,
      unorthodoxSpeedPct: 18,
    },
    firstClearGold: 550,
    firstClearKeys: 3,
    firstClearSilk: 65,
    firstClearShards: 6,
    repeatClearGold: 160,
    repeatClearShards: 2,
  },
  {
    id: 'chr_shaolin_four_beasts',
    chapterNo: 3,
    name: '제3전 · 소림항마 · 사대흉수 봉인진',
    subtitle: '숭산 소림사에서 깨어난 사대흉수(백호·현무·청룡·주작)를 연속 봉인하라',
    badge: '20장 · 4흉수 연전',
    tag: '제어+25% · 5·10·15·20장 4흉수',
    color: '#f59e0b',
    desc: '시작 은자 260 · 영단 5 · 기절/둔화 시간 +25% · 5·10·15·20장 백호→현무→청룡→주작 연속 보스전',
    storyText: '만불항마진이 흔들리는 숭산. 사대흉수가 차례로 강림하니 금강제어술로 흉수들의 발을 묶고 격파하라!',
    targetWave: 20,
    baseDifficulty: 'hell',
    startCoin: 260,
    startLuck: 5,
    startWisps: { uncommon: 2 },
    bossSchedule: {
      5: { monsterKind: 'white_tiger', bossName: '제1흉수 · 서방 백호황', rewardWispGrade: 'uncommon' },
      10: { monsterKind: 'black_serpent', bossName: '제2흉수 · 북방 현무독왕', rewardWispGrade: 'rare' },
      15: { monsterKind: 'azure_dragon', bossName: '제3흉수 · 동방 청룡신수', rewardWispGrade: 'rare' },
      20: { monsterKind: 'vermilion_bird', bossName: '최종흉수 · 남방 열반주작', rewardWispGrade: 'rare' },
    },
    modifiers: {
      hpMult: 0.95,
      bossHpMult: 1.04,
      bossCooldownMult: 0.92,
      ccDurationPct: 25,
    },
    firstClearGold: 700,
    firstClearKeys: 4,
    firstClearSilk: 80,
    firstClearShards: 8,
    repeatClearGold: 210,
    repeatClearShards: 2,
  },
  {
    id: 'chr_demon_citadel_siege',
    chapterNo: 4,
    name: '제4전 · 십만대산 · 천마귀환록',
    subtitle: '혈화 총단 심장부에서 몰아치는 주박진과 마교 정예를 돌파하라',
    badge: '25장 · 마교특화',
    tag: '마교 절기+25% · 보스 주박 가속',
    color: '#f43f5e',
    desc: '시작 은자 300 · 영단 6 · 마교 초식피해 +25% · 보스 스킬 주기 가속 · 5·10·15·20·25장 총력전',
    storyText: '피빛 달이 뜬 십만대산 천마총단. 가속되는 보스의 주박진을 자리 이동으로 파훼하며 혈마신군을 토벌하라!',
    targetWave: 25,
    baseDifficulty: 'hell',
    startCoin: 300,
    startLuck: 6,
    startWisps: { uncommon: 2, rare: 1 },
    bossSchedule: {
      5: { monsterKind: 'white_tiger', bossName: '마산 수문장 · 혈아 백호', rewardWispGrade: 'uncommon' },
      10: { monsterKind: 'black_serpent', bossName: '혈옥 파수꾼 · 흑독 현무', rewardWispGrade: 'rare' },
      15: { monsterKind: 'blood_patriarch', bossName: '총단 대호법 · 혈옥 대마두', rewardWispGrade: 'rare' },
      20: { monsterKind: 'azure_dragon', bossName: '마뢰신수 · 암흑 청룡', rewardWispGrade: 'rare' },
      25: { monsterKind: 'blood_patriarch', bossName: '최종결전 · 귀환한 천마신군', rewardWispGrade: 'rare' },
    },
    modifiers: {
      hpMult: 1.04,
      bossHpMult: 1.08,
      bossCooldownMult: 0.82,
      demonicSkillPct: 25,
    },
    firstClearGold: 900,
    firstClearKeys: 5,
    firstClearSilk: 100,
    firstClearShards: 12,
    repeatClearGold: 270,
    repeatClearShards: 3,
  },
  {
    id: 'chr_primordial_genesis',
    chapterNo: 5,
    name: '제5전 · 삼분천하 · 태고개벽대전',
    subtitle: '태고합공 상시 개방! 천마와 창궁청룡의 쌍두 합동 결전을 끝내라',
    badge: '30장 · 최종장',
    tag: '태고합공 개방 · 삼재 공+45% · 30장 쌍보스',
    color: '#c084fc',
    desc: '시작 은자 360 · 영단 8 · 시작부터 태고합공 해금 · 삼재합진 공+45% · 30장 천마+창궁청룡 합동 최종결전',
    storyText: '정·사·마 삼세력이 하나로 뭉친 태고 개벽의 날! 태고합공의 위력으로 쌍두 최종 보스를 무찌르고 강호의 신화를 완성하라!',
    targetWave: 30,
    baseDifficulty: 'abyss',
    startCoin: 360,
    startLuck: 8,
    startWisps: { uncommon: 2, rare: 1 },
    primordialFromStart: true,
    bossSchedule: {
      5: { monsterKind: 'white_tiger', bossName: '태고 선봉 · 백호신왕', rewardWispGrade: 'uncommon' },
      10: { monsterKind: 'black_serpent', bossName: '태고 수호 · 현무신왕', rewardWispGrade: 'rare' },
      15: { monsterKind: 'azure_dragon', bossName: '태고 뇌제 · 창궁 청룡', rewardWispGrade: 'rare' },
      20: { monsterKind: 'vermilion_bird', bossName: '태고 화제 · 열반 주작', rewardWispGrade: 'rare' },
      25: { monsterKind: 'blood_patriarch', bossName: '태고 패왕 · 혈옥 마황', rewardWispGrade: 'rare' },
      30: {
        monsterKind: 'blood_patriarch',
        bossName: '최종결전 · 무극태상 천마신군',
        twinKind: 'azure_dragon',
        twinName: '합동강림 · 창궁뇌제 청룡황',
        rewardWispGrade: 'rare',
      },
    },
    modifiers: {
      hpMult: 0.96,
      bossHpMult: 1.0,
      bossCooldownMult: 0.88,
      trinityAtkPct: 45,
    },
    firstClearGold: 1400,
    firstClearKeys: 8,
    firstClearSilk: 150,
    firstClearShards: 20,
    repeatClearGold: 420,
    repeatClearShards: 5,
  },
];

export const CHRONICLES_BY_ID: ReadonlyMap<ChronicleId, ChronicleChapterDef> = new Map(
  CHRONICLE_CHAPTERS.map((c) => [c.id, c]),
);

export const CHRONICLE_IDS_ORDERED: readonly ChronicleId[] = CHRONICLE_CHAPTERS.map((c) => c.id);

export function resolveChronicleWaveDef(
  waves: readonly WaveDef[],
  chapter: ChronicleChapterDef,
  waveNum: number,
): WaveDef {
  const safeWave = Math.max(1, Math.floor(waveNum));
  const baseWave =
    safeWave <= waves.length
      ? (waves[safeWave - 1] ?? waves[0]!)
      : waves[Math.max(0, waves.length - 5 + ((safeWave - waves.length - 1) % 5))]!;
  const bossEntry = chapter.bossSchedule[safeWave];

  if (bossEntry) {
    // Scheduled Chronicle Boss wave
    const bossHp = baseWave.isBoss
      ? baseWave.monsterHp
      : Math.round(baseWave.monsterHp * 11.2);
    const rewardCoin = baseWave.isBoss
      ? baseWave.rewardCoin
      : Math.max(90, Math.round(baseWave.rewardCoin * 11));
    return {
      wave: safeWave,
      durationTicks: Math.max(baseWave.durationTicks, 48 * 30),
      spawnCount: 1,
      spawnIntervalTicks: 60,
      monsterHp: bossHp,
      monsterSpeedPerTick: baseWave.isBoss ? baseWave.monsterSpeedPerTick : 1.95,
      monsterRadius: 24,
      rewardCoin,
      monsterKind: bossEntry.monsterKind,
      isBoss: true,
      bossName: bossEntry.bossName,
      rewardWispGrade: bossEntry.rewardWispGrade ?? 'rare',
    };
  }

  if (baseWave.isBoss && safeWave <= chapter.targetWave) {
    // Standard boss wave slot (e.g. wave 5/10/15 in Ch.2) shifted to non-boss skirmish
    const prevNormal = waves[Math.max(0, safeWave - 2)] ?? waves[0]!;
    return {
      ...prevNormal,
      wave: safeWave,
      monsterHp: Math.round(prevNormal.monsterHp * 1.18),
      isBoss: false,
      bossName: undefined,
      rewardWispGrade: undefined,
    };
  }

  return baseWave;
}

// ─────────────────────────────────────────────────────────────────────────────
// v4.2 — 전투 액티브 지휘 스킬 『장문인 진법 호령 3종』
// ─────────────────────────────────────────────────────────────────────────────

export type CommandSkillId = 'cmd_sword_barrage' | 'cmd_bagua_bind' | 'cmd_heaven_cannon';

export interface CommandSkillDef {
  readonly id: CommandSkillId;
  readonly name: string;
  readonly shortLabel: string;
  readonly icon: string;
  readonly qiCost: number;
  readonly cooldownTicks: number;
  readonly durationTicks: number;
  readonly color: string;
  readonly desc: string;
}

export const TACTICAL_QI_MAX = 100;
export const TACTICAL_QI_INITIAL = 25;
export const TACTICAL_QI_KILL_NORMAL = 2;
export const TACTICAL_QI_KILL_BOSS = 15;
export const TACTICAL_QI_WAVE_ADVANCE = 10;

export const COMMAND_SKILLS: readonly CommandSkillDef[] = [
  {
    id: 'cmd_sword_barrage',
    name: '만검총공',
    shortLabel: '만검총공',
    icon: '🗡',
    qiCost: 40,
    cooldownTicks: 240, // 8s
    durationTicks: 150, // 5s
    color: '#38bdf8',
    desc: '5초간 전 협객 공격속도 +45% · 치명타 확률 +25%p 폭주!',
  },
  {
    id: 'cmd_bagua_bind',
    name: '팔괘금강박',
    shortLabel: '팔괘봉박',
    icon: '☯',
    qiCost: 60,
    cooldownTicks: 300, // 10s
    durationTicks: 150, // 5s shred
    color: '#facc15',
    desc: '전 마물 1.8초(보스 1.2초) 기절 · 5초간 방어력 -45 파쇄 · 3초 둔화 55%!',
  },
  {
    id: 'cmd_heaven_cannon',
    name: '천지개벽포',
    shortLabel: '개벽포',
    icon: '🌌',
    qiCost: 100,
    cooldownTicks: 450, // 15s
    durationTicks: 36,
    color: '#c084fc',
    desc: '출진 총 외공 1.65배 천벌 포격 (보스 보호막 2.5배 파쇄 · 방어 50% 관통)!',
  },
];

export const COMMAND_SKILLS_BY_ID: ReadonlyMap<CommandSkillId, CommandSkillDef> = new Map(
  COMMAND_SKILLS.map((s) => [s.id, s]),
);

// ─────────────────────────────────────────────────────────────────────────────
// v4.3 — 비무대 『영맥 명당 2칸』 (Seeded Deterministic Sanctuary Tiles)
// ─────────────────────────────────────────────────────────────────────────────

const SOLAR_TILE_CANDIDATES: readonly number[] = [1, 2, 6, 7, 8, 13, 14];
const WIND_TILE_CANDIDATES: readonly number[] = [3, 4, 9, 10, 11, 15, 16];

export const SPIRIT_TILE_SOLAR_ATK_PCT = 16;
export const SPIRIT_TILE_SOLAR_SKILL_PCT = 16;
export const SPIRIT_TILE_WIND_SPEED_PCT = 16;
export const SPIRIT_TILE_WIND_RANGE_BONUS = 34;

export const MAX_ARMAMENT_TEMPER = 3;
export const ARMAMENT_TEMPER_COSTS: readonly { readonly coin: number; readonly luck: number }[] = [
  { coin: 180, luck: 1 }, // +0 -> +1
  { coin: 320, luck: 2 }, // +1 -> +2
  { coin: 520, luck: 3 }, // +2 -> +3
];

/**
 * Pure hash-based deterministic Spirit Vein placement (never consumes simulation Rng stream).
 */
export function computeSeededSpiritTiles(
  seed: number,
  fieldCapacity: number,
  fixedOverride?: readonly SpiritTileSpec[],
): readonly SpiritTileSpec[] {
  if (fixedOverride && fixedOverride.length > 0) {
    return fixedOverride.filter((t) => t.fieldIndex >= 0 && t.fieldIndex < fieldCapacity);
  }
  const hSolar = fnv1a32(`murim-spirit-solar:${seed >>> 0}`);
  const hWind = fnv1a32(`murim-spirit-wind:${seed >>> 0}`);
  const solarIdx = SOLAR_TILE_CANDIDATES[hSolar % SOLAR_TILE_CANDIDATES.length]!;
  const windIdx = WIND_TILE_CANDIDATES[hWind % WIND_TILE_CANDIDATES.length]!;
  const out: SpiritTileSpec[] = [];
  if (solarIdx < fieldCapacity) out.push({ fieldIndex: solarIdx, kind: 'solar' });
  if (windIdx < fieldCapacity && windIdx !== solarIdx) {
    out.push({ fieldIndex: windIdx, kind: 'wind' });
  }
  return out;
}
