import { RepairNotAllowedError, type IStorage, type Variables } from "@unikvs/core";
import { openDB, type IDBPDatabase } from "idb";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/indexeddb#usage)
 */
export type IndexeddbOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/indexeddb#usage)
   */
  readonly allowRepair?: boolean | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/indexeddb#usage)
 */
export default class Indexeddb implements IStorage {
  /**
   * IndexedDB のデータベースインスタンスを保持します。
   *
   * ストレージがオープンされるまで null です。
   */
  private db: IDBPDatabase | null;

  /**
   * 使用するデータベース名です。
   */
  private readonly dbName: string;

  /**
   * 使用するオブジェクトストア名です。
   */
  private readonly storeName: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/indexeddb#usage)
   */
  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/indexeddb#usage)
   */
  public readonly allowRepair: boolean;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/indexeddb#usage)
   */
  public constructor(
    dbName: string = "unikvs_db",
    storeName: string = "kvs_store",
    options: IndexeddbOptions = {},
  ) {
    const { allowRepair = false } = options;
    this.name = "Indexeddb";
    this.allowRepair = allowRepair;
    this.db = null;
    this.dbName = dbName;
    this.storeName = storeName;
  }

  /**
   * 書き戻しによる書き込みが許可されているかを検証します。
   *
   * @param args 書き込みの引数です。実行時変数に書き戻しの目印がある場合に判定します。
   */
  private assertRepairAllowed(args: { vars: Variables }): void {
    if (args.vars["unikvs:repair"] === true && !this.allowRepair) {
      throw new RepairNotAllowedError({ name: this.name });
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/indexeddb#usage)
   */
  public get isOpen(): boolean {
    return this.db !== null;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/indexeddb#usage)
   */
  public async open(args: Pick<IStorage.OpenArgs, "signal">): Promise<void> {
    const { signal } = args;

    signal.throwIfAborted();

    if (this.db) {
      return;
    }

    const db = await openDB(this.dbName, 1, {
      upgrade: (db) => {
        // オブジェクトストアが存在しない場合は作成します
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      },
    });

    // 中断時は接続を開いたままにせず、未オープン状態へ戻します。
    if (signal.aborted) {
      db.close();
      signal.throwIfAborted();
    }

    this.db = db;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/indexeddb#usage)
   */
  public async close(args: Pick<IStorage.CloseArgs, "signal">): Promise<void> {
    const { signal } = args;

    signal.throwIfAborted();

    this.db!.close();
    this.db = null;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/indexeddb#data)
   */
  public async write(
    args: Pick<IStorage.WriteArgs<any>, "key" | "data" | "signal" | "vars">,
  ): Promise<void> {
    this.assertRepairAllowed(args);
    const { key, data, signal } = args;

    signal.throwIfAborted();

    await this.db!.put(this.storeName, data, key);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/indexeddb#data)
   */
  public async read(args: Pick<IStorage.ReadArgs, "key" | "signal">): Promise<any> {
    const { key, signal } = args;

    signal.throwIfAborted();

    // Opfs の挙動に合わせて、存在しない場合は DOMException (NotFoundError) を投げます
    if (!(await this.exists({ key, signal }))) {
      throw new DOMException(
        `A requested file or directory could not be found at the time an operation was processed.`,
        "NotFoundError",
      );
    }
    signal.throwIfAborted();

    return await this.db!.get(this.storeName, key);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/indexeddb#usage)
   */
  public async exists(args: Pick<IStorage.ExistsArgs, "key" | "signal">): Promise<boolean> {
    const { key, signal } = args;

    signal.throwIfAborted();

    // count() はキーが存在すれば 1 を、存在しなければ 0 を返します
    const count = await this.db!.count(this.storeName, key);
    return count > 0;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/indexeddb#usage)
   */
  public async delete(args: Pick<IStorage.DeleteArgs, "key" | "signal">): Promise<void> {
    const { key, signal } = args;

    signal.throwIfAborted();

    await this.db!.delete(this.storeName, key);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/indexeddb#usage)
   */
  public async clear(args: Pick<IStorage.ClearArgs, "signal">): Promise<void> {
    const { signal } = args;

    signal.throwIfAborted();

    await this.db!.clear(this.storeName);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/indexeddb#data)
   */
  public getWritable(
    args: Pick<IStorage.GetWritableArgs, "key" | "signal" | "vars">,
  ): WritableStream<Uint8Array> {
    this.assertRepairAllowed(args);
    const { key, signal } = args;

    signal.throwIfAborted();

    const chunks: Uint8Array[] = [];

    return new WritableStream({
      write: (chunk) => {
        signal.throwIfAborted();
        chunks.push(chunk);
      },
      close: async () => {
        // 保存は close のときだけ行うため、中断時はここまでのチャンクを破棄できます。
        signal.throwIfAborted();

        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;

        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.length;
        }

        await this.db!.put(this.storeName, result, key);
      },
      abort: () => {
        chunks.length = 0;
      },
    });
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/indexeddb#data)
   */
  public getReadable(
    args: Pick<IStorage.GetReadableArgs, "key" | "signal">,
  ): ReadableStream<Uint8Array> {
    const { key, signal } = args;

    signal.throwIfAborted();

    return new ReadableStream({
      pull: async (controller) => {
        try {
          signal.throwIfAborted();
          const data = await this.read({ key, signal });
          signal.throwIfAborted();
          controller.enqueue(data);
          controller.close();
        } catch (ex) {
          controller.error(ex);
        }
      },
    });
  }
}
