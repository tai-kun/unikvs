import type { IStorage } from "@unikvs/core";
import { createOpenContext, createCloseContext } from "@unikvs/testing";
import { test as vitest } from "vite-plus/test";

import Memcached, { type MemcachedGetResult, type MemcachedClientLike } from "../src/memcached.js";

/**
 * `memjs` 互換のインメモリー偽クライアントです。
 * `get` は `{ value: Buffer | null, flags }` を返し、TTL の期限切れを再現します。
 * 時刻は手動進行式で、TTL の検証を確定的にするために使用します。
 */
export class FakeMemcachedClient implements MemcachedClientLike {
  public quitCalls = 0;

  public closeCalls = 0;

  public getCalls = 0;

  public deleteCalls = 0;

  public flushCalls = 0;

  public readonly setCalls: {
    key: string;
    value: string;
    expires: number | undefined;
  }[] = [];

  readonly #store = new Map<
    string,
    {
      value: string;
      expiresAt: number | null;
    }
  >();

  #now = 0;

  public get size(): number {
    return this.#store.size;
  }

  /**
   * 偽時計を進めて、TTL の期限切れを確定的に再現します。
   */
  public advance(ms: number): void {
    this.#now += ms;
  }

  public async get(key: string): Promise<MemcachedGetResult> {
    this.getCalls += 1;

    const entry = this.#store.get(key);

    if (entry === undefined || this.#isExpired(entry)) {
      if (entry !== undefined) {
        this.#store.delete(key);
      }

      return {
        flags: null,
        value: null,
      };
    }

    return {
      flags: null,
      value: Buffer.from(entry.value, "utf8"),
    };
  }

  public async set(
    key: string,
    value: string | Uint8Array,
    options?: { readonly expires?: number | undefined },
  ): Promise<boolean> {
    const text = typeof value === "string" ? value : Buffer.from(value).toString("utf8");
    const expires = options?.expires ?? 0;
    this.setCalls.push({
      key,
      value: text,
      expires,
    });
    this.#store.set(
      key,
      expires > 0
        ? {
            value: text,
            expiresAt: this.#now + expires * 1000,
          }
        : {
            value: text,
            expiresAt: null,
          },
    );

    return true;
  }

  public async delete(key: string): Promise<boolean> {
    this.deleteCalls += 1;

    return this.#store.delete(key);
  }

  public async flush(): Promise<boolean> {
    this.flushCalls += 1;
    this.#store.clear();

    return true;
  }

  public quit(): void {
    this.quitCalls += 1;
  }

  public close(): void {
    this.closeCalls += 1;
  }

  #isExpired(entry: { expiresAt: number | null }): boolean {
    return entry.expiresAt !== null && this.#now >= entry.expiresAt;
  }
}

/**
 * 各テストに独立したキープレフィックスと、そのプレフィックスで open 済みの Memcached を提供します。
 * 偽クライアントはテストごとに新規作成されるため、clear (flush) が他のテストへ影響しません。
 */
export const test = vitest.extend<{
  client: FakeMemcachedClient;
  storage: Memcached;
  keyPrefix: string;
}>({
  async client({}, use) {
    await use(new FakeMemcachedClient());
  },
  async storage({ client, keyPrefix }, use) {
    const storage = new Memcached(undefined, {
      client,
      keyPrefix,
    });
    await storage.open(createOpenContext() as IStorage.OpenContext);
    await use(storage);

    if (storage.isOpen) {
      await storage.close(createCloseContext() as IStorage.CloseContext);
    }
  },
  async keyPrefix({}, use) {
    await use(randomKeyPrefix());
  },
});

/**
 * テストごとに一意なキープレフィックスを作ります。
 * 並行実行されるテスト間でキー空間を分離するために使用します。
 */
export function randomKeyPrefix(): string {
  return `unikvs-test-${crypto.randomUUID()}:`;
}

/**
 * クライアントを注入した未オープンの Memcached ストレージを作成します。
 * 別インスタンスからの読み取りや再接続の検証に使用します。
 */
export function createStorage(client: MemcachedClientLike, keyPrefix: string): Memcached {
  return new Memcached(undefined, {
    client,
    keyPrefix,
  });
}
