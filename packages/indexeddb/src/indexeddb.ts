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

  /**
   * ストレージの名前です。デバッグメッセージなどに使用されます。
   */
  public readonly name: string;

  /**
   * Indexeddb インスタンスを初期化します。
   *
   * @param dbName データベース名です。デフォルトは `"unikvs_db"` です。
   * @param storeName データを保存するオブジェクトストア名です。デフォルトは `"kvs_store"` です。
   */
  public constructor(dbName: string = "unikvs_db", storeName: string = "kvs_store") {
    this.name = "Indexeddb";
    this.db = null;
    this.dbName = dbName;
    this.storeName = storeName;
  }

  /** ストレージが現在利用可能な状態であるかを示します。 */
  public get isOpen(): boolean {
    return this.db !== null;
  }

  /**
   * ストレージをオープンし、IndexedDB データベースへの接続を確立します。
   *
   * 既にオープンされている場合は何も行いません。
   */
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

  /**
   * ストレージを安全にクローズします。
   *
   * データベース接続を閉じ、内部状態を初期化します。
   */
  public async close(): Promise<void> {
    this.db!.close();
    this.db = null;
  }

  /**
   * 指定されたデータを、対応するキーでストレージに保存します。
   *
   * @param args.key 保存先のキーです。
   * @param args.data 保存するデータです。
   */
  public async write(args: Pick<IStorage.WriteArgs<any>, "key" | "data">): Promise<void> {
    const { key, data } = args;
    await this.db!.put(this.storeName, data, key);
  }

  /**
   * 指定されたキーに対応するデータをストレージから取得します。
   *
   * @param args.key 取得元のキーです。
   * @returns キーに対応するデータです。存在しない場合は DOMException (NotFoundError) を投げます。
   */
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

  /**
   * 指定されたキーに対応するデータがストレージ内に存在するかを確認します。
   *
   * @param args.key 確認するキーです。
   * @returns キーに対応するデータが存在する場合は true、それ以外は false です。
   */
  public async exists(args: Pick<IStorage.ExistsArgs, "key">): Promise<boolean> {
    const { key } = args;

    // count() はキーが存在すれば 1 を、存在しなければ 0 を返します
    const count = await this.db!.count(this.storeName, key);
    return count > 0;
  }

  /**
   * 指定されたキーに対応するデータをストレージから削除します。
   *
   * @param args.key 削除するキーです。
   */
  public async delete(args: Pick<IStorage.DeleteArgs, "key">): Promise<void> {
    const { key } = args;

    await this.db!.delete(this.storeName, key);
  }

  /**
   * ストレージ内のすべてのデータを完全に消去します。
   */
  public async clear(): Promise<void> {
    await this.db!.clear(this.storeName);
  }

  /**
   * 指定されたキーに対応する書き込み可能なストリームを取得します。
   *
   * IndexedDB にはネイティブなストリームがないため、書き込まれたチャンクをメモリー上に保持し、ストリームがクローズされたときにまとめて保存します。
   *
   * @param args.key 書き込み先のキーです。
   * @returns 書き込み可能なストリームです。
   */
  public getWritable(args: Pick<IStorage.GetWritableArgs, "key">): WritableStream<Uint8Array> {
    const { key } = args;
    const chunks: Uint8Array[] = [];

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

  /**
   * 指定されたキーに対応する読み取り可能なストリームを取得します。
   *
   * IndexedDB にはネイティブなストリームがないため、データ全体をメモリーにロードしてから単一チャンクとしてストリームで送出します。
   *
   * @param args.key 読み取り元のキーです。
   * @returns 読み取り可能なストリームです。
   */
  public getReadable(args: Pick<IStorage.GetReadableArgs, "key">): ReadableStream<Uint8Array> {
    const { key } = args;

    return new ReadableStream({
      pull: async (controller) => {
        const data = await this.read({ key });
        controller.enqueue(data);
        controller.close();
      },
    });
  }
}
