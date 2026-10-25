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
 * `fetch` 実装の最小形状です。
 *
 * Blob URL からのダウンロードに使います。未指定のときは `globalThis.fetch` を使います。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
 */
export interface IFetch {
  (request: Request): Promise<Response>;
}

/**
 * Blob の公開範囲です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
 */
export type BlobAccess = "public" | "private";

/**
 * クライアントへ渡す操作の共通項目です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
 */
export interface BlobRequestOptions {
  /**
   * 操作に使うトークンです。
   *
   * 未指定のときは `BLOB_READ_WRITE_TOKEN` などの環境変数を使います。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly token?: string | undefined;

  /**
   * 操作の中断に使うシグナルです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly abortSignal?: AbortSignal | undefined;
}

/**
 * `put` へ渡す項目です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
 */
export interface BlobPutRequestOptions extends BlobRequestOptions {
  /**
   * Blob の公開範囲です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly access: BlobAccess;

  /**
   * Blob の内容形式です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly contentType?: string | undefined;
}

/**
 * `list` へ渡す項目です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
 */
export interface BlobListRequestOptions extends BlobRequestOptions {
  /**
   * 一致する pathname の接頭辞です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly prefix?: string | undefined;

  /**
   * 取得の再開位置です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly cursor?: string | undefined;
}

/**
 * `put` の結果の最小形状です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
 */
export interface BlobPutResult {
  /**
   * 保存した Blob の URL です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly url: string;

  /**
   * 保存した Blob の pathname です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly pathname: string;
}

/**
 * `head` の結果の最小形状です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
 */
export interface BlobHeadResult {
  /**
   * Blob の URL です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly url: string;

  /**
   * Blob の pathname です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly pathname: string;
}

/**
 * `list` の項目の最小形状です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
 */
export interface BlobListItem {
  /**
   * Blob の URL です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly url: string;

  /**
   * Blob の pathname です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly pathname: string;
}

/**
 * `list` の結果の最小形状です。
 *
 * `hasMore` が `true` のときは次の頁を取得する `cursor` を返します。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
 */
export interface BlobListResult {
  /**
   * 取得した Blob の一覧です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly blobs: readonly BlobListItem[];

  /**
   * 次の頁の再開位置です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly cursor?: string | undefined;

  /**
   * 残りの頁があるかどうかです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  readonly hasMore: boolean;
}

/**
 * Vercel Blob クライアントが満たすべき最小形状です。
 *
 * `@vercel/blob` の `put` / `head` / `del` / `list` はこの形状を満たすため、そのまま渡せます。
 * テストではネットワークを使わない疑似実装を渡します。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
 */
export interface BlobClientLike {
  /**
   * `pathname` にバイト列を保存します。
   */
  put(
    pathname: string,
    body: Uint8Array<ArrayBuffer>,
    options: BlobPutRequestOptions,
  ): Promise<BlobPutResult>;

  /**
   * `pathname` のメタ情報を取得します。存在しないときは拒否します。
   */
  head(pathname: string, options: BlobRequestOptions): Promise<BlobHeadResult>;

  /**
   * `pathname` の Blob を削除します。
   */
  del(pathname: string | readonly string[], options: BlobRequestOptions): Promise<void>;

  /**
   * Blob の一覧を頁単位で取得します。
   */
  list(options: BlobListRequestOptions): Promise<BlobListResult>;
}

/**
 * `VercelBlob` のコンストラクターオプションです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
 */
export type VercelBlobOptions = {
  /**
   * 操作に使うトークンです。
   *
   * 未指定のときは `BLOB_READ_WRITE_TOKEN` などの環境変数を使います。
   * コンテキスト変数 `@unikvs/vercel-blob:token` / `@unikvs/fetch:token` が優先されます。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob-token)
   */
  readonly token?: string | undefined;

  /**
   * 使用する Vercel Blob クライアントです。
   *
   * 未指定のときは `@vercel/blob` の関数を使います。
   * テストではネットワークを使わない疑似実装を渡します。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob-client)
   */
  readonly client?: BlobClientLike | undefined;

  /**
   * すべてのキーに付与する接頭辞です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob-key-prefix)
   */
  readonly keyPrefix?: string | undefined;

  /**
   * 保存する Blob の公開範囲です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob-access)
   */
  readonly access?: BlobAccess | undefined;

  /**
   * Blob URL からのダウンロードに使う `fetch` 実装です。
   *
   * 未指定のときは `globalThis.fetch` を使います。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob-fetch)
   */
  readonly fetch?: IFetch | undefined;
};

const DEFAULT_ACCESS: BlobAccess = "private";

// 既定のクライアントとして `@vercel/blob` の関数を使います。
// `undefined` の項目を取り除いて渡します。
// 実クライアントの型が `exactOptionalPropertyTypes` のもとで明示 `undefined` を拒否するためです。
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

// `token` 値が空でない文字列であることを検証します。
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

// `access` 値が公開範囲のどちらかであることを検証します。
function assertAccessValue(value: unknown): BlobAccess {
  if (value === undefined) {
    return DEFAULT_ACCESS;
  }

  if (value === "public" || value === "private") {
    return value;
  }

  throw new InvalidAccessError({ actual: value });
}

// 欠番を表す失敗かどうかを判定します。
// 実クライアントの `BlobNotFoundError` と疑似実装の同名・同状態の失敗に対応します。
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
 * Vercel Blob にバイト列を保存するストレージです。
 *
 * キーを `${keyPrefix}${key}` の pathname に変換し、`put` / `head` / `del` / `list` します。
 * 読み取りは `head` で解決した URL を `fetch` でダウンロードします。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
 */
export default class VercelBlob implements IStorage<Uint8Array<ArrayBuffer>> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-blob#vercel-blob)
   */
  public readonly name: string;

  // 使用する Vercel Blob クライアントです。
  readonly #client: BlobClientLike;

  // すべてのキーに付与する接頭辞です。
  readonly #keyPrefix: string;

  // 保存する Blob の公開範囲です。
  readonly #access: BlobAccess;

  // 既定のトークンです。
  readonly #token: string | undefined;

  // ダウンロードに使う `fetch` 実装です。
  readonly #fetchImpl: IFetch | undefined;

  /**
   * Vercel Blob にバイト列を保存するストレージです。
   *
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

  // 使用する `fetch` 実装を解決します。
  #resolveFetch(): IFetch {
    return this.#fetchImpl ?? globalThis.fetch;
  }

  // 送信トークンを三層優先度で解決します。
  #resolveToken(c: Pick<IPipelineContext, "get">): string | undefined {
    const specificToken = assertTokenValue(c.get("@unikvs/vercel-blob:token"));
    const commonToken = assertTokenValue(c.get("@unikvs/fetch:token"));

    return specificToken ?? commonToken ?? this.#token;
  }

  // キーに対応する pathname を組み立てます。
  #pathname(key: string): string {
    return `${this.#keyPrefix}${key}`;
  }

  // ダウンロード要求を組み立てます。
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

  // URL からバイト列をダウンロードします。
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

  public get isOpen(): boolean {
    return true;
  }

  public async open(c: IStorage.OpenContext): Promise<void> {
    throwIfAborted(c.signal);
  }

  public async close(c: IStorage.CloseContext): Promise<void> {
    throwIfAborted(c.signal);
  }

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
}
