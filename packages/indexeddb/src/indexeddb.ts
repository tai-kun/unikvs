import type { IStorage } from "@unikvs/core";
import { openDB, type IDBPDatabase } from "idb";

/**
 * ブラウザーの IndexedDB を永続化先として使用するストレージクラスです。
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

  public readonly name: string;

  /**
   * Indexeddb インスタンスを初期化します。
   *
   * @param dbName データベース名です。
   * @param storeName データを保存するオブジェクトストア名です。
   */
  public constructor(dbName: string = "unikvs_db", storeName: string = "kvs_store") {
    this.name = "Indexeddb";
    this.db = null;
    this.dbName = dbName;
    this.storeName = storeName;
  }

  public get isOpen(): boolean {
    return this.db !== null;
  }

  public async open(): Promise<void> {
    if (this.db) {
      return;
    }

    this.db = await openDB(this.dbName, 1, {
      upgrade: (db) => {
        // オブジェクトストアが存在しない場合は作成します
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      },
    });
  }

  public async close(): Promise<void> {
    this.db!.close();
    this.db = null;
  }

  public async write(args: Pick<IStorage.WriteArgs<any>, "key" | "data">): Promise<void> {
    const { key, data } = args;
    await this.db!.put(this.storeName, data, key);
  }

  public async read(args: Pick<IStorage.ReadArgs, "key">): Promise<any> {
    const { key } = args;
    // Opfs の挙動に合わせて、存在しない場合は DOMException (NotFoundError) を投げます
    if (!(await this.exists({ key }))) {
      throw new DOMException(
        `A requested file or directory could not be found at the time an operation was processed.`,
        "NotFoundError",
      );
    }

    return await this.db!.get(this.storeName, key);
  }

  public async exists(args: Pick<IStorage.ExistsArgs, "key">): Promise<boolean> {
    const { key } = args;

    // count() はキーが存在すれば 1 を、存在しなければ 0 を返します
    const count = await this.db!.count(this.storeName, key);
    return count > 0;
  }

  public async delete(args: Pick<IStorage.DeleteArgs, "key">): Promise<void> {
    const { key } = args;
    await this.db!.delete(this.storeName, key);
  }

  public async clear(): Promise<void> {
    await this.db!.clear(this.storeName);
  }

  public getWritable(args: Pick<IStorage.GetWritableArgs, "key">): WritableStream<Uint8Array> {
    const { key } = args;
    const chunks: Uint8Array[] = [];

    // IndexedDB にはネイティブなファイルストリームがないため、書き込まれたチャンクをメモリに保持し、クローズ時にまとめて put します。
    return new WritableStream({
      write: (chunk) => {
        chunks.push(chunk);
      },
      close: async () => {
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;

        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.length;
        }

        await this.db!.put(this.storeName, result, key);
      },
    });
  }

  public getReadable(args: Pick<IStorage.GetReadableArgs, "key">): ReadableStream<Uint8Array> {
    const { key } = args;

    return new ReadableStream({
      pull: async (controller) => {
        // データ全体をメモリにロードしてから ReadableStream に流し込みます。
        const data = await this.read({ key });
        controller.enqueue(data);
        controller.close();
      },
    });
  }
}
