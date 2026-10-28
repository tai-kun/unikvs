import { type IStorage, KeyNotFoundError } from "@unikvs/core";
import { throwIfAborted, toAbortPromise } from "abort-signal-utils";
import { Etcd3 } from "etcd3";

import { InvalidLeaseTtlError, InvalidEndpointsError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#etcdputoptions)
 */
export type EtcdPutOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#etcdputoptions-leasettlseconds)
   */
  readonly leaseTtlSeconds?: number | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#etcdgetallresult)
 */
export type EtcdGetAllResult =
  | Record<string, Uint8Array | string | Buffer>
  | ReadonlyMap<string, Uint8Array | string | Buffer>
  | Iterable<readonly [string, Uint8Array | string | Buffer]>;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#etcdclientlike)
 */
export type EtcdClientLike = {
  /**
   * キーの値を取り出します。
   *
   * @param key 取得するキーです。
   *
   * @returns 取得した値です。欠番時は null や undefined です。
   */
  get(key: string): Promise<Uint8Array | string | Buffer | null | undefined>;

  /**
   * キーに値を保存します。
   *
   * @param key 保存先のキーです。
   * @param value 保存する値です。
   * @param options 保存に渡す任意項目です。
   *
   * @returns 保存が完了したら解決します。
   */
  put(key: string, value: Uint8Array | string | Buffer, options?: EtcdPutOptions): Promise<unknown>;

  /**
   * キーを削除します。
   *
   * @param key 削除するキーです。
   *
   * @returns 削除が完了したら解決します。
   */
  delete(key: string): Promise<unknown>;

  /**
   * 接頭辞に一致する値をまとめて取得します。
   *
   * @param prefix 取得する接頭辞です。
   *
   * @returns 取得したキーと値の組です。
   */
  getAll(prefix: string): Promise<EtcdGetAllResult>;

  /**
   * 接頭辞に一致する値をまとめて削除します。
   *
   * @param prefix 削除する接頭辞です。
   *
   * @returns 削除が完了したら解決します。
   */
  deletePrefix?(prefix: string): Promise<unknown>;

  /**
   * クライアントを閉じます。
   *
   * @returns 閉じた結果です。
   */
  close?(): unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#nativeetcdclientlike)
 */
export type NativeEtcdClientLike = {
  /**
   * キーの取得要求を作ります。
   *
   * @param key 取得するキーです。
   *
   * @returns 取得要求です。
   */
  get(key: string | Buffer): { buffer(): Promise<Buffer | null> };

  /**
   * まとめて取得する要求を作ります。
   *
   * @returns 一覧取得要求です。
   */
  getAll(): {
    prefix(value: string | Buffer): { buffers(): Promise<Record<string, Buffer>> };
  };

  /**
   * 保存要求を作ります。
   *
   * @param key 保存先のキーです。
   *
   * @returns 保存要求です。
   */
  put(key: string | Buffer): { value(value: string | Buffer): unknown };

  /**
   * 削除要求を作ります。
   *
   * @returns 削除要求です。
   */
  delete(): {
    key(value: string | Buffer): { exec(): unknown };
    prefix(value: string | Buffer): { exec(): unknown };
  };

  /**
   * リース付き操作の要求を作ります。
   *
   * @param ttl リースの TTL (秒) です。
   *
   * @returns リース付き要求です。
   */
  lease(ttl: number): {
    put(key: string | Buffer): { value(value: string | Buffer): unknown };
    release(): void;
  };

  /**
   * クライアントを閉じます。
   */
  close(): void;
};

/**
 * `raw.lease()` が返すリースの型です。
 */
type NativeLease = ReturnType<NativeEtcdClientLike["lease"]>;

/**
 * `etcd3` の `autoKeepAlive` を受け付けるリース生成関数の内部ビューです。
 */
type NativeLeaseFactory = (
  this: void,
  ttl: number,
  options?: { readonly autoKeepAlive?: boolean | undefined },
) => NativeLease;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#wrapnativeetcdclient)
 */
export function wrapNativeEtcdClient(
  raw: NativeEtcdClientLike,
  leaseTtlSeconds?: number,
): EtcdClientLike & { close(): void } {
  /**
   * 書き込み中のリースの集合です。
   *
   * `release()` はハートビートを止めるだけでキーを削除しない。
   * そのため、書き込みが終わればすぐに手放せます。
   * 保持するのは進行中の書き込みだけで、書き込み履歴では増えません。
   * close 時に解放するため、集合で保持します。
   */
  const leases = new Set<NativeLease>();

  const releaseLease = (lease: NativeLease): void => {
    // 既に解放済み (close 済みなど) なら二重に解放しません。
    if (!leases.delete(lease)) {
      return;
    }

    try {
      lease.release();
    } catch {
      // 後始末としての解放のため、失敗しても無視します。
    }
  };

  const createLease = (ttl: number): NativeLease => {
    // autoKeepAlive を有効にすると開いている間ずっとキーが残り、TTL が機能しません。
    // 書き込みごとに新しいリースを作り、その書き込みから TTL を数えさせます。
    // 公開型は最小契約に保ちつつ、etcd3 固有の autoKeepAlive をここでだけ指定します。
    const factory: NativeLeaseFactory = raw.lease.bind(raw);
    const lease = factory(ttl, { autoKeepAlive: false });
    leases.add(lease);

    return lease;
  };

  return {
    async get(key: string): Promise<Buffer | null> {
      return raw.get(key).buffer();
    },

    async put(
      key: string,
      value: Uint8Array | string | Buffer,
      options?: EtcdPutOptions,
    ): Promise<void> {
      const ttl = options?.leaseTtlSeconds ?? leaseTtlSeconds;
      const data = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);

      if (ttl === undefined) {
        await raw.put(key).value(data);

        return;
      }

      const lease = createLease(ttl);

      try {
        await lease.put(key).value(data);
      } finally {
        // 成否にかかわらず手放します。
        // `release()` はハートビートを止めるだけでキーを削除しない。
        // そのため、解放後もキーは書き込み時刻から TTL 経過まで残ります。
        releaseLease(lease);
      }
    },

    async delete(key: string): Promise<void> {
      await raw.delete().key(key).exec();
    },

    async getAll(prefix: string): Promise<Record<string, Buffer>> {
      return raw.getAll().prefix(prefix).buffers();
    },

    async deletePrefix(prefix: string): Promise<void> {
      await raw.delete().prefix(prefix).exec();
    },

    close(): void {
      for (const lease of leases) {
        releaseLease(lease);
      }

      raw.close();
    },
  };
}

/**
 * キーと値の組を反復できるかどうかを判定します。
 *
 * @param value 判定する値です。
 *
 * @returns 反復可能なキーと値の組なら真です。
 */
function isEntryIterable(
  value: unknown,
): value is Iterable<readonly [string, Uint8Array | string | Buffer]> {
  return (
    typeof value === "object" &&
    value !== null &&
    Symbol.iterator in value &&
    typeof (value as Iterable<readonly [string, unknown]>)[Symbol.iterator] === "function"
  );
}

/**
 * 取得結果からキーの一覧を取り出します。
 *
 * 配列や Map や反復可能のいずれにも対応します。
 *
 * @param result 取得結果です。
 *
 * @returns 取り出したキーの一覧です。
 */
function collectKeys(result: EtcdGetAllResult): readonly string[] {
  if (result instanceof Map) {
    return [...result.keys()];
  }

  if (isEntryIterable(result)) {
    return [...result].map(([key]) => key);
  }

  return Object.keys(result);
}

/**
 * 取得値をバイト列へ変換します。
 *
 * 文字列は UTF-8 として復元し、複写して返します。
 *
 * @param data 変換する取得値です。
 *
 * @returns 変換したバイト列です。
 */
function toBytes(data: Uint8Array | string | Buffer): Uint8Array<ArrayBuffer> {
  // etcd3 の値はバイト列 (`Buffer`) で返ります。
  // 文字列で返された場合は UTF-8 として復元します。
  // いずれも複写して返すため、呼び出し側の変更は保存値に波及しません。
  return typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#etcdstorageoptions)
 */
export type EtcdStorageOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#etcdstorageoptions-client)
   */
  readonly client?: EtcdClientLike | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#etcdstorageoptions-endpoints)
   */
  readonly endpoints?: string | readonly string[] | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#etcdstorageoptions-keyprefix)
   */
  readonly keyPrefix?: string | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#etcdstorageoptions-leasettlseconds)
   */
  readonly leaseTtlSeconds?: number | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#etcdstorageoptions-namespace)
   */
  readonly namespace?: string | undefined;
};

/**
 * 既定のキー接頭辞です。
 */
const DEFAULT_KEY_PREFIX = "unikvs:";

/**
 * 既定の接続先エンドポイントです。
 */
const DEFAULT_ENDPOINT = "http://127.0.0.1:2379";

/**
 * エンドポイント指定を配列へ正規化します。
 *
 * @param endpoints 正規化するエンドポイント指定です。
 *
 * @returns 正規化したエンドポイントの一覧です。
 */
function normalizeEndpoints(endpoints: string | readonly string[] | undefined): readonly string[] {
  if (endpoints === undefined) {
    return [];
  }

  return typeof endpoints === "string" ? [endpoints] : [...endpoints];
}

/**
 * ストレージの動作に必要な接続を保持する型定義です。
 */
type Connection = {
  /**
   * 操作に使うクライアントです。
   */
  readonly client: EtcdClientLike;

  /**
   * クローズ時に呼び出す後始末です。不要なら null です。
   */
  readonly onClose: (() => unknown) | null;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#etcd)
 */
export default class Etcd implements IStorage {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#etcd)
   */
  public readonly name: string;

  /**
   * etcd への接続を保持します。
   *
   * ストレージがオープンされるまで null です。
   */
  #con: Connection | null;

  /**
   * 注入されたクライアントです。
   *
   * 指定時は接続確立も破棄も行いません。
   */
  readonly #injected: EtcdClientLike | undefined;

  /**
   * 接続先エンドポイントの一覧です。
   */
  readonly #endpoints: readonly string[];

  /**
   * 名前空間と接頭辞を結合した実キーの接頭辞です。
   */
  readonly #prefix: string;

  /**
   * すべての書き込みに付与するリースの TTL (秒) です。
   *
   * 未指定のときはリースを付けません。
   */
  readonly #leaseTtlSeconds: number | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#etcd)
   */
  public constructor(options: EtcdStorageOptions = {}) {
    const {
      client,
      endpoints,
      keyPrefix = DEFAULT_KEY_PREFIX,
      namespace = "",
      leaseTtlSeconds,
    } = options;

    if (
      leaseTtlSeconds !== undefined &&
      (!Number.isInteger(leaseTtlSeconds) || leaseTtlSeconds <= 0)
    ) {
      throw new InvalidLeaseTtlError({ actual: leaseTtlSeconds });
    }

    const normalized = normalizeEndpoints(endpoints);

    if (
      endpoints !== undefined &&
      (normalized.length === 0 || normalized.some((endpoint) => endpoint === ""))
    ) {
      throw new InvalidEndpointsError({ actual: endpoints });
    }

    this.name = "Etcd";
    this.#con = null;
    this.#injected = client;
    this.#endpoints = normalized;
    this.#prefix = `${namespace}${keyPrefix}`;
    this.#leaseTtlSeconds = leaseTtlSeconds;
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
   * 注入クライアントがなければエンドポイントへ接続します。
   *
   * @param _c オープンコンテキストです。
   *
   * @returns オープンが完了したら解決します。
   */
  public async open(_c: IStorage.OpenContext): Promise<void> {
    // 並行 `open` 同士および `open` 接続待ち中の `close` の同時呼び出しは禁止 (事前条件) です。
    // 呼び出し側で直列化してください。
    if (this.#con) {
      await this.#teardownConnection();
    }

    // 空文字の環境変数は未指定として扱います (本パッケージ仕様)。
    const fromEnv = process.env["ETCD_ENDPOINTS"]
      ?.split(",")
      .map((endpoint) => endpoint.trim())
      .filter((endpoint) => endpoint !== "");
    let endpoints: readonly string[];

    if (this.#endpoints.length > 0) {
      endpoints = this.#endpoints;
    } else if (fromEnv !== undefined && fromEnv.length > 0) {
      endpoints = fromEnv;
    } else {
      endpoints = [DEFAULT_ENDPOINT];
    }

    if (this.#injected !== undefined) {
      this.#con = {
        client: this.#injected,
        onClose: null,
      };

      return;
    }

    const raw = new Etcd3({ hosts: [...endpoints] }) as unknown as NativeEtcdClientLike;
    const adapter = wrapNativeEtcdClient(raw, this.#leaseTtlSeconds);
    this.#con = {
      client: adapter,
      onClose: (): void => {
        adapter.close();
      },
    };
  }

  /**
   * ストレージをクローズします。
   *
   * 所有する接続のみ破棄し、注入クライアントは残します。
   *
   * @param _c クローズコンテキストです。
   *
   * @returns クローズが完了したら解決します。
   */
  public async close(_c: IStorage.CloseContext): Promise<void> {
    await this.#teardownConnection();
  }

  /**
   * バイト列を書き込みます。
   *
   * リース設定があれば期限付きで保存します。
   *
   * @param c 書き込みコンテキストです。
   * @param data 保存するバイト列です。
   *
   * @returns 書き込みが完了したら解決します。
   */
  public async write(c: IStorage.WriteContext, data: Uint8Array<ArrayBuffer>): Promise<void> {
    const { client } = this.#getConnection();

    throwIfAborted(c.signal);

    // etcd の値はバイト列で扱い、`Buffer` 経由で透過させます (redis 方式)。
    await client.put(this.#toKey(c.key), Buffer.from(data), this.#putOptions());
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

    return this.#readBytes(client, c.signal, c.key);
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

    throwIfAborted(c.signal);
    using abortPromise = toAbortPromise(c.signal);

    const data = await Promise.race([client.get(this.#toKey(c.key)), abortPromise]);

    return data !== null && data !== undefined;
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

    throwIfAborted(c.signal);

    // 存在しないキーの削除は成功扱いです (redis の `del` と同じ)。
    await client.delete(this.#toKey(c.key));
  }

  /**
   * 接頭辞配下のキーをすべて削除します。
   *
   * 範囲削除があれば使い、なければ列挙して削除します。
   *
   * @param c クリアコンテキストです。
   *
   * @returns 削除が完了したら解決します。
   */
  public async clear(c: IStorage.ClearContext): Promise<void> {
    const { client } = this.#getConnection();

    throwIfAborted(c.signal);
    using abortPromise = toAbortPromise(c.signal);

    // 接頭辞配下だけを削除し、名前空間外には触れません。
    if (client.deletePrefix !== undefined) {
      await client.deletePrefix(this.#prefix);

      return;
    }

    const keys = collectKeys(await Promise.race([client.getAll(this.#prefix), abortPromise]));

    for (const key of keys) {
      throwIfAborted(c.signal);

      // `getAll` の実装差で範囲外が混ざっても、接頭辞外は削除しません。
      if (key.startsWith(this.#prefix)) {
        await client.delete(key);
      }
    }
  }

  /**
   * 書き込み用ストリームを取得します。
   *
   * チャンクを蓄積し、close 時に単発で保存します。
   *
   * @param c 書き込みストリーム取得コンテキストです。
   *
   * @returns 書き込み用ストリームです。
   */
  public getWritable(c: IStorage.GetWritableContext): WritableStream<Uint8Array<ArrayBuffer>> {
    const { client } = this.#getConnection();

    throwIfAborted(c.signal);

    const dest = this.#toKey(c.key);
    const options = this.#putOptions();
    // etcd に rename 相当の操作はないため、チャンクを蓄積して close 時に単発 put します。
    const chunks: Uint8Array<ArrayBuffer>[] = [];

    return new WritableStream<Uint8Array<ArrayBuffer>>({
      abort() {
        chunks.length = 0;
      },
      async close() {
        throwIfAborted(c.signal);

        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const merged = new Uint8Array(totalLength);

        let offset = 0;

        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.byteLength;
        }

        await client.put(dest, Buffer.from(merged), options);
      },
      write(chunk) {
        throwIfAborted(c.signal);
        // 後からチャンクを書き換えても保存値が変わらないよう、複製して保持します。
        chunks.push(chunk.slice());
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

    throwIfAborted(c.signal);

    let sent = false;

    // etcd の GET は値を一括で返すため、取得したバイト列を単一のチャンクとして送出します。
    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull: async (controller) => {
        if (sent) {
          controller.close();

          return;
        }

        sent = true;

        controller.enqueue(await this.#readBytes(client, c.signal, c.key));
        controller.close();
      },
    });
  }

  /**
   * 接続からキーの値をバイト列として読み取ります。
   *
   * 中断済みなら開始前に中断理由を投げ、取得中は中断と競合させます。
   *
   * @param client 読み取りに使うクライアントです。
   * @param signal 中断を知らせるシグナルです。
   * @param key 読み取る論理キーです。
   *
   * @returns 読み取ったバイト列です。
   */
  async #readBytes(
    client: EtcdClientLike,
    signal: AbortSignal,
    key: string,
  ): Promise<Uint8Array<ArrayBuffer>> {
    throwIfAborted(signal);
    using abortPromise = toAbortPromise(signal);

    const data = await Promise.race([client.get(this.#toKey(key)), abortPromise]);

    if (data === null || data === undefined) {
      throw new KeyNotFoundError({ key });
    }

    return toBytes(data);
  }

  /**
   * 開いている接続を破棄します。
   *
   * 未オープン時は例外を投げます。
   *
   * @returns 破棄が完了したら解決します。
   */
  async #teardownConnection(): Promise<void> {
    // 未 `open`・二重 `close` は `TypeError` で reject されます。
    // 必ず `await` し、結果を浮かせないでください。
    const { onClose } = this.#getConnection();

    // 先行 null 化により、並行 `close` 同士は二重クローズになりません。
    this.#con = null;

    // 注入クライアントの所有権は呼び出し側にあるため、ここでは破棄しません。
    await onClose?.();
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
      throw new TypeError("Etcd is not open. Call open() first.");
    }

    return con;
  }

  /**
   * 論理キーに接頭辞を付与して実キーを組み立てます。
   *
   * @param key 変換する論理キーです。
   *
   * @returns etcd 上の実キーです。
   */
  #toKey(key: string): string {
    return `${this.#prefix}${key}`;
  }

  /**
   * 書き込み時に付与するリース設定を組み立てます。
   *
   * 未設定時は undefined を返します。
   *
   * @returns 書き込みに使うリース設定です。
   */
  #putOptions(): EtcdPutOptions | undefined {
    return this.#leaseTtlSeconds === undefined
      ? undefined
      : { leaseTtlSeconds: this.#leaseTtlSeconds };
  }
}
