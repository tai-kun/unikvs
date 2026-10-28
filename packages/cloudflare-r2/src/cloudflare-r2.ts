import { type IStorage, KeyNotFoundError, StorageAbortedError } from "@unikvs/core";
import { throwIfAborted, toAbortPromise } from "abort-signal-utils";

import { InvalidChunkTypeError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
 */
export interface R2ObjectLike {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
   */
  readonly key: string;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
 */
export interface R2ObjectBodyLike extends R2ObjectLike {
  /**
   * オブジェクトの内容を `ArrayBuffer` として読み取ります。
   *
   * @returns 読み取ったバイト列です。
   */
  arrayBuffer(): Promise<ArrayBuffer>;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
 */
export interface R2ListOptions {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
   */
  readonly prefix?: string | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
   */
  readonly cursor?: string | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
   */
  readonly limit?: number | undefined;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
 */
export interface R2ObjectsLike {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
   */
  readonly objects: readonly R2ObjectLike[];

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
   */
  readonly truncated: boolean;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
   */
  readonly cursor?: string | undefined;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
 */
export interface R2BucketLike {
  /**
   * オブジェクトを保存します。
   *
   * @param key 保存先のキーです。
   * @param value 保存するバイト列です。
   *
   * @returns 保存したオブジェクトです。
   */
  put(key: string, value: Uint8Array<ArrayBuffer>): Promise<R2ObjectLike | null>;

  /**
   * オブジェクトをボディ付きで取得します。存在しない場合は `null` を返します。
   *
   * @param key 取得するキーです。
   *
   * @returns 取得したオブジェクトです。欠番時は null です。
   */
  get(key: string): Promise<R2ObjectBodyLike | null>;

  /**
   * オブジェクトの存在を確認します。存在しない場合は `null` を返します。
   *
   * @param key 確認するキーです。
   *
   * @returns 存在するオブジェクトです。欠番時は null です。
   */
  head(key: string): Promise<R2ObjectLike | null>;

  /**
   * オブジェクトを削除します。存在しないキーも成功扱いにします。
   *
   * @param keys 削除するキーです。
   *
   * @returns 削除が完了したら解決します。
   */
  delete(keys: string | readonly string[]): Promise<void>;

  /**
   * オブジェクトを列挙します。
   *
   * @param options 列挙に渡す任意項目です。
   *
   * @returns 列挙したページです。
   */
  list(options?: R2ListOptions): Promise<R2ObjectsLike>;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
 */
export type CloudflareR2Options = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2-bucket)
   */
  readonly bucket: R2BucketLike;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2-key-prefix)
   */
  readonly keyPrefix?: string | undefined;
};

/**
 * `clear` で一度に削除するオブジェクト数の上限です。
 *
 * `list` の 1 ページ分を 1 回の削除要求にまとめます。
 */
const CLEAR_BATCH_SIZE = 1000;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
 */
export default class CloudflareR2 implements IStorage {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
   */
  public readonly name: string;

  /**
   * 使用する R2 バケットのバインディングです。
   */
  /**
   * 使用する R2 バケットのバインディングです。
   */
  readonly #bucket: R2BucketLike;

  /**
   * すべてのキーに付与する接頭辞です。
   */
  /**
   * すべてのキーに付与する接頭辞です。
   */
  readonly #keyPrefix: string;

  /**
   * ストレージがオープン済みかどうかを保持します。
   */
  #open: boolean;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
   */
  public constructor(options: CloudflareR2Options) {
    const { bucket, keyPrefix = "" } = options;

    this.name = "CloudflareR2";
    this.#bucket = bucket;
    this.#keyPrefix = keyPrefix;
    this.#open = false;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
   */
  public get bucket(): R2BucketLike {
    return this.#bucket;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
   */
  public get keyPrefix(): string {
    return this.#keyPrefix;
  }

  /**
   * ストレージがオープン済みかどうかです。
   *
   * @returns オープン済みなら真です。
   */
  public get isOpen(): boolean {
    return this.#open;
  }

  /**
   * ストレージをオープンします。
   *
   * 開済みフラグを立てるのみで接続は行いません。
   *
   * @param c オープンコンテキストです。
   */
  public open(c: IStorage.OpenContext): void {
    throwIfAborted(c.signal);
    this.#open = true;
  }

  /**
   * ストレージをクローズします。
   *
   * 開済みフラグを降ろすのみで切断は行いません。
   *
   * @param c クローズコンテキストです。
   */
  public close(c: IStorage.CloseContext): void {
    throwIfAborted(c.signal);
    this.#open = false;
  }

  /**
   * バイト列を書き込みます。
   *
   * 指定したキーでオブジェクトを上書きします。
   *
   * @param c 書き込みコンテキストです。
   * @param data 保存するバイト列です。
   *
   * @returns 書き込みが完了したら解決します。
   */
  public async write(c: IStorage.WriteContext, data: Uint8Array<ArrayBuffer>): Promise<void> {
    await this.#put(c.signal, c.key, data);
  }

  /**
   * バイト列を読み取ります。
   *
   * 指定したキーのオブジェクトを取得します。
   *
   * @param c 読み取りコンテキストです。
   *
   * @returns 読み取ったバイト列です。
   */
  public async read(c: IStorage.ReadContext): Promise<Uint8Array<ArrayBuffer>> {
    throwIfAborted(c.signal);
    using abortPromise = toAbortPromise(c.signal);

    const object = await Promise.race([this.#bucket.get(this.#resolveKey(c.key)), abortPromise]);

    if (object === null) {
      throw new KeyNotFoundError({ key: c.key });
    }

    const buffer = await Promise.race([object.arrayBuffer(), abortPromise]);

    return new Uint8Array(buffer);
  }

  /**
   * キーの存在を確認します。
   *
   * @param c 存在確認コンテキストです。
   *
   * @returns 存在すれば真です。
   */
  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    throwIfAborted(c.signal);
    using abortPromise = toAbortPromise(c.signal);

    return (
      (await Promise.race([this.#bucket.head(this.#resolveKey(c.key)), abortPromise])) !== null
    );
  }

  /**
   * キーを削除します。
   *
   * 存在しないキーも成功扱いにします。
   *
   * @param c 削除コンテキストです。
   *
   * @returns 削除が完了したら解決します。
   */
  public async delete(c: IStorage.DeleteContext): Promise<void> {
    throwIfAborted(c.signal);

    await this.#bucket.delete(this.#resolveKey(c.key));
  }

  /**
   * 指定したキーのバイト列を別のキーへ複製します。複製先が存在する場合は上書きします。
   *
   * @param c 複製元と複製先のキーを持つコンテキストです。
   *
   * @returns 複製が完了したら解決します。
   */
  public async copy(c: IStorage.CopyContext): Promise<void> {
    const data = await this.read(c);

    // 同じキーへの複製は値の存在確認だけを行います。
    if (c.key === c.destinationKey) {
      return;
    }

    await this.#put(c.signal, c.destinationKey, data);
  }

  /**
   * 指定したキーのバイト列を別のキーへ移動します。移動先の書き込みが成功してから移動元を削除します。
   *
   * @param c 移動元と移動先のキーを持つコンテキストです。
   *
   * @returns 移動が完了したら解決します。
   */
  public async move(c: IStorage.MoveContext): Promise<void> {
    const data = await this.read(c);

    // 同じキーへの移動は値の存在確認だけを行います。
    if (c.key === c.destinationKey) {
      return;
    }

    await this.#put(c.signal, c.destinationKey, data);
    await this.delete(c);
  }

  /**
   * 接頭辞に一致するオブジェクトをすべて削除します。
   *
   * `list` で列挙しながら削除します。
   *
   * @param c クリアコンテキストです。
   *
   * @returns 削除が完了したら解決します。
   */
  public async clear(c: IStorage.ClearContext): Promise<void> {
    throwIfAborted(c.signal);
    using abortPromise = toAbortPromise(c.signal);

    let cursor: string | undefined = undefined;

    do {
      throwIfAborted(c.signal);

      const page: R2ObjectsLike = await Promise.race([
        this.#bucket.list({
          limit: CLEAR_BATCH_SIZE,
          cursor,
          prefix: this.#keyPrefix,
        }),
        abortPromise,
      ]);
      // バインディングが `prefix` を無視する場合に備えて手元でも絞り込みます。
      const keys = page.objects
        .map((object) => object.key)
        .filter((key) => key.startsWith(this.#keyPrefix));

      for (let start = 0; start < keys.length; start += CLEAR_BATCH_SIZE) {
        throwIfAborted(c.signal);

        const batch = keys.slice(start, start + CLEAR_BATCH_SIZE);

        if (batch.length > 0) {
          await this.#bucket.delete(batch);
        }
      }

      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor !== undefined);
  }

  /**
   * 書き込み用ストリームを取得します。
   *
   * チャンクを蓄積し、`close` 時に一括保存します。
   *
   * @param c 書き込みストリーム取得コンテキストです。
   *
   * @returns 書き込み用ストリームです。
   */
  public getWritable(c: IStorage.GetWritableContext): WritableStream<Uint8Array<ArrayBuffer>> {
    if (c.signal.aborted) {
      throw new StorageAbortedError({ key: c.key });
    }

    const bucket = this.#bucket;
    const fullKey = this.#resolveKey(c.key);
    const key = c.key;
    // R2 の `put` はストリーム書き込みを受け付けないため、書き込まれたチャンクを蓄積し、`close` 時に一括送信します。
    const chunks: Uint8Array<ArrayBuffer>[] = [];

    return new WritableStream<Uint8Array<ArrayBuffer>>({
      abort() {
        chunks.length = 0;
      },
      close: async () => {
        throwIfAborted(c.signal);

        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const merged = new Uint8Array(totalLength);
        let offset = 0;

        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.byteLength;
        }

        await bucket.put(fullKey, merged);
      },
      write(chunk) {
        throwIfAborted(c.signal);

        if (!(chunk instanceof Uint8Array)) {
          throw new InvalidChunkTypeError({
            key,
            chunk,
          });
        }

        chunks.push(chunk.slice());
      },
    });
  }

  /**
   * 読み取り用ストリームを取得します。
   *
   * 取得した内容を単一チャンクとして送出します。
   *
   * @param c 読み取りストリーム取得コンテキストです。
   *
   * @returns 読み取り用ストリームを解決します。
   */
  public async getReadable(
    c: IStorage.GetReadableContext,
  ): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
    throwIfAborted(c.signal);
    using abortPromise = toAbortPromise(c.signal);

    const object = await Promise.race([this.#bucket.get(this.#resolveKey(c.key)), abortPromise]);

    if (object === null) {
      throw new KeyNotFoundError({ key: c.key });
    }

    // R2 のボディは `arrayBuffer` で実体化してから単一チャンクのストリームで送出します。
    const buffer = await Promise.race([object.arrayBuffer(), abortPromise]);
    const data = new Uint8Array(buffer);

    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        if (data.byteLength > 0) {
          controller.enqueue(data);
        }

        controller.close();
      },
    });
  }

  /**
   * 指定したキーへバイト列を保存します。
   *
   * @param signal 中断を知らせるシグナルです。
   * @param key 保存先のキーです。
   * @param data 保存するバイト列です。
   *
   * @returns 保存が完了したら解決します。
   */
  async #put(signal: AbortSignal, key: string, data: Uint8Array<ArrayBuffer>): Promise<void> {
    throwIfAborted(signal);

    // 呼び出し側がビューを再利用しても保存値が変わらないよう、複製して渡します。
    await this.#bucket.put(this.#resolveKey(key), data.slice());
  }

  /**
   * 論理キーに接頭辞を付与して実キーを組み立てます。
   *
   * @param key 変換する論理キーです。
   *
   * @returns R2 上の実キーです。
   */
  #resolveKey(key: string): string {
    return `${this.#keyPrefix}${key}`;
  }
}
