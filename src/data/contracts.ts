import type { FactionId, GradeId } from './types';

export type ContractId =
  | 'c_demonic_vow'
  | 'c_orthodox_oath'
  | 'c_unorthodox_pact'
  | 'c_merchant_gamble'
  | 'c_bounty_sweep'
  | 'c_elixir_trial'
  | 'c_trinity_trial'
  | 'c_blitz_boss'
  | 'c_awakening_master';

export type ContractConditionKind =
  | 'faction_field_waves'
  | 'held_coin_reach'
  | 'bounty_kills_delta'
  | 'gamble_wins_delta'
  | 'trinity_waves'
  | 'fast_boss_kill'
  | 'awaken_count_delta';

export interface ContractDef {
  readonly id: ContractId;
  readonly name: string;
  readonly tag: string;
  readonly desc: string;
  readonly condition: ContractConditionKind;
  readonly target: number;
  readonly durationWaves: number;
  readonly minWave: number;
  readonly depositCoin: number;
  readonly faction?: FactionId;
  readonly minFactionCount?: number;
  readonly maxBossKillSec?: number;
  readonly rewardCoin: number;
  readonly rewardLuck: number;
  readonly rewardWispGrade?: GradeId;
  readonly rewardWispCount?: number;
  readonly rewardUpgradeAll?: number;
}

export const CONTRACT_OFFER_WAVES: readonly number[] = [5, 15];

export const CONTRACT_DEFS: readonly ContractDef[] = [
  {
    id: 'c_demonic_vow',
    name: '혈마의 서약',
    tag: '문파 서약',
    desc: '마교 협객 5명 이상 출전 상태로 4개 장 돌파',
    condition: 'faction_field_waves',
    target: 4,
    durationWaves: 8,
    minWave: 5,
    depositCoin: 120,
    faction: 'demonic',
    minFactionCount: 5,
    rewardCoin: 500,
    rewardLuck: 2,
    rewardWispGrade: 'rare',
    rewardWispCount: 2,
  },
  {
    id: 'c_orthodox_oath',
    name: '정파 결의',
    tag: '문파 서약',
    desc: '정파 협객 5명 이상 출전 상태로 4개 장 돌파',
    condition: 'faction_field_waves',
    target: 4,
    durationWaves: 8,
    minWave: 5,
    depositCoin: 120,
    faction: 'orthodox',
    minFactionCount: 5,
    rewardCoin: 150,
    rewardLuck: 7,
    rewardWispGrade: 'rare',
    rewardWispCount: 2,
  },
  {
    id: 'c_unorthodox_pact',
    name: '사파 혈맹',
    tag: '문파 서약',
    desc: '사파 협객 5명 이상 출전 상태로 4개 장 돌파',
    condition: 'faction_field_waves',
    target: 4,
    durationWaves: 8,
    minWave: 5,
    depositCoin: 120,
    faction: 'unorthodox',
    minFactionCount: 5,
    rewardCoin: 550,
    rewardLuck: 2,
    rewardWispGrade: 'rare',
    rewardWispCount: 2,
  },
  {
    id: 'c_merchant_gamble',
    name: '거상의 도박',
    tag: '경제 도전',
    desc: '기한 내 보유 은자 1,200 이상 달성',
    condition: 'held_coin_reach',
    target: 1200,
    durationWaves: 8,
    minWave: 5,
    depositCoin: 100,
    rewardCoin: 0,
    rewardLuck: 8,
    rewardWispGrade: 'rare',
    rewardWispCount: 2,
  },
  {
    id: 'c_bounty_sweep',
    name: '천하 수배령',
    tag: '토벌 도전',
    desc: '계약 후 현상수배범 3기 토벌',
    condition: 'bounty_kills_delta',
    target: 3,
    durationWaves: 10,
    minWave: 5,
    depositCoin: 150,
    rewardCoin: 650,
    rewardLuck: 8,
  },
  {
    id: 'c_elixir_trial',
    name: '단전 돌파 시험',
    tag: '운기 도전',
    desc: '계약 후 영약 복용 4회 성공',
    condition: 'gamble_wins_delta',
    target: 4,
    durationWaves: 10,
    minWave: 5,
    depositCoin: 100,
    rewardCoin: 400,
    rewardLuck: 2,
    rewardWispGrade: 'rare',
    rewardWispCount: 2,
  },
  {
    id: 'c_blitz_boss',
    name: '광속 영물 토벌',
    tag: '속전속결',
    desc: '다음 영물 보스를 20초 이내에 격파',
    condition: 'fast_boss_kill',
    target: 1,
    durationWaves: 6,
    minWave: 5,
    depositCoin: 150,
    maxBossKillSec: 20,
    rewardCoin: 200,
    rewardLuck: 7,
    rewardWispGrade: 'rare',
    rewardWispCount: 2,
  },
  {
    id: 'c_trinity_trial',
    name: '삼재합진의 시험',
    tag: '진법 도전',
    desc: '삼재합진(정2·사2·마2) 활성 상태로 4개 장 돌파',
    condition: 'trinity_waves',
    target: 4,
    durationWaves: 8,
    minWave: 12,
    depositCoin: 200,
    rewardCoin: 250,
    rewardLuck: 7,
    rewardUpgradeAll: 3,
  },
  {
    id: 'c_awakening_master',
    name: '극성 각성령',
    tag: '각성 도전',
    desc: '계약 후 일류(3등급) 이상 협객 각성(★) 2회 실행',
    condition: 'awaken_count_delta',
    target: 2,
    durationWaves: 10,
    minWave: 12,
    depositCoin: 250,
    rewardCoin: 300,
    rewardLuck: 6,
    rewardWispGrade: 'epic',
    rewardWispCount: 1,
  },
];

export const CONTRACTS_BY_ID: ReadonlyMap<ContractId, ContractDef> = new Map(
  CONTRACT_DEFS.map((c) => [c.id, c]),
);
