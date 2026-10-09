import { randomUUID } from "node:crypto";

import {
  KeyNotFoundError,
  RepairNotAllowedError,
  type IStorage,
  type Variables,
} from "@unikvs/core";
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
} from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#usage)
 */
export type RedisClusterSpec = {
  readonly nodes: readonly ClusterNode[];

  readonly options?: ClusterOptions | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#usage)
 */
export type RedisStorageOptions = Omit<RedisOptions, "keyPrefix" | "lazyConnect"> & {
  readonly keyPrefix?: string | undefined;

  readonly cluster?: RedisClusterSpec | undefined;

  readonly allowRepair?: boolean | undefined;

  readonly closeTimeout?: number | undefined;
};

const SCAN_COUNT = 1000;
const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;
const DEFAULT_CLOSE_TIMEOUT_MS = 5_000;

type Connection = { readonly client: Ioredis };

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#usage)
 */
export default class Redis implements IStorage {
  private con: Connection | null;

  private readonly url: string | undefined;

  // `closeTimeout` は本パッケージ固有の拡張です。
  // `this.options` には含めず、別フィールドで保管します。
  // `this.options` は `new Ioredis` にそのまま spread できる透過バッグです。
  private readonly options: Omit<
    RedisStorageOptions,
    "keyPrefix" | "allowRepair" | "cluster" | "closeTimeout"
  >;

  // `ioredis` の `disconnectTimeout` (ソケット切断待機) とは別物です。
  private readonly closeTimeout: number;

  private readonly keyPrefix: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#usage)
   */
  public readonly allowRepair: boolean;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#usage)
   */
  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#usage)
   */
  public constructor(url?: string, options: RedisStorageOptions = {}) {
    const {
      keyPrefix = "unikvs:",
      allowRepair = false,
      cluster,
      closeTimeout = DEFAULT_CLOSE_TIMEOUT_MS,
      ...redisOptions
    } = options;

    // v1 は standalone のみに対応します。
    // `cluster` を指定したときは、`closeTimeout` 検証より先に拒否します。
    if (cluster !== undefined) {
      throw new ClusterNotSupportedError();
    }

    // `undefined` は既定値 5000ms になるため対象外とします。
    // 明示値が有限の正数でない場合のみ拒否します。
    if (typeof closeTimeout !== "number" || !Number.isFinite(closeTimeout) || closeTimeout <= 0) {
      throw new InvalidCloseTimeoutError({ actual: closeTimeout });
    }

    this.name = "Redis";
    this.con = null;
    this.url = url;
    this.options = redisOptions;
    this.closeTimeout = closeTimeout;
    this.keyPrefix = keyPrefix;
    this.allowRepair = allowRepair;
  }

  private assertRepairAllowed(args: { vars: Variables }): void {
    if (args.vars["unikvs:repair"] === true && !this.allowRepair) {
      throw new RepairNotAllowedError({ name: this.name });
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#usage)
   */
  public get isOpen(): boolean {
    return !!this.con;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#usage)
   */
  public async open(): Promise<void> {
    // 並行 `open` 同士および `open` 接続待ち中の `close` の同時呼び出しは禁止 (事前条件) です。
    // 呼び出し側で直列化してください。
    // 並行 `close` 同士は一方が `TypeError` reject する形で直列化されます。
    if (this.con) {
      await this.close();
    }

    // 空文字の `url`・環境変数は未指定として扱います (本パッケージ仕様)。
    // `url` は `redis://` / `rediss://` 形式での指定を要求します。
    // 実行時の形式検証は行いません (bare 形式は非サポート・動作未保証)。
    const url = this.url || process.env["REDIS_URL"] || process.env["VALKEY_URL"] || undefined;
    const connectTimeout = this.options.connectTimeout ?? DEFAULT_CONNECT_TIMEOUT_MS;

    // `ioredis` v6 のコンストラクタ型は `replyMapping` に明示 `undefined` を許しません。
    // `exactOptionalPropertyTypes` 下では spread のまま渡せないため型表明を付けます。
    // 実行時の値は変わらず、`replyMapping` を含む透過は保たれます。
    type ConnectOptions = RedisOptions & { replyMapping?: "legacy" };
    const options = { ...this.options, lazyConnect: true, connectTimeout } as ConnectOptions;
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

    this.con = { client: raw };
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#usage)
   */
  public async close(): Promise<void> {
    // 未 `open`・二重 `close` は `TypeError` で reject されます。
    // 必ず `await` し、結果を浮かせないでください。
    const { client } = this.con!;

    // 先行 null 化により、並行 `close` 同士は二重 `quit` になりません。
    this.con = null;

    const closeTimeout = this.closeTimeout;
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

  private toKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  private async clearPattern(client: Ioredis, pattern: string, signal: AbortSignal): Promise<void> {
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

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#usage)
   */
  public async write(
    args: Pick<IStorage.WriteArgs<Uint8Array<ArrayBuffer>>, "key" | "data" | "signal" | "vars">,
  ): Promise<void> {
    this.assertRepairAllowed(args);
    const { client } = this.con!;
    const { key, data, signal } = args;

    signal.throwIfAborted();

    await client.set(this.toKey(key), Buffer.from(data));
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#usage)
   */
  public async read(
    args: Pick<IStorage.ReadArgs, "key" | "signal">,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const { client } = this.con!;
    const { key, signal } = args;

    signal.throwIfAborted();

    const data = await client.getBuffer(this.toKey(key));
    if (data === null) {
      throw new KeyNotFoundError({ key });
    }

    return new Uint8Array(data);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#usage)
   */
  public async exists(args: Pick<IStorage.ExistsArgs, "key" | "signal">): Promise<boolean> {
    const { client } = this.con!;
    const { key, signal } = args;

    signal.throwIfAborted();

    return (await client.exists(this.toKey(key))) > 0;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#usage)
   */
  public async delete(args: Pick<IStorage.DeleteArgs, "key" | "signal">): Promise<void> {
    const { client } = this.con!;
    const { key, signal } = args;

    signal.throwIfAborted();

    await client.del(this.toKey(key));
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#usage)
   */
  public async clear(args: Pick<IStorage.ClearArgs, "signal">): Promise<void> {
    const { client } = this.con!;
    const { signal } = args;

    signal.throwIfAborted();

    // prefix が空文字の場合は MATCH "*" となり、選択中のデータベースの全キーが対象になります。
    const pattern = `${this.keyPrefix}*`;
    await this.clearPattern(client, pattern, signal);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#streams)
   */
  public getWritable(
    args: Pick<IStorage.GetWritableArgs, "key" | "signal" | "vars">,
  ): WritableStream<Uint8Array<ArrayBuffer>> {
    this.assertRepairAllowed(args);
    const { client } = this.con!;
    const { key, signal } = args;

    signal.throwIfAborted();

    const dest = this.toKey(key);
    // 一意なサフィックスにより、同一キーへの並行書き込みでも一時キーが衝突しません。
    const tmp = `${dest}.${randomUUID()}.tmp`;

    // 中断と失敗のどちらからでも後始末が走るため、完了処理は一度だけ行います。
    let finished = false;
    const removeAbortListener = (): void => {
      signal.removeEventListener("abort", onAbort);
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

    signal.addEventListener("abort", onAbort, { once: true });

    return new WritableStream<Uint8Array<ArrayBuffer>>({
      async start() {
        try {
          signal.throwIfAborted();
          // 0 バイトの書き込みでも close 時の RENAME が成功するよう、空の文字列で一時キーを作ります。
          await client.set(tmp, "");
        } catch (ex) {
          await finish();
          throw ex;
        }
      },
      async write(chunk) {
        signal.throwIfAborted();
        try {
          await client.append(tmp, Buffer.from(chunk));
        } catch (ex) {
          await finish();
          throw ex;
        }
      },
      async close() {
        signal.throwIfAborted();
        try {
          // 全チャンクの追記が完了した時点で初めて最終キーへ置き換えます (swap-on-close)。
          await client.rename(tmp, dest);
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

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#streams)
   */
  public getReadable(
    args: Pick<IStorage.GetReadableArgs, "key" | "signal">,
  ): ReadableStream<Uint8Array<ArrayBuffer>> {
    const { client } = this.con!;
    const { key, signal } = args;

    signal.throwIfAborted();

    const dest = this.toKey(key);
    let sent = false;

    // Redis の GET は値を一括で返すため、取得したバイト列を単一のチャンクとして送出します。
    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      async pull(controller) {
        if (sent) {
          controller.close();
          return;
        }

        sent = true;
        signal.throwIfAborted();

        const data = await client.getBuffer(dest);
        if (data === null) {
          throw new KeyNotFoundError({ key });
        }

        controller.enqueue(new Uint8Array(data));
        controller.close();
      },
    });
  }
}
