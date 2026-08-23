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
   * Node.js ストリームと Web ストリームを相互変換する `node:stream` モジュールです。
   */
  readonly stream: typeof import("node:stream");
};

/**
 * ローカルのファイルシステムを永続化先として使用するストレージクラスです。
 *
 * Node.js 環境での動作を前提としています。指定されたルートディレクトリー配下に
 * キーをファイル名としてデータを保存します。
 */
export default class NodeFs implements IStorage {
  /**
   * Node.js モジュールのインスタンスを保持します。
   *
   * ストレージがオープンされるまで null です。オープン後は
   * `node:fs`、`node:path`、`node:stream` の各モジュールが利用可能になります。
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
    const [fs, path, stream] = await Promise.all([
      import("node:fs"),
      import("node:path"),
      import("node:stream"),
    ]);
    const root = path.resolve(this.root);
    await fs.promises.mkdir(root, { recursive: true });
    this.con = { fs, path, stream: stream as any };
  }

  /**
   * 指定されたデータを、対応するキーでストレージに保存します。
   *
   * @param args.key 保存先のキーです。
   * @param args.data 保存するバイト配列です。
   * @param args.signal 中断シグナルです。
   */
  public async write(
    args: Pick<IStorage.WriteArgs<Uint8Array<ArrayBuffer>>, "key" | "data" | "signal">,
  ): Promise<void> {
    const { fs, path } = this.con!;
    const { key, data, signal } = args;

    assertValidFilename(key);

    const file = path.join(this.root, key);
    await fs.promises.writeFile(file, data, { signal });
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
   * @param args.key 書き込み先のキーです。
   * @returns 書き込み可能なストリームです。
   */
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
