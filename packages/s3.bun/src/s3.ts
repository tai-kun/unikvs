import {
  InvalidPartSizeError,
  StorageAbortedError,
  UnsupportedRuntimeError,
  type IPipelineContext,
  type IStorage,
} from "@unikvs/core";
import type { S3Client, S3Options } from "bun";

import { StorageNotOpenError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-bun#usage)
 */
export type S3StorageOptions = Omit<S3Options, "bucket">;

/**
 * `clear()` で同時に削除するオブジェクト数の上限です。
 * 1 ページ分の削除リクエストを過度に並列化しないために使用します。
 */
const DELETE_CONCURRENCY = 25;

/**
 * 書き込みストリームのパートサイズをコンテキストから解決します。
 * パッケージ固有の変数を優先し、なければ共通の変数を参照します。
 */
function resolvePartSize(c: Pick<IPipelineContext, "get">): number | undefined {
  const rawPartSize =
    c.get("@unikvs/s3.bun:partSize") !== undefined
      ? c.get("@unikvs/s3.bun:partSize")
      : c.get("@unikvs/s3:partSize");

  if (rawPartSize === undefined) {
    return undefined;
  }

  if (typeof rawPartSize !== "number" || !Number.isInteger(rawPartSize) || rawPartSize <= 0) {
    throw new InvalidPartSizeError({ actual: rawPartSize });
  }

  return rawPartSize;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-bun#usage)
 */
export default class S3 implements IStorage {
  /**
   * Bun の S3 クライアントのインスタンスを保持します。
   *
   * ストレージがオープンされるまで null です。
   */
  private client: S3Client | null;

  /**
   * データを保存する S3 のバケット名です。
   *
   * すべての操作でこのバケットが使用されます。
   */
  private readonly bucket: string;

  /**
   * `S3Client` の初期化に使用する設定オブジェクトです。
   */
  private readonly options: S3StorageOptions;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-bun#usage)
   */
  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-bun#usage)
   */
  public constructor(bucket: string, options: S3StorageOptions = {}) {
    this.name = "S3";
    this.client = null;
    this.bucket = bucket;
    this.options = { ...options };
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-bun#usage)
   */
  public get isOpen(): boolean {
    return !!this.client;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-bun#usage)
   */
  public async open(): Promise<void> {
    // Bun 以外のランタイムで誤って使われた場合に、原因の分かるエラーを返します。
    if (typeof Bun === "undefined") {
      throw new UnsupportedRuntimeError({ name: this.name, runtime: "Bun" });
    }

    // オープン済みの場合は既存のクライアントを破棄し、開き直しでリークしないようにします。
    if (this.client) {
      this.close();
    }

    const { S3Client: S3ClientImpl } = await import("bun");
    this.client = new S3ClientImpl({ ...this.options, bucket: this.bucket });
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-bun#usage)
   */
  public close(): void {
    if (!this.client) {
      throw new StorageNotOpenError();
    }

    // Bun の S3Client には破棄用の API がないため、参照を外して GC に委ねます。
    this.client = null;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-bun#usage)
   */
  public async write(c: IStorage.WriteContext, data: Uint8Array<ArrayBuffer>): Promise<void> {
    c.signal.throwIfAborted();

    await this.client!.write(c.key, data);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-bun#usage)
   */
  public async read(c: IStorage.ReadContext): Promise<Uint8Array<ArrayBuffer>> {
    c.signal.throwIfAborted();

    const buffer = await this.client!.file(c.key).arrayBuffer();

    return new Uint8Array(buffer);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-bun#usage)
   */
  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    c.signal.throwIfAborted();

    return await this.client!.exists(c.key);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-bun#usage)
   */
  public async delete(c: IStorage.DeleteContext): Promise<void> {
    c.signal.throwIfAborted();

    await this.client!.delete(c.key);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-bun#usage)
   */
  public async clear(c: IStorage.ClearContext): Promise<void> {
    const client = this.client!;

    c.signal.throwIfAborted();

    let continuationToken: string | undefined = undefined;

    do {
      c.signal.throwIfAborted();

      const response = await client.list(
        continuationToken === undefined ? null : { continuationToken },
      );
      const contents = response.contents ?? [];

      for (let start = 0; start < contents.length; start += DELETE_CONCURRENCY) {
        c.signal.throwIfAborted();

        await Promise.all(
          contents.slice(start, start + DELETE_CONCURRENCY).map((item) => client.delete(item.key)),
        );
      }

      continuationToken = response.isTruncated ? response.nextContinuationToken : undefined;
    } while (continuationToken !== undefined);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-bun#streams)
   */
  public getWritable(c: IStorage.GetWritableContext): WritableStream<Uint8Array<ArrayBuffer>> {
    if (c.signal.aborted) {
      throw new StorageAbortedError({ key: c.key });
    }

    const partSize = resolvePartSize(c);
    const writer = this.client!.file(c.key).writer(partSize === undefined ? {} : { partSize });

    return new WritableStream<Uint8Array<ArrayBuffer>>({
      async write(chunk) {
        c.signal.throwIfAborted();
        await writer.write(chunk);
      },
      async close() {
        c.signal.throwIfAborted();
        await writer.end();
      },
      async abort() {
        // Bun の NetworkSink には中断用の API がないため、end を呼ばずに破棄します。
        // 完了していないマルチパートアップロードはオブジェクトとして公開されません。
      },
    });
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-bun#streams)
   */
  public getReadable(c: IStorage.GetReadableContext): ReadableStream<Uint8Array<ArrayBuffer>> {
    c.signal.throwIfAborted();

    const reader = this.client!.file(c.key).stream().getReader();

    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      async pull(controller) {
        c.signal.throwIfAborted();

        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }

        controller.enqueue(value);
      },
      async cancel(reason) {
        await reader.cancel(reason);
      },
    });
  }
}
