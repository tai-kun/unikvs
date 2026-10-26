import { type IStorage, KeyNotFoundError } from "@unikvs/core";
import { throwIfAborted, toAbortPromise } from "abort-signal-utils";
import { Client } from "memjs";

import {
  ConnectTimeoutError,
  InvalidTtlSecondsError,
  InvalidConnectTimeoutError,
} from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#memcachedgetresultvalue)
 */
export type MemcachedGetResultValue = Uint8Array | string | null | undefined;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#memcachedgetresult)
 */
export type MemcachedGetResult =
  | {
      readonly flags?: unknown;
      readonly value: MemcachedGetResultValue;
    }
  | MemcachedGetResultValue;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#memcachedclientlike)
 */
export type MemcachedClientLike = {
  /**
   * キーの値を取り出します。
   *
   * @param key 取得するキーです。
   *
   * @returns 取得した値です。
   */
  readonly get: (key: string) => Promise<MemcachedGetResult>;

  /**
   * キーに値を保存します。
   *
   * @param key 保存先のキーです。
   * @param value 保存する値です。
   * @param options 保存に渡す任意項目です。
   *
   * @returns 保存が完了したら解決します。
   */
  readonly set: (
    key: string,
    value: string | Uint8Array,
    options?: { readonly expires?: number | undefined },
  ) => Promise<unknown>;

  /**
   * クライアントを終了します。
   *
   * @returns 終了結果です。
   */
  readonly quit?: (() => unknown) | undefined;

  /**
   * クライアントを閉じます。
   *
   * @returns 閉じた結果です。
   */
  readonly close?: (() => unknown) | undefined;

  /**
   * 保持する値をすべて削除します。
   *
   * @returns 削除が完了したら解決します。
   */
  readonly flush: () => Promise<unknown>;

  /**
   * キーを削除します。
   *
   * @param key 削除するキーです。
   *
   * @returns 削除が完了したら解決します。
   */
  readonly delete: (key: string) => Promise<unknown>;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#memcachedservers)
 */
export type MemcachedServers = string | readonly string[];

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#memcachedstorageoptions)
 */
export type MemcachedStorageOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#memcachedstorageoptions-client)
   */
  readonly client?: MemcachedClientLike | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#memcachedstorageoptions-servers)
   */
  readonly servers?: MemcachedServers | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#memcachedstorageoptions-host)
   */
  readonly host?: string | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#memcachedstorageoptions-port)
   */
  readonly port?: number | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#memcachedstorageoptions-ttlseconds)
   */
  readonly ttlSeconds?: number | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#memcachedstorageoptions-keyprefix)
   */
  readonly keyPrefix?: string | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#memcachedstorageoptions-connecttimeout)
   */
  readonly connectTimeout?: number | undefined;
};

/**
 * 既定のキー接頭辞です。
 *
 * 未指定時に全キーへ付与します。
 */
const DEFAULT_KEY_PREFIX = "unikvs:";

/**
 * `open` 時の接続確認の既定タイムアウト (ミリ秒) です。
 */
const DEFAULT_CONNECT_TIMEOUT_MS = 5000;

/**
 * 接続確認に使うプローブキーです。
 *
 * 存在しないキーへの `get` で疎通を確認します。
 */
const PROBE_KEY = "__unikvs_memcached_probe__";

/**
 * 接続先サーバーを解決します。
 *
 * 引数・オプション・環境変数の順に優先して単一文字列へまとめます。
 *
 * @param servers サーバー指定です。
 * @param host ホスト指定です。
 * @param port ポート指定です。
 *
 * @returns 接続先サーバーの文字列表現です。
 */
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

/**
 * 接続先から Memcached クライアントを作成します。
 *
 * @param servers 接続先サーバーの文字列表現です。
 *
 * @returns 作成したクライアントです。
 */
function createClient(servers: string): MemcachedClientLike {
  return Client.create(servers);
}

/**
 * 別名 (`quit`/`close`/`end`、`flush`/`flushAll`、`delete`/`del`) を吸収して呼び出します。
 *
 * 実装差で名前が異なるメソッドを順に探して実行します。
 *
 * @param client 操作対象のクライアントです。
 * @param names 試行するメソッド名です。
 * @param key キーを渡す操作の対象キーです。
 *
 * @returns 呼び出し結果を解決します。
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

/**
 * クライアントを解放します。
 *
 * 失敗しても後始末として無視します。
 *
 * @param client 解放するクライアントです。
 *
 * @returns 解放が完了したら解決します。
 */
async function releaseClient(client: MemcachedClientLike): Promise<void> {
  try {
    await invokeClient(client, ["quit", "close", "end"]);
  } catch {
    // 後始末のため、失敗しても無視します。
  }
}

/**
 * バイト列を Base64 文字列へ符号化します。
 *
 * @param data 符号化するバイト列です。
 *
 * @returns Base64 文字列です。
 */
function encodeBase64(data: Uint8Array): string {
  return Buffer.from(data).toString("base64");
}

/**
 * `get` の戻り値をバイト列へ正規化します。
 *
 * 欠番は null で表します。
 *
 * @param result 正規化する取得結果です。
 *
 * @returns 正規化したバイト列です。欠番時は null です。
 */
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
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#memcached)
 */
export default class Memcached implements IStorage {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#memcached)
   */
  public readonly name = "Memcached";

  /**
   * Memcached への接続を保持します。
   *
   * ストレージがオープンされるまで null です。
   */
  #con: { readonly client: MemcachedClientLike } | null = null;

  /**
   * 注入されたクライアントです。
   *
   * 未指定のときは接続先から作成します。
   */
  readonly #injectedClient: MemcachedClientLike | undefined;

  /**
   * 接続先サーバーの文字列表現です。
   */
  readonly #servers: string;

  /**
   * 書き込んだ値の有効期限 (秒) です。
   */
  readonly #ttlSeconds: number;

  /**
   * `open` 時の接続確認のタイムアウト (ミリ秒) です。
   */
  readonly #connectTimeout: number;

  /**
   * すべてのキーの先頭に付与するプレフィックスです。
   */
  readonly #keyPrefix: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memcached#memcached)
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

  /**
   * ストレージがオープン済みかどうかです。
   *
   * @returns オープン済みなら真です。
   */
  public get isOpen(): boolean {
    return this.#con !== null;
  }

  /**
   * ストレージをオープンします。
   *
   * 疎通確認で接続可否を検証します。
   *
   * @param c オープンコンテキストです。
   *
   * @returns オープンが完了したら解決します。
   */
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

  /**
   * ストレージをクローズします。
   *
   * クライアントを解放して参照を外します。
   *
   * @param _c クローズコンテキストです。
   *
   * @returns クローズが完了したら解決します。
   */
  public async close(_c: IStorage.CloseContext): Promise<void> {
    // 未 `open`・二重 `close` は `TypeError` で reject されます。
    // 必ず `await` し、結果を浮かせないでください。
    const { client } = this.#getConnection();

    // 先行 null 化により、並行 `close` 同士は二重解放になりません。
    this.#con = null;

    await invokeClient(client, ["quit", "close", "end"]);
  }

  /**
   * バイト列を書き込みます。
   *
   * Base64 文字列に変換して保存します。
   *
   * @param c 書き込みコンテキストです。
   * @param data 保存するバイト列です。
   *
   * @returns 書き込みが完了したら解決します。
   */
  public async write(c: IStorage.WriteContext, data: Uint8Array<ArrayBuffer>): Promise<void> {
    const { client } = this.#getConnection();

    throwIfAborted(c.signal);

    // memcached テキスト互換のため、バイナリーは base64 文字列として格納します。
    await client.set(this.#toKey(c.key), encodeBase64(data), { expires: this.#ttlSeconds });
  }

  /**
   * バイト列を読み取ります。
   *
   * 保存した Base64 文字列を復元します。
   *
   * @param c 読み取りコンテキストです。
   *
   * @returns 読み取ったバイト列です。
   */
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

  /**
   * キーの存在を確認します。
   *
   * `get` の成否で判定します。
   *
   * @param c 存在確認コンテキストです。
   *
   * @returns 存在すれば真です。
   */
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

  /**
   * キーを削除します。
   *
   * @param c 削除コンテキストです。
   *
   * @returns 削除が完了したら解決します。
   */
  public async delete(c: IStorage.DeleteContext): Promise<void> {
    const { client } = this.#getConnection();

    throwIfAborted(c.signal);

    await invokeClient(client, ["delete", "del"], this.#toKey(c.key));
  }

  /**
   * サーバー上の全キーを削除します。
   *
   * 列挙手段がないため `flush` で削除します。
   *
   * @param c クリアコンテキストです。
   *
   * @returns 削除が完了したら解決します。
   */
  public async clear(c: IStorage.ClearContext): Promise<void> {
    const { client } = this.#getConnection();

    throwIfAborted(c.signal);

    // memcached にキー列挙手段はないため、`flush` で全件削除します。
    // プレフィックスの内外を問わず、サーバー上の全キーが対象になります。
    await invokeClient(client, ["flush", "flushAll"]);
  }

  /**
   * 開いている接続を返します。
   *
   * 未オープン時は例外を投げます。
   *
   * @returns オープン済みの接続です。
   */
  #getConnection(): { readonly client: MemcachedClientLike } {
    const con = this.#con;

    if (con === null) {
      throw new TypeError("Memcached is not open. Call open() first.");
    }

    return con;
  }

  /**
   * unikvs のキーにプレフィックスを付与し、Memcached のキーへ変換します。
   *
   * @param key 変換する論理キーです。
   *
   * @returns Memcached 上の実キーです。
   */
  #toKey(key: string): string {
    return `${this.#keyPrefix}${key}`;
  }
}
