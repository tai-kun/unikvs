import { type IStorage, KeyNotFoundError } from "@unikvs/core";
import { assertValidDirname, assertValidFilename } from "@unikvs/utils";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/opfs#usage)
 */
export type OpfsOptions = {};

/**
 * 失敗しても無視してよい非同期処理の拒否を握りつぶします。
 *
 * 中断時の後始末など、失敗を呼び出し元へ伝える必要がない場合に使用します。
 *
 * @param promise 結果を無視するプロミスです。
 *
 * @returns 完了を知らせるプロミスです。
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
   * ストレージ名です。常に `Opfs` を返します。
   */
  public readonly name: string;

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

  /**
   * ストレージが開いているかどうかを返します。
   *
   * @returns ルートハンドルを保持していれば true を返します。
   */
  public get isOpen(): boolean {
    return this.#rootHandle !== null;
  }

  /**
   * OPFS のディレクトリーを開きルートハンドルを保持します。
   *
   * @param c 中断を知らせるシグナルを持つコンテキストです。
   *
   * @returns 完了を知らせるプロミスです。
   */
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

  /**
   * 指定したキーに Uint8Array を保存します。失敗時は変更を破棄します。
   *
   * @param c 書き込み対象のキーを持つコンテキストです。
   * @param data 保存するバイト列です。
   *
   * @returns 完了を知らせるプロミスです。
   */
  public async write(c: IStorage.WriteContext, data: Uint8Array<ArrayBuffer>): Promise<void> {
    await this.#writeFile(c.signal, c.key, data);
  }

  /**
   * 指定したキーのファイルを読み出します。
   *
   * @param c 読み出すキーを持つコンテキストです。
   *
   * @returns ファイル内容のバイト列です。
   */
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

  /**
   * 指定したキーのファイルがあるかどうかを返します。
   *
   * @param c 確認するキーを持つコンテキストです。
   *
   * @returns ファイルがあれば true を返します。
   */
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

  /**
   * 指定したキーのファイルを削除します。
   *
   * @param c 削除するキーを持つコンテキストです。
   *
   * @returns 完了を知らせるプロミスです。
   */
  public async delete(c: IStorage.DeleteContext): Promise<void> {
    assertValidFilename(c.key);
    c.signal.throwIfAborted();

    await this.#getRootHandle().removeEntry(c.key);
  }

  /**
   * 指定したキーのファイルを別のキーへ複製します。複製先が存在する場合は上書きします。
   *
   * @param c 複製元と複製先のキーを持つコンテキストです。
   *
   * @returns 完了を知らせるプロミスです。
   */
  public async copy(c: IStorage.CopyContext): Promise<void> {
    c.signal.throwIfAborted();

    if (!(await this.exists(c as unknown as IStorage.ExistsContext))) {
      throw new KeyNotFoundError({ key: c.key });
    }

    // 同じキーへの複製はファイルの存在確認だけを行います。
    if (c.key === c.destinationKey) {
      return;
    }

    const data = await this.read(c as unknown as IStorage.ReadContext);
    await this.#writeFile(c.signal, c.destinationKey, data);
  }

  /**
   * 指定したキーのファイルを別のキーへ移動します。移動先の書き込みが成功してから移動元を削除します。
   *
   * @param c 移動元と移動先のキーを持つコンテキストです。
   *
   * @returns 完了を知らせるプロミスです。
   */
  public async move(c: IStorage.MoveContext): Promise<void> {
    c.signal.throwIfAborted();

    if (!(await this.exists(c as unknown as IStorage.ExistsContext))) {
      throw new KeyNotFoundError({ key: c.key });
    }

    // 同じキーへの移動はファイルの存在確認だけを行います。
    if (c.key === c.destinationKey) {
      return;
    }

    const data = await this.read(c as unknown as IStorage.ReadContext);
    await this.#writeFile(c.signal, c.destinationKey, data);

    await this.delete(c as unknown as IStorage.DeleteContext);
  }

  /**
   * 保存データをすべて削除します。サブディレクトリー使用時は作り直します。
   *
   * @param c 中断を知らせるシグナルを持つコンテキストです。
   *
   * @returns 完了を知らせるプロミスです。
   */
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

  /**
   * ファイルへ書き込むためのストリームを作成します。中断時は変更を破棄します。
   *
   * @param c 書き込み対象のキーを持つコンテキストです。
   *
   * @returns Uint8Array を受け付ける書き込みストリームです。
   */
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

  /**
   * ファイルを読み出すためのストリームを作成します。中断時は読み取りを打ち切ります。
   *
   * @param c 読み出すキーを持つコンテキストです。
   *
   * @returns ファイル内容を送出する読み取りストリームです。
   */
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

  /**
   * 指定したキーのファイルへバイト列を保存します。失敗時は変更を破棄します。
   *
   * @param signal 中断を知らせるシグナルです。
   * @param key 保存先のキーです。
   * @param data 保存するバイト列です。
   *
   * @returns 完了を知らせるプロミスです。
   */
  async #writeFile(signal: AbortSignal, key: string, data: Uint8Array<ArrayBuffer>): Promise<void> {
    assertValidFilename(key);
    signal.throwIfAborted();

    const fileHandle = await this.#getRootHandle().getFileHandle(key, { create: true });

    signal.throwIfAborted();
    const writable = await fileHandle.createWritable();

    signal.throwIfAborted();

    try {
      await writable.write(data);
      // close でコミットされる前に中断を検知し、部分的な書き込みを破棄します。
      signal.throwIfAborted();
    } catch (ex) {
      // 失敗時に close すると、書き込めた分の内容が既存データを上書きしてコミットされるため abort して変更を破棄します。
      await ignoreRejection(writable.abort(ex));
      throw ex;
    }

    await writable.close();
  }

  /**
   * 開いているルートディレクトリーハンドルを返します。未オープン時はエラーを投げます。
   *
   * @returns 開いているルートディレクトリーハンドルです。
   */
  #getRootHandle(): FileSystemDirectoryHandle {
    const handle = this.#rootHandle;

    if (handle === null) {
      throw new TypeError("Opfs is not open. Call open() first.");
    }

    return handle;
  }
}
