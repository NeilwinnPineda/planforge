import { signal, type Signal } from '@angular/core';

export class LayoutPool<T> {
  private readonly _entries = signal<readonly T[]>([]);
  readonly entries: Signal<readonly T[]> = this._entries.asReadonly();

  constructor(
    private readonly getScore: (item: T) => number,
    private readonly getId: (item: T) => string,
    private readonly capacity: number | null = null,
  ) {}

  push(item: T): void {
    this._entries.update((list) => {
      const deduped = list.filter((e) => this.getId(e) !== this.getId(item));
      const sorted = [...deduped, item].sort((a, b) => this.getScore(b) - this.getScore(a));
      return this.capacity !== null && sorted.length > this.capacity
        ? sorted.slice(0, this.capacity)
        : sorted;
    });
  }

  remove(id: string): void {
    this._entries.update((list) => list.filter((e) => this.getId(e) !== id));
  }

  clear(): void {
    this._entries.set([]);
  }
}
