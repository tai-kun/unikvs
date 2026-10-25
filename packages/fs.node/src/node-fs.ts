import { randomUUID } from "node:crypto";
import { promises as fs, createReadStream, createWriteStream } from "node:fs";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";

import type { IStorage } from "@unikvs/core";
import { assertValidFilename } from "@unikvs/utils";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/fs-node#usage)
 */
export type NodeFsOptions = {};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/fs-node#usage)
 */
export default class NodeFs implements IStorage {
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

  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/fs-node#usage)
   */
  public constructor(root = ".unikvs", _options: NodeFsOptions = {}) {
    this.name = "NodeFs";
    this.#root = root;
    this.#con = false;
  }

  public get isOpen(): boolean {
    return this.#con;
  }

  // オープン済みかを確認します。
  // 未オープン時は `TypeError` を投げます。
  #getConnection(): void {
    if (!this.#con) {
      throw new TypeError("NodeFs is not open. Call open() first.");
    }
  }

  public async open(_c: IStorage.OpenContext): Promise<void> {
    const root = resolve(this.#root);
    await fs.mkdir(root, { recursive: true });
    this.#root = root;

    this.#con = true;
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
    const dest = join(this.#root, key);
    // 一意なサフィックスにより、同一キーへの並行書き込みでも一時ファイルが衝突しないようにします。
    const tmp = `${dest}.${randomUUID()}.tmp`;

    return {
      tmp,
      dest,
    };
  }

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

  public async read(c: IStorage.ReadContext): Promise<Uint8Array<ArrayBuffer>> {
    this.#getConnection();

    assertValidFilename(c.key);

    const file = join(this.#root, c.key);
    const data = await fs.readFile(file, { signal: c.signal });

    return data;
  }

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

  public async delete(c: IStorage.DeleteContext): Promise<void> {
    this.#getConnection();

    assertValidFilename(c.key);

    const file = join(this.#root, c.key);
    await fs.unlink(file);
  }

  public async clear(_c: IStorage.ClearContext): Promise<void> {
    this.#getConnection();
    // ルートディレクトリー自体を削除したあと、再度空のディレクトリーを作成することでクリアーとします。
    await fs.rm(this.#root, {
      force: true,
      recursive: true,
    });
    await fs.mkdir(this.#root, { recursive: true });
  }

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
}
