export type Unsubscribe = () => void;

export class EventBus<EventMap extends object> {
  private readonly listeners = new Map<keyof EventMap, Array<(payload: never) => void>>();

  public on<K extends keyof EventMap>(
    event: K,
    handler: (payload: EventMap[K]) => void,
  ): Unsubscribe {
    let list = this.listeners.get(event);
    if (!list) {
      list = [];
      this.listeners.set(event, list);
    }
    list.push(handler as (payload: never) => void);

    return () => {
      const curr = this.listeners.get(event);
      if (!curr) return;
      const idx = curr.indexOf(handler as (payload: never) => void);
      if (idx !== -1) {
        curr.splice(idx, 1);
      }
    };
  }

  public emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const list = this.listeners.get(event);
    if (!list || list.length === 0) return;
    for (let i = 0; i < list.length; i++) {
      const fn = list[i];
      if (fn) {
        (fn as (p: EventMap[K]) => void)(payload);
      }
    }
  }
}
