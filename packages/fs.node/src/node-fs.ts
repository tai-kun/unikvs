import type { IStorage } from "@unikvs/core";
import { assertValidFilename } from "@unikvs/utils";

/**
 * ストレージの動作に必要な Node.js モジュールをまとめて保持する型定義です。
 */
type Connection = {
  /**
   * ファイルシステム操作を行う `node:fs` モジュールです。
   */
  readonly fs: typeof import("node:fs");

  /**
   * パスを結合・解決する `node:path` モジュールです。
   */
  readonly path: typeof import("node:path");

  /**
   * 一時ファイルの一意な名前を生成する `node:crypto` モジュールです。
   */
  readonly crypto: typeof import("node:crypto");

  /**
   * Node.js ストリームと Web ストリームを相互変換する `node:stream` モジュールです。
   */
  readonly stream: typeof import("node:stream");
};

/**
 * ローカルのファイルシステムを永続化先として使用するストレージクラスです。
 *
 * Node.js 環境での動作を前提としています。指定されたルートディレクトリー配下にキーをファイル名としてデータを保存します。
 */
export default class NodeFs implements IStorage {
  /**
   * Node.js モジュールのインスタンスを保持します。
   *
   * ストレージがオープンされるまで null です。オープン後は `node:fs`、`node:path`、`node:stream` の各モジュールが利用可能になります。
   */
  private con: Connection | null;

  /**
   * データを保存するルートディレクトリーの絶対パスです。
   */
  private root: string;

  /**
   * ストレージの名前です。デバッグメッセージなどに使用されます。
   */
  public readonly name: string;

  /**
   * NodeFs インスタンスを初期化します。
   *
   * @param root データを保存するルートディレクトリーのパスです。相対パスの場合はカレントワーキングディレクトリーからの相対として解決されます。デフォルトは `".unikvs"` です。
   */
  public constructor(root: string = ".unikvs") {
    this.name = "NodeFs";
    this.root = root;
    this.con = null;
  }

  /**
   * ストレージが現在利用可能な状態であるかを示します。
   */
  public get isOpen(): boolean {
    return !!this.con;
  }

  /**
   * ストレージをオープンし、読み書きが可能な状態に準備します。
   *
   * ルートディレクトリーが存在しない場合は再帰的に作成します。既にオープンされている場合も再度初期化を行います。
   */
  public async open(): Promise<void> {
    const [fs, path, stream, crypto] = await Promise.all([
      import("node:fs"),
      import("node:path"),
      import("node:stream"),
      import("node:crypto"),
    ]);
    const root = path.resolve(this.root);
    await fs.promises.mkdir(root, { recursive: true });
    this.root = root;
    this.con = { fs, path, crypto, stream: stream as any };
  }

  /**
   * キーに対応する最終パスとアトミックな書き込み用の一時ファイルパスを解決します。
   *
   * 一時ファイルは最終パスと同じディレクトリーに作成します。rename が同じファイルシステム上で完結し、アトミックに行われることを保証するためです。
   */
  private resolvePath(key: string): { dest: string; tmp: string } {
    const { path, crypto } = this.con!;
    const dest = path.join(this.root, key);
    // 一意なサフィックスにより、同一キーへの並行書き込みでも一時ファイルが衝突しないようにします。
    const tmp = `${dest}.${crypto.randomUUID()}.tmp`;

    return { dest, tmp };
  }

  /**
   * 指定されたデータを、対応するキーでストレージに保存します。
   *
   * データは一時ファイルへ書き出した後に最終パスへ rename されるため、書き込みが失敗または中断された場合でも既存のデータが破壊されることはありません。
   *
   * @param args.key 保存先のキーです。
   * @param args.data 保存するバイト配列です。
   * @param args.signal 中断シグナルです。
   */
  public async write(
    args: Pick<IStorage.WriteArgs<Uint8Array<ArrayBuffer>>, "key" | "data" | "signal">,
  ): Promise<void> {
    const { fs } = this.con!;
    const { key, data, signal } = args;

    assertValidFilename(key);
    signal?.throwIfAborted();

    const file = this.resolvePath(key);
    try {
      await fs.promises.writeFile(file.tmp, data, { signal });
      await fs.promises.rename(file.tmp, file.dest);
    } catch (err) {
      // 失敗・中断時には一時ファイルを削除し、既存のデータを保全します。
      await fs.promises.rm(file.tmp, { force: true }).catch(() => {});
      throw err;
    }
  }

  /**
   * 指定されたキーに対応するデータをストレージから取得します。
   *
   * @param args.key 取得元のキーです。
   * @param args.signal 中断シグナルです。
   * @returns キーに対応するバイト配列です。
   */
  public async read(
    args: Pick<IStorage.ReadArgs, "key" | "signal">,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const { fs, path } = this.con!;
    const { key, signal } = args;

    assertValidFilename(key);

    const file = path.join(this.root, key);
    const data = await fs.promises.readFile(file, { signal });

    return data;
  }

  /**
   * 指定されたキーに対応するデータがストレージ内に存在するかを確認します。
   *
   * @param args.key 確認するキーです。
   * @returns キーに対応するデータが存在する場合は true、それ以外は false です。
   */
  public async exists(args: Pick<IStorage.ExistsArgs, "key">): Promise<boolean> {
    const { fs, path } = this.con!;
    const { key } = args;

    assertValidFilename(key);

    const file = path.join(this.root, key);
    try {
      await fs.promises.access(file);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 指定されたキーに対応するデータをストレージから削除します。
   *
   * @param args.key 削除するキーです。
   */
  public async delete(args: Pick<IStorage.DeleteArgs, "key">): Promise<void> {
    const { fs, path } = this.con!;
    const { key } = args;

    assertValidFilename(key);

    const file = path.join(this.root, key);
    await fs.promises.unlink(file);
  }

  /**
   * ストレージ内のすべてのデータを完全に消去します。
   *
   * ルートディレクトリー自体を削除したあと、空のディレクトリーを再作成します。
   */
  public async clear(): Promise<void> {
    const { fs } = this.con!;
    // ルートディレクトリー自体を削除したあと、再度空のディレクトリーを作成することでクリアーとします。
    await fs.promises.rm(this.root, { recursive: true, force: true });
    await fs.promises.mkdir(this.root, { recursive: true });
  }

  /**
   * 指定されたキーに対応する書き込み可能なストリームを取得します。
   *
   * ストリームは一時ファイルへ書き出し、正常に close された場合のみ最終パスへ rename (swap-on-close) します。
   * 中断シグナルが abort するとストリームは破棄され、一時ファイルが削除されます。
   * 書き込みの失敗・中断時に既存のデータが破壊されることはありません。
   *
   * @param args.key 書き込み先のキーです。
   * @param args.signal 中断シグナルです。
   * @returns 書き込み可能なストリームです。
   */
  public async getWritable(
    args: Pick<IStorage.GetWritableArgs, "key"> & { signal?: AbortSignal },
  ): Promise<WritableStream<Uint8Array<ArrayBuffer>>> {
    const { fs } = this.con!;
    const { key, signal } = args;

    assertValidFilename(key);
    signal?.throwIfAborted();

    const file = this.resolvePath(key);

    // 一時ファイルへの書き込みストリームを作成します。
    const writeStream = fs.createWriteStream(file.tmp);
    const removeTmp = () => fs.promises.rm(file.tmp, { force: true }).catch(() => {});

    // fs ストリーム上のエラーは各操作の Promise 経由で通知するため、ここで捕捉して未処理のエラーイベントを防ぎます。
    let streamError: Error | null = null;
    writeStream.on("error", (err) => {
      streamError ??= err;
    });

    if (signal) {
      const onAbort = () => {
        writeStream.destroy(
          signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason)),
        );
        void removeTmp();
      };
      signal.addEventListener("abort", onAbort, { once: true });
      // ストリームの終了後は中断を監視する必要がないため、リスナーを解除します。
      writeStream.on("close", () => signal.removeEventListener("abort", onAbort));
    }

    return new WritableStream<Uint8Array<ArrayBuffer>>({
      async write(chunk) {
        signal?.throwIfAborted();
        if (streamError) {
          throw streamError;
        }
        // バッファーが一杯の場合は書き込めるようになるまで待機します (バックプレッシャー)。
        // 中断やエラーでストリームが終了した場合も待機を打ち切ります。
        if (!writeStream.write(chunk)) {
          await new Promise<void>((resolve) => {
            const cleanup = () => {
              writeStream.off("drain", onSettled);
              writeStream.off("error", onSettled);
              writeStream.off("close", onSettled);
            };
            const onSettled = () => {
              cleanup();
              resolve();
            };
            writeStream.once("drain", onSettled);
            writeStream.once("error", onSettled);
            writeStream.once("close", onSettled);
          });
          signal?.throwIfAborted();
          if (streamError) {
            throw streamError;
          }
        }
      },
      async close() {
        signal?.throwIfAborted();
        if (streamError) {
          throw streamError;
        }
        await new Promise<void>((resolve, reject) => {
          writeStream.end((err: Error | null | undefined) => (err ? reject(err) : resolve()));
        });
        // flush が完了した時点で初めて最終パスへ置き換えます (swap-on-close)。
        try {
          await fs.promises.rename(file.tmp, file.dest);
        } catch (ex) {
          // rename に失敗した場合も一時ファイルを削除し、既存のデータを保全します。
          await removeTmp();
          throw ex;
        }
      },
      async abort(reason) {
        writeStream.destroy(reason instanceof Error ? reason : new Error(String(reason)));
        await removeTmp();
      },
    });
  }

  /**
   * 指定されたキーに対応する読み取り可能なストリームを取得します。
   *
   * @param args.key 読み取り元のキーです。
   * @param args.signal 中断シグナルです。
   * @returns 読み取り可能なストリームです。
   */
  public getReadable(
    args: Pick<IStorage.GetReadableArgs, "key" | "signal">,
  ): ReadableStream<Uint8Array<ArrayBuffer>> {
    const { fs, path, stream } = this.con!;
    const { key } = args;

    assertValidFilename(key);

    const file = path.join(this.root, key);
    const readStream = fs.createReadStream(file);
    const readableStream = stream.Readable.toWeb(readStream);

    // @ts-expect-error
    return readableStream;
  }
}
