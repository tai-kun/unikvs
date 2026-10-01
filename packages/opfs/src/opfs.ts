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
  public async open(args: Pick<IStorage.OpenArgs, "signal">): Promise<void> {
    const { signal } = args;

    signal.throwIfAborted();

    if (this.rootHandle) {
      return;
    }

    let handle = await navigator.storage.getDirectory();
    signal.throwIfAborted();

    if (this.root !== "") {
      // 指定された名前のディレクトリーを作成・取得します。
      for (const dirname of this.root.split("/")) {
        handle = await handle.getDirectoryHandle(dirname, { create: true });
        signal.throwIfAborted();
      }
    }

    // 中断時に部分的に開いた状態を残さないよう、すべて完了してからハンドルを公開します。
    this.rootHandle = handle;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/opfs#usage)
   */
  public async write(
    args: Pick<IStorage.WriteArgs<Uint8Array<ArrayBuffer>>, "key" | "data" | "signal">,
  ): Promise<void> {
    const { key, data, signal } = args;

    assertValidFilename(key);
    signal.throwIfAborted();

    const fileHandle = await this.rootHandle!.getFileHandle(key, { create: true });
    signal.throwIfAborted();
    const writable = await fileHandle.createWritable();
    signal.throwIfAborted();

    try {
      await writable.write(data);
      // close でコミットされる前に中断を検知し、部分的な書き込みを破棄します。
      signal.throwIfAborted();
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
  public async read(
    args: Pick<IStorage.ReadArgs, "key" | "signal">,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const { key, signal } = args;

    assertValidFilename(key);
    signal.throwIfAborted();

    const fileHandle = await this.rootHandle!.getFileHandle(key);
    signal.throwIfAborted();
    const file = await fileHandle.getFile();
    signal.throwIfAborted();
    const buff = await file.arrayBuffer();

    return new Uint8Array(buff);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/opfs#usage)
   */
  public async exists(args: Pick<IStorage.ExistsArgs, "key" | "signal">): Promise<boolean> {
    const { key, signal } = args;

    assertValidFilename(key);
    signal.throwIfAborted();

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
  public async delete(args: Pick<IStorage.DeleteArgs, "key" | "signal">): Promise<void> {
    const { key, signal } = args;

    assertValidFilename(key);
    signal.throwIfAborted();

    await this.rootHandle!.removeEntry(key);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/opfs#usage)
   */
  public async clear(args: Pick<IStorage.ClearArgs, "signal">): Promise<void> {
    const { signal } = args;

    signal.throwIfAborted();

    if (this.root === "") {
      // ルートディレクトリー直下を使用している場合は、すべてのエントリーを個別に削除します。

      for await (const name of this.rootHandle!.keys()) {
        signal.throwIfAborted();
        await this.rootHandle!.removeEntry(name, { recursive: true });
      }
    } else {
      // サブディレクトリーを使用している場合は、ディレクトリーごと削除して再作成します。

      const dirnames = this.root.split("/");
      let parentHandle = await navigator.storage.getDirectory();
      signal.throwIfAborted();
      for (const dirname of dirnames.slice(0, -1)) {
        parentHandle = await parentHandle.getDirectoryHandle(dirname, { create: true });
        signal.throwIfAborted();
      }

      const currentDirname = dirnames[dirnames.length - 1]!;
      await parentHandle.removeEntry(currentDirname, { recursive: true });
      signal.throwIfAborted();
      this.rootHandle = await parentHandle.getDirectoryHandle(currentDirname, { create: true });
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/opfs#streams)
   */
  public async getWritable(
    args: Pick<IStorage.GetWritableArgs, "key" | "signal">,
  ): Promise<WritableStream<Uint8Array<ArrayBuffer>>> {
    const { key, signal } = args;

    assertValidFilename(key);
    signal.throwIfAborted();

    const fileHandle = await this.rootHandle!.getFileHandle(key, { create: true });
    signal.throwIfAborted();
    const writable = await fileHandle.createWritable();
    signal.throwIfAborted();

    const writer = writable.getWriter();

    // 中断と失敗のどちらからでも後始末が走るため、完了処理は一度だけ行います。
    let finished = false;
    const removeAbortListener = (): void => {
      signal.removeEventListener("abort", onAbort);
    };
    const finish = async (reason?: unknown): Promise<void> => {
      if (finished) return;
      finished = true;
      removeAbortListener();
      // 書き込み途中の内容をコミットしないよう、close ではなく abort で破棄します。
      await writer.abort(reason).catch(() => {});
    };
    const onAbort = (): void => {
      void finish(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });

    return new WritableStream<Uint8Array<ArrayBuffer>>({
      async write(chunk) {
        signal.throwIfAborted();
        try {
          await writer.write(chunk);
        } catch (ex) {
          await finish(ex);
          throw ex;
        }
      },
      async close() {
        signal.throwIfAborted();
        try {
          await writer.close();
        } catch (ex) {
          await finish(ex);
          throw ex;
        }
        // close でコミットされた後は、中断時に破棄するものがありません。
        finished = true;
        removeAbortListener();
      },
      async abort(reason) {
        await finish(reason);
      },
    });
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/opfs#streams)
   */
  public async getReadable(
    args: Pick<IStorage.GetReadableArgs, "key" | "signal">,
  ): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
    const { key, signal } = args;

    assertValidFilename(key);
    signal.throwIfAborted();

    const fileHandle = await this.rootHandle!.getFileHandle(key);
    signal.throwIfAborted();
    const file = await fileHandle.getFile();
    signal.throwIfAborted();

    const reader = file.stream().getReader();

    // 中断時は待機中の読み取りを終わらせ、以降の pull で中断理由を通知できるようにします。
    const onAbort = (): void => {
      void reader.cancel(signal!.reason).catch(() => {});
    };
    const removeAbortListener = (): void => {
      signal.removeEventListener("abort", onAbort);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void reader.closed.then(removeAbortListener, removeAbortListener);

    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      async pull(controller) {
        try {
          signal.throwIfAborted();
          const { done, value } = await reader.read();
          signal.throwIfAborted();

          if (done) {
            removeAbortListener();
            controller.close();
            return;
          }

          controller.enqueue(value);
        } catch (ex) {
          removeAbortListener();
          controller.error(ex);
        }
      },
      async cancel(reason) {
        removeAbortListener();
        await reader.cancel(reason).catch(() => {});
      },
    });
  }
}
