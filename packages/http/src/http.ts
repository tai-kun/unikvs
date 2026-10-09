import {
  KeyNotFoundError,
  RepairNotAllowedError,
  type IStorage,
  type Variables,
} from "@unikvs/core";

import {
  ClearNotSupportedError,
  ClearWithoutPrefixNotAllowedError,
  HttpNetworkError,
  HttpResponseError,
  InvalidBaseUrlError,
  InvalidChunkTypeError,
  InvalidHeadersError,
  InvalidKeyError,
  InvalidTokenError,
} from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#usage)
 */
export interface IFetch {
  (request: Request): Promise<Response>;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#usage)
 */
export type HttpOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#usage)
   */
  readonly keyPrefix?: string | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#usage)
   */
  readonly allowRepair?: boolean | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#usage)
   */
  readonly allowClearWithoutPrefix?: boolean | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#usage)
   */
  readonly fetch?: IFetch | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#usage)
   */
  readonly headers?: Record<string, string> | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#usage)
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
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "string" && value !== "") {
    return value;
  }

  throw new InvalidTokenError({ actual: value });
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/http#usage)
 */
export default class Http implements IStorage {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#usage)
   */
  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#usage)
   */
  public readonly allowRepair: boolean;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#usage)
   */
  public readonly allowClearWithoutPrefix: boolean;

  // 正規化済みのベース URL です。
  // 末尾の `/` を除去しています。
  private readonly baseUrl: string;

  // すべてのキーに付与する接頭辞です。
  private readonly keyPrefix: string;

  // 注入された `fetch` 実装です。
  // 未指定の場合は `globalThis.fetch` を使います。
  private readonly fetchImpl: IFetch | undefined;

  // 既定のリクエストヘッダー群です。
  private readonly baseHeaders: Record<string, string>;

  // 既定のベアラートークンです。
  private readonly baseToken: string | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#usage)
   */
  public constructor(baseUrl: string, options: HttpOptions = {}) {
    const {
      keyPrefix = "unikvs:",
      allowRepair = false,
      allowClearWithoutPrefix = false,
      fetch,
      headers,
      token,
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
    const normalized = baseUrl.replace(/\/+$/, "");

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
    this.baseUrl = normalized;
    this.keyPrefix = keyPrefix;
    this.allowRepair = allowRepair;
    this.allowClearWithoutPrefix = allowClearWithoutPrefix;
    this.fetchImpl = fetch;
    this.baseHeaders = headers === undefined ? {} : assertHeadersRecord(headers);
    this.baseToken = assertTokenValue(token);
  }

  // 書き戻しが許可されていることを検証します。
  private assertRepairAllowed(args: { readonly vars: Variables }): void {
    if (args.vars["unikvs:repair"] === true && !this.allowRepair) {
      throw new RepairNotAllowedError({ name: this.name });
    }
  }

  // 使用する `fetch` 実装を解決します。
  private resolveFetch(): IFetch {
    return this.fetchImpl ?? globalThis.fetch;
  }

  // 送信ヘッダーを三層優先度で解決します。
  private resolveHeaders(vars: Variables): Record<string, string> {
    const headers: Record<string, string> = { ...this.baseHeaders };
    const commonHeaders = vars["@unikvs/fetch:headers"];

    if (commonHeaders !== undefined) {
      Object.assign(headers, assertHeadersRecord(commonHeaders));
    }

    const specificHeaders = vars["@unikvs/http:headers"];

    if (specificHeaders !== undefined) {
      Object.assign(headers, assertHeadersRecord(specificHeaders));
    }

    const commonToken = assertTokenValue(vars["@unikvs/fetch:token"]);
    const specificToken = assertTokenValue(vars["@unikvs/http:token"]);
    const token = specificToken ?? commonToken ?? this.baseToken;

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
  private keyUrl(key: string): string {
    let segment: string;

    try {
      segment = encodeURIComponent(`${this.keyPrefix}${key}`).replaceAll(".", "%2E");
    } catch (ex) {
      throw new InvalidKeyError({ key, cause: ex });
    }

    return `${this.baseUrl}/${segment}`;
  }

  // `clear` 用の完全 URL を組み立てます。
  // 符号化に失敗した場合は `InvalidKeyError` を投げます。
  private clearUrl(): string {
    let encoded: string;

    try {
      encoded = encodeURIComponent(this.keyPrefix);
    } catch (ex) {
      throw new InvalidKeyError({ key: this.keyPrefix, cause: ex });
    }

    return `${this.baseUrl}/?prefix=${encoded}`;
  }

  // 中断済みなら中断例外を再送出します。
  // `fetch` の `catch` 直後に呼びます。
  private static rethrowIfAborted(signal: AbortSignal): void {
    signal.throwIfAborted();
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#usage)
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#usage)
   */
  public async open(args: Pick<IStorage.OpenArgs, "signal">): Promise<void> {
    const { signal } = args;

    signal.throwIfAborted();
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#usage)
   */
  public async close(args: Pick<IStorage.CloseArgs, "signal">): Promise<void> {
    const { signal } = args;

    signal.throwIfAborted();
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#usage)
   */
  public async write(
    args: Pick<IStorage.WriteArgs<Uint8Array<ArrayBuffer>>, "key" | "data" | "signal" | "vars">,
  ): Promise<void> {
    const { key, data, signal, vars } = args;

    signal.throwIfAborted();
    this.assertRepairAllowed(args);

    const headers = this.resolveHeaders(vars);
    const url = this.keyUrl(key);
    const fetchFn = this.resolveFetch();
    let response: Response;

    try {
      response = await fetchFn(
        new Request(url, {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/octet-stream" },
          body: data,
          signal,
        }),
      );
    } catch (ex) {
      Http.rethrowIfAborted(signal);
      throw new HttpNetworkError({ method: "PUT", url, key, cause: ex });
    }

    if (!response.ok) {
      throw new HttpResponseError({
        method: "PUT",
        url,
        key,
        status: response.status,
        statusText: response.statusText,
      });
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#usage)
   */
  public async read(
    args: Pick<IStorage.ReadArgs, "key" | "signal" | "vars">,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const { key, signal, vars } = args;

    signal.throwIfAborted();

    const headers = this.resolveHeaders(vars);
    const url = this.keyUrl(key);
    const fetchFn = this.resolveFetch();
    let response: Response;

    try {
      response = await fetchFn(new Request(url, { method: "GET", headers, signal }));
    } catch (ex) {
      Http.rethrowIfAborted(signal);
      throw new HttpNetworkError({ method: "GET", url, key, cause: ex });
    }

    if (response.status === 404 || response.status === 410) {
      throw new KeyNotFoundError({ key });
    }

    if (!response.ok) {
      throw new HttpResponseError({
        method: "GET",
        url,
        key,
        status: response.status,
        statusText: response.statusText,
      });
    }

    const buffer = await response.arrayBuffer();

    return new Uint8Array(buffer);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#usage)
   */
  public async exists(
    args: Pick<IStorage.ExistsArgs, "key" | "signal" | "vars">,
  ): Promise<boolean> {
    const { key, signal, vars } = args;

    signal.throwIfAborted();

    const headers = this.resolveHeaders(vars);
    const url = this.keyUrl(key);
    const fetchFn = this.resolveFetch();
    let headResponse: Response;

    try {
      headResponse = await fetchFn(new Request(url, { method: "HEAD", headers, signal }));
    } catch (ex) {
      Http.rethrowIfAborted(signal);
      throw new HttpNetworkError({ method: "HEAD", url, key, cause: ex });
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
        method: "HEAD",
        url,
        key,
        status: headResponse.status,
        statusText: headResponse.statusText,
      });
    }

    let getResponse: Response;

    try {
      getResponse = await fetchFn(
        new Request(url, {
          method: "GET",
          headers: { ...headers, Range: "bytes=0-0" },
          signal,
        }),
      );
    } catch (ex) {
      Http.rethrowIfAborted(signal);
      throw new HttpNetworkError({ method: "GET", url, key, cause: ex });
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
      method: "GET",
      url,
      key,
      status: getResponse.status,
      statusText: getResponse.statusText,
    });
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#usage)
   */
  public async delete(args: Pick<IStorage.DeleteArgs, "key" | "signal" | "vars">): Promise<void> {
    const { key, signal, vars } = args;

    signal.throwIfAborted();

    const headers = this.resolveHeaders(vars);
    const url = this.keyUrl(key);
    const fetchFn = this.resolveFetch();
    let response: Response;

    try {
      response = await fetchFn(new Request(url, { method: "DELETE", headers, signal }));
    } catch (ex) {
      Http.rethrowIfAborted(signal);
      throw new HttpNetworkError({ method: "DELETE", url, key, cause: ex });
    }

    // 削除は冪等とし存在しないキーも成功扱いにします。
    if (response.status === 404 || response.status === 410) {
      return;
    }

    if (!response.ok) {
      throw new HttpResponseError({
        method: "DELETE",
        url,
        key,
        status: response.status,
        statusText: response.statusText,
      });
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#usage)
   */
  public async clear(args: Pick<IStorage.ClearArgs, "signal" | "vars">): Promise<void> {
    const { signal, vars } = args;

    // 空 prefix での無条件全削除の事故を防ぐため送信前に拒否します。
    if (this.keyPrefix === "" && !this.allowClearWithoutPrefix) {
      throw new ClearWithoutPrefixNotAllowedError();
    }

    signal.throwIfAborted();

    const headers = this.resolveHeaders(vars);
    const url = this.clearUrl();
    const fetchFn = this.resolveFetch();
    let response: Response;

    try {
      response = await fetchFn(new Request(url, { method: "DELETE", headers, signal }));
    } catch (ex) {
      Http.rethrowIfAborted(signal);
      throw new HttpNetworkError({ method: "DELETE", url, key: undefined, cause: ex });
    }

    if (response.ok) {
      return;
    }

    // 未対応応答は恒久失敗として専用エラーにします。
    if (response.status === 404 || response.status === 405 || response.status === 501) {
      throw new ClearNotSupportedError({ prefix: this.keyPrefix, status: response.status });
    }

    throw new HttpResponseError({
      method: "DELETE",
      url,
      key: undefined,
      status: response.status,
      statusText: response.statusText,
    });
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#streams)
   */
  public getWritable(
    args: Pick<IStorage.GetWritableArgs, "key" | "signal" | "vars">,
  ): WritableStream<Uint8Array<ArrayBuffer>> {
    const { key, signal, vars } = args;

    signal.throwIfAborted();
    this.assertRepairAllowed(args);

    const headers = this.resolveHeaders(vars);
    const url = this.keyUrl(key);
    const fetchFn = this.resolveFetch();
    // サーバー側にストリーミング `PUT` を要求しないよう蓄積して `close` 時に一括送信します。
    const chunks: Uint8Array[] = [];

    return new WritableStream<Uint8Array<ArrayBuffer>>({
      write(chunk) {
        if (!(chunk instanceof Uint8Array)) {
          throw new InvalidChunkTypeError({ key, chunk });
        }

        chunks.push(chunk.slice());
      },
      close: async () => {
        signal.throwIfAborted();

        const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
        const merged = new Uint8Array(totalLength);
        let offset = 0;

        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.byteLength;
        }

        let response: Response;

        try {
          response = await fetchFn(
            new Request(url, {
              method: "PUT",
              headers: { ...headers, "Content-Type": "application/octet-stream" },
              body: merged,
              signal,
            }),
          );
        } catch (ex) {
          Http.rethrowIfAborted(signal);
          throw new HttpNetworkError({ method: "PUT", url, key, cause: ex });
        }

        if (!response.ok) {
          throw new HttpResponseError({
            method: "PUT",
            url,
            key,
            status: response.status,
            statusText: response.statusText,
          });
        }
      },
      abort() {
        chunks.length = 0;
      },
    });
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/http#streams)
   */
  public async getReadable(
    args: Pick<IStorage.GetReadableArgs, "key" | "signal" | "vars">,
  ): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
    const { key, signal, vars } = args;

    signal.throwIfAborted();

    const headers = this.resolveHeaders(vars);
    const url = this.keyUrl(key);
    const fetchFn = this.resolveFetch();
    let response: Response;

    try {
      response = await fetchFn(new Request(url, { method: "GET", headers, signal }));
    } catch (ex) {
      Http.rethrowIfAborted(signal);
      throw new HttpNetworkError({ method: "GET", url, key, cause: ex });
    }

    if (response.status === 404 || response.status === 410) {
      throw new KeyNotFoundError({ key });
    }

    if (!response.ok) {
      throw new HttpResponseError({
        method: "GET",
        url,
        key,
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
}
