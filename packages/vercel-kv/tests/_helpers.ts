import type { KVClientLike } from "../src/vercel-kv.js";

export type RecordedSetCall = {
  readonly key: string;
  readonly value: string;
  readonly options: { ex?: number } | undefined;
};

/**
 * Vercel KV (Redis) の外部境界を模倣する最小のフェイクです。
 *
 * `VercelKv` が実際に発行する操作だけを再現します。
 * - `set` の `ex` は引数として記録しますが、期限切れは再現しません (Vercel KV 側の責務)。
 * - `keys` は末尾の `*` のみを接頭辞一致として扱います。`VercelKv` は `${keyPrefix}*` しか
 *   発行しないためです。Redis の完全な glob (`?`, `[...]` など) は実装しません。
 */
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
