/**
 * テスト用のインメモリー `CacheStorage` 実装と共通部品です。
 *
 * 実 `Cache API` がない環境でも `CacheStorage` ストレージを検証できるよう、
 * `Request` / `Response` の意味論に寄せたフェイクを提供します。
 */

import type { IStorage } from "@unikvs/core";
import { createGetContext, createSetContext } from "@unikvs/testing";
import { test as vitest } from "vitest";

import CacheStorage from "../src/cache-storage.js";

// DOM の `CacheStorage` とクラス名が衝突するため、型参照用の別名を用意します。
export type NativeCacheStorage = typeof globalThis.caches;

/**
 * テストで論理キーを `Request` に変換するときの基底 URL です。
 */
const BASE_URL = "https://unikvs.local/";

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
 * 論理キーをテスト用の `Request` に変換します。
 * `encodeURIComponent` により、任意のキーを 1 対 1 で URL に対応させます。
 */
export function createRequest(key: string): Request {
  return new Request(BASE_URL + encodeURIComponent(key));
}

/**
 * `Response` のボディをバイト列として読み取ります。
 * `write` / `getReadable` の結果をバイト単位で比較するために使用します。
 */
export async function readBody(response: Response): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * バイト列を `Response` としてストレージへ書き込みます。
 * 各テストで書き込みコンテキストの組み立てを繰り返さないために使用します。
 */
export async function writeBytes(
  storage: CacheStorage,
  key: string,
  data: Uint8Array<ArrayBuffer>,
): Promise<void> {
  await storage.write(
    createSetContext(key, { signal }) as IStorage.WriteContext,
    new Response(data),
  );
}

/**
 * キーに対応する値を読み取り、ボディをバイト列で返します。
 * 保存値の比較を簡潔にするために使用します。
 */
export async function readBytes(
  storage: CacheStorage,
  key: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const response = await storage.read(createGetContext(key, { signal }) as IStorage.ReadContext);

  return readBody(response);
}

/**
 * `Request` から正規化した URL を取り出します。
 * 文字列・`URL`・`Request` のいずれも受け付けます。
 */
function toUrl(request: RequestInfo | URL): string {
  return new Request(request).url;
}

type StoredResponse = {
  readonly body: ArrayBuffer | null;
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
};

type FakeCachesOptions = {
  /**
   * 保留し続ける操作です。
   * 中断処理が待機中のバックエンド呼び出しを打ち切ることを検証するために使用します。
   */
  readonly pending?: "open" | "match" | "keys" | undefined;
};

/**
 * テスト用のインメモリー `CacheStorage` を作ります。
 * `put` 時にボディと応答メタデータを複製し、`match` のたびに新しい `Response` を返します。
 */
export function createFakeCaches(options: FakeCachesOptions = {}): NativeCacheStorage {
  const stores = new Map<string, Map<string, StoredResponse>>();

  // 中断がなければテストがタイムアウトするまで解決しない Promise です。
  const neverResolve = <T>(): Promise<T> => new Promise<T>(() => {});

  const getStore = (name: string): Map<string, StoredResponse> => {
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
        if (options.pending === "match") {
          return neverResolve();
        }

        const found = store.get(toUrl(request));

        if (found === undefined) {
          return undefined;
        }

        return new Response(found.body?.slice() ?? null, {
          status: found.status,
          statusText: found.statusText,
          headers: found.headers,
        });
      },
      async put(request: RequestInfo | URL, response: Response): Promise<void> {
        const body = response.body === null ? null : await response.arrayBuffer();
        store.set(toUrl(request), {
          body,
          status: response.status,
          statusText: response.statusText,
          headers: new Headers(response.headers),
        });
      },
      async delete(request: RequestInfo | URL): Promise<boolean> {
        return store.delete(toUrl(request));
      },
      async keys(): Promise<readonly Request[]> {
        if (options.pending === "keys") {
          return neverResolve();
        }

        return [...store.keys()].map((url) => new Request(url));
      },
    } as unknown as Cache;
  };

  const backend = {
    async open(cacheName: string): Promise<Cache> {
      if (options.pending === "open") {
        return neverResolve();
      }

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
    const storage = new CacheStorage({
      cacheName,
      caches: createFakeCaches(),
      toRequest: createRequest,
    });
    await use(storage);
    if (storage.isOpen) {
      await storage.close();
    }
  },
});
