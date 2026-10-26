import { type IStorage, type IPipelineContext, KeyNotFoundError } from "@unikvs/core";
import { del, put, head, list } from "@vercel/blob";
import { throwIfAborted } from "abort-signal-utils";

import {
  BlobNetworkError,
  BlobResponseError,
  InvalidTokenError,
  BlobOperationError,
  InvalidAccessError,
  InvalidChunkTypeError,
} from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
 */
export interface IFetch {
  (request: Request): Promise<Response>;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
 */
export type BlobAccess = "public" | "private";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
 */
export interface BlobRequestOptions {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly token?: string | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly abortSignal?: AbortSignal | undefined;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
 */
export interface BlobPutRequestOptions extends BlobRequestOptions {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly access: BlobAccess;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly contentType?: string | undefined;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
 */
export interface BlobListRequestOptions extends BlobRequestOptions {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly prefix?: string | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly cursor?: string | undefined;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
 */
export interface BlobPutResult {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly url: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly pathname: string;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
 */
export interface BlobHeadResult {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly url: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly pathname: string;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
 */
export interface BlobListItem {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly url: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly pathname: string;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
 */
export interface BlobListResult {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly blobs: readonly BlobListItem[];

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly cursor?: string | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly hasMore: boolean;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
 */
export interface BlobClientLike {
  /**
   * `pathname` にバイト列を保存します。
   *
   * @param pathname 保存先の pathname です。
   * @param body 保存するバイト列です。
   * @param options 保存に渡す項目です。
   *
   * @returns 保存結果です。
   */
  put(
    pathname: string,
    body: Uint8Array<ArrayBuffer>,
    options: BlobPutRequestOptions,
  ): Promise<BlobPutResult>;

  /**
   * `pathname` のメタ情報を取得します。存在しないときは拒否します。
   *
   * @param pathname 取得する pathname です。
   * @param options 取得に渡す項目です。
   *
   * @returns 取得したメタ情報です。
   */
  head(pathname: string, options: BlobRequestOptions): Promise<BlobHeadResult>;

  /**
   * `pathname` の Blob を削除します。
   *
   * @param pathname 削除する pathname です。
   * @param options 削除に渡す項目です。
   *
   * @returns 削除が完了したら解決します。
   */
  del(pathname: string | readonly string[], options: BlobRequestOptions): Promise<void>;

  /**
   * Blob の一覧を頁単位で取得します。
   *
   * @param options 一覧取得に渡す項目です。
   *
   * @returns 取得した一覧です。
   */
  list(options: BlobListRequestOptions): Promise<BlobListResult>;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
 */
export type VercelBlobOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob-token)
   */
  readonly token?: string | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob-client)
   */
  readonly client?: BlobClientLike | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob-key-prefix)
   */
  readonly keyPrefix?: string | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob-access)
   */
  readonly access?: BlobAccess | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob-fetch)
   */
  readonly fetch?: IFetch | undefined;
};

/**
 * 既定の公開範囲です。
 *
 * 未指定時は非公開として保存します。
 */
const DEFAULT_ACCESS: BlobAccess = "private";

/**
 * 既定のクライアントを作成します。
 *
 * `@vercel/blob` の関数を使い、未定義項目を取り除いて渡します。
 *
 * @returns 作成したクライアントです。
 */
function createDefaultClient(): BlobClientLike {
  return {
    del: (pathname, options) =>
      del(Array.isArray(pathname) ? [...pathname] : pathname, {
        ...(options.token !== undefined ? { token: options.token } : null),
        ...(options.abortSignal !== undefined ? { abortSignal: options.abortSignal } : null),
      }),
    put: (pathname, body, options) =>
      put(pathname, body.buffer, {
        access: options.access,
        ...(options.contentType !== undefined ? { contentType: options.contentType } : null),
        allowOverwrite: true,
        ...(options.token !== undefined ? { token: options.token } : null),
        ...(options.abortSignal !== undefined ? { abortSignal: options.abortSignal } : null),
      }),
    head: (pathname, options) =>
      head(pathname, {
        ...(options.token !== undefined ? { token: options.token } : null),
        ...(options.abortSignal !== undefined ? { abortSignal: options.abortSignal } : null),
      }),
    list: (options) =>
      list({
        ...(options.prefix !== undefined ? { prefix: options.prefix } : null),
        ...(options.cursor !== undefined ? { cursor: options.cursor } : null),
        ...(options.token !== undefined ? { token: options.token } : null),
        ...(options.abortSignal !== undefined ? { abortSignal: options.abortSignal } : null),
      }),
  };
}

/**
 * トークン値が空でない文字列であることを検証します。
 *
 * @param value 検証する値です。
 *
 * @returns 検証済みのトークンです。未指定時は undefined です。
 */
function assertTokenValue(value: unknown): string | undefined {
  let token: string | undefined = undefined;

  if (value !== undefined) {
    if (typeof value === "string" && value !== "") {
      token = value;
    } else {
      throw new InvalidTokenError({ actual: value });
    }
  }

  return token;
}

/**
 * 公開範囲の値がどちらかであることを検証します。
 *
 * @param value 検証する値です。
 *
 * @returns 検証済みの公開範囲です。
 */
function assertAccessValue(value: unknown): BlobAccess {
  if (value === undefined) {
    return DEFAULT_ACCESS;
  }

  if (value === "public" || value === "private") {
    return value;
  }

  throw new InvalidAccessError({ actual: value });
}

/**
 * 欠番を表す失敗かどうかを判定します。
 *
 * 実クライアントと疑似実装の双方に対応します。
 *
 * @param ex 判定する失敗です。
 *
 * @returns 欠番を表せば真です。
 */
function isBlobNotFound(ex: unknown): boolean {
  if (typeof ex !== "object" || ex === null) {
    return false;
  }

  const record = ex as {
    name?: unknown;
    status?: unknown;
    statusCode?: unknown;
    constructor?: unknown;
  };

  if (record.name === "BlobNotFoundError") {
    return true;
  }

  if (typeof record.constructor === "function" && record.constructor.name === "BlobNotFoundError") {
    return true;
  }

  return record.status === 404 || record.statusCode === 404;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
 */
export default class VercelBlob implements IStorage<Uint8Array<ArrayBuffer>> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  public readonly name: string;

  /**
   * 使用する Vercel Blob クライアントです。
   */
  readonly #client: BlobClientLike;

  /**
   * すべてのキーに付与する接頭辞です。
   */
  readonly #keyPrefix: string;

  /**
   * 保存する Blob の公開範囲です。
   */
  readonly #access: BlobAccess;

  /**
   * 既定のトークンです。
   */
  readonly #token: string | undefined;

  /**
   * ダウンロードに使う `fetch` 実装です。
   *
   * 未指定のときは `globalThis.fetch` を使います。
   */
  readonly #fetchImpl: IFetch | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  public constructor(options: VercelBlobOptions = {}) {
    const { fetch: fetchImpl, token, access, client, keyPrefix = "" } = options;

    this.name = "VercelBlob";
    this.#client = client ?? createDefaultClient();
    this.#keyPrefix = keyPrefix;
    this.#access = assertAccessValue(access);
    this.#token = assertTokenValue(token);
    this.#fetchImpl = fetchImpl;
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
   * `put` で Blob として保存します。
   *
   * @param c 書き込みコンテキストです。
   * @param data 保存するバイト列です。
   *
   * @returns 書き込みが完了したら解決します。
   */
  public async write(c: IStorage.WriteContext, data: Uint8Array<ArrayBuffer>): Promise<void> {
    throwIfAborted(c.signal);

    const token = this.#resolveToken(c);

    try {
      await this.#client.put(this.#pathname(c.key), data.slice(), {
        token,
        access: this.#access,
        abortSignal: c.signal,
        contentType: "application/octet-stream",
      });
    } catch (ex) {
      throwIfAborted(c.signal);
      throw new BlobOperationError({
        key: c.key,
        cause: ex,
        operation: "put",
      });
    }
  }

  /**
   * バイト列を読み取ります。
   *
   * `head` で URL を解決してダウンロードします。
   *
   * @param c 読み取りコンテキストです。
   *
   * @returns 読み取ったバイト列です。
   */
  public async read(c: IStorage.ReadContext): Promise<Uint8Array<ArrayBuffer>> {
    throwIfAborted(c.signal);

    const token = this.#resolveToken(c);
    let url: string;

    try {
      ({ url } = await this.#client.head(this.#pathname(c.key), {
        token,
        abortSignal: c.signal,
      }));
    } catch (ex) {
      if (isBlobNotFound(ex)) {
        throw new KeyNotFoundError({ key: c.key });
      }

      throwIfAborted(c.signal);
      throw new BlobOperationError({
        key: c.key,
        cause: ex,
        operation: "head",
      });
    }

    const response = await this.#download(c, url, token);
    const buffer = await response.arrayBuffer();

    return new Uint8Array(buffer);
  }

  /**
   * キーの存在を確認します。
   *
   * `head` の成否で判定します。
   *
   * @param c 存在確認コンテキストです。
   *
   * @returns 存在すれば真です。
   */
  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    throwIfAborted(c.signal);

    const token = this.#resolveToken(c);

    try {
      await this.#client.head(this.#pathname(c.key), {
        token,
        abortSignal: c.signal,
      });

      return true;
    } catch (ex) {
      if (isBlobNotFound(ex)) {
        return false;
      }

      throwIfAborted(c.signal);
      throw new BlobOperationError({
        key: c.key,
        cause: ex,
        operation: "head",
      });
    }
  }

  /**
   * キーを削除します。
   *
   * 存在しないキーも成功扱いにします。
   *
   * @param c 削除コンテキストです。
   *
   * @returns 削除が完了したら解決します。
   */
  public async delete(c: IStorage.DeleteContext): Promise<void> {
    throwIfAborted(c.signal);

    const token = this.#resolveToken(c);

    try {
      await this.#client.del(this.#pathname(c.key), {
        token,
        abortSignal: c.signal,
      });
    } catch (ex) {
      // 削除は冪等とし存在しないキーは成功扱いにします。
      if (isBlobNotFound(ex)) {
        return;
      }

      throwIfAborted(c.signal);
      throw new BlobOperationError({
        key: c.key,
        cause: ex,
        operation: "del",
      });
    }
  }

  /**
   * 接頭辞に一致する Blob をすべて削除します。
   *
   * `list` で全件集めてから削除します。
   *
   * @param c クリアコンテキストです。
   *
   * @returns 削除が完了したら解決します。
   */
  public async clear(c: IStorage.ClearContext): Promise<void> {
    throwIfAborted(c.signal);

    const token = this.#resolveToken(c);
    // 削除しながら頁を進めると欠落するため、先に全 pathname を集めてから削除します。
    const pathnames: string[] = [];
    let cursor: string | undefined;

    do {
      let page: BlobListResult;

      try {
        page = await this.#client.list({
          token,
          cursor,
          prefix: this.#keyPrefix,
          abortSignal: c.signal,
        });
      } catch (ex) {
        throwIfAborted(c.signal);
        throw new BlobOperationError({
          cause: ex,
          operation: "list",
        });
      }

      for (const blob of page.blobs) {
        pathnames.push(blob.pathname);
      }

      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor !== undefined);

    if (pathnames.length > 0) {
      try {
        await this.#client.del(pathnames, {
          token,
          abortSignal: c.signal,
        });
      } catch (ex) {
        throwIfAborted(c.signal);
        throw new BlobOperationError({
          cause: ex,
          operation: "del",
        });
      }
    }
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

    // Blob にストリーミング `put` はないため蓄積して `close` 時に一括送信します。
    const chunks: Uint8Array[] = [];

    return new WritableStream<Uint8Array<ArrayBuffer>>({
      abort() {
        chunks.length = 0;
      },
      close: async () => {
        throwIfAborted(c.signal);

        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const merged = new Uint8Array(totalLength);
        let offset = 0;

        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.byteLength;
        }

        await this.write(c, merged);
      },
      write(chunk) {
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
   * `head` で URL を解決してダウンロードします。
   *
   * @param c 読み取りストリーム取得コンテキストです。
   *
   * @returns 読み取り用ストリームを解決します。
   */
  public async getReadable(
    c: IStorage.GetReadableContext,
  ): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
    throwIfAborted(c.signal);

    const token = this.#resolveToken(c);
    let url: string;

    try {
      ({ url } = await this.#client.head(this.#pathname(c.key), {
        token,
        abortSignal: c.signal,
      }));
    } catch (ex) {
      if (isBlobNotFound(ex)) {
        throw new KeyNotFoundError({ key: c.key });
      }

      throwIfAborted(c.signal);
      throw new BlobOperationError({
        key: c.key,
        cause: ex,
        operation: "head",
      });
    }

    const response = await this.#download(c, url, token);

    // ボディなし応答は空ストリームとして返します。
    if (response.body === null) {
      return new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(controller) {
          controller.close();
        },
      });
    }

    return response.body;
  }

  /**
   * 使用する `fetch` 実装を解決します。
   *
   * @returns 要求送信に使う実装です。
   */
  #resolveFetch(): IFetch {
    return this.#fetchImpl ?? globalThis.fetch;
  }

  /**
   * 送信トークンを三層優先度で解決します。
   *
   * 固有変数、共通変数、既定値の順に優先します。
   *
   * @param c パイプラインコンテキストです。
   *
   * @returns 解決したトークンです。未指定時は undefined です。
   */
  #resolveToken(c: Pick<IPipelineContext, "get">): string | undefined {
    const specificToken = assertTokenValue(c.get("@unikvs/vercel-blob:token"));
    const commonToken = assertTokenValue(c.get("@unikvs/fetch:token"));

    return specificToken ?? commonToken ?? this.#token;
  }

  /**
   * キーに対応する pathname を組み立てます。
   *
   * @param key 変換する論理キーです。
   *
   * @returns Blob 上の pathname です。
   */
  #pathname(key: string): string {
    return `${this.#keyPrefix}${key}`;
  }

  /**
   * ダウンロード要求を組み立てます。
   *
   * @param url 要求先の URL です。
   * @param token 送信に使うトークンです。
   * @param signal 中断を知らせるシグナルです。
   *
   * @returns 組み立てた要求です。
   */
  #downloadRequest(url: string, token: string | undefined, signal: AbortSignal): Request {
    const headers: Record<string, string> = {};

    if (token !== undefined) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    return new Request(url, {
      signal,
      headers,
    });
  }

  /**
   * URL からバイト列をダウンロードします。
   *
   * 失敗時は専用エラーに包んで投げます。
   *
   * @param c 読み取りや取得のコンテキストです。
   * @param url ダウンロード元の URL です。
   * @param token 送信に使うトークンです。
   *
   * @returns ダウンロードした応答です。
   */
  async #download(
    c: IStorage.ReadContext | IStorage.GetReadableContext,
    url: string,
    token: string | undefined,
  ): Promise<Response> {
    const fetchFn = this.#resolveFetch();
    let response: Response;

    try {
      response = await fetchFn(this.#downloadRequest(url, token, c.signal));
    } catch (ex) {
      throwIfAborted(c.signal);
      throw new BlobNetworkError({
        key: c.key,
        url,
        cause: ex,
      });
    }

    if (response.status === 404 || response.status === 410) {
      throw new KeyNotFoundError({ key: c.key });
    }

    if (!response.ok) {
      throw new BlobResponseError({
        key: c.key,
        url,
        status: response.status,
        statusText: response.statusText,
      });
    }

    return response;
  }
}
