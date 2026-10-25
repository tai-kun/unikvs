import { type IStorage, KeyNotFoundError, StorageAbortedError } from "@unikvs/core";
import { throwIfAborted, toAbortPromise } from "abort-signal-utils";

import { InvalidChunkTypeError } from "./errors.js";

/**
 * Workers の `R2Object` に対応する最小の構造です。
 *
 * wrangler への依存なしに実バインディングを受け取れるようにします。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
 */
export interface R2ObjectLike {
  /**
   * オブジェクトのキーです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
   */
  readonly key: string;
}

/**
 * Workers の `R2ObjectBody` に対応する最小の構造です。
 *
 * `get` が `null` ではなくボディ付きで返る点が S3 互換 API との差分です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
 */
export interface R2ObjectBodyLike extends R2ObjectLike {
  /**
   * オブジェクトの内容を `ArrayBuffer` として読み取ります。
   */
  arrayBuffer(): Promise<ArrayBuffer>;
}

/**
 * `list` のオプションに対応する最小の構造です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
 */
export interface R2ListOptions {
  /**
   * 列挙するキーの接頭辞です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
   */
  readonly prefix?: string | undefined;

  /**
   * 前ページの継続カーソルです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
   */
  readonly cursor?: string | undefined;

  /**
   * 1 ページあたりの最大件数です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
   */
  readonly limit?: number | undefined;
}

/**
 * Workers の `R2Objects` に対応する最小の構造です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
 */
export interface R2ObjectsLike {
  /**
   * 列挙されたオブジェクトの一覧です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
   */
  readonly objects: readonly R2ObjectLike[];

  /**
   * 続きのページが存在するかどうかです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
   */
  readonly truncated: boolean;

  /**
   * 続きのページを取得するためのカーソルです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
   */
  readonly cursor?: string | undefined;
}

/**
 * Workers の `R2Bucket` バインディングに対応する最小の構造です。
 *
 * wrangler への依存なしに実バインディングを受け取れるようにします。
 * 実バインディングはこの構造の部分型であるため、そのまま渡せます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
 */
export interface R2BucketLike {
  /**
   * オブジェクトを保存します。
   */
  put(key: string, value: Uint8Array<ArrayBuffer>): Promise<R2ObjectLike | null>;

  /**
   * オブジェクトをボディ付きで取得します。存在しない場合は `null` を返します。
   */
  get(key: string): Promise<R2ObjectBodyLike | null>;

  /**
   * オブジェクトの存在を確認します。存在しない場合は `null` を返します。
   */
  head(key: string): Promise<R2ObjectLike | null>;

  /**
   * オブジェクトを削除します。存在しないキーも成功扱いにします。
   */
  delete(keys: string | readonly string[]): Promise<void>;

  /**
   * オブジェクトを列挙します。
   */
  list(options?: R2ListOptions): Promise<R2ObjectsLike>;
}

/**
 * `CloudflareR2` のオプションです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
 */
export type CloudflareR2Options = {
  /**
   * 使用する R2 バケットのバインディングです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2-bucket)
   */
  readonly bucket: R2BucketLike;

  /**
   * すべてのキーに付与する接頭辞です。
   *
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
 * Workers の R2 バインディングにバイト列を保存するストレージです。
 *
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
  readonly #bucket: R2BucketLike;

  /**
   * すべてのキーに付与する接頭辞です。
   */
  readonly #keyPrefix: string;

  #open: boolean;

  /**
   * Cloudflare R2 ストレージを作成します。
   *
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
   * 使用する R2 バケットのバインディングです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
   */
  public get bucket(): R2BucketLike {
    return this.#bucket;
  }

  /**
   * すべてのキーに付与する接頭辞です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/cloudflare-r2#cloudflare-r2)
   */
  public get keyPrefix(): string {
    return this.#keyPrefix;
  }

  public get isOpen(): boolean {
    return this.#open;
  }

  public open(c: IStorage.OpenContext): void {
    throwIfAborted(c.signal);
    this.#open = true;
  }

  public close(c: IStorage.CloseContext): void {
    throwIfAborted(c.signal);
    this.#open = false;
  }

  // 論理キーに接頭辞を付与して実キーを組み立てます。
  #resolveKey(key: string): string {
    return `${this.#keyPrefix}${key}`;
  }

  public async write(c: IStorage.WriteContext, data: Uint8Array<ArrayBuffer>): Promise<void> {
    throwIfAborted(c.signal);

    // 呼び出し側がビューを再利用しても保存値が変わらないよう、複製して渡します。
    await this.#bucket.put(this.#resolveKey(c.key), data.slice());
  }

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

  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    throwIfAborted(c.signal);
    using abortPromise = toAbortPromise(c.signal);

    return (
      (await Promise.race([this.#bucket.head(this.#resolveKey(c.key)), abortPromise])) !== null
    );
  }

  public async delete(c: IStorage.DeleteContext): Promise<void> {
    throwIfAborted(c.signal);

    await this.#bucket.delete(this.#resolveKey(c.key));
  }

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
}
