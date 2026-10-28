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
 * 進行中の `open()` を共有するための状態です。
 */
type OpenSession = {
  /**
   * 接続処理の完了を待つプロミスです。
   */
  promise: Promise<void>;

  /**
   * 接続処理が作成したクライアントです。
   *
   * 接続を公開した後は `null` になります。
   */
  client: RedisClient | null;

  /**
   * `close()` によって接続処理がキャンセルされたかどうかです。
   */
  cancelled: boolean;
};

/**
 * `open()` の接続待ち中に `close()` されたときのエラーメッセージです。
 */
const OPEN_CANCELLED_MESSAGE = "Redis was closed while opening.";

/**
 * Redis の `SCAN` 1 回あたりにヒントとして渡すキー数です。
 * 削除の往復回数と 1 回の `DEL` に渡す引数数を抑えるために使用します。
 */
const SCAN_COUNT = 1000;

/**
 * Redis の `MATCH` でリテラル文字列として扱うため、グロブのメタ文字をエスケープします。
 *
 * `MATCH` は `*`、`?`、`[...]`、`\` を特別に解釈するため、キープレフィックスをそのまま連結すると意図しないキーが対象になります。
 *
 * @param value エスケープする文字列です。
 *
 * @returns グロブのメタ文字をエスケープした文字列です。
 */
function escapeRedisGlob(value: string): string {
  return value.replaceAll(/[\\*?[\]]/gu, "\\$&");
}

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
   * 進行中の `open()` です。
   *
   * 並行した `open()` は同じ接続処理を共有し、接続の二重作成を防ぎます。
   */
  #opening: OpenSession | null;

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
    this.#opening = null;
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
   * 並行して呼び出された場合は同じ接続処理を共有します。
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

    // すでに接続処理が進行中の場合は、その結果を共有して接続を二重に作らないようにします。
    // 完了後に改めて呼ばれた場合は、従来どおり古い接続を閉じて開き直します。
    const pending = this.#opening;

    if (pending !== null) {
      return pending.promise;
    }

    // オープン済みの場合は古い接続を閉じ、開き直しでリークしないようにします。
    if (this.#con) {
      this.#closeClient();
    }

    const session: OpenSession = {
      client: null,
      promise: Promise.resolve(),
      cancelled: false,
    };
    session.promise = this.#connect(session);
    this.#opening = session;

    try {
      await session.promise;
    } finally {
      // `close()` によるキャンセル後は別のセッションが登録されている可能性があるため、自分のセッションだけを外します。
      if (this.#opening === session) {
        this.#opening = null;
      }
    }
  }

  /**
   * ストレージをクローズします。
   *
   * クライアントを閉じて参照を外します。
   * 接続処理が進行中の場合は、その処理をキャンセルします。
   *
   * @param _c クローズコンテキストです。
   */
  public close(_c: IStorage.CloseContext): void {
    const pending = this.#opening;

    if (pending !== null) {
      pending.cancelled = true;
      this.#opening = null;
      this.#releaseSessionClient(pending);

      return;
    }

    this.#closeClient();
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

    return this.#readValue(client, c.key, c.signal);
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
   * キーの値を別のキーへ複製します。
   *
   * 複製先が存在する場合は上書きします。
   * `COPY` の `REPLACE` を使い、複製元の有効期限もそのまま引き継ぎます。
   *
   * @param c 複製元と複製先のキーを持つコンテキストです。
   *
   * @returns 複製が完了したら解決します。
   */
  public async copy(c: IStorage.CopyContext): Promise<void> {
    const { client } = this.#getConnection();

    c.signal.throwIfAborted();

    const src = this.#toKey(c.key);
    const dest = this.#toKey(c.destinationKey);

    // 同じキーへの複製は値の存在確認だけを行います。
    if (c.key === c.destinationKey) {
      if (!(await this.#keyExists(client, c.key))) {
        throw new KeyNotFoundError({ key: c.key });
      }

      return;
    }

    // `COPY` は複製元が存在しないとき 0 を返すため、欠番を明示的にエラーへ変換します。
    const copied = await client.copy(src, dest, "REPLACE");

    if (copied === 0) {
      throw new KeyNotFoundError({ key: c.key });
    }
  }

  /**
   * キーの値を別のキーへ移動します。
   *
   * `RENAME` で移動先を上書きし、移動元を削除します。
   *
   * @param c 移動元と移動先のキーを持つコンテキストです。
   *
   * @returns 移動が完了したら解決します。
   */
  public async move(c: IStorage.MoveContext): Promise<void> {
    const { client } = this.#getConnection();

    c.signal.throwIfAborted();

    const src = this.#toKey(c.key);
    const dest = this.#toKey(c.destinationKey);

    // 同じキーへの移動は値の存在確認だけを行い、削除しません。
    if (c.key === c.destinationKey) {
      if (!(await this.#keyExists(client, c.key))) {
        throw new KeyNotFoundError({ key: c.key });
      }

      return;
    }

    try {
      // `RENAME` は移動先を上書きし、移動元を削除します。
      await client.rename(src, dest);
    } catch (ex) {
      // `RENAME` は移動元が存在しないときサーバーエラーを返すため、欠番を統一します。
      if (!(await this.#keyExists(client, c.key))) {
        throw new KeyNotFoundError({ key: c.key });
      }

      throw ex;
    }
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
    // プレフィックスはリテラルとして扱う必要があるため、グロブのメタ文字をエスケープします。
    const prefix = this.#keyPrefix;
    const pattern = `${escapeRedisGlob(prefix)}*`;

    let cursor = "0";

    do {
      c.signal.throwIfAborted();

      const [nextCursor, keys] = await client.scan(cursor, "MATCH", pattern, "COUNT", SCAN_COUNT);

      // エスケープ漏れやサーバー実装差に備え、削除前にもプレフィックスを確認します。
      const targets = keys.filter((key) => key.startsWith(prefix));

      if (targets.length > 0) {
        await client.del(...targets);
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

    let sent = false;

    // Redis の GET は値を一括で返すため、取得したバイト列を単一のチャンクとして送出します。
    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull: async (controller) => {
        if (sent) {
          controller.close();

          return;
        }

        sent = true;

        controller.enqueue(await this.#readValue(client, c.key, c.signal));
        controller.close();
      },
    });
  }

  /**
   * キーの値を取得し、契約どおりのバイト列へ正規化します。
   *
   * @param client 取得に使うクライアントです。
   * @param key 取得する論理キーです。
   * @param signal 中断を知らせるシグナルです。
   *
   * @returns 取得したバイト列です。
   */
  async #readValue(
    client: RedisClient,
    key: string,
    signal: AbortSignal,
  ): Promise<Uint8Array<ArrayBuffer>> {
    signal.throwIfAborted();

    const data = await client.getBuffer(this.#toKey(key));

    if (data === null) {
      throw new KeyNotFoundError({ key });
    }

    // Bun は Buffer を返すため、契約どおりの Uint8Array へ正規化します。
    return new Uint8Array(data);
  }

  /**
   * キーが存在するかどうかを確認します。
   *
   * 中断の確認は呼び出し側で行います。
   *
   * @param client 操作に使うクライアントです。
   * @param key 確認する論理キーです。
   *
   * @returns キーが存在すれば真です。
   */
  async #keyExists(client: RedisClient, key: string): Promise<boolean> {
    return client.exists(this.#toKey(key));
  }

  /**
   * セッションの接続を確立し、ストレージへ公開します。
   *
   * 接続待ちの間に `close()` された場合は接続を閉じ、状態を公開しません。
   *
   * @param session 接続処理の状態です。
   *
   * @returns オープンが完了したら解決します。
   */
  async #connect(session: OpenSession): Promise<void> {
    const { RedisClient: RedisClientImpl } = await import("bun");

    if (session.cancelled) {
      throw new TypeError(OPEN_CANCELLED_MESSAGE);
    }

    const client = new RedisClientImpl(this.#url, this.#options);
    session.client = client;

    try {
      // 最初のコマンドまで接続しないクライアントのため、open の時点で接続を確立します。
      await client.connect();
    } catch (ex) {
      this.#releaseSessionClient(session);

      // キャンセルによる切断は、接続失敗ではなくキャンセルとして統一します。
      if (session.cancelled) {
        throw new TypeError(OPEN_CANCELLED_MESSAGE, { cause: ex });
      }

      throw ex;
    }

    // 接続待ちの間に `close()` されていた場合は、接続を公開せずに閉じます。
    if (session.cancelled) {
      this.#releaseSessionClient(session);
      throw new TypeError(OPEN_CANCELLED_MESSAGE);
    }

    // 所有権を `#con` へ移し、キャンセル時の後始末対象から外します。
    session.client = null;
    this.#con = { client };

    // 接続を公開した時点で進行中セッションを解除します。
    // `open()` の finally まで待つと、公開直後の `close()` が進行中セッションだけをキャンセルします。
    // 公開済みの接続は閉じられません。
    if (this.#opening === session) {
      this.#opening = null;
    }
  }

  /**
   * セッションが保持するクライアントを閉じます。
   *
   * 未作成またはすでに閉じている場合は何もしません。
   *
   * @param session 接続処理の状態です。
   */
  #releaseSessionClient(session: OpenSession): void {
    const client = session.client;

    session.client = null;

    if (client !== null) {
      try {
        client.close();
      } catch {
        // 後始末としてのクローズなので、失敗しても接続処理の結果を上書きしません。
      }
    }
  }

  /**
   * 開いているクライアントを閉じます。
   *
   * `open()` の再接続からも呼べるよう、クローズコンテキストは受け取りません。
   * サブクラスが公開 `close()` をオーバーライドしても、再接続時にはこのメソッドが使われます。
   */
  #closeClient(): void {
    // 未オープン時の `close()` は従来どおり `TypeError` にします。
    this.#getConnection().client.close();
    this.#con = null;
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
