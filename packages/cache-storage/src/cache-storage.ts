import type { IStorage, IKeyedActionContext } from "@unikvs/core";
import { throwIfAborted, toAbortPromise } from "abort-signal-utils";

import {
  KeyNotFoundError,
  InvalidChunkTypeError,
  CacheStorageNotAvailableError,
} from "./errors.js";

/**
 * DOM の CacheStorage とクラス名が衝突するため、型参照用の別名です。
 */
type NativeCacheStorage = typeof globalThis.caches;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cache-storage#to-request)
 */
export interface IToRequest {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cache-storage#to-request)
   */
  (key: string): RequestInfo | URL;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cache-storage#usage)
 */
export type CacheStorageOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cache-storage#cache-name)
   */
  readonly cacheName: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cache-storage#to-request)
   */
  readonly toRequest: IToRequest;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cache-storage#caches)
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
   * open と close の世代です。open の待機中に close された場合、古い open が結果を公開しないようにします。
   */
  #generation: number;

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
    this.#generation = 0;
    this.#cacheName = cacheName;
    this.#toRequest = toRequest;
    this.#injectedCaches = caches;
  }

  /**
   * ストレージが開いているかどうかを返します。
   *
   * @returns Cache インスタンスを保持していれば true を返します。
   */
  public get isOpen(): boolean {
    return this.#cache !== null;
  }

  /**
   * Cache を開きます。注入された backed を優先しなければ実行環境から探します。
   *
   * @param c 中断を知らせるシグナルを持つコンテキストです。
   *
   * @returns 完了を知らせるプロミスです。
   */
  public async open(c: IStorage.OpenContext): Promise<void> {
    using abortPromise = toAbortPromise(c.signal);
    const generation = this.#generation;

    // 注入されたバックエンドを優先します。
    // 実行環境の `Cache API` は `globalThis` 経由で参照します。
    const globalCaches = (globalThis as { caches?: NativeCacheStorage | undefined }).caches;
    const windowCaches = (
      globalThis as { window?: { caches?: NativeCacheStorage | undefined } | undefined }
    ).window?.caches;
    const selfCaches = (
      globalThis as { self?: { caches?: NativeCacheStorage | undefined } | undefined }
    ).self?.caches;
    const caches = this.#injectedCaches ?? globalCaches ?? windowCaches ?? selfCaches;

    if (caches === undefined) {
      throw new CacheStorageNotAvailableError();
    }

    const cache = await Promise.race([caches.open(this.#cacheName), abortPromise]);

    // 待機中に close されていた場合は、その close を打ち消さずに結果を破棄します。
    if (this.#generation === generation) {
      this.#cache = cache;
    }
  }

  /**
   * 保持している Cache を破棄して閉じます。
   *
   * @returns 値を返しません。
   */
  public close(): void {
    this.#cache = null;

    // 進行中の open が後から結果を公開して close を打ち消さないよう、世代を進めます。
    this.#generation += 1;
  }

  /**
   * 指定したキーに Response を保存します。
   *
   * @param c 書き込み対象のキーを持つコンテキストです。
   * @param response 保存する Response です。
   *
   * @returns 完了を知らせるプロミスです。
   */
  public async write(c: IStorage.WriteContext, response: Response): Promise<void> {
    // UniKvs の仕様では先に `open()` が実行されるため、ここでは開いていることが前提です。
    const cache = this.#getCache();
    const request = this.#toRequest(c.key);

    // 呼び出し元の Response を消費せず、複数のストレージへ同じ Response を書き込めるようにします。
    // clone は body を読む前に同期的に行う必要があります。
    await cache.put(request, response.clone());
  }

  /**
   * 指定したキーの Response を読み出します。
   *
   * @param c 読み出すキーを持つコンテキストです。
   *
   * @returns 保存されている Response です。
   */
  public read(c: IStorage.ReadContext): Promise<Response> {
    return this.#read(c);
  }

  /**
   * 指定したキーが存在するかどうかを返します。
   *
   * @param c 確認するキーを持つコンテキストです。
   *
   * @returns キーが存在すれば true を返します。
   */
  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    const response = await this.#match(c);

    return response !== undefined;
  }

  /**
   * 指定したキーを削除します。
   *
   * @param c 削除するキーを持つコンテキストです。
   *
   * @returns 完了を知らせるプロミスです。
   */
  public async delete(c: IStorage.DeleteContext): Promise<void> {
    // UniKvs の仕様では先に `open()` が実行されるため、ここでは開いていることが前提です。
    const cache = this.#getCache();
    const request = this.#toRequest(c.key);
    const deleted = await cache.delete(request);

    if (!deleted) {
      throw new KeyNotFoundError({ key: c.key });
    }
  }

  /**
   * 専用の Cache 内の要求をすべて削除します。
   *
   * @param c 中断を知らせるシグナルを持つコンテキストです。
   *
   * @returns 完了を知らせるプロミスです。
   */
  public async clear(c: IStorage.ClearContext): Promise<void> {
    using abortPromise = toAbortPromise(c.signal);

    // cache インスタンスは専用の `Cache` を使うため、列挙した要求をすべて削除します。
    // UniKvs の仕様では先に `open()` が実行されるため、ここでは開いていることが前提です。
    const cache = this.#getCache();
    const requests = await Promise.race([cache.keys(), abortPromise]);

    for (const request of requests) {
      await cache.delete(request);
      throwIfAborted(c.signal);
    }
  }

  /**
   * Uint8Array を書き込むためのストリームを作成します。close 時に Response として保存します。
   *
   * @param c 書き込み対象のキーを持つコンテキストです。
   *
   * @returns Uint8Array を受け付ける書き込みストリームです。
   */
  public getWritable(c: IStorage.GetWritableContext): WritableStream<Uint8Array<ArrayBuffer>> {
    throwIfAborted(c.signal);

    const chunks: Uint8Array<ArrayBuffer>[] = [];

    return new WritableStream<Uint8Array<ArrayBuffer>>({
      abort: (): void => {
        chunks.length = 0;
      },
      close: async (): Promise<void> => {
        try {
          // 中断済みの場合は空の Response であっても保存しません。
          throwIfAborted(c.signal);

          const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
          const data = new Uint8Array(totalLength);

          let offset = 0;

          for (const chunk of chunks) {
            data.set(chunk, offset);
            offset += chunk.length;
          }

          // UniKvs の仕様では先に `open()` が実行されるため、ここでは開いていることが前提です。
          const cache = this.#getCache();
          const request = this.#toRequest(c.key);
          const response = new Response(data, {
            headers: {
              "Content-Type": "application/octet-stream",
            },
          });
          await cache.put(request, response);
        } finally {
          chunks.length = 0;
        }
      },
      write: (chunk: Uint8Array<ArrayBuffer>): void => {
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
    });
  }

  /**
   * 保存済みの Response をバイト列として読み出すストリームを作成します。
   *
   * @param c 読み出すキーを持つコンテキストです。
   *
   * @returns Uint8Array を送出する読み取りストリームです。
   */
  public getReadable(c: IStorage.GetReadableContext): ReadableStream<Uint8Array<ArrayBuffer>> {
    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull: async (
        controller: ReadableStreamDefaultController<Uint8Array<ArrayBuffer>>,
      ): Promise<void> => {
        try {
          const response = await this.#read(c);

          // `Response.arrayBuffer()` は呼び出しごとに新しい ArrayBuffer を返すため、そのまま送出できます。
          const buff = await response.arrayBuffer();
          const view = new Uint8Array(buff);
          controller.enqueue(view);

          controller.close();
        } catch (ex) {
          controller.error(ex);
        }
      },
    });
  }

  /**
   * 使用中の Cache を返します。未オープン時はエラーを投げます。
   *
   * @returns 開いている Cache です。
   */
  #getCache(): Cache {
    const cache = this.#cache;

    if (cache === null) {
      throw new TypeError("CacheStorage is not open. Call open() first.");
    }

    return cache;
  }

  /**
   * 指定したキーの Response を読み出します。存在しない場合はエラーを投げます。
   *
   * @param c 読み出すキーと中断信号を持つコンテキストです。
   *
   * @returns 保存されている Response です。
   */
  async #read(c: IKeyedActionContext): Promise<Response> {
    const response = await this.#match(c);

    if (response === undefined) {
      throw new KeyNotFoundError({ key: c.key });
    }

    return response;
  }

  /**
   * 指定したキーの Response を読み出します。存在しない場合は undefined を返します。
   *
   * @param c 読み出すキーと中断信号を持つコンテキストです。
   *
   * @returns 保存されている Response です。存在しない場合は undefined です。
   */
  async #match(c: IKeyedActionContext): Promise<Response | undefined> {
    using abortPromise = toAbortPromise(c.signal);

    // UniKvs の仕様では先に `open()` が実行されるため、ここでは開いていることが前提です。
    const cache = this.#getCache();
    const request = this.#toRequest(c.key);

    return await Promise.race([cache.match(request), abortPromise]);
  }
}
