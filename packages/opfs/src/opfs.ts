import type { IStorage } from "@unikvs/core";
import { assertValidDirname, assertValidFilename } from "@unikvs/utils";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/opfs#usage)
 */
export type OpfsOptions = {};

/**
 * 失敗しても無視してよい非同期処理の拒否を握りつぶします。
 * 中断時の後始末など、失敗を呼び出し元へ伝える必要がない場合に使用します。
 */
async function ignoreRejection(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch {
    // 後始末の失敗は無視します。
  }
}

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
  readonly #root: string;

  /**
   * コンストラクターでディレクトリーハンドルを直接受け取ったかどうかです。
   * ハンドル受け取り時は親ディレクトリーをたどれないため、クリアは列挙削除で行います。
   */
  readonly #fromHandle: boolean;

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
      this.#fromHandle = false;
      let normalized = root.replaceAll(/\/+/gu, "/");

      if (normalized.startsWith("/")) {
        normalized = normalized.slice(1);
      }

      if (normalized.endsWith("/")) {
        normalized = normalized.slice(0, -1);
      }

      if (normalized === "" || normalized === "." || normalized === "/") {
        this.#root = "";
      } else {
        this.#root = normalized;

        for (const dirname of this.#root.split("/")) {
          assertValidDirname(dirname);
        }
      }

      this.#rootHandle = null;
    } else {
      this.#root = root.name;
      this.#rootHandle = root;
      this.#fromHandle = true;
    }
  }

  public get isOpen(): boolean {
    return this.#rootHandle !== null;
  }

  // 開いているルートディレクトリーハンドルを返します。
  // 未オープン時は `TypeError` を投げます。
  #getRootHandle(): FileSystemDirectoryHandle {
    const handle = this.#rootHandle;

    if (handle === null) {
      throw new TypeError("Opfs is not open. Call open() first.");
    }

    return handle;
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

    const fileHandle = await this.#getRootHandle().getFileHandle(c.key, { create: true });

    c.signal.throwIfAborted();
    const writable = await fileHandle.createWritable();

    c.signal.throwIfAborted();

    try {
      await writable.write(data);
      // close でコミットされる前に中断を検知し、部分的な書き込みを破棄します。
      c.signal.throwIfAborted();
    } catch (ex) {
      // 失敗時に close すると、書き込めた分の内容が既存データを上書きしてコミットされるため abort して変更を破棄します。
      await ignoreRejection(writable.abort(ex));
      throw ex;
    }

    await writable.close();
  }

  public async read(c: IStorage.ReadContext): Promise<Uint8Array<ArrayBuffer>> {
    assertValidFilename(c.key);
    c.signal.throwIfAborted();

    const fileHandle = await this.#getRootHandle().getFileHandle(c.key);

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
      await this.#getRootHandle().getFileHandle(c.key);

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

    await this.#getRootHandle().removeEntry(c.key);
  }

  public async clear(c: IStorage.ClearContext): Promise<void> {
    c.signal.throwIfAborted();

    if (this.#root === "" || this.#fromHandle) {
      // ルートディレクトリー直下を使用している場合や、ハンドルを直接受け取った場合は、すべてのエントリーを個別に削除します。
      const rootHandle = this.#getRootHandle();

      for await (const name of rootHandle.keys()) {
        c.signal.throwIfAborted();
        await rootHandle.removeEntry(name, { recursive: true });
      }
    } else {
      // サブディレクトリーを使用している場合は、ディレクトリーごと削除して再作成します。
      // 先に開いていることを確認し、未オープン時は `TypeError` で拒否します。
      this.#getRootHandle();
      const dirnames = this.#root.split("/");
      let parentHandle = await navigator.storage.getDirectory();

      c.signal.throwIfAborted();
      for (const dirname of dirnames.slice(0, -1)) {
        parentHandle = await parentHandle.getDirectoryHandle(dirname, { create: true });
        c.signal.throwIfAborted();
      }

      const currentDirname = dirnames.at(-1);

      if (currentDirname === undefined) {
        throw new TypeError("Opfs root is empty. Call open() first.");
      }

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

    const fileHandle = await this.#getRootHandle().getFileHandle(c.key, { create: true });

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
      if (finished) {
        return;
      }

      finished = true;
      removeAbortListener();
      // 書き込み途中の内容をコミットしないよう、close ではなく abort で破棄します。
      await ignoreRejection(writer.abort(reason));
    };
    const onAbort = (): void => {
      void finish(c.signal.reason);
    };
    c.signal.addEventListener("abort", onAbort, { once: true });

    return new WritableStream<Uint8Array<ArrayBuffer>>({
      async abort(reason) {
        await finish(reason);
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
      async write(chunk) {
        c.signal.throwIfAborted();
        try {
          await writer.write(chunk);
        } catch (ex) {
          await finish(ex);
          throw ex;
        }
      },
    });
  }

  public async getReadable(
    c: IStorage.GetReadableContext,
  ): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
    assertValidFilename(c.key);
    c.signal.throwIfAborted();

    const fileHandle = await this.#getRootHandle().getFileHandle(c.key);

    c.signal.throwIfAborted();
    const file = await fileHandle.getFile();

    c.signal.throwIfAborted();

    const reader = file.stream().getReader();

    // 中断時は待機中の読み取りを終わらせ、以降の pull で中断理由を通知できるようにします。
    const onAbort = (): void => {
      void ignoreRejection(reader.cancel(c.signal.reason));
    };
    const removeAbortListener = (): void => {
      c.signal.removeEventListener("abort", onAbort);
    };
    c.signal.addEventListener("abort", onAbort, { once: true });
    void (async (): Promise<void> => {
      try {
        await reader.closed;
      } catch {
        // クローズ時の失敗は無視します。
      } finally {
        removeAbortListener();
      }
    })();

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
        await ignoreRejection(reader.cancel(reason));
      },
    });
  }
}
