import { randomUUID } from "node:crypto";
import { promises as fs, createReadStream, createWriteStream } from "node:fs";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";

import { type IStorage, KeyNotFoundError } from "@unikvs/core";
import { assertValidFilename } from "@unikvs/utils";

/**
 * ファイル操作のエラーが指定した errno コードかどうかを判定します。
 *
 * @param error 判定するエラーです。
 * @param code 期待する errno コードです。
 *
 * @returns コードが一致するとき true を返します。
 */
function isErrnoCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { readonly code?: unknown }).code === code
  );
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/fs-node#nodefsoptions)
 */
export type NodeFsOptions = {};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/fs-node#nodefs)
 */
export default class NodeFs implements IStorage {
  /**
   * ストレージ名です。常に `NodeFs` を返します。
   */
  public readonly name: string;

  /**
   * オープン済みかどうかを保持します。
   *
   * ストレージがオープンされるまで false です。オープン後は true になります。
   */
  #con: boolean;

  /**
   * データを保存するルートディレクトリーの絶対パスです。
   */
  #root: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/fs-node#nodefs)
   */
  public constructor(root = ".unikvs", _options: NodeFsOptions = {}) {
    this.name = "NodeFs";
    this.#root = root;
    this.#con = false;
  }

  /**
   * ストレージが開いているかどうかを返します。
   *
   * @returns open 済みであれば true を返します。
   */
  public get isOpen(): boolean {
    return this.#con;
  }

  /**
   * ルートディレクトリーを作成してストレージを開きます。
   *
   * @param _c 使用しないオープン用コンテキストです。
   *
   * @returns 完了を知らせるプロミスです。
   */
  public async open(_c: IStorage.OpenContext): Promise<void> {
    const root = resolve(this.#root);
    await fs.mkdir(root, { recursive: true });
    this.#root = root;

    this.#con = true;
  }

  /**
   * 指定したキーに Uint8Array を保存します。一時ファイル経由で原子的に置き換えます。
   *
   * @param c 書き込み対象のキーを持つコンテキストです。
   * @param data 保存するバイト列です。
   *
   * @returns 完了を知らせるプロミスです。
   */
  public async write(c: IStorage.WriteContext, data: Uint8Array<ArrayBuffer>): Promise<void> {
    this.#getConnection();

    assertValidFilename(c.key);
    c.signal.throwIfAborted();

    const file = this.#resolvePath(c.key);

    try {
      await fs.writeFile(file.tmp, data, { signal: c.signal });
      await fs.rename(file.tmp, file.dest);
    } catch (ex) {
      // 失敗・中断時には一時ファイルを削除し、既存のデータを保全します。
      try {
        await fs.rm(file.tmp, { force: true });
      } catch {
        // 後始末の削除に失敗しても無視します。
      }

      throw ex;
    }
  }

  /**
   * 指定したキーのファイルを読み出します。
   *
   * @param c 読み出すキーを持つコンテキストです。
   *
   * @returns ファイル内容のバイト列です。
   */
  public async read(c: IStorage.ReadContext): Promise<Uint8Array<ArrayBuffer>> {
    this.#getConnection();

    assertValidFilename(c.key);

    const file = join(this.#root, c.key);
    const data = await fs.readFile(file, { signal: c.signal });

    return data;
  }

  /**
   * 指定したキーのファイルがあるかどうかを返します。
   *
   * @param c 確認するキーを持つコンテキストです。
   *
   * @returns ファイルがあれば true を返します。
   */
  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    this.#getConnection();

    assertValidFilename(c.key);

    const file = join(this.#root, c.key);

    try {
      await fs.access(file);

      return true;
    } catch {
      return false;
    }
  }

  /**
   * 指定したキーのファイルを削除します。
   *
   * @param c 削除するキーを持つコンテキストです。
   *
   * @returns 完了を知らせるプロミスです。
   */
  public async delete(c: IStorage.DeleteContext): Promise<void> {
    this.#getConnection();

    assertValidFilename(c.key);

    const file = join(this.#root, c.key);
    await fs.unlink(file);
  }

  /**
   * 指定したキーのファイルを別のキーへ複製します。コピー先の既存ファイルは上書きされます。
   *
   * @param c コピー元とコピー先のキーを持つコンテキストです。
   *
   * @returns 完了を知らせるプロミスです。
   */
  public async copy(c: IStorage.CopyContext): Promise<void> {
    this.#getConnection();

    assertValidFilename(c.key);
    assertValidFilename(c.destinationKey);
    c.signal.throwIfAborted();

    // 同じキーへのコピーはファイルの存在確認だけを行います。
    if (c.key === c.destinationKey) {
      await this.#assertExists(c.key, c.signal);

      return;
    }

    const source = join(this.#root, c.key);
    const dest = join(this.#root, c.destinationKey);

    try {
      await fs.copyFile(source, dest);
    } catch (ex) {
      if (isErrnoCode(ex, "ENOENT")) {
        throw new KeyNotFoundError({ key: c.key });
      }

      throw ex;
    }
  }

  /**
   * 指定したキーのファイルを別のキーへ移動します。移動先の既存ファイルは上書きされます。
   *
   * 移動先への書き込みが成功した後に移動元を削除するため、失敗時には移動元が残ります。
   *
   * @param c 移動元と移動先のキーを持つコンテキストです。
   *
   * @returns 完了を知らせるプロミスです。
   */
  public async move(c: IStorage.MoveContext): Promise<void> {
    this.#getConnection();

    assertValidFilename(c.key);
    assertValidFilename(c.destinationKey);
    c.signal.throwIfAborted();

    // 同じキーへの移動はファイルの存在確認だけを行います。
    if (c.key === c.destinationKey) {
      await this.#assertExists(c.key, c.signal);

      return;
    }

    const source = join(this.#root, c.key);
    const dest = join(this.#root, c.destinationKey);

    try {
      await fs.rename(source, dest);
    } catch (ex) {
      if (isErrnoCode(ex, "ENOENT")) {
        throw new KeyNotFoundError({ key: c.key });
      }

      throw ex;
    }
  }

  /**
   * ルートディレクトリーを作り直してすべてのファイルを削除します。
   *
   * @param _c 使用しないクリア用コンテキストです。
   *
   * @returns 完了を知らせるプロミスです。
   */
  public async clear(_c: IStorage.ClearContext): Promise<void> {
    this.#getConnection();
    // ルートディレクトリー自体を削除したあと、再度空のディレクトリーを作成することでクリアーとします。
    await fs.rm(this.#root, {
      force: true,
      recursive: true,
    });
    await fs.mkdir(this.#root, { recursive: true });
  }

  /**
   * 一時ファイルへ書き込み close 時に置き換えるストリームを作成します。
   *
   * @param c 書き込み対象のキーを持つコンテキストです。
   *
   * @returns Uint8Array を受け付ける書き込みストリームです。
   */
  public getWritable(c: IStorage.GetWritableContext): WritableStream<Uint8Array<ArrayBuffer>> {
    this.#getConnection();

    assertValidFilename(c.key);
    c.signal.throwIfAborted();

    const file = this.#resolvePath(c.key);

    // 一時ファイルへの書き込みストリームを作成します。
    const writeStream = createWriteStream(file.tmp);
    const removeTmp = async (): Promise<void> => {
      try {
        await fs.rm(file.tmp, { force: true });
      } catch {
        // 後始末の削除に失敗しても無視します。
      }
    };

    // fs ストリーム上のエラーは各操作の Promise 経由で通知するため、ここで捕捉して未処理のエラーイベントを防ぎます。
    const state: { error?: Error } = {};
    writeStream.on("error", (err: Error): void => {
      state.error ??= err;
    });

    const onAbort = (): void => {
      const reason = c.signal.reason;
      writeStream.destroy(reason instanceof Error ? reason : new Error(String(reason)));

      void removeTmp();
    };
    c.signal.addEventListener("abort", onAbort, { once: true });
    // ストリームの終了後は中断を監視する必要がないため、リスナーを解除します。
    writeStream.on("close", (): void => {
      c.signal.removeEventListener("abort", onAbort);
    });

    return new WritableStream<Uint8Array<ArrayBuffer>>({
      async abort(reason?: unknown): Promise<void> {
        writeStream.destroy(reason instanceof Error ? reason : new Error(String(reason)));
        await removeTmp();
      },
      async close(): Promise<void> {
        c.signal.throwIfAborted();

        if (state.error !== undefined) {
          throw state.error;
        }

        await new Promise<void>((succeed, fail): void => {
          writeStream.end((err: Error | null | undefined): void => {
            if (err !== null && err !== undefined) {
              fail(err);
            } else {
              succeed();
            }
          });
        });
        // flush が完了した時点で初めて最終パスへ置き換えます (swap-on-close)。
        try {
          await fs.rename(file.tmp, file.dest);
        } catch (ex) {
          // rename に失敗した場合も一時ファイルを削除し、既存のデータを保全します。
          await removeTmp();

          throw ex;
        }
      },
      async write(chunk: Uint8Array<ArrayBuffer>): Promise<void> {
        c.signal.throwIfAborted();

        if (state.error !== undefined) {
          throw state.error;
        }

        // バッファーが一杯の場合は書き込めるようになるまで待機します (バックプレッシャー)。
        // 中断やエラーでストリームが終了した場合も待機を打ち切ります。
        if (!writeStream.write(chunk)) {
          await new Promise<void>((succeed, fail): void => {
            const cleanup = (): void => {
              writeStream.off("drain", onDrain);
              writeStream.off("error", onError);
              writeStream.off("close", onClose);
            };
            const onDrain = (): void => {
              cleanup();
              succeed();
            };
            const onError = (err: Error): void => {
              cleanup();
              fail(err);
            };
            const onClose = (): void => {
              cleanup();
              succeed();
            };
            writeStream.once("drain", onDrain);
            writeStream.once("error", onError);
            writeStream.once("close", onClose);
          });
          c.signal.throwIfAborted();
        }
      },
    });
  }

  /**
   * ファイルを読み出すためのストリームを作成します。中断信号を読み取りに伝えます。
   *
   * @param c 読み出すキーを持つコンテキストです。
   *
   * @returns ファイル内容を送出する読み取りストリームです。
   */
  public getReadable(c: IStorage.GetReadableContext): ReadableStream<Uint8Array<ArrayBuffer>> {
    this.#getConnection();

    assertValidFilename(c.key);
    c.signal.throwIfAborted();

    const file = join(this.#root, c.key);
    // signal を渡すことで、中断時にはストリームが中断理由で破棄され、進行中の読み取りも失敗します。
    const readStream = createReadStream(file, { signal: c.signal });
    const readableStream = Readable.toWeb(readStream);

    return readableStream as ReadableStream<Uint8Array<ArrayBuffer>>;
  }

  /**
   * 指定したキーのファイルが存在することを確認します。
   *
   * @param key 確認するキーです。
   * @param signal 中断を監視するシグナルです。
   *
   * @returns ファイルが存在するとき完了するプロミスです。存在しないときはエラーを投げます。
   */
  async #assertExists(key: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();

    const file = join(this.#root, key);

    try {
      await fs.access(file);
    } catch (ex) {
      if (isErrnoCode(ex, "ENOENT")) {
        throw new KeyNotFoundError({ key });
      }

      throw ex;
    }
  }

  /**
   * オープン済みかを確認します。未オープン時はエラーを投げます。
   *
   * @returns 値を返しません。未オープン時はエラーを投げます。
   */
  #getConnection(): void {
    if (!this.#con) {
      throw new TypeError("NodeFs is not open. Call open() first.");
    }
  }

  /**
   * キーに対応する最終パスとアトミックな書き込み用の一時ファイルパスを解決します。
   *
   * 一時ファイルは最終パスと同じディレクトリーに作成します。rename が同じファイルシステム上で完結し、アトミックに行われることを保証するためです。
   *
   * @param key 解決するキーです。
   *
   * @returns 一時ファイルと最終パスの組み合わせです。
   */
  #resolvePath(key: string): {
    /**
     * 書き込み途中に使用する一時ファイルのパスです。
     */
    tmp: string;

    /**
     * 最終的に公開するファイルのパスです。
     */
    dest: string;
  } {
    const dest = join(this.#root, key);
    // 一意なサフィックスにより、同一キーへの並行書き込みでも一時ファイルが衝突しないようにします。
    const tmp = `${dest}.${randomUUID()}.tmp`;

    return {
      tmp,
      dest,
    };
  }
}
