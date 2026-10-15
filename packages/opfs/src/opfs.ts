import type { IStorage } from "@unikvs/core";
import { assertValidDirname, assertValidFilename } from "@unikvs/utils";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/opfs#usage)
 */
export type OpfsOptions = {};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/opfs#usage)
 */
export default class Opfs implements IStorage {
  /**
   * OPFS 内の作業対象となるディレクトリーハンドルを保持します。
   *
   * ストレージがオープンされるまで null です。
   */
  #rootHandle: FileSystemDirectoryHandle | null;

  /**
   * データを保存する OPFS 内のルートディレクトリー名です。
   */
  #root: string;

  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/opfs#usage)
   */
  public constructor(
    root: string | FileSystemDirectoryHandle = ".unikvs",
    _options: OpfsOptions = {},
  ) {
    this.name = "Opfs";
    if (typeof root === "string") {
      if (root === "" || root === "." || root === "/") {
        this.#root = "";
      } else {
        this.#root = root.replace(/\/+/g, "/");
        if (this.#root.startsWith("/")) {
          this.#root = this.#root.slice(1);
        }
        if (this.#root.endsWith("/")) {
          this.#root = this.#root.slice(0, -1);
        }

        for (const dirname of this.#root.split("/")) {
          assertValidDirname(dirname);
        }
      }

      this.#rootHandle = null;
    } else {
      this.#root = root.name;
      this.#rootHandle = root;
    }
  }

  public get isOpen(): boolean {
    return this.#rootHandle !== null;
  }

  public async open(c: IStorage.OpenContext): Promise<void> {
    c.signal.throwIfAborted();

    if (this.#rootHandle) {
      return;
    }

    let handle = await navigator.storage.getDirectory();
    c.signal.throwIfAborted();

    if (this.#root !== "") {
      // 指定された名前のディレクトリーを作成・取得します。
      for (const dirname of this.#root.split("/")) {
        handle = await handle.getDirectoryHandle(dirname, { create: true });
        c.signal.throwIfAborted();
      }
    }

    // 中断時に部分的に開いた状態を残さないよう、すべて完了してからハンドルを公開します。
    this.#rootHandle = handle;
  }

  public async write(c: IStorage.WriteContext, data: Uint8Array<ArrayBuffer>): Promise<void> {
    assertValidFilename(c.key);
    c.signal.throwIfAborted();

    const fileHandle = await this.#rootHandle!.getFileHandle(c.key, { create: true });
    c.signal.throwIfAborted();
    const writable = await fileHandle.createWritable();
    c.signal.throwIfAborted();

    try {
      await writable.write(data);
      // close でコミットされる前に中断を検知し、部分的な書き込みを破棄します。
      c.signal.throwIfAborted();
    } catch (ex) {
      // 失敗時に close すると、書き込めた分の内容が既存データを上書きしてコミットされるため abort して変更を破棄します。
      await writable.abort(ex).catch(() => {});
      throw ex;
    }

    await writable.close();
  }

  public async read(c: IStorage.ReadContext): Promise<Uint8Array<ArrayBuffer>> {
    assertValidFilename(c.key);
    c.signal.throwIfAborted();

    const fileHandle = await this.#rootHandle!.getFileHandle(c.key);
    c.signal.throwIfAborted();
    const file = await fileHandle.getFile();
    c.signal.throwIfAborted();
    const buff = await file.arrayBuffer();

    return new Uint8Array(buff);
  }

  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    assertValidFilename(c.key);
    c.signal.throwIfAborted();

    try {
      await this.#rootHandle!.getFileHandle(c.key);
      return true;
    } catch (ex) {
      if (ex instanceof DOMException && ex.name === "NotFoundError") {
        return false;
      }

      throw ex;
    }
  }

  public async delete(c: IStorage.DeleteContext): Promise<void> {
    assertValidFilename(c.key);
    c.signal.throwIfAborted();

    await this.#rootHandle!.removeEntry(c.key);
  }

  public async clear(c: IStorage.ClearContext): Promise<void> {
    c.signal.throwIfAborted();

    if (this.#root === "") {
      // ルートディレクトリー直下を使用している場合は、すべてのエントリーを個別に削除します。

      for await (const name of this.#rootHandle!.keys()) {
        c.signal.throwIfAborted();
        await this.#rootHandle!.removeEntry(name, { recursive: true });
      }
    } else {
      // サブディレクトリーを使用している場合は、ディレクトリーごと削除して再作成します。

      const dirnames = this.#root.split("/");
      let parentHandle = await navigator.storage.getDirectory();
      c.signal.throwIfAborted();
      for (const dirname of dirnames.slice(0, -1)) {
        parentHandle = await parentHandle.getDirectoryHandle(dirname, { create: true });
        c.signal.throwIfAborted();
      }

      const currentDirname = dirnames[dirnames.length - 1]!;
      await parentHandle.removeEntry(currentDirname, { recursive: true });
      c.signal.throwIfAborted();
      this.#rootHandle = await parentHandle.getDirectoryHandle(currentDirname, { create: true });
    }
  }

  public async getWritable(
    c: IStorage.GetWritableContext,
  ): Promise<WritableStream<Uint8Array<ArrayBuffer>>> {
    assertValidFilename(c.key);
    c.signal.throwIfAborted();

    const fileHandle = await this.#rootHandle!.getFileHandle(c.key, { create: true });
    c.signal.throwIfAborted();
    const writable = await fileHandle.createWritable();
    c.signal.throwIfAborted();

    const writer = writable.getWriter();

    // 中断と失敗のどちらからでも後始末が走るため、完了処理は一度だけ行います。
    let finished = false;
    const removeAbortListener = (): void => {
      c.signal.removeEventListener("abort", onAbort);
    };
    const finish = async (reason?: unknown): Promise<void> => {
      if (finished) return;
      finished = true;
      removeAbortListener();
      // 書き込み途中の内容をコミットしないよう、close ではなく abort で破棄します。
      await writer.abort(reason).catch(() => {});
    };
    const onAbort = (): void => {
      void finish(c.signal.reason);
    };
    c.signal.addEventListener("abort", onAbort, { once: true });

    return new WritableStream<Uint8Array<ArrayBuffer>>({
      async write(chunk) {
        c.signal.throwIfAborted();
        try {
          await writer.write(chunk);
        } catch (ex) {
          await finish(ex);
          throw ex;
        }
      },
      async close() {
        c.signal.throwIfAborted();
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

  public async getReadable(
    c: IStorage.GetReadableContext,
  ): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
    assertValidFilename(c.key);
    c.signal.throwIfAborted();

    const fileHandle = await this.#rootHandle!.getFileHandle(c.key);
    c.signal.throwIfAborted();
    const file = await fileHandle.getFile();
    c.signal.throwIfAborted();

    const reader = file.stream().getReader();

    // 中断時は待機中の読み取りを終わらせ、以降の pull で中断理由を通知できるようにします。
    const onAbort = (): void => {
      void reader.cancel(c.signal.reason).catch(() => {});
    };
    const removeAbortListener = (): void => {
      c.signal.removeEventListener("abort", onAbort);
    };
    c.signal.addEventListener("abort", onAbort, { once: true });
    void reader.closed.then(removeAbortListener, removeAbortListener);

    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      async pull(controller) {
        try {
          c.signal.throwIfAborted();
          const { done, value } = await reader.read();
          c.signal.throwIfAborted();

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
