import { KeyNotFoundError, type IStorage } from "@unikvs/core";
import { throwIfAborted } from "abort-signal-utils";

import { CookieNotAvailableError, CookieTooLargeError } from "./errors.js";

/**
 * Cookie の `SameSite` 属性です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#usage)
 */
export type CookieSameSite = "Strict" | "Lax" | "None";

/**
 * 書き込む Cookie に付与する属性です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#usage)
 */
export type CookieAttributes = {
  /**
   * Cookie を送信するパスです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#usage)
   */
  readonly path?: string | undefined;

  /**
   * Cookie を送信するドメインです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#usage)
   */
  readonly domain?: string | undefined;

  /**
   * HTTPS 接続時のみ Cookie を送信するかどうかです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#usage)
   */
  readonly secure?: boolean | undefined;

  /**
   * クロスサイト送信時の `SameSite` 属性です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#usage)
   */
  readonly sameSite?: CookieSameSite | undefined;

  /**
   * Cookie の有効期限 (秒) です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#usage)
   */
  readonly maxAge?: number | undefined;
};

/**
 * `Cookies` が使う Cookie ストアの最小インターフェースです。
 *
 * 既定では `document.cookie` を使いますが、この形を満たす実装を
 * `store` オプションに渡して差し替えることもできます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#usage)
 */
export interface CookieStoreLike {
  get(name: string): string | undefined;

  set(name: string, value: string, attributes: CookieAttributes): void;

  delete(name: string, attributes: CookieAttributes): void;

  keys(): Iterable<string>;
}

/**
 * `Cookies` のコンストラクターオプションです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#usage)
 */
export type CookiesOptions = {
  /**
   * すべての Cookie に付与する属性です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#usage)
   */
  readonly cookieAttributes?: CookieAttributes | undefined;

  /**
   * 1 つの値の最大サイズ (バイト) です。既定値は 4096 です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#usage)
   */
  readonly sizeLimitBytes?: number | undefined;

  /**
   * Cookie の読み書きに使うストアです。
   *
   * 未指定のときは `document.cookie` を使います。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#usage)
   */
  readonly store?: CookieStoreLike | undefined;
};

const DEFAULT_SIZE_LIMIT_BYTES = 4096;

const STRING_MARKER = "s:";

const BINARY_MARKER = "b:";

const textEncoder = new TextEncoder();

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function decodeBase64(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function parseDocumentCookies(cookie: string): Map<string, string> {
  const entries = new Map<string, string>();

  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const name = part.slice(0, separator).trim();

    if (name === "" || entries.has(name)) {
      continue;
    }

    entries.set(name, part.slice(separator + 1).trim());
  }

  return entries;
}

function serializeSetCookie(name: string, value: string, attributes: CookieAttributes): string {
  let serialized = `${name}=${value}`;

  if (attributes.path !== undefined) {
    serialized += `; Path=${attributes.path}`;
  }

  if (attributes.domain !== undefined) {
    serialized += `; Domain=${attributes.domain}`;
  }

  if (attributes.maxAge !== undefined) {
    serialized += `; Max-Age=${attributes.maxAge}`;
  }

  if (attributes.secure === true) {
    serialized += "; Secure";
  }

  if (attributes.sameSite !== undefined) {
    serialized += `; SameSite=${attributes.sameSite}`;
  }

  return serialized;
}

type DocumentLike = {
  cookie: string;
};

class DocumentCookieStore implements CookieStoreLike {
  readonly #document: DocumentLike;

  public constructor(document: DocumentLike) {
    this.#document = document;
  }

  public get(name: string): string | undefined {
    return parseDocumentCookies(this.#document.cookie).get(name);
  }

  public set(name: string, value: string, attributes: CookieAttributes): void {
    this.#document.cookie = serializeSetCookie(name, value, attributes);
  }

  public delete(name: string, attributes: CookieAttributes): void {
    this.#document.cookie = serializeSetCookie(name, "", { ...attributes, maxAge: 0 });
  }

  public keys(): Iterable<string> {
    return parseDocumentCookies(this.#document.cookie).keys();
  }
}

/**
 * Cookie をバックエンドに使うストレージです。
 *
 * 文字列とバイト列を Cookie に保存できる形へ変換します。
 * バイト列は Base64、キーと値は URL エンコードして保存します。
 * `document.cookie` が使えない環境では `store` オプションでストアを注入してください。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#usage)
 */
export default class Cookies implements IStorage<string | Uint8Array, string | Uint8Array> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#usage)
   */
  public readonly name: string;

  /**
   * 1 つの値の最大サイズ (バイト) です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#usage)
   */
  public readonly sizeLimitBytes: number;

  readonly #injectedStore: CookieStoreLike | undefined;

  readonly #cookieAttributes: CookieAttributes;

  /**
   * Cookie をバックエンドに使うストレージを作成します。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#usage)
   */
  public constructor(options: CookiesOptions = {}) {
    const { cookieAttributes = {}, sizeLimitBytes = DEFAULT_SIZE_LIMIT_BYTES, store } = options;
    this.name = "Cookies";
    this.sizeLimitBytes = sizeLimitBytes;
    this.#injectedStore = store;
    this.#cookieAttributes = cookieAttributes;
  }

  #backend(): CookieStoreLike {
    if (this.#injectedStore !== undefined) {
      return this.#injectedStore;
    }

    const document = (globalThis as { document?: DocumentLike | undefined }).document;

    if (document !== undefined && typeof document.cookie === "string") {
      return new DocumentCookieStore(document);
    }

    throw new CookieNotAvailableError();
  }

  #toRealKey(key: string): string {
    return encodeURIComponent(key);
  }

  #encode(data: string | Uint8Array): { readonly payload: string; readonly rawSize: number } {
    if (typeof data === "string") {
      return { payload: `${STRING_MARKER}${data}`, rawSize: textEncoder.encode(data).length };
    }

    return { payload: `${BINARY_MARKER}${encodeBase64(data)}`, rawSize: data.byteLength };
  }

  #decode(payload: string): string | Uint8Array {
    if (payload.startsWith(BINARY_MARKER)) {
      return decodeBase64(payload.slice(BINARY_MARKER.length));
    }

    if (payload.startsWith(STRING_MARKER)) {
      return payload.slice(STRING_MARKER.length);
    }

    return payload;
  }

  public get isOpen(): boolean {
    return true;
  }

  public open(c: IStorage.OpenContext): void {
    throwIfAborted(c.signal);
    this.#backend();
  }

  public close(c: IStorage.CloseContext): void {
    throwIfAborted(c.signal);
  }

  public write(c: IStorage.WriteContext, data: string | Uint8Array): void {
    throwIfAborted(c.signal);

    const { payload, rawSize } = this.#encode(data);

    if (rawSize > this.sizeLimitBytes) {
      throw new CookieTooLargeError({ key: c.key, actual: rawSize, limit: this.sizeLimitBytes });
    }

    this.#backend().set(
      this.#toRealKey(c.key),
      encodeURIComponent(payload),
      this.#cookieAttributes,
    );
  }

  public read(c: IStorage.ReadContext): string | Uint8Array {
    throwIfAborted(c.signal);

    const found = this.#backend().get(this.#toRealKey(c.key));

    if (found === undefined) {
      throw new KeyNotFoundError({ key: c.key });
    }

    return this.#decode(decodeURIComponent(found));
  }

  public exists(c: IStorage.ExistsContext): boolean {
    throwIfAborted(c.signal);

    return this.#backend().get(this.#toRealKey(c.key)) !== undefined;
  }

  public delete(c: IStorage.DeleteContext): void {
    throwIfAborted(c.signal);

    const backend = this.#backend();
    const realKey = this.#toRealKey(c.key);

    if (backend.get(realKey) === undefined) {
      throw new KeyNotFoundError({ key: c.key });
    }

    backend.delete(realKey, this.#cookieAttributes);
  }

  public clear(c: IStorage.ClearContext): void {
    throwIfAborted(c.signal);

    const backend = this.#backend();
    const targets = [...backend.keys()];

    for (const target of targets) {
      throwIfAborted(c.signal);
      backend.delete(target, this.#cookieAttributes);
    }
  }
}
