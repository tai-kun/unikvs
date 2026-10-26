import { type IStorage, type IPipelineContext, KeyNotFoundError } from "@unikvs/core";

import {
  InvalidKeyError,
  HttpNetworkError,
  HttpResponseError,
  InvalidTokenError,
  InvalidBaseUrlError,
  InvalidHeadersError,
  InvalidChunkTypeError,
  ClearNotSupportedError,
  ClearWithoutPrefixNotAllowedError,
} from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#fetch)
 */
export interface IFetch {
  (request: Request): Promise<Response>;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#usage)
 */
export type HttpOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#key-prefix)
   */
  readonly keyPrefix?: string | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#allow-clear-without-prefix)
   */
  readonly allowClearWithoutPrefix?: boolean | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#fetch)
   */
  readonly fetch?: IFetch | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#headers)
   */
  readonly headers?: Record<string, string> | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#token)
   */
  readonly token?: string | undefined;
};

// `headers` 値が文字列のみのレコードであることを検証します。
function assertHeadersRecord(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidHeadersError({ actual: value });
  }

  const result: Record<string, string> = {};

  for (const [name, headerValue] of Object.entries(value)) {
    if (typeof headerValue !== "string") {
      throw new InvalidHeadersError({ actual: value });
    }

    result[name] = headerValue;
  }

  return result;
}

// `token` 値が空でない文字列であることを検証します。
function assertTokenValue(value: unknown): string | undefined {
  let result: string | undefined;

  if (value === undefined) {
    result = undefined;
  } else if (typeof value === "string" && value !== "") {
    result = value;
  } else {
    throw new InvalidTokenError({ actual: value });
  }

  return result;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#usage)
 */
export default class Http implements IStorage {
  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#allow-clear-without-prefix)
   */
  public readonly allowClearWithoutPrefix: boolean;

  // 正規化済みのベース URL です。
  // 末尾の `/` を除去しています。
  readonly #baseUrl: string;

  // すべてのキーに付与する接頭辞です。
  readonly #keyPrefix: string;

  // 注入された `fetch` 実装です。
  // 未指定の場合は `globalThis.fetch` を使います。
  readonly #fetchImpl: IFetch | undefined;

  // 既定のリクエストヘッダー群です。
  readonly #baseHeaders: Record<string, string>;

  // 既定のベアラートークンです。
  readonly #baseToken: string | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#usage)
   */
  public constructor(baseUrl: string, options: HttpOptions = {}) {
    const {
      fetch,
      token,
      headers,
      keyPrefix = "unikvs:",
      allowClearWithoutPrefix = false,
    } = options;

    // 非 `string` 入力は `TypeError` ではなく個別エラーで拒否します。
    if (typeof baseUrl !== "string") {
      throw new InvalidBaseUrlError({ actual: baseUrl });
    }

    // 沈黙 `trim` は正規化の予測不能を生むため前後空白は拒否します。
    if (baseUrl !== baseUrl.trim()) {
      throw new InvalidBaseUrlError({ actual: baseUrl });
    }

    // 空文字は正規のベース URL ではありません。
    if (baseUrl === "") {
      throw new InvalidBaseUrlError({ actual: baseUrl });
    }

    // 末尾の `/` を除去して正規化します。
    const normalized = baseUrl.replace(/\/+$/u, "");

    // 除去後に空文字になる入力は拒否します。
    if (normalized === "") {
      throw new InvalidBaseUrlError({ actual: baseUrl });
    }

    // 相対 URL はパース失敗として拒否します。
    let parsed: URL;

    try {
      parsed = new URL(normalized);
    } catch {
      throw new InvalidBaseUrlError({ actual: baseUrl });
    }

    // query / fragment 付きは `clear` の組み立てと衝突するため拒否します。
    if (parsed.search !== "" || parsed.hash !== "") {
      throw new InvalidBaseUrlError({ actual: baseUrl });
    }

    this.name = "Http";
    this.#baseUrl = normalized;
    this.#keyPrefix = keyPrefix;
    this.allowClearWithoutPrefix = allowClearWithoutPrefix;
    this.#fetchImpl = fetch;
    this.#baseHeaders = headers === undefined ? {} : assertHeadersRecord(headers);
    this.#baseToken = assertTokenValue(token);
  }

  // 中断済みなら中断例外を再送出します。
  // `fetch` の `catch` 直後に呼びます。
  static #rethrowIfAborted(signal: AbortSignal): void {
    signal.throwIfAborted();
  }

  public get isOpen(): boolean {
    return true;
  }

  public async open(c: IStorage.OpenContext): Promise<void> {
    c.signal.throwIfAborted();
    await Promise.resolve();
  }

  public async close(c: IStorage.CloseContext): Promise<void> {
    c.signal.throwIfAborted();
    await Promise.resolve();
  }

  public async write(c: IStorage.WriteContext, data: Uint8Array<ArrayBuffer>): Promise<void> {
    c.signal.throwIfAborted();

    const headers = this.#resolveHeaders(c);
    const url = this.#keyUrl(c.key);
    const fetchFn = this.#resolveFetch();
    let response: Response;

    try {
      response = await fetchFn(
        new Request(url, {
          body: data,
          method: "PUT",
          signal: c.signal,
          headers: {
            ...headers,
            "Content-Type": "application/octet-stream",
          },
        }),
      );
    } catch (ex) {
      Http.#rethrowIfAborted(c.signal);
      throw new HttpNetworkError({
        key: c.key,
        url,
        cause: ex,
        method: "PUT",
      });
    }

    if (!response.ok) {
      throw new HttpResponseError({
        key: c.key,
        url,
        method: "PUT",
        status: response.status,
        statusText: response.statusText,
      });
    }
  }

  public async read(c: IStorage.ReadContext): Promise<Uint8Array<ArrayBuffer>> {
    c.signal.throwIfAborted();

    const headers = this.#resolveHeaders(c);
    const url = this.#keyUrl(c.key);
    const fetchFn = this.#resolveFetch();
    let response: Response;

    try {
      response = await fetchFn(
        new Request(url, {
          method: "GET",
          signal: c.signal,
          headers,
        }),
      );
    } catch (ex) {
      Http.#rethrowIfAborted(c.signal);
      throw new HttpNetworkError({
        key: c.key,
        url,
        cause: ex,
        method: "GET",
      });
    }

    if (response.status === 404 || response.status === 410) {
      throw new KeyNotFoundError({ key: c.key });
    }

    if (!response.ok) {
      throw new HttpResponseError({
        key: c.key,
        url,
        method: "GET",
        status: response.status,
        statusText: response.statusText,
      });
    }

    const buffer = await response.arrayBuffer();

    return new Uint8Array(buffer);
  }

  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    c.signal.throwIfAborted();

    const headers = this.#resolveHeaders(c);
    const url = this.#keyUrl(c.key);
    const fetchFn = this.#resolveFetch();
    let headResponse: Response;

    try {
      headResponse = await fetchFn(
        new Request(url, {
          method: "HEAD",
          signal: c.signal,
          headers,
        }),
      );
    } catch (ex) {
      Http.#rethrowIfAborted(c.signal);
      throw new HttpNetworkError({
        key: c.key,
        url,
        cause: ex,
        method: "HEAD",
      });
    }

    if (headResponse.status === 404 || headResponse.status === 410) {
      return false;
    }

    if (headResponse.ok) {
      return true;
    }

    // `HEAD` 未対応サーバー向けに `GET` でフォールバックします。
    if (headResponse.status !== 405 && headResponse.status !== 501) {
      throw new HttpResponseError({
        key: c.key,
        url,
        method: "HEAD",
        status: headResponse.status,
        statusText: headResponse.statusText,
      });
    }

    let getResponse: Response;

    try {
      getResponse = await fetchFn(
        new Request(url, {
          method: "GET",
          signal: c.signal,
          headers: {
            ...headers,
            Range: "bytes=0-0",
          },
        }),
      );
    } catch (ex) {
      Http.#rethrowIfAborted(c.signal);
      throw new HttpNetworkError({
        key: c.key,
        url,
        cause: ex,
        method: "GET",
      });
    }

    // ボディを消費せず破棄します。
    // 判定・送出の前に破棄を待ちます。
    if (getResponse.status === 404 || getResponse.status === 410) {
      await getResponse.body?.cancel();

      return false;
    }

    if (getResponse.ok) {
      await getResponse.body?.cancel();

      return true;
    }

    await getResponse.body?.cancel();

    throw new HttpResponseError({
      key: c.key,
      url,
      method: "GET",
      status: getResponse.status,
      statusText: getResponse.statusText,
    });
  }

  public async delete(c: IStorage.DeleteContext): Promise<void> {
    c.signal.throwIfAborted();

    const headers = this.#resolveHeaders(c);
    const url = this.#keyUrl(c.key);
    const fetchFn = this.#resolveFetch();
    let response: Response;

    try {
      response = await fetchFn(
        new Request(url, {
          method: "DELETE",
          signal: c.signal,
          headers,
        }),
      );
    } catch (ex) {
      Http.#rethrowIfAborted(c.signal);
      throw new HttpNetworkError({
        key: c.key,
        url,
        cause: ex,
        method: "DELETE",
      });
    }

    // 削除は冪等とし存在しないキーも成功扱いにします。
    if (response.status === 404 || response.status === 410) {
      return;
    }

    if (!response.ok) {
      throw new HttpResponseError({
        key: c.key,
        url,
        method: "DELETE",
        status: response.status,
        statusText: response.statusText,
      });
    }
  }

  public async clear(c: IStorage.ClearContext): Promise<void> {
    // 空 prefix での無条件全削除の事故を防ぐため送信前に拒否します。
    if (this.#keyPrefix === "" && !this.allowClearWithoutPrefix) {
      throw new ClearWithoutPrefixNotAllowedError();
    }

    c.signal.throwIfAborted();

    const headers = this.#resolveHeaders(c);
    const url = this.#clearUrl();
    const fetchFn = this.#resolveFetch();
    let response: Response;

    try {
      response = await fetchFn(
        new Request(url, {
          method: "DELETE",
          signal: c.signal,
          headers,
        }),
      );
    } catch (ex) {
      Http.#rethrowIfAborted(c.signal);
      throw new HttpNetworkError({
        key: undefined,
        url,
        cause: ex,
        method: "DELETE",
      });
    }

    if (response.ok) {
      return;
    }

    // 未対応応答は恒久失敗として専用エラーにします。
    if (response.status === 404 || response.status === 405 || response.status === 501) {
      throw new ClearNotSupportedError({
        prefix: this.#keyPrefix,
        status: response.status,
      });
    }

    throw new HttpResponseError({
      key: undefined,
      url,
      method: "DELETE",
      status: response.status,
      statusText: response.statusText,
    });
  }

  public getWritable(c: IStorage.GetWritableContext): WritableStream<Uint8Array<ArrayBuffer>> {
    c.signal.throwIfAborted();

    const headers = this.#resolveHeaders(c);
    const url = this.#keyUrl(c.key);
    const fetchFn = this.#resolveFetch();
    // サーバー側にストリーミング `PUT` を要求しないよう蓄積して `close` 時に一括送信します。
    const chunks: Uint8Array[] = [];

    return new WritableStream<Uint8Array<ArrayBuffer>>({
      abort() {
        chunks.length = 0;
      },
      close: async () => {
        c.signal.throwIfAborted();

        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const merged = new Uint8Array(totalLength);
        let offset = 0;

        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.byteLength;
        }

        let response: Response;

        try {
          response = await fetchFn(
            new Request(url, {
              body: merged,
              method: "PUT",
              signal: c.signal,
              headers: {
                ...headers,
                "Content-Type": "application/octet-stream",
              },
            }),
          );
        } catch (ex) {
          Http.#rethrowIfAborted(c.signal);
          throw new HttpNetworkError({
            key: c.key,
            url,
            cause: ex,
            method: "PUT",
          });
        }

        if (!response.ok) {
          throw new HttpResponseError({
            key: c.key,
            url,
            method: "PUT",
            status: response.status,
            statusText: response.statusText,
          });
        }
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
    c.signal.throwIfAborted();

    const headers = this.#resolveHeaders(c);
    const url = this.#keyUrl(c.key);
    const fetchFn = this.#resolveFetch();
    let response: Response;

    try {
      response = await fetchFn(
        new Request(url, {
          method: "GET",
          signal: c.signal,
          headers,
        }),
      );
    } catch (ex) {
      Http.#rethrowIfAborted(c.signal);
      throw new HttpNetworkError({
        key: c.key,
        url,
        cause: ex,
        method: "GET",
      });
    }

    if (response.status === 404 || response.status === 410) {
      throw new KeyNotFoundError({ key: c.key });
    }

    if (!response.ok) {
      throw new HttpResponseError({
        key: c.key,
        url,
        method: "GET",
        status: response.status,
        statusText: response.statusText,
      });
    }

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

  // 使用する `fetch` 実装を解決します。
  #resolveFetch(): IFetch {
    return this.#fetchImpl ?? globalThis.fetch;
  }

  // 送信ヘッダーを三層優先度で解決します。
  #resolveHeaders(c: Pick<IPipelineContext, "get">): Record<string, string> {
    const headers: Record<string, string> = { ...this.#baseHeaders };
    const commonHeaders = c.get("@unikvs/fetch:headers");

    if (commonHeaders !== undefined) {
      Object.assign(headers, assertHeadersRecord(commonHeaders));
    }

    const specificHeaders = c.get("@unikvs/http:headers");

    if (specificHeaders !== undefined) {
      Object.assign(headers, assertHeadersRecord(specificHeaders));
    }

    const commonToken = assertTokenValue(c.get("@unikvs/fetch:token"));
    const specificToken = assertTokenValue(c.get("@unikvs/http:token"));
    const token = specificToken ?? commonToken ?? this.#baseToken;

    if (token !== undefined) {
      let hasAuthorization = false;

      for (const name of Object.keys(headers)) {
        if (name.toLowerCase() === "authorization") {
          hasAuthorization = true;
          break;
        }
      }

      if (!hasAuthorization) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    }

    return headers;
  }

  // キーに対応する完全 URL を組み立てます。
  // 符号化に失敗した場合は `InvalidKeyError` を投げます。
  #keyUrl(key: string): string {
    let segment: string;

    try {
      segment = encodeURIComponent(`${this.#keyPrefix}${key}`).replaceAll(".", "%2E");
    } catch (ex) {
      throw new InvalidKeyError({
        key,
        cause: ex,
      });
    }

    return `${this.#baseUrl}/${segment}`;
  }

  // `clear` 用の完全 URL を組み立てます。
  // 符号化に失敗した場合は `InvalidKeyError` を投げます。
  #clearUrl(): string {
    let encoded: string;

    try {
      encoded = encodeURIComponent(this.#keyPrefix);
    } catch (ex) {
      throw new InvalidKeyError({
        key: this.#keyPrefix,
        cause: ex,
      });
    }

    return `${this.#baseUrl}/?prefix=${encoded}`;
  }
}
