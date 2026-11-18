export class Pool<T> {
  private readonly free: T[] = [];
  private readonly factory: () => T;
  private readonly resetFn: (item: T) => void;

  public constructor(factory: () => T, resetFn: (item: T) => void, initialCount = 0) {
    this.factory = factory;
    this.resetFn = resetFn;
    for (let i = 0; i < initialCount; i++) {
      this.free.push(this.factory());
    }
  }

  public acquire(): T {
    const item = this.free.pop();
    if (item !== undefined) {
      return item;
    }
    return this.factory();
  }

  public release(item: T): void {
    this.resetFn(item);
    this.free.push(item);
  }
}
