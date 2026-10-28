import type { IStorage, IReadableStream, IWritableStream } from "@unikvs/core";
import { asyncmux } from "asyncmux";
import { callFnOnce } from "call-fn-once";

import { PluginLifecycle } from "./_plugin-lifecycle.js";
import { ReadableStreamSchema, WritableStreamSchema } from "./_streams.schemas.js";
import * as v from "./_valibot.js";
import {
  type PluginOperationAggregateError,
  StorageIsNotOpenError,
  ReadableStreamNotSupportedError,
  WritableStreamNotSupportedError,
} from "./errors.js";

/**
 * 同じオブジェクトに対して同じ `UniKvsStorage` インスタンスを返すためのメモです。
 */
const instances = /* #__PURE__ */ new WeakMap<IStorage, UniKvsStorage>();

/**
 * `IStorage` を `UniKvs` 内部から扱うためのラッパーです。
 *
 * ストレージを安全に使うための検証などの処理が集約されています。
 */
export default class UniKvsStorage {
  /**
   * ストレージの名前です。
   */
  public readonly name: string;

  /**
   * ラップするストレージです。
   */
  readonly #io: IStorage;

  /**
   * 参照カウントと実 `close` の再試行を管理します。
   */
  readonly #lifecycle: PluginLifecycle<IStorage.OpenContext, IStorage.CloseContext>;

  private constructor(storage: IStorage) {
    this.#io = storage;
    this.#lifecycle = new PluginLifecycle(storage);
    this.name = storage.name;
  }

  /**
   * `IStorage` から `UniKvs` 内部から扱うためのストレージを作成します。
   *
   * @param storage 元となるストレージです。
   *
   * @returns 検証などの機能が集約されたストレージです。
   */
  public static from(storage: IStorage): UniKvsStorage {
    return callFnOnce(instances, storage, () => new UniKvsStorage(storage));
  }

  /**
   * ストレージを開きます。
   *
   * @param c オープンコンテキストです。
   */
  @asyncmux
  public async open(c: IStorage.OpenContext): Promise<void> {
    await this.#lifecycle.open(c);
  }

  /**
   * ストレージを閉じます。
   *
   * @param c クローズコンテキストです。
   */
  @asyncmux
  public async close(c: IStorage.CloseContext): Promise<void> {
    await this.#lifecycle.close(c);
  }

  /**
   * 失敗した実 `close` だけを再試行します。
   *
   * @param c クローズコンテキストです。
   */
  @asyncmux
  public async retryClose(c: IStorage.CloseContext): Promise<void> {
    await this.#lifecycle.retryClose(c);
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
   *
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
   *
   * @returns 存在する場合は `true` を返します。
   */
  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    if (!this.#io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.name });
    }

    const output = await this.#io.exists(c);

    return output;
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
   * データを別のキーへ複製します。
   *
   * @param c コピー元とコピー先のキーを持つコンテキストです。
   */
  public async copy(c: IStorage.CopyContext): Promise<void> {
    if (!this.#io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.name });
    }

    if (this.#io.copy === undefined) {
      // copy 操作に伴う読み取りであることを伝えるために、必ず CopyContext を渡します。
      const data = await this.#io.read(c);

      if (c.key !== c.destinationKey) {
        // copy 操作に伴う書き込みであることを伝えるために、必ず CopyContext を渡します。
        await this.#io.write(c, data);
      }

      return;
    }

    await this.#io.copy(c);
  }

  /**
   * データを別のキーへ移動します。
   *
   * @param c 移動元と移動先のキーを持つコンテキストです。
   */
  public async move(c: IStorage.MoveContext): Promise<void> {
    if (!this.#io.isOpen) {
      throw new StorageIsNotOpenError({ name: this.name });
    }

    if (this.#io.move === undefined) {
      if (c.key === c.destinationKey) {
        // move 操作に伴う読み取りであることを伝えるために、必ず MoceContext を渡します。
        await this.#io.read(c);

        return;
      }

      if (this.#io.copy === undefined) {
        const data = await this.#io.read(c);
        // move 操作に伴う書き込みであることを伝えるために、必ず MoceContext を渡します。
        await this.#io.write(c, data);
      } else {
        // move 操作に伴う複製であることを伝えるために、必ず MoceContext を渡します。
        await this.#io.copy(c);
      }

      // move 操作に伴う削除であることを伝えるために、必ず MoceContext を渡します。
      await this.#io.delete(c);

      return;
    }

    await this.#io.move(c);
  }

  /**
   * 読み取り用のストリームを取得します。
   *
   * @param c ストリーム取得コンテキストです。
   *
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
   *
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
        errors: (
          err.meta.errors as readonly {
            readonly plugin: "storage";
            readonly reason: unknown;
          }[]
        ).map((error) => ({
          plugin: "storage" as const,
          reason: error.reason,
        })),
        plugin: "storage",
      },
    ]);
  }
}
