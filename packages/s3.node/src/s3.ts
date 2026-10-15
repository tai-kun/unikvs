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
import { InvalidPartSizeError, StorageAbortedError, type IStorage } from "@unikvs/core";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#usage)
 */
export type S3StorageOptions = {};

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
  public constructor(bucket: string, config: S3ClientConfig = {}, _options: S3StorageOptions = {}) {
    this.name = "S3";
    this.client = null;
    this.bucket = bucket;
    this.config = config;
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
  public async write(c: IStorage.WriteContext, data: Uint8Array<ArrayBuffer>): Promise<void> {
    const command = new PutObjectCommand({
      Key: c.key,
      Body: data,
      Bucket: this.bucket,
    });
    await this.client!.send(command, { abortSignal: c.signal });
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#usage)
   */
  public async read(c: IStorage.ReadContext): Promise<Uint8Array<ArrayBuffer>> {
    const command = new GetObjectCommand({
      Key: c.key,
      Bucket: this.bucket,
    });
    const response = await this.client!.send(command, { abortSignal: c.signal });
    const byteArray = await response.Body!.transformToByteArray();

    return byteArray satisfies Uint8Array as Uint8Array<ArrayBuffer>;
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#usage)
   */
  public async exists(c: IStorage.ExistsContext): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Key: c.key,
        Bucket: this.bucket,
      });
      await this.client!.send(command, { abortSignal: c.signal });

      return true;
    } catch (ex) {
      const s3Error = ex as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
      if (s3Error.name === "NotFound" || s3Error.$metadata?.httpStatusCode === 404) {
        return false;
      }

      throw ex;
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#usage)
   */
  public async delete(c: IStorage.DeleteContext): Promise<void> {
    const command = new DeleteObjectCommand({
      Key: c.key,
      Bucket: this.bucket,
    });
    await this.client!.send(command, { abortSignal: c.signal });
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#usage)
   */
  public async clear(c: IStorage.ClearContext): Promise<void> {
    let isTruncated = true;
    let continuationToken: string | undefined = undefined;

    while (isTruncated) {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        ContinuationToken: continuationToken,
      });
      const response: ListObjectsV2CommandOutput = await this.client!.send(command, {
        abortSignal: c.signal,
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
        await this.client!.send(command, { abortSignal: c.signal });
      }

      isTruncated = response.IsTruncated ?? false;
      continuationToken = response.NextContinuationToken;
    }
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/s3-node#multipart)
   */
  public getWritable(c: IStorage.GetWritableContext): WritableStream<Uint8Array<ArrayBuffer>> {
    if (c.signal.aborted) {
      throw new StorageAbortedError({ key: c.key });
    }

    let partSize: number | undefined = undefined;
    const rawPartSize =
      c.get("@unikvs/s3.node:partSize") !== undefined
        ? c.get("@unikvs/s3.node:partSize")
        : c.get("@unikvs/s3:partSize");
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
      abortController.abort(c.signal.reason);
    };
    c.signal.addEventListener("abort", onAbort, { once: true });

    const upload = new Upload({
      client: this.client!,
      params: {
        Key: c.key,
        Body: readable,
        Bucket: this.bucket,
      },
      abortController,
      ...(partSize !== undefined && { partSize }),
    });

    const writer = writable.getWriter();
    const uploadPromise = upload.done();
    const removeAbortListener = (): void => {
      c.signal.removeEventListener("abort", onAbort);
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
    c: IStorage.GetReadableContext,
  ): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
    const command = new GetObjectCommand({
      Key: c.key,
      Bucket: this.bucket,
    });
    const response = await this.client!.send(command, { abortSignal: c.signal });
    const readableStream = response.Body!.transformToWebStream();

    return readableStream;
  }
}
