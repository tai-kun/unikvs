import {
  type S3ClientConfig,
  type ListObjectsV2CommandOutput,
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { RepairNotAllowedError, type IStorage, type Variables } from "@unikvs/core";

import { InvalidPartSizeError, StorageAbortedError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#usage)
 */
export type S3StorageOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#usage)
   */
  readonly allowRepair?: boolean | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#usage)
 */
export default class S3 implements IStorage {
  /**
   * S3 クライアントのインスタンスを保持します。
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
   * S3Client の初期化に使用する設定オブジェクトです。
   */
  private readonly config: S3ClientConfig;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#usage)
   */
  public readonly name: string;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#usage)
   */
  public readonly allowRepair: boolean;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#usage)
   */
  public constructor(bucket: string, config: S3ClientConfig = {}, options: S3StorageOptions = {}) {
    const { allowRepair = false } = options;
    this.name = "S3";
    this.client = null;
    this.bucket = bucket;
    this.config = config;
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
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#usage)
   */
  public get isOpen(): boolean {
    return !!this.client;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#usage)
   */
  public open(): void {
    this.client = new S3Client(this.config);
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#usage)
   */
  public close(): void {
    this.client!.destroy();
    this.client = null;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#usage)
   */
  public async write(
    args: Pick<IStorage.WriteArgs<Uint8Array<ArrayBuffer>>, "key" | "data" | "signal" | "vars">,
  ): Promise<void> {
    this.assertRepairAllowed(args);
    const { key, data, signal: abortSignal } = args;

    const command = new PutObjectCommand({
      Key: key,
      Body: data,
      Bucket: this.bucket,
    });
    await this.client!.send(command, { abortSignal });
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#usage)
   */
  public async read(
    args: Pick<IStorage.ReadArgs, "key" | "signal">,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const { key, signal: abortSignal } = args;

    const command = new GetObjectCommand({
      Key: key,
      Bucket: this.bucket,
    });
    const response = await this.client!.send(command, { abortSignal });
    const byteArray = await response.Body!.transformToByteArray();

    return byteArray satisfies Uint8Array as Uint8Array<ArrayBuffer>;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#usage)
   */
  public async exists(args: Pick<IStorage.ExistsArgs, "key" | "signal">): Promise<boolean> {
    const { key, signal: abortSignal } = args;

    try {
      const command = new HeadObjectCommand({
        Key: key,
        Bucket: this.bucket,
      });
      await this.client!.send(command, { abortSignal });

      return true;
    } catch (ex: any) {
      if (ex.name === "NotFound" || ex.$metadata?.httpStatusCode === 404) {
        return false;
      }

      throw ex;
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#usage)
   */
  public async delete(args: Pick<IStorage.DeleteArgs, "key" | "signal">): Promise<void> {
    const { key, signal: abortSignal } = args;

    const command = new DeleteObjectCommand({
      Key: key,
      Bucket: this.bucket,
    });
    await this.client!.send(command, { abortSignal });
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#usage)
   */
  public async clear(args: Pick<IStorage.ClearArgs, "signal">): Promise<void> {
    const { signal: abortSignal } = args;

    let isTruncated = true;
    let continuationToken: string | undefined = undefined;

    while (isTruncated) {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        ContinuationToken: continuationToken,
      });
      const response: ListObjectsV2CommandOutput = await this.client!.send(command, {
        abortSignal,
      });
      const contents = response.Contents;
      if (!contents || contents.length === 0) {
        break;
      }

      const objectsToDelete = contents
        .map((item) => item.Key)
        .filter((key) => key !== undefined)
        .map((key) => ({ Key: key }));
      if (objectsToDelete.length > 0) {
        const command = new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: objectsToDelete,
          },
        });
        await this.client!.send(command, { abortSignal });
      }

      isTruncated = response.IsTruncated ?? false;
      continuationToken = response.NextContinuationToken;
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#multipart)
   */
  public getWritable(
    args: Pick<IStorage.GetWritableArgs, "vars" | "key" | "signal">,
  ): WritableStream<Uint8Array<ArrayBuffer>> {
    this.assertRepairAllowed(args);
    const { key, vars, signal } = args;

    if (signal.aborted) {
      throw new StorageAbortedError({ key });
    }

    let partSize: number | undefined = undefined;
    const rawPartSize =
      vars["@unikvs/s3.node:partSize"] !== undefined
        ? vars["@unikvs/s3.node:partSize"]
        : vars["@unikvs/s3:partSize"];
    if (rawPartSize !== undefined) {
      if (typeof rawPartSize !== "number" || !Number.isInteger(rawPartSize) || rawPartSize <= 0) {
        throw new InvalidPartSizeError({ actual: rawPartSize });
      }

      partSize = rawPartSize;
    }

    const { writable, readable } = new TransformStream<
      Uint8Array<ArrayBuffer>,
      Uint8Array<ArrayBuffer>
    >();
    const abortController = new AbortController();
    const onAbort = (): void => {
      abortController.abort(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });

    const upload = new Upload({
      client: this.client!,
      params: {
        Key: key,
        Body: readable,
        Bucket: this.bucket,
      },
      abortController,
      ...(partSize !== undefined && { partSize }),
    });

    const writer = writable.getWriter();
    const uploadPromise = upload.done();
    const removeAbortListener = (): void => {
      signal.removeEventListener("abort", onAbort);
    };
    void uploadPromise
      .catch(async (reason: unknown) => {
        try {
          await writer.abort(reason);
        } catch {}
      })
      .finally(removeAbortListener);

    return new WritableStream({
      async write(chunk) {
        await writer.write(chunk);
      },
      async close() {
        await writer.close();
        await uploadPromise;
        removeAbortListener();
      },
      async abort(reason) {
        await writer.abort(reason);
        await upload.abort().catch(() => {});
        removeAbortListener();
      },
    });
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#multipart)
   */
  public async getReadable(
    args: Pick<IStorage.GetReadableArgs, "key" | "signal">,
  ): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
    const { key, signal: abortSignal } = args;

    const command = new GetObjectCommand({
      Key: key,
      Bucket: this.bucket,
    });
    const response = await this.client!.send(command, { abortSignal });
    const readableStream = response.Body!.transformToWebStream();

    return readableStream;
  }
}
