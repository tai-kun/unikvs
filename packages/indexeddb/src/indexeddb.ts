import { type IStorage, KeyNotFoundError } from "@unikvs/core";
import { type IDBPDatabase, openDB } from "idb";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/indexeddb#usage)
 */
export type IndexeddbOptions = {};

/**
 * WebKit で Blob を直接保存できない場合があるため、中間形式で保持します。
 */
type StoredBlob = {
  /**
   * File のときに保持するファイル名です。
   */
  readonly name: string;

  /**
   * 元の Blob の MIME 種別です。
   */
  readonly type: string;

  /**
   * Blob のバイト列です。
   */
  readonly buffer: ArrayBuffer;

  /**
   * 中間形式であることを示す目印です。
   */
  readonly unikvsBlob: true;

  /**
   * File 由来かどうかを示す目印です。
   */
  readonly unikvsFile: boolean;

  /**
   * File のときに保持する更新時刻です。
   */
  readonly lastModified: number;
};

/**
 * 保存した中間形式かどうかを判定します。
 *
 * @param value 判定する値です。
 *
 * @returns 中間形式であれば true を返します。
 */
function isStoredBlob(value: unknown): value is StoredBlob {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return (value as Record<string, unknown>)["unikvsBlob"] === true;
}

/**
 * Blob を IndexedDB に保存できる中間形式に変換します。File の名前と更新時刻も保持します。
 *
 * @param signal 中断を知らせるシグナルです。
 * @param data 変換する Blob です。
 *
 * @returns 中間形式に変換した値です。
 */
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

/**
 * 中間形式を Blob または File に戻します。
 *
 * @param stored 中間形式の値です。
 *
 * @returns 復元した Blob または File です。
 */
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
   * ストレージ名です。常に `Indexeddb` を返します。
   */
  public readonly name: string;

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

  /**
   * ストレージが開いているかどうかを返します。
   *
   * @returns データベース接続があれば true を返します。
   */
  public get isOpen(): boolean {
    return this.#db !== null;
  }

  /**
   * データベースを開きます。並行した呼び出しは一つの接続処理に束ねます。
   *
   * @param c 中断を知らせるシグナルを持つコンテキストです。
   *
   * @returns 完了を知らせるプロミスです。
   */
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

  /**
   * データベース接続を閉じます。
   *
   * @param c 中断を知らせるシグナルを持つコンテキストです。
   *
   * @returns 完了を知らせるプロミスです。
   */
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

  /**
   * 指定したキーに値を保存します。Blob は中間形式に変換して保存します。
   *
   * @param c 書き込み対象のキーを持つコンテキストです。
   * @param data 保存する値です。
   *
   * @returns 完了を知らせるプロミスです。
   */
  public async write(c: IStorage.WriteContext, data: any): Promise<void> {
    await this.#put(c.signal, c.key, data);
  }

  /**
   * 指定したキーの値を読み出します。中間形式は Blob または File に戻します。
   *
   * @param c 読み出すキーを持つコンテキストです。
   *
   * @returns 保存されている値です。
   */
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

  /**
   * 指定したキーが存在するかどうかを返します。
   *
   * @param c 確認するキーを持つコンテキストです。
   *
   * @returns キーが存在すれば true を返します。
   */
  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    c.signal.throwIfAborted();

    const db = this.#getDb();

    // 件数が 1 であれば存在し、0 であれば存在しません。
    const count = await db.count(this.#storeName, c.key);

    c.signal.throwIfAborted();

    return count > 0;
  }

  /**
   * 指定したキーを削除します。
   *
   * @param c 削除するキーを持つコンテキストです。
   *
   * @returns 完了を知らせるプロミスです。
   */
  public async delete(c: IStorage.DeleteContext): Promise<void> {
    c.signal.throwIfAborted();

    const db = this.#getDb();
    await db.delete(this.#storeName, c.key);

    c.signal.throwIfAborted();
  }

  /**
   * 指定したキーの値を別のキーへ複製します。複製先が存在する場合は上書きします。
   *
   * @param c 複製元と複製先のキーを持つコンテキストです。
   *
   * @returns 完了を知らせるプロミスです。
   */
  public async copy(c: IStorage.CopyContext): Promise<void> {
    const value = await this.#getStored(c.key, c.signal);

    // 同じキーへの複製は値の存在確認だけを行います。
    if (c.key === c.destinationKey) {
      return;
    }

    await this.#put(c.signal, c.destinationKey, value);
  }

  /**
   * 指定したキーの値を別のキーへ移動します。移動先の書き込みが成功してから移動元を削除します。
   *
   * @param c 移動元と移動先のキーを持つコンテキストです。
   *
   * @returns 完了を知らせるプロミスです。
   */
  public async move(c: IStorage.MoveContext): Promise<void> {
    const value = await this.#getStored(c.key, c.signal);

    // 同じキーへの移動は値の存在確認だけを行います。
    if (c.key === c.destinationKey) {
      return;
    }

    await this.#put(c.signal, c.destinationKey, value);
    await this.delete(c as unknown as IStorage.DeleteContext);
  }

  /**
   * オブジェクトストアのすべての値を削除します。
   *
   * @param c 中断を知らせるシグナルを持つコンテキストです。
   *
   * @returns 完了を知らせるプロミスです。
   */
  public async clear(c: IStorage.ClearContext): Promise<void> {
    c.signal.throwIfAborted();

    const db = this.#getDb();
    await db.clear(this.#storeName);

    c.signal.throwIfAborted();
  }

  /**
   * Uint8Array を書き込むためのストリームを作成します。close 時にまとめて保存します。
   *
   * @param c 書き込み対象のキーを持つコンテキストです。
   *
   * @returns Uint8Array を受け付ける書き込みストリームです。
   */
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

  /**
   * 保存済みの値を読み出すストリームを作成します。
   *
   * @param c 読み出すキーを持つコンテキストです。
   *
   * @returns Uint8Array を送出する読み取りストリームです。
   */
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

  /**
   * 指定したキーの値をストアに保存します。
   *
   * @param signal 中断を知らせるシグナルです。
   * @param key 保存先のキーです。
   * @param data 保存する値です。
   *
   * @returns 完了を知らせるプロミスです。
   */
  async #put(signal: AbortSignal, key: string, data: any): Promise<void> {
    signal.throwIfAborted();

    const db = this.#getDb();

    if (typeof Blob !== "undefined" && data instanceof Blob) {
      const stored = await toStoredBlob(signal, data);
      await db.put(this.#storeName, stored, key);

      signal.throwIfAborted();

      return;
    }

    await db.put(this.#storeName, data, key);

    signal.throwIfAborted();
  }

  /**
   * 指定したキーの保存値を読み出します。存在しない場合はエラーを投げます。
   *
   * @param key 読み出すキーです。
   * @param signal 中断を知らせるシグナルです。
   *
   * @returns 保存されている値です。
   */
  async #getStored(key: string, signal: AbortSignal): Promise<any> {
    signal.throwIfAborted();

    const db = this.#getDb();
    const count = await db.count(this.#storeName, key);

    signal.throwIfAborted();

    if (count === 0) {
      throw new KeyNotFoundError({ key });
    }

    const value = await db.get(this.#storeName, key);

    signal.throwIfAborted();

    return value;
  }

  /**
   * 開いているデータベースを返します。未オープン時はエラーを投げます。
   *
   * @returns 開いているデータベースです。
   */
  #getDb(): IDBPDatabase {
    const db = this.#db;

    if (db === null) {
      throw new TypeError("Indexeddb is not open. Call open() first.");
    }

    return db;
  }
}
