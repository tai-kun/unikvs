import { type IStorage, KeyNotFoundError } from "@unikvs/core";
import { throwIfAborted, toAbortPromise } from "abort-signal-utils";
import { Client } from "memjs";

import {
  ConnectTimeoutError,
  InvalidTtlSecondsError,
  InvalidConnectTimeoutError,
} from "./errors.js";

/**
 * `get` の戻り値として受け付ける値の形です。
 * `memjs` は `{ value: Buffer | null, flags }` を返します。
 * 欠落キーは `null`/`undefined` または `value` が空の形で表されます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#usage)
 */
export type MemcachedGetResultValue = Uint8Array | string | null | undefined;

/**
 * `get` の戻り値として受け付ける形です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#usage)
 */
export type MemcachedGetResult =
  | {
      readonly flags?: unknown;
      readonly value: MemcachedGetResultValue;
    }
  | MemcachedGetResultValue;

/**
 * 注入できる Memcached クライアントの最小形です。
 * `memjs` の `Client` はこの形を満たします。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#usage)
 */
export type MemcachedClientLike = {
  readonly get: (key: string) => Promise<MemcachedGetResult>;
  readonly set: (
    key: string,
    value: string | Uint8Array,
    options?: { readonly expires?: number | undefined },
  ) => Promise<unknown>;
  readonly quit?: (() => unknown) | undefined;
  readonly close?: (() => unknown) | undefined;
  readonly flush: () => Promise<unknown>;
  readonly delete: (key: string) => Promise<unknown>;
};

/**
 * `servers` 引数として受け付ける形です。
 * 文字列 (`"host:port,host:port"`) またはその配列です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#usage)
 */
export type MemcachedServers = string | readonly string[];

/**
 * `Memcached` のコンストラクターオプションです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#usage)
 */
export type MemcachedStorageOptions = {
  /**
   * 既存のクライアントを注入します。
   * 指定時は `servers`/`host`/`port` による接続作成を行いません。
   * `close()` は注入クライアントも解放 (`quit`/`close`/`end`) します。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#usage)
   */
  readonly client?: MemcachedClientLike | undefined;

  /**
   * 接続先サーバーです。コンストラクターの第 1 引数が優先されます。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#usage)
   */
  readonly servers?: MemcachedServers | undefined;

  /**
   * `servers` の代わりにホストを直接指定します。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#usage)
   */
  readonly host?: string | undefined;

  /**
   * `servers` の代わりにポートを直接指定します。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#usage)
   */
  readonly port?: number | undefined;

  /**
   * 書き込んだ値の有効期限 (秒) です。
   * `0` は無期限を表します。30 日を超える値は UNIX 時刻として扱われます (memcached 仕様)。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#usage)
   */
  readonly ttlSeconds?: number | undefined;

  /**
   * すべてのキーに付与する接頭辞です。既定値は `"unikvs:"` です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#usage)
   */
  readonly keyPrefix?: string | undefined;

  /**
   * `open` 時の接続確認が打ち切られるまでの時間 (ミリ秒) です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#usage)
   */
  readonly connectTimeout?: number | undefined;
};

const DEFAULT_KEY_PREFIX = "unikvs:";
const DEFAULT_CONNECT_TIMEOUT_MS = 5000;
const PROBE_KEY = "__unikvs_memcached_probe__";

function resolveServers(
  servers: MemcachedServers | undefined,
  host: string | undefined,
  port: number | undefined,
): string {
  const parts = (typeof servers === "string" ? [servers] : (servers ?? []))
    .map((part) => part.trim())
    .filter((part) => part !== "");

  if (parts.length > 0) {
    return parts.join(",");
  }

  if (host !== undefined || port !== undefined) {
    return `${host ?? "127.0.0.1"}:${port ?? 11_211}`;
  }

  return (
    process.env["MEMCACHED_SERVERS"] ??
    process.env["MEMCACHIER_SERVERS"] ??
    process.env["MEMCACHE_SERVERS"] ??
    "127.0.0.1:11211"
  );
}

function createClient(servers: string): MemcachedClientLike {
  return Client.create(servers);
}

/**
 * 別名 (`quit`/`close`/`end`、`flush`/`flushAll`、`delete`/`del`) を吸収して呼び出します。
 */
function invokeClient(
  client: MemcachedClientLike,
  names: readonly string[],
  key?: string,
): Promise<unknown> {
  const record = client as unknown as Record<string, unknown>;

  for (const name of names) {
    const fn = record[name];

    if (typeof fn === "function") {
      return Promise.resolve(
        key === undefined
          ? (fn as (this: MemcachedClientLike) => unknown).call(client)
          : (fn as (this: MemcachedClientLike, key: string) => unknown).call(client, key),
      );
    }
  }

  return Promise.reject(
    new TypeError(`Memcached client must implement one of: ${names.join(", ")}.`),
  );
}

async function releaseClient(client: MemcachedClientLike): Promise<void> {
  try {
    await invokeClient(client, ["quit", "close", "end"]);
  } catch {
    // 後始末のため、失敗しても無視します。
  }
}

function encodeBase64(data: Uint8Array): string {
  return Buffer.from(data).toString("base64");
}

function normalizeGetResult(result: unknown): Uint8Array<ArrayBuffer> | null {
  const raw: unknown =
    result !== null && typeof result === "object" && "value" in result
      ? (result as { readonly value?: unknown }).value
      : result;

  if (raw === null || raw === undefined) {
    return null;
  }

  const text = typeof raw === "string" ? raw : Buffer.from(raw as Uint8Array).toString("utf8");

  return new Uint8Array(Buffer.from(text, "base64"));
}

/**
 * Memcached 上のストレージです。
 *
 * 値は Base64 でエンコードした文字列として保存します。
 * memcached にはキー列挙の手段がないため、`clear` はサーバー上の全キーを削除します。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#usage)
 */
export default class Memcached implements IStorage {
  #con: { readonly client: MemcachedClientLike } | null = null;

  readonly #injectedClient: MemcachedClientLike | undefined;

  readonly #servers: string;

  readonly #ttlSeconds: number;

  readonly #connectTimeout: number;

  readonly #keyPrefix: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#usage)
   */
  public readonly name = "Memcached";

  /**
   * Memcached ストレージを作成します。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#usage)
   */
  public constructor(servers?: MemcachedServers, options: MemcachedStorageOptions = {}) {
    const {
      host,
      port,
      client,
      servers: serversOption,
      keyPrefix = DEFAULT_KEY_PREFIX,
      ttlSeconds = 0,
      connectTimeout = DEFAULT_CONNECT_TIMEOUT_MS,
    } = options;

    if (typeof ttlSeconds !== "number" || !Number.isFinite(ttlSeconds) || ttlSeconds < 0) {
      throw new InvalidTtlSecondsError({ actual: ttlSeconds });
    }

    if (
      typeof connectTimeout !== "number" ||
      !Number.isFinite(connectTimeout) ||
      connectTimeout <= 0
    ) {
      throw new InvalidConnectTimeoutError({ actual: connectTimeout });
    }

    this.#injectedClient = client;
    this.#servers = resolveServers(servers ?? serversOption, host, port);
    this.#ttlSeconds = ttlSeconds;
    this.#connectTimeout = connectTimeout;
    this.#keyPrefix = keyPrefix;
  }

  public get isOpen(): boolean {
    return this.#con !== null;
  }

  // 開いている接続を返します。
  // 未オープン時は `TypeError` を投げます。
  #getConnection(): { readonly client: MemcachedClientLike } {
    const con = this.#con;

    if (con === null) {
      throw new TypeError("Memcached is not open. Call open() first.");
    }

    return con;
  }

  public async open(c: IStorage.OpenContext): Promise<void> {
    // 並行 `open` 同士および `open` 接続待ち中の `close` の同時呼び出しは禁止 (事前条件) です。
    // 呼び出し側で直列化してください。
    // 並行 `close` 同士は一方が `TypeError` reject する形で直列化されます。
    throwIfAborted(c.signal);

    if (this.#con) {
      await this.close(c as unknown as IStorage.CloseContext);
    }

    const injected = this.#injectedClient;
    const client: MemcachedClientLike = injected ?? createClient(this.#servers);
    const owned = injected === undefined;

    using abortPromise = toAbortPromise(c.signal);

    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      // `memjs` は遅延接続のため、`get` による疎通確認で接続可否を検証します。
      // 存在しないキーへの `get` は `null` 値で成功するため、読み取り専用で安全です。
      await Promise.race([
        client.get(PROBE_KEY),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new ConnectTimeoutError({ timeoutMs: this.#connectTimeout }));
          }, this.#connectTimeout);
        }),
        abortPromise,
      ]);
    } catch (error) {
      if (owned) {
        await releaseClient(client);
      }

      throw error;
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }

    this.#con = { client };
  }

  public async close(_c: IStorage.CloseContext): Promise<void> {
    // 未 `open`・二重 `close` は `TypeError` で reject されます。
    // 必ず `await` し、結果を浮かせないでください。
    const { client } = this.#getConnection();

    // 先行 null 化により、並行 `close` 同士は二重解放になりません。
    this.#con = null;

    await invokeClient(client, ["quit", "close", "end"]);
  }

  #toKey(key: string): string {
    return `${this.#keyPrefix}${key}`;
  }

  public async write(c: IStorage.WriteContext, data: Uint8Array<ArrayBuffer>): Promise<void> {
    const { client } = this.#getConnection();

    throwIfAborted(c.signal);

    // memcached テキスト互換のため、バイナリーは base64 文字列として格納します。
    await client.set(this.#toKey(c.key), encodeBase64(data), { expires: this.#ttlSeconds });
  }

  public async read(c: IStorage.ReadContext): Promise<Uint8Array<ArrayBuffer>> {
    const { client } = this.#getConnection();

    throwIfAborted(c.signal);
    using abortPromise = toAbortPromise(c.signal);

    const data = normalizeGetResult(
      await Promise.race([client.get(this.#toKey(c.key)), abortPromise]),
    );

    if (data === null) {
      throw new KeyNotFoundError({ key: c.key });
    }

    return data;
  }

  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    const { client } = this.#getConnection();

    throwIfAborted(c.signal);
    using abortPromise = toAbortPromise(c.signal);

    // memcached に存在確認コマンドはないため、`get` の成否で判定します。
    return (
      normalizeGetResult(await Promise.race([client.get(this.#toKey(c.key)), abortPromise])) !==
      null
    );
  }

  public async delete(c: IStorage.DeleteContext): Promise<void> {
    const { client } = this.#getConnection();

    throwIfAborted(c.signal);

    await invokeClient(client, ["delete", "del"], this.#toKey(c.key));
  }

  public async clear(c: IStorage.ClearContext): Promise<void> {
    const { client } = this.#getConnection();

    throwIfAborted(c.signal);

    // memcached にキー列挙手段はないため、`flush` で全件削除します。
    // プレフィックスの内外を問わず、サーバー上の全キーが対象になります。
    await invokeClient(client, ["flush", "flushAll"]);
  }
}
