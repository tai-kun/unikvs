import { type IStorage, KeyNotFoundError } from "@unikvs/core";

import { InvalidChunkTypeError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#usage)
 */
export type MemoryOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#clone)
   */
  readonly clone?: (<T>(value: T) => T) | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#usage)
 */
export default class Memory implements IStorage {
  /**
   * ストレージ名です。常に `Memory` を返します。
   */
  public readonly name: string;

  /**
   * キーと値のペアを保持する内部マップです。
   */
  readonly #map: Map<string, any>;

  /**
   * データの複製に使用する関数です。
   */
  readonly #clone: <T>(value: T) => T;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/memory#usage)
   */
  public constructor(options: MemoryOptions = {}) {
    const { clone = <T>(value: T): T => structuredClone(value) } = options;

    this.name = "Memory";
    this.#map = new Map();
    this.#clone = clone;
  }

  /**
   * ストレージが利用可能かどうかを返します。Memory は常に利用可能です。
   *
   * @returns 常に true を返します。
   */
  public get isOpen(): boolean {
    return true;
  }

  /**
   * 指定したキーに値を保存します。保存前に値を複製します。
   *
   * @param c 書き込み対象のキーを持つコンテキストです。
   * @param data 保存する値です。
   */
  public write(c: IStorage.WriteContext, data: any): void {
    this.#map.set(c.key, this.#clone(data));
  }

  /**
   * 指定したキーの値を読み出します。保存値を複製して返します。
   *
   * @param c 読み出すキーを持つコンテキストです。
   *
   * @returns 複製した保存値です。
   */
  public read(c: IStorage.ReadContext): any {
    if (!this.#map.has(c.key)) {
      throw new KeyNotFoundError({ key: c.key });
    }

    const value = this.#map.get(c.key);

    return this.#clone(value);
  }

  /**
   * 指定したキーが存在するかどうかを返します。
   *
   * @param c 確認するキーを持つコンテキストです。
   *
   * @returns キーが存在すれば true を返します。
   */
  public exists(c: IStorage.ExistsContext): boolean {
    const exists = this.#map.has(c.key);

    return exists;
  }

  /**
   * 指定したキーを削除します。
   *
   * @param c 削除するキーを持つコンテキストです。
   */
  public delete(c: IStorage.DeleteContext): void {
    if (!this.#map.has(c.key)) {
      throw new KeyNotFoundError({ key: c.key });
    }

    this.#map.delete(c.key);
  }

  /**
   * 指定したキーの値を別のキーへ複製します。
   *
   * @param c コピー元とコピー先のキーを持つコンテキストです。
   */
  public copy(c: IStorage.CopyContext): void {
    if (!this.#map.has(c.key)) {
      throw new KeyNotFoundError({ key: c.key });
    }

    // 同じキーへのコピーは値の存在確認だけを行います。
    if (c.key === c.destinationKey) {
      return;
    }

    this.#map.set(c.destinationKey, this.#clone(this.#map.get(c.key)));
  }

  /**
   * 指定したキーの値を別のキーへ移動します。
   *
   * @param c 移動元と移動先のキーを持つコンテキストです。
   */
  public move(c: IStorage.MoveContext): void {
    if (!this.#map.has(c.key)) {
      throw new KeyNotFoundError({ key: c.key });
    }

    // 同じキーへの移動は値の存在確認だけを行います。
    if (c.key === c.destinationKey) {
      return;
    }

    this.#map.set(c.destinationKey, this.#map.get(c.key));
    this.#map.delete(c.key);
  }

  /**
   * すべてのキーを削除します。
   *
   * @param _c 使用しないクリア用コンテキストです。
   */
  public clear(_c: IStorage.ClearContext): void {
    this.#map.clear();
  }

  /**
   * Uint8Array を書き込むためのストリームを作成します。close 時にチャンクを結合して保存します。
   *
   * @param c 書き込み対象のキーを持つコンテキストです。
   *
   * @returns Uint8Array を受け付ける書き込みストリームです。
   */
  public getWritable(c: IStorage.GetWritableContext): WritableStream<Uint8Array<ArrayBuffer>> {
    // メモリーストレージにはネイティブなストリームがないため、書き込まれたチャンクを配列に保持し、クローズ時に結合して保存します。
    const chunks: Uint8Array[] = [];
    const stream = new WritableStream<Uint8Array<ArrayBuffer>>({
      close: (): void => {
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const merged = new Uint8Array(totalLength);

        let offset = 0;

        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.byteLength;
        }

        this.#map.set(c.key, merged);
      },
      write: (chunk): void => {
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
    if (!this.#map.has(c.key)) {
      throw new KeyNotFoundError({ key: c.key });
    }

    // メモリーストレージにはネイティブなストリームがないため、既存の値を単一チャンクとしてストリームで送出します。
    const value = this.#map.get(c.key);
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
}
