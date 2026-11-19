export type DailyQuestId =
  | 'dq_play_run'
  | 'dq_slay_180'
  | 'dq_boss_3'
  | 'dq_clear_any'
  | 'dq_trial_clear'
  | 'dq_endless_35'
  | 'dq_formation_6'
  | 'dq_craft_immortal';

export interface DailyQuestDef {
  readonly id: DailyQuestId;
  readonly name: string;
  readonly desc: string;
  readonly target: number;
  readonly rewardGold: number;
  readonly rewardKeys: number;
  readonly rewardSilk: number;
}

export interface DailyQuestView {
  readonly def: DailyQuestDef;
  readonly progress: number;
  readonly completed: boolean;
  readonly claimed: boolean;
}

export const DAILY_QUEST_POOL: readonly DailyQuestDef[] = [
  {
    id: 'dq_play_run',
    name: '일일 강호 출정',
    desc: '오늘 강호 비무전 1회 출정 정산 완료',
    target: 1,
    rewardGold: 120,
    rewardKeys: 1,
    rewardSilk: 0,
  },
  {
    id: 'dq_slay_180',
    name: '일일 마물 소탕',
    desc: '오늘 출정에서 누적 침입 마물 180기 처치',
    target: 180,
    rewardGold: 140,
    rewardKeys: 0,
    rewardSilk: 20,
  },
  {
    id: 'dq_boss_3',
    name: '일일 영물 토벌',
    desc: '오늘 출정에서 영물 보스 누적 3기 토벌',
    target: 3,
    rewardGold: 160,
    rewardKeys: 1,
    rewardSilk: 0,
  },
  {
    id: 'dq_clear_any',
    name: '일일 천하평정',
    desc: '난이도 또는 비경 시련 1회 제패',
    target: 1,
    rewardGold: 220,
    rewardKeys: 2,
    rewardSilk: 0,
  },
  {
    id: 'dq_trial_clear',
    name: '일일 비경 정복',
    desc: '무림 비경 시련 1회 제패',
    target: 1,
    rewardGold: 240,
    rewardKeys: 1,
    rewardSilk: 25,
  },
  {
    id: 'dq_endless_35',
    name: '일일 무한 돌파',
    desc: '무한 혈투 제 35 장 이상 도달',
    target: 1,
    rewardGold: 260,
    rewardKeys: 2,
    rewardSilk: 20,
  },
  {
    id: 'dq_formation_6',
    name: '일일 대진 개안',
    desc: '6인 극(極) 문파 진법 또는 삼재합진 발동 후 정산',
    target: 1,
    rewardGold: 150,
    rewardKeys: 1,
    rewardSilk: 15,
  },
  {
    id: 'dq_craft_immortal',
    name: '일일 현경 등선',
    desc: '현경(불멸) 등급 협객 1인 이상 등선 후 정산',
    target: 1,
    rewardGold: 180,
    rewardKeys: 1,
    rewardSilk: 20,
  },
];

export const DAILY_QUESTS_BY_ID: ReadonlyMap<DailyQuestId, DailyQuestDef> = new Map(
  DAILY_QUEST_POOL.map((q) => [q.id, q]),
);

export function getLocalDateKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Deterministically picks 3 distinct daily quests for any calendar date string `YYYY-MM-DD`.
 * Always includes 1 accessible starter/play quest + 2 varied combat/endgame quests.
 */
export function pickDailyQuestsForDate(dateKey: string): readonly DailyQuestDef[] {
  let hash = 0x811c9dc5;
  for (let i = 0; i < dateKey.length; i++) {
    hash ^= dateKey.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  // Slot 0: always one of the 3 everyday approachable quests (indices 0..2)
  const firstIdx = hash % 3;
  const pickedIndices: number[] = [firstIdx];

  // Slots 1..2: pick 2 distinct quests from the remaining pool deterministically
  let cursor = (hash >>> 4) ^ 0x9e3779b9;
  while (pickedIndices.length < 3) {
    cursor = (Math.imul(cursor, 1664525) + 1013904223) >>> 0;
    const candidate = cursor % DAILY_QUEST_POOL.length;
    if (!pickedIndices.includes(candidate)) {
      pickedIndices.push(candidate);
    }
  }

  return pickedIndices.map((idx) => DAILY_QUEST_POOL[idx]!);
}
