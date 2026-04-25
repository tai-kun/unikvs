import type { IStorage } from "@unikvs/core";
import { assertValidFilename, assertValidDirname } from "@unikvs/utils";

/**
 * ブラウザーの OPFS (Origin Private File System) を永続化先として使用するストレージクラスです。
 *
 * ブラウザー環境（メインスレッド、または Web Worker）での動作を前提としています。
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

  public readonly name: string;

  /**
   * Opfs インスタンスを初期化します。
   *
   * @param root OPFS 内でデータを保存するディレクトリー名またはハンドルです。
   */
  public constructor(root: string | FileSystemDirectoryHandle = ".unikvs") {
    this.name = "Opfs";
    if (typeof root === "string") {
      assertValidDirname(root);

      this.root = root;
      this.rootHandle = null;
    } else {
      this.root = root.name;
      this.rootHandle = root;
    }
  }

  public get isOpen(): boolean {
    return this.rootHandle !== null;
  }

  public async open(): Promise<void> {
    if (this.rootHandle) {
      return;
    }

    const opfsRoot = await navigator.storage.getDirectory();
    if (!this.root || this.root === "." || this.root === "/") {
      this.rootHandle = opfsRoot;
    } else {
      // 指定された名前のディレクトリーを作成・取得します
      this.rootHandle = await opfsRoot.getDirectoryHandle(this.root, { create: true });
    }
  }

  public async write(
    args: Pick<IStorage.WriteArgs<Uint8Array<ArrayBuffer>>, "key" | "data">,
  ): Promise<void> {
    const { key, data } = args;

    assertValidFilename(key);

    const fileHandle = await this.rootHandle!.getFileHandle(key, { create: true });
    const writable = await fileHandle.createWritable();

    try {
      await writable.write(data);
    } finally {
      await writable.close();
    }
  }

  public async read(args: Pick<IStorage.ReadArgs, "key">): Promise<Uint8Array<ArrayBuffer>> {
    const { key } = args;

    assertValidFilename(key);

    const fileHandle = await this.rootHandle!.getFileHandle(key);
    const file = await fileHandle.getFile();
    const buff = await file.arrayBuffer();

    return new Uint8Array(buff);
  }

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

  public async delete(args: Pick<IStorage.DeleteArgs, "key">): Promise<void> {
    const { key } = args;

    assertValidFilename(key);

    await this.rootHandle!.removeEntry(key);
  }

  public async clear(): Promise<void> {
    if (!this.root || this.root === "." || this.root === "/") {
      // ルートディレクトリー直下を使用している場合は、全てのエントリーを個別に削除します。
      for await (const name of this.rootHandle!.keys()) {
        await this.rootHandle!.removeEntry(name, { recursive: true });
      }
    } else {
      // サブディレクトリーを使用している場合は、ディレクトリーごと削除して再作成します。
      const opfsRoot = await navigator.storage.getDirectory();
      await opfsRoot.removeEntry(this.root, { recursive: true });
      this.rootHandle = await opfsRoot.getDirectoryHandle(this.root, { create: true });
    }
  }

  public async getWritable(
    args: Pick<IStorage.GetWritableArgs, "key">,
  ): Promise<WritableStream<Uint8Array<ArrayBuffer>>> {
    const { key } = args;

    assertValidFilename(key);

    const fileHandle = await this.rootHandle!.getFileHandle(key, { create: true });
    const writable = await fileHandle.createWritable();

    return writable;
  }

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
