import type { IStorage } from "@unikvs/core";
import { assertValidFilename } from "@unikvs/utils";

type Connection = {
  readonly fs: typeof import("node:fs");
  readonly path: typeof import("node:path");
  readonly stream: typeof import("node:stream");
};

/**
 * ローカルのファイルシステムを永続化先として使用するストレージクラスです。
 *
 * Node.js 環境での動作を前提としています。
 */
export default class NodeFs implements IStorage {
  /**
   * Node.js モジュールのインスタンスを保持します。
   *
   * ストレージがオープンされるまで null です。
   */
  private con: Connection | null;

  /**
   * データを保存するルートディレクトリーのパスです。
   */
  private root: string;

  public readonly name: string;

  /**
   * NodeFs インスタンスを初期化します。
   *
   * @param root データを保存するルートディレクトリーのパスです。
   */
  public constructor(root: string = ".unikvs") {
    this.name = "NodeFs";
    this.root = root;
    this.con = null;
  }

  public get isOpen(): boolean {
    return !!this.con;
  }

  public async open(): Promise<void> {
    const [fs, path, stream] = await Promise.all([
      import("node:fs"),
      import("node:path"),
      import("node:stream"),
    ]);
    const root = path.resolve(this.root);
    await fs.promises.mkdir(root, { recursive: true });
    this.con = { fs, path, stream: stream as any };
  }

  public async write(
    args: Pick<IStorage.WriteArgs<Uint8Array<ArrayBuffer>>, "key" | "data" | "signal">,
  ): Promise<void> {
    const { fs, path } = this.con!;
    const { key, data, signal } = args;

    assertValidFilename(key);

    const file = path.join(this.root, key);
    await fs.promises.writeFile(file, data, { signal });
  }

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

  public async delete(args: Pick<IStorage.DeleteArgs, "key">): Promise<void> {
    const { fs, path } = this.con!;
    const { key } = args;

    assertValidFilename(key);

    const file = path.join(this.root, key);
    await fs.promises.unlink(file);
  }

  public async clear(): Promise<void> {
    const { fs } = this.con!;
    // ルートディレクトリー自体を削除したあと、再度空のディレクトリーを作成することでクリアーとします。
    await fs.promises.rm(this.root, { recursive: true, force: true });
    await fs.promises.mkdir(this.root, { recursive: true });
  }

  public getWritable(
    args: Pick<IStorage.GetWritableArgs, "key">,
  ): WritableStream<Uint8Array<ArrayBuffer>> {
    const { fs, path, stream } = this.con!;
    const { key } = args;

    assertValidFilename(key);

    const file = path.join(this.root, key);
    const writeStream = fs.createWriteStream(file);
    const writableStream = stream.Writable.toWeb(writeStream);

    return writableStream;
  }

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
