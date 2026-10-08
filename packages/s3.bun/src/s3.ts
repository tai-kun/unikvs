import { RepairNotAllowedError, type IStorage, type Variables } from "@unikvs/core";
import type { S3Client, S3Options } from "bun";

import {
  InvalidPartSizeError,
  StorageAbortedError,
  StorageNotOpenError,
  UnsupportedRuntimeError,
} from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-bun#usage)
 */
export type S3StorageOptions = Omit<S3Options, "bucket"> & {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-bun#usage)
   */
  readonly allowRepair?: boolean | undefined;
};

/**
 * `clear()` で同時に削除するオブジェクト数の上限です。
 * 1 ページ分の削除リクエストを過度に並列化しないために使用します。
 */
const DELETE_CONCURRENCY = 25;

/**
 * 書き込みストリームのパートサイズを `vars` から解決します。
 * パッケージ固有の変数を優先し、なければ共通の変数を参照します。
 */
function resolvePartSize(vars: Variables): number | undefined {
  const rawPartSize =
    vars["@unikvs/s3.bun:partSize"] !== undefined
      ? vars["@unikvs/s3.bun:partSize"]
      : vars["@unikvs/s3:partSize"];

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
  public readonly allowRepair: boolean;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-bun#usage)
   */
  public constructor(bucket: string, options: S3StorageOptions = {}) {
    const { allowRepair = false, ...s3Options } = options;
    this.name = "S3";
    this.client = null;
    this.bucket = bucket;
    this.options = s3Options;
    this.allowRepair = allowRepair;
  }

  /**
   * 書き戻しによる書き込みが許可されているかを検証します。
   *
   * @param args 書き込みの引数です。実行時変数に書き戻しの目印がある場合に判定します。
   */
  private assertRepairAllowed(args: { vars: Variables }): void {
    if (args.vars["unikvs:repair"] === true && !this.allowRepair) {
      throw new RepairNotAllowedError({ name: this.name });
    }
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
      throw new UnsupportedRuntimeError();
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
  public async write(
    args: Pick<IStorage.WriteArgs<Uint8Array<ArrayBuffer>>, "key" | "data" | "signal" | "vars">,
  ): Promise<void> {
    this.assertRepairAllowed(args);
    const { key, data, signal } = args;

    signal.throwIfAborted();

    await this.client!.write(key, data);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-bun#usage)
   */
  public async read(
    args: Pick<IStorage.ReadArgs, "key" | "signal">,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const { key, signal } = args;

    signal.throwIfAborted();

    const buffer = await this.client!.file(key).arrayBuffer();

    return new Uint8Array(buffer);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-bun#usage)
   */
  public async exists(args: Pick<IStorage.ExistsArgs, "key" | "signal">): Promise<boolean> {
    const { key, signal } = args;

    signal.throwIfAborted();

    return await this.client!.exists(key);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-bun#usage)
   */
  public async delete(args: Pick<IStorage.DeleteArgs, "key" | "signal">): Promise<void> {
    const { key, signal } = args;

    signal.throwIfAborted();

    await this.client!.delete(key);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-bun#usage)
   */
  public async clear(args: Pick<IStorage.ClearArgs, "signal">): Promise<void> {
    const { signal } = args;
    const client = this.client!;

    signal.throwIfAborted();

    let continuationToken: string | undefined = undefined;

    do {
      signal.throwIfAborted();

      const response = await client.list(
        continuationToken === undefined ? null : { continuationToken },
      );
      const contents = response.contents ?? [];

      for (let start = 0; start < contents.length; start += DELETE_CONCURRENCY) {
        signal.throwIfAborted();

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
  public getWritable(
    args: Pick<IStorage.GetWritableArgs, "vars" | "key" | "signal">,
  ): WritableStream<Uint8Array<ArrayBuffer>> {
    this.assertRepairAllowed(args);
    const { key, vars, signal } = args;

    if (signal.aborted) {
      throw new StorageAbortedError({ key });
    }

    const partSize = resolvePartSize(vars);
    const writer = this.client!.file(key).writer(partSize === undefined ? {} : { partSize });

    return new WritableStream<Uint8Array<ArrayBuffer>>({
      async write(chunk) {
        signal.throwIfAborted();
        await writer.write(chunk);
      },
      async close() {
        signal.throwIfAborted();
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
  public getReadable(
    args: Pick<IStorage.GetReadableArgs, "key" | "signal">,
  ): ReadableStream<Uint8Array<ArrayBuffer>> {
    const { key, signal } = args;

    signal.throwIfAborted();

    const reader = this.client!.file(key).stream().getReader();

    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      async pull(controller) {
        signal.throwIfAborted();

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
