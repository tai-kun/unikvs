import type { IStorage } from "@unikvs/core";
import { assertValidFilename } from "@unikvs/utils";

import { UnsupportedRuntimeError } from "./errors.js";

/**
 * ストレージの動作に必要な Node.js 互換モジュールをまとめて保持する型定義です。
 *
 * ファイルの読み書きには Bun のグローバル API を使いますが、ディレクトリー操作とリネームには Node.js 互換モジュールを使います。
 */
type Connection = {
  /**
   * ディレクトリー操作とリネームを行う `node:fs/promises` モジュールです。
   */
  readonly fs: typeof import("node:fs/promises");

  /**
   * パスを結合・解決する `node:path` モジュールです。
   */
  readonly path: typeof import("node:path");
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/fs-bun#usage)
 */
export default class BunFs implements IStorage {
  /**
   * Node.js 互換モジュールのインスタンスを保持します。
   *
   * ストレージがオープンされるまで null です。オープン後は `node:fs/promises`、`node:path` の各モジュールが利用可能になります。
   */
  private con: Connection | null;

  /**
   * データを保存するルートディレクトリーの絶対パスです。
   */
  private root: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/fs-bun#usage)
   */
  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/fs-bun#usage)
   */
  public constructor(root: string = ".unikvs") {
    this.name = "BunFs";
    this.root = root;
    this.con = null;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/fs-bun#usage)
   */
  public get isOpen(): boolean {
    return !!this.con;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/fs-bun#usage)
   */
  public async open(): Promise<void> {
    // Bun 以外のランタイムで誤って使われた場合に、原因の分かるエラーを返します。
    if (typeof Bun === "undefined") {
      throw new UnsupportedRuntimeError();
    }

    const [fs, path] = await Promise.all([import("node:fs/promises"), import("node:path")]);
    const root = path.resolve(this.root);
    await fs.mkdir(root, { recursive: true });
    this.root = root;
    this.con = { fs, path };
  }

  /**
   * キーに対応する最終パスとアトミックな書き込み用の一時ファイルパスを解決します。
   *
   * 一時ファイルは最終パスと同じディレクトリーに作成します。rename が同じファイルシステム上で完結し、アトミックに行われることを保証するためです。
   */
  private resolvePath(key: string): { dest: string; tmp: string } {
    const { path } = this.con!;
    const dest = path.join(this.root, key);
    // 一意なサフィックスにより、同一キーへの並行書き込みでも一時ファイルが衝突しないようにします。
    const tmp = `${dest}.${Bun.randomUUIDv7()}.tmp`;

    return { dest, tmp };
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/fs-bun#usage)
   */
  public async write(
    args: Pick<IStorage.WriteArgs<Uint8Array<ArrayBuffer>>, "key" | "data" | "signal">,
  ): Promise<void> {
    const { fs } = this.con!;
    const { key, data, signal } = args;

    assertValidFilename(key);
    signal.throwIfAborted();

    const file = this.resolvePath(key);
    const tmp = Bun.file(file.tmp);
    try {
      await tmp.write(data);
      signal.throwIfAborted();
      await fs.rename(file.tmp, file.dest);
    } catch (ex) {
      // 失敗・中断時には一時ファイルを削除し、既存のデータを保全します。
      await tmp.delete().catch(() => {});
      throw ex;
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/fs-bun#usage)
   */
  public async read(
    args: Pick<IStorage.ReadArgs, "key" | "signal">,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const { path } = this.con!;
    const { key, signal } = args;

    assertValidFilename(key);
    signal.throwIfAborted();

    const file = path.join(this.root, key);
    const data = await Bun.file(file).bytes();

    return data;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/fs-bun#usage)
   */
  public async exists(args: Pick<IStorage.ExistsArgs, "key">): Promise<boolean> {
    const { path } = this.con!;
    const { key } = args;

    assertValidFilename(key);

    const file = path.join(this.root, key);
    return await Bun.file(file).exists();
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/fs-bun#usage)
   */
  public async delete(args: Pick<IStorage.DeleteArgs, "key">): Promise<void> {
    const { path } = this.con!;
    const { key } = args;

    assertValidFilename(key);

    const file = path.join(this.root, key);
    await Bun.file(file).delete();
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/fs-bun#usage)
   */
  public async clear(): Promise<void> {
    const { fs } = this.con!;
    // ルートディレクトリー自体を削除したあと、再度空のディレクトリーを作成することでクリアーとします。
    await fs.rm(this.root, { recursive: true, force: true });
    await fs.mkdir(this.root, { recursive: true });
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/fs-bun#streams)
   */
  public async getWritable(
    args: Pick<IStorage.GetWritableArgs, "key" | "signal">,
  ): Promise<WritableStream<Uint8Array<ArrayBuffer>>> {
    const { fs } = this.con!;
    const { key, signal } = args;

    assertValidFilename(key);
    signal.throwIfAborted();

    const file = this.resolvePath(key);

    // 一時ファイルへの書き込みシンクを作成します。
    const tmp = Bun.file(file.tmp);
    const sink = tmp.writer();
    const removeTmp = () => tmp.delete().catch(() => {});

    // 中断と失敗のどちらからでも後始末が走るため、完了処理は一度だけ行います。
    let finished = false;
    const finish = async (reason?: unknown): Promise<void> => {
      if (finished) return;
      finished = true;
      signal.removeEventListener("abort", onAbort);
      // 先に一時ファイルを削除し、書き込み途中の内容を最終パスへ残しません。
      await removeTmp();
      try {
        await sink.end(reason instanceof Error ? reason : undefined);
      } catch {
        // 後始末としての end なので、失敗しても無視します。
      }
    };
    const onAbort = () => {
      void finish(signal.reason);
    };

    const writable = new WritableStream<Uint8Array<ArrayBuffer>>({
      async write(chunk) {
        signal.throwIfAborted();
        try {
          await sink.write(chunk);
          // バッファーに溜め込まず、チャンクごとにディスクへ書き出してバックプレッシャーとします。
          await sink.flush();
        } catch (ex) {
          await finish(ex);
          throw ex;
        }
      },
      async close() {
        signal.throwIfAborted();
        try {
          await sink.end();
        } catch (ex) {
          await removeTmp();
          throw ex;
        }
        // flush が完了した時点で初めて最終パスへ置き換えます (swap-on-close)。
        // 以降の中断で一時ファイルを消さないよう、完了済みとして扱います。
        finished = true;
        signal.removeEventListener("abort", onAbort);
        try {
          await fs.rename(file.tmp, file.dest);
        } catch (ex) {
          // rename に失敗した場合も一時ファイルを削除し、既存のデータを保全します。
          await removeTmp();
          throw ex;
        }
      },
      async abort(reason) {
        await finish(reason);
      },
    });

    // 中断時はストリームを閉じられなくても、一時ファイルの削除だけは必ず行います。
    signal.addEventListener("abort", onAbort, { once: true });

    return writable;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/fs-bun#streams)
   */
  public getReadable(
    args: Pick<IStorage.GetReadableArgs, "key" | "signal">,
  ): ReadableStream<Uint8Array<ArrayBuffer>> {
    const { path } = this.con!;
    const { key, signal } = args;

    assertValidFilename(key);
    signal.throwIfAborted();

    const file = path.join(this.root, key);
    const source = Bun.file(file);
    let reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | null = null;

    // 中断時は取得済みのリーダーをキャンセルし、待機中の読み取りを終わらせます。
    // 中断理由は次の pull の throwIfAborted でストリームのエラーとして通知します。
    const onAbort = (): void => {
      void reader?.cancel(signal!.reason).catch(() => {});
    };
    const removeAbortListener = (): void => {
      signal.removeEventListener("abort", onAbort);
    };
    signal.addEventListener("abort", onAbort, { once: true });

    // Bun.file().stream() はリーダー取得時にファイルを開くため、その同期的な例外をストリームのエラーとして遅延させます。
    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      async pull(controller) {
        try {
          signal.throwIfAborted();
          reader ??= source.stream().getReader();
          const { done, value } = await reader.read();
          signal.throwIfAborted();

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
      async cancel(reason) {
        removeAbortListener();
        await reader?.cancel(reason).catch(() => {});
      },
    });
  }
}
