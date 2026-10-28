import type { rm, mkdir, rename, copyFile } from "node:fs/promises";
import type { join, resolve } from "node:path";

import { type IStorage, KeyNotFoundError, UnsupportedRuntimeError } from "@unikvs/core";
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
 * ストレージの動作に必要な Node.js 互換モジュールをまとめて保持する型定義です。
 *
 * ファイルの読み書きには Bun のグローバル API を使いますが、ディレクトリー操作とリネームには Node.js 互換モジュールを使います。
 */
type Connection = {
  /**
   * ディレクトリー操作とリネームを行う `node:fs/promises` モジュールです。
   */
  readonly fs: {
    readonly rm: typeof rm;
    readonly mkdir: typeof mkdir;
    readonly rename: typeof rename;
    readonly copyFile: typeof copyFile;
  };

  /**
   * パスを結合・解決する `node:path` モジュールです。
   */
  readonly path: {
    readonly join: typeof join;
    readonly resolve: typeof resolve;
  };
};

/**
 * コピーまたは移動に使うファイル操作です。
 *
 * 第 1 引数に `node:fs/promises` 相当のモジュールを受け取ります。
 */
type TransferOperation = (
  fs: Connection["fs"],
  source: string,
  destination: string,
) => Promise<void>;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/fs-bun#bunfsoptions)
 */
export type BunFsOptions = {};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/fs-bun#bunfs)
 */
export default class BunFs implements IStorage {
  /**
   * ストレージ名です。常に `BunFs` を返します。
   */
  public readonly name: string;

  /**
   * Node.js 互換モジュールのインスタンスを保持します。
   *
   * ストレージがオープンされるまで null です。オープン後は `node:fs/promises`、`node:path` の各モジュールが利用可能になります。
   */
  #con: Connection | null;

  /**
   * データを保存するルートディレクトリーの絶対パスです。
   */
  #root: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/fs-bun#bunfs)
   */
  public constructor(root = ".unikvs", _options: BunFsOptions = {}) {
    this.name = "BunFs";
    this.#root = root;
    this.#con = null;
  }

  /**
   * ストレージが開いているかどうかを返します。
   *
   * @returns 接続情報を保持していれば true を返します。
   */
  public get isOpen(): boolean {
    return this.#con !== null;
  }

  /**
   * ルートディレクトリーを作成してストレージを開きます。Bun 以外ではエラーを投げます。
   *
   * @param _c 使用しないオープン用コンテキストです。
   *
   * @returns 完了を知らせるプロミスです。
   */
  public async open(_c: IStorage.OpenContext): Promise<void> {
    // Bun 以外のランタイムで誤って使われた場合に、原因の分かるエラーを返します。
    if (typeof Bun === "undefined") {
      throw new UnsupportedRuntimeError({
        name: this.name,
        runtime: "Bun",
      });
    }

    const [fs, path] = await Promise.all([import("node:fs/promises"), import("node:path")]);
    const root = path.resolve(this.#root);
    await fs.mkdir(root, { recursive: true });
    this.#root = root;
    this.#con = {
      fs,
      path,
    };
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
    const { fs } = this.#getConnection();

    assertValidFilename(c.key);
    c.signal.throwIfAborted();

    const file = this.#resolvePath(c.key);
    const tmp = Bun.file(file.tmp);

    try {
      await tmp.write(data);
      c.signal.throwIfAborted();
      await fs.rename(file.tmp, file.dest);
    } catch (ex) {
      // 失敗・中断時には一時ファイルを削除し、既存のデータを保全します。
      await this.#removeTemporary(tmp);

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
    const { path } = this.#getConnection();

    assertValidFilename(c.key);
    c.signal.throwIfAborted();

    const file = path.join(this.#root, c.key);
    const data = await Bun.file(file).bytes();

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
    const { path } = this.#getConnection();

    assertValidFilename(c.key);

    const file = path.join(this.#root, c.key);

    return Bun.file(file).exists();
  }

  /**
   * 指定したキーのファイルを削除します。
   *
   * @param c 削除するキーを持つコンテキストです。
   *
   * @returns 完了を知らせるプロミスです。
   */
  public async delete(c: IStorage.DeleteContext): Promise<void> {
    const { path } = this.#getConnection();

    assertValidFilename(c.key);

    const file = path.join(this.#root, c.key);
    await Bun.file(file).delete();
  }

  /**
   * 指定したキーのファイルを別のキーへ複製します。コピー先の既存ファイルは上書きされます。
   *
   * @param c コピー元とコピー先のキーを持つコンテキストです。
   *
   * @returns 完了を知らせるプロミスです。
   */
  public async copy(c: IStorage.CopyContext): Promise<void> {
    await this.#transfer(c.key, c.destinationKey, c.signal, (fs, source, dest) =>
      fs.copyFile(source, dest),
    );
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
    await this.#transfer(c.key, c.destinationKey, c.signal, (fs, source, dest) =>
      fs.rename(source, dest),
    );
  }

  /**
   * ルートディレクトリーを作り直してすべてのファイルを削除します。
   *
   * @param _c 使用しないクリア用コンテキストです。
   *
   * @returns 完了を知らせるプロミスです。
   */
  public async clear(_c: IStorage.ClearContext): Promise<void> {
    const { fs } = this.#getConnection();
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
    const { fs } = this.#getConnection();

    assertValidFilename(c.key);
    c.signal.throwIfAborted();

    const file = this.#resolvePath(c.key);

    // 一時ファイルへの書き込みシンクを作成します。
    const tmp = Bun.file(file.tmp);
    const sink = tmp.writer();
    const removeTmp = (): Promise<void> => this.#removeTemporary(tmp);

    // 中断と失敗のどちらからでも後始末が走るため、完了処理は一度だけ行います。
    let finished = false;
    const finish = async (reason?: unknown): Promise<void> => {
      if (finished) {
        return;
      }

      finished = true;
      c.signal.removeEventListener("abort", onAbort);
      // 先に一時ファイルを削除し、書き込み途中の内容を最終パスへ残しません。
      await removeTmp();

      try {
        await sink.end(reason instanceof Error ? reason : undefined);
      } catch {
        // 後始末としての end なので、失敗しても無視します。
      }
    };
    const onAbort = (): void => {
      void finish(c.signal.reason);
    };

    const writable = new WritableStream<Uint8Array<ArrayBuffer>>({
      async abort(reason?: unknown): Promise<void> {
        await finish(reason);
      },
      async close(): Promise<void> {
        c.signal.throwIfAborted();

        try {
          await sink.end();
        } catch (ex) {
          await removeTmp();

          throw ex;
        }

        // flush が完了した時点で初めて最終パスへ置き換えます (swap-on-close)。
        // 以降の中断で一時ファイルを消さないよう、完了済みとして扱います。
        finished = true;
        c.signal.removeEventListener("abort", onAbort);

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

        try {
          await sink.write(chunk);
          // バッファーに溜め込まず、チャンクごとにディスクへ書き出してバックプレッシャーとします。
          await sink.flush();
        } catch (ex) {
          await finish(ex);

          throw ex;
        }
      },
    });

    // 中断時はストリームを閉じられなくても、一時ファイルの削除だけは必ず行います。
    c.signal.addEventListener("abort", onAbort, { once: true });

    return writable;
  }

  /**
   * ファイルを読み出すためのストリームを作成します。中断時は読み取りを打ち切ります。
   *
   * @param c 読み出すキーを持つコンテキストです。
   *
   * @returns ファイル内容を送出する読み取りストリームです。
   */
  public getReadable(c: IStorage.GetReadableContext): ReadableStream<Uint8Array<ArrayBuffer>> {
    const { path } = this.#getConnection();

    assertValidFilename(c.key);
    c.signal.throwIfAborted();

    const file = path.join(this.#root, c.key);
    const source = Bun.file(file);
    let reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | null = null;

    const cancelReader = async (reason?: unknown): Promise<void> => {
      try {
        await reader?.cancel(reason);
      } catch {
        // 中断時の取消しに失敗しても無視します。
      }
    };
    // 中断時は取得済みのリーダーをキャンセルし、待機中の読み取りを終わらせます。
    // 中断理由は次の pull の throwIfAborted でストリームのエラーとして通知します。
    const onAbort = (): void => {
      void cancelReader(c.signal.reason);
    };
    const removeAbortListener = (): void => {
      c.signal.removeEventListener("abort", onAbort);
    };
    c.signal.addEventListener("abort", onAbort, { once: true });

    // Bun.file().stream() はリーダー取得時にファイルを開くため、その同期的な例外をストリームのエラーとして遅延させます。
    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      async pull(controller: ReadableStreamDefaultController): Promise<void> {
        try {
          c.signal.throwIfAborted();
          reader ??= source.stream().getReader();
          const { done, value } = await reader.read();

          c.signal.throwIfAborted();

          if (done) {
            removeAbortListener();
            controller.close();

            return;
          }

          controller.enqueue(value);
        } catch (ex) {
          reader = null;
          removeAbortListener();
          controller.error(ex);
        }
      },
      async cancel(reason?: unknown): Promise<void> {
        removeAbortListener();

        try {
          await reader?.cancel(reason);
        } catch {
          // 取消しに失敗しても無視します。
        }
      },
    });
  }

  /**
   * キーの値を別のキーへ転送します。
   *
   * 同じキーへの転送は存在確認だけを行います。
   *
   * @param key 転送元のキーです。
   * @param destinationKey 転送先のキーです。
   * @param signal 中断を監視するシグナルです。
   * @param operation 実際のファイル操作です。
   *
   * @returns 転送が完了したら解決します。
   */
  async #transfer(
    key: string,
    destinationKey: string,
    signal: AbortSignal,
    operation: TransferOperation,
  ): Promise<void> {
    const { fs, path } = this.#getConnection();

    assertValidFilename(key);
    assertValidFilename(destinationKey);
    signal.throwIfAborted();

    // 同じキーへの転送はファイルの存在確認だけを行います。
    if (key === destinationKey) {
      await this.#assertExists(key, signal);

      return;
    }

    const source = path.join(this.#root, key);
    const dest = path.join(this.#root, destinationKey);

    try {
      await operation(fs, source, dest);
    } catch (ex) {
      if (isErrnoCode(ex, "ENOENT")) {
        throw new KeyNotFoundError({ key });
      }

      throw ex;
    }
  }

  /**
   * 一時ファイルを削除します。
   *
   * 後始末としての削除のため、失敗しても無視します。
   *
   * @param tmp 削除する一時ファイルです。
   *
   * @returns 削除が完了したら解決します。
   */
  async #removeTemporary(tmp: Bun.BunFile): Promise<void> {
    try {
      await tmp.delete();
    } catch {
      // 後始末の削除に失敗しても無視します。
    }
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

    const { path } = this.#getConnection();
    const file = path.join(this.#root, key);

    if (!(await Bun.file(file).exists())) {
      throw new KeyNotFoundError({ key });
    }
  }

  /**
   * オープン済みの接続情報を返します。未オープン時はエラーを投げます。
   *
   * @returns Node.js 互換モジュールをまとめた接続情報です。
   */
  #getConnection(): Connection {
    if (this.#con === null) {
      throw new TypeError("BunFs is not open. Call open() first.");
    }

    return this.#con;
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
    const { path } = this.#getConnection();
    const dest = path.join(this.#root, key);
    // 一意なサフィックスにより、同一キーへの並行書き込みでも一時ファイルが衝突しないようにします。
    const tmp = `${dest}.${Bun.randomUUIDv7()}.tmp`;

    return {
      tmp,
      dest,
    };
  }
}
