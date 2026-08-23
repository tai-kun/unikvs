import type { IStorage } from "@unikvs/core";

import { KeyNotFoundError, InvalidChunkTypeError } from "./errors.js";

/**
 * メモリーを永続化先として使用するストレージクラスです。
 *
 * アプリケーションの実行中のみデータを保持し、プロセス終了時に破棄されます。
 * 全ての操作が同期で完了するため、非同期処理のオーバーヘッドがありません。
 */
export default class Memory implements IStorage {
  /**
   * キーと値のペアを保持する内部マップです。
   */
  private readonly map: Map<string, any>;

  /**
   * ストレージの名前です。デバッグやエラーメッセージなどに使用されます。
   */
  public readonly name: string;

  /**
   * Memory インスタンスを初期化します。
   *
   * 内部のマップを初期化し、常にオープン状態として動作します。
   */
  public constructor() {
    this.name = "Memory";
    this.map = new Map();
  }

  /**
   * メモリーストレージは常に利用可能なため、常に `true` を返します。
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * 指定されたデータを、対応するキーでストレージに保存します。
   *
   * @param args.key 保存先のキーです。
   * @param args.data 保存するデータです。
   */
  public write(args: Pick<IStorage.WriteArgs<any>, "key" | "data">): void {
    const { key, data } = args;
    this.map.set(key, data);
  }

  /**
   * 指定されたキーに対応するデータをストレージから取得します。
   *
   * @param args.key 取得元のキーです。
   * @returns キーに対応するデータです。
   * @throws キーがストレージ内に存在しない場合に {@link KeyNotFoundError} を投げます。
   */
  public read(args: Pick<IStorage.ReadArgs, "key">): any {
    const { key } = args;
    if (!this.map.has(key)) {
      throw new KeyNotFoundError({ key });
    }

    const value = this.map.get(key);

    return value;
  }

  /**
   * 指定されたキーに対応するデータがストレージ内に存在するかを確認します。
   *
   * @param args.key 確認するキーです。
   * @returns キーに対応するデータが存在する場合は true、それ以外は false です。
   */
  public exists(args: Pick<IStorage.ExistsArgs, "key">): boolean {
    const { key } = args;
    const exists = this.map.has(key);

    return exists;
  }

  /**
   * 指定されたキーに対応するデータをストレージから削除します。
   *
   * @param args.key 削除するキーです。
   * @throws キーがストレージ内に存在しない場合に {@link KeyNotFoundError} を投げます。
   */
  public delete(args: Pick<IStorage.DeleteArgs, "key">): void {
    const { key } = args;
    if (!this.map.has(key)) {
      throw new KeyNotFoundError({ key });
    }

    this.map.delete(key);
  }

  /**
   * ストレージ内のすべてのデータを完全に消去します。
   */
  public clear(): void {
    this.map.clear();
  }

  /**
   * 指定されたキーに対応する書き込み可能なストリームを取得します。
   *
   * メモリーストレージにはネイティブなストリームがないため、書き込まれたチャンクをメモリー上に保持し、ストリームがクローズされたときに結合して保存します。
   *
   * @param args.key 書き込み先のキーです。
   * @returns 書き込み可能なストリームです。
   */
  public getWritable(
    args: Pick<IStorage.GetWritableArgs, "key">,
  ): WritableStream<Uint8Array<ArrayBuffer>> {
    const { key } = args;
    // メモリーストレージにはネイティブなストリームがないため、書き込まれたチャンクを配列に保持し、クローズ時に結合して保存します。
    const chunks: Uint8Array[] = [];
    const stream = new WritableStream<Uint8Array<ArrayBuffer>>({
      write: (chunk) => {
        if (!(chunk instanceof Uint8Array)) {
          throw new InvalidChunkTypeError({ key, chunk });
        }

        chunks.push(chunk);
      },
      close: () => {
        const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
        const merged = new Uint8Array(totalLength);

        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.byteLength;
        }

        this.map.set(key, merged);
      },
    });

    return stream;
  }

  /**
   * 指定されたキーに対応する読み取り可能なストリームを取得します。
   *
   * メモリーストレージにはネイティブなストリームがないため、既存の値を単一チャンクとしてストリームで送出します。
   *
   * @param args.key 読み取り元のキーです。
   * @returns 読み取り可能なストリームです。
   * @throws キーがストレージ内に存在しない場合に {@link KeyNotFoundError} を投げます。
   */
  public getReadable(
    args: Pick<IStorage.GetReadableArgs, "key">,
  ): ReadableStream<Uint8Array<ArrayBuffer>> {
    const { key } = args;
    if (!this.map.has(key)) {
      throw new KeyNotFoundError({ key });
    }

    // メモリーストレージにはネイティブなストリームがないため、既存の値を単一チャンクとしてストリームで送出します。
    const value = this.map.get(key);
    const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull: (controller) => {
        if (!(value instanceof Uint8Array)) {
          throw new InvalidChunkTypeError({ key, chunk: value });
        }

        controller.enqueue(value as Uint8Array<ArrayBuffer>);
        controller.close();
      },
    });

    return stream;
  }
}
