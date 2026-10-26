import { type IStorage, KeyNotFoundError, UnsupportedRuntimeError } from "@unikvs/core";
import type { RedisClient, RedisOptions } from "bun";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-bun#redisstorageoptions)
 */
export type RedisStorageOptions = RedisOptions & {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-bun#redisstorageoptions-keyprefix)
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
 * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-bun#redis)
 */
export default class Redis implements IStorage {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-bun#redis)
   */
  public readonly name: string;

  /**
   * Redis クライアントのインスタンスを保持します。
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
   * `RedisClient` の初期化に使用する設定オブジェクトです。
   */
  readonly #options: RedisOptions;

  /**
   * すべてのキーの先頭に付与するプレフィックスです。
   */
  readonly #keyPrefix: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/redis-bun#redis)
   */
  public constructor(url?: string, options: RedisStorageOptions = {}) {
    const { keyPrefix = "unikvs:", ...redisOptions } = options;

    this.name = "Redis";
    this.#con = null;
    this.#url = url;
    this.#options = redisOptions;
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
   * Bun の Redis クライアントを接続します。
   *
   * @param _c オープンコンテキストです。
   *
   * @returns オープンが完了したら解決します。
   */
  public async open(_c: IStorage.OpenContext): Promise<void> {
    // Bun 以外のランタイムで誤って使われた場合に、原因の分かるエラーを返します。
    if (typeof Bun === "undefined") {
      throw new UnsupportedRuntimeError({
        name: this.name,
        runtime: "Bun",
      });
    }

    // オープン済みの場合は古い接続を閉じ、開き直しでリークしないようにします。
    if (this.#con) {
      this.close(_c as unknown as IStorage.CloseContext);
    }

    const { RedisClient: RedisClientImpl } = await import("bun");
    const client = new RedisClientImpl(this.#url, this.#options);

    try {
      // 最初のコマンドまで接続しないクライアントのため、open の時点で接続を確立します。
      await client.connect();
    } catch (ex) {
      client.close();
      throw ex;
    }

    this.#con = { client };
  }

  /**
   * ストレージをクローズします。
   *
   * クライアントを閉じて参照を外します。
   *
   * @param _c クローズコンテキストです。
   */
  public close(_c: IStorage.CloseContext): void {
    this.#getConnection().client.close();
    this.#con = null;
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

    // Bun のクライアントは ArrayBufferView をそのままバイナリーとして送信します。
    await client.set(this.#toKey(c.key), data);
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

    // Bun は Buffer を返すため、契約どおりの Uint8Array へ正規化します。
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

    // Bun のクライアントは EXISTS の整数を真偽値に変換して返します。
    return client.exists(this.#toKey(c.key));
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

    // 存在しないキーの削除は 0 を返すだけでエラーになりません。
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

    let cursor = "0";

    do {
      c.signal.throwIfAborted();

      const [nextCursor, keys] = await client.scan(cursor, "MATCH", pattern, "COUNT", SCAN_COUNT);

      if (keys.length > 0) {
        await client.del(...keys);
      }

      cursor = nextCursor;
    } while (cursor !== "0");
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
    // 一意なサフィックスにより、同一キーへの並行書き込みでも一時キーが衝突しないようにします。
    const tmp = `${dest}.${Bun.randomUUIDv7()}.tmp`;

    // 中断と失敗のどちらからでも後始末が走るため、完了処理は一度だけ行います。
    let finished = false;
    const removeAbortListener = (): void => {
      c.signal.removeEventListener("abort", onAbort);
    };
    const discardTemporary = async (): Promise<void> => {
      try {
        await client.del(tmp);
      } catch {
        // 後始末としての削除なので、失敗しても無視します。
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
          await client.append(tmp, chunk);
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

        // Bun は Buffer を返すため、契約どおりの Uint8Array へ正規化します。
        controller.enqueue(new Uint8Array(data));
        controller.close();
      },
    });
  }

  /**
   * オープン済みかを確認します。
   *
   * 未オープン時は例外を投げます。
   *
   * @returns オープン済みの接続です。
   */
  #getConnection(): Connection {
    if (this.#con === null) {
      throw new TypeError("Redis is not open. Call open() first.");
    }

    return this.#con;
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
}
