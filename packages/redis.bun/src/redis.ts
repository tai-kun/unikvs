import type { IStorage } from "@unikvs/core";
import type { RedisClient, RedisOptions } from "bun";

import { KeyNotFoundError, UnsupportedRuntimeError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-bun#usage)
 */
export type RedisStorageOptions = RedisOptions & {
  /**
   * すべてのキーの先頭に付与するプレフィックスです。
   *
   * キーを名前空間で分離し、`clear()` が削除する範囲を限定します。空文字を指定するとキーをそのまま使います。
   */
  readonly keyPrefix?: string;
};

/**
 * ストレージの動作に必要な接続を保持する型定義です。
 */
type Connection = {
  /**
   * Bun の Redis クライアントです。
   */
  readonly client: RedisClient;
};

/**
 * Redis の `SCAN` 1 回あたりにヒントとして渡すキー数です。
 * 削除の往復回数と 1 回の `DEL` に渡す引数数を抑えるために使用します。
 */
const SCAN_COUNT = 1000;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-bun#usage)
 */
export default class Redis implements IStorage {
  /**
   * Redis クライアントのインスタンスを保持します。
   *
   * ストレージがオープンされるまで null です。
   */
  private con: Connection | null;

  /**
   * 接続先の URL です。
   *
   * 未指定の場合はクライアントが環境変数 (`REDIS_URL`、`VALKEY_URL`) から解決します。
   */
  private readonly url: string | undefined;

  /**
   * `RedisClient` の初期化に使用する設定オブジェクトです。
   */
  private readonly options: RedisOptions;

  /**
   * すべてのキーの先頭に付与するプレフィックスです。
   */
  private readonly keyPrefix: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-bun#usage)
   */
  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-bun#usage)
   */
  public constructor(url?: string, options: RedisStorageOptions = {}) {
    const { keyPrefix = "unikvs:", ...redisOptions } = options;
    this.name = "Redis";
    this.con = null;
    this.url = url;
    this.options = redisOptions;
    this.keyPrefix = keyPrefix;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-bun#usage)
   */
  public get isOpen(): boolean {
    return !!this.con;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-bun#usage)
   */
  public async open(): Promise<void> {
    // Bun 以外のランタイムで誤って使われた場合に、原因の分かるエラーを返します。
    if (typeof Bun === "undefined") {
      throw new UnsupportedRuntimeError();
    }

    // オープン済みの場合は古い接続を閉じ、開き直しでリークしないようにします。
    if (this.con) {
      this.close();
    }

    const { RedisClient: RedisClientImpl } = await import("bun");
    const client = new RedisClientImpl(this.url, this.options);
    try {
      // 最初のコマンドまで接続しないクライアントのため、open の時点で接続を確立します。
      await client.connect();
    } catch (ex) {
      client.close();
      throw ex;
    }

    this.con = { client };
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-bun#usage)
   */
  public close(): void {
    this.con!.client.close();
    this.con = null;
  }

  /**
   * unikvs のキーにプレフィックスを付与し、Redis のキーへ変換します。
   */
  private toKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-bun#usage)
   */
  public async write(
    args: Pick<IStorage.WriteArgs<Uint8Array<ArrayBuffer>>, "key" | "data" | "signal">,
  ): Promise<void> {
    const { client } = this.con!;
    const { key, data, signal } = args;

    signal?.throwIfAborted();

    // Bun のクライアントは ArrayBufferView をそのままバイナリーとして送信します。
    await client.set(this.toKey(key), data);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-bun#usage)
   */
  public async read(
    args: Pick<IStorage.ReadArgs, "key" | "signal">,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const { client } = this.con!;
    const { key, signal } = args;

    signal?.throwIfAborted();

    const data = await client.getBuffer(this.toKey(key));
    if (data === null) {
      throw new KeyNotFoundError({ key });
    }

    // Bun は Buffer を返すため、契約どおりの Uint8Array へ正規化します。
    return new Uint8Array(data);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-bun#usage)
   */
  public async exists(args: Pick<IStorage.ExistsArgs, "key" | "signal">): Promise<boolean> {
    const { client } = this.con!;
    const { key, signal } = args;

    signal?.throwIfAborted();

    // Bun のクライアントは EXISTS の整数を真偽値に変換して返します。
    return await client.exists(this.toKey(key));
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-bun#usage)
   */
  public async delete(args: Pick<IStorage.DeleteArgs, "key" | "signal">): Promise<void> {
    const { client } = this.con!;
    const { key, signal } = args;

    signal?.throwIfAborted();

    // 存在しないキーの削除は 0 を返すだけでエラーになりません。
    await client.del(this.toKey(key));
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-bun#usage)
   */
  public async clear(args: { signal?: AbortSignal } = {}): Promise<void> {
    const { client } = this.con!;
    const { signal } = args;

    signal?.throwIfAborted();

    // prefix が空文字の場合は MATCH "*" となり、選択中のデータベースの全キーが対象になります。
    const pattern = `${this.keyPrefix}*`;

    let cursor = "0";
    do {
      signal?.throwIfAborted();

      const [nextCursor, keys] = await client.scan(cursor, "MATCH", pattern, "COUNT", SCAN_COUNT);
      if (keys.length > 0) {
        await client.del(...keys);
      }

      cursor = nextCursor;
    } while (cursor !== "0");
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-bun#streams)
   */
  public getWritable(
    args: Pick<IStorage.GetWritableArgs, "key"> & { signal?: AbortSignal },
  ): WritableStream<Uint8Array<ArrayBuffer>> {
    const { client } = this.con!;
    const { key, signal } = args;

    signal?.throwIfAborted();

    const dest = this.toKey(key);
    // 一意なサフィックスにより、同一キーへの並行書き込みでも一時キーが衝突しないようにします。
    const tmp = `${dest}.${Bun.randomUUIDv7()}.tmp`;

    // 中断と失敗のどちらからでも後始末が走るため、完了処理は一度だけ行います。
    let finished = false;
    const removeAbortListener = (): void => {
      signal?.removeEventListener("abort", onAbort);
    };
    const discardTemporary = async (): Promise<void> => {
      try {
        await client.del(tmp);
      } catch {
        // 後始末としての削除なので、失敗しても無視します。
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

    signal?.addEventListener("abort", onAbort, { once: true });

    return new WritableStream<Uint8Array<ArrayBuffer>>({
      async start() {
        try {
          signal?.throwIfAborted();
          // 0 バイトの書き込みでも close 時の RENAME が成功するよう、空の文字列で一時キーを作ります。
          await client.set(tmp, "");
        } catch (ex) {
          await finish();
          throw ex;
        }
      },
      async write(chunk) {
        signal?.throwIfAborted();
        try {
          await client.append(tmp, chunk);
        } catch (ex) {
          await finish();
          throw ex;
        }
      },
      async close() {
        signal?.throwIfAborted();
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
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-bun#streams)
   */
  public getReadable(
    args: Pick<IStorage.GetReadableArgs, "key" | "signal">,
  ): ReadableStream<Uint8Array<ArrayBuffer>> {
    const { client } = this.con!;
    const { key, signal } = args;

    signal?.throwIfAborted();

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
        signal?.throwIfAborted();

        const data = await client.getBuffer(dest);
        if (data === null) {
          throw new KeyNotFoundError({ key });
        }

        // Bun は Buffer を返すため、契約どおりの Uint8Array へ正規化します。
        controller.enqueue(new Uint8Array(data));
        controller.close();
      },
    });
  }
}
