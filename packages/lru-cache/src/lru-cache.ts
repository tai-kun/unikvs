import { KeyNotFoundError, type IStorage } from "@unikvs/core";

import {
  InvalidChunkTypeError,
  InvalidMaxBytesError,
  InvalidMaxEntriesError,
  InvalidSizeOfResultError,
} from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#usage)
 */
export type LruCacheOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#usage)
   */
  readonly clone?: (<T>(value: T) => T) | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#usage)
   */
  readonly maxEntries?: number | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#usage)
   */
  readonly maxBytes?: number | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#usage)
   */
  readonly sizeOf?: ((value: any, key: string) => number) | undefined;
};

/**
 * 値が Uint8Array のときは byteLength を返し、それ以外は 1 を返します。
 */
function defaultSizeOf(value: any): number {
  if (value instanceof Uint8Array) {
    return value.byteLength;
  }

  return 1;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#usage)
 */
export default class LruCache implements IStorage {
  /**
   * キーと値のペアを保持する内部マップです。
   */
  private readonly map: Map<string, any>;

  /**
   * maxBytes 設定時にキーごとのバイト数を保持するマップです。
   */
  private readonly sizes: Map<string, number>;

  /**
   * maxBytes 設定時に追跡する総バイト数です。
   */
  private totalBytes: number;

  /**
   * オープン状態を保持するフラグです。
   */
  private opened: boolean;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#usage)
   */
  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#usage)
   */
  public readonly maxEntries: number | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#usage)
   */
  public readonly maxBytes: number | undefined;

  /**
   * データの複製に使用する関数です。
   */
  private readonly clone: <T>(value: T) => T;

  /**
   * キーごとのバイト数の計算に使用する関数です。
   */
  private readonly sizeOf: (value: any, key: string) => number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#usage)
   */
  public constructor(options: LruCacheOptions = {}) {
    const {
      clone = (value) => structuredClone(value),
      maxEntries,
      maxBytes,
      sizeOf = defaultSizeOf,
    } = options;
    if (maxEntries !== undefined) {
      if (!Number.isInteger(maxEntries) || maxEntries < 0) {
        throw new InvalidMaxEntriesError({ actual: maxEntries });
      }
    }

    if (maxBytes !== undefined) {
      if (typeof maxBytes !== "number" || !Number.isFinite(maxBytes) || maxBytes < 0) {
        throw new InvalidMaxBytesError({ actual: maxBytes });
      }
    }

    this.name = "LruCache";
    this.maxEntries = maxEntries === 0 ? 0 : maxEntries;
    this.maxBytes = maxBytes === 0 ? 0 : maxBytes;
    this.map = new Map();
    this.sizes = new Map();
    this.totalBytes = 0;
    this.opened = false;
    this.clone = clone;
    this.sizeOf = sizeOf;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#usage)
   */
  public get size(): number {
    return this.map.size;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#usage)
   */
  public get bytes(): number {
    if (this.maxBytes === undefined) {
      return 0;
    }

    return this.totalBytes;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#usage)
   */
  public get isOpen(): boolean {
    return this.opened;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#usage)
   */
  public async open(args: Pick<IStorage.OpenArgs, "signal">): Promise<void> {
    const { signal } = args;

    signal.throwIfAborted();

    if (this.opened) {
      return;
    }

    this.opened = true;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#usage)
   */
  public async close(args: Pick<IStorage.CloseArgs, "signal">): Promise<void> {
    const { signal } = args;

    signal.throwIfAborted();
    this.clear();
    this.opened = false;
  }

  /**
   * 未オープン状態での操作を TypeError で拒否します。
   */
  private assertOpen(): void {
    if (!this.opened) {
      throw new TypeError("LruCache is not open. Call open() before operating.");
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#usage)
   */
  public write(args: Pick<IStorage.WriteArgs<any>, "key" | "data" | "vars">): void {
    const { key, data } = args;

    this.assertOpen();

    const storedValue = this.clone(data);

    this.commit(key, storedValue);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#usage)
   */
  public read(args: Pick<IStorage.ReadArgs, "key">): any {
    const { key } = args;

    this.assertOpen();

    if (!this.map.has(key)) {
      throw new KeyNotFoundError({ key });
    }

    const value = this.map.get(key);
    const cloned = this.clone(value);

    this.touch(key);

    return cloned;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#usage)
   */
  public exists(args: Pick<IStorage.ExistsArgs, "key">): boolean {
    const { key } = args;

    this.assertOpen();

    const exists = this.map.has(key);

    return exists;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#usage)
   */
  public delete(args: Pick<IStorage.DeleteArgs, "key">): void {
    const { key } = args;

    this.assertOpen();

    if (!this.map.has(key)) {
      throw new KeyNotFoundError({ key });
    }

    this.removeEntry(key);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#usage)
   */
  public clear(): void {
    this.map.clear();
    this.sizes.clear();
    this.totalBytes = 0;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#data)
   */
  public getWritable(
    args: Pick<IStorage.GetWritableArgs, "key" | "vars">,
  ): WritableStream<Uint8Array<ArrayBuffer>> {
    const { key } = args;

    this.assertOpen();

    // メモリーストレージにはネイティブなストリームがないため、書き込まれたチャンクを配列に保持し、クローズ時に結合して保存します。
    const chunks: Uint8Array[] = [];
    const stream = new WritableStream<Uint8Array<ArrayBuffer>>({
      write: (chunk) => {
        if (!(chunk instanceof Uint8Array)) {
          throw new InvalidChunkTypeError({ key, chunk });
        }

        chunks.push(this.clone(chunk));
      },
      close: () => {
        const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
        const merged = new Uint8Array(totalLength);

        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.byteLength;
        }

        this.commit(key, merged);
      },
    });

    return stream;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#data)
   */
  public getReadable(
    args: Pick<IStorage.GetReadableArgs, "key">,
  ): ReadableStream<Uint8Array<ArrayBuffer>> {
    const { key } = args;

    this.assertOpen();

    if (!this.map.has(key)) {
      throw new KeyNotFoundError({ key });
    }

    this.touch(key);

    // メモリーストレージにはネイティブなストリームがないため、既存の値を単一チャンクとしてストリームで送出します。
    const value = this.map.get(key);
    const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull: (controller) => {
        if (!(value instanceof Uint8Array)) {
          throw new InvalidChunkTypeError({ key, chunk: value });
        }

        controller.enqueue(this.clone(value) as Uint8Array<ArrayBuffer>);
        controller.close();
      },
    });

    return stream;
  }

  /**
   * 指定したキーを最も新しいものとして登録し直します。
   *
   * @param key 登録し直すキーです。
   */
  private touch(key: string): void {
    const value = this.map.get(key);

    this.map.delete(key);
    this.map.set(key, value);
  }

  /**
   * 指定したキーを取り除き、バイト数の記録を更新します。
   *
   * @param key 取り除くキーです。
   */
  private removeEntry(key: string): void {
    const size = this.sizes.get(key);
    if (size !== undefined) {
      this.totalBytes -= size;
      this.sizes.delete(key);
    }

    this.map.delete(key);
  }

  /**
   * 複製済みの値を保存し、最も新しいものとして登録し直し、超過分を追い出します。
   *
   * @param key 保存するキーです。
   * @param storedValue 複製済みの保存値です。
   */
  private commit(key: string, storedValue: any): void {
    this.assertOpen();

    if (this.maxBytes !== undefined) {
      const measured = this.sizeOf(storedValue, key);
      if (typeof measured !== "number" || !Number.isFinite(measured) || measured < 0) {
        throw new InvalidSizeOfResultError({ key, actual: measured });
      }

      if (this.map.has(key)) {
        this.removeEntry(key);
      }

      this.map.set(key, storedValue);
      this.sizes.set(key, measured);
      this.totalBytes += measured;
    } else {
      if (this.map.has(key)) {
        this.map.delete(key);
      }

      this.map.set(key, storedValue);
    }

    this.evictIfNeeded(key);
  }

  /**
   * 上限を超えた分を先頭から追い出します。
   *
   * @param justWritten 今回書き込んだキーです。
   */
  private evictIfNeeded(justWritten: string): void {
    if (this.maxEntries !== undefined) {
      if (this.maxEntries === 0) {
        this.removeEntry(justWritten);
      } else {
        while (this.map.size > this.maxEntries) {
          const oldest = this.map.keys().next().value as string;

          this.removeEntry(oldest);
        }
      }
    }

    if (this.maxBytes !== undefined) {
      while (this.totalBytes > this.maxBytes) {
        const oldest = this.map.keys().next().value as string;
        if (oldest === justWritten) {
          break;
        }

        this.removeEntry(oldest);
      }
    }
  }
}
