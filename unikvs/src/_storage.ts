import type { IStorage, IReadableStream, IWritableStream } from "@unikvs/core";

import { isReadableStream, isWritableStream } from "./_streams.js";
import * as v from "./_valibot.js";
import {
  type PluginOperationAggregateError,
  StorageIsNotOpenError,
  ReadableStreamNotSupportedError,
  WritableStreamNotSupportedError,
} from "./errors.js";

/**
 * `ReadableStream` のインターフェースを満たすかを検証するためのスキーマです。
 */
const ReadableStreamSchema = v.custom<IReadableStream>(
  isReadableStream,
  "Expected a ReadableStream",
);

/**
 * `WritableStream` のインターフェースを満たすかを検証するためのスキーマです。
 */
const WritableStreamSchema = v.custom<IWritableStream>(
  isWritableStream,
  "Expected a WritableStream",
);

/**
 * 同じオブジェクトに対して同じ `UniKvsStorage` インスタンスを返すためのメモです。
 */
const memoizedMap = /*#__PURE__*/ new WeakMap<IStorage, UniKvsStorage>();

/**
 * `IStorage` を `UniKvs` 内部から扱うためのラッパーです。
 *
 * ストレージを安全に使うための検証などの処理が集約されています。
 */
export default class UniKvsStorage {
  /**
   * `IStorage` から `UniKvs` 内部から扱うためのストレージを作成します。
   *
   * @param storage 元となるストレージです。
   * @returns 検証などの機能が集約されたストレージです。
   */
  public static from(storage: IStorage): UniKvsStorage {
    let memoized = memoizedMap.get(storage);
    if (!memoized) {
      memoized = new UniKvsStorage(storage);
      memoizedMap.set(storage, memoized);
    }

    return memoized;
  }

  /**
   * ラップするストレージです。
   */
  readonly #io: IStorage;

  /**
   * `open` で開いたために `close` の管理対象であるかどうかです。
   */
  #managed: boolean;

  /**
   * ストレージの名前です。
   */
  public readonly name: string;

  private constructor(storage: IStorage) {
    this.#io = storage;
    this.#managed = false;
    this.name = storage.name;
  }

  /**
   * ストレージを開きます。
   *
   * @param c オープンコンテキストです。
   */
  public async open(c: IStorage.OpenContext): Promise<void> {
    if (this.#io.open === undefined) {
      return;
    }

    if (this.#io.isOpen) {
      this.#managed = false;
    } else {
      await this.#io.open(c);
      this.#managed = true;
    }
  }

  /**
   * ストレージを閉じます。
   *
   * @param c クローズコンテキストです。
   */
  public async close(c: IStorage.CloseContext): Promise<void> {
    if (this.#io.close === undefined) {
      // `this.#io.close` を実行できません。
    } else if (!this.#managed) {
      // ストレージの open/close 操作をこのラッパーではしません。
    } else if (this.#io.isOpen) {
      await this.#io.close(c);
    }

    this.#managed = false; // 初期状態に戻します。
  }

  /**
   * データを書き込みます。
   *
   * @param c 書き込みコンテキストです。
   * @param data 書き込むデータです。
   */
  public async write(c: IStorage.WriteContext, data: unknown): Promise<void> {
    if (!this.#io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.name });
    }

    await this.#io.write(c, data);
  }

  /**
   * データを読み取ります。
   *
   * @param c 読み取りコンテキストです。
   * @returns 読み取ったデータを返します。
   */
  public async read(c: IStorage.ReadContext): Promise<unknown> {
    if (!this.#io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.name });
    }

    return await this.#io.read(c);
  }

  /**
   * データの存在を確認します。
   *
   * @param c 存在確認コンテキストです。
   * @returns 存在する場合は `true` を返します。
   */
  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    if (!this.#io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.name });
    }

    const output = await this.#io.exists(c);

    return Boolean(output);
  }

  /**
   * データを削除します。
   *
   * @param c 削除コンテキストです。
   */
  public async delete(c: IStorage.DeleteContext): Promise<void> {
    if (!this.#io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.name });
    }

    await this.#io.delete(c);
  }

  /**
   * データをすべて削除します。
   *
   * @param c クリアコンテキストです。
   */
  public async clear(c: IStorage.ClearContext): Promise<void> {
    if (!this.#io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.name });
    }

    await this.#io.clear(c);
  }

  /**
   * 読み取り用のストリームを取得します。
   *
   * @param c ストリーム取得コンテキストです。
   * @returns 読み取り用のストリームを返します。
   */
  public async getReadable(c: IStorage.GetReadableContext): Promise<IReadableStream> {
    if (!this.#io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.name });
    }
    if (this.#io.getReadable === undefined) {
      throw new ReadableStreamNotSupportedError({ name: this.name });
    }

    const output = await this.#io.getReadable(c);

    return v.parseOutput(ReadableStreamSchema, output);
  }

  /**
   * 書き込み用のストリームを取得します。
   *
   * @param c ストリーム取得コンテキストです。
   * @returns 書き込み用のストリームを返します。
   */
  public async getWritable(c: IStorage.GetWritableContext): Promise<IWritableStream> {
    if (!this.#io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.name });
    }
    if (this.#io.getWritable === undefined) {
      throw new WritableStreamNotSupportedError({ name: this.name });
    }

    const output = await this.#io.getWritable(c);

    return v.parseOutput(WritableStreamSchema, output);
  }

  /**
   * 他のストレージへの書き込み失敗を通知します。
   *
   * @param c 書き込み失敗通知コンテキストです。
   * @param err 集約エラーです。
   */
  public async onOtherWriteError(
    c: IStorage.OtherWriteErrorHandlerContext,
    err: PluginOperationAggregateError,
  ): Promise<void> {
    if (!this.#io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.name });
    }
    if (this.#io.onOtherWriteError === undefined) {
      return;
    }

    await this.#io.onOtherWriteError(c, [
      {
        plugin: "storage",
        errors: (
          err.meta.errors as readonly {
            readonly plugin: "storage";
            readonly reason: unknown;
          }[]
        ).map((error) => ({
          plugin: "storage" as const,
          reason: error.reason,
        })),
      },
    ]);
  }
}
