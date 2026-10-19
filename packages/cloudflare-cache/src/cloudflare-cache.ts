import { KeyNotFoundError, type IStorage } from "@unikvs/core";

import {
  CacheBindingNotFoundError,
  CacheOperationError,
  ClearNotSupportedError,
  InvalidChunkTypeError,
  InvalidKeyError,
  InvalidOriginError,
} from "./errors.js";

/**
 * Workers の `Cache` binding が満たすべき最小形状です。
 *
 * `workers-types` への依存を避けるため、`put` / `match` / `delete` のみを定義します。
 * 標準の `Cache` はこの形状を満たすため、そのまま渡せます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#usage)
 */
export interface CacheLike {
  /**
   * `request` に対応する `response` を保存します。
   */
  put(request: Request, response: Response): Promise<void>;

  /**
   * `request` に対応する応答を探します。存在しないときは `undefined` を返します。
   */
  match(request: Request, options?: unknown): Promise<Response | undefined>;

  /**
   * `request` に対応する項目を削除します。削除したかどうかを返します。
   */
  delete(request: Request, options?: unknown): Promise<boolean>;
}

/**
 * `CloudflareCache` のコンストラクターオプションです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#usage)
 */
export type CloudflareCacheOptions = {
  /**
   * 使用する `Cache` binding です。
   *
   * 未指定のときは `caches.default` を使います。どちらも存在しないときは構築時に拒否します。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#usage)
   */
  readonly cache?: CacheLike | undefined;

  /**
   * キーを要求 URL に変換するときの起点 URL です。
   *
   * クエリー・フラグメントなしの絶対 URL を指定します。末尾の `/` は除去して正規化します。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#usage)
   */
  readonly origin?: string | undefined;
};

const DEFAULT_ORIGIN = "https://unikvs.cloudflare-cache";

// `origin` を検証して末尾の `/` を除去した値を返します。
function normalizeOrigin(origin: unknown): string {
  if (typeof origin !== "string") {
    throw new InvalidOriginError({ actual: origin });
  }

  if (origin !== origin.trim()) {
    throw new InvalidOriginError({ actual: origin });
  }

  if (origin === "") {
    throw new InvalidOriginError({ actual: origin });
  }

  const normalized = origin.replace(/\/+$/, "");

  if (normalized === "") {
    throw new InvalidOriginError({ actual: origin });
  }

  let parsed: URL;

  try {
    parsed = new URL(normalized);
  } catch {
    throw new InvalidOriginError({ actual: origin });
  }

  if (parsed.search !== "" || parsed.hash !== "") {
    throw new InvalidOriginError({ actual: origin });
  }

  return normalized;
}

// 未指定の `cache` を `caches.default` から解決します。
function resolveDefaultCache(): CacheLike {
  const caches = (globalThis as { caches?: { default?: CacheLike } }).caches;

  if (caches?.default) {
    return caches.default;
  }

  throw new CacheBindingNotFoundError({ property: "caches.default" });
}

/**
 * Workers Cache API binding にバイト列を保存するストレージです。
 *
 * キーを `${origin}/<符号化キー>` の `Request` URL に変換し、バイナリーボディを持つ
 * `Response` として `put` / `match` / `delete` します。Cache API にキー列挙がないため
 * `clear` は未対応です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#usage)
 */
export default class CloudflareCache implements IStorage<Uint8Array<ArrayBuffer>> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#usage)
   */
  public readonly name: string;

  // 正規化済みの起点 URL です。末尾の `/` を除去しています。
  readonly #origin: string;

  // 使用する `Cache` binding です。
  readonly #cache: CacheLike;

  /**
   * Workers Cache API binding にバイト列を保存するストレージです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#usage)
   */
  public constructor(options: CloudflareCacheOptions = {}) {
    const { cache = resolveDefaultCache(), origin = DEFAULT_ORIGIN } = options;
    this.name = "CloudflareCache";
    this.#cache = cache;
    this.#origin = normalizeOrigin(origin);
  }

  // キーに対応する要求を組み立てます。
  // 符号化に失敗した場合は `InvalidKeyError` を投げます。
  #requestFor(key: string): Request {
    let segment: string;

    try {
      segment = encodeURIComponent(key).replaceAll(".", "%2E");
    } catch (ex) {
      throw new InvalidKeyError({ key, cause: ex });
    }

    return new Request(`${this.#origin}/${segment}`);
  }

  // バイト列を保存用の応答に包みます。
  static #toResponse(data: Uint8Array<ArrayBuffer>): Response {
    return new Response(data, {
      status: 200,
      headers: { "Content-Type": "application/octet-stream" },
    });
  }

  public get isOpen(): boolean {
    return true;
  }

  public async open(c: IStorage.OpenContext): Promise<void> {
    c.signal.throwIfAborted();
  }

  public async close(c: IStorage.CloseContext): Promise<void> {
    c.signal.throwIfAborted();
  }

  public async write(c: IStorage.WriteContext, data: Uint8Array<ArrayBuffer>): Promise<void> {
    c.signal.throwIfAborted();

    const request = this.#requestFor(c.key);

    try {
      await this.#cache.put(request, CloudflareCache.#toResponse(data.slice()));
    } catch (ex) {
      c.signal.throwIfAborted();
      throw new CacheOperationError({ operation: "put", key: c.key, cause: ex });
    }
  }

  public async read(c: IStorage.ReadContext): Promise<Uint8Array<ArrayBuffer>> {
    c.signal.throwIfAborted();

    const request = this.#requestFor(c.key);
    let response: Response | undefined;

    try {
      response = await this.#cache.match(request);
    } catch (ex) {
      c.signal.throwIfAborted();
      throw new CacheOperationError({ operation: "match", key: c.key, cause: ex });
    }

    if (response === undefined) {
      throw new KeyNotFoundError({ key: c.key });
    }

    const buffer = await response.arrayBuffer();

    return new Uint8Array(buffer);
  }

  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    c.signal.throwIfAborted();

    const request = this.#requestFor(c.key);
    let response: Response | undefined;

    try {
      response = await this.#cache.match(request);
    } catch (ex) {
      c.signal.throwIfAborted();
      throw new CacheOperationError({ operation: "match", key: c.key, cause: ex });
    }

    if (response === undefined) {
      return false;
    }

    // 存在確認ではボディを使わないため破棄します。
    await response.body?.cancel();

    return true;
  }

  public async delete(c: IStorage.DeleteContext): Promise<void> {
    c.signal.throwIfAborted();

    const request = this.#requestFor(c.key);

    try {
      await this.#cache.delete(request);
    } catch (ex) {
      c.signal.throwIfAborted();
      throw new CacheOperationError({ operation: "delete", key: c.key, cause: ex });
    }
  }

  public clear(_c: IStorage.ClearContext): never {
    throw new ClearNotSupportedError();
  }

  public getWritable(c: IStorage.GetWritableContext): WritableStream<Uint8Array<ArrayBuffer>> {
    c.signal.throwIfAborted();

    const request = this.#requestFor(c.key);
    const cache = this.#cache;
    const signal = c.signal;
    // Cache API にストリーミング `put` はないため蓄積して `close` 時に一括保存します。
    const chunks: Uint8Array[] = [];

    return new WritableStream<Uint8Array<ArrayBuffer>>({
      write(chunk) {
        if (!(chunk instanceof Uint8Array)) {
          throw new InvalidChunkTypeError({ key: c.key, chunk });
        }

        chunks.push(chunk.slice());
      },
      close: async () => {
        signal.throwIfAborted();

        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const merged = new Uint8Array(totalLength);
        let offset = 0;

        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.byteLength;
        }

        try {
          await cache.put(request, CloudflareCache.#toResponse(merged));
        } catch (ex) {
          signal.throwIfAborted();
          throw new CacheOperationError({ operation: "put", key: c.key, cause: ex });
        }
      },
      abort() {
        chunks.length = 0;
      },
    });
  }

  public async getReadable(
    c: IStorage.GetReadableContext,
  ): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
    c.signal.throwIfAborted();

    const request = this.#requestFor(c.key);
    let response: Response | undefined;

    try {
      response = await this.#cache.match(request);
    } catch (ex) {
      c.signal.throwIfAborted();
      throw new CacheOperationError({ operation: "match", key: c.key, cause: ex });
    }

    if (response === undefined) {
      throw new KeyNotFoundError({ key: c.key });
    }

    // ボディなし応答は空ストリームとして返します。
    if (response.body === null) {
      return new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(controller) {
          controller.close();
        },
      });
    }

    return response.body as ReadableStream<Uint8Array<ArrayBuffer>>;
  }
}
