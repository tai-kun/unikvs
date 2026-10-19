import { randomUUID } from "node:crypto";

import { KeyNotFoundError, type IStorage } from "@unikvs/core";
import {
  Redis as Ioredis,
  type ClusterNode,
  type ClusterOptions,
  type RedisOptions,
} from "ioredis";

import {
  CloseTimeoutError,
  ClusterNotSupportedError,
  ConnectTimeoutError,
  InvalidCloseTimeoutError,
  InvalidTtlError,
} from "./errors.js";

/**
 * Valkey との通信に使う最小限のクライアント形状です。
 *
 * Valkey は Redis プロトコルと互換性があるため、`ioredis` の `Redis` クライアントをそのまま使えます。
 * テストではこの形状を満たすフェイクを `client` オプションに渡せます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#usage)
 */
export interface ValkeyClient {
  connect(): Promise<unknown>;
  quit(): Promise<unknown>;
  disconnect(): void;
  // oxlint-disable-next-line no-explicit-any
  on(event: string, listener: (...args: any[]) => void): unknown;
  // `value` と末尾引数はそのままクライアントへ透過するため `any` とします。
  // oxlint-disable-next-line no-explicit-any
  set(key: string, value: any, ...args: any[]): Promise<unknown>;
  getBuffer(key: string): Promise<Buffer | null>;
  exists(key: string): Promise<number>;
  del(...keys: string[]): Promise<unknown>;
  // oxlint-disable-next-line no-explicit-any
  scan(cursor: string, ...args: any[]): Promise<[string, string[]]>;
  // oxlint-disable-next-line no-explicit-any
  append(key: string, value: any): Promise<unknown>;
  rename(src: string, dest: string): Promise<unknown>;
  pexpire(key: string, ms: number): Promise<unknown>;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#usage)
 */
export type ValkeyClusterSpec = {
  /**
   * 接続先のクラスターノードです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#usage)
   */
  readonly nodes: readonly ClusterNode[];

  /**
   * `ioredis` の `Cluster` に渡すオプションです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#usage)
   */
  readonly options?: ClusterOptions | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#usage)
 */
export type ValkeyStorageOptions = Omit<RedisOptions, "keyPrefix" | "lazyConnect"> & {
  /**
   * すべてのキーに付与する接頭辞です。既定値は `"unikvs:"` です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#usage)
   */
  readonly keyPrefix?: string | undefined;

  /**
   * Valkey Cluster の接続先です。
   *
   * v1 では未対応のため、指定するとエラーになります。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#usage)
   */
  readonly cluster?: ValkeyClusterSpec | undefined;

  /**
   * `close` 時の切断待ち時間 (ミリ秒) です。既定値は 5000 です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#usage)
   */
  readonly closeTimeout?: number | undefined;

  /**
   * ストレージが使うクライアントです。
   *
   * 指定したときは `open()` での接続確立も `close()` での切断も行わず、呼び出し側が所有します。
   * テスト用のフェイクや共有接続の持ち込みに使います。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#usage)
   */
  readonly client?: ValkeyClient | undefined;

  /**
   * 書き込んだキーに付与する有効期限 (ミリ秒) です。
   *
   * 未指定のときはキーは失効しません。単発書き込みは `SET ... PX` で、
   * ストリーム書き込みは確定 (`RENAME`) 後の `PEXPIRE` で付与します。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#usage)
   */
  readonly ttl?: number | undefined;
};

const SCAN_COUNT = 1000;
const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;
const DEFAULT_CLOSE_TIMEOUT_MS = 5_000;

type Connection = { readonly client: ValkeyClient; readonly owned: boolean };

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#usage)
 */
export default class Valkey implements IStorage {
  #con: Connection | null;

  readonly #url: string | undefined;

  // `closeTimeout` と `client` と `ttl` は本パッケージ固有の拡張です。
  // `this.#options` には含めず、別フィールドで保管します。
  // `this.#options` は `new Ioredis` にそのまま spread できる透過バッグです。
  readonly #options: Omit<
    ValkeyStorageOptions,
    "keyPrefix" | "cluster" | "closeTimeout" | "client" | "ttl"
  >;

  // `ioredis` の `disconnectTimeout` (ソケット切断待機) とは別物です。
  readonly #closeTimeout: number;

  readonly #ttl: number | undefined;

  readonly #injected: ValkeyClient | undefined;

  readonly #keyPrefix: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#usage)
   */
  public readonly name: string;

  /**
   * Valkey ストレージを作成します。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/valkey#usage)
   */
  public constructor(url?: string, options: ValkeyStorageOptions = {}) {
    const {
      keyPrefix = "unikvs:",
      cluster,
      closeTimeout = DEFAULT_CLOSE_TIMEOUT_MS,
      client,
      ttl,
      ...redisOptions
    } = options;

    // v1 は standalone のみに対応します。
    // `cluster` を指定したときは、他の検証より先に拒否します。
    if (cluster !== undefined) {
      throw new ClusterNotSupportedError();
    }

    // `undefined` は既定値 5000ms になるため対象外とします。
    // 明示値が有限の正数でない場合のみ拒否します。
    if (typeof closeTimeout !== "number" || !Number.isFinite(closeTimeout) || closeTimeout <= 0) {
      throw new InvalidCloseTimeoutError({ actual: closeTimeout });
    }

    // `undefined` (失効なし) は対象外とします。
    // 明示値が有限の正数でない場合のみ拒否します。
    if (ttl !== undefined && (typeof ttl !== "number" || !Number.isFinite(ttl) || ttl <= 0)) {
      throw new InvalidTtlError({ actual: ttl });
    }

    this.name = "Valkey";
    this.#con = null;
    this.#url = url;
    this.#options = redisOptions;
    this.#closeTimeout = closeTimeout;
    this.#ttl = ttl;
    this.#injected = client;
    this.#keyPrefix = keyPrefix;
  }

  public get isOpen(): boolean {
    return !!this.#con;
  }

  public async open(_c: IStorage.OpenContext): Promise<void> {
    // 並行 `open` 同士および `open` 接続待ち中の `close` の同時呼び出しは禁止 (事前条件) です。
    // 呼び出し側で直列化してください。
    // 並行 `close` 同士は一方が `TypeError` reject する形で直列化されます。
    if (this.#con) {
      await this.close(_c as unknown as IStorage.CloseContext);
    }

    // 注入されたクライアントは呼び出し側の所有物のため、接続も切断も行いません。
    if (this.#injected !== undefined) {
      this.#con = { client: this.#injected, owned: false };
      return;
    }

    // 空文字の `url`・環境変数は未指定として扱います (本パッケージ仕様)。
    // `url` は `valkey://` / `redis://` / `rediss://` 形式での指定を要求します。
    // 実行時の形式検証は行いません (bare 形式は非サポート・動作未保証)。
    const url = this.#url || process.env["VALKEY_URL"] || process.env["REDIS_URL"] || undefined;
    const connectTimeout = this.#options.connectTimeout ?? DEFAULT_CONNECT_TIMEOUT_MS;

    // `ioredis` v6 のコンストラクタ型は `replyMapping` に明示 `undefined` を許しません。
    // `exactOptionalPropertyTypes` 下では spread のまま渡せないため型表明を付けます。
    // 実行時の値は変わらず、`replyMapping` を含む透過は保たれます。
    type ConnectOptions = RedisOptions & { replyMapping?: "legacy" };
    const options = { ...this.#options, lazyConnect: true, connectTimeout } as ConnectOptions;
    const raw = url === undefined ? new Ioredis(options) : new Ioredis(url, options);

    // `ioredis` は接続失敗・再試行時に `error` イベントを emit します。
    // unhandled `error` によるクラッシュを抑止するため no-op リスナを付けます。
    // 可観測性は v1 では提供しません。
    raw.on("error", () => {});

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        raw.connect(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new ConnectTimeoutError({ timeoutMs: connectTimeout }));
          }, connectTimeout);
        }),
      ]);
    } catch (ex) {
      raw.disconnect();
      throw ex;
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }

    this.#con = { client: raw, owned: true };
  }

  public async close(_c: IStorage.CloseContext): Promise<void> {
    // 未 `open`・二重 `close` は `TypeError` で reject されます。
    // 必ず `await` し、結果を浮かせないでください。
    const { client, owned } = this.#con!;

    // 先行 null 化により、並行 `close` 同士は二重 `quit` になりません。
    this.#con = null;

    // 注入されたクライアントは呼び出し側が所有するため切断しません。
    if (!owned) {
      return;
    }

    const closeTimeout = this.#closeTimeout;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        client.quit(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new CloseTimeoutError({ timeoutMs: closeTimeout }));
          }, closeTimeout);
        }),
      ]);
    } catch {
      // `quit()` の失敗全般 (タイムアウト含む) は `disconnect()` で掃除して正常復帰します。
      client.disconnect();
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  #toKey(key: string): string {
    return `${this.#keyPrefix}${key}`;
  }

  async #clearPattern(client: ValkeyClient, pattern: string, signal: AbortSignal): Promise<void> {
    let cursor = "0";
    do {
      signal.throwIfAborted();

      const [nextCursor, keys] = await client.scan(cursor, "MATCH", pattern, "COUNT", SCAN_COUNT);
      if (keys.length > 0) {
        await client.del(...keys);
      }

      cursor = nextCursor;
    } while (cursor !== "0");
  }

  public async write(c: IStorage.WriteContext, data: Uint8Array<ArrayBuffer>): Promise<void> {
    const { client } = this.#con!;

    c.signal.throwIfAborted();

    if (this.#ttl === undefined) {
      await client.set(this.#toKey(c.key), Buffer.from(data));
    } else {
      await client.set(this.#toKey(c.key), Buffer.from(data), "PX", this.#ttl);
    }
  }

  public async read(c: IStorage.ReadContext): Promise<Uint8Array<ArrayBuffer>> {
    const { client } = this.#con!;

    c.signal.throwIfAborted();

    const data = await client.getBuffer(this.#toKey(c.key));
    if (data === null) {
      throw new KeyNotFoundError({ key: c.key });
    }

    return new Uint8Array(data);
  }

  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    const { client } = this.#con!;

    c.signal.throwIfAborted();

    return (await client.exists(this.#toKey(c.key))) > 0;
  }

  public async delete(c: IStorage.DeleteContext): Promise<void> {
    const { client } = this.#con!;

    c.signal.throwIfAborted();

    await client.del(this.#toKey(c.key));
  }

  public async clear(c: IStorage.ClearContext): Promise<void> {
    const { client } = this.#con!;

    c.signal.throwIfAborted();

    // prefix が空文字の場合は MATCH "*" となり、選択中のデータベースの全キーが対象になります。
    const pattern = `${this.#keyPrefix}*`;
    await this.#clearPattern(client, pattern, c.signal);
  }

  public getWritable(c: IStorage.GetWritableContext): WritableStream<Uint8Array<ArrayBuffer>> {
    const { client } = this.#con!;
    const ttl = this.#ttl;

    c.signal.throwIfAborted();

    const dest = this.#toKey(c.key);
    // 一意なサフィックスにより、同一キーへの並行書き込みでも一時キーが衝突しません。
    const tmp = `${dest}.${randomUUID()}.tmp`;

    // 中断と失敗のどちらからでも後始末が走るため、完了処理は一度だけ行います。
    let finished = false;
    const removeAbortListener = (): void => {
      c.signal.removeEventListener("abort", onAbort);
    };
    const discardTemporary = async (): Promise<void> => {
      try {
        await client.del(tmp);
      } catch {
        // 後始末としての削除のため、失敗しても無視します。
      }
    };
    const finish = async (): Promise<void> => {
      if (finished) return;
      finished = true;
      removeAbortListener();
      await discardTemporary();
    };
    const onAbort = (): void => {
      void finish();
    };

    c.signal.addEventListener("abort", onAbort, { once: true });

    return new WritableStream<Uint8Array<ArrayBuffer>>({
      async start() {
        try {
          c.signal.throwIfAborted();
          // 0 バイトの書き込みでも close 時の RENAME が成功するよう、空の文字列で一時キーを作ります。
          await client.set(tmp, "");
        } catch (ex) {
          await finish();
          throw ex;
        }
      },
      async write(chunk) {
        c.signal.throwIfAborted();
        try {
          await client.append(tmp, Buffer.from(chunk));
        } catch (ex) {
          await finish();
          throw ex;
        }
      },
      async close() {
        c.signal.throwIfAborted();
        try {
          // 全チャンクの追記が完了した時点で初めて最終キーへ置き換えます (swap-on-close)。
          await client.rename(tmp, dest);
          if (ttl !== undefined) {
            await client.pexpire(dest, ttl);
          }
        } catch (ex) {
          await finish();
          throw ex;
        }
        // rename 後は一時キーが存在しないため、完了済みとして中断時の削除を行いません。
        finished = true;
        removeAbortListener();
      },
      async abort() {
        await finish();
      },
    });
  }

  public getReadable(c: IStorage.GetReadableContext): ReadableStream<Uint8Array<ArrayBuffer>> {
    const { client } = this.#con!;

    c.signal.throwIfAborted();

    const dest = this.#toKey(c.key);
    let sent = false;

    // Valkey の GET は値を一括で返すため、取得したバイト列を単一のチャンクとして送出します。
    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      async pull(controller) {
        if (sent) {
          controller.close();
          return;
        }

        sent = true;
        c.signal.throwIfAborted();

        const data = await client.getBuffer(dest);
        if (data === null) {
          throw new KeyNotFoundError({ key: c.key });
        }

        controller.enqueue(new Uint8Array(data));
        controller.close();
      },
    });
  }
}
