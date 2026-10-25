import { type IStorage, KeyNotFoundError } from "@unikvs/core";
import { throwIfAborted, toAbortPromise } from "abort-signal-utils";
import { Etcd3 } from "etcd3";

import { InvalidLeaseTtlError, InvalidEndpointsError } from "./errors.js";

/**
 * `put` に渡せる etcd 固有のオプションです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#etcdputoptions)
 */
export type EtcdPutOptions = {
  /**
   * キーに付与するリースの TTL (秒) です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#etcdputoptions-leasettlseconds)
   */
  readonly leaseTtlSeconds?: number | undefined;
};

/**
 * `getAll` が返すキーと値の組の形式です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#etcdgetallresult)
 */
export type EtcdGetAllResult =
  | Record<string, Uint8Array | string | Buffer>
  | ReadonlyMap<string, Uint8Array | string | Buffer>
  | Iterable<readonly [string, Uint8Array | string | Buffer]>;

/**
 * etcd クライアントの最小インターフェースです。
 *
 * テストではこのインターフェースを満たすフェイクを注入し、実環境では `endpoints` から組み立てた etcd3 クライアントを使います。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#etcdclientlike)
 */
export type EtcdClientLike = {
  get(key: string): Promise<Uint8Array | string | Buffer | null | undefined>;

  put(key: string, value: Uint8Array | string | Buffer, options?: EtcdPutOptions): Promise<unknown>;

  delete(key: string): Promise<unknown>;

  getAll(prefix: string): Promise<EtcdGetAllResult>;

  deletePrefix?(prefix: string): Promise<unknown>;

  close?(): unknown;
};

/**
 * etcd3 パッケージのクライアントのうち、本パッケージが使う最小部分です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#nativeetcdclientlike)
 */
export type NativeEtcdClientLike = {
  get(key: string | Buffer): { buffer(): Promise<Buffer | null> };

  getAll(): {
    prefix(value: string | Buffer): { buffers(): Promise<Record<string, Buffer>> };
  };

  put(key: string | Buffer): { value(value: string | Buffer): unknown };

  delete(): {
    key(value: string | Buffer): { exec(): unknown };
    prefix(value: string | Buffer): { exec(): unknown };
  };

  lease(ttl: number): {
    put(key: string | Buffer): { value(value: string | Buffer): unknown };
    release(): void;
  };

  close(): void;
};

/**
 * etcd3 のネイティブクライアントを `EtcdClientLike` に適合させます。
 *
 * `leaseTtlSeconds` が指定されているとき、書き込みはリース付きで行われます。
 * リースは遅延生成して使い回し、`close` で解放します (キーは TTL で自然消滅します)。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#wrapnativeetcdclient)
 */
export function wrapNativeEtcdClient(
  raw: NativeEtcdClientLike,
  leaseTtlSeconds?: number,
): EtcdClientLike & { close(): void } {
  // リースは TTL ごとに使い回します。
  const leases = new Map<
    number,
    {
      put(key: string | Buffer): { value(value: string | Buffer): unknown };
      release(): void;
    }
  >();

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

      let lease = leases.get(ttl);

      if (lease === undefined) {
        lease = raw.lease(ttl);
        leases.set(ttl, lease);
      }

      await lease.put(key).value(data);
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
      for (const lease of leases.values()) {
        lease.release();
      }

      leases.clear();
      raw.close();
    },
  };
}

function collectKeys(result: EtcdGetAllResult): readonly string[] {
  if (result instanceof Map) {
    return [...result.keys()];
  }

  if (
    typeof result === "object" &&
    result !== null &&
    Symbol.iterator in result &&
    typeof (result as Iterable<readonly [string, unknown]>)[Symbol.iterator] === "function"
  ) {
    return [...(result as Iterable<readonly [string, unknown]>)].map(([key]) => key);
  }

  return Object.keys(result);
}

function toBytes(data: Uint8Array | string | Buffer): Uint8Array<ArrayBuffer> {
  // etcd3 の値はバイト列 (`Buffer`) で返ります。
  // 文字列で返された場合は UTF-8 として復元します。
  // いずれも複写して返すため、呼び出し側の変更は保存値に波及しません。
  return typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
}

/**
 * etcd ストレージのオプションです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#etcdstorageoptions)
 */
export type EtcdStorageOptions = {
  /**
   * 注入する etcd クライアントです。
   *
   * 指定したときは `endpoints` を使った接続は行われず、`open` / `close` でこのクライアントを開閉したことになります。
   * 所有権は呼び出し側に残るため、`close` しても破棄されません。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#etcdstorageoptions-client)
   */
  readonly client?: EtcdClientLike | undefined;

  /**
   * 接続先の etcd エンドポイントです。
   *
   * `client` を指定したときは使われません。
   * 未指定のときは `ETCD_ENDPOINTS` 環境変数 (カンマ区切り)、さらに未指定のときは `http://127.0.0.1:2379` を使います。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#etcdstorageoptions-endpoints)
   */
  readonly endpoints?: string | readonly string[] | undefined;

  /**
   * すべてのキーに付与する接頭辞です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#etcdstorageoptions-keyprefix)
   */
  readonly keyPrefix?: string | undefined;

  /**
   * すべての書き込みに付与するリースの TTL (秒) です。
   *
   * サービスディスカバリーや分散ロックなど、自動失効させたい用途に使います。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#etcdstorageoptions-leasettlseconds)
   */
  readonly leaseTtlSeconds?: number | undefined;

  /**
   * `keyPrefix` の前に付与する名前空間です。
   *
   * 複数のテナントや用途で etcd クラスターを共有するときに使います。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#etcdstorageoptions-namespace)
   */
  readonly namespace?: string | undefined;
};

const DEFAULT_KEY_PREFIX = "unikvs:";

const DEFAULT_ENDPOINT = "http://127.0.0.1:2379";

function normalizeEndpoints(endpoints: string | readonly string[] | undefined): readonly string[] {
  if (endpoints === undefined) {
    return [];
  }

  return typeof endpoints === "string" ? [endpoints] : [...endpoints];
}

type Connection = {
  readonly client: EtcdClientLike;

  readonly onClose: (() => unknown) | null;
};

/**
 * etcd 上のストレージです。
 *
 * 値はバイト列として保存し、キーには `namespace` と `keyPrefix` を付与します。
 * 注入した `client` は呼び出し側が所有し、`close` しても破棄されません。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#etcd)
 */
export default class Etcd implements IStorage {
  #con: Connection | null;

  readonly #injected: EtcdClientLike | undefined;

  readonly #endpoints: readonly string[];

  readonly #prefix: string;

  readonly #leaseTtlSeconds: number | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/etcd#etcd)
   */
  public readonly name: string;

  /**
   * etcd ストレージを作成します。
   *
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

  public get isOpen(): boolean {
    return this.#con !== null;
  }

  // 開いている接続を返します。
  // 未オープン時は `TypeError` を投げます。
  #getConnection(): Connection {
    const con = this.#con;

    if (con === null) {
      throw new TypeError("Etcd is not open. Call open() first.");
    }

    return con;
  }

  public async open(_c: IStorage.OpenContext): Promise<void> {
    // 並行 `open` 同士および `open` 接続待ち中の `close` の同時呼び出しは禁止 (事前条件) です。
    // 呼び出し側で直列化してください。
    if (this.#con) {
      await this.close(_c as unknown as IStorage.CloseContext);
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

  public async close(_c: IStorage.CloseContext): Promise<void> {
    // 未 `open`・二重 `close` は `TypeError` で reject されます。
    // 必ず `await` し、結果を浮かせないでください。
    const { onClose } = this.#getConnection();

    // 先行 null 化により、並行 `close` 同士は二重クローズになりません。
    this.#con = null;

    // 注入クライアントの所有権は呼び出し側にあるため、ここでは破棄しません。
    await onClose?.();
  }

  #toKey(key: string): string {
    return `${this.#prefix}${key}`;
  }

  #putOptions(): EtcdPutOptions | undefined {
    return this.#leaseTtlSeconds === undefined
      ? undefined
      : { leaseTtlSeconds: this.#leaseTtlSeconds };
  }

  public async write(c: IStorage.WriteContext, data: Uint8Array<ArrayBuffer>): Promise<void> {
    const { client } = this.#getConnection();

    throwIfAborted(c.signal);

    // etcd の値はバイト列で扱い、`Buffer` 経由で透過させます (redis 方式)。
    await client.put(this.#toKey(c.key), Buffer.from(data), this.#putOptions());
  }

  public async read(c: IStorage.ReadContext): Promise<Uint8Array<ArrayBuffer>> {
    const { client } = this.#getConnection();

    throwIfAborted(c.signal);
    using abortPromise = toAbortPromise(c.signal);

    const data = await Promise.race([client.get(this.#toKey(c.key)), abortPromise]);

    if (data === null || data === undefined) {
      throw new KeyNotFoundError({ key: c.key });
    }

    return toBytes(data);
  }

  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    const { client } = this.#getConnection();

    throwIfAborted(c.signal);
    using abortPromise = toAbortPromise(c.signal);

    const data = await Promise.race([client.get(this.#toKey(c.key)), abortPromise]);

    return data !== null && data !== undefined;
  }

  public async delete(c: IStorage.DeleteContext): Promise<void> {
    const { client } = this.#getConnection();

    throwIfAborted(c.signal);

    // 存在しないキーの削除は成功扱いです (redis の `del` と同じ)。
    await client.delete(this.#toKey(c.key));
  }

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

  public getReadable(c: IStorage.GetReadableContext): ReadableStream<Uint8Array<ArrayBuffer>> {
    const { client } = this.#getConnection();

    throwIfAborted(c.signal);

    const dest = this.#toKey(c.key);
    const key = c.key;
    let sent = false;

    // etcd の GET は値を一括で返すため、取得したバイト列を単一のチャンクとして送出します。
    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      async pull(controller) {
        if (sent) {
          controller.close();

          return;
        }

        sent = true;
        throwIfAborted(c.signal);
        using abortPromise = toAbortPromise(c.signal);

        const data = await Promise.race([client.get(dest), abortPromise]);

        if (data === null || data === undefined) {
          throw new KeyNotFoundError({ key });
        }

        controller.enqueue(toBytes(data));
        controller.close();
      },
    });
  }
}
