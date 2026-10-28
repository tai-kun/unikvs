import { type IStorage, KeyNotFoundError } from "@unikvs/core";
import { throwIfAborted } from "abort-signal-utils";

import { CookieTooLargeError, CookieNotAvailableError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#cookies)
 */
export type CookieSameSite = "Strict" | "Lax" | "None";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#cookies)
 */
export type CookieAttributes = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#cookies)
   */
  readonly path?: string | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#cookies)
   */
  readonly domain?: string | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#cookies)
   */
  readonly secure?: boolean | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#cookies)
   */
  readonly sameSite?: CookieSameSite | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#cookies)
   */
  readonly maxAge?: number | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#cookies)
 */
export interface CookieStoreLike {
  /**
   * Cookie 値を取り出します。
   *
   * @param name 取得する Cookie 名です。
   *
   * @returns 取得した値です。欠番時は undefined です。
   */
  get(name: string): string | undefined;

  /**
   * Cookie 値を保存します。
   *
   * @param name 保存先の Cookie 名です。
   * @param value 保存する値です。
   * @param attributes 付与する属性です。
   */
  set(name: string, value: string, attributes: CookieAttributes): void;

  /**
   * Cookie 値を削除します。
   *
   * @param name 削除する Cookie 名です。
   * @param attributes 付与する属性です。
   */
  delete(name: string, attributes: CookieAttributes): void;

  /**
   * 保持する Cookie 名を列挙します。
   *
   * @returns Cookie 名の一覧です。
   */
  keys(): Iterable<string>;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#cookies)
 */
export type CookiesOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#cookies-cookie-attributes)
   */
  readonly cookieAttributes?: CookieAttributes | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#cookies-size-limit-bytes)
   */
  readonly sizeLimitBytes?: number | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#cookies-store)
   */
  readonly store?: CookieStoreLike | undefined;
};

/**
 * 既定のサイズ上限 (バイト) です。
 */
const DEFAULT_SIZE_LIMIT_BYTES = 4096;

/**
 * 文字列値を表す接頭辞です。
 */
const STRING_MARKER = "s:";

/**
 * バイト列値を表す接頭辞です。
 */
const BINARY_MARKER = "b:";

/**
 * 文字列のバイト長測定に使う符号化器です。
 */
const textEncoder = new TextEncoder();

/**
 * バイト列を Base64 文字列へ符号化します。
 *
 * @param bytes 符号化するバイト列です。
 *
 * @returns Base64 文字列です。
 */
function encodeBase64(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

/**
 * Base64 文字列をバイト列へ復元します。
 *
 * @param encoded 復元する Base64 文字列です。
 *
 * @returns 復元したバイト列です。
 */
function decodeBase64(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

/**
 * `document.cookie` 文字列を写像へ変換します。
 *
 * @param cookie 変換する Cookie 文字列です。
 *
 * @returns 名前と値の写像です。
 */
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

/**
 * `Set-Cookie` 形式の文字列を組み立てます。
 *
 * @param name Cookie 名です。
 * @param value 設定する値です。
 * @param attributes 付与する属性です。
 *
 * @returns 組み立てた設定文字列です。
 */
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

/**
 * `document` の最小形状です。
 */
type DocumentLike = {
  /**
   * Cookie 文字列です。
   */
  cookie: string;
};

/**
 * `document.cookie` を使った既定の Cookie ストアです。
 */
class DocumentCookieStore implements CookieStoreLike {
  /**
   * 操作対象の `document` です。
   */
  readonly #document: DocumentLike;

  /**
   * 既定の Cookie ストアを作成します。
   *
   * @param document 操作対象の `document` です。
   */
  public constructor(document: DocumentLike) {
    this.#document = document;
  }

  /**
   * Cookie 値を取り出します。
   *
   * @param name 取得する Cookie 名です。
   *
   * @returns 取得した値です。欠番時は undefined です。
   */
  public get(name: string): string | undefined {
    return parseDocumentCookies(this.#document.cookie).get(name);
  }

  /**
   * Cookie 値を保存します。
   *
   * @param name 保存先の Cookie 名です。
   * @param value 保存する値です。
   * @param attributes 付与する属性です。
   */
  public set(name: string, value: string, attributes: CookieAttributes): void {
    this.#document.cookie = serializeSetCookie(name, value, attributes);
  }

  /**
   * Cookie 値を削除します。
   *
   * 有効期限を 0 秒にして無効化します。
   *
   * @param name 削除する Cookie 名です。
   * @param attributes 付与する属性です。
   */
  public delete(name: string, attributes: CookieAttributes): void {
    this.#document.cookie = serializeSetCookie(name, "", {
      ...attributes,
      maxAge: 0,
    });
  }

  /**
   * 保持する Cookie 名を列挙します。
   *
   * @returns Cookie 名の一覧です。
   */
  public keys(): Iterable<string> {
    return parseDocumentCookies(this.#document.cookie).keys();
  }
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#cookies)
 */
export default class Cookies implements IStorage<string | Uint8Array, string | Uint8Array> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#cookies)
   */
  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#cookies)
   */
  public readonly sizeLimitBytes: number;

  /**
   * 注入された Cookie ストアです。未指定なら `document` から解決します。
   */
  readonly #injectedStore: CookieStoreLike | undefined;

  /**
   * すべての Cookie に付与する属性です。
   */
  readonly #cookieAttributes: CookieAttributes;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cookies#cookies)
   */
  public constructor(options: CookiesOptions = {}) {
    const { store, sizeLimitBytes = DEFAULT_SIZE_LIMIT_BYTES, cookieAttributes = {} } = options;

    this.name = "Cookies";
    this.sizeLimitBytes = sizeLimitBytes;
    this.#injectedStore = store;
    this.#cookieAttributes = cookieAttributes;
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
   * バックエンドの有無を確認します。
   *
   * @param c オープンコンテキストです。
   */
  public open(c: IStorage.OpenContext): void {
    throwIfAborted(c.signal);
    this.#backend();
  }

  /**
   * ストレージをクローズします。
   *
   * 保持する接続はないため中断確認のみ行います。
   *
   * @param c クローズコンテキストです。
   */
  public close(c: IStorage.CloseContext): void {
    throwIfAborted(c.signal);
  }

  /**
   * 値を書き込みます。
   *
   * 文字列とバイト列を区別して保存します。
   *
   * @param c 書き込みコンテキストです。
   * @param data 保存する値です。
   */
  public write(c: IStorage.WriteContext, data: string | Uint8Array): void {
    throwIfAborted(c.signal);
    this.#writeValue(c.key, data);
  }

  /**
   * 値を読み取ります。
   *
   * 保存形式を判別して元の型で返します。
   *
   * @param c 読み取りコンテキストです。
   *
   * @returns 読み取った値です。
   */
  public read(c: IStorage.ReadContext): string | Uint8Array {
    throwIfAborted(c.signal);

    const found = this.#backend().get(this.#toRealKey(c.key));

    if (found === undefined) {
      throw new KeyNotFoundError({ key: c.key });
    }

    return this.#decode(decodeURIComponent(found));
  }

  /**
   * キーの存在を確認します。
   *
   * @param c 存在確認コンテキストです。
   *
   * @returns 存在すれば真です。
   */
  public exists(c: IStorage.ExistsContext): boolean {
    throwIfAborted(c.signal);

    return this.#backend().get(this.#toRealKey(c.key)) !== undefined;
  }

  /**
   * キーを削除します。
   *
   * 欠番は欠番として扱います。
   *
   * @param c 削除コンテキストです。
   */
  public delete(c: IStorage.DeleteContext): void {
    throwIfAborted(c.signal);

    const backend = this.#backend();
    const realKey = this.#toRealKey(c.key);

    if (backend.get(realKey) === undefined) {
      throw new KeyNotFoundError({ key: c.key });
    }

    backend.delete(realKey, this.#cookieAttributes);
  }

  /**
   * 指定したキーの値を別のキーへ複製します。コピー先の既存値は上書きします。
   *
   * @param c コピー元とコピー先のキーを持つコンテキストです。
   */
  public copy(c: IStorage.CopyContext): void {
    throwIfAborted(c.signal);

    const data = this.read(c as unknown as IStorage.ReadContext);

    // 同じキーへのコピーは値の存在確認だけを行います。
    if (c.key === c.destinationKey) {
      return;
    }

    this.#writeValue(c.destinationKey, data);
  }

  /**
   * 指定したキーの値を別のキーへ移動します。移動先の既存値は上書きします。
   *
   * 移動先への書き込みが成功した後に移動元を削除します。
   *
   * @param c 移動元と移動先のキーを持つコンテキストです。
   */
  public move(c: IStorage.MoveContext): void {
    throwIfAborted(c.signal);

    const data = this.read(c as unknown as IStorage.ReadContext);

    // 同じキーへの移動は値の存在確認だけを行います。
    if (c.key === c.destinationKey) {
      return;
    }

    this.#writeValue(c.destinationKey, data);
    this.delete(c as unknown as IStorage.DeleteContext);
  }

  /**
   * 保持する Cookie をすべて削除します。
   *
   * @param c クリアコンテキストです。
   */
  public clear(c: IStorage.ClearContext): void {
    throwIfAborted(c.signal);

    const backend = this.#backend();
    const targets = [...backend.keys()];

    for (const target of targets) {
      throwIfAborted(c.signal);
      backend.delete(target, this.#cookieAttributes);
    }
  }

  /**
   * 使用する Cookie ストアを解決します。
   *
   * 注入品がなければ `document` から作ります。
   *
   * @returns 使用する Cookie ストアです。
   */
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

  /**
   * 論理キーを実キーへ変換します。
   *
   * @param key 変換する論理キーです。
   *
   * @returns URL 符号化した実キーです。
   */
  #toRealKey(key: string): string {
    return encodeURIComponent(key);
  }

  /**
   * 値を Cookie 用の文字列へ変換して保存します。
   *
   * @param key 保存先の論理キーです。
   * @param data 保存する値です。
   */
  #writeValue(key: string, data: string | Uint8Array): void {
    const { payload, rawSize } = this.#encode(data);

    if (rawSize > this.sizeLimitBytes) {
      throw new CookieTooLargeError({
        key,
        limit: this.sizeLimitBytes,
        actual: rawSize,
      });
    }

    this.#backend().set(this.#toRealKey(key), encodeURIComponent(payload), this.#cookieAttributes);
  }

  /**
   * 保存値を Cookie 用の文字列へ変換します。
   *
   * 接頭辞で文字列とバイト列を区別します。
   *
   * @param data 変換する保存値です。
   *
   * @returns 変換した文字列と元のバイト長です。
   */
  #encode(data: string | Uint8Array): {
    readonly payload: string;
    readonly rawSize: number;
  } {
    if (typeof data === "string") {
      return {
        payload: `${STRING_MARKER}${data}`,
        rawSize: textEncoder.encode(data).length,
      };
    }

    return {
      payload: `${BINARY_MARKER}${encodeBase64(data)}`,
      rawSize: data.byteLength,
    };
  }

  /**
   * Cookie 用の文字列を保存値へ復元します。
   *
   * 接頭辞のない値はそのまま返します。
   *
   * @param payload 復元する文字列です。
   *
   * @returns 復元した保存値です。
   */
  #decode(payload: string): string | Uint8Array {
    if (payload.startsWith(BINARY_MARKER)) {
      return decodeBase64(payload.slice(BINARY_MARKER.length));
    }

    if (payload.startsWith(STRING_MARKER)) {
      return payload.slice(STRING_MARKER.length);
    }

    return payload;
  }
}
