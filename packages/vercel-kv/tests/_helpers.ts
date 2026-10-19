import type { KVClientLike } from "../src/vercel-kv.js";

export type RecordedSetCall = {
  readonly key: string;
  readonly value: string;
  readonly options: { ex?: number } | undefined;
};

export class FakeKv implements KVClientLike {
  public readonly store = new Map<string, string>();

  public readonly setCalls: RecordedSetCall[] = [];

  public async get<T>(key: string): Promise<T | null> {
    const value = this.store.get(key);

    return (value === undefined ? null : value) as unknown as T;
  }

  public async set(key: string, value: string, options?: { ex?: number }): Promise<unknown> {
    this.store.set(key, value);
    this.setCalls.push({ key, value, options });

    return "OK";
  }

  public async del(...keys: string[]): Promise<number> {
    let count = 0;

    for (const key of keys) {
      if (this.store.delete(key)) {
        count += 1;
      }
    }

    return count;
  }

  public async exists(...keys: string[]): Promise<number> {
    let count = 0;

    for (const key of keys) {
      if (this.store.has(key)) {
        count += 1;
      }
    }

    return count;
  }

  public async keys(pattern: string): Promise<string[]> {
    if (!pattern.endsWith("*")) {
      return this.store.has(pattern) ? [pattern] : [];
    }

    const prefix = pattern.slice(0, -1);
    const found: string[] = [];

    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        found.push(key);
      }
    }

    return found.sort();
  }
}
