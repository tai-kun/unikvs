import { KeyNotFoundError, type IStorage } from "@unikvs/core";

import {
  InvalidChunkTypeError,
  InvalidMaxEntriesError,
  InvalidNamespaceError,
  InvalidTtlSecondsError,
} from "./errors.js";

/**
 * Vercel Runtime Cache のバックエンドとして使う最小インターフェースです。
 *
 * `get` / `set` / `delete` を実装していれば、テスト用の疑似実装も注入できます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#usage)
 */
export type VercelRuntimeCacheBackend = {
  get(key: string): unknown;
  set(key: string, value: unknown, options?: { ttlSeconds?: number }): unknown;
  delete(key: string): unknown;
  clear?(): unknown;
};

/**
 * `VercelRuntimeCache` のコンストラクターオプションです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#usage)
 */
export type VercelRuntimeCacheOptions = {
  /**
   * エントリの有効期限 (秒) です。既定値は 60 です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#usage)
   */
  readonly ttlSeconds?: number | undefined;

  /**
   * 保持するエントリの最大数です。未指定なら無制限です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#usage)
   */
  readonly maxEntries?: number | undefined;

  /**
   * バックエンドのキーに付与する名前空間です。既定値は空文字です。
   *
   * 複数のストレージで同じバックエンドを共有するときに使います。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#usage)
   */
  readonly namespace?: string | undefined;

  /**
   * 値の複製に使用する関数です。既定では `structuredClone` を使います。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#usage)
   */
  readonly clone?: (<T>(value: T) => T) | undefined;

  /**
   * 使用するバックエンドです。
   *
   * 未指定のときは Vercel のランタイムキャッシュを自動検出し、
   * 見つからなければプロセス内の `Map` にフォールバックします。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#usage)
   */
  readonly backend?: VercelRuntimeCacheBackend | undefined;

  /**
   * 現在時刻を返す関数です。テストで時刻を固定するときに使います。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#usage)
   */
  readonly now?: (() => number) | undefined;
};

/**
 * 既定の有効期限 (秒) です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#usage)
 */
export const DEFAULT_TTL_SECONDS = 60;

type CacheEntry = {
  value: unknown;
  expiresAt: number | undefined;
};

function detectVercelRuntimeCache(): VercelRuntimeCacheBackend | undefined {
  const g = globalThis as Record<string, any>;
  const candidates: unknown[] = [
    g["__VERCEL_RUNTIME_CACHE__"],
    g["__vercel_runtime_cache__"],
    g["vercel"]?.["runtimeCache"],
    g["vercel"]?.["cache"],
  ];
  for (const candidate of candidates) {
    if (
      candidate !== null &&
      typeof candidate === "object" &&
      typeof (candidate as VercelRuntimeCacheBackend).get === "function" &&
      typeof (candidate as VercelRuntimeCacheBackend).set === "function" &&
      typeof (candidate as VercelRuntimeCacheBackend).delete === "function"
    ) {
      return candidate as VercelRuntimeCacheBackend;
    }
  }

  return undefined;
}

/**
 * Vercel Runtime Cache を使うストレージです。
 *
 * Vercel のランタイムキャッシュが検出できればそれを使い、
 * 見つからなければプロセス内の `Map` にフォールバックします。
 * どちらの場合も TTL と最大件数による追い出しを行います。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#usage)
 */
export default class VercelRuntimeCache implements IStorage {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#usage)
   */
  public readonly name: string;

  /**
   * エントリの有効期限 (秒) です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#usage)
   */
  public readonly ttlSeconds: number;

  /**
   * 保持するエントリの最大数です。未指定なら無制限です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#usage)
   */
  public readonly maxEntries: number | undefined;

  /**
   * バックエンドのキーに付与する名前空間です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#usage)
   */
  public readonly namespace: string;

  readonly #clone: <T>(value: T) => T;

  readonly #backend: VercelRuntimeCacheBackend | undefined;

  readonly #now: () => number;

  readonly #fallback: Map<string, CacheEntry>;

  readonly #backendKeys: Set<string>;

  /**
   * Vercel Runtime Cache ストレージを作成します。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#usage)
   */
  public constructor(options: VercelRuntimeCacheOptions = {}) {
    const {
      ttlSeconds = DEFAULT_TTL_SECONDS,
      maxEntries,
      namespace = "",
      clone = (value) => structuredClone(value),
      backend,
      now = () => Date.now(),
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
   * 使用中のバックエンドです。検出できなかった場合は `undefined` です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#usage)
   */
  public get backend(): VercelRuntimeCacheBackend | undefined {
    return this.#backend;
  }

  /**
   * フォールバックの `Map` が保持している有効なエントリ数です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/vercel-runtime-cache#usage)
   */
  public get size(): number {
    this.#purgeExpiredFallback();
    return this.#fallback.size;
  }

  public get isOpen(): boolean {
    return true;
  }

  public async open(c: IStorage.OpenContext): Promise<void> {
    c.signal.throwIfAborted();
  }

  public async close(c: IStorage.CloseContext): Promise<void> {
    c.signal.throwIfAborted();
  }

  #storageKey(key: string): string {
    return this.namespace === "" ? key : `${this.namespace}:${key}`;
  }

  #expiresAt(): number {
    return this.#now() + this.ttlSeconds * 1000;
  }

  #isExpired(entry: CacheEntry): boolean {
    return entry.expiresAt !== undefined && entry.expiresAt <= this.#now();
  }

  #purgeExpiredFallback(): void {
    for (const [storedKey, entry] of this.#fallback) {
      if (this.#isExpired(entry)) {
        this.#fallback.delete(storedKey);
      }
    }
  }

  #touchFallback(storedKey: string): void {
    const entry = this.#fallback.get(storedKey) as CacheEntry;

    this.#fallback.delete(storedKey);
    this.#fallback.set(storedKey, entry);
  }

  #evictFallbackIfNeeded(): void {
    if (this.maxEntries === undefined) {
      return;
    }

    while (this.#fallback.size > this.maxEntries) {
      const oldest = this.#fallback.keys().next().value as string | undefined;
      if (oldest === undefined) {
        break;
      }

      this.#fallback.delete(oldest);
    }

    if (this.maxEntries === 0) {
      this.#fallback.clear();
    }
  }

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

  public async write(c: IStorage.WriteContext, data: any): Promise<void> {
    c.signal.throwIfAborted();
    const storedValue = this.#clone(data);
    const expiresAt = this.#expiresAt();

    if (this.#backend !== undefined) {
      const storedKey = this.#storageKey(c.key);
      const envelope: CacheEntry = { value: storedValue, expiresAt };
      await this.#backend.set(storedKey, envelope, { ttlSeconds: this.ttlSeconds });
      this.#backendKeys.add(storedKey);
      return;
    }

    const storedKey = this.#storageKey(c.key);
    if (this.#fallback.has(storedKey)) {
      this.#fallback.delete(storedKey);
    }

    this.#fallback.set(storedKey, { value: storedValue, expiresAt });

    if (this.maxEntries === 0) {
      this.#fallback.delete(storedKey);
      return;
    }

    this.#evictFallbackIfNeeded();
  }

  public async read(c: IStorage.ReadContext): Promise<any> {
    c.signal.throwIfAborted();

    if (this.#backend !== undefined) {
      const storedKey = this.#storageKey(c.key);
      const raw = await this.#backend.get(storedKey);
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

  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    c.signal.throwIfAborted();

    if (this.#backend !== undefined) {
      const storedKey = this.#storageKey(c.key);
      const raw = await this.#backend.get(storedKey);
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

  public async delete(c: IStorage.DeleteContext): Promise<void> {
    c.signal.throwIfAborted();

    if (this.#backend !== undefined) {
      const storedKey = this.#storageKey(c.key);
      const raw = await this.#backend.get(storedKey);
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

  public async clear(_c: IStorage.ClearContext): Promise<void> {
    if (this.#backend !== undefined) {
      if (typeof this.#backend.clear === "function") {
        await this.#backend.clear();
        this.#backendKeys.clear();
        return;
      }

      for (const storedKey of this.#backendKeys) {
        await this.#backend.delete(storedKey);
      }

      this.#backendKeys.clear();
    }

    this.#fallback.clear();
  }

  public getWritable(c: IStorage.GetWritableContext): WritableStream<Uint8Array<ArrayBuffer>> {
    c.signal.throwIfAborted();
    const chunks: Uint8Array[] = [];
    const stream = new WritableStream<Uint8Array<ArrayBuffer>>({
      write: (chunk) => {
        if (!(chunk instanceof Uint8Array)) {
          throw new InvalidChunkTypeError({ key: c.key, chunk });
        }

        chunks.push(this.#clone(chunk));
      },
      close: async () => {
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const merged = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.byteLength;
        }

        await this.write(c as IStorage.WriteContext, merged);
      },
    });

    return stream;
  }

  public async getReadable(
    c: IStorage.GetReadableContext,
  ): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
    c.signal.throwIfAborted();
    const value = await this.read(c as unknown as IStorage.ReadContext);
    const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull: (controller) => {
        if (!(value instanceof Uint8Array)) {
          throw new InvalidChunkTypeError({ key: c.key, chunk: value });
        }

        controller.enqueue(this.#clone(value) as Uint8Array<ArrayBuffer>);
        controller.close();
      },
    });

    return stream;
  }
}
