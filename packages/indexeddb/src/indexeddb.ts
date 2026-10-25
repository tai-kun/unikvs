import type { IStorage } from "@unikvs/core";
import { type IDBPDatabase, openDB } from "idb";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/indexeddb#usage)
 */
export type IndexeddbOptions = {};

// WebKit で `Blob` を直接保存できない場合があるため、中間形式で保持します。
type StoredBlob = {
  readonly name: string;
  readonly type: string;
  readonly buffer: ArrayBuffer;
  readonly unikvsBlob: true;
  readonly unikvsFile: boolean;
  readonly lastModified: number;
};

// 保存した中間形式かどうかを判定します。
function isStoredBlob(value: unknown): value is StoredBlob {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return (value as Record<string, unknown>)["unikvsBlob"] === true;
}

// `Blob` を IndexedDB に保存できる中間形式に変換します。
// `File` の名前と更新時刻も保持します。
async function toStoredBlob(signal: AbortSignal, data: Blob): Promise<StoredBlob> {
  const buffer = await data.arrayBuffer();

  signal.throwIfAborted();

  const isFile = typeof File !== "undefined" && data instanceof File;

  return {
    name: isFile ? data.name : "",
    type: data.type,
    buffer,
    unikvsBlob: true,
    unikvsFile: isFile,
    lastModified: isFile ? data.lastModified : 0,
  };
}

// 中間形式を `Blob` または `File` に戻します。
function fromStoredBlob(stored: StoredBlob): Blob {
  if (stored.unikvsFile) {
    return new File([stored.buffer], stored.name, {
      type: stored.type,
      lastModified: stored.lastModified,
    });
  }

  return new Blob([stored.buffer], { type: stored.type });
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/indexeddb#usage)
 */
export default class Indexeddb implements IStorage {
  /**
   * IndexedDB のデータベースインスタンスを保持します。
   *
   * ストレージがオープンされるまで null です。
   */
  #db: IDBPDatabase | null;

  /**
   * 並行 open を束ねるための進行中 Promise です。
   */
  #opening: Promise<IDBPDatabase> | null;

  /**
   * 使用するデータベース名です。
   */
  readonly #dbName: string;

  /**
   * 使用するオブジェクトストア名です。
   */
  readonly #storeName: string;

  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/indexeddb#usage)
   */
  public constructor(
    dbName = "unikvs_db",
    storeName = "kvs_store",
    _options: IndexeddbOptions = {},
  ) {
    this.name = "Indexeddb";
    this.#db = null;
    this.#opening = null;
    this.#dbName = dbName;
    this.#storeName = storeName;
  }

  public get isOpen(): boolean {
    return this.#db !== null;
  }

  // 開いているデータベースを返します。
  // 未オープン時は `TypeError` を投げます。
  #getDb(): IDBPDatabase {
    const db = this.#db;

    if (db === null) {
      throw new TypeError("Indexeddb is not open. Call open() first.");
    }

    return db;
  }

  public async open(c: IStorage.OpenContext): Promise<void> {
    c.signal.throwIfAborted();

    if (this.#db !== null) {
      return;
    }

    if (this.#opening !== null) {
      await this.#opening;
      c.signal.throwIfAborted();

      return;
    }

    const opening = openDB(this.#dbName, 1, {
      upgrade: (upgraded) => {
        // オブジェクトストアが存在しない場合は作成します。
        if (!upgraded.objectStoreNames.contains(this.#storeName)) {
          upgraded.createObjectStore(this.#storeName);
        }
      },
    });
    this.#opening = opening;

    let opened: IDBPDatabase | null = null;

    try {
      opened = await opening;
      c.signal.throwIfAborted();
      this.#db = opened;
      opened = null;
    } catch (ex) {
      if (opened !== null) {
        try {
          opened.close();
        } catch {
          // 閉鎖時の失敗は無視します。
        }
      }

      throw ex;
    } finally {
      this.#opening = null;
    }
  }

  public async close(c: IStorage.CloseContext): Promise<void> {
    c.signal.throwIfAborted();

    const db = this.#db;

    if (db === null) {
      throw new TypeError("Indexeddb is not open. Call open() first.");
    }

    await Promise.resolve();
    db.close();
    this.#db = null;
  }

  // oxlint-disable-next-line typescript/explicit-module-boundary-types
  public async write(c: IStorage.WriteContext, data: any): Promise<void> {
    c.signal.throwIfAborted();

    const db = this.#getDb();

    if (typeof Blob !== "undefined" && data instanceof Blob) {
      const stored = await toStoredBlob(c.signal, data);
      await db.put(this.#storeName, stored, c.key);

      c.signal.throwIfAborted();

      return;
    }

    await db.put(this.#storeName, data, c.key);

    c.signal.throwIfAborted();
  }

  public async read(c: IStorage.ReadContext): Promise<any> {
    c.signal.throwIfAborted();

    const db = this.#getDb();
    const value = await db.get(this.#storeName, c.key);

    c.signal.throwIfAborted();

    if (isStoredBlob(value)) {
      return fromStoredBlob(value);
    }

    if (value === undefined) {
      const count = await db.count(this.#storeName, c.key);

      c.signal.throwIfAborted();

      // 存在しない場合は DOMException (NotFoundError) を投げます。
      if (count === 0) {
        throw new DOMException(
          "A requested file or directory could not be found at the time an operation was processed.",
          "NotFoundError",
        );
      }
    }

    return value;
  }

  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    c.signal.throwIfAborted();

    const db = this.#getDb();

    // 件数が 1 であれば存在し、0 であれば存在しません。
    const count = await db.count(this.#storeName, c.key);

    c.signal.throwIfAborted();

    return count > 0;
  }

  public async delete(c: IStorage.DeleteContext): Promise<void> {
    c.signal.throwIfAborted();

    const db = this.#getDb();
    await db.delete(this.#storeName, c.key);

    c.signal.throwIfAborted();
  }

  public async clear(c: IStorage.ClearContext): Promise<void> {
    c.signal.throwIfAborted();

    const db = this.#getDb();
    await db.clear(this.#storeName);

    c.signal.throwIfAborted();
  }

  public getWritable(c: IStorage.GetWritableContext): WritableStream<Uint8Array> {
    c.signal.throwIfAborted();

    const chunks: Uint8Array[] = [];

    return new WritableStream<Uint8Array>({
      abort: (): void => {
        chunks.length = 0;
      },
      close: async (): Promise<void> => {
        // 保存は close のときだけ行うため、中断時はここまでのチャンクを破棄できます。
        c.signal.throwIfAborted();

        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const merged = new Uint8Array(totalLength);
        let offset = 0;

        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }

        const db = this.#getDb();
        await db.put(this.#storeName, merged, c.key);

        c.signal.throwIfAborted();
      },
      write: (chunk): void => {
        c.signal.throwIfAborted();
        chunks.push(chunk);
      },
    });
  }

  public getReadable(c: IStorage.GetReadableContext): ReadableStream<Uint8Array> {
    c.signal.throwIfAborted();

    return new ReadableStream<Uint8Array>({
      pull: async (controller: ReadableStreamDefaultController<Uint8Array>): Promise<void> => {
        try {
          const data = await this.read(c as unknown as IStorage.ReadContext);

          c.signal.throwIfAborted();
          controller.enqueue(data as Uint8Array);
          controller.close();
        } catch (ex) {
          controller.error(ex);
        }
      },
    });
  }
}
