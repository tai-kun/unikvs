/**
 * テスト用のインメモリー `CacheStorage` 実装と共通部品です。
 *
 * 実 `Cache API` がない環境でも `CacheStorage` ストレージを検証できるよう、
 * `Request` / `Response` の意味論に寄せたフェイクを提供します。
 */

import type { IStorage } from "@unikvs/core";
import { createCloseContext } from "@unikvs/testing";
import { test as vitest } from "vitest";

import CacheStorage from "../src/cache-storage.js";

// DOM の `CacheStorage` とクラス名が衝突するため、型参照用の別名を用意します。
export type NativeCacheStorage = typeof globalThis.caches;

const { signal } = new AbortController();

let cacheSequence = 0;

/**
 * テストごとに一意な `Cache` 名を生成します。
 * 同一バックエンドを共有するテスト同士の汚染を防ぐために使用します。
 */
export function createCacheName(): string {
  cacheSequence += 1;

  return `unikvs-test-${cacheSequence}-${globalThis.crypto.randomUUID()}`;
}

/**
 * `Request` から正規化した URL を取り出します。
 * 文字列・`URL`・`Request` のいずれも受け付けます。
 */
function toUrl(request: RequestInfo | URL): string {
  return new Request(request).url;
}

/**
 * テスト用のインメモリー `CacheStorage` を作ります。
 * `put` 時にバイト列を複製し、`match` のたびに新しい `Response` を返します。
 */
export function createFakeCaches(): NativeCacheStorage {
  const stores = new Map<string, Map<string, Uint8Array<ArrayBuffer>>>();

  const getStore = (name: string): Map<string, Uint8Array<ArrayBuffer>> => {
    let store = stores.get(name);

    if (store === undefined) {
      store = new Map();
      stores.set(name, store);
    }

    return store;
  };

  const openCache = (name: string): Cache => {
    const store = getStore(name);

    return {
      async match(request: RequestInfo | URL): Promise<Response | undefined> {
        const found = store.get(toUrl(request));

        if (found === undefined) {
          return undefined;
        }

        return new Response(found.slice(), {
          headers: { "Content-Type": "application/octet-stream" },
        });
      },
      async put(request: RequestInfo | URL, response: Response): Promise<void> {
        const buff = await response.arrayBuffer();
        store.set(toUrl(request), new Uint8Array(buff));
      },
      async delete(request: RequestInfo | URL): Promise<boolean> {
        return store.delete(toUrl(request));
      },
      async keys(): Promise<readonly Request[]> {
        return [...store.keys()].map((url) => new Request(url));
      },
    } as unknown as Cache;
  };

  const backend = {
    async open(cacheName: string): Promise<Cache> {
      return openCache(cacheName);
    },
    async has(cacheName: string): Promise<boolean> {
      return stores.has(cacheName);
    },
    async delete(cacheName: string): Promise<boolean> {
      return stores.delete(cacheName);
    },
    async keys(): Promise<string[]> {
      return [...stores.keys()];
    },
  };

  return backend as unknown as NativeCacheStorage;
}

/**
 * `globalThis.caches` を一時的に差し替えて関数を実行します。
 * ブラウザーと Node の双方で backend の有無を再現するために使用します。
 * 非同期関数の完了まで差し替えを維持します。
 */
export function runWithGlobalCaches<T>(backend: NativeCacheStorage | undefined, fn: () => T): T {
  const holder = globalThis as Record<string, unknown>;
  const hadOwn = Object.hasOwn(holder, "caches");
  const descriptor = Object.getOwnPropertyDescriptor(holder, "caches");

  Object.defineProperty(holder, "caches", {
    value: backend,
    writable: true,
    configurable: true,
  });

  const restore = (): void => {
    if (hadOwn && descriptor !== undefined) {
      Object.defineProperty(holder, "caches", descriptor);
    } else {
      delete holder["caches"];
    }
  };

  let result: T;

  try {
    result = fn();
  } catch (ex) {
    restore();
    throw ex;
  }

  if (result instanceof Promise) {
    return (result as Promise<unknown>).then(
      (value) => {
        restore();

        return value;
      },
      (ex: unknown) => {
        restore();
        throw ex;
      },
    ) as T;
  }

  restore();

  return result;
}

/**
 * 実 `Cache API` が利用できるかどうかです。
 * 実バックエンドを使うテストを出し分けするために使用します。
 */
export function hasNativeCaches(): boolean {
  const caches = (globalThis as { caches?: NativeCacheStorage | undefined }).caches;

  return (
    typeof caches?.open === "function" &&
    typeof Request !== "undefined" &&
    typeof Response !== "undefined"
  );
}

/**
 * テストごとに一意な `Cache` 名と、フェイクを注入したストレージを用意するフィクスチャーです。
 * 各テストは必要なフィクスチャーだけを受け取ります。
 */
export const test = vitest.extend<{ cacheName: string; storage: CacheStorage }>({
  // oxlint-disable-next-line no-empty-pattern
  async cacheName({}, use) {
    await use(createCacheName());
  },
  async storage({ cacheName }, use) {
    const storage = new CacheStorage(cacheName, { caches: createFakeCaches() });
    await use(storage);
    if (storage.isOpen) {
      await storage.close(createCloseContext({ signal }) as IStorage.CloseContext);
    }
  },
});
