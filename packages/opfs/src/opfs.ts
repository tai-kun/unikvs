import type { IStorage } from "@unikvs/core";
import { assertValidDirname, assertValidFilename } from "@unikvs/utils";

/**
 * ブラウザーの OPFS (Origin Private File System) を永続化先として使用するストレージクラスです。
 *
 * ブラウザー環境（メインスレッド、または Web Worker）での動作を前提としています。
 *
 * 指定されたルートディレクトリー配下にキーをファイル名としてデータを保存します。
 */
export default class Opfs implements IStorage {
  /**
   * OPFS 内の作業対象となるディレクトリーハンドルを保持します。
   *
   * ストレージがオープンされるまで null です。
   */
  private rootHandle: FileSystemDirectoryHandle | null;

  /**
   * データを保存する OPFS 内のルートディレクトリー名です。
   */
  private root: string;

  /**
   * ストレージの名前です。デバッグやエラーメッセージなどに使用されます。
   */
  public readonly name: string;

  /**
   * Opfs インスタンスを初期化します。
   *
   * @param root データを保存する OPFS 内のディレクトリー名、または既存のディレクトリーハンドルです。デフォルトは `".unikvs"` です。
   */
  public constructor(root: string | FileSystemDirectoryHandle = ".unikvs") {
    this.name = "Opfs";
    if (typeof root === "string") {
      if (root === "" || root === "." || root === "/") {
        this.root = "";
      } else {
        this.root = root.replace(/\/+/g, "/");
        if (this.root.startsWith("/")) {
          this.root = this.root.slice(1);
        }
        if (this.root.endsWith("/")) {
          this.root = this.root.slice(0, -1);
        }

        for (const dirname of this.root.split("/")) {
          assertValidDirname(dirname);
        }
      }

      this.rootHandle = null;
    } else {
      this.root = root.name;
      this.rootHandle = root;
    }
  }

  /**
   * ストレージがオープンされているかどうかを示します。
   */
  public get isOpen(): boolean {
    return this.rootHandle !== null;
  }

  /**
   * ストレージをオープンし、OPFS 内のルートディレクトリーを作成または取得します。
   */
  public async open(): Promise<void> {
    if (this.rootHandle) {
      return;
    }

    this.rootHandle = await navigator.storage.getDirectory();
    if (this.root !== "") {
      // 指定された名前のディレクトリーを作成・取得します。
      for (const dirname of this.root.split("/")) {
        this.rootHandle = await this.rootHandle.getDirectoryHandle(dirname, { create: true });
      }
    }
  }

  /**
   * 指定されたデータを、対応するキーでストレージに保存します。
   *
   * 書き込みが失敗した場合は変更を破棄するため、既存のデータが部分書き込みによって破壊されることはありません。
   *
   * @param args.key 保存先のキーです。
   * @param args.data 保存するバイト配列です。
   */
  public async write(
    args: Pick<IStorage.WriteArgs<Uint8Array<ArrayBuffer>>, "key" | "data">,
  ): Promise<void> {
    const { key, data } = args;

    assertValidFilename(key);

    const fileHandle = await this.rootHandle!.getFileHandle(key, { create: true });
    const writable = await fileHandle.createWritable();

    try {
      await writable.write(data);
    } catch (ex) {
      // 失敗時に close すると、書き込めた分の内容が既存データを上書きしてコミットされるため abort して変更を破棄します。
      await writable.abort(ex).catch(() => {});
      throw ex;
    }

    await writable.close();
  }

  /**
   * 指定されたキーに対応するデータをストレージから取得します。
   *
   * @param args.key 取得元のキーです。
   * @returns キーに対応するバイト配列です。
   */
  public async read(args: Pick<IStorage.ReadArgs, "key">): Promise<Uint8Array<ArrayBuffer>> {
    const { key } = args;

    assertValidFilename(key);

    const fileHandle = await this.rootHandle!.getFileHandle(key);
    const file = await fileHandle.getFile();
    const buff = await file.arrayBuffer();

    return new Uint8Array(buff);
  }

  /**
   * 指定されたキーがストレージ内に存在するかどうかを確認します。
   *
   * @param args.key 存在確認するキーです。
   * @returns キーが存在する場合は `true`、それ以外は `false` です。
   */
  public async exists(args: Pick<IStorage.ExistsArgs, "key">): Promise<boolean> {
    const { key } = args;

    assertValidFilename(key);

    try {
      await this.rootHandle!.getFileHandle(key);
      return true;
    } catch (ex) {
      if (ex instanceof DOMException && ex.name === "NotFoundError") {
        return false;
      }

      throw ex;
    }
  }

  /**
   * 指定されたキーに対応するデータをストレージから削除します。
   *
   * @param args.key 削除するキーです。
   */
  public async delete(args: Pick<IStorage.DeleteArgs, "key">): Promise<void> {
    const { key } = args;

    assertValidFilename(key);

    await this.rootHandle!.removeEntry(key);
  }

  /**
   * ストレージ内の全てのデータを消去します。
   *
   * ルートディレクトリー直下を使用している場合は個別にエントリーを削除し、サブディレクトリーを使用している場合はディレクトリーごと削除して再作成します。
   */
  public async clear(): Promise<void> {
    if (this.root === "") {
      // ルートディレクトリー直下を使用している場合は、全てのエントリーを個別に削除します。

      for await (const name of this.rootHandle!.keys()) {
        await this.rootHandle!.removeEntry(name, { recursive: true });
      }
    } else {
      // サブディレクトリーを使用している場合は、ディレクトリーごと削除して再作成します。

      const dirnames = this.root.split("/");
      let parentHandle = await navigator.storage.getDirectory();
      for (const dirname of dirnames.slice(0, -1)) {
        parentHandle = await parentHandle.getDirectoryHandle(dirname, { create: true });
      }

      const currentDirname = dirnames[dirnames.length - 1]!;
      await parentHandle.removeEntry(currentDirname, { recursive: true });
      this.rootHandle = await parentHandle.getDirectoryHandle(currentDirname, { create: true });
    }
  }

  /**
   * 指定されたキーに対応する書き込み可能ストリームを取得します。
   *
   * @param args.key 書き込み先のキーです。
   * @returns 書き込み可能ストリームです。
   */
  public async getWritable(
    args: Pick<IStorage.GetWritableArgs, "key">,
  ): Promise<WritableStream<Uint8Array<ArrayBuffer>>> {
    const { key } = args;

    assertValidFilename(key);

    const fileHandle = await this.rootHandle!.getFileHandle(key, { create: true });
    const writable = await fileHandle.createWritable();

    return writable;
  }

  /**
   * 指定されたキーに対応する読み取り可能ストリームを取得します。
   *
   * @param args.key 読み取り元のキーです。
   * @returns 読み取り可能ストリームです。
   */
  public async getReadable(
    args: Pick<IStorage.GetReadableArgs, "key">,
  ): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
    const { key } = args;

    assertValidFilename(key);

    const fileHandle = await this.rootHandle!.getFileHandle(key);
    const file = await fileHandle.getFile();

    return file.stream();
  }
}
