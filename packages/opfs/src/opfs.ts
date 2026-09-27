import type { IStorage } from "@unikvs/core";
import { assertValidDirname, assertValidFilename } from "@unikvs/utils";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/opfs#usage)
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
   * [API Reference](https://tai-kun.github.io/unikvs/packages/opfs#usage)
   */
  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/opfs#usage)
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
   * [API Reference](https://tai-kun.github.io/unikvs/packages/opfs#usage)
   */
  public get isOpen(): boolean {
    return this.rootHandle !== null;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/opfs#usage)
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
   * [API Reference](https://tai-kun.github.io/unikvs/packages/opfs#usage)
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
   * [API Reference](https://tai-kun.github.io/unikvs/packages/opfs#usage)
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
   * [API Reference](https://tai-kun.github.io/unikvs/packages/opfs#usage)
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
   * [API Reference](https://tai-kun.github.io/unikvs/packages/opfs#usage)
   */
  public async delete(args: Pick<IStorage.DeleteArgs, "key">): Promise<void> {
    const { key } = args;

    assertValidFilename(key);

    await this.rootHandle!.removeEntry(key);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/opfs#usage)
   */
  public async clear(): Promise<void> {
    if (this.root === "") {
      // ルートディレクトリー直下を使用している場合は、すべてのエントリーを個別に削除します。

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
   * [API Reference](https://tai-kun.github.io/unikvs/packages/opfs#streams)
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
   * [API Reference](https://tai-kun.github.io/unikvs/packages/opfs#streams)
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
