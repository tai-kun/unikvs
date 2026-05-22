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
import type { IStorage } from "@unikvs/core";

/**
 * AWS S3（または互換オブジェクトストレージ）を永続化先として使用するストレージクラスです。
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
   */
  private readonly bucket: string;

  /**
   * S3Client の初期化に使用する設定オブジェクトです。
   */
  private readonly config: S3ClientConfig;

  public readonly name: string;

  /**
   * S3 インスタンスを初期化します。
   *
   * @param bucket データを保存する対象のバケット名です。
   * @param config リージョンや認証情報など、S3Client に渡す設定です。
   */
  public constructor(bucket: string, config: S3ClientConfig = {}) {
    this.name = "S3";
    this.client = null;
    this.bucket = bucket;
    this.config = config;
  }

  public get isOpen(): boolean {
    return !!this.client;
  }

  public open(): void {
    this.client = new S3Client(this.config);
  }

  public close(): void {
    this.client!.destroy();
    this.client = null;
  }

  public async write(
    args: Pick<IStorage.WriteArgs<Uint8Array<ArrayBuffer>>, "key" | "data" | "signal">,
  ): Promise<void> {
    const { key, data, signal: abortSignal } = args;

    const command = new PutObjectCommand({
      Key: key,
      Body: data,
      Bucket: this.bucket,
    });
    await this.client!.send(command, { abortSignal });
  }

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
      // S3 の HeadObject はオブジェクトが存在しない場合に 404 NotFound エラーを投げます。
      if (ex.name === "NotFound" || ex.$metadata?.httpStatusCode === 404) {
        return false;
      }

      throw ex;
    }
  }

  public async delete(args: Pick<IStorage.DeleteArgs, "key" | "signal">): Promise<void> {
    const { key, signal: abortSignal } = args;

    const command = new DeleteObjectCommand({
      Key: key,
      Bucket: this.bucket,
    });
    await this.client!.send(command, { abortSignal });
  }

  public async clear(args: Pick<IStorage.ClearArgs, "signal">): Promise<void> {
    const { signal: abortSignal } = args;

    let isTruncated = true;
    let continuationToken: string | undefined = undefined;

    // バケット内のオブジェクトをページネーションで取得し、全て削除します。
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

      // 削除対象のオブジェクトリストを生成
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

  public getWritable(
    args: Pick<IStorage.GetWritableArgs, "context" | "key">,
  ): WritableStream<Uint8Array<ArrayBuffer>> {
    const { key, context } = args;
    const partSize = context["@unikvs/s3.node:partSize"] ?? context["@unikvs/s3:partSize"];

    const { writable, readable } = new TransformStream<
      Uint8Array<ArrayBuffer>,
      Uint8Array<ArrayBuffer>
    >();
    const upload = new Upload({
      client: this.client!,
      params: {
        Key: key,
        Body: readable,
        Bucket: this.bucket,
      },
      partSize: partSize as number,
    });

    // Upload 処理をバックグラウンドで開始します。
    const uploadPromise = upload.done();
    const writableProxy = new WritableStream({
      async write(chunk) {
        const writer = writable.getWriter();
        await writer.write(chunk);
        writer.releaseLock();
      },
      async close() {
        const writer = writable.getWriter();
        await writer.close();
        writer.releaseLock();

        await uploadPromise;
      },
      async abort(reason) {
        const writer = writable.getWriter();
        await writer.abort(reason);
        writer.releaseLock();

        await upload.abort();
      },
    });

    return writableProxy;
  }

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
