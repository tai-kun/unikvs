import type { IStorage } from "@unikvs/core";

import {
  CacheStorageNotAvailableError,
  InvalidChunkTypeError,
  KeyNotFoundError,
} from "./errors.js";

// DOM の `CacheStorage` とクラス名が衝突するため、型参照用の別名を用意します。
type NativeCacheStorage = typeof globalThis.caches;

// キーを `Request` の URL に変換するときの基底 URL です。
// `encodeURIComponent` で符号化するため、任意のキーと 1 対 1 に対応します。
const BASE_URL = "https://unikvs.local/";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cache-storage#usage)
 */
export type CacheStorageOptions = {
  /**
   * 注入する `CacheStorage` です。
   *
   * 未指定のときは `globalThis.caches` を使います。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cache-storage#usage)
   */
  readonly caches?: NativeCacheStorage | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cache-storage#usage)
 */
export default class CacheStorage implements IStorage {
  /**
   * 開いている `Cache` インスタンスを保持します。
   *
   * ストレージがオープンされるまで null です。
   */
  #cache: Cache | null;

  /**
   * 使用する `Cache` 名です。
   */
  readonly #cacheName: string;

  // 注入された `CacheStorage` です。
  // 未指定の場合は `globalThis.caches` を使います。
  readonly #injectedCaches: NativeCacheStorage | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cache-storage#usage)
   */
  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cache-storage#usage)
   */
  public constructor(cacheName: string = "unikvs", options: CacheStorageOptions = {}) {
    const { caches } = options;
    this.name = "CacheStorage";
    this.#cache = null;
    this.#cacheName = cacheName;
    this.#injectedCaches = caches;
  }

  // 使用する `CacheStorage` を解決します。
  // 実行時の意味は `#injectedCaches ?? globalThis.caches` です。
  #backend(): NativeCacheStorage {
    const backend =
      this.#injectedCaches ?? (globalThis as { caches?: NativeCacheStorage | undefined }).caches;

    if (!backend) {
      throw new CacheStorageNotAvailableError();
    }

    return backend;
  }

  // 論理キーを `Request` に変換します。
  #toRequest(key: string): Request {
    return new Request(BASE_URL + encodeURIComponent(key));
  }

  // 開いている `Cache` を返します。
  // 未オープンのときは backend の有無に応じてエラーを投げ分けます。
  #openedCache(): Cache {
    const cache = this.#cache;

    if (cache) {
      return cache;
    }

    // backend 不在は利用不可として報告し、backend がある場合は未オープンの誤用として報告します。
    this.#backend();

    throw new TypeError("CacheStorage is not open. Call open() before use.");
  }

  public get isOpen(): boolean {
    return this.#cache !== null;
  }

  public async open(c: IStorage.OpenContext): Promise<void> {
    c.signal.throwIfAborted();

    if (this.#cache) {
      return;
    }

    const cache = await this.#backend().open(this.#cacheName);
    c.signal.throwIfAborted();

    // 中断時は開いたハンドルを公開せず、未オープン状態へ戻します。
    this.#cache = cache;
  }

  public async close(c: IStorage.CloseContext): Promise<void> {
    c.signal.throwIfAborted();

    this.#cache = null;
  }

  public async write(c: IStorage.WriteContext, data: Uint8Array<ArrayBuffer>): Promise<void> {
    c.signal.throwIfAborted();

    // 後から入力を書き換えても保存値が変わらないよう、バイト列を複製します。
    const body = data instanceof Uint8Array ? data.slice() : data;
    c.signal.throwIfAborted();
    await this.#openedCache().put(
      this.#toRequest(c.key),
      new Response(body as BodyInit, {
        headers: { "Content-Type": "application/octet-stream" },
      }),
    );
  }

  public async read(c: IStorage.ReadContext): Promise<Uint8Array<ArrayBuffer>> {
    c.signal.throwIfAborted();

    const response = await this.#openedCache().match(this.#toRequest(c.key));
    c.signal.throwIfAborted();

    if (response === undefined) {
      throw new KeyNotFoundError({ key: c.key });
    }

    const buff = await response.arrayBuffer();

    return new Uint8Array(buff);
  }

  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    c.signal.throwIfAborted();

    const response = await this.#openedCache().match(this.#toRequest(c.key));

    return response !== undefined;
  }

  public async delete(c: IStorage.DeleteContext): Promise<void> {
    c.signal.throwIfAborted();

    const deleted = await this.#openedCache().delete(this.#toRequest(c.key));

    if (!deleted) {
      throw new KeyNotFoundError({ key: c.key });
    }
  }

  public async clear(c: IStorage.ClearContext): Promise<void> {
    c.signal.throwIfAborted();

    // このインスタンスは専用の `Cache` を使うため、列挙した要求をすべて削除します。
    const cache = this.#openedCache();
    const requests = await cache.keys();

    for (const request of requests) {
      c.signal.throwIfAborted();
      await cache.delete(request);
    }
  }

  public getWritable(c: IStorage.GetWritableContext): WritableStream<Uint8Array<ArrayBuffer>> {
    c.signal.throwIfAborted();
    this.#openedCache();

    const chunks: Uint8Array<ArrayBuffer>[] = [];

    return new WritableStream<Uint8Array<ArrayBuffer>>({
      write: (chunk) => {
        c.signal.throwIfAborted();

        if (!(chunk instanceof Uint8Array)) {
          throw new InvalidChunkTypeError({ key: c.key, chunk });
        }

        // 後からチャンクを書き換えても保存値が変わらないよう、複製して保持します。
        chunks.push(chunk.slice());
      },
      close: async () => {
        // 保存は close のときだけ行うため、中断時はここまでのチャンクを破棄できます。
        c.signal.throwIfAborted();

        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;

        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.length;
        }

        c.signal.throwIfAborted();
        await this.#openedCache().put(
          this.#toRequest(c.key),
          new Response(result, {
            headers: { "Content-Type": "application/octet-stream" },
          }),
        );
      },
      abort: () => {
        chunks.length = 0;
      },
    });
  }

  public getReadable(c: IStorage.GetReadableContext): ReadableStream<Uint8Array<ArrayBuffer>> {
    c.signal.throwIfAborted();
    this.#openedCache();

    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull: async (controller) => {
        try {
          c.signal.throwIfAborted();
          const data = await this.read(c as unknown as IStorage.ReadContext);
          c.signal.throwIfAborted();
          // 読み手がチャンクを書き換えても保存値が変わらないよう、複製して送出します。
          controller.enqueue(new Uint8Array(data));
          controller.close();
        } catch (ex) {
          controller.error(ex);
        }
      },
    });
  }
}
