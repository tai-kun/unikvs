import type { rm, mkdir, rename } from "node:fs/promises";
import type { join, resolve } from "node:path";

import { type IStorage, UnsupportedRuntimeError } from "@unikvs/core";
import { assertValidFilename } from "@unikvs/utils";

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
 * [API Reference](https://tai-kun.github.io/unikvs/packages/fs-bun#usage)
 */
export type BunFsOptions = {};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/fs-bun#usage)
 */
export default class BunFs implements IStorage {
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

  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/fs-bun#usage)
   */
  public constructor(root = ".unikvs", _options: BunFsOptions = {}) {
    this.name = "BunFs";
    this.#root = root;
    this.#con = null;
  }

  public get isOpen(): boolean {
    return this.#con !== null;
  }

  // オープン済みかを確認します。
  // 未オープン時は `TypeError` を投げます。
  #getConnection(): Connection {
    if (this.#con === null) {
      throw new TypeError("BunFs is not open. Call open() first.");
    }

    return this.#con;
  }

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
   * キーに対応する最終パスとアトミックな書き込み用の一時ファイルパスを解決します。
   *
   * 一時ファイルは最終パスと同じディレクトリーに作成します。rename が同じファイルシステム上で完結し、アトミックに行われることを保証するためです。
   */
  #resolvePath(key: string): {
    tmp: string;
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
      try {
        await tmp.delete();
      } catch {
        // 後始末の削除に失敗しても無視します。
      }

      throw ex;
    }
  }

  public async read(c: IStorage.ReadContext): Promise<Uint8Array<ArrayBuffer>> {
    this.#getConnection();

    assertValidFilename(c.key);
    c.signal.throwIfAborted();

    const { path } = this.#getConnection();
    const file = path.join(this.#root, c.key);
    const data = await Bun.file(file).bytes();

    return data;
  }

  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    this.#getConnection();

    assertValidFilename(c.key);

    const { path } = this.#getConnection();
    const file = path.join(this.#root, c.key);

    return Bun.file(file).exists();
  }

  public async delete(c: IStorage.DeleteContext): Promise<void> {
    this.#getConnection();

    assertValidFilename(c.key);

    const { path } = this.#getConnection();
    const file = path.join(this.#root, c.key);
    await Bun.file(file).delete();
  }

  public async clear(_c: IStorage.ClearContext): Promise<void> {
    const { fs } = this.#getConnection();
    // ルートディレクトリー自体を削除したあと、再度空のディレクトリーを作成することでクリアーとします。
    await fs.rm(this.#root, {
      force: true,
      recursive: true,
    });
    await fs.mkdir(this.#root, { recursive: true });
  }

  public getWritable(c: IStorage.GetWritableContext): WritableStream<Uint8Array<ArrayBuffer>> {
    const { fs } = this.#getConnection();

    assertValidFilename(c.key);
    c.signal.throwIfAborted();

    const file = this.#resolvePath(c.key);

    // 一時ファイルへの書き込みシンクを作成します。
    const tmp = Bun.file(file.tmp);
    const sink = tmp.writer();
    const removeTmp = async (): Promise<void> => {
      try {
        await tmp.delete();
      } catch {
        // 後始末の削除に失敗しても無視します。
      }
    };

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

  public getReadable(c: IStorage.GetReadableContext): ReadableStream<Uint8Array<ArrayBuffer>> {
    this.#getConnection();

    assertValidFilename(c.key);
    c.signal.throwIfAborted();

    const { path } = this.#getConnection();
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
}
