import { type IStorage, KeyNotFoundError } from "@unikvs/core";
import { throwIfAborted, toAbortPromise } from "abort-signal-utils";

import {
  InvalidChunkTypeError,
  InvalidNamespaceError,
  InvalidMaxEntriesError,
  InvalidTtlSecondsError,
} from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#vercel-runtime-cache)
 */
export type VercelRuntimeCacheBackend = {
  /**
   * 値を取り出します。
   *
   * @param key 取得するキーです。
   *
   * @returns 取得した値です。
   */
  get(key: string): unknown;

  /**
   * 値を保存します。
   *
   * @param key 保存先のキーです。
   * @param value 保存する値です。
   * @param options 保存に渡す任意項目です。
   *
   * @returns 保存結果です。
   */
  set(key: string, value: unknown, options?: { ttlSeconds?: number }): unknown;

  /**
   * 保持する値をすべて削除します。
   *
   * @returns 削除が完了したら解決します。
   */
  clear?(): unknown;

  /**
   * 値を削除します。
   *
   * @param key 削除するキーです。
   *
   * @returns 削除結果です。
   */
  delete(key: string): unknown;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#vercel-runtime-cache)
 */
export type VercelRuntimeCacheOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#vercel-runtime-cache-ttl-seconds)
   */
  readonly ttlSeconds?: number | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#vercel-runtime-cache-max-entries)
   */
  readonly maxEntries?: number | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#vercel-runtime-cache-namespace)
   */
  readonly namespace?: string | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#vercel-runtime-cache-clone)
   */
  readonly clone?: (<T>(value: T) => T) | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#vercel-runtime-cache-backend)
   */
  readonly backend?: VercelRuntimeCacheBackend | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#vercel-runtime-cache-now)
   */
  readonly now?: (() => number) | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#vercel-runtime-cache)
 */
export const DEFAULT_TTL_SECONDS = 60;

/**
 * 内部で保持するキャッシュ項目の形状です。
 */
type CacheEntry = {
  /**
   * 保存する値です。
   */
  value: unknown;

  /**
   * 失効する時刻です。
   */
  expiresAt: number | undefined;
};

/**
 * 実行環境からランタイムキャッシュのバックエンドを検出します。
 *
 * 見つからないときは undefined を返します。
 *
 * @returns 検出したバックエンドです。未検出時は undefined です。
 */
function detectVercelRuntimeCache(): VercelRuntimeCacheBackend | undefined {
  const g = globalThis as Record<string, any>;
  const candidates: unknown[] = [
    g["__VERCEL_RUNTIME_CACHE__"],
    g["__vercel_runtime_cache__"],
    g["vercel"]?.["runtimeCache"],
    g["vercel"]?.["cache"],
  ];
  let backend: VercelRuntimeCacheBackend | undefined = undefined;

  for (const candidate of candidates) {
    if (
      candidate !== null &&
      typeof candidate === "object" &&
      typeof (candidate as VercelRuntimeCacheBackend).get === "function" &&
      typeof (candidate as VercelRuntimeCacheBackend).set === "function" &&
      typeof (candidate as VercelRuntimeCacheBackend).delete === "function"
    ) {
      backend = candidate as VercelRuntimeCacheBackend;

      break;
    }
  }

  return backend;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#vercel-runtime-cache)
 */
export default class VercelRuntimeCache implements IStorage {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#vercel-runtime-cache)
   */
  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#vercel-runtime-cache)
   */
  public readonly ttlSeconds: number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#vercel-runtime-cache)
   */
  public readonly maxEntries: number | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#vercel-runtime-cache)
   */
  public readonly namespace: string;

  /**
   * 値の複製に使う関数です。
   */
  readonly #clone: <T>(value: T) => T;

  /**
   * 使用するバックエンドです。未検出時は undefined です。
   */
  readonly #backend: VercelRuntimeCacheBackend | undefined;

  /**
   * 現在時刻を返す関数です。
   */
  readonly #now: () => number;

  /**
   * バックエンド未検出時に使うフォールバックの Map です。
   */
  readonly #fallback: Map<string, CacheEntry>;

  /**
   * バックエンドに書き込んだキーの集合です。
   *
   * `clear` 時に個別削除するために保持します。
   */
  readonly #backendKeys: Set<string>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#vercel-runtime-cache)
   */
  public constructor(options: VercelRuntimeCacheOptions = {}) {
    const {
      now = (): number => Date.now(),
      clone = <T>(value: T): T => structuredClone(value),
      backend,
      namespace = "",
      maxEntries,
      ttlSeconds = DEFAULT_TTL_SECONDS,
    } = options;

    if (typeof ttlSeconds !== "number" || !Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      throw new InvalidTtlSecondsError({ actual: ttlSeconds });
    }

    if (maxEntries !== undefined) {
      if (!Number.isInteger(maxEntries) || maxEntries < 0) {
        throw new InvalidMaxEntriesError({ actual: maxEntries });
      }
    }

    if (typeof namespace !== "string") {
      throw new InvalidNamespaceError({ actual: namespace });
    }

    this.name = "VercelRuntimeCache";
    this.ttlSeconds = ttlSeconds;
    this.maxEntries = maxEntries;
    this.namespace = namespace;
    this.#clone = clone;
    this.#backend = backend ?? detectVercelRuntimeCache();
    this.#now = now;
    this.#fallback = new Map();
    this.#backendKeys = new Set();
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#vercel-runtime-cache)
   */
  public get backend(): VercelRuntimeCacheBackend | undefined {
    return this.#backend;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#vercel-runtime-cache)
   */
  public get size(): number {
    this.#purgeExpiredFallback();

    return this.#fallback.size;
  }

  /**
   * ストレージがオープン済みかどうかです。
   *
   * 常に真を返します。
   *
   * @returns オープン済みなら真です。
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * ストレージをオープンします。
   *
   * 接続を持たないため中断確認のみ行います。
   *
   * @param c オープンコンテキストです。
   *
   * @returns オープンが完了したら解決します。
   */
  public async open(c: IStorage.OpenContext): Promise<void> {
    throwIfAborted(c.signal);
    await Promise.resolve();
  }

  /**
   * ストレージをクローズします。
   *
   * 接続を持たないため中断確認のみ行います。
   *
   * @param c クローズコンテキストです。
   *
   * @returns クローズが完了したら解決します。
   */
  public async close(c: IStorage.CloseContext): Promise<void> {
    throwIfAborted(c.signal);
    await Promise.resolve();
  }

  /**
   * 値を書き込みます。
   *
   * 複製して有効期限付きで保存します。
   *
   * @param c 書き込みコンテキストです。
   * @param data 保存する値です。
   *
   * @returns 書き込みが完了したら解決します。
   */
  public async write(c: IStorage.WriteContext, data: any): Promise<void> {
    throwIfAborted(c.signal);
    const storedValue = this.#clone(data);
    const expiresAt = this.#expiresAt();

    if (this.#backend !== undefined) {
      const storedKey = this.#storageKey(c.key);
      const envelope: CacheEntry = {
        value: storedValue,
        expiresAt,
      };
      await this.#backend.set(storedKey, envelope, { ttlSeconds: this.ttlSeconds });
      this.#backendKeys.add(storedKey);

      return;
    }

    const storedKey = this.#storageKey(c.key);

    if (this.#fallback.has(storedKey)) {
      this.#fallback.delete(storedKey);
    }

    this.#fallback.set(storedKey, {
      value: storedValue,
      expiresAt,
    });

    if (this.maxEntries === 0) {
      this.#fallback.delete(storedKey);

      return;
    }

    this.#evictFallbackIfNeeded();
  }

  /**
   * 値を読み取ります。
   *
   * 失効済みは欠番として扱います。
   *
   * @param c 読み取りコンテキストです。
   *
   * @returns 読み取った値です。
   */
  public async read(c: IStorage.ReadContext): Promise<any> {
    throwIfAborted(c.signal);

    if (this.#backend !== undefined) {
      using abortPromise = toAbortPromise(c.signal);
      const storedKey = this.#storageKey(c.key);
      const raw = await Promise.race([this.#backend.get(storedKey), abortPromise]);

      if (raw === undefined) {
        throw new KeyNotFoundError({ key: c.key });
      }

      const entry = raw as CacheEntry;

      if (
        entry === null ||
        typeof entry !== "object" ||
        !("value" in (entry as Record<string, unknown>))
      ) {
        return this.#clone(raw);
      }

      if (this.#isExpired(entry)) {
        await this.#backend.delete(storedKey);
        this.#backendKeys.delete(storedKey);
        throw new KeyNotFoundError({ key: c.key });
      }

      return this.#clone(entry.value);
    }

    return this.#readFallback(c.key);
  }

  /**
   * キーの存在を確認します。
   *
   * 失効済みは存在しないものとして扱います。
   *
   * @param c 存在確認コンテキストです。
   *
   * @returns 存在すれば真です。
   */
  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    throwIfAborted(c.signal);

    if (this.#backend !== undefined) {
      using abortPromise = toAbortPromise(c.signal);
      const storedKey = this.#storageKey(c.key);
      const raw = await Promise.race([this.#backend.get(storedKey), abortPromise]);

      if (raw === undefined) {
        return false;
      }

      const entry = raw as CacheEntry;

      if (
        entry === null ||
        typeof entry !== "object" ||
        !("value" in (entry as Record<string, unknown>))
      ) {
        return true;
      }

      if (this.#isExpired(entry)) {
        await this.#backend.delete(storedKey);
        this.#backendKeys.delete(storedKey);

        return false;
      }

      return true;
    }

    const storedKey = this.#storageKey(c.key);
    const entry = this.#fallback.get(storedKey);

    if (entry === undefined) {
      return false;
    }

    if (this.#isExpired(entry)) {
      this.#fallback.delete(storedKey);

      return false;
    }

    return true;
  }

  /**
   * キーを削除します。
   *
   * 失効済みや欠番は欠番として扱います。
   *
   * @param c 削除コンテキストです。
   *
   * @returns 削除が完了したら解決します。
   */
  public async delete(c: IStorage.DeleteContext): Promise<void> {
    throwIfAborted(c.signal);

    if (this.#backend !== undefined) {
      using abortPromise = toAbortPromise(c.signal);
      const storedKey = this.#storageKey(c.key);
      const raw = await Promise.race([this.#backend.get(storedKey), abortPromise]);

      if (raw === undefined) {
        throw new KeyNotFoundError({ key: c.key });
      }

      const entry = raw as CacheEntry;

      if (
        entry !== null &&
        typeof entry === "object" &&
        "value" in (entry as Record<string, unknown>) &&
        this.#isExpired(entry)
      ) {
        await this.#backend.delete(storedKey);
        this.#backendKeys.delete(storedKey);
        throw new KeyNotFoundError({ key: c.key });
      }

      await this.#backend.delete(storedKey);
      this.#backendKeys.delete(storedKey);

      return;
    }

    const storedKey = this.#storageKey(c.key);
    const entry = this.#fallback.get(storedKey);

    if (entry === undefined) {
      throw new KeyNotFoundError({ key: c.key });
    }

    if (this.#isExpired(entry)) {
      this.#fallback.delete(storedKey);
      throw new KeyNotFoundError({ key: c.key });
    }

    this.#fallback.delete(storedKey);
  }

  /**
   * 保持する値をすべて削除します。
   *
   * バックエンドとフォールバックの双方を掃除します。
   *
   * @param c クリアコンテキストです。
   *
   * @returns 削除が完了したら解決します。
   */
  public async clear(c: IStorage.ClearContext): Promise<void> {
    throwIfAborted(c.signal);

    if (this.#backend !== undefined) {
      if (typeof this.#backend.clear === "function") {
        await this.#backend.clear();
        this.#backendKeys.clear();

        return;
      }

      for (const storedKey of this.#backendKeys) {
        throwIfAborted(c.signal);

        await this.#backend.delete(storedKey);
      }

      this.#backendKeys.clear();
    }

    this.#fallback.clear();
  }

  /**
   * 書き込み用ストリームを取得します。
   *
   * チャンクを蓄積し、`close` 時にまとめて保存します。
   *
   * @param c 書き込みストリーム取得コンテキストです。
   *
   * @returns 書き込み用ストリームです。
   */
  public getWritable(c: IStorage.GetWritableContext): WritableStream<Uint8Array<ArrayBuffer>> {
    throwIfAborted(c.signal);
    const chunks: Uint8Array[] = [];
    const stream = new WritableStream<Uint8Array<ArrayBuffer>>({
      close: async (): Promise<void> => {
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const merged = new Uint8Array(totalLength);
        let offset = 0;

        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.byteLength;
        }

        await this.write(c, merged);
      },
      write: (chunk): void => {
        throwIfAborted(c.signal);

        if (!(chunk instanceof Uint8Array)) {
          throw new InvalidChunkTypeError({
            key: c.key,
            chunk,
          });
        }

        chunks.push(this.#clone(chunk));
      },
    });

    return stream;
  }

  /**
   * 読み取り用ストリームを取得します。
   *
   * 保存値を単一チャンクとして送出します。
   *
   * @param c 読み取りストリーム取得コンテキストです。
   *
   * @returns 読み取り用ストリームを解決します。
   */
  public async getReadable(
    c: IStorage.GetReadableContext,
  ): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
    throwIfAborted(c.signal);
    const value = await this.read(c as unknown as IStorage.ReadContext);
    const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull: (controller): void => {
        if (!(value instanceof Uint8Array)) {
          throw new InvalidChunkTypeError({
            key: c.key,
            chunk: value,
          });
        }

        controller.enqueue(this.#clone(value) as Uint8Array<ArrayBuffer>);
        controller.close();
      },
    });

    return stream;
  }

  /**
   * 名前空間を付与した保存キーを組み立てます。
   *
   * @param key 変換する論理キーです。
   *
   * @returns 保存に使う実キーです。
   */
  #storageKey(key: string): string {
    return this.namespace === "" ? key : `${this.namespace}:${key}`;
  }

  /**
   * 新規エントリの失効時刻を計算します。
   *
   * @returns 失効する時刻です。
   */
  #expiresAt(): number {
    return this.#now() + this.ttlSeconds * 1000;
  }

  /**
   * エントリが失効しているかどうかを判定します。
   *
   * @param entry 判定するエントリです。
   *
   * @returns 失効していれば真です。
   */
  #isExpired(entry: CacheEntry): boolean {
    return entry.expiresAt !== undefined && entry.expiresAt <= this.#now();
  }

  /**
   * フォールバックから失効済みエントリを掃除します。
   */
  #purgeExpiredFallback(): void {
    for (const [storedKey, entry] of this.#fallback) {
      if (this.#isExpired(entry)) {
        this.#fallback.delete(storedKey);
      }
    }
  }

  /**
   * フォールバックのエントリを最新使用として付け替えます。
   *
   * @param storedKey 付け替える保存キーです。
   */
  #touchFallback(storedKey: string): void {
    const entry = this.#fallback.get(storedKey) as CacheEntry;

    this.#fallback.delete(storedKey);
    this.#fallback.set(storedKey, entry);
  }

  /**
   * 上限を超えたフォールバックの古いエントリを追い出します。
   */
  #evictFallbackIfNeeded(): void {
    if (this.maxEntries === undefined) {
      return;
    }

    while (this.#fallback.size > this.maxEntries) {
      const oldest = this.#fallback.keys().next().value;

      if (oldest === undefined) {
        break;
      }

      this.#fallback.delete(oldest);
    }

    if (this.maxEntries === 0) {
      this.#fallback.clear();
    }
  }

  /**
   * フォールバックから値を読み取ります。
   *
   * 失効済みや欠番は欠番として扱います。
   *
   * @param key 読み取る論理キーです。
   *
   * @returns 読み取った値です。
   */
  #readFallback(key: string): unknown {
    const storedKey = this.#storageKey(key);
    const entry = this.#fallback.get(storedKey);

    if (entry === undefined) {
      throw new KeyNotFoundError({ key });
    }

    if (this.#isExpired(entry)) {
      this.#fallback.delete(storedKey);
      throw new KeyNotFoundError({ key });
    }

    this.#touchFallback(storedKey);

    return this.#clone(entry.value);
  }
}
