import { type IStorage, KeyNotFoundError } from "@unikvs/core";

import {
  InvalidMaxBytesError,
  InvalidChunkTypeError,
  InvalidMaxEntriesError,
  InvalidSizeOfResultError,
} from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#usage)
 */
export type LruCacheOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#clone)
   */
  readonly clone?: (<T>(value: T) => T) | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#max-entries)
   */
  readonly maxEntries?: number | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#max-bytes)
   */
  readonly maxBytes?: number | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#size-of)
   */
  readonly sizeOf?: ((value: any, key: string) => number) | undefined;
};

/**
 * 追い出し時のサイズ計算に使う既定の関数です。
 *
 * 値が Uint8Array のときは byteLength を返し、それ以外は 1 を返します。
 *
 * @param value サイズを測る値です。
 *
 * @returns 値の大きさです。
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
   * ストレージ名です。常に `LruCache` を返します。
   */
  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#max-entries)
   */
  public readonly maxEntries: number | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#max-bytes)
   */
  public readonly maxBytes: number | undefined;

  /**
   * キーと値のペアを保持する内部マップです。
   */
  readonly #map: Map<string, any>;

  /**
   * maxBytes 設定時にキーごとのバイト数を保持するマップです。
   */
  readonly #sizes: Map<string, number>;

  /**
   * maxBytes 設定時に追跡する総バイト数です。
   */
  #totalBytes: number;

  /**
   * オープン状態を保持するフラグです。
   */
  #opened: boolean;

  /**
   * データの複製に使用する関数です。
   */
  readonly #clone: <T>(value: T) => T;

  /**
   * キーごとのバイト数の計算に使用する関数です。
   */
  readonly #sizeOf: (value: any, key: string) => number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#usage)
   */
  public constructor(options: LruCacheOptions = {}) {
    const {
      clone = <T>(value: T): T => structuredClone(value),
      sizeOf = defaultSizeOf,
      maxBytes,
      maxEntries,
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
    this.#map = new Map();
    this.#sizes = new Map();
    this.#totalBytes = 0;
    this.#opened = false;
    this.#clone = clone;
    this.#sizeOf = sizeOf;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#usage)
   */
  public get size(): number {
    return this.#map.size;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/lru-cache#usage)
   */
  public get bytes(): number {
    if (this.maxBytes === undefined) {
      return 0;
    }

    return this.#totalBytes;
  }

  /**
   * ストレージが開いているかどうかを返します。
   *
   * @returns open 済みであれば true を返します。
   */
  public get isOpen(): boolean {
    return this.#opened;
  }

  /**
   * ストレージを開き操作可能にします。二重に開いても何もしません。
   *
   * @param c 中断を知らせるシグナルを持つコンテキストです。
   *
   * @returns 完了を知らせるプロミスです。
   */
  public async open(c: IStorage.OpenContext): Promise<void> {
    c.signal.throwIfAborted();

    if (this.#opened) {
      return;
    }

    this.#opened = true;
  }

  /**
   * ストレージを閉じ保持データを破棄します。
   *
   * @param c 中断を知らせるシグナルを持つコンテキストです。
   *
   * @returns 完了を知らせるプロミスです。
   */
  public async close(c: IStorage.CloseContext): Promise<void> {
    c.signal.throwIfAborted();

    this.#map.clear();
    this.#sizes.clear();
    this.#totalBytes = 0;
    this.#opened = false;
  }

  /**
   * 指定したキーに値を保存します。保存後に上限の超過分を追い出します。
   *
   * @param c 書き込み対象のキーを持つコンテキストです。
   * @param data 保存する値です。
   */
  public write(c: IStorage.WriteContext, data: any): void {
    c.signal.throwIfAborted();
    this.#assertOpen();

    const storedValue = this.#clone(data);
    this.#commit(c.key, storedValue);
  }

  /**
   * 指定したキーの値を読み出します。読み出したキーを最も新しいものとして扱います。
   *
   * @param c 読み出すキーを持つコンテキストです。
   *
   * @returns 複製した保存値です。
   */
  public read(c: IStorage.ReadContext): any {
    c.signal.throwIfAborted();
    this.#assertOpen();

    if (!this.#map.has(c.key)) {
      throw new KeyNotFoundError({ key: c.key });
    }

    const value = this.#map.get(c.key);
    const cloned = this.#clone(value);

    this.#touch(c.key);

    return cloned;
  }

  /**
   * 指定したキーが存在するかどうかを返します。
   *
   * @param c 確認するキーを持つコンテキストです。
   *
   * @returns キーが存在すれば true を返します。
   */
  public exists(c: IStorage.ExistsContext): boolean {
    c.signal.throwIfAborted();
    this.#assertOpen();

    const exists = this.#map.has(c.key);

    return exists;
  }

  /**
   * 指定したキーを削除します。バイト数の記録も更新します。
   *
   * @param c 削除するキーを持つコンテキストです。
   */
  public delete(c: IStorage.DeleteContext): void {
    c.signal.throwIfAborted();
    this.#assertOpen();

    if (!this.#map.has(c.key)) {
      throw new KeyNotFoundError({ key: c.key });
    }

    this.#removeEntry(c.key);
  }

  /**
   * すべてのキーを削除しバイト数の記録を初期化します。
   *
   * @param _c 使用しないクリア用コンテキストです。
   */
  public clear(_c: IStorage.ClearContext): void {
    this.#map.clear();
    this.#sizes.clear();
    this.#totalBytes = 0;
  }

  /**
   * Uint8Array を書き込むためのストリームを作成します。close 時に結合して保存します。
   *
   * @param c 書き込み対象のキーを持つコンテキストです。
   *
   * @returns Uint8Array を受け付ける書き込みストリームです。
   */
  public getWritable(c: IStorage.GetWritableContext): WritableStream<Uint8Array<ArrayBuffer>> {
    c.signal.throwIfAborted();
    this.#assertOpen();

    // メモリーストレージにはネイティブなストリームがないため、書き込まれたチャンクを配列に保持し、クローズ時に結合して保存します。
    const chunks: Uint8Array[] = [];
    const stream = new WritableStream<Uint8Array<ArrayBuffer>>({
      abort: (): void => {
        chunks.length = 0;
      },
      close: (): void => {
        try {
          const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
          const merged = new Uint8Array(totalLength);

          let offset = 0;

          for (const chunk of chunks) {
            merged.set(chunk, offset);
            offset += chunk.byteLength;
          }

          this.#commit(c.key, merged);
        } finally {
          chunks.length = 0;
        }
      },
      write: (chunk: Uint8Array<ArrayBuffer>): void => {
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
   * 保存済みの値を単一チャンクとして送出するストリームを作成します。
   *
   * @param c 読み出すキーを持つコンテキストです。
   *
   * @returns Uint8Array を送出する読み取りストリームです。
   */
  public getReadable(c: IStorage.GetReadableContext): ReadableStream<Uint8Array<ArrayBuffer>> {
    c.signal.throwIfAborted();
    this.#assertOpen();

    if (!this.#map.has(c.key)) {
      throw new KeyNotFoundError({ key: c.key });
    }

    this.#touch(c.key);

    // メモリーストレージにはネイティブなストリームがないため、既存の値を単一チャンクとしてストリームで送出します。
    const value = this.#map.get(c.key);
    const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull: (controller: ReadableStreamDefaultController<Uint8Array<ArrayBuffer>>): void => {
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
   * 未オープン状態での操作を TypeError で拒否します。
   *
   * @returns 値を返しません。未オープン時はエラーを投げます。
   */
  #assertOpen(): void {
    if (!this.#opened) {
      throw new TypeError("LruCache is not open. Call open() before operating.");
    }
  }

  /**
   * 指定したキーを最も新しいものとして登録し直します。
   *
   * @param key 登録し直すキーです。
   *
   * @returns 値を返しません。
   */
  #touch(key: string): void {
    const value = this.#map.get(key);

    this.#map.delete(key);
    this.#map.set(key, value);
  }

  /**
   * 指定したキーを取り除き、バイト数の記録を更新します。
   *
   * @param key 取り除くキーです。
   *
   * @returns 値を返しません。
   */
  #removeEntry(key: string): void {
    const size = this.#sizes.get(key);

    if (size !== undefined) {
      this.#totalBytes -= size;
      this.#sizes.delete(key);
    }

    this.#map.delete(key);
  }

  /**
   * 複製済みの値を保存し、最も新しいものとして登録し直し、超過分を追い出します。
   *
   * @param key 保存するキーです。
   * @param storedValue 複製済みの保存値です。
   *
   * @returns 値を返しません。
   */
  #commit(key: string, storedValue: any): void {
    this.#assertOpen();

    if (this.maxBytes !== undefined) {
      const measured = this.#sizeOf(storedValue, key);

      if (typeof measured !== "number" || !Number.isFinite(measured) || measured < 0) {
        throw new InvalidSizeOfResultError({
          key,
          actual: measured,
        });
      }

      if (this.#map.has(key)) {
        this.#removeEntry(key);
      }

      this.#map.set(key, storedValue);
      this.#sizes.set(key, measured);
      this.#totalBytes += measured;
    } else {
      if (this.#map.has(key)) {
        this.#map.delete(key);
      }

      this.#map.set(key, storedValue);
    }

    this.#evictIfNeeded(key);
  }

  /**
   * 上限を超えた分を先頭から追い出します。
   *
   * @param justWritten 今回書き込んだキーです。
   *
   * @returns 値を返しません。
   */
  #evictIfNeeded(justWritten: string): void {
    if (this.maxEntries !== undefined) {
      if (this.maxEntries === 0) {
        this.#removeEntry(justWritten);
      } else {
        while (this.#map.size > this.maxEntries) {
          const oldest = this.#map.keys().next().value as string;
          this.#removeEntry(oldest);
        }
      }
    }

    if (this.maxBytes !== undefined) {
      while (this.#totalBytes > this.maxBytes) {
        const oldest = this.#map.keys().next().value as string;

        if (oldest === justWritten) {
          break;
        }

        this.#removeEntry(oldest);
      }
    }
  }
}
