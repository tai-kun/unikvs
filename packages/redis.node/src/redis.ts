import { randomUUID } from "node:crypto";

import { type IStorage, KeyNotFoundError } from "@unikvs/core";
import {
  type ClusterNode,
  type RedisOptions,
  type ClusterOptions,
  Redis as Ioredis,
} from "ioredis";

import {
  CloseTimeoutError,
  ConnectTimeoutError,
  ClusterNotSupportedError,
  InvalidCloseTimeoutError,
} from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#redisclusterspec)
 */
export type RedisClusterSpec = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#redisclusterspec-nodes)
   */
  readonly nodes: readonly ClusterNode[];

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#redisclusterspec-options)
   */
  readonly options?: ClusterOptions | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#redisstorageoptions)
 */
export type RedisStorageOptions = Omit<RedisOptions, "keyPrefix" | "lazyConnect"> & {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#redisstorageoptions-keyprefix)
   */
  readonly keyPrefix?: string | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#redisstorageoptions-cluster)
   */
  readonly cluster?: RedisClusterSpec | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#redisstorageoptions-closetimeout)
   */
  readonly closeTimeout?: number | undefined;
};

/**
 * `SCAN` 1 回あたりにヒントとして渡すキー数です。
 *
 * 削除の往復回数と 1 回の `DEL` に渡す引数数を抑えるために使用します。
 */
const SCAN_COUNT = 1000;

/**
 * 接続確立の既定タイムアウト (ミリ秒) です。
 */
const DEFAULT_CONNECT_TIMEOUT_MS = 5000;

/**
 * 切断処理の既定タイムアウト (ミリ秒) です。
 */
const DEFAULT_CLOSE_TIMEOUT_MS = 5000;

/**
 * ストレージの動作に必要な接続を保持する型定義です。
 */
type Connection = {
  /**
   * 操作に使うクライアントです。
   */
  readonly client: Ioredis;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#redis)
 */
export default class Redis implements IStorage {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#redis)
   */
  public readonly name: string;

  /**
   * Redis への接続を保持します。
   *
   * ストレージがオープンされるまで null です。
   */
  #con: Connection | null;

  /**
   * 接続先の URL です。
   *
   * 未指定の場合はクライアントが環境変数 (`REDIS_URL`、`VALKEY_URL`) から解決します。
   */
  readonly #url: string | undefined;

  /**
   * `closeTimeout` は本パッケージ固有の拡張です。
   *
   * `this.#options` には含めず、別フィールドで保管します。
   * `this.#options` は `new Ioredis` にそのまま spread できる透過バッグです。
   */
  readonly #options: Omit<RedisStorageOptions, "keyPrefix" | "cluster" | "closeTimeout">;

  /**
   * `close` 時の切断待ち時間 (ミリ秒) です。
   *
   * `ioredis` の `disconnectTimeout` (ソケット切断待機) とは別物です。
   */
  readonly #closeTimeout: number;

  /**
   * すべてのキーの先頭に付与するプレフィックスです。
   */
  readonly #keyPrefix: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-node#redis)
   */
  public constructor(url?: string, options: RedisStorageOptions = {}) {
    const {
      cluster,
      keyPrefix = "unikvs:",
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
    this.#con = null;
    this.#url = url;
    this.#options = redisOptions;
    this.#closeTimeout = closeTimeout;
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
   * `ioredis` クライアントを作成して接続します。
   *
   * @param _c オープンコンテキストです。
   *
   * @returns オープンが完了したら解決します。
   */
  public async open(_c: IStorage.OpenContext): Promise<void> {
    // 並行 `open` 同士および `open` 接続待ち中の `close` の同時呼び出しは禁止 (事前条件) です。
    // 呼び出し側で直列化してください。
    // 並行 `close` 同士は一方が `TypeError` reject する形で直列化されます。
    if (this.#con) {
      await this.close(_c as unknown as IStorage.CloseContext);
    }

    // 空文字の `url`・環境変数は未指定として扱います (本パッケージ仕様)。
    // `url` は `redis://` / `rediss://` 形式での指定を要求します。
    // 実行時の形式検証は行いません (bare 形式は非サポート・動作未保証)。
    const explicitUrl = this.#url === undefined || this.#url === "" ? undefined : this.#url;
    const redisUrl =
      process.env["REDIS_URL"] === undefined || process.env["REDIS_URL"] === ""
        ? undefined
        : process.env["REDIS_URL"];
    const valkeyUrl =
      process.env["VALKEY_URL"] === undefined || process.env["VALKEY_URL"] === ""
        ? undefined
        : process.env["VALKEY_URL"];
    const url = explicitUrl ?? redisUrl ?? valkeyUrl;
    const connectTimeout = this.#options.connectTimeout ?? DEFAULT_CONNECT_TIMEOUT_MS;

    // `ioredis` v6 のコンストラクタ型は `replyMapping` に明示 `undefined` を許しません。
    // `exactOptionalPropertyTypes` 下では spread のまま渡せないため型表明を付けます。
    // 実行時の値は変わらず、`replyMapping` を含む透過は保たれます。
    type ConnectOptions = RedisOptions & { replyMapping?: "legacy" };

    const options = {
      ...this.#options,
      lazyConnect: true,
      connectTimeout,
    } as ConnectOptions;
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

    this.#con = { client: raw };
  }

  /**
   * ストレージをクローズします。
   *
   * `quit` で丁寧に閉じ、失敗時は `disconnect` で掃除します。
   *
   * @param _c クローズコンテキストです。
   *
   * @returns クローズが完了したら解決します。
   */
  public async close(_c: IStorage.CloseContext): Promise<void> {
    // 未 `open`・二重 `close` は `TypeError` で reject されます。
    // 必ず `await` し、結果を浮かせないでください。
    const { client } = this.#getConnection();

    // 先行 null 化により、並行 `close` 同士は二重 `quit` になりません。
    this.#con = null;

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

  /**
   * バイト列を書き込みます。
   *
   * 指定したキーで値を上書きします。
   *
   * @param c 書き込みコンテキストです。
   * @param data 保存するバイト列です。
   *
   * @returns 書き込みが完了したら解決します。
   */
  public async write(c: IStorage.WriteContext, data: Uint8Array<ArrayBuffer>): Promise<void> {
    const { client } = this.#getConnection();

    c.signal.throwIfAborted();

    await client.set(this.#toKey(c.key), Buffer.from(data));
  }

  /**
   * バイト列を読み取ります。
   *
   * 指定したキーの値を取得します。
   *
   * @param c 読み取りコンテキストです。
   *
   * @returns 読み取ったバイト列です。
   */
  public async read(c: IStorage.ReadContext): Promise<Uint8Array<ArrayBuffer>> {
    const { client } = this.#getConnection();

    c.signal.throwIfAborted();

    const data = await client.getBuffer(this.#toKey(c.key));

    if (data === null) {
      throw new KeyNotFoundError({ key: c.key });
    }

    return new Uint8Array(data);
  }

  /**
   * キーの存在を確認します。
   *
   * @param c 存在確認コンテキストです。
   *
   * @returns 存在すれば真です。
   */
  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    const { client } = this.#getConnection();

    c.signal.throwIfAborted();

    return (await client.exists(this.#toKey(c.key))) > 0;
  }

  /**
   * キーを削除します。
   *
   * 存在しないキーも成功扱いにします。
   *
   * @param c 削除コンテキストです。
   *
   * @returns 削除が完了したら解決します。
   */
  public async delete(c: IStorage.DeleteContext): Promise<void> {
    const { client } = this.#getConnection();

    c.signal.throwIfAborted();

    await client.del(this.#toKey(c.key));
  }

  /**
   * 接頭辞に一致するキーをすべて削除します。
   *
   * `SCAN` で列挙しながら削除します。
   *
   * @param c クリアコンテキストです。
   *
   * @returns 削除が完了したら解決します。
   */
  public async clear(c: IStorage.ClearContext): Promise<void> {
    const { client } = this.#getConnection();

    c.signal.throwIfAborted();

    // prefix が空文字の場合は MATCH "*" となり、選択中のデータベースの全キーが対象になります。
    const pattern = `${this.#keyPrefix}*`;
    await this.#clearPattern(client, pattern, c.signal);
  }

  /**
   * 書き込み用ストリームを取得します。
   *
   * 一時キーに追記し、`close` 時に最終キーへ置き換えます。
   *
   * @param c 書き込みストリーム取得コンテキストです。
   *
   * @returns 書き込み用ストリームです。
   */
  public getWritable(c: IStorage.GetWritableContext): WritableStream<Uint8Array<ArrayBuffer>> {
    const { client } = this.#getConnection();

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
      if (finished) {
        return;
      }

      finished = true;
      removeAbortListener();
      await discardTemporary();
    };
    const onAbort = (): void => {
      void finish();
    };
    c.signal.addEventListener("abort", onAbort, { once: true });

    return new WritableStream<Uint8Array<ArrayBuffer>>({
      async abort() {
        await finish();
      },
      async close() {
        c.signal.throwIfAborted();
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
    });
  }

  /**
   * 読み取り用ストリームを取得します。
   *
   * 取得した値を単一チャンクとして送出します。
   *
   * @param c 読み取りストリーム取得コンテキストです。
   *
   * @returns 読み取り用ストリームです。
   */
  public getReadable(c: IStorage.GetReadableContext): ReadableStream<Uint8Array<ArrayBuffer>> {
    const { client } = this.#getConnection();

    c.signal.throwIfAborted();

    const dest = this.#toKey(c.key);
    let sent = false;

    // Redis の GET は値を一括で返すため、取得したバイト列を単一のチャンクとして送出します。
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

  /**
   * 開いている接続を返します。
   *
   * 未オープン時は例外を投げます。
   *
   * @returns オープン済みの接続です。
   */
  #getConnection(): Connection {
    const con = this.#con;

    if (con === null) {
      throw new TypeError("Redis is not open. Call open() first.");
    }

    return con;
  }

  /**
   * unikvs のキーにプレフィックスを付与し、Redis のキーへ変換します。
   *
   * @param key 変換する論理キーです。
   *
   * @returns Redis 上の実キーです。
   */
  #toKey(key: string): string {
    return `${this.#keyPrefix}${key}`;
  }

  /**
   * 接頭辞に一致するキーを走査して削除します。
   *
   * `SCAN` で頁送りしながら `DEL` します。
   *
   * @param client 操作に使うクライアントです。
   * @param pattern 削除対象の一致パターンです。
   * @param signal 中断を知らせるシグナルです。
   *
   * @returns 削除が完了したら解決します。
   */
  async #clearPattern(client: Ioredis, pattern: string, signal: AbortSignal): Promise<void> {
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
}
