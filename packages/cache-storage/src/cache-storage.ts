import type { IStorage, IKeyedActionContext } from "@unikvs/core";
import { throwIfAborted, toAbortPromise } from "abort-signal-utils";

import {
  KeyNotFoundError,
  InvalidChunkTypeError,
  CacheStorageNotAvailableError,
} from "./errors.js";

// DOM の `CacheStorage` とクラス名が衝突するため、型参照用の別名を用意します。
type NativeCacheStorage = typeof globalThis.caches;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cache-storage#usage)
 */
export interface IToRequest {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cache-storage#usage)
   */
  (key: string): RequestInfo | URL;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cache-storage#usage)
 */
export type CacheStorageOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cache-storage#usage)
   */
  readonly cacheName: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cache-storage#usage)
   */
  readonly toRequest: IToRequest;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cache-storage#usage)
   */
  readonly caches?: NativeCacheStorage | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cache-storage#usage)
 */
export default class CacheStorage implements IStorage {
  public readonly name: string = "CacheStorage";

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

  /**
   * 論理キーを `Request` に変換する関数です。
   */
  readonly #toRequest: IToRequest;

  /**
   * 注入された `NativeCacheStorage` です。
   */
  readonly #injectedCaches: NativeCacheStorage | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cache-storage#usage)
   */
  public constructor(options: CacheStorageOptions) {
    const { caches, cacheName, toRequest } = options;
    this.#cache = null;
    this.#cacheName = cacheName;
    this.#toRequest = toRequest;
    this.#injectedCaches = caches;
  }

  public get isOpen(): boolean {
    return this.#cache !== null;
  }

  public async open(c: IStorage.OpenContext): Promise<void> {
    using abortPromise = toAbortPromise(c.signal);

    const caches: NativeCacheStorage | null =
      this.#injectedCaches ||
      globalThis.caches ||
      (typeof window !== "undefined" ? window.caches : null) ||
      (typeof self !== "undefined" ? self.caches : null);
    if (!caches) {
      throw new CacheStorageNotAvailableError();
    }

    this.#cache = await Promise.race([caches.open(this.#cacheName), abortPromise]);
  }

  public async close(): Promise<void> {
    this.#cache = null;
  }

  public async write(c: IStorage.WriteContext, response: Response): Promise<void> {
    const cache = this.#cache!; // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const request = this.#toRequest(c.key);
    await cache.put(request, response);
  }

  async #read(c: IKeyedActionContext): Promise<Response> {
    using abortPromise = toAbortPromise(c.signal);

    const cache = this.#cache!; // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const request = this.#toRequest(c.key);
    const response = await Promise.race([cache.match(request), abortPromise]);
    if (!response) {
      throw new KeyNotFoundError({ key: c.key });
    }

    return response;
  }

  public async read(c: IStorage.ReadContext): Promise<Response> {
    return this.#read(c);
  }

  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    using abortPromise = toAbortPromise(c.signal);

    const cache = this.#cache!; // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const request = this.#toRequest(c.key);
    const response = await Promise.race([cache.match(request), abortPromise]);

    return response !== undefined;
  }

  public async delete(c: IStorage.DeleteContext): Promise<void> {
    const cache = this.#cache!; // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const request = this.#toRequest(c.key);
    const deleted = await cache.delete(request);
    if (!deleted) {
      throw new KeyNotFoundError({ key: c.key });
    }
  }

  public async clear(c: IStorage.ClearContext): Promise<void> {
    using abortPromise = toAbortPromise(c.signal);

    // cache インスタンスは専用の `Cache` を使うため、列挙した要求をすべて削除します。
    const cache = this.#cache!; // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
    const requests = await Promise.race([cache.keys(), abortPromise]);
    for (const request of requests) {
      await cache.delete(request);
      throwIfAborted(c.signal);
    }
  }

  public getWritable(c: IStorage.GetWritableContext): WritableStream<Uint8Array<ArrayBuffer>> {
    const chunks: Uint8Array<ArrayBuffer>[] = [];

    return new WritableStream<Uint8Array<ArrayBuffer>>({
      write: (chunk) => {
        throwIfAborted(c.signal);

        if (!(chunk instanceof Uint8Array)) {
          throw new InvalidChunkTypeError({
            key: c.key,
            chunk,
          });
        }

        // 後からチャンクを書き換えても保存値が変わらないよう、複製して保持します。
        chunks.push(chunk.slice());
      },
      close: async () => {
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const data = new Uint8Array(totalLength);

        let offset = 0;
        for (const chunk of chunks) {
          data.set(chunk, offset);
          offset += chunk.length;
        }

        const cache = this.#cache!; // UniKvs の仕様で先に open() が実行されるため、これは非 null です。
        const request = this.#toRequest(c.key);
        const response = new Response(data, {
          headers: {
            "Content-Type": "application/octet-stream",
          },
        });
        await cache.put(request, response);
      },
      abort: () => {
        chunks.length = 0;
      },
    });
  }

  public getReadable(c: IStorage.GetReadableContext): ReadableStream<Uint8Array<ArrayBuffer>> {
    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull: async (controller) => {
        try {
          const response = await this.#read(c);
          // 読み手がチャンクを書き換えても保存値が変わらないよう、複製して送出します。
          const buff = await response.arrayBuffer();
          const view = new Uint8Array(buff.slice());
          controller.enqueue(view);
          controller.close();
        } catch (ex) {
          controller.error(ex);
        }
      },
    });
  }
}
