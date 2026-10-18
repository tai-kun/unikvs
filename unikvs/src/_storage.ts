import type { IStorage, IReadableStream, IWritableStream } from "@unikvs/core";
import { asyncmux } from "asyncmux";

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
   * `open` した利用者の数です。最初の `open` だけが実際に開き、最後の `close` だけが実際に閉じます。
   * `close` を持たないストレージは閉じられないため数えません。
   */
  #references: number;

  /**
   * 実 `close` に失敗したまま利用者の数が 0 になったかどうかです。
   *
   * このフラグが立っている間は、外部で開かれたストレージではなく、閉じきれていない所有権が残っています。
   * 次の `open` が所有権を引き継ぎ、次の `close` が実 `close` を再試行します。
   */
  #closeFailed: boolean;

  /**
   * ストレージの名前です。
   */
  public readonly name: string;

  private constructor(storage: IStorage) {
    this.#io = storage;
    this.#references = 0;
    this.#closeFailed = false;
    this.name = storage.name;
  }

  /**
   * ストレージを開きます。
   *
   * 同じストレージを共有する利用者のうち、最初の 1 回だけ実際の `open` を呼びます。
   * このラッパーが管理していない、既に外部で開かれているストレージは open/close の対象外にします。
   * 参照が残っていても実体が閉じられているときは、既存の参照を失わずに実 open へフォールバックします。
   * `close` を持たないストレージはこのラッパーから閉じられないため、参照を数えません。
   *
   * @param c オープンコンテキストです。
   */
  @asyncmux
  public async open(c: IStorage.OpenContext): Promise<void> {
    const io = this.#io;
    if (io.open === undefined) {
      return;
    }

    // `close` を持たないストレージは開いたままにしかできないため、参照を数えず、
    // 既存挙動どおり未 open のときだけ実 open します。
    if (io.close === undefined) {
      if (io.isOpen) {
        return;
      }

      await io.open(c);
      return;
    }

    // このラッパーが管理していない外部の open は対象外です。
    // 直前の close に失敗した所有権 (#closeFailed) がある間は、外部 open とみなしません。
    if (io.isOpen && this.#references === 0 && !this.#closeFailed) {
      return;
    }

    if (this.#references > 0 || this.#closeFailed) {
      if (io.isOpen) {
        // 既存の参照を失わずに加算します。close 失敗分の所有権もここで引き継ぎます。
        this.#references += 1;
        this.#closeFailed = false;
        return;
      }

      // 参照があるのに実体が閉じられているときは、実 open にフォールバックし、既存の参照を失わずに加算します。
      await io.open(c);
      this.#references += 1;
      this.#closeFailed = false;
      return;
    }

    await io.open(c);
    this.#references += 1;
  }

  /**
   * ストレージを閉じます。
   *
   * 同じストレージを共有する利用者のうち、最後の 1 回だけ実際の `close` を呼びます。
   * 各呼び出しで参照を 1 つ減らし、実 `close` は全参照が解放されたときにだけ呼びます。
   * 実 `close` に失敗したときは所有権を残し、次の `close` で再試行できるようにします。
   * `close` を持たないストレージは open で参照を数えないため、ここでは何もしません。
   * 実 `close` へ渡すコンテキストは最後に閉じる利用者のものであり、最初に開いた利用者の vars/signal は保持しません。
   *
   * @param c クローズコンテキストです。
   */
  @asyncmux
  public async close(c: IStorage.CloseContext): Promise<void> {
    if (this.#io.close === undefined) {
      // `close` を持たないストレージの close 操作をこのラッパーではしません。
      return;
    }

    if (this.#references === 0 && !this.#closeFailed) {
      // このラッパーが管理していないストレージは閉じません。
      return;
    }

    if (this.#references > 0) {
      this.#references -= 1;
    }

    if (this.#references > 0) {
      // まだ利用者が残っているため、実体は閉じません。
      return;
    }

    if (!this.#io.isOpen) {
      // 既に外部で閉じられているため、未解放の所有権を解消します。
      this.#closeFailed = false;
      return;
    }

    await this.#closeReal(c);
  }

  /**
   * 失敗した実 `close` だけを再試行します。
   *
   * 通常の `close` と違い参照を減らしません。close 失敗後に新しい `open` が所有権を引き継いでいる場合は何もしません。
   * 実体が既に閉じられているときは失敗状態だけを解消します。
   *
   * @param c クローズコンテキストです。
   */
  @asyncmux
  public async retryClose(c: IStorage.CloseContext): Promise<void> {
    if (this.#io.close === undefined) {
      return;
    }

    // 新しい open が所有権を引き継いでいる場合は、その参照を解放しないよう何もしません。
    if (!this.#closeFailed || this.#references > 0) {
      return;
    }

    if (!this.#io.isOpen) {
      // 既に外部で閉じられているため、未解放の所有権を解消します。
      this.#closeFailed = false;
      return;
    }

    await this.#closeReal(c);
  }

  /**
   * 実 `close` を実行し、失敗したかどうかを記録します。
   *
   * @param c クローズコンテキストです。
   */
  async #closeReal(c: IStorage.CloseContext): Promise<void> {
    const close = this.#io.close?.bind(this.#io);
    if (close === undefined) {
      return;
    }

    try {
      await close(c);
      this.#closeFailed = false;
    } catch (ex) {
      // 閉じるのに失敗したときは未解放として記録し、次の close で再試行できるようにします。
      this.#closeFailed = true;
      throw ex;
    }
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
