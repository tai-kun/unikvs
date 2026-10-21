import type { VercelRuntimeCacheBackend } from "../src/vercel-runtime-cache.js";

/**
 * バックエンドへ渡された `set` の引数です。
 */
export type RecordedSetCall = {
  readonly key: string;
  readonly options: { readonly ttlSeconds?: number | undefined } | undefined;
};

export type FakeRuntimeCache = VercelRuntimeCacheBackend & {
  readonly store: Map<string, unknown>;

  readonly setCalls: RecordedSetCall[];
};

export type FakeRuntimeCacheOptions = {
  /**
   * `clear` を実装するかどうかです。`clear` を持たないバックエンドを再現するときに `false` にします。
   */
  readonly supportsClear?: boolean | undefined;
};

/**
 * `VercelRuntimeCacheBackend` の外部境界を模倣する最小のフェイクです。
 *
 * 実際の `getCache()` ではなく、このパッケージが定義する注入インターフェースに合わせて、
 * `VercelRuntimeCache` が実際に発行する操作だけを非同期の Promise として再現します。
 * `set` の `ttlSeconds` は記録しますが期限切れは再現しません。保存値の論理的な期限は
 * ストレージ自身が `expiresAt` で判定するため、ここで失効させるとその検証を隠すからです。
 */
export function createFakeRuntimeCache(options: FakeRuntimeCacheOptions = {}): FakeRuntimeCache {
  const { supportsClear = true } = options;
  const store = new Map<string, unknown>();
  const setCalls: RecordedSetCall[] = [];
  const backend: FakeRuntimeCache = {
    store,
    setCalls,
    async get(key: string): Promise<unknown> {
      return store.get(key);
    },
    async set(key: string, value: unknown, setOptions?: { ttlSeconds?: number }): Promise<void> {
      store.set(key, value);
      setCalls.push({ key, options: setOptions });
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
  };

  if (supportsClear) {
    backend.clear = async (): Promise<void> => {
      store.clear();
    };
  }

  return backend;
}
