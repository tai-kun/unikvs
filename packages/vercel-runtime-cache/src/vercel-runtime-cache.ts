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
 * 値がキャッシュ項目のエンベロープかどうかを判定します。
 *
 * @param value 判定する値です。
 *
 * @returns エンベロープなら真です。
 */
function isCacheEntry(value: unknown): value is CacheEntry {
  return (
    value !== null && typeof value === "object" && "value" in (value as Record<string, unknown>)
  );
}

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
   * バックエンドに書き込んだキーと失効時刻の対応です。
   *
   * 挿入順を古い順として保持し、`clear` と `maxEntries` の追い出しに使います。
   */
  readonly #backendKeys: Map<string, number>;

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
    this.#backendKeys = new Map();
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
    await this.#writeValue(c.key, data, c.signal);
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

    return this.#readValue(c.key, c.signal);
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
      const raw = await this.#readRaw(this.#backend, abortPromise, storedKey);

      if (raw === undefined) {
        return false;
      }

      if (!isCacheEntry(raw)) {
        return true;
      }

      if (this.#isExpired(raw)) {
        await this.#deleteRaw(this.#backend, storedKey);

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
    await this.#deleteValue(c.key, c.signal);
  }

  /**
   * 現在のインスタンスが追跡している値を削除します。
   *
   * バックエンドを共有するとき、削除するのは現在のインスタンスが追跡しているキーだけです。同じ名前空間で他のインスタンスやプロセスが書き込んだキーは削除されません。
   * `maxEntries` と失効による削除もインスタンスごとの追跡に基づくため、共有バックエンドは `maxEntries` を超えるキーを保持することがあります。
   * `namespace` が空でバックエンドが `clear` を持つときは、バックエンド全体を削除します。
   *
   * @param c クリアコンテキストです。
   *
   * @returns 削除が完了したら解決します。
   */
  public async clear(c: IStorage.ClearContext): Promise<void> {
    throwIfAborted(c.signal);

    if (this.#backend !== undefined) {
      // 名前空間付きで共有バックエンドを使うとき、グローバルの clear は他の名前空間まで消してしまいます。
      if (this.namespace === "" && typeof this.#backend.clear === "function") {
        await this.#backend.clear();
        this.#backendKeys.clear();

        return;
      }

      for (const storedKey of this.#backendKeys.keys()) {
        throwIfAborted(c.signal);

        await this.#deleteRaw(this.#backend, storedKey);
      }

      this.#backendKeys.clear();
      this.#fallback.clear();

      return;
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
    const value = await this.#readValue(c.key, c.signal);
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
   * 値をバックエンドまたはフォールバックへ保存します。
   *
   * @param key 保存先の論理キーです。
   * @param data 保存する値です。
   * @param signal 中断を知らせるシグナルです。
   *
   * @returns 保存が完了したら解決します。
   */
  async #writeValue(key: string, data: any, signal: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    const storedValue = this.#clone(data);
    const expiresAt = this.#expiresAt();

    const backend = this.#backend;

    if (backend !== undefined) {
      if (this.maxEntries === 0) {
        return;
      }

      const storedKey = this.#storageKey(key);
      const envelope: CacheEntry = {
        value: storedValue,
        expiresAt,
      };
      await backend.set(storedKey, envelope, { ttlSeconds: this.ttlSeconds });
      this.#trackBackendKey(storedKey, expiresAt);

      await this.#evictBackendIfNeeded(backend);

      return;
    }

    const storedKey = this.#storageKey(key);

    if (this.#fallback.has(storedKey)) {
      this.#fallback.delete(storedKey);
    }

    this.#fallback.set(storedKey, {
      value: storedValue,
      expiresAt,
    });

    this.#evictFallbackIfNeeded();
  }

  /**
   * バックエンドまたはフォールバックから値を読み取ります。
   *
   * 失効済みや欠番は `KeyNotFoundError` として扱います。
   *
   * @param key 読み取る論理キーです。
   * @param signal 中断を知らせるシグナルです。
   *
   * @returns 読み取った値です。
   */
  async #readValue(key: string, signal: AbortSignal): Promise<any> {
    throwIfAborted(signal);

    if (this.#backend !== undefined) {
      using abortPromise = toAbortPromise(signal);
      const storedKey = this.#storageKey(key);
      const raw = await this.#readRaw(this.#backend, abortPromise, storedKey);

      if (raw === undefined) {
        throw new KeyNotFoundError({ key });
      }

      if (!isCacheEntry(raw)) {
        return this.#clone(raw);
      }

      if (this.#isExpired(raw)) {
        await this.#deleteRaw(this.#backend, storedKey);
        throw new KeyNotFoundError({ key });
      }

      return this.#clone(raw.value);
    }

    return this.#readFallback(key);
  }

  /**
   * バックエンドまたはフォールバックから値を削除します。
   *
   * 失効済みや欠番は `KeyNotFoundError` として扱います。
   *
   * @param key 削除する論理キーです。
   * @param signal 中断を知らせるシグナルです。
   *
   * @returns 削除が完了したら解決します。
   */
  async #deleteValue(key: string, signal: AbortSignal): Promise<void> {
    throwIfAborted(signal);

    if (this.#backend !== undefined) {
      using abortPromise = toAbortPromise(signal);
      const storedKey = this.#storageKey(key);
      const raw = await this.#readRaw(this.#backend, abortPromise, storedKey);

      if (raw === undefined) {
        throw new KeyNotFoundError({ key });
      }

      const expired = isCacheEntry(raw) && this.#isExpired(raw);

      await this.#deleteRaw(this.#backend, storedKey);

      if (expired) {
        throw new KeyNotFoundError({ key });
      }

      return;
    }

    const storedKey = this.#storageKey(key);
    const entry = this.#fallback.get(storedKey);

    if (entry === undefined) {
      throw new KeyNotFoundError({ key });
    }

    if (this.#isExpired(entry)) {
      this.#fallback.delete(storedKey);
      throw new KeyNotFoundError({ key });
    }

    this.#fallback.delete(storedKey);
  }

  /**
   * バックエンドから生の値を読み取ります。
   *
   * @param backend 読み取りに使うバックエンドです。
   * @param abortPromise 中断時に拒否されるプロミスです。
   * @param storedKey 保存に使う実キーです。
   *
   * @returns 読み取った生の値です。
   */
  #readRaw(
    backend: VercelRuntimeCacheBackend,
    abortPromise: PromiseLike<never>,
    storedKey: string,
  ): Promise<unknown> {
    return Promise.race([backend.get(storedKey), abortPromise]);
  }

  /**
   * バックエンドから値を削除し、書き込み済みキーの記録も外します。
   *
   * @param backend 削除に使うバックエンドです。
   * @param storedKey 削除する実キーです。
   *
   * @returns 削除が完了したら解決します。
   */
  async #deleteRaw(backend: VercelRuntimeCacheBackend, storedKey: string): Promise<void> {
    await backend.delete(storedKey);
    this.#backendKeys.delete(storedKey);
  }

  /**
   * バックエンドに書き込んだキーを最新として記録します。
   *
   * 同じキーを書き直したときは、挿入順の末尾へ移動します。
   *
   * @param storedKey 記録する実キーです。
   * @param expiresAt エントリの失効時刻です。
   */
  #trackBackendKey(storedKey: string, expiresAt: number): void {
    this.#backendKeys.delete(storedKey);
    this.#backendKeys.set(storedKey, expiresAt);
  }

  /**
   * バックエンドの追跡対象から失効済みのキーを削除します。
   *
   * 同じ TTL で書き込むため挿入順は失効順と一致し、先頭から確認します。
   *
   * @param backend 削除に使うバックエンドです。
   */
  async #purgeExpiredBackend(backend: VercelRuntimeCacheBackend): Promise<void> {
    const now = this.#now();

    for (const [storedKey, expiresAt] of this.#backendKeys) {
      if (expiresAt > now) {
        break;
      }

      await this.#deleteRaw(backend, storedKey);
    }
  }

  /**
   * バックエンドの追跡対象を上限まで減らします。
   *
   * 失効済みのキーを掃除してから、書き込みが古い順 (FIFO) にバックエンドから削除します。
   *
   * @param backend 削除に使うバックエンドです。
   */
  async #evictBackendIfNeeded(backend: VercelRuntimeCacheBackend): Promise<void> {
    await this.#purgeExpiredBackend(backend);

    if (this.maxEntries === undefined) {
      return;
    }

    while (this.#backendKeys.size > this.maxEntries) {
      const oldest = this.#backendKeys.keys().next().value;

      if (oldest === undefined) {
        break;
      }

      await backend.delete(oldest);
      this.#backendKeys.delete(oldest);
    }
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
   * 上限を超えたフォールバックの最も古く使われたエントリ (LRU) を追い出します。
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
