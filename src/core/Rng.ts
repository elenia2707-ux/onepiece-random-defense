/**
 * Deterministic 32-bit seeded PRNG (xorshift32).
 * Only consumed inside integer simulation ticks.
 */
export class Rng {
  private state: number;

  public constructor(seed: number) {
    const normalized = seed >>> 0;
    this.state = normalized === 0 ? 0x6d2b79f5 : normalized;
  }

  public nextUint32(): number {
    let x = this.state >>> 0;
    x ^= (x << 13) >>> 0;
    x ^= x >>> 17;
    x ^= (x << 5) >>> 0;
    this.state = (x >>> 0) === 0 ? 0x6d2b79f5 : x >>> 0;
    return this.state;
  }

  /** Returns float in [0, 1). */
  public nextFloat(): number {
    return this.nextUint32() / 4294967296;
  }

  /** Returns integer in [0, maxExclusive). */
  public nextInt(maxExclusive: number): number {
    if (maxExclusive <= 1) {
      return 0;
    }
    return Math.floor(this.nextFloat() * maxExclusive);
  }

  public getState(): number {
    return this.state >>> 0;
  }
}
