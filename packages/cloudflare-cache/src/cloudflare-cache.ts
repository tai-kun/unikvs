import { type IStorage, KeyNotFoundError } from "@unikvs/core";
import { throwIfAborted, toAbortPromise } from "abort-signal-utils";

import {
  InvalidKeyError,
  InvalidOriginError,
  CacheOperationError,
  InvalidChunkTypeError,
  ClearNotSupportedError,
  CacheBindingNotFoundError,
} from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#cloudflare-cache)
 */
export interface CacheLike {
  /**
   * `request` に対応する `response` を保存します。
   *
   * @param request 保存先の要求です。
   * @param response 保存する応答です。
   *
   * @returns 保存が完了したら解決します。
   */
  put(request: Request, response: Response): Promise<void>;

  /**
   * `request` に対応する応答を探します。存在しないときは `undefined` を返します。
   *
   * @param request 照合する要求です。
   * @param options 照合に渡す任意項目です。
   *
   * @returns 一致する応答です。欠番時は undefined です。
   */
  match(request: Request, options?: unknown): Promise<Response | undefined>;

  /**
   * `request` に対応する項目を削除します。削除したかどうかを返します。
   *
   * @param request 削除する要求です。
   * @param options 削除に渡す任意項目です。
   *
   * @returns 削除したかどうかです。
   */
  delete(request: Request, options?: unknown): Promise<boolean>;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#cloudflare-cache)
 */
export type CloudflareCacheOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#cloudflare-cache-cache)
   */
  readonly cache?: CacheLike | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#cloudflare-cache-origin)
   */
  readonly origin?: string | undefined;
};

/**
 * 既定の起点 URL です。
 *
 * `origin` 未指定時にキー要求の起点として使います。
 */
const DEFAULT_ORIGIN = "https://unikvs.cloudflare-cache";

/**
 * 起点 URL を検証して正規化します。
 *
 * 末尾の `/` を除去した値を返します。
 *
 * @param origin 検証する起点 URL です。
 *
 * @returns 正規化した起点 URL です。
 */
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

  const normalized = origin.replace(/\/+$/u, "");

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

/**
 * 未指定のキャッシュを `caches.default` から解決します。
 *
 * @returns 解決したキャッシュ binding です。
 */
function resolveDefaultCache(): CacheLike {
  const caches = (globalThis as { caches?: { default?: CacheLike } }).caches;

  if (caches?.default) {
    return caches.default;
  }

  throw new CacheBindingNotFoundError({ property: "caches.default" });
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#cloudflare-cache)
 */
export default class CloudflareCache implements IStorage<Uint8Array<ArrayBuffer>> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#cloudflare-cache)
   */
  public readonly name: string;

  /**
   * 正規化済みの起点 URL です。
   *
   * 末尾の `/` を除去しています。
   */
  readonly #origin: string;

  /**
   * 使用する `Cache` binding です。
   */
  readonly #cache: CacheLike;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-cache#cloudflare-cache)
   */
  public constructor(options: CloudflareCacheOptions = {}) {
    const { cache = resolveDefaultCache(), origin = DEFAULT_ORIGIN } = options;

    this.name = "CloudflareCache";
    this.#cache = cache;
    this.#origin = normalizeOrigin(origin);
  }

  /**
   * バイト列を保存用の応答に包みます。
   *
   * @param data 包むバイト列です。
   *
   * @returns 保存用の応答です。
   */
  static #toResponse(data: Uint8Array<ArrayBuffer>): Response {
    return new Response(data, {
      status: 200,
      headers: { "Content-Type": "application/octet-stream" },
    });
  }

  /**
   * ストレージがオープン済みかどうかです。
   *
   * 常に真を返します。
   *
   * @returns オープン済みなら真です。
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * ストレージをオープンします。
   *
   * 接続を持たないため中断確認のみ行います。
   *
   * @param c オープンコンテキストです。
   *
   * @returns オープンが完了したら解決します。
   */
  public async open(c: IStorage.OpenContext): Promise<void> {
    throwIfAborted(c.signal);
  }

  /**
   * ストレージをクローズします。
   *
   * 接続を持たないため中断確認のみ行います。
   *
   * @param c クローズコンテキストです。
   *
   * @returns クローズが完了したら解決します。
   */
  public async close(c: IStorage.CloseContext): Promise<void> {
    throwIfAborted(c.signal);
  }

  /**
   * バイト列を書き込みます。
   *
   * 要求 URL へ応答として保存します。
   *
   * @param c 書き込みコンテキストです。
   * @param data 保存するバイト列です。
   *
   * @returns 書き込みが完了したら解決します。
   */
  public async write(c: IStorage.WriteContext, data: Uint8Array<ArrayBuffer>): Promise<void> {
    await this.#put(c.signal, c.key, data);
  }

  /**
   * バイト列を読み取ります。
   *
   * 要求 URL に一致する応答を取得します。
   *
   * @param c 読み取りコンテキストです。
   *
   * @returns 読み取ったバイト列です。
   */
  public async read(c: IStorage.ReadContext): Promise<Uint8Array<ArrayBuffer>> {
    throwIfAborted(c.signal);
    using abortPromise = toAbortPromise(c.signal);

    const request = this.#requestFor(c.key);
    const response = await Promise.race([this.#match(c, request), abortPromise]);

    if (response === undefined) {
      throw new KeyNotFoundError({ key: c.key });
    }

    const buffer = await Promise.race([response.arrayBuffer(), abortPromise]);

    return new Uint8Array(buffer);
  }

  /**
   * キーの存在を確認します。
   *
   * 一致する応答の有無で判定します。
   *
   * @param c 存在確認コンテキストです。
   *
   * @returns 存在すれば真です。
   */
  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    throwIfAborted(c.signal);
    using abortPromise = toAbortPromise(c.signal);

    const request = this.#requestFor(c.key);
    const response = await Promise.race([this.#match(c, request), abortPromise]);

    if (response === undefined) {
      return false;
    }

    // 存在確認ではボディを使わないため破棄します。
    await response.body?.cancel();

    return true;
  }

  /**
   * キーを削除します。
   *
   * 要求 URL に一致する項目を削除します。
   *
   * @param c 削除コンテキストです。
   *
   * @returns 削除が完了したら解決します。
   */
  public async delete(c: IStorage.DeleteContext): Promise<void> {
    throwIfAborted(c.signal);

    const request = this.#requestFor(c.key);

    try {
      await this.#cache.delete(request);
    } catch (ex) {
      throw new CacheOperationError({
        key: c.key,
        cause: ex,
        operation: "delete",
      });
    }
  }

  /**
   * 指定したキーのバイト列を別のキーへ複製します。複製先が存在する場合は上書きします。
   *
   * @param c 複製元と複製先のキーを持つコンテキストです。
   *
   * @returns 複製が完了したら解決します。
   */
  public async copy(c: IStorage.CopyContext): Promise<void> {
    const data = await this.read(c as unknown as IStorage.ReadContext);

    // 同じキーへの複製は値の存在確認だけを行います。
    if (c.key === c.destinationKey) {
      return;
    }

    await this.#put(c.signal, c.destinationKey, data);
  }

  /**
   * 指定したキーのバイト列を別のキーへ移動します。移動先の書き込みが成功してから移動元を削除します。
   *
   * @param c 移動元と移動先のキーを持つコンテキストです。
   *
   * @returns 移動が完了したら解決します。
   */
  public async move(c: IStorage.MoveContext): Promise<void> {
    const data = await this.read(c as unknown as IStorage.ReadContext);

    // 同じキーへの移動は値の存在確認だけを行います。
    if (c.key === c.destinationKey) {
      return;
    }

    await this.#put(c.signal, c.destinationKey, data);
    await this.delete(c as unknown as IStorage.DeleteContext);
  }

  /**
   * 未対応のため常に例外を投げます。
   *
   * 列挙手段がないため `clear` には対応しません。
   *
   * @param _c クリアコンテキストです。
   *
   * @returns 常に例外を投げるため戻りません。
   */
  public clear(_c: IStorage.ClearContext): never {
    throw new ClearNotSupportedError();
  }

  /**
   * 書き込み用ストリームを取得します。
   *
   * チャンクを蓄積し、`close` 時に一括保存します。
   *
   * @param c 書き込みストリーム取得コンテキストです。
   *
   * @returns 書き込み用ストリームです。
   */
  public getWritable(c: IStorage.GetWritableContext): WritableStream<Uint8Array<ArrayBuffer>> {
    throwIfAborted(c.signal);

    const request = this.#requestFor(c.key);
    const cache = this.#cache;
    const signal = c.signal;
    // Cache API にストリーミング `put` はないため蓄積して `close` 時に一括保存します。
    const chunks: Uint8Array[] = [];

    return new WritableStream<Uint8Array<ArrayBuffer>>({
      abort() {
        chunks.length = 0;
      },
      close: async () => {
        throwIfAborted(signal);

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
          throw new CacheOperationError({
            key: c.key,
            cause: ex,
            operation: "put",
          });
        }
      },
      write(chunk) {
        throwIfAborted(signal);

        if (!(chunk instanceof Uint8Array)) {
          throw new InvalidChunkTypeError({
            key: c.key,
            chunk,
          });
        }

        chunks.push(chunk.slice());
      },
    });
  }

  /**
   * 読み取り用ストリームを取得します。
   *
   * 一致する応答のボディをそのまま返します。
   *
   * @param c 読み取りストリーム取得コンテキストです。
   *
   * @returns 読み取り用ストリームを解決します。
   */
  public async getReadable(
    c: IStorage.GetReadableContext,
  ): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
    throwIfAborted(c.signal);
    using abortPromise = toAbortPromise(c.signal);

    const request = this.#requestFor(c.key);
    const response = await Promise.race([this.#match(c, request), abortPromise]);

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

  /**
   * 指定したキーへバイト列を応答として保存します。
   *
   * @param signal 中断を知らせるシグナルです。
   * @param key 保存先のキーです。
   * @param data 保存するバイト列です。
   *
   * @returns 保存が完了したら解決します。
   */
  async #put(signal: AbortSignal, key: string, data: Uint8Array<ArrayBuffer>): Promise<void> {
    throwIfAborted(signal);

    const request = this.#requestFor(key);

    try {
      await this.#cache.put(request, CloudflareCache.#toResponse(data.slice()));
    } catch (ex) {
      throw new CacheOperationError({
        key,
        cause: ex,
        operation: "put",
      });
    }
  }

  /**
   * キーに対応する要求を組み立てます。
   *
   * 符号化に失敗した場合は例外を投げます。
   *
   * @param key 変換する論理キーです。
   *
   * @returns キーに対応する要求です。
   */
  #requestFor(key: string): Request {
    let segment: string;

    try {
      segment = encodeURIComponent(key).replaceAll(".", "%2E");
    } catch (ex) {
      throw new InvalidKeyError({
        key,
        cause: ex,
      });
    }

    return new Request(`${this.#origin}/${segment}`);
  }

  /**
   * 一致する応答を探します。
   *
   * 失敗時は専用エラーに包んで投げます。
   *
   * @param c 読み取りや存在確認のコンテキストです。
   * @param request 照合する要求です。
   *
   * @returns 一致する応答です。欠番時は undefined です。
   */
  async #match(
    c: IStorage.ReadContext | IStorage.ExistsContext | IStorage.GetReadableContext,
    request: Request,
  ): Promise<Response | undefined> {
    try {
      return await this.#cache.match(request);
    } catch (ex) {
      throw new CacheOperationError({
        key: c.key,
        cause: ex,
        operation: "match",
      });
    }
  }
}
