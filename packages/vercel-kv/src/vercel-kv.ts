import { KeyNotFoundError, type IStorage } from "@unikvs/core";

import {
  ClientNotAvailableError,
  ClearWithoutPrefixNotAllowedError,
  InvalidTtlSecondsError,
} from "./errors.js";

/**
 * Vercel KV クライアントの最小インターフェースです。
 *
 * `@vercel/kv` のクライアントのほか、テスト用の疑似実装を注入できます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-kv#usage)
 */
export interface KVClientLike {
  get<T = unknown>(key: string): Promise<T | null>;

  set(key: string, value: string, options?: { ex?: number }): Promise<unknown>;

  del(...keys: string[]): Promise<number>;

  exists(...keys: string[]): Promise<number>;

  keys(pattern: string): Promise<string[]>;
}

/**
 * `VercelKv` のコンストラクターオプションです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-kv#usage)
 */
export type VercelKvOptions = {
  /**
   * 注入する Vercel KV クライアントです。
   *
   * 指定したときは `url` / `token` を使ったクライアント作成を行いません。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-kv#usage)
   */
  readonly kv?: KVClientLike | undefined;

  /**
   * Vercel KV REST API の URL です。
   *
   * 未指定のときは `KV_REST_API_URL` 環境変数を使います。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-kv#usage)
   */
  readonly url?: string | undefined;

  /**
   * Vercel KV REST API のトークンです。
   *
   * 未指定のときは `KV_REST_API_TOKEN` 環境変数を使います。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-kv#usage)
   */
  readonly token?: string | undefined;

  /**
   * すべてのキーに付与する接頭辞です。既定値は `"unikvs:"` です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-kv#usage)
   */
  readonly keyPrefix?: string | undefined;

  /**
   * 書き込み時に付与する有効期限 (秒) です。未指定なら無期限です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-kv#usage)
   */
  readonly ttlSeconds?: number | undefined;
};

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const BASE64_DECODE_TABLE: Uint8Array<ArrayBuffer> = (() => {
  const table = new Uint8Array(128).fill(255);

  for (let index = 0; index < BASE64_ALPHABET.length; index++) {
    table[BASE64_ALPHABET.charCodeAt(index)] = index;
  }

  return table as Uint8Array<ArrayBuffer>;
})();

function encodeBase64(data: Uint8Array<ArrayBuffer>): string {
  let output = "";
  const remainder = data.length % 3;
  const mainLength = data.length - remainder;

  for (let index = 0; index < mainLength; index += 3) {
    const triple = (data[index]! << 16) | (data[index + 1]! << 8) | data[index + 2]!;

    output +=
      BASE64_ALPHABET[(triple >> 18) & 63]! +
      BASE64_ALPHABET[(triple >> 12) & 63]! +
      BASE64_ALPHABET[(triple >> 6) & 63]! +
      BASE64_ALPHABET[triple & 63]!;
  }

  if (remainder === 1) {
    const byte = data[mainLength]!;

    output += BASE64_ALPHABET[(byte >> 2) & 63]! + BASE64_ALPHABET[(byte << 4) & 63]! + "==";
  } else if (remainder === 2) {
    const pair = (data[mainLength]! << 8) | data[mainLength + 1]!;

    output +=
      BASE64_ALPHABET[(pair >> 10) & 63]! +
      BASE64_ALPHABET[(pair >> 4) & 63]! +
      BASE64_ALPHABET[(pair << 2) & 63]! +
      "=";
  }

  return output;
}

function lookupBase64Char(text: string, index: number): number {
  const code = text.charCodeAt(index);

  if (code === 61) {
    return 0;
  }

  if (code >= BASE64_DECODE_TABLE.length || BASE64_DECODE_TABLE[code] === 255) {
    throw new Error(`Invalid base64 character: ${JSON.stringify(text[index])}`);
  }

  return BASE64_DECODE_TABLE[code]!;
}

function decodeBase64(text: string): Uint8Array<ArrayBuffer> {
  if (text.length % 4 !== 0) {
    throw new Error(`Invalid base64 length: ${text.length}`);
  }

  const paddingStart = text.indexOf("=");

  if (paddingStart !== -1) {
    if (text.length - paddingStart > 2) {
      throw new Error(`Invalid base64 padding: ${JSON.stringify(text)}`);
    }

    for (let index = paddingStart; index < text.length; index++) {
      if (text[index] !== "=") {
        throw new Error(`Invalid base64 padding: ${JSON.stringify(text)}`);
      }
    }
  }

  let padding = 0;

  if (text.endsWith("==")) {
    padding = 2;
  } else if (text.endsWith("=")) {
    padding = 1;
  }

  const output = new Uint8Array((text.length / 4) * 3 - padding);
  let offset = 0;

  for (let index = 0; index < text.length; index += 4) {
    const a = lookupBase64Char(text, index);
    const b = lookupBase64Char(text, index + 1);
    const c = lookupBase64Char(text, index + 2);
    const d = lookupBase64Char(text, index + 3);
    const triple = (a << 18) | (b << 12) | (c << 6) | d;

    output[offset++] = (triple >> 16) & 255;

    if (offset < output.length) {
      output[offset++] = (triple >> 8) & 255;
    }

    if (offset < output.length) {
      output[offset++] = triple & 255;
    }
  }

  return output;
}

async function createVercelKvClient(url: string, token: string): Promise<KVClientLike> {
  let mod: unknown;

  try {
    mod = await import("@vercel/kv");
  } catch (ex) {
    throw new ClientNotAvailableError({ cause: ex });
  }

  const createClient = (mod as { createClient?: unknown }).createClient;

  if (typeof createClient !== "function") {
    throw new ClientNotAvailableError({});
  }

  return (createClient as (config: { url: string; token: string }) => KVClientLike)({ url, token });
}

/**
 * Vercel KV 上のストレージです。
 *
 * 値は Base64 文字列として保存し、`clear` では接頭辞配下のキーを `keys` で列挙して削除します。
 * `@vercel/kv` は任意依存のため、クライアントを注入しない場合は初回利用時に動的 import します。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-kv#usage)
 */
export default class VercelKv implements IStorage {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-kv#usage)
   */
  public readonly name: string;

  readonly #injected: KVClientLike | undefined;

  readonly #url: string | undefined;

  readonly #token: string | undefined;

  readonly #keyPrefix: string;

  readonly #ttlSeconds: number | undefined;

  #created: KVClientLike | null = null;

  /**
   * Vercel KV ストレージを作成します。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-kv#usage)
   */
  public constructor(options: VercelKvOptions = {}) {
    const { kv, url, token, keyPrefix = "unikvs:", ttlSeconds } = options;

    if (
      ttlSeconds !== undefined &&
      (!Number.isInteger(ttlSeconds) || (ttlSeconds as number) <= 0)
    ) {
      throw new InvalidTtlSecondsError({ actual: ttlSeconds });
    }

    this.name = "VercelKv";
    this.#injected = kv;
    this.#url = url;
    this.#token = token;
    this.#keyPrefix = keyPrefix;
    this.#ttlSeconds = ttlSeconds;
  }

  #toKey(key: string): string {
    return `${this.#keyPrefix}${key}`;
  }

  async #client(): Promise<KVClientLike> {
    if (this.#injected !== undefined) {
      return this.#injected;
    }

    if (this.#created !== null) {
      return this.#created;
    }

    const url = this.#url ?? process.env["KV_REST_API_URL"];
    const token = this.#token ?? process.env["KV_REST_API_TOKEN"];

    if (url === undefined || token === undefined) {
      throw new ClientNotAvailableError();
    }

    const created = await createVercelKvClient(url, token);

    this.#created = created;

    return created;
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

    const client = await this.#client();
    const value = encodeBase64(data);

    if (this.#ttlSeconds === undefined) {
      await client.set(this.#toKey(c.key), value);
    } else {
      await client.set(this.#toKey(c.key), value, { ex: this.#ttlSeconds });
    }
  }

  public async read(c: IStorage.ReadContext): Promise<Uint8Array<ArrayBuffer>> {
    c.signal.throwIfAborted();

    const client = await this.#client();
    const stored: unknown = await client.get(this.#toKey(c.key));

    if (stored === null || stored === undefined) {
      throw new KeyNotFoundError({ key: c.key });
    }

    if (typeof stored !== "string") {
      throw new Error(`Failed to read key ${JSON.stringify(c.key)}: unexpected value type`);
    }

    return decodeBase64(stored);
  }

  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    c.signal.throwIfAborted();

    const client = await this.#client();

    return (await client.exists(this.#toKey(c.key))) > 0;
  }

  public async delete(c: IStorage.DeleteContext): Promise<void> {
    c.signal.throwIfAborted();

    const client = await this.#client();

    await client.del(this.#toKey(c.key));
  }

  public async clear(c: IStorage.ClearContext): Promise<void> {
    if (this.#keyPrefix === "") {
      throw new ClearWithoutPrefixNotAllowedError();
    }

    c.signal.throwIfAborted();

    const client = await this.#client();
    const pattern = `${this.#keyPrefix}*`;
    const found = await client.keys(pattern);

    if (!Array.isArray(found) || !found.every((key) => typeof key === "string")) {
      throw new Error(
        `Failed to clear prefix ${JSON.stringify(this.#keyPrefix)}: unexpected KEYS result`,
      );
    }

    if (found.length > 0) {
      await client.del(...found);
    }
  }
}
